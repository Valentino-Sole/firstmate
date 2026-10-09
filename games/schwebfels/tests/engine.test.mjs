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

function fresh(cls = "schildritter") {
  const SB = load();
  let now = 1_750_000_000_000;
  SB.engine.now = () => now;
  const realm = SB.data.CLASSES[cls].realm;
  const race = Object.keys(SB.data.RACES).find((r) => SB.data.RACES[r].realm === realm);
  const S = SB.engine.newHero({ name: "Testa", race, gender: "w", cls, look: { hairStyle: 1, beard: 0, tattoo: "runen" } });
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
  assert.equal(S.realm, "albion");
  assert.equal(S.look.tattoo, "runen");
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
  assert.deepEqual(f1.chain, f2.chain, "gleicher Ausgang beim erneuten Laden");
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
  assert.equal(E.energy(S), E.energyMax(S));
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

test("Gegenstaende anderer Grundarten lassen sich nicht anlegen, gleiche Grundart reichsuebergreifend schon", () => {
  const { SB, E, S } = fresh("schildritter");
  const r = SB.util.rng(3);
  const bow = E.makeItem(r, { level: 3, cls: "mondschuetze", slot: "waffe", base: "bogen" });
  S.inv.push(bow);
  assert.equal(E.equip(S, 0).ok, false);
  const axe = E.makeItem(r, { level: 3, cls: "sturmhuene", slot: "waffe", base: "axt" });
  S.inv.push(axe);
  assert.equal(E.equip(S, 1).ok, true);
});

test("Vergleich zeigt die Werte vor und nach dem Anlegen", () => {
  const { SB, E, S } = fresh();
  const r = SB.util.rng(9);
  const it = E.makeItem(r, { level: 10, cls: S.cls, slot: "waffe", rarity: "episch" });
  const pv = E.previewEquip(S, it);
  assert.ok(pv.after.dmgMax > pv.before.dmgMax);
  assert.notEqual(S.equip.waffe, it, "Vorschau veraendert den Helden nicht");
});

test("Seltene Hordenauftraege: mehrere Gegner nacheinander, Lebenspunkte werden mitgenommen", () => {
  const { E, S, advance } = fresh();
  S.level = 8;
  for (let i = 0; i < 300 && !S.quest.offers.some((o) => o.rare); i++) E.refreshOffers(S);
  const idx = S.quest.offers.findIndex((o) => o.rare);
  assert.ok(idx >= 0, "seltene Auftraege kommen vor");
  const o = S.quest.offers[idx];
  assert.equal(o.waves.length, 3);
  assert.equal(o.waves[2].boss, true);
  S.bought.kraft = 500;
  S.bought.konstitution = 500;
  assert.equal(E.startQuest(S, idx).ok, true);
  advance(E.questDuration(S, o) + 5);
  const f = E.questFight(S);
  assert.equal(f.foes.length, 3);
  assert.equal(f.chain.winner, 0);
  assert.equal(f.chain.waves.length, 3);
  for (let i = 1; i < 3; i++) assert.ok(f.chain.waves[i].startHp >= f.chain.waves[i - 1].hp[0], "Atem holen zwischen den Gegnern");
  const rew = E.resolveQuest(S, f);
  assert.equal(rew.won, true);
  assert.equal(S.stats.hordes, 1);
  assert.ok(S.ach.horde);
});

test("Chronik: Kapitel von Reich und Klasse, freigeschaltet nach Stufe und Reihenfolge", () => {
  const { E, S, now } = fresh("runenwirker");
  let ch = E.storyChapters(S);
  assert.equal(ch.length, 8);
  assert.equal(ch.filter((c) => c.available).length, 1);
  S.bought.verstand = 800;
  S.bought.konstitution = 800;
  const res = E.storyFight(S, ch.find((c) => c.available).key, now());
  assert.equal(res.ok, true);
  const rew = E.resolveStory(S, res.fight, now());
  assert.equal(rew.won, true);
  assert.ok(rew.item || rew.itemSold);
  S.level = 9;
  ch = E.storyChapters(S);
  assert.equal(ch.filter((c) => c.done).length, 1);
  assert.ok(ch.filter((c) => c.available).length >= 2);
});

test("Heim: Ausbaustufen und Einrichtung geben dauerhafte Boni", () => {
  const { E, S } = fresh();
  S.gold = 1e6;
  S.perlen = 100;
  assert.equal(E.buyFurniture(S, "staender").ok, false, "braucht eine Steinkate");
  assert.equal(E.buyFurniture(S, "lager").ok, true);
  assert.equal(E.energyMax(S), E.C.ENERGY_MAX + 10);
  assert.equal(E.buyFurniture(S, "truhe").ok, true);
  assert.equal(E.invSize(S), E.C.INV_SIZE + 2);
  assert.equal(E.buyHouseTier(S).ok, false, "Stufe 5 noetig");
  S.level = 5;
  assert.equal(E.buyHouseTier(S).ok, true);
  assert.equal(S.house.tier, 1);
  S.equip.ruestung.armor = 200;
  const before = E.armorTotal(S);
  assert.equal(E.buyFurniture(S, "staender").ok, true);
  assert.ok(E.armorTotal(S) > before);
});

test("Gilden: gruenden, nur im eigenen Reich beitreten, Rangliste", () => {
  const { E, S, now } = fresh();
  S.gold = 1000;
  const other = E.npcGuilds().find((g) => g.realm !== S.realm);
  assert.equal(E.joinGuild(S, other).ok, false);
  const own = E.npcGuilds().find((g) => g.realm === S.realm);
  assert.equal(E.joinGuild(S, own).ok, true);
  const gl = E.guildLadder(S, now());
  assert.ok(gl.find((g) => g.id === own.id).members >= 1);
  E.leaveGuild(S);
  assert.equal(E.createGuild(S, "X", "Y").ok, false);
  assert.equal(E.createGuild(S, "Die Kreidewölfe", "KW2").ok, true);
  assert.equal(S.gold, 500);
  assert.equal(S.guild.founder, true);
});

test("Reichskrieg: Reichs- und Gesamtranglisten", () => {
  const { E, S, now } = fresh();
  const st = E.realmStandings(S, now());
  assert.equal(st.length, 3);
  assert.ok(st[0].honor >= st[1].honor && st[1].honor >= st[2].honor);
  const all = E.allHeroes(S, now());
  const mine = E.realmRanked(all, S.realm);
  assert.ok(mine.every((h) => h.realm === S.realm));
  assert.equal(mine.find((h) => h.kind === "me").realmRank >= 1, true);
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
  assert.ok(rivals.every((r) => r.realm !== S.realm), "nur Gegner aus anderen Reichen");
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

test("Wunschbrunnen: freier Wurf alle 8 Stunden, kostet nie Perlen, Perlenwurf nur auf Wunsch", () => {
  const { E, S, now, advance } = fresh();
  S.perlen = 0;
  const r0 = E.tossWell(S, now(), true);
  assert.equal(r0.ok, false, "ohne Perlen kein Perlenwurf");
  assert.equal(E.wellFree(S, now()), true, "der freie Wurf bleibt erhalten");
  const r1 = E.tossWell(S, now());
  assert.equal(r1.ok, true);
  assert.equal(r1.paid, false);
  assert.equal(E.tossWell(S, now()).ok, false, "danach nur noch mit Perle");
  assert.equal(S.wellNext - now(), E.C.WELL_FREE_MS, "nächster freier Wurf in 8 Stunden");
  advance(E.C.WELL_FREE_MS - 1000);
  assert.equal(E.wellFree(S, now()), false, "vor Ablauf der 8 Stunden kein freier Wurf");
  advance(1000);
  assert.equal(E.tossWell(S, now()).paid, false, "nach 8 Stunden wieder frei");
  const old = E.migrate(Object.assign(JSON.parse(JSON.stringify(S)), { wellNext: undefined, daily: Object.assign({}, S.daily, { wellFree: 0 }) }));
  assert.equal(old.wellNext, 0, "alte Spielstände werfen gleich wieder frei");
  assert.equal(old.daily.wellFree, undefined);
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
  const { SB, S } = fresh("runenwirker");
  const code = SB.store.exportCode(S);
  const back = SB.store.importCode(code);
  assert.equal(back.name, S.name);
  assert.equal(back.cls, "runenwirker");
  assert.throws(() => SB.store.importCode("hallo welt"));
});

test("Fremde Heldenprofile werden geprueft, alte Profile umgedeutet", () => {
  const { SB } = fresh();
  assert.equal(SB.store.sanitizeHero("x", { name: "<b>", cls: "schildritter", race: "albier" }), null);
  assert.equal(SB.store.sanitizeHero("x", { name: "Ok", cls: "magier", race: "albier" }), null);
  const h = SB.store.sanitizeHero("x", { name: "Rita <script>", cls: "wind", race: "moosling", level: 1e9, honor: -5, attrs: { geschick: "viel" }, look: { skin: "red", tattoo: "<x>" }, gear: { waffe: { base: "bogen", tint: "#zzzzzz" } }, guild: { id: "p-abc", name: "<i>", tag: "!" } });
  assert.equal(h.name, "Rita script");
  assert.equal(h.cls, "mondschuetze");
  assert.equal(h.realm, "hibernia");
  assert.equal(h.level, 300);
  assert.equal(h.honor, 0);
  assert.equal(h.look.skin, SB.data.RACES.moorling.skins[0]);
  assert.equal(h.look.tattoo, "keine");
  assert.equal(h.gear.waffe, null);
  assert.equal(h.guild, null);
  assert.ok(h.fighter.maxHp > 0);
  assert.equal(SB.store.sanitizeGuild({ id: "p-1234", name: "Gute Gilde", tag: "gg", realm: "midgard" }).tag, "GG");
});

test("Alte Spielstaende (Version 1) werden uebernommen und duerfen das Reich waehlen", () => {
  const { SB, E } = fresh();
  const v1 = {
    name: "Altheld", race: "hornvolk", gender: "m", cls: "klinge", level: 7, xp: 10, gold: 900, perlen: 9, honor: 300, look: { skin: "#8f5c8c", hair: "#1f1f24", hairStyle: 1, beard: 2, eyes: "#1d1b26" },
    energy: { val: 80, ts: 0 }, base: { kraft: 15, geschick: 7, verstand: 6, konstitution: 12, glueck: 8 }, bought: { kraft: 10, geschick: 0, verstand: 0, konstitution: 4, glueck: 0 },
    equip: { waffe: { id: "w1", slot: "waffe", base: "schwert", cls: "klinge", name: "Altes Schwert", rarity: "selten", level: 6, min: 12, max: 20, stats: { kraft: 6 }, value: 120 } },
    inv: [{ id: "b1", slot: "waffe", base: "bogen", cls: "wind", name: "Alter Bogen", rarity: "gewoehnlich", level: 3, min: 5, max: 9, stats: {}, value: 20 }],
    quest: { seed: 5, offers: [], active: null }, guard: null, arena: { next: 0, wins: 3, losses: 1 }, dungeons: { progress: {}, next: 0 }, shops: {}, buffs: [], mounts: { owned: [] },
    bestiary: {}, ach: {}, stats: { quests: 12, wins: 10, losses: 2, arenaWins: 3, bosses: 0, goldEarned: 2000, items: 5 }, daily: { day: "x", wellFree: 1, brews: 0, arenaXp: 0, wellPaid: 0 },
    npcSeed: 77, npcHonor: {}, settings: { sound: true, quality: "hoch", fastFights: false }, tut: 9, created: 0,
  };
  const S = E.migrate(v1);
  assert.ok(S);
  assert.equal(S.v, 2);
  assert.equal(S.migratedFrom, 1);
  assert.equal(S.race, "trollblut");
  assert.equal(S.cls, "sturmhuene");
  assert.equal(S.level, 7);
  assert.equal(S.equip.waffe.arch, "krieger");
  assert.equal(S.inv[0].arch, "jaeger");
  assert.ok(S.settings.music !== undefined && S.settings.dayCycle);
  assert.ok(S.quest.offers.length === 3 && S.quest.offers[0].waves);
  const kraftBefore = S.base.kraft;
  assert.equal(E.chooseRealm(S, "albion").ok, true);
  assert.equal(S.realm, "albion");
  assert.equal(S.cls, "schildritter");
  assert.equal(D_REALM(SB, S.race), "albion");
  assert.equal(S.migratedFrom, undefined);
  assert.notEqual(S.base.kraft, undefined);
  assert.ok(Math.abs(S.base.kraft - kraftBefore) <= 3);
});
const D_REALM = (SB, race) => SB.data.RACES[race].realm;

test("Arena: vier Herausforderer, Staerke passend gestaffelt, Auswahl bleibt bis zum Kampf", () => {
  for (const cls of ["schildritter", "runenwirker", "schattentaenzer"]) {
    const { E, D, S, now, advance, SB } = fresh(cls);
    S.level = 12;
    const rr = SB.util.rng(cls);
    for (const sl of D.SLOTS) S.equip[sl] = E.makeItem(rr, { level: 12, cls, slot: sl, rarity: "selten" });
    const r1 = E.arenaRivals(S, now());
    assert.equal(r1.length, 4);
    assert.ok(r1.every((r) => r.realm !== S.realm));
    assert.ok(r1.every((r) => Math.abs(r.level - S.level) <= 3), "nur Gegner nahe der eigenen Stufe");
    const chances = r1.map((r) => r.chance);
    assert.ok(Math.max(...chances) >= 0.55, "mindestens ein leichterer Gegner");
    assert.ok(Math.min(...chances) <= 0.5, "mindestens ein schwerer Gegner");
    advance(60 * 1000);
    const r2 = E.arenaRivals(S, now());
    assert.deepEqual(r2.map((r) => r.id), r1.map((r) => r.id), "Auswahl bleibt stabil");
    const res = E.arenaFight(S, r2[r2.length - 1], now());
    assert.equal(res.ok, true);
    E.resolveArena(S, res.fight, now());
    assert.equal(S.arena.rivals, null, "nach dem Kampf neue Auswahl");
  }
});

test("Tag und Nacht: Modi, Wechselzeit, Mondtor nur nachts", () => {
  const { E, S, now, advance } = fresh();
  assert.equal(E.isNight("tag", now()), false);
  assert.equal(E.isNight("nacht", now()), true);
  assert.equal(E.nightChangeIn("tag", now()), Infinity);
  const dt = E.nightChangeIn("zyklus", now());
  assert.ok(dt > 0 && dt <= E.C.DAY_CYCLE_MS);
  const before = E.isNight("zyklus", now());
  advance(dt + 1000);
  assert.notEqual(E.isNight("zyklus", now()), before);
  assert.equal(E.nightHunt(S, false, now()).ok, false, "am Tag geschlossen");
  assert.equal(E.buyMoonItem(S, 0, false, now()).ok, false, "Haendlerin nur nachts");
});

test("Nachtjagd: zwei Nachtwesen der Heimatinsel, drei pro Tag, sichere Beute", () => {
  const { E, D, S, now, advance } = fresh("wolfsjaeger");
  S.level = 8;
  const ids = D.NIGHT_FOES.midgard.map((m) => m.id);
  for (let i = 0; i < E.C.NIGHT_HUNTS; i++) {
    const res = E.nightHunt(S, true, now());
    assert.equal(res.ok, true);
    assert.equal(res.fight.foes.length, 2);
    assert.ok(res.fight.foes.every((f) => ids.indexOf(f.id) >= 0), "Nachtwesen aus Midgard");
    res.fight.chain = { winner: 0, waves: [] };
    const inv = S.inv.length;
    const rew = E.resolveNightHunt(S, res.fight);
    assert.ok(rew.xp > 0 && rew.gold > 0);
    assert.ok(S.inv.length === inv + 1 || rew.itemSold > 0, "Beute");
    if (rew.item) assert.ok(D.RARITY_ORDER.indexOf(rew.item.rarity) >= 2, "mindestens selten");
  }
  assert.equal(E.nightHuntsLeft(S), 0);
  assert.equal(E.nightHunt(S, true, now()).ok, false);
  advance(86400000);
  E.tick(S, now());
  assert.equal(E.nightHuntsLeft(S), E.C.NIGHT_HUNTS, "naechster Tag");
});

test("Mondhaendlerin: drei Stuecke, eines episch, gekaufte Plaetze bleiben leer", () => {
  const { E, D, S, now } = fresh();
  S.gold = 1e7;
  const items = E.moonShop(S, now());
  assert.equal(items.length, 3);
  assert.equal(items[2].rarity === "episch" || items[2].rarity === "legendaer", true);
  const res = E.buyMoonItem(S, 0, true, now());
  assert.equal(res.ok, true);
  assert.equal(E.moonShop(S, now())[0], null);
  assert.ok(D.RARITY_ORDER.indexOf(res.item.rarity) >= 2);
});

test("Auftraege zeigen Gegner der eigenen Heimatinsel", () => {
  for (const [cls, realm] of [["sturmhuene", "midgard"], ["hainwaechter", "hibernia"], ["schildritter", "albion"]]) {
    const { E, S } = fresh(cls);
    for (const L of [1, 10, 20, 30, 40, 50]) {
      const pool = E.monstersFor(L, realm);
      assert.ok(pool.length >= 3);
      assert.ok(pool.every((m) => !m.realms || m.realms.indexOf(realm) >= 0), realm + " Stufe " + L);
    }
    S.level = 20;
    E.refreshOffers(S);
    for (const o of S.quest.offers) for (const w of o.waves) assert.ok(E.monById(w.monster).realms.indexOf(realm) >= 0);
  }
});

test("Talente: Punkte je Stufe, Stufen im Zweig, Zuruecksetzen kostet Perlen", () => {
  const { E, S } = fresh("schildritter");
  assert.equal(E.talentPoints(S), 0);
  assert.equal(E.learnTalent(S, "o.dmg").ok, false, "Stufe 1 hat keine Punkte");
  S.level = 20;
  assert.equal(E.talentPoints(S), 10);
  const tree = E.talentTree(S.cls);
  assert.equal(tree.branches.length, 3);
  assert.equal(E.learnTalent(S, "o.crit").ok, false, "Stufe 2 braucht 3 Punkte im Zweig");
  for (let i = 0; i < 3; i++) assert.equal(E.learnTalent(S, "o.dmg").ok, true);
  assert.equal(E.learnTalent(S, "o.dmg").ok, false, "Rang 3 ist das Maximum");
  assert.equal(E.learnTalent(S, "o.crit").ok, true);
  assert.equal(E.learnTalent(S, "x.unbekannt").ok, false);
  assert.equal(E.talentFree(S), 6);
  S.perlen = 2;
  assert.equal(E.resetTalents(S).ok, false, "zu wenig Perlen");
  S.perlen = 5;
  assert.equal(E.resetTalents(S).ok, true);
  assert.equal(S.perlen, 5 - E.C.TALENT_RESET_PERLEN);
  assert.equal(E.talentFree(S), 10);
});

test("Talente wirken im Kampf: Lebenspunkte, Barriere, zweiter Atem, Gegenschlag", () => {
  const { E, S } = fresh("runenwirker");
  S.level = 30;
  const before = E.heroFighter(S).maxHp;
  for (const [id, n] of [["d.hp", 3], ["d.ward", 3], ["d.mag", 2], ["d.tgh", 2], ["d.cap", 1]]) for (let i = 0; i < n; i++) assert.equal(E.learnTalent(S, id).ok, true, id);
  const f = E.heroFighter(S);
  assert.ok(f.maxHp > before, "mehr Lebenspunkte");
  assert.ok(f.tal.ward > 0 && f.tal.purge === 1);
  const foe = E.modelHeroFighter(30, "sturmhuene", 1.2);
  const res = E.simulate(f, foe, "talenttest");
  const wardEv = res.events.find((e) => e.kind === "talent" && e.id === "ward");
  assert.ok(wardEv && wardEv.ward > 0, "Barriere zu Kampfbeginn");
  assert.ok(res.events.some((e) => e.hits && e.hits.some((h) => h.absorbed > 0)), "Barriere faengt Schaden ab");
  // Krieger mit zweitem Atem und Parade
  const k = fresh("sturmhuene");
  k.S.level = 40;
  for (const [id, n] of [["d.hp", 3], ["d.blk", 3], ["d.tgh", 2], ["d.rip", 2], ["d.cap", 1]]) for (let i = 0; i < n; i++) k.E.learnTalent(k.S, id);
  const kf = k.E.heroFighter(k.S);
  let wind = 0;
  for (let i = 0; i < 30; i++) {
    const r = k.E.simulate(kf, k.E.modelHeroFighter(40, "meuchler", 1.25), "w" + i);
    for (const e of r.events) {
      if (e.kind === "talent" && e.id === "secondWind") wind++;
      assert.ok(e.hp[0] >= 0 && e.hp[0] <= kf.maxHp);
    }
  }
  assert.ok(wind > 0, "zweiter Atem greift");
});

test("Computerhelden bekommen gueltige Talente innerhalb ihres Budgets", () => {
  const { E, D } = fresh();
  for (const cls of Object.keys(D.CLASSES))
    for (const L of [1, 9, 18, 40, 80]) {
      const ranks = E.autoTalents(cls, L, 7);
      const spent = Object.values(ranks).reduce((a, b) => a + b, 0);
      assert.ok(spent <= E.talentPointsFor(L));
      for (const id in ranks) assert.equal(E.talentCheck(cls, Object.assign({}, ranks, { [id]: ranks[id] - 1 }), id, E.talentPointsFor(L)).ok, true, cls + " " + id);
    }
});

test("Glueck verbessert die Beute, Attribut-Erklaerungen liefern Werte", () => {
  const { E, S } = fresh("meuchler");
  S.level = 10;
  const lb0 = E.lootBoost(S);
  S.bought.glueck += 80;
  assert.ok(E.lootBoost(S) > lb0);
  for (const a of ["kraft", "geschick", "verstand", "konstitution", "glueck"]) assert.ok(E.attrEffects(S, a, 1).length >= 1, a);
  const luck = E.attrEffects(S, "glueck", 5);
  assert.ok(luck.some((x) => /Beute/.test(x.t)));
});

test("Fremde Heldenprofile: nur gueltige Talente der eigenen Klasse", () => {
  const { SB } = fresh();
  const h = SB.store.sanitizeHero("abc", { name: "Fremdling", race: "nordmann", cls: "sturmhuene", level: 20, attrs: { kraft: 100, geschick: 20, verstand: 20, konstitution: 80, glueck: 20 }, wMin: 20, wMax: 40, armor: 100, talents: { "o.dmg": 9, "d.cap": 1, "x.boese": 5, "c.cap": "viel" } });
  assert.deepEqual(Object.keys(h.talents).sort(), ["c.cap", "d.cap", "o.dmg"]);
  assert.equal(h.talents["o.dmg"], 3, "auf das Maximum begrenzt");
  assert.equal(h.talents["c.cap"], 0, "ungueltiger Wert");
  assert.ok(h.fighter.tal);
});

/* ---------- Version 5: feste Erscheinung der Gegenstaende ---------- */
test("Beute und Werte unveraendert: gleiche Zufallsfolge wie vor der Grafikumstellung", () => {
  const SB = load();
  const E = SB.engine;
  const U = SB.util;
  const r = U.rng(4242);
  const out = [];
  for (let i = 0; i < 40; i++) {
    const it = E.makeItem(r, { level: 5 + i, cls: ["schildritter", "meuchler", "langbogner", "runenwirker"][i % 4], boost: 0.4 });
    out.push([it.base, it.slot, it.rarity, it.variant, it.name, JSON.stringify(it.stats), it.armor || 0, it.min || 0, it.tint, it.value].join("|"));
  }
  out.push(String(r()));
  // Wert mit der Spiellogik von Version 4 ermittelt
  assert.equal(U.hash(out.join("\n")), 3277808739);
  const npc = [];
  for (let i = 0; i < 30; i++) {
    const g = E.npcGear({ gearSeed: 1000 + i * 77, cls: Object.keys(SB.data.CLASSES)[i % 12], realm: "midgard" });
    for (const s of ["waffe", "ruestung", "helm", "umhang", "handschuhe", "stiefel", "nebenhand"]) {
      const x = g[s];
      npc.push(x ? [x.base, x.tint, x.rarity, x.style].join(",") : "-");
    }
  }
  assert.equal(U.hash(npc.join("|")), 426049426);
});

test("jeder Gegenstand hat eine feste Erscheinung, die Speichern und Laden ueberlebt", () => {
  const { E, D, S } = fresh("runenwirker");
  for (const s of D.SLOTS) {
    const it = S.equip[s];
    if (!it) continue;
    assert.ok(it.vis && it.vis.f && it.vis.c === "midgard", s + " ohne Erscheinung");
    assert.equal(it.vis.f.split(".")[0], it.base);
  }
  const r = SB_rng(E, 9);
  for (let i = 0; i < 30; i++) {
    const it = E.makeItem(r, { level: 10, cls: "runenwirker" });
    const names = D.BASES[it.base].byArch ? D.BASES[it.base].byArch.magier : D.BASES[it.base].names;
    assert.equal(it.vis.f, E.formKey(it.base, it.variant, "magier"));
    assert.ok(names[it.variant] && it.name.indexOf(names[it.variant]) >= 0, "Form passt zum Namen: " + it.name);
    S.inv.push(it);
  }
  const before = JSON.stringify(S.inv.map((x) => x.vis));
  const S2 = E.migrate(JSON.parse(JSON.stringify(S)));
  assert.equal(JSON.stringify(S2.inv.map((x) => x.vis)), before, "Erscheinung bleibt nach dem Laden gleich");
  const gv = E.gearVisual(S.equip);
  assert.equal(JSON.stringify(Object.keys(gv).sort()), JSON.stringify(D.SLOTS.slice().sort()), "alle zehn Plaetze werden dargestellt");
});

test("alte Gegenstaende ohne Erscheinung bekommen Form und Kultur beim Laden", () => {
  const { E, S } = fresh("sturmhuene");
  const old = { id: "alt1", base: "handschuhe", slot: "handschuhe", arch: null, level: 3, rarity: "selten", stats: { kraft: 3 }, variant: 0, style: 0, name: "Meisterliche Stachelhandschuhe des Baeren", tint: "#9aa4ad", value: 10, armor: 2 };
  S.inv.push(old);
  delete S.equip.waffe.vis;
  const S2 = E.migrate(JSON.parse(JSON.stringify(S)));
  const it = S2.inv.find((x) => x.id === "alt1");
  assert.equal(it.vis.f, "handschuhe.krieger.1", "Grundart und Form aus dem Namen");
  assert.equal(it.vis.c, "midgard");
  assert.ok(S2.equip.waffe.vis && S2.equip.waffe.vis.f.startsWith(S2.equip.waffe.base + "."));
});

test("Computerhelden tragen Schmuck und feste Formen, ohne die Zufallsfolge zu aendern", () => {
  const SB = load();
  const E = SB.engine;
  const g1 = E.npcGear({ gearSeed: 555, cls: "lichtweber", realm: "albion" });
  const g2 = E.npcGear({ gearSeed: 555, cls: "lichtweber", realm: "albion" });
  assert.equal(JSON.stringify(g1), JSON.stringify(g2));
  for (const s in g1) if (g1[s]) assert.ok(g1[s].vis && g1[s].vis.c === "albion" && g1[s].vis.f.startsWith(g1[s].base + "."));
});

function SB_rng(E, seed) {
  return E.__rng ? E.__rng(seed) : loadUtilRng(seed);
}
function loadUtilRng(seed) {
  return load().util.rng(seed);
}

test("Helm ausblenden aendert nur die Darstellung, nicht die Werte", () => {
  const { E, S } = fresh("sturmhuene");
  const it = E.makeItem(() => 0.5, { level: 5, slot: "helm", base: "helm", arch: "krieger", realm: "midgard", rarity: "selten" });
  S.equip.helm = it;
  const werte = () => {
    const x = E.heroSummary(S);
    return JSON.stringify([x.attrs, x.hp, x.dmgMin, x.dmgMax, x.armor, x.crit, x.block, x.evade]);
  };
  const vor = werte();
  E.setLook(S, { hideHelm: true });
  assert.equal(E.heroFighter(S).gear.helm, null);
  assert.equal(werte(), vor);
  E.setLook(S, { hideHelm: false });
  assert.ok(E.heroFighter(S).gear.helm);
});

test("Heldenstaerke misst Talente und Ausruestung; Modellheld ohne Talente hat Staerke 1", () => {
  const SB = load();
  const E = SB.engine;
  assert.equal(E.heroStrength(E.modelHeroFighter(31, "sturmhuene", 1), 31), 1);
  const tal = E.applyTalents(E.modelHeroFighter(31, "sturmhuene", 1), E.talentEffects("sturmhuene", E.autoTalents("sturmhuene", 31, "a"), 31));
  assert.ok(E.heroStrength(tal, 31) > 1.1);
  assert.ok(E.heroStrength(E.modelHeroFighter(31, "sturmhuene", 1.25), 31) > 1.2);
});

test("schwere Abzeichen zaehlen mit und werden beim Erreichen vergeben", () => {
  const { E, S } = fresh();
  assert.equal(JSON.stringify(E.achProgress(S, "halsbrecher25")), "[0,25]");
  S.stats.hardWins = 25;
  E.checkAch(S);
  assert.ok(S.ach.halsbrecher25);
  S.stats.streak = 20;
  E.checkAch(S);
  assert.ok(S.ach.unbesiegt20);
});

test("Verliesbosse tauchen selten in der Taverne auf, ab Stufe 10 und ohne Endbosse", () => {
  const { E, S } = fresh("sturmhuene");
  const DUNGEONS = load().data.DUNGEONS;
  const zaehle = (lv) => {
    S.level = lv;
    let boss = 0, alle = 0;
    for (let i = 0; i < 400; i++) {
      E.refreshOffers(S);
      for (const o of S.quest.offers) {
        alle++;
        if (!o.boss) continue;
        boss++;
        const mon = E.questMonster(o);
        assert.ok(mon && mon.name, "Boss " + o.monster + " aufloesbar");
        const [, dun, floor] = /^(.+)-(\d+)$/.exec(o.monster);
        assert.ok(!DUNGEONS.find((d) => d.id === dun).bosses[+floor].final, "kein Endboss in der Taverne");
        assert.ok(o.item, "Verliesboss bringt immer einen Gegenstand");
        const foes = E.questFoes(o, E.heroFighter(S));
        assert.equal(foes.length, 1);
        assert.ok(foes[0].boss);
      }
      assert.ok(S.quest.offers.filter((o) => o.boss).length <= 1, "hoechstens ein Verliesboss je Auswahl");
    }
    return boss / alle;
  };
  assert.equal(zaehle(8), 0);
  const q = zaehle(24);
  assert.ok(q > 0.02 && q < 0.08, "Anteil " + q);
});
