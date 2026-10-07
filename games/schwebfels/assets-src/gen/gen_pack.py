"""Erzeugte Figuren (Bild-zu-3D-Strecke) zu assets/gen.pack zusammenfassen.

Aufruf: python gen_pack.py <ordner mit npz> <ausgabe.pack>
Jede npz-Datei ist eine Figur (Name = Dateiname): Koerper mit Textur, Gelenke der 29 Spielknochen,
Haltepunkte und Kleidungsteile samt Hautmaske. build.mjs bettet das Paket neben schwebfels.pack ein.
"""
import io
import os
import sys
import json
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from pack import Pack  # noqa: E402

SRC, OUT = sys.argv[1], sys.argv[2]
P = Pack()


def tex(a, q=84):
    b = io.BytesIO()
    Image.fromarray(a).save(b, "WEBP", quality=q, method=6)
    return P.img(b.getvalue(), "image/webp")


def part(z, pre):
    return {"pos": P.q16(z[pre + "_pos"], 1 / 12000), "uv": P.q16(z[pre + "_uv"]), "idx": P.index(z[pre + "_idx"]),
            "skinI": P.arr(z[pre + "_si"], "u8"), "skinW": P.arr(z[pre + "_sw"], "u8")}


gen = {}
for f in sorted(os.listdir(SRC)):
    if not f.endswith(".npz"):
        continue
    z = np.load(os.path.join(SRC, f))
    e = part(z, "body")
    e.update({"j": P.arr(z["joints"], "f32"), "top": float(z["top"]), "sockets": json.loads(str(z["sockets"])), "tex": tex(z["tex"]), "pieces": {}})
    if "nrm" in z.files:
        e["nrm"] = tex(z["nrm"], 90)
    names = json.loads(str(z["pieces"])) if "pieces" in z.files else (["brust"] if "gar_pos" in z.files else [])
    for n in names:
        pre = "gar" if n == "brust" and "gar_pos" in z.files else "p_" + n
        e["pieces"][n] = part(z, pre)
        mk = z["body_mask"] if pre == "gar" else z[pre + "_mask"]
        e["pieces"][n]["mask"] = P.arr(np.packbits(mk.astype(np.uint8), bitorder="little"), "u8")
        if pre + "_tex" in z.files:
            e["pieces"][n]["tex"] = tex(z[pre + "_tex"])
    gen[f[:-4]] = e
    print("Figur", f[:-4], len(z["body_pos"]), "Ecken,", len(names), "Teile")
n = P.write(OUT, {"v": 1, "gen": gen})
print(OUT, round(n / 1024), "KB")
