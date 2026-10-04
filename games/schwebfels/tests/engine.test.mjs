// Tests der Spiellogik. Aufruf: node --test tests/engine.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const dir = path.dirname(fileURLToPath(import.meta.url));

function load() {
  const ctx = { console, Math, Date, JSON, btoa, atob, escape, unescape, encodeURIComponent, decodeURIComponent, setTimeout, clearTimeout };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of ["data.js", "engine.js", "store.js"]) vm.runInContext(readFileSync(path.join(dir, "..", "src", f), "utf8"), ctx, { filename: f });
  return ctx.SB;
}

function fresh(cls = "klinge") {
  const SB = load();
  let now = 1_750_000_000_000;
  SB.engine.now = () => now;
  const S = SB.engine.newHero({ name: "Testa", race: "wolkling", gender: "w", cls, look: { skin: "#f2cba8", hair: "#3b2a20", hairStyle: 1, beard: 0 } });
  return { SB, E: SB.engine, D: SB.data, S, advance: (ms) => (now += ms), now: () => now };
}

test("neuer Held hat Startwerte, Ausruestung und drei verschiedene Auftraege", () => {
  const { E, S } = fresh();
  assert.equal(S.level, 1);
  assert.equal(S.gold, 120);
  assert.ok(S.equip.waffe && S.equip.ruestung && S.equip.stiefel);
  assert.equal(S.quest.offers.length, 3);
  assert.equal(new Set(S.quest.offers.map((o) => o.title)).size, 3);
  assert.equal(Math.floor(E.energy(S)), E.C.ENERGY_MAX);
});

test("Auftrag: Start kostet Tatendrang, laeuft ab, Kampf ist deterministisch, Belohnung wird verbucht", () => {
  const { E, S, advance } = fresh();
  const o = S.quest.offers[0];
  assert.equal(E.startQuest(S, 0).ok, true);
  assert.equal(Math.round(E.energy(S)), E.C.ENERGY_MAX - o.energy);
  assert.equal(E.startQuest(S, 1).ok, false, "zweiter Auftrag gleichzeitig ist nicht erlaubt");
  assert.equal(E.questFight(S), null, "vor Ablauf kein Kampf");
  advance(E.questDuration(S, o) + 10);
  const f1 = E.questFight(S);
  const f2 = E.questFight(S);
  assert.deepEqual(f1.result, f2.result, "gleicher Ausgang beim erneuten Laden");
  const goldBefore = S.gold;
  const rew = E.resolveQuest(S, f1);
  assert.equal(S.quest.active, null);
  assert.equal(S.stats.quests, 1);
  if (rew.won) {
    assert.equal(S.gold, goldBefore + o.gold + (rew.itemSold || 0));
    assert.ok(S.bestiary[o.monster] >= 1);
  }
  assert.equal(S.quest.offers.length, 3);
});

test("Tatendrang regeneriert sich bis zum Maximum", () => {
  const { E, S, advance } = fresh();
  E.setEnergy(S, 10);
  advance(E.C.ENERGY_REGEN_MS * 5);
  assert.equal(Math.floor(E.energy(S)), 15);
  advance(E.C.ENERGY_REGEN_MS * 500);
  assert.equal(E.energy(S), E.C.ENERGY_MAX);
});

test("Perlen beschleunigen, Wolkenbraeu ist pro Tag begrenzt", () => {
  const { E, S } = fresh();
  E.startQuest(S, 0);
  const p = S.perlen;
  assert.equal(E.skipQuest(S).ok, true);
  assert.equal(S.perlen, p - 1);
  assert.ok(E.questFight(S));
  S.perlen = 50;
  for (let i = 0; i < E.C.BREW_MAX; i++) assert.equal(E.buyBrew(S).ok, true);
  assert.equal(E.buyBrew(S).ok, false);
});

test("Attribute kosten steigend Gold", () => {
  const { E, S } = fresh();
  S.gold = 10000;
  const c0 = E.attrCost(0);
  const before = E.heroAttrs(S).kraft;
  const res = E.buyAttr(S, "kraft", 10);
  assert.equal(res.n, 10);
  assert.ok(E.attrCost(10) > c0);
  assert.equal(E.heroAttrs(S).kraft, before + 10);
  S.gold = 0;
  assert.equal(E.buyAttr(S, "kraft", 1).ok, false);
});

test("Laden, Rucksack, Anlegen, Ablegen, Verkaufen", () => {
  const { E, S } = fresh();
  S.gold = 1e6;
  const it = S.shops.schmiede.items[0];
  assert.equal(E.buyItem(S, "schmiede", 0).ok, true);
  assert.equal(S.inv.length, 1);
  assert.equal(S.shops.schmiede.items[0], null);
  assert.equal(E.equip(S, 0).ok, true);
  assert.equal(S.equip[it.slot], it);
  assert.equal(E.unequip(S, it.slot).ok, true);
  assert.equal(S.inv.includes(it), true);
  const g = S.gold;
  assert.equal(E.sellItem(S, S.inv.indexOf(it)).ok, true);
  assert.equal(S.gold, g + E.sellPrice(it));
});

