"""Baut den spielfertigen Heldenkoerper: reduziertes Netz, vereinfachtes Skelett (30 Knochen),
Hautgewichte, Koerperbereiche und je Volk und Geschlecht Formabweichung, Gelenke und Augen.
Aufruf: MH_DATA=... python build_humans.py <ausgabe.npz> [vorschauordner]"""
import os
import sys
import json
import math
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mhlib  # noqa: E402
import blib  # noqa: E402
import races  # noqa: E402

OUT = sys.argv[1]
NB = 13380
RATIO = float(os.environ.get("HR_RATIO", "0.46"))

# Vereinfachtes Skelett: (Name, Eltern, Kopfgelenk aus MakeHuman, MakeHuman-Knochen, die zusammengefasst werden)
SIDE = ("L", "R")
BONES = [
    ("hips", None, "root", ["root", "spine05", "pelvis.%s", "special03", "special04"]),
    ("spine", "hips", "spine04", ["spine04", "spine03"]),
    ("chest", "spine", "spine02", ["spine02", "spine01", "breast.%s"]),
    ("neck", "chest", "neck01", ["neck01", "neck02", "neck03"]),
    ("head", "neck", "head", ["head", "jaw", "special01", "special05.%s", "special06.%s", "eye.%s", "tongue*", "oculi*", "orbicularis*", "oris*", "levator*", "risorius*", "temporalis*"]),
]
for s in SIDE:
    BONES += [
        ("clavicle." + s, "chest", "clavicle." + s, ["clavicle." + s, "shoulder01." + s]),
        ("upperarm." + s, "clavicle." + s, "upperarm01." + s, ["upperarm01." + s, "upperarm02." + s]),
        ("forearm." + s, "upperarm." + s, "lowerarm01." + s, ["lowerarm01." + s, "lowerarm02." + s]),
        ("hand." + s, "forearm." + s, "wrist." + s, ["wrist." + s, "metacarpal1." + s, "metacarpal2." + s, "metacarpal3." + s, "metacarpal4." + s]),
        ("thumb1." + s, "hand." + s, "finger1-1." + s, ["finger1-1." + s, "finger1-2." + s]),
        ("thumb2." + s, "thumb1." + s, "finger1-3." + s, ["finger1-3." + s]),
        ("fing1." + s, "hand." + s, ["finger2-1." + s, "finger3-1." + s, "finger4-1." + s, "finger5-1." + s], ["finger%d-1." % k + s for k in range(2, 6)]),
        ("fing2." + s, "fing1." + s, ["finger2-2." + s, "finger3-2." + s, "finger4-2." + s, "finger5-2." + s], ["finger%d-%d." % (k, j) + s for k in range(2, 6) for j in (2, 3)]),
        ("thigh." + s, "hips", "upperleg01." + s, ["upperleg01." + s, "upperleg02." + s]),
        ("shin." + s, "thigh." + s, "lowerleg01." + s, ["lowerleg01." + s, "lowerleg02." + s]),
        ("foot." + s, "shin." + s, "foot." + s, ["foot." + s]),
        ("toe." + s, "foot." + s, ["toe1-1." + s, "toe2-1." + s, "toe3-1." + s], ["toe%d-%d." % (k, j) + s for k in range(1, 6) for j in (1, 2, 3)]),
    ]
BONE_NAMES = [b[0] for b in BONES]
BI = {n: i for i, n in enumerate(BONE_NAMES)}
# Koerperbereiche fuer das Ausblenden unter Kleidung
REGION_OF = {"hips": 1, "spine": 2, "chest": 3, "neck": 4, "head": 5, "clavicle": 3, "upperarm": 6, "forearm": 7, "hand": 8, "thumb1": 8, "thumb2": 8,
             "fing1": 8, "fing2": 8, "thigh": 9, "shin": 10, "foot": 11, "toe": 11}

v0, vt, faces = mhlib.load_obj(os.path.join(mhlib.data_dir(), "3dobjs", "base.obj"))
body = [f for f in faces if f[2] == "body"]
skel = mhlib.load_skeleton()
W = mhlib.load_weights()


def mh_bone_map():
    import fnmatch
    names = list(skel["bones"].keys())
    out = {}
    for gi, (gname, _p, _h, members) in enumerate(BONES):
        side = gname.split(".")[1] if "." in gname else None
        for m in members:
            pat = m.replace("%s", side) if side else m
            if "%s" in m and not side:
                for s in SIDE:
                    for n in fnmatch.filter(names, m.replace("%s", s)):
                        out[n] = gi
            else:
                for n in fnmatch.filter(names, pat):
                    out[n] = gi
    missing = [n for n in names if n not in out]
    return out, missing


