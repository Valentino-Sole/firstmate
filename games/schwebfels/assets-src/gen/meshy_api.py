"""Figuren und Bewegungen bei Meshy bestellen und herunterladen (Meshy-API, https://docs.meshy.ai/en/api).

Der Schluessel kommt nur aus der Umgebung (MESHY_API_KEY), nie aus dem Chat oder einer Datei im Repository.
Jeder Auftrag landet mit den tatsaechlich abgebuchten Credits in <ausgabe>/credits.jsonl. Bereits erledigte
Auftraege einer Figur stehen in <ausgabe>/<figur>/auftraege.json und werden nicht noch einmal bezahlt; ein Auftrag
steht dort schon vor dem Warten, so setzt ein erneuter Aufruf nach einem Abbruch ihn fort, statt neu zu bestellen.

Aufrufe (Ausgabeordner mit --out, Standard: ./meshy):
  python meshy_api.py kosten [--clips standard|mehr]          Kostenschaetzung ohne Schluessel
  python meshy_api.py guthaben                                 Guthaben abfragen
  python meshy_api.py figur <name> <bild.png|jpg> --hoehe 1.9 [--budget 60] [--polys 15000] [--pose t-pose]
                                    [--prompt "Texturhinweis"] [--ansichten seite.png,ruecken.png] [--trocken]
      Bild zu 3D (mit Textur), danach Rigging; laedt model.glb, rigged.glb sowie Gang und Lauf herunter.
      Mit --ansichten gehen bis zu 4 Ansichten derselben Figur an "Mehrere Bilder zu 3D" (gleicher Preis; das
      erste Bild ist die Vorderansicht), das ergibt meist bessere Rueckseiten und Proportionen.
  python meshy_api.py teil <name> <bild.png|jpg> [--polys 5000] [--ansichten ...] [--budget 30] [--trocken]
      Einzelnes Modell ohne Rigging (Ruestungsteil, Waffe, Bestie, Requisit): nur Bild zu 3D; danach fit_piece.py,
      weapon.py, from_glb.py oder prop.py
  python meshy_api.py bewegungen <name> [--clips standard|mehr|<id,id,...>] [--budget 90] [--trocken]
      Bewegungen aus der Meshy-Bibliothek auf das Skelett dieser Figur (je Anfrage bis zu 10, 3 Credits je Bewegung).
      Weil alle Meshy-Figuren dasselbe Skelett haben, reicht das einmal; meshy.py teilt die Bewegungen mit allen Figuren.
  python meshy_api.py credits                                  Summe der verbrauchten Credits je Figur

Danach: python meshy.py <npz> <out>/<name>/rigged.glb --anim <out>/<name>/bewegungen_1.glb ... --race <volk> --gender f|m
"""
import argparse
import base64
import json
import os
import time
import urllib.error
import urllib.request

API = "https://api.meshy.ai/openapi/v1/"
# Nur fuer Proben mit einem Pruefserver auf diesem Rechner (der Schluessel geht nie an fremde Adressen)
if os.environ.get("MESHY_API_BASE"):
    if not os.environ["MESHY_API_BASE"].startswith(("http://127.0.0.1:", "http://localhost:")):
        raise SystemExit("MESHY_API_BASE darf nur auf einen Pruefserver auf diesem Rechner zeigen.")
    API = os.environ["MESHY_API_BASE"].rstrip("/") + "/"
