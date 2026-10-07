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
| `gen/weapon.py` | Waffe oder Schild (einzeln erzeugte GLB) in die Lage der gebauten Waffen bringen: Hauptachse, Griffende, Griffpunkt, Schneide; Länge wie die gebaute Waffe gleicher Grundart |
| `gen/prop.py` | Requisit der Kampfumgebung (Baum, Deko, Wahrzeichen) aus einer GLB: auf den Boden gestellt, mittig, Zielhöhe je Rolle |
| `gen/qualitaetstest.json` | Plan des Qualitätstests: Figuren, zwei Brustpanzer, Handschuhe, Stiefel, Helm, Waffe, Bestie, Requisiten, Budget |
| `gen/pruefserver.py` | Prüfserver, der wie die Meshy-API antwortet (Probelauf der Werkstatt ohne Credits) |
| `gen/gen_pack.py` | npz-Dateien zu `assets/gen.pack`; Bewegungen landen einmal im gemeinsamen Teil `clips` |
| `gen/probe.py` | Älterer Technikcheck: fremdes Modell auf das 29-Knochen-Spielskelett umrüsten (Bone Heat), Kleidungsteil anpassen |
| `beasts/from_glb.py` | Tier aus einer GLB (z. B. Meshy Bild zu 3D) mit Vierbeiner-Skelett und Rollen für das Bestiensystem des Spiels |
| `gen/inspect_glb.py` | Inhalt einer GLB-Datei auflisten (Netze, Dreiecke, Bilder, Knochen) |
| `gen/packbones.py` | Knochenliste und Körperhöhen aus `assets/schwebfels.pack` lesen |

Der ganze Qualitätstest läuft in einem Schritt über die Plandatei `gen/qualitaetstest.json` (Konzeptbilder nach
`gen/konzepte/`, je Bild ein Modell): `python werkstatt.py plan qualitaetstest.json --trocken` zeigt die Kosten ohne
Bestellung; ohne `--trocken` wird bestellt, umgerechnet, das Paket gebaut, Spielbilder und Bericht erzeugt. Liegt die
Schätzung über dem Budget der Plandatei, wird nichts bestellt; ein erneuter Aufruf setzt fort, ohne Fertiges erneut zu
bezahlen. Das Guthaben laut Meshy wird vor und nach dem Lauf festgehalten.

Probelauf ohne Credits und ohne Netz: `python pruefserver.py 18765 zuordnung.json` antwortet wie die Meshy-API mit
vorhandenen Testmodellen (Format im Kopf der Datei); dann `MESHY_API_BASE=http://127.0.0.1:18765/ MESHY_API_KEY=pruefung
WERKSTATT_DIR=<ordner> python werkstatt.py plan <plan.json>`.

Am einfachsten über die Werkstatt (bestellen, umrechnen, Paket und Spielvorschau in einem Schritt, alles unter
`assets-src/gen/meshy/`, das nicht ins Repository gehört):

```sh
cd assets-src/gen
python werkstatt.py kosten
python werkstatt.py figur nordmann_f tafel02.png --race nordmann --gender f --budget 100   # erste Figur: mit Bewegungen
python werkstatt.py figur kreidezwerg_m tafel01.png --race kreidezwerg --gender m --budget 40
python werkstatt.py teil harnisch_eisen brust.png --slot brust --forms harnisch --ref nordmann_f --budget 30
python werkstatt.py teil handschuh_leder handschuh.png --slot handschuhe --ref nordmann_f --paar --budget 30
python werkstatt.py bestie wolf tafel19.png --archs wolf --hoehe 1.15 --budget 30
python werkstatt.py waffe axt_bart axt.png --base axt --budget 30   # ein Gegenstand je Bild
python werkstatt.py requisit runenstein stein.png --realm midgard --rolle wahrzeichen --budget 30
python werkstatt.py paket                       # Vorschau: assets-src/gen/meshy/vorschau/schwebfels.html
python werkstatt.py bilder nordmann_f --waffe axt   # Spielbilder neben dem Konzeptbild (auch für Teile, Waffen, Bestien)
python werkstatt.py notiz nordmann_f "Schultern von Hand geglättet"   # Nacharbeit festhalten
python werkstatt.py bericht                     # meshy/bericht.html: Bilder, Kennzahlen, Nacharbeit, verbrauchte Credits
```