BMAP, missing = mh_bone_map()
if missing:
    print("Knochen ohne Zuordnung (werden dem Kopf zugeschlagen):", missing)
    for n in missing:
        BMAP[n] = BI["head"]

# Gewichte auf das vereinfachte Skelett (volle Aufloesung)
WF = np.zeros((len(v0), len(BONES)), dtype=np.float32)
for b, lst in W.items():
    gi = BMAP.get(b, BI["head"])
    for i, w in lst:
        WF[i, gi] += w
s = WF.sum(axis=1, keepdims=True)
s[s == 0] = 1
WF /= s


def head_pos(verts, spec):
    J = mhlib.joint_positions(verts, skel)
    if isinstance(spec, list):
        return np.mean([J[skel["bones"][b]["head"]] for b in spec], axis=0)
    return J[skel["bones"][spec]["head"]]


def eye_centers(verts):
    out = []
    for g in ("helper-l-eye", "helper-r-eye"):
        idx = sorted(set(i for f in faces if f[2] == g for i in f[0]))
        P = verts[idx]
        c = P.mean(axis=0)
        r = float(np.linalg.norm(P - c, axis=1).mean())
        out.append((c, r))
    return out


def profile_verts(rid, sex):
    R = races.RACES[rid]
    P = R[sex]
    ears = mhlib.EAR_TYPES[R["ears"]][0]
    tg = mhlib.macro_weights(**P["macro"]) + mhlib.side_targets(dict(P["detail"], **ears))
    vv = mhlib.apply_targets(v0, tg)
    vv = mhlib.stretch_ears(vv, R["ears"])
    ground = vv[:NB, 1].min()
    vv[:, 1] -= ground
    sc = P["H"] / vv[:NB, 1].max()
    return vv * sc, sc


# Grundkoerper (neutral) in Spielmassstab: Mensch 2,0 hoch, Fuesse auf y=0
base = v0.copy()
base[:, 1] -= base[:NB, 1].min()
BASE_SC = 2.0 / base[:NB, 1].max()
base *= BASE_SC

# --- Reduktion in Blender ---
blib.reset()
bpos = np.stack([base[:, 0], -base[:, 2], base[:, 1]], axis=1)
ob = blib.mesh_object("body", bpos[:NB], [f[0] for f in body], vt, [f[1] for f in body], smooth=True)
keep = np.zeros(NB)
for b, lst in W.items():
    fac = 0.0
    gi = BMAP.get(b)
    if gi == BI["head"]:
        fac = 1.0
    elif BONE_NAMES[gi].split(".")[0] in ("hand", "thumb1", "thumb2", "fing1", "fing2"):
        fac = 0.75
    if fac:
        for i, w in lst:
            if i < NB:
                keep[i] = max(keep[i], w * fac)
# Zwei Durchgaenge: zuerst nur Kopf, Haende und Fuesse (sehr fein modelliert), dann der uebrige Koerper.
ext = ob.vertex_groups.new(name="ext")
rest = ob.vertex_groups.new(name="rest")
for i in range(NB):
    e = 1.0 if keep[i] > 0.15 else 0.0
    ext.add([i], e, "REPLACE")
    rest.add([i], 1.0 - e, "REPLACE")
n_ext = sum(1 for f in body if all(keep[i] > 0.15 for i in f[0]))
n_all = len(body)
EXT_KEEP = float(os.environ.get("HR_EXT", "0.42"))
REST_KEEP = float(os.environ.get("HR_REST", "0.62"))
m = ob.modifiers.new("dec1", "DECIMATE")
m.decimate_type = "COLLAPSE"
m.ratio = (n_all - n_ext * (1 - EXT_KEEP)) / n_all
m.use_symmetry = True
m.symmetry_axis = "X"
m.vertex_group = "ext"
m.vertex_group_factor = 1000.0
m2 = ob.modifiers.new("dec2", "DECIMATE")
m2.decimate_type = "COLLAPSE"
m2.ratio = (n_ext * EXT_KEEP + (n_all - n_ext) * REST_KEEP) / (n_all - n_ext * (1 - EXT_KEEP))
m2.use_symmetry = True
m2.symmetry_axis = "X"
m2.vertex_group = "rest"
m2.vertex_group_factor = 1000.0
dg = bpy.context.evaluated_depsgraph_get()
ev = ob.evaluated_get(dg)
me = ev.to_mesh()
me.calc_loop_triangles()
co = np.array([v.co[:] for v in me.vertices])
uvl = me.uv_layers.active.data
tris = []
for lt in me.loop_triangles:
    tris.append([(me.loops[li].vertex_index, tuple(round(c, 6) for c in uvl[li].uv)) for li in lt.loops])
