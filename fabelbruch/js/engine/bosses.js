// Bosse: Phasenmaschine nach design.json combat.phase_specs.
// Sequenzregel: Aktionen in Listenreihenfolge; nach jeder Aktion deren
// Erholung, danach 0,6 s Pause; nach der letzten Aktion beginnt die Liste
// erneut. Keine zufälligen Zusatzangriffe. Phasenwechsel bei 66 %/33 %:
// 1,2 s Übergang, aktive Gefahren werden entfernt.

import { D } from '../data.js';
import { lockAim, startActive, updateActive, telegraphShape, shapeHit } from './attacks.js';
import { dist, norm, resolveMove } from './geometry.js';
import { damageHero } from './world.js';
import { spawnMonster } from './monsters.js';
import { sfx } from '../audio.js';
import { enemySpeedFactor, enemyWeaknessFactor } from './effects.js';

const ACTION_PAUSE = 0.6;

export function spawnBoss(world, bossId) {
  const data = D.bossesById.get(bossId);
  const c = data.combat;
  const sc = world.scaling;
  const [bx, by] = world.arena.boss_spawn;
  const boss = {
    kind: 'boss',
    data,
    x: bx, y: by,
    hp: Math.ceil(c.hp * sc.enemy_hp_multiplier),
    maxHp: Math.ceil(c.hp * sc.enemy_hp_multiplier),
    radius: c.collision_radius,
    speed: c.move_speed,
    phaseIndex: 0,
    actionIndex: 0,
    state: 'pause',   // pause -> windup -> active -> recovery -> pause ...
    stateT: 0,
    transitionT: 0,
    aim: null,
    attackHit: new Set(),
    faceRad: Math.PI / 2,
    faceLeft: false,
    hitFlash: 0,
    dead: false,
    pathHistory: [],   // für den zeitlichen Rücklauf (B08)
    buffUntil: 0,
    scaledDamage(base) {
      return Math.ceil(base * sc.enemy_damage_multiplier);
    },
  };
  world.boss = boss;
  return boss;
}

function currentAction(boss) {
  const spec = boss.data.combat.phase_specs[boss.phaseIndex];
  return spec.actions[boss.actionIndex % spec.actions.length];
}

export function updateBoss(world, boss, dt) {
  if (boss.dead) return;
  boss.stateT += dt;
  if (boss.hitFlash > 0) boss.hitFlash -= dt;

  // Pfadprotokoll für Rücklauf-Angriffe
  boss.pathHistory.push([boss.x, boss.y, world.time]);
  if (boss.pathHistory.length > 600) boss.pathHistory.shift();

  // Phasenwechsel prüfen (66 % / 33 %), Übergang 1,2 s, Gefahren löschen.
  const c = boss.data.combat;
  const frac = boss.hp / boss.maxHp;
  const nextPhase = c.phase_thresholds.filter((t) => frac <= t).length - 1;
  const clampedPhase = Math.min(Math.max(nextPhase, boss.phaseIndex), c.phase_specs.length - 1);
  if (clampedPhase > boss.phaseIndex && boss.transitionT <= 0) {
    boss.phaseIndex = clampedPhase;
    boss.actionIndex = 0;
    boss.state = 'transition';
    boss.stateT = 0;
    boss.transitionT = c.phase_change_seconds;
    boss.aim = null;
    if (c.clear_active_hazards_on_phase_change) {
      world.fields = [];
      world.enemyProjectiles = [];
      world.orbitals = world.orbitals.filter((o) => !o.fromBoss);
    }
    sfx.bossTransition();
    return;
  }

  const hero = world.hero;
  const action = currentAction(boss);

  switch (boss.state) {
    case 'transition': {
      boss.transitionT -= dt;
      if (boss.transitionT <= 0) {
        boss.transitionT = 0;
        boss.state = 'pause';
        boss.stateT = 0;
      }
      break;
    }
    case 'pause': {
      // Zwischen Aktionen langsam auf den Helden zu bewegen.
      moveTowardHero(world, boss, dt);
      if (boss.stateT >= ACTION_PAUSE) {
        boss.state = 'windup';
        boss.stateT = 0;
        lockAim(world, boss, action);
      }
      break;
    }
    case 'windup': {
      if ((action.movement_during_windup || 0) > 0) moveTowardHero(world, boss, dt, action.movement_during_windup);
      if (boss.stateT >= action.windup_seconds) {
        boss.state = 'active';
        boss.stateT = 0;
        startBossActive(world, boss, action);
      }
      break;
    }
    case 'active': {
      updateBossActive(world, boss, action, dt);
      if (boss.stateT >= action.active_seconds) {
        boss.state = 'recovery';
        boss.stateT = 0;
      }
      break;
    }
    case 'recovery': {
      if ((action.movement_during_recovery || 0) > 0) moveTowardHero(world, boss, dt, action.movement_during_recovery);
      if (boss.stateT >= action.recovery_seconds) {
        boss.state = 'pause';
        boss.stateT = 0;
        boss.actionIndex += 1;
        boss.aim = null;
      }
      break;
    }
    default:
      break;
  }
}

function moveTowardHero(world, boss, dt, speedOverride) {
  const hero = world.hero;
  const d = dist(boss.x, boss.y, hero.x, hero.y);
  if (d < 140) return;
  const sp = (speedOverride || boss.speed) * enemySpeedFactor(world, boss);
  const [dx, dy] = norm(hero.x - boss.x, hero.y - boss.y);
  const nx = boss.x + dx * sp * dt;
  const ny = boss.y + dy * sp * dt;
  [boss.x, boss.y] = resolveMove(boss.x, boss.y, boss.radius, nx, ny, world.arena, 'blocks_enemies');
  if (Math.abs(dx) > 0.05) boss.faceLeft = dx < 0;
  boss.faceRad = Math.atan2(dy, dx);
}

