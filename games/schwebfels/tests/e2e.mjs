// Browser-Durchlauf (Version 3): Reichswahl, Held mit Tattoo, Aufträge, Horde, Chronik, alle Orte, Gilde, Heim,
// Brunnen, Arena mit vier passenden Gegnern, Dungeon, Mondtor bei Tag und Nacht (Nachtjagd, Mondhändlerin),
// Speichern, Übernahme eines alten Spielstands, Mobilansicht mit Hibernia.
// Aufruf: node tests/e2e.mjs [ausgabeordner]   (erwartet vorher: node build.mjs)
// Nutzt das global installierte Playwright und Chromium mit Software-WebGL.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch (e) {
  pw = require("/opt/node22/lib/node_modules/playwright");
}
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(dir, "..", "screens");
mkdirSync(out, { recursive: true });
const url = "file://" + path.join(dir, "..", "dist", "schwebfels.html");

const errors = [];
const cdnMap = process.env.CDN_CACHE ? JSON.parse(readFileSync(process.env.CDN_CACHE, "utf8")) : null;
const browser = await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });

async function newPage(vp) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // Optional: CDN_CACHE zeigt auf eine JSON-Datei {url: lokaler Pfad}, z. B. fuer Umgebungen,
  // in denen der Testbrowser das CDN nicht direkt erreicht.
  if (cdnMap) {
    await page.route(/^https:\/\//, (r) => {
      const f = cdnMap[r.request().url()];
      if (!f) return r.abort();
      const type = f.endsWith(".css") ? "text/css" : f.endsWith(".js") ? "text/javascript" : "font/woff2";
      return r.fulfill({ path: f, contentType: type, headers: { "access-control-allow-origin": "*" } });
    });
  }
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  return page;
}
const shot = (page, name) => page.screenshot({ path: path.join(out, name + ".png") });
const step = (t) => console.log("→ " + t);
const open = async (page, id) => {
  await page.click('#dock [data-id="' + id + '"]');
  await page.waitForSelector('#panel[data-id="' + id + '"]');
  await page.waitForTimeout(700);
};

async function playBattle(page, name, watch) {
  await page.waitForSelector("#battle:not([hidden])", { timeout: 15000 });
  await page.waitForTimeout(watch || 2200);
  await shot(page, name + "-kampf");
  await page.click("#battle [data-skip]");
  await page.waitForSelector("#battleDone", { timeout: 60000 });
  await page.waitForTimeout(400);
  await shot(page, name + "-ergebnis");
  await page.click("#battleDone");
  await page.waitForSelector("#battle", { state: "hidden" });
}

/* ---- Desktop ---- */
const page = await newPage({ width: 1366, height: 820 });
await page.goto(url);
await page.waitForSelector("#create:not([hidden])");
await page.waitForTimeout(1500);
step("Heldenerschaffung");
await shot(page, "01-erstellung");
await page.click('[data-cact="realm"][data-v="midgard"]');
await page.click('[data-cact="cls"][data-v="sturmhuene"]');
await page.click('[data-cact="race"][data-v="trollblut"]');
await page.click('[data-cact="gender"][data-v="m"]');
await page.click('[data-cact="looks"][data-k="tattoo"][data-v="runen"]');
await page.click('[data-cact="look"][data-k="tattooColor"][data-v="#4fffb0"]');
await page.click('[data-cact="look"][data-k="eyes"][data-v="#9fe3ff"]');
await page.fill("#heroName", "Tilda Sturmfang");
await page.waitForTimeout(800);
await shot(page, "02-erstellung-midgard");
await page.click('[data-cact="start"]');
await page.waitForSelector("#topbar .me-name");
await page.waitForTimeout(600);
await shot(page, "02b-prolog");
await page.click('#modal [data-act="closeDialog"]');
await page.waitForTimeout(2500);
step("Insel");
await shot(page, "03-insel");
await page.click('#hint [data-act="hintNext"]');
await page.waitForSelector('#panel[data-id="taverne"]');
await page.waitForTimeout(800);
step("Taverne");
await shot(page, "04-taverne");
await page.click('#hint [data-act="hintNext"]').catch(() => {});
await page.click('[data-act="questStart"][data-i="0"]');
await page.waitForTimeout(500);
await page.click('[data-act="questSkip"]');
await page.waitForSelector('[data-act="questFight"]');
await page.click('[data-act="questFight"]');
await playBattle(page, "05-auftrag");

