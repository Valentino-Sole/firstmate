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
import meshy_import as M  # noqa: E402
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
    # Hals und Kopf: vorderster Teil oberhalb der Pfoten (bei geduckten Tieren wie dem Schlund reichen die Krallen so
    # weit nach vorn wie das Maul, und das Maul sitzt fast ueber den Vorderbeinen); Hals und Kopf zeigen immer nach vorn
    up = P[P[:, 1] > 0.3 * H]
    zt = up[:, 2].max() if len(up) else z1
    front = up[up[:, 2] > zt - 0.12 * L] if len(up) else P[P[:, 2] > chestZ + 0.55 * (z1 - chestZ)]
    head_c = front.mean(0) if len(front) else np.array([0, cy, z1 - 0.1 * L])
    neck_z = chestZ + 0.35 * (zt - chestZ)
    head_z = max(head_c[2] - 0.05 * L, neck_z + 0.04 * L)
    neck_p = (0, (cy + head_c[1]) / 2 + 0.05 * H, neck_z)
    chest = add("chest", spine, sp[2], neck_p, "spine")
    neck = add("neck", chest, neck_p, (0, head_c[1], head_z), "spine")
    add("head", neck, (0, head_c[1], head_z), (0, head_c[1], max(zt, head_z + 0.05 * L)), "head")
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


def kmeans(X, k, it=40, seed=1):
    rng = np.random.default_rng(seed)
    C = X[rng.choice(len(X), k, replace=False)]
    for _ in range(it):
        d = ((X[:, None, :] - C[None]) ** 2).sum(2)
        lab = d.argmin(1)
        for j in range(k):
            if (lab == j).any():
                C[j] = X[lab == j].mean(0)
    return C, lab


def rig_radial(P, H, n, claws=0):
    """Spinnen und Krebse: Rumpf (Hinterleib, Brust, Kopf vorn bei +Z) und n Beine, die vom Rumpf zu den Fuessen am
    Boden laufen (Fuesse per k-Mittel aus den Bodenpunkten). Knie ist der hoechste Punkt des Beins (Spinnenbeine ragen
    ueber den Rumpf), danach Unterschenkel und Fussglied. Die claws vordersten Beine heissen Scheren (Rolle claw.*)."""
    L = np.ptp(P[:, 2])
    feet = P[P[:, 1] < 0.07 * H]
    if len(feet) < n * 5:
        feet = P[P[:, 1] < 0.15 * H]
    C, lab = kmeans(feet[:, [0, 2]].astype(np.float64), n)
    body = P[P[:, 1] > 0.3 * H]
    c = np.array([np.median(body[:, 0]), np.median(body[:, 2])])
    z0, z1 = body[:, 2].min(), body[:, 2].max()
    by = float(np.median(body[:, 1]))
    # Rumpfradius: Knie nur ausserhalb davon suchen, sonst greift der hohe Hinterleib als Knie
    rb = float(np.percentile(np.hypot(body[:, 0] - c[0], body[:, 2] - c[1]), 60))
    bones = []

    def add(name, parent, head, tail_, role):
        bones.append([name, parent, [float(x) for x in head], [float(x) for x in tail_], role])
        return len(bones) - 1
    hips = add("hips", -1, (c[0], by, z0 + 0.25 * (z1 - z0)), (c[0], by, c[1]), "spine")
    chest = add("chest", hips, (c[0], by, c[1]), (c[0], by, z1 - 0.12 * (z1 - z0)), "spine")
    front = P[P[:, 2] > z1 - 0.15 * (z1 - z0)]
    hy = float(np.median(front[:, 1])) if len(front) else by
    add("head", chest, (c[0], hy, z1 - 0.12 * (z1 - z0)), (c[0], hy, z1), "head")
    # Beine: nach Winkel ordnen, die vordersten claws Beine sind Scheren
    ang = np.arctan2(C[:, 0] - c[0], C[:, 1] - c[1])
    order = np.argsort(np.abs(ang))
    claw_set = set(order[:claws].tolist())
    names = {}
    for side in (1, -1):
        idx = [j for j in range(n) if np.sign(C[j, 0] - c[0]) == side or (C[j, 0] == c[0] and side == 1)]
        idx.sort(key=lambda j: -C[j, 1])
        for r, j in enumerate(idx):
            names[j] = ("L" if side > 0 else "R") + str(r + 1)
    for j in range(n):
        f = np.array([C[j, 0], 0.01 * H, C[j, 1]])
        dxz = C[j] - c
        dist = float(np.linalg.norm(dxz))
        d = dxz / max(dist, 1e-6)
        rel = P[:, [0, 2]] - c
        along = rel @ d
        perp = np.abs(rel[:, 0] * d[1] - rel[:, 1] * d[0])
        sec = (perp < 0.08 * L) & (along > max(0.25 * dist, min(rb, 0.6 * dist))) & (along < 0.75 * dist)
        if sec.any():
            q = P[sec]
            kk = q[q[:, 1].argmax()]
            knee = np.array([kk[0], kk[1], kk[2]])
        else:
            knee = np.array([c[0] + d[0] * 0.5 * dist, 0.7 * H, c[1] + d[1] * 0.5 * dist])
        root = np.array([c[0] + d[0] * 0.18 * dist, by - 0.05 * H, c[1] + d[1] * 0.18 * dist])
        ankle = np.array([c[0] + d[0] * 0.88 * dist, 0.2 * H, c[1] + d[1] * 0.88 * dist])
        sec2 = (perp < 0.06 * L) & (along > 0.8 * dist) & (along < 0.95 * dist)
        if sec2.any():
            ankle[1] = float(np.median(P[sec2][:, 1]))
        nm = names[j]
        role = ("claw." if j in claw_set else "rleg.") + nm
        par = chest
        for i, (a, b) in enumerate(((root, knee), (knee, ankle), (ankle, f))):
            par = add("leg%s%d" % (nm, i + 1), par, a, b, role)
    return bones


