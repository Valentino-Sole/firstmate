"""Helden von Schwebfels: Lesen der MakeHuman-Grunddaten (CC0) und Mischen der Koerperformen.

Nur numpy, kein Blender noetig. Die Daten kommen aus dem offiziellen MakeHuman-Repository
(https://github.com/makehumancommunity/makehuman, Ordner makehuman/data, Lizenz der Assets: CC0 1.0),
siehe fetch_makehuman.sh fuer den festgelegten Stand.
"""
import json
import os
import glob
import numpy as np

_cache = {}


def data_dir():
    d = os.environ.get("MH_DATA")
    if not d or not os.path.isdir(d):
        raise SystemExit("MH_DATA zeigt nicht auf makehuman/data (siehe fetch_makehuman.sh)")
    return d


def load_obj(path):
    """Liest base.obj: Ecken, UV, Flaechen mit Gruppe."""
    if path in _cache:
        return _cache[path]
    vs, vts, faces = [], [], []
    group = None
    with open(path) as f:
        for line in f:
            if line.startswith("v "):
                vs.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "):
                vts.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("g "):
                group = line[2:].strip()
            elif line.startswith("f "):
                vi, ti = [], []
                for tok in line.split()[1:]:
                    p = tok.split("/")
                    vi.append(int(p[0]) - 1)
                    ti.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
                faces.append((vi, ti, group))
    out = (np.array(vs, dtype=np.float64), np.array(vts, dtype=np.float64), faces)
    _cache[path] = out
    return out


def load_target(path):
    if path in _cache:
        return _cache[path]
    idx, d = [], []
    with open(path) as f:
        for line in f:
            if not line.strip() or line[0] == "#":
                continue
            p = line.split()
            idx.append(int(p[0]))
            d.append([float(p[1]), float(p[2]), float(p[3])])
    out = (np.array(idx, dtype=np.int64), np.array(d, dtype=np.float64).reshape(-1, 3))
    _cache[path] = out
    return out


def target_path(name):
    """Sucht eine Zieldatei ueber ihren Namen (ohne .target) unterhalb von targets/."""
    key = ("tp", name)
    if key in _cache:
        return _cache[key]
    hits = glob.glob(os.path.join(data_dir(), "targets", "**", name + ".target"), recursive=True)
    if not hits:
        raise KeyError("Zielform fehlt: " + name)
    _cache[key] = hits[0]
    return hits[0]


def _two(v, lo, hi):
    # Wert 0..1 mit Mitte 0.5 auf (lo, mitte, hi)-Gewichte verteilen
    if v < 0.5:
        a = max(0.0, 1 - 2 * v)
        return {lo: a, "average": 1 - a}
    b = max(0.0, 2 * v - 1)
    return {"average": 1 - b, hi: b}


def macro_weights(gender=0.5, age=0.5, muscle=0.5, weight=0.5, height=0.5, proportions=0.5, race=None):
    """Bildet die MakeHuman-Makroformen nach (Geschlecht, Alter, Muskeln, Gewicht, Groesse, Proportionen)."""
    race = race or {"caucasian": 1.0}
    g = {"female": 1 - gender, "male": gender}
    if age < 0.5:
        young = max(0.0, (age - 0.1875) * 3.2)
        a = {"baby": max(0.0, 1 - age * 5.333), "young": young, "child": max(0.0, min(1.0, 5.333 * age) - young)}
    else:
        old = max(0.0, age * 2 - 1)
        a = {"young": 1 - old, "old": old}
    mu = {k.replace("average", "averagemuscle") if k == "average" else k: v for k, v in _two(muscle, "minmuscle", "maxmuscle").items()}
    we = {k.replace("average", "averageweight") if k == "average" else k: v for k, v in _two(weight, "minweight", "maxweight").items()}
    out = []
    for gk, gw in g.items():
        for ak, aw in a.items():
            if gw * aw <= 1e-6:
                continue
            for rk, rw in race.items():
                if rw > 1e-6:
                    out.append((rk + "-" + gk + "-" + ak, gw * aw * rw))
            for mk, mw in mu.items():
                for wk, ww in we.items():
                    w = gw * aw * mw * ww
                    if w <= 1e-6:
                        continue
                    out.append(("universal-" + gk + "-" + ak + "-" + mk + "-" + wk, w))
                    hmax, hmin = max(0.0, 2 * height - 1), max(0.0, 1 - 2 * height)
                    if hmax > 0:
                        out.append((gk + "-" + ak + "-" + mk + "-" + wk + "-maxheight", w * hmax))
                    if hmin > 0:
                        out.append((gk + "-" + ak + "-" + mk + "-" + wk + "-minheight", w * hmin))
                    pi, pu = max(0.0, 2 * proportions - 1), max(0.0, 1 - 2 * proportions)
                    if pi > 0:
                        out.append((gk + "-" + ak + "-" + mk + "-" + wk + "-idealproportions", w * pi))
                    if pu > 0:
                        out.append((gk + "-" + ak + "-" + mk + "-" + wk + "-uncommonproportions", w * pu))
    return out


