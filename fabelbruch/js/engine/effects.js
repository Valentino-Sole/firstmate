// Waffeneffekte v0.4.2: Statusregister, 40 Fähigkeiten (E001-E040) und
// gemeinsame Regeln (data/gemeinsame-regeln.json, data/statusregister.json,
// data/waffeneffekte.json). Kernpunkte:
// - D = ungerundeter Basisschaden x Stufenfaktor x (1 + Schadensbonus),
//   Snapshot beim Aktivierungsstart; Sekundärschaden löst keine weiteren
//   Fähigkeiten, Heilung oder Krits aus; Brüchig verstärkt auch Sekundärschaden.
// - Statuswerte: burn/rend (DoT, global je Ziel, max 3 s Restzeit),
//   slow/weakness/brittle (stärkste Quelle, Deckel; Bosswerte halbiert bzw.
//   im Effekttext bereits halbiert), root (nur normale Gegner, 3 s Immunität),
//   bookmark, seam_link, sand_load, tempo_buff, time_mark.
// - Wellenende entfernt alle Effekte schadlos und setzt Zähler zurück.

import { D } from '../data.js';
import { dist, norm, resolveMove, circleInLine } from './geometry.js';
import { sfx } from '../audio.js';

let nextInstanceId = 1;
export function assignInstanceId(w) {
  w.instanceId = nextInstanceId++;
  resetInstanceState(w);
}

export function resetInstanceState(w) {
  w.fx = {
    activations: 0,
    perTargetHits: new Map(),   // targetKey -> {count, windowUntil}
    reflectionsLeft: 0,
    beamDestroysLeft: 0,
    orbitDestroysLeft: 0,
    internalCooldownUntil: 0,
    mines: 0,
    fields: [],
    linkPair: null,
    healedThisActivation: 0,
    burningSpreadUsed: false,
    firstHitUsed: false,
  };
}

export function effectFor(weaponId) {
  if (!effectIndex) {
    effectIndex = new Map();
    for (const e of D.effekte.effects) effectIndex.set(e.weapon_id, e);
  }
  return effectIndex.get(weaponId);
}
let effectIndex = null;

export function ensureTargetStatus(tgt) {
  if (!tgt.status) {
    tgt.status = {
      burn: null,            // {tickBase, nextTickAt, expiresAt, owner}
      rend: null,
      slows: [],             // {amount, until, source}
      weaknesses: [],        // {amount, until, source}
      brittles: [],
      rootUntil: 0,
      rootImmuneUntil: 0,
      bookmark: null,        // {instanceId, damage, until}
      sandStacks: 0,
      sandUntil: 0,
      timeMarks: new Map(),  // instanceId -> {at, damage}
    };
  }
  return tgt.status;
}

function isBoss(tgt) { return tgt.kind === 'boss'; }
function targetKey(tgt) { return tgt.kind === 'boss' ? 'boss' : tgt.spawnSeq; }

// ---- Statusabfragen (von Monstern/Bossen/Weltlogik genutzt) ----

export function enemySpeedFactor(world, tgt) {
  const s = tgt.status;
  if (!s) return 1;
  const now = world.time;
  if (!isBoss(tgt) && s.rootUntil > now) return 0;
  let strongest = 0;
  for (const sl of s.slows) if (sl.until > now) strongest = Math.max(strongest, sl.amount);
  if (s.sandUntil > now && s.sandStacks > 0) {
    const per = isBoss(tgt) ? 0.025 : 0.05;
    strongest = Math.max(strongest, s.sandStacks * per);
  }
  const cap = isBoss(tgt) ? 0.2 : 0.5;
  return 1 - Math.min(cap, strongest);
}

export function enemyWeaknessFactor(world, source) {
  if (!source) return 1;
  if (source.weaknessDeathSnapshot !== undefined) return 1 - source.weaknessDeathSnapshot;
  const s = source.status;
  if (!s) return 1;
  const now = world.time;
  let strongest = 0;
  for (const wkn of s.weaknesses) if (wkn.until > now) strongest = Math.max(strongest, wkn.amount);
  const cap = isBoss(source) ? 0.15 : 0.3;
  return 1 - Math.min(cap, strongest);
}

export function brittleFactor(world, tgt) {
  const s = tgt.status;
  if (!s) return 1;
  const now = world.time;
  let strongest = 0;
  for (const b of s.brittles) if (b.until > now) strongest = Math.max(strongest, b.amount);
  const cap = isBoss(tgt) ? 0.125 : 0.25;
  return 1 + Math.min(cap, strongest);
}

