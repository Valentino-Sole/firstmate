"""Probelauf der Modellstrecke ohne bezahlte Erzeugung: fremdes Modell (GLB) bis ins Spielformat.

Aufruf: python probe.py <modell.glb> <assets/schwebfels.pack> <ausgabe.npz> <ausgabe.glb> <bericht.json> [zielhoehe]
Probemodell: CesiumMan aus den Khronos glTF Sample Assets (CC BY 4.0), nur fuer den Technikcheck, nicht im Spiel.

Schritte (wie spaeter mit erzeugten Modellen):
 1. Import des GLB, Hauptnetz und Textur finden
 2. Aufraeumen (doppelte Ecken), Verdichten auf die Groesse eines KI-Modells, Reduzieren auf Spielgroesse
 3. Ausrichten: Fuesse auf den Boden, Blick nach vorne, Zielhoehe
 4. Gelenke der 29 Spielknochen aus dem mitgelieferten Skelett ableiten (spaeter: Skelett des Dienstes)
 5. Hautgewichte mit Blender (Bone Heat) auf das Spielskelett
 6. Kleidungsteil: unabhaengig geformtes Teil auf den Koerper anpassen (Ausrichten, nach aussen schrumpfen,
    Gewichte uebertragen) und die darunter liegende Haut ausblenden
 7. Export: Spielformat (npz) und GLB zur Kontrolle
"""
import sys
import json
import time
import numpy as np
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SRC, HUM, OUT_NPZ, OUT_GLB, OUT_LOG = sys.argv[1:6]
HT = float(sys.argv[6]) if len(sys.argv) > 6 else 2.12
LOG = {"schritte": []}
T0 = time.time()


def step(name, **kw):
    kw["sekunden"] = round(time.time() - T0, 1)
    LOG["schritte"].append(dict(name=name, **kw))
    print("SCHRITT", name, kw, flush=True)


def tris_of(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def activate(*objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[-1]


# ---------- 1. Import ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
objs = list(bpy.context.scene.objects)
meshes = [o for o in objs if o.type == "MESH" and len(o.data.polygons) > 200]
src_arm = next((o for o in objs if o.type == "ARMATURE"), None)
body = max(meshes, key=lambda o: len(o.data.polygons))
img = None
for m in body.data.materials:
    if m and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                img = n.image
step("import", netze=len(meshes), dreiecke=tris_of(body), skelett=bool(src_arm), textur=list(img.size) if img else None)

# Gelenke des mitgelieferten Skeletts in Weltlage merken (steht spaeter fuer das Skelett des Dienstes)
src_j = {}
if src_arm:
    for b in src_arm.data.bones:
        src_j[b.name] = np.array(src_arm.matrix_world @ b.head_local)

# vom Skelett loesen, Lage einbacken, Rest loeschen
for mod in list(body.modifiers):
    body.modifiers.remove(mod)
mw = body.matrix_world.copy()
body.parent = None
body.data.transform(mw)
body.matrix_world.identity()
for o in objs:
    if o is not body:
        bpy.data.objects.remove(o, do_unlink=True)
for vg in list(body.vertex_groups):
    body.vertex_groups.remove(vg)

# ---------- 2. Aufraeumen, Verdichten, Reduzieren ----------
bm = bmesh.new()
bm.from_mesh(body.data)
nb = len(bm.verts)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
removed = nb - len(bm.verts)
bm.to_mesh(body.data)
bm.free()
activate(body)
sub = body.modifiers.new("dicht", "SUBSURF")
sub.subdivision_type = "SIMPLE"
sub.levels = 2
sub.render_levels = 2
bpy.ops.object.modifier_apply(modifier="dicht")
dense = tris_of(body)
TARGET = 14000
dec = body.modifiers.new("reduz", "DECIMATE")
dec.ratio = min(1.0, TARGET / dense)
dec.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier="reduz")
step("aufraeumen_verdichten_reduzieren", doppelte_ecken=removed, verdichtet_auf=dense, reduziert_auf=tris_of(body), uv_ebenen=len(body.data.uv_layers))

# ---------- 3. Ausrichten (Blender: Z oben, Blick nach -Y) ----------
co = np.array([v.co[:] for v in body.data.vertices])
zmin, zmax = co[:, 2].min(), co[:, 2].max()
s = HT / (zmax - zmin)
cx, cy = (co[:, 0].max() + co[:, 0].min()) / 2, (co[:, 1].max() + co[:, 1].min()) / 2
from mathutils import Matrix  # noqa: E402
M = Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, -zmin))
body.data.transform(M)
for k in src_j:
    src_j[k] = np.array(M @ Vector(src_j[k]))
step("ausrichten", massstab=round(s, 4), hoehe=HT)

