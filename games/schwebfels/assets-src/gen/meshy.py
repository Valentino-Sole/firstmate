"""Meshy-Schnittstelle fuer die Bild-zu-3D-Strecke: Auftraege anlegen, abwarten, Ergebnisse sofort sichern,
verbrauchte Credits je Auftrag protokollieren.

Der Schluessel kommt nur aus der Umgebungsvariable MESHY_API_KEY und wird nie ausgegeben.
Meshy haelt Ergebnisse nur wenige Tage vor, deshalb laedt jeder Auftrag alles sofort herunter.

Aufruf (Ausgabeordner <aus>, Protokoll <aus>/credits.jsonl):
  python meshy.py balance
  python meshy.py img2img <aus> <name> "<anweisung>" <bild> [<bild> ...] [--model nano-banana-2] [--multiview] [--nobg] [--ratio 3:4]
  python meshy.py img23d  <aus> <name> <bild.png> [--pose a-pose|t-pose|none] [--pbr] [--res 2k] [--geom standard|2k|4k] [--polys N]
  python meshy.py multi23d <aus> <name> <bild1> <bild2> [...] [--pose a-pose] [--pbr]
  python meshy.py rig     <aus> <name> <auftrag-id oder figur.glb> [--height 1.8]   (GLB hoechstens 300.000 Flaechen, siehe decimate_glb.py)
  python meshy.py report  <aus>
Mit --dry-run wird nur der Auftrag angezeigt (ohne Bilddaten), nichts gesendet.
"""
import base64
import json
import os
import ssl
import sys
import time
import urllib.request
import urllib.error

API = "https://api.meshy.ai/openapi/v1"
ENDPOINT = {"img2img": "image-to-image", "img23d": "image-to-3d", "multi23d": "multi-image-to-3d", "rig": "rigging"}


def ctx():
    caf = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    return ssl.create_default_context(cafile=caf) if caf and os.path.exists(caf) else ssl.create_default_context()


def key():
    k = os.environ.get("MESHY_API_KEY", "").strip()
    if not k:
        raise SystemExit("MESHY_API_KEY fehlt in der Umgebung (Umgebungseinstellungen, danach neue Sitzung).")
    return k


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("Authorization", "Bearer " + key())
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, context=ctx(), timeout=120) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")[:500]
        raise SystemExit("Meshy antwortet %d auf %s %s: %s" % (e.code, method, path, msg))


def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    mime = "image/png" if ext == ".png" else "image/jpeg"
    return "data:%s;base64,%s" % (mime, base64.b64encode(open(path, "rb").read()).decode())


def fetch(url, dest):
    with urllib.request.urlopen(urllib.request.Request(url), context=ctx(), timeout=300) as r, open(dest, "wb") as f:
        f.write(r.read())
    return dest


def urls_of(task):
    """Alle herunterladbaren Adressen eines fertigen Auftrags (Modelle, Texturen, Bilder, Skelett)."""
    out = {}

    def walk(o, pre):
        if isinstance(o, dict):
            for k, v in o.items():
                walk(v, pre + [k])
        elif isinstance(o, list):
            for i, v in enumerate(o):
                walk(v, pre + [str(i)])
        elif isinstance(o, str) and o.startswith("https://"):
            out["_".join(pre)] = o
    for k in ("model_urls", "texture_urls", "thumbnail_url", "thumbnail_urls", "image_urls", "result"):
        if k in task:
            walk(task[k], [k])
    return out


def ext_of(url):
    p = url.split("?")[0]
    e = os.path.splitext(p)[1]
    return e if e and len(e) <= 6 else ".bin"