# Bewegungen aus der Meshy-Bibliothek (Nummer, Name), geprueft gegen https://docs.meshy.ai/en/api/animation-library
CLIPS = {
    "standard": [
        (89, "Combat_Stance"), (21, "Walk_Fight_Forward"), (219, "Right_Hand_Sword_Slash"), (237, "Charged_Axe_Chop"),
        (128, "Heavy_Hammer_Swing"), (240, "Thrust_Slash"), (91, "Double_Blade_Spin"), (224, "Archery_Shot"),
        (125, "Charged_Spell_Cast"), (178, "Hit_Reaction"),
        (147, "Sword_Parry"), (138, "Block1"), (156, "Stand_Dodge"), (8, "Dead"), (59, "Victory_Cheer"),
        (33, "Chair_Sit_Idle_M"), (32, "Chair_Sit_Idle_F"), (343, "Sit_and_Drink"), (102, "Sword_Judgment"), (127, "Charged_Ground_Slam"),
    ],
    "mehr": [
        (0, "Idle"), (30, "Casual_Walk"), (92, "Double_Combo_Attack"), (222, "Draw_and_Shoot_from_Back"), (149, "Two_Handed_Parry"),
        (187, "Knock_Down"), (298, "Cheer_with_Both_Hands_Up"), (97, "Left_Slash"), (105, "Triple_Combo_Attack"), (126, "Charged_Spell_Cast_1"),
    ],
}
# Preise laut https://docs.meshy.ai/en/api/pricing (Credits je Auftrag)
PRICE = {"image-to-3d": 30, "rigging": 5, "animation": 3}


def key():
    k = os.environ.get("MESHY_API_KEY", "").strip()
    if not k:
        raise SystemExit("MESHY_API_KEY fehlt. Bitte in den Umgebungseinstellungen hinterlegen (nicht in den Chat schreiben).")
    return k


def call(method, path, body=None, missing_ok=False):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method,
                                 headers={"Authorization": "Bearer " + key(), "Content-Type": "application/json"})
    last = None
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8", "replace")[:400]
            if e.code == 429 or e.code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            if e.code == 404 and missing_ok:
                return None
            raise SystemExit("Meshy meldet %d bei %s %s: %s" % (e.code, method, path, msg))
        except urllib.error.URLError as e:
            time.sleep(5 * (attempt + 1))
            last = e
    raise SystemExit("Meshy nicht erreichbar oder ueberlastet: %s" % (last or "zu viele Anfragen"))


def wait(kind, tid, missing_ok=False):
    t0 = time.time()
    while True:
        t = call("GET", "%s/%s" % (kind, tid), missing_ok=missing_ok)
        if t is None:
            return None
        st = t.get("status")
        print("  %s %s: %s %s%%" % (kind, tid[:8], st, t.get("progress", "")), flush=True)
        if st in ("SUCCEEDED", "FAILED", "CANCELED", "EXPIRED"):
            return t
        if time.time() - t0 > 3600:
            raise SystemExit("Zeitueberschreitung beim Warten auf " + tid)
        time.sleep(8)


def download(url, path):
    # erst unter anderem Namen, damit ein Abbruch keine halbe Datei hinterlaesst
    with urllib.request.urlopen(url, timeout=600) as r, open(path + ".part", "wb") as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    os.replace(path + ".part", path)
    print("  geladen:", path, round(os.path.getsize(path) / 1024), "KB")