# ---------- 4. Gelenke der Spielknochen ----------
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
import packbones  # noqa: E402
BONES = packbones.bones(HUM)
NAMES = [b[0] for b in BONES]
PAR = {b[0]: b[1] for b in BONES}


def lerp(a, b, t):
    return a + (b - a) * t


J = {}
if "Skeleton_torso_joint_1" in src_j:
    q = src_j
    J["hips"] = q["Skeleton_torso_joint_1"]
    J["spine"] = q["Skeleton_torso_joint_2"]
    J["chest"] = lerp(q["Skeleton_torso_joint_2"], q["torso_joint_3"], 0.6)
    J["neck"] = q["Skeleton_neck_joint_1"]
    J["head"] = q["Skeleton_neck_joint_2"]
    arms = {"L": ("Skeleton_arm_joint_L__4_", "Skeleton_arm_joint_L__3_", "Skeleton_arm_joint_L__2_"),
            "R": ("Skeleton_arm_joint_R", "Skeleton_arm_joint_R__2_", "Skeleton_arm_joint_R__3_")}
    legs = {"L": ("leg_joint_L_1", "leg_joint_L_2", "leg_joint_L_3", "leg_joint_L_5"),
            "R": ("leg_joint_R_1", "leg_joint_R_2", "leg_joint_R_3", "leg_joint_R_5")}
    for sd, (a4, a3, a2) in arms.items():
        J["clavicle." + sd] = lerp(q["torso_joint_3"], q[a4], 0.4)
        J["upperarm." + sd] = lerp(q[a4], q[a3], 0.3)
        J["forearm." + sd] = q[a3]
        J["hand." + sd] = q[a2]
    for sd, (l1, l2, l3, l5) in legs.items():
        J["thigh." + sd] = q[l1]
        J["shin." + sd] = q[l2]
        J["foot." + sd] = q[l3]
        J["toe." + sd] = q[l5] + np.array([0, -0.06 * s, 0])
else:
    raise SystemExit("Skelettzuordnung fuer dieses Modell fehlt")
# Finger aus Handrichtung (das Probemodell hat keine Fingerknochen); Handspitze aus dem Netz
co = np.array([v.co[:] for v in body.data.vertices])
for sd, sx in (("L", 1), ("R", -1)):
    hand = J["hand." + sd]
    d = hand - J["forearm." + sd]
    d /= np.linalg.norm(d)
    cand = co[((co - hand) @ d) > 0]
    cand = cand[np.linalg.norm(cand - hand, axis=1) < 0.25 * s * 2]
    tip = cand[np.argmax((cand - hand) @ d)] if len(cand) else hand + d * 0.18
    L = max(0.08, float((tip - hand) @ d))
    J["fing1." + sd] = hand + d * L * 0.45
    J["fing2." + sd] = hand + d * L * 0.72
    J["thumb1." + sd] = hand + d * L * 0.15 + np.array([0, -0.02, 0])
    J["thumb2." + sd] = hand + d * L * 0.4 + np.array([0, -0.035, 0])
missing = [n for n in NAMES if n not in J]
step("gelenke", knochen=len(J), fehlend=missing)

# ---------- 5. Spielskelett und Gewichte ----------
arm_d = bpy.data.armatures.new("spiel")
arm = bpy.data.objects.new("spiel", arm_d)
bpy.context.scene.collection.objects.link(arm)
activate(arm)
bpy.ops.object.mode_set(mode="EDIT")
eb = {}
kids = {n: [c for c in NAMES if PAR[c] == n] for n in NAMES}
for n in NAMES:
    b = arm_d.edit_bones.new(n)
    b.head = Vector(J[n])
    if kids[n]:
        tail = np.mean([J[c] for c in kids[n]], axis=0)
        if n in ("hips",):
            tail = J["spine"]
        if n == "chest":
            tail = J["neck"]
    else:
        par = J[PAR[n]] if PAR[n] else J[n] - np.array([0, 0, 0.1])
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
nv = len(body.data.vertices)
W = np.zeros((nv, len(NAMES)))
gi = {g.index: NAMES.index(g.name) for g in body.vertex_groups if g.name in NAMES}
for v in body.data.vertices:
    for g in v.groups:
        if g.group in gi:
            W[v.index, gi[g.group]] = g.weight
unweighted = int((W.sum(axis=1) < 1e-4).sum())
step("gewichte_bone_heat", ecken=nv, ohne_gewicht=unweighted, gruppen=len(gi))
if unweighted:
    # Rueckfall: naechster Knochen fuer Ecken ohne Gewicht
    segs = [(NAMES.index(n), J[n], np.mean([J[c] for c in kids[n]], axis=0) if kids[n] else J[n]) for n in NAMES]
    for i in np.nonzero(W.sum(axis=1) < 1e-4)[0]:
        p = np.array(body.data.vertices[i].co)
        best = min(segs, key=lambda sg: np.linalg.norm(p - (sg[1] + np.clip(np.dot(p - sg[1], sg[2] - sg[1]) / max(1e-9, np.dot(sg[2] - sg[1], sg[2] - sg[1])), 0, 1) * (sg[2] - sg[1]))))
        W[i, best[0]] = 1.0