def apply_targets(base, targets):
    """base: (N,3); targets: Liste (name, gewicht). Gibt neue Positionen zurueck."""
    v = base.copy()
    for name, w in targets:
        if abs(w) < 1e-6:
            continue
        idx, d = load_target(target_path(name))
        if len(idx):
            v[idx] += d * w
    return v


def side_targets(spec):
    """Kurzform 'ear-shape-pointed': 1.0 setzt l- und r-Ziel; 'nose-curve': -0.4 waehlt decr/incr automatisch."""
    out = []
    for key, w in spec.items():
        names = [key]
        if key.startswith("lr-"):
            names = ["l-" + key[3:], "r-" + key[3:]]
        for n in names:
            try:
                target_path(n)
                out.append((n, w))
                continue
            except KeyError:
                pass
            suf = None
            for a, b in (("decr", "incr"), ("down", "up"), ("in", "out"), ("backward", "forward"), ("less", "more"), ("min", "max"), ("concave", "convex"), ("compress", "uncompress")):
                pa, pb = n + "-" + a, n + "-" + b
                try:
                    target_path(pb if w > 0 else pa)
                    suf = pb if w > 0 else pa
                    break
                except KeyError:
                    continue
            if suf is None:
                raise KeyError("Zielform fehlt: " + n)
            out.append((suf, abs(w)))
    return out


def load_skeleton():
    s = json.load(open(os.path.join(data_dir(), "rigs", "default.mhskel")))
    return s


def joint_positions(verts, skel):
    out = {}
    for name, idx in skel["joints"].items():
        out[name] = verts[np.array(idx)].mean(axis=0)
    return out


def load_weights():
    w = json.load(open(os.path.join(data_dir(), "rigs", "default_weights.mhw")))
    return w["weights"]


def ear_indices():
    """Ecken der beiden Ohren (aus der Zielform fuer spitze Ohren)."""
    li, _ = load_target(target_path("l-ear-shape-pointed"))
    ri, _ = load_target(target_path("r-ear-shape-pointed"))
    return li, ri


EAR_TYPES = {
    # (Zielformen, Streckung nach oben, nach hinten, nach aussen) in Anteilen der Ohrhoehe
    "human": ({}, 0.0, 0.0, 0.0),
    "tip": ({"lr-ear-shape-pointed": 0.8}, 0.18, 0.1, 0.05),
    "elf": ({"lr-ear-shape-pointed": 1.0, "lr-ear-scale-vert": 0.4}, 0.95, 0.55, 0.25),
    "leaf": ({"lr-ear-shape-pointed": 1.0, "lr-ear-scale": 0.5, "lr-ear-wing": 0.6}, 0.55, 0.25, 0.55),
    "wicht": ({"lr-ear-shape-pointed": 1.0, "lr-ear-scale-vert": 0.6}, 1.45, 0.9, 0.35),
}


def stretch_ears(v, kind):
    """Zieht die Ohrspitzen nach oben, hinten und aussen (MakeHuman-Achsen: y oben, z vorne, x links)."""
    _, up, back, out = EAR_TYPES[kind]
    if not (up or back or out):
        return v
    v = v.copy()
    for idx, sx in zip(ear_indices(), (1.0, -1.0)):
        P = v[idx]
        y0, y1 = P[:, 1].min(), P[:, 1].max()
        hgt = y1 - y0
        # Ansatz am Kopf: Ecken nahe der Mitte (kleines |x|) bewegen sich kaum
        ax = np.abs(P[:, 0])
        a0, a1 = ax.min(), ax.max()
        t = np.clip((P[:, 1] - (y0 + 0.35 * hgt)) / (0.65 * hgt), 0, 1) ** 1.6
        o = np.clip((ax - a0) / max(1e-6, a1 - a0), 0, 1)
        k = t * (0.35 + 0.65 * o)
        v[idx, 1] += k * up * hgt
        v[idx, 2] -= k * back * hgt
        v[idx, 0] += sx * k * out * hgt
    return v
