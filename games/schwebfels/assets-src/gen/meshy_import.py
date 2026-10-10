"""Geriggte Figur (Meshy-GLB oder jede andere GLB mit Skelett) samt Bewegungen ins Spielformat bringen.

Aufruf:
  python meshy_import.py <ausgabe.npz> <figur.glb> [--anim bewegungen.glb ...] [--height 2.0 | --race nordmann --gender f]
                  [--tris 12000] [--tex 1024] [--fps 30] [--as-meshy] [--no-clips] [--turn 180]

Schritte:
 1. GLB lesen (Draco oder meshopt vorher mit Blender entpacken), alle gehaeuteten Netze in Ruhelage zusammenfassen
 2. Ausrichten: Fuesse auf den Boden, Blick nach +Z, Zielhoehe (aus --height oder der Koerperhoehe des Volkes im Spiel)
 3. Skelett auf Weltausrichtung bringen (jeder Knochen ohne eigene Ruhedrehung, wie bei Meshy). So passen Bewegungen
    jeder Figur auf jede andere Figur mit gleichen Knochennamen. --as-meshy baut zusaetzlich das 24-Knochen-Skelett von
    Meshy nach (Finger und Zusatzknochen gehen in die Hand bzw. den naechsten Knochen ueber), etwa fuer Testfiguren.
 4. Gewichte: vier staerkste Knochen je Ecke; optional Reduzieren mit Blender auf --tris Dreiecke
 5. Textur: Grundfarbe (mehrere Materialien werden zu einem Atlas), verkleinert auf --tex Pixel
 6. Zuordnung der 29 Spielgelenke (Huefte, Wirbelsaeule, Arme, Beine, Haende) zu den Knochen der Figur, Haltepunkte
    fuer Waffen, Schild, Koecher, Guertel und Kopf
 7. Bewegungen: jede Animation mit --fps abgetastet, Drehungen je Knochen, Hueftweg; Spuren ohne Bewegung entfallen;
    Marken fuer den Moment des Schlags (schnellste Hand) und des Ausschlags (schnellster Oberkoerper)
Ergebnis: npz fuer gen_pack.py (Art "rig").
"""
import argparse
import io
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gltf as G  # noqa: E402
import packbones  # noqa: E402

PACK = os.path.join(HERE, "..", "..", "assets", "schwebfels.pack")
SIDES = ("L", "R")

# Skelett von Meshy (Rigging-API, Humanoid): Name, Eltern
MESHY = [("Hips", None), ("Spine02", "Hips"), ("Spine01", "Spine02"), ("Spine", "Spine01"), ("neck", "Spine"), ("Head", "neck"),
         ("head_end", "Head"), ("headfront", "Head")]
for _s, _w in (("L", "Left"), ("R", "Right")):
    MESHY += [(_w + "Shoulder", "Spine"), (_w + "Arm", _w + "Shoulder"), (_w + "ForeArm", _w + "Arm"), (_w + "Hand", _w + "ForeArm"),
              (_w + "UpLeg", "Hips"), (_w + "Leg", _w + "UpLeg"), (_w + "Foot", _w + "Leg"), (_w + "ToeBase", _w + "Foot")]

# Rollen nach Grundnamen (ohne Seite, Kleinbuchstaben, ohne Trennzeichen)
ROLE = [
    ("hips", r"hips?|pelvis"),
    ("thigh", r"upleg|thigh|upperleg"),
    ("shin", r"leg|calf|shin|lowerleg|knee"),
    ("foot", r"foot|ankle"),
    ("toe", r"toebase|toes?|ball"),
    ("clavicle", r"shoulder|clavicle|collar"),
    ("upperarm", r"arm|upperarm"),
    ("forearm", r"forearm|lowerarm|elbow"),
    ("hand", r"hand|wrist|palm2?"),
    ("thumb1", r"(hand)?thumb0?1"),
    ("thumb2", r"(hand)?thumb0?2"),
    ("fing1", r"(hand)?(index|middle)0?1"),
    ("fing2", r"(hand)?(index|middle)0?2"),
    ("neck", r"neck0?1?"),
    ("head", r"head"),
]


def clean(n):
    n = n.split(":")[-1].split("|")[-1]
    return re.sub(r"[\s.\[\]/]", "_", n)


def side_of(n, x):
    low = clean(n).lower()
    if "left" in low:
        return "L"
    if "right" in low:
        return "R"
    if re.search(r"(^|[_\-])l($|[_\-\d])", low):
        return "L"
    if re.search(r"(^|[_\-])r($|[_\-\d])", low):
        return "R"
    return "L" if x > 1e-4 else "R" if x < -1e-4 else None


def base_of(n):
    low = clean(n).lower().replace("left", "").replace("right", "")
    low = re.sub(r"(^|[_\-])[lr](?=$|[_\-\d])", r"\1", low)
    return re.sub(r"[_\-]", "", low)


def roles(names, parents, P):
    """Spielgelenk -> Knochenindex. P: Ruhelage im Spielraum (Y oben, Blick +Z, linke Seite +X)."""
    found = {}
    for i, n in enumerate(names):
        b = base_of(n)
        for role, rx in ROLE:
            if re.fullmatch(rx, b):
                key = role if role in ("hips", "neck", "head") else role + "." + (side_of(n, P[i][0]) or "?")
                if key not in found:
                    found[key] = i
                break
    kids = {i: [c for c, p in enumerate(parents) if p == i] for i in range(len(names))}
    if "hips" not in found:
        root = [i for i, p in enumerate(parents) if p < 0][0]
        while len(kids[root]) < 3 and kids[root]:
            root = kids[root][0]
        found["hips"] = root
    if "head" not in found:
        raise SystemExit("Kein Kopfknochen gefunden; Knochen: " + ", ".join(names))
    if "neck" not in found:
        found["neck"] = parents[found["head"]]
    # Wirbelsaeule: Weg von der Huefte zum Hals
    path = []
    i = parents[found["neck"]]
    while i >= 0 and i != found["hips"]:
        path.append(i)
        i = parents[i]
    path = path[::-1]
    found["spine"] = path[0] if path else found["hips"]
    found["chest"] = path[-1] if path else found["hips"]
    out = {}
    for k in ("hips", "spine", "chest", "neck", "head"):
        out[k] = found[k]
    missing = []
    for s in SIDES:
        for r in ("upperarm", "forearm", "hand", "thigh", "shin", "foot"):
            if r + "." + s not in found:
                missing.append(r + "." + s)
            else:
                out[r + "." + s] = found[r + "." + s]
        out["clavicle." + s] = found.get("clavicle." + s, out.get("chest"))
        out["toe." + s] = found.get("toe." + s, out.get("foot." + s))
        for r in ("thumb1", "thumb2", "fing1", "fing2"):
            out[r + "." + s] = found.get(r + "." + s, out.get("hand." + s))
    if missing:
        raise SystemExit("Gelenke nicht zuzuordnen: " + ", ".join(missing) + "\nKnochen: " + ", ".join(names))
    return out, path


