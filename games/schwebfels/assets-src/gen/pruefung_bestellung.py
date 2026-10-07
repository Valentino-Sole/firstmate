"""Pruefung der Bestellungen (meshy_api.py) gegen den Pruefserver, ohne Meshy, ohne Credits und ohne Blender.

Aufruf: python pruefung_bestellung.py   (dauert etwa zwei Minuten, weil die Auftraege absichtlich in Arbeit bleiben)

Spielt nach, was im echten Lauf Geld kosten koennte:
- Abbruch waehrend Meshy an einer Figur aus zwei Ansichten rechnet, dann erneuter Aufruf: nichts doppelt bezahlt
- Abbruch waehrend der ersten Bewegungen, dann erneuter Aufruf: jede Bewegung einmal bezahlt, Namen in Reihenfolge
- Rigging lehnt einen Auftrag aus mehreren Bildern ab: das Modell geht als Datei zum Rigging
- ein Einzelbild geht weiter an "Bild zu 3D"
"""
import json
import os
import signal
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
API = os.path.join(HERE, "meshy_api.py")
fails = []


def check(cond, msg):
    if not cond:
        fails.append(msg)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


def make_files(d):
    # kleine Bilder mit unterschiedlichem Inhalt (der Pruefserver ordnet ueber den Inhalt zu) und Platzhalter-Modelle
    import zlib
    import struct

    def png(path, seed):
        raw = b"".join(b"\x00" + bytes((seed * 37 + x * 11 + y * 5) % 256 for x in range(8 * 3)) for y in range(8))
        chunk = lambda t, data: struct.pack(">I", len(data)) + t + data + struct.pack(">I", zlib.crc32(t + data))  # noqa: E731
        open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
    for i, n in enumerate(["vorn", "seite", "axt"]):
        png(os.path.join(d, n + ".png"), i + 1)
    for n in ["figur", "axt", "bewegungen"]:
        open(os.path.join(d, n + ".glb"), "wb").write(("glTF Platzhalter " + n).encode() * 50)
    json.dump({"bilder": {"vorn.png": "figur.glb", "axt.png": "axt.glb"}, "bewegungen": "bewegungen.glb", "guthaben": 1000},
              open(os.path.join(d, "zuordnung.json"), "w"))


