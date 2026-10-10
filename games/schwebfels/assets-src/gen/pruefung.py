"""Pruefung der Werkzeuge fuer einzelne Modelle (weapon.py, prop.py) ohne Meshy und ohne Credits.

Aufruf: python pruefung.py   (Blender als Python-Modul noetig, wie fuer die uebrigen Werkzeuge)

Baut in Blender absichtlich schwierige Pruefmodelle (Schwert schraeg im Raum, Axt kopfueber, Schild mit der
Vorderseite zur Seite, Stab mit riesiger Kugel, ausladender Baum, flacher Fels), rechnet sie mit den Werkzeugen um und
prueft Lage, Griffpunkt und Groesse gegen die gebauten Waffen und Requisiten des Spiels.
"""
import math
import os
import subprocess
import sys
import tempfile

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def build_models(out):
    import bpy

    def material(name, col):
        img = bpy.data.images.new(name, 16, 16)
        px = np.zeros((16, 16, 4), np.float32)
        px[..., :3] = col
        px[..., 3] = 1
        img.pixels = px.ravel()
        img.pack()
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        t = m.node_tree.nodes.new("ShaderNodeTexImage")
        t.image = img
        m.node_tree.links.new(t.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
        return m

    def obj(kind, size, loc, mat, **kw):
        getattr(bpy.ops.mesh, "primitive_%s_add" % kind)(location=loc, **kw)
        o = bpy.context.active_object
        o.scale = size
        bpy.ops.object.transform_apply(scale=True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.uv.smart_project()
        bpy.ops.object.mode_set(mode="OBJECT")
        o.data.materials.append(mat)
        return o

    def export(objs, name, rot=(0, 0, 0)):
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        o = bpy.context.active_object
        o.rotation_euler = rot
        bpy.ops.object.transform_apply(rotation=True)
        bpy.ops.export_scene.gltf(filepath=os.path.join(out, name + ".glb"), export_format="GLB", use_selection=True)

    def fresh():
        bpy.ops.wm.read_factory_settings(use_empty=True)
        return material("a", (0.7, 0.7, 0.75)), material("b", (0.45, 0.28, 0.15))

    # Blender: Z oben. Schwert: Klinge, Parierstange, Griff, Knauf; schraeg gekippt
    a, b = fresh()
    export([obj("cube", (0.06, 0.012, 0.8), (0, 0, 0.5), a), obj("cube", (0.24, 0.035, 0.03), (0, 0, 0.09), a),
            obj("cube", (0.03, 0.03, 0.17), (0, 0, -0.01), b), obj("cube", (0.05, 0.05, 0.05), (0, 0, -0.11), a)], "schwert", (0.3, 0.7, 0.2))
    # Axt kopfueber, Blatt einseitig
    a, b = fresh()
    export([obj("cube", (0.035, 0.035, 0.7), (0, 0, 0.35), b), obj("cube", (0.18, 0.02, 0.16), (0.1, 0, 0.62), a)], "axt", (math.pi, 0, 0.4))
    # Schild: Vorderseite (Buckel) zeigt zur Seite (+X statt nach vorn)
    a, b = fresh()
    export([obj("cube", (0.6, 0.06, 0.9), (0, 0, 0.45), b), obj("uv_sphere", (0.09, 0.09, 0.09), (0, -0.06, 0.45), a, segments=12, ring_count=8)],
           "schild", (0, 0, math.pi / 2))
    # Stab mit riesiger Kugel
    a, b = fresh()
    export([obj("cylinder", (0.03, 0.03, 0.8), (0, 0, 0.8), b, vertices=8), obj("uv_sphere", (0.35, 0.35, 0.35), (0, 0, 1.75), a, segments=16, ring_count=8)],
           "stab")
    # ausladender Baum und flacher Fels
    a, b = fresh()
    export([obj("cylinder", (0.2, 0.2, 1.0), (0, 0, 1.0), b, vertices=8), obj("uv_sphere", (2.5, 2.5, 1.0), (0, 0, 2.6), a, segments=16, ring_count=8)], "baum")
    a, b = fresh()
    export([obj("ico_sphere", (2.0, 1.2, 0.5), (0, 0, 0.4), a, subdivisions=2)], "fels")


def run(*args):
    r = subprocess.run([sys.executable, *[str(x) for x in args]], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("Fehler in %s:\n%s" % (args[0], r.stderr[-800:]))
    return r.stdout


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--modelle":
        build_models(sys.argv[2])
        return
    tmp = tempfile.mkdtemp(prefix="sb-pruef-")
    r = subprocess.run([sys.executable, os.path.abspath(__file__), "--modelle", tmp], capture_output=True, text=True)
    if r.returncode:
        raise SystemExit("Pruefmodelle nicht gebaut:\n" + r.stderr[-800:])
    fails = []

    def box(name):
        z = np.load(os.path.join(tmp, name + ".npz"))
        return z["pos"].min(0), z["pos"].max(0)

    def check(cond, msg):
        if not cond:
            fails.append(msg)

    W = os.path.join(HERE, "weapon.py")
    P = os.path.join(HERE, "prop.py")
    run(W, os.path.join(tmp, "schwert.npz"), os.path.join(tmp, "schwert.glb"), "--base", "schwert")
    lo, hi = box("schwert")
    check(abs(lo[1] + 0.135) < 0.05 and abs(hi[1] - 0.927) < 0.05, "Schwert: Griff oder Laenge falsch (Y %.2f..%.2f)" % (lo[1], hi[1]))
    check(hi[0] - lo[0] > 0.2 and hi[2] - lo[2] < 0.1, "Schwert: Parierstange nicht entlang X")
    run(W, os.path.join(tmp, "axt.npz"), os.path.join(tmp, "axt.glb"), "--base", "axt")
    lo, hi = box("axt")
    check(abs(lo[1] + 0.15) < 0.05 and abs(hi[1] - 0.594) < 0.05, "Axt: kopfueber oder falsche Laenge (Y %.2f..%.2f)" % (lo[1], hi[1]))
    check(hi[0] > 0.1 and hi[0] > 2 * -lo[0], "Axt: Blatt nicht nach +X (X %.2f..%.2f)" % (lo[0], hi[0]))
    run(W, os.path.join(tmp, "schild.npz"), os.path.join(tmp, "schild.glb"), "--base", "schild")
    lo, hi = box("schild")
    check(hi[2] - lo[2] < 0.35 * (hi[0] - lo[0]), "Schild: Vorderseite nicht nach vorn gedreht (X %.2f, Z %.2f breit)" % (hi[0] - lo[0], hi[2] - lo[2]))
    check(abs(hi[2] - 0.041) < 0.02, "Schild: Buckel nicht vorn (Z bis %.3f)" % hi[2])
    run(W, os.path.join(tmp, "stab.npz"), os.path.join(tmp, "stab.glb"), "--base", "stab")
    lo, hi = box("stab")
    check(max(hi[0] - lo[0], hi[2] - lo[2]) <= 0.351, "Stab: zu breit (%.2f m)" % max(hi[0] - lo[0], hi[2] - lo[2]))
    check(hi[1] > 0 and lo[1] < 0, "Stab: Griff nicht am Schaft")
    run(P, os.path.join(tmp, "baum.npz"), os.path.join(tmp, "baum.glb"), "--realm", "midgard", "--rolle", "baum")
    lo, hi = box("baum")
    check(max(hi[0] - lo[0], hi[2] - lo[2]) <= 3.61 and abs(lo[1]) < 0.01, "Baum: zu breit oder nicht auf dem Boden")
    run(P, os.path.join(tmp, "fels.npz"), os.path.join(tmp, "fels.glb"), "--realm", "midgard", "--rolle", "wahrzeichen")
    lo, hi = box("fels")
    check(max(hi[0] - lo[0], hi[2] - lo[2]) <= 2.61, "Fels: zu breit")
    if fails:
        print("FEHLER:\n- " + "\n- ".join(fails))
        sys.exit(1)
    print("OK: Waffen und Requisiten liegen richtig (Schwert, Axt, Schild, Stab, Baum, Fels)")


if __name__ == "__main__":
    main()
