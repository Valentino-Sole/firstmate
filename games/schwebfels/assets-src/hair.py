"""Haare und Baerte der Helden aus Straehnen und geflochtenen Zoepfen (numpy), an den Koerper gebunden.

Frisuren (Reihenfolge wie HAIR_STYLES im Spiel): Kurz, Zoepfe, Lang, Kamm, Glatze, Knoten.
Baerte (wie BEARDS): Keiner, Kinnbart, Vollbart, Geflochten, Schnauzer.
Aufruf: python hair.py <humans.npz> <ausgabe.npz>"""
import os
import sys
import math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bindlib  # noqa: E402

NPZ, OUT = sys.argv[1], sys.argv[2]
h = np.load(NPZ)
POS = h["pos"].astype(np.float64)
IDX = h["idx"]
REG = h["region"] & 15
BODY = bindlib.Body(POS, IDX)
rng = np.random.default_rng(7)

from headlib import C, RAD, ell, to_angles, hairline_phi, surface_path  # noqa: E402
import mhlib  # noqa: E402

hv = np.unique(IDX[REG == 5].reshape(-1))
# feiner Grundkoerper (MakeHuman, Spielmassstab) fuer die Haardecke
_v0, _vt, _faces = mhlib.load_obj(os.path.join(mhlib.data_dir(), "3dobjs", "base.obj"))
FULL = _v0.copy()
FULL[:, 1] -= FULL[:13380, 1].min()
FULL *= 2.0 / FULL[:13380, 1].max()
FULL_F = [f[0] for f in _faces if f[2] == "body"]


def collide(pts, margin):
    """Schiebt Punkte aus dem Koerper heraus (mindestens 'margin' ueber der Haut)."""
    out = pts.copy()
    for i, p in enumerate(pts):
        loc, nrm, k, dist = BODY.tree.find_nearest(tuple(p), 0.3)
        if loc is None:
            continue
        q = np.array(loc)
        n = BODY.vn[BODY.idx[k]].mean(axis=0)
        n /= np.linalg.norm(n)
        d = (p - q) @ n
        if d < margin:
            out[i] = p + n * (margin - d)
    return out


def smooth_path(p, it=2):
    for _ in range(it):
        q = p.copy()
        q[1:-1] = (p[:-2] + 2 * p[1:-1] + p[2:]) / 4
        p = q
    return p


def resample(p, step):
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    L = np.concatenate([[0], np.cumsum(seg)])
    n = max(3, int(L[-1] / step) + 1)
    t = np.linspace(0, L[-1], n)
    return np.stack([np.interp(t, L, p[:, k]) for k in range(3)], axis=1), L[-1]


class Mesh:
    def __init__(self):
        self.pos, self.uv, self.idx, self.col = [], [], [], []
        self.n = 0

    def add(self, P, UV, F, col):
        self.pos.append(P)
        self.uv.append(UV)
        self.idx.append(F + self.n)
        self.col.append(col)
        self.n += len(P)

    def arrays(self):
        return (np.concatenate(self.pos), np.concatenate(self.uv), np.concatenate(self.idx), np.concatenate(self.col))


