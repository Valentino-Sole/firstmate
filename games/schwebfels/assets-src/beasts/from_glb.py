"""Bestie aus einer fertigen GLB (z. B. Meshy Bild zu 3D, ohne Skelett) fuer das Bestiensystem des Spiels.

Aufruf: python beasts/from_glb.py <ausgabe.npz> <tier.glb> --family wolf --archs wolf [--height 1.15] [--turn 0]
                                  [--tris 9000] [--tex 1024] [--kein-schwanz]

Meshy riggt per API nur Zweibeiner und hat keine Tierbewegungen. Deshalb bekommt das Tier hier ein Vierbeiner-
Skelett mit den Rollen des Spiels (Wirbelsaeule, Kopf, Schwanz, vier Beine mit je drei Gliedern), die Gewichte
berechnet Blender (Bone Heat). Bewegt wird es wie die anderen Bestien im Code je Rolle (src/r3d-beasts.js), die
Textur bleibt erhalten. Erwartet ein stehendes Tier mit Blick nach +Z (Meshy-Standard), sonst --turn in Grad.
Ergebnis: npz fuer gen_pack.py (Unterordner "bestien"); --archs legt fest, welche Monsterarten es darstellt.
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "gen"))
import meshy as M  # noqa: E402
import fit_piece as FP  # noqa: E402


def load_parts(path):
    g = M.load(path)
    if any("skin" in n for n in g.nodes):
        return g, M.rest_mesh(g, M.skin_joints(g))
    return FP.static_parts(path)


def smooth_normals(P, F):
    N = np.zeros_like(P)
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    for k in range(3):
        np.add.at(N, F[:, k], fn)
    key = np.round(P / 1e-5).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    acc = np.zeros((inv.max() + 1, 3))
    np.add.at(acc, inv, N)
    N = acc[inv]
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)


def rig_for(P, H, tail=True):
    """Vierbeiner-Skelett aus der Form: Beine aus den vier unteren Saeulen, Wirbelsaeule darueber, Kopf vorn."""
    z0, z1 = P[:, 2].min(), P[:, 2].max()
    L = z1 - z0
    low = P[P[:, 1] < 0.25 * H]
    feet = P[P[:, 1] < 0.08 * H]
    if len(feet) < 20:
        feet = low
    zc = np.median(feet[:, 2])
    legs = {}
    for k, sx, front in (("FL", 1, True), ("FR", -1, True), ("BL", 1, False), ("BR", -1, False)):
        q = feet[(np.sign(feet[:, 0]) == sx) & ((feet[:, 2] >= zc) == front)]
        if not len(q):
            q = feet
        fx, fz = q[:, 0].mean(), q[:, 2].mean()
        legs[k] = (fx, fz)
    hipsZ = (legs["BL"][1] + legs["BR"][1]) / 2
    chestZ = (legs["FL"][1] + legs["FR"][1]) / 2

    def mid_y(zs):
        s = P[(np.abs(P[:, 2] - zs) < 0.06 * L) & (P[:, 1] > 0.35 * H)]
        if not len(s):
            return 0.65 * H
        return (s[:, 1].max() + s[:, 1].min()) / 2
    hy, cy = mid_y(hipsZ), mid_y(chestZ)
    bones = []

    def add(name, parent, head, tail_, role):
        bones.append([name, parent, [float(x) for x in head], [float(x) for x in tail_], role])
        return len(bones) - 1
    sp = [(0, hy, hipsZ), (0, (hy + cy) / 2, (hipsZ + chestZ) / 2), (0, cy, chestZ)]
    hips = add("hips", -1, sp[0], sp[1], "spine")
    spine = add("spine", hips, sp[1], sp[2], "spine")
    # Hals und Kopf: vorderster Bereich
    front = P[P[:, 2] > chestZ + 0.55 * (z1 - chestZ)]
    head_c = front.mean(0) if len(front) else np.array([0, cy, z1 - 0.1 * L])
    neck_p = (0, (cy + head_c[1]) / 2 + 0.05 * H, chestZ + 0.35 * (z1 - chestZ))
    chest = add("chest", spine, sp[2], neck_p, "spine")
    neck = add("neck", chest, neck_p, (0, head_c[1], head_c[2] - 0.05 * L), "spine")
    add("head", neck, (0, head_c[1], head_c[2] - 0.05 * L), (0, head_c[1], z1), "head")
    if tail:
        back = P[(P[:, 2] < hipsZ - 0.12 * L) & (P[:, 1] > 0.2 * H)]
        if len(back) > 0.01 * len(P):
            zs = np.linspace(hipsZ - 0.05 * L, back[:, 2].min() + 0.02 * L, 4)
            pts = [sp[0]]
            for z in zs[1:]:
                s = back[np.abs(back[:, 2] - z) < 0.05 * L]
                pts.append((0, s[:, 1].mean() if len(s) else pts[-1][1], z))
            par = hips
            for i in range(len(pts) - 1):
                par = add("tail%d" % (i + 1), par, pts[i], pts[i + 1], "tail")
    for k, (fx, fz) in legs.items():
        sgn = 1 if k[0] == "F" else -1
        top = (fx * 0.6, (cy if k[0] == "F" else hy) - 0.05 * H, fz - sgn * 0.02 * L)
        pts = [top, (fx * 0.85, 0.42 * H, fz - sgn * 0.04 * L), (fx, 0.14 * H, fz + sgn * 0.01 * L), (fx, 0.02 * H, fz + 0.04 * L)]
        par = chest if k[0] == "F" else hips
        for i in range(3):
            par = add("leg%s%d" % (k, i + 1), par, pts[i], pts[i + 1], "leg." + k)
    return bones


def weights(P, F, bones):
    import bpy
    from mathutils import Vector
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Blender: Z oben
    to_b = lambda p: Vector((p[0], -p[2], p[1]))  # noqa: E731
    me = bpy.data.meshes.new("tier")
    key = np.round(P / 1e-5).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    V = P[first]
    me.from_pydata([tuple(to_b(p)) for p in V], [], inv[F].tolist())
    me.update()
    body = bpy.data.objects.new("tier", me)
    bpy.context.scene.collection.objects.link(body)
    arm_d = bpy.data.armatures.new("skelett")
    arm = bpy.data.objects.new("skelett", arm_d)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = []
    for b in bones:
        e = arm_d.edit_bones.new(b[0])
        e.head = to_b(b[2])
        e.tail = to_b(b[3])
        if (e.tail - e.head).length < 1e-3:
            e.tail = e.head + Vector((0, 0, 0.05))
        eb.append(e)
    for i, b in enumerate(bones):
        if b[1] >= 0:
            eb[i].parent = eb[b[1]]
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    names = [b[0] for b in bones]
    W = np.zeros((len(V), len(bones)))
    gi = {g.index: names.index(g.name) for g in body.vertex_groups if g.name in names}
    for v in me.vertices:
        for ge in v.groups:
            if ge.group in gi:
                W[v.index, gi[ge.group]] = ge.weight
    # Rueckfall: naechster Knochen fuer Ecken ohne Gewicht
    miss = np.nonzero(W.sum(1) < 1e-4)[0]
    if len(miss):
        H_ = np.array([b[2] for b in bones])
        T_ = np.array([b[3] for b in bones])
        for i in miss:
            p = V[i]
            d = T_ - H_
            t = np.clip(np.sum((p - H_) * d, 1) / np.maximum(np.sum(d * d, 1), 1e-9), 0, 1)
            W[i, np.argmin(np.linalg.norm(p - (H_ + d * t[:, None]), axis=1))] = 1.0
    W = W[inv]
    order = np.argsort(-W, axis=1)[:, :4]
    w4 = np.take_along_axis(W, order, axis=1)
    w4 /= np.maximum(w4.sum(1, keepdims=True), 1e-9)
    w8 = np.round(w4 * 255).astype(np.int32)
    w8[:, 0] += 255 - w8.sum(1)
    return order.astype(np.uint8), w8.astype(np.uint8), len(miss)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("glb")
    ap.add_argument("--family", required=True)
    ap.add_argument("--archs", default="")
    ap.add_argument("--height", type=float, default=1.15)
    ap.add_argument("--turn", type=float, default=0.0)
    ap.add_argument("--tris", type=int, default=9000)
    ap.add_argument("--tex", type=int, default=1024)
    ap.add_argument("--kein-schwanz", action="store_true")
    a = ap.parse_args()
    g, parts = load_parts(a.glb)
    tex = M.atlas(g, parts, a.tex)
    P = np.concatenate([p["pos"] for p in parts])
    UV = np.concatenate([p["uv_game"] for p in parts])
    base = np.cumsum([0] + [len(p["pos"]) for p in parts])[:-1]
    F = np.concatenate([p["idx"] + b for p, b in zip(parts, base)])
    # Ausrichten: Fuesse auf den Boden, Mitte unter den Ruecken, Blick +Z, Zielhoehe
    ang = np.radians(a.turn)
    Rm = np.array([[np.cos(ang), 0, np.sin(ang)], [0, 1, 0], [-np.sin(ang), 0, np.cos(ang)]])
    P = P @ Rm.T
    s = a.height / np.ptp(P[:, 1])
    c = np.array([(P[:, 0].max() + P[:, 0].min()) / 2, P[:, 1].min(), (P[:, 2].max() + P[:, 2].min()) / 2])
    P = (P - c) * s
    if len(F) > a.tris * 1.05:
        one = np.zeros((len(P), 1), np.int64)
        P, UV, F, _, _ = M.decimate(P, UV, F, one, np.ones((len(P), 1)), a.tris)
    bones = rig_for(P, a.height, not a.kein_schwanz)
    si, sw, miss = weights(P, F, bones)
    N = smooth_normals(P, F)
    head = [b for b in bones if b[4] == "head"][0]
    meta = {"family": a.family, "archs": [x for x in a.archs.split(",") if x], "height": float(P[:, 1].max()), "headY": float(head[2][1]),
            "length": float(np.ptp(P[:, 2])), "groups": [[0, 0, int(len(F)) * 3]], "mats": ["skin"], "matNames": ["skin"], "features": {},
            "bones": bones, "textured": True}
    col = np.tile(np.array([255, 0, 0, 255], np.uint8), (len(P), 1))
    np.savez_compressed(a.out, pos=P.astype(np.float32), nrm=N.astype(np.float32), uv=UV.astype(np.float32), idx=F.astype(np.int32), col=col,
                        skinI=si, skinW=sw, tex=tex.astype(np.uint8), meta=json.dumps(meta))
    print("Bestie", a.family, len(P), "Ecken,", len(F), "Dreiecke,", len(bones), "Knochen", "(%d Ecken ohne Bone-Heat-Gewicht)" % miss if miss else "", a.out)


if __name__ == "__main__":
    main()
