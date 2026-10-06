"""Erzeugte Figuren (Bild-zu-3D-Strecke) zu assets/gen.pack zusammenfassen.

Aufruf: python gen_pack.py <ordner mit npz> <ausgabe.pack> [--no-auto]
Jede npz-Datei ist eine Figur (Name = Dateiname). Zwei Arten:
 - aus probe.py: Koerper mit Textur auf dem Spielskelett (29 Knochen), Haltepunkte, Kleidungsteile samt Hautmaske
 - aus meshy.py (Art "rig"): Koerper mit eigenem Skelett (z. B. Meshy), Zuordnung der Spielgelenke, Haltepunkte und
   Bewegungen. Bewegungen landen einmal im gemeinsamen Teil "clips" und gelten fuer jede Figur mit gleichen Knochennamen.
   Figuren mit Volk und Geschlecht (meshy.py --race/--gender) ersetzen im Spiel automatisch den Koerper dieses Volkes,
   ausser mit --no-auto.
build.mjs bettet das Paket neben schwebfels.pack ein.
"""
import io
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from pack import Pack  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith("--")]
SRC, OUT = args[0], args[1]
AUTO = "--no-auto" not in sys.argv
P = Pack()


def tex(a, q=84):
    b = io.BytesIO()
    Image.fromarray(a).save(b, "WEBP", quality=q, method=6)
    return P.img(b.getvalue(), "image/webp")


def part(z, pre):
    return {"pos": P.q16(z[pre + "_pos"], 1 / 12000), "uv": P.q16(z[pre + "_uv"]), "idx": P.index(z[pre + "_idx"]),
            "skinI": P.arr(z[pre + "_si"], "u8"), "skinW": P.arr(z[pre + "_sw"], "u8")}


def rig(z, name, clips):
    meta = json.loads(str(z["meta"]))
    e = {"kind": "rig", "pos": P.q16(z["pos"]), "uv": P.q16(z["uv"]), "idx": P.index(z["idx"]),
         "skinI": P.arr(z["skin_i"], "u8"), "skinW": P.arr(z["skin_w"], "u8"), "tex": tex(z["tex"]),
         "skel": {"names": meta["names"], "parents": meta["parents"], "rest": P.arr(z["rest"], "f32")},
         "map": meta["map"], "j": P.arr(z["joints"], "f32"), "top": meta["top"], "hipsY": meta["hipsY"], "sockets": meta["sockets"], "pieces": {}}
    if AUTO and meta.get("race") and meta.get("gender"):
        e["use"] = {"race": meta["race"], "gender": meta["gender"]}
    for k, cm in enumerate(meta["clips"]):
        if cm["name"] in clips or not cm["bones"]:
            continue
        rot = z["clip%d_rot" % k]
        clips[cm["name"]] = {"d": cm["d"], "fps": cm["fps"], "n": cm["frames"], "bones": cm["bones"], "hipsY": cm["hipsY"],
                             "hit": [cm["hitHand"], cm["hitBody"]], "loop": cm["loop"],
                             "q": P.q16(rot, 1 / 32767), "hips": P.q16(z["clip%d_hips" % k])}
    print("Figur", name, len(z["pos"]), "Ecken,", len(z["idx"]), "Dreiecke,", len(meta["names"]), "Knochen,", len(meta["clips"]), "Bewegungen")
    return e


def piece(z):
    """Ruestungsteil aus fit_piece.py: knochenbezogen, passt sich im Spiel jedem Koerper mit gleichen Knochen an."""
    meta = json.loads(str(z["meta"]))
    occ = z["occ"]
    return {"slot": meta["slot"], "forms": meta["forms"], "bones": meta["bones"], "grid": [meta["nt"], meta["na"], meta["t0"], meta["t1"]],
            "uv": P.q16(z["uv"]), "idx": P.index(z["idx"]), "bone": P.arr(z["bone"], "u8"), "tto": P.q16(z["tto"]),
            "w": P.arr(np.round(z["w"][:, 0] * 255), "u8"), "tex": tex(z["tex"]),
            "occ": {n: P.arr(np.packbits(occ[i].astype(np.uint8).ravel(), bitorder="little"), "u8") for i, n in enumerate(meta["occ"])}}


gen = {}
clips = {}
pieces = {}
TD = os.path.join(SRC, "teile")
if os.path.isdir(TD):
    for f in sorted(os.listdir(TD)):
        if f.endswith(".npz"):
            z = np.load(os.path.join(TD, f))
            name = json.loads(str(z["meta"]))["name"]
            pieces[name] = piece(z)
            print("Teil", name, len(z["uv"]), "Ecken,", len(z["idx"]), "Dreiecke")
for f in sorted(os.listdir(SRC)):
    if not f.endswith(".npz"):
        continue
    z = np.load(os.path.join(SRC, f))
    if "kind" in z.files and str(z["kind"]) == "rig":
        gen[f[:-4]] = rig(z, f[:-4], clips)
        continue
    e = part(z, "body")
    e.update({"j": P.arr(z["joints"], "f32"), "top": float(z["top"]), "sockets": json.loads(str(z["sockets"])), "tex": tex(z["tex"]), "pieces": {}})
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
n = P.write(OUT, {"v": 1, "gen": gen, "clips": clips, "pieces": pieces})
print(OUT, round(n / 1024), "KB,", len(clips), "gemeinsame Bewegungen,", len(pieces), "Ruestungsteile")
