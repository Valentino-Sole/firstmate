// Balance der Talentbaeume: jede Klasse mit Schwerpunkt Angriff, Verteidigung oder Klassenpfad gegen alle anderen.
// Aufruf: node tests/talents.mjs [Kaempfe je Paarung]
import { loadGame } from "./load.mjs";
const SB = loadGame();
const E = SB.engine, D = SB.data;
const classes = Object.keys(D.CLASSES);
// Aufbau mit Schwerpunktzweig b: erst b voll, dann die anderen
function build(cls, L, b) {
  const tree = E.talentTree(cls);
  const order = [b, ...[0, 1, 2].filter((x) => x !== b)];
  const ranks = {};
  let pts = E.talentPointsFor(L);
  for (const bi of order) for (const t of tree.branches[bi].talents) while (pts > 0 && E.talentCheck(cls, ranks, t.id, E.talentPointsFor(L)).ok) { ranks[t.id] = (ranks[t.id] || 0) + 1; pts--; }
  return ranks;
}
function fighter(cls, L, b) {
  const f = E.modelHeroFighter(L, cls, 1);
  return b == null ? E.applyTalents(f, {}) : E.applyTalents(f, E.talentEffects(cls, build(cls, L, b), L));
}
const N = +(process.argv[2] || 24);
for (const L of [20, 40]) {
  console.log("Stufe " + L + ": mittlere Siegchance gegen alle Klassen (Gegner mit zufaelligem Schwerpunkt). Spalten: ohne Talente | Angriff | Verteidigung | Klassenpfad");
  const rows = [];
  for (const c of classes) {
    const vals = [];
    for (const b of [null, 0, 1, 2]) {
      let w = 0, n = 0;
      for (const o of classes) {
        if (o === c) continue;
        for (const ob of b == null ? [null] : [0, 1, 2]) {
          const A = fighter(c, L, b), B = fighter(o, L, ob);
          for (let i = 0; i < N; i++) { const r1 = E.simulate(A, B, c + o + i + "x" + b + ob); if (r1.winner === 0) w++; n++; }
        }
      }
      vals.push(Math.round((w / n) * 100));
    }
    rows.push(c.padEnd(16) + vals.map((v) => String(v).padStart(4)).join(" "));
  }
  console.log(rows.join("\n"));
}
