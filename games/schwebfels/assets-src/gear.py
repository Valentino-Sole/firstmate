"""Kleidung und Ausruestung der Helden (Version 5): Bausteine und Rezepte fuer alle zehn Plaetze.

Aufruf: MH_DATA=... python gear.py <humans.npz> <ausgabe.npz>
Jedes Teil wird hier am Grundkoerper gebaut und fuer das Spiel gebunden (siehe gearlib, bindlib).
"""
import os
import sys
import json
import math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bindlib  # noqa: E402
import humanbase as HB  # noqa: E402
import gearlib as GL  # noqa: E402
from gearlib import Piece  # noqa: E402

NPZ, OUT = sys.argv[1], sys.argv[2]
ONLY = set(os.environ.get("GEAR_ONLY", "").split(",")) - {""}
low = np.load(NPZ)
BODY = bindlib.Body(low["pos"], low["idx"])
# Stoff haftet an einer geglaetteten Koerperform (lockerer Fall ueber Muskeln und Rundungen)
CLOTH_SMOOTH = 6
BODY_SOFT = bindlib.Body(bindlib.smooth_surface(low["pos"], low["idx"], CLOTH_SMOOTH), low["idx"])
base = HB.base[:HB.NB]
J = {n: low["joints"][i] for i, n in enumerate(HB.BONES)}
PIECES = {}


def reg(p):
    PIECES[p.key] = p
    return p


def w(*names):
    return HB.bone_w(*names)[:HB.NB]


Y = base[:, 1]
X = base[:, 0]
Z = base[:, 2]
HIP_Y = J["hips"][1]
WAIST_Y = J["spine"][1]
NECK_Y = J["neck"][1]
CHEST_Y = J["chest"][1]
KNEE_Y = J["shin.L"][1]
ANKLE_Y = J["foot.L"][1]


def arm_t():
    """Lage entlang des Arms: 0 an der Schulter, 1 am Handgelenk (je Seite)."""
    t = np.zeros(len(base))
    for s in ("L", "R"):
        a = J["upperarm." + s]
        b = J["hand." + s]
        d = b - a
        tt = ((base - a) @ d) / (d @ d)
        side = (X > 0) if s == "L" else (X < 0)
        t = np.where(side, tt, t)
    return t


ARM_T = arm_t()


def leg_t():
    t = np.zeros(len(base))
    for s in ("L", "R"):
        a = J["thigh." + s]
        b = J["foot." + s]
        d = b - a
        tt = ((base - a) @ d) / (d @ d)
        side = (X > 0) if s == "L" else (X < 0)
        t = np.where(side, tt, t)
    return t


LEG_T = leg_t()
ARMS = w("upperarm", "forearm", "clavicle")
TORSO = w("chest", "spine", "hips", "clavicle")
LEGS = w("thigh", "shin")
FEET = w("foot", "toe")
HANDS = w("hand", "thumb1", "thumb2", "fing1", "fing2")


def skirt(piece, y_top, y_bot, flare=0.06, clear=0.012, panels=None, nang=44, nrows=13, mat="cloth", mat_in="cloth2", thick=0.004,
          hem_row=None, side_rows=None, hem_w=0.03, cut_fn=None, z_shift=0.0, wave=0.0, shoulders=False):
    """Rock als Loft um Huefte und Beine. panels: Liste (theta0, theta1) im Bogenmass (0 = vorne).
    Gewichte: oben Huefte, nach unten zunehmend die Oberschenkel (je Seite)."""
    ys = np.linspace(y_top, y_bot, nrows)
    zc = 0.0
    rings = []
    rprev = None
    for k, yy in enumerate(ys):
        ang, r = GL.ring_profile(yy, zc, nang, shoulders=shoulders)
        if r.max() == 0 and rprev is not None:
            r = rprev.copy()
        r = r + clear
        if rprev is not None:
            r = np.maximum(r, rprev * 0.995)
        rprev = r
        rings.append(r)
    rings = np.array(rings)
    t = np.linspace(0, 1, nrows)
    rings = rings + (flare * t ** 1.4)[:, None]
    panels = panels or [(-math.pi, math.pi)]
    for (a0, a1) in panels:
        cols = max(3, int((a1 - a0) / (2 * math.pi) * nang) + 1)
        aa = np.linspace(a0, a1, cols)
        R = np.stack([np.interp(aa, np.concatenate([ang - 2 * math.pi, ang, ang + 2 * math.pi]), np.concatenate([rr, rr, rr])) for rr in rings])
        if wave:
            R = R + wave * np.sin(aa * 9)[None, :] * t[:, None] ** 1.2
        P = np.zeros((nrows, cols, 3))
        P[..., 0] = np.sin(aa)[None, :] * R
        P[..., 2] = zc + np.cos(aa)[None, :] * R + z_shift * t[:, None]
        P[..., 1] = ys[:, None]
        if cut_fn is not None:
            P[..., 1] = cut_fn(P[..., 1], aa[None, :], t[:, None])
        P = P.reshape(-1, 3)
        F = GL.grid_faces(nrows, cols)
        N = HB.vertex_normals(P, F)
        # Aussen nach aussen zeigen lassen
        outw = P - np.array([0, 0, zc])
        outw[:, 1] = 0
        if (N * outw).sum() < 0:
            F = F[:, ::-1]
            N = -N
        L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P.reshape(nrows, cols, 3)[0], axis=0), axis=1))])
        uv = np.stack([np.tile(L, nrows) * 7, np.repeat((y_top - ys) * 7, cols)], axis=1)
        tt = np.repeat(t, cols)
        xs = P[:, 0]
        wl = np.clip(0.5 + xs / 0.16, 0, 1) * tt ** 0.9 * 0.8
        wr = np.clip(0.5 - xs / 0.16, 0, 1) * tt ** 0.9 * 0.8
        W = np.zeros((len(P), len(HB.BONES)))
        if shoulders:
            # Umhang: oben Brust/Nacken, nach unten Ruecken und Huefte
            W[:, HB.BI["chest"]] = np.clip(1 - tt * 1.6, 0, 1)
            W[:, HB.BI["spine"]] = np.clip(1 - np.abs(tt - 0.55) * 2.5, 0, 1) * 0.8
            W[:, HB.BI["hips"]] = np.clip((tt - 0.4) * 1.6, 0, 1)
            W /= W.sum(axis=1, keepdims=True)
        else:
            W[:, HB.BI["hips"]] = 1 - wl - wr
            W[:, HB.BI["thigh.L"]] = wl
            W[:, HB.BI["thigh.R"]] = wr
        GL.solidify(P, F, N, thick, uv, mat, mat_in, mat_in, piece, W)
        piece.meta.update({"yTop": float(y_top), "yBot": float(y_bot), "zc": float(zc)})
        Pg = P.reshape(nrows, cols, 3)
        Ng = N.reshape(nrows, cols, 3)
        if hem_row is not None:
            strip(piece, Pg[-1], Ng[-1], hem_w, hem_row, up=True, W=W.reshape(nrows, cols, -1)[-1])
        if side_rows is not None:
            for j in (0, cols - 1):
                strip(piece, Pg[:, j], Ng[:, j], hem_w * 0.8, side_rows, side=(1 if j == 0 else -1), W=W.reshape(nrows, cols, -1)[:, j])
    return piece