Die Werkstatt merkt sich je Modell Art, Konzeptbild und Einstellungen (`meshy/<name>/werkstatt.json`); der Bericht
fasst alles für den Kapitän zusammen, die Credits stammen aus Meshys Antworten (`credits.jsonl`).

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
- Namen der Bewegungen: `meshy_api.py` legt neben jede Bewegungsdatei eine gleichnamige `.json` mit den bestellten
  Bibliotheksnamen; `meshy.py` ordnet die Bewegungen der Datei darüber zu (Vergleich ohne Groß- und Sonderzeichen,
  sonst nach Reihenfolge, Warnung im Protokoll). Das Spiel wählt Clips über diese Namen.
- `--as-meshy` baut für fremde Testmodelle (etwa Mixamo-Figuren) das 24-Knochen-Skelett von Meshy nach.
- Figuren mit `--race` und `--gender` ersetzen im Spiel automatisch den Körper dieses Volkes (auch bei Inselbewohnern).
  Mehrere Figuren für dasselbe Volk und Geschlecht sind erlaubt. Heldenerschaffung und Spiegel zeigen für solche
  Völker statt Haut, Haaren und Gesicht nur die Wahl der Gestalt (gespeichert als Frisur, so wählen auch die
  Inselbewohner zwischen den Figuren);
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
- Bestien: Meshy riggt per API nur Zweibeiner und hat keine Tierbewegungen. `beasts/from_glb.py` gibt einem
  stehenden Tier aus einer GLB (Blick +Z) ein Vierbeiner-Skelett mit den Rollen des Bestiensystems (Wirbelsäule,
  Kopf, Schwanz, vier Beine mit je drei Gliedern, Gewichte per Bone Heat). Im Spiel bewegt es sich wie die anderen
  Bestien (`src/r3d-beasts.js`), behält seine Textur und wird je Gegner leicht in dessen Farbe getönt. `--archs wolf`
  legt fest, welche Monsterarten es darstellt; `gen_pack.py` nimmt alles aus dem Unterordner `bestien` auf.
- Waffen und Schilde: `python weapon.py <aus>/waffen/axt_bart.npz axt.glb --base axt` legt den Griffpunkt in den
  Ursprung, Klinge oder Schaft entlang +Y und Schneide oder Axtblatt entlang X, wie bei den gebauten Waffen. Das
  Griffende erkennt es an der breitesten Stelle (Parierstange nahe am Griff, Axt- oder Hammerkopf weit davon); sitzt
  es verkehrt, `--umdrehen`. Im Spiel ersetzt die Waffe bei jedem Helden die gebaute Waffe derselben Grundart
  (`--forms` und `--seltenheit` grenzen ein), das Gegenstandsbild zeigt dann das Modell. Konzepttafeln mit mehreren
  Waffen vorher so zuschneiden, dass jedes Bild nur eine Waffe zeigt. `gen_pack.py` nimmt den Unterordner `waffen` auf.
- Kampfumgebung: `prop.py` stellt ein Requisit (Meshy-Lage, oben +Y) auf den Boden und bringt es auf die Zielhöhe
  seiner Rolle (`baum` 4,6 m, `deko` 0,8 m, `wahrzeichen` 3,2 m, sonst `--hoehe`). Im Kampf eines Reiches ersetzen
  dessen Requisiten die gebauten Bäume und Dekorationen (je Dekomodell höchstens zwei Stück), ein Wahrzeichen steht
  hinten in der Mitte. Ohne Requisiten bleibt die Kampfbühne genau wie bisher. Unterordner `requisiten`.
- `gen.pack` gehört erst ins Repository, wenn der Qualitätstest den Kapitän überzeugt hat.

Prüfen ohne Credits: Testmodelle aus dem three.js-Repository (`examples/models/gltf/Soldier.glb`, `Xbot.glb`,
`RobotExpressive/RobotExpressive.glb`) mit `--as-meshy` einlesen; sie dienen nur dem Test und gehören nicht ins Spiel.
