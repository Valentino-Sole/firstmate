"""Aufgenommene Musik je Ort nahtlos machen und fuer das Spiel ablegen.

Aufruf: python build_musik.py <roh-ordner> <assets/musik> [--plan musik_plan.json] [--vorhoer <ordner>]
  <roh-ordner>: die von elevenlabs.py geholten Stuecke (<datei>.mp3, Namen wie im Plan)
  <assets/musik>: Ausgabe, je Stueck <datei>.mp3 und eine Liste musik.json (liest build.mjs)

Schleife: Ein Stueck der Laenge x wird auf eine Laenge L aus ganzen Takten gekuerzt (bpm und takt aus dem Plan),
das Ende x[L:L+U] in den Anfang ueberblendet (U = 4 Sekunden, gleiche Leistung) und die Lage von L um bis zu einen
halben Takt so verschoben, dass Ende und Anfang am besten zusammenpassen (Korrelation der Huellkurven). Gespeichert
wird [letzte Sekunde, ganze Schleife, erste Sekunde]; das Spiel spielt die Schleife von 1 bis 1 + L (src/audio.js),
damit ist sie auch dann nahtlos, wenn der MP3-Decoder vorn Stille einfuegt. Lautheit aller Stuecke gleich (RMS).
"""
import json
import os
import subprocess
import sys
import numpy as np

SR = 44100
U = 4.0


def opt(args, name, default=None):
    if name not in args:
        return default
    i = args.index(name)
    v = args[i + 1]
    del args[i:i + 2]
    return v


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True)
    if raw.returncode or not raw.stdout:
        raise SystemExit("Datei fehlt oder ist kaputt: " + path)
    return np.frombuffer(raw.stdout, np.float32).reshape(-1, 2).copy()


def env(x, hop=441):
    m = np.abs(x).mean(axis=1)
    n = len(m) // hop
    return m[: n * hop].reshape(n, hop).mean(axis=1)


def seamless(x, bpm, takt):
    bar = 60.0 / bpm * takt
    u = int(U * SR)
    total = len(x) / SR
    # laengste Schleife aus ganzen Takten, hinter der noch U Sekunden Ende fuer die Ueberblendung liegen
    bars = int((total - U - 0.5) // bar)
    if bars < 4:
        raise SystemExit("Stueck zu kurz fuer eine Schleife (%.1f s)" % total)
    L0 = int(bars * bar * SR)
    head = env(x[:u])
    best, bestL = -2, L0
    for d in range(-int(bar * SR / 2), int(bar * SR / 2) + 1, 441):
        L = L0 + d
        if L <= u or L + u > len(x):
            continue
        tail = env(x[L:L + u])
        k = min(len(head), len(tail))
        a, b = head[:k] - head[:k].mean(), tail[:k] - tail[:k].mean()
        c = float((a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9))
        if c > best:
            best, bestL = c, L
    L = bestL
    m = x[:L].copy()
    t = np.linspace(0, np.pi / 2, u)[:, None]
    m[:u] = x[:u] * np.sin(t) + x[L:L + u] * np.cos(t)
    rms = np.sqrt((m ** 2).mean())
    m *= 10 ** (-19 / 20) / max(rms, 1e-6)
    pk = np.abs(m).max()
    if pk > 0.97:
        m *= 0.97 / pk
    one = SR
    out = np.concatenate([m[-one:], m, m[:one]])
    return out, L / SR, best


def mp3(x, kbps):
    r = subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-c:a", "libmp3lame", "-b:a", "%dk" % kbps, "-f", "mp3", "-"],
                       input=x.astype(np.float32).tobytes(), capture_output=True)
    if r.returncode:
        raise SystemExit(r.stderr.decode()[:300])
    return r.stdout


def main():
    args = sys.argv[1:]
    here = os.path.dirname(os.path.abspath(__file__))
    plan = json.load(open(opt(args, "--plan", os.path.join(here, "musik_plan.json"))))
    vor = opt(args, "--vorhoer")
    kbps = int(opt(args, "--kbps", "96"))
    roh, aus = args
    os.makedirs(aus, exist_ok=True)
    liste = {}
    for st in plan["stuecke"]:
        src = os.path.join(roh, st["datei"] + ".mp3")
        if not os.path.exists(src):
            continue
        x = load(src)
        y, L, c = seamless(x, st["bpm"], st["takt"])
        b = mp3(y, kbps)
        open(os.path.join(aus, st["datei"] + ".mp3"), "wb").write(b)
        liste[st["ort"]] = {"datei": st["datei"], "len": round(L, 4)}
        print("%-18s Schleife %.1f s, Passung %.2f, %d KB" % (st["ort"], L, c, len(b) // 1024))
        if vor:
            # zum Anhoeren: die Schleife zweimal hintereinander, die Naht liegt in der Mitte
            os.makedirs(vor, exist_ok=True)
            m = y[SR:SR + int(L * SR)]
            open(os.path.join(vor, st["datei"] + "-naht.mp3"), "wb").write(mp3(np.concatenate([m[-10 * SR:], m[:10 * SR]]), kbps))
    json.dump(liste, open(os.path.join(aus, "musik.json"), "w"), ensure_ascii=False, indent=1)
    print(len(liste), "Stuecke in", aus)


if __name__ == "__main__":
    main()