function addSlow(world, tgt, amount, duration, source) {
  const s = ensureTargetStatus(tgt);
  s.slows.push({ amount, until: world.time + duration, source });
}

function addWeakness(world, tgt, amount, duration, source) {
  const s = ensureTargetStatus(tgt);
  s.weaknesses.push({ amount, until: world.time + duration, source });
}

function addBrittle(world, tgt, amount, duration, source) {
  const s = ensureTargetStatus(tgt);
  s.brittles.push({ amount, until: world.time + duration, source });
}

function addRoot(world, tgt, duration) {
  if (isBoss(tgt)) return false;
  const s = ensureTargetStatus(tgt);
  if (s.rootImmuneUntil > world.time) return false;
  s.rootUntil = world.time + duration;
  s.rootImmuneUntil = world.time + duration + 3;
  return true;
}

// Brand/Risswunde: ein globaler Status je Ziel, Tick alle 0,5 s, Rest max 3 s.
function applyDot(world, tgt, kind, tickBase, durationS, owner) {
  const s = ensureTargetStatus(tgt);
  const now = world.time;
  const cur = s[kind];
  if (!cur) {
    s[kind] = { tickBase, nextTickAt: now + 0.5, expiresAt: Math.min(now + durationS, now + 3), owner };
    return;
  }
  if (tickBase > cur.tickBase) {
    cur.tickBase = tickBase;
    cur.owner = owner;
    cur.expiresAt = Math.min(now + durationS, now + 3);
  } else {
    cur.expiresAt = Math.min(Math.max(cur.expiresAt, now + durationS), now + 3);
  }
}

// ---- Anwendung der Waffenfähigkeiten ----

// Aktivierungsstart: zyklische Zähler, Hauptangriffs-Modifikatoren, Echos.
export function onActivation(world, w, spec) {
  const e = effectFor(w.weaponId);
  const mods = { offsets: null, primaryFactor: 1, rootOnHit: 0, brittleOnHit: null };
  if (!e) return mods;
  w.fx.healedThisActivation = 0;
  w.fx.burningSpreadUsed = false;
  w.fx.firstHitUsed = false;
  w.fx.activationHit = new Set();

  if (e.trigger === 'activation') {
    w.fx.activations += 1;
    const p = e.parameters;
    switch (e.id) {
      case 'E012':
        if (w.fx.activations % p.every_n_activations === 0) mods.offsets = p.enhanced_offsets_deg;
        break;
      case 'E029':
        if (w.fx.activations % p.every_n_activations === 0) {
          mods.primaryFactor = p.primary_damage_factor;
          mods.rootOnHit = p.root_duration_s;
        }
        break;
      case 'E037':
        if (w.fx.activations % p.every_n_activations === 0) {
          mods.primaryFactor = p.primary_damage_factor;
          mods.brittleOnHit = { amount: p.incoming_damage_bonus, duration: p.duration_s };
        }
        break;
      case 'E010':
      case 'E040':
        // Echo nach fester Verzögerung ab Beginn der Hauptaktivphase.
        world.echoes.push({ at: world.time + p.delay_after_primary_active_start_s, weapon: w, effect: e, frozen: null });
        break;
      default:
        break;
    }
  } else {
    w.fx.activations += 1;
  }
  if (e.id === 'E009') w.fx.reflectionsLeft = e.parameters.reflections_per_activation;
  if (e.id === 'E024') w.fx.beamDestroysLeft = e.parameters.projectiles_destroyed_per_activation;
  if (e.id === 'E028') w.fx.orbitDestroysLeft = e.parameters.projectiles_destroyed_per_activation;
  return mods;
}

