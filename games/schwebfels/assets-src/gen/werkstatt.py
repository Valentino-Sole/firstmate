"""Werkstatt: Meshy-Figuren, Ruestungsteile, Waffen und Bestien in einem Schritt bestellen, umrechnen und als Spielvorschau bauen.

Alles landet unter assets-src/gen/meshy/ (nicht im Repository): Downloads je Figur, npz-Dateien in build/, das
Figurenpaket build/gen.pack und eine Vorschau des Spiels in vorschau/. Der Schluessel kommt aus MESHY_API_KEY.

  python werkstatt.py figur nordmann_f tafel02.png --race nordmann --gender f --budget 100
      Bild zu 3D und Rigging; bei der ersten Figur auch die gemeinsamen Bewegungen (20 Stueck); danach umrechnen
  python werkstatt.py teil harnisch_eisen tafel10.png --slot brust --forms harnisch --ref nordmann_f --budget 30
      Bild zu 3D fuer ein Ruestungsteil, danach auf die Referenzfigur anpassen (--paar fuer einen einzelnen
      Handschuh oder Stiefel, --rot 0,0,90 zum Drehen)
  python werkstatt.py bestie wolf tafel19.png --archs wolf --hoehe 1.15 --budget 30
      Bild zu 3D fuer ein Tier, danach Vierbeiner-Skelett und Gewichte (beasts/from_glb.py); bewegt wird es im Spiel
      wie die anderen Bestien, die Monsterarten aus --archs zeigen dann dieses Tier
  python werkstatt.py waffe axt_bart tafel14_axt.png --base axt --budget 30
      Bild zu 3D fuer eine Waffe oder einen Schild (ein Gegenstand je Bild, Tafeln vorher zuschneiden), danach in die
      Lage der gebauten Waffen bringen (weapon.py); ersetzt im Spiel die gebaute Waffe dieser Grundart (--forms,
      --seltenheit grenzen ein; --umdrehen, falls Griff und Spitze vertauscht sind)
  python werkstatt.py requisit runenstein tafel_midgard_stein.png --realm midgard --rolle wahrzeichen --budget 30
      Bild zu 3D fuer ein Requisit der Kampfumgebung (Rolle baum, deko oder wahrzeichen); im Kampf ersetzen die
      Requisiten eines Reiches die gebauten Baeume und Dekorationen (prop.py)
  python werkstatt.py paket
      Figurenpaket bauen und eine Spielvorschau (vorschau/schwebfels.html) mit allen Figuren und Teilen erzeugen
  python werkstatt.py bilder nordmann_f [--konzept tafel02.png] [--klasse sturmhuene] [--waffe axt] [--figur nordmann_f]
      Spielbilder (Ruhe, Gehen, Angriff) neben dem Konzeptbild: meshy/<name>/vergleich.png; geht fuer Figuren,
      Ruestungsteile und Waffen (an einer Figur) und Bestien
  python werkstatt.py bericht
      Bericht fuer den Kapitaen: je Modell Konzeptbild, Meshy-Vorschau und Spielbilder, Dreiecke, Textur, Nacharbeit
      (Einstellungen und Notizen) und die tatsaechlich verbrauchten Credits: meshy/bericht.html (eine Datei)
  python werkstatt.py notiz nordmann_f "Schultern von Hand geglaettet"
      Nacharbeit festhalten, erscheint im Bericht
  python werkstatt.py kosten
      Kostenschaetzung ohne Schluessel

--trocken zeigt bei figur und teil nur, was bestellt wuerde. Ins Spiel uebernehmen erst nach Freigabe des Kapitaens:
build/gen.pack nach assets/gen.pack kopieren und node build.mjs ausfuehren.
"""
import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", ".."))
ROOT = os.environ.get("WERKSTATT_DIR") or os.path.join(HERE, "meshy")
BUILD = os.path.join(ROOT, "build")
PY = sys.executable
sys.path.insert(0, HERE)
import packbones  # noqa: E402


def run(*args, **kw):
    print("$", " ".join(str(a) for a in args), flush=True)
    subprocess.run([str(a) for a in args], check=True, **kw)


def api(*args):
    run(PY, os.path.join(HERE, "meshy_api.py"), "--out", ROOT, *args)


