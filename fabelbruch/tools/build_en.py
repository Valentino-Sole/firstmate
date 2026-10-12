#!/usr/bin/env python3
"""Erzeugt data/spieltexte.en.json aus der deutschen Quelldatei und der
Uebersetzungstabelle data/uebersetzung.en.strings.json.

Szenenstruktur, IDs, Sprecher, Kontexte und max_lines bleiben identisch;
nur der Text wird ersetzt. Bricht ab, wenn eine Uebersetzung fehlt oder
Platzhalter nicht uebereinstimmen.
"""
import json
import os
import re
import sys

base = os.path.join(os.path.dirname(__file__), "..", "data")
de = json.load(open(os.path.join(base, "spieltexte.de.json")))
tr = json.load(open(os.path.join(base, "uebersetzung.en.strings.json")))

missing = []
token_errors = []
out_strings = []
for s in de["strings"]:
    sid = s["id"]
    if sid not in tr:
        missing.append(sid)
        continue
    en = tr[sid]
    de_tokens = sorted(re.findall(r"\{(\w+)\}", s["text"]))
    en_tokens = sorted(re.findall(r"\{(\w+)\}", en))
    if de_tokens != en_tokens:
        token_errors.append(f"{sid}: de={de_tokens} en={en_tokens}")
    out_strings.append({**s, "text": en})

if missing:
    sys.exit(f"FEHLER: {len(missing)} Uebersetzungen fehlen: {missing[:10]}")
if token_errors:
    sys.exit("FEHLER: Platzhalter weichen ab:\n" + "\n".join(token_errors))

out = {
    "version": de["version"],
    "locale": "en-US",
    "encoding": "UTF-8",
    "source": "Uebersetzung von spieltexte.de.json; de-DE bleibt fuehrend.",
    "rules": de["rules"],
    "scenes": de["scenes"],
    "strings": out_strings,
}
with open(os.path.join(base, "spieltexte.en.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"spieltexte.en.json geschrieben: {len(out_strings)} Texte")
