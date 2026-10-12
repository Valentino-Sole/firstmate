// Heldenwaffen nach waffen.json (v0.4.2) mit Fähigkeiten E001-E040.
// Zielregel: nächster lebender Gegner in Reichweite; Gleichstand kleinste
// Spawn-ID; Richtung bei Auslösung fixiert. Cooldown Auslösung-zu-Auslösung,
// Minimum 0,2 s. D-Snapshot beim Aktivierungsstart (ungerundet, ohne Krit).
// Rundung: alle Faktoren multiplizieren, einmal aufrunden (world.applyHeroDamage).

import { D, weaponDamageRaw } from '../data.js';
import { dist, angleOf, circleInSector, circleInDisk, circleInLine } from './geometry.js';
import {
  assignInstanceId, onActivation, onPrimaryHit, onImpact, onProjectileEvent,
  onOrbitCompleted, tempoBuffBonus, ensureTargetStatus, transferLinks,
} from './effects.js';

export function createWeaponInstance(weaponId, tier = 1) {
  const w = { weaponId, tier, cooldownT: 0.2, activeUntil: 0, telegraphUntil: 0, dirRad: 0, originX: 0, originY: 0, lastFire: null, lastD: 0, activationSeq: 0 };
  assignInstanceId(w);
  return w;
}

function enemiesOf(world) {
  const list = world.monsters.filter((m) => !m.dead && m.spawnGrace <= 0);
  if (world.boss && !world.boss.dead) list.push(world.boss);
  return list;
}

function nearestTarget(world, x, y, range) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemiesOf(world)) {
    const d = dist(e.x, e.y, x, y);
    if (d - e.radius > range) continue;
    if (d < bestD - 0.0001) { bestD = d; best = e; }
    else if (Math.abs(d - bestD) <= 0.0001 && best) {
      const seqA = e.kind === 'boss' ? -1 : e.spawnSeq;
      const seqB = best.kind === 'boss' ? -1 : best.spawnSeq;
      if (seqA < seqB) best = e;
    }
  }
  return best;
}

export function updateWeapons(world, dt) {
  const hero = world.hero;
  const st = world.heroStats;
  const run = world.run;

  for (const w of run.weapons) {
    if (!w) continue;
    w.cooldownT -= dt;
    if (w.cooldownT > 0) continue;
    const spec = D.weaponsById.get(w.weaponId);
    const range = spec.range * (1 + st.rangeBonus);
    let target = nearestTarget(world, hero.x, hero.y, spec.category === 'shield' ? 600 : range);
    if (!target && spec.category !== 'shield') continue;

    const dirRad = target
      ? angleOf(target.x - hero.x, target.y - hero.y)
      : angleOf(hero.lastDirX, hero.lastDirY);

    triggerWeapon(world, w, spec, dirRad, target);

    // Unruh-Takt (E031) addiert sich zum regulären Angriffstempo-Bonus.
    const effCooldown = Math.max(0.2, spec.cooldown_seconds / (1 + st.attackSpeedBonus + tempoBuffBonus(world)));
    const busy = spec.telegraph_seconds + spec.active_seconds + spec.recovery_seconds;
    w.cooldownT = Math.max(effCooldown, busy);
  }
}

function triggerWeapon(world, w, spec, dirRad, target) {
  const hero = world.hero;
  const st = world.heroStats;
  const run = world.run;
  const Draw = weaponDamageRaw(spec, w.tier, st.damageBonus);
  const range = spec.range * (1 + st.rangeBonus);
  const delay = spec.telegraph_seconds || 0;

  w.activationSeq += 1;
  w.dirRad = dirRad;
  w.originX = hero.x;
  w.originY = hero.y;
  w.telegraphUntil = world.time + delay;
  w.activeUntil = world.time + delay + spec.active_seconds;
  w.lastD = Draw;
  hero.faceTargetRad = dirRad;

  const mods = onActivation(world, w, spec);
  w.lastFire = { x: hero.x, y: hero.y, dirRad, range, D: Draw };

  run.pendingWeaponFires.push({
    w, spec, D: Draw, dirRad, range, target, mods,
    activationId: `${w.instanceId}:${w.activationSeq}`,
    fireAt: world.time + delay,
  });
}

export function processWeaponFires(world) {
  const run = world.run;
  const now = world.time;
  const rest = [];
  for (const f of run.pendingWeaponFires) {
    if (f.fireAt > now) { rest.push(f); continue; }
    fireWeapon(world, f);
  }
  run.pendingWeaponFires = rest;
}

function rollCrit(world, spec) {
  if (!spec.crit_allowed) return false;
  return world.runRng.next() < world.heroStats.critChance;
}

