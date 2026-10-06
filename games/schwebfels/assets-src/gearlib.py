"""Werkzeuge fuer Kleidung und Ausruestung: Schalen aus dem Koerper, Roecke, Umhaenge, Borten, feste Teile.

Teilearten (mode):
  bound  - Schale am Koerper, jede Ecke an ein Koerperdreieck gebunden (passt auf jedes Volk)
  scaled - frei haengende Teile (Roecke, Umhaenge) mit eigenen Gewichten, je Volk an einem Gelenk skaliert
  rigid  - feste Teile an einem Knochen (Waffen, Schmuck, Helme, Platten), je Volk skaliert
Materialklassen (Index in MATS) bestimmen im Spiel Farbe, Kachelbild und Glanz.
"""
import math
import numpy as np
import bpy  # noqa: F401
from mathutils.bvhtree import BVHTree
import humanbase as HB

MATS = ["cloth", "cloth2", "trim", "leather", "leather2", "metal", "silver", "gold", "fur", "gem", "wood", "bone", "stone", "cloth3", "chain", "scale", "glow", "skin", "felt", "glass"]
MI = {m: i for i, m in enumerate(MATS)}
FULL_TREE = BVHTree.FromPolygons([tuple(p) for p in HB.base[:HB.NB]], [tuple(int(i) for i in t) for t in HB.FULL_TRI])


def _smooth_body():
    """Geglaetteter Koerper (ohne kleine Erhebungen) als Abstandshalter fuer Stoff."""
    P = HB.base[:HB.NB].copy()
    tri = HB.FULL_TRI
    n = len(P)
    nb = [[] for _ in range(n)]
    for a, b, c in tri:
        nb[a] += [b, c]
        nb[b] += [a, c]
        nb[c] += [a, b]
    nb = [np.unique(x) for x in nb]
    for _ in range(12):
        for f in (0.5, -0.53):
            avg = np.array([P[x].mean(axis=0) for x in nb])
            P = P + (avg - P) * f
    return P


SMOOTH_BODY = _smooth_body()
SMOOTH_VN = HB.vertex_normals(SMOOTH_BODY, HB.FULL_TRI)
SMOOTH_TREE = BVHTree.FromPolygons([tuple(p) for p in SMOOTH_BODY], [tuple(int(i) for i in t) for t in HB.FULL_TRI])
TRIM_ROWS = 5


class Piece:
    def __init__(self, key, mode="bound", layer=2, anchor=None, bone=None):
        self.key = key
        self.mode = mode
        self.layer = layer
        self.anchor = anchor  # scaled/rigid: Bezugsgruppe (hips, chest, head, handR, ...)
        self.bone = bone
        self.P, self.UV, self.F, self.M, self.W = [], [], [], [], []
        self.n = 0
        self.meta = {}

    def add(self, P, UV, F, mat, W=None):
        """Ein Eckblock mit Flaechen; mat ist ein Materialname oder je Flaeche ein Index."""
        P = np.asarray(P, dtype=np.float64).reshape(-1, 3)
        UV = np.asarray(UV, dtype=np.float64).reshape(-1, 2)
        F = np.asarray(F, dtype=np.int64).reshape(-1, 3)
        if len(F) == 0:
            return
        self.P.append(P)
        self.UV.append(UV)
        self.F.append(F + self.n)
        if isinstance(mat, str):
            self.M.append(np.full(len(F), MI[mat]))
        else:
            self.M.append(np.asarray(mat).reshape(-1))
        if W is not None:
            self.W.append(np.asarray(W))
        elif self.mode in ("scaled", "radial"):
            raise ValueError("frei haengende Teile brauchen Gewichte")
        self.n += len(P)

    def arrays(self):
        P = np.concatenate(self.P)
        UV = np.concatenate(self.UV)
        F = np.concatenate(self.F)
        M = np.concatenate(self.M)
        order = np.argsort(M, kind="stable")
        F, M = F[order], M[order]
        W = np.concatenate(self.W) if self.W else None
        return P, UV, F, M, W


