// Vorschau einzelner Figuren in der echten Spielansicht (Charakterbogen-Szene oder Kampfbuehne).
// Aufruf: node build.mjs && node tests/preview.mjs <bild.png> '<json-beschreibung>' [held|kampf] [breite] [hoehe] [pose] [zeit]
//   json: {"hero": {...Beschreibung wie R.buildHero...}, "foe": {...}} oder direkt eine Heldenbeschreibung
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch (e) {
  pw = require("/opt/node22/lib/node_modules/playwright");
}
const dir = path.dirname(fileURLToPath(import.meta.url));
const [out, json, mode = "held", w = "560", h = "720", pose = "", at = "1.6"] = process.argv.slice(2);
const desc = JSON.parse(json);
const browser = await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") errors.push(m.type() + ": " + m.text());
});
await page.goto("file://" + path.join(dir, "..", "dist", "schwebfels.html"));
await page.waitForFunction(() => globalThis.SB && SB.assets && (SB.assets.data || SB.assets.error), null, { timeout: 30000 });
const info = await page.evaluate(
  async ({ desc, mode, pose }) => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:99999;background:#1b1820";
    document.body.appendChild(el);
    const R = SB.R3D;
    const t0 = performance.now();
    if (desc.only) {
      R.gear.debugOnly = desc.only;
      R.gear.debugHideBody = !!desc.hideBody;
    }
    if (mode === "held") {
      const v = R.createHeroView(el, { distance: desc.distance || 7.2, lookY: desc.lookY });
      v.set(desc.hero || desc);
      globalThis.__v = v;
      if (desc.props) Object.assign(v.model, desc.props);
      if (desc.cam) {
        v.camera.position.set(desc.cam[0], desc.cam[1], desc.cam[2]);
        v.camera.lookAt(desc.cam[3], desc.cam[4], desc.cam[5]);
        if (desc.cam[6]) {
          v.camera.fov = desc.cam[6];
          v.camera.updateProjectionMatrix();
        }
      }
      if (desc.rotY != null) {
        // feste Drehung statt Ziehen
        const m = v.model;
        const upd = m.update.bind(m);
        m.update = (dt) => {
          upd(dt);
          m.obj.rotation.y = desc.rotY;
        };
      }
      if (pose) setTimeout(() => v.play(pose, 2.5), 300);
    } else if (mode === "bestie") {
      const v = R.createHeroView(el, { distance: desc.distance || 7.2, lookY: desc.lookY });
      v.set(Object.assign({ kind: "monster" }, desc.foe));
      globalThis.__v = v;
      if (desc.cam) {
        v.camera.position.set(desc.cam[0], desc.cam[1], desc.cam[2]);
        v.camera.lookAt(desc.cam[3], desc.cam[4], desc.cam[5]);
      }
      if (desc.rotY != null) {
        const m = v.model;
        const upd = m.update.bind(m);
        m.update = (dt) => {
          upd(dt);
          m.obj.rotation.y = desc.rotY;
        };
      }
      if (pose) setTimeout(() => v.play(pose, 2.5), 300);
    } else if (mode === "kampf") {
      // echte Kampfbuehne mit echtem Kampfablauf aus der Spiellogik
      const E = SB.engine;
      const D = SB.data;
      const hero = E.modelHeroFighter(desc.level || 6, desc.hero.cls);
      Object.assign(hero, { name: "Held", race: desc.hero.race, gender: desc.hero.gender, look: desc.hero.look, gear: desc.hero.gear, kind: "hero" });
      const mon = D.MONSTERS.find((x) => x.id === (desc.monster || "moorschlund"));
      const foe = E.monsterFighter(mon, desc.level || 6, 1);
      const sim = E.simulate(hero, foe, 7);
      const b = R.createBattle(el, { setting: desc.setting || "quest", realm: desc.hero.realm, left: { kind: "hero", race: hero.race, cls: hero.cls, realm: desc.hero.realm, gender: hero.gender, look: hero.look, gear: hero.gear }, right: { kind: "monster", arch: mon.arch, color: mon.color, accent: mon.accent, realm: "hibernia" }, hp: [hero.maxHp, foe.maxHp], dayTime: 0.35 });
      globalThis.__b = b;
      globalThis.__ev = sim.events || sim.log || [];
      (async () => {
        await new Promise((r) => setTimeout(r, 600));
        const evs = globalThis.__ev;
        for (let i = 0; i < Math.min(evs.length, desc.events || 0); i++) await b.play(evs[i]);
        globalThis.__ready = true;
      })();
    } else {
      globalThis.__fx = { el };
    }
    return { ms: performance.now() - t0, human: !!(R.human && R.human.ok()) };
  },
  { desc, mode, pose }
);
await page.waitForTimeout(+at * 1000);
await page.screenshot({ path: out });
console.log(JSON.stringify(info), errors.slice(0, 8).join("\n"));
await browser.close();
