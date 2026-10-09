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
 - Ist das Modell breiter als fuer die Grundart vorgesehen (MAXW), wird es insgesamt kleiner (ohne --laenge).
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
import meshy_import as M  # noqa: E402
import fit_piece as FP  # noqa: E402

# Grundart: (Verfahren, Laenge, Griffpunkt als Anteil der Laenge vom Ende, Seite des Kopfes auf X)
# gemessen an den gebauten Waffen (Variante 0, gewoehnlich)
BASES = {
    "schwert": ("parier", 1.062, 0.127, 0), "kurzschwert": ("parier", 0.585, 0.154, 0), "dolch": ("parier", 0.46, 0.196, 0),
    "axt": ("kopf", 0.744, 0.2, 1), "hammer": ("kopf", 0.72, 0.21, 0), "sichel": ("kopf", 0.302, 0.3, 1),
    "speer": ("kopf", 1.678, 0.328, 0), "stab": ("kopf", 2.041, 0.3, 0), "runenstab": ("kopf", 1.9, 0.316, 0),
    "zepter": ("kopf", 0.792, 0.33, 0), "bogen": ("bogen", 1.74, 0.5, -1), "schild": ("schild", 1.082, 0.435, 0),
    # Armbrust: Schaft entlang +X ueber der Faust, Bogen quer (Z), Griff bei 54 % vom Kolben, Schaft 8,5 cm ueber dem Griff
    "armbrust": ("armbrust", 0.81, 0.54, 0),
    # feste Nebenhand-Teile (Lage wie die gebauten in src/r3d-items-armor.js): Groesse, Ursprung als Anteil der Hoehe
    "koecher": ("fest", 0.67, 0.42, 0), "wurfmesser": ("fest", 0.2, 0.8, 0), "fokus": ("fest", 0.16, 0.5, 0),
}
# fest: gemessen an Hoehe, Breite oder groesster Ausdehnung; vorn: duennste waagerechte Richtung nach Z, Ursprung an
# der Rueckseite (Guertelhalterung liegt am Koerper an)
FEST = {"koecher": ("hoehe", False), "wurfmesser": ("breite", True), "fokus": ("max", False)}


# groesste Breite (Meter, quer zur Klinge oder zum Schaft): etwa doppelt so viel wie bei den gebauten Waffen. Breitere
# Modelle (riesige Kugel am Stab, Klotz am Hammer) werden insgesamt kleiner, statt die Figur zu verdecken
MAXW = {"schwert": 0.4, "kurzschwert": 0.3, "dolch": 0.2, "axt": 0.45, "hammer": 0.4, "sichel": 0.4, "speer": 0.3,
        "stab": 0.35, "runenstab": 0.35, "zepter": 0.3, "bogen": 0.5, "schild": 0.8,
        "armbrust": 0.75, "koecher": 0.3, "wurfmesser": 0.3, "fokus": 0.25}


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


def front_z(P, F, back=False):
    """Duennste waagerechte Richtung nach +Z drehen; vorn ist die Seite, die weiter vorsteht (back kehrt das um)."""
    S = surface_points(P, F)
    Q = S[:, [0, 2]] - S[:, [0, 2]].mean(0)
    val, vec = np.linalg.eigh(Q.T @ Q)
    tx, tz = vec[:, 0]
    ang = np.arctan2(tx, tz)
    Ry = np.array([[np.cos(-ang), 0, np.sin(-ang)], [0, 1, 0], [-np.sin(-ang), 0, np.cos(-ang)]])
    P = P @ Ry.T
    z = (S @ Ry.T)[:, 2]
    if (z.max() - z.mean() < z.mean() - z.min()) != back:
        P = P * np.array([-1.0, 1.0, -1.0])
    return P, ang


