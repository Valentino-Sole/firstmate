"""Hauttexturen des Heldenkoerpers: Normalen und Umgebungsverdeckung vom feinen Koerper auf den Spielkoerper,
dazu gemalte Hautdetails (Lippen, Wangen, Augenpartie), Augenbrauen, sieben Gesichtstaetowierungen und drei Narben.
Aufruf: MH_DATA=... python bake_body.py <humans.npz> <ausgabeordner>"""
import os
import sys
import math
import numpy as np
import bpy
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mhlib  # noqa: E402
import blib  # noqa: E402
import texlib  # noqa: E402

NPZ, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
SZ = int(os.environ.get("BAKE_SIZE", "1024"))
NB = 13380
h = np.load(NPZ)
v0, vt, faces = mhlib.load_obj(os.path.join(mhlib.data_dir(), "3dobjs", "base.obj"))
body = [f for f in faces if f[2] == "body"]
base = v0.copy()
base[:, 1] -= base[:NB, 1].min()
base *= 2.0 / base[:NB, 1].max()


def bl(p):
    return np.stack([p[:, 0], -p[:, 2], p[:, 1]], axis=1)


# ---------- 1. Backen in Blender ----------
blib.reset()
sc = bpy.context.scene
sc.cycles.samples = int(os.environ.get("BAKE_SAMPLES", "48"))
hi = blib.mesh_object("hi", bl(base[:NB]), [f[0] for f in body], vt, [f[1] for f in body])
sub = hi.modifiers.new("sub", "SUBSURF")
sub.levels = 1
sub.render_levels = 1
lo = blib.mesh_object("lo", bl(h["pos"]), h["idx"].tolist(), h["uv"], h["idx"].tolist())
for nm, kind in (("normal", "NORMAL"), ("ao", "AO")):
    img = bpy.data.images.new(nm, SZ, SZ, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    mat = bpy.data.materials.new("bake_" + nm)
    mat.use_nodes = True
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    mat.node_tree.nodes.active = node
    lo.data.materials.clear()
    lo.data.materials.append(mat)
    for o in sc.objects:
        o.select_set(False)
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    sc.render.bake.use_selected_to_active = True
    sc.render.bake.cage_extrusion = 0.012
    sc.render.bake.max_ray_distance = 0.03
    sc.render.bake.margin = 8
    bpy.ops.object.bake(type=kind)
    img.filepath_raw = os.path.join(OUT, "body-" + nm + ".png")
    img.file_format = "PNG"
    img.save()
    print("gebacken", nm)


# ---------- 2. Merkmale je Ecke (voller Koerper) ----------
def tmask(names, sharp=1.0):
    m = np.zeros(len(v0))
    for n in names:
        idx, d = mhlib.load_target(mhlib.target_path(n))
        mag = np.linalg.norm(d, axis=1)
        if mag.max() > 0:
            np.maximum.at(m, idx, mag / mag.max())
    return np.clip(m * sharp, 0, 1) ** 0.7


masks = {
    "lips": tmask(["mouth-upperlip-volume-incr", "mouth-lowerlip-volume-incr"], 1.4),
    "cheek": tmask(["l-cheek-volume-incr", "r-cheek-volume-incr"], 1.0),
    "nose": tmask(["nose-point-up"], 1.0),
    "ears": tmask(["l-ear-scale-incr", "r-ear-scale-incr"], 1.0),
    "lid": tmask(["l-eye-height1-incr", "r-eye-height1-incr", "l-eye-eyefold-up", "r-eye-eyefold-up"], 1.2),
    "bag": tmask(["l-eye-bag-incr", "r-eye-bag-incr"], 1.0),
}
eyes = []
for g in ("helper-l-eye", "helper-r-eye"):
    idx = sorted(set(i for f in faces if f[2] == g for i in f[0]))
    eyes.append(base[idx].mean(axis=0))
eyes = np.array(eyes)
ex = abs(eyes[0, 0])
ey = eyes[:, 1].mean()
ez = eyes[:, 2].mean()
skel = mhlib.load_skeleton()
J = mhlib.joint_positions(base, skel)
hz = J[skel["bones"]["head"]["head"]][2]
head_y0 = J[skel["bones"]["neck02"]["head"]][1]


def face_uv(p):
    """Gesichtsraum: Winkel um die Kopfachse (Augen bei +-1) und Hoehe (Augen bei 0, Augenabstand = 2)."""
    th = np.arctan2(p[:, 0], p[:, 2] - hz)
    th_e = math.atan2(ex, ez - hz)
    return np.stack([th / th_e, (p[:, 1] - ey) / ex], axis=1)


ftri = []
fuv = []
for f in body:
    q, t = f[0], f[1]
    ftri.append([q[0], q[1], q[2]])
    fuv.append([t[0], t[1], t[2]])
    if len(q) == 4:
        ftri.append([q[0], q[2], q[3]])
        fuv.append([t[0], t[2], t[3]])
ftri = np.array(ftri)
fuv = np.array(fuv)
# je Dreiecksecke eigene UV: Attribute auf Dreiecksecken ausbreiten
flat_uv = vt[fuv.reshape(-1)]
flat_v = ftri.reshape(-1)
fu = face_uv(base)
head = (base[:, 1] > head_y0).astype(np.float32)
attrs = {"pos": base[flat_v], "face": fu[flat_v], "head": head[flat_v, None]}
for k, m in masks.items():
    attrs[k] = m[flat_v, None]
R = texlib.raster(flat_uv, np.arange(len(flat_v)).reshape(-1, 3), attrs, SZ)
cov = R["cov"]

# ---------- 3. Hautdetail (Farbmultiplikator) ----------
aoimg = np.asarray(Image.open(os.path.join(OUT, "body-ao.png")).convert("L"), dtype=np.float32)[::-1] / 255.0
n = texlib.noise2(SZ, 24, seed=3)
n2 = texlib.noise2(SZ, 90, seed=5, octaves=2)
mult = 0.62 + 0.38 * np.clip(aoimg, 0, 1) ** 0.9
col = np.ones((SZ, SZ, 3), dtype=np.float32) * mult[..., None]
col *= (0.96 + 0.08 * n)[..., None] * (0.985 + 0.03 * n2)[..., None]
warm = np.array([1.0, 0.78, 0.74])
pink = np.array([1.0, 0.86, 0.84])
for k, tint, s in (("lips", np.array([0.92, 0.62, 0.6]), 0.75), ("cheek", pink, 0.45), ("nose", pink, 0.4), ("ears", pink, 0.5), ("bag", np.array([0.9, 0.84, 0.86]), 0.35), ("lid", np.array([0.86, 0.8, 0.82]), 0.45)):
    m = texlib.blur(R[k][..., 0], 2)[..., None] * s
    col = col * (1 - m) + col * tint * m
col = texlib.dilate(col, cov, 10)
Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)[::-1]).save(os.path.join(OUT, "body-detail.png"))

