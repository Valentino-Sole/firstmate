// Zweisprachigkeit DE/EN.
// Deutsch kommt unverändert aus texte/spieltexte.de.json des Designpakets.
// Englisch ist eine Claude-Übersetzung (spieltexte.en.json, namen.en.json)
// und wartet auf Freigabe; IDs und Platzhalter sind identisch.

import { D } from './data.js';

const state = {
  lang: 'de',
  texts: { de: null, en: null },
  stringsById: { de: new Map(), en: new Map() },
  scenesById: new Map(),
  namesEn: null,
};

export async function loadTexts() {
  const [de, en, namesEn, luckDe, luckEn, fxDe, fxEn] = await Promise.all([
    fetch('data/spieltexte.de.json').then((r) => r.json()),
    fetch('data/spieltexte.en.json').then((r) => r.json()),
    fetch('data/namen.en.json').then((r) => r.json()),
    fetch('data/glueck.de.json').then((r) => r.json()),
    fetch('data/glueck.en.json').then((r) => r.json()),
    fetch('data/waffeneffekte.de.json').then((r) => r.json()),
    fetch('data/waffeneffekte.en.json').then((r) => r.json()),
  ]);
  state.texts.de = de;
  state.texts.en = en;
  state.namesEn = namesEn;
  for (const s of de.strings) state.stringsById.de.set(s.id, s);
  for (const s of en.strings) state.stringsById.en.set(s.id, s);
  // Ergänzung v0.4.1: zusätzliche Glück-Texte, bestehende IDs bleiben.
  for (const s of luckDe.strings) state.stringsById.de.set(s.id, { speaker: null, ...s });
  for (const s of luckEn.strings) state.stringsById.en.set(s.id, { speaker: null, ...s });
  // Ergänzung v0.4.2: Waffenfähigkeitstexte.
  for (const s of fxDe.strings) state.stringsById.de.set(s.id, { speaker: null, ...s });
  for (const s of fxEn.strings) state.stringsById.en.set(s.id, { speaker: null, ...s });
  // Ergänzung v0.4.3: Wachskarten-Zustandstexte.
  const wachs = await fetch('data/wachskarten-texte.json').then((r) => r.json());
  for (const s of wachs.strings_de) state.stringsById.de.set(s.id, { speaker: null, ...s });
  for (const s of wachs.strings_en) state.stringsById.en.set(s.id, { speaker: null, ...s });
  for (const sc of de.scenes) state.scenesById.set(sc.id, sc);
}

export function setLanguage(lang) {
  state.lang = lang === 'en' ? 'en' : 'de';
  document.documentElement.lang = state.lang;
}

export function getLanguage() {
  return state.lang;
}

export function scenes() {
  return state.texts.de.scenes;
}

export function sceneById(id) {
  return state.scenesById.get(id);
}

function resolveSpeaker(speaker) {
  if (!speaker) return null;
  // B01–B10 werden laut Textregeln in Bossnamen aufgelöst.
  if (/^B(0[1-9]|10)$/.test(speaker)) return bossName(speaker);
  if (state.lang === 'en') {
    return (state.namesEn.speakers || {})[speaker] || speaker;
  }
  return speaker;
}

// Haupttextzugriff: t('ui.buy', {price: 32})
export function t(id, params = {}) {
  const entry = state.stringsById[state.lang].get(id) || state.stringsById.de.get(id);
  if (!entry) return `[${id}]`;
  let text = entry.text;
  for (const [k, v] of Object.entries(params)) {
    text = text.split(`{${k}}`).join(String(v));
  }
  return text;
}

export function line(id, params = {}) {
  const entry = state.stringsById[state.lang].get(id) || state.stringsById.de.get(id);
  if (!entry) return { speaker: null, text: `[${id}]` };
  let text = entry.text;
  for (const [k, v] of Object.entries(params)) {
    text = text.split(`{${k}}`).join(String(v));
  }
  return { speaker: resolveSpeaker(entry.speaker), text };
}

// Namenszugriffe: Deutsch direkt aus den Fachdateien, Englisch aus namen.en.json.

export function monsterName(id) {
  const m = D.monstersById.get(id);
  if (!m) return id;
  if (state.lang === 'en') return state.namesEn.monsters[id]?.name || m.name;
  return m.name;
}

export function monsterText(id, field) {
  // field: behavior | telegraph | counterplay | attack
  const m = D.monstersById.get(id);
  if (!m) return '';
  if (state.lang === 'en') {
    const e = state.namesEn.monsters[id];
    if (e && e[field]) return e[field];
  }
  if (field === 'attack') return m.attack.name;
  if (field === 'counterplay') return m.attack.counterplay;
  return m[field] || '';
}