ev.to_mesh_clear()

# GPU-Ecken: (Ecke, UV) eindeutig
key = {}
gv_src, gv_uv, idx = [], [], []
for t in tris:
    for vi, uv in t:
        k = (vi, uv)
        if k not in key:
            key[k] = len(gv_src)
            gv_src.append(vi)
            gv_uv.append(uv)
        idx.append(key[k])
gv_src = np.array(gv_src)
gv_uv = np.array(gv_uv, dtype=np.float32)
idx = np.array(idx, dtype=np.int32).reshape(-1, 3)
low_b = co[gv_src]  # Blender-Achsen
low = np.stack([low_b[:, 0], low_b[:, 2], -low_b[:, 1]], axis=1)  # zurueck: y oben, z vorne
print("Spielkoerper:", len(low), "Ecken,", len(idx), "Dreiecke")

# --- Zuordnung: jede reduzierte Ecke auf die Oberflaeche des vollen Grundkoerpers ---
ftri = []
for f in body:
    q = f[0]
    ftri.append([q[0], q[1], q[2]])
    if len(q) == 4:
        ftri.append([q[0], q[2], q[3]])
ftri = np.array(ftri)
bvh = BVHTree.FromPolygons([tuple(p) for p in base[:NB]], [tuple(t) for t in ftri])
map_tri = np.zeros(len(low), dtype=np.int64)
map_bc = np.zeros((len(low), 3))
for i, p in enumerate(low):
    loc, nrm, ti, dist = bvh.find_nearest(tuple(p))
    a, b, c = base[ftri[ti]]
    v0_, v1_, v2_ = b - a, c - a, np.array(loc) - a
    d00, d01, d11 = v0_ @ v0_, v0_ @ v1_, v1_ @ v1_
    d20, d21 = v2_ @ v0_, v2_ @ v1_
    den = d00 * d11 - d01 * d01
    vv_ = (d11 * d20 - d01 * d21) / den
    ww_ = (d00 * d21 - d01 * d20) / den
    bc = np.clip([1 - vv_ - ww_, vv_, ww_], 0, 1)
    map_tri[i] = ti
    map_bc[i] = bc / bc.sum()


def to_low(full):
    T = ftri[map_tri]
    return (full[T[:, 0]] * map_bc[:, 0:1] + full[T[:, 1]] * map_bc[:, 1:2] + full[T[:, 2]] * map_bc[:, 2:3])


low = to_low(base)
WL = to_low(WF)
# auf vier Einfluesse begrenzen
order = np.argsort(-WL, axis=1)[:, :4]
wl4 = np.take_along_axis(WL, order, axis=1)
wl4 /= wl4.sum(axis=1, keepdims=True)
skin_i = order.astype(np.uint8)
skin_w = np.round(wl4 * 255).astype(np.int32)
skin_w[:, 0] += 255 - skin_w.sum(axis=1)
skin_w = skin_w.astype(np.uint8)
# Bereich je Dreieck
dom = order[:, 0]
reg = np.zeros(len(idx), dtype=np.uint8)
for t, (a, b, c) in enumerate(idx):
    names = [BONE_NAMES[dom[a]], BONE_NAMES[dom[b]], BONE_NAMES[dom[c]]]
    rs = [REGION_OF[n.split(".")[0]] for n in names]
    reg[t] = max(set(rs), key=rs.count)
    # Seite fuer Arme und Beine (Bit 4 = rechts)
    if reg[t] in (6, 7, 8, 9, 10, 11) and names[0].endswith(".R"):
        reg[t] |= 16

def mhj(verts, name):
    return mhlib.joint_positions(verts, skel)[name]


def surface_hit(verts, origin, direction):
    """Erster Treffer eines Strahls von aussen auf den Koerper (volle Aufloesung)."""
    t = BVHTree.FromPolygons([tuple(p) for p in verts[:NB]], [tuple(x) for x in ftri])
    loc, nrm, ti, dist = t.ray_cast(tuple(origin), tuple(direction))
    return np.array(loc) if loc is not None else np.array(origin)