def orient_crossbow(P, F, frac, target):
    """Armbrust: Schaft ist die laengste Richtung (X), der Querbogen die zweitlaengste (Z), die duennste ist oben-unten
    (Y); so ist es gleich, ob Meshy sie liegend oder aufrecht gebaut hat. Unten ist die Seite, zu der Griff und Abzug
    weiter herausragen (Schiefe der Verteilung), vorn (+X) das Ende mit dem breiten Querbogen. Liefert R, Ursprung,
    Laenge und Griffanteil wie orient()."""
    S = surface_points(P, F)
    c, ax, _ = area_pca(P, F)
    x, z0, y = ax[0], ax[1], ax[2]
    sy = (S - c) @ y
    if ((sy - sy.mean()) ** 3).mean() > 0:
        y = -y
    s, w = (S - c) @ x, (S - c) @ z0
    nb = 20
    b = np.clip(((s - s.min()) / max(np.ptp(s), 1e-9) * nb).astype(int), 0, nb - 1)
    spread = np.array([np.ptp(w[b == k]) if (b == k).sum() > 2 else 0 for k in range(nb)])
    if np.argmax(spread) < nb / 2:
        x = -x
    z = np.cross(x, y)
    R = np.array([x, y, z])
    Pr = (S - c) @ R.T
    lo, hi = Pr[:, 0].min(), Pr[:, 0].max()
    L = hi - lo
    gx = lo + frac * L
    near = np.abs(Pr[:, 0] - gx) < 0.06 * L
    ys = np.median(Pr[near, 1]) if near.sum() > 5 else np.median(Pr[:, 1])
    oz = np.median(Pr[near, 2]) if near.sum() > 5 else 0.0
    sc = target / L
    origin = c + R.T @ np.array([gx, ys - 0.085 / sc, oz])
    return R, origin, L, frac


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("out")
    ap.add_argument("glb")
    ap.add_argument("--base", required=True, choices=sorted(BASES))
    ap.add_argument("--name")
    ap.add_argument("--forms", default="")
    ap.add_argument("--seltenheit", default="")
    ap.add_argument("--kultur", default="", help="nur fuer Gegenstaende dieser Gestaltungskultur (midgard, albion, hibernia)")
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
        # Vorderseite: die duennste waagerechte Richtung wird +Z (manche Modelle schauen zur Seite), vorn ist die Seite,
        # die weiter vorsteht (Buckel); --umdrehen dreht um
        S = surface_points(P, F)
        Q = S[:, [0, 2]] - S[:, [0, 2]].mean(0)
        val, vec = np.linalg.eigh(Q.T @ Q)
        tx, tz = vec[:, 0]
        ang = np.arctan2(tx, tz)
        Ry = np.array([[np.cos(-ang), 0, np.sin(-ang)], [0, 1, 0], [-np.sin(-ang), 0, np.cos(-ang)]])
        P = P @ Ry.T
        z = (S @ Ry.T)[:, 2]
        if (z.max() - z.mean() < z.mean() - z.min()) != bool(a.umdrehen):
            P = P * np.array([-1.0, 1.0, -1.0])
        if abs(np.degrees(ang)) > 20:
            print("Schild gedreht: Vorderseite schaute %.0f Grad zur Seite" % np.degrees(ang))
        lo, hi = P.min(0), P.max(0)
        h = hi[1] - lo[1]
        sc = target / h
        origin = np.array([(lo[0] + hi[0]) / 2, lo[1] + (a.griff if a.griff is not None else frac) * h, hi[2] - 0.041 / sc])
        R = np.eye(3)
        L, gf = h, frac
    elif mode == "fest":
        measure, front = FEST[a.base]
        if front:
            P, _ = front_z(P, F, a.umdrehen)
        lo, hi = P.min(0), P.max(0)
        ext = hi - lo
        L = {"hoehe": ext[1], "breite": ext[0], "max": ext.max()}[measure]
        sc = target / L
        gf = a.griff if a.griff is not None else frac
        origin = np.array([(lo[0] + hi[0]) / 2, lo[1] + gf * ext[1], lo[2] if front else (lo[2] + hi[2]) / 2])
        R = np.eye(3)
    elif mode == "armbrust":
        R, origin, L, gf = orient_crossbow(P, F, a.griff if a.griff is not None else frac, target)
        sc = target / L
        if a.umdrehen:
            R = np.array([-R[0], R[1], -R[2]])
    else:
        R, origin, L, gf = orient(P, F, mode, frac, side, a.umdrehen, a.griff)
        sc = target / L
    P = ((P - origin) @ R.T) * sc
    w = max(np.ptp(P[:, 0]), np.ptp(P[:, 2])) if mode not in ("schild", "armbrust") else np.ptp(P[:, 0]) if mode == "schild" else np.ptp(P[:, 2])
    if a.laenge is None and w > MAXW[a.base]:
        print("Breiter als %.2f m: kleiner gesetzt (Laenge %.2f statt %.2f m)" % (MAXW[a.base], (np.ptp(P[:, 1])) * MAXW[a.base] / w, np.ptp(P[:, 1])))
        P = P * (MAXW[a.base] / w)
    tris_in = len(F)
    if len(F) > a.tris * 1.05:
        one = np.zeros((len(P), 1), np.int64)
        P, UV, F, _, _ = M.decimate(P, UV, F, one, np.ones((len(P), 1)), a.tris)
    name = a.name or os.path.splitext(os.path.basename(a.out))[0]
    lo, hi = P.min(0), P.max(0)
    meta = {"name": name, "base": a.base, "forms": [x for x in a.forms.split(",") if x], "rarity": [x for x in a.seltenheit.split(",") if x], "culture": a.kultur,
            "min": [float(v) for v in lo], "max": [float(v) for v in hi], "grip": float(gf)}
    np.savez_compressed(a.out, **M.normal_extra(g, tex), kind="weapon", pos=P.astype(np.float32), uv=UV.astype(np.float32), idx=F.astype(np.int32),
                        tex=tex.astype(np.uint8), meta=json.dumps(meta, ensure_ascii=False))
    print("Waffe %s (%s): %d Dreiecke (vorher %d), Laenge %.2f m, Griff bei %.0f %% vom Ende, Bereich X %.2f..%.2f Y %.2f..%.2f, Textur %d px"
          % (name, a.base, len(F), tris_in, hi[1] - lo[1], gf * 100, lo[0], hi[0], lo[1], hi[1], tex.shape[1]))


if __name__ == "__main__":
    main()