export function bossName(id) {
  const b = D.bossesById.get(id);
  if (!b) return id;
  if (state.lang === 'en') return state.namesEn.bosses[id]?.name || b.name;
  return b.name;
}

export function bossText(id, field) {
  const b = D.bossesById.get(id);
  if (!b) return '';
  if (state.lang === 'en') {
    const e = state.namesEn.bosses[id];
    if (e && e[field]) return e[field];
  }
  return b[field] || '';
}

export function bossPhaseText(id, phaseIndex) {
  const b = D.bossesById.get(id);
  if (!b) return '';
  if (state.lang === 'en') {
    const e = state.namesEn.bosses[id];
    if (e && e.phases && e.phases[phaseIndex]) return e.phases[phaseIndex];
  }
  return b.phases[phaseIndex] || '';
}

export function weaponName(id) {
  const w = D.weaponsById.get(id);
  if (!w) return id;
  if (state.lang === 'en') return state.namesEn.weapons[id]?.name || w.name;
  return w.name;
}

export function weaponVisual(id) {
  const w = D.weaponsById.get(id);
  if (!w) return '';
  if (state.lang === 'en') return state.namesEn.weapons[id]?.visual_attack || w.visual_attack;
  return w.visual_attack;
}

// Waffenfähigkeit (Ergänzung v0.4.2): name | description | role.
export function weaponAbility(weaponId, field) {
  return t(`weapon.${weaponId}.ability.${field}`);
}

export function weaponFamilyName(family) {
  if (state.lang === 'en') return state.namesEn.weapon_families[family] || family;
  return family;
}

export function relicName(id) {
  const r = D.relicsById.get(id);
  if (!r) return id;
  if (state.lang === 'en') return state.namesEn.relics[id] || r.name;
  return r.name;
}

export function relicFlavor(id) {
  const r = D.relicsById.get(id);
  if (!r) return '';
  if (state.lang === 'en') {
    return (state.namesEn.relic_flavor_overrides || {})[id] || state.namesEn.relic_flavor;
  }
  return r.flavor;
}

export function upgradeName(id) {
  const u = D.upgradesById.get(id);
  if (!u) return id;
  if (state.lang === 'en') return state.namesEn.upgrades[id]?.name || u.name;
  return u.name;
}

export function upgradeNote(id) {
  const u = D.upgradesById.get(id);
  if (!u) return '';
  if (state.lang === 'en') return state.namesEn.upgrades[id]?.note || u.note;
  return u.note;
}

export function arenaName(id) {
  const a = D.arenasById.get(id);
  if (!a) return id;
  if (state.lang === 'en') return state.namesEn.arenas[id]?.name || a.name;
  return a.name;
}

export function arenaText(id, field) {
  const a = D.arenasById.get(id);
  if (!a) return '';
  if (state.lang === 'en') {
    const e = state.namesEn.arenas[id];
    if (e) {
      const map = { failed_wish: 'failed_wish', obstacle_name: 'obstacle_name', hazard_name: 'hazard_name', hazard_desc: 'hazard_desc' };
      if (e[map[field]]) return e[map[field]];
    }
  }
  if (field === 'hazard_name') return a.hazard.name;
  if (field === 'hazard_desc') return a.hazard.description;
  return a[field] || '';
}

export function familyName(id) {
  const f = D.familiesById.get(id);
  if (!f) return id;
  if (state.lang === 'en') return state.namesEn.families[id] || f.name;
  return f.name;
}

export function workshopName(id) {
  const p = D.workshopById.get(id);
  if (!p) return id;
  if (state.lang === 'en') return state.namesEn.workshop[id]?.name || p.name;
  return p.name;
}

export function workshopEffect(id) {
  const p = D.workshopById.get(id);
  if (!p) return '';
  if (state.lang === 'en') return state.namesEn.workshop[id]?.effect || p.effect;
  return p.effect;
}

export function statLabel(stat) {
  const e = state.namesEn.stats[stat];
  if (!e) return stat;
  return state.lang === 'en' ? e.en : e.de;
}

// Anzeige eines Bonusbetrags, z. B. "+12 maximales Leben" / "+8 % Angriffstempo".
export function statAmountLabel(stat, amount, operation) {
  const label = statLabel(stat);
  if (operation === 'add_fraction') {
    const pct = Math.round(amount * 1000) / 10;
    const sign = amount >= 0 ? '+' : '−';
    return `${sign}${Math.abs(pct)} % ${label}`;
  }
  const sign = amount >= 0 ? '+' : '−';
  const val = Math.abs(amount);
  if (stat === 'dodge_cooldown') return `${sign}${val} s ${label}`;
  return `${sign}${val} ${label}`;
}

export function heroSubtitle() {
  if (state.lang === 'en') return state.namesEn.hero.H001.subtitle;
  return D.design.hero.subtitle;
}