// Haupttreffer. ctx: {D, actualLoss, hpFracBefore, wasBurning, hadRend,
// impactX, impactY, dirRad, axisOriginX, axisOriginY, effRange, fireMods, dealSecondary}
export function onPrimaryHit(world, w, spec, tgt, ctx) {
  const e = effectFor(w.weaponId);
  if (!e) return;
  const p = e.parameters;
  const Dmg = ctx.D;
  const sec = ctx.dealSecondary; // (tgt, rawAmount) -> actualLoss

  // Verbrauch fremder Lesemarke (anderer Instanz) vor eigenen Zusatztreffern.
  if (ctx.actualLoss > 0) {
    const s = ensureTargetStatus(tgt);
    if (s.bookmark && s.bookmark.until > world.time && s.bookmark.instanceId !== w.instanceId && tgt.hp > 0) {
      const bm = s.bookmark;
      s.bookmark = null;
      sec(tgt, bm.damage);
    }
  }

  const positive = ctx.actualLoss > 0;
  switch (e.id) {
    case 'E001': {
      if (!positive) break;
      const key = targetKey(tgt);
      const rec = w.fx.perTargetHits.get(key) || { count: 0, windowUntil: 0 };
      if (world.time > rec.windowUntil) rec.count = 0;
      rec.count += 1;
      rec.windowUntil = world.time + p.window_s;
      if (rec.count >= p.hits_required) {
        rec.count = 0;
        if (tgt.hp > 0) sec(tgt, Dmg * p.bonus_D);
      }
      w.fx.perTargetHits.set(key, rec);
      break;
    }
    case 'E002': {
      if (!positive) break;
      if (!isBoss(tgt)) {
        displace(world, tgt, tgt.x - ctx.impactX, tgt.y - ctx.impactY, p.knockback_u);
        addSlow(world, tgt, p.slow, p.duration_s, w.instanceId);
      } else {
        addSlow(world, tgt, p.slow / 2, p.duration_s, w.instanceId);
      }
      break;
    }
    case 'E004': {
      if (!positive) break;
      addWeakness(world, tgt, isBoss(tgt) ? p.outgoing_damage_reduction / 2 : p.outgoing_damage_reduction, p.duration_s, w.instanceId);
      break;
    }
    case 'E005': {
      if (!positive) break;
      addBrittle(world, tgt, isBoss(tgt) ? p.incoming_damage_bonus / 2 : p.incoming_damage_bonus, p.duration_s, w.instanceId);
      break;
    }
    case 'E007': {
      if (!positive) break;
      applyDot(world, tgt, 'burn', Dmg * p.tick_D, p.duration_s, w.instanceId);
      break;
    }
    case 'E008': {
      if (!positive) break;
      if (ctx.burnSnapshot && tgt.hp > 0) {
        const remaining = ctx.burnSnapshot.remainingBase;
        const s = ensureTargetStatus(tgt);
        s.burn = null;
        sec(tgt, Math.min(remaining * p.remaining_burn_conversion, Dmg * p.max_bonus_D));
      }
      break;
    }
    case 'E011': {
      if (!positive) break;
      if (ctx.hpFracBefore <= p.hp_threshold && tgt.hp > 0) sec(tgt, Dmg * p.bonus_D);
      break;
    }
    case 'E013': {
      if (!positive) break;
      const key = targetKey(tgt);
      const s = ensureTargetStatus(tgt);
      const rec = w.fx.perTargetHits.get(key) || { count: 0, windowUntil: 0 };
      if (world.time > rec.windowUntil) rec.count = 0;
      rec.count += 1;
      rec.windowUntil = world.time + p.window_s;
      if (rec.count >= p.hits_required) {
        rec.count = 0;
        if (isBoss(tgt)) addSlow(world, tgt, 0.1, p.root_duration_s, w.instanceId);
        else if (s.rootImmuneUntil <= world.time) addRoot(world, tgt, p.root_duration_s);
      }
      w.fx.perTargetHits.set(key, rec);
      break;
    }
    case 'E014': {
      if (!positive) break;
      const proj = (tgt.x - ctx.axisOriginX) * Math.cos(ctx.dirRad) + (tgt.y - ctx.axisOriginY) * Math.sin(ctx.dirRad);
      if (proj >= ctx.effRange * p.outer_range_fraction && tgt.hp > 0) sec(tgt, Dmg * p.bonus_D);
      break;
    }
    case 'E015': {
      if (!positive) break;
      applyDot(world, tgt, 'rend', Dmg * p.tick_D, p.duration_s, w.instanceId);
      break;
    }
    case 'E016': {
      if (!positive) break;
      addSlow(world, tgt, isBoss(tgt) ? p.slow / 2 : p.slow, p.duration_s, w.instanceId);
      break;
    }
    case 'E018': {
      if (!positive) break;
      if (ctx.hadRend && tgt.hp > 0) sec(tgt, Dmg * p.bonus_D);
      break;
    }
    case 'E019': {
      if (!positive) break;
      const s = ensureTargetStatus(tgt);
      if (tgt.hp > 0) s.bookmark = { instanceId: w.instanceId, damage: Dmg * p.detonation_D, until: world.time + p.mark_duration_s };
      break;
    }
    case 'E021': {
      if (!positive) break;
      // Bestehende Verbindung dieses Treffers zuerst übertragen (ältestes Paar).
      transferLinks(world, w, tgt, ctx.actualLoss);
      // Neues Paar knüpfen (ersetzt eigenes bisheriges Paar).
      if (tgt.hp > 0) {
        let best = null;
        let bestD = Infinity;
        for (const o of enemiesAll(world)) {
          if (o === tgt || o.hp <= 0) continue;
          const d0 = dist(o.x, o.y, tgt.x, tgt.y);
          if (d0 <= p.partner_search_radius_u && d0 < bestD) { bestD = d0; best = o; }
        }
        if (best) {
          w.fx.linkPair = {
            a: tgt, b: best,
            until: world.time + p.link_duration_s,
            maxTransfer: Dmg * p.max_transfer_D,
            fraction: p.transfer_fraction,
            nextAllowedAt: 0,
            createdAt: world.time,
          };
        }
      }
      break;
    }
    case 'E022': {
      if (!positive || w.fx.firstHitUsed) break;
      w.fx.firstHitUsed = true;
      applyDot(world, tgt, 'rend', Dmg * p.tick_D, p.duration_s, w.instanceId);
      const near = nearestOthers(world, tgt, p.spread_radius_u, p.additional_targets);
      for (const o of near) applyDot(world, o, 'rend', Dmg * p.tick_D, p.duration_s, w.instanceId);
      break;
    }
    case 'E023': {
      if (!positive) break;
      if (!isBoss(tgt)) {
        const hero = world.hero;
        const maxPull = Math.max(0, dist(tgt.x, tgt.y, hero.x, hero.y) - (tgt.radius + hero.radius + 8));
        displace(world, tgt, hero.x - tgt.x, hero.y - tgt.y, Math.min(p.pull_u, maxPull));
      }
      break;
    }
    case 'E025': {
      if (!positive) break;
      addBrittle(world, tgt, isBoss(tgt) ? p.incoming_damage_bonus / 2 : p.incoming_damage_bonus, p.duration_s, w.instanceId);
      break;
    }
    case 'E030': {
      if (!positive) break;
      const s = ensureTargetStatus(tgt);
      if (s.sandUntil <= world.time) s.sandStacks = 0;
      s.sandStacks = Math.min(p.max_stacks, s.sandStacks + 1);
      s.sandUntil = world.time + p.refresh_duration_s;
      break;
    }
    case 'E032': {
      if (!positive) break;
      const s = ensureTargetStatus(tgt);
      if (!s.timeMarks.has(w.instanceId) && tgt.hp > 0) {
        s.timeMarks.set(w.instanceId, { at: world.time + p.delay_s, damage: Dmg * p.damage_D });
      }
      break;
    }
    case 'E033': {
      if (!positive) break;
      applyDot(world, tgt, 'burn', Dmg * p.tick_D, p.duration_s, w.instanceId);
      break;
    }
    case 'E034': {
      if (!positive) break;
      if (ctx.wasBurning && tgt.hp > 0) sec(tgt, Dmg * p.bonus_D);
      break;
    }
    case 'E035': {
      if (!positive || w.fx.burningSpreadUsed) break;
      if (ctx.wasBurning) {
        w.fx.burningSpreadUsed = true;
        const near = nearestOthers(world, tgt, p.spread_radius_u, p.additional_targets);
        for (const o of near) applyDot(world, o, 'burn', Dmg * p.tick_D, p.duration_s, w.instanceId);
      }
      break;
    }
    case 'E038': {
      if (!positive) break;
      const heal = Math.min(
        Math.ceil(ctx.actualLoss * p.healing_fraction),
        p.max_heal_per_activation - w.fx.healedThisActivation,
      );
      if (heal > 0) {
        w.fx.healedThisActivation += heal;
        const hero = world.hero;
        hero.hp = Math.min(world.heroStats.maxHp, hero.hp + heal);
      }
      break;
    }
    case 'E039': {
      if (!positive || tgt.hp <= 0) break;
      sec(tgt, Math.min(tgt.maxHp * p.target_max_hp_fraction, Dmg * p.max_bonus_D));
      break;
    }
    default:
      break;
  }

  // Aktivierungsgebundene Zusatzwirkungen (E029/E037) auf Treffer anwenden.
  if (ctx.fireMods) {
    if (ctx.fireMods.rootOnHit > 0 && positive) {
      if (isBoss(tgt)) addSlow(world, tgt, 0.1, ctx.fireMods.rootOnHit, w.instanceId);
      else addRoot(world, tgt, ctx.fireMods.rootOnHit);
    }
    if (ctx.fireMods.brittleOnHit && positive) {
      const b = ctx.fireMods.brittleOnHit;
      addBrittle(world, tgt, isBoss(tgt) ? b.amount / 2 : b.amount, b.duration, w.instanceId);
    }
  }
}

