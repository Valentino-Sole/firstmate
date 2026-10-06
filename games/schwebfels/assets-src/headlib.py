"""Gemeinsame Kopfgeometrie fuer Haare, Kopfhaut-Maske und Kopfbedeckungen (Grundkoerper, Spielmassstab)."""
import math
import numpy as np

EYE_Y = 1.855
# Schaedel als Ellipsoid (aus den Kopfecken oberhalb der Augen des Grundkoerpers bestimmt)
C = np.array([0.0, EYE_Y + 0.03, 0.068])
RAD = np.array([0.1047, 0.115, 0.112])


def ell(theta, phi, lift=0.0):
    """Punkt auf dem Schaedel: theta um die Hochachse (0 = vorne), phi vom Scheitel (0) nach unten."""
    theta, phi, lift = np.broadcast_arrays(np.asarray(theta, dtype=float), np.asarray(phi, dtype=float), np.asarray(lift, dtype=float))
    s = np.sin(phi)
    d = np.stack([s * np.sin(theta), np.cos(phi), s * np.cos(theta)], axis=-1)
    return C + d * RAD * (1.0 + lift)[..., None]


def to_angles(p):
    q = (np.asarray(p) - C) / RAD
    q = q / np.linalg.norm(q, axis=-1, keepdims=True)
    return np.arctan2(q[..., 0], q[..., 2]), np.arccos(np.clip(q[..., 1], -1, 1))


HAIRLINE = [(0.0, 1.2), (0.5, 1.24), (0.9, 1.32), (1.25, 1.38), (1.5, 1.46), (1.8, 1.78), (2.2, 2.12), (math.pi, 2.4)]


def hairline_phi(theta):
    a = np.abs(theta)
    return np.interp(a, [p[0] for p in HAIRLINE], [p[1] for p in HAIRLINE])


def scalp_weight(p, soft=0.1):
    """1 innerhalb des Haaransatzes, weicher Rand; Ohren und Gesicht 0."""
    th, ph = to_angles(p)
    return np.clip((hairline_phi(th) - ph) / soft + 0.5, 0, 1)


def surface_path(p0, p1, lift0, lift1, n=12, bulge=0.0):
    """Weg ueber die Schaedeloberflaeche (Grosskreis), z. B. von der Stirn ueber den Scheitel nach hinten."""
    a = (np.asarray(p0) - C) / RAD
    b = (np.asarray(p1) - C) / RAD
    a /= np.linalg.norm(a)
    b /= np.linalg.norm(b)
    om = math.acos(float(np.clip(a @ b, -1, 1)))
    out = []
    for t in np.linspace(0, 1, n):
        if om < 1e-6:
            d = a
        else:
            d = (math.sin((1 - t) * om) * a + math.sin(t * om) * b) / math.sin(om)
        lift = lift0 + (lift1 - lift0) * t + bulge * math.sin(math.pi * t)
        out.append(C + d * RAD * (1 + lift))
    return np.array(out)
