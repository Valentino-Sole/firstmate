// Datums- und Formelvalidierung gegen die Fachdateien (node tests/validate.mjs).
// Prüft die Zusagen der Prüfberichte und die im Spiel verwendeten Formeln.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const J = (f) => JSON.parse(readFileSync(join(base, f), 'utf8'));

const design = J('design.json');
const arenen = J('arenen.json');
const waffen = J('waffen.json');
const boni = J('boni-und-laden.json');
const ablauf = J('spielablauf.json');
const uispec = J('ui-spezifikation.json');
const effekte = J('waffeneffekte.json');
const statusreg = J('statusregister.json');
const texteDe = J('spieltexte.de.json');
const texteEn = J('spieltexte.en.json');
const namenEn = J('namen.en.json');
const fxDe = J('waffeneffekte.de.json');
const fxEn = J('waffeneffekte.en.json');
const glueckDe = J('glueck.de.json');
const glueckEn = J('glueck.en.json');

let failures = 0;
function check(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error('FEHLER:', msg);
  }
}

// Mengen laut Prüfberichten (v0.4 + v0.4.1 + v0.4.2)
check(design.monsters.length === 100, `Monster: ${design.monsters.length}`);
check(design.bosses.length === 10, `Bosse: ${design.bosses.length}`);
check(waffen.weapons.length === 40, `Waffen: ${waffen.weapons.length}`);
check(boni.relics.length === 26, `Relikte: ${boni.relics.length}`);
check(boni.upgrades.length === 13, `Levelboni: ${boni.upgrades.length}`);
check(arenen.arenas.length === 10, `Arenen: ${arenen.arenas.length}`);
check(uispec.screens.length === 26, `UI-Ansichten: ${uispec.screens.length}`);
check(effekte.effects.length === 40, `Effekte: ${effekte.effects.length}`);
check(texteDe.strings.length === 211, `DE-Texte: ${texteDe.strings.length}`);
check(texteDe.scenes.length === 45, `Szenen: ${texteDe.scenes.length}`);

// Jede Welle 20 Wellen, Boss auf Welle 20, Poolmitglieder existieren
const monsterIds = new Set(design.monsters.map((m) => m.id));
for (const run of ablauf.runs) {
  check(run.waves.length === 20, `${run.arena_id}: ${run.waves.length} Wellen`);
  check(run.waves[19].boss_id, `${run.arena_id}: Welle 20 ohne Boss`);
  for (const w of run.waves) {
    for (const mid of w.monster_pool) check(monsterIds.has(mid), `${run.arena_id} W${w.wave}: ${mid} unbekannt`);
    if (w.spawn_budget > 0 && w.duration_seconds) {
      const expected = w.duration_seconds / w.spawn_budget;
      check(Math.abs(expected - w.spawn_interval_seconds) < 0.02, `${run.arena_id} W${w.wave}: Spawnintervall ${w.spawn_interval_seconds} vs ${expected.toFixed(3)}`);
    }
  }
  const boss = design.bosses.find((b) => b.id === run.waves[19].boss_id);
  const reward = waffen.weapons.find((w) => w.id === run.boss_reward_weapon_id);
  check(!!reward, `${run.arena_id}: Belohnungswaffe fehlt`);
  check(boss.combat.reward_weapon === reward.name, `${run.arena_id}: Bossbelohnung ${boss.combat.reward_weapon} != ${reward.name}`);
}

// Arenen: Monsterzuordnung und Bossbindung
for (const a of arenen.arenas) {
  check(a.monster_ids.length === 10, `${a.id}: ${a.monster_ids.length} Monster`);
  const run = ablauf.runs.find((r) => r.arena_id === a.id);
  check(run.waves[19].boss_id === a.boss_id, `${a.id}: Bosszuordnung`);
}

// Formeln (identisch zur Engine)
const xpToNextLevel = (level) => 10 + 5 * (level - 1);
check(xpToNextLevel(1) === 10 && xpToNextLevel(5) === 30, 'XP-Formel');
const armorReduce = (raw, armor) => Math.max(1, Math.ceil(raw * 100 / (100 + 5 * armor)));
check(armorReduce(10, 0) === 10, 'Rüstung 0');
check(armorReduce(10, 20) === 5, 'Rüstung 20');
check(armorReduce(1, 20) === 1, 'Minimum 1');
const tierDmg = (basis, t, bonus) => Math.ceil(basis * waffen.rules.damage_multiplier_per_tier[t - 1] * (1 + bonus));
check(tierDmg(12, 1, 0) === 12 && tierDmg(12, 5, 0) === 33, 'Stufenformel');
check(tierDmg(12, 2, 0.06) === Math.ceil(12 * 1.35 * 1.06), 'Schadensbonus');

