"""Aufgenommene Musik je Ort nahtlos machen und fuer das Spiel ablegen.

Aufruf: python build_musik.py <roh-ordner> <assets/musik> [--plan musik_plan.json] [--vorhoer <ordner>]
  <roh-ordner>: die von elevenlabs.py geholten Stuecke (<datei>.mp3, Namen wie im Plan)
  <assets/musik>: Ausgabe, je Stueck <datei>.mp3 und eine Liste musik.json (liest build.mjs)

Schleife: Vorspiel und Ausklang fallen weg (hauptteil, nach den Hoehen gemessen). Die Schleifenlaenge L ist die Stelle
in der zweiten Haelfte, an der die Musik ueber U = 4 Sekunden dem Anfang klanglich am meisten gleicht (Spektren,
Passung 1 = gleich); dort wird das Ende x[L:L+U] in den Anfang ueberblendet (gleiche Leistung). Gespeichert
wird [letzte Sekunde, ganze Schleife, erste Sekunde]; das Spiel spielt die Schleife von 1 bis 1 + L (src/audio.js),
damit ist sie auch dann nahtlos, wenn der MP3-Decoder vorn Stille einfuegt. Lautheit aller Stuecke gleich (RMS -25 dBFS, so laut wie die erzeugte Musik).
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


def hauptteil(x):
    """Vorspiel und Ausklang abschneiden: ElevenLabs-Stuecke beginnen oft leise (nur Bordun) und blenden am Ende aus.
    Hauptteil = von der ersten bis zur letzten Stelle, an der die Lautstaerke ueber zwei Sekunden mindestens die
    Haelfte des lauten Teils (80. Perzentil) erreicht."""
    hop = SR // 4
    # Hoehen zaehlen (zweite Differenz, betont alles ueber gut 1 kHz): ein lautes Bordun-Vorspiel ist tief und leise in
    # den Hoehen, der Hauptteil mit Fidel, Trommeln und Floeten nicht
    h = np.diff(x.mean(axis=1), n=2)
    n = len(h) // hop
    e = np.sqrt((h[: n * hop] ** 2).reshape(n, hop).mean(axis=1))
    w = 8
    m = np.convolve(e, np.ones(w) / w, mode="valid")
    loud = 0.5 * np.percentile(e, 80)
    ok = np.where(m >= loud)[0]
    if not len(ok):
        return 0, len(x)
    return int(ok[0] * hop), int((ok[-1] + w) * hop)


def spektrum(x, hop=512, win=2048):
    """Log-Betragsspektrum bis gut 5 kHz je Rahmen (Mono), normiert je Rahmen: zeigt Akkord und Klangfarbe."""
    m = x.mean(axis=1)
    n = (len(m) - win) // hop
    idx = np.arange(win)[None, :] + hop * np.arange(n)[:, None]
    f = np.abs(np.fft.rfft(m[idx] * np.hanning(win), axis=1))[:, :240]
    f = np.log1p(f * 50)
    f -= f.mean(axis=1, keepdims=True)
    f /= np.linalg.norm(f, axis=1, keepdims=True) + 1e-9
    return f, hop


def seamless(x, bpm, takt):
    von, bis = hauptteil(x)
    x = x[von:bis]
    bar = 60.0 / bpm * takt
    u = int(U * SR)
    total = len(x) / SR
    if total - U < 8 * bar:
        raise SystemExit("Hauptteil zu kurz fuer eine Schleife (%.1f s)" % total)
    # Schleifenlaenge L: die Stelle in der zweiten Haelfte, an der die Musik ueber U Sekunden dem Anfang am meisten
    # gleicht (gleicher Akkord, gleiche Klangfarbe), damit die Ueberblendung keine zwei Akkorde mischt
    f, hop = spektrum(x)
    k = u // hop
    head = f[:k]
    lo = int(max(8 * bar, total * 0.4) * SR) // hop
    hi = len(f) - k
    cs = [(float((f[L:L + k] * head).sum(axis=1).mean()), L) for L in range(lo, hi)]
    top = max(c for c, _ in cs)
    # die laengste Schleife, die fast so gut passt wie die beste (kurze Schleifen wiederholen sich hoerbar)
    best, L = max(((c, L) for c, L in cs if c >= top - 0.08), key=lambda t: t[1])
    L *= hop
    m = x[:L].copy()
    t = np.linspace(0, np.pi / 2, u)[:, None]
    m[:u] = x[:u] * np.sin(t) + x[L:L + u] * np.cos(t)
    rms = np.sqrt((m ** 2).mean())
    # so laut wie die erzeugte Musik im Spiel (im Browser gemessen: -19 dBFS waren dort gut 6 dB lauter)
    m *= 10 ** (-25 / 20) / max(rms, 1e-6)
    pk = np.abs(m).max()
    if pk > 0.97:
        m *= 0.97 / pk
    one = SR
    out = np.concatenate([m[-one:], m, m[:one]])
    return out, L / SR, best, von / SR


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
        y, L, c, a = seamless(x, st["bpm"], st["takt"])
        b = mp3(y, kbps)
        open(os.path.join(aus, st["datei"] + ".mp3"), "wb").write(b)
        liste[st["ort"]] = {"datei": st["datei"], "len": round(L, 4)}
        print("%-18s Hauptteil ab %.1f s, Schleife %.1f s, Passung %.2f, %d KB" % (st["ort"], a, L, c, len(b) // 1024))
        if vor:
            # zum Anhoeren: die Schleife zweimal hintereinander, die Naht liegt in der Mitte
            os.makedirs(vor, exist_ok=True)
            m = y[SR:SR + int(L * SR)]
            open(os.path.join(vor, st["datei"] + "-naht.mp3"), "wb").write(mp3(np.concatenate([m[-10 * SR:], m[:10 * SR]]), kbps))
    json.dump(liste, open(os.path.join(aus, "musik.json"), "w"), ensure_ascii=False, indent=1)
    print(len(liste), "Stuecke in", aus)


if __name__ == "__main__":
    main()
