// Einheitlicher Angriffs-Interpreter für Monster- und Bossaktionen.
// Zustandsfolge aus design.json: move_or_idle -> windup -> active -> recovery.
// Ziel und Richtung werden am Beginn der Vorbereitung fixiert (target_lock);
// gestrichelte Warnung verursacht nie Schaden, nur die solide Aktivphase.

import { D } from '../data.js';
import { damageHero, spawnHitFx } from './world.js';
import {
  circleInSector, circleInDisk, circleInLine, circleInRect, circleInPolyline,
  dist, norm, angleOf,
} from './geometry.js';
import { sfx } from '../audio.js';
import { enemyWeaknessFactor } from './effects.js';

const TELEGRAPH_COLOR = '#E87768';

// Fixiert Ziel/Anker beim Start der Vorbereitung.
export function lockAim(world, self, spec) {
  const hero = world.hero;
  const aimAtPlayer = !spec.area_anchor || /Spieler/i.test(spec.area_anchor) || /Spieler/i.test(spec.aim_lock || spec.aim || '');
  const dirRad = angleOf(hero.x - self.x, hero.y - self.y);
  const anchorOnPlayer = /Spieler/i.test(spec.area_anchor || '') ||
    ['delayed_ring', 'mark', 'lob', 'hop', 'burrow', 'teleport', 'zone', 'slam'].includes(spec.archetype) &&
    /Spieler/i.test(spec.area_anchor || '');
  let ax = self.x;
  let ay = self.y;
  if (anchorOnPlayer || (['delayed_ring', 'mark', 'lob'].includes(spec.archetype))) {
    ax = hero.x; ay = hero.y;
  }
  if (['hop', 'burrow', 'teleport'].includes(spec.archetype)) {
    // Sprung-/Auftauch-/Versatzziel: Spielerposition, begrenzt durch Reichweite.
    const maxD = spec.trigger_range || 180;
    const d = dist(self.x, self.y, hero.x, hero.y);
    const f = d > maxD ? maxD / d : 1;
    ax = self.x + (hero.x - self.x) * f;
    ay = self.y + (hero.y - self.y) * f;
  }
  self.aim = {
    dirRad,
    originX: self.x,
    originY: self.y,
    anchorX: ax,
    anchorY: ay,
    heroX: hero.x,
    heroY: hero.y,
  };
  self.faceRad = dirRad;
  self.attackHit = new Set();
  sfx.warning(spec.archetype);
}

// Geometriebeschreibung für Warn- und Aktivdarstellung.
export function telegraphShape(self, spec) {
  const a = self.aim;
  if (!a) return null;
  const arch = spec.archetype;
  const geo = spec.visual_geometry;
  const range = spec.range_or_radius || 0;
  switch (geo) {
    case 'sector':
      return { kind: 'sector', x: self.x, y: self.y, dirRad: a.dirRad, range, angle: spec.cone_angle_degrees || spec.width_or_angle || 60 };
    case 'disk': {
      const r = spec.field_radius || range;
      if (arch === 'explosion' || arch === 'radial_bite' || arch === 'slow_field' || arch === 'lure' || arch === 'loot') {
        return { kind: 'disk', x: self.x, y: self.y, r };
      }
      return { kind: 'disk', x: a.anchorX, y: a.anchorY, r };
    }
    case 'aura':
      return { kind: 'disk', x: self.x, y: self.y, r: spec.field_radius || range, support: spec.damage === 0 };
    case 'line': {
      const len = spec.travel_distance || range;
      return { kind: 'line', x: self.x, y: self.y, dirRad: arch === 'rewind' ? a.dirRad + Math.PI : a.dirRad, len, width: spec.line_width || spec.width_or_angle || 24 };
    }
    case 'square': {
      const side = range;
      return { kind: 'square', x: a.anchorX, y: a.anchorY, side };
    }
    case 'ring':
      return { kind: 'ring', x: self.x, y: self.y, r: range, gapDeg: spec.safe_gap_degrees || 70, gapDirRad: angleOf(a.heroX - self.x, a.heroY - self.y) + ((spec.safe_gap_rotation_degrees || 0) * Math.PI / 180) };
    case 'fan': {
      const offsets = spec.angle_offsets_degrees || [-22, 0, 22];
      return { kind: 'fan', x: self.x, y: self.y, dirRad: a.dirRad, len: range, width: spec.beam_width || spec.line_width || 18, offsets };
    }
    case 'polyline': {
      const pts = (spec.path_points_local || []).map(([px, py]) => rotPoint(px, py, a.dirRad, self.x, self.y));
      return { kind: 'polyline', points: pts, width: spec.line_width || 24 };
    }
    case 'triangle_links': {
      const pts = (spec.anchor_angles_degrees || [0, 120, 240]).map((deg) =>
        [self.x + Math.cos(deg * Math.PI / 180) * spec.anchor_radius, self.y + Math.sin(deg * Math.PI / 180) * spec.anchor_radius]);
      return { kind: 'triangle', points: pts, width: spec.line_width || 22 };
    }
    case 'orbit':
      return { kind: 'orbitplates', x: self.x, y: self.y, r: spec.orbit_radius || range, count: spec.projectile_or_spawn_count || 4, plateR: spec.plate_collision_radius || 20 };
    case 'spawn':
      return { kind: 'spawnmarks', x: self.x, y: self.y, offsets: spec.spawn_offsets_local || null, count: spec.projectile_or_spawn_count || 1 };
    default:
      return { kind: 'disk', x: a.anchorX, y: a.anchorY, r: range || 40 };
  }
}

