"""Schlanke Spielfassung eines erzeugten Modells: wenige Flaechen, saubere Texturaufteilung, Farbe und Oberflaechen-
details vom hochaufgeloesten Original aufgebacken (statt das Original zu verkleinern, was an den vielen Texturnaehten
der Dienste Risse und verschmierte Farben erzeugt).

Aufruf: python bake_lowpoly.py <original.glb> <aus.glb> [flaechen=30000] [textur=1024] [--low <spielfassung.glb>]
Ausgabe: GLB mit Grundfarbe und Normalenbild (glTF: +Z vorne, gleiche Lage und Groesse wie das Original),
daneben <aus>_farbe.png und <aus>_normal.png.
--low: nur neu backen, auf eine schon vorhandene Spielfassung mit ihrer Texturaufteilung (fuer bereits skelettierte
Figuren, deren Netz gleich bleiben muss).
Texel, die beim Backen nichts treffen, bekommen die Farbe ihrer Nachbarn (sonst schwarze Flecken, etwa an Fingern).
"""
import os
import sys
import bpy
import bmesh
import numpy as np

ARGS = sys.argv[1:]
LOW = None
if "--low" in ARGS:
    i = ARGS.index("--low")
    LOW = ARGS[i + 1]
    del ARGS[i:i + 2]
SRC, OUT = ARGS[0], ARGS[1]
FACES = int(ARGS[2]) if len(ARGS) > 2 else 30000
TEX = int(ARGS[3]) if len(ARGS) > 3 else 1024
base = os.path.splitext(OUT)[0]


def import_mesh(path):
    """Groesstes Netz einer GLB-Datei, in Weltlage und ohne Eltern; alles andere aus dieser Datei entfernen."""
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    keep = max(meshes, key=lambda o: len(o.data.polygons))
    mw = keep.matrix_world.copy()
    keep.parent = None
    keep.data.transform(mw)
    keep.matrix_world.identity()
    for o in new:
        if o is not keep:
            bpy.data.objects.remove(o, do_unlink=True)
    return keep


def make_low(high):
    """Spielfassung: verschweisst (geschlossene Flaeche), verkleinert, neue Texturaufteilung mit groesserem Kopf."""
    low = high.copy()
    low.data = high.data.copy()
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
    head = float(os.environ.get("KOPF_FAKTOR", "2.4"))
    big = 0
    for faces in isl.values():
        cz = sum(f.calc_center_median().z for f in faces) / len(faces)
        if cz > z0 + 0.84 * (z1 - z0):
            loops = [lp for f in faces for lp in f.loops]
            cu = sum(lp[uvl].uv.x for lp in loops) / len(loops)
            cv = sum(lp[uvl].uv.y for lp in loops) / len(loops)
            for lp in loops:
                lp[uvl].uv.x = cu + (lp[uvl].uv.x - cu) * head
                lp[uvl].uv.y = cv + (lp[uvl].uv.y - cv) * head
            big += 1
    bm.to_mesh(low.data)
    bm.free()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=0.002)
    bpy.ops.object.mode_set(mode="OBJECT")
    print("Inseln", len(isl), "davon Kopf vergroessert", big)
    return low


def fill_misses(img, hit):
    """Texel ohne Treffer (hit False) von getroffenen Nachbarn auffuellen, Schritt fuer Schritt nach aussen."""
    px = np.array(img.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)
    filled = hit.copy()
    for _ in range(16):
        if filled.all():
            break
        acc = np.zeros_like(px)
        cnt = np.zeros((TEX, TEX), np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            m = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.roll(np.roll(px, dy, 0), dx, 1) * m[..., None]
            cnt += m
        grow = (~filled) & (cnt > 0)
        px[grow] = acc[grow] / cnt[grow][:, None]
        filled |= grow
    img.pixels[:] = px.ravel()


bpy.ops.wm.read_factory_settings(use_empty=True)
high = import_mesh(SRC)
high.name = "original"
print("Original", len(high.data.polygons), "Flaechen")
if LOW:
    low = import_mesh(LOW)
    print("Spielfassung uebernommen", len(low.data.polygons), "Flaechen")
else:
    low = make_low(high)
low.name = "spiel"
print("Spielfassung", len(low.data.polygons), "Flaechen")

# Bildziele und Material der Spielfassung
img_c = bpy.data.images.new("farbe", TEX, TEX, alpha=True)
img_n = bpy.data.images.new("normal", TEX, TEX, alpha=True)
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
# Strahlen starten etwas ausserhalb der Spielfassung und suchen nach innen; an Fingern und Knoecheln liegt das
# Original nach dem Verkleinern teils weiter draussen, deshalb grosszuegig
bk.cage_extrusion = float(os.environ.get("BAKE_KAEFIG", "0.015")) * h
bk.max_ray_distance = float(os.environ.get("BAKE_STRAHL", "0.05")) * h
bk.margin = 6


def bake(kind, node, img, **kw):
    # Bild vorher durchsichtig: was danach noch durchsichtig ist, hat der Strahl nicht getroffen
    img.pixels[:] = np.zeros(TEX * TEX * 4, np.float32)
    for n in nt.nodes:
        n.select = False
    node.select = True
    nt.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.object.bake(type=kind, **kw)
    return np.array(img.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)[..., 3] > 0.5


def save(img, path):
    px = np.array(img.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)
    px[..., 3] = 1.0
    img.pixels[:] = px.ravel()
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()


hit = bake("DIFFUSE", tc, img_c, pass_filter={"COLOR"})
miss = int((~hit).sum())
fill_misses(img_c, hit)
save(img_c, base + "_farbe.png")
hit_n = bake("NORMAL", tn, img_n, normal_space="TANGENT")
fill_misses(img_n, hit_n)
save(img_n, base + "_normal.png")
print("gebacken", img_c.filepath_raw, img_n.filepath_raw, "ohne Treffer aufgefuellt:", miss, "Texel")

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
