// Baut aus index.html und src/ zwei Einzeldateien:
//   dist/schwebfels.html  vollstaendige Seite zum Oeffnen im Browser
//   dist/artifact.html    Seiteninhalt ohne html/head/body-Huelle (fuer claude.ai Artifacts)
//   dist/gen-<reich>.js   erzeugte Figuren je Reich zum Nachladen (nur wenn assets/gen-<reich>.pack vorliegt;
//                         beim Veroeffentlichen als Zusatzdatei mit gleichem Namen neben die Seite legen)
// Aufruf: node build.mjs
//   GEN_PACK=<datei>  anderes Paket mit erzeugten Figuren einbetten (Standard: assets/gen.pack, falls vorhanden)
//   INSELN_DIR=<ordner>  Inselbilder <reich>.webp (albion, midgard, hibernia) fuer die gemalten Heimatinseln
//                     (Standard: assets/inseln, falls vorhanden); ohne Bilder bleibt die 3D-Insel
//   KULISSEN_DIR=<ordner>  Kampfkulissen <ort>.webp (albion, midgard, hibernia, arena, Verlies-IDs), werden zu kulissen.js neben der Seite
//                     (Standard: assets/kulissen, falls vorhanden); ohne Bilder bleibt die gebaute Kampfinsel
//   SPLIT=1           Modellpakete nicht in die Seite, sondern als eigene Dateien daneben (dist/packs/*.js); fuer ein
//                     Artifact mit mehreren Dateien, wenn die Seite sonst ueber 16 MB kaeme (jede Datei hoechstens 16 MB)
//   assets/gen-<reich>.pack  erzeugte Figuren je Reich (Meshy-Strecke des Hauptzweigs): werden zu <dist>/gen-<reich>.js,
//                     die das Spiel erst bei Bedarf nachlaedt; beim Veroeffentlichen als Zusatzdatei gleichen Namens mitgeben
//   GEN_KERN=<voelker>  Koerper dieser Voelker (Standard "nordmann,trollblut", die waehlbaren) zusaetzlich direkt in die
//                     Seite, damit die eigenen Helden nicht von der Zusatzdatei abhaengen; leer = nichts einbetten
// Die Modellpakete werden mit gzip verkleinert eingebettet; src/r3d-assets.js entpackt sie im Browser.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(dir, p), "utf8");
const html = read("index.html");

const safeScript = (code) => code.replace(/<\/script/gi, "<\\/script");
const css = read("src/styles.css");
const scripts = [...html.matchAll(/<script src="(src\/[^"]+)"><\/script>/g)].map((m) => m[1]);
const cdn = [...html.matchAll(/<script src="(https:[^"]+)"><\/script>/g)].map((m) => m[1]);
const fonts = [...html.matchAll(/<link rel="stylesheet" href="(https:[^"]+)">/g)].map((m) => m[1]);
const bodyMarkup = html.slice(html.indexOf("<body>") + 6, html.indexOf("<!-- BUILD:SCRIPTS -->")).trim();

// Modellpaket lesen und Teile davon neu packen (Format wie src/r3d-assets.js: "SBP1", Kopflaenge, JSON-Kopf, Daten;
// {"$": [art, versatz, anzahl, ...]} verweist in die Daten)
const ELEM = { f32: 4, u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, q16: 2, uv16: 2, img: 1 };
function readPack(buf) {
  if (buf.readUInt32LE(0) !== 0x31504253) throw new Error("Modellpaket: falsche Kennung");
  const hl = buf.readUInt32LE(4);
  const header = JSON.parse(buf.subarray(8, 8 + hl).toString("utf8"));
  let base = 8 + hl;
  base += (4 - (base % 4)) % 4;
  return { header, blob: buf.subarray(base) };
}
// entries: { schluessel: [paket, eintrag] } -> neues Paket { gen: { schluessel: eintrag } }
function subPack(entries) {
  const parts = [];
  let off = 0;
  const remap = (pk, o) => {
    if (Array.isArray(o)) return o.map((x) => remap(pk, x));
    if (o && typeof o === "object") {
      if (o.$) {
        const d = o.$.slice();
        const n = d[2] * ELEM[d[0]];
        off += (4 - (off % 4)) % 4;
        parts.push([off, pk.blob.subarray(d[1], d[1] + n)]);
        d[1] = off;
        off += n;
        return { $: d };
      }
      const r = {};
      for (const k in o) r[k] = remap(pk, o[k]);
      return r;
    }
    return o;
  };
  const gen = {};
  for (const k in entries) gen[k] = remap(entries[k][0], entries[k][1]);
  const head = Buffer.from(JSON.stringify({ v: 1, gen }), "utf8");
  const base = 8 + head.length + ((4 - ((8 + head.length) % 4)) % 4);
  const outBuf = Buffer.alloc(base + off);
  outBuf.writeUInt32LE(0x31504253, 0);
  outBuf.writeUInt32LE(head.length, 4);
  head.copy(outBuf, 8);
  for (const [o, b] of parts) b.copy(outBuf, base + o);
  return outBuf;
}

