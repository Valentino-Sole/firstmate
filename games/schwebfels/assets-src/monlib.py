"""Bestien (Version 5): gemeinsame Werkzeuge fuer alle Familien.

Ablauf je Familie: Skelett (Knochen mit Rolle) -> Koerper aus einem Hautgeruest (Blender Skin-Modifier,
Unterteilung, Oberflaechenrelief) -> Einzelteile (Zaehne, Krallen, Hoerner, Platten, Pflanzen, Augen)
-> Gewichte (Abstand zu den Knochen) -> Farbbereiche (R Grundfarbe, G Akzent, B Leuchten, A Verdeckung)
-> Ausgabe als npz fuer make_pack (Spiel: src/r3d-beasts.js).
Koordinaten im Spiel: y oben, z vorne (Blickrichtung), Einheit wie Helden (Mensch 2,0 hoch).
"""
import math
import numpy as np
import bpy
import bmesh
from mathutils import Vector

MATS = ["skin", "horn", "claw", "plant", "eye", "metal", "cloth", "glow", "bone", "stone", "fur", "crystal", "wood", "membrane", "shell", "slime"]
MI = {m: i for i, m in enumerate(MATS)}


def bl(p):
    p = np.asarray(p, dtype=float)
    return np.stack([p[..., 0], -p[..., 2], p[..., 1]], axis=-1)


def gm(p):
    p = np.asarray(p, dtype=float)
    return np.stack([p[..., 0], p[..., 2], -p[..., 1]], axis=-1)


class Rig:
    def __init__(self):
        self.bones = []  # (name, parent, head(game), tail(game), role)

    def add(self, name, parent, head, tail, role=""):
        self.bones.append((name, parent, np.array(head, float), np.array(tail, float), role))
        return name

    def index(self, name):
        return [b[0] for b in self.bones].index(name)

    def chain(self, prefix, parent, pts, role):
        names = []
        for i in range(len(pts) - 1):
            n = "%s%d" % (prefix, i + 1)
            self.add(n, parent, pts[i], pts[i + 1], role)
            parent = n
            names.append(n)
        return names


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 16
    return sc


def skin_body(nodes, edges, radii, subdiv=2, name="body"):
    """Koerper aus einem Hautgeruest: nodes (game-Koordinaten), edges (Paare), radii (x,y je Knoten)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(tuple(bl(n))) for n in nodes]
    for a, b in edges:
        bm.edges.new((vs[a], vs[b]))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new("skin", "SKIN")
    sk.use_smooth_shade = True
    for i, sv in enumerate(me.skin_vertices[0].data):
        r = radii[i]
        sv.radius = (r[0], r[1]) if hasattr(r, "__len__") else (r, r)
    me.skin_vertices[0].data[0].use_root = True
    sub = ob.modifiers.new("sub", "SUBSURF")
    sub.levels = subdiv
    sub.render_levels = subdiv
    return ob


def apply_all(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def displace(ob, kind="VORONOI", scale=0.08, strength=0.02, seed=0, mid=0.5):
    tex = bpy.data.textures.new("t%d" % seed, kind)
    if kind == "VORONOI":
        tex.noise_scale = scale
        tex.distance_metric = "DISTANCE"
    elif kind in ("CLOUDS", "MUSGRAVE", "STUCCI", "MARBLE", "WOOD"):
        tex.noise_scale = scale
    m = ob.modifiers.new("disp%d" % seed, "DISPLACE")
    m.texture = tex
    m.strength = strength
    m.mid_level = mid
    m.texture_coords = "GLOBAL"
    return m


def mesh_arrays(ob):
    """Dreiecke, Lage (game), Normalen (game) eines Objekts nach allen Modifikatoren."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    P = np.array([v.co[:] for v in me.vertices])
    N = np.array([v.normal[:] for v in me.vertices])
    F = np.array([lt.vertices[:] for lt in me.loop_triangles])
    ev.to_mesh_clear()
    return gm(P), gm(N), F


def decimate_ob(ob, ratio):
    m = ob.modifiers.new("dec", "DECIMATE")
    m.decimate_type = "COLLAPSE"
    m.ratio = ratio
    m.use_collapse_triangulate = True
    return m


