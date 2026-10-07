"""Pruefserver: antwortet wie die Meshy-API, liefert aber vorhandene Testmodelle. So laesst sich die ganze Werkstatt
(Bestellen, Warten, Laden, Credits, Fortsetzen, Umrechnen, Bericht) ohne Credits und ohne Netz durchspielen.

Aufruf: python pruefserver.py <port> <zuordnung.json>
        dann: MESHY_API_BASE=http://127.0.0.1:<port>/ MESHY_API_KEY=pruefung python werkstatt.py ...

zuordnung.json: {"bilder": {"<bilddatei>": "<modell.glb>", ...}, "bewegungen": "<glb mit Bewegungen>", "guthaben": 1000,
                 "dauer": 0}
Ein Auftrag "Bild zu 3D" wird ueber den Inhalt des gesendeten Bildes der Bilddatei zugeordnet ("Mehrere Bilder zu 3D"
ueber das erste Bild, die Vorderansicht). Mit "dauer" (Sekunden, oder Umgebung PRUEF_DAUER) bleiben Auftraege so lange
in Arbeit; damit laesst sich ein Abbruch waehrend des Wartens nachstellen. Mit "rigging_mehrbild": false (oder
Umgebung PRUEF_RIG_MEHRBILD=nein) lehnt das Rigging Auftraege aus mehreren Bildern ab und nimmt nur das Modell als Datei. Rigging liefert dasselbe
Modell (es muss also schon ein Skelett haben), Bewegungen liefern die Datei aus "bewegungen". Credits wie bei Meshy
(30, 5, 3 je Bewegung) werden vom Guthaben abgezogen. Nur fuer Tests; die Modelle gehoeren nicht ins Spiel.
"""
import base64
import hashlib
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1])
CONF = json.load(open(sys.argv[2]))
BASE = os.path.dirname(os.path.abspath(sys.argv[2]))
path_of = lambda p: p if os.path.isabs(p) else os.path.join(BASE, p)  # noqa: E731


def digest(data):
    return hashlib.sha1(data).hexdigest()


# Bilder werden vor dem Senden eventuell verkleinert; deshalb auch die verkleinerte Fassung zuordnen
def image_keys(path):
    data = open(path, "rb").read()
    keys = {digest(data)}
    try:
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        import meshy_api
        uri = meshy_api.data_uri(path)
        keys.add(digest(base64.b64decode(uri.split(",", 1)[1])))
    except Exception:
        pass
    return keys


IMAGES = {}
for img, model in CONF["bilder"].items():
    for k in image_keys(path_of(img)):
        IMAGES[k] = path_of(model)
TASKS = {}
STATE = {"balance": CONF.get("guthaben", 1000), "n": 0}
DAUER = float(os.environ.get("PRUEF_DAUER") or CONF.get("dauer", 0))
RIG_MULTI = os.environ.get("PRUEF_RIG_MEHRBILD", "ja" if CONF.get("rigging_mehrbild", True) else "nein") != "nein"


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, obj=None, raw=None, ctype="application/json"):
        body = raw if raw is not None else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        if not self.headers.get("Authorization", "").startswith("Bearer "):
            self.send(401, {"message": "Unauthorized"})
            return False
        return True

    def new_task(self, kind, cost, **kw):
        STATE["n"] += 1
        tid = "%s-%04d" % (kind, STATE["n"])
        STATE["balance"] -= cost
        TASKS[tid] = dict(kind=kind, cost=cost, start=time.time(), **kw)
        return tid

    def do_POST(self):
        if not self.authorized():
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        kind = self.path.strip("/").split("/")[-1]
        if kind in ("image-to-3d", "multi-image-to-3d"):
            uri = body["image_url"] if kind == "image-to-3d" else body["image_urls"][0]
            if kind == "multi-image-to-3d" and not 1 <= len(body["image_urls"]) <= 4:
                return self.send(400, {"message": "image_urls: 1 bis 4 Bilder"})
            data = base64.b64decode(uri.split(",", 1)[1])
            model = IMAGES.get(digest(data))
            if not model:
                return self.send(400, {"message": "Pruefserver: Bild nicht in der Zuordnung"})
            tid = self.new_task(kind, 30, model=model, image=data)
        elif kind == "rigging":
            if body.get("model_url"):
                # Modell als Data-URI: wird unter den bekannten Modellen wiedergefunden
                glb = base64.b64decode(body["model_url"].split(",", 1)[1])
                src = next((t for t in TASKS.values() if t.get("model") and open(t["model"], "rb").read() == glb), None)
                if not src:
                    return self.send(400, {"message": "model_url: Modell unbekannt"})
            else:
                src = TASKS.get(body.get("input_task_id"))
                if not src:
                    return self.send(404, {"message": "input_task_id unbekannt"})
                if src["kind"] == "multi-image-to-3d" and not RIG_MULTI:
                    return self.send(400, {"message": "input_task_id: Auftrag aus mehreren Bildern wird nicht unterstuetzt"})
            tid = self.new_task(kind, 5, model=src["model"], image=src["image"])
        elif kind == "animations":
            if body.get("rig_task_id") not in TASKS:
                return self.send(404, {"message": "rig_task_id unbekannt"})
            ids = body.get("action_ids") or []
            tid = self.new_task(kind, 3 * len(ids), model=path_of(CONF["bewegungen"]))
        else:
            return self.send(404, {"message": "unbekannt: " + self.path})
        self.send(202, {"result": tid})

    def do_GET(self):
        parts = self.path.strip("/").split("/")
        if parts[0] == "files":
            tid, ext = os.path.splitext(parts[1])
            t = TASKS.get(tid)
            if not t:
                return self.send(404, {"message": "Datei unbekannt"})
            if ext == ".png":
                return self.send(200, raw=t.get("image", b""), ctype="image/png")
            return self.send(200, raw=open(t["model"], "rb").read(), ctype="model/gltf-binary")
        if not self.authorized():
            return
        if parts[-1] == "balance":
            return self.send(200, {"balance": STATE["balance"]})
        tid = parts[-1]
        t = TASKS.get(tid)
        if not t:
            return self.send(404, {"message": "Auftrag unbekannt"})
        url = "http://127.0.0.1:%d/files/%s" % (PORT, tid)
        if time.time() - t["start"] < DAUER:
            return self.send(200, {"id": tid, "status": "IN_PROGRESS", "progress": 50, "consumed_credits": t["cost"], "task_error": {"message": ""}})
        out = {"id": tid, "status": "SUCCEEDED", "progress": 100, "consumed_credits": t["cost"], "task_error": {"message": ""}}
        if t["kind"] in ("image-to-3d", "multi-image-to-3d"):
            out.update(model_urls={"glb": url + ".glb"}, thumbnail_url=url + ".png")
        elif t["kind"] == "rigging":
            out["result"] = {"rigged_character_glb_url": url + ".glb", "basic_animations": {"walking_glb_url": url + ".glb"}}
        else:
            out["result"] = {"animation_glb_url": url + ".glb"}
        self.send(200, out)


print("Pruefserver auf Port", PORT, "mit", len(CONF["bilder"]), "Bildern", flush=True)
ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