# ---------- 6. Kleidungsteil ----------
# Steht fuer ein einzeln erzeugtes Brustteil: aus dem Rumpf geformt, dann absichtlich verschoben und
# vergroessert, wie es von einem Dienst ankaeme. Anpassung wie im echten Ablauf.
TORSO = [NAMES.index(n) for n in ("hips", "spine", "chest", "clavicle.L", "clavicle.R")]
sel = W[:, TORSO].sum(axis=1) > 0.55
zc = np.array([v.co.z for v in body.data.vertices])
sel &= (zc > J["hips"][2] - 0.1 * s) & (zc < J["neck"][2] - 0.02 * s)
bm = bmesh.new()
bm.from_mesh(body.data)
bm.verts.ensure_lookup_table()
drop = [f for f in bm.faces if not all(sel[v.index] for v in f.verts)]
bmesh.ops.delete(bm, geom=drop, context="FACES")
gme = bpy.data.meshes.new("brust")
bm.to_mesh(gme)
bm.free()
gar = bpy.data.objects.new("brust", gme)
bpy.context.scene.collection.objects.link(gar)
gco = np.array([v.co[:] for v in gme.vertices])
ctr = gco.mean(axis=0)
gme.transform(Matrix.Translation(Vector(ctr + np.array([0.03, -0.02, 0.04]))) @ Matrix.Diagonal((1.12, 1.18, 0.95, 1)) @ Matrix.Translation(Vector(-ctr)))
activate(gar)
sol = gar.modifiers.new("dicke", "SOLIDIFY")
sol.thickness = 0.012
sol.offset = 1.0
bpy.ops.object.modifier_apply(modifier="dicke")
step("kleidung_roh", dreiecke=tris_of(gar))
# Anpassung: Huelle des Rumpfs ausrichten, dann alles Innenliegende nach aussen schieben
gco = np.array([v.co[:] for v in gme.vertices])
tco = co_body = np.array([v.co[:] for v in body.data.vertices])[sel]
ga, gb = gco.min(axis=0), gco.max(axis=0)
ta, tb = tco.min(axis=0), tco.max(axis=0)
pad = np.array([0.02, 0.02, 0.0]) * s
scale = (tb - ta + 2 * pad) / (gb - ga)
gco = (gco - (ga + gb) / 2) * scale + (ta + tb) / 2
for v, p in zip(gme.vertices, gco):
    v.co = Vector(p)
activate(gar)
sw = gar.modifiers.new("aussen", "SHRINKWRAP")
sw.target = body
sw.wrap_method = "NEAREST_SURFACEPOINT"
sw.wrap_mode = "OUTSIDE"
sw.offset = 0.014 * s
bpy.ops.object.modifier_apply(modifier="aussen")
sm = gar.modifiers.new("glatt", "CORRECTIVE_SMOOTH")
sm.iterations = 6
bpy.ops.object.modifier_apply(modifier="glatt")
sw = gar.modifiers.new("aussen2", "SHRINKWRAP")
sw.target = body
sw.wrap_method = "NEAREST_SURFACEPOINT"
sw.wrap_mode = "OUTSIDE"
sw.offset = 0.01 * s
bpy.ops.object.modifier_apply(modifier="aussen2")
# Gewichte vom Koerper uebertragen
for n in NAMES:
    gar.vertex_groups.new(name=n)
dt = gar.modifiers.new("gewichte", "DATA_TRANSFER")
dt.object = body
dt.use_vert_data = True
dt.data_types_verts = {"VGROUP_WEIGHTS"}
dt.vert_mapping = "POLYINTERP_NEAREST"
dt.layers_vgroup_select_src = "ALL"
dt.layers_vgroup_select_dst = "NAME"
activate(gar)
bpy.ops.object.modifier_apply(modifier="gewichte")
GW = np.zeros((len(gme.vertices), len(NAMES)))
ggi = {g.index: NAMES.index(g.name) for g in gar.vertex_groups if g.name in NAMES}
for v in gme.vertices:
    for g in v.groups:
        if g.group in ggi:
            GW[v.index, ggi[g.group]] = g.weight
step("kleidung_angepasst", ohne_gewicht=int((GW.sum(axis=1) < 1e-4).sum()))

# Haut unter dem Kleidungsteil ausblenden: Strahl von jeder Hautflaeche nach aussen trifft das Teil
bvh = BVHTree.FromObject(gar, bpy.context.evaluated_depsgraph_get())
body.data.calc_loop_triangles()
lt = body.data.loop_triangles
mask = np.zeros(len(lt), dtype=bool)
for i, t in enumerate(lt):
    c = t.center
    n = t.normal
    hit = bvh.ray_cast(c + n * 0.001, n, 0.09 * s)
    if hit[0] is not None:
        mask[i] = True
