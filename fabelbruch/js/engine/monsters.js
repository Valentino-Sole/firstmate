// Monster: Bewegung und Angriffs-Zustandsmaschine.
// Werte kommen unverändert aus design.json; Arena-Skalierung (LP/Schaden
// aufrunden, Zeiten und Geschwindigkeiten unverändert) aus spielablauf.json.

import { D } from '../data.js';
import { lockAim, startActive, updateActive } from './attacks.js';
import { dist, norm, resolveMove } from './geometry.js';
import { enemySpeedFactor } from './effects.js';

export function spawnMonster(world, monsterId, x, y, ownerRef = null) {
  const data = D.monstersById.get(monsterId);
  const sc = world.scaling;
  const m = {
    kind: 'monster',
    spawnSeq: world.spawnSeq++,
    data,
    x, y,
    hp: Math.ceil(data.base_stats.hp * sc.enemy_hp_multiplier),
    maxHp: Math.ceil(data.base_stats.hp * sc.enemy_hp_multiplier),
    radius: data.base_stats.collision_radius,
    speed: data.base_stats.move_speed * (sc.movement_speed_multiplier || 1),
    state: 'move',
    stateT: 0,
    cooldownT: 0.6 + Math.random() * 0.6,
    aim: null,
    attackHit: new Set(),
    faceRad: 0,
    faceLeft: false,
    hitFlash: 0,
    dead: false,
    ownerRef,
    spawnGrace: 0,     // Einblendzeit ohne Schaden in beide Richtungen
    buffUntil: 0,
    buffSpeedMul: 1,
    buffDmgMul: 1,
    orbitSign: (world.spawnSeq % 2 === 0) ? 1 : -1,
    scaledDamage(base) {
      const mul = (world.time < this.buffUntil) ? this.buffDmgMul : 1;
      return Math.ceil(base * sc.enemy_damage_multiplier * mul);
    },
  };
  world.monsters.push(m);
  return m;
}

// Bewegungsstile, abgeleitet aus Verhalten/Archetyp (siehe docs/abweichungen.md).
function movementStyle(m) {
  const arch = m.data.attack.archetype;
  if (arch === 'turret') return 'stationary';
  if (['shot', 'dual_shot', 'fan', 'triple_beam', 'beam', 'ring', 'lob', 'guard_shot', 'mark'].includes(arch)
    && m.data.attack.trigger_range >= 240) return 'ranged';
  if (['zigzag'].includes(arch)) return 'zigzag';
  if (['sweep', 'clamp'].includes(arch) && /[Ff]lank|[Kk]reis/.test(m.data.behavior)) return 'flank';
  if (arch === 'loot') return 'loot';
  if (['shield', 'buff', 'pull', 'slow_field', 'cloud', 'zone', 'trail'].includes(arch)
    && m.data.attack.trigger_range >= 300) return 'support';
  return 'chase';
}

export function updateMonster(world, m, dt) {
  if (m.dead) return;
  m.stateT += dt;
  if (m.hitFlash > 0) m.hitFlash -= dt;
  if (m.spawnGrace > 0) m.spawnGrace -= dt;

  const hero = world.hero;
  const at = m.data.attack;
  const speedMul = (world.time < m.buffUntil) ? m.buffSpeedMul : 1;

  switch (m.state) {
    case 'move': {
      m.cooldownT -= dt;
      moveByStyle(world, m, dt, speedMul);
      const d = dist(m.x, m.y, hero.x, hero.y);
      if (m.cooldownT <= 0 && d <= at.trigger_range && m.spawnGrace <= 0) {
        m.state = 'windup';
        m.stateT = 0;
        lockAim(world, m, at);
      }
      break;
    }
    case 'windup': {
      if (m.stateT >= at.windup_seconds) {
        m.state = 'active';
        m.stateT = 0;
        startActive(world, m, at, monsterApi);
      }
      break;
    }
    case 'active': {
      updateActive(world, m, at, m.stateT / at.active_seconds, dt);
      clampToArena(world, m);
      if (m.stateT >= at.active_seconds) {
        m.state = 'recovery';
        m.stateT = 0;
        if (['hop', 'burrow', 'teleport'].includes(at.archetype) && m.aim) {
          m.x = m.aim.anchorX;
          m.y = m.aim.anchorY;
          clampToArena(world, m);
        }
      }
      break;
    }
    case 'recovery': {
      if (m.stateT >= at.recovery_seconds) {
        m.state = 'move';
        m.stateT = 0;
        m.cooldownT = at.cooldown_after_recovery_seconds;
        m.aim = null;
      }
      break;
    }
    default:
      break;
  }
}

