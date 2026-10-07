"""Ruestungsteil (einzeln erzeugte GLB, z. B. von Meshy) fuer Figuren mit eigenem Skelett vorbereiten.

Aufruf:
  python fit_piece.py <ausgabe.npz> <referenzkoerper.npz> <teil.glb> --slot brust|handschuhe|stiefel|helm|hose
                      [--name harnisch_eisen] [--forms harnisch.0,harnisch] [--rot 0,0,90] [--pad 0.02]
                      [--tris 4000] [--tex 512] [--paar] [--flip] [--offset 0.012]

Der Referenzkoerper ist eine npz-Datei aus meshy.py (Art "rig"). Schritte:
 1. Teil laden (alle Netze, Textur als Atlas), optional drehen (--rot in Grad um X, Y, Z) und reduzieren
 2. Auf den Koerperbereich des Platzes ausrichten (Brust: Huefte bis Schultern, Handschuhe: Hand und halber
    Unterarm, Stiefel: Fuss und halbes Schienbein, Helm: Kopf, Hose: Huefte und Beine); --paar spiegelt ein einzelnes
    Teil auf die andere Seite
 3. Mit Blender nach aussen schieben (keine Haut darf durchstechen), glaetten, Gewichte vom Koerper uebertragen
 4. Knochenbezogen speichern: je Ecke die zwei wichtigsten Knochen mit Lage entlang des Knochens, Winkel um ihn und
    Abstand zur Koerperoberflaeche. Im Spiel (src/r3d-rigged.js) legt sich das Teil damit ueber Querschnittsprofile
    an jeden Koerper mit gleichen Knochennamen an, schlank oder breit. Dazu die belegten Felder je Knochen, unter
    denen die Haut ausgeblendet wird.
gen_pack.py nimmt die Teile aus dem Unterordner "teile" des npz-Ordners in den gemeinsamen Teil "pieces" auf.
"""
import argparse
import json
import os
import re
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meshy as M  # noqa: E402

NT, NA = 12, 24          # Felder entlang des Knochens und um ihn herum
T0, T1 = -0.25, 1.25     # betrachteter Bereich entlang des Knochens (0 = Gelenk, 1 = Folgegelenk)
REGION = {
    "brust": (["hips", "spine", "chest", "clavicle.L", "clavicle.R"], None),
    "handschuhe": (["hand.L", "hand.R", "forearm.L", "forearm.R"], {"forearm": 0.45}),
    "stiefel": (["foot.L", "foot.R", "toe.L", "toe.R", "shin.L", "shin.R"], {"shin": 0.45}),
    "helm": (["head"], None),
    "hose": (["hips", "thigh.L", "thigh.R", "shin.L", "shin.R"], None),
}


# ---------- Knochenrahmen und Querschnittsprofile (gleiches Verfahren wie in src/r3d-rigged.js) ----------
def frames(rest, parents, names=None):
    """Je Knochen: Gelenk P, Achse a, Laenge L, Querachsen u und v. Endknochen ohne eigene Kinder ("HeadTop_End",
    "LeftToe_End") zaehlen nicht als Fortsetzung, sonst haengt die Laenge davon ab, ob ein Modell sie mitbringt
    (gleiche Regel in src/r3d-rigged.js)."""
    n = len(parents)
    kids = [[c for c in range(n) if parents[c] == i] for i in range(n)]
    if names:
        kids = [[c for c in k if kids[c] or not re.search(r"end$", names[c], re.I)] for k in kids]
    out = []
    for i in range(n):
        P = rest[i]
        pd = rest[i] - rest[parents[i]] if parents[i] >= 0 else np.array([0.0, 1.0, 0.0])
        pl = np.linalg.norm(pd)
        pd = pd / pl if pl > 1e-6 else np.array([0.0, 1.0, 0.0])
        best, E = -2.0, None
        for c in kids[i]:
            d = rest[c] - P
            ln = np.linalg.norm(d)
            if ln < 1e-4:
                continue
            s = (d / ln) @ pd
            if s > best:
                best, E = s, rest[c]
        if E is None:
            E = P + pd * max(0.05, 0.5 * pl)
        a = E - P
        L = max(np.linalg.norm(a), 1e-4)
        a = a / L
        ref = np.array([0.0, 0.0, 1.0]) if abs(a[2]) < 0.9 else np.array([0.0, 1.0, 0.0])
        u = ref - a * (ref @ a)
        u /= np.linalg.norm(u)
        v = np.cross(a, u)
        out.append((P, a, L, u, v))
    return out