// Einschlagsgebundene Effekte (Lob-Einschlag, Bodenschlag-Zentrum).
export function onImpact(world, w, spec, x, y) {
  const e = effectFor(w.weaponId);
  if (!e) return;
  const p = e.parameters;
  if (e.id === 'E006' || e.id === 'E020') {
    const kind = e.id === 'E006' ? 'slow' : 'weakness';
    w.fx.fields.push({ x, y, r: p.radius_u, until: world.time + p.duration_s, kind, amount: e.id === 'E006' ? p.slow : p.outgoing_damage_reduction, instanceId: w.instanceId });
    while (w.fx.fields.length > p.max_fields_per_instance) w.fx.fields.shift();
    if (!world.heroFields.includes(w.fx)) world.heroFields.push(w.fx);
  }
  if (e.id === 'E027') {
    world.delayedRings.push({ at: world.time + p.delay_s, x, y, inner: p.inner_radius_u, outer: p.outer_radius_u, damage: null, weapon: w, D: w.lastD, factor: p.damage_D, hit: new Set() });
  }
}

// Projektiltreffer/-ende (Kette, Mine, Explosion).
export function onProjectileEvent(world, w, spec, proj, kind, hitTarget) {
  const e = effectFor(w.weaponId);
  if (!e) return;
  const p = e.parameters;
  if (e.id === 'E003' && kind === 'hit') {
    const already = proj.chainHit || new Set([hitTarget]);
    const hop = proj.chainHop || 0;
    if (hop < p.additional_targets) {
      let best = null;
      let bestD = Infinity;
      for (const o of enemiesAll(world)) {
        if (o.hp <= 0 || already.has(o)) continue;
        const d0 = dist(o.x, o.y, proj.x, proj.y);
        if (d0 <= p.search_radius_u && d0 < bestD) { bestD = d0; best = o; }
      }
      if (best) {
        world.chainShots.push({
          x: proj.x, y: proj.y, target: best, fixedX: best.x, fixedY: best.y,
          speed: p.speed_u_s, weapon: w, D: proj.D,
          damage: proj.D * p.damage_D[hop],
          hop, already,
        });
      }
    }
  }
  if (e.id === 'E026' && (kind === 'hit' || kind === 'end')) {
    world.mines.push({
      x: proj.x, y: proj.y, r: p.mine_radius_u,
      armedAt: world.time + p.arm_delay_s,
      until: world.time + p.lifetime_s,
      damage: proj.D * p.blast_D,
      weapon: w, activationId: proj.activationId,
    });
    const own = world.mines.filter((m) => m.weapon === w);
    while (own.length > p.max_mines_per_instance) {
      const oldest = own.shift();
      oldest.dead = true;
    }
  }
  if (e.id === 'E036' && kind === 'hit') {
    for (const o of enemiesAll(world)) {
      if (o === hitTarget || o.hp <= 0) continue;
      if (dist(o.x, o.y, proj.x, proj.y) <= p.blast_radius_u) {
        dealSecondaryDamage(world, w, o, proj.D * p.blast_D);
      }
    }
  }
}

