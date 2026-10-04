// Balance-Simulation: Siegquoten eines Modell-Helden gegen Auftragsmonster, Bosse und andere Klassen.
// Aufruf: node tests/balance.mjs
import { loadGame } from "./load.mjs";

const SB = loadGame();
const E = SB.engine;
const D = SB.data;
const N = 300;
const classes = Object.keys(D.CLASSES);

function rate(A, B, n = N, salt = "") {
  let w = 0;
  let acts = 0;
  for (let i = 0; i < n; i++) {
    const res = E.simulate(A, B, "s" + salt + i);
    if (res.winner === 0) w++;
    acts += res.events.length;
  }
  return { win: w / n, acts: acts / n };
}
const pct = (x) => String(Math.round(x * 100)).padStart(3) + "%";

console.log("Auftraege: Modell-Held (q=1) gegen Monster je Schwierigkeit");
console.log("Stufe | Klasse        | gemuetl. | ordentl. | halsbr. | Aktionen");
for (const L of [1, 2, 4, 6, 10, 15, 20, 30, 40, 55]) {
  for (const c of classes) {
    const hero = E.modelHeroFighter(L, c, L <= 3 ? 0.55 : 1);
    const row = [1, 2, 3].map((d) => {
      const mons = E.monstersFor(L);
      let w = 0;
      let a = 0;
      for (const m of mons) {
        const foe = E.monsterFighter(m, L, E.DIFF[d].power);
        const r = rate(hero, foe, Math.ceil(N / mons.length), m.id + d);
        w += r.win;
        a += r.acts;
      }
      return { win: w / mons.length, acts: a / mons.length };
    });
    console.log(String(L).padStart(5), "|", D.CLASSES[c].name.padEnd(13), "|", row.map((r) => pct(r.win).padStart(8)).join(" | "), "|", row[1].acts.toFixed(1));
  }
}

console.log("\nNeuer Held (Startausruestung) gegen Stufe-1-Monster");
for (const c of classes) {
  const S = E.newHero({ name: "Test" + c, race: "wolkling", gender: "m", cls: c, look: {} });
  const hero = E.heroFighter(S);
  const row = [1, 2, 3].map((d) => {
    let w = 0;
    const mons = E.monstersFor(1);
    for (const m of mons) w += rate(hero, E.monsterFighter(m, 1, E.DIFF[d].power), 60, m.id).win;
    return w / mons.length;
  });
  console.log(D.CLASSES[c].name.padEnd(13), row.map(pct).join(" "), " HP", hero.maxHp, "Waffe", hero.wMin + "-" + hero.wMax);
}

console.log("\nDungeon-Bosse: Modell-Held auf Boss-Stufe / +3 Stufen / gute Ausruestung q=1.25");
for (let d = 0; d < D.DUNGEONS.length; d++) {
  const line = [];
  for (const floor of [0, 3, 7]) {
    const b = E.bossFor(d, floor);
    const foe = E.monsterFighter(b.mon, b.L, b.power, { boss: true, final: b.final });
    let s = "";
    for (const [dl, q] of [[0, 1], [3, 1], [0, 1.25]]) {
      let w = 0;
      for (const c of classes) w += rate(E.modelHeroFighter(b.L + dl, c, q), foe, 100, "b" + d + floor + c).win;
      s += pct(w / classes.length);
    }
    line.push("E" + (floor + 1) + "(Lv" + b.L + "):" + s);
  }
  console.log(D.DUNGEONS[d].name.padEnd(26), line.join("  "));
}

console.log("\nArena: Klasse gegen Klasse (gleiche Stufe, q=1)");
for (const L of [10, 30, 50]) {
  for (const a of classes) {
    const row = classes.map((b) => pct(rate(E.modelHeroFighter(L, a, 1), E.modelHeroFighter(L, b, 1), 200, a + b + L).win));
    console.log("Lv" + L, D.CLASSES[a].name.padEnd(13), row.join(" "));
  }
}

console.log("\nWirtschaft: Gold je Auftrag (15 Tatendrang), Attributkosten");
for (const L of [1, 5, 10, 20, 30, 50]) {
  console.log("Lv" + String(L).padStart(2), "Gold/Auftrag", String(E.goldBase(L)).padStart(5), " XP-Bedarf", String(E.xpNeed(L)).padStart(7), " Auftraege/Stufe", (1 / E.questXpFrac(L)).toFixed(1), " Attr#" + 2 * L + " kostet", E.attrCost(2 * L));
}
