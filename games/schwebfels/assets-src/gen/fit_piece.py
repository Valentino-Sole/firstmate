"""Ruestungsteil (einzeln erzeugte GLB, z. B. von Meshy) fuer Figuren mit eigenem Skelett vorbereiten.

Aufruf:
  python fit_piece.py <ausgabe.npz> <referenzkoerper.npz> <teil.glb> --slot brust|robe|umhang|handschuhe|stiefel|helm|hose
                      [--name harnisch_eisen] [--forms harnisch.0,harnisch] [--rot 0,0,90] [--pad 0.02]
                      [--tris 4000] [--tex 512] [--paar] [--flip] [--offset 0.012] [--kopf box|oben] [--kultur midgard]

Der Referenzkoerper ist eine npz-Datei aus meshy_import.py (Art "rig"). Schritte:
 1. Teil laden (alle Netze, Textur als Atlas), optional drehen (--rot in Grad um X, Y, Z) und reduzieren
 2. Auf den Koerperbereich des Platzes ausrichten (Brust: Huefte bis Schultern, Handschuhe: Hand und halber
    Unterarm, Stiefel: Fuss und halbes Schienbein, Helm: Kopf, Hose: Huefte und Beine, Robe: Rumpf und Oberschenkel bis
    zum Knie, gilt im Spiel als Brustteil; Umhang: wie Robe, haengt aber nur an Rumpf und Hals und blendet keine Haut
    aus); --paar spiegelt ein einzelnes Teil auf die andere Seite. Kopfteile, die nicht den ganzen Kopf umschliessen
    (Kappe, Krone), mit --kopf oben: gleichmaessig nach der Breite oben am Kopf skaliert und oben angelegt
 3. Vom Koerper freistellen: Kopfteile wachsen als Ganzes, bis der Kopf darin Platz hat; danach werden Ecken, die
    noch in der Haut liegen, samt ihrer Umgebung nach aussen geschoben (Innen- und Aussenseite duenner Stoffe bewegen
    sich gemeinsam, nichts zerknittert); Gewichte vom Koerper uebertragen (Blender). Die Farbe wird vorher auf neue,
    grosse Texturinseln aufgebacken (rebake.py), Meshys zerstueckelte Texturaufteilung wuerde verkleinert fleckig
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
import meshy_import as M  # noqa: E402
import rebake as RB  # noqa: E402

NT, NA = 12, 24          # Felder entlang des Knochens und um ihn herum
T0, T1 = -0.25, 1.25     # betrachteter Bereich entlang des Knochens (0 = Gelenk, 1 = Folgegelenk)
REGION = {
    "brust": (["hips", "spine", "chest", "clavicle.L", "clavicle.R"], None),
    "handschuhe": (["hand.L", "hand.R", "forearm.L", "forearm.R"], {"forearm": 0.45}),
    "stiefel": (["foot.L", "foot.R", "toe.L", "toe.R", "shin.L", "shin.R"], {"shin": 0.45}),
    "helm": (["head"], None),
    "hose": (["hips", "thigh.L", "thigh.R", "shin.L", "shin.R"], None),
    "robe": (["hips", "spine", "chest", "clavicle.L", "clavicle.R", "thigh.L", "thigh.R"], None),
    "umhang": (["hips", "spine", "chest", "clavicle.L", "clavicle.R", "thigh.L", "thigh.R"], None),
}
# Knochen, an denen ein Umhang haengt (keine Beine und Arme, sonst zoegen die Beine ihn beim Gehen auseinander)
CAPE_BONES = ["hips", "spine", "chest", "neck", "clavicle.L", "clavicle.R"]
# Platz im Spiel (src/r3d-rigged.js, SLOT): eine Robe ersetzt wie ein Brustteil die Ruestung
GAME_SLOT = {"robe": "brust"}


# ---------- Knochenrahmen und Querschnittsprofile (gleiches Verfahren wie in src/r3d-rigged.js) ----------
def frames(rest, parents, names=None, pos=None, dom=None):
    """Je Knochen: Gelenk P, Achse a, Laenge L, Querachsen u und v. Endknochen ohne eigene Kinder ("HeadTop_End",
    "LeftToe_End") zaehlen nicht als Fortsetzung, sonst haengt die Laenge davon ab, ob ein Modell sie mitbringt; ebenso
    Hilfsknochen vor dem Gesicht ("headfront"), sonst zeigte die Kopfachse nach vorn und ihre Laenge schwankte je
    Figur zwischen 5 und 25 cm. Knochen ohne Fortsetzung (Kopf, Hand, Zehen) bekommen mit Koerperecken (pos, dom:
    wichtigster Knochen je Ecke) die Ausdehnung ihrer Ecken entlang der Richtung vom Elternknochen als Laenge
    (gleiche Regel in src/r3d-rigged.js)."""
    n = len(parents)
    kids = [[c for c in range(n) if parents[c] == i] for i in range(n)]
    if names:
        kids = [[c for c in k if kids[c] or not re.search(r"(end|front)$", names[c], re.I)] for k in kids]
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
            ext = 0.5 * pl
            if pos is not None:
                sel = dom == i
                if sel.sum() >= 20:
                    ext = float(np.percentile((pos[sel] - P) @ pd, 98))
            E = P + pd * max(0.05, ext)
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
    Fr = frames(rest, parents, names, pos, skin_i[:, 0])
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
            parts.append(dict(pos=wp, uv=uv, idx=idx.reshape(-1, 3), img=img, fac=fac, nimg=g.normal_tex(prim.get("material"))))
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
def covered_occ(bpos, bidx, bW, Fr, fpos, ptri, bones, names, reach=0.09, share=0.5, face=None):
    """Felder, deren Haut zum groessten Teil vom Teil ueberdeckt ist: Strahl von jeder Hautecke entlang ihrer Normalen
    nach aussen (bis reach Meter); ein Feld gilt als belegt, wenn mindestens share seiner Ecken getroffen werden."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromPolygons([Vector(p) for p in fpos], [tuple(int(i) for i in f) for f in ptri])
    fn = np.cross(bpos[bidx[:, 1]] - bpos[bidx[:, 0]], bpos[bidx[:, 2]] - bpos[bidx[:, 0]])
    vn = np.zeros_like(bpos)
    for k in range(3):
        np.add.at(vn, bidx[:, k], fn)
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-12)
    occ = {}
    for b in bones:
        m = np.nonzero(bW[:, b] >= 0.35)[0]
        if not len(m):
            continue
        hit = np.array([tree.ray_cast(Vector(bpos[i] + vn[i] * 0.002), Vector(vn[i]), reach)[0] is not None for i in m])
        t, th, _ = tad(Fr[b], bpos[m])
        ti, ai = bins(t, th)
        cnt = np.zeros((NT, NA))
        got = np.zeros((NT, NA))
        np.add.at(cnt, (ti, ai), 1)
        np.add.at(got, (ti, ai), hit)
        grid = (cnt > 0) & (got >= share * np.maximum(cnt, 1))
        if face is not None and b == face:
            # Gesicht (vorn, unterhalb der Stirn) nie ausblenden: unter Masken und Visieren saehe man sonst durch die
            # Augenloecher ins Leere; das Teil liegt ohnehin ausserhalb der Haut
            tc = T0 + (np.arange(NT) + 0.5) * (T1 - T0) / NT
            ac = -np.pi + (np.arange(NA) + 0.5) * 2 * np.pi / NA
            grid &= ~((tc[:, None] < 0.6) & (np.abs(ac)[None, :] < np.radians(75)))
        occ[names[b]] = grid.astype(np.uint8)
        print("Haut ueberdeckt (", names[b], "):", int(hit.sum()), "von", len(m), "Ecken,", int(grid.sum()), "Felder")
    return occ