def rig_wings(P, H, bones, z_c, y_c):
    """Fluegel an einen vorhandenen Rumpf haengen: je Seite zwei Glieder von der Schulter zur Fluegelmitte und zur
    Spitze (weitester Punkt oberhalb des Rumpfs auf dieser Seite)."""
    def add(name, parent, head, tail_, role):
        bones.append([name, parent, [float(x) for x in head], [float(x) for x in tail_], role])
        return len(bones) - 1
    by = {b[0]: i for i, b in enumerate(bones)}
    par0 = by.get("chest", by.get("spine", 0))
    body = P[(P[:, 1] > 0.3 * H) & (np.abs(P[:, 2] - z_c) < 0.15 * np.ptp(P[:, 2]))]
    hw = float(np.percentile(np.abs(body[:, 0]), 60)) if len(body) else 0.2
    for sd, sx in (("L", 1), ("R", -1)):
        w = P[(P[:, 0] * sx > hw * 1.4) & (P[:, 1] > y_c - 0.05 * H)]
        if len(w) < 30:
            continue
        rr = np.hypot(w[:, 0], w[:, 1] - y_c)
        tip = w[rr.argmax()]
        root = np.array([sx * hw * 0.8, y_c + 0.05 * H, z_c])
        mid = (root + tip) / 2
        near = w[np.linalg.norm(w - mid, axis=1) < 0.15 * H]
        if len(near):
            mid = np.array([mid[0], float(near[:, 1].max()), mid[2]])
        p = add("wing%s1" % sd, par0, root, mid, "wing." + sd)
        add("wing%s2" % sd, p, mid, tip, "wing." + sd)
    return bones


def rig_flyer(P, H):
    """Fliegende Bestie (Aasflatterer): Rumpf entlang Z, Kopf vorn, Fluegel seitlich, kurze Beine unten."""
    z0, z1 = P[:, 2].min(), P[:, 2].max()
    core = P[np.abs(P[:, 0]) < 0.12 * np.ptp(P[:, 0])]
    cy = float(np.median(core[:, 1])) if len(core) else 0.5 * H
    cz = float(np.median(core[:, 2])) if len(core) else 0.0
    bones = []

    def add(name, parent, head, tail_, role):
        bones.append([name, parent, [float(x) for x in head], [float(x) for x in tail_], role])
        return len(bones) - 1
    hips = add("hips", -1, (0, cy - 0.1 * H, cz - 0.1 * (z1 - z0)), (0, cy, cz), "spine")
    chest = add("chest", hips, (0, cy, cz), (0, cy + 0.05 * H, cz + 0.15 * (z1 - z0)), "spine")
    fr = core[core[:, 2] > np.percentile(core[:, 2], 85)] if len(core) else P
    hy = float(np.median(fr[:, 1]))
    add("head", chest, (0, cy + 0.05 * H, cz + 0.15 * (z1 - z0)), (0, hy, z1), "head")
    rig_wings(P, H, bones, cz, cy)
    low = core[core[:, 1] < np.percentile(core[:, 1], 10)] if len(core) else P
    for sd, sx in (("BL", 1), ("BR", -1)):
        a = (sx * 0.04, cy - 0.12 * H, cz - 0.05 * (z1 - z0))
        b = (sx * 0.05, float(low[:, 1].min()) + 0.02, float(np.median(low[:, 2])))
        add("leg%s1" % sd, hips, a, b, "foot." + sd)
    return bones


