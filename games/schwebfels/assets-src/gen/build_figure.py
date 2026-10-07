"""Erzeugte Figur (GLB, mit oder ohne Skelett) ins Spielformat bringen: ein Koerper fuer gen.pack.

Aufruf: python build_figure.py <figur.glb> <assets/schwebfels.pack> <profil> <ausgabe.npz> <bericht.json> [--tris 16000] [--heat]
  <profil>: Koerperprofil des Spiels fuer die Zielhoehe, z. B. nordmann.f, trollblut.m, glutzwerg.f
  --heat:   Hautgewichte immer mit Blender (Bone Heat) statt aus dem mitgelieferten Skelett

Ablauf: Import, Netze vereinen, Aufraeumen, Reduzieren, Ausrichten auf die Profilhoehe, Gelenke der 29 Spielknochen
aus dem mitgelieferten Skelett (Namen wie Mixamo oder Meshy; fehlende Finger aus der Hand geschaetzt),
Hautgewichte (aus dem Skelett uebertragen oder Bone Heat), Haltepunkte, Textur, Export.
"""
import os
import re
import sys
import json
import time
import struct
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import packbones  # noqa: E402

args = sys.argv[1:]
HEAT = "--heat" in args
if HEAT:
    args.remove("--heat")
TRIS = 16000
if "--tris" in args:
    i = args.index("--tris")
    TRIS = int(args[i + 1])
    del args[i:i + 2]
SRC, PACK, PROF, OUT_NPZ, OUT_LOG = args[:5]
LOG = {"quelle": os.path.basename(SRC), "profil": PROF, "schritte": [], "nacharbeit": []}
T0 = time.time()


def step(name, **kw):
    kw["sekunden"] = round(time.time() - T0, 1)
    LOG["schritte"].append(dict(name=name, **kw))
    print("SCHRITT", name, kw, flush=True)


def activate(*objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[-1]


def tris_of(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def profile_top(pack, key):
    with open(pack, "rb") as f:
        f.read(4)
        n = struct.unpack("<I", f.read(4))[0]
        h = json.loads(f.read(n).decode("utf-8"))
    return float(h["humans"]["profiles"][key]["top"])


BONES = packbones.bones(PACK)
NAMES = [b[0] for b in BONES]
PAR = {b[0]: b[1] for b in BONES}
KIDS = {n: [c for c in NAMES if PAR[c] == n] for n in NAMES}
HT = profile_top(PACK, PROF)

# ---------- 1. Import, Netze vereinen ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
objs = list(bpy.context.scene.objects)
src_arm = next((o for o in objs if o.type == "ARMATURE"), None)
# Knochenformen des Importers (Icosphere) und versteckte Hilfsnetze gehoeren nicht zur Figur
shapes = {pb.custom_shape for pb in src_arm.pose.bones if pb.custom_shape} if src_arm else set()
meshes = [o for o in objs if o.type == "MESH" and len(o.data.polygons) > 50 and o not in shapes and not o.hide_render]
if src_arm and any(o.vertex_groups for o in meshes):
    meshes = [o for o in meshes if o.vertex_groups]
step("import", netze=len(meshes), dreiecke=sum(tris_of(o) for o in meshes), skelett=bool(src_arm),
     knochen=len(src_arm.data.bones) if src_arm else 0)

# Ruhehaltung des Skeletts: Gelenke und Netze in Bindelage
src_j, src_par = {}, {}
if src_arm:
    for b in src_arm.data.bones:
        src_j[b.name] = np.array(src_arm.matrix_world @ b.head_local)
        src_par[b.name] = b.parent.name if b.parent else None
    LOG["quellknochen"] = list(src_j)
for o in meshes:
    for mod in list(o.modifiers):
        o.modifiers.remove(mod)
    mw = o.matrix_world.copy()
    o.parent = None
    o.data.transform(mw)
    o.matrix_world.identity()
body = max(meshes, key=tris_of)
if len(meshes) > 1:
    activate(*meshes)
    bpy.context.view_layer.objects.active = body
    with bpy.context.temp_override(active_object=body, object=body, selected_objects=meshes, selected_editable_objects=meshes):
        bpy.ops.object.join()
for o in list(bpy.context.scene.objects):
    if o is not body:
        bpy.data.objects.remove(o, do_unlink=True)

# Textur (Grundfarbe) suchen
img = None
for m in body.data.materials:
    if m and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and (img is None or n.image.size[0] > img.size[0]):
                if "normal" not in n.image.name.lower() and "rough" not in n.image.name.lower() and "metal" not in n.image.name.lower():
                    img = n.image

# Quellgewichte je Ecke merken (Gruppenname -> Gewicht)
src_groups = {g.index: g.name for g in body.vertex_groups}

# ---------- 2. Aufraeumen und Reduzieren ----------
bm = bmesh.new()
bm.from_mesh(body.data)
nb = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bm.to_mesh(body.data)
bm.free()
before = tris_of(body)
if before > TRIS:
    activate(body)
    dec = body.modifiers.new("reduz", "DECIMATE")
    dec.ratio = TRIS / before
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="reduz")
step("aufraeumen_reduzieren", doppelte_ecken=nb - len(body.data.vertices), vorher=before, nachher=tris_of(body))

# ---------- 3. Ausrichten (Blender: Z oben, Blick nach -Y) auf die Profilhoehe ----------
co = np.array([v.co[:] for v in body.data.vertices])
zmin, zmax = co[:, 2].min(), co[:, 2].max()
s = HT / (zmax - zmin)
cx, cy = (co[:, 0].max() + co[:, 0].min()) / 2, (co[:, 1].max() + co[:, 1].min()) / 2
M = Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, -zmin))
body.data.transform(M)
for k in src_j:
    src_j[k] = np.array(M @ Vector(src_j[k]))