// Schild blockt feindliches Projektil (E009 Rückspiegel).
export function onProjectileBlocked(world, proj) {
  for (const w of world.run.weapons) {
    if (!w) continue;
    const e = effectFor(w.weaponId);
    if (!e || e.id !== 'E009') continue;
    if (w.fx.reflectionsLeft <= 0) return;
    w.fx.reflectionsLeft -= 1;
    const spec = D.weaponsById.get(w.weaponId);
    const p = e.parameters;
    const st = world.heroStats;
    const tier = D.waffen.rules.damage_multiplier_per_tier[w.tier - 1];
    const dmg = p.base_reflection_damage * tier * (1 + st.damageBonus);
    const len = Math.hypot(proj.vx, proj.vy) || 1;
    world.heroProjectiles.push({
      x: proj.x, y: proj.y,
      vx: -proj.vx / len * p.speed_u_s,
      vy: -proj.vy / len * p.speed_u_s,
      radius: p.projectile_radius_u,
      reflected: { weapon: w, damage: dmg },
      pierce: 0,
      life: p.range_u / p.speed_u_s,
      color: '#B6DDD0',
      hit: new Set(),
    });
    return;
  }
}

// Strahl/Umläufer zerstören feindliche Projektile (E024/E028).
export function destroyProjectilesWithGuards(world) {
  for (const w of world.run.weapons) {
    if (!w) continue;
    const e = effectFor(w.weaponId);
    if (!e) continue;
    if (e.id === 'E024' && w.fx.beamDestroysLeft > 0 && world.time < w.activeUntil) {
      const spec = D.weaponsById.get(w.weaponId);
      const range = spec.range * (1 + world.heroStats.rangeBonus);
      for (const proj of world.enemyProjectiles) {
        if (proj.dead || w.fx.beamDestroysLeft <= 0) continue;
        if (circleInLine(proj.x, proj.y, 0, w.originX, w.originY, w.dirRad, range, spec.geometry.width)) {
          proj.dead = true;
          w.fx.beamDestroysLeft -= 1;
        }
      }
    }
    if (e.id === 'E028' && w.fx.orbitDestroysLeft > 0) {
      for (const o of world.orbitals) {
        if (o.fromBoss || o.f?.w !== w) continue;
        for (const proj of world.enemyProjectiles) {
          if (proj.dead || w.fx.orbitDestroysLeft <= 0) continue;
          if (dist(proj.x, proj.y, o.x, o.y) <= e.parameters.collision_radius_u) {
            proj.dead = true;
            w.fx.orbitDestroysLeft -= 1;
          }
        }
      }
    }
  }
}

