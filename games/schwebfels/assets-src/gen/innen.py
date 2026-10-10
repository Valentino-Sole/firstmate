"""Innenseiten eines angepassten Ruestungsteils in der Farbe der naechsten Aussenflaeche einfaerben.

Meshys Stoffe und Ruestungen sind duenne Doppelschichten. Beim Anpassen an andere Koerper sticht die Innenlage an
einzelnen Stellen durch die Aussenlage (lift() in fit_piece.py haelt das klein, aber nicht bei null). Bei den
Midgard-Modellen fiel das kaum auf, weil Meshy die Innenseite aehnlich wie die Aussenseite bemalt. Die Neutexturierung
(meshy_api.py neutextur) malt Innenseiten dagegen fast schwarz: Auf dem Albion-Fluegelhelm lagen dunkle Flecken.

Verfahren: Das Teil sitzt auf dem Referenzkoerper (Lage wie beim Anpassen). Strahlen aus vielen Richtungen treffen
Teil oder Koerper; Dreiecke des Teils, die nie als erste und von vorn getroffen werden, liegen innen (unter der
Aussenlage, am Koerper, oder sie stechen mit ihrer Rueckseite durch die Aussenlage). Ihre Flaeche in der Textur bekommt die Farbe des naechsten aussen liegenden Dreiecks; sticht die Innenlage
durch, sieht man dort die Farbe der Aussenseite.

Aufruf: innen.py <teil.npz> [...]  (Referenzkoerper aus den Metadaten des Teils, meshy/rig/<ref>.npz; schreibt das
Teil neu). Aus fit_piece.py mit --innen.
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def interior(P, F, BP, BF, ndir=64, grid=120):
    """Bool je Dreieck von (P, F): von aussen nie als erstes und von vorn getroffen (Koerper BP, BF verdeckt mit)."""
    import bpy  # noqa: F401 (bringt mathutils mit)
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    n = len(F)
    allP = np.concatenate([P, BP])
    allF = np.concatenate([F, BF + len(P)])
    tree = BVHTree.FromPolygons([Vector(p) for p in allP], [tuple(int(i) for i in f) for f in allF])
    c = P.mean(0)
    R = np.linalg.norm(P - c, axis=1).max() * 1.05
    seen = np.zeros(n, bool)
    gi = np.linspace(-R, R, grid)
    for k in range(ndir):
        zz = 1 - 2 * (k + 0.5) / ndir
        r = np.sqrt(1 - zz * zz)
        ph = k * np.pi * (3 - np.sqrt(5))
        d = np.array([r * np.cos(ph), zz, r * np.sin(ph)])
        if d[1] > 0.25:
            # Blick von unten (die Spielkamera steht hoeher als die Figuren): sonst saehe ein Strahl durch die
            # Gesichtsoeffnung die Innenseite des Helms von vorn und hielte sie fuer aussen
            continue
        e1 = np.cross(d, [0, 1, 0] if abs(d[1]) < 0.9 else [1, 0, 0])
        e1 /= np.linalg.norm(e1)
        e2 = np.cross(d, e1)
        D = Vector(d)
        for x in gi:
            for y in gi:
                o = c - d * 2 * R + e1 * x + e2 * y
                loc, nrm, fi, _ = tree.ray_cast(Vector(o), D, 4 * R)
                # nur Vorderseiten zaehlen: wo die Innenlage durchsticht, trifft der Strahl ihre Rueckseite
                if loc is not None and fi < n and nrm.dot(D) < 0:
                    seen[fi] = True
    return ~seen


def paint(P, F, UV, tex, inside):
    """Texturflaeche der Innen-Dreiecke mit der Farbe des naechsten Aussen-Dreiecks fuellen (Mitte zu Mitte)."""
    from PIL import Image, ImageDraw
    from scipy.spatial import cKDTree

    if not inside.any() or inside.all():
        return tex
    H, W = tex.shape[:2]
    cen = P[F].mean(1)
    out = np.nonzero(~inside)[0]
    _, near = cKDTree(cen[out]).query(cen[inside])
    src = out[near]
    # Farbe eines Dreiecks: Mittel aus vier Punkten in seiner Texturflaeche
    bary = np.array([[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]])

    def color(tris):
        c = np.zeros((len(tris), 3))
        for w in bary:
            uv = (UV[F[tris]] * w[None, :, None]).sum(1)
            x = np.clip(uv[:, 0] * W, 0, W - 1).astype(int)
            y = np.clip((1 - uv[:, 1]) * H, 0, H - 1).astype(int)
            c += tex[y, x, :3]
        return c / len(bary)

    ins = np.nonzero(inside)[0]
    cols = color(src)
    # nur deutlich dunklere Innenflaechen (Meshys dunkel bemalte Innenseiten); innen liegende Aussenflaechen mit eigener
    # Zeichnung (unter den Armen, in der Grundhaltung verdeckt) behalten ihre Textur
    dark = color(ins).mean(1) < 0.6 * cols.mean(1)
    img = Image.fromarray(tex[..., :3].copy())
    d = ImageDraw.Draw(img)
    for t, col in zip(ins[dark], cols[dark].astype(int)):
        pts = [(float(UV[i, 0] * W), float((1 - UV[i, 1]) * H)) for i in F[t]]
        d.polygon(pts, fill=tuple(int(v) for v in col), outline=tuple(int(v) for v in col))
    res = tex.copy()
    res[..., :3] = np.asarray(img)
    return res


def area(P, F):
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    return np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2


def run(path):
    z = np.load(path, allow_pickle=True)
    meta = json.loads(str(z["meta"]))
    body = np.load(os.path.join(HERE, "meshy", "rig", meta["ref"] + ".npz"))
    P, F, UV = z["pos"].astype(float), z["idx"].astype(np.int64), z["uv"].astype(float)
    if meta["slot"] == "umhang":
        # Umhaenge legt das Spiel selbst um den Ruecken (cloakGeo in src/r3d-rigged.js), ihre Lage hier ist eine andere
        print("%s: Umhang, unveraendert" % os.path.basename(path))
        return
    inside = interior(P, F, body["pos"].astype(float), body["idx"].astype(np.int64))
    tex = paint(P, F, UV, z["tex"], inside)
    changed = (tex != z["tex"]).any(2)
    data = {k: z[k] for k in z.files}
    data["tex"] = tex.astype(np.uint8)
    np.savez_compressed(path, **data)
    ar = area(P, F)
    print("%s: innen %.1f %% der Flaeche (%d von %d Dreiecken), %.1f %% der Textur dunkel und eingefaerbt" % (os.path.basename(path), 100 * ar[inside].sum() / ar.sum(), inside.sum(), len(F), 100 * changed.mean()))


if __name__ == "__main__":
    for p in sys.argv[1:]:
        run(p)
