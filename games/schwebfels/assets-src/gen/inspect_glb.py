"""Inhalt einer GLB-Datei auflisten: Netze, Dreiecke, Materialien, Bilder, Knochen mit Ruhelage."""
import sys, bpy
src = sys.argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        me = o.data
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        bb = [o.matrix_world @ v.co for v in me.vertices]
        ys = [p.y for p in bb]; zs = [p.z for p in bb]; xs = [p.x for p in bb]
        print("MESH", o.name, "verts", len(me.vertices), "tris", tris, "uv", len(me.uv_layers), "mats", [m.name for m in me.materials],
              "bbox x", round(min(xs), 3), round(max(xs), 3), "y", round(min(ys), 3), round(max(ys), 3), "z", round(min(zs), 3), round(max(zs), 3),
              "groups", len(o.vertex_groups))
    elif o.type == "ARMATURE":
        print("ARMATURE", o.name, len(o.data.bones), "bones")
        for b in o.data.bones:
            h = o.matrix_world @ b.head_local
            print("  BONE", b.name, "parent", b.parent.name if b.parent else "-", "head", [round(c, 3) for c in h])
for im in bpy.data.images:
    print("IMAGE", im.name, im.size[0], im.size[1])
