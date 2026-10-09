// Neues Design ohne alte Reste (Version 0.66): gemalte Insel als Heimat, Besuch der anderen Inseln, keine alten Figuren.
// Aufruf: node build.mjs && node tests/neu.mjs   (mit Inselbildern und assets/gen-midgard.pack wird mehr geprueft)
//   PAGE=<datei>  andere Spieldatei pruefen (Standard: dist/schwebfels.html)
//   CDN_CACHE=<map.json>  three.js und Schriften aus lokalen Dateien (wie tests/e2e.mjs)
// Prueft:
// - ein Spielstand mit "Heimatinsel: 3D-Modell" (vor 5.4) kommt auf das Gemaelde zurueck; die Pruefseite "Neu prüfen"
//   gibt es nicht mehr, auch nicht fuer alte Spielstaende
// - Heldenerschaffung ohne die alten Regler fuer Haut, Haare und Gesicht; ein noch ladender Koerper ist ein Platzhalter,
//   nie die alte Figur
// - Besuch auf Albion und Hibernia aus den Einstellungen mit Weg zurueck (nur mit Inselbildern)
// - die eingebetteten Midgard-Koerper tragen den eigenen Helden auch ohne Zusatzdatei (nur mit Figurenpaket)
// - alle Tavernenmonster mit eigener Figur aus gen-mon<familie>.js (nur wenn die Dateien neben der Seite liegen)
// - Auftraege und Chronik kaempfen vor der gemalten Kulisse des Reiches (nur mit kulissen.js neben der Seite)
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
check(!(await p.evaluate(() => [...document.querySelectorAll("#create .cform h4")].some((h) => /Haut|Haare|Augen|Narben/.test(h.textContent)))), "Heldenerschaffung zeigt noch die alten Regler");
check(!(await p.locator('[data-cact="randomLook"]').count()), "Heldenerschaffung zeigt noch Würfeln für das Aussehen");
// jedes Volk: Meshy-Koerper oder Platzhalter, nie die alte Figur
const oldBodies = await p.evaluate(() => {
  const out = [];
  for (const race in SB.data.RACES)
    for (const gender of ["w", "m"]) {
      const d = SB.ui.withGen({ kind: "hero", race, gender, realm: SB.data.RACES[race].realm, cls: "schildritter", look: {}, gear: {} });
      const m = SB.R3D.buildFighter(d);
      if (!(m.pending || (m.parts && m.parts.rig))) out.push(race + "." + gender);
    }
  return out;
});
check(!oldBodies.length, "alte Figur statt Meshy-Körper oder Platzhalter: " + oldBodies.join(", "));
await p.fill("#heroName", "Pruefer");
await p.locator('[data-cact="start"]').click();
await p.waitForSelector("#topbar .me-sub");
await p.waitForTimeout(1500);
check(!(await p.locator('#dock [data-id="neu"]').count()), "Menüpunkt Neu prüfen gibt es noch");