def tad(F, x):
    P, a, L, u, v = F
    r = x - P
    t = (r @ a) / L
    rr = r - np.outer(t * L, a) if r.ndim > 1 else r - a * (t * L)
    th = np.arctan2(rr @ v, rr @ u)
    d = np.linalg.norm(rr, axis=-1)
    return t, th, d


def bins(t, th):
    ti = np.clip(np.floor((t - T0) / (T1 - T0) * NT), 0, NT - 1).astype(int)
    ai = (np.floor((th + np.pi) / (2 * np.pi) * NA).astype(int)) % NA
    return ti, ai


def profiles(pos, skin_i, skin_w, rest, parents, names=None):
    """Groesster Abstand der Koerperoberflaeche von der Knochenachse je Feld, Luecken aufgefuellt."""
    Fr = frames(rest, parents, names)
    nb = len(parents)
    W = np.zeros((len(pos), nb))
    for k in range(4):
        np.add.at(W, (np.arange(len(pos)), skin_i[:, k]), skin_w[:, k] / 255.0)
    prof = np.zeros((nb, NT, NA))
    for b in range(nb):
        sel = W[:, b] >= 0.35
        if not sel.any():
            continue
        t, th, d = tad(Fr[b], pos[sel])
        ti, ai = bins(t, th)
        np.maximum.at(prof[b], (ti, ai), d)
        prof[b] = fill(prof[b])
    return prof


def fill(R):
    R = R.copy()
    for _ in range(NT + NA):
        empty = R <= 0
        if not empty.any():
            break
        nb = np.stack([np.roll(R, 1, 1), np.roll(R, -1, 1), np.vstack([R[:1], R[:-1]]), np.vstack([R[1:], R[-1:]])])
        cnt = (nb > 0).sum(0)
        avg = np.where(cnt > 0, nb.sum(0) / np.maximum(cnt, 1), 0)
        R[empty] = avg[empty]
    if (R <= 0).all():
        return R
    sm = (np.roll(R, 1, 1) + 2 * R + np.roll(R, -1, 1)) / 4
    return np.maximum(sm, R * 0.97)


def sample(R, t, th):
    ft = np.clip((t - T0) / (T1 - T0) * NT - 0.5, 0, NT - 1)
    fa = ((th + np.pi) / (2 * np.pi) * NA - 0.5) % NA
    t0 = np.floor(ft).astype(int)
    t1 = np.minimum(t0 + 1, NT - 1)
    a0 = np.floor(fa).astype(int) % NA
    a1 = (a0 + 1) % NA
    wt, wa = ft - t0, fa - np.floor(fa)
    return (R[t0, a0] * (1 - wa) + R[t0, a1] * wa) * (1 - wt) + (R[t1, a0] * (1 - wa) + R[t1, a1] * wa) * wt


# ---------- Teil laden ----------
def static_parts(path):
    g = M.load(path)
    parts = []
    for ni, node in enumerate(g.nodes):
        if "mesh" not in node:
            continue
        Wm = g.world(ni)
        for prim in g.j["meshes"][node["mesh"]]["primitives"]:
            if prim.get("mode", 4) != 4:
                continue
            at = prim["attributes"]
            pos = g.accessor(at["POSITION"]).astype(np.float64)
            img, fac, tc = g.base_color(prim.get("material"))
            uvk = "TEXCOORD_%d" % tc
            uv = g.accessor(at[uvk]).astype(np.float64) if uvk in at else np.zeros((len(pos), 2))
            idx = g.accessor(prim["indices"])[:, 0].astype(np.int64) if "indices" in prim else np.arange(len(pos))
            wp = (np.c_[pos, np.ones(len(pos))] @ Wm.T)[:, :3]
            parts.append(dict(pos=wp, uv=uv, idx=idx.reshape(-1, 3), img=img, fac=fac))
    if not parts:
        raise SystemExit("Keine Dreiecksnetze im Teil gefunden: " + path)
    return g, parts


