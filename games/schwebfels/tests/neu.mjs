// Version 5.4: "Neu prüfen", gemalte Insel als Heimat und Besuch der anderen Inseln.
// Aufruf: node build.mjs && node tests/neu.mjs   (mit Inselbildern und assets/gen-midgard.pack wird mehr geprueft)
//   PAGE=<datei>  andere Spieldatei pruefen (Standard: dist/schwebfels.html)
//   CDN_CACHE=<map.json>  three.js und Schriften aus lokalen Dateien (wie tests/e2e.mjs)
// Prueft:
// - ein Spielstand mit "Heimatinsel: 3D-Modell" (vor 5.4) kommt einmal auf das Gemaelde zurueck
// - "Neu prüfen" oeffnet sich einmal von selbst (nicht bei frisch erschaffenen Helden) und zeigt Inseln und Figuren
// - Besuch auf Albion und Hibernia mit Weg zurueck (nur mit Inselbildern)
// - die eingebetteten Midgard-Koerper tragen den eigenen Helden auch ohne Zusatzdatei (nur mit Figurenpaket)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
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
const hasKern = html.includes("globalThis.SB_GENKERN=");
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
console.log("OK: Neu prüfen, gemalte Heimatinsel" + (hasIsles ? ", Besuch der Inseln" : "") + (hasKern ? ", eingebettete Figuren" : ""));