// 2. Spielstand wie vor 5.4: Insel auf 3D, die alte Pruefseite noch nicht gesehen
await p.evaluate(() => {
  const S = SB.ui.S;
  S.settings.island = "3d";
  delete S.settings.inselV;
  delete S.settings.neuV;
  SB.ui.saveNow();
});
await p.reload();
await p.waitForSelector("#topbar .me-sub");
await p.waitForTimeout(1500);
check((await p.evaluate(() => SB.ui.panelId)) !== "neu", "die alte Prüfseite öffnet sich noch von selbst");
check((await p.evaluate(() => SB.ui.S.settings.island)) !== "3d", "Heimatinsel bleibt auf 3D-Modell stehen");
check((await p.evaluate(() => SB.ui.S.settings.neuV)) === undefined, "alte Einstellung der Prüfseite bleibt im Spielstand");
await p.evaluate(() => SB.ui.openPanel("einstellungen"));
check((await p.locator('[data-act="inselBesuch"]').count()) === (hasIsles ? 2 : 0), "Einstellungen zeigen nicht die zwei anderen Inseln zum Besuchen");
check((await p.locator('#panel [data-id="figurenprobe"]').count()) === 1, "Einstellungen zeigen die Figurenprobe nicht");
if (hasIsles) {
  check(await p.evaluate(() => !!(SB.ui.hub && SB.ui.hub.painted && SB.ui.hub.realm() === "midgard")), "Heimat ist nicht das Gemälde von Midgard");
  for (const r of ["albion", "hibernia"]) {
    await p.evaluate(() => SB.ui.openPanel("einstellungen"));
    await p.locator('[data-act="inselBesuch"][data-v="' + r + '"]').click();
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
    // Gegner ohne eigenen Eintrag (Chronik, Verliese, Nachtjagd) leihen sich die Figur eines Monsters ihrer Familie
    const others = [];
    for (const d of SB.data.DUNGEONS) d.bosses.forEach((x) => others.push(Object.assign({ boss: true }, x)));
    for (const r in SB.data.NIGHT_FOES) for (const x of SB.data.NIGHT_FOES[r]) others.push(x);
    const old = [];
    for (const f of others) {
      const m = SB.R3D.buildFighter(SB.ui.monDesc(f, f.boss, f.final));
      if (!(m.parts.clips || m.parts.fam) || !SB.ui.monLook(f)) old.push(f.name);
    }
    return { ok, out, ready: Object.keys(SB.ui.monReady || {}).length, others: others.length, old };
  });
  check(!r.old.length, "Gegner mit alter Figur: " + r.old.join(", "));
  check(r.ok, "Monsterdateien laden nicht");
  const bad = Object.entries(r.out).filter(([id, v]) => v === "alt" || (v.startsWith("bestie:") && v !== "bestie:" + id && !(id === "grauwolf" && v === "bestie:wolf")));
  check(!bad.length, "Monster ohne eigene Figur: " + bad.map(([id, v]) => id + "=" + v).join(", "));
  check(r.out.eiskobold === "skelett", "Eiskobold hat keine eigene Figur mit Bewegungen");
  console.log("Monsterfiguren:", Object.values(r.out).filter((v) => v === "skelett").length, "mit Skelett,", Object.values(r.out).filter((v) => v.startsWith("bestie")).length, "Bestien,", r.ready, "Familien geladen,", r.others - r.old.length, "von", r.others, "Verlies- und Nachtgegnern mit Meshy-Figur");
} else console.log("ohne gen-mon*.js: Monsterfiguren nicht geprüft");
// Gemalte Kampfkulissen (kulissen.js neben der Seite): Auftraege jedes Reiches kaempfen vor dem Gemaelde statt auf der
// gebauten Insel, Arena und Verliese vor ihrem eigenen (falls in der Datei)
const hasKul = existsSync(path.join(path.dirname(page0), "kulissen.js"));
if (hasKul) {
  const r = await p.evaluate(async () => {
    const ok = await SB.ui.loadKulissen();
    const out = {};
    for (const [realm, setting, dungeon] of [["albion", "quest"], ["midgard", "story"], ["hibernia", "quest"], ["midgard", "arena"], ["midgard", "dungeon", "rostwerk"]]) {
      const el = document.createElement("div");
      el.style.cssText = "position:fixed;left:0;top:0;width:640px;height:360px";
      document.body.appendChild(el);
      const b = SB.R3D.createBattle(el, { setting, realm, dungeon, left: SB.ui.heroDesc(SB.ui.S), right: SB.ui.monDesc(SB.engine.monById("eiskobold")), hp: [10, 10] });
      await new Promise((r) => setTimeout(r, 700));
      out[realm + "-" + setting] = !!(b._scene.background && b._scene.background.isTexture);
      b.dispose();
      el.remove();
    }
    return { ok, out, arena: !!globalThis.SB_KULISSEN.arena, rostwerk: !!globalThis.SB_KULISSEN.rostwerk };
  });
  check(r.ok, "Kampfkulissen laden nicht");
  for (const k of ["albion-quest", "midgard-story", "hibernia-quest"]) check(r.out[k], "Kampf " + k + " zeigt die gemalte Kulisse nicht");
  check(r.out["midgard-arena"] === r.arena, "Arena zeigt " + (r.arena ? "ihre Kulisse nicht" : "eine Kulisse ohne eigenes Bild"));
  check(r.out["midgard-dungeon"] === r.rostwerk, "Verlies zeigt " + (r.rostwerk ? "seine Kulisse nicht" : "eine Kulisse ohne eigenes Bild"));
} else console.log("ohne kulissen.js: Kampfkulissen nicht geprüft");

await browser.close();

if (errors.length) fails.push(...errors);
if (fails.length) {
  console.log("FEHLER:\n- " + fails.join("\n- "));
  process.exit(1);
}
console.log("OK: ohne alte Prüfseite und alte Figuren, gemalte Heimatinsel" + (hasIsles ? ", Besuch der Inseln" : "") + (hasKern ? ", eingebettete Figuren" : "") + (hasMon ? ", Monsterfiguren" : "") + (hasKul ? ", Kampfkulissen" : ""));
