// Version 5.4: "Neu prüfen", gemalte Insel als Heimat und Besuch der anderen Inseln.
// Aufruf: node build.mjs && node tests/neu.mjs   (mit Inselbildern und assets/gen-midgard.pack wird mehr geprueft)
//   PAGE=<datei>  andere Spieldatei pruefen (Standard: dist/schwebfels.html)
//   CDN_CACHE=<map.json>  three.js und Schriften aus lokalen Dateien (wie tests/e2e.mjs)
// Prueft:
// - ein Spielstand mit "Heimatinsel: 3D-Modell" (vor 5.4) kommt einmal auf das Gemaelde zurueck
// - "Neu prüfen" oeffnet sich einmal von selbst (nicht bei frisch erschaffenen Helden) und zeigt Inseln und Figuren
// - Besuch auf Albion und Hibernia mit Weg zurueck (nur mit Inselbildern)
// - die eingebetteten Midgard-Koerper tragen den eigenen Helden auch ohne Zusatzdatei (nur mit Figurenpaket)
// - alle Tavernenmonster mit eigener Figur aus gen-mon<familie>.js (nur wenn die Dateien neben der Seite liegen)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch (e) {
  pw = require("/opt/node22/lib/node_modules/playwright");
}
const dir = path.dirname(fileURLToPath(import.meta.url));
const page0 = process.env.PAGE ? path.resolve(process.env.PAGE) : path.join(dir, "..", "dist", "schwebfels.html");
const html = readFileSync(page0, "utf8");
const hasIsles = html.includes("globalThis.SB_INSELN=");
// Koerper der waehlbaren Voelker in der Seite: als Figuren mit echten Bewegungen (SB_GENPACK) oder aelter (SB_GENKERN)
const hasKern = html.includes("globalThis.SB_GENKERN=") || html.includes("globalThis.SB_GENPACK=");
const cdnMap = process.env.CDN_CACHE ? JSON.parse(readFileSync(process.env.CDN_CACHE, "utf8")) : null;
const fails = [];
const errors = [];
const check = (cond, msg) => cond || fails.push(msg);

const browser = await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
const p = await ctx.newPage();
if (cdnMap) {
  await p.route(/^https:\/\//, (r) => {
    const f = cdnMap[r.request().url()];
    if (!f) return r.abort();
    const type = f.endsWith(".css") ? "text/css" : f.endsWith(".js") ? "text/javascript" : "font/woff2";
    return r.fulfill({ path: f, contentType: type, headers: { "access-control-allow-origin": "*" } });
  });
}
p.on("pageerror", (e) => errors.push("pageerror: " + e.message));
p.on("console", (m) => {
  // fehlende Zusatzdatei gen-midgard.js neben der Testseite ist erwartbar
  if ((m.type() === "error" || m.type() === "warning") && !/ERR_FILE_NOT_FOUND|deprecated/.test(m.text())) errors.push(m.type() + ": " + m.text().slice(0, 200));
});

// 1. frischer Held: kein selbst geoeffnetes Fenster
await p.goto("file://" + page0);
await p.waitForSelector("#create:not([hidden])");
await p.locator('[data-cact="realm"][data-v="midgard"]').click();
await p.locator('[data-cact="race"][data-v="trollblut"]').click();
await p.locator('[data-cact="gender"][data-v="m"]').click();
await p.fill("#heroName", "Pruefer");
await p.locator('[data-cact="start"]').click();
await p.waitForSelector("#topbar .me-sub");
await p.waitForTimeout(1500);
check((await p.evaluate(() => SB.ui.panelId)) !== "neu", "Neu prüfen öffnet sich bei einem frisch erschaffenen Helden");
check(await p.locator('#dock [data-id="neu"]').isVisible(), "Menüpunkt Neu prüfen fehlt");

