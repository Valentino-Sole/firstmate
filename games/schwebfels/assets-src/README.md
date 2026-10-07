# Modellpaket (Version 5)

Aus diesen Skripten entsteht `assets/schwebfels.pack`, das `build.mjs` als Base64 in das Spiel einbettet.
Das fertige Paket liegt im Repository, damit das Spiel ohne Blender gebaut werden kann.

## Werkzeuge

- Blender als Python-Modul (`pip install bpy==5.2.2`, Python 3.13), dazu `pillow` und `scipy`.
- MakeHuman-Grunddaten (Grundkörper, Skelett, Gewichte, Formvorlagen; Assets unter CC0 1.0):
  `sh fetch_makehuman.sh <ordner>` und danach `export MH_DATA=<ordner>/makehuman/data`.

## Ablauf

```sh
B=<zwischenordner>
python build_humans.py $B/humans.npz          # Spielkörper, Skelett, 24 Körperformen, Haltepunkte
python bake_body.py $B/humans.npz $B/tex      # Hautbild, Normalen, Gesichtsmasken (Brauen, Tätowierungen, Narben)
python hair.py $B/humans.npz $B/hair.npz      # Frisuren und Bärte
python textures.py $B/mat                     # Materialkacheln und Zierborten der drei Reiche
python gear.py $B/humans.npz $B/gear.npz      # Kleidung (gebundene Schalen, Röcke, Umhänge, Stiefel, Handschuhe)
python beasts/<familie>.py $B/beasts/<familie>.npz   # Bestien
python make_pack.py $B ../assets/schwebfels.pack
```

`GEAR_ONLY=stiefel,base.shoes python gear.py ...` baut nur die genannten Teile neu und behält die übrigen.

## Aufteilung

| Datei | Inhalt |
|---|---|
| `mhlib.py` | MakeHuman lesen, Makroformen mischen, Ohren strecken |
| `races.py` | Körperprofile der zwölf Völker (je Frau und Mann) |
| `build_humans.py` | Reduzierter Spielkörper, 30 Knochen, Formabweichungen, Gelenke, Augen, Haltepunkte |
| `bake_body.py`, `texlib.py` | Hauttexturen und Gesichtsmuster |
| `hair.py`, `headlib.py` | Haare und Bärte aus Strähnen und Zöpfen |
| `bindlib.py` | Bindung von Teilen an die Körperoberfläche |
| `humanbase.py`, `gearlib.py`, `gear.py` | Kleidungsbau |
| `textures.py` | Materialkacheln und Borten |
| `monlib.py`, `beasts/` | Bestien |
| `pack.py`, `make_pack.py` | Paketformat und Zusammenbau |

Feste Ausrüstung (Waffen, Schilde, Schmuck, Kopfschmuck) entsteht im Spiel selbst aus Bauregeln (`src/r3d-items.js`).

## Erzeugte Figuren (Bild-zu-3D-Strecke, im Aufbau)

Ziel: Figuren, Ausrüstung und Bestien aus den Konzeptbildern des Kapitäns mit einem Bild-zu-3D-Dienst erzeugen
(Meshy, Abrechnung in Credits, jeder Auftrag meldet die abgebuchten Credits als `consumed_credits`),
in Blender auf das Spielskelett bringen und als eigenes Paket `assets/gen.pack` neben `schwebfels.pack` einbetten.

| Datei | Inhalt |
|---|---|
| `gen/probe.py` | Technikcheck mit einem freien Modell: Import, Aufräumen, Reduzieren, Ausrichten, Gelenke, Gewichte (Bone Heat), Kleidungsteil anpassen, Haut darunter ausblenden, Export (npz und GLB mit Draco) |
| `gen/inspect_glb.py` | Inhalt einer GLB-Datei auflisten (Netze, Dreiecke, Bilder, Knochen) |
| `gen/packbones.py` | Knochenliste aus `assets/schwebfels.pack` lesen, kein Zwischenordner nötig |
| `gen/gen_pack.py` | npz-Dateien der Figuren zu `assets/gen.pack` zusammenfassen |
| `gen/meshy.py` | Meshy-Schnittstelle: Bild zu Bild, Bild zu 3D, Skelett; lädt Ergebnisse sofort herunter und protokolliert die Credits je Auftrag (`credits.jsonl`, `report`) |
| `gen/bake_lowpoly.py` | Spielfassung eines Originals: verschweißen, auf etwa 30.000 Flächen verkleinern, neue Texturaufteilung (Kopf mit mehr Bildfläche), Farbe und Oberflächendetails vom Original aufbacken |
| `gen/decimate_glb.py` | Verkleinern unter Schutz der Texturnähte (abgelöst durch `bake_lowpoly.py`, bleibt für Vergleiche) |
| `gen/build_figure.py` | Erzeugte Figur (GLB) ins Spielformat: Skelett der Vorlage auf die 29 Spielknochen (Namen wie Mixamo oder Meshy) oder Bone Heat, Höhe nach Körperprofil oder `--height`, Haltepunkte. Finger und Daumen werden entlang der Netzverbindungen vom Handgelenk aus getrennt (Fingerspitzen, Daumen nach rechter oder linker Hand), Gelenke an die echten Knöchel gelegt und die Handgewichte aufgeteilt; der Griffpunkt liegt in der Mitte der geschlossenen Faust. `FINGER_DEBUG=<ordner>` speichert die Handerkennung zum Prüfen |
| `gen/crop_templates.py` | Vorlagen aus den Konzepttafeln schneiden |
| `gen/PLAN-MIDGARD.md` | Ablaufplan des Qualitätstests mit allen Meshy-Aufträgen |

```sh
python gen/probe.py CesiumMan.glb ../assets/schwebfels.pack <aus>/probe.npz <aus>/probe.glb <aus>/probe.json 2.12
python gen/gen_pack.py <aus> ../assets/gen.pack
```

Im Spiel: `R.buildHero({ gen: "<figur>", genGear: ["<teil>", ...], ... })` baut den erzeugten Körper mit eigener Textur
und eigenen Gelenken, gleiche Bewegungen wie alle Helden; Teile in `genGear` blenden die Haut darunter aus.
Erzeugte Hände schließen sich beim Greifen zur Faust (Haltepunkt mit `curl`, `thumb`, `thumbA`, `wrist`): Finger um die
Knöchellinie, Daumen über die Finger, Handgelenk kippt die Waffe leicht nach oben. Die freie Hand bleibt locker.
Nahaufnahme zum Prüfen: `tests/preview.mjs` mit `"camBone": ["hand.R", x, y, z, sichtwinkel]` folgt einem Knochen.
`gen.pack` gehört erst ins Repository, wenn der Qualitätstest den Kapitän überzeugt hat.