// Umlauf beendet (E031 Unruh-Takt).
export function onOrbitCompleted(world, w) {
  const e = effectFor(w.weaponId);
  if (!e || e.id !== 'E031') return;
  const p = e.parameters;
  if (world.time < w.fx.internalCooldownUntil) return;
  w.fx.internalCooldownUntil = world.time + p.internal_cooldown_s;
  world.tempoBuffUntil = Math.max(world.tempoBuffUntil || 0, world.time + p.duration_s);
}

export function tempoBuffBonus(world) {
  return (world.tempoBuffUntil || 0) > world.time ? 0.15 : 0;
}

// ---- Sekundärschaden (keine Krits, keine weiteren Auslöser) ----

export function dealSecondaryDamage(world, w, tgt, rawAmount) {
  if (tgt.hp <= 0 || rawAmount <= 0) return 0;
  return world.applyHeroDamage(tgt, rawAmount, { source: 'secondary', fromX: world.hero.x, fromY: world.hero.y });
}

// ---- Verschiebung (Schieben/Ziehen); stoppt an echten Kollisionen ----

function displace(world, tgt, dx, dy, distance) {
  if (isBoss(tgt)) return;
  const len = Math.hypot(dx, dy) || 1;
  const nx = tgt.x + (dx / len) * distance;
  const ny = tgt.y + (dy / len) * distance;
  [tgt.x, tgt.y] = resolveMove(tgt.x, tgt.y, tgt.radius, nx, ny, world.arena, 'blocks_enemies');
}

function enemiesAll(world) {
  const list = world.monsters.filter((m) => !m.dead);
  if (world.boss && !world.boss.dead) list.push(world.boss);
  return list;
}

function nearestOthers(world, tgt, radius, count) {
  return enemiesAll(world)
    .filter((o) => o !== tgt && dist(o.x, o.y, tgt.x, tgt.y) <= radius)
    .sort((a, b) => dist(a.x, a.y, tgt.x, tgt.y) - dist(b.x, b.y, tgt.x, tgt.y))
    .slice(0, count);
}

// E021: Übertragung über bestehende Verbindungen (älteste zuerst).
export function transferLinks(world, hitWeapon, tgt, actualLoss) {
  if (actualLoss <= 0) return;
  const links = [];
  for (const w of world.run.weapons) {
    if (!w || !w.fx || !w.fx.linkPair) continue;
    const L = w.fx.linkPair;
    if (L.until < world.time) { w.fx.linkPair = null; continue; }
    if (dist(L.a.x, L.a.y, L.b.x, L.b.y) > 240 || L.a.hp <= 0 && L.b.hp <= 0) { w.fx.linkPair = null; continue; }
    if ((L.a === tgt || L.b === tgt) && world.time >= L.nextAllowedAt && world.time > L.createdAt) {
      links.push({ w, L });
    }
  }
  links.sort((x, y) => x.L.createdAt - y.L.createdAt);
  const first = links[0];
  if (!first) return;
  const other = first.L.a === tgt ? first.L.b : first.L.a;
  if (!other || other.hp <= 0) return;
  first.L.nextAllowedAt = world.time + 0.5;
  dealSecondaryDamage(world, first.w, other, Math.min(actualLoss * first.L.fraction, first.L.maxTransfer));
  if (tgt.hp <= 0) first.w.fx.linkPair = null;
}

// ---- Laufende Verarbeitung (Ticks, Marken, Minen, Felder, Echos, Ketten) ----

