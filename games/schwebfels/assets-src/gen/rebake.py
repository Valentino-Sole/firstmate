"""Feste Modelle (Ruestungsteile, Waffen) mit neuer Texturaufteilung: Farbe vom Original aufgebacken.

Meshy zerlegt die Farbtextur in hunderte kleine Inseln. Verkleinert man sie fuer das Spiel (2048 auf 512 Pixel),
laufen die Inselraender ineinander: helle und dunkle Flecken, ausgefranste Kanten. Hier bekommt das Modell nach dem
Verschweissen und Reduzieren wenige grosse Inseln (Blender "Smart UV Project") und die Farbe wird vom Original mit
voller Aufloesung aufgebacken (Cycles, ausgewaehlt auf aktiv). Gleiches Verfahren wie assets-src/handy.py fuer die
Heldenkoerper, nur ohne Knochen.

Aufruf aus fit_piece.py und weapon.py: rebake(pos, uv, idx, bild, ziel_dreiecke, groesse) -> pos, uv, idx, farbe
"""
import os
import tempfile

import numpy as np


def fill_misses(px, hit, steps=24):
    """Texel ohne Treffer von getroffenen Nachbarn auffuellen, Schritt fuer Schritt nach aussen."""
    filled = hit.copy()
    for _ in range(steps):
        if filled.all():
            break
        acc = np.zeros_like(px)
        cnt = np.zeros(hit.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            m = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.roll(np.roll(px, dy, 0), dx, 1) * m[..., None]
            cnt += m
        grow = (~filled) & (cnt > 0)
        px[grow] = acc[grow] / cnt[grow][:, None]
        filled |= grow
    return px


def rebake(pos, uv, idx, image, target, size):
    """pos (n,3), uv (n,2) im Spielsinn (v nach oben, wie Blender und "uv_game" aus meshy_import.atlas), idx (m,3),
    image: PIL-Bild der Originalfarbe in voller Groesse (oben im Bild ist oben), target: hoechstens so viele Dreiecke,
    size: Kantenlaenge der neuen Textur. Liefert Ecken, Texturkoordinaten (Spielsinn), Dreiecke und das Farbbild als
    uint8-Feld (size, size, 3)."""
    import bpy

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    # Original mit seinem Farbbild
    me = bpy.data.meshes.new("original")
    me.from_pydata(pos.tolist(), [], idx.tolist())
    me.update()
    me.uv_layers.new(name="uv").data.foreach_set("uv", uv[idx].reshape(-1).astype(np.float32))
    hi = bpy.data.objects.new("original", me)
    sc.collection.objects.link(hi)
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp.close()
    image.convert("RGB").save(tmp.name)
    m0 = bpy.data.materials.new("original")
    m0.use_nodes = True
    t0 = m0.node_tree.nodes.new("ShaderNodeTexImage")
    t0.image = bpy.data.images.load(tmp.name)
    m0.node_tree.links.new(t0.outputs["Color"], m0.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    me.materials.append(m0)

    # Spielfassung: verschweisst (Meshys Texturnaehte trennen sonst das Netz) und reduziert
    key = np.round(pos / 1e-5).astype(np.int64)
    _, weld, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    F = inv[idx]
    F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    me2 = bpy.data.meshes.new("spiel")
    me2.from_pydata(pos[weld].tolist(), [], F.tolist())
    me2.update()
    lo = bpy.data.objects.new("spiel", me2)
    sc.collection.objects.link(lo)
    vl.objects.active = lo
    lo.select_set(True)
    if len(F) > target:
        mod = lo.modifiers.new("reduz", "DECIMATE")
        mod.ratio = target / len(F)
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier="reduz")

    # neue Texturaufteilung: wenige grosse Inseln
    me2.uv_layers.new(name="UV")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.006, area_weight=0.0, correct_aspect=True)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=0.006)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Farbe aufbacken
    img = bpy.data.images.new("farbe", size, size, alpha=True)
    img.pixels[:] = np.zeros(size * size * 4, np.float32)
    m1 = bpy.data.materials.new("spiel")
    m1.use_nodes = True
    t1 = m1.node_tree.nodes.new("ShaderNodeTexImage")
    t1.image = img
    for n in m1.node_tree.nodes:
        n.select = False
    t1.select = True
    m1.node_tree.nodes.active = t1
    me2.materials.clear()
    me2.materials.append(m1)
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 4
    bk = sc.render.bake
    bk.use_selected_to_active = True
    h = float(np.ptp(pos, axis=0).max())
    bk.cage_extrusion = 0.01 * h
    bk.max_ray_distance = 0.03 * h
    bk.margin = 6
    bpy.ops.object.select_all(action="DESELECT")
    hi.select_set(True)
    lo.select_set(True)
    vl.objects.active = lo
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
    px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    px = fill_misses(px, px[..., 3] > 0.5)
    rgb = np.clip(np.flipud(px[..., :3]) * 255 + 0.5, 0, 255).astype(np.uint8)
    os.unlink(tmp.name)

    # Ecken je Texturkoordinate trennen
    me2.calc_loop_triangles()
    uvl = me2.uv_layers.active.data
    seen, P2, UV2, I2 = {}, [], [], []
    for t in me2.loop_triangles:
        tri = []
        for li, vi in zip(t.loops, t.vertices):
            u = tuple(np.round(uvl[li].uv[:], 6))
            k = (vi, u)
            if k not in seen:
                seen[k] = len(P2)
                P2.append(me2.vertices[vi].co[:])
                UV2.append(u)
            tri.append(seen[k])
        I2.append(tri)
    return np.array(P2, np.float64), np.array(UV2, np.float64), np.array(I2, np.int64), rgb
