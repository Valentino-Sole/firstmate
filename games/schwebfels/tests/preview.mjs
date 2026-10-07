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
    // erzeugte Figuren liegen in einer eigenen Datei je Reich (dist/gen-<reich>.js) und werden erst geladen
    if ((desc.hero && desc.hero.gen) || desc.gen) await SB.assets.loadGen(desc.genRealm || "midgard");
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
      if (desc.camBone) {
        // Nahaufnahme, die einem Knochen folgt: [knochen, versatz x, y, z, sichtwinkel]
        const [bn, ox, oy, oz, fov] = desc.camBone;
        const m = v.model;
        const upd = m.update.bind(m);
        const p = v.camera.position.clone();
        m.update = (dt) => {
          upd(dt);
          m.obj.updateMatrixWorld(true);
          m.parts.B[bn].getWorldPosition(p);
          v.camera.position.set(p.x + ox, p.y + oy, p.z + oz);
          v.camera.lookAt(p);
        };
        if (fov) {
          v.camera.fov = fov;
          v.camera.updateProjectionMatrix();
        }
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
      const b = R.createBattle(el, { setting: desc.setting || "quest", realm: desc.hero.realm, left: { kind: "hero", race: hero.race, cls: hero.cls, realm: desc.hero.realm, gender: hero.gender, look: hero.look, gear: hero.gear, gen: desc.hero.gen, genGear: desc.hero.genGear }, right: { kind: "monster", arch: mon.arch, color: mon.color, accent: mon.accent, realm: "hibernia" }, hp: [hero.maxHp, foe.maxHp], dayTime: 0.35 });
      globalThis.__b = b;
      globalThis.__ev = sim.events || sim.log || [];
      (async () => {
        await new Promise((r) => setTimeout(r, 600));
        const evs = globalThis.__ev;
        for (let i = 0; i < Math.min(evs.length, desc.events || 0); i++) await b.play(evs[i]);
        globalThis.__ready = true;
      })();
    } else if (mode === "gegenstand") {
      // Raster einzelner Gegenstaende: Zeilen = Formen, Spalten = Seltenheiten
      const T = THREE;
      const renderer = new T.WebGLRenderer({ antialias: true });
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.1;
      el.appendChild(renderer.domElement);
      const scene = new T.Scene();
      scene.background = new T.Color("#d8d2c4");
      scene.environment = R.envMap(renderer);
      scene.add(new T.HemisphereLight("#ffffff", "#5a5048", 1.1));
      const key = new T.DirectionalLight("#fff4e0", 2.2);
      key.position.set(2, 4, 5);
      scene.add(key);
      const rows = desc.rows;
      const cols = desc.cols || ["gewoehnlich", "ungewoehnlich", "selten", "episch", "legendaer"];
      const cw = desc.cell || 0.5;
      const ch = desc.cellH || cw * 1.4;
      rows.forEach((row, i) => {
        cols.forEach((rar, j) => {
          const pal = R.gear.palette({ tint: row.tint, rarity: rar }, row.culture || "midgard");
          pal.row = j;
          const g = R.items.build(row.base, row.variant || 0, rar, row.culture || "midgard", pal, { o: row.o || 0 });
          if (!g) return;
          if (row.rot) g.rotation.set(row.rot[0], row.rot[1], row.rot[2]);
          const box = new T.Box3().setFromObject(g);
          const c = box.getCenter(new T.Vector3());
          const sz = box.getSize(new T.Vector3());
          // row.s: feste Vergroesserung, row.oy: Bildmitte auf dieser Hoehe des Gegenstands (Nahansicht)
          const sc = row.s || Math.min(cw * 0.9 / Math.max(sz.x, sz.z * 0.6, 1e-3), ch * 0.9 / Math.max(sz.y, 1e-3));
          const holder = new T.Group();
          if (row.oy != null) c.set(0, row.oy, 0);
          g.position.sub(c);
          holder.add(g);
          holder.scale.setScalar(sc);
          holder.position.set((j - (cols.length - 1) / 2) * cw, -(i - (rows.length - 1) / 2) * ch, 0);
          holder.rotation.y = desc.spin != null ? desc.spin : 0.5;
          scene.add(holder);
        });
      });
      const W = cols.length * cw;
      const Hh = rows.length * ch;
      const cam = new T.OrthographicCamera(-W / 2, W / 2, Hh / 2, -Hh / 2, -10, 10);
      cam.position.set(0, 0, 5);
      renderer.setSize(el.clientWidth, el.clientHeight);
      const asp = el.clientWidth / el.clientHeight;
      if (W / Hh > asp) {
        cam.top = W / asp / 2;
        cam.bottom = -W / asp / 2;
      } else {
        cam.left = (-Hh * asp) / 2;
        cam.right = (Hh * asp) / 2;
      }
      cam.updateProjectionMatrix();
      const loop = () => {
        renderer.render(scene, cam);
        requestAnimationFrame(loop);
      };
      loop();
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
