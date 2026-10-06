"""Helden von Schwebfels: Rastern von Netzdaten in UV-Texturen (numpy).

raster(uv, tri, attrs, size): fuer jedes Texel, das ein Dreieck in UV bedeckt, werden die
Eckwerte (z. B. Lage, Normale, Masken) baryzentrisch gemischt. Ergebnis: dict name -> (size, size, k)
plus 'cov' (bedeckt ja/nein). Danach dilate() fuellt die Raender auf, damit keine Naehte entstehen.
"""
import numpy as np


def raster(uv, tri, attrs, size):
    """uv: (N,2) je Ecke; tri: (M,3) Eckindizes (in uv/attrs); attrs: dict name -> (N,k)."""
    out = {k: np.zeros((size, size, a.shape[1]), dtype=np.float32) for k, a in attrs.items()}
    cov = np.zeros((size, size), dtype=bool)
    P = uv * size - 0.5
    for t in tri:
        p = P[t]
        x0, y0 = np.floor(p.min(axis=0)).astype(int)
        x1, y1 = np.ceil(p.max(axis=0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0)
        x1, y1 = min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        (ax, ay), (bx, by), (cx, cy) = p
        den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(den) < 1e-12:
            continue
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
        w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / den
        w2 = 1 - w0 - w1
        m = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        if not m.any():
            continue
        yy, xx = ys[m], xs[m]
        W = np.stack([w0[m], w1[m], w2[m]], axis=1)
        for k, a in attrs.items():
            out[k][yy, xx] = W @ a[t]
        cov[yy, xx] = True
    out["cov"] = cov
    return out


def dilate(img, cov, steps=6):
    """Fuellt unbedeckte Texel mit dem Mittel bedeckter Nachbarn (mehrere Runden)."""
    img = img.copy()
    c = cov.copy()
    for _ in range(steps):
        acc = np.zeros_like(img)
        n = np.zeros(c.shape, dtype=np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sc = np.roll(np.roll(c, dy, 0), dx, 1)
            si = np.roll(np.roll(img, dy, 0), dx, 1)
            acc += si * sc[..., None]
            n += sc
        new = (~c) & (n > 0)
        img[new] = acc[new] / n[new][:, None]
        c = c | new
    return img


def blur(img, r=2):
    """Einfacher Kastenfilter (mehrfach angewendet ~ Gauss)."""
    out = img.astype(np.float32)
    for _ in range(2):
        acc = np.zeros_like(out)
        for d in range(-r, r + 1):
            acc += np.roll(out, d, 0)
        out = acc / (2 * r + 1)
        acc = np.zeros_like(out)
        for d in range(-r, r + 1):
            acc += np.roll(out, d, 1)
        out = acc / (2 * r + 1)
    return out


def noise2(size, scale, seed=0, octaves=4):
    """Glatter Wertrauschen-Bereich 0..1 (fuer Hautvariation, Stoff, Stein)."""
    rng = np.random.default_rng(seed)
    out = np.zeros((size, size), dtype=np.float32)
    amp = 1.0
    tot = 0.0
    for o in range(octaves):
        n = max(2, int(scale * (2 ** o)))
        g = rng.random((n + 1, n + 1)).astype(np.float32)
        xs = np.linspace(0, n, size, endpoint=False)
        i = xs.astype(int)
        f = xs - i
        f = f * f * (3 - 2 * f)
        a = g[np.ix_(i, i)]
        b = g[np.ix_(i, i + 1)]
        c = g[np.ix_(i + 1, i)]
        d = g[np.ix_(i + 1, i + 1)]
        fx = f[None, :]
        fy = f[:, None]
        out += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy)
        tot += amp
        amp *= 0.5
    return out / tot