function rotPoint(px, py, dirRad, ox, oy) {
  const c = Math.cos(dirRad);
  const s = Math.sin(dirRad);
  return [ox + px * c - py * s, oy + px * s + py * c];
}

// Beginn der Aktivphase: einmalige Wirkungen auslösen.
export function startActive(world, self, spec, api) {
  const a = self.aim;
  const arch = spec.archetype;
  switch (arch) {
    case 'shot':
    case 'turret':
    case 'guard_shot':
    case 'dual_shot':
    case 'fan':
    case 'triple_beam': {
      if (spec.projectile_radius) {
        fireProjectiles(world, self, spec);
      }
      break;
    }
    case 'ring': {
      fireRing(world, self, spec);
      break;
    }
    case 'lob':
      // Markierte Landefläche: Schaden über Flächenprüfung in der Aktivphase.
      break;
    case 'summon': {
      api.summon(world, self, spec);
      break;
    }
    case 'buff': {
      api.buffAllies(world, self, spec);
      break;
    }
    case 'shield': {
      self.shieldActiveUntil = world.time + spec.active_seconds + 1.0;
      break;
    }
    case 'slow_field':
    case 'cloud':
    case 'zone': {
      const shape = telegraphShape(self, spec);
      pushFieldFromShape(world, shape, spec, self);
      break;
    }
    case 'trail': {
      const shape = telegraphShape(self, spec);
      pushFieldFromShape(world, shape, { ...spec, active_seconds: Math.max(spec.active_seconds, 1.6) }, self);
      break;
    }
    case 'teleport':
    case 'burrow': {
      self.x = a.anchorX;
      self.y = a.anchorY;
      break;
    }
    case 'loot': {
      // Sammler: Beute im Kreis einbehalten; Rückgabe beim Tod.
      self.storedPickups = self.storedPickups || [];
      for (const p of world.pickups) {
        if (dist(p.x, p.y, self.x, self.y) <= (spec.field_radius || spec.range_or_radius)) {
          p.dead = true;
          self.storedPickups.push({ type: p.type, value: p.value });
        }
      }
      world.pickups = world.pickups.filter((p) => !p.dead);
      break;
    }
    default:
      break;
  }
}

function pushFieldFromShape(world, shape, spec, self) {
  const field = {
    t: 0,
    warnSeconds: 0,            // Warnung lief bereits über die Vorbereitung
    activeSeconds: spec.active_seconds,
    damage: spec.damage > 0 ? self.scaledDamage(spec.damage) : 0,
    slowFactor: spec.slow_factor || 0,
    tickInterval: spec.tick_interval_seconds || 0,
    shape,
    sourcePos: { x: self.x, y: self.y },
    hitTest(tx, ty, tr) {
      return shapeHit(shape, tx, ty, tr);
    },
  };
  world.fields.push(field);
}

export function shapeHit(shape, tx, ty, tr) {
  switch (shape.kind) {
    case 'sector': return circleInSector(tx, ty, tr, shape.x, shape.y, shape.dirRad, shape.angle, shape.range);
    case 'disk': return circleInDisk(tx, ty, tr, shape.x, shape.y, shape.r);
    case 'line': return circleInLine(tx, ty, tr, shape.x, shape.y, shape.dirRad, shape.len, shape.width);
    case 'square': return circleInRect(tx, ty, tr, shape.x - shape.side / 2, shape.y - shape.side / 2, shape.side, shape.side);
    case 'fan': {
      for (const off of shape.offsets) {
        if (circleInLine(tx, ty, tr, shape.x, shape.y, shape.dirRad + off * Math.PI / 180, shape.len, shape.width)) return true;
      }
      return false;
    }
    case 'polyline': return circleInPolyline(tx, ty, tr, shape.points, shape.width);
    case 'triangle': {
      const pts = [...shape.points, shape.points[0]];
      return circleInPolyline(tx, ty, tr, pts, shape.width);
    }
    default: return false;
  }
}

function fireProjectiles(world, self, spec) {
  const a = self.aim;
  const count = spec.projectile_or_spawn_count || 1;
  const speed = spec.projectile_speed || D.design.combat_rules.projectile_speed;
  const radius = spec.projectile_radius || D.design.combat_rules.enemy_projectile_radius;
  const life = spec.projectile_lifetime_seconds || ((spec.range_or_radius || 300) / speed);
  const offsets = spec.angle_offsets_degrees
    || (count === 3 ? [-18, 0, 18] : count === 5 ? [-30, -15, 0, 15, 30] : [0]);
  const dual = spec.archetype === 'dual_shot';
  for (let i = 0; i < count; i++) {
    const off = offsets[i % offsets.length] * Math.PI / 180;
    const dir = a.dirRad + off;
    let ox = self.x;
    let oy = self.y;
    if (dual) {
      const side = i % 2 === 0 ? 1 : -1;
      ox += Math.cos(dir + Math.PI / 2) * 18 * side;
      oy += Math.sin(dir + Math.PI / 2) * 18 * side;
    }
    world.enemyProjectiles.push({
      x: ox, y: oy,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      radius,
      damage: self.scaledDamage(spec.damage),
      source: self,
      life,
      color: spec.fx_color || TELEGRAPH_COLOR,
    });
  }
}

