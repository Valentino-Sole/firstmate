#!/usr/bin/env python3
"""Nachkontrolle der Freisteller: erkennt Panel-Fehlgriffe, Etikettenreste
und grosse Leuchtflaechen und schneidet nur auffaellige Karten erneut zu.

Aufruf: python3 tools/repair_cutouts.py <designpaket> <spielordner>
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_assets as B

MERGED = sys.argv[1]
GAME = sys.argv[2]
B.MERGED = MERGED
B.GAME = GAME
B.ASSETS = os.path.join(GAME, "assets")

# Familien mit elfenbein-/porzellanfarbenen Koerpern: dort keine aggressive
# Leuchtflaechen-Entfernung (wuerde Figurenmaterial anfressen).
IVORY_MONSTER = set(
    [f"M{i:03d}" for i in range(21, 31)] +   # spiegelhain
    [f"M{i:03d}" for i in range(41, 51)] +   # tintenarchiv
    [f"M{i:03d}" for i in range(61, 71)] +   # porzellanbruch
    [f"M{i:03d}" for i in range(91, 101)]    # wunschbruch
)
IVORY_BOSS = {"B01", "B03", "B05", "B06", "B07", "B10"}


def suspicious(path):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)
    alpha = a[:, :, 3] > 128
    n = alpha.sum()
    if n == 0:
        return "leer"
    rgb = a[:, :, :3].astype(np.int16)
    mn = rgb.min(axis=2)
    span = rgb.max(axis=2) - mn
    white = (alpha & (mn > 225) & (span < 22)).sum() / n
    fill = n / (a.shape[0] * a.shape[1])
    # Hinweis: Eine Etikettenerkennung ueber Petrolfarben schlaegt bei dunklen
    # Monsterkoerpern falsch an und bleibt deshalb bewusst weg.
    if fill > 0.86:
        return f"panel fill={fill:.2f}"
    if white > 0.10:
        return f"leuchtflaeche white={white:.2f}"
    return None


def recut_monster(mid, pose, allow_light):
    design = json.load(open(os.path.join(GAME, "data", "design.json")))
    m = next(x for x in design["monsters"] if x["id"] == mid)
    img = Image.open(os.path.join(MERGED, m["image_file"])).convert("RGB")
    w, h = img.size
    hb = B.header_bottom(img)
    vx = B.find_divider(img, int(w * 0.46), int(w * 0.54), "x")
    hy = B.find_divider(img, int(h * 0.46 + hb * 0.5), int(h * 0.60), "y")
    best = None
    for inset in (32, 44):
        quads = {
            "idle": (inset, hb + inset, vx - inset, hy - inset),
            "windup": (vx + inset, hb + inset, w - inset, hy - inset),
            "recovery": (vx + inset, hy + inset, w - inset, h - inset),
        }
        lf = 205 if allow_light else 200
        cut = B.cutout(img.crop(quads[pose]), light_floor=lf)
        if cut is None:
            continue
        tmp = f"/tmp/recut_{mid}_{pose}.webp"
        B.save_webp(B.scale_max(cut, 512), tmp, 85)
        verdict = suspicious(tmp)
        if verdict is None:
            best = tmp
            break
        best = best or tmp
    if best:
        out = os.path.join(B.ASSETS, "monster", f"{mid}_{pose}.webp")
        os.replace(best, out)
        return suspicious(out)
    return "kein Zuschnitt"


def recut_boss(bid):
    design = json.load(open(os.path.join(GAME, "data", "design.json")))
    b = next(x for x in design["bosses"] if x["id"] == bid)
    img = Image.open(os.path.join(MERGED, b["image_file"])).convert("RGB")
    w, h = img.size
    hb = B.header_bottom(img)
    vx = B.find_divider(img, int(w * 0.32), int(w * 0.40), "x")
    lf = 205 if bid not in IVORY_BOSS else 200
    cut = B.cutout(img.crop((24, hb + 20, vx - 16, h - 24)), min_comp=600, light_floor=lf)
    if cut is None:
        return "kein Zuschnitt"
    out = os.path.join(B.ASSETS, "boss", f"{bid}.webp")
    B.save_webp(B.scale_max(cut, 800), out, 85)
    return suspicious(out)


flagged = []
for mid in [f"M{i:03d}" for i in range(1, 101)]:
    for pose in ("idle", "windup", "recovery"):
        p = os.path.join(B.ASSETS, "monster", f"{mid}_{pose}.webp")
        verdict = suspicious(p)
        if verdict:
            flagged.append((mid, pose, verdict))
for bid in [f"B{i:02d}" for i in range(1, 11)]:
    p = os.path.join(B.ASSETS, "boss", f"{bid}.webp")
    verdict = suspicious(p)
    if verdict:
        flagged.append((bid, "boss", verdict))

print(f"Auffaellig: {len(flagged)}")
for mid, pose, verdict in flagged:
    if pose == "boss":
        after = recut_boss(mid)
    else:
        after = recut_monster(mid, pose, allow_light=mid not in IVORY_MONSTER)
    print(f"  {mid} {pose}: {verdict} -> {after or 'ok'}")