class Store:
    def __init__(self, out, name=None):
        self.out = out
        os.makedirs(out, exist_ok=True)
        self.dir = os.path.join(out, name) if name else None
        self.name = name
        self.state = {}
        if self.dir:
            os.makedirs(self.dir, exist_ok=True)
            p = os.path.join(self.dir, "auftraege.json")
            if os.path.exists(p):
                self.state = json.load(open(p))

    def save(self):
        json.dump(self.state, open(os.path.join(self.dir, "auftraege.json"), "w"), indent=1, ensure_ascii=False)

    def credits(self, kind, task):
        # ein Auftrag steht nur einmal im Protokoll, auch wenn er nach einem Abbruch erneut abgefragt wird
        p = os.path.join(self.out, "credits.jsonl")
        if os.path.exists(p):
            for line in open(p):
                old = json.loads(line)
                if old.get("auftrag") == task.get("id") and old.get("status") == task.get("status"):
                    return old.get("credits") or 0
        rec = {"zeit": time.strftime("%Y-%m-%d %H:%M:%S"), "figur": self.name, "art": kind, "auftrag": task.get("id"),
               "status": task.get("status"), "credits": task.get("consumed_credits", 0)}
        with open(p, "a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return rec["credits"] or 0


def run_task(S, key, kind, body, art=None):
    """Startet einen bezahlten Auftrag oder setzt einen begonnenen fort. Der Auftrag steht vor dem Warten in
    auftraege.json; bricht ein Lauf ab (Netz, Sitzungsende, Download), fragt der naechste Aufruf denselben Auftrag
    kostenlos erneut ab, statt ihn noch einmal zu bezahlen. Nur ein fehlgeschlagener (von Meshy erstatteter) oder nicht
    mehr vorhandener Auftrag wird neu bestellt."""
    rec = S.state.get(key) or {}
    if rec.get("id") and not rec.get("ok"):
        print("  begonnener Auftrag %s wird fortgesetzt (keine neue Bestellung)" % rec["id"][:8])
        t = wait(rec.get("kind", kind), rec["id"], missing_ok=True)
        if t is not None:
            S.credits(art or kind, t)
            if t.get("status") == "SUCCEEDED":
                return t
        print("  der begonnene Auftrag ist %s, neue Bestellung" % (t.get("status") if t else "bei Meshy nicht mehr vorhanden"))
    tid = call("POST", kind, body)["result"]
    S.state[key] = dict({k: v for k, v in rec.items() if k not in ("id", "kind", "ok")}, id=tid, kind=kind)
    S.save()
    t = wait(kind, tid)
    S.credits(art or kind, t)
    return t


def guard(budget, cost, what):
    print("Geschaetzt: %d Credits fuer %s" % (cost, what))
    if budget is not None and cost > budget:
        raise SystemExit("Abbruch: Schaetzung %d Credits liegt ueber dem Budget %d." % (cost, budget))


def data_uri(path):
    ext = os.path.splitext(path)[1].lower()
    mime = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}.get(ext)
    if not mime:
        raise SystemExit("Meshy nimmt nur .png, .jpg oder .jpeg: " + path)
    data = open(path, "rb").read()
    # sehr grosse Konzeptbilder verkleinern (laengste Seite 2048 Pixel), damit die Anfrage handlich bleibt
    try:
        from PIL import Image
        import io
        im = Image.open(io.BytesIO(data))
        if max(im.size) > 2048 or len(data) > 6 * 1024 * 1024:
            im.thumbnail((2048, 2048))
            b = io.BytesIO()
            if mime == "image/png":
                im.save(b, "PNG", optimize=True)
            else:
                im.convert("RGB").save(b, "JPEG", quality=92)
            data = b.getvalue()
            print("  Bild verkleinert auf", im.size, round(len(data) / 1024), "KB")
    except ImportError:
        pass
    return "data:%s;base64,%s" % (mime, base64.b64encode(data).decode("ascii"))


AI_MODEL = "latest"  # Meshy 7.1 (Stand Oktober 2026)


def request_3d(bilder, polys, pose, prompt, pbr=True):
    # Felder laut API-Doku (docs.meshy.ai/en/api/image-to-3d und /multi-image-to-3d, geprueft am 7. Oktober 2026);
    # should_remesh mit target_polycount, damit das Rigging unter 300.000 Flaechen bleibt. Mehrere Bilder (2 bis 4
    # Ansichten desselben Modells, das erste ist die Vorderansicht) gehen an "Mehrere Bilder zu 3D", gleicher Preis.
    if len(bilder) > 4:
        raise SystemExit("Meshy nimmt hoechstens 4 Ansichten eines Modells.")
    names = ["(Bild " + os.path.basename(b) + ")" for b in bilder]
    body = {("image_url" if len(bilder) == 1 else "image_urls"): names[0] if len(bilder) == 1 else names, "ai_model": AI_MODEL, "topology": "triangle", "should_remesh": True,
            "target_polycount": polys, "should_texture": True, "enable_pbr": pbr, "texture_resolution": "2k",
            "image_enhancement": True, "target_formats": ["glb"]}
    if AI_MODEL == "meshy-6" and len(bilder) == 1:
        body["remove_lighting"] = True  # bei einem Bild laut Doku nur mit meshy-6; bei mehreren Bildern ohnehin Standard
    if pose:
        body["pose_mode"] = pose
    if prompt:
        body["texture_prompt"] = prompt[:800]
    return body