def strip(piece, pts, nrm, width, row, up=False, side=0, W=None, lift=0.0016, mat="trim"):
    """Borte entlang einer Punktreihe (z. B. Rocksaum oder Schlitzkante)."""
    pts = np.asarray(pts)
    nrm = np.asarray(nrm)
    tang = np.gradient(pts, axis=0)
    tang /= np.linalg.norm(tang, axis=1, keepdims=True) + 1e-12
    if up:
        dirv = np.cross(nrm, tang)
        dirv *= np.sign(dirv[:, 1:2] + 1e-9)
    else:
        dirv = np.cross(nrm, tang) * side
    a = pts + nrm * lift
    b = pts + dirv * width + nrm * lift
    L = len(pts)
    seg = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    u = seg / width * (64 / 1024)
    v0 = 1 - (row + 1) / GL.TRIM_ROWS + 0.004
    v1 = 1 - row / GL.TRIM_ROWS - 0.004
    P = np.vstack([a, b])
    UV = np.vstack([np.stack([u, np.full(L, v0)], 1), np.stack([u, np.full(L, v1)], 1)])
    F = []
    for i in range(L - 1):
        F += [[i, i + 1, i + 1 + L], [i, i + 1 + L, i + L]]
    F = np.array(F)
    # beidseitig sichtbar: Rueckseite anhaengen
    F = np.vstack([F, F[:, ::-1]])
    WW = None if W is None else np.vstack([W, W])
    piece.add(P, UV, F, mat, WW)


# ===================== Grundkleidung =====================
def base_clothes():
    # Hemd: Oberkoerper und Aermel bis kurz vor das Handgelenk, Rundhals
    p = reg(Piece("base.shirt", "bound", layer=1))
    sel = ((TORSO + ARMS) > 0.5) & (Y > HIP_Y - 0.02) & (ARM_T < 0.9)
    neck = (Y > NECK_Y - 0.03) | ((Z > 0.03) & (Y > NECK_Y - 0.055) & (np.abs(X) < 0.05))
    GL.shell(p, sel & ~neck, 0.008, thick=0.003, smooth=30, concave=40, mat="cloth", mat_in="cloth2", trims=[(0.012, 0, "trim")],
             inflate=lambda P0, vs: 0.006 * np.clip(1 - np.abs(P0[:, 1] - CHEST_Y) / 0.15, 0, 1) * (P0[:, 2] > 0))
    sk = reg(Piece("base.shirtskirt", "radial", layer=1, anchor="hips"))
    skirt(sk, HIP_Y + 0.0, HIP_Y - 0.26, flare=0.03, clear=0.016, hem_row=0, hem_w=0.014)
    # Hose bis zum Knoechel
    p = reg(Piece("base.pants", "bound", layer=1))
    sel = ((LEGS + w("hips")) > 0.45) & (Y < WAIST_Y - 0.02) & (Y > ANKLE_Y + 0.03)
    GL.shell(p, sel, 0.007, thick=0.003, smooth=10, mat="cloth3", mat_in="cloth3", inflate=lambda P0, vs: 0.004 * np.clip((HIP_Y - P0[:, 1]) / 0.4, 0, 1))
    # Bundschuhe
    p = reg(Piece("base.shoes", "bound", layer=2))
    sel = (FEET > 0.3) | ((LEGS > 0.4) & (Y < ANKLE_Y + 0.07))
    GL.shell(p, sel, 0.009, thick=0.004, smooth=40, concave=260, mat="leather2", mat_in="leather2", inflate=lambda P0, vs: 0.006, sole=True, shaft=(ANKLE_Y + 0.0, ANKLE_Y + 0.07))
    for sd in (1, -1):
        GL.sole(p, sd, thick=0.016)
    # Guertel
    p = reg(Piece("base.belt", "bound", layer=3))
    sel = (TORSO > 0.4) & (np.abs(Y - (HIP_Y + 0.05)) < 0.022)
    GL.shell(p, sel, 0.016, thick=0.004, smooth=4, mat="leather", mat_in="leather2")