function startBossActive(world, boss, action) {
  switch (action.archetype) {
    case 'summon': {
      const alive = world.monsters.filter((o) => o.ownerRef === boss && !o.dead).length;
      const cap = action.summon_owner_cap || 4;
      const n = Math.min(action.projectile_or_spawn_count || 1, Math.max(0, cap - alive));
      const offs = action.spawn_offsets_local || [[60, 0], [-60, 0], [0, 60], [0, -60]];
      for (let i = 0; i < n; i++) {
        const [ox, oy] = offs[i % offs.length];
        const child = spawnMonster(world, action.spawn_monster_id, boss.x + ox, boss.y + oy, boss);
        child.spawnGrace = 0.6;
        child.noDrops = true;
      }
      break;
    }
    case 'orbit': {
      // Kreisende Restplatten um den Boss.
      const count = action.projectile_or_spawn_count || 4;
      for (let i = 0; i < count; i++) {
        world.orbitals.push({
          fromBoss: true,
          owner: boss,
          baseAngle: (i / count) * Math.PI * 2,
          r: action.orbit_radius || action.range_or_radius,
          plateR: action.plate_collision_radius || 20,
          angularSpeed: (action.angular_speed_degrees_per_second || 90) * Math.PI / 180,
          t: 0,
          life: action.active_seconds,
          damage: boss.scaledDamage(action.damage),
          color: action.fx_color || '#E87768',
          hitCooldown: 0,
        });
      }
      break;
    }
    case 'rewind': {
      // Rücklauf: Boss folgt der eigenen Spur rückwärts; Spur wird Angriffskante.
      boss.rewindPath = boss.pathHistory.slice(-240).map(([x, y]) => [x, y]).reverse();
      break;
    }
    default:
      startActive(world, boss, action, bossApi);
      break;
  }
}

function updateBossActive(world, boss, action, dt) {
  const hero = world.hero;
  if (action.archetype === 'rewind' && boss.rewindPath && boss.rewindPath.length > 1) {
    const total = action.rewind_duration || action.active_seconds;
    const idx = Math.min(boss.rewindPath.length - 1, Math.floor((boss.stateT / total) * boss.rewindPath.length));
    const [px, py] = boss.rewindPath[idx];
    boss.x = px;
    boss.y = py;
    if (!boss.attackHit.has('hero') && dist(hero.x, hero.y, boss.x, boss.y) <= boss.radius + hero.radius + 8) {
      damageHero(world, boss.scaledDamage(action.damage) * enemyWeaknessFactor(world, boss), boss);
      boss.attackHit.add('hero');
    }
    return;
  }
  if (action.archetype === 'dash') {
    const total = action.distance || action.range_or_radius;
    const step = (total / action.active_seconds) * dt;
    boss.x += Math.cos(boss.aim.dirRad) * step;
    boss.y += Math.sin(boss.aim.dirRad) * step;
    [boss.x, boss.y] = resolveMove(boss.x, boss.y, boss.radius, boss.x, boss.y, world.arena, 'blocks_enemies');
    if (!boss.attackHit.has('hero')) {
      if (dist(hero.x, hero.y, boss.x, boss.y) <= boss.radius + hero.radius + 6) {
        damageHero(world, boss.scaledDamage(action.damage) * enemyWeaknessFactor(world, boss), boss);
        boss.attackHit.add('hero');
      }
    }
    return;
  }
  if (action.archetype === 'lob') {
    // Flugphase, dann Einschlag auf markierter Fläche.
    const flight = action.flight_seconds || 0.55;
    if (boss.stateT >= flight && !boss.attackHit.has('hero')) {
      const r = action.impact_radius || action.range_or_radius;
      if (dist(hero.x, hero.y, boss.aim.anchorX, boss.aim.anchorY) <= r + hero.radius) {
        damageHero(world, boss.scaledDamage(action.damage) * enemyWeaknessFactor(world, boss), boss);
        boss.attackHit.add('hero');
      }
    }
    return;
  }
  updateActive(world, boss, action, boss.stateT / action.active_seconds, dt);
}

export function updateOrbitals(world, dt) {
  const hero = world.hero;
  for (const o of world.orbitals) {
    o.t += dt;
    if (o.t >= o.life) { o.dead = true; continue; }
    if (o.hitCooldown > 0) o.hitCooldown -= dt;
    const cx = o.owner ? o.owner.x : o.x0;
    const cy = o.owner ? o.owner.y : o.y0;
    const ang = o.baseAngle + o.t * o.angularSpeed * (o.sign || 1);
    o.x = cx + Math.cos(ang) * o.r;
    o.y = cy + Math.sin(ang) * o.r;
    if (o.fromBoss) {
      if (o.hitCooldown <= 0 && dist(o.x, o.y, hero.x, hero.y) <= o.plateR + hero.radius) {
        damageHero(world, o.damage, o);
        o.hitCooldown = 0.8;
      }
    }
  }
  world.orbitals = world.orbitals.filter((o) => !o.dead);
}

export const bossApi = {
  summon() { /* über startBossActive abgedeckt */ },
  buffAllies() { /* Bosse nutzen keinen Buff laut Daten */ },
};
