"""Kacheltexturen der Materialien und Zierborten der drei Reiche (PIL, numpy).

Kacheln (256 x 256, nahtlos): Detailbild (Graustufen mit leichtem Farbton, wird mit der Materialfarbe
multipliziert) und Normalenbild. Borten (1024 x 320): fuenf Reihen zu je 64 Pixeln, eine je Seltenheit;
Kanaele R = Muster (Metallfaden), G = Grundband, B = leuchtende Einlage.
Aufruf: python textures.py <ausgabeordner>"""
import os
import sys
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import texlib  # noqa: E402

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
S = 256
rng = np.random.default_rng(42)


def tileable_noise(scale, seed, octaves=4):
    # Wertrauschen mit Wiederholung: Gitter periodisch
    r = np.random.default_rng(seed)
    out = np.zeros((S, S), dtype=np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = int(scale * 2 ** o)
        g = r.random((n, n)).astype(np.float32)
        xs = np.arange(S) * n / S
        i = xs.astype(int)
        f = xs - i
        f = f * f * (3 - 2 * f)
        i1 = (i + 1) % n
        a, b, c, d = g[np.ix_(i, i)], g[np.ix_(i, i1)], g[np.ix_(i1, i)], g[np.ix_(i1, i1)]
        fx, fy = f[None, :], f[:, None]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
        tot += amp
        amp *= 0.5
    return out / tot


def normal_from_height(hgt, strength=2.0):
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * strength
    dy = (np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)) * strength
    n = np.stack([-dx, dy, np.ones_like(hgt)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)


def save_tile(name, alb, hgt, strength=2.0, tint=(1, 1, 1)):
    a = np.clip(alb, 0, 1)[..., None] * np.array(tint)[None, None, :]
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, "tile-" + name + ".png"))
    Image.fromarray(normal_from_height(hgt, strength)).save(os.path.join(OUT, "tile-" + name + "-n.png"))


yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)

# Stoff: Leinwandbindung
w = 16
warp = (np.sin(xx / S * 2 * math.pi * w * 2) * 0.5 + 0.5)
weft = (np.sin(yy / S * 2 * math.pi * w * 2) * 0.5 + 0.5)
chk = ((np.floor(xx / S * w * 2) + np.floor(yy / S * w * 2)) % 2)
h = np.where(chk > 0, warp, weft) * 0.6 + tileable_noise(8, 1) * 0.4
alb = 0.82 + 0.12 * h + 0.06 * (tileable_noise(32, 2) - 0.5)
save_tile("cloth", alb, h * 0.9, 1.6)
# Wolle / grober Stoff
h = tileable_noise(24, 3, 5) * 0.6 + np.where(chk > 0, warp, weft) * 0.4
save_tile("wool", 0.78 + 0.2 * h, h, 2.4)
# Leder: Narbung und Falten
h = tileable_noise(10, 4, 5) * 0.5 + tileable_noise(40, 5, 3) * 0.5
cr = np.abs(tileable_noise(6, 6, 3) - 0.5) < 0.03
alb = 0.75 + 0.22 * h - 0.18 * cr
save_tile("leather", alb, h - cr * 0.6, 3.0)
# Fell: lange Straehnen
h = np.zeros((S, S), dtype=np.float32)
img = Image.new("L", (S, S), 90)
d = ImageDraw.Draw(img)
for i in range(900):
    x, y = rng.random() * S, rng.random() * S
    L = 18 + rng.random() * 26
    a = math.pi / 2 + (rng.random() - 0.5) * 0.5
    v = int(60 + rng.random() * 190)
    for dx in (-S, 0, S):
        for dy in (-S, 0, S):
            d.line((x + dx, y + dy, x + dx + math.cos(a) * L, y + dy + math.sin(a) * L), fill=v, width=2)