def record(name, art, bild, **params):
    """Art, Konzeptbild und Einstellungen eines Modells fuer den Bericht festhalten (meshy/<name>/werkstatt.json)."""
    d = os.path.join(ROOT, name)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "werkstatt.json")
    W = json.load(open(p)) if os.path.exists(p) else {"notizen": []}
    W.update({"art": art, "bild": os.path.basename(bild), "einstellungen": {k: v for k, v in params.items() if v not in (None, "", False)}})
    json.dump(W, open(p, "w"), indent=1, ensure_ascii=False)
    try:
        from PIL import Image
        im = Image.open(bild).convert("RGB")
        im.thumbnail((1024, 1024))
        im.save(os.path.join(d, "konzept.png"))
    except Exception as e:  # Bericht ohne Konzeptbild ist besser als ein Abbruch der Bestellung
        print("Konzeptbild nicht uebernommen:", e)


def shared_clips():
    p = os.path.join(ROOT, "bewegungen.json")
    return json.load(open(p)).get("figur") if os.path.exists(p) else None


def cmd_figur(a):
    height = packbones.top(os.path.join(GAME, "assets", "schwebfels.pack"), a.race + "." + a.gender)
    extra = ["--trocken"] if a.trocken else []
    if not a.trocken:
        record(a.name, "figur", a.bild, volk=a.race, geschlecht=a.gender, hoehe=round(height, 2))
    budget = a.budget
    api("figur", a.name, a.bild, "--hoehe", "%.2f" % height, *(["--budget", budget] if budget else []), *extra)
    owner = shared_clips()
    if owner is None or owner == a.name:
        rest = None if budget is None else budget - 35
        api("bewegungen", a.name, *(["--budget", rest] if rest is not None else []), *extra)
        if not a.trocken:
            json.dump({"figur": a.name}, open(os.path.join(ROOT, "bewegungen.json"), "w"))
            owner = a.name
    if a.trocken:
        return
    d = os.path.join(ROOT, a.name)
    os.makedirs(BUILD, exist_ok=True)
    anims = sorted(f for f in os.listdir(d) if f.startswith("bewegungen_") and f.endswith(".glb")) if owner == a.name else []
    if owner == a.name and os.path.exists(os.path.join(d, "gang.glb")):
        anims.append("gang.glb")  # kostenloser Gang aus dem Rigging (Ersatz, falls ein Bibliotheksgang fehlt)
    args = [PY, os.path.join(HERE, "meshy.py"), os.path.join(BUILD, a.name + ".npz"), os.path.join(d, "rigged.glb"), "--race", a.race, "--gender", a.gender]
    for f in anims:
        args += ["--anim", os.path.join(d, f)]
    if owner != a.name:
        args.append("--no-clips")
    run(*args)


def cmd_teil(a):
    extra = ["--trocken"] if a.trocken else []
    if not a.trocken:
        record(a.name, "teil", a.bild, platz=a.slot, formen=a.forms, referenz=a.ref, drehung=None if a.rot == "auto" else a.rot, spiegeln=a.flip, paar=a.paar)
    api("teil", a.name, a.bild, *(["--budget", a.budget] if a.budget else []), *extra)
    if a.trocken:
        return
    ref = os.path.join(BUILD, a.ref + ".npz")
    if not os.path.exists(ref):
        raise SystemExit("Referenzfigur fehlt: zuerst 'werkstatt.py figur %s ...'" % a.ref)
    os.makedirs(os.path.join(BUILD, "teile"), exist_ok=True)
    args = [PY, os.path.join(HERE, "fit_piece.py"), os.path.join(BUILD, "teile", a.name + ".npz"), ref, os.path.join(ROOT, a.name, "model.glb"),
            "--slot", a.slot, "--name", a.name, "--forms", a.forms, "--rot", a.rot]
    if a.paar:
        args.append("--paar")
    if a.flip:
        args.append("--flip")
    run(*args)


