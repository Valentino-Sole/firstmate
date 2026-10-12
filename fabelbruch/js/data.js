// Lädt die verbindlichen Fachdateien des Designpakets und baut Indizes.
// Die JSON-Dateien unter data/ sind unverändert aus FABELBRUCH v0.4 übernommen;
// jede Fachdatei bleibt die einzige Quelle der Wahrheit für ihr Gebiet.

export const D = {
  design: null,
  arenen: null,
  waffen: null,
  boni: null,
  ablauf: null,
  uispec: null,
  effekte: null,
  statusregister: null,
  effektregeln: null,
  monstersById: new Map(),
  bossesById: new Map(),
  weaponsById: new Map(),
  relicsById: new Map(),
  upgradesById: new Map(),
  arenasById: new Map(),
  runsByArena: new Map(),
  familiesById: new Map(),
  workshopById: new Map(),
};

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

export async function loadData(onProgress) {
  const files = [
    ['design', 'data/design.json'],
    ['arenen', 'data/arenen.json'],
    ['waffen', 'data/waffen.json'],
    ['boni', 'data/boni-und-laden.json'],
    ['ablauf', 'data/spielablauf.json'],
    ['uispec', 'data/ui-spezifikation.json'],
    ['effekte', 'data/waffeneffekte.json'],
    ['statusregister', 'data/statusregister.json'],
    ['effektregeln', 'data/gemeinsame-regeln.json'],
  ];
  let done = 0;
  for (const [key, path] of files) {
    D[key] = await fetchJson(path);
    done += 1;
    if (onProgress) onProgress(done, files.length, path);
  }

  for (const m of D.design.monsters) D.monstersById.set(m.id, m);
  for (const b of D.design.bosses) D.bossesById.set(b.id, b);
  for (const w of D.waffen.weapons) D.weaponsById.set(w.id, w);
  for (const r of D.boni.relics) D.relicsById.set(r.id, r);
  for (const u of D.boni.upgrades) D.upgradesById.set(u.id, u);
  for (const f of D.design.families) D.familiesById.set(f.id, f);
  for (const a of D.arenen.arenas) D.arenasById.set(a.id, a);
  for (const r of D.ablauf.runs) D.runsByArena.set(r.arena_id, r);
  for (const p of D.ablauf.workshop) D.workshopById.set(p.id, p);

  validate();
  return D;
}

// Grundprüfung gegen die Zusagen des Prüfberichts; bricht laut bei Widerspruch.
function validate() {
  const problems = [];
  if (D.design.monsters.length !== 100) problems.push(`Monster: ${D.design.monsters.length} statt 100`);
  if (D.design.bosses.length !== 10) problems.push(`Bosse: ${D.design.bosses.length} statt 10`);
  if (D.waffen.weapons.length !== 40) problems.push(`Waffen: ${D.waffen.weapons.length} statt 40`);
  // Ergänzung v0.4.1 (Glück): 26 Relikte und 13 Levelboni ersetzen 24/12.
  if (D.boni.relics.length !== 26) problems.push(`Relikte: ${D.boni.relics.length} statt 26`);
  if (D.boni.upgrades.length !== 13) problems.push(`Levelboni: ${D.boni.upgrades.length} statt 13`);
  if (D.arenen.arenas.length !== 10) problems.push(`Arenen: ${D.arenen.arenas.length} statt 10`);
  for (const a of D.arenen.arenas) {
    const run = D.runsByArena.get(a.id);
    if (!run) { problems.push(`Kein Lauf für ${a.id}`); continue; }
    if (run.waves.length !== 20) problems.push(`${a.id}: ${run.waves.length} Wellen statt 20`);
    const bossWave = run.waves[19];
    if (bossWave.boss_id !== a.boss_id) problems.push(`${a.id}: Welle 20 Boss ${bossWave.boss_id} statt ${a.boss_id}`);
    for (const w of run.waves) {
      for (const mid of w.monster_pool) {
        if (!D.monstersById.has(mid)) problems.push(`${a.id} Welle ${w.wave}: unbekanntes Monster ${mid}`);
      }
    }
    if (!D.weaponsById.has(run.boss_reward_weapon_id)) problems.push(`${a.id}: unbekannte Belohnungswaffe`);
  }
  for (const m of D.design.monsters) {
    const at = m.attack;
    if (at.windup_seconds <= 0 || at.active_seconds <= 0) problems.push(`${m.id}: unplausible Angriffszeiten`);
    if (at.spawn_monster_id && !D.monstersById.has(at.spawn_monster_id)) problems.push(`${m.id}: unbekannte Beschwörung ${at.spawn_monster_id}`);
  }
  // Ergänzung v0.4.2: 40 Fähigkeiten, je Waffe genau eine (ability_id).
  if (D.effekte.effects.length !== 40) problems.push(`Effekte: ${D.effekte.effects.length} statt 40`);
  const effByWeapon = new Map(D.effekte.effects.map((e) => [e.weapon_id, e]));
  for (const w of D.waffen.weapons) {
    const e = effByWeapon.get(w.id);
    if (!e) problems.push(`${w.id}: keine Fähigkeit zugeordnet`);
    else if (w.ability_id && w.ability_id !== e.id) problems.push(`${w.id}: ability_id ${w.ability_id} != ${e.id}`);
    for (const sid of (w.secondary_status || [])) {
      if (!D.statusregister[sid]) problems.push(`${w.id}: unbekannter Status ${sid}`);
    }
  }
  if (problems.length) {
    throw new Error('Datenprüfung fehlgeschlagen:\n' + problems.join('\n'));
  }
}