class Server:
    def __init__(self, d, **env):
        self.port = free_port()
        e = dict(os.environ, **env)
        self.p = subprocess.Popen([sys.executable, os.path.join(HERE, "pruefserver.py"), str(self.port), os.path.join(d, "zuordnung.json")],
                                  env=e, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        time.sleep(1.5)
        self.env = dict(os.environ, MESHY_API_BASE="http://127.0.0.1:%d/" % self.port, MESHY_API_KEY="pruefung")

    def balance(self):
        out = subprocess.run([sys.executable, API, "guthaben"], env=self.env, capture_output=True, text=True).stdout
        return json.loads(out)["balance"]

    def api(self, *args, abort_after=None):
        cmd = [sys.executable, API, *args]
        if abort_after is None:
            r = subprocess.run(cmd, env=self.env, capture_output=True, text=True)
            if r.returncode:
                fails.append("Aufruf fehlgeschlagen: %s\n%s" % (" ".join(args), (r.stdout + r.stderr)[-600:]))
            return r.stdout
        p = subprocess.Popen(cmd, env=self.env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        time.sleep(abort_after)
        p.send_signal(signal.SIGTERM)
        p.wait()
        return p.stdout.read()

    def stop(self):
        self.p.terminate()
        self.p.wait()


def records(out):
    p = os.path.join(out, "credits.jsonl")
    return [json.loads(x) for x in open(p)] if os.path.exists(p) else []


def main():
    d = tempfile.mkdtemp(prefix="sb-bestellung-")
    make_files(d)
    out = os.path.join(d, "meshy")
    vorn, seite, axt = (os.path.join(d, n + ".png") for n in ("vorn", "seite", "axt"))

    # 1. Figur aus zwei Ansichten, Abbruch beim Warten
    S = Server(d, PRUEF_DAUER="10")
    try:
        S.api("--out", out, "figur", "held", vorn, "--hoehe", "1.9", "--ansichten", seite, abort_after=3)
        check(S.balance() == 970, "Figur: nach dem Abbruch sollten 30 Credits verbraucht sein, Guthaben %s" % S.balance())
        st = json.load(open(os.path.join(out, "held", "auftraege.json")))
        check(st.get("image_to_3d", {}).get("kind") == "multi-image-to-3d", "Figur: zwei Ansichten gehen nicht an 'Mehrere Bilder zu 3D': %s" % st)
        log = S.api("--out", out, "figur", "held", vorn, "--hoehe", "1.9", "--ansichten", seite)
        check("fortgesetzt" in log, "Figur: der begonnene Auftrag wurde nicht fortgesetzt")
        check(S.balance() == 965, "Figur: doppelt bezahlt, Guthaben %s statt 965" % S.balance())
        check(os.path.exists(os.path.join(out, "held", "rigged.glb")), "Figur: rigged.glb fehlt")

        # 2. Bewegungen, Abbruch waehrend des ersten Auftrags
        S.api("--out", out, "bewegungen", "held", abort_after=3)
        check(S.balance() == 935, "Bewegungen: nach dem Abbruch sollten 30 Credits mehr verbraucht sein, Guthaben %s" % S.balance())
        log = S.api("--out", out, "bewegungen", "held")
        check("fortgesetzt" in log, "Bewegungen: der begonnene Auftrag wurde nicht fortgesetzt")
        check(S.balance() == 905, "Bewegungen: doppelt bezahlt, Guthaben %s statt 905" % S.balance())
        files = sorted(os.listdir(os.path.join(out, "held")))
        check(all(f in files for f in ["bewegungen_1.glb", "bewegungen_1.json", "bewegungen_2.glb", "bewegungen_2.json"]) and
              not any(f.endswith(".part") for f in files), "Bewegungen: Dateien fehlen oder sind unvollstaendig: %s" % files)
        first = json.load(open(os.path.join(out, "held", "bewegungen_1.json")))["bewegungen"]
        check(first[0]["id"] == 89 and len(first) == 10, "Bewegungen: erster Auftrag hat falsche Bewegungen: %s" % first[:2])
        recs = records(out)
        check(len(recs) == 4 and len({r["auftrag"] for r in recs}) == 4, "Credit-Protokoll: %d Eintraege statt 4" % len(recs))
        check(sum(r["credits"] for r in recs) == 95, "Credit-Protokoll: Summe %d statt 95" % sum(r["credits"] for r in recs))

        # 4. ein Bild geht an "Bild zu 3D"
        S.api("--out", out, "teil", "axt", axt)
        st = json.load(open(os.path.join(out, "axt", "auftraege.json")))
        check(st["image_to_3d"].get("kind") == "image-to-3d" and st["image_to_3d"].get("ok"), "Teil: ein Bild ging nicht an 'Bild zu 3D': %s" % st)
    finally:
        S.stop()

    # 3. Rigging nimmt keinen Auftrag aus mehreren Bildern: Modell als Datei
    S = Server(d, PRUEF_RIG_MEHRBILD="nein")
    try:
        out2 = os.path.join(d, "meshy2")
        log = S.api("--out", out2, "figur", "held", vorn, "--hoehe", "1.9", "--ansichten", seite)
        check("als Datei" in log and os.path.exists(os.path.join(out2, "held", "rigged.glb")), "Rigging: Rueckfall auf das Modell als Datei greift nicht")
        check(S.balance() == 965, "Rigging: Kosten %d statt 35" % (1000 - S.balance()))
    finally:
        S.stop()

    if fails:
        print("FEHLER:\n- " + "\n- ".join(fails))
        sys.exit(1)
    print("OK: Bestellungen werden nach Abbruechen fortgesetzt statt doppelt bezahlt; mehrere Ansichten und Rigging-Rueckfall gehen")


if __name__ == "__main__":
    main()
