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

## Erzeugte Figuren (Meshy-Strecke)

Figuren aus den Konzeptbildern des Kapitäns entstehen bei Meshy (Bild zu 3D, Rigging, Bewegungen aus der
Meshy-Bibliothek), werden hier ins Spielformat gebracht und als eigenes Paket `assets/gen.pack` neben `schwebfels.pack`
eingebettet. Im Spiel spielen sie echte Bewegungen ab (`src/r3d-rigged.js`) statt der Formeln der alten Figuren.

| Datei | Inhalt |
|---|---|
| `gen/werkstatt.py` | Alles in einem Schritt: Figur oder Rüstungsteil bestellen, umrechnen, Paket und Spielvorschau bauen |
| `gen/meshy_api.py` | Bestellen bei Meshy: Bild zu 3D (Figur oder Teil), Rigging, Bewegungen; Budgetgrenze, Trockenlauf, Credit-Protokoll (`credits.jsonl`); Schlüssel nur aus `MESHY_API_KEY` |
| `gen/meshy.py` | Geriggte GLB samt Bewegungen ins Spielformat: Ausrichten, Zielhöhe, T-Haltung, Skelett ohne Ruhedrehungen, Gewichte, Reduzieren, Texturatlas, Zuordnung der Spielgelenke, Haltepunkte, Bewegungen mit Schlagmarken |
| `gen/gltf.py` | Kleiner glTF-Leser (Knoten, Skins, Netze, Materialien, Bilder, Animationen) |
| `gen/fit_piece.py` | Rüstungsteil (einzeln erzeugte GLB) an einen Referenzkörper anpassen und knochenbezogen speichern; im Spiel legt es sich über Querschnittsprofile an jeden Körper mit gleichem Skelett an, die Haut darunter wird ausgeblendet |
| `gen/gen_pack.py` | npz-Dateien zu `assets/gen.pack`; Bewegungen landen einmal im gemeinsamen Teil `clips` |
| `gen/probe.py` | Älterer Technikcheck: fremdes Modell auf das 29-Knochen-Spielskelett umrüsten (Bone Heat), Kleidungsteil anpassen |
| `gen/inspect_glb.py` | Inhalt einer GLB-Datei auflisten (Netze, Dreiecke, Bilder, Knochen) |
| `gen/packbones.py` | Knochenliste und Körperhöhen aus `assets/schwebfels.pack` lesen |

Am einfachsten über die Werkstatt (bestellen, umrechnen, Paket und Spielvorschau in einem Schritt, alles unter
`assets-src/gen/meshy/`, das nicht ins Repository gehört):

```sh
cd assets-src/gen
python werkstatt.py kosten
python werkstatt.py figur nordmann_f tafel02.png --race nordmann --gender f --budget 100   # erste Figur: mit Bewegungen
python werkstatt.py figur kreidezwerg_m tafel01.png --race kreidezwerg --gender m --budget 40
python werkstatt.py teil harnisch_eisen brust.png --slot brust --forms harnisch --ref nordmann_f --budget 30
python werkstatt.py teil handschuh_leder handschuh.png --slot handschuhe --ref nordmann_f --paar --budget 30
python werkstatt.py paket                       # Vorschau: assets-src/gen/meshy/vorschau/schwebfels.html
```

Die einzelnen Schritte von Hand:

```sh
export MESHY_API_KEY=...                       # in den Umgebungseinstellungen, nie im Chat
cd assets-src/gen
python meshy_api.py kosten                     # Schätzung ohne Schlüssel
python meshy_api.py figur nordmann_f tafel02.png --hoehe 1.95 --budget 40
python meshy_api.py bewegungen nordmann_f --budget 60      # einmal, gilt für alle Figuren
python meshy.py <aus>/nordmann_f.npz meshy/nordmann_f/rigged.glb --race nordmann --gender f \
    --anim meshy/nordmann_f/bewegungen_1.glb --anim meshy/nordmann_f/bewegungen_2.glb
python meshy_api.py figur kreidezwerg_m tafel01.png --hoehe 1.45 --budget 40
python meshy.py <aus>/kreidezwerg_m.npz meshy/kreidezwerg_m/rigged.glb --race kreidezwerg --gender m --no-clips
python gen_pack.py <aus> ../../assets/gen.pack
cd ../.. && node build.mjs                     # oder GEN_PACK=<datei> node build.mjs zum Ausprobieren
```

Wichtige Regeln der Strecke:
- Alle Skelette werden auf Weltausrichtung und T-Haltung gebracht (Meshy-Figuren stehen schon so). Darum passt jede
  Bewegung auf jede Figur mit gleichen Knochennamen; der Hüftweg wird auf die Hüfthöhe der Figur umgerechnet.
  Bewegungen also nur einmal bei Meshy kaufen; weitere Figuren mit `--no-clips` einlesen.
- `--as-meshy` baut für fremde Testmodelle (etwa Mixamo-Figuren) das 24-Knochen-Skelett von Meshy nach.
- Figuren mit `--race` und `--gender` ersetzen im Spiel automatisch den Körper dieses Volkes (auch bei Inselbewohnern);
  `gen_pack.py --no-auto` schaltet das ab, dann nur über `R.buildHero({ gen: "<figur>", ... })`.
- Größe: Ziel 8.000 bis 12.000 Dreiecke je Held (`--tris`), Textur 1024 px (`--tex`), Bewegungen mit 30 Bildern pro
  Sekunde und ohne unbewegte Knochen. `build.mjs` bettet beide Pakete mit gzip ein.
- Meshy-Skelett: 24 Knochen ohne Finger (Hips, Spine02, Spine01, Spine, neck, Head, Schultern, Arme, Hände, Beine,
  Füße, Zehen). Waffen hängen an der Hand; ein Greifen der Finger gibt es nicht.
- Rüstungsteile: `python fit_piece.py <aus>/teile/harnisch_eisen.npz <aus>/nordmann_f.npz harnisch.glb --slot brust
  --forms harnisch.0,harnisch` (Plätze `brust`, `handschuhe`, `stiefel`, `helm`, `hose`; ein einzelner Handschuh oder
  Stiefel wird mit `--paar` gespiegelt; `--rot 0,0,90` dreht das Teil vorher). `gen_pack.py` nimmt alles aus dem
  Unterordner `teile` auf. Im Spiel trägt eine Figur das Teil, dessen Form oder Grundart zum angelegten Gegenstand passt
  (`forms`); ein Teil ohne Formliste passt zu jedem Gegenstand des Platzes. Ein Helm als Teil ersetzt den gebauten Helm.
- Rigging per API nur für Zweibeiner. Bestien laufen weiter über `beasts/` und `src/r3d-beasts.js`.
- `gen.pack` gehört erst ins Repository, wenn der Qualitätstest den Kapitän überzeugt hat.

Prüfen ohne Credits: Testmodelle aus dem three.js-Repository (`examples/models/gltf/Soldier.glb`, `Xbot.glb`,
`RobotExpressive/RobotExpressive.glb`) mit `--as-meshy` einlesen; sie dienen nur dem Test und gehören nicht ins Spiel.