# ---------- 4. Gesichtsmuster im Gesichtsraum ----------
FW, FH = 1024, 768
U0, U1, V0, V1 = -4.0, 4.0, -3.4, 2.6


def canvas():
    im = Image.new("L", (FW, FH), 0)
    return im, ImageDraw.Draw(im)


def P(u, v):
    return ((u - U0) / (U1 - U0) * FW, (V1 - v) / (V1 - V0) * FH)


def sw(w):
    return max(1, int(w / (U1 - U0) * FW))


def poly(d, pts, fill=255):
    d.polygon([P(*p) for p in pts], fill=fill)


def line(d, pts, w, fill=255):
    d.line([P(*p) for p in pts], fill=fill, width=sw(w), joint="curve")
    for p in (pts[0], pts[-1]):
        x, y = P(*p)
        r = sw(w) / 2
        d.ellipse((x - r, y - r, x + r, y + r), fill=fill)


def both(fn):
    fn(1)
    fn(-1)


def taper(d, pts, w0, w1, fill=255):
    """Strich mit abnehmender Breite."""
    for i in range(len(pts) - 1):
        t = i / max(1, len(pts) - 2)
        line(d, [pts[i], pts[i + 1]], w0 + (w1 - w0) * t, fill)


def curve(a, b, c, n=12):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]))
    return out