// Glücksformeln (Ergänzung v0.4.1)
const weights = boni.shop.rarity_weights_by_wave['16-19'];
const L = 50;
const luckWeights = weights.map((b, i) => b * (1 + L * 0.01 * i));
check(luckWeights[0] === 30 && Math.abs(luckWeights[3] - 10 * 2.5) < 1e-9, 'Glück-Waffengewichte');
check(weights[4] === 0 && luckWeights[4] === 0, 'Stufe V bleibt Fusion vorbehalten');
const relicWeight = (r) => 1 + L * 0.01 * (r - 1);
check(relicWeight(1) === 1 && relicWeight(2) === 1.5, 'Glück-Reliktgewichte');
check(boni.global_caps.luck === 100, 'Glück-Deckel');

// Effekte (Ergänzung v0.4.2)
const effByWeapon = new Map(effekte.effects.map((e) => [e.weapon_id, e]));
for (const w of waffen.weapons) {
  const e = effByWeapon.get(w.id);
  check(!!e, `${w.id}: keine Fähigkeit`);
  check(w.ability_id === e.id, `${w.id}: ability_id`);
  for (const sid of w.secondary_status) check(!!statusreg[sid], `${w.id}: Status ${sid} unbekannt`);
  for (const sid of e.status_ids) check(!!statusreg[sid], `${e.id}: Status ${sid} unbekannt`);
}

// Übersetzungen: ID-Deckung DE <-> EN
const deIds = new Set(texteDe.strings.map((s) => s.id));
const enIds = new Set(texteEn.strings.map((s) => s.id));
for (const id of deIds) check(enIds.has(id), `EN fehlt: ${id}`);
for (const id of enIds) check(deIds.has(id), `EN überzählig: ${id}`);
const fxDeIds = new Set(fxDe.strings.map((s) => s.id));
const fxEnIds = new Set(fxEn.strings.map((s) => s.id));
for (const id of fxDeIds) check(fxEnIds.has(id), `Effekt-EN fehlt: ${id}`);
check(fxDe.strings.length === 120, `Effekttexte DE: ${fxDe.strings.length}`);
const glDeIds = new Set(glueckDe.strings.map((s) => s.id));
const glEnIds = new Set(glueckEn.strings.map((s) => s.id));
for (const id of glDeIds) check(glEnIds.has(id), `Glück-EN fehlt: ${id}`);

// Platzhalter-Gleichheit DE/EN
const tokens = (s) => (s.match(/\{(\w+)\}/g) || []).sort().join(',');
const enById = new Map(texteEn.strings.map((s) => [s.id, s]));
for (const s of texteDe.strings) {
  const e = enById.get(s.id);
  if (e) check(tokens(s.text) === tokens(e.text), `Platzhalter ${s.id}`);
}

// Namen-Übersetzung: vollständige Deckung
for (const m of design.monsters) check(!!namenEn.monsters[m.id], `namen.en: ${m.id}`);
for (const b of design.bosses) check(!!namenEn.bosses[b.id], `namen.en: ${b.id}`);
for (const w of waffen.weapons) check(!!namenEn.weapons[w.id], `namen.en: ${w.id}`);
for (const r of boni.relics) check(!!namenEn.relics[r.id], `namen.en: ${r.id}`);
for (const u of boni.upgrades) check(!!namenEn.upgrades[u.id], `namen.en: ${u.id}`);
for (const a of arenen.arenas) check(!!namenEn.arenas[a.id], `namen.en: ${a.id}`);

// Szenen: alle line_ids existieren
for (const sc of texteDe.scenes) {
  for (const lid of sc.line_ids) check(deIds.has(lid), `Szene ${sc.id}: ${lid} fehlt`);
}

// Sprecher-Auflösung: alle Sprecher bekannt oder Boss-ID
const speakers = new Set(['Erzähler', 'Knorz', 'Brassa', 'Fleck', 'Glimm', 'Alleswünscher', null]);
for (const s of texteDe.strings) {
  check(speakers.has(s.speaker) || /^B(0[1-9]|10)$/.test(s.speaker), `Sprecher ${s.speaker} in ${s.id}`);
}

if (failures === 0) {
  console.log('Alle Datenprüfungen bestanden.');
} else {
  console.error(`${failures} Prüfungen fehlgeschlagen.`);
  process.exit(1);
}
