"""Familie Schlund (quadruped_maw): niedriger Amphibienraeuber mit vier Stuetzbeinen und Kieferkranz.
Tafel 20 "Schlund": breiter Leib, gespreizte Beine mit Krallen, kreisrundes Maul mit Hakenzaehnen,
Schilf und Moos auf dem Ruecken, kurzer Schwanz mit Rueckenleiste.
Aufruf: python schlund.py <ausgabe.npz>"""
import os
import sys
import math
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import monlib as ML  # noqa: E402

OUT = sys.argv[1]
ML.reset()
rng = np.random.default_rng(5)

# ---------- Skelett ----------
rig = ML.Rig()
sp = [(0, 0.72, -0.55), (0, 0.8, -0.1), (0, 0.82, 0.35), (0, 0.8, 0.62), (0, 0.74, 0.92)]
rig.add("hips", None, sp[0], sp[1], "spine")
rig.add("spine", "hips", sp[1], sp[2], "spine")
rig.add("chest", "spine", sp[2], sp[3], "spine")
rig.add("head", "chest", sp[3], sp[4], "head")
rig.add("maw", "head", sp[4], (0, 0.72, 1.12), "jaw")
tail = [(0, 0.72, -0.55), (0, 0.66, -0.85), (0, 0.55, -1.12), (0, 0.42, -1.36), (0, 0.32, -1.55)]
rig.chain("tail", "hips", tail, "tail")
LEGS = {
    "FL": [(0.36, 0.7, 0.32), (0.7, 0.52, 0.4), (0.68, 0.14, 0.48), (0.74, 0.04, 0.64)],
    "BL": [(0.34, 0.66, -0.42), (0.7, 0.5, -0.52), (0.66, 0.14, -0.62), (0.72, 0.04, -0.46)],
}
for k in list(LEGS):
    LEGS[k.replace("L", "R")] = [(-x, y, z) for x, y, z in LEGS[k]]
for k, pts in LEGS.items():
    parent = "chest" if k[0] == "F" else "hips"
    rig.chain("leg" + k, parent, pts, "leg." + k)

# ---------- Hautgeruest ----------
nodes, edges, radii = [], [], []


def node(p, r):
    nodes.append(p)
    radii.append(r)
    return len(nodes) - 1


spine_pts = [tail[4], tail[3], tail[2], tail[1], sp[0], sp[1], sp[2], sp[3], sp[4], (0, 0.73, 1.02)]
spine_r = [(0.03, 0.03), (0.09, 0.07), (0.17, 0.13), (0.27, 0.19), (0.4, 0.28), (0.54, 0.34), (0.52, 0.34), (0.46, 0.34), (0.42, 0.37), (0.4, 0.36)]
sidx = []
for p, r in zip(spine_pts, spine_r):
    i = node(p, r)
    if sidx:
        edges.append((sidx[-1], i))
    sidx.append(i)
attach = {"FL": sidx[6], "FR": sidx[6], "BL": sidx[4], "BR": sidx[4]}
for k, pts in LEGS.items():
    prev = attach[k]
    rs = [(0.24, 0.2), (0.2, 0.18), (0.15, 0.14), (0.15, 0.08)]
    # Ansatz etwas in den Rumpf ziehen
    for j, (p, r) in enumerate(zip(pts, rs)):
        i = node(p, r)
        edges.append((prev, i))
        prev = i
body = ML.skin_body(nodes, edges, radii, subdiv=2)
ML.displace(body, "VORONOI", scale=0.06, strength=-0.025, seed=1)
ML.displace(body, "CLOUDS", scale=0.25, strength=0.03, seed=2)
ML.decimate_ob(body, 0.35)
model = ML.Model(rig)