class Model:
    """Sammelt Netzteile (Lage, Normale, Material, Bereichsmaske, fester Knochen oder Abstandsgewichte)."""

    def __init__(self, rig):
        self.rig = rig
        self.P, self.N, self.F, self.M, self.C, self.B = [], [], [], [], [], []
        self.n = 0
        self.groups = {}

    def add(self, P, N, F, mat, color=(1, 0, 0), bone=None, group=None):
        P = np.asarray(P, float)
        N = np.asarray(N, float)
        F = np.asarray(F, int).reshape(-1, 3)
        C = np.asarray(color, float)
        if C.ndim == 1:
            C = np.tile(C, (len(P), 1))
        self.P.append(P)
        self.N.append(N)
        self.F.append(F + self.n)
        self.M.append(np.full(len(F), MI[mat]))
        self.C.append(C)
        self.B.append(np.full(len(P), -1 if bone is None else self.rig.index(bone)))
        if group:
            # Merkmalsgruppe (fuer Varianten ein-/ausblendbar): Flaechenbereich merken
            self.groups.setdefault(group, []).append((sum(len(f) for f in self.F[:-1]), len(F)))
        self.n += len(P)

    def add_ob(self, ob, mat, color=(1, 0, 0), bone=None, group=None, color_fn=None):
        P, N, F = mesh_arrays(ob)
        C = color_fn(P, N) if color_fn else color
        self.add(P, N, F, mat, C, bone, group)
        bpy.data.objects.remove(ob)


