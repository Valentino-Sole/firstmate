"""Helden von Schwebfels: Blender-Helfer fuer den Asset-Bau (bpy, ohne Oberflaeche)."""
import math
import bpy
import bmesh
import numpy as np


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 24
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = "AgX - Medium High Contrast"
    return sc


def mesh_object(name, verts, faces, uvs=None, uv_faces=None, smooth=True):
    """verts: (N,3); faces: Liste von Index-Listen; uvs: (M,2); uv_faces: parallele Liste von UV-Indexlisten."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in verts], [], [list(f) for f in faces])
    if uvs is not None and uv_faces is not None:
        uvl = me.uv_layers.new(name="UV")
        k = 0
        for poly, uf in zip(me.polygons, uv_faces):
            for li, ui in zip(poly.loop_indices, uf):
                uvl.data[li].uv = (uvs[ui][0], uvs[ui][1])
            k += 1
    me.update()
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def material(name, color=(0.8, 0.8, 0.8), rough=0.6, metal=0.0, sss=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.2)
        b.inputs["Subsurface Scale"].default_value = 0.05
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 2.0
    return m


def look_at(ob, target):
    from mathutils import Vector
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def studio(target=(0, 0, 1.0), dist=4.0, height=1.2, lens=60, yaw=0.0, w=640, h=800, bg=(0.82, 0.8, 0.76)):
    sc = bpy.context.scene
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    cam.data.lens = lens
    cam.location = (math.sin(yaw) * dist, -math.cos(yaw) * dist, height)
    look_at(cam, target)
    sc.camera = cam
    for nm, loc, e, col in (("key", (3, -4, 5), 900, (1, 0.96, 0.9)), ("fill", (-4, -2, 2.5), 250, (0.8, 0.88, 1)), ("rim", (0, 5, 4), 700, (1, 1, 1))):
        L = bpy.data.objects.new(nm, bpy.data.lights.new(nm, "AREA"))
        L.data.energy = e
        L.data.size = 3
        L.data.color = col
        L.location = loc
        look_at(L, target)
        sc.collection.objects.link(L)
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (*bg, 1)
    world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
    sc.world = world
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    return cam


def render(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def evaluated_arrays(ob):
    """Gibt Positionen, Dreiecke und Loop-UVs des ausgewerteten Objekts zurueck."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    n = len(me.vertices)
    co = np.zeros(n * 3)
    me.vertices.foreach_get("co", co)
    tri = np.zeros(len(me.loop_triangles) * 3, dtype=np.int64)
    me.loop_triangles.foreach_get("vertices", tri)
    ev.to_mesh_clear()
    return co.reshape(-1, 3), tri.reshape(-1, 3)