def body_color(P, N):
    # Bauch und Kehle heller (zweite Farbe), Ruecken und Beine dunkel gefleckt
    belly = np.clip((-N[:, 1] - 0.05) * 1.8, 0, 1) * np.clip((0.8 - P[:, 1]) * 3, 0, 1)
    spots = (np.sin(P[:, 0] * 23 + P[:, 2] * 7) * np.sin(P[:, 2] * 19) > 0.55) * 0.2
    dark = np.clip((P[:, 1] - 0.9) * 2.5, 0, 0.5)
    r = np.ones(len(P)) - dark
    return np.stack([r, np.clip(belly + spots, 0, 1), np.zeros(len(P))], axis=1)


model.add_ob(body, "skin", color_fn=body_color)

# ---------- Maul: Hornkranz, Schlund, Hakenzaehne ----------
mz = 1.05
cy = 0.72
for k in range(36):
    a = k / 36 * 2 * math.pi
    p0 = np.array([math.cos(a) * 0.3, cy + math.sin(a) * 0.27, mz])
    p1 = np.array([math.cos(a + 0.3) * 0.31, cy + math.sin(a + 0.3) * 0.28, mz + 0.02])
# Lippenwulst aus Haut mit hornigen Kanten (keine glatte Scheibe)
P, N, F = ML.tube_part([[math.cos(a) * 0.33, cy + math.sin(a) * 0.3, mz + 0.025 * math.cos(5 * a)] for a in np.linspace(0, 2 * math.pi, 49)], 0.075, 0.075, sides=8)
model.add(P, N, F, "skin", (0.7, 0.35, 0), bone="maw")
for k in range(16):
    a = k / 16 * 2 * math.pi
    b0 = np.array([math.cos(a) * 0.38, cy + math.sin(a) * 0.35, mz - 0.02])
    Pk, Nk, Fk = ML.cone_part(b0, b0 + np.array([math.cos(a) * 0.05, math.sin(a) * 0.05, 0.03]), 0.03, seg=5)
    model.add(Pk, Nk, Fk, "horn", (0, 0.3, 0), bone="maw", group="lipspikes")
# Schlundhoehle: dunkler Trichter nach innen
cav = []
for t in np.linspace(0, 1, 6):
    cav.append([[math.cos(a) * 0.29 * (1 - 0.75 * t), cy + math.sin(a) * 0.26 * (1 - 0.75 * t), mz - 0.02 - 0.32 * t] for a in np.linspace(0, 2 * math.pi, 25)])
cav = np.array(cav)
Pc = cav.reshape(-1, 3)
Fc = []
for i in range(5):
    for j in range(24):
        a = i * 25 + j
        Fc += [[a, a + 25, a + 1], [a + 1, a + 25, a + 26]]
model.add(Pc, ML.vnormals(Pc, np.array(Fc)), np.array(Fc), "membrane", (0, 0, 0.0), bone="head")
# drei Zahnringe, nach innen gekruemmt
for ring_i, (rr, n, ln) in enumerate([(0.27, 18, 0.13), (0.2, 14, 0.11), (0.13, 10, 0.08)]):
    for k in range(n):
        a = (k + 0.5 * ring_i) / n * 2 * math.pi
        base_ = np.array([math.cos(a) * rr, cy + math.sin(a) * rr * 0.92, mz - 0.01 - ring_i * 0.06])
        tip = base_ + np.array([-math.cos(a) * ln * 0.7, -math.sin(a) * ln * 0.65, ln * 0.55])
        P, N, F = ML.cone_part(base_, tip, 0.022 - ring_i * 0.004, seg=5, bend=[-math.cos(a) * 0.03, -math.sin(a) * 0.03, -0.02])
        model.add(P, N, F, "bone", (0, 0.6, 0), bone="maw", group="teeth")
# Augen seitlich ueber dem Maul, mit Brauenwulst
for s in (1, -1):
    P, N, F = ML.sphere_part((s * 0.27, 0.96, 0.84), 0.045, 10)
    model.add(P, N, F, "eye", (0, 0, 1), bone="head")
    P, N, F = ML.tube_part([(s * 0.2, 1.02, 0.83), (s * 0.27, 1.035, 0.86), (s * 0.34, 1.0, 0.85)], 0.025, 0.018, 5)
    model.add(P, N, F, "horn", (0, 0.4, 0), bone="head")