h = np.asarray(img.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255
save_tile("fur", 0.55 + 0.5 * h, h, 3.5)
# Holz: Maserung
ring = np.sin((xx / S * 2 * math.pi * 6) + tileable_noise(4, 7, 3) * 9) * 0.5 + 0.5
h = ring * 0.6 + tileable_noise(48, 8, 2) * 0.4
save_tile("wood", 0.68 + 0.3 * h, h, 1.8)
# Metall: gehaemmert
h = tileable_noise(14, 9, 3)
dents = np.zeros((S, S), dtype=np.float32)
for i in range(120):
    cx, cy, r = rng.random() * S, rng.random() * S, 6 + rng.random() * 10
    dd = ((xx - cx + S / 2) % S - S / 2) ** 2 + ((yy - cy + S / 2) % S - S / 2) ** 2
    dents -= np.exp(-dd / (r * r)) * 0.4
h = h * 0.4 + dents
save_tile("metal", 0.82 + 0.16 * tileable_noise(20, 10), h, 2.0)
# Metall: fein gebuerstet (Silber, Gold)
h = tileable_noise(2, 11, 2)[:, :] * 0.2 + np.repeat(rng.random((S, 1)).astype(np.float32), S, axis=1) * 0.3
save_tile("brushed", 0.9 + 0.08 * h, h, 0.8)
# Stein
h = tileable_noise(6, 12, 6)
save_tile("stone", 0.62 + 0.36 * h, h, 3.0)
# Schuppen (Metall oder Leder)
sc = np.zeros((S, S), dtype=np.float32)
n = 8
for j in range(n * 2 + 1):
    for i in range(n + 1):
        cx = (i + (0.5 if j % 2 else 0)) * S / n
        cy = j * S / n / 2
        dd = np.sqrt(((xx - cx + S / 2) % S - S / 2) ** 2 + ((yy - cy + S / 2) % S - S / 2) ** 2)
        v = np.clip(1 - dd / (S / n * 0.62), 0, 1) * (yy >= cy - 2)
        sc = np.maximum(sc, v ** 0.6)
save_tile("scale", 0.65 + 0.33 * sc, sc, 3.0)
# Kettenhemd: Ringe
cm = np.zeros((S, S), dtype=np.float32)
n = 16
for j in range(n * 2):
    for i in range(n + 1):
        cx = (i + (0.5 if j % 2 else 0)) * S / n
        cy = j * S / n / 2
        dd = np.sqrt(((xx - cx + S / 2) % S - S / 2) ** 2 + ((yy - cy + S / 2) % S - S / 2) ** 2)
        cm = np.maximum(cm, np.clip(1 - np.abs(dd - S / n * 0.38) / 2.2, 0, 1))
save_tile("chain", 0.35 + 0.6 * cm, cm, 2.5)
# Rinde / Wurzelholz
h = np.abs(np.sin(xx / S * 2 * math.pi * 10 + tileable_noise(3, 13, 3) * 6)) * 0.6 + tileable_noise(30, 14, 3) * 0.4
save_tile("bark", 0.6 + 0.38 * h, h, 3.2)
# Filz
h = tileable_noise(40, 15, 4)
save_tile("felt", 0.8 + 0.18 * h, h, 1.2)
# Knochen / Horn
h = tileable_noise(5, 16, 4) * 0.7 + np.sin(yy / S * 2 * math.pi * 14) * 0.15
save_tile("bone", 0.82 + 0.16 * h, h, 1.0)

# ---------- Zierborten ----------
W, RH = 1024, 64


def border_sheet(culture):
    R = Image.new("L", (W, RH * 5), 0)
    Gc = Image.new("L", (W, RH * 5), 0)
    B = Image.new("L", (W, RH * 5), 0)
    dr, dg, db = ImageDraw.Draw(R), ImageDraw.Draw(Gc), ImageDraw.Draw(B)
    for row in range(5):
        y0 = row * RH
        # Grundband ueber die ganze Reihe
        dg.rectangle((0, y0, W, y0 + RH - 1), fill=255)
        cy = y0 + RH / 2
        if row == 0:
            # schlichte Naht: Stichlinien
            for x in range(0, W, 16):
                dr.line((x, y0 + 10, x + 9, y0 + 10), fill=200, width=3)
                dr.line((x, y0 + RH - 11, x + 9, y0 + RH - 11), fill=200, width=3)
            continue
        # Randlinien
        dr.line((0, y0 + 6, W, y0 + 6), fill=255, width=4 if row > 1 else 3)
        dr.line((0, y0 + RH - 7, W, y0 + RH - 7), fill=255, width=4 if row > 1 else 3)
        if row >= 3:
            dr.line((0, y0 + 13, W, y0 + 13), fill=200, width=2)
            dr.line((0, y0 + RH - 14, W, y0 + RH - 14), fill=200, width=2)
        step = 64 if row in (1, 2) else 48
        for x0 in range(0, W, step):
            cx = x0 + step / 2
            if culture == "midgard":
                if row == 1:
                    dr.line((x0, cy + 10, cx, cy - 10, x0 + step, cy + 10), fill=255, width=4)
                elif row == 2:
                    # Rune in einer Raute
                    dr.polygon([(cx, cy - 20), (cx + 18, cy), (cx, cy + 20), (cx - 18, cy)], outline=255, width=3)
                    k = (x0 // step) % 4
                    glyph = [[(0, -12, 0, 12), (0, -4, 7, -11)], [(-5, -12, -5, 12), (-5, -12, 6, -2), (6, -2, -5, 6)], [(0, -12, 0, 12), (-7, -6, 7, 6)], [(-6, -12, -6, 12), (6, -12, 6, 12), (-6, -12, 6, 0)]][k]
                    for (a, b, c, e) in glyph:
                        db.line((cx + a * 0.8, cy + b * 0.8, cx + c * 0.8, cy + e * 0.8), fill=255, width=3)
                        dr.line((cx + a * 0.8, cy + b * 0.8, cx + c * 0.8, cy + e * 0.8), fill=160, width=2)
                elif row == 3:
                    # Knotenwerk: verschraenkte Bogen
                    for s in (-1, 1):
                        dr.arc((cx - 24, cy - 16 * s - 14, cx + 24, cy - 16 * s + 14), 0 if s > 0 else 180, 180 if s > 0 else 360, fill=255, width=4)
                    dr.polygon([(cx, cy - 8), (cx + 8, cy), (cx, cy + 8), (cx - 8, cy)], fill=255)
                else:
                    dr.polygon([(cx, cy - 22), (cx + 22, cy), (cx, cy + 22), (cx - 22, cy)], outline=255, width=4)
                    dr.polygon([(cx, cy - 12), (cx + 12, cy), (cx, cy + 12), (cx - 12, cy)], outline=255, width=3)
                    db.polygon([(cx, cy - 6), (cx + 6, cy), (cx, cy + 6), (cx - 6, cy)], fill=255)
                    dr.line((x0, cy, cx - 22, cy), fill=255, width=3)
            elif culture == "albion":
                if row == 1:
                    # Hundszahn
                    dr.polygon([(x0, cy + 12), (cx, cy - 12), (x0 + step, cy + 12)], outline=255, width=3)
                elif row == 2:
                    # Sonnenscheibe
                    dr.ellipse((cx - 11, cy - 11, cx + 11, cy + 11), outline=255, width=3)
                    db.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=255)
                    for k in range(8):
                        a = k * math.pi / 4
                        dr.line((cx + math.cos(a) * 14, cy + math.sin(a) * 14, cx + math.cos(a) * 21, cy + math.sin(a) * 21), fill=255, width=3)
                elif row == 3:
                    # Spitzbogen-Arkade
                    dr.arc((x0 + 4, cy - 20, x0 + step - 4, cy + 34), 180, 360, fill=255, width=4)
                    dr.line((x0 + 4, cy + 7, x0 + 4, cy + 20), fill=255, width=4)
                    dr.polygon([(cx, cy - 6), (cx + 5, cy + 2), (cx, cy + 10), (cx - 5, cy + 2)], fill=255)
                else:
                    # Eidkreuz mit Lilienenden
                    dr.line((cx, cy - 20, cx, cy + 20), fill=255, width=4)
                    dr.line((cx - 18, cy, cx + 18, cy), fill=255, width=4)
                    for (a, b) in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                        dr.ellipse((cx + a * 20 - 5, cy + b * 20 - 5, cx + a * 20 + 5, cy + b * 20 + 5), outline=255, width=2)
                    db.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=255)
            else:  # hibernia
                if row == 1:
                    # Wellenranke
                    pts = [(x0 + t, cy + math.sin(t / step * 2 * math.pi) * 10) for t in range(0, step + 1, 4)]
                    dr.line(pts, fill=255, width=4)
                elif row == 2:
                    # Triskel aus drei Spiralen
                    for k in range(3):
                        a0 = k * 2 * math.pi / 3
                        pts = []
                        for t in np.linspace(0, 1, 18):
                            rr = 4 + 14 * t
                            a = a0 + t * 4.2
                            pts.append((cx + math.cos(a) * rr * 0.7, cy + math.sin(a) * rr * 0.7))
                        dr.line(pts, fill=255, width=3)
                    db.ellipse((cx - 4, cy - 4, cx + 4, cy + 4), fill=255)
                elif row == 3:
                    # Blattranke
                    pts = [(x0 + t, cy + math.sin(t / step * 2 * math.pi) * 8) for t in range(0, step + 1, 4)]
                    dr.line(pts, fill=255, width=3)
                    for s in (-1, 1):
                        lx, ly = cx + s * 10, cy - s * 6
                        dr.polygon([(lx, ly), (lx + 8 * s, ly - 12 * s), (lx + 14 * s, ly - 4 * s)], fill=255)
                else:
                    # Knotenring mit Spiralen
                    dr.ellipse((cx - 20, cy - 20, cx + 20, cy + 20), outline=255, width=3)
                    for k in range(4):
                        a = k * math.pi / 2 + math.pi / 4
                        dr.arc((cx + math.cos(a) * 12 - 8, cy + math.sin(a) * 12 - 8, cx + math.cos(a) * 12 + 8, cy + math.sin(a) * 12 + 8), 0, 300, fill=255, width=3)
                    db.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=255)
    rgb = Image.merge("RGB", [R.filter(ImageFilter.GaussianBlur(0.6)), Gc, B.filter(ImageFilter.GaussianBlur(0.8))])
    rgb.save(os.path.join(OUT, "trim-" + culture + ".png"))


for c in ("albion", "midgard", "hibernia"):
    border_sheet(c)
print("Texturen fertig")