# ===================== Runengewand (Magierrobe), Pilot =====================
def robe(key, rarity=2, culture_rows=True):
    rr = rarity
    p = reg(Piece(key + ".top", "bound", layer=3))
    sel = ((TORSO + ARMS) > 0.5) & (Y > HIP_Y - 0.03) & (ARM_T < 0.96)
    vneck = (Y > NECK_Y - 0.025) | ((Z > 0.02) & (np.abs(X) < 0.01 + (Y - (NECK_Y - 0.1)) * 0.6) & (Y > NECK_Y - 0.1))
    cuff = lambda P0, vs: np.where(ARM_T[vs] > 0.55, 0.01 + 0.05 * np.clip((ARM_T[vs] - 0.55) / 0.4, 0, 1) ** 1.5, 0.0) * (rr >= 1)
    trims = [(0.026 if rr >= 2 else 0.016, min(rr, 4), "trim")]
    GL.shell(p, sel & ~vneck, 0.012, thick=0.004, smooth=30, concave=50, mat="cloth", mat_in="cloth2", trims=trims,
             inflate=lambda P0, vs: cuff(P0, vs) + 0.004 + 0.008 * np.clip(1 - np.abs(P0[:, 1] - CHEST_Y) / 0.15, 0, 1) * (P0[:, 2] > 0))
    sk = reg(Piece(key + ".skirt", "radial", layer=3, anchor="hips"))
    # vorne ein Mittelteil, seitlich und hinten geteilte Bahnen (Schlitze dazwischen)
    gap = 0.05
    panels = [(-0.42, 0.42), (0.42 + gap, 1.6), (1.6 + gap * 0.5, math.pi + 0.0), (-math.pi, -1.6 - gap * 0.5), (-1.6, -0.42 - gap)]
    skirt(sk, HIP_Y + 0.02, ANKLE_Y + 0.02, flare=0.05, clear=0.016, panels=panels, hem_row=min(rr, 4), side_rows=min(rr, 4) if rr >= 1 else None, hem_w=0.04)
    if rr >= 2:
        # Mittelbahn (Tabard) vorne mit Runensaum
        tb = reg(Piece(key + ".tabard", "radial", layer=4, anchor="hips"))
        skirt(tb, HIP_Y + 0.0, ANKLE_Y + 0.12, flare=0.02, clear=0.032, panels=[(-0.24, 0.24)], mat="cloth3", mat_in="cloth2", hem_row=min(rr, 4), side_rows=min(rr, 4), hem_w=0.03)
    belt = reg(Piece(key + ".belt", "bound", layer=5))
    sel = (TORSO > 0.4) & (np.abs(Y - (HIP_Y + 0.045)) < (0.03 if rr >= 2 else 0.02))
    GL.shell(belt, sel, 0.024, thick=0.005, smooth=4, mat="leather", mat_in="leather2")


# ===================== Umhaenge =====================
SHOULDER_Y = J["upperarm.L"][1]


def cape(key, length=1.0, back_only=True, mat="cloth", trim_row=None, hem_cut=None, fur=False, hood=False, wave=0.006, front=False):
    """Umhang als Bahn um Schultern und Ruecken (Winkel hinten), haengt bis 'length' (0..1 = Schulter..Knoechel)."""
    p = reg(Piece(key, "radial", layer=6, anchor="chest"))
    y_top = SHOULDER_Y + 0.045
    y_bot = y_top - (y_top - ANKLE_Y - 0.03) * length
    a0 = 1.05 if back_only else 0.35
    panels = [(a0, math.pi), (-math.pi, -a0)] if True else None
    # Rueckseite: eine Bahn von links ueber hinten nach rechts
    p2 = skirt_like(p, y_top, y_bot, (a0, 2 * math.pi - a0), mat, trim_row, hem_cut, wave)
    p.meta["shoulders"] = True
    if fur:
        f = reg(Piece(key + ".fur", "bound", layer=7))
        sel = ((w("clavicle", "chest", "neck") + w("upperarm") * 0.6) > 0.45) & (Y > SHOULDER_Y - 0.06) & (Y < NECK_Y + 0.02) & ~((Z > 0.04) & (np.abs(X) < 0.07) & (Y > NECK_Y - 0.08))
        GL.shell(f, sel, 0.03, thick=0.012, smooth=20, concave=20, mat="fur", mat_in="fur", uvscale=5.0,
                 inflate=lambda P0, vs: 0.02 * np.clip((P0[:, 1] - (SHOULDER_Y - 0.06)) / 0.1, 0, 1) + 0.012 * (np.abs(P0[:, 0]) > 0.12))
        fur_tufts(f, sel)
    if hood:
        hd = reg(Piece(key + ".hood", "bound", layer=7))
        sel = (w("chest", "neck", "clavicle") > 0.4) & (Z < -0.02) & (Y > SHOULDER_Y - 0.12) & (Y < NECK_Y + 0.05) & (np.abs(X) < 0.13)
        GL.shell(hd, sel, 0.045, thick=0.006, smooth=20, concave=30, mat=mat, mat_in="cloth2",
                 inflate=lambda P0, vs: 0.035 * np.clip(1 - np.abs(P0[:, 0]) / 0.13, 0, 1) * np.clip((P0[:, 1] - (SHOULDER_Y - 0.12)) / 0.12, 0, 1), trims=[(0.02, trim_row or 0, "trim")])
    return p


def skirt_like(piece, y_top, y_bot, arc, mat, trim_row, hem_cut, wave):
    a0, a1 = arc
    skirt(piece, y_top, y_bot, flare=0.05, clear=0.05, panels=[(a0, a1)], mat=mat, mat_in="cloth2", hem_row=trim_row, side_rows=trim_row, hem_w=0.035,
          cut_fn=hem_cut, wave=wave, shoulders=True)
    return piece


def fur_tufts(piece, sel):
    """Fellbueschel entlang des Kragenrandes fuer eine unruhige Silhouette."""
    rng = np.random.default_rng(3)
    P0 = piece.P[-1]
    n = len(P0) // 2
    outer = P0[:n]
    # Randpunkte: unterste Kante des Kragens
    ymin = outer[:, 1].min()
    cand = outer[outer[:, 1] < ymin + 0.03]
    for q in cand[rng.choice(len(cand), min(70, len(cand)), replace=False)]:
        d = np.array([q[0], 0, q[2]])
        d /= np.linalg.norm(d) + 1e-9
        tip = q + d * 0.02 + np.array([0, -0.035 - rng.random() * 0.025, 0])
        b = np.cross(d, [0, 1, 0])
        b /= np.linalg.norm(b) + 1e-9
        wd = 0.012
        P = np.array([q - b * wd, q + b * wd, tip, q + d * 0.006])
        F = np.array([[0, 1, 2], [1, 0, 2], [0, 3, 2], [3, 1, 2]])
        piece.add(P, np.array([[0, 0], [1, 0], [0.5, 1], [0.5, 0.2]]), F, "fur")