# ---------- Grundfunktionen ----------
def taubin(P, tri, fixed, it=8, lam=0.5, mu=-0.53):
    """Glaetten ohne Schrumpfen; 'fixed' Ecken bleiben (Raender)."""
    n = len(P)
    nb = [[] for _ in range(n)]
    for a, b, c in tri:
        nb[a] += [b, c]
        nb[b] += [a, c]
        nb[c] += [a, b]
    nb = [np.unique(x) for x in nb]
    P = P.copy()
    for _ in range(it):
        for f in (lam, mu):
            avg = np.array([P[x].mean(axis=0) if len(x) else P[i] for i, x in enumerate(nb)])
            d = (avg - P) * f
            d[fixed] = 0
            P = P + d
    return P


def fill_concave(P, F, fixed, it=20, rate=1.0):
    """Stoff spannt ueber Vertiefungen: Ecken wandern nur nach aussen zum Mittel ihrer Nachbarn."""
    n = len(P)
    nb = [[] for _ in range(n)]
    for a, b, c in F:
        nb[a] += [b, c]
        nb[b] += [a, c]
        nb[c] += [a, b]
    nb = [np.unique(x) for x in nb]
    P = P.copy()
    for _ in range(it):
        N = HB.vertex_normals(P, F)
        avg = np.array([P[x].mean(axis=0) if len(x) else P[i] for i, x in enumerate(nb)])
        d = ((avg - P) * N).sum(axis=1)
        d = np.where(d > 0, d * rate, 0)
        d[fixed] = 0
        P = P + N * d[:, None]
    return P


def convex_feet(P, margin=0.006, y_max=0.105):
    """Fussteil von Stiefeln: je Scheibe entlang der Fusslaenge auf die aeussere Huelle des Fusses legen
    (keine Zehen mehr, glatte Kappe). Wirkt nur unterhalb y_max, weicher Uebergang zum Schaft."""
    from scipy.spatial import ConvexHull
    base = HB.base[: HB.NB]
    fw = HB.bone_w("foot", "toe")[: HB.NB] + HB.bone_w("shin")[: HB.NB] * (base[:, 1] < y_max)
    out = P.copy()
    for side in (1, -1):
        footv = base[(fw > 0.3) & (np.sign(base[:, 0]) == side) & (base[:, 1] < y_max + 0.01)]
        if len(footv) < 10:
            continue
        cx = footv[:, 0].mean()
        zs = np.linspace(footv[:, 2].min() - 0.005, footv[:, 2].max() + 0.005, 26)
        sel = (np.sign(P[:, 0]) == side) & (P[:, 1] < y_max) & (np.abs(P[:, 0] - cx) < 0.12)
        hulls = []
        for z in zs:
            q = footv[np.abs(footv[:, 2] - z) < 0.012][:, :2]
            if len(q) < 4:
                hulls.append(None)
                continue
            try:
                h = ConvexHull(q)
                hulls.append(q[h.vertices])
            except Exception:
                hulls.append(None)
        for i in np.nonzero(sel)[0]:
            x, y, z = P[i]
            k = int(np.clip(np.searchsorted(zs, z), 0, len(zs) - 1))
            hv = hulls[k]
            if hv is None:
                continue
            c = hv.mean(axis=0)
            d = np.array([x, y]) - c
            ang = math.atan2(d[1], d[0])
            # Abstand der Huelle in dieser Richtung
            best = 0.0
            for a_, b_ in zip(hv, np.roll(hv, -1, axis=0)):
                e = b_ - a_
                M = np.array([[math.cos(ang), -e[0]], [math.sin(ang), -e[1]]])
                if abs(np.linalg.det(M)) < 1e-12:
                    continue
                t, u = np.linalg.solve(M, a_ - c)
                if t > 0 and -1e-6 <= u <= 1 + 1e-6:
                    best = max(best, t)
            if best <= 0:
                continue
            blend = np.clip((y_max - y) / 0.03, 0, 1)
            target = c + np.array([math.cos(ang), math.sin(ang)]) * (best + margin)
            out[i, 0] = x + (target[0] - x) * blend
            out[i, 1] = y + (max(target[1], -0.003) - y) * blend
    return out