step("Charakterbogen");
await open(page, "held");
await page.waitForTimeout(900);
await shot(page, "06-charakter");
const plus = await page.$('[data-act="attr"]:not([disabled])');
if (plus) await plus.click();
const invItem = await page.$('[data-ref^="inv:"]');
if (invItem) {
  await invItem.click();
  await page.waitForTimeout(300);
  await shot(page, "06b-vergleich");
  await page.click('#modal [data-act="closeDialog"]');
}
await page.click('[data-act="tab"][data-tab="aussehen"]');
await page.waitForTimeout(900);
await page.click('[data-act="lookn"][data-k="scar"][data-v="kreuz"]');
await page.waitForTimeout(700);
await shot(page, "07-aussehen");
await page.click('[data-act="tab"][data-tab="geschichte"]');
await page.waitForTimeout(400);
await shot(page, "07b-geschichte");

step("Seltener Hordenauftrag");
await page.evaluate(() => {
  const S = SB.ui.S;
  S.level = 6;
  S.bought[SB.data.CLASSES[S.cls].main] += 30;
  S.bought.konstitution += 25;
  for (let i = 0; i < 200 && !S.quest.offers.some((o) => o.rare); i++) SB.engine.refreshOffers(S);
  SB.ui.refresh();
});
await open(page, "taverne");
await shot(page, "08-taverne-horde");
const rareIdx = await page.evaluate(() => SB.ui.S.quest.offers.findIndex((o) => o.rare));
if (rareIdx < 0) errors.push("Kein seltener Auftrag erzeugt");
else {
  await page.click('[data-act="questStart"][data-i="' + rareIdx + '"]');
  await page.click('[data-act="questSkip"]');
  await page.click('[data-act="questFight"]');
  await playBattle(page, "09-horde", 3500);
}

step("Chronik");
await page.evaluate(() => {
  SB.ui.S.level = 9;
  SB.ui.refresh();
});
await open(page, "steinkreis");
await shot(page, "10-chronik");
const sf = await page.$('[data-act="storyFight"]:not([disabled])');
if (!sf) errors.push("Kein Chronik-Kapitel verfügbar");
else {
  await sf.click();
  await playBattle(page, "11-chronik");
}

for (const [id, name] of [
  ["schmiede", "12-schmiede"],
  ["arkanum", "13-kuriositaeten"],
  ["leuchtturm", "14-wache"],
  ["tiefen", "15-dungeons"],
  ["stall", "16-stall"],
]) {
  step(name);
  await open(page, id);
  await shot(page, name);
}
step("Schmiede-Detail");
await open(page, "schmiede");
await page.click('[data-ref^="shop:schmiede"]');
await page.waitForTimeout(300);
await shot(page, "12b-schmiede-vergleich");
await page.click('#modal [data-act="closeDialog"]');

step("Ranglisten");
await open(page, "ruhmeshalle");
await shot(page, "17-rangliste");
for (const t of ["reich", "gilden", "reiche"]) {
  await page.click('[data-act="tab"][data-tab="' + t + '"]');
  await page.waitForTimeout(400);
  await shot(page, "17-rangliste-" + t);
}

step("Gilde");
await page.evaluate(() => {
  SB.ui.S.gold += 2000;
  SB.ui.refresh();
});
await open(page, "gildenhalle");
await shot(page, "18-gilde");
await page.fill("#gName", "Die Nebelwölfe");
await page.fill("#gTag", "NW");
await page.click('[data-act="createGuild"]');
await page.waitForTimeout(600);
await shot(page, "18b-gilde-eigen");

step("Heim");
await page.evaluate(() => {
  const S = SB.ui.S;
  S.gold += 30000;
  SB.engine.buyHouseTier(S);
  SB.engine.buyFurniture(S, "lager");
  SB.engine.buyFurniture(S, "herd");
  SB.engine.buyFurniture(S, "truhe");
  SB.ui.refresh();
});
await open(page, "heim");
await page.waitForTimeout(1500);
await shot(page, "19-heim");
await page.click('[data-act="furnBuy"]:not([disabled])');
await page.waitForTimeout(1200);
await shot(page, "19b-heim-gekauft");