def seg_dist(P, a, b):
    ab = b - a
    t = np.clip(((P - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
    q = a + t[:, None] * ab
    return np.linalg.norm(P - q, axis=1)


def weights(P, rig, fixed, sharp=10.0, limit=4, falloff=None):
    """Abstandsgewichte zu den Knochenabschnitten; feste Teile haengen voll an ihrem Knochen."""
    nb = len(rig.bones)
    D = np.stack([seg_dist(P, b[2], b[3]) for b in rig.bones], axis=1)
    if falloff is not None:
        D = D / falloff[None, :]
    dmin = D.min(axis=1, keepdims=True)
    W = np.exp(-((D - dmin) * sharp) ** 2 * 6) * (D <= dmin + 0.6 / sharp)
    W /= W.sum(axis=1, keepdims=True)
    for i, b in enumerate(fixed):
        if b >= 0:
            W[i] = 0
            W[i, b] = 1
    order = np.argsort(-W, axis=1)[:, :limit]
    w4 = np.take_along_axis(W, order, axis=1)
    w4 /= w4.sum(axis=1, keepdims=True)
    return order.astype(np.uint8), np.round(w4 * 255).astype(np.uint8)


def ao_vertex(P, N, F, samples=24, dist=0.35):
    """Umgebungsverdeckung je Ecke (Strahlen ueber die Halbkugel) mit Blender-BVH."""
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons([tuple(p) for p in P], [tuple(int(i) for i in f) for f in F])
    rng = np.random.default_rng(1)
    dirs = rng.normal(size=(samples, 3))
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    ao = np.zeros(len(P))
    for i, (p, n) in enumerate(zip(P, N)):
        nn = n / (np.linalg.norm(n) + 1e-9)
        hit = 0
        for d in dirs:
            if d @ nn < 0:
                d = -d
            loc, _, _, _ = tree.ray_cast(tuple(p + nn * 0.004), tuple(d), dist)
            if loc is not None:
                hit += 1
        ao[i] = 1 - hit / samples
    return ao


# ---------- einfache Teile (game-Koordinaten) ----------
def cone_part(base, tip, r, seg=6, bend=None):
    """Spitzer Kegel (Zahn, Kralle, Dorn) von base nach tip; bend verschiebt die Spitze seitlich."""
    base = np.asarray(base, float)
    tip = np.asarray(tip, float)
    ax = tip - base
    L = np.linalg.norm(ax)
    ax /= L
    up = np.array([0, 1.0, 0]) if abs(ax[1]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ax, up)
    u /= np.linalg.norm(u)
    v = np.cross(ax, u)
    rings = 4
    P = []
    for k in range(rings):
        t = k / (rings - 1)
        rr = r * (1 - t) ** 0.8
        c = base + ax * L * t
        if bend is not None:
            c = c + np.asarray(bend) * t * t
        for j in range(seg):
            a = j / seg * 2 * math.pi
            P.append(c + (u * math.cos(a) + v * math.sin(a)) * max(rr, r * 0.04))
    tipp = base + ax * L + (np.asarray(bend) if bend is not None else 0)
    P.append(tipp)
    P.append(base - ax * r * 0.2)
    P = np.array(P)
    F = []
    for k in range(rings - 1):
        for j in range(seg):
            a = k * seg + j
            b = k * seg + (j + 1) % seg
            F += [[a, b, b + seg], [a, b + seg, a + seg]]
    ti = len(P) - 2
    bi = len(P) - 1
    for j in range(seg):
        F.append([(rings - 1) * seg + j, (rings - 1) * seg + (j + 1) % seg, ti])
        F.append([(j + 1) % seg, j, bi])
    F = np.array(F)
    N = vnormals(P, F)
    return P, N, F


def vnormals(P, F):
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    vn = np.zeros_like(P)
    for k in range(3):
        np.add.at(vn, F[:, k], fn)
    return vn / (np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12)


def tube_part(pts, r0, r1, sides=5):
    pts = np.asarray(pts, float)
    n = len(pts)
    T = np.gradient(pts, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    up = np.array([0, 0, 1.0])
    P = []
    for i in range(n):
        t = i / (n - 1)
        u = np.cross(T[i], up)
        if np.linalg.norm(u) < 1e-6:
            u = np.cross(T[i], [1, 0, 0])
        u /= np.linalg.norm(u)
        v = np.cross(T[i], u)
        r = r0 + (r1 - r0) * t
        for j in range(sides):
            a = j / sides * 2 * math.pi
            P.append(pts[i] + (u * math.cos(a) + v * math.sin(a)) * r)
    P = np.array(P)
    F = []
    for i in range(n - 1):
        for j in range(sides):
            a = i * sides + j
            b = i * sides + (j + 1) % sides
            F += [[a, b, b + sides], [a, b + sides, a + sides]]
    F = np.array(F)
    return P, vnormals(P, F), F


def blade_part(base, tip, width, normal):
    """Flaches Blatt (Schilf, Federn): beidseitig."""
    base = np.asarray(base, float)
    tip = np.asarray(tip, float)
    ax = tip - base
    n = np.asarray(normal, float)
    s = np.cross(ax, n)
    s = s / (np.linalg.norm(s) + 1e-9) * width
    P = np.array([base - s, base + s, base + ax * 0.5 + s * 0.8, base + ax * 0.5 - s * 0.8, tip])
    F = np.array([[0, 1, 2], [0, 2, 3], [3, 2, 4]])
    F = np.vstack([F, F[:, ::-1]])
    return P, np.tile(n / (np.linalg.norm(n) + 1e-9), (len(P), 1)), F


def sphere_part(c, r, seg=10, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(4, seg // 2 + 1), radius=1.0)
    P = np.array([v.co[:] for v in bm.verts])
    F = []
    for f in bm.faces:
        vv = [v.index for v in f.verts]
        for k in range(1, len(vv) - 1):
            F.append([vv[0], vv[k], vv[k + 1]])
    bm.free()
    P = P * np.asarray(scale) * r + np.asarray(c)
    F = np.array(F)
    return P, vnormals(P, F), F


def export(path, model, rig, meta):
    P = np.concatenate(model.P)
    N = np.concatenate(model.N)
    F = np.concatenate(model.F)
    M = np.concatenate(model.M)
    C = np.concatenate(model.C)
    Bf = np.concatenate(model.B)
    order = np.argsort(M, kind="stable")
    F2 = F[order]
    M2 = M[order]
    groups = []
    for m in np.unique(M2):
        idx = np.nonzero(M2 == m)[0]
        groups.append([int(m), int(idx[0]) * 3, int(len(idx)) * 3])
    si, sw = weights(P, rig, Bf, sharp=meta.get("sharp", 9.0), falloff=meta.get("falloff"))
    ao = ao_vertex(P, N, F, samples=meta.get("ao_samples", 20), dist=meta.get("ao_dist", 0.35))
    col = np.clip(np.concatenate([C, ao[:, None]], axis=1), 0, 1)
    bones = [[b[0], (rig.index(b[1]) if b[1] else -1), b[2].tolist(), b[3].tolist(), b[4]] for b in rig.bones]
    meta = dict(meta)
    meta.pop("falloff", None)
    meta.update({"groups": groups, "mats": [MATS[g[0]] for g in groups], "bones": bones})
    # Merkmalsgruppen: Flaechenindex im sortierten Puffer
    inv = np.empty_like(order)
    inv[order] = np.arange(len(order))
    feats = {}
    for g, ranges in model.groups.items():
        tris = np.sort(inv[np.concatenate([np.arange(s, s + c) for s, c in ranges])])
        # als Bereiche [start, anzahl] im sortierten Dreieckspuffer
        rs = []
        st = tris[0]
        prev = tris[0]
        for x in tris[1:]:
            if x != prev + 1:
                rs.append([int(st), int(prev - st + 1)])
                st = x
            prev = x
        rs.append([int(st), int(prev - st + 1)])
        feats[g] = rs
    meta["features"] = feats
    meta["matNames"] = MATS
    # Kachel-UV (Wuerfelprojektion)
    a = np.abs(N)
    U = np.where(((a[:, 0] >= a[:, 1]) & (a[:, 0] >= a[:, 2]))[:, None], P[:, [2, 1]], np.where((a[:, 1] >= a[:, 2])[:, None], P[:, [0, 2]], P[:, [0, 1]])) * 3.0
    import json
    np.savez_compressed(path, pos=P.astype(np.float32), nrm=N.astype(np.float32), uv=U.astype(np.float32), idx=F2.astype(np.int32), col=(col * 255).astype(np.uint8),
                        skinI=si, skinW=sw, meta=json.dumps(meta))
    print(path, len(P), "Ecken", len(F2), "Dreiecke", "Knochen", len(rig.bones))
