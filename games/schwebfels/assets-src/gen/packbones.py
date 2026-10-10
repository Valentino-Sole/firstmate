"""Knochenliste und Gelenke des Spiels aus assets/schwebfels.pack lesen (ohne Zwischenordner)."""
import json
import struct


def bones(pack_path):
    with open(pack_path, "rb") as f:
        head = f.read(8)
        assert head[:4] == b"SBP1", "kein Modellpaket"
        n = struct.unpack("<I", head[4:8])[0]
        h = json.loads(f.read(n).decode("utf-8"))
    bl = h["humans"]["bones"]
    return [[b[0], bl[b[1]][0] if b[1] >= 0 else None] for b in bl]


def top(pack_path, profile):
    """Koerperhoehe eines Spielprofils (z. B. "nordmann.f") aus assets/schwebfels.pack."""
    with open(pack_path, "rb") as f:
        head = f.read(8)
        n = struct.unpack("<I", head[4:8])[0]
        h = json.loads(f.read(n).decode("utf-8"))
    prof = h["humans"]["profiles"]
    if profile not in prof:
        raise SystemExit("Unbekanntes Profil " + profile + "; vorhanden: " + ", ".join(sorted(prof)))
    return float(prof[profile]["top"])