step("Brunnen");
await open(page, "brunnen");
await shot(page, "20-brunnen");
const perlsBefore = await page.evaluate(() => SB.ui.S.perlen);
await page.click('[data-act="well"]');
await page.waitForTimeout(2200);
await shot(page, "20b-brunnen-geworfen");
const perlsAfter = await page.evaluate(() => SB.ui.S.perlen);
const timer = await page.$(".wellbox [data-until]");
if (!timer) errors.push("Brunnen: Zeitanzeige bis Mitternacht fehlt nach dem freien Wurf");
if (perlsAfter < perlsBefore) errors.push("Brunnen: freier Wurf hat Perlen gekostet");

step("Arena");
await page.evaluate(() => {
  SB.ui.S.arena.next = 0;
  SB.ui.refresh();
});
await open(page, "arena");
await shot(page, "21-arena");
const nRivals = await page.$$eval('[data-act="arenaFight"]', (l) => l.length);
if (nRivals !== 4) errors.push("Arena: " + nRivals + " statt 4 Herausforderer");
await page.click('[data-act="arenaFight"]:not([disabled])');
await playBattle(page, "22-arena");

step("Dungeon auf Stufe 12");
await page.evaluate(() => {
  const S = SB.ui.S;
  S.level = 12;
  S.bought[SB.data.CLASSES[S.cls].main] += 60;
  S.bought.konstitution += 40;
  S.dungeons.next = 0;
  SB.ui.refresh();
});
await open(page, "tiefen");
await shot(page, "23-dungeon-offen");
await page.click('[data-act="dungeonFight"]:not([disabled])');
await playBattle(page, "23b-dungeon");

step("Mondtor bei Tag");
await page.evaluate(() => {
  SB.ui.S.settings.dayCycle = "tag";
  SB.ui.refresh();
});
await open(page, "mondtor");
await shot(page, "24a-mondtor-tag");
if (await page.$('#panel [data-act="nightHunt"]')) errors.push("Mondtor: Nachtjagd am Tag möglich");

step("Einstellungen und Nacht");
await page.click('#topbar [data-id="einstellungen"]');
await page.waitForTimeout(500);
await page.click('[data-act="dayCycle"][data-v="nacht"]');
await page.click('[data-act="closePanel"]');
await page.waitForTimeout(2500);
await shot(page, "24-insel-nacht");

step("Mondtor bei Nacht: Nachtjagd und Mondhändlerin");
await open(page, "mondtor");
await shot(page, "24b-mondtor-nacht");
const huntsBefore = await page.evaluate(() => SB.engine.nightHuntsLeft(SB.ui.S));
await page.click('[data-act="nightHunt"]');
await playBattle(page, "24c-nachtjagd");
const huntsAfter = await page.evaluate(() => SB.engine.nightHuntsLeft(SB.ui.S));
if (huntsAfter !== huntsBefore - 1) errors.push("Nachtjagd wurde nicht gezählt");
await page.click('[data-act="tab"][data-panel="mondtor"][data-tab="laden"]');
await page.waitForTimeout(600);
await shot(page, "24d-mondhaendlerin");
await page.evaluate(() => {
  SB.ui.S.gold = 1e7;
  SB.ui.refresh();
});
await page.click('#panel .shop .slot:not(.empty)');
await page.waitForTimeout(400);
await page.click('#modal [data-act="buy"]');
await page.waitForTimeout(400);
const sold = await page.evaluate(() => SB.ui.S.shops.mond.items.filter((x) => x === null).length);
if (sold !== 1) errors.push("Mondhändlerin: Kauf nicht verbucht");

step("Speichern und neu laden");
const before = await page.evaluate(() => JSON.stringify({ n: SB.ui.S.name, q: SB.ui.S.stats.quests, g: SB.ui.S.gold, r: SB.ui.S.realm, gu: SB.ui.S.guild && SB.ui.S.guild.tag }));
await page.reload();
await page.waitForSelector("#topbar .me-name");
const after = await page.evaluate(() => JSON.stringify({ n: SB.ui.S.name, q: SB.ui.S.stats.quests, g: SB.ui.S.gold, r: SB.ui.S.realm, gu: SB.ui.S.guild && SB.ui.S.guild.tag }));
if (before !== after) errors.push("Spielstand nach Neuladen verschieden: " + before + " vs " + after);
console.log("   Spielstand:", after);

