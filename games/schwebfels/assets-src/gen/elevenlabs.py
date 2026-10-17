"""ElevenLabs-Schnittstelle fuer Musik und Geraeusche: Auftraege senden, Ergebnis sofort sichern, verbrauchte
Credits je Auftrag protokollieren (Stand des Kontos vorher und nachher).

Der Schluessel kommt nur aus der Umgebungsvariable ELEVENLABS_API_KEY und wird nie ausgegeben. Gueltige Schluessel
beginnen mit "sk_"; die Kennung des Schluessels (ohne sk_) lehnt ElevenLabs ab.
Die Credits kommen aus dem Abo des Kontos, dem der Schluessel gehoert (ein gemeinsamer Topf fuer Webseite und API).

Aufruf (Ausgabeordner <aus>, Protokoll <aus>/credits.jsonl):
  python elevenlabs.py konto
  python elevenlabs.py musik     <aus> <name> "<beschreibung>" --sek 90 [--modell music_v1] [--mit-gesang]
  python elevenlabs.py geraeusch <aus> <name> "<beschreibung>" [--sek 20] [--schleife] [--einfluss 0.3]
  python elevenlabs.py report    <aus>
  --max-credits N: bricht vor dem Auftrag ab, wenn im laufenden Abrechnungszeitraum schon mehr als N verbraucht sind
  --dry-run: zeigt nur den Auftrag, sendet nichts
  --schnell: nicht auf den nachgefuehrten Kontostand warten (Credits je Auftrag dann 0 im Protokoll)

Grenzen laut API-Referenz (Oktober 2026): Musik 3 bis 600 Sekunden, ohne Schleifenoption (nahtlos machen wir beim
Bau der Klangbank); Geraeusche 0,5 bis 30 Sekunden, mit Schleifenoption.
Musik ist standardmaessig ohne Gesang (force_instrumental). Keine Kuenstler- oder Liednamen in Beschreibungen,
das verbieten die Music Terms.
"""
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

API = "https://api.elevenlabs.io/v1"


def ctx():
    caf = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    return ssl.create_default_context(cafile=caf) if caf and os.path.exists(caf) else ssl.create_default_context()


def key():
    k = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not k:
        raise SystemExit("ELEVENLABS_API_KEY fehlt in der Umgebung (Umgebungseinstellungen, danach neue Sitzung).")
    if not k.startswith("sk_"):
        raise SystemExit("ELEVENLABS_API_KEY ist keine gueltige Schluesselform (beginnt nicht mit sk_); vermutlich ist die Kennung eingetragen.")
    return k


def call(method, path, body=None, raw=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method)
    req.add_header("xi-api-key", key())
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, context=ctx(), timeout=600) as r:
            out = r.read()
            return (out, dict(r.headers)) if raw else json.loads(out.decode())
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")[:500]
        raise SystemExit("ElevenLabs antwortet %d auf %s %s: %s" % (e.code, method, path, msg))


def konto():
    s = call("GET", "/user/subscription")
    return {
        "abo": s.get("tier"),
        "status": s.get("status"),
        "verbraucht": s.get("character_count"),
        "grenze": s.get("character_limit"),
        "neu_ab": time.strftime("%Y-%m-%d %H:%M", time.gmtime(s["next_character_count_reset_unix"])) + " UTC" if s.get("next_character_count_reset_unix") else None,
        "ueberziehung_moeglich": s.get("max_credit_limit_extension"),
    }


def opt(args, name, default=None, flag=False):
    if name not in args:
        return default
    i = args.index(name)
    if flag:
        args.pop(i)
        return True
    v = args[i + 1]
    del args[i:i + 2]
    return v


def log(aus, rec):
    os.makedirs(aus, exist_ok=True)
    with open(os.path.join(aus, "credits.jsonl"), "a") as f:
        f.write(json.dumps(rec, ensure_ascii=False) + "\n")


def auftrag(art, aus, name, path, body, fmt, maxc, dry, schnell=False):
    print(art, name, json.dumps(body, ensure_ascii=False))
    if dry:
        return
    vor = konto()
    if maxc is not None and (vor["verbraucht"] or 0) > maxc:
        raise SystemExit("Abbruch: schon %s Credits verbraucht, Grenze %s." % (vor["verbraucht"], maxc))
    t0 = time.time()
    audio, hdr = call("POST", path + "?output_format=" + fmt, body, raw=True)
    os.makedirs(aus, exist_ok=True)
    datei = os.path.join(aus, name + ".mp3")
    open(datei, "wb").write(audio)
    # der Kontostand folgt erst nach bis zu einer Minute; mit --schnell wird nicht gewartet (Kosten dann ueber den
    # Kontostand vor und nach einer ganzen Reihe von Auftraegen bestimmen)
    nach = vor
    for _ in range(0 if schnell else 12):
        time.sleep(5)
        nach = konto()
        if nach["verbraucht"] != vor["verbraucht"]:
            break
    kosten = (nach["verbraucht"] or 0) - (vor["verbraucht"] or 0)
    log(aus, {"zeit": time.strftime("%Y-%m-%d %H:%M:%S"), "art": art, "name": name, "body": body, "datei": datei,
              "bytes": len(audio), "sekunden_warten": round(time.time() - t0, 1), "credits": kosten,
              "song_id": hdr.get("song-id") or hdr.get("Song-Id")})
    print("gesichert", datei, len(audio) // 1024, "KB, Credits", kosten, "(verbraucht", nach["verbraucht"], "von", nach["grenze"], ")")


def main():
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    dry = opt(args, "--dry-run", False, True)
    schnell = opt(args, "--schnell", False, True)
    maxc = opt(args, "--max-credits")
    maxc = int(maxc) if maxc is not None else None
    cmd = args.pop(0)
    if cmd == "konto":
        print(json.dumps(konto(), ensure_ascii=False, indent=1))
    elif cmd == "musik":
        sek = float(opt(args, "--sek", "90"))
        modell = opt(args, "--modell", "music_v1")
        gesang = opt(args, "--mit-gesang", False, True)
        aus, name, text = args
        body = {"prompt": text, "music_length_ms": int(sek * 1000), "model_id": modell, "force_instrumental": not gesang}
        auftrag("musik", aus, name, "/music", body, "mp3_44100_128", maxc, dry, schnell)
    elif cmd == "geraeusch":
        sek = opt(args, "--sek")
        schleife = opt(args, "--schleife", False, True)
        einfluss = float(opt(args, "--einfluss", "0.3"))
        aus, name, text = args
        body = {"text": text, "prompt_influence": einfluss, "loop": schleife, "model_id": "eleven_text_to_sound_v2"}
        if sek:
            body["duration_seconds"] = float(sek)
        auftrag("geraeusch", aus, name, "/sound-generation", body, "mp3_44100_128", maxc, dry, schnell)
    elif cmd == "report":
        (aus,) = args
        p = os.path.join(aus, "credits.jsonl")
        rows = [json.loads(x) for x in open(p)] if os.path.exists(p) else []
        for r in rows:
            print(r["zeit"], r["art"], r["name"], r["credits"])
        print("Summe", sum(r["credits"] or 0 for r in rows), "Credits in", len(rows), "Auftraegen")
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main()
