// Heldenwerte: Basiswerte aus design.json, Boni aus Levelaufstiegen (U...),
// Relikten (R...) und Werkstatt (P...). Stapelregeln und globale Deckel aus
// systeme/boni-und-laden.json: erst alle Boni summieren, dann Grenzen anwenden;
// Bruchanteile desselben Werts addieren und einmal auf den Basiswert anwenden.

import { D } from '../data.js';

export function computeHeroStats(runState, workshopRanks) {
  const base = D.design.hero.combat;
  const caps = D.boni.global_caps;
  const sb = D.boni.stats;

  const flat = {};
  const frac = {};
  const add = (stat, amount, operation) => {
    if (operation === 'add_fraction') frac[stat] = (frac[stat] || 0) + amount;
    else flat[stat] = (flat[stat] || 0) + amount;
  };

  for (const [uid, count] of Object.entries(runState.upgrades)) {
    const u = D.upgradesById.get(uid);
    for (let i = 0; i < count; i++) add(u.stat, u.amount, u.operation);
  }
  for (const [rid, count] of Object.entries(runState.relics)) {
    const r = D.relicsById.get(rid);
    for (let i = 0; i < count; i++) add(r.stat, r.amount, r.operation);
  }

  const p1 = workshopRanks.P01 || 0; // +5 Startleben pro Rang
  const p2 = workshopRanks.P02 || 0; // +5 Bewegung pro Rang

  const maxHp = base.hp + p1 * 5 + (flat.max_hp || 0);
  let moveSpeed = base.move_speed + p2 * 5 + (flat.move_speed || 0);
  moveSpeed = Math.min(caps.move_speed, moveSpeed);

  let armor = sb.base_armor + (flat.armor || 0);
  armor = Math.min(caps.armor, armor);

  let critChance = sb.base_crit_chance + (frac.crit_chance || 0);
  critChance = Math.min(caps.crit_chance, critChance);

  let pickupRadius = sb.base_pickup_radius * (1 + (frac.pickup_radius || 0));
  pickupRadius = Math.min(caps.pickup_radius, pickupRadius);

  let dodgeCooldown = base.dodge.cooldown + (flat.dodge_cooldown || 0);
  dodgeCooldown = Math.max(caps.dodge_cooldown_min, dodgeCooldown);

  // Glück (Ergänzung v0.4.1): Summe aller Punkte, dann auf 0..100 kappen.
  const luckRaw = (sb.base_luck || 0) + (flat.luck || 0);
  const luck = Math.max(0, Math.min(caps.luck ?? 100, luckRaw));

  return {
    maxHp,
    moveSpeed,
    armor,
    critChance,
    pickupRadius,
    dodgeCooldown,
    damageBonus: frac.damage || 0,
    attackSpeedBonus: frac.attack_speed || 0,
    rangeBonus: frac.weapon_range || 0,
    waveHeal: flat.wave_heal || 0,
    waxBonus: frac.wax_bonus || 0,
    xpBonus: frac.xp_bonus || 0,
    luck,
    luckRaw,
    dodge: base.dodge,
    collisionRadius: D.design.units.hero_collision_radius,
  };
}

// Stapelgrenze: wie oft darf ein Upgrade/Relikt noch genommen werden?
export function stacksLeft(entry, owned) {
  return Math.max(0, entry.max_stacks - (owned || 0));
}
