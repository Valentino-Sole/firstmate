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