# ---------- Lesen ----------
def plain_copy(src):
    """Komprimierte GLB (Draco, meshopt) mit Blender in eine einfache GLB umschreiben."""
    import bpy
    dst = src + ".plain.glb"
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_draco_mesh_compression_enable=False, export_animations=True, export_skins=True)
    return dst


def load(path):
    g = G.GLTF(path)
    if g.compressed:
        print("Hinweis: komprimierte Datei, Blender entpackt", path)
        g = G.GLTF(plain_copy(path))
    return g


def skin_joints(g):
    """Alle Knoten, die in irgendeinem Skin als Gelenk stehen, in Reihenfolge des groessten Skins."""
    best = None
    for i, n in enumerate(g.nodes):
        if "mesh" in n and "skin" in n:
            nv = sum(g.j["accessors"][p["attributes"]["POSITION"]]["count"] for p in g.j["meshes"][n["mesh"]]["primitives"])
            if best is None or nv > best[0]:
                best = (nv, n["skin"])
    if best is None:
        raise SystemExit("Die Datei enthaelt kein gehaeutetes Netz (kein Skelett).")
    order = list(g.j["skins"][best[1]]["joints"])
    for sk in g.j["skins"]:
        for jn in sk["joints"]:
            if jn not in order:
                order.append(jn)
    return order


def rest_mesh(g, joints):
    """Alle Netze in Ruhelage (Weltraum der Datei), mit Gewichten auf die Gelenkliste, UV und Material je Ecke."""
    jidx = {n: k for k, n in enumerate(joints)}
    wcache = {}
    W = {n: g.world(n, wcache) for n in joints}
    out = []
    for ni, node in enumerate(g.nodes):
        if "mesh" not in node:
            continue
        skin = g.j["skins"][node["skin"]] if "skin" in node else None
        if skin:
            sj = skin["joints"]
            ibm = g.accessor(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1) if "inverseBindMatrices" in skin else np.repeat(np.eye(4)[None], len(sj), 0)
            M = np.stack([W[j] @ ibm[k] for k, j in enumerate(sj)])
        else:
            # festes Netz an einem Knochen (z. B. Helm am Kopf): erbt den naechsten Gelenk-Vorfahren
            anc = g.parent.get(ni)
            while anc is not None and anc not in jidx:
                anc = g.parent.get(anc)
            if anc is None:
                continue
            Mn = g.world(ni, wcache)
        for prim in g.j["meshes"][node["mesh"]]["primitives"]:
            if prim.get("mode", 4) != 4:
                continue
            at = prim["attributes"]
            pos = g.accessor(at["POSITION"]).astype(np.float64)
            n = len(pos)
            img, fac, tc = g.base_color(prim.get("material"))
            uvk = "TEXCOORD_%d" % tc
            uv = g.accessor(at[uvk]).astype(np.float64) if uvk in at else np.zeros((n, 2))
            idx = g.accessor(prim["indices"])[:, 0].astype(np.int64) if "indices" in prim else np.arange(n)
            hom = np.c_[pos, np.ones(n)]
            if skin:
                ji = g.accessor(at["JOINTS_0"], normalize=False).astype(np.int64)
                jw = g.accessor(at["WEIGHTS_0"]).astype(np.float64)
                if "JOINTS_1" in at:
                    ji = np.c_[ji, g.accessor(at["JOINTS_1"], normalize=False).astype(np.int64)]
                    jw = np.c_[jw, g.accessor(at["WEIGHTS_1"]).astype(np.float64)]
                jw = jw / np.maximum(jw.sum(1, keepdims=True), 1e-9)
                wp = np.zeros((n, 3))
                for k in range(ji.shape[1]):
                    wp += jw[:, k:k + 1] * np.einsum("nij,nj->ni", M[ji[:, k]], hom)[:, :3]
                gj = np.array([jidx[j] for j in sj], np.int64)[ji]
            else:
                wp = (hom @ Mn.T)[:, :3]
                gj = np.full((n, 1), jidx[anc])
                jw = np.ones((n, 1))
            out.append(dict(pos=wp, uv=uv, idx=idx.reshape(-1, 3), ji=gj, jw=jw, img=img, fac=fac, nimg=g.normal_tex(prim.get("material"))))
    if not out:
        raise SystemExit("Keine Dreiecksnetze gefunden.")
    return out


# ---------- Ausrichten ----------
def frame_of(g, joints, parts, height, turn):
    """Aehnlichkeitsabbildung Datei -> Spiel: Drehung A (nur um Y), Mass s, Verschiebung c (vor dem Mass)."""
    P = np.array([g.world(n)[:3, 3] for n in joints])
    allp = np.concatenate([p["pos"] for p in parts])
    names = [g.nodes[n].get("name", "j%d" % n) for n in joints]
    low = [base_of(n) for n in names]
    if np.ptp(allp[:, 1]) < max(np.ptp(allp[:, 0]), np.ptp(allp[:, 2])) * 0.6:
        print("Warnung: Figur liegt nicht aufrecht (Y nach oben erwartet); Ergebnis pruefen")
    # Blickrichtung: Kopf-Vorderpunkt (Meshy) oder Zehen
    fwd = None
    if "headfront" in low and "head" in low:
        fwd = P[low.index("headfront")] - P[low.index("head")]
    else:
        toes = [i for i, b in enumerate(low) if re.fullmatch(r"toebase|toes?|ball", b)]
        feet = [i for i, b in enumerate(low) if re.fullmatch(r"foot|ankle", b)]
        if toes and feet:
            fwd = P[toes].mean(0) - P[feet].mean(0)
    ang = 0.0
    if fwd is not None and np.hypot(fwd[0], fwd[2]) > 1e-6:
        ang = -np.arctan2(fwd[0], fwd[2])
    if turn is not None:
        ang = np.radians(turn)
    c_, s_ = np.cos(ang), np.sin(ang)
    A = np.array([[c_, 0, s_], [0, 1, 0], [-s_, 0, c_]])
    hips = P[[i for i, b in enumerate(low) if re.fullmatch(r"hips?|pelvis", b)] or [0]][0]
    ymin, ymax = allp[:, 1].min(), allp[:, 1].max()
    s = height / (ymax - ymin)
    c = np.array([hips[0], ymin, hips[2]])
    return A, s, c


def to_game(p, A, s, c):
    return ((p - c) * s) @ A.T


