"""Waffe oder Schild aus einer GLB (z. B. Meshy Bild zu 3D) fuer das Spiel.

Aufruf: python weapon.py <ausgabe.npz> <waffe.glb> --base schwert [--name schwert_eisen] [--forms schwert.0,...]
                         [--seltenheit selten,episch] [--laenge 1.06] [--umdrehen] [--griff 0.13] [--tris 3000] [--tex 512]

Das Modell wird in die Lage der gebauten Waffen gebracht (src/r3d-items-weapons.js): Griffpunkt im Ursprung, Klinge
oder Schaft entlang +Y, Schneide, Axtblatt oder Parierstange entlang X, Dicke entlang Z. Laenge und Griffpunkt kommen
aus den gebauten Waffen derselben Grundart, damit Haltung und Reichweite im Spiel gleich bleiben.
 - Hauptachse: die laengste Richtung des Modells (Hauptachsenzerlegung ueber die Dreiecksflaechen).
 - Griffende: bei Schwertern und Dolchen liegt die breiteste Stelle (Parierstange) nahe am Griff, bei Aexten, Haemmern,
   Speeren und Staeben weit davon (Kopf). Sitzt die Waffe verkehrt herum: --umdrehen.
 - Griffpunkt: knapp unter der Parierstange bzw. bei einem festen Anteil der Laenge vom Ende; --griff setzt den Anteil.
 - Schilde behalten die Meshy-Lage (Vorderseite +Z, oben +Y) und werden auf die Hoehe der gebauten Schilde gebracht.
Im Spiel ersetzt die Waffe die gebaute Waffe, wenn Form oder Grundart (und, falls angegeben, die Seltenheit) passen;
das Gegenstandsbild zeigt dann dieses Modell. gen_pack.py nimmt alles aus dem Unterordner "waffen" auf.
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meshy as M  # noqa: E402
import fit_piece as FP  # noqa: E402

# Grundart: (Verfahren, Laenge, Griffpunkt als Anteil der Laenge vom Ende, Seite des Kopfes auf X)
# gemessen an den gebauten Waffen (Variante 0, gewoehnlich)
BASES = {
    "schwert": ("parier", 1.062, 0.127, 0), "kurzschwert": ("parier", 0.585, 0.154, 0), "dolch": ("parier", 0.46, 0.196, 0),
    "axt": ("kopf", 0.744, 0.2, 1), "hammer": ("kopf", 0.72, 0.21, 0), "sichel": ("kopf", 0.302, 0.3, 1),
    "speer": ("kopf", 1.678, 0.328, 0), "stab": ("kopf", 2.041, 0.3, 0), "runenstab": ("kopf", 1.9, 0.316, 0),
    "zepter": ("kopf", 0.792, 0.33, 0), "bogen": ("bogen", 1.74, 0.5, -1), "schild": ("schild", 1.082, 0.435, 0),
}


def area_pca(P, F):
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    w = np.linalg.norm(np.cross(b - a, c - a), axis=1) / 2 + 1e-12
    m = (a + b + c) / 3
    mu = (m * w[:, None]).sum(0) / w.sum()
    d = m - mu
    C = (d * w[:, None]).T @ d / w.sum()
    val, vec = np.linalg.eigh(C)
    return mu, vec[:, ::-1].T, val[::-1]


def surface_points(P, F, n=40000):
    """Gleichmaessig verteilte Punkte auf der Oberflaeche (unabhaengig davon, wie fein das Netz unterteilt ist)."""
    a, b, c = P[F[:, 0]], P[F[:, 1]], P[F[:, 2]]
    w = np.linalg.norm(np.cross(b - a, c - a), axis=1)
    rng = np.random.default_rng(7)
    t = rng.choice(len(F), n, p=w / w.sum())
    u, v = rng.random(n), rng.random(n)
    m = u + v > 1
    u[m], v[m] = 1 - u[m], 1 - v[m]
    return a[t] + (b[t] - a[t]) * u[:, None] + (c[t] - a[t]) * v[:, None]


def orient(P, F, mode, frac, side, flip, grip):
    """Drehung und Griffpunkt: liefert R (Zeilen X, Y, Z) und den Ursprung im Modellraum."""
    mu, ax, _ = area_pca(P, F)
    y = ax[0]
    P = surface_points(P, F)
    nb = 40

    def profile(mu, y):
        s = (P - mu) @ y
        q = (P - mu) - np.outer(s, y)
        r = np.linalg.norm(q, axis=1)
        lo, hi = s.min(), s.max()
        b = np.clip(((s - lo) / (hi - lo) * nb).astype(int), 0, nb - 1)
        rmax = np.zeros(nb)
        np.maximum.at(rmax, b, r)
        return s, q, r, lo, hi, b, rmax
    # Achse am Schaft ausrichten: Mittelpunkte der schmalen Abschnitte (ohne Kopf oder Parierstange) auf einer Geraden
    s, q, r, lo, hi, b, rmax = profile(mu, y)
    thin = [k for k in range(nb) if 0 < rmax[k] < 0.5 * rmax.max()]
    if len(thin) >= 4:
        C = np.array([P[b == k].mean(0) for k in thin])
        m = C.mean(0)
        _, _, vt = np.linalg.svd(C - m, full_matrices=False)
        y2 = vt[0] if vt[0] @ y > 0 else -vt[0]
        if y2 @ y > 0.9:
            mu, y = m, y2
            s, q, r, lo, hi, b, rmax = profile(mu, y)
    L = hi - lo
    wpos = lo + (np.argmax(rmax) + 0.5) / nb * L
    near_lo = abs(wpos - lo) < abs(wpos - hi)
    # Griffende: Parierstange nahe am Griff, Kopf weit davon
    grip_lo = near_lo if mode == "parier" else not near_lo
    if flip:
        grip_lo = not grip_lo
    if not grip_lo:
        y = -y
        s = -s
        lo, hi = -hi, -lo
        wpos = -wpos
    # Griffpunkt (Abstand vom Griffende)
    yg = wpos - lo
    if grip is not None:
        gy = grip * L
    elif mode == "parier" and 0.04 * L < yg < 0.45 * L:
        gy = 0.64 * yg
    else:
        gy = frac * L
    # Schaft im Griffbereich auf die Achse legen
    sel = np.abs(s - (lo + gy)) < 0.04 * L
    off = q[sel].mean(0) if sel.sum() > 3 else np.zeros(3)
    # Breitenrichtung aus dem breitesten Bereich (Parierstange, Axtblatt), Seite des Kopfes nach side
    head = r > 0.6 * rmax.max()
    Q = (q[head] if head.sum() > 10 else q) - off
    _, _, vt = np.linalg.svd(Q - Q.mean(0), full_matrices=False)
    x = vt[0] - y * (vt[0] @ y)
    x /= np.linalg.norm(x)
    if side:
        if np.sign((Q @ x).mean()) != side:
            x = -x
    elif x[0] < 0:
        x = -x
    z = np.cross(x, y)
    R = np.array([x, y, z])
    origin = mu + y * (lo + gy) + off
    return R, origin, L, gy / L


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("out")
    ap.add_argument("glb")
    ap.add_argument("--base", required=True, choices=sorted(BASES))
    ap.add_argument("--name")
    ap.add_argument("--forms", default="")
    ap.add_argument("--seltenheit", default="")
    ap.add_argument("--laenge", type=float)
    ap.add_argument("--griff", type=float)
    ap.add_argument("--umdrehen", action="store_true")
    ap.add_argument("--tris", type=int, default=3000)
    ap.add_argument("--tex", type=int, default=512)
    a = ap.parse_args()
    mode, length, frac, side = BASES[a.base]
    g, parts = FP.static_parts(a.glb)
    tex = M.atlas(g, parts, a.tex)
    P = np.concatenate([p["pos"] for p in parts])
    UV = np.concatenate([p["uv_game"] for p in parts])
    base = np.cumsum([0] + [len(p["pos"]) for p in parts])[:-1]
    F = np.concatenate([p["idx"] + b for p, b in zip(parts, base)])
    target = a.laenge or length
    if mode == "schild":
        lo, hi = P.min(0), P.max(0)
        h = hi[1] - lo[1]
        sc = target / h
        origin = np.array([(lo[0] + hi[0]) / 2, lo[1] + (a.griff if a.griff is not None else frac) * h, hi[2] - 0.041 / sc])
        R = np.eye(3)
        L, gf = h, frac
    else:
        R, origin, L, gf = orient(P, F, mode, frac, side, a.umdrehen, a.griff)
        sc = target / L
    P = ((P - origin) @ R.T) * sc
    tris_in = len(F)
    if len(F) > a.tris * 1.05:
        one = np.zeros((len(P), 1), np.int64)
        P, UV, F, _, _ = M.decimate(P, UV, F, one, np.ones((len(P), 1)), a.tris)
    name = a.name or os.path.splitext(os.path.basename(a.out))[0]
    lo, hi = P.min(0), P.max(0)
    meta = {"name": name, "base": a.base, "forms": [x for x in a.forms.split(",") if x], "rarity": [x for x in a.seltenheit.split(",") if x],
            "min": [float(v) for v in lo], "max": [float(v) for v in hi], "grip": float(gf)}
    np.savez_compressed(a.out, kind="weapon", pos=P.astype(np.float32), uv=UV.astype(np.float32), idx=F.astype(np.int32),
                        tex=tex.astype(np.uint8), meta=json.dumps(meta, ensure_ascii=False))
    print("Waffe %s (%s): %d Dreiecke (vorher %d), Laenge %.2f m, Griff bei %.0f %% vom Ende, Bereich X %.2f..%.2f Y %.2f..%.2f, Textur %d px"
          % (name, a.base, len(F), tris_in, hi[1] - lo[1], gf * 100, lo[0], hi[0], lo[1], hi[1], tex.shape[1]))


if __name__ == "__main__":
    main()