// Arenavergrößerung (Kapitänsanweisung 2026-10-12): Gestaltung unverändert,
// aber mehr Lauf- und Ausweichraum. Alle Layoutmaße einer Arena werden
// einheitlich skaliert; Figuren, Reichweiten und Tempi bleiben in
// Originaleinheiten. Die Kamera folgt Knorz (siehe docs/abweichungen.md).
export const ARENA_SCALE = 1.75;
export const VIEW_W = 1600;
export const VIEW_H = 900;

export function scaledArena(arenaId) {
  const a = D.arenasById.get(arenaId);
  const s = ARENA_SCALE;
  return {
    ...a,
    reference_size: [a.reference_size[0] * s, a.reference_size[1] * s],
    playable_rect: a.playable_rect.map((v) => v * s),
    hero_spawn: a.hero_spawn.map((v) => v * s),
    boss_spawn: a.boss_spawn.map((v) => v * s),
    obstacles: a.obstacles.map((o) => ({
      ...o,
      center: [o.center[0] * s, o.center[1] * s],
      radius: o.radius * s,
      height_px: o.height_px * s,
    })),
    hazard: {
      ...a.hazard,
      zones: a.hazard.zones.map((z) => z.map((v) => v * s)),
    },
  };
}

export function scaledSpawnPoints() {
  return D.ablauf.spawn_rule.edge_points.map(([x, y]) => [x * ARENA_SCALE, y * ARENA_SCALE]);
}

// Abgeleitete Hilfen (reine Lesezugriffe auf die Fachdaten).

export function weaponTierDamage(weapon, tier, damageBonus) {
  const mult = D.waffen.rules.damage_multiplier_per_tier[tier - 1];
  return Math.ceil(weapon.base_damage * mult * (1 + damageBonus));
}

// D-Snapshot der Effektregeln: ungerundet, ohne Krit/Brüchig.
export function weaponDamageRaw(weapon, tier, damageBonus) {
  const mult = D.waffen.rules.damage_multiplier_per_tier[tier - 1];
  return weapon.base_damage * mult * (1 + damageBonus);
}

export function weaponTierPrice(weapon, tier) {
  const mult = D.waffen.rules.price_multiplier_per_tier[tier - 1];
  return Math.ceil(weapon.price * mult);
}

export function weaponSellValue(weapon, tier) {
  // Verkauf: 50 % des aktuellen Kaufpreises, abgerundet (Ladenregel).
  return Math.floor(weaponTierPrice(weapon, tier) * 0.5);
}

export function xpToNextLevel(level) {
  return 10 + 5 * (level - 1);
}

export function armorReduce(raw, armor) {
  if (raw <= 0) return 0;
  return Math.max(1, Math.ceil(raw * 100 / (100 + 5 * armor)));
}

// Seltenheit einer Waffe: Stufe, in der sie im Laden erscheint, wird aus den
// Wellen-Gewichten gezogen; die Waffe selbst hat keine feste Stufe im Datensatz.
export function shopRarityWeights(wave) {
  const w = D.boni.shop.rarity_weights_by_wave;
  if (wave <= 5) return w['1-5'];
  if (wave <= 10) return w['6-10'];
  if (wave <= 15) return w['11-15'];
  return w['16-19'];
}
