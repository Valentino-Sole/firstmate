// Weltzustand eines Laufs: Entitäten, Projektile, Felder, Beute, Effekte,
// Schadensregeln. Regeln aus design.json combat_rules:
// - Kein passiver Kontaktschaden; Schaden nur während markierter Aktivphase.
// - Ein Treffer pro Ziel und Angriff (per_attack_target_hit_limit 1).
// - Zielrichtung wird am Anfang der Vorbereitung fixiert.
// - Tod: Vorbereitung, ungefeuerte Projektile und eigene Beschwörungen enden;
//   bereits fliegende Projektile bleiben.

import { D, armorReduce } from '../data.js';
import { dist, resolveMove } from './geometry.js';
import { sfx } from '../audio.js';
import { brittleFactor, enemyWeaknessFactor, onProjectileBlocked } from './effects.js';

export function createWorld(arena, scaling) {
  const world = {
    arena,
    scaling,
    time: 0,
    hero: null,
    monsters: [],
    boss: null,
    enemyProjectiles: [],
    heroProjectiles: [],
    fields: [],          // Bodenflächen (Gegner): warn -> aktiv
    orbitals: [],        // Heldenwaffen-Umläufer und Boss-Restplatten
    pickups: [],
    spawnWarnings: [],   // {x, y, t, monsterId}
    delayedStrikes: [],
    // Effektsystem v0.4.2
    mines: [],
    echoes: [],
    chainShots: [],
    delayedRings: [],
    heroFields: [],
    tempoBuffUntil: 0,
    fx: [],              // dekorative Partikel, hart begrenzt
    fxBudget: 60,
    damageFlash: 0,
    shake: 0,
    stats: { kills: 0, waxEarned: 0 },
    waxFrac: 0,
    xpFrac: 0,
    spawnSeq: 0,
  };
  // Heldenschaden an Gegnern: alle Faktoren multiplizieren, dann einmal
  // aufrunden; Minimum 1 nur bei positivem Schaden (gemeinsame-regeln.json).
  world.applyHeroDamage = (target, rawAmount, opts = {}) => applyHeroDamage(world, target, rawAmount, opts);
  return world;
}

export function createHero(stats, x, y) {
  return {
    kind: 'hero',
    x, y,
    hp: stats.maxHp,
    radius: stats.collisionRadius,
    faceLeft: false, // Knorz wird nie gespiegelt (Asymmetrie-Regel)
    dodging: 0,
    dodgeDirX: 0,
    dodgeDirY: 0,
    dodgeCooldown: 0,
    invuln: 0,
    shield: null,      // aktives Spiegelschild-Fenster {until, dirRad, angle, blockFrac}
    weaponTimers: {},
    moving: false,
    lastDirX: 1,
    lastDirY: 0,
  };
}

// ---- Schaden ----

export function damageHero(world, raw, source) {
  const hero = world.hero;
  if (hero.hp <= 0) return;
  if (hero.invuln > 0 || hero.dodging > 0 && world.heroStats.dodge.invulnerability_seconds > 0 && hero.dodging > (world.heroStats.dodge.duration - world.heroStats.dodge.invulnerability_seconds)) {
    return;
  }
  let dmg = raw;
  // Spiegelschild: reduziert Direktschaden aus dem Schutzsektor.
  if (hero.shield && world.time < hero.shield.until && source && source.x !== undefined) {
    const ang = Math.atan2(source.y - hero.y, source.x - hero.x);
    let d = ang - hero.shield.dirRad;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    if (Math.abs(d) <= (hero.shield.angle * Math.PI / 180) / 2) {
      dmg = dmg * (1 - hero.shield.blockFrac);
    }
  }
  dmg = armorReduce(dmg, world.heroStats.armor);
  hero.hp -= dmg;
  hero.invuln = Math.max(hero.invuln, 0.35); // kurze Schonfrist gegen Mehrfachtreffer in einem Frame-Stapel
  world.damageFlash = 0.08;
  world.shake = Math.min(6, world.shake + 2.5);
  sfx.heroHit();
}