def signed_dist(tree, P):
    """Abstand jeder Ecke zur Koerperoberflaeche (negativ: innen) und die Flaechennormale an der naechsten Stelle."""
    from mathutils import Vector
    sd = np.zeros(len(P))
    nrm = np.zeros((len(P), 3))
    for i, p in enumerate(P):
        loc, n, _, d = tree.find_nearest(Vector(p))
        if loc is None:
            sd[i], nrm[i] = 1.0, (0.0, 1.0, 0.0)
            continue
        nrm[i] = n[:]
        sd[i] = d if np.dot(p - np.array(loc[:]), nrm[i]) >= 0 else -d
    return sd, nrm


def push_out(V, tree, offset, radius, rounds=3):
    """Ecken, die naeher als offset an der Haut oder darin liegen, nach aussen schieben; der Schub wirkt mit
    abnehmender Staerke auch auf alle Ecken im Umkreis radius. So bewegen sich Innen- und Aussenseite duenner Stoffe
    gemeinsam und keine innere Lage stoesst durch die aeussere (vorher: jede Ecke einzeln, die Teile zerknitterten)."""
    from scipy.spatial import cKDTree
    V = V.copy()
    for _ in range(rounds):
        sd, nrm = signed_dist(tree, V)
        need = np.maximum(0.0, offset - sd)
        hot = np.nonzero(need > 1e-4)[0]
        if not len(hot):
            break
        kd = cKDTree(V[hot])
        disp = np.zeros_like(V)
        best = np.zeros(len(V))
        for j, nb in enumerate(kd.query_ball_point(V, radius)):
            if not nb:
                continue
            nb = np.array(nb)
            d = np.linalg.norm(V[hot[nb]] - V[j], axis=1)
            # bis zur halben Reichweite voller Schub (die naechste Stofflage geht ganz mit), danach abnehmend
            w = need[hot[nb]] * np.clip(2 * (1 - d / radius), 0, 1)
            k = int(np.argmax(w))
            if w[k] > best[j]:
                best[j] = w[k]
                disp[j] = nrm[hot[nb[k]]] * w[k]
        V += disp
    return V


