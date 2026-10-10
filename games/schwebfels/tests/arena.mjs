// Arena: angezeigte Siegchance gegen die echte (viele Probekaempfe), je Klasse und Stufe.
// Aufruf: node tests/arena.mjs [stufen, z. B. 10,20,30,40] [proben fuer die echte Chance, Standard 1000]
import { loadGame } from "./load.mjs";
const SB = loadGame();
const E = SB.engine, D = SB.data;
const Ls = (process.argv[2] || "10,20,30,40").split(",").map(Number);
const N = Number(process.argv[3] || 1000);
const tiers = {};
let maxErr = 0, sumErr = 0, cnt = 0, ms = 0, est = 0;
for (const L of Ls) {
  for (const cls of Object.keys(D.CLASSES)) {
    let now = 1_700_000_000_000 + L * 1e6;
    E.now = () => now;
    const race = Object.keys(D.RACES).find((x) => D.RACES[x].realm === D.CLASSES[cls].realm);
    const S = E.newHero({ name: "Probe" + cls + L, race, gender: "m", cls, look: {} });
    S.level = L;
    const rr = SB.util.rng(cls + L);
    for (const sl of D.SLOTS) S.equip[sl] = E.makeItem(rr, { level: L, cls, slot: sl, rarity: "selten" });
    if (E.autoTalents) S.talents = E.autoTalents(cls, L, cls + L);
    const t0 = Date.now();
    const rivals = E.arenaRivals(S, now);
    ms += Date.now() - t0;
    const hero = E.heroFighter(S, now);
    for (const r of rivals) {
      const f = E.rivalFighter(r);
      const t1 = Date.now();
      const shown = E.arenaChance ? E.arenaChance(hero, f, r) : E.estimateWin(hero, [f], 30, "arena" + r.id + r.level);
      est += Date.now() - t1;
      const real = E.estimateWin(hero, [f], N, "echt" + r.id);
      const label = E.arenaTier ? E.arenaTier(shown).label : shown >= 0.68 ? "Leicht" : shown >= 0.42 ? "Ebenbürtig" : "Schwer";
      (tiers[label] = tiers[label] || []).push(real);
      const err = Math.abs(shown - real);
      maxErr = Math.max(maxErr, err); sumErr += err; cnt++;
    }
  }
}
const pct = (x) => Math.round(x * 100) + " %";
for (const k of Object.keys(tiers)) {
  const a = tiers[k].sort((x, y) => x - y);
  console.log(k.padEnd(11), "Anzahl", String(a.length).padStart(3), "echte Siegchance: Mittel", pct(a.reduce((s, x) => s + x, 0) / a.length), "niedrigste", pct(a[0]), "zehntniedrigste", pct(a[Math.min(9, a.length - 1)]));
}
console.log("Abweichung angezeigt zu echt: Mittel", pct(sumErr / cnt), "groesste", pct(maxErr));
console.log("Zeit: Gegnerwahl", Math.round(ms / (Ls.length * Object.keys(D.CLASSES).length)), "ms je Auswahl, Anzeige", Math.round(est / cnt), "ms je Gegner");