function applyHeroDamage(world, target, rawAmount, opts = {}) {
  if (target.hp <= 0 || rawAmount <= 0) return 0;
  let dmg = rawAmount;
  // Schirmträger in der Nähe reduzieren Schaden anteilig (vor Minimum).
  if (target.kind === 'monster') {
    for (const g of world.monsters) {
      if (g === target || g.hp <= 0) continue;
      const at = g.data.attack;
      if (at.archetype !== 'shield' || !at.shield_reduction) continue;
      if (g.shieldActiveUntil && world.time < g.shieldActiveUntil) {
        if (dist(g.x, g.y, target.x, target.y) <= (at.field_radius || at.range_or_radius)) {
          dmg *= (1 - at.shield_reduction);
          break;
        }
      }
    }
    const at = target.data.attack;
    // Frontpanzer (guard): Angriffe aus dem Frontsektor halbiert; Rücken frei.
    if (at.archetype === 'guard' && opts.fromX !== undefined) {
      const ang = Math.atan2(opts.fromY - target.y, opts.fromX - target.x);
      let dd = ang - (target.faceRad || 0);
      while (dd > Math.PI) dd -= 2 * Math.PI;
      while (dd < -Math.PI) dd += 2 * Math.PI;
      const half = ((at.cone_angle_degrees || 90) * Math.PI / 180) / 2;
      if (Math.abs(dd) <= half) dmg *= 0.5;
    }
    // Gepanzerter Fernkämpfer (guard_shot): nur in offener Schussphase voll verwundbar.
    if (at.archetype === 'guard_shot' && target.state !== 'windup' && target.state !== 'active') {
      dmg *= 0.5;
    }
  }
  // Brüchig verstärkt Haupt-, Sekundär- und Statusschaden des Helden.
  dmg *= brittleFactor(world, target);
  if (world.devDamageMul) dmg *= world.devDamageMul; // nur Testwerkzeug
  dmg = Math.max(1, Math.ceil(dmg));
  const actualLoss = Math.min(dmg, target.hp);
  target.hp -= dmg;
  target.hitFlash = 0.1;
  sfx.enemyHit();
  spawnHitFx(world, target.x, target.y - 20, opts.color || '#B6DDD0');
  if (target.hp <= 0) {
    killEnemy(world, target);
  }
  return actualLoss;
}

function killEnemy(world, target) {
  target.hp = 0;
  target.dead = true;
  // Schwäche-Schnappschuss für bereits fliegende Geschosse dieser Quelle.
  target.weaknessDeathSnapshot = 1 - enemyWeaknessFactor(world, { ...target, weaknessDeathSnapshot: undefined, status: target.status });
  sfx.enemyDeath();
  // Materialbruch: 3–5 Fragmente, rein dekorativ, ohne Trefferzone.
  for (let i = 0; i < 4; i++) spawnHitFx(world, target.x, target.y - 10, '#F1E3C8');

  if (target.kind === 'monster') {
    world.stats.kills += 1;
    // Beim Tod: eigene Beschwörungen abbrechen (cancel_on_death).
    for (const m of world.monsters) {
      if (m.summonedBy === target) m.summonedBy = null; // Zuordnung lösen; Kinder bleiben? Nein:
    }
    for (const m of world.monsters) {
      if (m.ownerRef === target && m.hp > 0) {
        m.hp = 0;
        m.dead = true;
      }
    }
    // Sammler gibt einbehaltene Beute vollständig zurück.
    if (target.storedPickups && target.storedPickups.length) {
      for (const p of target.storedPickups) {
        world.pickups.push({ ...p, x: target.x + (Math.random() - 0.5) * 40, y: target.y + (Math.random() - 0.5) * 40 });
      }
      target.storedPickups = [];
    }
    // Drops: 1 Wachssplitter + 1 Erinnerungsfunke unter Boni; Bruchteile akkumulieren.
    // Beschworene Kinder geben nichts (drops.summoned).
    if (!target.ownerRef && !target.noDrops) {
      const st = world.heroStats;
      world.waxFrac += 1 * (1 + st.waxBonus);
      world.xpFrac += 1 * (1 + st.xpBonus);
      while (world.waxFrac >= 1) {
        world.waxFrac -= 1;
        world.pickups.push({ type: 'wax', value: 1, x: target.x + (Math.random() - 0.5) * 26, y: target.y + (Math.random() - 0.5) * 26 });
      }
      while (world.xpFrac >= 1) {
        world.xpFrac -= 1;
        world.pickups.push({ type: 'xp', value: 1, x: target.x + (Math.random() - 0.5) * 26, y: target.y + (Math.random() - 0.5) * 26 });
      }
    }
  }
}