function fireRing(world, self, spec) {
  // Projektilring mit sicherer Lücke; Lücke zeigt auf die fixierte Spielerposition
  // (plus angegebener Drehung), bleibt also für ein stehendes Ziel frei.
  const a = self.aim;
  const count = spec.projectile_or_spawn_count || 12;
  const speed = spec.projectile_speed || 160;
  const radius = spec.projectile_radius || 9;
  const life = spec.projectile_lifetime_seconds || ((spec.range_or_radius || 250) / speed);
  const gapDeg = spec.safe_gap_degrees || 70;
  const gapDir = angleOf(a.heroX - self.x, a.heroY - self.y) + ((spec.safe_gap_rotation_degrees || 0) * Math.PI / 180);
  for (let i = 0; i < count; i++) {
    const dir = (i / count) * Math.PI * 2;
    let dd = dir - gapDir;
    while (dd > Math.PI) dd -= 2 * Math.PI;
    while (dd < -Math.PI) dd += 2 * Math.PI;
    if (Math.abs(dd) <= (gapDeg * Math.PI / 180) / 2) continue; // sichere Lücke bleibt frei
    world.enemyProjectiles.push({
      x: self.x, y: self.y,
      vx: Math.cos(dir) * speed,
      vy: Math.sin(dir) * speed,
      radius,
      damage: self.scaledDamage(spec.damage),
      source: self,
      life,
      color: spec.fx_color || TELEGRAPH_COLOR,
    });
  }
}

// Aktive Phase: Flächenschaden, Bewegungsangriffe, Sog.
export function updateActive(world, self, spec, progress, dt) {
  const a = self.aim;
  const hero = world.hero;
  const arch = spec.archetype;

  // Bewegungsangriffe: Entität bewegt sich entlang der fixierten Bahn.
  if (['dash', 'zigzag'].includes(arch) && spec.travel_distance) {
    const total = spec.travel_distance;
    const step = (total / spec.active_seconds) * dt;
    self.x += Math.cos(a.dirRad) * step;
    self.y += Math.sin(a.dirRad) * step;
  } else if (arch === 'rewind') {
    const step = ((spec.travel_distance || spec.range_or_radius) / spec.active_seconds) * dt;
    self.x -= Math.cos(a.dirRad) * step;
    self.y -= Math.sin(a.dirRad) * step;
  } else if (arch === 'hop') {
    // Sprung: Position interpoliert zur Landefläche.
    self.x = a.originX + (a.anchorX - a.originX) * Math.min(1, progress * 1.4);
    self.y = a.originY + (a.anchorY - a.originY) * Math.min(1, progress * 1.4);
  }

  if (arch === 'pull') {
    const r = spec.field_radius || spec.range_or_radius;
    if (dist(hero.x, hero.y, self.x, self.y) <= r) {
      const [dx, dy] = norm(self.x - hero.x, self.y - hero.y);
      hero.x += dx * (spec.pull_speed || 45) * dt;
      hero.y += dy * (spec.pull_speed || 45) * dt;
    }
    return;
  }
  if (spec.damage <= 0) return;
  if (['shot', 'turret', 'guard_shot', 'dual_shot', 'fan', 'triple_beam', 'ring', 'summon', 'buff', 'shield', 'slow_field', 'cloud', 'zone', 'trail', 'loot'].includes(arch)) {
    // Wirkung lief über Projektile/Felder/Hilfen; fan ohne projectile_radius = Strahlen unten.
    if (!(arch === 'fan' || arch === 'triple_beam') || spec.projectile_radius) return;
  }

  // Ein Treffer pro Ziel und Angriff; Schwäche zum Trefferzeitpunkt.
  if (self.attackHit.has('hero')) return;
  const shape = activeShape(world, self, spec);
  if (shape && shapeHit(shape, hero.x, hero.y, hero.radius)) {
    damageHero(world, self.scaledDamage(spec.damage) * enemyWeaknessFactor(world, self), self);
    self.attackHit.add('hero');
  }
}

// Form in der Aktivphase: für Bewegungsangriffe folgt sie der Entität.
export function activeShape(world, self, spec) {
  const a = self.aim;
  const arch = spec.archetype;
  switch (arch) {
    case 'dash':
    case 'zigzag':
    case 'rewind':
      return { kind: 'disk', x: self.x, y: self.y, r: (spec.line_width || 40) / 2 + 8 };
    case 'hop':
    case 'burrow':
    case 'teleport':
      return { kind: 'disk', x: a.anchorX, y: a.anchorY, r: spec.field_radius || spec.range_or_radius };
    default:
      return telegraphShape(self, spec);
  }
}