def kind_3d(bilder):
    return "image-to-3d" if len(bilder) == 1 else "multi-image-to-3d"


def image_to_3d(S, body, bilder):
    """Bild zu 3D (einmal je Figur oder Teil), laedt model.glb und das Vorschaubild."""
    st = S.state
    if st.get("image_to_3d", {}).get("ok"):
        return
    if len(bilder) == 1:
        body = dict(body, image_url=data_uri(bilder[0]))
    else:
        body = dict(body, image_urls=[data_uri(b) for b in bilder])
    t = run_task(S, "image_to_3d", kind_3d(bilder), body, "image-to-3d")
    if t["status"] != "SUCCEEDED":
        raise SystemExit("Bild zu 3D fehlgeschlagen: " + json.dumps(t.get("task_error", {}), ensure_ascii=False))
    download(t["model_urls"]["glb"], os.path.join(S.dir, "model.glb"))
    if t.get("thumbnail_url"):
        download(t["thumbnail_url"], os.path.join(S.dir, "vorschau.png"))
    st["image_to_3d"]["ok"] = True
    S.save()


def views(a):
    """Vorderansicht und weitere Ansichten (--ansichten seite.png,hinten.png)."""
    return [a.bild] + [x.strip() for x in (getattr(a, "ansichten", None) or "").split(",") if x.strip()]


def cmd_figur(a):
    S = Store(a.out, a.name)
    st = S.state
    cost = (0 if st.get("image_to_3d", {}).get("ok") else PRICE["image-to-3d"]) + (0 if st.get("rigging", {}).get("ok") else PRICE["rigging"])
    guard(a.budget, cost, "Figur %s (Bild zu 3D und Rigging)" % a.name)
    bilder = views(a)
    body = request_3d(bilder, a.polys, a.pose, a.prompt, not a.ohne_pbr)
    if a.trocken:
        print("Trockenlauf, nichts gesendet:\n POST", kind_3d(bilder), json.dumps(body, ensure_ascii=False), "\n POST rigging", json.dumps({"input_task_id": "<aus Schritt 1>", "height_meters": a.hoehe}))
        return
    image_to_3d(S, body, bilder)
    if not st.get("rigging", {}).get("ok"):
        try:
            t = run_task(S, "rigging", "rigging", {"input_task_id": st["image_to_3d"]["id"], "height_meters": a.hoehe})
        except SystemExit as e:
            # Auftraege aus mehreren Bildern nimmt nicht jeder Meshy-Dienst als Eingabe (Remesh laut Doku nicht); dann
            # dasselbe Modell als Datei senden (laut Doku erlaubt: texturierte GLB als Data-URI)
            if st["image_to_3d"].get("kind") != "multi-image-to-3d" or "POST rigging" not in str(e):
                raise
            print("  Rigging lehnt den Auftrag aus mehreren Bildern ab (%s); sende das Modell als Datei" % e)
            glb = open(os.path.join(S.dir, "model.glb"), "rb").read()
            uri = "data:application/octet-stream;base64," + base64.b64encode(glb).decode("ascii")
            t = run_task(S, "rigging", "rigging", {"model_url": uri, "height_meters": a.hoehe})
        if t["status"] != "SUCCEEDED":
            raise SystemExit("Rigging fehlgeschlagen (Figur nicht als Zweibeiner erkannt?): " + json.dumps(t.get("task_error", {}), ensure_ascii=False))
        res = t["result"]
        download(res["rigged_character_glb_url"], os.path.join(S.dir, "rigged.glb"))
        for k, fn in (("walking_glb_url", "gang.glb"), ("running_glb_url", "lauf.glb")):
            u = (res.get("basic_animations") or {}).get(k)
            if u:
                download(u, os.path.join(S.dir, fn))
        st["rigging"]["ok"] = True
        S.save()
    print("Fertig:", S.dir)