test("Gegenstaende anderer Klassen lassen sich nicht anlegen", () => {
  const { SB, E, S } = fresh("klinge");
  const r = SB.util.rng(3);
  const bow = E.makeItem(r, { level: 3, cls: "wind", slot: "waffe", base: "bogen" });
  S.inv.push(bow);
  assert.equal(E.equip(S, 0).ok, false);
});

test("Leuchtturmwache zahlt erst nach Ablauf und blockiert Auftraege", () => {
  const { E, S, advance } = fresh();
  assert.equal(E.startGuard(S, 2).ok, true);
  assert.equal(E.startQuest(S, 0).ok, false);
  assert.equal(E.collectGuard(S).ok, false);
  advance(2 * E.C.SHIFT_MS + 1);
  const g = S.gold;
  const res = E.collectGuard(S);
  assert.equal(res.ok, true);
  assert.equal(S.gold, g + 2 * E.shiftPay(S));
});

test("Arena: Rangliste, Gegnerwahl, Abklingzeit, Ehre", () => {
  const { E, S, now } = fresh();
  const all = E.allHeroes(S, now());
  assert.equal(all.length, E.C.NPC_COUNT + 1);
  const rivals = E.arenaRivals(S, now());
  assert.ok(rivals.length >= 2);
  const res = E.arenaFight(S, rivals[0], now());
  assert.equal(res.ok, true);
  const honor = S.honor;
  const rew = E.resolveArena(S, res.fight, now());
  assert.equal(S.honor, honor + rew.honor);
  assert.equal(E.arenaFight(S, rivals[0], now()).ok, false, "Abklingzeit");
});

test("Dungeons: gesperrt bis Stufe, Fortschritt nach Sieg", () => {
  const { E, S, now, advance } = fresh();
  assert.equal(E.dungeonState(S, 0).unlocked, false);
  S.level = 40;
  S.bought.kraft = 2000;
  S.bought.konstitution = 2000;
  const res = E.dungeonFight(S, 0, now());
  assert.equal(res.ok, true);
  const rew = E.resolveDungeon(S, res.fight, now());
  assert.equal(rew.won, true);
  assert.equal(E.dungeonState(S, 0).cleared, 1);
  assert.equal(E.dungeonFight(S, 0, now()).ok, false, "Erholung");
  advance(E.C.DUNGEON_CD + 1);
  assert.equal(E.dungeonFight(S, 0, now()).ok, true);
});

test("Wunschbrunnen: ein freier Wurf pro Tag, danach Perlen", () => {
  const { E, S } = fresh();
  const p = S.perlen;
  const r1 = E.tossWell(S);
  assert.equal(r1.ok, true);
  assert.equal(r1.paid, false);
  const r2 = E.tossWell(S);
  assert.equal(r2.paid, true);
  assert.ok(S.perlen >= p - 1);
});

test("Stufenaufstieg schenkt Perlen und Abzeichen", () => {
  const { E, S } = fresh();
  const p = S.perlen;
  E.gainXp(S, E.xpNeed(1) + E.xpNeed(2) + 5);
  assert.equal(S.level, 3);
  assert.equal(S.perlen, p + 2);
});

test("Kampfsimulation endet immer und liefert gueltige Lebenspunkte", () => {
  const { E, D } = fresh();
  for (const c of Object.keys(D.CLASSES)) {
    for (const L of [1, 10, 40]) {
      const hero = E.modelHeroFighter(L, c, 1);
      for (const m of E.monstersFor(L)) {
        const res = E.simulate(hero, E.monsterFighter(m, L, 1), "t" + c + L + m.id);
        assert.ok(res.events.length <= E.C.MAX_ACTIONS);
        assert.ok(res.winner === 0 || res.winner === 1);
        assert.ok(res.hp[0] >= 0 && res.hp[1] >= 0);
      }
    }
  }
});

test("Spielstand-Code: Hin- und Rueckweg, Schutz vor fremdem Text", () => {
  const { SB, S } = fresh("rune");
  const code = SB.store.exportCode(S);
  const back = SB.store.importCode(code);
  assert.equal(back.name, S.name);
  assert.equal(back.cls, "rune");
  assert.throws(() => SB.store.importCode("hallo welt"));
});

test("Fremde Heldenprofile werden geprueft", () => {
  const { SB } = fresh();
  assert.equal(SB.store.sanitizeHero("x", { name: "<b>", cls: "klinge", race: "wolkling" }), null);
  assert.equal(SB.store.sanitizeHero("x", { name: "Ok", cls: "magier", race: "wolkling" }), null);
  const h = SB.store.sanitizeHero("x", { name: "Rita <script>", cls: "wind", race: "moosling", level: 1e9, honor: -5, attrs: { geschick: "viel" }, look: { skin: "red" }, gear: { waffe: { base: "bogen", tint: "#zzzzzz" } } });
  assert.equal(h.name, "Rita script");
  assert.equal(h.level, 300);
  assert.equal(h.honor, 0);
  assert.equal(h.look.skin, "#f2cba8");
  assert.equal(h.gear.waffe, null);
  assert.ok(h.fighter.maxHp > 0);
});
