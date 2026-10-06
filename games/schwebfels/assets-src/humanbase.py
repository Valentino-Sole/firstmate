"""Gemeinsame Daten des Grundkoerpers fuer Kleidung und Ausruestung (feine Aufloesung, Spielmassstab).

base: (N,3) Ecken des MakeHuman-Grundkoerpers (y oben, z vorne, Fuesse bei y=0, Hoehe 2,0).
quads: Flaechen des Koerpers. WF: Gewichte je vereinfachtem Knochen (wie im Spiel). J: Gelenke.
"""
import os
import json
import numpy as np
import mhlib

NB = 13380
BONES = ["hips", "spine", "chest", "neck", "head"]
for _s in ("L", "R"):
    BONES += [b + "." + _s for b in ("clavicle", "upperarm", "forearm", "hand", "thumb1", "thumb2", "fing1", "fing2", "thigh", "shin", "foot", "toe")]
BI = {n: i for i, n in enumerate(BONES)}

_v0, VT, _faces = mhlib.load_obj(os.path.join(mhlib.data_dir(), "3dobjs", "base.obj"))
base = _v0.copy()
base[:, 1] -= base[:NB, 1].min()
base *= 2.0 / base[:NB, 1].max()
quads = [f[0] for f in _faces if f[2] == "body"]
quad_uv = [f[1] for f in _faces if f[2] == "body"]


def load_lowbody(npz):
    h = np.load(npz)
    return h


def full_weights(npz_bones_order=None):
    """Gewichte des feinen Koerpers je Spielknochen (gleiche Zuordnung wie build_humans)."""
    import fnmatch
    skel = mhlib.load_skeleton()
    W = mhlib.load_weights()
    groups = [
        ("hips", ["root", "spine05", "pelvis.%s", "special03", "special04"]),
        ("spine", ["spine04", "spine03"]),
        ("chest", ["spine02", "spine01", "breast.%s"]),
        ("neck", ["neck01", "neck02", "neck03"]),
        ("head", ["head", "jaw", "special01", "special05.%s", "special06.%s", "eye.%s", "tongue*", "oculi*", "orbicularis*", "oris*", "levator*", "risorius*", "temporalis*"]),
    ]
    for s in ("L", "R"):
        groups += [
            ("clavicle." + s, ["clavicle." + s, "shoulder01." + s]),
            ("upperarm." + s, ["upperarm01." + s, "upperarm02." + s]),
            ("forearm." + s, ["lowerarm01." + s, "lowerarm02." + s]),
            ("hand." + s, ["wrist." + s] + ["metacarpal%d." % k + s for k in range(1, 5)]),
            ("thumb1." + s, ["finger1-1." + s, "finger1-2." + s]),
            ("thumb2." + s, ["finger1-3." + s]),
            ("fing1." + s, ["finger%d-1." % k + s for k in range(2, 6)]),
            ("fing2." + s, ["finger%d-%d." % (k, j) + s for k in range(2, 6) for j in (2, 3)]),
            ("thigh." + s, ["upperleg01." + s, "upperleg02." + s]),
            ("shin." + s, ["lowerleg01." + s, "lowerleg02." + s]),
            ("foot." + s, ["foot." + s]),
            ("toe." + s, ["toe%d-%d." % (k, j) + s for k in range(1, 6) for j in (1, 2, 3)]),
        ]
    names = list(skel["bones"].keys())
    bmap = {}
    for gname, members in groups:
        gi = BI[gname]
        side = gname.split(".")[1] if "." in gname else None
        for m in members:
            if "%s" in m and not side:
                for s in ("L", "R"):
                    for n in fnmatch.filter(names, m.replace("%s", s)):
                        bmap[n] = gi
            else:
                for n in fnmatch.filter(names, m.replace("%s", side) if side else m):
                    bmap[n] = gi
    WF = np.zeros((len(base), len(BONES)), dtype=np.float32)
    for b, lst in W.items():
        gi = bmap.get(b, BI["head"])
        for i, w in lst:
            WF[i, gi] += w
    s = WF.sum(axis=1, keepdims=True)
    s[s == 0] = 1
    return WF / s


WF = full_weights()


def bone_w(*names):
    """Summe der Gewichte der genannten Knochen je Ecke (Namen ohne Seite zaehlen beide Seiten)."""
    out = np.zeros(len(base), dtype=np.float32)
    for n in names:
        if n in BI:
            out += WF[:, BI[n]]
        else:
            for s in ("L", "R"):
                out += WF[:, BI[n + "." + s]]
    return out


skel = mhlib.load_skeleton()
_J = mhlib.joint_positions(base, skel)


def joint(mh_bone, end="head"):
    return _J[skel["bones"][mh_bone][end]]


def vertex_normals(pos, tri):
    fn = np.cross(pos[tri[:, 1]] - pos[tri[:, 0]], pos[tri[:, 2]] - pos[tri[:, 0]])
    vn = np.zeros_like(pos)
    for k in range(3):
        np.add.at(vn, tri[:, k], fn)
    return vn / (np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12)


def tri_of_quads(qs):
    t = []
    for q in qs:
        t.append([q[0], q[1], q[2]])
        if len(q) == 4:
            t.append([q[0], q[2], q[3]])
    return np.array(t)


FULL_TRI = tri_of_quads(quads)
FULL_VN = vertex_normals(base[:NB], FULL_TRI)
