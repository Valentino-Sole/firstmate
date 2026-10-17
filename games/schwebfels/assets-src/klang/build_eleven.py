"""Zweite Klangbank aus ElevenLabs-Geraeuschen bauen (assets/klang-eleven.pack, gleiches Format wie klang.pack).

Aufruf: python build_eleven.py <geraeusche-ordner> <assets/klang-eleven.pack> [--plan geraeusche_plan.json] [--vorhoer <ordner>]
  <geraeusche-ordner>: die von elevenlabs.py geholten Dateien (<name>.mp3, Namen wie im Plan)

Hintergrund je Ort (ort.*): ElevenLabs liefert sie als Schleife; gespeichert wird [letzte Sekunde, Schleife, erste
Sekunde], das Spiel spielt von 1 bis 1 + Laenge (wie die Musik, src/audio.js), damit bleibt die Naht auch mit der
Stille, die ein MP3-Decoder vorn einfuegt, sauber. Alle Orte gleich laut (RMS -24 dBFS), die Laengen stehen im Kopf
unter "loops".
Heldenstimmen (held.<volk>.<m|w>.<art>): Schmerzlaute als ein Auftrag mit drei Lauten und Pausen, an den Pausen
getrennt; Kampfschreie als drei einzelne Auftraege (<name>.angriff.<n>.mp3). Jeder Laut wird eine Variante (hoechstens
drei je Datei), Spitze auf -3 dBFS. Findet die Trennung keine Pause, ist die ganze Datei eine Variante.
Die Dateien gehoeren nicht ins Repository (Bedingungen von ElevenLabs: nur im Spiel, nicht als einzelne Klaenge).
"""
import json
import os
import struct
import subprocess
import sys
import numpy as np

SR = 44100


def opt(args, name, default=None):
    if name not in args:
        return default
    i = args.index(name)
    v = args[i + 1]
    del args[i:i + 2]
    return v


def load(path, ch):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", str(ch), "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
    if raw.returncode or not raw.stdout:
        raise SystemExit("Datei fehlt oder ist kaputt: " + path)
    return np.frombuffer(raw.stdout, np.float32).reshape(-1, ch).copy()


def mp3(x, kbps):
    r = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", str(x.shape[1]), "-i", "-", "-c:a", "libmp3lame", "-b:a", "%dk" % kbps, "-f", "mp3", "-"],
                       input=x.astype(np.float32).tobytes(), capture_output=True)
    if r.returncode:
        raise SystemExit(r.stderr.decode()[:300])
    return r.stdout


def ort(x):
    rms = np.sqrt((x ** 2).mean())
    x = x * (10 ** (-24 / 20) / max(rms, 1e-6))
    pk = np.abs(x).max()
    if pk > 0.9:
        x *= 0.9 / pk
    return np.concatenate([x[-SR:], x, x[:SR]]), len(x) / SR


def laute(x):
    """Laute an Pausen trennen: Huellkurve in 10-ms-Schritten, still = unter 6 % der Spitze fuer mindestens 0,12 s."""
    m = np.abs(x[:, 0])
    hop = SR // 100
    n = len(m) // hop
    e = m[: n * hop].reshape(n, hop).max(axis=1)
    laut = e > 0.06 * e.max()
    teile, start, still = [], None, 0
    for i, l in enumerate(laut):
        if l:
            if start is None:
                start = i
            still = 0
        elif start is not None:
            still += 1
            if still >= 12:
                teile.append((start, i - still + 1))
                start, still = None, 0
    if start is not None:
        teile.append((start, n))
    out = []
    for a, b in teile:
        if b - a < 12:
            continue
        a, b = max(0, a - 2) * hop, min(n, b + 4) * hop
        y = x[a:b].copy()
        # ein Laut im Kampf hoechstens 1,1 Sekunden (manche Schmerzlaute kamen als langes Stoehnen)
        y = y[: int(1.1 * SR)]
        f = min(len(y) // 4, int(0.02 * SR))
        y[:f] *= np.linspace(0, 1, f)[:, None]
        f = min(len(y) // 3, int(0.12 * SR))
        y[-f:] *= np.linspace(1, 0, f)[:, None]
        y *= 10 ** (-3 / 20) / max(np.abs(y).max(), 1e-6)
        out.append(y)
    if not out:
        y = x * (10 ** (-3 / 20) / max(np.abs(x).max(), 1e-6))
        out = [y]
    # die drei deutlichsten (laengsten) Laute, in ihrer Reihenfolge
    if len(out) > 3:
        keep = sorted(sorted(range(len(out)), key=lambda i: -len(out[i]))[:3])
        out = [out[i] for i in keep]
    return out


def main():
    args = sys.argv[1:]
    here = os.path.dirname(os.path.abspath(__file__))
    plan = json.load(open(opt(args, "--plan", os.path.join(here, "geraeusche_plan.json"))))
    vor = opt(args, "--vorhoer")
    src, out = args
    namen = [o["name"] for o in plan["orte"]] + [s["name"] + "." + a for s in plan["stimmen"] for a in plan["arten"]]
    teile = {n: [os.path.join(src, n + ".mp3")] for n in namen}
    for s_ in plan["stimmen"]:
        for a, art in plan["arten"].items():
            if art.get("anzahl", 1) > 1:
                teile[s_["name"] + "." + a] = [os.path.join(src, "%s.%s.%d.mp3" % (s_["name"], a, i + 1)) for i in range(art["anzahl"])]
    blobs, header, loops, off = [], {}, {}, 0
    for name in namen:
        da = [p for p in teile[name] if os.path.exists(p)]
        if not da:
            print("fehlt:", name)
            continue
        p = da[0]
        if name.startswith("ort."):
            y, L = ort(load(p, 2))
            varianten = [mp3(y, 64)]
            loops[name] = round(L, 4)
            info = "Schleife %.1f s" % L
        else:
            ys = [y for q in da for y in laute(load(q, 1))]
            varianten = [mp3(y, 64) for y in ys]
            info = "%d Laute (%s s)" % (len(ys), ", ".join("%.2f" % (len(y) / SR) for y in ys))
        header[name] = []
        for i, b in enumerate(varianten):
            header[name].append({"$": ["img", off, len(b), "audio/mpeg"]})
            blobs.append(b)
            pad = (4 - len(b) % 4) % 4
            blobs.append(b"\0" * pad)
            off += len(b) + pad
            if vor:
                os.makedirs(vor, exist_ok=True)
                open(os.path.join(vor, "%s.%d.mp3" % (name, i + 1)), "wb").write(b)
        print("%-28s %s" % (name, info))
    hj = json.dumps({"klang": header, "loops": loops}, separators=(",", ":")).encode()
    with open(out, "wb") as f:
        f.write(struct.pack("<II", 0x31504253, len(hj)))
        f.write(hj)
        f.write(b"\0" * ((4 - (8 + len(hj)) % 4) % 4))
        for b in blobs:
            f.write(b)
    print("Klaenge", len(header), "Groesse", round(os.path.getsize(out) / 1024), "KB")


if __name__ == "__main__":
    main()