def run(kind, outdir, name, body, inputs, dry):
    shown = json.loads(json.dumps(body))
    for k in ("image_url", "texture_image_url", "model_url"):
        if isinstance(shown.get(k), str) and shown[k].startswith("data:"):
            shown[k] = "<Bilddaten>"
    for k in ("reference_image_urls", "image_urls"):
        if isinstance(shown.get(k), list):
            shown[k] = ["<Bilddaten>" if str(x).startswith("data:") else x for x in shown[k]]
    print("Auftrag", ENDPOINT[kind], json.dumps(shown, ensure_ascii=False))
    if dry:
        return None
    os.makedirs(outdir, exist_ok=True)
    tid = call("POST", "/" + ENDPOINT[kind], body)["result"]
    print("Auftrag angelegt:", tid, flush=True)
    t0 = time.time()
    while True:
        task = call("GET", "/%s/%s" % (ENDPOINT[kind], tid))
        st = task.get("status")
        if st in ("SUCCEEDED", "FAILED", "CANCELED"):
            break
        print("  %s %s%%" % (st, task.get("progress", 0)), flush=True)
        time.sleep(8)
    files = {}
    if st == "SUCCEEDED":
        d = os.path.join(outdir, name)
        os.makedirs(d, exist_ok=True)
        for label, url in urls_of(task).items():
            files[label] = os.path.relpath(fetch(url, os.path.join(d, label + ext_of(url))), outdir)
    rec = {"zeit": time.strftime("%Y-%m-%d %H:%M:%S"), "name": name, "art": ENDPOINT[kind], "auftrag": tid, "status": st,
           "credits": task.get("consumed_credits"), "sekunden": round(time.time() - t0), "eingaben": inputs,
           "einstellungen": {k: v for k, v in shown.items() if k not in ("image_url", "reference_image_urls", "image_urls", "model_url")},
           "dateien": files, "fehler": task.get("task_error")}
    with open(os.path.join(outdir, "credits.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print("Ergebnis:", st, "Credits:", rec["credits"], "Dateien:", len(files))
    return rec


def opt(args, flag, default=None):
    if flag in args:
        i = args.index(flag)
        v = args[i + 1]
        del args[i:i + 2]
        return v
    return default


def flag(args, f):
    if f in args:
        args.remove(f)
        return True
    return False


def main():
    a = sys.argv[1:]
    dry = flag(a, "--dry-run")
    cmd = a.pop(0) if a else "help"
    if cmd == "balance":
        print("Guthaben:", call("GET", "/balance"))
        return
    if cmd == "report":
        tot = 0
        for line in open(os.path.join(a[0], "credits.jsonl"), encoding="utf-8"):
            r = json.loads(line)
            tot += r.get("credits") or 0
            print("%s  %-24s %-18s %-9s %4s Credits" % (r["zeit"], r["name"], r["art"], r["status"], r.get("credits")))
        print("Summe:", tot, "Credits")
        return
    if cmd == "img2img":
        model = opt(a, "--model", "nano-banana-2")
        ratio = opt(a, "--ratio")
        mv = flag(a, "--multiview")
        nobg = flag(a, "--nobg")
        out, name, prompt, imgs = a[0], a[1], a[2], a[3:]
        body = {"ai_model": model, "prompt": prompt, "reference_image_urls": [data_uri(p) for p in imgs]}
        if mv:
            body["generate_multi_view"] = True
        elif ratio:
            body["aspect_ratio"] = ratio
        if nobg:
            body["remove_background"] = True
        run(cmd, out, name, body, [os.path.basename(p) for p in imgs], dry)
    elif cmd in ("img23d", "multi23d"):
        pose = opt(a, "--pose", "a-pose")
        res = opt(a, "--res", "2k")
        geom = opt(a, "--geom", "standard")
        polys = opt(a, "--polys")
        pbr = flag(a, "--pbr")
        out, name, imgs = a[0], a[1], a[2:]
        body = {"ai_model": "latest", "should_texture": True, "enable_pbr": pbr, "texture_resolution": res, "target_formats": ["glb"]}
        if pose != "none":
            body["pose_mode"] = pose
        if geom != "standard":
            body["geometry_resolution"] = geom
        if polys:
            body.update({"should_remesh": True, "target_polycount": int(polys)})
        if cmd == "img23d":
            body["image_url"] = data_uri(imgs[0])
        else:
            body["image_urls"] = [data_uri(p) for p in imgs]
        run(cmd, out, name, body, [os.path.basename(p) for p in imgs], dry)
    elif cmd == "rig":
        h = float(opt(a, "--height", "1.8"))
        out, name, src = a[0], a[1], a[2]
        if src.lower().endswith(".glb") and os.path.exists(src):
            body = {"model_url": "data:model/gltf-binary;base64," + base64.b64encode(open(src, "rb").read()).decode(), "height_meters": h}
        else:
            body = {"input_task_id": src, "height_meters": h}
        run(cmd, out, name, body, [os.path.basename(src)], dry)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
