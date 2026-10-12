#!/usr/bin/env python3
"""Fabelbruch Asset-Pipeline.

Leitet aus dem Designpaket v0.4 web-taugliche Spielgrafiken ab.
Die Konzeptkarten sind laut Asset-Vertrag KEINE fertigen Spriteatlanten;
alle hier erzeugten Freisteller sind klar gekennzeichnete Zwischenloesungen,
bis echte Produktionsmedien nachgereicht werden (siehe
docs/fehlende-produktionsmedien.md).

Aufruf:
    python3 tools/build_assets.py <pfad-zum-entpackten-FABELBRUCH_v04> <spielordner>

Erzeugt unter <spielordner>/assets/:
    arenen/ARxx.webp          Arenaboden exakt 1600x900
    monsterkarten/Mxxx.webp   ganze Konzeptkarte (Bestiarium)
    monster/Mxxx_<pose>.webp  Interim-Freisteller (idle/windup/recovery)
    bosskarten/Bxx.webp       ganze Bosskarte (Bestiarium)
    boss/Bxx.webp             Interim-Freisteller der grossen Bossfigur
    waffen/WFxx.webp          ganzes Familienblatt
    waffen/Wxxx.webp          Interim-Freisteller einer Waffe
    held/*.webp               Knorz-Freisteller, Modellblatt, Begleiterblatt
    ui/*.webp                 gemalte UI-Stilreferenzen
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

MERGED = sys.argv[1] if len(sys.argv) > 1 else None
GAME = sys.argv[2] if len(sys.argv) > 2 else None
if not MERGED or not GAME:
    sys.exit("Aufruf: build_assets.py <designpaket> <spielordner>")
ASSETS = os.path.join(GAME, "assets")


def save_webp(img, path, quality=82):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "WEBP", quality=quality, method=6)


def resize_to(img, w, h):
    return img.resize((w, h), Image.LANCZOS)


def scale_max(img, max_side):
    w, h = img.size
    s = max_side / max(w, h)
    if s >= 1:
        return img
    return img.resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)


def bg_color(img):
    """Mittlere Randfarbe (Kartenbeige) bestimmen."""
    w, h = img.size
    px = img.load()
    samples = []
    for x in range(0, w, max(1, w // 60)):
        samples.append(px[x, 1])
        samples.append(px[x, h - 2])
    for y in range(0, h, max(1, h // 60)):
        samples.append(px[1, y])
        samples.append(px[w - 2, y])
    samples = [s[:3] for s in samples]
    samples.sort(key=lambda c: c[0] + c[1] + c[2])
    return samples[len(samples) // 2]


FOUR_CONN = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], dtype=bool)


def cutout(img, tol=30, min_comp=250, drop_corner_labels=True, pad=12,
           light_floor=200, drop_enclosed_light=False):
    """Figur freistellen: Hintergrund entfernen, Stoerkomponenten verwerfen.

    drop_enclosed_light entfernt auch grosse helle Flaechen, die von
    Konturen eingeschlossen sind (Leuchtschein hinter Figuren). Nur fuer
    Karten ohne elfenbeinfarbene Koerper verwenden."""
    rgb = img.convert("RGB")
    w, h = rgb.size
    arr = np.asarray(rgb, dtype=np.int16)

    # Etikettenchips (dunkles Petrol) im oberen linken Bereich vorab durch
    # Hintergrundfarbe ersetzen, damit sie nicht als Figur ueberleben.
    br0, bg0, bb0 = bg_color(rgb)
    top = int(min(h * 0.22, 85))
    left = int(w * 0.55)
    region = arr[:top, :left]
    teal = (region[:, :, 1] >= region[:, :, 0]) \
        & (region[:, :, 2] >= region[:, :, 0] * 0.9) \
        & (region.sum(axis=2) < 520)
    region[teal] = (br0, bg0, bb0)
    arr[:top, :left] = region

    br, bgc, bb = bg_color(rgb)
    near = (np.abs(arr[:, :, 0] - br) <= tol) \
        & (np.abs(arr[:, :, 1] - bgc) <= tol) \
        & (np.abs(arr[:, :, 2] - bb) <= tol)
    # Helle Verlaeufe (weisses Leuchten hinter Figuren) zaehlen als Hintergrund;
    # Figureninneres bleibt durch die dunklen Konturen des Cel-Shadings getrennt.
    light = (arr.min(axis=2) > light_floor) & ((arr.max(axis=2) - arr.min(axis=2)) < 40)
    near = near | light
    # Hintergrund = near-Komponenten, die den Rand beruehren
    near_lab, nlab = ndimage.label(near, structure=FOUR_CONN)
    border_labels = np.unique(np.concatenate([
        near_lab[0, :], near_lab[-1, :], near_lab[:, 0], near_lab[:, -1]]))
    border_labels = border_labels[border_labels != 0]
    bg = np.isin(near_lab, border_labels)
    if drop_enclosed_light and nlab:
        sizes = np.bincount(near_lab.ravel())
        big = np.flatnonzero(sizes > 800)
        big = big[big != 0]
        bg = bg | np.isin(near_lab, big)
    fg = ~bg
    lab, n = ndimage.label(fg, structure=FOUR_CONN)
    if n == 0:
        return None
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    biggest = sizes.max()
    objects = ndimage.find_objects(lab)
    keep_mask = np.zeros((h, w), dtype=bool)
    minx = miny = 10 ** 9
    maxx = maxy = -1
    kept = 0
    for idx in range(1, n + 1):
        size = sizes[idx]
        if size == 0:
            continue
        sl = objects[idx - 1]
        y0, y1 = sl[0].start, sl[0].stop - 1
        x0, x1 = sl[1].start, sl[1].stop - 1
        if size < min_comp and size < biggest:
            continue
        if drop_corner_labels and size < biggest:
            bw = x1 - x0 + 1
            bh = y1 - y0 + 1
            # Etiketten: dunkle Komponente im oberen Panelbereich
            if y1 < h * 0.32:
                comp = lab[sl] == idx
                mean = arr[sl][comp].mean(axis=0)
                if mean.sum() < 520:
                    continue
            # Etikettenreste, die die obere Schnittkante beruehren
            if y0 <= 2 and bh < h * 0.16:
                continue
            # Rahmenreste: duenne Linienfragmente
            density = size / (bw * bh)
            if (bw >= 50 and bh <= 9) or (bh >= 50 and bw <= 9):
                continue
            if max(bw, bh) > 0.4 * max(w, h) and density < 0.14:
                continue
            # Kleine Splitter am Zuschnittrand (Diagrammreste, Zierkanten)
            if bw < w * 0.16 and bh < h * 0.16:
                margin = 0.05
                if (x0 < w * margin or x1 > w * (1 - margin)
                        or y0 < h * margin or y1 > h * (1 - margin)):
                    continue
            # Streifen, die vollstaendig an einer Kante kleben
            if x1 < w * 0.04 or x0 > w * 0.96 or y1 < h * 0.04 or y0 > h * 0.96:
                continue
            # Kleine Komponenten im aeusseren Randband
            if size < 0.025 * w * h and (
                    x1 < w * 0.08 or x0 > w * 0.92 or y1 < h * 0.08 or y0 > h * 0.92):
                continue
        keep_mask[sl] |= (lab[sl] == idx)
        minx, maxx = min(minx, x0), max(maxx, x1)
        miny, maxy = min(miny, y0), max(maxy, y1)
        kept += 1
    if kept == 0:
        idx = int(sizes.argmax())
        sl = objects[idx - 1]
        keep_mask[sl] |= (lab[sl] == idx)
        miny, maxy = sl[0].start, sl[0].stop - 1
        minx, maxx = sl[1].start, sl[1].stop - 1
    src = np.asarray(img.convert("RGBA")).copy()
    src[:, :, 3] = np.where(keep_mask, src[:, :, 3], 0)
    out = Image.fromarray(src, "RGBA")
    # weiche Kante
    alpha = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.7))
    out.putalpha(alpha)
    minx = max(0, minx - pad)
    miny = max(0, miny - pad)
    maxx = min(w - 1, maxx + pad)
    maxy = min(h - 1, maxy + pad)
    return out.crop((minx, miny, maxx + 1, maxy + 1))


def find_divider(rgb, lo, hi, axis):
    """Panel-Trennlinie: Spalte/Zeile, in der die meisten Stichproben dunkel
    sind. Eine echte Trennlinie ist fast durchgehend dunkel; Artwork nicht."""
    arr = np.asarray(rgb.convert("RGB"), dtype=np.int16).sum(axis=2)
    h, w = arr.shape
    best, best_v = (lo + hi) // 2, -1
    if axis == "x":
        rows = np.arange(int(h * 0.16), h - 8, 5)
        for x in range(lo, hi):
            v = int((arr[rows, x] < 330).sum())
            if v > best_v:
                best, best_v = x, v
    else:
        cols = np.arange(8, w - 8, 5)
        for y in range(lo, hi):
            v = int((arr[y, cols] < 330).sum())
            if v > best_v:
                best, best_v = y, v
    return best


def header_bottom(rgb):
    """Unterkante des dunklen Titelbands finden."""
    w, h = rgb.size
    px = rgb.load()
    for y in range(int(h * 0.04), int(h * 0.3)):
        row = [sum(px[x, y][:3]) for x in range(w // 6, 5 * w // 6, 11)]
        bright = sum(1 for v in row if v > 500)
        if bright > len(row) * 0.75:
            return y + 4
    return int(h * 0.12)


def monster_cards():
    design = json.load(open(os.path.join(GAME, "data", "design.json")))
    inset = 20
    for m in design["monsters"]:
        mid = m["id"]
        src = os.path.join(MERGED, m["image_file"])
        img = Image.open(src).convert("RGB")
        w, h = img.size
        save_webp(scale_max(img, 1024), os.path.join(ASSETS, "monsterkarten", f"{mid}.webp"), 78)
        hb = header_bottom(img)
        vx = find_divider(img, int(w * 0.46), int(w * 0.54), "x")
        hy = find_divider(img, int(h * 0.46 + hb * 0.5), int(h * 0.60), "y")
        quads = {
            "idle": (inset, hb + inset, vx - inset, hy - inset),
            "windup": (vx + inset, hb + inset, w - inset, hy - inset),
            "active": (inset, hy + inset, vx - inset, h - inset),
            "recovery": (vx + inset, hy + inset, w - inset, h - inset),
        }
        for pose in ("idle", "windup", "recovery"):
            box = quads[pose]
            cut = cutout(img.crop(box))
            if cut is None:
                print(f"WARNUNG: {mid} {pose}: kein Freisteller moeglich")
                continue
            cut = scale_max(cut, 512)
            save_webp(cut, os.path.join(ASSETS, "monster", f"{mid}_{pose}.webp"), 85)
        print(f"{mid} ok")


def boss_cards():
    design = json.load(open(os.path.join(GAME, "data", "design.json")))
    for b in design["bosses"]:
        bid = b["id"]
        src = os.path.join(MERGED, b["image_file"])
        img = Image.open(src).convert("RGB")
        w, h = img.size
        save_webp(scale_max(img, 1280), os.path.join(ASSETS, "bosskarten", f"{bid}.webp"), 78)
        hb = header_bottom(img)
        vx = find_divider(img, int(w * 0.32), int(w * 0.40), "x")
        panel = img.crop((10, hb + 8, vx - 8, h - 10))
        cut = cutout(panel, min_comp=600)
        if cut is None:
            print(f"WARNUNG: {bid}: kein Freisteller moeglich")
            continue
        cut = scale_max(cut, 800)
        save_webp(cut, os.path.join(ASSETS, "boss", f"{bid}.webp"), 85)
        print(f"{bid} ok")


def weapon_sheets():
    wj = json.load(open(os.path.join(GAME, "data", "waffen.json")))
    sheets = {}
    for wpn in wj["weapons"]:
        sheets.setdefault(wpn["image_file"], []).append(wpn)
    for sheet_file, wpns in sorted(sheets.items()):
        src = os.path.join(MERGED, sheet_file)
        img = Image.open(src).convert("RGB")
        w, h = img.size
        name = os.path.splitext(os.path.basename(sheet_file))[0]
        save_webp(scale_max(img, 900), os.path.join(ASSETS, "waffen", f"{name}.webp"), 78)
        hb = header_bottom(img)
        vx = find_divider(img, int(w * 0.46), int(w * 0.54), "x")
        hy = find_divider(img, int((hb + h) * 0.47), int((hb + h) * 0.56), "y")
        inset = 12
        for wpn in wpns:
            pos = wpn["sheet_position"]
            x0, x1 = (inset, vx - inset) if "links" in pos else (vx + inset, w - inset)
            y0, y1 = (hb + inset, hy - inset) if "oben" in pos else (hy + inset, h - inset)
            # Beschriftungszeile unten im Panel abschneiden
            y1 = y0 + int((y1 - y0) * 0.82)
            cut = cutout(img.crop((x0, y0, x1, y1)), min_comp=400)
            if cut is None:
                print(f"WARNUNG: {wpn['id']}: kein Freisteller moeglich")
                continue
            cut = scale_max(cut, 400)
            save_webp(cut, os.path.join(ASSETS, "waffen", f"{wpn['id']}.webp"), 85)
        print(f"{sheet_file} ok ({len(wpns)} Waffen)")


def arenas():
    # 2800x1575: vergroesserte Arenen (Faktor 1,75 der 1600x900-Logik),
    # damit die mitfahrende Kamera scharfes Material hat.
    aj = json.load(open(os.path.join(GAME, "data", "arenen.json")))
    for a in aj["arenas"]:
        src = os.path.join(MERGED, a["image_file"])
        img = Image.open(src).convert("RGB")
        img = resize_to(img, 2800, 1575)
        save_webp(img, os.path.join(ASSETS, "arenen", f"{a['id']}.webp"), 80)
        print(f"{a['id']} ok")


def hero_and_ui():
    held = os.path.join(MERGED, "held")
    knorz = Image.open(os.path.join(held, "knorz-freisteller-v03.png")).convert("RGBA")
    save_webp(scale_max(knorz, 768), os.path.join(ASSETS, "held", "knorz.webp"), 90)
    modell = Image.open(os.path.join(held, "knorz-modell-v03.png")).convert("RGB")
    save_webp(scale_max(modell, 1024), os.path.join(ASSETS, "held", "knorz-modell.webp"), 80)
    begleiter = Image.open(os.path.join(held, "begleiter.png")).convert("RGB")
    save_webp(scale_max(begleiter, 1280), os.path.join(ASSETS, "held", "begleiter.webp"), 80)
    for f in ("startbildschirm", "levelaufstieg", "shop-stil"):
        img = Image.open(os.path.join(MERGED, "ui", f + ".png")).convert("RGB")
        img = resize_to(img, 1600, 900)
        save_webp(img, os.path.join(ASSETS, "ui", f + ".webp"), 82)
    print("Held/UI ok")


if __name__ == "__main__":
    arenas()
    hero_and_ui()
    weapon_sheets()
    boss_cards()
    monster_cards()
    print("FERTIG")
