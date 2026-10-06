"""Kleiner glTF-2.0-Leser (GLB und .gltf mit eingebetteten Puffern) ohne Fremdbibliotheken ausser numpy.

Liest genau das, was die Modellstrecke braucht: Knoten mit Lage, Skins, Netze, Materialien mit Grundfarbe,
eingebettete Bilder und Animationen. Draco- oder meshopt-komprimierte Dateien vorher mit Blender entpacken
(meshy.py erledigt das selbst).
"""
import base64
import json
import struct

import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
NORM = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}


class GLTF:
    def __init__(self, path):
        raw = open(path, "rb").read()
        self.bin = b""
        if raw[:4] == b"glTF":
            off = 12
            while off < len(raw):
                n, kind = struct.unpack("<II", raw[off:off + 8])
                chunk = raw[off + 8:off + 8 + n]
                if kind == 0x4E4F534A:
                    self.j = json.loads(chunk.decode("utf-8"))
                elif kind == 0x004E4942:
                    self.bin = chunk
                off += 8 + n
        else:
            self.j = json.loads(raw.decode("utf-8"))
        self.buffers = []
        for b in self.j.get("buffers", []):
            uri = b.get("uri")
            if uri is None:
                self.buffers.append(self.bin)
            elif uri.startswith("data:"):
                self.buffers.append(base64.b64decode(uri.split(",", 1)[1]))
            else:
                raise ValueError("Externe Puffer werden nicht unterstuetzt: " + uri)
        self.nodes = self.j.get("nodes", [])
        self.parent = {}
        for i, n in enumerate(self.nodes):
            for c in n.get("children", []):
                self.parent[c] = i
        ext = set(self.j.get("extensionsUsed", [])) | set(self.j.get("extensionsRequired", []))
        self.compressed = bool(ext & {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_meshopt_compression"})

    # ---------- Daten ----------
    def view(self, i):
        bv = self.j["bufferViews"][i]
        buf = self.buffers[bv["buffer"]]
        o = bv.get("byteOffset", 0)
        return buf[o:o + bv["byteLength"]], bv.get("byteStride")

    def accessor(self, i, normalize=True):
        a = self.j["accessors"][i]
        dt = np.dtype(CT[a["componentType"]])
        nc = NC[a["type"]]
        cnt = a["count"]
        if "bufferView" in a:
            data, stride = self.view(a["bufferView"])
            off = a.get("byteOffset", 0)
            item = dt.itemsize * nc
            if stride and stride != item:
                rows = np.frombuffer(data, dtype=np.uint8, count=stride * (cnt - 1) + item, offset=off)
                rows = np.lib.stride_tricks.as_strided(rows, shape=(cnt, item), strides=(stride, 1))
                arr = np.ascontiguousarray(rows).view(dt).reshape(cnt, nc)
            else:
                arr = np.frombuffer(data, dtype=dt, count=cnt * nc, offset=off).reshape(cnt, nc).copy()
        else:
            arr = np.zeros((cnt, nc), dt)
        if "sparse" in a:
            s = a["sparse"]
            idata, _ = self.view(s["indices"]["bufferView"])
            idx = np.frombuffer(idata, dtype=CT[s["indices"]["componentType"]], count=s["count"], offset=s["indices"].get("byteOffset", 0))
            vdata, _ = self.view(s["values"]["bufferView"])
            vals = np.frombuffer(vdata, dtype=dt, count=s["count"] * nc, offset=s["values"].get("byteOffset", 0)).reshape(-1, nc)
            arr = arr.copy()
            arr[idx] = vals
        if normalize and a.get("normalized") and a["componentType"] in NORM:
            arr = np.maximum(arr.astype(np.float32) / NORM[a["componentType"]], -1.0)
        return arr

    def image_bytes(self, img_index):
        im = self.j["images"][img_index]
        if "bufferView" in im:
            data, _ = self.view(im["bufferView"])
            return bytes(data), im.get("mimeType", "image/png")
        uri = im.get("uri", "")
        if uri.startswith("data:"):
            head, b = uri.split(",", 1)
            return base64.b64decode(b), head[5:].split(";")[0]
        raise ValueError("Externe Bilder werden nicht unterstuetzt: " + uri)

    def base_color(self, mat_index):
        """(Bildindex oder None, Faktor RGBA, UV-Satz) der Grundfarbe eines Materials."""
        if mat_index is None:
            return None, np.ones(4), 0
        m = self.j["materials"][mat_index]
        pbr = m.get("pbrMetallicRoughness", {})
        fac = np.array(pbr.get("baseColorFactor", [1, 1, 1, 1]), dtype=np.float64)
        t = pbr.get("baseColorTexture")
        if not t:
            # KHR_materials_pbrSpecularGlossiness (alte Dateien)
            sg = m.get("extensions", {}).get("KHR_materials_pbrSpecularGlossiness")
            if sg:
                fac = np.array(sg.get("diffuseFactor", [1, 1, 1, 1]), dtype=np.float64)
                t = sg.get("diffuseTexture")
        if not t:
            return None, fac, 0
        tex = self.j["textures"][t["index"]]
        src = tex.get("source")
        if src is None:
            src = next(iter(tex.get("extensions", {}).values()), {}).get("source")
        return src, fac, t.get("texCoord", 0)

    # ---------- Lage ----------
    def local(self, i, trs=None):
        n = self.nodes[i]
        if trs is None and "matrix" in n:
            return np.array(n["matrix"], dtype=np.float64).reshape(4, 4).T
        t, r, s = trs if trs else (n.get("translation", [0, 0, 0]), n.get("rotation", [0, 0, 0, 1]), n.get("scale", [1, 1, 1]))
        return compose(t, r, s)

    def rest_trs(self, i):
        n = self.nodes[i]
        if "matrix" in n:
            return decompose(np.array(n["matrix"], dtype=np.float64).reshape(4, 4).T)
        return (np.array(n.get("translation", [0, 0, 0]), dtype=np.float64), np.array(n.get("rotation", [0, 0, 0, 1]), dtype=np.float64),
                np.array(n.get("scale", [1, 1, 1]), dtype=np.float64))

    def world(self, i, cache=None, trs_of=None):
        """Weltmatrix eines Knotens; trs_of(i) darf fuer einzelne Knoten eine andere Lage liefern (Animation)."""
        if cache is not None and i in cache:
            return cache[i]
        o = trs_of(i) if trs_of else None
        m = self.local(i, o)
        p = self.parent.get(i)
        if p is not None:
            m = self.world(p, cache, trs_of) @ m
        if cache is not None:
            cache[i] = m
        return m

    # ---------- Animation ----------
    def channels(self, anim_index):
        """{(knoten, pfad): (zeiten, werte, art)}"""
        a = self.j["animations"][anim_index]
        out = {}
        for c in a["channels"]:
            tgt = c["target"]
            if "node" not in tgt:
                continue
            smp = a["samplers"][c["sampler"]]
            t = self.accessor(smp["input"])[:, 0].astype(np.float64)
            v = self.accessor(smp["output"]).astype(np.float64)
            kind = smp.get("interpolation", "LINEAR")
            if kind == "CUBICSPLINE":
                v = v.reshape(len(t), 3, -1)[:, 1, :]
            out[(tgt["node"], tgt["path"])] = (t, v.reshape(len(t), -1), kind)
        return out


def sample(track, times, path):
    t, v, kind = track
    if len(t) == 1:
        return np.repeat(v[:1], len(times), axis=0)
    i = np.clip(np.searchsorted(t, times, side="right") - 1, 0, len(t) - 2)
    t0, t1 = t[i], t[i + 1]
    u = np.clip((times - t0) / np.maximum(t1 - t0, 1e-9), 0, 1)
    if kind == "STEP":
        u = np.where(times >= t1, 1.0, 0.0)
    a, b = v[i], v[i + 1]
    if path == "rotation":
        return slerp(a, b, u)
    return a + (b - a) * u[:, None]


def slerp(a, b, u):
    a = a / np.linalg.norm(a, axis=1, keepdims=True)
    b = b / np.linalg.norm(b, axis=1, keepdims=True)
    d = np.sum(a * b, axis=1)
    b = np.where(d[:, None] < 0, -b, b)
    d = np.abs(d)
    th = np.arccos(np.clip(d, -1, 1))
    s = np.sin(th)
    small = s < 1e-6
    w0 = np.where(small, 1 - u, np.sin((1 - u) * th) / np.where(small, 1, s))
    w1 = np.where(small, u, np.sin(u * th) / np.where(small, 1, s))
    q = a * w0[:, None] + b * w1[:, None]
    return q / np.linalg.norm(q, axis=1, keepdims=True)


# ---------- Mathematik (Quaternionen als x, y, z, w wie in glTF) ----------
def quat_to_mat(q):
    x, y, z, w = q / np.linalg.norm(q)
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                     [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                     [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])


def mat_to_quat(m):
    t = np.trace(m)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        q = [(m[2, 1] - m[1, 2]) / s, (m[0, 2] - m[2, 0]) / s, (m[1, 0] - m[0, 1]) / s, 0.25 * s]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = np.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        q = [0.25 * s, (m[0, 1] + m[1, 0]) / s, (m[0, 2] + m[2, 0]) / s, (m[2, 1] - m[1, 2]) / s]
    elif m[1, 1] > m[2, 2]:
        s = np.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        q = [(m[0, 1] + m[1, 0]) / s, 0.25 * s, (m[1, 2] + m[2, 1]) / s, (m[0, 2] - m[2, 0]) / s]
    else:
        s = np.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        q = [(m[0, 2] + m[2, 0]) / s, (m[1, 2] + m[2, 1]) / s, 0.25 * s, (m[1, 0] - m[0, 1]) / s]
    q = np.array(q)
    return q / np.linalg.norm(q)


def compose(t, r, s):
    m = np.eye(4)
    m[:3, :3] = quat_to_mat(np.asarray(r, dtype=np.float64)) * np.asarray(s, dtype=np.float64)[None, :]
    m[:3, 3] = t
    return m


def decompose(m):
    t = m[:3, 3].copy()
    s = np.linalg.norm(m[:3, :3], axis=0)
    r = m[:3, :3] / np.where(s == 0, 1, s)[None, :]
    if np.linalg.det(r) < 0:
        s[0] = -s[0]
        r[:, 0] = -r[:, 0]
    return t, mat_to_quat(r), s


def rot_of(m):
    """Reine Drehung einer Matrix mit (gleichmaessiger oder ungleichmaessiger) Skalierung."""
    r = m[:3, :3]
    u, _, vt = np.linalg.svd(r)
    q = u @ vt
    if np.linalg.det(q) < 0:
        u[:, -1] = -u[:, -1]
        q = u @ vt
    return q
