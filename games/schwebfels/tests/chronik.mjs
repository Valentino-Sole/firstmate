// Chronik-Kapitel ab Stufe 31: Siegquote des Modellhelden mit Talenten je Kapitel und Klasse.
// Aufruf: node tests/chronik.mjs [ausruestung q, z. B. 1.1] [ab stufe, z. B. 31]
import { loadGame } from "./load.mjs";
const SB = loadGame();
const E = SB.engine, D = SB.data;
const q = Number(process.argv[2] || 1.1);
const from = Number(process.argv[3] || 31);
const rows = [];
for (const cls of Object.keys(D.CLASSES)) {
  const realm = D.CLASSES[cls].realm;
  const S = { realm, cls, story: { done: {} }, level: 50 };
  for (const ch of E.storyChapters(S)) {
    if (ch.lv < from) continue;
    let wins = 0, hp = 0;
    const N = 24;
    for (let k = 0; k < N; k++) {
      const h0 = E.modelHeroFighter(ch.lv, cls, q);
      const h = E.applyTalents(h0, E.talentEffects(cls, E.autoTalents(cls, ch.lv, cls + k), ch.lv));
      const foes = E.storyFoes(S, ch, h);
      const r = E.simulateChain(h, foes, "chr" + cls + ch.key + k);
      if (r.winner === 0) {
        wins++;
        hp += r.hpLeft / h.maxHp;
      }
    }
    rows.push({ cls, key: ch.key, lv: ch.lv, t: ch.t, win: wins / N, hp: wins ? hp / wins : 0 });
  }
}
for (const r of rows) console.log((r.cls + " " + r.key).padEnd(22), String(r.lv).padStart(3), (Math.round(r.win * 100) + "%").padStart(5), (Math.round(r.hp * 100) + "%").padStart(5), r.t);
const avg = rows.reduce((a, r) => a + r.win, 0) / rows.length;
console.log("Mittel " + Math.round(avg * 100) + " %, schwerstes " + Math.round(Math.min(...rows.map((r) => r.win)) * 100) + " %");