def cmd_teil(a):
    """Einzelnes Modell ohne Skelett (Ruestungsteil, Waffe, Bestie, Requisit): nur Bild zu 3D, kein Rigging."""
    S = Store(a.out, a.name)
    cost = 0 if S.state.get("image_to_3d", {}).get("ok") else PRICE["image-to-3d"]
    guard(a.budget, cost, "Modell %s (Bild zu 3D)" % a.name)
    bilder = views(a)
    body = request_3d(bilder, a.polys, None, a.prompt, not a.ohne_pbr)
    if a.trocken:
        print("Trockenlauf, nichts gesendet:\n POST", kind_3d(bilder), json.dumps(body, ensure_ascii=False))
        return
    image_to_3d(S, body, bilder)
    print("Fertig:", S.dir)


def cmd_bewegungen(a):
    S = Store(a.out, a.name)
    rig = S.state.get("rigging", {})
    if a.clips in CLIPS:
        ids = CLIPS[a.clips]
    else:
        ids = [(int(x), "Bewegung_" + x) for x in a.clips.split(",") if x.strip()]
    done = set(S.state.get("bewegungen_ids", []))
    # ein begonnener Auftrag aus einem abgebrochenen Lauf kommt zuerst; er ist schon bezahlt
    offen = S.state.get("bewegungen_auftrag") or {}
    first = [tuple(c) for c in offen.get("clips", [])] if offen.get("id") and not offen.get("ok") else []
    todo = [c for c in ids if c[0] not in done and c not in first]
    batches = ([first] if first else []) + [todo[i:i + 10] for i in range(0, len(todo), 10)]
    guard(a.budget, PRICE["animation"] * len(todo), "%d Bewegungen fuer %s" % (len(todo), a.name))
    if a.trocken:
        for b in batches:
            print("Trockenlauf, nichts gesendet:\n POST animations", json.dumps({"rig_task_id": rig.get("id", "<aus figur>"), "action_ids": [c[0] for c in b]}), " ", ", ".join(c[1] for c in b))
        return
    if not rig.get("ok"):
        raise SystemExit("Fuer %s gibt es noch kein fertiges Rigging; zuerst 'figur' ausfuehren." % a.name)
    n = len([f for f in os.listdir(S.dir) if f.startswith("bewegungen_") and f.endswith(".glb")])
    for b in batches:
        if b is not first:
            S.state["bewegungen_auftrag"] = {"clips": [list(c) for c in b]}
        t = run_task(S, "bewegungen_auftrag", "animations", {"rig_task_id": rig["id"], "action_ids": [c[0] for c in b]}, "animation")
        if t["status"] != "SUCCEEDED":
            raise SystemExit("Bewegungen fehlgeschlagen: " + json.dumps(t.get("task_error", {}), ensure_ascii=False))
        n += 1
        download(t["result"]["animation_glb_url"], os.path.join(S.dir, "bewegungen_%d.glb" % n))
        # bestellte Namen neben der Datei: meshy.py ordnet damit die Bewegungen in der Datei zu
        with open(os.path.join(S.dir, "bewegungen_%d.json" % n), "w") as fh:
            json.dump({"bewegungen": [{"id": c[0], "name": c[1]} for c in b]}, fh, ensure_ascii=False, indent=1)
        S.state.setdefault("bewegungen_ids", []).extend(c[0] for c in b)
        S.state["bewegungen_auftrag"]["ok"] = True
        S.save()
    print("Fertig:", S.dir)


