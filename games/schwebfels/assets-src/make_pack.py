"""Fuegt alle gebauten Zwischenstaende zu assets/schwebfels.pack zusammen.
Aufruf: python make_pack.py <buildordner> <ausgabe.pack>"""
import os
import sys
import json
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pack import Pack  # noqa: E402

B = sys.argv[1]
OUT = sys.argv[2]
P = Pack()
header = {"v": 1}

# --- Heldenkoerper ---
h = np.load(os.path.join(B, "humans.npz"))
bones = json.loads(str(h["bones"]))
bidx = {b[0]: i for i, b in enumerate(bones)}
prof = json.loads(str(h["profiles"]))
H = {
    "bones": [[b[0], bidx[b[1]] if b[1] else -1] for b in bones],
    "pos": P.q16(h["pos"], 1 / 16000),
    "uv": P.uv16(h["uv"]),
    "idx": P.index(h["idx"]),
    "skinI": P.arr(h["skin_i"], "u8"),
    "skinW": P.arr(h["skin_w"], "u8"),
    "region": P.arr(h["region"], "u8"),
    "joints": P.arr(h["joints"], "f32"),
    "profiles": {},
}
for k, meta in prof.items():
    H["profiles"][k] = {"d": P.q16(h["d_" + k]), "j": P.arr(h["j_" + k], "f32"), "eyes": P.arr(h["e_" + k], "f32"), "top": meta["top"], "sockets": meta["sockets"]}
header["humans"] = H


def webp(path, q=86, lossless=False, size=None):
    from PIL import Image
    import io
    im = Image.open(path)
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    b = io.BytesIO()
    if lossless:
        im.save(b, "WEBP", lossless=True, quality=100, method=6)
    else:
        im.save(b, "WEBP", quality=q, method=6)
    return b.getvalue()


TX = os.path.join(B, "tex")
if os.path.isdir(TX):
    box = [float(x) for x in open(os.path.join(TX, "face-box.txt")).read().split(",")]
    H["tex"] = {
        "detail": P.img(webp(os.path.join(TX, "body-detail.png"), 84), "image/webp"),
        "normal": P.img(webp(os.path.join(TX, "body-normal.png"), 90), "image/webp"),
        "faceA": P.img(webp(os.path.join(TX, "face-a.png"), lossless=True), "image/webp"),
        "faceB": P.img(webp(os.path.join(TX, "face-b.png"), lossless=True), "image/webp"),
        "faceC": P.img(webp(os.path.join(TX, "face-c.png"), lossless=True), "image/webp"),
        "faceD": P.img(webp(os.path.join(TX, "face-d.png"), lossless=True), "image/webp"),
        "faceBox": box,
    }
    for k, v in H["tex"].items():
        if isinstance(v, dict):
            print("Textur", k, round(v["$"][2] / 1024), "KB")

# --- gebundene Teile (Haare, Baerte, Kleidung): Bindung an den Koerper statt eigener Lage ---
pieces = {}


def add_bound(npz_path):
    z = np.load(npz_path)
    for key in [str(k) for k in z["keys"]]:
        e = {
            "tri": P.index(z[key + ".tri"]) if key + ".tri" in z else None,
            "bc": P.uv16(z[key + ".bc"][:, :2]) if key + ".bc" in z else None,
            "off": P.q16(z[key + ".off"]) if key + ".off" in z else None,
            "uv": P.q16(z[key + ".uv"]),
            "idx": P.index(z[key + ".idx"]),
        }
        if key + ".col" in z:
            e["col"] = P.arr(np.clip(np.round(z[key + ".col"] * 255), 0, 255).astype(np.uint8), "u8")
        if key + ".mat" in z:
            e["mat"] = P.arr(z[key + ".mat"], "u8")
        if key + ".meta" in z:
            e["meta"] = json.loads(str(z[key + ".meta"]))
        if key + ".hide" in z:
            e["hide"] = P.arr(np.packbits(z[key + ".hide"].astype(np.uint8), bitorder="little"), "u8")
        if key + ".anch" in z:
            e["anch"] = P.index(z[key + ".anch"])
        if key + ".pos" in z and key + ".tri" not in z:
            e["pos"] = P.q16(z[key + ".pos"], 1 / 16000)
            for k_ in ("tri", "bc", "off"):
                e.pop(k_, None)
        if key + ".rad" in z:
            r_ = z[key + ".rad"]
            e["rad"] = P.arr(r_, "f32")
        if key + ".nrm" in z:
            e["nrm"] = P.arr(np.clip(np.round(z[key + ".nrm"] * 127), -127, 127).astype(np.int8), "i8")
        if key + ".skinI" in z:
            e["skinI"] = P.arr(z[key + ".skinI"], "u8")
            e["skinW"] = P.arr(z[key + ".skinW"], "u8")
        pieces[key] = e


for f in ("hair.npz", "gear.npz"):
    if os.path.exists(os.path.join(B, f)):
        add_bound(os.path.join(B, f))
header["pieces"] = pieces

# --- Bestien ---
BD = os.path.join(B, "beasts")
if os.path.isdir(BD):
    beasts = {}
    for f in sorted(os.listdir(BD)):
        if not f.endswith(".npz"):
            continue
        z = np.load(os.path.join(BD, f))
        meta = json.loads(str(z["meta"]))
        beasts[meta["family"]] = {
            "pos": P.q16(z["pos"], 1 / 12000),
            "nrm": P.arr(np.clip(np.round(z["nrm"] / np.maximum(1e-9, np.linalg.norm(z["nrm"], axis=1, keepdims=True)) * 127), -127, 127).astype(np.int8), "i8"),
            "uv": P.q16(z["uv"]),
            "idx": P.index(z["idx"]),
            "col": P.arr(z["col"], "u8"),
            "skinI": P.arr(z["skinI"], "u8"),
            "skinW": P.arr(z["skinW"], "u8"),
            "meta": meta,
        }
        print("Bestie", meta["family"], len(z["pos"]), "Ecken")
    header["beasts"] = beasts

# --- Kacheln und Borten ---
MT = os.path.join(B, "mat")
if os.path.isdir(MT):
    tiles = {}
    for f in sorted(os.listdir(MT)):
        if f.startswith("tile-") and not f.endswith("-n.png"):
            nm = f[5:-4]
            tiles[nm] = {"alb": P.img(webp(os.path.join(MT, f), 82), "image/webp"), "nrm": P.img(webp(os.path.join(MT, "tile-" + nm + "-n.png"), 88), "image/webp")}
    trims = {c: P.img(webp(os.path.join(MT, "trim-" + c + ".png"), lossless=True), "image/webp") for c in ("albion", "midgard", "hibernia")}
    header["mat"] = {"tiles": tiles, "trims": trims}

n = P.write(OUT, header)
print(OUT, round(n / 1024), "KB")