def cmd_bestie(a):
    extra = ["--trocken"] if a.trocken else []
    if not a.trocken:
        record(a.name, "bestie", a.bild, monsterarten=a.archs, hoehe=a.hoehe, drehung=None if a.turn == "0" else a.turn)
    api("teil", a.name, a.bild, "--polys", "9000", *(["--budget", a.budget] if a.budget else []), *extra)
    if a.trocken:
        return
    os.makedirs(os.path.join(BUILD, "bestien"), exist_ok=True)
    run(PY, os.path.join(HERE, "..", "beasts", "from_glb.py"), os.path.join(BUILD, "bestien", a.name + ".npz"), os.path.join(ROOT, a.name, "model.glb"),
        "--family", a.name, "--archs", a.archs, "--height", a.hoehe, "--turn", a.turn)


def cmd_waffe(a):
    extra = ["--trocken"] if a.trocken else []
    if not a.trocken:
        record(a.name, "waffe", a.bild, grundart=a.base, formen=a.forms, seltenheit=a.seltenheit, umdrehen=a.umdrehen, griff=a.griff, laenge=a.laenge)
    api("teil", a.name, a.bild, "--polys", "4000", *(["--budget", a.budget] if a.budget else []), *extra)
    if a.trocken:
        return
    os.makedirs(os.path.join(BUILD, "waffen"), exist_ok=True)
    args = [PY, os.path.join(HERE, "weapon.py"), os.path.join(BUILD, "waffen", a.name + ".npz"), os.path.join(ROOT, a.name, "model.glb"),
            "--base", a.base, "--name", a.name, "--forms", a.forms, "--seltenheit", a.seltenheit]
    if a.umdrehen:
        args.append("--umdrehen")
    if a.griff is not None:
        args += ["--griff", a.griff]
    if a.laenge is not None:
        args += ["--laenge", a.laenge]
    run(*args)


def cmd_requisit(a):
    extra = ["--trocken"] if a.trocken else []
    if not a.trocken:
        record(a.name, "requisit", a.bild, reich=a.realm, rolle=a.rolle, hoehe=a.hoehe, drehung=a.turn or None)
    api("teil", a.name, a.bild, "--polys", "5000", *(["--budget", a.budget] if a.budget else []), *extra)
    if a.trocken:
        return
    os.makedirs(os.path.join(BUILD, "requisiten"), exist_ok=True)
    args = [PY, os.path.join(HERE, "prop.py"), os.path.join(BUILD, "requisiten", a.name + ".npz"), os.path.join(ROOT, a.name, "model.glb"),
            "--realm", a.realm, "--rolle", a.rolle, "--name", a.name, "--turn", a.turn or 0]
    if a.hoehe is not None:
        args += ["--hoehe", a.hoehe]
    run(*args)


def cmd_paket(a):
    pack = os.path.join(BUILD, "gen.pack")
    run(PY, os.path.join(HERE, "gen_pack.py"), BUILD, pack)
    out = os.path.join(ROOT, "vorschau")
    run("node", os.path.join(GAME, "build.mjs"), env=dict(os.environ, GEN_PACK=pack, DIST=out))
    print("Vorschau:", os.path.join(out, "schwebfels.html"))
    print("Ins Spiel uebernehmen (nach Freigabe): cp", pack, os.path.join(GAME, "assets", "gen.pack"), "&& node build.mjs")