# ===================== Stiefel, Handschuhe =====================
def boots(key, top=0.42, plate=False, straps=0, sandal=False, mat="leather2", cuff_row=None, fur_cuff=False):
    """Stiefel bis 'top' (Anteil Fuss..Knie), Sohle, Stulpe, optional Schienbeinplatte und Riemen."""
    p = reg(Piece(key, "bound", layer=4))
    y_top = ANKLE_Y + (KNEE_Y - ANKLE_Y) * top
    # Fussteil (glatte Kappe) bis knapp ueber den Knoechel, darueber ein eigener Schaft
    sel = (FEET > 0.3) | ((LEGS > 0.4) & (Y < ANKLE_Y + 0.06))
    if sandal:
        sel = sel & ~((Y > 0.035) & (Y < ANKLE_Y - 0.0) & (Z > 0.05))
    GL.shell(p, sel, 0.012, thick=0.006, smooth=40, concave=260, mat=mat, mat_in="leather2", inflate=lambda P0, vs: 0.004, sole=True, dec=0.2)
    for sd in (1, -1):
        GL.sole(p, sd, thick=0.022 if not sandal else 0.016)
        if not sandal:
            GL.leg_loft(p, sd, ANKLE_Y + 0.0, y_top, margin=0.016, flare=0.014, mat=mat, top_row=cuff_row)
    for k in range(straps):
        yy = ANKLE_Y + (y_top - ANKLE_Y) * (0.25 + 0.6 * k / max(1, straps - 1))
        st = reg(Piece(key + ".strap%d" % k, "bound", layer=5))
        # Riemen als schmale Roehre um den Schaft (das Grundnetz ist am Schienbein zu grob fuer Baender)
        for sd in (1, -1):
            GL.leg_loft(st, sd, yy - 0.011, yy + 0.011, margin=0.026 + 0.012 * (yy - ANKLE_Y) / max(0.01, y_top - ANKLE_Y), flare=0.0, nrows=3, mat="leather", mat_in="leather", thick=0.004)
    if plate:
        pl = reg(Piece(key + ".plate", "bound", layer=5))
        sel = (w("shin") > 0.5) & (Z > 0.0) & (Y < y_top - 0.02) & (Y > ANKLE_Y + 0.02)
        GL.shell(pl, sel, 0.02, thick=0.005, smooth=20, mat="metal", mat_in="metal", trims=[(0.012, 2, "trim")])
    if fur_cuff:
        fc = reg(Piece(key + ".fur", "bound", layer=5))
        GL.shell(fc, (LEGS > 0.4) & (np.abs(Y - (y_top - 0.02)) < 0.03), 0.02, thick=0.01, smooth=10, mat="fur", mat_in="fur")
    return p


def gloves(key, cuff=0.45, plate=False, mat="leather", cuff_row=None, fingerless=False):
    p = reg(Piece(key, "bound", layer=4))
    sel = (HANDS > 0.35) | ((ARM_T > 1.0 - cuff * 0.5) & (ARMS > 0.3))
    if fingerless:
        sel &= ~(w("fing2", "thumb2") > 0.4)
    GL.shell(p, sel, 0.004, thick=0.0025, smooth=4, mat=mat, mat_in="leather2", dec=0.24,
             inflate=lambda P0, vs: 0.012 * np.clip((ARM_T[vs] - (1.0 - cuff * 0.5)) / 0.12, 0, 1) * (ARM_T[vs] < 0.98),
             trims=[(0.016, cuff_row, "trim")] if cuff_row is not None else None)
    if plate:
        pl = reg(Piece(key + ".plate", "bound", layer=5))
        sel = (w("hand") > 0.6) & (Y > 0) & (HB.FULL_VN[: HB.NB][:, 2] < 0.2) & (np.abs(X) > 0.3)
        hb = (w("hand") > 0.55)
        # Handruecken: Normale zeigt nach aussen (von der Koerpermitte weg)
        nx = HB.FULL_VN[: HB.NB][:, 0] * np.sign(X)
        GL.shell(pl, hb & (nx > 0.3), 0.009, thick=0.003, smooth=6, mat="metal", mat_in="metal")
    return p


# ===================== Kopf: Stirnband, Kapuze, Amulettband =====================
def headband(key, rarity=0):
    p = reg(Piece(key, "bound", layer=8))
    from headlib import to_angles
    th, ph = to_angles(base)
    sel = (w("head") > 0.6) & (np.abs(Y - 1.935) < 0.017) & (Y > 1.85)
    GL.shell(p, sel, 0.004, thick=0.003, smooth=6, mat="cloth", mat_in="cloth2", trims=[(0.012, min(rarity, 4), "trim")])
    p.meta["soft"] = 0
    return p


def hood(key, mat="cloth", trim_row=0, point=0.06):
    p = reg(Piece(key, "bound", layer=8))
    from headlib import to_angles
    th, ph = to_angles(base)
    head = w("head", "neck") > 0.4
    face = (np.abs(th) < 1.05) & (ph > 0.95) & (Y > 1.7)
    sel = ((head & ~face) | ((w("neck", "chest", "clavicle") > 0.4) & (Y > SHOULDER_Y - 0.02) & (Z < 0.06))) & (Y > SHOULDER_Y - 0.02)
    GL.shell(p, sel, 0.022, thick=0.005, smooth=24, concave=40, mat=mat, mat_in="cloth2", trims=[(0.018, trim_row, "trim")],
             inflate=lambda P0, vs: 0.02 * np.clip((P0[:, 1] - 1.75) / 0.2, 0, 1) + point * np.clip((-P0[:, 2] - 0.02) / 0.08, 0, 1) * np.clip((P0[:, 1] - 1.86) / 0.1, 0, 1))
    p.meta["soft"] = 0
    p.meta["hidesHair"] = True
    return p