# ---------- Krallen ----------
for k, pts in LEGS.items():
    foot = np.array(pts[3])
    wrist = np.array(pts[2])
    fwd = foot - wrist
    fwd[1] = 0
    fwd /= np.linalg.norm(fwd)
    side = np.cross([0, 1, 0], fwd)
    for j in range(4):
        o = (j - 1.5) * 0.045
        b0 = foot + side * o + fwd * 0.03 + np.array([0, 0.02, 0])
        P, N, F = ML.cone_part(b0, b0 + fwd * 0.11 + np.array([0, -0.05, 0]), 0.022, seg=5, bend=[0, -0.03, 0])
        model.add(P, N, F, "claw", (0, 0.2, 0), bone="leg%s3" % k)

# ---------- Rueckenleiste (Rindenplatten) ----------
for t in np.linspace(0.05, 0.95, 14):
    z = -1.3 + t * 2.0
    y = np.interp(z, [-1.55, -1.12, -0.55, -0.1, 0.35, 0.62], [0.36, 0.62, 0.98, 1.1, 1.13, 1.08])
    h = 0.06 + 0.05 * math.sin(t * math.pi)
    bone = "tail2" if z < -0.95 else "tail1" if z < -0.6 else "hips" if z < -0.2 else "spine" if z < 0.3 else "chest"
    P, N, F = ML.cone_part((0, y - 0.03, z), (0, y + h, z - 0.05), 0.045, seg=4)
    model.add(P, N, F, "horn", (0, 0.3, 0), bone=bone, group="ridge")

# ---------- Schilf und Moos ----------
for i in range(46):
    z = rng.uniform(-0.55, 0.45)
    x = rng.uniform(-0.3, 0.3)
    y = 1.04 + 0.08 * math.cos(z * 2) - abs(x) * 0.35
    h = rng.uniform(0.18, 0.4)
    lean = np.array([x * 0.4 + rng.uniform(-0.05, 0.05), 1, rng.uniform(-0.15, 0.05)])
    tip = np.array([x, y, z]) + lean / np.linalg.norm(lean) * h
    P, N, F = ML.blade_part((x, y - 0.02, z), tip, 0.012, (1, 0, 0.2))
    bone = "hips" if z < -0.2 else "spine" if z < 0.3 else "chest"
    model.add(P, N, F, "plant", (0, rng.uniform(0, 0.5), 0), bone=bone, group="reeds")
for i in range(60):
    z = rng.uniform(-0.7, 0.6)
    s = 1 if i % 2 else -1
    x = s * rng.uniform(0.3, 0.52)
    y0 = 0.9 - abs(x) * 0.35
    L = rng.uniform(0.15, 0.4)
    pts = [(x, y0, z), (x * 1.08, y0 - L * 0.4, z + 0.01), (x * 1.12, y0 - L * 0.8, z), (x * 1.13, y0 - L, z - 0.01)]
    P, N, F = ML.tube_part(pts, 0.02, 0.004, 5)
    bone = "hips" if z < -0.2 else "spine" if z < 0.3 else "chest"
    model.add(P, N, F, "plant", (0, 0.7, 0), bone=bone, group="moss")

# Moospolster auf dem Ruecken
for i in range(26):
    z = rng.uniform(-0.6, 0.5)
    x = rng.uniform(-0.32, 0.32)
    y = 1.07 + 0.06 * math.cos(z * 2) - abs(x) * 0.42
    P, N, F = ML.sphere_part((x, y, z), rng.uniform(0.05, 0.1), 8, scale=(1, 0.35, 1))
    bone = "hips" if z < -0.2 else "spine" if z < 0.3 else "chest"
    model.add(P, N, F, "plant", (0, 0.2, 0), bone=bone, group="moss")

ML.export(OUT, model, rig, {"family": "schlund", "headY": 1.15, "height": 1.3, "length": 2.6, "sharp": 7.0, "ao_samples": 16})