pats = {}
# Augenbrauen
im, d = canvas()
both(lambda s: taper(d, [(s * u, v) for u, v in curve((0.42, 0.8), (1.02, 1.02), (1.66, 0.8))], 0.15, 0.05))
pats["brow"] = im
# Runen: drei Zeichen auf der Stirn, eins je Wange
im, d = canvas()
for cx in (-0.55, 0.0, 0.55):
    line(d, [(cx, 1.45), (cx, 2.05)], 0.07)
    line(d, [(cx, 1.95), (cx + 0.22, 1.75)], 0.06)
    line(d, [(cx, 1.7), (cx - 0.2, 1.52)], 0.06)
both(lambda s: (line(d, [(s * 1.05, -0.45), (s * 1.05, -1.15)], 0.07), line(d, [(s * 1.05, -0.6), (s * 1.3, -0.85), (s * 1.05, -1.1)], 0.06)))
pats["runen"] = im
# Knotenwerk: geflochtenes Band ueber Stirn und Schlaefen
im, d = canvas()
for i in range(-14, 15):
    u = i * 0.18
    v = 1.55 + 0.06 * math.cos(u * 0.8)
    line(d, [(u, v + 0.16), (u + 0.18, v - 0.16)], 0.06)
    line(d, [(u, v - 0.16), (u + 0.18, v + 0.16)], 0.06)
line(d, [(u0 * 0.2, 1.55 + 0.28 + 0.06 * math.cos(u0 * 0.16)) for u0 in range(-14, 15)], 0.04)
line(d, [(u0 * 0.2, 1.55 - 0.28 + 0.06 * math.cos(u0 * 0.16)) for u0 in range(-14, 15)], 0.04)
pats["knoten"] = im
# Kriegsbemalung: breites Band ueber die Augen, Streifen am Kinn
im, d = canvas()
poly(d, [(-2.6, 0.55), (2.6, 0.55), (2.4, -0.42), (0.35, -0.38), (0.0, -0.12), (-0.35, -0.38), (-2.4, -0.42)])
poly(d, [(-0.18, -2.2), (0.18, -2.2), (0.12, -3.0), (-0.12, -3.0)])
pats["kriegsbemalung"] = im
# Stammeslinien: senkrechte Linien unter den Augen (wie Tafel 07), Linie auf der Stirn
im, d = canvas()
both(lambda s: (taper(d, [(s * 0.95, -0.25), (s * 0.98, -0.8), (s * 1.02, -1.45)], 0.13, 0.05), taper(d, [(s * 1.22, -0.2), (s * 1.27, -0.7), (s * 1.33, -1.2)], 0.1, 0.04)))
taper(d, [(0, 2.1), (0, 1.55), (0, 1.15)], 0.1, 0.05)
pats["linien"] = im
# Mondsichel auf der Stirn, Punkte unter den Augen
im, d = canvas()
x, y = P(0, 1.6)
r = sw(0.45)
d.ellipse((x - r, y - r, x + r, y + r), fill=255)
x2, y2 = P(0.0, 1.78)
d.ellipse((x2 - r * 0.9, y2 - r * 0.9, x2 + r * 0.9, y2 + r * 0.9), fill=0)
for s in (1, -1):
    for k in range(3):
        x, y = P(s * (0.8 + 0.22 * k), -0.5 - 0.05 * k)
        rr = sw(0.07)
        d.ellipse((x - rr, y - rr, x + rr, y + rr), fill=255)
