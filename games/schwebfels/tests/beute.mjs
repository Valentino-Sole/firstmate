// Seltenheit der Boss-Beute (Verliese, Verliesbosse in der Taverne, Chronik) je Stufe: Anteile aus 20.000 Wuerfen.
// Aufruf: node tests/beute.mjs [stufen, z. B. 20,30,40,50] [glueck-bonus, Standard 0.2]
import { loadGame } from "./load.mjs";
const SB = loadGame();
const E = SB.engine, D = SB.data, U = SB.util;
const Ls = (process.argv[2] || "20,30,35,40,45,50").split(",").map(Number);
const lb = Number(process.argv[3] || 0.2);
const pct = (x) => String(Math.round(x * 100)).padStart(3) + " %";
console.log("Stufe  Art                   blau    lila  orange");
for (const L of Ls) {
  for (const [name, final, base] of [["Verlies Stockwerk", false, 0.6], ["Verlies Endboss", true, 2], ["Chronik Kapitel", false, 1], ["Taverne Verliesboss", false, 1.7]]) {
    const o = E.bossLoot(L, final, base, lb);
    const r = U.rng("beute" + L + name);
    const n = { selten: 0, episch: 0, legendaer: 0 };
    for (let i = 0; i < 20000; i++) { const k = E.rollRarity(r, o); if (k in n) n[k]++; }
    console.log(String(L).padStart(5), " ", name.padEnd(20), pct(n.selten / 20000), pct(n.episch / 20000), pct(n.legendaer / 20000));
  }
}
