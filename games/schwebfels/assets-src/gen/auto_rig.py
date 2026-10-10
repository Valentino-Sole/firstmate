"""Eigenes Zweibeiner-Skelett fuer ein Modell, bei dem Meshys Rigging scheitert oder ein falsches Skelett liefert.

Aufruf (mit Blender als Python-Modul, wie die anderen Werkzeuge):
  python auto_rig.py <model.glb> <rigged.glb>

Erwartet einen stehenden Zweibeiner mit Blick nach +Z (glTF) und Armen seitlich (A- oder T-Haltung), wie ihn
Meshy mit pose_mode a-pose liefert. Die Gelenke kommen aus der Form: Fuesse als tiefste Punkte je Seite, Schritt als
tiefste Stelle, an der die Beine zusammenlaufen, Haende als seitlich aeusserste Punkte, Hals und Kopf aus den
Proportionen. Daraus entsteht das 24-Knochen-Skelett mit Meshys Knochennamen (Hips, Spine02 ... RightToeBase), die
Gewichte berechnet Blender (Bone Heat, Ecken ohne Gewicht bekommen den naechsten Knochen). Danach wie ein Meshy-Rig
mit meshy_import.py weiterverarbeiten.
"""
import sys

import bpy
import numpy as np
from mathutils import Vector