export function updateEffects(world, dt) {
  const now = world.time;

  // Felder (Slow/Schwäche) wirken über Anwesenheit; Quellen nicht addieren.
  for (const tgt of enemiesAll(world)) {
    const s = tgt.status;
    if (s) {
      s.slows = s.slows.filter((x) => x.until > now);
      s.weaknesses = s.weaknesses.filter((x) => x.until > now);
      s.brittles = s.brittles.filter((x) => x.until > now);
      if (s.bookmark && s.bookmark.until <= now) s.bookmark = null;
    }
    for (const holder of world.heroFields) {
      for (const f of holder.fields) {
        if (f.until <= now) continue;
        if (dist(tgt.x, tgt.y, f.x, f.y) <= f.r) {
          const st = ensureTargetStatus(tgt);
          const amount = isBoss(tgt) ? f.amount / 2 : f.amount;
          const entry = { amount, until: now + 0.1, source: 'field' + f.instanceId };
          if (f.kind === 'slow') st.slows.push(entry);
          else st.weaknesses.push(entry);
        }
      }
    }
  }
  for (const holder of world.heroFields) {
    holder.fields = holder.fields.filter((f) => f.until > now);
  }
  world.heroFields = world.heroFields.filter((h) => h.fields.length > 0);

  // DoT-Ticks und Zeitmarken
  for (const tgt of enemiesAll(world)) {
    const s = tgt.status;
    if (!s) continue;
    for (const kind of ['burn', 'rend']) {
      const dot = s[kind];
      if (!dot) continue;
      while (dot.nextTickAt <= now && dot.nextTickAt <= dot.expiresAt && tgt.hp > 0) {
        world.applyHeroDamage(tgt, dot.tickBase, { source: 'dot' });
        dot.nextTickAt += 0.5;
      }
      if (dot.nextTickAt > dot.expiresAt || tgt.hp <= 0) s[kind] = null;
    }
    for (const [iid, mark] of [...s.timeMarks]) {
      if (tgt.hp <= 0) { s.timeMarks.delete(iid); continue; }
      if (mark.at <= now) {
        s.timeMarks.delete(iid);
        world.applyHeroDamage(tgt, mark.damage, { source: 'secondary' });
      }
    }
  }

  // Minen (E026)
  for (const m of world.mines) {
    if (m.dead) continue;
    if (m.until <= now) { m.dead = true; continue; }
    if (now < m.armedAt) continue;
    for (const tgt of enemiesAll(world)) {
      if (tgt.hp <= 0) continue;
      if (dist(tgt.x, tgt.y, m.x, m.y) <= m.r) {
        explodeMine(world, m, tgt);
        break;
      }
    }
    if (!m.dead && m.until <= now) explodeMine(world, m, null);
  }
  world.mines = world.mines.filter((m) => !m.dead);

  // Verzögerte Ringe (E027)
  const rings = [];
  for (const ring of world.delayedRings) {
    if (ring.at > now) { rings.push(ring); continue; }
    for (const tgt of enemiesAll(world)) {
      if (tgt.hp <= 0 || ring.hit.has(tgt)) continue;
      const d0 = dist(tgt.x, tgt.y, ring.x, ring.y);
      if (d0 > ring.inner && d0 <= ring.outer) {
        ring.hit.add(tgt);
        dealSecondaryDamage(world, ring.weapon, tgt, ring.D * ring.factor);
      }
    }
    world.fx.push({ x: ring.x, y: ring.y, vx: 0, vy: 0, t: 0.3, color: '#B6DDD0', ring: ring.outer });
  }
  world.delayedRings = rings;

  // Echos (E010 Strahl-Kopie, E040 zweite Salve)
  const echoes = [];
  for (const echo of world.echoes) {
    if (echo.at > now) { echoes.push(echo); continue; }
    fireEcho(world, echo);
  }
  world.echoes = echoes;

  // Kettenprojektile (E003)
  for (const c of world.chainShots) {
    const step = c.speed * dt;
    const dx = c.fixedX - c.x;
    const dy = c.fixedY - c.y;
    const d0 = Math.hypot(dx, dy);
    if (d0 <= step) { c.x = c.fixedX; c.y = c.fixedY; } else { c.x += dx / d0 * step; c.y += dy / d0 * step; }
    // Kontakt mit beliebigem neuen gültigen Gegner unterwegs
    let hit = null;
    for (const o of enemiesAll(world)) {
      if (o.hp <= 0 || c.already.has(o)) continue;
      if (dist(o.x, o.y, c.x, c.y) <= o.radius + 7) { hit = o; break; }
    }
    if (!hit && c.x === c.fixedX && c.y === c.fixedY) {
      if (c.target.hp > 0 && dist(c.target.x, c.target.y, c.x, c.y) <= c.target.radius + 7) hit = c.target;
      else { c.dead = true; continue; }
    }
    if (hit) {
      c.dead = true;
      c.already.add(hit);
      dealSecondaryDamage(world, c.weapon, hit, c.damage);
      const e = effectFor(c.weapon.weaponId);
      const nextHop = c.hop + 1;
      if (nextHop < e.parameters.additional_targets) {
        let best = null;
        let bestD = Infinity;
        for (const o of enemiesAll(world)) {
          if (o.hp <= 0 || c.already.has(o)) continue;
          const dd = dist(o.x, o.y, c.x, c.y);
          if (dd <= e.parameters.search_radius_u && dd < bestD) { bestD = dd; best = o; }
        }
        if (best) {
          world.chainShots.push({
            x: c.x, y: c.y, target: best, fixedX: best.x, fixedY: best.y,
            speed: c.speed, weapon: c.weapon, D: c.D,
            damage: c.D * e.parameters.damage_D[nextHop],
            hop: nextHop, already: c.already,
          });
        }
      }
    }
  }
  world.chainShots = world.chainShots.filter((c) => !c.dead);

  destroyProjectilesWithGuards(world);
}

