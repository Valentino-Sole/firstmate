"""Schreibt das Asset-Paket des Spiels (assets/schwebfels.pack).

Aufbau: 'SBP1', Laenge des Kopfes (uint32), Kopf als JSON, Auffuellung auf 4 Bytes, Datenblock.
Im Kopf stehen Felder der Form {"$": [art, versatz, anzahl, skala]}; der Lader im Spiel
(src/r3d-assets.js) macht daraus typisierte Felder. Arten: f32, u8, i8, u16, i16, u32,
q16 (int16 mal skala), uv16 (uint16 / 65535), img (Bilddatei, anzahl = Bytes, skala = Mimetyp).
"""
import json
import struct
import numpy as np

DT = {"f32": np.float32, "u8": np.uint8, "i8": np.int8, "u16": np.uint16, "i16": np.int16, "u32": np.uint32}


class Pack:
    def __init__(self):
        self.parts = []
        self.size = 0

    def _add(self, b):
        off = self.size
        self.parts.append(b)
        self.size += len(b)
        pad = (-self.size) % 4
        if pad:
            self.parts.append(b"\0" * pad)
            self.size += pad
        return off

    def arr(self, a, kind):
        a = np.ascontiguousarray(np.asarray(a).reshape(-1), dtype=DT[kind])
        return {"$": [kind, self._add(a.tobytes()), int(a.size)]}

    def q16(self, a, scale=None):
        a = np.asarray(a, dtype=np.float64).reshape(-1)
        m = float(np.abs(a).max()) if a.size else 0.0
        scale = scale or max(m / 32000.0, 1e-7)
        q = np.clip(np.round(a / scale), -32767, 32767).astype(np.int16)
        return {"$": ["q16", self._add(q.tobytes()), int(q.size), scale]}

    def uv16(self, a):
        q = np.clip(np.round(np.asarray(a).reshape(-1) * 65535), 0, 65535).astype(np.uint16)
        return {"$": ["uv16", self._add(q.tobytes()), int(q.size)]}

    def index(self, a):
        a = np.asarray(a).reshape(-1)
        return self.arr(a, "u16" if a.max() < 65535 else "u32")

    def img(self, data, mime):
        return {"$": ["img", self._add(bytes(data)), len(data), mime]}

    def write(self, path, header):
        h = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        head = b"SBP1" + struct.pack("<I", len(h)) + h
        head += b"\0" * ((-len(head)) % 4)
        with open(path, "wb") as f:
            f.write(head)
            for p in self.parts:
                f.write(p)
        return len(head) + self.size
