// Prueft Figuren mit eigenem Skelett (Meshy-Strecke, src/r3d-rigged.js) im echten Spiel, ohne Blender und ohne
// fremde Modelle: baut eine kleine Prueffigur mit dem 24-Knochen-Skelett von Meshy und einfachen Bewegungen als
// gen.pack, bettet sie in eine eigene Spieldatei ein und prueft im Browser:
//   automatische Wahl nach Volk und Geschlecht, Ruhehaltung ab dem ersten Bild, Waffe, Schild und Helm an den Knochen,
//   Schlag genau am Ende der Spieldauer, Halten bei Niederlage, Sitzen auf Bankhoehe, farbige Portraits,
//   Kampfbuehne ohne Fehler, alte Figuren fuer Voelker ohne erzeugte Figur.
// Aufruf: node tests/rigged.mjs   (optional CDN_CACHE=<map.json> wie bei tests/e2e.mjs)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require("playwright");
} catch (e) {
  pw = require("/opt/node22/lib/node_modules/playwright");
}
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, "..");

/* ---------- Paketformat wie assets-src/pack.py ---------- */
function packWriter() {
  const parts = [];
  let size = 0;
  const add = (buf) => {
    const off = size;
    parts.push(buf);
    size += buf.length;
    const pad = (4 - (size % 4)) % 4;
    if (pad) {
      parts.push(Buffer.alloc(pad));
      size += pad;
    }
    return off;
  };
  return {
    f32: (a) => ({ $: ["f32", add(Buffer.from(new Float32Array(a).buffer)), a.length] }),
    u8: (a) => ({ $: ["u8", add(Buffer.from(Uint8Array.from(a))), a.length] }),
    i8: (a) => ({ $: ["i8", add(Buffer.from(Int8Array.from(a).buffer)), a.length] }),
    u16: (a) => ({ $: ["u16", add(Buffer.from(new Uint16Array(a).buffer)), a.length] }),
    q16: (a, scale) => {
      const m = a.reduce((x, v) => Math.max(x, Math.abs(v)), 0);
      const s = scale || Math.max(m / 32000, 1e-7);
      const q = Int16Array.from(a, (v) => Math.max(-32767, Math.min(32767, Math.round(v / s))));
      return { $: ["q16", add(Buffer.from(q.buffer)), a.length, s] };
    },
    img: (bytes, mime) => ({ $: ["img", add(bytes), bytes.length, mime] }),
    write(file, header) {
      const h = Buffer.from(JSON.stringify(header), "utf8");
      let head = Buffer.concat([Buffer.from("SBP1"), Buffer.from(new Uint32Array([h.length]).buffer), h]);
      head = Buffer.concat([head, Buffer.alloc((4 - (head.length % 4)) % 4)]);
      writeFileSync(file, Buffer.concat([head, ...parts]));
    },
  };
}

