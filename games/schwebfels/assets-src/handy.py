"""Handy-Fassung: das ganze Spiel als eine einzige HTML-Datei von hoechstens etwa 30 MB.

Aufruf (Blender als Python-Modul, siehe CLAUDE.md "Werkzeuge in einer neuen Sitzung"):
  python handy.py <dist-ordner> <ausgabe.html> [--held 6000] [--monster 4000] [--tex 512] [--tex-monster 384]
                  [--kulisse 1024] [--ganz]

<dist-ordner> ist ein Bau wie zum Veroeffentlichen: schwebfels.html mit Inselbildern, daneben die Figurendateien
gen-*.js und kulissen.js. Die Seite laedt diese Dateien sonst einzeln nach; auf dem Handy liegt aber nur die eine
HTML-Datei, deshalb kommt hier alles hinein, als Skripte vor dem Spielcode (der Lader in src/r3d-assets.js findet die
Daten dort und laedt nichts mehr nach).

Damit die Datei klein genug bleibt:
 - Figuren mit Skelett (Art "rig") und Bestien bekommen weniger Dreiecke (--held fuer Heldenkoerper, --monster fuer
   Monster und Bestien). Einfach verkleinern geht nicht: Meshy legt fast jede Flaeche als eigene Insel ins Farbbild,
   beim Zusammenlegen verrutschen die Naehte (weisse Flecken, zerfranste Haare). Deshalb wie bake_lowpoly.py: in Blender
   verschweissen und verkleinern (Haende behalten mehr Dreiecke, sonst spreizen sich die Finger), neue
   Texturaufteilung, die Farbe vom Original aufbacken. Gewichte kommen ueber Knochengruppen mit, Normalen und Farben
   der Bestien von der naechsten Ecke des Originals.
 - Farbbilder werden kleiner (--tex, --tex-monster), Normalenkarten fallen weg (das Spiel kommt ohne aus).
 - Jedes Figurenpaket wird mit gzip verkleinert (das Spiel entpackt es selbst).
 - Kampfkulissen und Heime werden auf --kulisse Pixel Breite verkleinert.
--ganz bettet alles unveraendert ein (etwa 120 MB, fuer Rechner mit viel Speicher).
"""
import argparse
import base64
import glob
import gzip
import io
import json
import os
import re
import struct
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "gen"))
from pack import Pack  # noqa: E402

DT = {"f32": np.float32, "u8": np.uint8, "i8": np.int8, "u16": np.uint16, "i16": np.int16, "u32": np.uint32, "q16": np.int16, "uv16": np.uint16}
SZ = {k: np.dtype(v).itemsize for k, v in DT.items()}


def read_pack(b):
    assert b[:4] == b"SBP1", "kein Modellpaket"
    hl = struct.unpack("<I", b[4:8])[0]
    head = json.loads(b[8:8 + hl].decode("utf-8"))
    start = (8 + hl + 3) // 4 * 4
    return head, b[start:]


def is_ref(o):
    return isinstance(o, dict) and isinstance(o.get("$"), list)


def raw(data, ref):
    kind, off, n = ref["$"][0], ref["$"][1], ref["$"][2]
    return data[off:off + (n if kind == "img" else n * SZ[kind])]


def values(data, ref):
    r = ref["$"]
    a = np.frombuffer(raw(data, ref), DT[r[0]])
    if r[0] == "q16":
        return a.astype(np.float64) * r[3]
    if r[0] == "uv16":
        return a.astype(np.float64) / 65535
    return a


KEEP_FACTOR = 4.0  # Gewicht der Handgruppe beim Verkleinern
KEEP_INVERT = True


