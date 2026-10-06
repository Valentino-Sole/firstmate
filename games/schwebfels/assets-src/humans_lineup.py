"""Vergleichsbild aller Voelker (Grundkoerper ohne Kleidung) zum Abstimmen der Profile.
Aufruf: MH_DATA=... python humans_lineup.py <ausgabe.png> [m|f]"""
import os
import sys
import math
import numpy as np
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mhlib  # noqa: E402
import blib  # noqa: E402
import races  # noqa: E402

out = sys.argv[1]
sex = sys.argv[2] if len(sys.argv) > 2 else "m"
v, vt, faces = mhlib.load_obj(os.path.join(mhlib.data_dir(), "3dobjs", "base.obj"))
body = [f for f in faces if f[2] == "body"]
NB = 13380


def profile_verts(rid, sex):
    R = races.RACES[rid]
    P = R[sex]
    ears, _, _, _ = mhlib.EAR_TYPES[R["ears"]]
    tg = mhlib.macro_weights(**P["macro"]) + mhlib.side_targets(dict(P["detail"], **ears))
    vv = mhlib.apply_targets(v, tg)
    vv = mhlib.stretch_ears(vv, R["ears"])
    pos = np.stack([vv[:, 0], -vv[:, 2], vv[:, 1]], axis=1)
    pos[:, 2] -= pos[:NB, 2].min()
    pos *= P["H"] / pos[:NB, 2].max()
    return pos


blib.reset()
skin = {"albier": (0.78, 0.55, 0.42), "kreidezwerg": (0.85, 0.68, 0.55), "klippengeboren": (0.86, 0.64, 0.52), "daemmerblut": (0.7, 0.66, 0.82),
        "nordmann": (0.9, 0.74, 0.62), "trollblut": (0.45, 0.52, 0.62), "frostwicht": (0.72, 0.76, 0.84), "glutzwerg": (0.42, 0.26, 0.18),
        "sidhe": (0.86, 0.82, 0.9), "moorling": (0.55, 0.62, 0.4), "hainriese": (0.5, 0.33, 0.22), "dornling": (0.62, 0.6, 0.72)}
x = 0.0
for rid in races.ORDER:
    pos = profile_verts(rid, sex)
    w = pos[:NB, 0].max() - pos[:NB, 0].min()
    pos[:, 0] += x + w / 2
    ob = blib.mesh_object(rid, pos, [f[0] for f in body], vt, [f[1] for f in body])
    ob.data.materials.append(blib.material("s" + rid, skin[rid], rough=0.5, sss=0.2))
    x += w + 0.25
sc = bpy.context.scene
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = x + 0.2
cam.location = (x / 2, -20, 1.2)
cam.rotation_euler = (math.pi / 2, 0, 0)
sc.camera = cam
for nm, loc, e in (("key", (x * 0.3, -10, 8), 2200), ("fill", (x * 0.8, -8, 3), 700)):
    L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, "AREA"))
    L.data.energy = e
    L.data.size = 8
    L.location = loc
    blib.look_at(L, (x / 2, 0, 1))
    sc.collection.objects.link(L)
world = bpy.data.worlds.new("w")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.8, 0.78, 0.74, 1)
sc.world = world
sc.cycles.samples = 16
if len(sys.argv) > 3 and sys.argv[3] == "heads":
    from PIL import Image
    tiles = []
    cam.data.ortho_scale = 0.62
    sc.render.resolution_x = 300
    sc.render.resolution_y = 300
    for ob in [o for o in bpy.data.objects if o.type == "MESH"]:
        for o2 in bpy.data.objects:
            if o2.type == "MESH":
                o2.hide_render = o2 is not ob
        zs = [p.co.z for p in ob.data.vertices[:NB]]
        xs = [p.co.x for p in ob.data.vertices[:NB]]
        top = max(zs)
        cam.location = ((min(xs) + max(xs)) / 2 - 0.0, -20, top - 0.2)
        for yaw in (0.0, 1.0):
            cam.rotation_euler = (math.pi / 2, 0, 0)
            ob.rotation_euler = (0, 0, yaw)
            ob.location.x = 0
            cxv = (min(xs) + max(xs)) / 2
            ob.location.x = cxv - cxv * math.cos(yaw)
            ob.location.y = -cxv * math.sin(yaw)
            fn = out + "." + ob.name + str(int(yaw)) + ".png"
            blib.render(fn)
            tiles.append(Image.open(fn))
            ob.rotation_euler = (0, 0, 0)
            ob.location = (0, 0, 0)
    sheet = Image.new("RGB", (300 * 12, 600))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i // 2) * 300, (i % 2) * 300))
    sheet.save(out)
else:
    sc.render.resolution_x = 1800
    sc.render.resolution_y = int(1800 * 2.6 / (x + 0.2))
    blib.render(out)