// kleines PNG in einer Farbe
function png(w, h, rgb) {
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rgb.forEach((v, k) => (raw[y * (w * 3 + 1) + 1 + x * 3 + k] = v));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/* ---------- Prueffigur mit Meshy-Skelett (T-Haltung, Blick +Z, links +X) ---------- */
const SK = [
  ["Hips", null, [0, 1.05, 0]],
  ["Spine02", "Hips", [0, 1.17, 0]],
  ["Spine01", "Spine02", [0, 1.3, 0]],
  ["Spine", "Spine01", [0, 1.43, 0]],
  ["neck", "Spine", [0, 1.6, 0]],
  ["Head", "neck", [0, 1.7, 0]],
  ["head_end", "Head", [0, 1.95, 0]],
  ["headfront", "Head", [0, 1.75, 0.12]],
];
for (const [w, x] of [["Left", 1], ["Right", -1]]) {
  SK.push(
    [w + "Shoulder", "Spine", [0.08 * x, 1.52, 0]],
    [w + "Arm", w + "Shoulder", [0.2 * x, 1.52, 0]],
    [w + "ForeArm", w + "Arm", [0.48 * x, 1.52, 0]],
    [w + "Hand", w + "ForeArm", [0.74 * x, 1.52, 0]],
    [w + "UpLeg", "Hips", [0.1 * x, 1.0, 0]],
    [w + "Leg", w + "UpLeg", [0.1 * x, 0.55, 0]],
    [w + "Foot", w + "Leg", [0.1 * x, 0.1, 0]],
    [w + "ToeBase", w + "Foot", [0.1 * x, 0.02, 0.12]]
  );
}
const NAMES = SK.map((b) => b[0]);
const PAR = SK.map((b) => (b[1] ? NAMES.indexOf(b[1]) : -1));
const POS = SK.map((b) => b[2]);
const I = (n) => NAMES.indexOf(n);

function figure() {
  // je Knochen ein Kasten bis zum ersten Kind (Hand und Kopf mit eigener Laenge), voll an diesen Knochen gebunden
  const pos = [];
  const idx = [];
  const si = [];
  const sw = [];
  const box = (b, a, c, r) => {
    const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const L = Math.hypot(...d) || 1;
    const u = d.map((v) => v / L);
    let s = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let v1 = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]];
    const l1 = Math.hypot(...v1);
    v1 = v1.map((v) => v / l1);
    const v2 = [u[1] * v1[2] - u[2] * v1[1], u[2] * v1[0] - u[0] * v1[2], u[0] * v1[1] - u[1] * v1[0]];
    const base = pos.length / 3;
    for (const e of [a, c]) for (const [p, q] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(e[0] + (v1[0] * p + v2[0] * q) * r, e[1] + (v1[1] * p + v2[1] * q) * r, e[2] + (v1[2] * p + v2[2] * q) * r);
      si.push(b, 0, 0, 0);
      sw.push(255, 0, 0, 0);
    }
    const F = [[0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
    for (const f of F) idx.push(base + f[0], base + f[2], base + f[1]);
  };
  NAMES.forEach((n, b) => {
    const kids = PAR.map((p, k) => (p === b ? k : -1)).filter((k) => k >= 0 && !/end|front/.test(NAMES[k]));
    const a = POS[b];
    if (n === "Head") box(b, a, [a[0], 1.95, a[2]], 0.1);
    else if (/Hand$/.test(n)) box(b, a, [a[0] + Math.sign(a[0]) * 0.18, a[1], a[2]], 0.04);
    else if (kids.length) box(b, a, POS[kids[0]], /Spine|Hips/.test(n) ? 0.14 : 0.05);
  });
  return { pos, idx, si, sw };
}

// Bewegungen: Drehungen als Quaternion je Bild (x, y, z, w), Hueftweg in Spielkoordinaten
const qa = (ax, ang) => {
  const s = Math.sin(ang / 2);
  return [ax[0] * s, ax[1] * s, ax[2] * s, Math.cos(ang / 2)];
};
const ARMS_DOWN = { LeftArm: qa([0, 0, 1], -1.2), RightArm: qa([0, 0, 1], 1.2) };
function clip(d, loop, hit, fn) {
  const fps = 30;
  const n = Math.round(d * fps) + 1;
  const frames = [];
  for (let f = 0; f < n; f++) frames.push(fn(f / (n - 1), (f / (n - 1)) * d));
  const bones = [...new Set(frames.flatMap((fr) => Object.keys(fr.r)))];
  const q = [];
  const hips = [];
  for (const fr of frames) {
    for (const b of bones) q.push(...(fr.r[b] || [0, 0, 0, 1]));
    hips.push(...(fr.h || [0, 1.05, 0]));
  }
  return { d, fps, n, bones, hipsY: 1.05, hit, loop, q, hips };
}
const bell = (u) => Math.sin(Math.PI * Math.min(1, Math.max(0, u)));
const CLIPS = {
  Combat_Stance: clip(2, true, [1, 1], (u) => ({ r: { ...ARMS_DOWN, Spine01: qa([1, 0, 0], 0.05 * Math.sin(u * 6.283)) } })),
  Walk_Fight_Forward: clip(1, true, [0.5, 0.5], (u) => ({ r: { ...ARMS_DOWN, LeftUpLeg: qa([1, 0, 0], 0.5 * Math.sin(u * 6.283)), RightUpLeg: qa([1, 0, 0], -0.5 * Math.sin(u * 6.283)) } })),
  Right_Hand_Sword_Slash: clip(1.2, false, [0.7, 0.6], (u) => ({ r: { LeftArm: ARMS_DOWN.LeftArm, RightArm: qa([0, 0, 1], 1.2 - 2.2 * bell(u / 0.58) * (u < 0.58 ? 1 : 0) - (u >= 0.58 ? 2.2 * (1 - (u - 0.58) / 0.42) : 0)) } })),
  Hit_Reaction: clip(1, false, [0.25, 0.25], (u) => ({ r: { ...ARMS_DOWN, Spine01: qa([1, 0, 0], -0.4 * bell(u)) } })),
  Stand_Dodge: clip(0.9, false, [0.35, 0.35], (u) => ({ r: ARMS_DOWN, h: [0.4 * bell(u), 1.05, 0] })),
  Sword_Parry: clip(0.8, false, [0.4, 0.4], (u) => ({ r: { ...ARMS_DOWN, RightForeArm: qa([0, 1, 0], -1.2 * bell(u)) } })),
  Charged_Spell_Cast: clip(1.4, false, [0.9, 0.8], (u) => ({ r: { LeftArm: qa([0, 0, 1], -1.2 + 1.6 * bell(u)), RightArm: qa([0, 0, 1], 1.2 - 1.6 * bell(u)) } })),
  Archery_Shot: clip(1.2, false, [0.8, 0.6], (u) => ({ r: { LeftArm: qa([0, 1, 0], 1.3 * bell(u)), RightArm: ARMS_DOWN.RightArm } })),
  Dead: clip(1.5, false, [0.6, 0.5], (u) => ({ r: { ...ARMS_DOWN, Hips: qa([1, 0, 0], -1.4 * Math.min(1, u * 1.4)) }, h: [0, 1.05 - 0.85 * Math.min(1, u * 1.4), 0] })),
  Victory_Cheer: clip(2, false, [0.5, 0.5], (u) => ({ r: { LeftArm: qa([0, 0, 1], 1.2 * bell(u)), RightArm: qa([0, 0, 1], -1.2 * bell(u)) } })),
  Chair_Sit_Idle_M: clip(2, true, [1, 1], () => ({ r: { ...ARMS_DOWN, LeftUpLeg: qa([1, 0, 0], -1.5), RightUpLeg: qa([1, 0, 0], -1.5), LeftLeg: qa([1, 0, 0], 1.5), RightLeg: qa([1, 0, 0], 1.5) }, h: [0, 0.62, 0] })),
};

function buildPack(file, gameBones) {
  const P = packWriter();
  const F = figure();
  const map = {};
  const MAPN = { hips: "Hips", spine: "Spine02", chest: "Spine", neck: "neck", head: "Head" };
  for (const gb of gameBones) {
    const [r, s] = gb.split(".");
    const w = s === "L" ? "Left" : "Right";
    const name = MAPN[gb] || { clavicle: w + "Shoulder", upperarm: w + "Arm", forearm: w + "ForeArm", hand: w + "Hand", thumb1: w + "Hand", thumb2: w + "Hand", fing1: w + "Hand", fing2: w + "Hand", thigh: w + "UpLeg", shin: w + "Leg", foot: w + "Foot", toe: w + "ToeBase" }[r];
    map[gb] = I(name);
  }
  const J = gameBones.flatMap((gb) => POS[map[gb]]);
  const S = {};
  for (const [s, x] of [["L", 1], ["R", -1]]) {
    const h = POS[I((x > 0 ? "Left" : "Right") + "Hand")];
    const fa = POS[I((x > 0 ? "Left" : "Right") + "ForeArm")];
    S["grip" + s] = { p: [h[0] + x * 0.09, h[1], h[2]], axis: [0, 0, 1], along: [x, 0, 0], size: 0.18 };
    S["arm" + s] = { p: [(h[0] + fa[0]) / 2, h[1], 0], along: [x, 0, 0], dorsal: [0, 1, 0] };
    S["ring" + s] = { p: [h[0] + x * 0.11, h[1], h[2]] };
  }
  S.head = { p: POS[I("Head")], top: [0, 1.95, 0], width: 0.2 };
  S.chest = { p: [0, 1.48, 0.14] };
  S.back = { p: [0, 1.5, -0.14] };
  S.belt = { p: [0, 1.12, 0.14], left: [0.14, 1.12, 0.02], right: [-0.14, 1.12, 0.02] };
  const clips = {};
  for (const [k, c] of Object.entries(CLIPS)) clips[k] = { d: c.d, fps: c.fps, n: c.n, bones: c.bones, hipsY: c.hipsY, hit: c.hit, loop: c.loop, q: P.q16(c.q, 1 / 32767), hips: P.q16(c.hips) };
  const gen = {
    probe: {
      kind: "rig",
      pos: P.q16(F.pos),
      uv: P.q16(F.pos.map(() => 0.5).slice(0, (F.pos.length / 3) * 2)),
      idx: P.u16(F.idx),
      skinI: P.u8(F.si),
      skinW: P.u8(F.sw),
      tex: P.img(png(4, 4, [200, 120, 60]), "image/png"),
      skel: { names: NAMES, parents: PAR, rest: P.f32(POS.flat()) },
      map,
      j: P.f32(J),
      top: 1.95,
      hipsY: 1.05,
      sockets: S,
      pieces: {},
      use: { race: "nordmann", gender: "m" },
    },
  };
  // zweite Figur fuer dasselbe Volk: die Frisur waehlt zwischen beiden
  gen.probe2 = Object.assign({}, gen.probe, { tex: P.img(png(4, 4, [90, 160, 90]), "image/png") });
  // Ruestungsteil wie aus fit_piece.py: Ring um den mittleren Wirbel, 3 cm ueber der Koerperoberflaeche
  const G = [12, 24, -0.25, 1.25];
  const rows = 5;
  const tto = [];
  const uvp = [];
  const pidx = [];
  for (let r = 0; r < rows; r++) {
    for (let a = 0; a < G[1]; a++) {
      const t = r / (rows - 1);
      const th = -Math.PI + ((a + 0.5) * 2 * Math.PI) / G[1];
      tto.push(t, th, 0.03, t, th, 0.03);
      uvp.push(a / G[1], t);
    }
  }
  for (let r = 0; r < rows - 1; r++) {
    for (let a = 0; a < G[1]; a++) {
      const i0 = r * G[1] + a;
      const i1 = r * G[1] + ((a + 1) % G[1]);
      pidx.push(i0, i1 + G[1], i1, i0, i0 + G[1], i1 + G[1]);
    }
  }
  const bits = new Uint8Array((G[0] * G[1]) / 8);
  for (let ti = 2; ti <= 10; ti++) for (let a = 0; a < G[1]; a++) bits[(ti * G[1] + a) >> 3] |= 1 << ((ti * G[1] + a) & 7);
  const nv = rows * G[1];
  const pieces = {
    probe_brust: {
      slot: "brust",
      forms: ["harnisch"],
      bones: ["Spine01"],
      grid: G,
      ref: "probe",
      uv: P.q16(uvp),
      idx: P.u16(pidx),
      bone: P.u8(new Array(nv * 2).fill(0)),
      tto: P.q16(tto),
      w: P.u8(new Array(nv).fill(255)),
      tex: P.img(png(4, 4, [90, 110, 140]), "image/png"),
      occ: { Spine01: P.u8(Array.from(bits)) },
    },
  };
  // Bestie wie aus beasts/from_glb.py: Rumpf und vier Beine als Kaesten, Rollen des Bestiensystems, eigene Textur
  const bb = [
    ["hips", -1, [0, 0.7, -0.4], [0, 0.7, 0], "spine"],
    ["spine", 0, [0, 0.7, 0], [0, 0.7, 0.4], "spine"],
    ["chest", 1, [0, 0.7, 0.4], [0, 0.8, 0.6], "spine"],
    ["head", 2, [0, 0.8, 0.6], [0, 0.85, 0.9], "head"],
  ];
  for (const [k, x, z, par] of [["FL", 0.15, 0.4, 2], ["FR", -0.15, 0.4, 2], ["BL", 0.15, -0.4, 0], ["BR", -0.15, -0.4, 0]]) {
    const i0 = bb.length;
    bb.push(["leg" + k + "1", par, [x, 0.65, z], [x, 0.4, z], "leg." + k], ["leg" + k + "2", i0, [x, 0.4, z], [x, 0.12, z], "leg." + k], ["leg" + k + "3", i0 + 1, [x, 0.12, z], [x, 0.02, z + 0.06], "leg." + k]);
  }
  const bp = [];
  const bi = [];
  const bsi = [];
  bb.forEach((b, j) => {
    const base = bp.length / 3;
    const r = b[4] === "spine" || b[4] === "head" ? 0.14 : 0.04;
    for (const e of [b[2], b[3]]) for (const [p, q] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bp.push(e[0] + p * r, e[1] + q * r, e[2]);
    for (let v = 0; v < 8; v++) bsi.push(j, 0, 0, 0);
    for (const f of [[0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]) bi.push(base + f[0], base + f[1], base + f[2]);
  });
  const nv2 = bp.length / 3;
  const beasts = {
    pruefwolf: {
      pos: P.q16(bp, 1 / 12000),
      nrm: P.i8(new Array(nv2).fill([0, 127, 0]).flat()),
      uv: P.q16(new Array(nv2 * 2).fill(0.5)),
      idx: P.u16(bi),
      col: P.u8(new Array(nv2).fill([255, 0, 0, 255]).flat()),
      skinI: P.u8(bsi),
      skinW: P.u8(new Array(nv2).fill([255, 0, 0, 0]).flat()),
      tex: P.img(png(4, 4, [140, 130, 120]), "image/png"),
      meta: { family: "pruefwolf", archs: ["wolf"], height: 0.95, headY: 0.85, length: 1.3, groups: [[0, 0, bi.length]], mats: ["skin"], matNames: ["skin"], features: {}, bones: bb, textured: true },
    },
  };
  P.write(file, { v: 1, gen, clips, pieces, beasts });
}

/* ---------- Bauen und im Browser pruefen ---------- */
const packFile = path.join(root, "assets", "schwebfels.pack");
const head = readFileSync(packFile);
const hl = head.readUInt32LE(4);
const gameBones = JSON.parse(head.subarray(8, 8 + hl).toString("utf8")).humans.bones.map((b) => b[0]);
const tmp = mkdtempSync(path.join(os.tmpdir(), "sb-rig-"));
buildPack(path.join(tmp, "probe.pack"), gameBones);
execFileSync("node", [path.join(root, "build.mjs")], { env: { ...process.env, GEN_PACK: path.join(tmp, "probe.pack"), DIST: tmp }, stdio: "pipe" });

const errors = [];
const browser = await pw.chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
if (process.env.CDN_CACHE) {
  const cdnMap = JSON.parse(readFileSync(process.env.CDN_CACHE, "utf8"));
  await page.route(/^https:\/\//, (r) => {
    const f = cdnMap[r.request().url()];
    if (!f) return r.abort();
    const type = f.endsWith(".css") ? "text/css" : f.endsWith(".js") ? "text/javascript" : "font/woff2";
    return r.fulfill({ path: f, contentType: type, headers: { "access-control-allow-origin": "*" } });
  });
}
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if ((m.type() === "error" || m.type() === "warning") && !/deprecated|fonts\.g|ERR_|net::/i.test(m.text())) errors.push(m.type() + ": " + m.text());
});
await page.goto("file://" + path.join(tmp, "schwebfels.html"));
await page.waitForFunction(() => globalThis.SB && SB.assets && SB.assets.ready, null, { timeout: 30000 });