co = np.array([v.co[:] for v in body.data.vertices])
step("ausrichten", hoehe=round(HT, 3), massstab=round(float(s), 4))

# ---------- 4. Gelenke ----------
CAND = {
    "hips": ["hips", "pelvis", "hip", "root"],
    "spine": ["spine", "spine01", "spine0"],
    "chest": ["spine2", "spine02", "chest", "upperchest", "spine1", "spine01"],
    "neck": ["neck", "neck01", "neck1"],
    "head": ["head"],
}
SIDE = {
    "clavicle": ["{s}shoulder", "{s}clavicle", "shoulder{t}", "clavicle{t}"],
    "upperarm": ["{s}arm", "{s}upperarm", "upperarm{t}", "arm{t}"],
    "forearm": ["{s}forearm", "{s}lowerarm", "forearm{t}", "lowerarm{t}"],
    "hand": ["{s}hand", "hand{t}"],
    "thumb1": ["{s}handthumb1", "{s}thumb1", "thumb1{t}"],
    "thumb2": ["{s}handthumb2", "{s}thumb2", "thumb2{t}"],
    "fing1": ["{s}handmiddle1", "{s}middle1", "{s}handindex1", "{s}index1"],
    "fing2": ["{s}handmiddle2", "{s}middle2", "{s}handindex2", "{s}index2"],
    "thigh": ["{s}upleg", "{s}thigh", "{s}upperleg", "thigh{t}", "upleg{t}"],
    "shin": ["{s}leg", "{s}calf", "{s}lowerleg", "{s}shin", "calf{t}", "shin{t}"],
    "foot": ["{s}foot", "foot{t}"],
    "toe": ["{s}toebase", "{s}toe", "{s}ball", "toe{t}"],
}
for part, pats in SIDE.items():
    for sd, word, short in (("L", "left", "l"), ("R", "right", "r")):
        CAND[part + "." + sd] = [p.format(s=word, t=short) for p in pats]


def norm(n):
    n = n.split(":")[-1].split("|")[-1].lower()
    return re.sub(r"[^a-z0-9]", "", n)


snorm = {}
for k in src_j:
    snorm.setdefault(norm(k), k)
MAP = {}
for tgt in NAMES:
    for c in CAND.get(tgt, []):
        if c in snorm and snorm[c] not in MAP.values():
            MAP[tgt] = snorm[c]
            break
J = {t: src_j[sname] for t, sname in MAP.items()}
missing = [n for n in NAMES if n not in J]
# fehlende Finger aus Handrichtung und Netz schaetzen
for sd in ("L", "R"):
    if "hand." + sd not in J or "forearm." + sd not in J:
        continue
    hand = J["hand." + sd]
    d = hand - J["forearm." + sd]
    d /= np.linalg.norm(d)
    cand = co[((co - hand) @ d) > 0]
    cand = cand[np.linalg.norm(cand - hand, axis=1) < 0.12 * HT]
    tip = cand[np.argmax((cand - hand) @ d)] if len(cand) else hand + d * 0.09 * HT
    L = max(0.04 * HT, float((tip - hand) @ d))
    J.setdefault("fing1." + sd, hand + d * L * 0.45)
    J.setdefault("fing2." + sd, J["fing1." + sd] + d * L * 0.27)
    J.setdefault("thumb1." + sd, hand + d * L * 0.15 + np.array([0, -0.01 * HT, 0]))
    J.setdefault("thumb2." + sd, J["thumb1." + sd] + d * L * 0.25 + np.array([0, -0.008 * HT, 0]))