def amulet_cord(key, mat="leather"):
    """Halsband vom Nacken zum Brustanhaenger (gebunden, folgt dem Koerper)."""
    p = reg(Piece(key, "bound", layer=9))
    sel = (w("neck", "chest", "clavicle") > 0.3) & (np.abs(Y - (NECK_Y - 0.035)) < 0.006)
    front = (Z > 0.0)
    # Bogen nach unten zum Anhaenger: Band vorne tiefer legen
    GL.shell(p, sel, 0.006, thick=0.002, smooth=4, mat=mat, mat_in=mat)
    return p



# ===================== Bausteine fuer Ruestungen =====================
def neck_cut(depth=0.055, width=0.05, v=False):
    """Halsausschnitt: rund (Standard) oder als V vorne."""
    if v:
        return (Y > NECK_Y - 0.025) | ((Z > 0.02) & (np.abs(X) < 0.01 + (Y - (NECK_Y - depth - 0.05)) * 0.6) & (Y > NECK_Y - depth - 0.05))
    return (Y > NECK_Y - 0.03) | ((Z > 0.03) & (Y > NECK_Y - depth) & (np.abs(X) < width))


def tunic(key, mat="cloth", mat_in="cloth2", sleeve=0.9, bottom=None, offset=0.01, layer=2, trim=None, vneck=False, sleeveless=False, bell=0.0, chest=0.006):
    """Oberteil (Hemd, Wams, Gambeson) bis zur Huefte, Aermel bis 'sleeve' (0 Schulter, 1 Handgelenk)."""
    p = reg(Piece(key, "bound", layer=layer))
    bottom = HIP_Y - 0.03 if bottom is None else bottom
    sel = ((TORSO + ARMS) > 0.5) & (Y > bottom) & (ARM_T < sleeve)
    if sleeveless:
        sel &= ~((ARMS > 0.45) & (ARM_T > 0.1))
    cuff = (lambda P0, vs: bell * np.clip((ARM_T[vs] - (sleeve - 0.3)) / 0.3, 0, 1) ** 1.6) if bell else (lambda P0, vs: 0.0)
    GL.shell(p, sel & ~neck_cut(v=vneck), offset, thick=0.004, smooth=30, concave=40, mat=mat, mat_in=mat_in,
             trims=[(0.016, trim, "trim")] if trim is not None else None,
             inflate=lambda P0, vs: cuff(P0, vs) + chest * np.clip(1 - np.abs(P0[:, 1] - CHEST_Y) / 0.15, 0, 1) * (P0[:, 2] > 0))
    return p


def cuirass(key, layer=4, offset=0.022, bottom=None, top=None, trim=2, mat="metal", front_only=False):
    """Brustpanzer: Brust und Bauch (und Ruecken) als glatte, gewoelbte Platte ohne Aermel."""
    p = reg(Piece(key, "bound", layer=layer))
    bottom = HIP_Y + 0.01 if bottom is None else bottom
    top = NECK_Y - 0.035 if top is None else top
    sel = (TORSO > 0.55) & (Y > bottom) & (Y < top) & (ARMS < 0.35) & ~((Z > 0.03) & (Y > NECK_Y - 0.075) & (np.abs(X) < 0.06))
    if front_only:
        sel &= Z > -0.01
    GL.shell(p, sel, offset, thick=0.007, smooth=70, concave=90, mat=mat, mat_in="metal", trims=[(0.016, trim, "trim")],
             inflate=lambda P0, vs: 0.012 * np.clip(1 - np.abs(P0[:, 1] - CHEST_Y) / 0.13, 0, 1) * (P0[:, 2] > 0) + 0.008 * np.clip(P0[:, 2] / 0.1, 0, 1))
    return p


def pauldrons(key, lames=2, size=1.0, layer=6, mat="metal", trim=2, offset=0.03):
    """Schulterstuecke: uebereinander liegende Kappen um das Schultergelenk, die unteren groesser."""
    p = reg(Piece(key, "bound", layer=layer))
    for s in ("L", "R"):
        sh = J["upperarm." + s]
        side = (X > 0) if s == "L" else (X < 0)
        d = np.linalg.norm(base - sh, axis=1)
        reach = (ARMS + w("clavicle") + w("chest") * 0.4) > 0.25
        for k in range(lames):
            r0 = (0.085 + 0.03 * k) * size
            ylim = sh[1] - (0.02 + 0.035 * k) * size
            sel = side & reach & (d < r0) & (Y > ylim) & (np.abs(X) > 0.07)
            GL.shell(p, sel, offset + 0.009 * (lames - 1 - k), thick=0.006, smooth=40, concave=60, mat=mat, mat_in="metal", trims=[(0.012, trim, "trim")],
                     inflate=lambda P0, vs, sh=sh: 0.012 * np.clip((P0[:, 1] - (sh[1] - 0.06)) / 0.08, 0, 1))
    return p


def bracer(key, t0=0.58, t1=0.94, offset=0.012, mat="leather2", trim=None, layer=5):
    p = reg(Piece(key, "bound", layer=layer))
    sel = (ARMS > 0.4) & (ARM_T > t0) & (ARM_T < t1)
    GL.shell(p, sel, offset, thick=0.005, smooth=20, concave=30, mat=mat, mat_in="leather2", trims=[(0.012, trim, "trim")] if trim is not None else None,
             inflate=lambda P0, vs: 0.006 * np.clip((ARM_T[vs] - t0) / (t1 - t0), 0, 1))
    return p