def convex_leg(P, y0, y1, margin=0.006, sel=None):
    """Schaft: je waagrechte Scheibe die Ecken auf die konvexe Huelle des Beins legen (gerade Stiefelform)."""
    from scipy.spatial import ConvexHull
    base = HB.base[: HB.NB]
    lw = HB.bone_w("shin", "foot", "thigh")[: HB.NB]
    out = P.copy()
    for side in (1, -1):
        legv = base[(lw > 0.4) & (np.sign(base[:, 0]) == side)]
        ys = np.linspace(y0, y1, 18)
        hulls = []
        for y in ys:
            q = legv[np.abs(legv[:, 1] - y) < 0.032][:, [0, 2]]
            try:
                h = ConvexHull(q)
                hulls.append(q[h.vertices])
            except Exception:
                hulls.append(None)
        for i in range(len(P)):
            x, y, z = P[i]
            if np.sign(x) != side or y < y0 - 0.02 or y > y1 + 0.02:
                continue
            k = int(np.clip(np.searchsorted(ys, y), 0, len(ys) - 1))
            hv = hulls[k]
            if hv is None:
                continue
            c = hv.mean(axis=0)
            d = np.array([x, z]) - c
            ang = math.atan2(d[1], d[0])
            best = 0.0
            for a_, b_ in zip(hv, np.roll(hv, -1, axis=0)):
                e = b_ - a_
                M = np.array([[math.cos(ang), -e[0]], [math.sin(ang), -e[1]]])
                if abs(np.linalg.det(M)) < 1e-12:
                    continue
                t, u = np.linalg.solve(M, a_ - c)
                if t > 0 and -1e-6 <= u <= 1 + 1e-6:
                    best = max(best, t)
            if best <= 0:
                continue
            bl = np.clip((y - y0) / 0.03, 0, 1) * np.clip((y1 + 0.02 - y) / 0.02, 0, 1)
            tx, tz = c + np.array([math.cos(ang), math.sin(ang)]) * (best + margin)
            out[i, 0] = x + (tx - x) * bl
            out[i, 2] = z + (tz - z) * bl
    return out


def leg_loft(piece, side, y0, y1, margin=0.012, flare=0.012, nang=28, nrows=12, mat="leather2", mat_in="leather2", thick=0.006, top_row=None, top_w=0.02):
    """Stiefelschaft als Roehre um ein Bein: je Hoehe die konvexe Huelle des Beins plus Abstand."""
    from scipy.spatial import ConvexHull
    base = HB.base[: HB.NB]
    lw = HB.bone_w("shin", "foot", "thigh")[: HB.NB]
    legv = base[(lw > 0.4) & (np.sign(base[:, 0]) == side)]
    ys = np.linspace(y0, y1, nrows)
    ang = np.linspace(-math.pi, math.pi, nang, endpoint=False)
    rings = []
    for k, y in enumerate(ys):
        q = legv[np.abs(legv[:, 1] - y) < 0.032][:, [0, 2]]
        h = ConvexHull(q)
        hv = q[h.vertices]
        c = hv.mean(axis=0)
        t = k / (nrows - 1)
        m = margin + flare * max(0.0, (t - 0.6) / 0.4) ** 1.5
        pts = []
        for a in ang:
            best = 0.0
            for a_, b_ in zip(hv, np.roll(hv, -1, axis=0)):
                e = b_ - a_
                M = np.array([[math.cos(a), -e[0]], [math.sin(a), -e[1]]])
                if abs(np.linalg.det(M)) < 1e-12:
                    continue
                tt, u = np.linalg.solve(M, a_ - c)
                if tt > 0 and -1e-6 <= u <= 1 + 1e-6:
                    best = max(best, tt)
            pts.append([c[0] + math.cos(a) * (best + m), y, c[1] + math.sin(a) * (best + m)])
        rings.append(pts)
    P = np.array(rings).reshape(-1, 3)
    F = grid_faces(nrows, nang, closed=True)
    N = HB.vertex_normals(P, F)
    cen = P.reshape(nrows, nang, 3).mean(axis=1, keepdims=True).repeat(nang, axis=1).reshape(-1, 3)
    if ((N * (P - cen)).sum()) < 0:
        F = F[:, ::-1]
        N = -N
    uv = cyl_uv(P, cen, 7)
    solidify(P, F, N, thick, uv, mat, mat_in, mat_in, piece)
    if top_row is not None:
        Pg = P.reshape(nrows, nang, 3)
        Ng = N.reshape(nrows, nang, 3)
        L = np.vstack([Pg[-1], Pg[-1][:1]])
        NN = np.vstack([Ng[-1], Ng[-1][:1]])
        n = len(L)
        a = L + NN * 0.0016
        b = L - np.array([0, top_w, 0]) + NN * 0.0016
        seg = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(L, axis=0), axis=1))])
        u = seg / top_w * (64 / 1024)
        v0 = 1 - (top_row + 1) / TRIM_ROWS + 0.004
        v1 = 1 - top_row / TRIM_ROWS - 0.004
        PP = np.vstack([a, b])
        UU = np.vstack([np.stack([u, np.full(n, v1)], 1), np.stack([u, np.full(n, v0)], 1)])
        FF = []
        for i in range(n - 1):
            FF += [[i, i + 1, i + 1 + n], [i, i + 1 + n, i + n]]
        FF = np.array(FF)
        piece.add(PP, UU, np.vstack([FF, FF[:, ::-1]]), "trim")
    return P