step("hautmaske", verdeckt=int(mask.sum()), von=len(lt))


# ---------- 7. Export ----------
def arrays(o, Wv):
    me = o.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data if me.uv_layers.active else None
    key = {}
    P, UV, I, src = [], [], [], []
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
    P = np.stack([P[:, 0], P[:, 2], -P[:, 1]], axis=1)  # Spiel: Y oben, Blick nach +Z
    Wv = Wv[np.array(src)]
    order = np.argsort(-Wv, axis=1)[:, :4]
    w4 = np.take_along_axis(Wv, order, axis=1)
    w4 = w4 / np.maximum(1e-9, w4.sum(axis=1, keepdims=True))
    return P.astype(np.float32), np.array(UV, np.float32), np.array(I, np.int32), order.astype(np.uint8), np.round(w4 * 255).astype(np.uint8)


bp, buv, bidx, bsi, bsw = arrays(body, W)
gp, guv, gidx, gsi, gsw = arrays(gar, GW)
Jg = np.array([[J[n][0], J[n][2], -J[n][1]] for n in NAMES], np.float32)


def sockets(P, J):
    """Haltepunkte wie im Spiel (assets-src/build_humans.py), hier aus Gelenken und Netz geschaetzt."""
    jj = {n: J[i] for i, n in enumerate(NAMES)}
    out = {}
    for sd, sx in (("L", 1.0), ("R", -1.0)):
        hand, f1, f2 = jj["hand." + sd], jj["fing1." + sd], jj["fing2." + sd]
        along = (f2 - hand) / np.linalg.norm(f2 - hand)
        nrm = np.array([-sx, 0.0, 0.0])
        nrm -= along * (nrm @ along)
        axis = sx * np.cross(nrm, along)
        axis /= np.linalg.norm(axis)
        grip = f1 * 0.55 + hand * 0.45
        out["grip" + sd] = dict(p=grip.tolist(), axis=axis.tolist(), along=along.tolist(), size=float(np.linalg.norm(f2 - hand) * 1.4))
        fa = jj["forearm." + sd]
        out["arm" + sd] = dict(p=((fa + hand) / 2).tolist(), along=((hand - fa) / np.linalg.norm(hand - fa)).tolist())
        out["ring" + sd] = dict(p=(hand + (f1 - hand) * 1.15).tolist())
    head = jj["head"]
    top = P[np.argmax(P[:, 1])]
    out["head"] = dict(p=head.tolist(), top=top.tolist(), width=float(np.ptp(P[P[:, 1] > head[1] + 0.02][:, 0])))

    def front(y, sign=1.0, band=0.02):
        q = P[(np.abs(P[:, 1] - y) < band) & (np.abs(P[:, 0]) < 0.05)]
        z = q[:, 2].max() if sign > 0 else q[:, 2].min()
        return [0.0, float(y), float(z)]
    ch, nk, hp = jj["chest"], jj["neck"], jj["hips"]
    out["chest"] = dict(p=front(ch[1] * 0.35 + nk[1] * 0.65 - 0.04))
    out["back"] = dict(p=front(ch[1] + (nk[1] - ch[1]) * 0.3, -1))
    yb = hp[1] + 0.06 * (P[:, 1].max() / 2.0)
    q = P[np.abs(P[:, 1] - yb) < 0.02]
    out["belt"] = dict(p=front(yb), left=[float(q[:, 0].max()), float(yb), 0.02], right=[float(q[:, 0].min()), float(yb), 0.02])
    return out


SOCK = sockets(bp, Jg)
tex = None
if img:
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
    tex = (np.clip(px[::-1, :, :3], 0, 1) * 255).astype(np.uint8)
np.savez_compressed(OUT_NPZ, body_pos=bp, body_uv=buv, body_idx=bidx, body_si=bsi, body_sw=bsw, body_mask=mask,
                    gar_pos=gp, gar_uv=guv, gar_idx=gidx, gar_si=gsi, gar_sw=gsw, joints=Jg, top=np.float32(bp[:, 1].max()),
                    tex=tex if tex is not None else np.zeros((4, 4, 3), np.uint8), sockets=json.dumps(SOCK))
step("export_spielformat", koerper_dreiecke=len(bidx), kleidung_dreiecke=len(gidx))
activate(body, gar, arm)
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", use_selection=True, export_skins=True, export_draco_mesh_compression_enable=True)
import os  # noqa: E402
step("export_glb_draco", groesse_kb=round(os.path.getsize(OUT_GLB) / 1024))
json.dump(LOG, open(OUT_LOG, "w"), ensure_ascii=False, indent=1)