def rig_hover(P, H):
    """Schwebendes Wesen ohne Beine und Fluegel (Ertrunkene Glocke): Rumpf und Kopf entlang der Hoehe; es gleitet im
    Spiel knapp ueber dem Boden und neigt sich, Ketten und Geisterarme schwingen mit dem Rumpf."""
    xs = P[:, 0]
    core = P[np.abs(xs - np.median(xs)) < 0.2 * np.ptp(xs)]
    cx, cz = float(np.median(core[:, 0])), float(np.median(core[:, 2]))
    bones = []

    def add(name, parent, head, tail_, role):
        bones.append([name, parent, [float(x) for x in head], [float(x) for x in tail_], role])
        return len(bones) - 1
    hips = add("hips", -1, (cx, 0.05 * H, cz), (cx, 0.4 * H, cz), "spine")
    chest = add("chest", hips, (cx, 0.4 * H, cz), (cx, 0.7 * H, cz), "spine")
    add("head", chest, (cx, 0.7 * H, cz), (cx, H, cz + 0.05 * H), "head")
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
    # immer vier Einfluesse je Ecke (das Spiel liest vier), auch bei weniger Knochen (schweber hat drei)
    nb = W.shape[1]
    if nb < 4:
        W = np.pad(W, ((0, 0), (0, 4 - nb)))
    order = np.argsort(-W, axis=1)[:, :4]
    w4 = np.take_along_axis(W, order, axis=1)
    order[order >= nb] = 0
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
    ap.add_argument("--form", default="vierbeiner", choices=["vierbeiner", "spinne", "krebs", "drache", "flieger", "schweber"],
                    help="Skelettform: vierbeiner (Wolf, Schlund), spinne (8 Beine), krebs (8 Beine und 2 Scheren), drache (Vierbeiner mit Fluegeln), flieger (Fledermaus), schweber (ohne Beine und Fluegel)")
    ap.add_argument("--beine", type=int, help="Zahl der Beine bei spinne und krebs (sonst 8 bzw. 10)")
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
    if a.form == "spinne":
        bones = rig_radial(P, a.height, a.beine or 8)
    elif a.form == "krebs":
        bones = rig_radial(P, a.height, a.beine or 10, claws=2)
    elif a.form == "schweber":
        bones = rig_hover(P, a.height)
    elif a.form == "flieger":
        bones = rig_flyer(P, a.height)
    else:
        bones = rig_for(P, a.height, not a.kein_schwanz)
        if a.form == "drache":
            ch = [b for b in bones if b[0] == "chest"][0]
            rig_wings(P, a.height, bones, ch[2][2], ch[2][1])
    si, sw, miss = weights(P, F, bones)
    N = smooth_normals(P, F)
    head = [b for b in bones if b[4] == "head"][0]
    meta = {"form": a.form, "family": a.family, "archs": [x for x in a.archs.split(",") if x], "height": float(P[:, 1].max()), "headY": float(head[2][1]),
            "length": float(np.ptp(P[:, 2])), "groups": [[0, 0, int(len(F)) * 3]], "mats": ["skin"], "matNames": ["skin"], "features": {},
            "bones": bones, "textured": True}
    col = np.tile(np.array([255, 0, 0, 255], np.uint8), (len(P), 1))
    np.savez_compressed(a.out, **M.normal_extra(g, tex), pos=P.astype(np.float32), nrm=N.astype(np.float32), uv=UV.astype(np.float32), idx=F.astype(np.int32), col=col,
                        skinI=si, skinW=sw, tex=tex.astype(np.uint8), meta=json.dumps(meta))
    print("Bestie", a.family, len(P), "Ecken,", len(F), "Dreiecke,", len(bones), "Knochen", "(%d Ecken ohne Bone-Heat-Gewicht)" % miss if miss else "", a.out)


if __name__ == "__main__":
    main()