def sole(piece, side, thick=0.02, margin=0.008, mat="leather2"):
    """Sohle mit Absatzkante: Fussabdruck (konvexe Huelle unten) als dicke Platte."""
    from scipy.spatial import ConvexHull
    base = HB.base[: HB.NB]
    fw = HB.bone_w("foot", "toe")[: HB.NB]
    q = base[(fw > 0.3) & (np.sign(base[:, 0]) == side) & (base[:, 1] < 0.03)][:, [0, 2]]
    h = ConvexHull(q)
    ring_ = q[h.vertices]
    c = ring_.mean(axis=0)
    # gleichmaessig verteilen und nach aussen versetzen
    ang = np.arctan2(ring_[:, 1] - c[1], ring_[:, 0] - c[0])
    order = np.argsort(ang)
    ring_ = ring_[order]
    ring_ = c + (ring_ - c) * (1 + margin / np.maximum(1e-6, np.linalg.norm(ring_ - c, axis=1, keepdims=True)))
    n = len(ring_)
    bot = np.stack([ring_[:, 0], np.full(n, -0.004), ring_[:, 1]], 1)
    top = np.stack([ring_[:, 0], np.full(n, thick - 0.004), ring_[:, 1]], 1)
    cb = np.array([[c[0], -0.004, c[1]]])
    ct = np.array([[c[0], thick - 0.004, c[1]]])
    P = np.vstack([bot, top, cb, ct])
    F = []
    for i in range(n):
        j = (i + 1) % n
        F += [[i, j, n + j], [i, n + j, n + i], [2 * n, j, i], [2 * n + 1, n + i, n + j]]
    F = np.array(F)
    # Richtung pruefen: Seitenflaechen nach aussen
    N = HB.vertex_normals(P, F)
    if ((N[:n, [0, 2]] * (ring_ - c)).sum() < 0):
        F = F[:, ::-1]
    uv = box_uv(P, HB.vertex_normals(P, F), 8)
    piece.add(P, uv, F, mat)


def push_out(P, margin, smooth=True):
    """Schiebt Ecken mindestens 'margin' vor die Haut (geglaetteter Koerper, damit kleine Erhebungen nicht durchdruecken)."""
    out = P.copy()
    tree = SMOOTH_TREE if smooth else FULL_TREE
    vn = SMOOTH_VN if smooth else HB.FULL_VN
    for i, p in enumerate(P):
        loc, nrm, k, dist = tree.find_nearest(tuple(p), 0.4)
        if loc is None:
            continue
        q = np.array(loc)
        n = vn[HB.FULL_TRI[k]].mean(axis=0)
        n /= np.linalg.norm(n)
        d = (p - q) @ n
        if d < margin:
            out[i] = p + n * (margin - d)
    return out


def boundary_loops(tri):
    cnt = {}
    for a, b, c in tri:
        for e in ((a, b), (b, c), (c, a)):
            k = (min(e), max(e))
            cnt[k] = cnt.get(k, 0) + 1
    # gerichtete Randkanten (Reihenfolge wie im Dreieck)
    nxt = {}
    for a, b, c in tri:
        for u, v in ((a, b), (b, c), (c, a)):
            if cnt[(min(u, v), max(u, v))] == 1:
                nxt[u] = v
    loops = []
    seen = set()
    for s in list(nxt.keys()):
        if s in seen:
            continue
        loop = [s]
        seen.add(s)
        v = nxt[s]
        while v != s and v in nxt and v not in seen:
            loop.append(v)
            seen.add(v)
            v = nxt[v]
        if len(loop) > 2:
            loops.append(loop)
    return loops