// Haupttreffer-Pipeline: Zustand vor dem Treffer erfassen, Grundschaden mit
// Krit ausführen, dann Fähigkeiten (effects.onPrimaryHit) in Regelreihenfolge.
function primaryHit(world, f, enemy, damageFactor = 1, extra = {}) {
  if (enemy.hp <= 0) return;
  if (f.hitSet && f.hitSet.has(enemy)) return; // ein Haupttreffer je Ziel und Aktivierung
  if (f.hitSet) f.hitSet.add(enemy);

  const s = ensureTargetStatus(enemy);
  const hpFracBefore = enemy.hp / enemy.maxHp;
  const wasBurning = !!s.burn;
  const hadRend = !!s.rend;
  let burnSnapshot = null;
  if (s.burn) {
    // Verbleibende, noch nicht ausgeführte Ticks auf gemeinsamer Zeitachse.
    let ticks = 0;
    let at = s.burn.nextTickAt;
    while (at <= s.burn.expiresAt) { ticks += 1; at += 0.5; }
    burnSnapshot = { remainingBase: ticks * s.burn.tickBase };
  }

  const crit = rollCrit(world, f.spec);
  const raw = f.D * damageFactor * (f.mods ? f.mods.primaryFactor : 1) * (crit ? 1.5 : 1);
  const actualLoss = world.applyHeroDamage(enemy, raw, {
    source: 'primary', fromX: world.hero.x, fromY: world.hero.y, color: f.spec.effect_color,
  });

  // Zwillingsnaht (E021): Haupttrefferschaden JEDER Waffe überträgt über
  // bestehende Verbindungen; die Nadelwerfer-Fähigkeit selbst ruft dies vor
  // dem Neuverknüpfen auf (Ereignisreihenfolge der gemeinsamen Regeln).
  if (D.weaponsById.get(f.w.weaponId).ability_id !== 'E021') {
    transferLinks(world, f.w, enemy, actualLoss);
  }

  onPrimaryHit(world, f.w, f.spec, enemy, {
    D: f.D,
    actualLoss,
    hpFracBefore,
    wasBurning,
    hadRend,
    burnSnapshot,
    impactX: extra.impactX ?? enemy.x,
    impactY: extra.impactY ?? enemy.y,
    dirRad: f.dirRad,
    axisOriginX: f.w.originX,
    axisOriginY: f.w.originY,
    effRange: f.range,
    fireMods: f.mods,
    dealSecondary: (tgt, rawAmount) => world.applyHeroDamage(tgt, rawAmount, { source: 'secondary', fromX: world.hero.x, fromY: world.hero.y }),
  });
}

function fireWeapon(world, f) {
  const hero = world.hero;
  const { spec, dirRad, range } = f;
  const geo = spec.geometry;
  f.hitSet = new Set();

  switch (geo.shape) {
    case 'sector': {
      if (spec.category === 'shield') {
        hero.shield = {
          until: world.time + Math.min(2.1, spec.active_seconds + 0.15 * (f.w.tier - 1)),
          dirRad,
          angle: geo.angle,
          blockFrac: geo.reduces_direct_damage_fraction || 0.5,
          blocksProjectiles: !!geo.blocks_enemy_projectiles,
        };
        return;
      }
      for (const e of enemiesOf(world)) {
        if (circleInSector(e.x, e.y, e.radius, hero.x, hero.y, dirRad, geo.angle, range)) {
          primaryHit(world, f, e);
        }
      }
      return;
    }
    case 'disk': {
      const offset = parseFloat(geo.center) || 80;
      const cx = hero.x + Math.cos(dirRad) * offset;
      const cy = hero.y + Math.sin(dirRad) * offset;
      for (const e of enemiesOf(world)) {
        if (circleInDisk(e.x, e.y, e.radius, cx, cy, geo.radius)) {
          primaryHit(world, f, e, 1, { impactX: cx, impactY: cy });
        }
      }
      onImpact(world, f.w, spec, cx, cy); // E027 Nachbebende Kachel
      return;
    }
    case 'rectangle': {
      for (const e of enemiesOf(world)) {
        if (circleInLine(e.x, e.y, e.radius, hero.x, hero.y, dirRad, range, geo.width)) {
          primaryHit(world, f, e);
        }
      }
      return;
    }
    case 'projectile':
    case 'projectiles': {
      // E012: jede dritte Salve fünf Projektile; E017: Durchschlag 1/0,8/0,6 D.
      const offsets = (f.mods && f.mods.offsets) || geo.angle_offsets || [0];
      const effect = D.effekte.effects.find((e) => e.weapon_id === f.w.weaponId);
      const pierceFactors = effect && effect.id === 'E017' ? effect.parameters.primary_damage_factors : null;
      for (let i = 0; i < offsets.length; i++) {
        const off = (offsets[i] || 0) * Math.PI / 180;
        world.heroProjectiles.push({
          x: hero.x, y: hero.y,
          vx: Math.cos(dirRad + off) * geo.speed,
          vy: Math.sin(dirRad + off) * geo.speed,
          radius: geo.radius,
          f,
          D: f.D,
          activationId: f.activationId,
          pierceFactors,
          pierceCount: 0,
          pierce: pierceFactors ? pierceFactors.length - 1 : (geo.pierce || 0),
          life: range / geo.speed,
          color: spec.effect_color,
          hit: new Set(),
        });
      }
      return;
    }
    case 'impact_disk': {
      const tx = f.target ? f.target.x : hero.x + Math.cos(dirRad) * range;
      const ty = f.target ? f.target.y : hero.y + Math.sin(dirRad) * range;
      world.run.delayedHeroStrikes.push({
        x: tx, y: ty, r: geo.radius, at: world.time + (geo.flight_seconds || 0.55), f,
      });
      return;
    }
    case 'moving_disk': {
      world.orbitals.push({
        fromBoss: false,
        owner: hero,
        baseAngle: dirRad,
        r: geo.orbit_radius,
        plateR: geo.radius,
        angularSpeed: ((geo.revolution_degrees || 360) * Math.PI / 180) / (geo.duration_seconds || 0.65),
        t: 0,
        life: geo.duration_seconds || 0.65,
        f,
        color: spec.effect_color,
        hit: new Set(),
        sign: 1,
      });
      return;
    }
    default:
      return;
  }
}