def glove_axis(P):
    """Einzelnen Handschuh entlang des Arms legen (T-Haltung: linke Hand zeigt nach +X). Die Hauptachse des Teils wird
    zur X-Achse, das breitere Ende (Hand) nach aussen. Sitzt er verkehrt herum: --flip."""
    c = P - P.mean(0)
    _, _, vt = np.linalg.svd(c, full_matrices=False)
    m = vt[0]
    s = c @ m
    lo, hi = np.quantile(s, 0.15), np.quantile(s, 0.85)
    rad = lambda sel: np.linalg.norm(c[sel] - np.outer(s[sel], m), axis=1).mean()  # noqa: E731
    if rad(s <= lo) > rad(s >= hi):
        m = -m
    x = np.array([1.0, 0.0, 0.0])
    return rot_to(m, x)


def rot_to(a, b):
    a = a / np.linalg.norm(a)
    v = np.cross(a, b)
    c = float(a @ b)
    if c < -0.9999:
        return np.diag([-1.0, 1.0, -1.0])
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx / (1 + c)


def euler(deg):
    x, y, z = np.radians(deg)
    Rx = np.array([[1, 0, 0], [0, np.cos(x), -np.sin(x)], [0, np.sin(x), np.cos(x)]])
    Ry = np.array([[np.cos(y), 0, np.sin(y)], [0, 1, 0], [-np.sin(y), 0, np.cos(y)]])
    Rz = np.array([[np.cos(z), -np.sin(z), 0], [np.sin(z), np.cos(z), 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


# ---------- Anpassen mit Blender ----------
def fit_blender(bpos, bidx, bW, ppos, ptri, offset):
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)

    def mk(name, V, F):
        me = bpy.data.meshes.new(name)
        me.from_pydata(V.tolist(), [], F.tolist())
        me.update()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob
    body = mk("koerper", bpos, bidx)
    nb = bW.shape[1]
    for b in range(nb):
        vg = body.vertex_groups.new(name="b%d" % b)
        nz = np.nonzero(bW[:, b] > 1e-3)[0]
        for v in nz:
            vg.add([int(v)], float(bW[v, b]), "REPLACE")
    # Teil: Ecken an gleicher Stelle zusammenfassen, damit das Schieben keine Risse erzeugt
    key = np.round(ppos / 1e-5).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    piece = mk("teil", ppos[first], inv[ptri])

    def apply(ob, mod):
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for off, it in ((offset * 1.4, 0), (offset, 4)):
        sw = piece.modifiers.new("aussen", "SHRINKWRAP")
        sw.target = body
        sw.wrap_method = "NEAREST_SURFACEPOINT"
        sw.wrap_mode = "OUTSIDE"
        sw.offset = off
        apply(piece, sw)
        if it:
            sm = piece.modifiers.new("glatt", "CORRECTIVE_SMOOTH")
            sm.iterations = it
            apply(piece, sm)
    for b in range(nb):
        piece.vertex_groups.new(name="b%d" % b)
    dt = piece.modifiers.new("gewichte", "DATA_TRANSFER")
    dt.object = body
    dt.use_vert_data = True
    dt.data_types_verts = {"VGROUP_WEIGHTS"}
    dt.vert_mapping = "POLYINTERP_NEAREST"
    dt.layers_vgroup_select_src = "ALL"
    dt.layers_vgroup_select_dst = "NAME"
    apply(piece, dt)
    me = piece.data
    V = np.array([v.co[:] for v in me.vertices])
    W = np.zeros((len(V), nb))
    gi = {g.index: int(g.name[1:]) for g in piece.vertex_groups}
    for v in me.vertices:
        for ge in v.groups:
            W[v.index, gi[ge.group]] = ge.weight
    # zurueck auf die geteilten Ecken (UV-Naehte)
    return V[inv], W[inv]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("body")
    ap.add_argument("piece")
    ap.add_argument("--slot", required=True, choices=sorted(REGION))
    ap.add_argument("--name")
    ap.add_argument("--forms", default="")
    ap.add_argument("--rot", default="auto", help="Drehung in Grad um X,Y,Z oder auto (Handschuh entlang des Arms)")
    ap.add_argument("--flip", action="store_true", help="Teil umdrehen, falls es verkehrt herum sitzt")
    ap.add_argument("--pad", type=float, default=0.02)
    ap.add_argument("--offset", type=float, default=0.012)
    ap.add_argument("--tris", type=int, default=4000)
    ap.add_argument("--tex", type=int, default=512)
    ap.add_argument("--paar", action="store_true")
    a = ap.parse_args()

    z = np.load(a.body)
    meta = json.loads(str(z["meta"]))
    names, parents, tmap = meta["names"], meta["parents"], meta["map"]
    bpos, bidx = z["pos"].astype(np.float64), z["idx"]
    si, sw = z["skin_i"].astype(np.int64), z["skin_w"].astype(np.float64)
    rest = z["rest"].astype(np.float64)
    nb = len(names)
    bW = np.zeros((len(bpos), nb))
    for k in range(4):
        np.add.at(bW, (np.arange(len(bpos)), si[:, k]), sw[:, k] / 255.0)
    Fr = frames(rest, parents, names)

    # Teil laden, drehen, Textur, Reduzieren
    g, parts = static_parts(a.piece)
    tex = M.atlas(g, parts, a.tex)
    ppos = np.concatenate([p["pos"] for p in parts])
    if a.rot == "auto":
        R0 = np.eye(3)
        if a.slot == "handschuhe":
            R0 = glove_axis(ppos)
    else:
        R0 = euler([float(x) for x in a.rot.split(",")])
    if a.flip:
        R0 = np.diag([-1.0, 1.0, -1.0]) @ R0
    ppos = ppos @ R0.T
    puv = np.concatenate([p["uv_game"] for p in parts])
    base = np.cumsum([0] + [len(p["pos"]) for p in parts])[:-1]
    ptri = np.concatenate([p["idx"] + b for p, b in zip(parts, base)])
    if len(ptri) > a.tris * 1.05:
        one = np.zeros((len(ppos), 1), np.int64)
        ppos, puv, ptri, _, _ = M.decimate(ppos, puv, ptri, one, np.ones((len(ppos), 1)), a.tris)

    # Koerperbereich des Platzes
    roles, partial = REGION[a.slot]
    partial = partial or {}

    def region(side=None):
        sel = np.zeros(len(bpos), bool)
        for r in roles:
            if side and r.endswith("." + ("R" if side == "L" else "L")):
                continue
            b = tmap[r]
            m = bW[:, b] >= 0.4
            base_r = r.split(".")[0]
            if base_r in partial:
                t, _, _ = tad(Fr[b], bpos)
                m &= t >= partial[base_r]
            if r == "hips" and a.slot == "brust":
                m &= bpos[:, 1] >= rest[tmap["hips"]][1] - 0.02
            sel |= m
        if not sel.any():
            raise SystemExit("Kein Koerperbereich fuer " + a.slot)
        return bpos[sel]

    def place(P, reg):
        lo, hi = P.min(0), P.max(0)
        # Ausmass des Koerperbereichs ohne Ausreisser (einzelne Ecken mit Gewicht nahe der Koerpermitte)
        rlo, rhi = np.percentile(reg, 2, axis=0) - a.pad, np.percentile(reg, 98, axis=0) + a.pad
        s = (rhi - rlo) / np.maximum(hi - lo, 1e-6)
        return (P - (lo + hi) / 2) * s + (rlo + rhi) / 2

    paired = a.slot in ("handschuhe", "stiefel")
    single = paired and (a.paar or np.ptp(ppos[:, 0]) < 0.6 * np.ptp(region()[:, 0]))
    if single:
        L = place(ppos, region("L"))
        Rr = L * np.array([-1.0, 1.0, 1.0])
        ppos = np.concatenate([L, Rr])
        n0 = len(L)
        ptri = np.concatenate([ptri, ptri[:, ::-1] + n0])
        puv = np.concatenate([puv, puv])
    else:
        ppos = place(ppos, region())

    # Anpassen und Gewichte
    fpos, fW = fit_blender(bpos, bidx, bW, ppos, ptri, a.offset)
    if paired:
        # jeder Handschuh und Stiefel folgt nur den Knochen seiner Seite; sonst ziehen Gewichte vom anderen Bein die
        # Innenseite beim Gehen quer hinueber
        side = np.r_[np.ones(n0), -np.ones(len(fpos) - n0)] if single else np.sign(fpos[:, 0] + 1e-9)
        other = side[:, None] * rest[None, :, 0] < -0.02
        fW = np.where(other, 0.0, fW)
        empty = fW.sum(1) < 1e-6
        if empty.any():
            own = [tmap[r] for r in roles if not r.endswith((".L", ".R"))] or [tmap[roles[0]]]
            for i in np.nonzero(empty)[0]:
                cand = [tmap[r] for r in roles if r.endswith(".L" if side[i] > 0 else ".R")] or own
                fW[i, min(cand, key=lambda b: np.linalg.norm(rest[b] - fpos[i]))] = 1.0
    order = np.argsort(-fW, axis=1)[:, :2]
    w2 = np.take_along_axis(fW, order, axis=1)
    w2 = np.where(w2.sum(1, keepdims=True) > 1e-6, w2 / np.maximum(w2.sum(1, keepdims=True), 1e-9), np.array([1.0, 0.0]))

    # Knochenbezogene Beschreibung gegen das Profil des Referenzkoerpers
    prof = profiles(bpos, si, z["skin_w"].astype(np.float64), rest, parents, names)
    enc = np.zeros((len(fpos), 2, 4))
    for k in range(2):
        for b in np.unique(order[:, k]):
            m = order[:, k] == b
            t, th, d = tad(Fr[b], fpos[m])
            enc[m, k, 0] = b
            enc[m, k, 1] = t
            enc[m, k, 2] = th
            enc[m, k, 3] = d - sample(prof[b], t, th)
    # belegte Felder je Knochen (Haut darunter ausblenden), um ein Feld erweitert
    occ = {}
    for b in np.unique(order[:, 0]):
        m = (order[:, 0] == b) & (w2[:, 0] >= 0.35)
        if not m.any():
            continue
        t, th, _ = tad(Fr[b], fpos[m])
        ti, ai = bins(t, th)
        grid = np.zeros((NT, NA), bool)
        grid[ti, ai] = True
        grid = grid | np.roll(grid, 1, 1) | np.roll(grid, -1, 1)
        grid = grid | np.vstack([grid[:1], grid[:-1]]) | np.vstack([grid[1:], grid[-1:]])
        occ[names[b]] = grid.astype(np.uint8)

    used = sorted(set(order.ravel().tolist()))
    remap = {b: i for i, b in enumerate(used)}
    enc_b = np.vectorize(lambda b: remap[int(b)])(enc[:, :, 0].astype(int))
    name = a.name or os.path.splitext(os.path.basename(a.piece))[0]
    pmeta = {"name": name, "slot": a.slot, "forms": [f for f in a.forms.split(",") if f], "bones": [names[b] for b in used],
             "nt": NT, "na": NA, "t0": T0, "t1": T1, "ref": os.path.splitext(os.path.basename(a.body))[0], "occ": sorted(occ)}
    np.savez_compressed(a.out, kind="piece", pos=fpos.astype(np.float32), uv=puv.astype(np.float32), idx=ptri.astype(np.int32),
                        bone=enc_b.astype(np.uint8), tto=enc[:, :, 1:].astype(np.float32), w=w2.astype(np.float32), tex=tex.astype(np.uint8),
                        occ=np.stack([occ[k] for k in sorted(occ)]) if occ else np.zeros((0, NT, NA), np.uint8), meta=json.dumps(pmeta, ensure_ascii=False))
    print("Teil", name, "(", a.slot, "):", len(fpos), "Ecken,", len(ptri), "Dreiecke,", len(used), "Knochen,", a.out)


if __name__ == "__main__":
    main()