def leg_plates(key, mat="metal", trim=2, layer=3):
    """Beinschutz: Oberschenkelplatte vorne und Kniekachel."""
    p = reg(Piece(key, "bound", layer=layer))
    sel = (LEGS > 0.5) & (LEG_T > 0.1) & (LEG_T < 0.43) & (Z > -0.015)
    GL.shell(p, sel, 0.016, thick=0.006, smooth=40, concave=60, mat=mat, mat_in="metal", trims=[(0.012, trim, "trim")])
    sel = (LEGS > 0.4) & (LEG_T > 0.43) & (LEG_T < 0.56) & (Z > -0.005)
    GL.shell(p, sel, 0.022, thick=0.006, smooth=30, concave=40, mat=mat, mat_in="metal", trims=[(0.01, trim, "trim")],
             inflate=lambda P0, vs: 0.01 * np.clip(1 - np.abs(LEG_T[vs] - 0.5) / 0.07, 0, 1))
    return p


def strap(key, a, b, width=0.018, offset=0.02, mat="leather", layer=5, trim=None):
    """Riemen quer ueber den Oberkoerper von Punkt a (oben, x/y) nach b (unten), vorne und hinten."""
    p = reg(Piece(key, "bound", layer=layer))
    a = np.array(a, float)
    b = np.array(b, float)
    d = (b - a) / np.linalg.norm(b - a)
    n = np.array([-d[1], d[0]])
    q = np.stack([X, Y], 1)
    dist = np.abs((q - a) @ n)
    along = (q - a) @ d
    sel = (TORSO > 0.4) & (dist < width) & (along > -0.05) & (along < np.linalg.norm(b - a) + 0.02) & (ARMS < 0.5)
    GL.shell(p, sel, offset, thick=0.004, smooth=8, mat=mat, mat_in="leather2", trims=[(0.006, trim, "trim")] if trim is not None else None)
    return p


def belt(key, y, h=0.022, offset=0.026, mat="leather", layer=7):
    """Guertel als schmales Band um die Huefte (frei haengend, passt sich jedem Koerper an)."""
    p = reg(Piece(key, "radial", layer=layer, anchor="hips"))
    skirt(p, y + h, y - h, flare=0.0, clear=offset, nrows=4, mat=mat, mat_in="leather2", thick=0.005)
    return p


def scarf(key, mat="cloth3", layer=6, puff=0.016):
    """Halstuch um Hals und obere Brust, locker aufgebauscht."""
    p = reg(Piece(key, "bound", layer=layer))
    sel = (w("neck", "chest", "clavicle") > 0.3) & (Y > NECK_Y - 0.1) & (Y < NECK_Y + 0.035) & (w("head") < 0.5)
    GL.shell(p, sel, 0.02, thick=0.005, smooth=24, concave=30, mat=mat, mat_in="cloth2",
             inflate=lambda P0, vs: puff * np.clip(1 - np.abs(P0[:, 1] - (NECK_Y - 0.04)) / 0.06, 0, 1))
    p.meta["soft"] = 0
    return p


def panels_skirt(key, y_top, y_bot, panels, mat, mat_in="cloth2", layer=3, clear=0.02, flare=0.04, hem_row=None, side_rows=None, hem_w=0.03, cut=None, wave=0.0):
    sk = reg(Piece(key, "radial", layer=layer, anchor="hips"))
    skirt(sk, y_top, y_bot, flare=flare, clear=clear, panels=panels, mat=mat, mat_in=mat_in, hem_row=hem_row, side_rows=side_rows, hem_w=hem_w, cut_fn=cut, wave=wave)
    return sk


FRONT_BACK = lambda wd: [(-wd, wd), (math.pi - wd, math.pi), (-math.pi, -math.pi + wd)]
SPLIT4 = [(-0.6, 0.6), (0.66, 1.6), (1.66, math.pi), (-math.pi, -1.66), (-1.6, -0.66)]
FRONT_SPLIT = [(0.08, 1.5), (1.56, math.pi), (-math.pi, -1.56), (-1.5, -0.08)]
RAGGED = lambda depth: (lambda y, a, t: y - depth * (np.sin(a * 17) * 0.5 + 0.5) * t ** 3)
LEAFCUT = lambda depth: (lambda y, a, t: y - depth * np.abs(np.sin(a * 11)) * t ** 4)


# ===================== Krieger: Harnische =====================
def warrior():
    tunic("harnisch.gambeson", mat="cloth", sleeve=0.92, offset=0.012, layer=2, trim=0, chest=0.01)
    cuirass("harnisch.brust", trim=2)
    p = cuirass("harnisch.schuppe", mat="scale", trim=1, offset=0.02)
    pauldrons("harnisch.schulter", lames=2, size=1.0)
    pauldrons("harnisch.schulter.gross", lames=3, size=1.25, offset=0.034)
    bracer("harnisch.arm", mat="metal", offset=0.014, trim=2)
    leg_plates("harnisch.bein")
    belt("harnisch.guertel", HIP_Y + 0.03, h=0.022, offset=0.034, layer=7)
    panels_skirt("harnisch.wappenrock", HIP_Y + 0.01, KNEE_Y - 0.06, FRONT_BACK(0.42), "cloth3", layer=4, clear=0.045, flare=0.03, hem_row=2, side_rows=2, hem_w=0.03)
    panels_skirt("harnisch.wappenrock.lang", HIP_Y + 0.01, ANKLE_Y + 0.1, FRONT_BACK(0.45), "cloth3", layer=4, clear=0.045, flare=0.05, hem_row=4, side_rows=4, hem_w=0.035)
    panels_skirt("harnisch.kette", HIP_Y + 0.02, HIP_Y - 0.3, [(-math.pi, math.pi)], "chain", "chain", layer=3, clear=0.02, flare=0.03)
    panels_skirt("harnisch.beintaschen", HIP_Y + 0.02, HIP_Y - 0.17, [(-1.05, -0.37), (-0.33, 0.33), (0.37, 1.05)], "metal", "metal", layer=5, clear=0.05, flare=0.025, hem_row=2, hem_w=0.014)


