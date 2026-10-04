// Balance-Simulation (Version 2): Klassen im Duell, Modellhelden gegen Auftragsmonster und Bosse.
// Aufruf: node tests/balance.mjs
import { loadGame } from "./load.mjs";

const SB = loadGame();
const E = SB.engine;
const D = SB.data;
const classes = Object.keys(D.CLASSES);
const pct = (x) => String(Math.round(x * 100)).padStart(3) + "%";
function rate(A, B, n, salt) {
  let w = 0;
  for (let i = 0; i < n; i++) if (E.simulate(A, B, salt + i).winner === 0) w++;
  return w / n;
}

console.log("Duelle: mittlere Siegquote jeder Klasse gegen alle anderen (gleiche Stufe, q=1)");
for (const L of [10, 30, 50]) {
  const rows = classes.map((a) => {
    let s = 0;
    let worst = 1;
    let best = 0;
    for (const b of classes) {
      if (a === b) continue;
      const w = rate(E.modelHeroFighter(L, a, 1), E.modelHeroFighter(L, b, 1), 120, a + b + L);
      s += w;
      worst = Math.min(worst, w);
      best = Math.max(best, w);
    }
    return [a, s / (classes.length - 1), worst, best];
  });
  console.log("Stufe " + L + ": " + rows.map(([a, m, lo, hi]) => D.CLASSES[a].name + " " + pct(m) + " (" + Math.round(lo * 100) + "-" + Math.round(hi * 100) + ")").join(" | "));
}

console.log("\nAuftraege: Modellheld gegen Monster (gemuetlich/ordentlich/halsbrecherisch), Stufe 5 / 20 / 40");
for (const c of classes) {
  const row = [5, 20, 40].map((L) => {
    const hero = E.modelHeroFighter(L, c, 1);
    return [1, 2, 3].map((d) => {
      let w = 0;
      const mons = E.monstersFor(L);
      for (const m of mons) w += rate(hero, E.monsterFighter(m, L, E.adaptPower(hero, L, E.DIFF[d].power)), 25, m.id + d);
      return Math.round((w / mons.length) * 100);
    }).join("/");
  });
  console.log(D.CLASSES[c].name.padEnd(16), row.join("   "));
}

console.log("\nDungeon-Endbosse: Modellheld auf Boss-Stufe+3 (q=1) und mit guter Ausruestung (q=1.25)");
for (let d = 0; d < D.DUNGEONS.length; d++) {
  const b = E.bossFor(d, 7);
  const foe = E.monsterFighter(b.mon, b.L, b.power, { boss: true, final: true });
  let w1 = 0;
  let w2 = 0;
  for (const c of classes) {
    w1 += rate(E.modelHeroFighter(b.L + 3, c, 1), foe, 30, "b1" + d + c);
    w2 += rate(E.modelHeroFighter(b.L, c, 1.25), foe, 30, "b2" + d + c);
  }
  console.log(D.DUNGEONS[d].name.padEnd(24), pct(w1 / classes.length), pct(w2 / classes.length));
}
