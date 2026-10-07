"""Einzelfiguren aus den Konzepttafeln schneiden (Vorlagen fuer Bild-zu-3D): Rand in Papierfarbe, Mindesthoehe 1200 Pixel.

Aufruf: python crop_templates.py <entpacktes Konzeptpaket> <ausgabeordner>"""
import sys
from PIL import Image
K, OUT = sys.argv[1], sys.argv[2]
K10 = 1683 / 1600  # Tafel 10: Koordinaten aus der Vorschau (1600 breit) auf die volle Aufloesung
JOBS = [
    # Midgard-Voelker (Tafel 02 zeigt je Volk ein Geschlecht)
    ("02-midgard-rassen.webp", (0, 150, 300, 1015), "01-nordmann-frau.png"),
    ("02-midgard-rassen.webp", (305, 60, 755, 1015), "04-trollblut-mann.png"),
    ("02-midgard-rassen.webp", (750, 300, 1032, 1015), "05-frostwicht-mann.png"),
    ("02-midgard-rassen.webp", (1045, 370, 1374, 1015), "06-glutzwerg-frau.png"),
    ("01-albion-rassen.webp", (385, 240, 740, 900), "02-kreidezwerg-mann.png"),
    ("19-bestien-wildnis.webp", (10, 50, 450, 455), "03-wolf.png"),
    # Ausruestung fuer den Wechseltest: Krieger normal und gruen (Tafel 10), Schwert gruen (Tafel 14)
    ("10-krieger-fuenf-seltenheiten.webp", tuple(round(v * K10) for v in (15, 125, 332, 780)), "10-krieger-normal.png"),
    ("10-krieger-fuenf-seltenheiten.webp", tuple(round(v * K10) for v in (330, 125, 640, 780)), "11-krieger-gruen.png"),
    ("14-waffen-krieger.webp", (432, 115, 700, 315), "12-schwert-gruen.png"),
]
for src, box, name in JOBS:
    import os
    p = K + "/" + src if os.path.exists(K + "/" + src) else K + "/grundkonzept-v02/" + src
    im = Image.open(p).convert("RGB")
    c = im.crop(box)
    import numpy as np
    a = np.asarray(c)
    edge = np.concatenate([a[:4].reshape(-1, 3), a[-4:].reshape(-1, 3), a[:, :4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg = tuple(int(v) for v in np.median(edge, axis=0))
    w, h = c.size
    pad = int(max(w, h) * 0.08)
    side_w, side_h = w + 2 * pad, h + 2 * pad
    o = Image.new("RGB", (side_w, side_h), bg)
    o.paste(c, (pad, pad))
    s = max(1.0, 1200 / max(side_w, side_h))
    if s > 1:
        o = o.resize((round(side_w * s), round(side_h * s)), Image.LANCZOS)
    o.save(OUT + "/" + name)
    print(name, o.size)
