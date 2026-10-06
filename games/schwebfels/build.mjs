// Baut aus index.html und src/ zwei Einzeldateien:
//   dist/schwebfels.html  vollstaendige Seite zum Oeffnen im Browser
//   dist/artifact.html    Seiteninhalt ohne html/head/body-Huelle (fuer claude.ai Artifacts)
// Aufruf: node build.mjs
//   GEN_PACK=<datei>  anderes Paket mit erzeugten Figuren einbetten (Standard: assets/gen.pack, falls vorhanden)
// Die Modellpakete werden mit gzip verkleinert eingebettet; src/r3d-assets.js entpackt sie im Browser.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

// Modellpaket (assets/schwebfels.pack, aus assets-src/ gebaut) als Base64 einbetten
const packed = (file) => gzipSync(readFileSync(file), { level: 9 }).toString("base64");
let packJs = "";
try {
  packJs = "<script>globalThis.SB_PACK=\"" + packed(path.join(dir, "assets/schwebfels.pack")) + "\";</script>";
} catch (e) {
  console.warn("Hinweis: assets/schwebfels.pack fehlt, das Spiel nutzt die alten Figuren.");
}
// Erzeugte Figuren aus der Bild-zu-3D-Strecke (assets/gen.pack, aus assets-src/gen/ gebaut), falls vorhanden
try {
  const gen = process.env.GEN_PACK ? path.resolve(process.env.GEN_PACK) : path.join(dir, "assets/gen.pack");
  packJs += "<script>globalThis.SB_GENPACK=\"" + packed(gen) + "\";</script>";
  console.log("Erzeugte Figuren eingebettet:", path.relative(dir, gen));
} catch (e) {
  /* ohne erzeugte Figuren */
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

// DIST=<ordner> schreibt woandershin (z. B. fuer Tests mit eigenem Figurenpaket)
const out = process.env.DIST ? path.resolve(process.env.DIST) : path.join(dir, "dist");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "artifact.html"), content);
writeFileSync(path.join(out, "schwebfels.html"), full);
const bytes = Buffer.byteLength(content);
console.log(path.relative(dir, path.join(out, "schwebfels.html")), (Buffer.byteLength(full) / 1024).toFixed(0), "KB");
console.log(path.relative(dir, path.join(out, "artifact.html")), (bytes / 1024).toFixed(0), "KB");
// Artifacts duerfen hoechstens 16 MB gross sein
if (bytes > 15e6) console.warn("Achtung: artifact.html ist " + (bytes / 1e6).toFixed(1) + " MB gross, die Grenze fuer Artifacts liegt bei 16 MB.");