# ---------- Reduzieren (Blender) ----------
def decimate(pos, uv, tri, ji, jw, target):
    import bpy
    key = np.round(pos / 1e-5).astype(np.int64)
    _, weld, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    V = pos[weld]
    F = inv[tri]
    keep = (F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])
    F, T = F[keep], tri[keep]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new("figur")
    me.from_pydata(V.tolist(), [], F.tolist())
    me.update()
    layer = me.uv_layers.new(name="uv")
    loops_uv = uv[T].reshape(-1, 2)
    layer.data.foreach_set("uv", loops_uv.ravel())
    ob = bpy.data.objects.new("figur", me)
    bpy.context.scene.collection.objects.link(ob)
    nj = int(ji.max()) + 1
    groups = [ob.vertex_groups.new(name="g%d" % k) for k in range(nj)]
    Wv = np.zeros((len(V), nj))
    for k in range(ji.shape[1]):
        np.add.at(Wv, (inv, ji[:, k]), jw[:, k])
    cnt = np.bincount(inv, minlength=len(V))[:, None]
    Wv /= np.maximum(cnt, 1)
    for j in range(nj):
        nz = np.nonzero(Wv[:, j] > 1e-4)[0]
        for v in nz:
            groups[j].add([int(v)], float(Wv[v, j]), "REPLACE")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    mod = ob.modifiers.new("reduz", "DECIMATE")
    mod.ratio = min(1.0, target / len(F))
    mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="reduz")
    me = ob.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    nvb = len(me.vertices)
    Wb = np.zeros((nvb, nj))
    for v in me.vertices:
        for ge in v.groups:
            Wb[v.index, ge.group] = ge.weight
    key2 = {}
    P2, UV2, I2, SRC = [], [], [], []
    for t in me.loop_triangles:
        tri3 = []
        for li, vi in zip(t.loops, t.vertices):
            u = tuple(np.round(uvl[li].uv[:], 6))
            k = (vi, u)
            if k not in key2:
                key2[k] = len(P2)
                P2.append(me.vertices[vi].co[:])
                UV2.append(u)
                SRC.append(vi)
            tri3.append(key2[k])
        I2.append(tri3)
    Wn = Wb[np.array(SRC)]
    order = np.argsort(-Wn, axis=1)[:, :4]
    w4 = np.take_along_axis(Wn, order, axis=1)
    return np.array(P2), np.array(UV2), np.array(I2), order, w4


