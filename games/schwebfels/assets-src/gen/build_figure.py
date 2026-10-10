"""Erzeugte Figur (GLB, mit oder ohne Skelett) ins Spielformat bringen: ein Koerper fuer gen.pack.

Aufruf: python build_figure.py <figur.glb> <assets/schwebfels.pack> <profil> <ausgabe.npz> <bericht.json> [--tris 16000] [--heat]
  <profil>: Koerperprofil des Spiels fuer die Zielhoehe, z. B. nordmann.f, trollblut.m, glutzwerg.f
  --heat:   Hautgewichte immer mit Blender (Bone Heat) statt aus dem mitgelieferten Skelett

Ablauf: Import, Netze vereinen, Aufraeumen, Reduzieren, Ausrichten auf die Profilhoehe, Gelenke der 29 Spielknochen
aus dem mitgelieferten Skelett (Namen wie Mixamo oder Meshy), Hautgewichte (aus dem Skelett uebertragen oder Bone Heat),
Finger und Daumen aus der Handform (Gelenke an den Knoecheln, Faust um den Griffpunkt), Haltepunkte, Textur, Export.
Weitere Schalter: --height <hoehe>, --tex <farbe.png>, --nrm <normal.png>, --display <anzeige.glb>, --weld;
FINGER_DEBUG=<ordner> speichert die Handerkennung je Hand als npz.
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
# Ecken nur auf Wunsch verschweissen: an Texturnaehten getrennte Ecken halten beim Reduzieren die Naehte sauber
WELD = "--weld" in args
if WELD:
    args.remove("--weld")
TRIS = 16000
if "--tris" in args:
    i = args.index("--tris")
    TRIS = int(args[i + 1])
    del args[i:i + 2]
if "--height" in args:
    i = args.index("--height")
    del args[i:i + 2]
TEXF = NRMF = None
for flag_, var in (("--tex", "TEXF"), ("--nrm", "NRMF")):
    if flag_ in args:
        i = args.index(flag_)
        globals()[var] = args[i + 1]
        del args[i:i + 2]
TEXSIZE = 1024
# Anzeigenetz: direkt aus dem Original verkleinert (sauberer als ein zweites Verkleinern des skelettierten Netzes);
# die Hautgewichte kommen dann vom skelettierten Netz
DISPLAY = None
if "--display" in args:
    i = args.index("--display")
    DISPLAY = args[i + 1]
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
# Hoehe nach Konzeptvorlage statt nach altem Koerperprofil (z. B. Frostwicht groesser als Glutzwerg)
if "--height" in sys.argv:
    HT = float(sys.argv[sys.argv.index("--height") + 1])

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

if DISPLAY:
    before_objs = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=DISPLAY)
    new = [o for o in bpy.context.scene.objects if o not in before_objs]
    disp = max([o for o in new if o.type == "MESH"], key=tris_of)
    for o in new:
        if o is not disp:
            bpy.data.objects.remove(o, do_unlink=True)
    mw = disp.matrix_world.copy()
    disp.parent = None
    disp.data.transform(mw)
    disp.matrix_world.identity()
    # auf die Lage des skelettierten Netzes bringen (gleiche Form, eventuell anderer Massstab)
    a_ = np.array([v.co[:] for v in body.data.vertices])
    d_ = np.array([v.co[:] for v in disp.data.vertices])
    sc = (a_[:, 2].max() - a_[:, 2].min()) / (d_[:, 2].max() - d_[:, 2].min())
    ca = (a_.max(axis=0) + a_.min(axis=0)) / 2
    cd = (d_.max(axis=0) + d_.min(axis=0)) / 2
    disp.data.transform(Matrix.Translation(Vector(ca)) @ Matrix.Scale(sc, 4) @ Matrix.Translation(Vector(-cd)))
    for g in body.vertex_groups:
        disp.vertex_groups.new(name=g.name)
    dt = disp.modifiers.new("gewichte", "DATA_TRANSFER")
    dt.object = body
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"
    dt.layers_vgroup_select_src = "ALL"
    dt.layers_vgroup_select_dst = "NAME"
    activate(disp)
    bpy.ops.object.modifier_apply(modifier="gewichte")
    bpy.data.objects.remove(body, do_unlink=True)
    body = disp
    step("anzeigenetz", dreiecke=tris_of(body), massstab=round(float(sc), 4))

# ---------- 2. Aufraeumen und Reduzieren ----------
bm = bmesh.new()
bm.from_mesh(body.data)
nb = len(bm.verts)
if WELD:
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
# Wirbelsaeule nach Hoehe: Meshy nennt die Wirbel von oben nach unten anders als Mixamo (Spine02 unten, Spine oben)
if "hips" in MAP and "neck" in MAP:
    chain, cur = [], src_par.get(MAP["neck"])
    while cur is not None and cur != MAP["hips"]:
        chain.append(cur)
        cur = src_par.get(cur)
    chain = chain[::-1]
    if cur == MAP["hips"] and chain:
        h0, h1 = src_j[MAP["hips"]][2], src_j[MAP["neck"]][2]
        rel = [(src_j[c][2] - h0) / max(1e-6, h1 - h0) for c in chain]
        MAP["spine"] = chain[0]
        MAP["chest"] = chain[int(np.argmin([abs(r - 0.45) for r in rel]))] if len(chain) > 1 else chain[0]
        if MAP["chest"] == MAP["spine"] and len(chain) > 1:
            MAP["chest"] = chain[1]
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

# ---------- 5b. Finger und Daumen ----------
# Erzeugte Haende haben keine Fingerknochen. Finger und Daumen entlang der Netzverbindungen vom Handgelenk aus
# trennen (kuerzeste Wege), Gelenke an die echten Knoechel legen und die Handgewichte aufteilen, damit sich die
# Hand um einen Griff schliessen kann.
from scipy.sparse import coo_matrix  # noqa: E402
from scipy.sparse.csgraph import dijkstra  # noqa: E402

EDGES = np.array([e.vertices[:] for e in body.data.edges])
HANDINFO = {}


def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def finger_rig(sd):
    ih = NAMES.index("hand." + sd)
    hand, fa = J["hand." + sd], J["forearm." + sd]
    dv = (hand - fa) / np.linalg.norm(hand - fa)
    sel = np.nonzero((W[:, ih] > 0.5 * np.maximum(W.sum(axis=1), 1e-9)) & (((co - hand) @ dv) > -0.03 * HT))[0]
    if len(sel) < 60:
        return "zu wenige Ecken an der Hand"
    loc = np.full(len(co), -1)
    loc[sel] = np.arange(len(sel))
    e = EDGES[(loc[EDGES[:, 0]] >= 0) & (loc[EDGES[:, 1]] >= 0)]
    a, b = loc[e[:, 0]], loc[e[:, 1]]
    ln = np.linalg.norm(co[e[:, 0]] - co[e[:, 1]], axis=1) + 1e-9
    # an Texturnaehten getrennte Ecken an derselben Stelle verbinden
    from scipy.spatial import cKDTree
    pr = np.array(sorted(cKDTree(co[sel]).query_pairs(1e-5 * HT)), dtype=int).reshape(-1, 2)
    a, b, ln = np.r_[a, pr[:, 0]], np.r_[b, pr[:, 1]], np.r_[ln, np.full(len(pr), 1e-9)]
    n = len(sel)
    GR = coo_matrix((np.r_[ln, ln], (np.r_[a, b], np.r_[b, a])), shape=(n, n)).tocsr()
    X = co[sel]
    t = (X - hand) @ dv
    L = float(t.max())
    # Startlinie am Handgelenk: Handecken mit einer Kante zum Unterarm (nicht einzelne Ausreisser hinten)
    out_e = EDGES[(loc[EDGES[:, 0]] >= 0) != (loc[EDGES[:, 1]] >= 0)]
    rim = np.unique(np.where(loc[out_e[:, 0]] >= 0, loc[out_e[:, 0]], loc[out_e[:, 1]]))
    rim = rim[t[rim] < 0.4 * L]
    if len(rim) < 3:
        rim = np.nonzero(t < np.percentile(t, 3) + 0.04 * L)[0]
    g = dijkstra(GR, indices=rim, min_only=True)
    reach = np.isfinite(g)
    if reach.mean() < 0.6:
        return "Hand nicht zusammenhaengend (%.0f %% erreichbar)" % (100 * reach.mean())
    g[~reach] = 0
    # Spitzen: oertliche Hoechstwerte der Entfernung vom Handgelenk
    nbm = np.zeros(n)
    np.maximum.at(nbm, a, g[b])
    np.maximum.at(nbm, b, g[a])
    cand = np.nonzero((g >= nbm) & (g > 0.45 * g.max()))[0]
    # echte Spitze: im Umkreis von 0,2 Handlaengen entlang der Oberflaeche liegt nichts weiter vom Handgelenk entfernt
    # (Hoecker auf Handflaeche oder Handruecken fallen damit heraus, benachbarte Finger stoeren nicht)
    near = dijkstra(GR, indices=cand, limit=0.2 * L)
    tips = []
    for c, row in zip(cand, near):
        if g[np.isfinite(row)].max() <= g[c] + 1e-6 and all(np.linalg.norm(X[c] - X[q]) > 0.04 * L for q in tips):
            tips.append(int(c))
    if len(tips) < 3:
        return "Finger nicht getrennt (%d Spitzen)" % len(tips)
    sg = 1.0 if sd == "R" else -1.0  # rechte oder linke Hand; zugleich das Vorzeichen, mit dem das Spiel beugt
    # Handrahmen: Fingerrichtung zu den Spitzen, Handflaeche als duennste Richtung des Handtellers, zur Koerpermitte
    # gerichtet (A-Haltung); Daumenseite folgt aus rechts oder links
    d0 = X[t > 0.85 * L].mean(axis=0) - hand
    d0 /= np.linalg.norm(d0)
    q = X[(t > 0.15 * L) & (t < 0.55 * L)]
    pv0 = np.linalg.eigh(np.cov((q - q.mean(axis=0)).T))[1][:, 0]
    pv0 -= d0 * (pv0 @ d0)
    pv0 /= np.linalg.norm(pv0)
    mid = np.array([-np.sign(hand[0]), 0.0, 0.0])
    if abs(pv0 @ mid) > 0.35:
        pv0 *= np.sign(pv0 @ mid)
    elif pv0 @ (X[t > 0.85 * L].mean(axis=0) - X[(t > 0.4 * L) & (t < 0.6 * L)].mean(axis=0)) < 0:
        pv0 = -pv0  # Handflaeche nicht zur Mitte: dorthin, wohin die Finger schon leicht gebeugt sind
    k0 = sg * np.cross(d0, pv0)
    fw = k0
    # Daumen: die Spitze, die am staerksten zur Daumenseite statt in Fingerrichtung zeigt
    rel = X[tips] - hand
    th = tips[int(np.argmax((rel @ k0) / np.maximum(rel @ d0, 0.05 * L)))]
    ftips = [q for q in tips if q != th]
    gt = dijkstra(GR, indices=th)
    gf, _, src = dijkstra(GR, indices=ftips, min_only=True, return_predecessors=True)
    is_t = (gt < gf) & reach
    s = gt / max(1e-9, g[th])
    f = g / np.maximum(1e-9, g[np.maximum(src, 0)])
    # weiche Uebergaenge, dann zweimal ueber die Nachbarn glaetten
    adj = coo_matrix((np.ones(2 * len(a)), (np.r_[a, b], np.r_[b, a])), shape=(n, n)).tocsr()
    deg = np.asarray(adj.sum(axis=1)).ravel()

    def blur(x):
        for _ in range(2):
            x = (x + adj @ x) / (1 + deg)
        return x
    wt = blur(is_t * (1 - smooth(s, 0.62, 0.85)))
    wt2 = blur(is_t * (1 - smooth(s, 0.30, 0.42)))
    wf = blur((~is_t & reach) * smooth(f, 0.48, 0.60))
    wf2 = blur((~is_t & reach) * smooth(f, 0.70, 0.80))
    wt, wf = np.where(is_t, wt, 0), np.where(is_t, 0, wf)
    # Doppelecken an Texturnaehten muessen gleich gewichtet sein, sonst reisst die Haut beim Beugen auf
    from scipy.sparse.csgraph import connected_components
    _, grp = connected_components(coo_matrix((np.ones(len(pr)), (pr[:, 0], pr[:, 1])), shape=(n, n)), directed=False)
    cnt = np.bincount(grp)
    wt, wt2, wf, wf2 = (np.bincount(grp, x)[grp] / cnt[grp] for x in (wt, wt2, wf, wf2))
    wh = W[sel, ih].copy()
    W[sel, ih] = wh * (1 - wt - wf)
    W[sel, NAMES.index("thumb1." + sd)] += wh * wt * (1 - wt2)
    W[sel, NAMES.index("thumb2." + sd)] += wh * wt * wt2
    W[sel, NAMES.index("fing1." + sd)] += wh * wf * (1 - wf2)
    W[sel, NAMES.index("fing2." + sd)] += wh * wf * wf2

    def ring(mask, fallback):
        return X[mask].mean(axis=0) if mask.sum() >= 3 else fallback
    J["fing1." + sd] = k1 = ring(~is_t & (np.abs(f - 0.54) < 0.03), J["fing1." + sd])
    J["fing2." + sd] = k2 = ring(~is_t & (np.abs(f - 0.75) < 0.03), J["fing2." + sd])
    J["thumb1." + sd] = ring(is_t & (np.abs(s - 0.75) < 0.05), J["thumb1." + sd])
    J["thumb2." + sd] = ring(is_t & (np.abs(s - 0.36) < 0.05), J["thumb2." + sd])
    tip = X[ftips].mean(axis=0)
    df = (k2 - k1) / np.linalg.norm(k2 - k1)
    # Knoechellinie (kleiner Finger zum Zeigefinger) als Beuge- und Griffachse, zur Daumenseite gerichtet
    k = sg * np.cross(df, pv0)
    k /= np.linalg.norm(k)
    pv = sg * np.cross(k, df)
    curl = k if sg * (np.cross(k, df) @ pv) > 0 else -k

    # Griffpunkt: Mitte des Kreises, den die gebeugten Finger bei voller Faust umschliessen
    def rotv(v, ax, ang):
        ax = ax / np.linalg.norm(ax)
        return v * np.cos(ang) + np.cross(ax, v) * np.sin(ang) + ax * (ax @ v) * (1 - np.cos(ang))
    A = k1
    B_ = A + rotv(k2 - k1, curl, sg * 1.25)
    C_ = B_ + rotv(tip - k2, curl, sg * 2.70)
    P2 = [np.array([(p - A) @ df, (p - A) @ pv]) for p in (A, B_, C_)]
    (x1, y1), (x2, y2), (x3, y3) = P2
    dd = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2))
    if abs(dd) < 1e-9:
        cx, cy = 0.0, 0.25 * L
    else:
        cx = ((x1 ** 2 + y1 ** 2) * (y2 - y3) + (x2 ** 2 + y2 ** 2) * (y3 - y1) + (x3 ** 2 + y3 ** 2) * (y1 - y2)) / dd
        cy = ((x1 ** 2 + y1 ** 2) * (x3 - x2) + (x2 ** 2 + y2 ** 2) * (x1 - x3) + (x3 ** 2 + y3 ** 2) * (x2 - x1)) / dd
    grip = A + df * cx + pv * cy
    # Daumen: Spitze soll bei voller Faust aussen auf den gebeugten Mittelgliedern von Zeige- und Mittelfinger liegen
    mid = (B_ + C_) / 2
    out_ = mid - grip
    T_ = mid + out_ / max(1e-9, np.linalg.norm(out_)) * 0.05 * L + k * 0.15 * L
    t2 = J["thumb2." + sd]
    cur, tgt = X[th] - t2, T_ - t2
    ta = np.cross(cur, tgt)
    tang = float(np.arctan2(np.linalg.norm(ta), cur @ tgt))
    ta = ta / max(1e-9, np.linalg.norm(ta)) * sg
    if os.environ.get("FINGER_DEBUG"):
        np.savez(os.path.join(os.environ["FINGER_DEBUG"], os.path.basename(OUT_NPZ)[:-4] + "-" + sd + ".npz"), X=X, is_t=is_t, f=f,
                 s=s, g=g, tips=np.array(tips), th=th, hand=hand, dv=dv, fw=fw, k=k, df=df, pv=pv, k1=k1, k2=k2, tip=tip, grip=grip,
                 T=T_, B=B_, C=C_, t1=J["thumb1." + sd], t2=J["thumb2." + sd])
    HANDINFO[sd] = dict(grip=grip, axis=k, along=df, curl=curl, thumb=ta, thumbA=[0.45 * tang, 0.55 * tang], wrist=np.cross(df, k) / np.linalg.norm(np.cross(df, k)),
                        size=float(np.linalg.norm(k2 - hand) * 1.4))
    return "erreichbar %.0f %%, Spitzen %d, Daumenecken %d, Fingerecken %d, Faustradius %.3f, Daumenbeugung %.2f" % (
        100 * reach.mean(), len(tips), int(is_t.sum()), int((wf > 0.5).sum()), float(np.hypot(cx, cy)), tang)


for sd in ("L", "R"):
    msg = finger_rig(sd)
    LOG.setdefault("haende", {})[sd] = msg
    if sd not in HANDINFO:
        LOG["nacharbeit"].append("Hand %s ohne Fingertrennung: %s" % (sd, msg))
step("finger", **LOG.get("haende", {}))


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


def belt_edge(xs, gap=0.03):
    """Abstand der Rumpfseite von der Mitte auf Guertelhoehe. In A-Haltung haengen die Haende auf derselben Hoehe;
    sie zaehlen nicht mit: von der Mitte nach aussen bis zur ersten Luecke im Querschnitt."""
    xs = np.sort(np.abs(np.asarray(xs, np.float64)))
    if not len(xs):
        return 0.0
    e = xs[0]
    for x in xs:
        if x - e > gap:
            break
        e = x
    return float(e)


def sockets(P, Jg):
    jj = {n: Jg[i] for i, n in enumerate(NAMES)}
    out = {}
    def gv(x):
        return [float(x[0]), float(x[2]), float(-x[1])]
    for sd, sx in (("L", 1.0), ("R", -1.0)):
        hand, f1, f2 = jj["hand." + sd], jj["fing1." + sd], jj["fing2." + sd]
        fa = jj["forearm." + sd]
        out["arm" + sd] = dict(p=((fa + hand) / 2).tolist(), along=((hand - fa) / np.linalg.norm(hand - fa)).tolist())
        out["ring" + sd] = dict(p=(hand + (f1 - hand) * 1.15).tolist())
        if sd in HANDINFO:
            # Faust aus der echten Hand: Schaft entlang der Knoechellinie im Kreis der gebeugten Finger; die
            # Neigung nach oben kommt aus dem Handgelenk (wrist), nicht aus dem Haltepunkt
            hi = HANDINFO[sd]
            out["grip" + sd] = dict(p=gv(hi["grip"]), axis=gv(hi["axis"]), along=gv(hi["along"]), curl=gv(hi["curl"]),
                                    thumb=gv(hi["thumb"]), thumbA=hi["thumbA"], wrist=gv(hi["wrist"]), size=hi["size"])
            continue
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
    el, er = belt_edge(q[q[:, 0] >= 0, 0]), belt_edge(q[q[:, 0] < 0, 0])
    # beruehrt eine Hand die Huefte, gibt es auf dieser Seite keine Luecke: hoechstens wenig breiter als die andere Seite
    m = min(el, er) * 1.15
    el, er = min(el, m), min(er, m)
    out["belt"] = dict(p=front(yb), left=[el, float(yb), 0.02], right=[-er, float(yb), 0.02])
    return out


bp, buv, bidx, bsi, bsw = arrays(body, W)
Jg = np.array([[J[n][0], J[n][2], -J[n][1]] for n in NAMES], np.float32)
tex = np.full((4, 4, 3), 180, np.uint8)
nrm = None


def load_png(path):
    from PIL import Image
    im = Image.open(path).convert("RGB")
    if im.size[0] > TEXSIZE:
        im = im.resize((TEXSIZE, TEXSIZE), Image.LANCZOS)
    return np.asarray(im, dtype=np.uint8)


if NRMF:
    nrm = load_png(NRMF)
if TEXF:
    tex = load_png(TEXF)
elif img is not None and img.size[0] > 0:
    px = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)
    tex = (np.clip(px[::-1, :, :3], 0, 1) * 255).astype(np.uint8)
else:
    LOG["nacharbeit"].append("keine Textur gefunden")
np.savez_compressed(OUT_NPZ, body_pos=bp, body_uv=buv, body_idx=bidx, body_si=bsi, body_sw=bsw, joints=Jg,
                    top=np.float32(bp[:, 1].max()), tex=tex, sockets=json.dumps(sockets(bp, Jg)), pieces=json.dumps([]),
                    **({"nrm": nrm} if nrm is not None else {}))
step("export", dreiecke=len(bidx), ecken=len(bp), textur=list(tex.shape[:2]))
json.dump(LOG, open(OUT_LOG, "w"), ensure_ascii=False, indent=1)