# ===================== Schurke: Schattenwams, Nachtgewand, Diebesleder =====================
def rogue():
    tunic("schurke.wams", mat="leather2", mat_in="leather2", sleeve=0.48, offset=0.009, layer=2, trim=1, chest=0.004)
    tunic("schurke.hemd", mat="cloth3", sleeve=0.9, offset=0.007, layer=1, chest=0.003)
    strap("schurke.riemen.a", (0.12, NECK_Y - 0.03), (-0.13, HIP_Y + 0.08), width=0.016, offset=0.02)
    strap("schurke.riemen.b", (-0.12, NECK_Y - 0.03), (0.13, HIP_Y + 0.08), width=0.016, offset=0.022)
    scarf("schurke.tuch")
    bracer("schurke.arm", mat="leather2", trim=1)
    belt("schurke.guertel", HIP_Y + 0.03, h=0.016, offset=0.03)
    belt("schurke.guertel2", HIP_Y + 0.085, h=0.011, offset=0.024)
    panels_skirt("schurke.schoss", HIP_Y + 0.03, HIP_Y - 0.28, SPLIT4, "leather2", "leather2", layer=3, clear=0.022, flare=0.035, hem_row=1, side_rows=1, hem_w=0.016)
    panels_skirt("schurke.mantel", HIP_Y + 0.03, KNEE_Y - 0.12, FRONT_SPLIT, "cloth3", layer=3, clear=0.025, flare=0.06, hem_row=1, side_rows=1, hem_w=0.02, cut=RAGGED(0.05))
    cape("schurke.umhang", length=0.8, mat="cloth3", trim_row=1, hem_cut=RAGGED(0.12), wave=0.008)


# ===================== Jaeger: Jaegerwams, Schuppenleder, Fellwams =====================
def hunter():
    tunic("jaeger.hemd", mat="cloth", sleeve=0.92, offset=0.009, layer=2, trim=0, chest=0.006)
    tunic("jaeger.weste", mat="leather", mat_in="leather2", offset=0.02, layer=3, trim=1, sleeveless=True, chest=0.006)
    tunic("jaeger.schuppe", mat="scale", mat_in="leather2", offset=0.02, layer=3, trim=1, sleeveless=True, chest=0.006)
    strap("jaeger.riemen", (-0.11, NECK_Y - 0.02), (0.14, HIP_Y + 0.06), width=0.02, offset=0.032)
    bracer("jaeger.arm", mat="leather2", trim=1)
    belt("jaeger.guertel", HIP_Y + 0.04, h=0.024, offset=0.038)
    panels_skirt("jaeger.schoss", HIP_Y + 0.02, KNEE_Y - 0.02, FRONT_SPLIT, "cloth", layer=3, clear=0.03, flare=0.05, hem_row=1, side_rows=1, hem_w=0.022)
    cape("jaeger.mantel", length=0.3, back_only=False, mat="cloth3", trim_row=1, fur=True)
    cape("jaeger.umhang", length=0.82, mat="cloth3", trim_row=2, hem_cut=RAGGED(0.06), wave=0.006)


# ===================== Magier: weitere Gewaender =====================
def robes():
    # Robe: schlichtes Gewand, voller Rock ohne Schlitze, Kordelguertel
    tunic("robe.einfach.top", mat="cloth", sleeve=0.95, offset=0.012, layer=3, trim=0, bell=0.03, chest=0.006)
    panels_skirt("robe.einfach.skirt", HIP_Y + 0.02, ANKLE_Y + 0.02, [(-math.pi, math.pi)], "cloth", layer=3, clear=0.016, flare=0.06, hem_row=0, hem_w=0.03)
    belt("robe.einfach.belt", HIP_Y + 0.06, h=0.008, offset=0.03, mat="leather", layer=5)
    # Sternengewand: weite Glockenaermel, Stehkragen, Rock mit Mittelbahn
    tunic("robe.stern.top", mat="cloth", sleeve=0.97, offset=0.012, layer=3, trim=3, bell=0.09, chest=0.008, vneck=True)
    p = reg(Piece("robe.stern.collar", "bound", layer=6))
    sel = (w("neck", "chest", "clavicle") > 0.35) & (Y > NECK_Y - 0.05) & (Y < NECK_Y + 0.05) & (Z < 0.03) & (w("head") < 0.5)
    GL.shell(p, sel, 0.03, thick=0.005, smooth=20, concave=20, mat="cloth3", mat_in="cloth2", trims=[(0.014, 3, "trim")],
             inflate=lambda P0, vs: 0.03 * np.clip((P0[:, 1] - (NECK_Y - 0.04)) / 0.09, 0, 1))
    p.meta["soft"] = 0
    panels_skirt("robe.stern.skirt", HIP_Y + 0.02, ANKLE_Y + 0.01, [(-math.pi, math.pi)], "cloth", layer=3, clear=0.016, flare=0.08, hem_row=3, hem_w=0.04)
    panels_skirt("robe.stern.tabard", HIP_Y, ANKLE_Y + 0.1, [(-0.26, 0.26)], "cloth3", layer=4, clear=0.034, flare=0.02, hem_row=3, side_rows=3, hem_w=0.03)
    # Druidenmantel: Rock mit Blattsaum und kurzer Mantel mit Kapuze
    tunic("robe.druide.top", mat="cloth", sleeve=0.93, offset=0.012, layer=3, trim=1, chest=0.006)
    panels_skirt("robe.druide.skirt", HIP_Y + 0.02, ANKLE_Y + 0.04, [(-math.pi, math.pi)], "cloth", layer=3, clear=0.016, flare=0.06, hem_row=1, hem_w=0.03, cut=LEAFCUT(0.08))
    cape("robe.druide.mantel", length=0.5, back_only=False, mat="cloth3", trim_row=1, hood=True, hem_cut=LEAFCUT(0.06))