step("Alter Spielstand aus Version 1");
const v1 = {
  name: "Altheld", race: "hornvolk", gender: "m", cls: "klinge", level: 7, xp: 120, gold: 900, perlen: 9, honor: 300,
  look: { skin: "#8f5c8c", hair: "#1f1f24", hairStyle: 1, beard: 2, eyes: "#1d1b26" },
  energy: { val: 80, ts: Date.now() }, base: { kraft: 15, geschick: 7, verstand: 6, konstitution: 12, glueck: 8 },
  bought: { kraft: 10, geschick: 0, verstand: 0, konstitution: 4, glueck: 0 },
  equip: { waffe: { id: "w1", slot: "waffe", base: "schwert", cls: "klinge", name: "Altes Schwert", rarity: "selten", level: 6, min: 12, max: 20, stats: { kraft: 6 }, value: 120, tint: "#9aa4ad", style: 0 } },
  inv: [], quest: { seed: 5, offers: [], active: null }, guard: null, arena: { next: 0, wins: 3, losses: 1 }, dungeons: { progress: {}, next: 0 },
  shops: {}, buffs: [], mounts: { owned: [] }, bestiary: { schleimi: 2 }, ach: {}, stats: { quests: 12, wins: 10, losses: 2, arenaWins: 3, bosses: 0, goldEarned: 2000, items: 5 },
  daily: { day: "x", wellFree: 1, brews: 0, arenaXp: 0, wellPaid: 0 }, npcSeed: 77, npcHonor: {}, settings: { sound: true, quality: "hoch", fastFights: false }, tut: 9, created: Date.now() - 86400000,
};
await page.evaluate((s) => {
  // Laufenden Helden abkoppeln, damit er beim Neuladen den alten Stand nicht ueberschreibt
  SB.ui.S = null;
  localStorage.setItem("schwebfels:save:v1", JSON.stringify(s));
}, v1);
await page.reload();
await page.waitForSelector(".realmcards", { timeout: 15000 });
await page.waitForTimeout(800);
await shot(page, "25-reichswahl-alt");
await page.click('[data-act="chooseRealm"][data-r="albion"]');
await page.waitForTimeout(500);
const mig = await page.evaluate(() => ({ cls: SB.ui.S.cls, race: SB.ui.S.race, realm: SB.ui.S.realm, lv: SB.ui.S.level, w: SB.ui.S.equip.waffe && SB.ui.S.equip.waffe.name }));
if (mig.realm !== "albion" || mig.cls !== "schildritter" || mig.lv !== 7 || mig.w !== "Altes Schwert") errors.push("Übernahme fehlerhaft: " + JSON.stringify(mig));
console.log("   Übernahme:", JSON.stringify(mig));
await page.click('#modal [data-act="closeDialog"]');
await page.waitForTimeout(800);
await shot(page, "26-alt-uebernommen");

await page.context().close();

/* ---- Mobil ---- */
step("Mobil");
const mob = await newPage({ width: 390, height: 844 });
await mob.goto(url);
await mob.waitForSelector("#create:not([hidden])");
await mob.waitForTimeout(1200);
await shot(mob, "30-mobil-erstellung");
await mob.click('[data-cact="realm"][data-v="hibernia"]');
await mob.waitForTimeout(400);
await mob.fill("#heroName", "Pim");
await mob.click('[data-cact="start"]');
await mob.waitForSelector("#topbar .me-sub");
await mob.click('#modal [data-act="closeDialog"]');
await mob.waitForTimeout(2000);
await shot(mob, "31-mobil-insel");
const mobRealm = await mob.evaluate(() => SB.ui.S.realm);
if (mobRealm !== "hibernia") errors.push("Mobil: Reich " + mobRealm + " statt hibernia");
await mob.click('#hint [data-act="hintNext"]');
await mob.waitForTimeout(800);
await shot(mob, "32-mobil-taverne");
const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
if (overflow > 0) errors.push("Mobil: horizontaler Überlauf " + overflow + "px");
await mob.click('[data-act="questStart"][data-i="0"]');
await mob.click('[data-act="questSkip"]');
await mob.click('[data-act="questFight"]');
await mob.waitForSelector("#battle:not([hidden])");
await mob.waitForTimeout(2000);
await shot(mob, "33-mobil-kampf");
await mob.click("#battle [data-skip]");
await mob.waitForSelector("#battleDone", { timeout: 60000 });
await mob.click("#battleDone");
await mob.click('#dock [data-id="held"]');
await mob.waitForTimeout(1200);
await shot(mob, "34-mobil-charakter");

await browser.close();
const relevant = errors.filter((e) => !/deprecated|fonts\.g|ERR_|net::/i.test(e));
if (relevant.length) {
  console.log("FEHLER:\n" + relevant.join("\n"));
  process.exit(1);
}
console.log("OK, Screenshots in " + out);
