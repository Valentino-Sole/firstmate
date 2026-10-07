// Baut aus index.html und src/ zwei Einzeldateien:
//   dist/schwebfels.html  vollstaendige Seite zum Oeffnen im Browser
//   dist/artifact.html    Seiteninhalt ohne html/head/body-Huelle (fuer claude.ai Artifacts)
//   dist/gen-<reich>.js   erzeugte Figuren je Reich zum Nachladen (nur wenn assets/gen-<reich>.pack vorliegt;
//                         beim Veroeffentlichen als Zusatzdatei mit gleichem Namen neben die Seite legen)
// Aufruf: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
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
let packJs = "";
try {
  packJs = "<script>globalThis.SB_PACK=\"" + readFileSync(path.join(dir, "assets/schwebfels.pack")).toString("base64") + "\";</script>";
} catch (e) {
  console.warn("Hinweis: assets/schwebfels.pack fehlt, das Spiel nutzt die alten Figuren.");
}
// Erzeugte Figuren aus der Bild-zu-3D-Strecke (assets/gen-<reich>.pack, aus assets-src/gen/ gebaut): je Reich eine
// eigene Datei dist/gen-<reich>.js, die das Spiel erst bei Bedarf nachlaedt (die Seite bleibt unter 16 MB)
mkdirSync(path.join(dir, "dist"), { recursive: true });
const genFiles = [];
for (const f of readdirSync(path.join(dir, "assets"))) {
  const m = /^gen-([a-z]+)\.pack$/.exec(f);
  if (!m) continue;
  const js = "globalThis.SB_GEN_" + m[1].toUpperCase() + '="' + readFileSync(path.join(dir, "assets", f)).toString("base64") + '";\n';
  writeFileSync(path.join(dir, "dist", "gen-" + m[1] + ".js"), js);
  genFiles.push("dist/gen-" + m[1] + ".js " + (js.length / 1024).toFixed(0) + " KB");
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

mkdirSync(path.join(dir, "dist"), { recursive: true });
writeFileSync(path.join(dir, "dist/artifact.html"), content);
writeFileSync(path.join(dir, "dist/schwebfels.html"), full);
console.log("dist/schwebfels.html", (full.length / 1024).toFixed(0), "KB");
console.log("dist/artifact.html", (content.length / 1024).toFixed(0), "KB");
for (const g of genFiles) console.log(g);