pats["mond"] = im
# Dornenranke von der Schlaefe ueber die Wange
im, d = canvas()
vine = curve((2.1, 1.2), (1.9, -0.4), (0.9, -1.5), 18)
taper(d, vine, 0.1, 0.05)
for i in range(2, len(vine) - 1, 3):
    (u, v), (u2, v2) = vine[i], vine[i + 1]
    tu, tv = u2 - u, v2 - v
    nl = math.hypot(tu, tv)
    nu, nv = -tv / nl, tu / nl
    s = 1 if (i // 3) % 2 else -1
    poly(d, [(u + nu * 0.03 * s, v + nv * 0.03 * s), (u - nu * 0.03 * s, v - nv * 0.03 * s), (u + nu * 0.28 * s + tu * 0.6, v + nv * 0.28 * s + tv * 0.6)])
pats["dornen"] = im
# Narben
im, d = canvas()
taper(d, [(-1.15, 1.1), (-1.05, 0.4), (-0.95, -0.35), (-0.9, -0.9)], 0.09, 0.05)
pats["auge"] = im
im, d = canvas()
taper(d, [(1.75, 0.05), (1.3, -0.6), (0.85, -1.25)], 0.1, 0.05)
pats["wange"] = im
im, d = canvas()
taper(d, [(-1.5, -0.2), (-0.6, -1.1)], 0.08, 0.05)
taper(d, [(-1.45, -1.05), (-0.65, -0.25)], 0.08, 0.05)
pats["kreuz"] = im

# in die Kopf-UV-Region uebertragen
ys, xs = np.nonzero(cov & (R["head"][..., 0] > 0.5) & (np.arange(SZ)[None, :] > 0.62 * SZ))
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
HS = 512
box = (x0 / SZ, y0 / SZ, (x1 - x0 + 1) / SZ, (y1 - y0 + 1) / SZ)
print("Kopfbereich in UV", box)
gx = np.clip(((np.arange(HS) + 0.5) / HS * (x1 - x0 + 1) + x0).astype(int), 0, SZ - 1)
gy = np.clip(((np.arange(HS) + 0.5) / HS * (y1 - y0 + 1) + y0).astype(int), 0, SZ - 1)
FU = R["face"][np.ix_(gy, gx)]
HC = (cov & (R["head"][..., 0] > 0.3))[np.ix_(gy, gx)]
front = np.cos(np.clip(FU[..., 0] * math.atan2(ex, ez - hz), -math.pi, math.pi)) > -0.2


def sample(im):
    a = np.asarray(im.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255.0
    px = np.clip(((FU[..., 0] - U0) / (U1 - U0) * FW).astype(int), 0, FW - 1)
    py = np.clip(((V1 - FU[..., 1]) / (V1 - V0) * FH).astype(int), 0, FH - 1)
    return a[py, px] * HC * front


chan = {k: sample(im) for k, im in pats.items()}
lipsH = texlib.blur(R["lips"][..., 0], 1)[np.ix_(gy, gx)]


def save_rgb(path, chs):
    # nur RGB: Daten im Alphakanal gehen beim Hochladen in den Browser verloren
    arr = np.stack([c if c is not None else np.zeros((HS, HS)) for c in chs], axis=-1)
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)[::-1], "RGB").save(path)


save_rgb(os.path.join(OUT, "face-a.png"), [chan["runen"], chan["knoten"], chan["kriegsbemalung"]])
save_rgb(os.path.join(OUT, "face-b.png"), [chan["linien"], chan["mond"], chan["dornen"]])
save_rgb(os.path.join(OUT, "face-c.png"), [chan["brow"], lipsH, None])
save_rgb(os.path.join(OUT, "face-d.png"), [chan["auge"], chan["wange"], chan["kreuz"]])
open(os.path.join(OUT, "face-box.txt"), "w").write(",".join(str(x) for x in box))
print("fertig")