function explodeMine(world, m, firstTarget) {
  m.dead = true;
  world.fx.push({ x: m.x, y: m.y, vx: 0, vy: 0, t: 0.3, color: '#F1E3C8', ring: m.r });
  const e = effectFor(m.weapon.weaponId);
  for (const tgt of enemiesAll(world)) {
    if (tgt.hp <= 0) continue;
    if (dist(tgt.x, tgt.y, m.x, m.y) > m.r) continue;
    // Gemeinsame Grenze: je Ziel höchstens ein Scherben-Zusatztreffer pro Aktivierung.
    m.weapon.fx.activationHit = m.weapon.fx.activationHit || new Set();
    const key = m.activationId + ':' + targetKey(tgt);
    if (m.weapon.fx.activationHit.has(key)) continue;
    m.weapon.fx.activationHit.add(key);
    dealSecondaryDamage(world, m.weapon, tgt, m.damage);
  }
}

function fireEcho(world, echo) {
  const w = echo.weapon;
  const e = echo.effect;
  const p = e.parameters;
  const spec = D.weaponsById.get(w.weaponId);
  const frozen = w.lastFire;
  if (!frozen) return;
  if (e.id === 'E010') {
    // Kopie des Strahl-Rechtecks: prüft zu ihrem Zeitpunkt alle lebenden Gegner.
    for (const tgt of enemiesAll(world)) {
      if (tgt.hp <= 0) continue;
      if (circleInLine(tgt.x, tgt.y, tgt.radius, frozen.x, frozen.y, frozen.dirRad, frozen.range, spec.geometry.width)) {
        dealSecondaryDamage(world, w, tgt, frozen.D * p.echo_D);
      }
    }
    world.fx.push({ x: frozen.x + Math.cos(frozen.dirRad) * frozen.range / 2, y: frozen.y + Math.sin(frozen.dirRad) * frozen.range / 2, vx: 0, vy: 0, t: 0.25, color: '#B6DDD0' });
  } else if (e.id === 'E040') {
    const echoHit = new Set();
    for (const off of p.offsets_deg) {
      const dir = frozen.dirRad + off * Math.PI / 180;
      world.heroProjectiles.push({
        x: frozen.x, y: frozen.y,
        vx: Math.cos(dir) * p.speed_u_s,
        vy: Math.sin(dir) * p.speed_u_s,
        radius: 7,
        echoOf: { weapon: w, damage: frozen.D * p.echo_D, sharedHit: echoHit },
        pierce: 0,
        life: frozen.range / p.speed_u_s,
        color: spec.effect_color,
        hit: echoHit, // geteilte Trefferliste je Echo-Salve
      });
    }
  }
}

// Wellenende/Lebenszyklus: alles schadlos entfernen, Zähler zurücksetzen.
export function clearAllEffects(world) {
  world.mines = [];
  world.echoes = [];
  world.chainShots = [];
  world.delayedRings = [];
  world.heroFields = [];
  world.tempoBuffUntil = 0;
  for (const tgt of [...world.monsters, world.boss].filter(Boolean)) {
    tgt.status = null;
  }
  for (const w of world.run.weapons) {
    if (w) resetInstanceState(w);
  }
}