def cmd_bilder(a):
    """Spielbilder (Ruhe, Gehen, Angriff) neben dem Konzeptbild, fuer Figuren, Ruestungsteile, Waffen und Bestien."""
    from PIL import Image, ImageDraw
    page = os.path.join(ROOT, "vorschau", "schwebfels.html")
    if not os.path.exists(page):
        cmd_paket(a)
    out = os.path.join(ROOT, a.name)
    os.makedirs(out, exist_ok=True)
    wp = os.path.join(out, "werkstatt.json")
    W = json.load(open(wp)) if os.path.exists(wp) else {}
    art = W.get("art", "figur")
    E = W.get("einstellungen", {})
    figs = sorted(f[:-4] for f in os.listdir(BUILD) if f.endswith(".npz")) if os.path.isdir(BUILD) else []
    fig = a.figur or (figs[0] if figs else None)
    weapon = {"base": a.waffe, "rarity": "selten", "style": 1}
    mode = "held"
    if art == "figur":
        desc = {"gen": a.name, "cls": a.klasse, "gear": {"waffe": weapon}}
    elif art == "teil":
        desc = {"gen": E.get("referenz") or fig, "cls": a.klasse, "genGear": [a.name], "gear": {"waffe": weapon}}
    elif art == "waffe":
        own = {"base": E.get("grundart", a.waffe), "rarity": "selten", "style": 1, "gen": a.name}
        gear = {"waffe": weapon, "nebenhand": own} if own["base"] == "schild" else {"waffe": own}
        desc = {"gen": fig, "cls": a.klasse, "gear": gear}
    elif art == "requisit":
        mode = "kampf"
        desc = {"hero": {"gen": fig, "race": "nordmann", "gender": "m", "cls": a.klasse, "realm": E.get("reich", "midgard"), "gear": {"waffe": weapon}}, "events": 0}
    else:
        mode = "bestie"
        desc = {"foe": {"arch": (E.get("monsterarten") or "wolf").split(",")[0], "color": "#7a7470", "accent": "#ffcf5a"}}
    if art not in ("bestie", "requisit") and not desc.get("gen"):
        raise SystemExit("Keine Figur fuer die Bilder: zuerst eine Figur umrechnen oder --figur angeben")
    shots = []
    if mode == "kampf":
        # Requisiten: die Kampfbuehne ihres Reiches
        f = os.path.join(out, "spiel_kampf.png")
        run("node", os.path.join(GAME, "tests", "preview.mjs"), f, json.dumps(desc), mode, "840", "560", env=dict(os.environ, PAGE=page))
        shots.append((f, "Kampfumgebung"))
    # die Vorschau startet die Bewegung nach 0,3 s mit 2,5 s Dauer; der Schlag trifft also bei 2,8 s
    for pose, at, label in (("", "1.6", "Ruhe"), ("walk", "1.4", "Gehen"), ("attack", "2.75", "Angriff")) if mode != "kampf" else ():
        f = os.path.join(out, "spiel_%s.png" % (pose or "ruhe"))
        run("node", os.path.join(GAME, "tests", "preview.mjs"), f, json.dumps(desc), mode, "420", "560", pose, at, env=dict(os.environ, PAGE=page))
        shots.append((f, label))
    ims = []
    konzept = a.konzept or os.path.join(out, "konzept.png")
    if os.path.exists(konzept):
        k = Image.open(konzept).convert("RGB")
        ims.append((k.resize((int(k.width * 560 / k.height), 560)), "Konzept"))
    ims += [(Image.open(f).convert("RGB"), label) for f, label in shots]
    W_ = sum(im.width for im, _ in ims) + 10 * (len(ims) - 1)
    canvas = Image.new("RGB", (W_, 590), (27, 24, 32))
    d = ImageDraw.Draw(canvas)
    x = 0
    for im, label in ims:
        canvas.paste(im, (x, 0))
        d.text((x + 8, 566), label, fill=(230, 220, 200))
        x += im.width + 10
    path = os.path.join(out, "vergleich.png")
    canvas.save(path)
    print("Vergleichsbild:", path)


def cmd_notiz(a):
    p = os.path.join(ROOT, a.name, "werkstatt.json")
    if not os.path.exists(p):
        raise SystemExit("Kein Modell %s in %s" % (a.name, ROOT))
    W = json.load(open(p))
    W.setdefault("notizen", []).append({"zeit": time.strftime("%Y-%m-%d %H:%M"), "text": a.text})
    json.dump(W, open(p, "w"), indent=1, ensure_ascii=False)
    print("Notiz gespeichert:", a.name)


NPZ = {"figur": "%s.npz", "teil": "teile/%s.npz", "bestie": "bestien/%s.npz", "waffe": "waffen/%s.npz", "requisit": "requisiten/%s.npz"}
ART = {"figur": "Figur", "teil": "Rüstungsteil", "bestie": "Bestie", "waffe": "Waffe", "requisit": "Requisit"}
# Beschriftungen im Bericht (der Bericht ist fuer den Kapitaen, deshalb mit Umlauten)
LABEL = {"dreiecke": "Dreiecke", "textur": "Textur", "ecken": "Ecken", "knochen": "Knochen", "bewegungen": "Bewegungen", "hoehe": "Höhe",
         "reduziert": "Reduziert", "t_haltung": "T-Haltung", "platz": "Platz", "passt_zu": "Passt zu", "referenz": "Angepasst an",
         "monsterarten": "Monsterarten", "grundart": "Grundart", "laenge": "Länge", "griff": "Griffpunkt", "volk": "Volk",
         "geschlecht": "Geschlecht", "formen": "Formen", "drehung": "Drehung", "spiegeln": "Gespiegelt", "paar": "Als Paar gespiegelt",
         "seltenheit": "Seltenheit", "umdrehen": "Griff und Spitze getauscht", "reich": "Reich", "rolle": "Rolle"}