def fill_misses(px, hit):
    """Texel ohne Treffer von getroffenen Nachbarn auffuellen, Schritt fuer Schritt nach aussen (wie bake_lowpoly.py)."""
    filled = hit.copy()
    for _ in range(24):
        if filled.all():
            break
        acc = np.zeros_like(px)
        cnt = np.zeros(hit.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            m = np.roll(np.roll(filled, dy, 0), dx, 1)
            acc += np.roll(np.roll(px, dy, 0), dx, 1) * m[..., None]
            cnt += m
        grow = (~filled) & (cnt > 0)
        px[grow] = acc[grow] / cnt[grow][:, None]
        filled |= grow
    return px


def open_ratio(pos, idx):
    """Anteil offener Kanten nach dem Verschweissen (geschlossene Figuren: fast 0)."""
    key = np.round(pos / 1e-5).astype(np.int64)
    inv = np.unique(key, axis=0, return_inverse=True)[1].reshape(-1)
    F = inv[idx]
    E = np.sort(np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), axis=1)
    c = np.unique(E, axis=0, return_counts=True)[1]
    return float((c == 1).sum()) / max(1, len(c))


def rebake(pos, uv, idx, si, sw, tex, target, size, keep=None, head=False):
    """Weniger Dreiecke, neue Texturaufteilung, Farbe vom Original aufgebacken. keep: Gewicht je Ecke (0 bis 1) fuer
    Bereiche, die mehr Dreiecke behalten sollen. head: Inseln oben (Kopf, Gesicht) bekommen mehr Bildflaeche.
    Liefert Ecken, Texturkoordinaten, Dreiecke, vier Knochen und Gewichte je Ecke, das Farbbild (PIL) und je neuer
    Ecke die naechste Originalecke."""
    import bpy
    import bmesh
    import tempfile
    from scipy.spatial import cKDTree

    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    # Original mit seinem Farbbild
    me = bpy.data.meshes.new("original")
    me.from_pydata(pos.tolist(), [], idx.tolist())
    me.update()
    me.uv_layers.new(name="uv").data.foreach_set("uv", uv[idx].reshape(-1).astype(np.float32))
    hi = bpy.data.objects.new("original", me)
    sc.collection.objects.link(hi)
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    tmp.close()
    tex.convert("RGB").save(tmp.name)
    m0 = bpy.data.materials.new("original")
    m0.use_nodes = True
    t0 = m0.node_tree.nodes.new("ShaderNodeTexImage")
    t0.image = bpy.data.images.load(tmp.name)
    m0.node_tree.links.new(t0.outputs["Color"], m0.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
    me.materials.append(m0)

    # Spielfassung: verschweisst, mit Knochengruppen
    key = np.round(pos / 1e-5).astype(np.int64)
    _, weld, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    V = pos[weld]
    F = inv[idx]
    F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    me2 = bpy.data.meshes.new("spiel")
    me2.from_pydata(V.tolist(), [], F.tolist())
    me2.update()
    lo = bpy.data.objects.new("spiel", me2)
    sc.collection.objects.link(lo)
    nj = int(si.max()) + 1
    cnt = np.maximum(np.bincount(inv, minlength=len(V)), 1)
    Wv = np.zeros((len(V), nj))
    for k in range(si.shape[1]):
        np.add.at(Wv, (inv, si[:, k]), sw[:, k])
    Wv /= cnt[:, None]
    Wq = np.round(Wv * 1000) / 1000
    for j in range(nj):
        g = lo.vertex_groups.new(name="g%d" % j)
        col = Wq[:, j]
        for w in np.unique(col[col > 0]):
            g.add(np.nonzero(col == w)[0].tolist(), float(w), "REPLACE")
    if keep is not None:
        kv = np.zeros(len(V))
        np.add.at(kv, inv, keep)
        kv = np.round(kv / cnt * 100) / 100
        g = lo.vertex_groups.new(name="keep")
        for w in np.unique(kv[kv > 0]):
            g.add(np.nonzero(kv == w)[0].tolist(), float(w), "REPLACE")
    vl.objects.active = lo
    lo.select_set(True)
    mod = lo.modifiers.new("reduz", "DECIMATE")
    mod.ratio = min(1.0, target / len(F))
    mod.use_collapse_triangulate = True
    if keep is not None:
        mod.vertex_group = "keep"
        mod.invert_vertex_group = KEEP_INVERT
        mod.vertex_group_factor = KEEP_FACTOR
    bpy.ops.object.modifier_apply(modifier="reduz")

    # neue Texturaufteilung
    bpy.ops.object.select_all(action="DESELECT")
    lo.select_set(True)
    vl.objects.active = lo
    me2.uv_layers.new(name="UV")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.4, island_margin=0.004, area_weight=0.0, correct_aspect=True)
    bpy.ops.object.mode_set(mode="OBJECT")
    if head:
        bm = bmesh.new()
        bm.from_mesh(me2)
        uvl = bm.loops.layers.uv.active
        ys = [v.co.y for v in bm.verts]
        y0, y1 = min(ys), max(ys)
        seen = set()
        for f in bm.faces:
            if f.index in seen:
                continue
            # Insel ueber gemeinsame Kanten mit gleichen Texturkoordinaten sammeln
            isl, stack = [], [f]
            seen.add(f.index)
            while stack:
                x = stack.pop()
                isl.append(x)
                for lp in x.loops:
                    for o in lp.edge.link_loops:
                        if o.face.index in seen:
                            continue
                        a1, a2 = lp[uvl].uv, lp.link_loop_next[uvl].uv
                        b1, b2 = o[uvl].uv, o.link_loop_next[uvl].uv
                        if (a1 - b2).length < 1e-6 and (a2 - b1).length < 1e-6:
                            seen.add(o.face.index)
                            stack.append(o.face)
            cy = sum(x.calc_center_median().y for x in isl) / len(isl)
            if cy > y0 + 0.84 * (y1 - y0):
                loops = [lp for x in isl for lp in x.loops]
                cu = sum(lp[uvl].uv.x for lp in loops) / len(loops)
                cv = sum(lp[uvl].uv.y for lp in loops) / len(loops)
                for lp in loops:
                    lp[uvl].uv.x = cu + (lp[uvl].uv.x - cu) * 2.0
                    lp[uvl].uv.y = cv + (lp[uvl].uv.y - cv) * 2.0
        bm.to_mesh(me2)
        bm.free()
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Farbe aufbacken
    img = bpy.data.images.new("farbe", size, size, alpha=True)
    img.pixels[:] = np.zeros(size * size * 4, np.float32)
    m1 = bpy.data.materials.new("spiel")
    m1.use_nodes = True
    t1 = m1.node_tree.nodes.new("ShaderNodeTexImage")
    t1.image = img
    for n in m1.node_tree.nodes:
        n.select = False
    t1.select = True
    m1.node_tree.nodes.active = t1
    me2.materials.clear()
    me2.materials.append(m1)
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 4
    bk = sc.render.bake
    bk.use_selected_to_active = True
    h = float(np.ptp(pos, axis=0).max())
    bk.cage_extrusion = 0.015 * h
    bk.max_ray_distance = 0.05 * h
    bk.margin = 4
    bpy.ops.object.select_all(action="DESELECT")
    hi.select_set(True)
    lo.select_set(True)
    vl.objects.active = lo
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"})
    px = np.array(img.pixels[:], dtype=np.float32).reshape(size, size, 4)
    px = fill_misses(px, px[..., 3] > 0.5)
    rgb = np.clip(np.flipud(px[..., :3]) * 255 + 0.5, 0, 255).astype(np.uint8)
    os.unlink(tmp.name)

    # Ecken je Texturkoordinate trennen, vier staerkste Knochen
    me2.calc_loop_triangles()
    uvl = me2.uv_layers.active.data
    nvb = len(me2.vertices)
    Wb = np.zeros((nvb, nj))
    for v in me2.vertices:
        for ge in v.groups:
            if ge.group < nj:
                Wb[v.index, ge.group] = ge.weight
    key2, P2, UV2, I2, SRC = {}, [], [], [], []
    for t in me2.loop_triangles:
        tri3 = []
        for li, vi in zip(t.loops, t.vertices):
            u = tuple(np.round(uvl[li].uv[:], 6))
            k = (vi, u)
            if k not in key2:
                key2[k] = len(P2)
                P2.append(me2.vertices[vi].co[:])
                UV2.append(u)
                SRC.append(vi)
            tri3.append(key2[k])
        I2.append(tri3)
    P2 = np.array(P2)
    Wn = Wb[np.array(SRC)]
    order = np.argsort(-Wn, axis=1)[:, :4]
    w4 = np.take_along_axis(Wn, order, axis=1)
    if order.shape[1] < 4:
        order = np.pad(order, ((0, 0), (0, 4 - order.shape[1])))
        w4 = np.pad(w4, ((0, 0), (0, 4 - w4.shape[1])))
    near = cKDTree(pos).query(P2)[1]
    s = w4.sum(1)
    bad = s < 1e-6
    w4 = np.where(bad[:, None], sw[near], w4 / np.maximum(s, 1e-9)[:, None])
    order = np.where(bad[:, None], si[near], order)
    return P2, np.array(UV2), np.array(I2), order, w4, Image.fromarray(rgb), near