export function spawnHitFx(world, x, y, color) {
  // Partikelbudget: höchstens 3 pro Treffer, 60 gleichzeitig (asset-vertrag fx).
  let spawned = 0;
  while (spawned < 3 && world.fx.length < world.fxBudget) {
    world.fx.push({
      x, y,
      vx: (Math.random() - 0.5) * 120,
      vy: -40 - Math.random() * 80,
      t: 0.35,
      color,
    });
    spawned++;
  }
}

export function updateCommon(world, dt) {
  // Effekte
  for (const f of world.fx) {
    f.t -= dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.vy += 260 * dt;
  }
  world.fx = world.fx.filter((f) => f.t > 0);
  if (world.damageFlash > 0) world.damageFlash -= dt;
  if (world.shake > 0) world.shake = Math.max(0, world.shake - 14 * dt);

  // Gegnerprojektile
  for (const p of world.enemyProjectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) { p.dead = true; continue; }
    const hero = world.hero;
    // Spiegelschild blockt feindliche Projektile im Frontsektor.
    if (hero.shield && world.time < hero.shield.until && hero.shield.blocksProjectiles) {
      const ang = Math.atan2(p.y - hero.y, p.x - hero.x);
      let dd = ang - hero.shield.dirRad;
      while (dd > Math.PI) dd -= 2 * Math.PI;
      while (dd < -Math.PI) dd += 2 * Math.PI;
      if (Math.abs(dd) <= (hero.shield.angle * Math.PI / 180) / 2 && dist(p.x, p.y, hero.x, hero.y) < 46) {
        onProjectileBlocked(world, p); // E009 Rückspiegel
        p.dead = true;
        continue;
      }
    }
    if (dist(p.x, p.y, hero.x, hero.y) <= p.radius + hero.radius) {
      // Schwäche der Quelle zum Trefferzeitpunkt anwenden.
      const weak = enemyWeaknessFactor(world, p.source);
      damageHero(world, p.damage * weak, p);
      p.dead = true;
    }
  }
  world.enemyProjectiles = world.enemyProjectiles.filter((p) => !p.dead);

  // Bodenflächen der Gegner
  for (const f of world.fields) {
    f.t += dt;
    if (f.t < f.warnSeconds) continue;
    const activeT = f.t - f.warnSeconds;
    if (activeT > f.activeSeconds) { f.dead = true; continue; }
    const hero = world.hero;
    if (f.hitTest(hero.x, hero.y, hero.radius)) {
      if (f.slowFactor) {
        world.heroSlowUntil = world.time + 0.1;
        world.heroSlowFactor = 1 - f.slowFactor;
      }
      if (f.damage > 0) {
        if (f.tickInterval) {
          if (!f.nextTick || world.time >= f.nextTick) {
            damageHero(world, f.damage, f.sourcePos || null);
            f.nextTick = world.time + f.tickInterval;
          }
        } else if (!f.heroHit) {
          damageHero(world, f.damage, f.sourcePos || null);
          f.heroHit = true;
        }
      }
    }
  }
  world.fields = world.fields.filter((f) => !f.dead);

  // Beute einsammeln (Magnetradius)
  const hero = world.hero;
  const st = world.heroStats;
  for (const p of world.pickups) {
    const d = dist(p.x, p.y, hero.x, hero.y);
    if (d <= st.pickupRadius) {
      const speed = 340 + (st.pickupRadius - d) * 2;
      p.x += ((hero.x - p.x) / (d || 1)) * speed * dt;
      p.y += ((hero.y - p.y) / (d || 1)) * speed * dt;
    }
    if (d <= 26) {
      p.dead = true;
      collectPickup(world, p);
    }
  }
  world.pickups = world.pickups.filter((p) => !p.dead);
}

export function collectPickup(world, p) {
  sfx.pickup();
  if (p.type === 'wax') {
    world.run.wax += p.value;
    world.stats.waxEarned += p.value;
  } else if (p.type === 'xp') {
    world.run.gainXp(p.value);
  }
}

export function moveHero(world, nx, ny) {
  const hero = world.hero;
  [hero.x, hero.y] = resolveMove(hero.x, hero.y, hero.radius, nx, ny, world.arena, 'blocks_player');
}