for sd in ("L", "R"):
    if "toe." + sd not in J and "foot." + sd in J:
        J["toe." + sd] = J["foot." + sd] + np.array([0, -0.06 * HT, -J["foot." + sd][2] * 0.6])
still = [n for n in NAMES if n not in J]
if still:
    raise SystemExit("Gelenke fehlen und koennen nicht geschaetzt werden: %s (Quellknochen: %s)" % (still, list(src_j)[:40]))
LOG["zuordnung"] = MAP
if [m for m in missing if not m.startswith(("fing", "thumb", "toe"))]:
    LOG["nacharbeit"].append("Gelenke geschaetzt: " + ", ".join(missing))
step("gelenke", zugeordnet=len(MAP), geschaetzt=missing)

# ---------- 5. Hautgewichte ----------
nv = len(body.data.vertices)
W = np.zeros((nv, len(NAMES)))
use_src = bool(src_arm) and not HEAT and len(body.vertex_groups) > 0
if use_src:
    # jede Quellgruppe dem naechsten zugeordneten Vorfahren zuschlagen
    inv = {v: NAMES.index(k) for k, v in MAP.items()}

    def target_of(name):
        while name is not None:
            if name in inv:
                return inv[name]
            name = src_par.get(name)
        return NAMES.index("hips")
    gi = {g.index: target_of(g.name) for g in body.vertex_groups}
    for v in body.data.vertices:
        for g in v.groups:
            if g.group in gi:
                W[v.index, gi[g.group]] += g.weight
    unw = int((W.sum(axis=1) < 1e-4).sum())
    if unw > nv * 0.02:
        use_src = False
        LOG["nacharbeit"].append("Quellgewichte unvollstaendig (%d Ecken), Bone Heat genutzt" % unw)
if not use_src:
    for g in list(body.vertex_groups):
        body.vertex_groups.remove(g)
    arm_d = bpy.data.armatures.new("spiel")
    arm = bpy.data.objects.new("spiel", arm_d)
    bpy.context.scene.collection.objects.link(arm)
    activate(arm)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for n in NAMES:
        b = arm_d.edit_bones.new(n)
        b.head = Vector(J[n])
        if KIDS[n]:
            tail = J["neck"] if n == "chest" else J["spine"] if n == "hips" else np.mean([J[c] for c in KIDS[n]], axis=0)
        else:
            par = J[PAR[n]]
            tail = J[n] + (J[n] - par) * 0.5
        if np.linalg.norm(tail - J[n]) < 1e-3:
            tail = J[n] + np.array([0, 0, 0.05])
        b.tail = Vector(tail)
        eb[n] = b
    for n in NAMES:
        if PAR[n]:
            eb[n].parent = eb[PAR[n]]
    bpy.ops.object.mode_set(mode="OBJECT")
    activate(body, arm)
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    W[:] = 0
    gi = {g.index: NAMES.index(g.name) for g in body.vertex_groups if g.name in NAMES}
    for v in body.data.vertices:
        for g in v.groups:
            if g.group in gi:
                W[v.index, gi[g.group]] = g.weight
