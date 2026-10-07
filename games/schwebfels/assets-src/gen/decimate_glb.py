"""GLB verkleinern (kostenlos statt Meshy-Remesh): Flaechen reduzieren, Texturen verkleinern, wieder als GLB speichern.

Aufruf: python decimate_glb.py <ein.glb> <aus.glb> [flaechen=60000] [textur=1024]
Blickrichtung und Massstab bleiben wie im Original (glTF: +Z vorne), Texturkoordinaten bleiben erhalten.
"""
import sys
import bpy
import bmesh

SRC, OUT = sys.argv[1], sys.argv[2]
FACES = int(sys.argv[3]) if len(sys.argv) > 3 else 60000
TEX = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in bpy.context.scene.objects:
    if o.type != "MESH":
        continue
    n = len(o.data.polygons)
    if n > FACES:
        # Ecken verschweissen (die Flaeche bleibt geschlossen, keine Risse), Texturnaehte als Gruppe schuetzen
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        uvl = bm.loops.layers.uv.active
        seam = set()
        if uvl is not None:
            for v in bm.verts:
                uvs = {(round(l[uvl].uv.x, 5), round(l[uvl].uv.y, 5)) for l in v.link_loops}
                if len(uvs) > 1:
                    seam.add(v.index)
        bm.to_mesh(o.data)
        bm.free()
        g = o.vertex_groups.new(name="naht")
        g.add(list(seam), 1.0, "REPLACE")
        bpy.context.view_layer.objects.active = o
        d = o.modifiers.new("reduz", "DECIMATE")
        d.ratio = FACES / n
        d.use_collapse_triangulate = True
        d.vertex_group = "naht"
        d.invert_vertex_group = True
        d.vertex_group_factor = 10.0
        bpy.ops.object.modifier_apply(modifier="reduz")
        if o.vertex_groups.get("naht"):
            o.vertex_groups.remove(o.vertex_groups["naht"])
        print("Naehte geschuetzt:", len(seam), "Ecken")
    print("Netz", o.name, n, "->", len(o.data.polygons), "Flaechen")
for im in bpy.data.images:
    if im.size[0] > TEX:
        im.scale(TEX, TEX)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_image_format="JPEG", export_jpeg_quality=88)
print("gespeichert", OUT)