// 2. Spielstand wie vor 5.4: Insel auf 3D, noch nichts gesehen
await p.evaluate(() => {
  const S = SB.ui.S;
  S.settings.island = "3d";
  delete S.settings.inselV;
  delete S.settings.neuV;
  SB.ui.saveNow();
});
await p.reload();
await p.waitForSelector("#topbar .me-sub");
for (let i = 0; i < 40 && (await p.evaluate(() => SB.ui.panelId)) !== "neu"; i++) await p.waitForTimeout(150);
check((await p.evaluate(() => SB.ui.panelId)) === "neu", "Neu prüfen öffnet sich nicht von selbst");
check((await p.evaluate(() => SB.ui.S.settings.island)) !== "3d", "Heimatinsel bleibt auf 3D-Modell stehen");
check((await p.locator('[data-act="neuInsel"]').count()) === (hasIsles ? 3 : 0), "Neu prüfen zeigt nicht die drei Inseln");
check((await p.locator(".neu-fig").count()) === 4, "Neu prüfen zeigt nicht die vier Völker mit neuen Figuren");
if (hasIsles) {
  check(await p.evaluate(() => !!(SB.ui.hub && SB.ui.hub.painted && SB.ui.hub.realm() === "midgard")), "Heimat ist nicht das Gemälde von Midgard");
  for (const r of ["albion", "hibernia"]) {
    await p.locator('[data-act="neuInsel"][data-v="' + r + '"]').click();
    await p.waitForTimeout(600);
    check((await p.evaluate(() => SB.ui.hub.realm())) === r, "Besuch auf " + r + " zeigt die Insel nicht");
    check(await p.locator(".ph-visit").isVisible(), "Hinweis beim Besuch auf " + r + " fehlt");
  }
  await p.evaluate(() => SB.ui.closePanel());
  // Insel bleibt beim Auffrischen der Anzeige (Uhr, Spielstand) beim Besuch
  await p.evaluate(() => SB.ui.refresh());
  check((await p.evaluate(() => SB.ui.hub.realm())) === "hibernia", "Besuch endet beim Auffrischen der Anzeige");
  await p.locator(".ph-visit button").click();
  await p.waitForTimeout(400);
  check((await p.evaluate(() => SB.ui.hub.realm())) === "midgard" && !(await p.locator(".ph-visit").isVisible()), "Weg zurück nach Hrimholm geht nicht");
} else console.log("ohne Inselbilder: Besuch nicht geprüft");
if (hasKern) {
  let gen = null;
  for (let i = 0; i < 60 && !gen; i++) {
    await p.waitForTimeout(250);
    gen = await p.evaluate(() => SB.ui.heroDesc(SB.ui.S).gen);
  }
  check(gen === "trollblut-mann", "eigener Held trägt die eingebettete neue Figur nicht: " + gen);
} else console.log("ohne Figurenpaket: eingebettete Figuren nicht geprüft");
// Monster mit eigener Figur (gen-mon<familie>.js neben der Seite): jedes der Tavernenmonster laedt seine Familie nach und
// steht mit eigener Figur da, Menschenartige mit Skelett und Bewegungen, Tiere als Bestie mit eigenem Koerper
const hasMon = existsSync(path.join(path.dirname(page0), "gen-mongoblin.js"));
if (hasMon) {
  const r = await p.evaluate(async () => {
    const all = SB.data.MONSTERS;
    const ok = await SB.ui.loadMonsters(all.map((m) => m.arch));
    const out = {};
    for (const mon of all) {
      const f = SB.R3D.buildFighter(SB.ui.monDesc(mon));
      f.play("attack", 0.42);
      for (let i = 0; i < 10; i++) f.update(1 / 30);
      out[mon.id] = f.parts.clips && f.parts.clips.cur ? "skelett" : f.parts.fam ? "bestie:" + f.parts.fam : "alt";
    }
    return { ok, out, ready: Object.keys(SB.ui.monReady || {}).length };
  });
  check(r.ok, "Monsterdateien laden nicht");
  const bad = Object.entries(r.out).filter(([id, v]) => v === "alt" || (v.startsWith("bestie:") && v !== "bestie:" + id && !(id === "grauwolf" && v === "bestie:wolf")));
  check(!bad.length, "Monster ohne eigene Figur: " + bad.map(([id, v]) => id + "=" + v).join(", "));
  check(r.out.eiskobold === "skelett", "Eiskobold hat keine eigene Figur mit Bewegungen");
  console.log("Monsterfiguren:", Object.values(r.out).filter((v) => v === "skelett").length, "mit Skelett,", Object.values(r.out).filter((v) => v.startsWith("bestie")).length, "Bestien,", r.ready, "Familien geladen");
} else console.log("ohne gen-mon*.js: Monsterfiguren nicht geprüft");

// 3. danach nicht mehr von selbst
await p.evaluate(() => SB.ui.closePanel());
await p.reload();
await p.waitForSelector("#topbar .me-sub");
await p.waitForTimeout(1500);
check((await p.evaluate(() => SB.ui.panelId)) !== "neu", "Neu prüfen öffnet sich bei jedem Start");
await browser.close();

if (errors.length) fails.push(...errors);
if (fails.length) {
  console.log("FEHLER:\n- " + fails.join("\n- "));
  process.exit(1);
}
console.log("OK: Neu prüfen, gemalte Heimatinsel" + (hasIsles ? ", Besuch der Inseln" : "") + (hasKern ? ", eingebettete Figuren" : "") + (hasMon ? ", Monsterfiguren" : ""));