# ===================== Umhaenge, Stiefel, Handschuhe je Grundart =====================
def extras():
    cape("umhang.einfach", length=0.72, mat="cloth", trim_row=0, hood=True)
    cape("umhang.nebel", length=0.92, mat="veil", trim_row=3, hem_cut=RAGGED(0.2), wave=0.01)
    boots("stiefel.eisen", top=0.5, plate=True, mat="leather2", cuff_row=2)
    boots("stiefel.schleicher", top=0.78, straps=4, mat="leather2")
    boots("stiefel.filz", top=0.5, mat="felt", fur_cuff=False, cuff_row=1)
    boots("stiefel.wander", top=0.6, straps=2, mat="leather", cuff_row=1)
    boots("stiefel.fell", top=0.62, mat="leather2", fur_cuff=True)
    boots("stiefel.sandale", top=0.3, sandal=True, straps=2, mat="leather")
    boots("stiefel.schuh", top=0.22, mat="leather", cuff_row=3)
    gloves("handschuhe.dieb", cuff=0.3, mat="leather2", fingerless=True)
    gloves("handschuhe.schuetze", cuff=0.5, mat="leather", fingerless=True, cuff_row=1)
    gloves("handschuhe.stulpe", cuff=0.75, mat="leather", cuff_row=1)
    gloves("handschuhe.runen", cuff=0.4, mat="leather2", cuff_row=3)
    gloves("handschuhe.seide", cuff=0.3, mat="cloth")


def want(prefix):
    return not ONLY or any(prefix.startswith(o) or o.startswith(prefix) for o in ONLY)


def build_all():
    if want("base."):
        base_clothes()
    if want("robe.runen"):
        robe("robe.runen", 2)
    if want("umhang.reise"):
        cape("umhang.reise", length=0.42, mat="cloth3", hem_cut=lambda y, a, t: y - 0.03 * (np.sin(a * 23) > 0.3) * t, trim_row=0, wave=0.004)
    if want("umhang.fell"):
        cape("umhang.fell", length=0.95, mat="cloth", fur=True, hood=True, trim_row=2)
    if want("stiefel.leder"):
        boots("stiefel.leder", top=0.55, straps=3, mat="leather2")
    if want("stiefel.platte"):
        boots("stiefel.platte", top=0.62, plate=True, mat="leather2", cuff_row=2)
    if want("handschuhe.leder"):
        gloves("handschuhe.leder", cuff=0.35, mat="leather")
    if want("handschuhe.platte"):
        gloves("handschuhe.platte", cuff=0.55, plate=True, mat="leather2", cuff_row=2)
    if want("kopf.band"):
        headband("kopf.band", 1)
    if want("kopf.kapuze"):
        hood("kopf.kapuze", trim_row=1)
    if want("schmuck.band"):
        amulet_cord("schmuck.band")
    if want("harnisch."):
        warrior()
    if want("schurke."):
        rogue()
    if want("jaeger."):
        hunter()
    if want("robe.einfach") or want("robe.stern") or want("robe.druide"):
        robes()
    if want("umhang.einfach") or want("umhang.nebel") or want("stiefel.") or want("handschuhe."):
        extras()


build_all()


# ===================== Ausgabe =====================
def export():
    out = {}
    keys = []
    lowT = BODY.idx
    for key, p in PIECES.items():
        if ONLY and not any(key.startswith(o) for o in ONLY):
            continue
        if not p.P:
            print("WARNUNG: leeres Teil", key)
            continue
        P, UV, F, M, W = p.arrays()
        # Materialgruppen (Flaechen nach Material sortiert)
        groups = []
        for m in np.unique(M):
            idx = np.nonzero(M == m)[0]
            groups.append([int(m), int(idx[0]) * 3, int(len(idx)) * 3])
        meta = {"mode": p.mode, "layer": p.layer, "groups": groups, "mats": [GL.MATS[g[0]] for g in groups]}
        meta.update(p.meta)
        out[key + ".uv"] = UV.astype(np.float32)
        out[key + ".idx"] = F.astype(np.int32)
        if p.mode == "bound":
            soft = p.meta.get("soft", CLOTH_SMOOTH if p.layer >= 1 else 0)
            meta["soft"] = soft
            ti, bc, off = (BODY_SOFT if soft else BODY).bind(P)
            out[key + ".tri"] = ti.astype(np.int32)
            out[key + ".bc"] = bc.astype(np.float32)
            out[key + ".off"] = off.astype(np.float32)
            out[key + ".hide"] = BODY.covered(P, F, reach=0.08)
            # Ankerdreieck je Teildreieck (zum Ausblenden unter darueberliegenden Teilen)
            out[key + ".anch"] = ti[F[:, 0]].astype(np.int32)
        else:
            out[key + ".pos"] = P.astype(np.float32)
            if p.mode == "radial":
                zc = p.meta.get("zc", 0.0)
                th = np.arctan2(P[:, 0], P[:, 2] - zc)
                rr = np.hypot(P[:, 0], P[:, 2] - zc)
                tt = (p.meta["yTop"] - P[:, 1]) / (p.meta["yTop"] - p.meta["yBot"])
                out[key + ".rad"] = np.stack([th, tt, rr], axis=1).astype(np.float32)
            meta["anchor"] = p.anchor
            meta["bone"] = p.bone
            if W is not None:
                order = np.argsort(-W, axis=1)[:, :4]
                w4 = np.take_along_axis(W, order, axis=1)
                w4 = w4 / np.maximum(1e-9, w4.sum(axis=1, keepdims=True))
                out[key + ".skinI"] = order.astype(np.uint8)
                out[key + ".skinW"] = np.round(w4 * 255).astype(np.uint8)
            Nn = HB.vertex_normals(P, F)
            out[key + ".nrm"] = Nn.astype(np.float32)
        out[key + ".meta"] = json.dumps(meta)
        keys.append(key)
        print(key, p.mode, len(P), "Ecken", len(F), "Dreiecke", "verdeckt" if p.mode == "bound" else "", int(out[key + ".hide"].sum()) if p.mode == "bound" else "")
    if ONLY and os.path.exists(OUT):
        # nur die gewaehlten Teile ersetzen, den Rest behalten
        old = np.load(OUT)
        for k in [str(x) for x in old["keys"]]:
            if k in keys:
                continue
            for f in old.files:
                if f.startswith(k + "."):
                    out[f] = old[f]
            keys.append(k)
    np.savez_compressed(OUT, keys=np.array(keys), **out)


export()
