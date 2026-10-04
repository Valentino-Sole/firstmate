// Simuliert einen Spieler, der Auftraege annimmt, Gold ausgibt und Ausruestung verbessert.
// Gibt pro Stufenband Siegquoten je Schwierigkeit und den Vergleich zum Modell-Helden aus.
// Aufruf: node tests/progression.mjs [klasse] [zielstufe]
import { loadGame } from "./load.mjs";

const SB = loadGame();
if (process.env.MQ) SB.engine.C.MONSTER_Q = +process.env.MQ;
const E = SB.engine;
const D = SB.data;
const clsArg = process.argv[2] || "all";
const target = Number(process.argv[3] || 30);
const classes = clsArg === "all" ? ["schildritter", "nebelschleicher", "mondschuetze", "runenwirker"] : clsArg === "alle12" ? Object.keys(D.CLASSES) : [clsArg];

function play(cls, seed) {
  let now = 1_700_000_000_000 + seed * 1e7;
  E.now = () => now;
  const race = Object.keys(D.RACES).find((x) => D.RACES[x].realm === D.CLASSES[cls].realm);
  const S = E.newHero({ name: "Sim" + cls + seed, race, gender: "m", cls, look: {} });
  const r = SB.util.rng(seed * 991 + 7);
  const bands = {};
  let quests = 0;
  const C = D.CLASSES[cls];
  const upgrade = () => {
    // bessere Ausruestung anlegen, Rest verkaufen
    for (let i = S.inv.length - 1; i >= 0; i--) {
      const it = S.inv[i];
      if (E.canEquip(S, it) && E.itemScore(it, cls) > E.itemScore(S.equip[it.slot], cls)) E.equip(S, i);
    }
    while (S.inv.length) E.sellItem(S, 0);
    // Ladenware kaufen: beste Verbesserung pro Gold zuerst
    for (let round = 0; round < 3; round++) {
      let best = null;
      for (const shop of ["schmiede", "arkanum"]) {
        S.shops[shop].items.forEach((it, idx) => {
          if (!it || !E.canEquip(S, it) || it.value > S.gold) return;
          const gain = E.itemScore(it, cls) - E.itemScore(S.equip[it.slot], cls);
          if (gain <= 0) return;
          const v = gain / it.value;
          if (!best || v > best.v) best = { shop, idx, v };
        });
      }
      if (!best) break;
      E.buyItem(S, best.shop, best.idx);
      E.equip(S, S.inv.length - 1);
      while (S.inv.length) E.sellItem(S, 0);
    }
    const reserve = S.gold * 0.3;
    // Attribute: Hauptwert und Konstitution im Verhaeltnis 2:1, etwas Glueck
    let guard = 0;
    while (guard++ < 500) {
      const want = S.bought[C.main] < 2 * S.bought.konstitution + 2 ? C.main : S.bought.glueck * 4 < S.bought.konstitution ? "glueck" : "konstitution";
      if (E.attrCost(S.bought[want]) > S.gold - reserve) break;
      E.buyAttr(S, want, 1);
    }
  };
  while (S.level < target && quests < 4000) {
    E.tick(S, now);
    // Spieler waehlt den lohnendsten Auftrag mit brauchbarer Siegchance
    const offers = S.quest.offers;
    const hero = E.heroFighter(S, now);
    const est = offers.map((o) => E.estimateWin(hero, E.questFoes(o, hero), 20, o.id));
    let idx = -1;
    let best = -1;
    offers.forEach((o, i) => {
      const val = ((o.xp / E.xpNeed(S.level)) * 3 + o.gold / E.goldBase(S.level)) / o.energy * (0.5 + est[i]);
      if (est[i] >= 0.6 && val > best) {
        best = val;
        idx = i;
      }
    });
    if (idx < 0) idx = est.indexOf(Math.max(...est));
    if (r() < 0.15) idx = Math.floor(r() * 3);
    const o = offers[idx];
    const en = E.energy(S, now);
    if (en < o.energy) {
      now += (o.energy - en) * E.C.ENERGY_REGEN_MS + 1000;
      continue;
    }
    E.startQuest(S, idx, now);
    now = S.quest.active.end;
    const fight = E.questFight(S, now);
    const rew = E.resolveQuest(S, fight);
    quests++;
    const band = Math.floor((S.level - (rew.xp && S.xp < rew.xp ? 1 : 0)) / 5) * 5;
    const b = (bands[band] = bands[band] || { n: 0, w: [0, 0, 0, 0], c: [0, 0, 0, 0], acts: 0, main: 0, model: 0, hp: 0, modelHp: 0, mins: 0 });
    b.n++;
    b.c[o.diff]++;
    if (rew.won) b.w[o.diff]++;
    b.acts += fight.chain.waves.reduce((a, w) => a + w.events.length, 0);
    const hf = E.heroFighter(S, now);
    const mf = E.modelHeroFighter(S.level, cls, 1);
    b.main += hf.attrs[C.main] / mf.attrs[C.main];
    b.hp += hf.maxHp / mf.maxHp;
    upgrade();
    if (quests % 4 === 0) {
      E.refreshShop(S, "schmiede", true);
      E.refreshShop(S, "arkanum", true);
    }
  }
  return { S, bands, quests, hours: (now - S.created) / 3.6e6 };
}

for (const cls of classes) {
  const agg = {};
  let totalQ = 0;
  let totalH = 0;
  const runs = 6;
  for (let s = 1; s <= runs; s++) {
    const res = play(cls, s);
    totalQ += res.quests;
    totalH += res.hours;
    for (const k in res.bands) {
      const a = (agg[k] = agg[k] || { n: 0, w: [0, 0, 0, 0], c: [0, 0, 0, 0], acts: 0, main: 0, hp: 0 });
      const b = res.bands[k];
      a.n += b.n;
      a.acts += b.acts;
      a.main += b.main;
      a.hp += b.hp;
      for (let d = 1; d <= 3; d++) {
        a.w[d] += b.w[d];
        a.c[d] += b.c[d];
      }
    }
  }
  console.log(`\n${D.CLASSES[cls].name}: Durchschnitt ${Math.round(totalQ / runs)} Auftraege, ${(totalH / runs).toFixed(1)} Spielstunden bis Stufe ${target}`);
  console.log("Stufe  | Auftr. | gemuetl | ordentl | halsbr | Aktionen | Haupt/Modell | LP/Modell");
  for (const k of Object.keys(agg).map(Number).sort((a, b) => a - b)) {
    const a = agg[k];
    const p = (d) => (a.c[d] ? Math.round((a.w[d] / a.c[d]) * 100) + "%" : "-").padStart(7);
    console.log(`${String(k).padStart(2)}-${String(k + 4).padEnd(3)} | ${String(Math.round(a.n / runs)).padStart(6)} | ${p(1)} | ${p(2)} | ${p(3)} | ${(a.acts / a.n).toFixed(1).padStart(8)} | ${(a.main / a.n).toFixed(2).padStart(12)} | ${(a.hp / a.n).toFixed(2).padStart(9)}`);
  }
}