lab = lambda k: LABEL.get(k, k.replace("_", " ").capitalize())  # noqa: E731


def model_facts(art, name):
    """Kennzahlen aus der umgerechneten Datei: Dreiecke, Ecken, Textur, Bewegungen, Warnungen."""
    import numpy as np
    p = os.path.join(BUILD, NPZ[art] % name)
    if not os.path.exists(p):
        return None
    z = np.load(p)
    meta = json.loads(str(z["meta"])) if "meta" in z.files else {}
    f = {"dreiecke": int(len(z["idx"])), "textur": "%d px" % z["tex"].shape[1] if "tex" in z.files else "-", "groesse": os.path.getsize(p)}
    pos = z["pos"] if "pos" in z.files else None
    if pos is not None:
        f["ecken"] = int(len(pos))
    if art == "figur":
        log = meta.get("log", {})
        f["knochen"] = len(meta.get("names", []))
        f["bewegungen"] = len(meta.get("clips", []))
        f["hoehe"] = "%.2f m" % meta.get("top", 0)
        f["warnungen"] = log.get("warnungen", [])
        if log.get("reduziert"):
            f["reduziert"] = "%d auf %d Dreiecke" % tuple(log["reduziert"])
        if log.get("t_haltung_grad"):
            f["t_haltung"] = "Arme um bis zu %d Grad in T-Haltung gebracht" % log["t_haltung_grad"]
    elif art == "teil":
        f["platz"] = meta.get("slot")
        f["passt_zu"] = ", ".join(meta.get("forms", [])) or "jedem Gegenstand des Platzes"
        f["referenz"] = meta.get("ref")
    elif art == "bestie":
        f["knochen"] = len(meta.get("bones", []))
        f["monsterarten"] = ", ".join(meta.get("archs", [])) or "-"
    elif art == "requisit":
        f["reich"] = meta.get("realm")
        f["rolle"] = meta.get("role")
        f["hoehe"] = "%.2f m" % (meta["max"][1] - meta["min"][1]) if "max" in meta else "-"
    elif art == "waffe":
        f["grundart"] = meta.get("base")
        f["laenge"] = "%.2f m" % (meta["max"][1] - meta["min"][1]) if "max" in meta else "-"
        f["griff"] = "%.0f %% vom Ende" % (meta.get("grip", 0) * 100)
    return f


def img_tag(path, width=420):
    import base64
    import io
    from PIL import Image
    im = Image.open(path).convert("RGB")
    if im.width > 900:
        im = im.resize((900, int(im.height * 900 / im.width)))
    b = io.BytesIO()
    im.save(b, "JPEG", quality=85)
    return '<img src="data:image/jpeg;base64,%s" style="max-width:%dpx;width:100%%">' % (base64.b64encode(b.getvalue()).decode(), width)


