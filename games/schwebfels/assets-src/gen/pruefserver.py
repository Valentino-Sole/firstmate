"""Pruefserver: antwortet wie die Meshy-API, liefert aber vorhandene Testmodelle. So laesst sich die ganze Werkstatt
(Bestellen, Warten, Laden, Credits, Fortsetzen, Umrechnen, Bericht) ohne Credits und ohne Netz durchspielen.

Aufruf: python pruefserver.py <port> <zuordnung.json>
        dann: MESHY_API_BASE=http://127.0.0.1:<port>/ MESHY_API_KEY=pruefung python werkstatt.py ...

zuordnung.json: {"bilder": {"<bilddatei>": "<modell.glb>", ...}, "bewegungen": "<glb mit Bewegungen>", "guthaben": 1000}
Ein Auftrag "Bild zu 3D" wird ueber den Inhalt des gesendeten Bildes der Bilddatei zugeordnet. Rigging liefert dasselbe
Modell (es muss also schon ein Skelett haben), Bewegungen liefern die Datei aus "bewegungen". Credits wie bei Meshy
(30, 5, 3 je Bewegung) werden vom Guthaben abgezogen. Nur fuer Tests; die Modelle gehoeren nicht ins Spiel.
"""
import base64
import hashlib
import json
import os
import sys
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
        TASKS[tid] = dict(kind=kind, cost=cost, **kw)
        return tid

    def do_POST(self):
        if not self.authorized():
            return
        body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        kind = self.path.strip("/").split("/")[-1]
        if kind == "image-to-3d":
            data = base64.b64decode(body["image_url"].split(",", 1)[1])
            model = IMAGES.get(digest(data))
            if not model:
                return self.send(400, {"message": "Pruefserver: Bild nicht in der Zuordnung"})
            tid = self.new_task(kind, 30, model=model, image=data)
        elif kind == "rigging":
            src = TASKS.get(body.get("input_task_id"))
            if not src:
                return self.send(404, {"message": "input_task_id unbekannt"})
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
        out = {"id": tid, "status": "SUCCEEDED", "progress": 100, "consumed_credits": t["cost"], "task_error": {"message": ""}}
        if t["kind"] == "image-to-3d":
            out.update(model_urls={"glb": url + ".glb"}, thumbnail_url=url + ".png")
        elif t["kind"] == "rigging":
            out["result"] = {"rigged_character_glb_url": url + ".glb", "basic_animations": {"walking_glb_url": url + ".glb"}}
        else:
            out["result"] = {"animation_glb_url": url + ".glb"}
        self.send(200, out)


print("Pruefserver auf Port", PORT, "mit", len(CONF["bilder"]), "Bildern", flush=True)
ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
