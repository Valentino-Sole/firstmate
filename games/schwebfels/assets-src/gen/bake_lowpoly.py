"""Schlanke Spielfassung eines erzeugten Modells: wenige Flaechen, saubere Texturaufteilung, Farbe und Oberflaechen-
details vom hochaufgeloesten Original aufgebacken (statt das Original zu verkleinern, was an den vielen Texturnaehten
der Dienste Risse und verschmierte Farben erzeugt).

Aufruf: python bake_lowpoly.py <original.glb> <aus.glb> [flaechen=30000] [textur=1024]
Ausgabe: GLB mit Grundfarbe und Normalenbild (glTF: +Z vorne, gleiche Lage und Groesse wie das Original),
daneben <aus>_farbe.png und <aus>_normal.png.
"""
import os
import sys
import bpy
import bmesh

SRC, OUT = sys.argv[1], sys.argv[2]
FACES = int(sys.argv[3]) if len(sys.argv) > 3 else 30000
TEX = int(sys.argv[4]) if len(sys.argv) > 4 else 1024
base = os.path.splitext(OUT)[0]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
high = max(meshes, key=lambda o: len(o.data.polygons))
for o in bpy.context.scene.objects:
    if o is not high and o.type == "MESH":
        bpy.data.objects.remove(o, do_unlink=True)
mw = high.matrix_world.copy()
high.parent = None
high.data.transform(mw)
high.matrix_world.identity()
print("Original", len(high.data.polygons), "Flaechen")

# Spielfassung: verschweisst (geschlossene Flaeche), verkleinert, neue Texturaufteilung
low = high.copy()
low.data = high.data.copy()
low.name = "spiel"
bpy.context.scene.collection.objects.link(low)
bm = bmesh.new()
bm.from_mesh(low.data)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.to_mesh(low.data)
bm.free()
bpy.context.view_layer.objects.active = low
d = low.modifiers.new("reduz", "DECIMATE")
d.ratio = min(1.0, FACES / len(low.data.polygons))
d.use_collapse_triangulate = True
bpy.ops.object.modifier_apply(modifier="reduz")
while low.data.uv_layers:
    low.data.uv_layers.remove(low.data.uv_layers[0])
low.data.uv_layers.new(name="UV")
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.context.view_layer.objects.active = low
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=1.4, island_margin=0.002, area_weight=0.0, correct_aspect=True)
bpy.ops.object.mode_set(mode="OBJECT")
# Kopf bekommt mehr Bildflaeche (Gesicht, Bemalung, Augen): Inseln oberhalb der Schultern vergroessern, dann packen
bm = bmesh.new()
bm.from_mesh(low.data)
uvl = bm.loops.layers.uv.active
bm.faces.ensure_lookup_table()
zs = [v.co.z for v in bm.verts]
z0, z1 = min(zs), max(zs)
parent = list(range(len(bm.faces)))


def find(i):
    while parent[i] != i:
        parent[i] = parent[parent[i]]
        i = parent[i]
    return i


for e in bm.edges:
    lf = e.link_loops
    if len(lf) != 2:
        continue
    la, lb = lf
    # gleiche Insel, wenn die Kante auf beiden Seiten dieselben Texturkoordinaten hat
    a1, a2 = la[uvl].uv, la.link_loop_next[uvl].uv
    b1, b2 = lb[uvl].uv, lb.link_loop_next[uvl].uv
    if (a1 - b2).length < 1e-6 and (a2 - b1).length < 1e-6:
        ra, rb = find(la.face.index), find(lb.face.index)
        if ra != rb:
            parent[ra] = rb
isl = {}
for f in bm.faces:
    isl.setdefault(find(f.index), []).append(f)
HEAD = float(os.environ.get("KOPF_FAKTOR", "2.4"))
big = 0
for faces in isl.values():
    cz = sum(f.calc_center_median().z for f in faces) / len(faces)
    if cz > z0 + 0.84 * (z1 - z0):
        loops = [l for f in faces for l in f.loops]
        cu = sum(l[uvl].uv.x for l in loops) / len(loops)
        cv = sum(l[uvl].uv.y for l in loops) / len(loops)
        for l in loops:
            l[uvl].uv.x = cu + (l[uvl].uv.x - cu) * HEAD
            l[uvl].uv.y = cv + (l[uvl].uv.y - cv) * HEAD
        big += 1
bm.to_mesh(low.data)
bm.free()
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(rotate=True, margin=0.002)
bpy.ops.object.mode_set(mode="OBJECT")
print("Inseln", len(isl), "davon Kopf vergroessert", big)
print("Spielfassung", len(low.data.polygons), "Flaechen")

# Bildziele und Material der Spielfassung
img_c = bpy.data.images.new("farbe", TEX, TEX, alpha=False)
img_n = bpy.data.images.new("normal", TEX, TEX, alpha=False)
img_n.colorspace_settings.name = "Non-Color"
mat = bpy.data.materials.new("spiel")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
tc = nt.nodes.new("ShaderNodeTexImage")
tc.image = img_c
tn = nt.nodes.new("ShaderNodeTexImage")
tn.image = img_n
nm = nt.nodes.new("ShaderNodeNormalMap")
low.data.materials.clear()
low.data.materials.append(mat)

sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = 4
bk = sc.render.bake
bk.use_selected_to_active = True
h = max(v.co.z for v in high.data.vertices) - min(v.co.z for v in high.data.vertices)
bk.cage_extrusion = 0.008 * h
bk.max_ray_distance = 0.03 * h
bk.margin = 6


def bake(kind, node, **kw):
    for n in nt.nodes:
        n.select = False
    node.select = True
    nt.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type=kind, **kw)


bake("DIFFUSE", tc, pass_filter={"COLOR"})
img_c.filepath_raw = base + "_farbe.png"
img_c.file_format = "PNG"
img_c.save()
bake("NORMAL", tn, normal_space="TANGENT")
img_n.filepath_raw = base + "_normal.png"
img_n.file_format = "PNG"
img_n.save()
print("gebacken", img_c.filepath_raw, img_n.filepath_raw)

# Material fuer den Export verdrahten und nur die Spielfassung speichern
nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
bsdf.inputs["Roughness"].default_value = 0.8
bpy.data.objects.remove(high, do_unlink=True)
bpy.ops.object.select_all(action="DESELECT")
low.select_set(True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_image_format="JPEG", export_jpeg_quality=90)
print("gespeichert", OUT)
