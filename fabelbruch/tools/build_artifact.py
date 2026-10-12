#!/usr/bin/env python3
"""Baut eine buendelbare Auslieferung des Spiels fuer Hosting mit
Dateianzahl-Grenzen (z. B. claude.ai-Artefakte): Code, Daten und Symbole
werden kopiert, alle uebrigen zur Laufzeit genutzten Bilder in wenige
Paketdateien (packs/pack<N>.wasm, eigenes Rohformat) mit manifest.json
gebuendelt.
js/assetpack.js loest die Pfade im Browser wieder auf; ohne packs/-Ordner
laeuft das Spiel unveraendert von den Einzeldateien.

Aufruf: python3 tools/build_artifact.py <zielordner>
"""
import json
import mimetypes
import os
import shutil
import sys

GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.abspath(sys.argv[1])
PACK_LIMIT = 14 * 1024 * 1024  # unter der 15-MB-Grenze je Binaerdatei

# Zur Laufzeit per Pfad geladene Bildordner (siehe js/, Stand v0.4.3).
PACK_DIRS = ["arenen", "boss", "bosskarten", "diagramme", "held", "monster", "ui", "waffen"]
# Direkt kopiert: Code, Daten, Symbole (Favicon + datengetriebene icon_file).
COPY = ["index.html", "css", "js", "data", os.path.join("assets", "symbole")]

MIMES = {".webp": "image/webp", ".svg": "image/svg+xml", ".png": "image/png"}

if os.path.isdir(OUT):
    shutil.rmtree(OUT)
os.makedirs(os.path.join(OUT, "packs"))

for rel in COPY:
    src = os.path.join(GAME, rel)
    dst = os.path.join(OUT, rel)
    if os.path.isdir(src):
        shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__"))
    else:
        os.makedirs(os.path.dirname(dst) or OUT, exist_ok=True)
        shutil.copy2(src, dst)

packs = []
files = {}
buf = bytearray()


def flush():
    global buf
    if not buf:
        return
    # .wasm: von Artefakt-Hostern als Binaertyp ausgeliefert und nie
    # bildseitig umkodiert; der Inhalt ist unser eigenes Paketformat.
    name = f"pack{len(packs)}.wasm"
    with open(os.path.join(OUT, "packs", name), "wb") as fh:
        fh.write(buf)
    packs.append(name)
    buf = bytearray()


for d in PACK_DIRS:
    root = os.path.join(GAME, "assets", d)
    for fn in sorted(os.listdir(root)):
        path = os.path.join(root, fn)
        if not os.path.isfile(path):
            continue
        ext = os.path.splitext(fn)[1].lower()
        mime = MIMES.get(ext) or mimetypes.guess_type(fn)[0]
        if not mime:
            raise SystemExit(f"Unbekannter Dateityp: {path}")
        data = open(path, "rb").read()
        if len(buf) + len(data) > PACK_LIMIT:
            flush()
        files[f"assets/{d}/{fn}"] = [len(packs), len(buf), len(data), mime]
        buf.extend(data)
flush()

with open(os.path.join(OUT, "packs", "manifest.json"), "w") as fh:
    json.dump({"packs": packs, "files": files}, fh)

# Markierung in die Seite setzen: erst sie aktiviert die Paketaufloesung.
index_path = os.path.join(OUT, "index.html")
html = open(index_path).read()
marker = '<meta name="fabelbruch-packs" content="1">\n'
needle = "<title>"
assert needle in html and "fabelbruch-packs" not in html
open(index_path, "w").write(html.replace(needle, marker + needle, 1))

# Zusaetzlich eine Seitenvariante ohne eigenes Dokumentgeruest fuer Hoster,
# die die Seite selbst in ein Geruest einbetten (z. B. claude.ai-Artefakte).
ARTIFACT_PAGE = """<title>Fabelbruch</title>
<meta name="fabelbruch-packs" content="1">
<link rel="stylesheet" href="css/ui.css">
<style>#app { width: 100%; height: 100%; }</style>
<div id="app">
  <div id="stage">
    <canvas id="game-canvas" width="1600" height="900"></canvas>
    <div id="hud" class="hidden"></div>
    <div id="screen-root"></div>
    <div id="toast-root"></div>
  </div>
</div>
<noscript>Fabelbruch benötigt JavaScript. / Fabelbruch requires JavaScript.</noscript>
<script type="module" src="js/main.js"></script>
"""
open(os.path.join(OUT, "artifact.html"), "w").write(ARTIFACT_PAGE)

total = sum(
    os.path.getsize(os.path.join(dp, f))
    for dp, _, fns in os.walk(OUT) for f in fns
)
count = sum(len(fns) for _, _, fns in os.walk(OUT))
print(f"Auslieferung: {OUT}")
print(f"  Dateien gesamt: {count}, Groesse: {total / 1e6:.1f} MB")
print(f"  Pakete: {len(packs)}, gebuendelte Bilder: {len(files)}")
