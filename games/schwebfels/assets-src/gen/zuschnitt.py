"""Zuschnitt: einzelne Modelle aus einer Konzepttafel ausschneiden (Meshy braucht ein Modell je Bild).

Aufruf: python zuschnitt.py <tafel.png|jpg> <ausgabeordner> [--name tafel10] [--schwelle 0] [--min 0.4]
                            [--box x0,y0,x1,y1 ...] [--rand 0.06]
        python zuschnitt.py --probe     Selbstpruefung mit einer gezeichneten Tafel (fuenf Figuren, Ueberschrift,
                                        Beschriftungen auf Pergament)

Ohne --box sucht das Werkzeug die Gegenstaende selbst: Der Hintergrund ist die vorherrschende Farbe am Bildrand
(Papier, Pergament, einfarbig), alles deutlich andere zaehlt als Gegenstand; nahe Teile eines Gegenstands werden
verbunden, kleine Flecken und Beschriftungen (unter --min Prozent der Bildflaeche) fallen weg. Die Ausschnitte
heissen <name>_1.png, <name>_2.png, ... (zeilenweise von links oben), mit etwas Rand in Hintergrundfarbe.
<name>_uebersicht.png zeigt die Tafel mit nummerierten Rahmen zum Pruefen. Liegen zwei Gegenstaende zu nah
beieinander oder gehoert eine Beschriftung zu einem Rahmen, mit --box von Hand schneiden (Pixel der Originaltafel,
mehrfach angebbar).
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def background(a):
    """Vorherrschende Farbe am Bildrand und ihre Streuung."""
    h, w, _ = a.shape
    b = max(2, int(min(h, w) * 0.02))
    edge = np.concatenate([a[:b].reshape(-1, 3), a[-b:].reshape(-1, 3), a[:, :b].reshape(-1, 3), a[:, -b:].reshape(-1, 3)]).astype(np.float32)
    med = np.median(edge, axis=0)
    spread = np.percentile(np.linalg.norm(edge - med, axis=1), 90)
    return med, spread


def find_boxes(img, schwelle=0.0, min_pct=0.4):
    from scipy import ndimage
    W, H = img.size
    k = min(1.0, 900.0 / max(W, H))
    small = img.convert("RGB").resize((max(1, int(W * k)), max(1, int(H * k))), Image.BILINEAR)
    a = np.asarray(small).astype(np.float32)
    bg, spread = background(a)
    thr = schwelle or max(28.0, spread * 2.2)
    mask = np.linalg.norm(a - bg, axis=2) > thr
    # Teile eines Gegenstands verbinden (Klinge und Griff, Helm und Hoerner), dann Loecher fuellen
    r = max(2, int(min(a.shape[:2]) * 0.012))
    mask = ndimage.binary_opening(mask, iterations=1)
    mask = ndimage.binary_closing(mask, structure=np.ones((3, 3)), iterations=r)
    mask = ndimage.binary_fill_holes(mask)
    lab, n = ndimage.label(mask)
    boxes = []
    area_min = mask.size * min_pct / 100.0
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None:
            continue
        area = int((lab[sl] == i).sum())
        if area < area_min:
            continue
        y0, y1, x0, x1 = sl[0].start, sl[0].stop, sl[1].start, sl[1].stop
        # flache, breite Streifen sind Ueberschriften oder Beschriftungen, keine Gegenstaende
        if (y1 - y0) < 0.05 * mask.shape[0] and (x1 - x0) > 6 * (y1 - y0):
            print("uebersprungen (wohl Beschriftung): Rahmen %d,%d,%d,%d" % (x0 / k, y0 / k, x1 / k, y1 / k))
            continue
        boxes.append([int(x0 / k), int(y0 / k), int(np.ceil(x1 / k)), int(np.ceil(y1 / k))])
    # zeilenweise sortieren: Rahmen, deren Mitte innerhalb der halben Hoehe des Zeilenanfangs liegt, bilden eine Zeile
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows, cur = [], []
    for b in boxes:
        if cur and (b[1] + b[3]) / 2 > (cur[0][1] + cur[0][3]) / 2 + (cur[0][3] - cur[0][1]) / 2:
            rows.append(cur)
            cur = []
        cur.append(b)
    if cur:
        rows.append(cur)
    return [b for row in rows for b in sorted(row, key=lambda b: b[0])], tuple(int(round(c)) for c in bg)


def crop(img, box, rand, bg):
    """Ausschnitt mit Rand in Hintergrundfarbe, quadratisch (Meshy und die Vorschau mögen ruhige Formate)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    side = int(max(w, h) * (1 + 2 * rand))
    out = Image.new("RGB", (side, side), bg)
    piece = img.convert("RGB").crop((x0, y0, x1, y1))
    out.paste(piece, ((side - w) // 2, (side - h) // 2))
    return out


def probe():
    """Gezeichnete Tafel wie Tafel 10: fuenf Figuren mit Speer, Ueberschrift und Beschriftungen auf Pergament."""
    rng = np.random.default_rng(3)
    a = np.zeros((1100, 1800, 3), np.float32) + np.array([226, 212, 180]) + rng.normal(0, 6, (1100, 1800, 1))
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.load_default(size=26)
    except TypeError:
        f = ImageFont.load_default()
    d.text((60, 30), "Tafel 10: Krieger in fuenf Seltenheiten", fill=(60, 40, 20), font=f)
    for i, c in enumerate([(120, 120, 120), (60, 140, 60), (50, 90, 200), (140, 60, 170), (220, 140, 30)]):
        x, y = 120 + i * 340, 180
        d.polygon([(x + 60, y), (x + 180, y), (x + 220, y + 120), (x + 190, y + 520), (x + 50, y + 520), (x + 20, y + 120)], fill=c, outline=(30, 20, 10))
        d.ellipse([x + 80, y - 90, x + 160, y - 10], fill=(200, 170, 140), outline=(30, 20, 10))
        d.rectangle([x + 230, y + 60, x + 245, y + 480], fill=(90, 70, 50))
        d.text((x + 60, y + 560), "Seltenheit %d" % (i + 1), fill=(60, 40, 20), font=f)
    boxes, _ = find_boxes(im)
    ok = len(boxes) == 5 and all(abs(b[0] - (140 + i * 340)) < 12 and abs(b[3] - 700) < 12 for i, b in enumerate(boxes))
    if not ok:
        raise SystemExit("FEHLER: erwartet 5 Figuren in einer Reihe, gefunden %s" % boxes)
    print("OK: Zuschnitt findet die fuenf Figuren der Probetafel, Ueberschrift und Beschriftungen bleiben draussen")


def main():
    if sys.argv[1:] == ["--probe"]:
        return probe()
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("tafel")
    ap.add_argument("out")
    ap.add_argument("--name")
    ap.add_argument("--schwelle", type=float, default=0.0, help="Farbabstand zum Hintergrund (0: automatisch)")
    ap.add_argument("--min", type=float, default=0.4, help="kleinste Flaeche eines Gegenstands in Prozent der Tafel")
    ap.add_argument("--box", action="append", default=[], help="x0,y0,x1,y1 in Pixeln der Tafel (mehrfach)")
    ap.add_argument("--rand", type=float, default=0.06)
    a = ap.parse_args()
    img = Image.open(a.tafel)
    name = a.name or os.path.splitext(os.path.basename(a.tafel))[0]
    os.makedirs(a.out, exist_ok=True)
    if a.box:
        boxes = [[int(float(v)) for v in b.split(",")] for b in a.box]
        if any(len(b) != 4 or b[2] <= b[0] or b[3] <= b[1] for b in boxes):
            raise SystemExit("--box braucht x0,y0,x1,y1 mit x1 > x0 und y1 > y0")
        bg = tuple(int(round(c)) for c in background(np.asarray(img.convert("RGB")).astype(np.float32))[0])
    else:
        boxes, bg = find_boxes(img, a.schwelle, a.min)
    if not boxes:
        raise SystemExit("Keine Gegenstaende gefunden; --schwelle kleiner setzen oder mit --box schneiden.")
    over = img.convert("RGB").copy()
    d = ImageDraw.Draw(over)
    lw = max(2, int(max(img.size) / 300))
    try:
        font = ImageFont.load_default(size=9 * lw)
    except TypeError:  # aeltere Pillow-Fassungen ohne Groesse
        font = ImageFont.load_default()
    for i, b in enumerate(boxes, 1):
        p = os.path.join(a.out, "%s_%d.png" % (name, i))
        crop(img, b, a.rand, bg).save(p)
        d.rectangle(b, outline=(220, 30, 30), width=lw)
        d.rectangle([b[0], b[1], b[0] + 14 * lw, b[1] + 10 * lw], fill=(220, 30, 30))
        d.text((b[0] + 3 * lw, b[1] + lw), str(i), fill=(255, 255, 255), font=font)
        print("%s_%d.png: %d x %d Pixel, Rahmen %s" % (name, i, b[2] - b[0], b[3] - b[1], ",".join(map(str, b))))
    over.thumbnail((1600, 1600))
    over.save(os.path.join(a.out, name + "_uebersicht.png"))
    print("Uebersicht:", os.path.join(a.out, name + "_uebersicht.png"), "(%d Ausschnitte)" % len(boxes))


if __name__ == "__main__":
    sys.exit(main())