const res = await page.evaluate(async () => {
  await SB.assets.ready;
  const R = SB.R3D;
  R.ready();
  const fails = [];
  const ok = (c, msg) => c || fails.push(msg);
  const step = async (m, a, d) => {
    let done = false;
    let snap = null;
    m.play(a, d).then(() => (done = true));
    for (let f = 0; f < 600 && !done; f++) {
      const c = m.parts.clips.cur;
      if (c && c.action === a) snap = { clip: c.c.name, t: c.act.time, rate: c.act.timeScale, hit: c.c.hit };
      m.update(1 / 60);
      await Promise.resolve();
    }
    return snap;
  };
  ok(R.rigged.auto("nordmann", "m") === "probe", "automatische Wahl fuer nordmann.m fehlt");
  ok(R.rigged.auto("nordmann", "m", 1) === "probe2" && R.rigged.auto("nordmann", "m", 2) === "probe", "Frisur waehlt nicht zwischen mehreren Figuren");
  ok(!R.rigged.auto("nordmann", "w"), "nordmann.w darf keine erzeugte Figur bekommen");
  const gear = { waffe: { base: "schwert", rarity: "selten", style: 1 }, nebenhand: { base: "schild", rarity: "selten", style: 0 }, helm: { base: "helm", rarity: "selten", style: 0 } };
  const m = R.buildHero({ race: "nordmann", gender: "m", cls: "sturmhuene", gear });
  const P = m.parts;
  ok(!!P.clips, "Held ohne Bewegungsspieler");
  ok(P.clips && P.clips.cur && P.clips.cur.action === "idle" && P.clips.cur.act.getEffectiveWeight() === 1, "keine volle Ruhehaltung ab dem ersten Bild");
  ok(!!P.weapon && P.weapon.parent === P.B["hand.R"], "Waffe nicht an der rechten Hand");
  ok(!!P.helmet && P.B.head.children.includes(P.helmet), "Helm nicht am Kopf");
  ok(P.B["hand.R"].name === "RightHand" && P.B.chest.name === "Spine", "Spielgelenke falsch zugeordnet");
  // Ruestungsteil passend zum Harnisch: angelegt, Haut darunter ausgeblendet, Abstand zur Achse plausibel, Bild aus dem Teil
  const armored = R.buildHero({ race: "nordmann", gender: "m", cls: "sturmhuene", gear: Object.assign({ ruestung: { base: "harnisch", rarity: "selten", style: 0 } }, gear) });
  ok((armored.parts.rigPieces || []).includes("probe_brust"), "Harnisch legt das Ruestungsteil nicht an");
  ok(armored.parts.mesh.geometry.index.count < m.parts.mesh.geometry.index.count, "Haut unter dem Ruestungsteil nicht ausgeblendet");
  const pm = armored.parts.body.children.find((o) => o.isSkinnedMesh && o !== armored.parts.mesh);
  if (pm) {
    const p = pm.geometry.attributes.position;
    const sp = armored.parts.B.chest.parent;
    const wp = new THREE.Vector3();
    sp.getWorldPosition(wp);
    let rmin = 1e9;
    let rmax = 0;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i) - wp.x, p.getZ(i) - wp.z);
      rmin = Math.min(rmin, r);
      rmax = Math.max(rmax, r);
    }
    ok(rmin > 0.15 && rmax < 0.35, "Ruestungsteil liegt nicht ueber dem Koerper (Abstand " + rmin.toFixed(2) + " bis " + rmax.toFixed(2) + ")");
  } else fails.push("kein Netz fuer das Ruestungsteil");
  ok(SB.icons.item({ base: "harnisch", rarity: "selten", style: 0 }).includes("<image"), "Gegenstandsbild kommt nicht aus dem Ruestungsteil");
  ok(!SB.icons.item({ base: "schwert", rarity: "selten", style: 0 }).includes("<image"), "Gegenstand ohne Ruestungsteil muss das Symbol behalten");
  // erzeugte Bestie stellt die Monsterart "wolf" dar, gebaute Bestien bleiben
  ok(R.beasts.familyOf("wolf") === "pruefwolf", "erzeugte Bestie wird fuer Woelfe nicht gewaehlt");
  ok(R.beasts.familyOf("schlund") === "schlund", "gebaute Bestie fuer Schlund verloren");
  const wolf = R.buildFighter({ kind: "monster", arch: "wolf", color: "#7a7470", accent: "#ffcf5a" });
  ok(wolf.parts.beast && wolf.parts.fam === "pruefwolf", "Wolf nicht aus der erzeugten Bestie gebaut");
  const legBefore = wolf.parts.B.legFL1.quaternion.clone();
  wolf.play("walk", 1);
  for (let i = 0; i < 20; i++) wolf.update(1 / 60);
  ok(!wolf.parts.B.legFL1.quaternion.equals(legBefore), "Bestie bewegt die Beine beim Gehen nicht");
  const left = R.buildHero({ race: "nordmann", gender: "w", cls: "sturmhuene" });
  ok(!left.parts.clips, "Voelker ohne erzeugte Figur muessen die alten Figuren behalten");
  for (let i = 0; i < 20; i++) m.update(1 / 60);
  const timing = [];
  for (const [a, d] of [["attack", 0.55], ["attack", 0.42], ["hit", 0.35], ["evade", 0.4], ["block", 0.4], ["shoot", 0.5], ["victory", 1.2]]) {
    const s = await step(m, a, d);
    timing.push({ a, s });
    if (!s) {
      fails.push("keine Bewegung fuer " + a);
      continue;
    }
    if (a !== "victory") {
      const want = s.hit[a === "hit" || a === "evade" ? 1 : 0];
      ok(Math.abs(s.t - want) <= 2.5 * s.rate / 60, a + ": Schlag bei " + s.t.toFixed(3) + " statt " + want);
    }
  }
  ok(timing[0].s && timing[0].s.clip === "Right_Hand_Sword_Slash", "Schwert waehlt nicht den Schwertschlag");
  // Niederlage bleibt liegen
  await step(m, "defeat", 0.9);
  for (let i = 0; i < 120; i++) m.update(1 / 60);
  ok(P.clips.cur.action === "defeat" && P.B.hips.position.y < 0.5, "Niederlage wird nicht gehalten");
  m.play("idle", 0.2);
  for (let i = 0; i < 60; i++) m.update(1 / 60);
  ok(P.clips.cur.action === "idle", "nach der Niederlage keine Ruhe");
  // Sitzen auf Bankhoehe
  m.hold = "sit";
  for (let i = 0; i < 40; i++) m.update(1 / 60);
  const hipsWorld = P.body.position.y + P.B.hips.position.y;
  ok(Math.abs(hipsWorld - 0.5) < 0.05, "Huefte beim Sitzen bei " + hipsWorld.toFixed(2) + " statt 0,5");
  m.hold = null;
  // Portrait farbig und nicht in T-Haltung
  const url = R.snapshot({ race: "nordmann", gender: "m", cls: "sturmhuene", kind: "hero" }, 128);
  const img = new Image();
  await new Promise((r) => {
    img.onload = r;
    img.src = url;
  });
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const g = cv.getContext("2d");
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, 128, 128).data;
  let lit = 0;
  let wide = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 200 && px[i] > 60) lit++;
    if (px[i + 3] > 200 && ((i / 4) % 128 < 8 || (i / 4) % 128 > 120)) wide++;
  }
  ok(lit > 300, "Portrait dunkel (" + lit + " helle Pixel)");
  // Kampfbuehne mit echtem Kampfablauf
  const E = SB.engine;
  const D = SB.data;
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0";
  document.body.appendChild(el);
  const hero = E.modelHeroFighter(6, "sturmhuene");
  Object.assign(hero, { name: "Held", race: "nordmann", gender: "m", gear, kind: "hero" });
  const mon = D.MONSTERS.find((x) => x.id === "moorschlund");
  const foe = E.monsterFighter(mon, 6, 1);
  const sim = E.simulate(hero, foe, 7);
  const b = R.createBattle(el, { setting: "quest", realm: "midgard", left: { kind: "hero", race: "nordmann", cls: "sturmhuene", realm: "midgard", gender: "m", gear }, right: { kind: "monster", arch: mon.arch, color: mon.color, accent: mon.accent, realm: "midgard" }, hp: [hero.maxHp, foe.maxHp], dayTime: 0.4 });
  const evs = sim.events || sim.log || [];
  for (let i = 0; i < Math.min(evs.length, 6); i++) await b.play(evs[i]);
  return { fails, timing: timing.map((x) => x.a + ":" + (x.s ? x.s.clip + "@" + x.s.t.toFixed(2) : "-")), lit, wide };
});
await browser.close();
const all = res.fails.concat(errors);
console.log("Bewegungen:", res.timing.join(", "));
if (all.length) {
  console.log("FEHLER:\n- " + all.join("\n- "));
  process.exit(1);
}
console.log("OK: Figuren mit eigenem Skelett laufen im Spiel");
