"""Requisit fuer die Kampfumgebung aus einer GLB (z. B. Meshy Bild zu 3D): Baum, Deko (Fels, Holzstapel, Runenstein)
oder ein Wahrzeichen im Hintergrund.

Aufruf: python prop.py <ausgabe.npz> <requisit.glb> --realm midgard --rolle baum [--hoehe 4.6] [--turn 0]
                       [--name ...] [--tris 4000] [--tex 1024]

Das Modell bleibt in der Meshy-Lage (oben +Y, Vorderseite +Z, sonst --turn in Grad), steht mit dem tiefsten Punkt auf
dem Boden, ist ueber der Grundflaeche mittig und wird auf die Zielhoehe gebracht. Im Kampf ersetzen die Requisiten
eines Reiches dort die gebauten Baeume (Rolle baum) und Dekorationen (Rolle deko, je Modell hoechstens zwei Stueck);
ein Wahrzeichen steht hinten in der Mitte zwischen den Kaempfern. Lichtsetzung und Bodeninsel bleiben gleich. gen_pack.py nimmt den Unterordner "requisiten" auf.
"""
import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import meshy as M  # noqa: E402
import fit_piece as FP  # noqa: E402

# Zielhoehe je Rolle (Meter, wie die gebauten Requisiten der Kampfbuehne)
HEIGHT = {"baum": 4.6, "deko": 0.8, "wahrzeichen": 3.2}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("out")
    ap.add_argument("glb")
    ap.add_argument("--realm", required=True, choices=["albion", "midgard", "hibernia"])
    ap.add_argument("--rolle", required=True, choices=sorted(HEIGHT))
    ap.add_argument("--hoehe", type=float)
    ap.add_argument("--turn", type=float, default=0.0)
    ap.add_argument("--name")
    ap.add_argument("--tris", type=int, default=4000)
    ap.add_argument("--tex", type=int, default=1024)
    a = ap.parse_args()
    g, parts = FP.static_parts(a.glb)
    tex = M.atlas(g, parts, a.tex)
    P = np.concatenate([p["pos"] for p in parts])
    UV = np.concatenate([p["uv_game"] for p in parts])
    base = np.cumsum([0] + [len(p["pos"]) for p in parts])[:-1]
    F = np.concatenate([p["idx"] + b for p, b in zip(parts, base)])
    ang = np.radians(a.turn)
    Rm = np.array([[np.cos(ang), 0, np.sin(ang)], [0, 1, 0], [-np.sin(ang), 0, np.cos(ang)]])
    P = P @ Rm.T
    # Mitte der Grundflaeche (unterstes Zehntel), damit ein schiefer Baum mit dem Stamm im Ursprung steht
    y0 = P[:, 1].min()
    h = np.ptp(P[:, 1])
    foot = P[P[:, 1] < y0 + 0.1 * h]
    c = np.array([(foot[:, 0].max() + foot[:, 0].min()) / 2, y0, (foot[:, 2].max() + foot[:, 2].min()) / 2])
    target = a.hoehe or HEIGHT[a.rolle]
    P = (P - c) * (target / h)
    tris_in = len(F)
    if len(F) > a.tris * 1.05:
        one = np.zeros((len(P), 1), np.int64)
        P, UV, F, _, _ = M.decimate(P, UV, F, one, np.ones((len(P), 1)), a.tris)
    name = a.name or os.path.splitext(os.path.basename(a.out))[0]
    lo, hi = P.min(0), P.max(0)
    meta = {"name": name, "realm": a.realm, "role": a.rolle, "min": [float(v) for v in lo], "max": [float(v) for v in hi]}
    np.savez_compressed(a.out, kind="prop", pos=P.astype(np.float32), uv=UV.astype(np.float32), idx=F.astype(np.int32),
                        tex=tex.astype(np.uint8), meta=json.dumps(meta, ensure_ascii=False))
    print("Requisit %s (%s, %s): %d Dreiecke (vorher %d), Hoehe %.2f m, Breite %.2f m, Textur %d px"
          % (name, a.realm, a.rolle, len(F), tris_in, hi[1] - lo[1], max(hi[0] - lo[0], hi[2] - lo[2]), tex.shape[1]))


if __name__ == "__main__":
    main()