// DIST=<ordner> schreibt woandershin (z. B. fuer Tests mit eigenem Figurenpaket)
const out = process.env.DIST ? path.resolve(process.env.DIST) : path.join(dir, "dist");
mkdirSync(out, { recursive: true });
const split = !!process.env.SPLIT;
const packFiles = [];

// Modellpaket (assets/schwebfels.pack, aus assets-src/ gebaut) als Base64 einbetten oder mit SPLIT als eigene Datei
const packed = (file) => gzipSync(readFileSync(file), { level: 9 }).toString("base64");
const packTag = (name, global, file) => {
  const js = "globalThis." + global + '="' + packed(file) + '";';
  if (!split) return "<script>" + js + "</script>";
  mkdirSync(path.join(out, "packs"), { recursive: true });
  writeFileSync(path.join(out, "packs", name + ".js"), js);
  packFiles.push(["packs/" + name + ".js", Buffer.byteLength(js)]);
  return '<script src="packs/' + name + '.js"></script>';
};
let packJs = "";
try {
  packJs = packTag("schwebfels", "SB_PACK", path.join(dir, "assets/schwebfels.pack"));
} catch (e) {
  console.warn("Hinweis: assets/schwebfels.pack fehlt, das Spiel nutzt die alten Figuren.");
}
// Erzeugte Figuren aus der Bild-zu-3D-Strecke (assets/gen.pack, aus assets-src/gen/ gebaut), falls vorhanden
try {
  const gen = process.env.GEN_PACK ? path.resolve(process.env.GEN_PACK) : path.join(dir, "assets/gen.pack");
  readFileSync(gen);
  packJs += packTag("gen", "SB_GENPACK", gen);
  console.log("Erzeugte Figuren eingebettet:", path.relative(dir, gen));
} catch (e) {
  /* ohne erzeugte Figuren */
}
// Erzeugte Figuren aus der Bild-zu-3D-Strecke (assets/gen-<reich>.pack, aus assets-src/gen/ gebaut): je Reich eine
// eigene Datei dist/gen-<reich>.js, die das Spiel erst bei Bedarf nachlaedt (die Seite bleibt unter 16 MB)
const genFiles = [];
const kernRaces = (process.env.GEN_KERN ?? "nordmann,trollblut").split(",").map((x) => x.trim()).filter(Boolean);
const kern = {};
for (const f of readdirSync(path.join(dir, "assets"))) {
  const m = /^gen-([a-z0-9]+)\.pack$/.exec(f);
  if (!m) continue;
  const buf = readFileSync(path.join(dir, "assets", f));
  // mit gzip verkleinert (Ausruestung und Monster sind sonst ein Drittel groesser); A.loadGen entpackt im Browser
  const js = "globalThis.SB_GEN_" + m[1].toUpperCase() + '="' + gzipSync(buf, { level: 9 }).toString("base64") + '";\n';
  writeFileSync(path.join(out, "gen-" + m[1] + ".js"), js);
  genFiles.push(path.relative(dir, path.join(out, "gen-" + m[1] + ".js")) + " " + (js.length / 1024).toFixed(0) + " KB (eigene Datei, beim Veroeffentlichen als gen-" + m[1] + ".js unter files angeben)");
  const pk = readPack(buf);
  for (const k in pk.header.gen || {}) if (kernRaces.some((r) => k.startsWith(r + "-"))) kern[k] = [pk, pk.header.gen[k]];
}
// Kern: Koerper der waehlbaren Voelker als eigenes kleines Paket direkt in der Seite (src/r3d-assets.js: SB_GENKERN)
if (Object.keys(kern).length) {
  const sub = subPack(kern);
  packJs += "<script>globalThis.SB_GENKERN=\"" + gzipSync(sub, { level: 9 }).toString("base64") + "\";</script>";
  console.log("Neue Figuren direkt in der Seite:", Object.keys(kern).sort().join(", "));
}
// Gemalte Heimatinseln (src/hub-painted.js): Bilder als Data-URI, mit SPLIT als eigene Datei
{
  const isl = {};
  for (const r of ["albion", "midgard", "hibernia"]) {
    try {
      const src = process.env.INSELN_DIR ? path.resolve(process.env.INSELN_DIR) : path.join(dir, "assets/inseln");
      isl[r] = "data:image/webp;base64," + readFileSync(path.join(src, r + ".webp")).toString("base64");
    } catch (e) {
      /* ohne Bild bleibt die 3D-Insel */
    }
  }
  if (Object.keys(isl).length) {
    const js = "globalThis.SB_INSELN=" + JSON.stringify(isl) + ";";
    if (split) {
      mkdirSync(path.join(out, "packs"), { recursive: true });
      writeFileSync(path.join(out, "packs", "inseln.js"), js);
      packFiles.push(["packs/inseln.js", Buffer.byteLength(js)]);
      packJs += '<script src="packs/inseln.js"></script>';
    } else packJs += "<script>" + js + "</script>";
    console.log("Inselbilder eingebettet:", Object.keys(isl).join(", "));
  } else if (genFiles.length) {
    // eine Fassung mit Meshy-Figuren ist zum Veroeffentlichen gedacht; ohne Inselbilder zeigt sie die alte 3D-Insel
    console.warn("Hinweis: keine Inselbilder (INSELN_DIR), die Seite zeigt die 3D-Insel statt der gemalten Heimatinseln.");
  }
}
// Gemalte Kampfkulissen (Kampfkulissen v07, src/r3d-scenes.js): Bilder <reich>.webp als eigene Datei kulissen.js
// neben der Seite (zusammen gut 1,4 MB, die Seite bliebe sonst nicht unter 16 MB); das Spiel laedt sie im Hintergrund
{
  const kul = {};
  const src = process.env.KULISSEN_DIR ? path.resolve(process.env.KULISSEN_DIR) : path.join(dir, "assets/kulissen");
  // drei Reiche, Arena und je Verlies eins (Dateiname = Reich, "arena" oder Verlies-ID), dazu die gemalten Heime
  // (Housing v08 des Kapitaens, heim-<reich>)
  for (const r of ["albion", "midgard", "hibernia", "arena", "pilzgrotte", "glockenstadt", "rostwerk", "frostspitzen", "laternengruft", "sturmkern", "heim-albion", "heim-midgard", "heim-hibernia"]) {
    try {
      kul[r] = "data:image/webp;base64," + readFileSync(path.join(src, r + ".webp")).toString("base64");
    } catch (e) {
      /* ohne Bild bleibt die gebaute Kampfinsel */
    }
  }
  if (Object.keys(kul).length) {
    const js = "globalThis.SB_KULISSEN=" + JSON.stringify(kul) + ";";
    writeFileSync(path.join(out, "kulissen.js"), js);
    genFiles.push(path.relative(dir, path.join(out, "kulissen.js")) + " " + (js.length / 1024).toFixed(0) + " KB (Kampfkulissen und Heime " + Object.keys(kul).join(", ") + ", beim Veroeffentlichen als kulissen.js unter files angeben)");
  }
}
const inlineJs = packJs + "\n" + scripts.map((s) => "<script>/* " + s + " */\n" + safeScript(read(s)) + "\n</script>").join("\n");
const cdnTags = cdn.map((u) => '<script src="' + u + '"></script>').join("\n");
const fontTags = fonts.map((u) => '<link rel="stylesheet" href="' + u + '">').join("\n");

