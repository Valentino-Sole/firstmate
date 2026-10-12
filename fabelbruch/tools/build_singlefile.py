#!/usr/bin/env python3
"""Baut aus einer gebuendelten Auslieferung (tools/build_artifact.py) eine
einzelne HTML-Datei, die per Doppelklick direkt vom Dateisystem laeuft:
Skripte werden mit esbuild zu einem Modul gebuendelt, Stile, Fachdaten,
Symbole und Bildpakete als Base64 eingebettet und ueber einen fetch-Ersatz
ausgeliefert, sodass der Spielcode unveraendert bleibt.

Aufruf: python3 tools/build_singlefile.py <dist-ordner> <ausgabe.html>
Voraussetzung: esbuild im PATH.
"""
import base64
import json
import os
import subprocess
import sys

DIST = os.path.abspath(sys.argv[1])
OUT = os.path.abspath(sys.argv[2])


def b64(path):
    return base64.b64encode(open(path, "rb").read()).decode()


# 1. Skripte buendeln (dynamische import() werden mit eingebunden).
bundle = subprocess.run(
    ["esbuild", os.path.join(DIST, "js", "main.js"),
     "--bundle", "--format=esm", "--minify"],
    check=True, capture_output=True,
).stdout.decode()
assert "</script" not in bundle.lower(), "Buendel enthaelt Skript-Endmarke"

# 2. Eingebettete Dateien: Fachdaten, Pakete und ein erweitertes Manifest,
# das zusaetzlich die Symbole (sonst echte Einzeldateien) als Extra-Paket
# fuehrt, damit auch Symbolpfade ueber die Paketaufloesung laufen.
manifest = json.load(open(os.path.join(DIST, "packs", "manifest.json")))
payload = {}
for fn in sorted(os.listdir(os.path.join(DIST, "data"))):
    payload[f"data/{fn}"] = b64(os.path.join(DIST, "data", fn))
for name in manifest["packs"]:
    payload[f"packs/{name}"] = b64(os.path.join(DIST, "packs", name))

extra = bytearray()
extra_name = f"pack{len(manifest['packs'])}.wasm"
sym_dir = os.path.join(DIST, "assets", "symbole")
for fn in sorted(os.listdir(sym_dir)):
    data = open(os.path.join(sym_dir, fn), "rb").read()
    manifest["files"][f"assets/symbole/{fn}"] = [
        len(manifest["packs"]), len(extra), len(data), "image/svg+xml"]
    extra.extend(data)
manifest["packs"].append(extra_name)
payload[f"packs/{extra_name}"] = base64.b64encode(bytes(extra)).decode()
payload["packs/manifest.json"] = base64.b64encode(
    json.dumps(manifest).encode()).decode()

css = open(os.path.join(DIST, "css", "ui.css")).read()
assert "</style" not in css.lower()

shim = """
const EINGEBETTET = __PAYLOAD__;
const echteAbfrage = window.fetch ? window.fetch.bind(window) : null;
function dekodieren(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
window.fetch = (resource, options) => {
  let key = String(resource instanceof Request ? resource.url : resource);
  key = key.replace(/^\\.\\//, "").split(/[?#]/)[0];
  const idx = key.lastIndexOf("/data/");
  if (idx >= 0) key = key.slice(idx + 1);
  const pidx = key.lastIndexOf("/packs/");
  if (pidx >= 0) key = key.slice(pidx + 1);
  if (EINGEBETTET[key]) {
    const mime = key.endsWith(".json") ? "application/json" : "application/octet-stream";
    return Promise.resolve(new Response(dekodieren(EINGEBETTET[key]), {
      status: 200, headers: { "Content-Type": mime },
    }));
  }
  if (echteAbfrage) return echteAbfrage(resource, options);
  return Promise.reject(new Error("Nicht eingebettet: " + key));
};
"""
shim = shim.replace("__PAYLOAD__", json.dumps(payload))

html = f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fabelbruch</title>
<meta name="fabelbruch-packs" content="1">
<style>
{css}
</style>
</head>
<body>
<div id="app">
  <div id="stage">
    <canvas id="game-canvas" width="1600" height="900"></canvas>
    <div id="hud" class="hidden"></div>
    <div id="screen-root"></div>
    <div id="toast-root"></div>
  </div>
</div>
<noscript>Fabelbruch benötigt JavaScript. / Fabelbruch requires JavaScript.</noscript>
<script>{shim}</script>
<script type="module">{bundle}</script>
</body>
</html>
"""
open(OUT, "w").write(html)
print(f"Einzeldatei: {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB)")