def sockets(vv, J):
    """Haltepunkte je Profil (Weltlage in Ruhehaltung): Griff rechts/links, Schild, Brust, Guertel, Ruecken, Kopf."""
    out = {}
    for s_, sx in (("R", -1.0), ("L", 1.0)):
        hand = J[BI["hand." + s_]]
        f1 = J[BI["fing1." + s_]]
        idx_k = mhj(vv, skel["bones"]["finger2-1." + s_]["head"])
        pin_k = mhj(vv, skel["bones"]["finger5-1." + s_]["head"])
        tip = mhj(vv, skel["bones"]["finger3-3." + s_]["tail"])
        axis = idx_k - pin_k
        axis /= np.linalg.norm(axis)
        along = tip - hand
        along /= np.linalg.norm(along)
        palm = np.cross(along, axis) * (1 if s_ == "L" else -1)
        grip = f1 * 0.55 + hand * 0.45 + palm * 0.0
        out["grip" + s_] = dict(p=grip.tolist(), axis=axis.tolist(), along=along.tolist(), size=float(np.linalg.norm(tip - hand)))
        fa = J[BI["forearm." + s_]]
        out["arm" + s_] = dict(p=((fa + hand) / 2).tolist(), along=((hand - fa) / np.linalg.norm(hand - fa)).tolist())
    head = J[BI["head"]]
    top = vv[:NB][np.argmax(vv[:NB, 1])]
    out["head"] = dict(p=head.tolist(), top=top.tolist(), width=float(np.ptp(vv[:NB][vv[:NB, 1] > head[1] + 0.02][:, 0])))
    ch = J[BI["chest"]]
    nk = J[BI["neck"]]
    y_amu = ch[1] * 0.35 + nk[1] * 0.65 - 0.04
    out["chest"] = dict(p=surface_hit(vv, (0, y_amu, 2.0), (0, 0, -1)).tolist())
    out["back"] = dict(p=surface_hit(vv, (0, ch[1] + (nk[1] - ch[1]) * 0.3, -2.0), (0, 0, 1)).tolist())
    hp = J[BI["hips"]]
    yb = hp[1] + 0.06 * (vv[:NB, 1].max() / 2.0)
    out["belt"] = dict(p=surface_hit(vv, (0, yb, 2.0), (0, 0, -1)).tolist(),
                       left=surface_hit(vv, (2.0, yb, 0.02), (-1, 0, 0)).tolist(), right=surface_hit(vv, (-2.0, yb, 0.02), (1, 0, 0)).tolist())
    out["ringR"] = dict(p=mhj(vv, skel["bones"]["finger4-1." + "R"]["tail"]).tolist())
    out["ringL"] = dict(p=mhj(vv, skel["bones"]["finger4-1." + "L"]["tail"]).tolist())
    return out


profiles = {}
for rid in races.ORDER:
    for sex in ("m", "f"):
        vv, sc = profile_verts(rid, sex)
        lp = to_low(vv)
        J = np.array([head_pos(vv, b[2]) for b in BONES])
        J[0] = head_pos(vv, "root")
        eyes = eye_centers(vv)
        top = float(vv[:NB, 1].max())
        profiles[rid + "." + sex] = dict(delta=(lp - low).astype(np.float32), joints=J.astype(np.float32),
                                         eyes=np.array([[*eyes[0][0], eyes[0][1]], [*eyes[1][0], eyes[1][1]]], dtype=np.float32), top=top,
                                         sockets=sockets(vv, J))
        print(rid, sex, "Hoehe", round(top, 3), "max Abweichung", round(float(np.abs(lp - low).max()), 3))

J0 = np.array([head_pos(base, b[2]) for b in BONES])
np.savez_compressed(OUT, pos=low.astype(np.float32), uv=gv_uv, idx=idx, skin_i=skin_i, skin_w=skin_w, region=reg, joints=J0.astype(np.float32),
                    bones=json.dumps([[b[0], b[1]] for b in BONES]), profiles=json.dumps({k: {"top": p["top"], "sockets": p["sockets"]} for k, p in profiles.items()}),
                    **{"d_" + k: p["delta"] for k, p in profiles.items()}, **{"j_" + k: p["joints"] for k, p in profiles.items()},
                    **{"e_" + k: p["eyes"] for k, p in profiles.items()})
print("gespeichert", OUT)