export function updateHeroProjectiles(world, dt) {
  for (const p of world.heroProjectiles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0) {
      p.dead = true;
      if (p.f) onProjectileEvent(world, p.f.w, p.f.spec, p, 'end', null); // E026 Scherbe am Reichweitenende
      continue;
    }
    for (const e of enemiesOf(world)) {
      if (p.hit.has(e)) continue;
      if (dist(p.x, p.y, e.x, e.y) <= p.radius + e.radius) {
        if (p.reflected) {
          // E009-Rückwurf: fester Sekundärschaden, keine Krits, keine Auslöser.
          world.applyHeroDamage(e, p.reflected.damage, { source: 'secondary' });
          p.hit.add(e);
          p.dead = true;
          break;
        }
        if (p.echoOf) {
          world.applyHeroDamage(e, p.echoOf.damage, { source: 'secondary' });
          p.hit.add(e); // geteilte Echo-Trefferliste
          p.dead = true;
          break;
        }
        const factor = p.pierceFactors ? p.pierceFactors[Math.min(p.pierceCount, p.pierceFactors.length - 1)] : 1;
        primaryHit(world, p.f, e, factor, { impactX: p.x, impactY: p.y });
        p.hit.add(e);
        p.pierceCount += 1;
        onProjectileEvent(world, p.f.w, p.f.spec, p, 'hit', e); // E003/E026/E036
        if (p.pierceCount > p.pierce) { p.dead = true; break; }
      }
    }
  }
  world.heroProjectiles = world.heroProjectiles.filter((p) => !p.dead);

  // Verzögerte Einschläge (Lob-Waffen): Haupttreffer + Einschlagsfeld.
  const rest = [];
  for (const s of world.run.delayedHeroStrikes) {
    if (s.at > world.time) { rest.push(s); continue; }
    s.f.hitSet = s.f.hitSet || new Set();
    for (const e of enemiesOf(world)) {
      if (circleInDisk(e.x, e.y, e.radius, s.x, s.y, s.r)) {
        primaryHit(world, s.f, e, 1, { impactX: s.x, impactY: s.y });
      }
    }
    onImpact(world, s.f.w, s.f.spec, s.x, s.y); // E006/E020: Feld auch ohne Treffer
    world.fx.push({ x: s.x, y: s.y, vx: 0, vy: -20, t: 0.3, color: s.f.spec.effect_color, ring: s.r });
  }
  world.run.delayedHeroStrikes = rest;

  // Umläufer: Haupttreffer je Gegner einmal; Umlaufende meldet E031.
  for (const o of world.orbitals) {
    if (o.fromBoss) continue;
    for (const e of enemiesOf(world)) {
      if (o.hit.has(e)) continue;
      if (dist(o.x, o.y, e.x, e.y) <= o.plateR + e.radius) {
        primaryHit(world, o.f, e);
        o.hit.add(e);
      }
    }
    if (o.t >= o.life && !o.completedReported) {
      o.completedReported = true;
      onOrbitCompleted(world, o.f.w);
    }
  }
}