def box_uv(P, N, scale):
    """Wuerfelprojektion fuer Kachelbilder (scale: Kacheln je Meter)."""
    a = np.abs(N)
    uv = np.where((a[:, 0] >= a[:, 1]) & (a[:, 0] >= a[:, 2]), 0, np.where(a[:, 1] >= a[:, 2], 1, 2))
    U = np.zeros((len(P), 2))
    U[uv == 0] = P[uv == 0][:, [2, 1]]
    U[uv == 1] = P[uv == 1][:, [0, 2]]
    U[uv == 2] = P[uv == 2][:, [0, 1]]
    return U * scale


def cyl_uv(P, axis_pt, scale):
    d = P - axis_pt
    th = np.arctan2(d[:, 0], d[:, 2])
    return np.stack([th / (2 * math.pi) * scale * 0.9, P[:, 1] * scale], axis=1)


def decimate(P, F, ratio):
    """Flaechen verringern (Blender, Kollaps), Raender bleiben weitgehend erhalten."""
    if ratio >= 0.999 or len(F) < 200:
        return P, F
    me = bpy.data.meshes.new("dec")
    me.from_pydata([tuple(x) for x in P], [], [tuple(int(i) for i in f) for f in F])
    ob = bpy.data.objects.new("dec", me)
    bpy.context.scene.collection.objects.link(ob)
    m = ob.modifiers.new("d", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = ratio
    m.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    em = ev.to_mesh()
    em.calc_loop_triangles()
    P2 = np.array([v.co[:] for v in em.vertices])
    F2 = np.array([lt.vertices[:] for lt in em.loop_triangles])
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    return P2, F2


def solidify(P, F, N, thick, uv, mat_out, mat_in=None, mat_edge=None, piece=None, W=None):
    """Aussenhaut, Innenhaut (umgedreht) und Randwaende; fuegt alles als ein Block in 'piece' ein."""
    n = len(P)
    inner = P - N * thick
    PP = np.vstack([P, inner])
    UU = np.vstack([uv, uv])
    FF = [F, F[:, ::-1] + n]
    MM = [np.full(len(F), MI[mat_out]), np.full(len(F), MI[mat_in or mat_out])]
    for loop in boundary_loops(F):
        L = len(loop)
        for i in range(L):
            a, b = loop[i], loop[(i + 1) % L]
            FF.append(np.array([[b, a, a + n], [b, a + n, b + n]]))
            MM.append(np.full(2, MI[mat_edge or mat_out]))
    FF = np.vstack(FF)
    MM = np.concatenate(MM)
    WW = None if W is None else np.vstack([W, W])
    if piece is not None:
        piece.add(PP, UU, FF, MM, WW)
    return PP, UU, FF, MM


def shell(piece, sel, offset, thick=0.004, smooth=8, mat="cloth", mat_in="cloth2", uvscale=7.0, inflate=None, min_gap=None, cut=None, trims=None, keep_detail=0.0, concave=0, sole=False, shaft=None, dec=0.35):
    """Schale aus dem feinen Koerper: Auswahl (bool je Ecke), geglaettet, versetzt, mit Dicke.
    inflate(P) -> zusaetzlicher Versatz je Ecke; cut(P) -> bool je Ecke (False = herausschneiden);
    trims: Liste (breite, reihe, material) fuer Borten an allen Raendern."""
    base = HB.base[:HB.NB]
    if cut is not None:
        sel = sel & cut(base)
    tri = HB.FULL_TRI[sel[HB.FULL_TRI].all(axis=1)]
    if len(tri) == 0:
        return None
    vs = np.unique(tri)
    rm = -np.ones(len(base), dtype=np.int64)
    rm[vs] = np.arange(len(vs))
    F = rm[tri]
    P0 = base[vs]
    N0 = HB.FULL_VN[vs]
    bd = set(v for loop in boundary_loops(F) for v in loop)
    fixed = np.zeros(len(vs), dtype=bool)
    fixed[list(bd)] = True
    P = taubin(P0, F, fixed, it=smooth)
    P = P0 * keep_detail + P * (1 - keep_detail)
    if concave:
        P = fill_concave(P, F, fixed, it=concave)
    N = HB.vertex_normals(P, F)
    off = np.full(len(P), offset)
    if inflate is not None:
        off = off + inflate(P0, vs)
    P = P + N * off[:, None]
    P = push_out(P, (min_gap if min_gap is not None else offset * 0.6) + thick)
    if sole:
        # Fussteil auf die Huelle legen (keine Zehen), dann flache Sohle
        P = convex_feet(P, margin=offset * 0.8)
        if shaft:
            P = convex_leg(P, shaft[0], shaft[1], margin=offset * 0.9)
        P = taubin(P, F, fixed, it=6)
        low_ = P[:, 1] < 0.012
        P[low_, 1] = np.where(P[low_, 1] < 0.004, -0.002, P[low_, 1] * 0.5)
    if dec < 0.999:
        P, F = decimate(P, F, dec)
    N = HB.vertex_normals(P, F)
    uv = box_uv(P, N, uvscale)
    solidify(P, F, N, thick, uv, mat, mat_in, mat_in, piece)
    if trims:
        for (w, row, tm) in trims:
            for loop in boundary_loops(F):
                trim_strip(piece, P, N, F, loop, w, row, tm)
    return P, F, N


def trim_strip(piece, P, N, F, loop, width, row, mat="trim", lift=0.0015, closed=True):
    """Borte entlang eines Randes, nach innen ueber die Flaeche gelegt; UV aus der Bortenreihe."""
    L = len(loop)
    pts = P[loop]
    nrm = N[loop]
    # Richtung nach innen: vom Rand zum Schwerpunkt der Nachbarflaechen
    cen = {}
    for f in F:
        for v in f:
            cen.setdefault(v, []).append(P[f].mean(axis=0))
    inward = np.array([np.mean(cen[v], axis=0) - P[v] for v in loop])
    tang = np.roll(pts, -1, axis=0) - np.roll(pts, 1, axis=0)
    side = np.cross(nrm, tang)
    side /= np.linalg.norm(side, axis=1, keepdims=True) + 1e-12
    sgn = np.sign((side * inward).sum(axis=1, keepdims=True))
    side = side * np.where(sgn == 0, 1, sgn)
    a = pts + nrm * lift
    b = pts + side * width + nrm * lift
    seg = np.linalg.norm(np.diff(np.vstack([pts, pts[:1]]), axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])[:L]
    u = s / width * (64 / 1024)
    v0 = 1 - (row + 1) / TRIM_ROWS + 0.004
    v1 = 1 - row / TRIM_ROWS - 0.004
    PP = np.vstack([a, b])
    UU = np.vstack([np.stack([u, np.full(L, v0)], 1), np.stack([u, np.full(L, v1)], 1)])
    FF = []
    rng_ = range(L) if closed else range(L - 1)
    for i in rng_:
        j = (i + 1) % L
        FF += [[i, j, j + L], [i, j + L, i + L]]
    piece.add(PP, UU, FF, mat)


def ring_profile(y, zc=0.0, nang=48, band=0.012, legs_only=False, shoulders=False):
    """Querschnitt des Koerpers auf Hoehe y: groesster Abstand je Winkel um die Achse (0, y, zc)."""
    base = HB.base[:HB.NB]
    sel = np.abs(base[:, 1] - y) < band
    # herabhaengende Arme und Haende nicht mitmessen
    sel &= HB.bone_w("upperarm", "forearm", "hand", "thumb1", "thumb2", "fing1", "fing2")[: HB.NB] < (0.6 if shoulders else 0.15)
    if legs_only:
        sel &= HB.bone_w("thigh", "shin", "hips") > 0.3
    Q = base[sel]
    ang = np.linspace(-math.pi, math.pi, nang, endpoint=False)
    r = np.zeros(nang)
    if len(Q) == 0:
        return ang, r
    th = np.arctan2(Q[:, 0], Q[:, 2] - zc)
    rr = np.hypot(Q[:, 0], Q[:, 2] - zc)
    bins = ((th + math.pi) / (2 * math.pi) * nang).astype(int) % nang
    for k in range(nang):
        m = bins == k
        if m.any():
            r[k] = rr[m].max()
    # Luecken schliessen und glaetten
    for _ in range(3):
        r = np.maximum(r, (np.roll(r, 1) + np.roll(r, -1)) / 2 * 0.98)
    r = (np.roll(r, 1) + 2 * r + np.roll(r, -1)) / 4
    return ang, r


def grid_faces(rows, cols, closed=False):
    F = []
    cc = cols if closed else cols - 1
    for i in range(rows - 1):
        for j in range(cc):
            a = i * cols + j
            b = i * cols + (j + 1) % cols
            F += [[a, b, b + cols], [a, b + cols, a + cols]]
    return np.array(F)
