// Tavernenauftraege mit Talenten: Modellheld (Talente nach autoTalents) gegen Einzelgegner, Horden und Verliesbosse, Siegquote und
// uebrige Lebenspunkte je Schwierigkeit. Aufruf: node tests/quests.mjs [stufen, z. B. 10,20,31,40] [ausruestung q, z. B. 1.25]
// Umgebung zum Ausprobieren: TAL=0 (ohne Talente), FOLLOW, D2, D3, HB (Mitziehen, Staerke ordentlich/halsbrecherisch, Hordenanfuehrer)
import { loadGame } from "./load.mjs";
const SB = loadGame();
if (process.env.D2) SB.engine.DIFF[2].power = Number(process.env.D2);
if (process.env.D3) SB.engine.DIFF[3].power = Number(process.env.D3);
if (process.env.HB) SB.engine.HORDE.boss = Number(process.env.HB);
if (process.env.FOLLOW) { const f = Number(process.env.FOLLOW); SB.engine.adaptPower = (hero, L, p) => (hero ? p * (1 - f + f * SB.engine.heroStrength(hero, L)) : p); }
const E = SB.engine, D = SB.data, U = SB.util || SB.U;
const classes = Object.keys(D.CLASSES);
const Ls = (process.argv[2] || "10,20,31,40").split(",").map(Number);
const q = Number(process.argv[3] || 1);
const talents = process.env.TAL !== "0";
function hero(L, c, seed) {
  const f = E.modelHeroFighter(L, c, q);
  if (!talents) return f;
  return E.applyTalents(f, E.talentEffects(c, E.autoTalents(c, L, seed), L));
}
for (const L of Ls) {
  const res = { single: [[], [], []], horde: [[], [], []], boss: [[], [], []] };
  const bosses = E.tavernBosses(L);
  for (const c of classes) {
    for (let k = 0; k < 6; k++) {
      const h = hero(L, c, c + k);
      const pool = E.monstersFor(L);
      for (let d = 1; d <= 3; d++) {
        const p = E.DIFF[d].power;
        const mon = pool[(k * 7 + d) % pool.length];
        const ml = d === 3 ? L + (k % 2) : d === 1 ? L - (k % 2) : L;
        // Einzelgegner
        const foe = E.monsterFighter(mon, ml, E.adaptPower(h, ml, p));
        const r1 = E.simulate(h, foe, "s" + c + k + d);
        res.single[d - 1].push([r1.winner === 0 ? 1 : 0, r1.winner === 0 ? Math.max(0, r1.hp ? r1.hp[0] : 0) / h.maxHp : 0]);
        // Horde: zwei Diener und Anfuehrer
        const mm = pool[(k * 3 + d + 1) % pool.length];
        const foes = [
          E.monsterFighter(mm, Math.max(1, ml - 1), E.adaptPower(h, ml - 1, p * E.HORDE.minion)),
          E.monsterFighter(mm, Math.max(1, ml - 1), E.adaptPower(h, ml - 1, p * E.HORDE.minion)),
          E.monsterFighter(mon, ml, E.adaptPower(h, ml, p * E.HORDE.boss), { boss: true }),
        ];
        const r2 = E.simulateChain(h, foes, "h" + c + k + d);
        res.horde[d - 1].push([r2.winner === 0 ? 1 : 0, r2.winner === 0 ? r2.hpLeft / h.maxHp : 0]);
        // Verliesboss in der Taverne (ordentlich oder halsbrecherisch, Stufe wie makeBossOffer)
        if (bosses.length && d >= 2) {
          const bl = L;
          const bf = E.monsterFighter(bosses[(k * 5 + d) % bosses.length], bl, E.adaptPower(h, bl, p), { boss: true });
          const r3 = E.simulate(h, bf, "b" + c + k + d);
          res.boss[d - 1].push([r3.winner === 0 ? 1 : 0, r3.winner === 0 ? Math.max(0, r3.hp ? r3.hp[0] : 0) / h.maxHp : 0]);
        }
      }
    }
  }
  const fmt = (arr) => arr.filter((a) => a.length).map((a) => { const w = a.reduce((s, x) => s + x[0], 0) / a.length; const wins = a.filter((x) => x[0]); const hp = wins.length ? wins.reduce((s, x) => s + x[1], 0) / wins.length : 0; return Math.round(w * 100) + "%/" + Math.round(hp * 100) + "%"; }).join("  ");
  console.log("Stufe " + L + (talents ? " mit Talenten" : " ohne Talente") + " q=" + q + " | einzeln (Sieg/Leben) " + fmt(res.single) + " | Horde " + fmt(res.horde) + (bosses.length ? " | Verliesboss (ordentlich, halsbrecherisch) " + fmt(res.boss) : ""));
}