def frames(path, up_hint):
    """Parallel mitgefuehrte Rahmen entlang eines Pfades."""
    T = np.gradient(path, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    N = np.zeros_like(path)
    n = up_hint - T[0] * (up_hint @ T[0])
    if np.linalg.norm(n) < 1e-6:
        n = np.cross(T[0], [1, 0, 0])
    n /= np.linalg.norm(n)
    for i in range(len(path)):
        n = n - T[i] * (n @ T[i])
        n /= np.linalg.norm(n) + 1e-12
        N[i] = n
    B = np.cross(T, N)
    return T, N, B


def tube(mesh, path, r0, r1, sides=5, flat=0.5, up=None, tone=1.0, tip_taper=0.75, v_scale=1.0, step=0.02):
    """Getaperte Straehne mit flachem Querschnitt; 'up' zeigt die flache Seite (z. B. zum Kopf)."""
    path, L = resample(path, step)
    n = len(path)
    if up is None:
        up = np.array([0, 1.0, 0])
    T, N, B = frames(path, up)
    t = np.linspace(0, 1, n)
    r = r0 + (r1 - r0) * t
    r = r * np.where(t > tip_taper, 1 - (t - tip_taper) / (1 - tip_taper) * 0.85, 1.0)
    r = r * np.where(t < 0.06, 0.65 + 0.35 * t / 0.06, 1.0)
    ang = np.linspace(0, 2 * math.pi, sides, endpoint=False)
    P = path[:, None, :] + (np.cos(ang)[None, :, None] * N[:, None, :] * flat + np.sin(ang)[None, :, None] * B[:, None, :]) * r[:, None, None]
    P = P.reshape(-1, 3)
    UV = np.stack(np.meshgrid(np.arange(sides) / sides, t * L / 0.12 * v_scale), axis=-1).reshape(-1, 2)
    F = []
    for i in range(n - 1):
        for k in range(sides):
            a = i * sides + k
            b = i * sides + (k + 1) % sides
            c = (i + 1) * sides + (k + 1) % sides
            d = (i + 1) * sides + k
            F += [[a, b, c], [a, c, d]]
    # Spitze schliessen
    F = np.array(F)
    col = np.repeat((0.62 + 0.38 * np.clip(t * 4, 0, 1)) * tone, sides)
    mesh.add(P, UV, F, col)


def strand_on_head(theta0, phi0, theta1, phi1, lift0, lift1, n=10):
    # kuerzester Weg um den Kopf (nicht ueber das Gesicht zurueck)
    theta1 = theta0 + (theta1 - theta0 + math.pi) % (2 * math.pi) - math.pi
    s = np.linspace(0, 1, n)
    th = theta0 + (theta1 - theta0) * s
    ph = phi0 + (phi1 - phi0) * s
    lf = lift0 + (lift1 - lift0) * s
    return ell(th, ph, lf)


def scalp_roots(count, theta_range=None, phi_max_extra=0.0):
    """Gleichmaessig verteilte Haarwurzeln innerhalb des Haaransatzes."""
    pts = []
    tries = 0
    while len(pts) < count and tries < count * 50:
        tries += 1
        th = rng.uniform(-math.pi, math.pi)
        ph = math.acos(rng.uniform(-0.6, 1.0))
        if theta_range and not (theta_range[0] <= th <= theta_range[1]):
            continue
        if ph > hairline_phi(th) + phi_max_extra:
            continue
        p = np.array([th, ph])
        if pts and min(np.hypot(*(p - q) * [math.sin(ph) + 0.2, 1]) for q in pts) < 0.16:
            continue
        pts.append(p)
    return np.array(pts)


def gravity_fall(start, direction, length, pull_out=0.02, sway=0.0, step=0.02):
    pts = [start]
    d = direction / np.linalg.norm(direction)
    p = start.copy()
    nseg = max(2, int(length / step))
    for i in range(nseg):
        d = d * 0.82 + np.array([0, -1.0, 0]) * 0.18
        d /= np.linalg.norm(d)
        p = p + d * step
        p = p + np.array([math.sin(i * 0.5 + sway) * 0.0015, 0, 0])
        pts.append(p.copy())
    pts = np.array(pts)
    for _ in range(2):
        pts = collide(pts, pull_out)
        pts = smooth_path(pts, 1)
    return pts


def braid(mesh, center, r=0.011, twist=10.0, tone=1.0, tie=True):
    """Dreistraengiger Zopf entlang einer Mittellinie."""
    center, L = resample(center, 0.011)
    n = len(center)
    T, N, B = frames(center, np.array([0, 0, 1.0]))
    t = np.linspace(0, 1, n)
    taper = np.where(t > 0.8, 1 - (t - 0.8) / 0.2 * 0.45, 1.0)
    for k in range(3):
        ph = t * L / r / twist * 2 * math.pi + k * 2 * math.pi / 3
        off = (np.sin(ph)[:, None] * N * 1.0 + np.sin(2 * ph)[:, None] * B * 0.45) * r * 0.9 * taper[:, None]
        tube(mesh, center + off, r * 0.78, r * 0.62, sides=5, flat=0.85, up=None, tone=tone * (0.92 + 0.08 * k), tip_taper=0.99, v_scale=2.5, step=0.011)
    if tie:
        # Band und kurze Quaste am Ende
        i = int(n * 0.9)
        ring = center[i]
        for a in np.linspace(0, 2 * math.pi, 8, endpoint=False):
            pass
        tail = np.array([center[i] + T[i] * 0.004 * j for j in range(12)])
        for k in range(6):
            a = k / 6 * 2 * math.pi
            d = (math.cos(a) * N[i] + math.sin(a) * B[i]) * 0.006
            tube(mesh, np.array([center[i] + d * 0.3, center[i] + T[i] * 0.03 + d, center[i] + T[i] * 0.06 + d * 1.6]), r * 0.35, r * 0.15, sides=4, tone=tone)


def hair_cover(mesh, count=90, lift=0.07, tone=1.0, back_to=2.05, ponytail=None):
    """Zurueckgekaemmtes, anliegendes Haar (Grundlage fuer Zoepfe, Knoten, Kurz)."""
    for th0, ph0 in scalp_roots(count):
        side = 1 if th0 >= 0 else -1
        th1 = th0 + side * 0.15 if abs(th0) < 2.6 else th0
        if ponytail is not None:
            th1, ph1 = ponytail
            th1 = th1 + ((th0 - th1 + math.pi) % (2 * math.pi) - math.pi) * 0.25
            ph1 = ph1 + rng.uniform(-0.05, 0.05)
            p = surface_path(ell(th0, ph0), ell(th1, ph1), lift * 0.5, lift * (0.9 + rng.uniform(0, 0.4)), n=14, bulge=lift * 0.3)
            tube(mesh, p, 0.017, 0.009, sides=5, flat=0.35, up=p[0] - C, tone=tone * rng.uniform(0.9, 1.08))
            continue
        else:
            ph1 = max(ph0 + 0.4, back_to - 0.25 * math.cos(th0))
            th1 = th0 + (math.copysign(math.pi, th0) - th0) * 0.55 if abs(th0) > 0.2 else th0 * 0.5 + math.copysign(1.0, th0 + 1e-6) * 0.6
        p = strand_on_head(th0, ph0, th1, ph1, lift * 0.55, lift * (0.9 + rng.uniform(0, 0.4)), n=12)
        tube(mesh, p, 0.017, 0.009, sides=5, flat=0.3, up=p[0] - C, tone=tone * rng.uniform(0.9, 1.08))


def cap(mesh, lift=0.008, crest=None, tone=1.0, extra=0.0):
    """Glatte Haardecke aus dem feinen Grundkoerper: Kopfhaut innerhalb des Haaransatzes, nach aussen versetzt."""
    th, ph = to_angles(FULL)
    inside = ph < hairline_phi(th) + extra
    inside &= FULL[:, 1] > 1.70
    if crest is not None:
        inside &= np.abs(np.sin(th) * np.sin(ph)) < crest
    quads = [q for q in FULL_F if all(inside[i] for i in q)]
    tri = []
    for q in quads:
        tri.append([q[0], q[1], q[2]])
        if len(q) == 4:
            tri.append([q[0], q[2], q[3]])
    tri = np.array(tri)
    vs = np.unique(tri)
    rm = -np.ones(len(FULL), dtype=np.int64)
    rm[vs] = np.arange(len(vs))
    F = rm[tri]
    base = FULL[vs]
    # Normalen des feinen Netzes
    fn = np.cross(base[F[:, 1]] - base[F[:, 0]], base[F[:, 2]] - base[F[:, 0]])
    nrm = np.zeros_like(base)
    for k in range(3):
        np.add.at(nrm, F[:, k], fn)
    nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
    t_, p_ = th[vs], ph[vs]
    hl = hairline_phi(t_)
    edge = np.clip((hl - p_) / 0.14, 0, 1)
    outer = base + nrm * (0.0012 + lift * (0.25 + 0.75 * edge))[:, None]
    UV = np.stack([(t_ + math.pi) / (2 * math.pi) * 7.0, p_ * 3.6], axis=1)
    n = len(outer)
    edges = {}
    for tr in F:
        for a, b in ((tr[0], tr[1]), (tr[1], tr[2]), (tr[2], tr[0])):
            k = (min(a, b), max(a, b))
            edges[k] = edges.get(k, (a, b)) if k not in edges else None
    bd = [v for v in edges.values() if v is not None]
    inner = base + nrm * 0.0006
    P = np.vstack([outer, inner])
    UV2 = np.vstack([UV, UV + [0, 0.05]])
    F2 = [F]
    for a, b in bd:
        F2.append(np.array([[b, a, a + n], [b, a + n, b + n]]))
    F2 = np.vstack(F2)
    col = np.concatenate([0.72 + 0.28 * edge, np.full(n, 0.5)]) * tone
    mesh.add(P, UV2, F2, col)


def style_zoepfe():
    m = Mesh()
    cap(m, 0.011)
    hair_cover(m, 30, lift=0.045, ponytail=(math.pi, 1.75))
    # Haarkranz am Hinterkopf: geflochtener Halbkranz von Ohr zu Ohr
    arc = np.array([ell(th, 1.6, 0.11) for th in np.linspace(2.0, 2 * math.pi - 2.0, 26)])
    braid(m, arc, r=0.011, twist=8, tie=False)
    # Rueckenzopf
    start = ell(math.pi, 1.75, 0.14)
    back = gravity_fall(start, np.array([0, -0.6, -0.4]), 0.36, pull_out=0.025)
    braid(m, np.vstack([ell(math.pi, 1.55, 0.12)[None], back]), r=0.015, twist=8)
    # zwei Zoepfe vor den Schultern
    for s in (1, -1):
        root = ell(s * 1.45, 1.42, 0.12)
        mid = ell(s * 1.6, 1.85, 0.2)
        path = gravity_fall(mid, np.array([s * 0.05, -1.0, 0.45]), 0.42, pull_out=0.03)
        braid(m, np.vstack([root[None], mid[None], path]), r=0.016, twist=8)
        # lose Straehne an der Schlaefe
        p = strand_on_head(s * 0.75, 0.95, s * 1.15, 1.45, 0.06, 0.1, n=10)
        p = np.vstack([p, gravity_fall(p[-1], np.array([s * 0.1, -1, 0.2]), 0.12, 0.02)])
        tube(m, p, 0.008, 0.004, sides=5, flat=0.7, up=p[0] - C)
    return m


def style_kurz():
    m = Mesh()
    cap(m, 0.014)
    for th0, ph0 in scalp_roots(70):
        L = rng.uniform(0.25, 0.4)
        th1 = th0 * 1.05
        ph1 = ph0 + L
        p = strand_on_head(th0, ph0, th1, ph1, 0.035, 0.05 + rng.uniform(0, 0.03), n=6)
        tube(m, p, 0.011, 0.006, sides=4, flat=0.45, up=p[0] - C, tone=rng.uniform(0.9, 1.1))
    return m


def style_lang():
    m = Mesh()
    cap(m, 0.012)
    for th0, ph0 in scalp_roots(70):
        side = 1 if th0 >= 0 else -1
        # Mittelscheitel: nach aussen und hinten kaemmen
        th1 = th0 + side * 0.35 if abs(th0) < 2.4 else th0
        ph1 = 1.45 + 0.25 * min(1, abs(th0) / 2)
        p = strand_on_head(th0, ph0, th1, ph1, 0.05, 0.11 + rng.uniform(0, 0.03), n=10)
        front = abs(th1) < 1.0
        dirv = np.array([math.sin(th1) * 0.4, -1.0, (0.35 if front else -0.25)])
        fall = gravity_fall(p[-1], dirv, rng.uniform(0.3, 0.42) * (0.75 if front else 1.0), pull_out=0.025, sway=th0 * 3)
        tube(m, np.vstack([p, fall[1:]]), 0.014, 0.006, sides=5, flat=0.42, up=p[0] - C, tone=rng.uniform(0.9, 1.08))
    return m


def style_kamm():
    m = Mesh()
    cap(m, 0.01, crest=0.3)
    roots = scalp_roots(70, phi_max_extra=0.0)
    for th0, ph0 in roots:
        if abs(math.sin(th0) * math.sin(ph0)) > 0.28:
            continue
        p0 = ell(th0, ph0, 0.03)
        nrm = (p0 - C) / np.linalg.norm(p0 - C)
        tipv = nrm * 0.07 + np.array([0, 0.0, -0.05])
        p = np.array([p0, p0 + tipv * 0.4, p0 + tipv])
        tube(m, p, 0.013, 0.004, sides=4, flat=0.5, up=np.array([1.0, 0, 0]), tone=rng.uniform(0.9, 1.1))
    start = ell(math.pi, 1.7, 0.08)
    braid(m, np.vstack([ell(math.pi, 1.3, 0.06)[None], gravity_fall(start, np.array([0, -0.7, -0.3]), 0.3, 0.025)]), r=0.011, twist=9)
    return m


def style_knoten():
    m = Mesh()
    knot = (math.pi, 0.75)
    cap(m, 0.012)
    hair_cover(m, 40, lift=0.06, ponytail=knot)
    ctr = ell(knot[0], knot[1], 0.32)
    # Knoten aus gewundenen Straehnen
    for k in range(10):
        a = np.linspace(0, 2 * math.pi * 1.3, 26) + k * 0.63
        rr = 0.028 + 0.004 * math.sin(k)
        pts = ctr + np.stack([np.cos(a) * rr, np.sin(a * 0.5) * 0.012 + (k - 5) * 0.003, np.sin(a) * rr], axis=1)
        tube(m, pts, 0.01, 0.009, sides=5, flat=0.6, up=np.array([0, 1.0, 0]), tip_taper=0.95)
    return m


# ---------- Baerte ----------
FACE = POS[hv]


def jaw_roots(count, front_only=False, chin_only=False, mustache=False):
    """Wurzeln auf Kinn, Wangen und Oberlippe (Kopfecken unterhalb der Nase)."""
    cand = FACE[(FACE[:, 2] > 0.06)]
    out = []
    for p in cand:
        y, z, x = p[1], p[2], p[0]
        if mustache:
            ok = 1.785 < y < 1.81 and z > 0.17 and abs(x) < 0.03
        elif chin_only:
            ok = 1.715 < y < 1.775 and z > 0.15 and abs(x) < 0.03
        else:
            ok = 1.71 < y < 1.83 and z > 0.09 and abs(x) > 0.0 and not (y > 1.79 and z > 0.175) and not (y > 1.8 and abs(x) < 0.07 and z > 0.12)
        if ok:
            out.append(p)
    out = np.array(out)
    if len(out) > count:
        out = out[rng.choice(len(out), count, replace=False)]
    return out


def beard(mesh, roots, length, droop=1.0, r0=0.009, tone=0.95):
    for p0 in roots:
        loc, nrm, k, dist = BODY.tree.find_nearest(tuple(p0))
        n = np.array(nrm)
        d = n * 0.5 + np.array([0, -1.0 * droop, 0.15])
        d /= np.linalg.norm(d)
        pts = np.array([p0 - n * 0.002 + d * length * s + n * 0.012 * math.sin(s * math.pi) for s in np.linspace(0, 1, 6)])
        pts = collide(pts, 0.006)
        tube(mesh, pts, r0, r0 * 0.4, sides=4, flat=0.5, up=n, tone=tone * rng.uniform(0.9, 1.08))


def beard_kinn():
    m = Mesh()
    beard(m, jaw_roots(40, chin_only=True), 0.07, 1.2)
    return m


def beard_voll():
    m = Mesh()
    beard(m, jaw_roots(150), 0.06, 0.9)
    beard(m, jaw_roots(40, chin_only=True), 0.1, 1.3)
    beard(m, jaw_roots(20, mustache=True), 0.035, 0.5, r0=0.007)
    return m


def beard_geflochten():
    m = beard_voll()
    for s in (-0.018, 0.018):
        c = np.array([[s, 1.735, 0.165], [s * 1.2, 1.68, 0.16], [s * 1.3, 1.6, 0.15], [s * 1.3, 1.54, 0.15]])
        braid(m, collide(c, 0.012), r=0.009, twist=8)
    return m


def beard_schnauzer():
    m = Mesh()
    for s in (1, -1):
        for k in range(7):
            x0 = s * (0.004 + k * 0.004)
            p0 = np.array([x0, 1.797 - 0.0005 * k, 0.186 - 0.002 * k])
            pts = np.array([p0, p0 + [s * 0.012, -0.006, -0.004], p0 + [s * 0.028, -0.02, -0.014], p0 + [s * 0.034, -0.04, -0.02]])
            tube(m, pts, 0.0065, 0.003, sides=4, flat=0.5, up=np.array([0, 0, 1.0]))
    return m


STYLES = {"hair.0": style_kurz, "hair.1": style_zoepfe, "hair.2": style_lang, "hair.3": style_kamm, "hair.5": style_knoten,
          "beard.1": beard_kinn, "beard.2": beard_voll, "beard.3": beard_geflochten, "beard.4": beard_schnauzer}
out = {}
for key, fn in STYLES.items():
    msh = fn()
    P, UV, F, col = msh.arrays()
    ti, bc, off = BODY.bind(P)
    out[key + ".pos"] = P.astype(np.float32)
    out[key + ".uv"] = UV.astype(np.float32)
    out[key + ".idx"] = F.astype(np.int32)
    out[key + ".col"] = col.astype(np.float32)
    out[key + ".tri"] = ti.astype(np.int32)
    out[key + ".bc"] = bc.astype(np.float32)
    out[key + ".off"] = off.astype(np.float32)
    print(key, len(P), "Ecken", len(F), "Dreiecke")
np.savez_compressed(OUT, keys=np.array(list(STYLES.keys())), **out)