const content = [
  "<title>Helden von Schwebfels</title>",
  "<style>\n" + css + "\n</style>",
  fontTags,
  bodyMarkup,
  cdnTags,
  inlineJs,
].join("\n");

const full =
  '<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
  "<title>Helden von Schwebfels</title>\n" + fontTags + "\n<style>\n" + css + "\n</style>\n</head>\n<body>\n" + bodyMarkup + "\n" + cdnTags + "\n" + inlineJs + "\n</body>\n</html>\n";

writeFileSync(path.join(out, "artifact.html"), content);
writeFileSync(path.join(out, "schwebfels.html"), full);
const bytes = Buffer.byteLength(content);
console.log(path.relative(dir, path.join(out, "schwebfels.html")), (Buffer.byteLength(full) / 1024).toFixed(0), "KB");
console.log(path.relative(dir, path.join(out, "artifact.html")), (bytes / 1024).toFixed(0), "KB");
// Artifacts duerfen hoechstens 16 MB gross sein (die Seite und jede weitere Datei)
if (bytes > 15e6) console.warn("Achtung: artifact.html ist " + (bytes / 1e6).toFixed(1) + " MB gross, die Grenze fuer Artifacts liegt bei 16 MB." + (split ? "" : " Abhilfe: SPLIT=1"));
for (const [f, n] of packFiles) {
  console.log(path.relative(dir, path.join(out, f)), (n / 1024).toFixed(0), "KB (eigene Datei, beim Veroeffentlichen unter files angeben)");
  if (n > 15e6) console.warn("Achtung: " + f + " ist " + (n / 1e6).toFixed(1) + " MB gross, die Grenze je Datei liegt bei 16 MB.");
}
for (const g of genFiles) console.log(g);