class Repack:
    def __init__(self, data, opt, monster):
        self.data = data
        self.opt = opt
        self.monster = monster
        self.P = Pack()
        self.stat = {"tris": [0, 0], "img": [0, 0]}

    def copy(self, ref):
        r = ref["$"]
        b = raw(self.data, ref)
        off = self.P._add(b)
        return {"$": [r[0], off, r[2]] + r[3:]}

    def image(self, ref, limit):
        b = raw(self.data, ref)
        im = Image.open(io.BytesIO(b))
        im.load()
        if self.opt.ganz or (max(im.size) <= limit and len(b) < 60000):
            self.stat["img"][0] += len(b)
            self.stat["img"][1] += len(b)
            return self.copy(ref)
        if max(im.size) > limit:
            f = limit / max(im.size)
            im = im.resize((max(1, round(im.size[0] * f)), max(1, round(im.size[1] * f))), Image.LANCZOS)
        out = io.BytesIO()
        im.save(out, "WEBP", quality=self.opt.qualitaet, method=6)
        self.stat["img"][0] += len(b)
        self.stat["img"][1] += out.tell()
        return self.P.img(out.getvalue(), "image/webp")

    def walk(self, o):
        """Alles unveraendert uebernehmen; Bilder verkleinern, Normalenkarten weglassen."""
        if is_ref(o):
            if o["$"][0] == "img":
                return self.image(o, self.opt.tex_monster if self.monster else self.opt.tex)
            return self.copy(o)
        if isinstance(o, dict):
            return {k: self.walk(v) for k, v in o.items() if not (k == "ntex" and not self.opt.ganz)}
        if isinstance(o, list):
            return [self.walk(v) for v in o]
        return o

    def mesh(self, e, target, beast):
        """Koerper oder Bestie mit weniger Dreiecken; uebrige Felder wie walk()."""
        d = self.data
        idx = values(d, e["idx"]).reshape(-1, 3).astype(np.int64)
        groups = e.get("meta", {}).get("groups") if beast else None
        if self.opt.ganz or len(idx) <= target * 1.1 or (groups and len(groups) != 1):
            self.stat["tris"][0] += len(idx)
            self.stat["tris"][1] += len(idx)
            return self.walk(e)
        pos = values(d, e["pos"]).reshape(-1, 3)
        if open_ratio(pos, idx) > 0.15:
            # keine zusammenhaengende Oberflaeche (etwa die Nordmann-Frau aus der Meshy-Web-App): Verkleinern zerreisst
            # sie in Splitter, also die Form behalten und nur das Bild verkleinern
            self.stat["tris"][0] += len(idx)
            self.stat["tris"][1] += len(idx)
            return self.walk(e)
        uv = values(d, e["uv"]).reshape(-1, 2)
        si = values(d, e["skinI"]).reshape(-1, 4).astype(np.int64)
        sw = values(d, e["skinW"]).reshape(-1, 4).astype(np.float64) / 255
        keep = None
        if not beast and "map" in e:
            hands = [e["map"][k] for k in ("hand.L", "hand.R") if k in e["map"]]
            keep = np.clip(sum((sw * (si == hb)).sum(1) for hb in hands), 0, 1) if hands else None
        tex = Image.open(io.BytesIO(raw(d, e["tex"])))
        tex.load()
        size = self.opt.tex_monster if self.monster else self.opt.tex
        P2, UV2, I2, ji, jw, img, near = rebake(pos, uv, idx, si, sw, tex, target, size, keep, head=not beast)
        w8 = np.round(jw * 255).astype(np.int64)
        w8[:, 0] += 255 - w8.sum(1)
        bt = io.BytesIO()
        img.save(bt, "WEBP", quality=self.opt.qualitaet, method=6)
        self.stat["img"][0] += len(raw(d, e["tex"]))
        self.stat["img"][1] += bt.tell()
        self.stat["tris"][0] += len(idx)
        self.stat["tris"][1] += len(I2)
        out = {}
        for k, v in e.items():
            if k == "ntex" and not self.opt.ganz:
                continue
            if k == "pos":
                out[k] = self.P.q16(P2, e["pos"]["$"][3])
            elif k == "uv":
                out[k] = self.P.q16(UV2, e["uv"]["$"][3]) if e["uv"]["$"][0] == "q16" else self.P.uv16(UV2)
            elif k == "idx":
                out[k] = self.P.index(I2)
            elif k == "skinI":
                out[k] = self.P.arr(ji, "u8")
            elif k == "skinW":
                out[k] = self.P.arr(w8, "u8")
            elif k == "nrm":
                out[k] = self.P.arr(values(d, v).reshape(-1, 3)[near], "i8")
            elif k == "col":
                out[k] = self.P.arr(values(d, v).reshape(-1, 4)[near], "u8")
            elif k == "tex":
                out[k] = self.P.img(bt.getvalue(), "image/webp")
            elif k == "meta" and groups:
                out[k] = dict(v, groups=[[groups[0][0], 0, int(I2.size)]])
            else:
                out[k] = self.walk(v)
        return out

    def run(self, head):
        out = {}
        for sec, v in head.items():
            if sec == "gen":
                out[sec] = {k: (self.mesh(e, self.opt.monster if self.monster else self.opt.held, False) if e.get("kind") == "rig" else self.walk(e)) for k, e in v.items()}
            elif sec == "beasts":
                out[sec] = {k: self.mesh(e, self.opt.monster, True) for k, e in v.items()}
            else:
                out[sec] = self.walk(v)
        bio = io.BytesIO()
        h = json.dumps(out, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        head_b = b"SBP1" + struct.pack("<I", len(h)) + h
        head_b += b"\0" * ((-len(head_b)) % 4)
        bio.write(head_b)
        for p in self.P.parts:
            bio.write(p)
        return bio.getvalue()


def shrink_pack(b, opt, monster, name):
    head, data = read_pack(b)
    R = Repack(data, opt, monster)
    nb = R.run(head)
    z = gzip.compress(nb, 9, mtime=0)
    t, im = R.stat["tris"], R.stat["img"]
    print("%-22s %6.2f MB -> %5.2f MB (gzip)  Dreiecke %6d -> %6d  Bilder %5.2f -> %5.2f MB" % (name, len(b) / 1e6, len(z) / 1e6, t[0], t[1], im[0] / 1e6, im[1] / 1e6))
    return z


def shrink_kulissen(js, opt):
    m = re.match(r"\s*globalThis\.SB_KULISSEN\s*=\s*(\{.*\})\s*;?\s*$", js, re.S)
    k = json.loads(m.group(1))
    out = {}
    for key, uri in k.items():
        mime, b = uri.split(",", 1)
        data = base64.b64decode(b)
        im = Image.open(io.BytesIO(data))
        if not opt.ganz and im.size[0] > opt.kulisse:
            im = im.resize((opt.kulisse, round(im.size[1] * opt.kulisse / im.size[0])), Image.LANCZOS)
            o = io.BytesIO()
            im.convert("RGB").save(o, "WEBP", quality=opt.qualitaet_kulisse, method=6)
            data = o.getvalue()
            mime = "data:image/webp;base64"
        out[key] = mime + "," + base64.b64encode(data).decode()
    return "globalThis.SB_KULISSEN=" + json.dumps(out, separators=(",", ":")) + ";"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dist")
    ap.add_argument("out")
    ap.add_argument("--held", type=int, default=6000, help="Dreiecke je Heldenkoerper")
    ap.add_argument("--monster", type=int, default=4000, help="Dreiecke je Monster oder Bestie")
    ap.add_argument("--tex", type=int, default=512)
    ap.add_argument("--tex-monster", type=int, default=384)
    ap.add_argument("--qualitaet", type=int, default=72)
    ap.add_argument("--kulisse", type=int, default=1024)
    ap.add_argument("--qualitaet-kulisse", type=int, default=62)
    ap.add_argument("--ganz", action="store_true")
    opt = ap.parse_args()

    page = open(os.path.join(opt.dist, "schwebfels.html"), encoding="utf-8").read()
    if "SB_INSELN" not in page:
        sys.exit("Die Seite hat keine Inselbilder: mit INSELN_DIR bauen")
    scripts = []
    # Koerper im Kernpaket der Seite (Nordmann, Trollblut, gemeinsame Bewegungen)
    m = re.search(r'globalThis\.SB_GENPACK="([A-Za-z0-9+/=]+)"', page)
    if m:
        z = shrink_pack(gzip.decompress(base64.b64decode(m.group(1))), opt, False, "Kernpaket")
        page = page[:m.start(1)] + base64.b64encode(z).decode() + page[m.end(1):]
    for f in sorted(glob.glob(os.path.join(opt.dist, "gen-*.js"))):
        js = open(f, encoding="utf-8").read()
        mm = re.match(r'globalThis\.(SB_GEN_\w+)="([A-Za-z0-9+/=]+)"', js)
        name = os.path.basename(f)
        raw = base64.b64decode(mm.group(2))
        if raw[:2] == b"\x1f\x8b":
            raw = gzip.decompress(raw)
        z = shrink_pack(raw, opt, name.startswith("gen-mon"), name)
        scripts.append("<script>/* %s */\nglobalThis.%s=\"%s\";\n</script>" % (name, mm.group(1), base64.b64encode(z).decode()))
    kf = os.path.join(opt.dist, "kulissen.js")
    if os.path.exists(kf):
        js = shrink_kulissen(open(kf, encoding="utf-8").read(), opt)
        print("kulissen.js            %6.2f MB -> %5.2f MB" % (os.path.getsize(kf) / 1e6, len(js) / 1e6))
        scripts.append("<script>/* kulissen.js */\n" + js + "\n</script>")
    for s in scripts:
        assert "</script" not in s[8:-9]
    laden = ('<div id="sbx-laden" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;'
             'flex-direction:column;gap:10px;background:#120f17;color:#e9d9a8;font:16px/1.4 Georgia,serif;text-align:center;'
             'padding:20px;z-index:9999"><b style="font-size:20px">Helden von Schwebfels</b><span>Figuren, Monster und '
             'Kulissen werden geladen &hellip;<br>Das kann beim ersten &Ouml;ffnen eine Weile dauern.</span></div>')
    anchor = "<script>globalThis.SB_PACK="
    assert page.count(anchor) == 1, "Spielseite unerwartet aufgebaut"
    block = "\n".join([laden] + scripts + ['<script>document.getElementById("sbx-laden").remove();</script>']) + "\n"
    page = page.replace(anchor, block + anchor)
    with open(opt.out, "w", encoding="utf-8") as f:
        f.write(page)
    print("Handy-Fassung %s: %.1f MB" % (opt.out, os.path.getsize(opt.out) / 1e6))


if __name__ == "__main__":
    main()