unw = np.nonzero(W.sum(axis=1) < 1e-4)[0]
if len(unw):
    # naechster Knochenabschnitt fuer Ecken ohne Gewicht
    segs = []
    for n in NAMES:
        a = J[n]
        b = np.mean([J[c] for c in KIDS[n]], axis=0) if KIDS[n] else a
        segs.append((NAMES.index(n), a, b))
    P = co[unw] if len(co) == nv else np.array([body.data.vertices[i].co[:] for i in unw])
    best = np.zeros(len(unw), int)
    bd = np.full(len(unw), 1e9)
    for bi, a, b in segs:
        ab = b - a
        t = np.clip(((P - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
        d = np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
        m = d < bd
        bd[m] = d[m]
        best[m] = bi
    W[unw, best] = 1.0
    LOG["nacharbeit"].append("%d Ecken ohne Gewicht dem naechsten Knochen zugeordnet" % len(unw))
step("gewichte", quelle="Skelett der Vorlage" if use_src else "Bone Heat", ohne_gewicht=int(len(unw)))


# ---------- 6. Export ----------
def arrays(o, Wv):
    me = o.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data if me.uv_layers.active else None
    key, P, UV, I, src = {}, [], [], [], []
    for t in me.loop_triangles:
        tri = []
        for li, vi in zip(t.loops, t.vertices):
            uv = tuple(np.round(uvl[li].uv[:], 5)) if uvl else (0.0, 0.0)
            k = (vi, uv)
            if k not in key:
                key[k] = len(P)
                P.append(me.vertices[vi].co[:])
                UV.append(uv)
                src.append(vi)
            tri.append(key[k])
        I.append(tri)
    P = np.array(P)
    P = np.stack([P[:, 0], P[:, 2], -P[:, 1]], axis=1)
    Wv = Wv[np.array(src)]
    order = np.argsort(-Wv, axis=1)[:, :4]
    w4 = np.take_along_axis(Wv, order, axis=1)
    w4 = w4 / np.maximum(1e-9, w4.sum(axis=1, keepdims=True))
    return P.astype(np.float32), np.array(UV, np.float32), np.array(I, np.int32), order.astype(np.uint8), np.round(w4 * 255).astype(np.uint8)


def sockets(P, Jg):
    jj = {n: Jg[i] for i, n in enumerate(NAMES)}
    out = {}
    for sd, sx in (("L", 1.0), ("R", -1.0)):
        hand, f1, f2 = jj["hand." + sd], jj["fing1." + sd], jj["fing2." + sd]
        along = (f2 - hand) / np.linalg.norm(f2 - hand)
        # Griffachse (kleiner Finger zum Zeigefinger) zeigt zur Daumenseite; unabhaengig von A- oder T-Haltung
        th = jj["thumb1." + sd] - hand
        axis = th - along * (th @ along)
        if np.linalg.norm(axis) < 1e-4:
            axis = np.array([0.0, 0.0, 1.0]) - along * along[2]
        axis /= np.linalg.norm(axis)
        # Handgelenk leicht nach vorn abgeknickt wie bei den Spielkoerpern: Griff kippt nach oben, Finger nach vorn
        c, si = np.cos(0.6), np.sin(0.6)
        along, axis = along * c + axis * si, axis * c - along * si
        out["grip" + sd] = dict(p=(f1 * 0.55 + hand * 0.45).tolist(), axis=axis.tolist(), along=along.tolist(), size=float(np.linalg.norm(f2 - hand) * 1.4))
        fa = jj["forearm." + sd]
        out["arm" + sd] = dict(p=((fa + hand) / 2).tolist(), along=((hand - fa) / np.linalg.norm(hand - fa)).tolist())
        out["ring" + sd] = dict(p=(hand + (f1 - hand) * 1.15).tolist())
    head = jj["head"]
    above = P[P[:, 1] > head[1] + 0.02]
    out["head"] = dict(p=head.tolist(), top=P[np.argmax(P[:, 1])].tolist(), width=float(np.ptp(above[:, 0])) if len(above) else 0.2)

    def front(y, sign=1.0):
        q = P[(np.abs(P[:, 1] - y) < 0.02) & (np.abs(P[:, 0]) < 0.05)]
        if not len(q):
            return [0.0, float(y), 0.0]
        return [0.0, float(y), float(q[:, 2].max() if sign > 0 else q[:, 2].min())]
    ch, nk, hp = jj["chest"], jj["neck"], jj["hips"]
    out["chest"] = dict(p=front(ch[1] * 0.35 + nk[1] * 0.65 - 0.04))
    out["back"] = dict(p=front(ch[1] + (nk[1] - ch[1]) * 0.3, -1))
    yb = hp[1] + 0.06 * (P[:, 1].max() / 2.0)
    q = P[np.abs(P[:, 1] - yb) < 0.02]
    out["belt"] = dict(p=front(yb), left=[float(q[:, 0].max()), float(yb), 0.02], right=[float(q[:, 0].min()), float(yb), 0.02])
    return out


bp, buv, bidx, bsi, bsw = arrays(body, W)
Jg = np.array([[J[n][0], J[n][2], -J[n][1]] for n in NAMES], np.float32)
tex = np.full((4, 4, 3), 180, np.uint8)
if img is not None and img.size[0] > 0:
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
    tex = (np.clip(px[::-1, :, :3], 0, 1) * 255).astype(np.uint8)
else:
    LOG["nacharbeit"].append("keine Textur gefunden")
np.savez_compressed(OUT_NPZ, body_pos=bp, body_uv=buv, body_idx=bidx, body_si=bsi, body_sw=bsw, joints=Jg,
                    top=np.float32(bp[:, 1].max()), tex=tex, sockets=json.dumps(sockets(bp, Jg)), pieces=json.dumps([]))
step("export", dreiecke=len(bidx), ecken=len(bp), textur=list(tex.shape[:2]))
json.dump(LOG, open(OUT_LOG, "w"), ensure_ascii=False, indent=1)
