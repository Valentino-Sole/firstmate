"""Lichtumgebungen fuer den Kampf (0.81): HDRIs von Poly Haven (CC0, https://polyhaven.com) zu kleinen Panoramabildern.

Aufruf (Blender als Python-Modul, braucht Netz zu api.polyhaven.com und dl.polyhaven.org):
  <venv mit bpy>/bin/python assets-src/umgebung.py [<ziel, Standard assets/kulissen>]

Je Kulisse ein HDRI (UMGEBUNG unten), geladen in 1k, verkleinert auf 512 x 256, Helligkeit so normiert, dass das
95. Perzentil der Leuchtdichte bei 0,85 liegt (die Sonne darf ausbrennen), sRGB, WebP. Ergebnis env-<ort>.webp,
build.mjs packt es in kulissen.js, src/r3d-scenes.js (envKulisse) macht daraus die Spiegelung; Helligkeit und Farbton
je Ort in KUL_LIGHT.env.
"""
import json
import os
import sys
import tempfile
import urllib.request

import bpy
import numpy as np
from PIL import Image

UMGEBUNG = {
    "albion": "sunset_in_the_chalk_quarry",  # Sonnenuntergang im Kreidebruch
    "midgard": "winter_lake_01",  # verschneiter See bei tiefer Sonne
    "hibernia": "moonlit_golf",  # Mondnacht (im Spiel blau getoent)
    "arena": "kloofendal_48d_partly_cloudy",  # Wolkenhimmel (auch Himmelsthron)
}


def lade(name, ziel):
    with urllib.request.urlopen("https://api.polyhaven.com/files/" + name) as r:
        url = json.load(r)["hdri"]["1k"]["hdr"]["url"]
    urllib.request.urlretrieve(url, ziel)


def umrechnen(src, dst):
    img = bpy.data.images.load(src)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3]
    small = px.reshape(256, h // 256, 512, w // 512, 3).mean(axis=(1, 3))
    lum = small @ np.array([0.2126, 0.7152, 0.0722])
    lin = np.clip(small * (0.85 / max(1e-6, np.percentile(lum, 95))), 0, 1)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    Image.fromarray((srgb * 255 + 0.5).astype(np.uint8)).save(dst, "WEBP", quality=86)


def main():
    ziel = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "kulissen")
    os.makedirs(ziel, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for ort, name in UMGEBUNG.items():
            hdr = os.path.join(tmp, name + ".hdr")
            lade(name, hdr)
            dst = os.path.join(ziel, "env-" + ort + ".webp")
            umrechnen(hdr, dst)
            print(dst, os.path.getsize(dst), "Bytes aus", name)


if __name__ == "__main__":
    main()
