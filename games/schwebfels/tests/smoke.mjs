// Rauchtest: alle Voelker, Geschlechter und Klassen, alle Monster und Bosse, alle Gegenstandsbilder, die drei
// Heimatinseln, das Heim in jeder Stufe, die Heldenansicht, jede Kampfbuehne und die Portraits bauen; jede Ausnahme
// und jede Warnung wird gemeldet. Wichtig, weil das Spiel bei Fehlern still auf einfachere Darstellungen ausweicht
// (Kachelansicht statt Insel, alte statt modellierter Figur).
// Aufruf: node build.mjs && node tests/smoke.mjs   (optional CDN_CACHE=<map.json>, PAGE=<andere Spieldatei>)
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
const { chromium } = pw;
const dir = path.dirname(fileURLToPath(import.meta.url));
const pageFile = process.env.PAGE ? path.resolve(process.env.PAGE) : path.join(dir, "..", "dist", "schwebfels.html");
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
if (process.env.CDN_CACHE) {
  const map = JSON.parse(readFileSync(process.env.CDN_CACHE, "utf8"));
  await page.route(/^https:\/\//, (r) => {
    const f = map[r.request().url()];
    if (!f) return r.abort();
    return r.fulfill({ path: f, contentType: f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "font/woff2", headers: { "access-control-allow-origin": "*" } });
  });
}
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if ((m.type() === "error" || m.type() === "warning") && !/deprecated/.test(m.text())) errs.push(m.type() + ": " + m.text().slice(0, 300)); });
await page.goto("file://" + pageFile);
await page.waitForFunction(() => globalThis.SB && SB.assets && SB.assets.ready);
const res = await page.evaluate(async () => {
  await SB.assets.ready; const R = SB.R3D; R.ready();
  const D = SB.data, E = SB.engine;
  const out = [];
  const box = () => { const el = document.createElement("div"); el.style.cssText = "position:fixed;left:0;top:0;width:320px;height:240px"; document.body.appendChild(el); return el; };
  const tryit = (label, fn) => { try { const r = fn(); if (r && r.dispose) r.dispose(); } catch (e) { out.push(label + ": " + e.message); } };
  let n = 0;
  // alle Voelker, Geschlechter, Klassen mit typischer Ausruestung
  for (const race in D.RACES) for (const g of ["m", "w"]) for (const cls in D.CLASSES) {
    const C = D.CLASSES[cls];
    tryit("Held " + race + "." + g + "." + cls, () => { const m = R.buildHero({ race, gender: g, cls, realm: C.realm, gear: { waffe: { base: (C.weapons || ["schwert"])[0], rarity: "selten", style: 1 }, nebenhand: C.offhand ? { base: C.offhand, rarity: "selten" } : null, helm: { base: C.helm || "helm", rarity: "selten" }, ruestung: { base: C.chest || "harnisch", rarity: "selten" } } }); for (const a of ["attack", "hit", "walk", "victory", "defeat"]) { m.play(a, 0.5); for (let i = 0; i < 8; i++) m.update(0.06); } n++; });
  }
  // alle Monster
  for (const mo of D.MONSTERS) tryit("Monster " + mo.id, () => { const m = R.buildFighter({ kind: "monster", arch: mo.arch, color: mo.color, accent: mo.accent, realm: "midgard" }); m.play("attack", 0.5); for (let i = 0; i < 8; i++) m.update(0.06); n++; });
  for (const d of D.DUNGEONS) for (const b of d.bosses) tryit("Boss " + b.name, () => { R.buildFighter({ kind: "monster", arch: b.arch, color: b.color, accent: b.accent, boss: true, realm: "albion" }); n++; });
  // Gegenstaende aller Grundarten und Seltenheiten als Bild
  for (const base in D.BASES) for (const rarity of ["gewoehnlich", "episch", "legendaer"]) tryit("Gegenstand " + base, () => { SB.icons.item({ base, rarity, style: 0 }); n++; });
  // Szenen
  for (const realm of ["albion", "midgard", "hibernia"]) tryit("Insel " + realm, () => R.createHub(box(), { quality: "niedrig", dayCycle: "zyklus", homeTier: 2, realm, onPick: () => {} }));
  // Heim in jeder Stufe mit Held und voller Einrichtung; die Kamera muss den Helden sehen (das Zelt der ersten Stufe
  // verdeckte ihn frueher ganz)
  const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const furn = {};
  for (const f of D.FURNITURE) furn[f.id] = f.levels.length - 1;
  for (const tier of [0, 1, 2, 3, 4]) {
    let home = null;
    tryit("Heim " + tier, () => { home = R.createHome(box(), {}); home.update({ tier, furn, realm: "midgard", hero: { kind: "hero", race: "nordmann", gender: "m", cls: "sturmhuene", realm: "midgard" } }); n++; });
    if (!home) continue;
    if (!home._view) { home.dispose(); continue; } // aeltere Fassung (PAGE=...) ohne Pruefhaken: nur bauen
    await frames();
    const { scene, camera, hero } = home._view();
    const T = globalThis.THREE;
    const target = new T.Vector3(); hero.obj.getWorldPosition(target); target.y += 1.0;
    const ray = new T.Raycaster(camera.position.clone(), target.clone().sub(camera.position).normalize());
    ray.camera = camera;
    const hit = ray.intersectObjects(scene.children, true).find((h) => h.object.visible && h.object.isMesh);
    let o = hit && hit.object; while (o && o !== hero.obj) o = o.parent;
    if (!o) out.push("Heim " + tier + ": Held von der Kamera aus verdeckt (zuerst getroffen: " + (hit ? hit.object.name || hit.object.type : "nichts") + ")");
    home.dispose();
  }
  tryit("Heldenansicht", () => { const v = R.createHeroView(box(), {}); v.set({ race: "albier", gender: "w", cls: "lichtweber" }); return v; });
  for (const setting of ["quest", "arena", "dungeon", "story"]) for (const realm of ["albion", "midgard", "hibernia"])
    tryit("Kampf " + setting + " " + realm, () => R.createBattle(box(), { setting, realm, left: { kind: "hero", race: "nordmann", cls: "sturmhuene", realm, gender: "m" }, right: { kind: "monster", arch: "wolf", color: "#777", accent: "#fc5", realm }, hp: [10, 10], dayTime: 0.4 }));
  // Portraits der Bewohner und Haendler
  const UI = SB.ui;
  if (UI && UI.NPC_LOOK) for (const id in UI.NPC_LOOK) tryit("Portrait " + id, () => { R.snapshot(Object.assign({ kind: "hero" }, UI.NPC_LOOK[id]), 64, true); n++; });
  return { n, out };
});
await browser.close();
console.log("gebaut:", res.n);
console.log("Ausnahmen:", res.out.length ? "\n- " + res.out.join("\n- ") : "keine");
const uniq = [...new Set(errs.filter((e) => !/fonts\.g|ERR_|net::/i.test(e)))];
console.log("Warnungen:", uniq.length ? "\n- " + uniq.slice(0, 30).join("\n- ") : "keine");
if (res.out.length || uniq.length) process.exit(1);
console.log("OK: alle Szenen und Figuren bauen ohne Fehler");