function moveByStyle(world, m, dt, speedMul) {
  const hero = world.hero;
  const style = movementStyle(m);
  // Statusquellen (Slow/Sandlast/Wurzel) verlangsamen freiwillige Bewegung.
  const sp = m.speed * speedMul * enemySpeedFactor(world, m);
  if (sp <= 0) return;
  let tx = hero.x;
  let ty = hero.y;
  let desired = 0; // gewünschter Abstand

  if (style === 'stationary') return;
  if (style === 'ranged') desired = Math.min(m.data.attack.trigger_range * 0.8, 280);
  if (style === 'support') desired = 240;
  if (style === 'loot') {
    let best = null;
    let bestD = Infinity;
    for (const p of world.pickups) {
      const d = dist(p.x, p.y, m.x, m.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best) { tx = best.x; ty = best.y; }
  }

  let dx = tx - m.x;
  let dy = ty - m.y;
  const d = Math.hypot(dx, dy) || 1;
  let vx = dx / d;
  let vy = dy / d;

  if (desired > 0) {
    if (d < desired - 20) { vx = -vx; vy = -vy; }
    else if (d < desired + 20) {
      // seitlich halten
      const t = vx; vx = -vy * m.orbitSign; vy = t * m.orbitSign;
    }
  }
  if (style === 'zigzag') {
    const phase = Math.sin(world.time * 5 + m.spawnSeq);
    const px = -vy * phase * 0.8;
    const py = vx * phase * 0.8;
    vx += px; vy += py;
    const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l;
  }
  if (style === 'flank' && d > 60) {
    const side = m.orbitSign;
    const ang = Math.atan2(vy, vx) + side * 0.55;
    vx = Math.cos(ang); vy = Math.sin(ang);
  }

  // Trennung von Artgenossen (einfach, billig)
  let sx = 0; let sy = 0;
  for (const o of world.monsters) {
    if (o === m || o.dead) continue;
    const od = dist(o.x, o.y, m.x, m.y);
    const minD = o.radius + m.radius;
    if (od < minD && od > 0.001) {
      sx += (m.x - o.x) / od * (minD - od);
      sy += (m.y - o.y) / od * (minD - od);
    }
  }

  const nx = m.x + (vx * sp + sx * 4) * dt;
  const ny = m.y + (vy * sp + sy * 4) * dt;
  [m.x, m.y] = resolveMove(m.x, m.y, m.radius, nx, ny, world.arena, 'blocks_enemies');
  if (Math.abs(vx) > 0.05) m.faceLeft = vx < 0;
  m.faceRad = Math.atan2(vy, vx);
}

function clampToArena(world, m) {
  [m.x, m.y] = resolveMove(m.x, m.y, m.radius, m.x, m.y, world.arena, 'blocks_enemies');
}

export const monsterApi = {
  summon(world, self, spec) {
    const alive = world.monsters.filter((o) => o.ownerRef === self && !o.dead).length;
    const cap = spec.summon_owner_cap || 4;
    const n = Math.min(spec.projectile_or_spawn_count || 1, Math.max(0, cap - alive));
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const child = spawnMonster(world, spec.spawn_monster_id, self.x + Math.cos(ang) * 46, self.y + Math.sin(ang) * 46, self);
      child.spawnGrace = 0.6;
      // Beschworene Kinder: keine Währung/Erfahrung/weitere Beschwörungen.
      child.noDrops = true;
    }
  },
  buffAllies(world, self, spec) {
    const r = spec.field_radius || spec.range_or_radius;
    for (const o of world.monsters) {
      if (o === self || o.dead) continue;
      if (dist(o.x, o.y, self.x, self.y) <= r) {
        // nicht stapelnd: Zeit nur verlängern, Multiplikatoren fest.
        o.buffUntil = world.time + spec.active_seconds + 1.0;
        o.buffSpeedMul = spec.buff.move_speed_multiplier || 1;
        o.buffDmgMul = spec.buff.damage_multiplier || 1;
      }
    }
    if (world.boss && !world.boss.dead && dist(world.boss.x, world.boss.y, self.x, self.y) <= r) {
      world.boss.buffUntil = world.time + spec.active_seconds + 1.0;
    }
  },
};