def fit_blender(bpos, bidx, bW, ppos, ptri, offset, rigid=None, push=True):
    """Teil vom Koerper freistellen und Gewichte uebertragen. rigid: Mittelpunkt, um den das Teil als Ganzes
    gleichmaessig waechst (hoechstens 9 %), bis es fast ganz ausserhalb liegt (Helme, Kapuzen, Masken behalten so ihre Form);
    sonst und danach werden die restlichen Ecken mit ihrer Umgebung nach aussen geschoben (push_out)."""
    import bpy
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
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
    tree = BVHTree.FromPolygons([Vector(p) for p in bpos], [tuple(int(i) for i in f) for f in bidx])
    # Ecken an gleicher Stelle (Texturnaehte) gemeinsam bewegen
    key = np.round(ppos / 1e-5).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    V = ppos[first].copy()
    if rigid is not None:
        c = np.asarray(rigid, np.float64)
        for _ in range(6):
            sd, _ = signed_dist(tree, V)
            if (sd < offset * 0.5).mean() < 0.03:
                break
            V = c + (V - c) * 1.015
    if push:
        V = push_out(V, tree, offset, max(0.03, 3 * offset))
    piece = mk("teil", V, inv[ptri])

    def apply(ob, mod):
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
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
    ap.add_argument("--seltenheit", default="", help="nur fuer diese Seltenheiten, z. B. episch,legendaer")
    ap.add_argument("--kultur", default="", help="nur fuer Gegenstaende dieser Gestaltungskultur (midgard, albion, hibernia)")
    ap.add_argument("--rot", default="auto", help="Drehung in Grad um X,Y,Z oder auto (Handschuh entlang des Arms)")
    ap.add_argument("--flip", action="store_true", help="Teil umdrehen, falls es verkehrt herum sitzt")
    ap.add_argument("--pad", type=float, default=0.02)
    ap.add_argument("--offset", type=float, default=0.012)
    ap.add_argument("--tris", type=int, default=4000)
    ap.add_argument("--tex", type=int, default=768)
    ap.add_argument("--ohne-backen", action="store_true", help="Meshys Texturaufteilung behalten (fleckig, wenn verkleinert)")
    ap.add_argument("--paar", action="store_true")
    ap.add_argument("--kopf", default="box", choices=["box", "oben"], help="Kopfteil: ganzen Kopfbereich fuellen oder oben anlegen (Kappe, Krone)")
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
    Fr = frames(rest, parents, names, bpos, si[:, 0])

    # Teil laden, drehen, Textur, Reduzieren
    g, parts = static_parts(a.piece)
    # Farbe in voller Groesse; nach dem Reduzieren auf neue Texturkoordinaten aufgebacken (rebake.py)
    tex = M.atlas(g, parts, a.tex if a.ohne_backen else 2048)
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
    if not a.ohne_backen:
        from PIL import Image
        ppos, puv, ptri, tex = RB.rebake(ppos, puv, ptri, Image.fromarray(tex), a.tris, a.tex)
        g.atlas_normal = None  # die Normalenkarte passt nicht zu den neuen Texturkoordinaten
    elif len(ptri) > a.tris * 1.05:
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

    def place_top(P, reg):
        """Kappe oder Krone: gleichmaessig so gross, dass sie oben am Kopf (oberste 7 cm) mit a.pad Abstand anliegt;
        die Mitte ihrer Oberkante sitzt auf dem Scheitel."""
        top = np.percentile(reg[:, 1], 99)
        band = reg[reg[:, 1] > top - 0.07]
        hw = np.percentile(band[:, 0], 98) - np.percentile(band[:, 0], 2)
        cx, cz = (np.percentile(band[:, 0], 98) + np.percentile(band[:, 0], 2)) / 2, (np.percentile(band[:, 2], 98) + np.percentile(band[:, 2], 2)) / 2
        lo, hi = P.min(0), P.max(0)
        mid = np.abs(P[:, 0] - (lo[0] + hi[0]) / 2) < 0.25 * (hi[0] - lo[0])
        ptop = P[mid, 1].max()
        pb = P[P[:, 1] > ptop - 0.3 * (hi[1] - lo[1])]
        pw = np.percentile(pb[:, 0], 98) - np.percentile(pb[:, 0], 2)
        s = (hw + 2 * a.pad) / max(pw, 1e-6)
        pcx, pcz = (np.percentile(pb[:, 0], 98) + np.percentile(pb[:, 0], 2)) / 2, (np.percentile(pb[:, 2], 98) + np.percentile(pb[:, 2], 2)) / 2
        return (P - np.array([pcx, ptop, pcz])) * s + np.array([cx, top + a.pad * 0.5, cz])

    def place(P, reg):
        if a.slot == "helm" and a.kopf == "oben":
            return place_top(P, reg)
        lo, hi = P.min(0), P.max(0)
        if a.slot == "helm":
            # Kopfteile behalten ihre Form: ein Mass fuer alle Richtungen aus Breite und Tiefe des Schaedels (obere
            # 55 % des Kopfes, ohne Bart und Kinn) gegen Breite und Tiefe der oberen Haelfte des Teils; Oberkante auf
            # dem Scheitel, Mitte ueber der Schaedelmitte. fit_blender laesst es danach hoechstens wenig wachsen.
            top = np.percentile(reg[:, 1], 98)
            bot = np.percentile(reg[:, 1], 2)
            cr = reg[reg[:, 1] > top - 0.55 * (top - bot)]
            clo, chi = np.percentile(cr, 2, axis=0), np.percentile(cr, 98, axis=0)
            up = P[P[:, 1] > hi[1] - 0.5 * (hi[1] - lo[1])]
            ulo, uhi = np.percentile(up, 2, axis=0), np.percentile(up, 98, axis=0)
            sc = float(np.mean([(chi[0] - clo[0] + 2 * a.pad) / max(uhi[0] - ulo[0], 1e-6), (chi[2] - clo[2] + 2 * a.pad) / max(uhi[2] - ulo[2], 1e-6)]))
            Q = (P - (ulo + uhi) / 2) * sc
            return Q + np.array([(clo[0] + chi[0]) / 2, top + a.pad - Q[:, 1].max(), (clo[2] + chi[2]) / 2])
        # Ausmass des Koerperbereichs ohne Ausreisser (einzelne Ecken mit Gewicht nahe der Koerpermitte)
        rlo, rhi = np.percentile(reg, 2, axis=0) - a.pad, np.percentile(reg, 98, axis=0) + a.pad
        s = (rhi - rlo) / np.maximum(hi - lo, 1e-6)
        if a.slot == "umhang":
            # ein Umhang ist duenner als der Rumpf tief: Tiefe im gleichen Mass wie die Breite
            s[2] = s[0]
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
    if a.slot == "helm" and a.kopf == "box":
        hreg = region()
        rigid = (np.percentile(hreg, 2, axis=0) + np.percentile(hreg, 98, axis=0)) / 2
    else:
        rigid = None
    # Umhaenge haengen frei: nicht schieben (zerknitterte sonst Fell und Saeume); das Spiel hebt sie gleichmaessig
    # vom Ruecken ab (cloakGeo in src/r3d-rigged.js)
    fpos, fW = fit_blender(bpos, bidx, bW, ppos, ptri, a.offset, rigid, push=a.slot != "umhang")
    if a.slot == "umhang":
        keep = np.zeros(nb, bool)
        keep[[tmap[r] for r in CAPE_BONES if r in tmap]] = True
        fW = np.where(keep[None, :], fW, 0.0)
        empty = fW.sum(1) < 1e-6
        if empty.any():
            # tief haengende Ecken (unter der Huefte) folgen der Huefte
            fW[empty, tmap["hips"]] = 1.0
    if paired and not single:
        # ein Paar aus einem Guss: Dreiecke, die beide Seiten verbinden (Schnuersenkel, Steg zwischen den Stiefeln), weg;
        # sie wuerden beim Gehen quer gezogen
        sgn = np.sign(fpos[:, 0] + 1e-9)
        keep = (sgn[ptri[:, 0]] == sgn[ptri[:, 1]]) & (sgn[ptri[:, 1]] == sgn[ptri[:, 2]])
        if not keep.all():
            print("Verbindung zwischen links und rechts entfernt:", int((~keep).sum()), "Dreiecke")
            ptri = ptri[keep]
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
    # belegte Felder je Knochen (Haut darunter ausblenden), um ein Feld erweitert. Helme mit offenem Gesicht
    # (Nasen- und Wangenschutz) wuerden so das ganze Gesicht belegen: dort gilt ein Feld nur als belegt, wenn der Helm
    # die Haut darin wirklich ueberdeckt (Strahl von der Haut nach aussen trifft den Helm)
    occ = covered_occ(bpos, bidx, bW, Fr, fpos, ptri, [tmap[r] for r in roles], names, face=tmap["head"]) if a.slot == "helm" else {}
    for b in np.unique(order[:, 0]):
        if a.slot in ("helm", "umhang"):
            break
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
    name = a.name or os.path.splitext(os.path.basename(a.out))[0]
    pmeta = {"name": name, "slot": GAME_SLOT.get(a.slot, a.slot), "forms": [f for f in a.forms.split(",") if f], "rarity": [r for r in a.seltenheit.split(",") if r], "culture": a.kultur, "bones": [names[b] for b in used],
             "nt": NT, "na": NA, "t0": T0, "t1": T1, "ref": os.path.splitext(os.path.basename(a.body))[0], "occ": sorted(occ)}
    np.savez_compressed(a.out, **M.normal_extra(g, tex), kind="piece", pos=fpos.astype(np.float32), uv=puv.astype(np.float32), idx=ptri.astype(np.int32),
                        bone=enc_b.astype(np.uint8), tto=enc[:, :, 1:].astype(np.float32), w=w2.astype(np.float32), tex=tex.astype(np.uint8),
                        occ=np.stack([occ[k] for k in sorted(occ)]) if occ else np.zeros((0, NT, NA), np.uint8), meta=json.dumps(pmeta, ensure_ascii=False))
    print("Teil", name, "(", a.slot, "):", len(fpos), "Ecken,", len(ptri), "Dreiecke,", len(used), "Knochen,", a.out)


if __name__ == "__main__":
    main()