def cmd_bericht(a):
    import html
    esc = html.escape
    log = []
    cp = os.path.join(ROOT, "credits.jsonl")
    if os.path.exists(cp):
        log = [json.loads(x) for x in open(cp) if x.strip()]
    models = []
    for name in sorted(os.listdir(ROOT)) if os.path.isdir(ROOT) else []:
        d = os.path.join(ROOT, name)
        if not os.path.isdir(d) or name in ("build", "vorschau"):
            continue
        W = json.load(open(os.path.join(d, "werkstatt.json"))) if os.path.exists(os.path.join(d, "werkstatt.json")) else {}
        A = json.load(open(os.path.join(d, "auftraege.json"))) if os.path.exists(os.path.join(d, "auftraege.json")) else {}
        if not W and not A:
            continue  # leerer Ordner, etwa von einem Trockenlauf
        art = W.get("art") or ("figur" if "rigging" in A else "teil")
        cr = [r for r in log if r.get("figur") == name]
        models.append({"name": name, "art": art, "W": W, "dir": d, "facts": model_facts(art, name), "credits": cr,
                       "summe": sum(r.get("credits") or 0 for r in cr)})
    total = sum(r.get("credits") or 0 for r in log)
    rows = []
    for m in models:
        f = m["facts"] or {}
        rows.append("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%d</td></tr>" % (
            esc(m["name"]), ART.get(m["art"], m["art"]), f.get("dreiecke", "noch nicht umgerechnet"), f.get("textur", "-"), m["summe"]))
    parts = ["<h1>Werkstattbericht</h1><p class=muted>Erstellt %s. Alle Modelle aus den Konzeptbildern, ihre Umrechnung ins Spiel und die "
             "tatsächlich verbrauchten Meshy-Credits.</p>" % time.strftime("%d.%m.%Y %H:%M"),
             "<h2>Überblick</h2><table><tr><th>Modell</th><th>Art</th><th>Dreiecke</th><th>Textur</th><th>Credits</th></tr>%s"
             "<tr class=sum><td colspan=4>Summe aller Aufträge (mit den gemeinsamen Bewegungen)</td><td>%d</td></tr></table>" % ("".join(rows), total)]
    pack = os.path.join(BUILD, "gen.pack")
    page = os.path.join(ROOT, "vorschau", "schwebfels.html")
    if os.path.exists(pack) or os.path.exists(page):
        parts.append("<h2>Größe</h2><p>Figurenpaket %s, Spielseite mit allen Modellen %s (Grenze 16 MB).</p>" % (
            "%.1f MB" % (os.path.getsize(pack) / 1e6) if os.path.exists(pack) else "noch nicht gebaut",
            "%.1f MB" % (os.path.getsize(page) / 1e6) if os.path.exists(page) else "noch nicht gebaut"))
    for m in models:
        f = m["facts"]
        W = m["W"]
        parts.append("<h2>%s <small>%s</small></h2>" % (esc(m["name"]), ART.get(m["art"], m["art"])))
        pics = []
        has_cmp = os.path.exists(os.path.join(m["dir"], "vergleich.png"))  # zeigt das Konzeptbild schon links
        for fn, label in (("konzept.png", "Konzept"), ("vorschau.png", "Meshy-Vorschau"), ("vergleich.png", "Konzept und Spielbilder")):
            if fn == "konzept.png" and has_cmp:
                continue
            p = os.path.join(m["dir"], fn)
            if os.path.exists(p):
                pics.append("<figure>%s<figcaption>%s</figcaption></figure>" % (img_tag(p, 900 if fn == "vergleich.png" else 300), label))
        if pics:
            parts.append('<div class="pics">%s</div>' % "".join(pics))
        if f:
            skip = ("warnungen", "groesse")
            parts.append("<table>%s</table>" % "".join("<tr><td>%s</td><td>%s</td></tr>" % (esc(lab(k)), esc(str(v))) for k, v in f.items() if k not in skip))
            if f.get("warnungen"):
                parts.append("<p><b>Hinweise der Umrechnung:</b></p><ul>%s</ul>" % "".join("<li>%s</li>" % esc(w) for w in f["warnungen"]))
        else:
            parts.append("<p class=muted>Noch nicht ins Spielformat umgerechnet.</p>")
        nach = ["%s: %s" % (esc(lab(k)), esc("ja" if v is True else str(v))) for k, v in W.get("einstellungen", {}).items()]
        nach += ["%s %s" % (esc(n["zeit"]), esc(n["text"])) for n in W.get("notizen", [])]
        if nach:
            parts.append("<p><b>Nacharbeit und Einstellungen:</b></p><ul>%s</ul>" % "".join("<li>%s</li>" % x for x in nach))
        if m["credits"]:
            parts.append("<p><b>Credits:</b> %s</p>" % ", ".join("%s %s (%s)" % (esc(r.get("art", "")), r.get("credits") or 0, esc(r.get("status", ""))) for r in m["credits"]))
    if log:
        parts.append("<h2>Alle Aufträge</h2><table><tr><th>Zeit</th><th>Modell</th><th>Art</th><th>Status</th><th>Credits</th></tr>%s</table>" % "".join(
            "<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % (esc(r.get("zeit", "")), esc(str(r.get("figur"))), esc(r.get("art", "")), esc(r.get("status", "")), r.get("credits") or 0) for r in log))
    css = ("body{font:15px/1.5 system-ui,sans-serif;max-width:1000px;margin:0 auto;padding:16px;background:#1b1820;color:#e8e0d0}"
           "h1,h2{color:#f0c96a}small{color:#a99;font-weight:normal}table{border-collapse:collapse;margin:8px 0}td,th{border-bottom:1px solid #3a3440;"
           "padding:4px 10px;text-align:left}.sum td{font-weight:bold}.muted{color:#a99}.pics{display:flex;flex-wrap:wrap;gap:10px}"
           "figure{margin:0}figcaption{color:#a99;font-size:13px}img{border-radius:6px}")
    out = os.path.join(ROOT, "bericht.html")
    os.makedirs(ROOT, exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        fh.write('<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
                 "<title>Werkstattbericht</title><style>%s</style><body>%s</body></html>" % (css, "\n".join(parts)))
    print("Bericht:", out, "(%d Modelle, %d Credits)" % (len(models), total))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("figur")
    p.add_argument("name")
    p.add_argument("bild")
    p.add_argument("--race", required=True)
    p.add_argument("--gender", required=True, choices=["f", "m"])
    p.add_argument("--budget", type=int)
    p.add_argument("--trocken", action="store_true")
    p = sub.add_parser("teil")
    p.add_argument("name")
    p.add_argument("bild")
    p.add_argument("--slot", required=True, choices=["brust", "handschuhe", "stiefel", "helm", "hose"])
    p.add_argument("--forms", default="")
    p.add_argument("--ref", required=True)
    p.add_argument("--rot", default="auto")
    p.add_argument("--flip", action="store_true")
    p.add_argument("--paar", action="store_true")
    p.add_argument("--budget", type=int)
    p.add_argument("--trocken", action="store_true")
    p = sub.add_parser("bestie")
    p.add_argument("name")
    p.add_argument("bild")
    p.add_argument("--archs", required=True)
    p.add_argument("--hoehe", default="1.15")
    p.add_argument("--turn", default="0")
    p.add_argument("--budget", type=int)
    p.add_argument("--trocken", action="store_true")
    p = sub.add_parser("waffe")
    p.add_argument("name")
    p.add_argument("bild")
    p.add_argument("--base", required=True)
    p.add_argument("--forms", default="")
    p.add_argument("--seltenheit", default="")
    p.add_argument("--umdrehen", action="store_true")
    p.add_argument("--griff", type=float)
    p.add_argument("--laenge", type=float)
    p.add_argument("--budget", type=int)
    p.add_argument("--trocken", action="store_true")
    p = sub.add_parser("requisit")
    p.add_argument("name")
    p.add_argument("bild")
    p.add_argument("--realm", required=True, choices=["albion", "midgard", "hibernia"])
    p.add_argument("--rolle", required=True, choices=["baum", "deko", "wahrzeichen"])
    p.add_argument("--hoehe", type=float)
    p.add_argument("--turn", type=float, default=0.0)
    p.add_argument("--budget", type=int)
    p.add_argument("--trocken", action="store_true")
    sub.add_parser("paket")
    p = sub.add_parser("bilder")
    p.add_argument("name")
    p.add_argument("--konzept")
    p.add_argument("--klasse", default="sturmhuene")
    p.add_argument("--waffe", default="schwert")
    p.add_argument("--figur", help="Figur, die Ruestungsteile oder Waffen zeigt (Standard: erste umgerechnete Figur)")
    sub.add_parser("bericht")
    p = sub.add_parser("notiz")
    p.add_argument("name")
    p.add_argument("text")
    sub.add_parser("kosten")
    a = ap.parse_args()
    if a.cmd == "figur":
        cmd_figur(a)
    elif a.cmd == "teil":
        cmd_teil(a)
    elif a.cmd == "bestie":
        cmd_bestie(a)
    elif a.cmd == "waffe":
        cmd_waffe(a)
    elif a.cmd == "requisit":
        cmd_requisit(a)
    elif a.cmd == "paket":
        cmd_paket(a)
    elif a.cmd == "bilder":
        cmd_bilder(a)
    elif a.cmd == "bericht":
        cmd_bericht(a)
    elif a.cmd == "notiz":
        cmd_notiz(a)
    else:
        api("kosten")


if __name__ == "__main__":
    main()
