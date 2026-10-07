"""Werkstatt: Meshy-Figuren und Ruestungsteile in einem Schritt bestellen, umrechnen und als Spielvorschau bauen.

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
  python werkstatt.py paket
      Figurenpaket bauen und eine Spielvorschau (vorschau/schwebfels.html) mit allen Figuren und Teilen erzeugen
  python werkstatt.py bilder nordmann_f --konzept tafel02.png [--klasse sturmhuene] [--waffe axt]
      Spielbilder der Figur (Ruhe, Gehen, Angriff) neben dem Konzeptbild: meshy/<figur>/vergleich.png
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

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, "..", ".."))
ROOT = os.path.join(HERE, "meshy")
BUILD = os.path.join(ROOT, "build")
PY = sys.executable
sys.path.insert(0, HERE)
import packbones  # noqa: E402


def run(*args, **kw):
    print("$", " ".join(str(a) for a in args), flush=True)
    subprocess.run([str(a) for a in args], check=True, **kw)


def api(*args):
    run(PY, os.path.join(HERE, "meshy_api.py"), "--out", ROOT, *args)


def shared_clips():
    p = os.path.join(ROOT, "bewegungen.json")
    return json.load(open(p)).get("figur") if os.path.exists(p) else None


def cmd_figur(a):
    height = packbones.top(os.path.join(GAME, "assets", "schwebfels.pack"), a.race + "." + a.gender)
    extra = ["--trocken"] if a.trocken else []
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
    api("teil", a.name, a.bild, "--polys", "9000", *(["--budget", a.budget] if a.budget else []), *extra)
    if a.trocken:
        return
    os.makedirs(os.path.join(BUILD, "bestien"), exist_ok=True)
    run(PY, os.path.join(HERE, "..", "beasts", "from_glb.py"), os.path.join(BUILD, "bestien", a.name + ".npz"), os.path.join(ROOT, a.name, "model.glb"),
        "--family", a.name, "--archs", a.archs, "--height", a.hoehe, "--turn", a.turn)


def cmd_paket(a):
    pack = os.path.join(BUILD, "gen.pack")
    run(PY, os.path.join(HERE, "gen_pack.py"), BUILD, pack)
    out = os.path.join(ROOT, "vorschau")
    run("node", os.path.join(GAME, "build.mjs"), env=dict(os.environ, GEN_PACK=pack, DIST=out))
    print("Vorschau:", os.path.join(out, "schwebfels.html"))
    print("Ins Spiel uebernehmen (nach Freigabe): cp", pack, os.path.join(GAME, "assets", "gen.pack"), "&& node build.mjs")


def cmd_bilder(a):
    from PIL import Image, ImageDraw
    page = os.path.join(ROOT, "vorschau", "schwebfels.html")
    if not os.path.exists(page):
        cmd_paket(a)
    out = os.path.join(ROOT, a.name)
    os.makedirs(out, exist_ok=True)
    desc = {"gen": a.name, "cls": a.klasse, "gear": {"waffe": {"base": a.waffe, "rarity": "selten", "style": 1}}}
    shots = []
    # die Vorschau startet die Bewegung nach 0,3 s mit 2,5 s Dauer; der Schlag trifft also bei 2,8 s
    for pose, at, label in (("", "1.6", "Ruhe"), ("walk", "1.4", "Gehen"), ("attack", "2.75", "Angriff")):
        f = os.path.join(out, "spiel_%s.png" % (pose or "ruhe"))
        run("node", os.path.join(GAME, "tests", "preview.mjs"), f, json.dumps(desc), "held", "420", "560", pose, at, env=dict(os.environ, PAGE=page))
        shots.append((f, label))
    ims = []
    if a.konzept:
        k = Image.open(a.konzept).convert("RGB")
        ims.append((k.resize((int(k.width * 560 / k.height), 560)), "Konzept"))
    ims += [(Image.open(f).convert("RGB"), label) for f, label in shots]
    W = sum(im.width for im, _ in ims) + 10 * (len(ims) - 1)
    canvas = Image.new("RGB", (W, 590), (27, 24, 32))
    d = ImageDraw.Draw(canvas)
    x = 0
    for im, label in ims:
        canvas.paste(im, (x, 0))
        d.text((x + 8, 566), label, fill=(230, 220, 200))
        x += im.width + 10
    path = os.path.join(out, "vergleich.png")
    canvas.save(path)
    print("Vergleichsbild:", path)


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
    sub.add_parser("paket")
    p = sub.add_parser("bilder")
    p.add_argument("name")
    p.add_argument("--konzept")
    p.add_argument("--klasse", default="sturmhuene")
    p.add_argument("--waffe", default="schwert")
    sub.add_parser("kosten")
    a = ap.parse_args()
    if a.cmd == "figur":
        cmd_figur(a)
    elif a.cmd == "teil":
        cmd_teil(a)
    elif a.cmd == "bestie":
        cmd_bestie(a)
    elif a.cmd == "paket":
        cmd_paket(a)
    elif a.cmd == "bilder":
        cmd_bilder(a)
    else:
        api("kosten")


if __name__ == "__main__":
    main()