def cmd_kosten(a):
    n = len(CLIPS["standard"]) + (len(CLIPS["mehr"]) if a.clips == "mehr" else 0)
    fig = PRICE["image-to-3d"] + PRICE["rigging"]
    print("Je Figur (Bild zu 3D mit 2K-Textur und Rigging): %d Credits" % fig)
    print("Bewegungen (%d Stueck, einmal fuer alle Figuren): %d Credits" % (n, n * PRICE["animation"]))
    print("Je Einzelmodell (Ruestungsteil, Waffe, Bestie, Requisit): %d Credits" % PRICE["image-to-3d"])
    print("Zwei Figuren mit Bewegungen: %d Credits; den ganzen Qualitaetstest rechnet 'werkstatt.py plan ... --trocken'"
          % (2 * fig + n * PRICE["animation"]))
    print("Mehrere Ansichten eines Modells (bis zu 4 Bilder) kosten laut Meshy-Preisliste dasselbe wie ein Bild.")
    print("Hinweis: Meshy riggt nur Zweibeiner; Bestien bekommen ihr Vierbeiner-Skelett hier im Werkzeug (beasts/from_glb.py).")


def cmd_credits(a):
    p = os.path.join(a.out, "credits.jsonl")
    if not os.path.exists(p):
        print("Noch keine Auftraege.")
        return
    tot = {}
    for line in open(p):
        r = json.loads(line)
        tot.setdefault(r["figur"], 0)
        tot[r["figur"]] += r.get("credits") or 0
    for k, v in sorted(tot.items()):
        print("%-20s %5d Credits" % (k, v))
    print("%-20s %5d Credits" % ("Summe", sum(tot.values())))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default="meshy")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("figur")
    p.add_argument("name")
    p.add_argument("bild")
    p.add_argument("--hoehe", type=float, required=True, help="Koerpergroesse in Metern, hilft beim Rigging")
    p.add_argument("--polys", type=int, default=15000)
    p.add_argument("--pose", default="t-pose", choices=["t-pose", "a-pose"], help="T-Haltung passt zum Meshy-Skelett")
    p.add_argument("--prompt")
    p.add_argument("--ansichten", help="weitere Ansichten derselben Figur, durch Komma getrennt (hoechstens 3; Seite, Ruecken)")
    p.add_argument("--ohne-pbr", action="store_true", help="ohne Normalenkarte (Standard: mit, gleicher Preis laut Meshy-Preisliste)")
    p.add_argument("--budget", type=int)
    p.add_argument("--trocken", action="store_true")
    p = sub.add_parser("teil")
    p.add_argument("name")
    p.add_argument("bild")
    p.add_argument("--polys", type=int, default=5000)
    p.add_argument("--prompt")
    p.add_argument("--ansichten", help="weitere Ansichten desselben Modells, durch Komma getrennt (hoechstens 3)")
    p.add_argument("--ohne-pbr", action="store_true", help="ohne Normalenkarte (Standard: mit, gleicher Preis laut Meshy-Preisliste)")
    p.add_argument("--budget", type=int)
    p.add_argument("--trocken", action="store_true")
    p = sub.add_parser("bewegungen")
    p.add_argument("name")
    p.add_argument("--clips", default="standard")
    p.add_argument("--budget", type=int)
    p.add_argument("--trocken", action="store_true")
    p = sub.add_parser("kosten")
    p.add_argument("--clips", default="standard")
    sub.add_parser("credits")
    sub.add_parser("guthaben")
    a = ap.parse_args()
    if a.cmd == "figur":
        cmd_figur(a)
    elif a.cmd == "teil":
        cmd_teil(a)
    elif a.cmd == "bewegungen":
        cmd_bewegungen(a)
    elif a.cmd == "kosten":
        cmd_kosten(a)
    elif a.cmd == "credits":
        cmd_credits(a)
    elif a.cmd == "guthaben":
        print(json.dumps(call("GET", "balance"), ensure_ascii=False))


if __name__ == "__main__":
    main()
