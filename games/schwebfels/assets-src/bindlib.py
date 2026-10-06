"""Bindung von Ausruestung und Haaren an den Spielkoerper.

Jede Ecke eines Kleidungs- oder Haarnetzes wird an den naechsten Punkt der Koerperoberflaeche
(Grundkoerper, Spielaufloesung) gebunden: Dreieck, zwei baryzentrische Anteile und der Versatz im
Dreiecksrahmen (Normale, Kante, Kreuzprodukt). Im Spiel wird so jedes Teil auf jedes Volk und Geschlecht
angepasst und uebernimmt die Hautgewichte des Koerpers (keine eigenen Gewichte noetig).
"""
import numpy as np
import bpy  # noqa: F401  (stellt mathutils bereit)
from mathutils.bvhtree import BVHTree


def smooth_surface(pos, idx, iters, lam=0.5):
    """Gleichmaessiges Glaetten mit verschweissten Naehten (gleiches Verfahren wie im Spiel, r3d-human.js)."""
    pos = np.asarray(pos, dtype=np.float64)
    key = np.round(pos * 2e4).astype(np.int64)
    _, canon = np.unique(key, axis=0, return_inverse=True)
    canon = canon.reshape(-1)
    m = canon.max() + 1
    P = np.zeros((m, 3))
    P[canon] = pos
    nb = [set() for _ in range(m)]
    for a, b, c in np.asarray(idx).reshape(-1, 3):
        a, b, c = canon[a], canon[b], canon[c]
        nb[a].update((b, c))
        nb[b].update((a, c))
        nb[c].update((a, b))
    nbl = [np.array(sorted(x), dtype=np.int64) for x in nb]
    for _ in range(iters):
        avg = np.array([P[x].mean(axis=0) if len(x) else P[i] for i, x in enumerate(nbl)])
        P = P + (avg - P) * lam
    return P[canon]


class Body:
    def __init__(self, pos, idx, skin_i=None, skin_w=None):
        self.pos = np.asarray(pos, dtype=np.float64)
        self.idx = np.asarray(idx).reshape(-1, 3)
        self.tree = BVHTree.FromPolygons([tuple(p) for p in self.pos], [tuple(int(i) for i in t) for t in self.idx])
        self.vn = self._vertex_normals()
        self.skin_i = skin_i
        self.skin_w = skin_w

    def _vertex_normals(self):
        p = self.pos
        t = self.idx
        fn = np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]])
        vn = np.zeros_like(p)
        for k in range(3):
            np.add.at(vn, t[:, k], fn)
        # Naehte zusammenfassen
        key = np.round(p * 2e4).astype(np.int64)
        _, inv = np.unique(key, axis=0, return_inverse=True)
        acc = np.zeros((inv.max() + 1, 3))
        np.add.at(acc, inv.reshape(-1), vn)
        vn = acc[inv.reshape(-1)]
        return vn / np.maximum(1e-9, np.linalg.norm(vn, axis=1, keepdims=True))

    def frame(self, ti, bc):
        """Punkt, Normale, Tangente, Bitangente an (Dreieck, baryzentrisch)."""
        t = self.idx[ti]
        P = self.pos[t]
        p = (P * bc[:, :, None]).sum(axis=1)
        n = (self.vn[t] * bc[:, :, None]).sum(axis=1)
        n /= np.maximum(1e-9, np.linalg.norm(n, axis=1, keepdims=True))
        e = P[:, 1] - P[:, 0]
        e -= n * (e * n).sum(axis=1, keepdims=True)
        e /= np.maximum(1e-9, np.linalg.norm(e, axis=1, keepdims=True))
        b = np.cross(n, e)
        return p, n, e, b

    def bind(self, pts, max_dist=10.0):
        pts = np.asarray(pts, dtype=np.float64)
        ti = np.zeros(len(pts), dtype=np.int64)
        bc = np.zeros((len(pts), 3))
        for i, q in enumerate(pts):
            loc, nrm, k, dist = self.tree.find_nearest(tuple(q), max_dist)
            if k is None:
                loc, nrm, k, dist = self.tree.find_nearest(tuple(q))
            ti[i] = k
            a, b_, c = self.pos[self.idx[k]]
            v0, v1, v2 = b_ - a, c - a, np.array(loc) - a
            d00, d01, d11 = v0 @ v0, v0 @ v1, v1 @ v1
            d20, d21 = v2 @ v0, v2 @ v1
            den = d00 * d11 - d01 * d01
            vv = (d11 * d20 - d01 * d21) / den if den else 0.0
            ww = (d00 * d21 - d01 * d20) / den if den else 0.0
            w = np.clip([1 - vv - ww, vv, ww], 0, 1)
            bc[i] = w / w.sum()
        p, n, e, b = self.frame(ti, bc)
        d = pts - p
        off = np.stack([(d * n).sum(axis=1), (d * e).sum(axis=1), (d * b).sum(axis=1)], axis=1)
        return ti, bc, off

    def covered(self, mesh_pos, mesh_idx, reach=0.12):
        """Koerperdreiecke, die ganz unter einem Teil liegen (Strahl nach aussen trifft das Teil)."""
        tree = BVHTree.FromPolygons([tuple(p) for p in mesh_pos], [tuple(int(i) for i in t) for t in np.asarray(mesh_idx).reshape(-1, 3)])
        hid = np.zeros(len(self.idx), dtype=bool)
        P = self.pos
        for k, t in enumerate(self.idx):
            ok = True
            for pnt, nn in ((P[t].mean(axis=0), self.vn[t].mean(axis=0)), (P[t[0]], self.vn[t[0]]), (P[t[1]], self.vn[t[1]]), (P[t[2]], self.vn[t[2]])):
                nn = nn / max(1e-9, np.linalg.norm(nn))
                loc, _, _, dist = tree.ray_cast(tuple(pnt - nn * 0.002), tuple(nn), reach)
                if loc is None:
                    ok = False
                    break
            hid[k] = ok
        return hid