src, dst = sys.argv[1], sys.argv[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
for o in bpy.context.scene.objects:
    o.select_set(o in meshes)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1:
    bpy.ops.object.join()
body = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# Naehte (gleiche Lage, getrennte Ecken) zusammenfuehren, sonst findet Bone Heat keine Loesung; UVs bleiben je Ecke
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.object.mode_set(mode="OBJECT")
V = np.array([v.co[:] for v in body.data.vertices])
# Blender: X rechts (linke Koerperseite +X), -Y vorn, Z oben
z0, z1 = V[:, 2].min(), V[:, 2].max()
H = z1 - z0
mid = V[(V[:, 2] > z0 + 0.45 * H) & (V[:, 2] < z0 + 0.75 * H)]
xc, yc = float(np.median(mid[:, 0])), float(np.median(mid[:, 1]))


def foot(side):
    q = V[(V[:, 2] < z0 + 0.06 * H) & ((V[:, 0] - xc) * side > 0.01 * H)]
    if len(q) < 5:
        q = V[(V[:, 2] < z0 + 0.12 * H) & ((V[:, 0] - xc) * side > 0)]
    ank = np.array([np.median(q[:, 0]), np.median(q[:, 1]), z0 + 0.06 * H])
    toe = q[q[:, 1].argmin()]
    return ank, np.array([ank[0], min(ank[1] - 0.04 * H, toe[1] + 0.02 * H), z0 + 0.02 * H])


aL, tL = foot(1)
aR, tR = foot(-1)
# Schritt: von unten die erste Hoehe, ab der Punkte zwischen den Beinen liegen
crotch = z0 + 0.45 * H
gap = abs(aL[0] - aR[0])
for z in np.arange(z0 + 0.15 * H, z0 + 0.62 * H, 0.01 * H):
    s = V[(np.abs(V[:, 2] - z) < 0.006 * H) & (np.abs(V[:, 0] - xc) < max(0.15 * gap, 0.01 * H))]
    if len(s) > 3:
        crotch = z
        break
crotch = float(np.clip(crotch, z0 + 0.3 * H, z0 + 0.6 * H))
hips = np.array([xc, yc, crotch + 0.06 * H])
neck = np.array([xc, yc, z0 + 0.84 * H])
head = np.array([xc, yc, z0 + 0.88 * H])


def hand(side):
    q = V[(V[:, 2] > z0 + 0.25 * H) & (V[:, 2] < z0 + 0.92 * H) & ((V[:, 0] - xc) * side > 0)]
    tip = q[((q[:, 0] - xc) * side).argmax()]
    sh = np.array([xc + side * 0.11 * H, yc, z0 + 0.81 * H])
    hd = sh + (tip - sh) * 0.82
    el = sh + (hd - sh) * 0.5 + np.array([0, 0.015 * H, 0])
    cl = np.array([xc + side * 0.035 * H, yc, z0 + 0.8 * H])
    return cl, sh, el, hd, tip


def leg(side, ank):
    up = np.array([xc + side * 0.055 * H, yc, crotch + 0.02 * H])
    kn = up + (ank - up) * 0.5 + np.array([0, -0.02 * H, 0])
    return up, kn


bones = {}


def B(name, head_, tail_, parent=None):
    bones[name] = (Vector(head_), Vector(tail_), parent)


sp = lambda f: hips + (neck - hips) * f  # noqa: E731
B("Hips", hips, sp(0.12))
B("Spine02", sp(0.12), sp(0.4), "Hips")
B("Spine01", sp(0.4), sp(0.72), "Spine02")
B("Spine", sp(0.72), neck, "Spine01")
B("neck", neck, head, "Spine")
B("Head", head, [xc, yc, z1], "neck")
B("head_end", [xc, yc, z1], [xc, yc, z1 + 0.05 * H], "Head")
B("headfront", head + [0, -0.08 * H, 0.03 * H], head + [0, -0.12 * H, 0.03 * H], "Head")
for s_, side, ank, toe in (("Left", 1, aL, tL), ("Right", -1, aR, tR)):
    cl, sh, el, hd, tip = hand(side)
    B(s_ + "Shoulder", cl, sh, "Spine")
    B(s_ + "Arm", sh, el, s_ + "Shoulder")
    B(s_ + "ForeArm", el, hd, s_ + "Arm")
    B(s_ + "Hand", hd, tip, s_ + "ForeArm")
    up, kn = leg(side, ank)
    B(s_ + "UpLeg", up, kn, "Hips")
    B(s_ + "Leg", kn, ank, s_ + "UpLeg")
    B(s_ + "Foot", ank, toe, s_ + "Leg")
    B(s_ + "ToeBase", toe, toe + [0, -0.04 * H, 0], s_ + "Foot")

arm_d = bpy.data.armatures.new("Armature")
arm = bpy.data.objects.new("Armature", arm_d)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")
eb = {}
for n, (h, t, p) in bones.items():
    e = arm_d.edit_bones.new(n)
    e.head, e.tail = h, t
    if (e.tail - e.head).length < 1e-4:
        e.tail = e.head + Vector((0, 0, 0.02 * H))
    eb[n] = e
for n, (h, t, p) in bones.items():
    if p:
        eb[n].parent = eb[p]
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
arm.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type="ARMATURE_AUTO")
# Ecken ohne Gewicht: naechster Knochen
names = list(bones)
segs = [(np.array(bones[n][0][:]), np.array(bones[n][1][:])) for n in names]
groups = {n: body.vertex_groups.get(n) or body.vertex_groups.new(name=n) for n in names}
miss = 0
for v in body.data.vertices:
    if sum(g.weight for g in v.groups) > 1e-4:
        continue
    p = np.array(v.co[:])
    best, bd = None, 1e9
    for n, (a, b) in zip(names, segs):
        d = b - a
        t = np.clip(np.dot(p - a, d) / max(np.dot(d, d), 1e-9), 0, 1)
        dist = np.linalg.norm(p - (a + d * t))
        if dist < bd:
            best, bd = n, dist
    groups[best].add([v.index], 1.0, "REPLACE")
    miss += 1
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB")
print("Skelett: Schritt %.2f, Haende %s, Fuesse %s; %d Ecken ohne Bone-Heat-Gewicht" % (
    (crotch - z0) / H, [round(float(x), 2) for x in hand(1)[4][:1]], [round(float(aL[0]), 2), round(float(aR[0]), 2)], miss))