# ---------- Textur ----------
def atlas(g, parts, size):
    """Texturatlas der Grundfarbe (Rueckgabe). Haben Teile eine Normalenkarte, liegt der passende Atlas in
    g.atlas_normal (gleiche Felder, flache Normale fuer Teile ohne Karte), sonst ist g.atlas_normal None."""
    from PIL import Image
    keys = []
    for p in parts:
        k = (p["img"], tuple(np.round(p["fac"], 3)))
        if k not in keys:
            keys.append(k)
        p["tile"] = keys.index(k)
    n = len(keys)
    grid = int(np.ceil(np.sqrt(n)))
    cell = size // grid if n > 1 else size
    canvas = Image.new("RGB", (cell * grid, cell * grid), (200, 200, 200))
    for t, (img, fac) in enumerate(keys):
        if img is None:
            tile = Image.new("RGB", (cell, cell), tuple(int(np.clip(c, 0, 1) * 255) for c in fac[:3]))
        else:
            data, _ = g.image_bytes(img)
            im = Image.open(io.BytesIO(data)).convert("RGB")
            if n == 1 and max(im.size) <= size:
                cell = max(im.size)
                canvas = Image.new("RGB", (cell, cell))
            im = im.resize((cell, cell), Image.LANCZOS)
            if np.any(np.abs(np.array(fac[:3]) - 1) > 1e-3):
                a = np.asarray(im).astype(np.float32) * np.array(fac[:3])[None, None, :]
                im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
            tile = im
        canvas.paste(tile, ((t % grid) * cell, (t // grid) * cell))
    # Normalenkarten in dieselben Felder (je Feld die Karte des ersten Teils mit diesem Feld)
    g.atlas_normal = None
    if any(p.get("nimg") is not None for p in parts):
        ncan = Image.new("RGB", canvas.size, (128, 128, 255))
        done = set()
        for p in parts:
            t = p["tile"]
            if t in done or p.get("nimg") is None:
                continue
            done.add(t)
            data, _ = g.image_bytes(p["nimg"])
            c = canvas.size[0] // grid if n > 1 else canvas.size[0]
            im = Image.open(io.BytesIO(data)).convert("RGB").resize((c, c), Image.LANCZOS)
            ncan.paste(im, ((t % grid) * c, (t // grid) * c))
        g.atlas_normal = np.asarray(ncan)
    for p in parts:
        t = p["tile"]
        uv = p["uv"]
        if n > 1:
            fu = np.mod(uv, 1.0)
            if p["img"] is None:
                fu = np.full_like(uv, 0.5)
            uv = np.c_[((t % grid) + fu[:, 0]) / grid, ((t // grid) + fu[:, 1]) / grid]
        p["uv_game"] = np.c_[uv[:, 0], 1.0 - uv[:, 1]]  # Spiel: V nach oben (wie Blender und three.js mit flipY)
    return np.asarray(canvas)


def normal_extra(g, tex):
    """Normalenkarte zum Speichern ({"ntex": Bild} oder leer), halb so gross wie die Farbtextur (mindestens 256 px):
    im Spiel sind die Figuren klein, die Feinheiten der Oberflaeche reichen so und das Paket bleibt klein."""
    from PIL import Image
    if getattr(g, "atlas_normal", None) is None:
        return {}
    s = max(256, tex.shape[1] // 2)
    return {"ntex": np.asarray(Image.fromarray(g.atlas_normal).resize((s, s), Image.LANCZOS)).astype(np.uint8)}


# ---------- Bewegungen ----------
def anim_name(raw, k):
    parts = [x for x in (raw or "").split("|") if x and x.lower() not in ("armature", "baselayer")]
    return clean(parts[0] if parts else (raw or "clip%d" % k))


def canon_names(g, path, log):
    """Namen der Bewegungen in einer Meshy-Datei auf die bestellten Bibliotheksnamen bringen. meshy_api.py legt dafuer
    neben jede Bewegungsdatei eine gleichnamige .json mit den bestellten Bewegungen. Die Namen in der Datei werden
    ohne Gross- und Sonderzeichen verglichen (genau gleich, sonst enthalten, der laengste Treffer gewinnt); bleiben
    gleich viele Bewegungen und Namen uebrig, entscheidet die Reihenfolge. Das Spiel waehlt die Clips ueber diese
    Namen (src/r3d-rigged.js), ein fremder Name wuerde sonst nie gespielt."""
    raw = [anim_name(a.get("name"), k) for k, a in enumerate(g.j.get("animations", []))]
    side = os.path.splitext(path)[0] + ".json"
    if not os.path.exists(side):
        return raw
    exp = [e["name"] for e in json.load(open(side)).get("bewegungen", [])]
    norm = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())  # noqa: E731
    out = list(raw)
    used = set()
    open_ = []
    for k, r in enumerate(raw):
        n = norm(r)
        hits = [e for e in exp if e not in used and norm(e) == n] or [e for e in exp if e not in used and norm(e) and norm(e) in n]
        if hits:
            out[k] = max(hits, key=len)
            used.add(out[k])
        else:
            open_.append(k)
    rest = [e for e in exp if e not in used]
    if open_ and len(open_) == len(rest):
        for k, e in zip(open_, rest):
            out[k] = e
        log["warnungen"].append("%s: Namen nach Reihenfolge zugeordnet: %s" % (os.path.basename(path), ", ".join("%s=%s" % (raw[k], out[k]) for k in open_)))
    elif open_ or rest:
        log["warnungen"].append("%s: ohne Zuordnung: Datei %s, bestellt %s" % (os.path.basename(path), [raw[k] for k in open_], rest))
    for k in range(len(raw)):
        if raw[k] != out[k]:
            print("Bewegung umbenannt:", raw[k], "->", out[k])
    return out


def clips_of(g, joints, tgt_of, tgt_names, tgt_parents, A, s, c, fps, hips_t, hand_t, body_t, hipsY, corr, names=None):
    """Bewegungen der Datei g auf das weltausgerichtete Zielskelett umrechnen.
    tgt_of[k] = Quellgelenk (Knotenindex in g) fuer Zielknochen k; names ersetzt die Namen aus der Datei."""
    out = []
    anims = g.j.get("animations", [])
    if not anims:
        return out
    rest_rot = {}
    for n in set(tgt_of):
        rest_rot[n] = G.rot_of(g.world(n))
    nb = len(tgt_names)
    for ai, a in enumerate(anims):
        name = names[ai] if names else anim_name(a.get("name"), ai)
        ch = g.channels(ai)
        if not ch:
            continue
        dur = max(t[-1] for t, _, _ in ch.values())
        nf = max(2, int(round(dur * fps)) + 1)
        times = np.linspace(0, dur, nf)
        samp = {}
        for (node, path), tr in ch.items():
            if path in ("translation", "rotation", "scale"):
                samp.setdefault(node, {})[path] = G.sample(tr, times, path)
        rots = np.zeros((nf, nb, 4))
        hips = np.zeros((nf, 3))
        hand = np.zeros((nf, 2, 3))
        body = np.zeros((nf, 2, 3))
        for f in range(nf):
            def trs(i, f=f):
                if i not in samp:
                    return None
                t0, r0, s0 = g.rest_trs(i)
                d = samp[i]
                return (d["translation"][f] if "translation" in d else t0, d["rotation"][f] if "rotation" in d else r0, d["scale"][f] if "scale" in d else s0)
            cache = {}
            D = np.zeros((nb, 3, 3))
            Pw = np.zeros((nb, 3))
            for k in range(nb):
                n = tgt_of[k]
                Wm = g.world(n, cache, trs)
                D[k] = A @ G.rot_of(Wm) @ rest_rot[n].T @ A.T @ corr[k].T
                Pw[k] = to_game(Wm[:3, 3], A, s, c)
            for k in range(nb):
                p = tgt_parents[k]
                L = D[k] if p < 0 else D[p].T @ D[k]
                rots[f, k] = G.mat_to_quat(L)
            hp = tgt_parents[hips_t]
            hips[f] = Pw[hips_t] if hp < 0 else D[hp].T @ (Pw[hips_t] - Pw[hp])
            hand[f] = Pw[hand_t]
            body[f] = Pw[body_t]
        # Vorzeichen der Quaternionen stetig halten
        for f in range(1, nf):
            flip = np.sum(rots[f] * rots[f - 1], axis=1) < 0
            rots[f, flip] *= -1
        # an Ort und Stelle: Hueftweg relativ zum ersten Bild; bei Gang und Lauf ohne Vorwaertsdrift
        hips[:, [0, 2]] -= hips[0, [0, 2]]
        loop = bool(re.search(r"walk|run|idle|stance|sit|drink|strut|stroll|jog", name, re.I))
        if loop:
            drift = (hips[-1, [0, 2]] - hips[0, [0, 2]])[None, :] * (times / max(dur, 1e-9))[:, None]
            hips[:, [0, 2]] -= drift
        moving = []
        for k in range(nb):
            ang = 2 * np.degrees(np.arccos(np.clip(np.abs(rots[:, k, 3]), 0, 1)))
            if ang.max() > 0.25:
                moving.append(k)

        def peak(track):
            v = np.linalg.norm(np.diff(track, axis=0), axis=-1).max(axis=-1) * fps
            if len(v) > 4:
                v = np.convolve(v, np.ones(3) / 3, mode="same")
            return float(times[int(np.argmax(v)) + 1]) if len(v) else 0.0
        out.append(dict(name=name, d=float(dur), fps=fps, frames=nf, bones=[tgt_names[k] for k in moving],
                        rot=rots[:, moving, :].astype(np.float32), hips=hips.astype(np.float32), hipsY=float(hipsY),
                        hitHand=peak(hand), hitBody=peak(body), loop=loop))
        print("Bewegung", name, round(dur, 2), "s,", nf, "Bilder,", len(moving), "bewegte Knochen, Schlag bei", round(out[-1]["hitHand"], 2), "s")
    return out


# ---------- Knie ----------
def fix_knees(TP, tmap):
    """Knie, die weit neben der Linie Huefte-Knoechel sitzen (Meshy setzt sie bei Umhaengen oder Fell manchmal hinter das
    Bein), auf diese Linie holen. Sonst verbiegt das Geraderichten zur T-Haltung das Bein, und der Fuss steckt im Boden."""
    moved = []
    for s_ in ("L", "R"):
        h, k, f = tmap["thigh." + s_], tmap["shin." + s_], tmap["foot." + s_]
        if len({h, k, f}) < 3:
            continue
        H, K, F = TP[h], TP[k].copy(), TP[f]
        d = F - H
        L = float(np.linalg.norm(d))
        t = float(np.clip(((K - H) @ d) / max(L * L, 1e-9), 0.3, 0.7))
        on = H + d * t
        if np.linalg.norm(K - on) > 0.2 * L:
            TP[k] = on
            moved.append((s_, round(float(np.linalg.norm(K - on)), 3)))
    return moved


def free_arms(pos, tri, Wd, TP, tmap, parents, height):
    """Stoff, den Meshy an den Arm gehaengt hat (Schaerpenenden, Guertelbaender neben der herabhaengenden Hand), vom Arm
    loesen; sonst zieht die gehobene Hand beim Jubeln einen Stoffstreifen mit hoch. Drei Schritte je Seite:
    1. Ecken mit Armgewicht, die ueber die Oberflaeche nur auf einem langen Umweg (Arm hoch, ueber die Schulter, den
       Rumpf hinab) vom Unterarm zu erreichen sind, geben ihr Armgewicht an den naechsten Rumpf- oder Oberschenkelknochen.
    2. Wo Meshy Hand und Huefte zu einem Netz verschmolzen hat, gehoert jede Ecke ganz zum naeheren Teil: zur Hand oder
       zum Koerper (gemessen an Handachse bzw. Rumpf- und Oberschenkelachse, nur unterhalb des Handgelenks); schwaches
       Handgewicht neben Koerpergewicht geht immer an den Koerper.
    3. Dreiecke, die danach eine reine Hand-Ecke mit einer armfreien Ecke verbinden, fallen weg (die Beruehrnaht),
       sonst spannen sie sich zwischen gehobener Hand und Huefte auf.
    Gibt die Zahl der geaenderten Ecken und die verbleibenden Dreiecke zurueck."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra
    from scipy.spatial import cKDTree

    def segd(a, b, X=pos):
        d = b - a
        t = np.clip(((X - a) @ d) / max(float(d @ d), 1e-9), 0, 1)
        return np.linalg.norm(X - (a + t[:, None] * d), axis=1), t
    # gleiche Lage = gleiche Ecke (Meshy doppelt Ecken an UV-Naehten), Kanten aus den Dreiecken
    _, wid = np.unique(np.round(pos / 1e-4).astype(np.int64), axis=0, return_inverse=True)
    wid = wid.ravel()
    nw = int(wid.max()) + 1
    wpos = np.zeros((nw, 3))
    wpos[wid] = pos
    e = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
    e = wid[e]
    e = e[e[:, 0] != e[:, 1]]
    G = coo_matrix((np.linalg.norm(wpos[e[:, 0]] - wpos[e[:, 1]], axis=1) + 1e-6, (e[:, 0], e[:, 1])), shape=(nw, nw)).tocsr()
    body = [(tmap["hips"], segd(TP[tmap["hips"]], TP[tmap["chest"]])[0])]
    for s_ in SIDES:
        body.append((tmap["thigh." + s_], segd(TP[tmap["thigh." + s_]], TP[tmap["shin." + s_]])[0]))
    D = np.stack([d for _, d in body], 1)
    near = np.array([bn for bn, _ in body])[np.argmin(D, 1)]
    db = D.min(1)
    k = height / 1.8
    changed = np.zeros(len(pos), bool)
    cut = np.zeros(len(tri), bool)
    for s_ in SIDES:
        ua, fa, ha = tmap["upperarm." + s_], tmap["forearm." + s_], tmap["hand." + s_]
        hk = sorted({ha} | {i for i in range(len(parents)) if any(j == ha for j in ancestors(parents, i))})
        cols = sorted({ua, fa} | set(hk))
        # 1. Umweg ueber die Oberflaeche; Saat: Ecken dicht am mittleren Unterarm, die Meshy selbst dem Unterarm gab
        aw = Wd[:, cols].sum(1)
        d, t = segd(TP[fa], TP[ha])
        seed = np.unique(wid[(np.argmax(Wd, 1) == fa) & (d < 0.06 * k) & (t > 0.2) & (t < 0.8)])
        if len(seed) >= 3:
            # getrennte Netzinseln (eigene Handschuhe, Armreifen) bleiben, wie Meshy sie gehaengt hat
            dg = dijkstra(G, directed=False, indices=seed, min_only=True)[wid]
            de = cKDTree(wpos[seed]).query(pos)[0]
            m = (aw > 0) & np.isfinite(dg) & (dg - de > 0.3 * k)
            idx = np.where(m)[0]
            np.add.at(Wd, (idx, near[idx]), aw[idx])
            Wd[np.ix_(idx, cols)] = 0
            changed[idx] = True
        # 2. Hand oder Koerper, unterhalb des Handgelenks (die Hand haengt in der Ruhelage)
        dh, _ = segd(TP[ha], TP[ha] + (TP[ha] - TP[fa]) * 0.8)
        hw = Wd[:, hk].sum(1)
        own = np.zeros(Wd.shape[1], bool)
        own[cols + [tmap["clavicle." + s_]]] = True
        bw = Wd[:, ~own].sum(1)
        low = pos[:, 1] < TP[ha][1]
        to_body = np.where((hw > 0) & low & ((db < dh) | ((bw > 0) & (hw < 0.3))))[0]
        np.add.at(Wd, (to_body, near[to_body]), hw[to_body])
        Wd[np.ix_(to_body, hk)] = 0
        to_hand = np.where((hw >= 0.3) & (bw > 0) & low & (db >= dh))[0]
        np.add.at(Wd, (to_hand, np.full(len(to_hand), ha)), bw[to_hand])
        Wd[np.ix_(to_hand, np.where(~own)[0])] = 0
        changed[to_body] = changed[to_hand] = True
        # 3. Naht zwischen Hand und armfreiem Koerper
        pure_hand = Wd[:, hk].sum(1) > 0.5
        armfree = Wd[:, cols].sum(1) == 0
        cut |= pure_hand[tri].any(1) & armfree[tri].any(1)
    return int(changed.sum()), tri[~cut]


def free_cloth(pos, Wd, TP, tmap, height):
    """Weiter Stoff am Arm (Umhang, den die Figur mit der Hand haelt, weite Aermel): Armgewicht einer Ecke geht an den
    naechsten Rumpf- oder Oberschenkelknochen, je weiter sie vom Arm entfernt ist (gemessen an Oberarm, Unterarm und
    Hand in der Ruhelage; bis 12 cm bleibt alles am Arm, ab 24 cm alles am Koerper, dazwischen anteilig, bei 1,8 m
    Hoehe; STOFF_R0 und STOFF_R1 zum Ausprobieren). Sonst schwingt beim Blutkultisten eine Umhanghaelfte bei jeder Armbewegung wie ein Fluegel mit.
    Gibt die Zahl der geaenderten Ecken zurueck."""
    def segd(a, b):
        d = b - a
        t = np.clip(((pos - a) @ d) / max(float(d @ d), 1e-9), 0, 1)
        return np.linalg.norm(pos - (a + t[:, None] * d), axis=1)
    k = height / 1.8
    R0, R1 = float(os.environ.get("STOFF_R0", 0.12)), float(os.environ.get("STOFF_R1", 0.24))
    # Rumpf in drei Stuecken (Huefte, Bauch, Brust), damit der Oberkoerper sich mit der Wirbelsaeule neigt
    body = [(tmap["hips"], segd(TP[tmap["hips"]], TP[tmap["spine"]])), (tmap["spine"], segd(TP[tmap["spine"]], TP[tmap["chest"]])), (tmap["chest"], segd(TP[tmap["chest"]], TP[tmap["neck"]]))]
    for s_ in SIDES:
        body.append((tmap["thigh." + s_], segd(TP[tmap["thigh." + s_]], TP[tmap["shin." + s_]])))
    D = np.stack([d for _, d in body], 1)
    near = np.array([bn for bn, _ in body])[np.argmin(D, 1)]
    changed = np.zeros(len(pos), bool)
    for s_ in SIDES:
        ua, fa, ha = tmap["upperarm." + s_], tmap["forearm." + s_], tmap["hand." + s_]
        cols = sorted({ua, fa, ha})
        tip = TP[ha] + (TP[ha] - TP[fa]) * 0.6
        d = np.minimum.reduce([segd(TP[ua], TP[fa]), segd(TP[fa], TP[ha]), segd(TP[ha], tip)])
        f = np.clip((d - R0 * k) / ((R1 - R0) * k), 0, 1)
        m = (f > 0) & (Wd[:, cols].sum(1) > 0)
        if m.any():
            idx = np.where(m)[0]
            mv = Wd[np.ix_(idx, cols)] * f[idx, None]
            Wd[np.ix_(idx, cols)] -= mv
            np.add.at(Wd, (idx, near[idx]), mv.sum(1))
            changed[idx] = True
    return int(changed.sum())


def free_shoulders(pos, Wd, TP, tmap, height):
    """Armgewicht oberhalb der Schulter (Pilzhut, Laternen und Schornsteine auf dem Ruecken) geht an die Brust; sonst
    reisst ein gehobener Arm den Aufbau mit hoch. Uebergang weich ueber 10 cm (bei 1,8 m Hoehe), damit nichts aufreisst.
    Gibt die Zahl der geaenderten Ecken zurueck."""
    k = height / 1.8
    ch = tmap["chest"]
    changed = np.zeros(len(pos), bool)
    for s_ in SIDES:
        cols = sorted({tmap["upperarm." + s_], tmap["forearm." + s_], tmap["hand." + s_]})
        sy = TP[tmap["upperarm." + s_]][1]
        f = np.clip((pos[:, 1] - (sy + 0.05 * k)) / (0.1 * k), 0, 1)
        m = (f > 0) & (Wd[:, cols].sum(1) > 0)
        if m.any():
            idx = np.where(m)[0]
            mv = Wd[np.ix_(idx, cols)] * f[idx, None]
            Wd[np.ix_(idx, cols)] -= mv
            Wd[idx, ch] += mv.sum(1)
            changed[idx] = True
    return int(changed.sum())


def ancestors(parents, i):
    j = parents[i]
    while j >= 0:
        yield j
        j = parents[j]


# ---------- T-Haltung ----------
def rot_between(a, b):
    a = a / np.linalg.norm(a)
    b = b / np.linalg.norm(b)
    v = np.cross(a, b)
    cth = float(a @ b)
    if cth < -0.9999:
        ax = np.cross(a, [1.0, 0, 0]) if abs(a[0]) < 0.9 else np.cross(a, [0, 1.0, 0])
        ax /= np.linalg.norm(ax)
        return 2 * np.outer(ax, ax) - np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx / (1 + cth)


def tpose(parents, TP, tmap):
    """Arme waagrecht zur Seite, Beine senkrecht: Drehung je Knochen (Weltraum) und neue Ruhelage.
    Gleiche Grundhaltung ist die Voraussetzung dafuer, dass Bewegungen zwischen Figuren passen."""
    nb = len(parents)
    C = np.repeat(np.eye(3)[None], nb, 0)
    P = TP.copy()
    kids = {i: [c for c in range(nb) if parents[c] == i] for i in range(nb)}

    def subtree(i):
        out = [i]
        for c in kids[i]:
            out += subtree(c)
        return out
    # gebeugter Oberkoerper (geduckte Kreaturen): Wirbelsaeule bis zum Hals senkrecht stellen, Kopf darueber
    # (nur der lange Abschnitt bis zum Hals; der kurze Hals-Kopf-Abschnitt ist bei Kapuzen und Bart zu ungenau)
    H0 = max(float(np.ptp(P[:, 1])), 1e-6)
    for a, b in (() if os.environ.get("KEIN_AUFRICHTEN") else (("spine", "neck"),)):
        i, j = tmap[a], tmap[b]
        if i == j:
            continue
        v = P[j] - P[i]
        if np.linalg.norm(v) < 0.08 * H0 or np.degrees(np.arccos(np.clip(v[1] / max(np.linalg.norm(v), 1e-9), -1, 1))) < 25:
            continue
        Rb = rot_between(v, np.array([0.0, 1.0, 0.0]))
        for k in subtree(i):
            C[k] = Rb @ C[k]
            if k != i:
                P[k] = P[i] + Rb @ (P[k] - P[i])
    for s_, x in (("L", 1.0), ("R", -1.0)):
        for a, b, d in (("upperarm", "forearm", [x, 0, 0]), ("forearm", "hand", [x, 0, 0]), ("thigh", "shin", [0, -1.0, 0]), ("shin", "foot", [0, -1.0, 0])):
            i, j = tmap[a + "." + s_], tmap[b + "." + s_]
            if i == j:
                continue
            Rb = rot_between(P[j] - P[i], np.array(d))
            for k in subtree(i):
                C[k] = Rb @ C[k]
                if k != i:
                    P[k] = P[i] + Rb @ (P[k] - P[i])
    return C, P


def repose(pos, order, w4, TP, P2, C):
    out = np.zeros_like(pos)
    for k in range(order.shape[1]):
        j = order[:, k]
        out += w4[:, k:k + 1] * (np.einsum("nij,nj->ni", C[j], pos - TP[j]) + P2[j])
    return out


# ---------- Haltepunkte ----------
def sockets(P, J, armmask, top):
    out = {}
    up = np.array([0.0, 1.0, 0.0])
    for sd, sx in (("L", 1.0), ("R", -1.0)):
        hand, fore = J["hand." + sd], J["forearm." + sd]
        d = hand - fore
        d /= np.linalg.norm(d)
        cand = P[((P - hand) @ d) > 0]
        cand = cand[np.linalg.norm(cand - hand, axis=1) < 0.35]
        L = float(np.max((cand - hand) @ d)) if len(cand) else 0.18
        L = max(0.08, min(L, 0.3))
        along = d
        if not np.allclose(J["thumb1." + sd], hand):
            ax = J["thumb1." + sd] - hand
        else:
            ax = np.array([0.0, 0.0, 1.0])
        ax = ax - along * (ax @ along)
        if np.linalg.norm(ax) < 1e-6:
            ax = np.cross(along, up)
        ax /= np.linalg.norm(ax)
        dorsal = sx * np.cross(ax, along)
        dorsal /= max(np.linalg.norm(dorsal), 1e-9)
        out["grip" + sd] = dict(p=(hand + along * L * 0.5).tolist(), axis=ax.tolist(), along=along.tolist(), size=float(L))
        out["arm" + sd] = dict(p=((fore + hand) / 2).tolist(), along=along.tolist(), dorsal=dorsal.tolist())
        out["ring" + sd] = dict(p=(hand + along * L * 0.62).tolist())
    head = J["head"]
    hp = P[P[:, 1] > head[1] + 0.02]
    out["head"] = dict(p=head.tolist(), top=[0.0, float(top), float(head[2])], width=float(np.ptp(hp[:, 0])) if len(hp) else 0.2)
    body = P[~armmask]

    def front(y, sign=1.0):
        for band in (0.02, 0.04, 0.08):
            q = body[(np.abs(body[:, 1] - y) < band) & (np.abs(body[:, 0]) < 0.06)]
            if len(q):
                return [0.0, float(y), float(q[:, 2].max() if sign > 0 else q[:, 2].min())]
        return [0.0, float(y), 0.0]
    ch, nk, hp_ = J["chest"], J["neck"], J["hips"]
    out["chest"] = dict(p=front(ch[1] * 0.35 + nk[1] * 0.65 - 0.04))
    out["back"] = dict(p=front(ch[1] + (nk[1] - ch[1]) * 0.3, -1))
    yb = hp_[1] + 0.06 * (top / 2.0)
    q = body[np.abs(body[:, 1] - yb) < 0.03]
    if not len(q):
        q = body
    out["belt"] = dict(p=front(yb), left=[float(q[:, 0].max()), float(yb), 0.02], right=[float(q[:, 0].min()), float(yb), 0.02])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("figure")
    ap.add_argument("--anim", action="append", default=[])
    ap.add_argument("--height", type=float)
    ap.add_argument("--race")
    ap.add_argument("--gender", choices=["f", "m"])
    ap.add_argument("--tris", type=int, default=12000)
    ap.add_argument("--tex", type=int, default=1024)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--turn", type=float)
    ap.add_argument("--as-meshy", action="store_true")
    ap.add_argument("--no-clips", action="store_true")
    ap.add_argument("--schultern-loesen", action="store_true", help="Armgewicht oberhalb der Schulter an die Brust (Huete, Aufbauten auf dem Ruecken)")
    ap.add_argument("--stoff-vom-arm", action="store_true", help="weiten Stoff am Arm (gehaltener Umhang, weite Aermel) je nach Abstand vom Arm an den Koerper (Blutkultist)")
    ap.add_argument("--arme-loesen", action="store_true", help="Stoff, den Meshy an Arm oder Hand gehaengt hat (Schaerpenenden neben der Hand), vom Arm loesen; fuer Heldenkoerper")
    ap.add_argument("--pack", default=PACK)
    a = ap.parse_args()
    log = {"quelle": os.path.basename(a.figure), "warnungen": []}

    game_bones = [b[0] for b in packbones.bones(a.pack)]
    height = a.height
    if height is None:
        if not a.race:
            raise SystemExit("--height oder --race/--gender angeben")
        height = packbones.top(a.pack, a.race + "." + (a.gender or "m"))
    g = load(a.figure)
    joints = skin_joints(g)
    parts = rest_mesh(g, joints)
    A, s, c = frame_of(g, joints, parts, height, a.turn)

    src_names = [clean(g.nodes[n].get("name", "j%d" % n)) for n in joints]
    src_par = [joints.index(g.parent[n]) if g.parent.get(n) in joints else -1 for n in joints]
    srcP = np.array([to_game(g.world(n)[:3, 3], A, s, c) for n in joints])
    rmap, spine_path = roles(src_names, src_par, srcP)

    # Zielskelett: alle Gelenke der Datei oder das Meshy-Skelett
    if a.as_meshy:
        sp = spine_path or [rmap["hips"]]
        meshy_src = {"Hips": rmap["hips"], "Spine02": sp[0], "Spine": sp[-1], "Spine01": sp[len(sp) // 2] if len(sp) > 2 else None,
                     "neck": rmap["neck"], "Head": rmap["head"]}
        for s_, w in (("L", "Left"), ("R", "Right")):
            meshy_src.update({w + "Shoulder": rmap["clavicle." + s_], w + "Arm": rmap["upperarm." + s_], w + "ForeArm": rmap["forearm." + s_],
                              w + "Hand": rmap["hand." + s_], w + "UpLeg": rmap["thigh." + s_], w + "Leg": rmap["shin." + s_], w + "Foot": rmap["foot." + s_],
                              w + "ToeBase": rmap["toe." + s_] if rmap["toe." + s_] != rmap["foot." + s_] else None})
        used = set()
        for nm, _ in MESHY:
            if meshy_src.get(nm) is not None:
                if meshy_src[nm] in used:
                    meshy_src[nm] = None
                else:
                    used.add(meshy_src[nm])
        names = [m[0] for m in MESHY]
        parents = [names.index(m[1]) if m[1] else -1 for m in MESHY]
        TP = np.zeros((len(names), 3))
        tgt_of = []
        for k, (nm, par) in enumerate(MESHY):
            si = meshy_src.get(nm)
            if si is not None:
                TP[k] = srcP[si]
                tgt_of.append(joints[si])
            else:
                pk = parents[k]
                tgt_of.append(tgt_of[pk])
                if nm == "Spine01":
                    TP[k] = (TP[names.index("Spine02")] + srcP[rmap["chest"]]) / 2
                elif nm.endswith("Shoulder"):
                    ua = srcP[rmap["upperarm." + ("L" if nm.startswith("Left") else "R")]]
                    TP[k] = srcP[rmap["chest"]] + (ua - srcP[rmap["chest"]]) * 0.35
                elif nm == "head_end":
                    TP[k] = TP[pk] + [0, 0.2 * height / 2, 0]
                elif nm == "headfront":
                    TP[k] = TP[pk] + [0, 0.005, 0.1 * height / 2]
                else:
                    TP[k] = TP[pk] + (TP[pk] - TP[parents[pk]]) * 0.3
        # jedes Quellgelenk geht im naechsten zugeordneten Vorfahren auf
        direct = {}
        for k, nm in enumerate(names):
            si = meshy_src.get(nm)
            if si is not None:
                direct[si] = k
        remap = np.zeros(len(joints), np.int64)
        for i in range(len(joints)):
            j = i
            while j >= 0 and j not in direct:
                j = src_par[j]
            remap[i] = direct.get(j, 0)
    else:
        names, parents, TP = src_names, src_par, srcP
        tgt_of = list(joints)
        remap = np.arange(len(joints))
    if len(set(names)) != len(names):
        raise SystemExit("Knochennamen sind nicht eindeutig: " + ", ".join(names))
    tmap, _ = roles(names, parents, TP)
    moved = [] if os.environ.get("KEIN_KNIE") else fix_knees(TP, tmap)
    if moved:
        print("Knie auf die Beinlinie geholt:", ", ".join("%s %.0f cm" % (sd, d * 100) for sd, d in moved))
        log["knie_korrigiert"] = moved
    corr, TP_t = tpose(parents, TP, tmap)
    turned = float(max(np.degrees(np.arccos(np.clip((np.trace(m) - 1) / 2, -1, 1))) for m in corr))
    if turned > 1:
        print("T-Haltung hergestellt (groesste Drehung %.0f Grad)" % turned)
        log["t_haltung_grad"] = round(turned)

    # Netz zusammenfassen
    tex = atlas(g, parts, a.tex)
    pos = np.concatenate([to_game(p["pos"], A, s, c) for p in parts])
    uv = np.concatenate([p["uv_game"] for p in parts])
    base = np.cumsum([0] + [len(p["pos"]) for p in parts])[:-1]
    tri = np.concatenate([p["idx"] + b for p, b in zip(parts, base)])
    nk = max(p["ji"].shape[1] for p in parts)
    ji = np.concatenate([np.pad(remap[p["ji"]], ((0, 0), (0, nk - p["ji"].shape[1]))) for p in parts])
    jw = np.concatenate([np.pad(p["jw"], ((0, 0), (0, nk - p["jw"].shape[1]))) for p in parts])
    # gleiche Zielknochen zusammenfassen, vier staerkste behalten
    nbones = len(names)
    Wd = np.zeros((len(pos), nbones))
    for k in range(nk):
        np.add.at(Wd, (np.arange(len(pos)), ji[:, k]), jw[:, k])
    if a.schultern_loesen:
        n = free_shoulders(pos, Wd, TP, tmap, height)
        print("Ueber der Schulter an die Brust:", n, "Ecken")
        log["schultern_geloest"] = n
    if a.arme_loesen:
        n, tri2 = free_arms(pos, tri, Wd, TP, tmap, parents, height)
        print("Von der Hand geloest:", n, "Ecken,", len(tri) - len(tri2), "Dreiecke der Beruehrnaht entfernt")
        log["arme_geloest"] = [n, len(tri) - len(tri2)]
        tri = tri2
    if a.stoff_vom_arm:
        n = free_cloth(pos, Wd, TP, tmap, height)
        print("Stoff vom Arm an den Koerper:", n, "Ecken")
        log["stoff_vom_arm"] = n
    order = np.argsort(-Wd, axis=1)[:, :4]
    w4 = np.take_along_axis(Wd, order, axis=1)
    w4 = w4 / np.maximum(w4.sum(1, keepdims=True), 1e-9)
    pos = repose(pos, order, w4, TP, TP_t, corr)
    TP = TP_t
    tris_in = len(tri)
    if tris_in > a.tris * 1.05:
        pos, uv, tri, order, w4 = decimate(pos, uv, tri, order, w4, a.tris)
        log["reduziert"] = [tris_in, len(tri)]
    w4 = w4 / np.maximum(w4.sum(1, keepdims=True), 1e-9)
    w8 = np.round(w4 * 255).astype(np.int32)
    w8[:, 0] += 255 - w8.sum(1)
    print("Netz:", len(pos), "Ecken,", len(tri), "Dreiecke (vorher", tris_in, "), Textur", tex.shape[1], "px,", nbones, "Knochen")

    # Spielgelenke, Haltepunkte
    J = {gb: TP[tmap[gb]] for gb in game_bones}
    arm_bones = {tmap[k] for k in tmap if re.match(r"(upperarm|forearm|hand|thumb|fing)\.", k)}
    armmask = np.isin(order[:, 0], list(arm_bones))
    top = float(pos[:, 1].max())
    sock = sockets(pos, J, armmask, top)

    # Bewegungen
    clips = []
    if not a.no_clips:
        hips_t = tmap["hips"]
        hand_t = [tmap["hand.L"], tmap["hand.R"]]
        body_t = [tmap["chest"], tmap["head"]]
        clips += clips_of(g, joints, tgt_of, names, parents, A, s, c, a.fps, hips_t, hand_t, body_t, TP[hips_t][1], corr)
        for f in a.anim:
            ga = load(f)
            aj = skin_joints(ga) if any("skin" in n for n in ga.nodes) else [i for i, n in enumerate(ga.nodes) if clean(n.get("name", "")) in src_names]
            by_name = {clean(ga.nodes[n].get("name", "")): n for n in aj}
            missing = [n for n in src_names if n not in by_name]
            if missing:
                log["warnungen"].append("%s: Knochen fehlen in der Bewegungsdatei: %s" % (os.path.basename(f), ", ".join(missing[:8])))
            # Bewegungsdatei auf dieselbe Hoehe bringen wie die Figur (Huefthoehe ueber den Fuessen)
            aP = {n: ga.world(by_name[n])[:3, 3] for n in by_name}
            hipn, footn = src_names[rmap["hips"]], src_names[rmap["foot.L"]]
            if hipn not in aP or footn not in aP:
                raise SystemExit("Bewegungsdatei ohne passende Huefte oder Fuesse: " + f)
            ha = aP[hipn][1] - min(aP[src_names[rmap["foot.L"]]][1], aP[src_names[rmap["foot.R"]]][1])
            hf = g.world(joints[rmap["hips"]])[1, 3] - min(g.world(joints[rmap["foot.L"]])[1, 3], g.world(joints[rmap["foot.R"]])[1, 3])
            sa = s * hf / max(ha, 1e-9)
            ca = aP[hipn] - (g.world(joints[rmap["hips"]])[:3, 3] - c) * (s / sa)
            a_tgt = [by_name.get(src_names[joints.index(n)], None) for n in tgt_of]
            if any(x is None for x in a_tgt):
                a_tgt = [x if x is not None else by_name[hipn] for x in a_tgt]
            clips += clips_of(ga, aj, a_tgt, names, parents, A, sa, ca, a.fps, tmap["hips"], [tmap["hand.L"], tmap["hand.R"]],
                              [tmap["chest"], tmap["head"]], TP[tmap["hips"]][1], corr, canon_names(ga, f, log))
    seen = set()
    uniq = []
    for cl in clips:
        if cl["name"] in seen:
            cl["name"] = cl["name"] + "_%d" % len(seen)
        seen.add(cl["name"])
        uniq.append(cl)

    meta = {"names": names, "parents": parents, "map": {k: int(v) for k, v in tmap.items()}, "sockets": sock, "top": top,
            "hipsY": float(TP[tmap["hips"]][1]), "height": height, "race": a.race, "gender": a.gender,
            "clips": [{k: cl[k] for k in ("name", "d", "fps", "frames", "bones", "hipsY", "hitHand", "hitBody", "loop")} for cl in uniq],
            "log": log}
    arrs = dict(kind="rig", pos=pos.astype(np.float32), uv=uv.astype(np.float32), idx=tri.astype(np.int32), skin_i=order.astype(np.uint8),
                skin_w=w8.astype(np.uint8), tex=tex.astype(np.uint8), rest=TP.astype(np.float32),
                joints=np.array([J[gb] for gb in game_bones], np.float32), meta=json.dumps(meta, ensure_ascii=False))
    arrs.update(normal_extra(g, tex))
    for k, cl in enumerate(uniq):
        arrs["clip%d_rot" % k] = cl["rot"]
        arrs["clip%d_hips" % k] = cl["hips"]
    np.savez_compressed(a.out, **arrs)
    for w in log["warnungen"]:
        print("Warnung:", w)
    print(a.out, round(os.path.getsize(a.out) / 1024), "KB,", len(uniq), "Bewegungen")


if __name__ == "__main__":
    main()
