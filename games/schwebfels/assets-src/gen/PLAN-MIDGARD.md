# Ablaufplan Qualitätstest Midgard (Meshy)

Beschluss des Kapitäns vom 7. Oktober 2026: Meshy Premium, zuerst Midgard mit acht Helden und Qualitätstest
(etwa 1.000 Credits), danach erst nach seiner Abnahme die Insel Hrimholm.

Regeln:
- Vor jedem Schritt das Ergebnis des vorigen ansehen. Misslungenes nicht weiterverarbeiten, sondern neu erzeugen und das im Protokoll vermerken.
- Alle Credits stehen automatisch in `<aus>/credits.jsonl`; `python meshy.py report <aus>` zeigt die Summe.
- Der Schlüssel kommt nur aus `MESHY_API_KEY` und wird nie ausgegeben.
- Ergebnisse liegen bei Meshy nur wenige Tage: `meshy.py` lädt alles sofort herunter. Den Ausgabeordner nach jedem Schritt sichern (nicht ins Repository, die Rohdaten sind groß; nur fertige Spieldateien kommen in `assets/`).

Vorbereitung:

```sh
V=<venv>; K=<entpacktes Konzeptpaket>; A=<ausgabeordner>; GEN=games/schwebfels/assets-src/gen
python3 -m venv $V && $V/bin/pip install bpy==5.2.2 pillow scipy
$V/bin/python -I $GEN/crop_templates.py $K $A/vorlagen
python3 -I $GEN/meshy.py balance          # kostenlos: Schluessel und Guthaben pruefen
```

## 1. Vorlagen für das fehlende Geschlecht (Bild zu Bild, je 6 Credits)

Tafel 02 zeigt je Volk nur ein Geschlecht. Gegenstück erzeugen, ansehen, erst dann weiter.

```sh
python3 -I $GEN/meshy.py img2img $A nordmann-mann-bild "Create the male counterpart of this Nordmann (Norse human) character from the same fantasy game. Broad shoulders, strong jaw, short braided blond beard, long blond hair in braids, blue rune face paint. Same dark blue linen tunic with embroidered border, leather belts and pouches, wrist wraps, dark trousers and tall leather boots. Same painted concept art style and colors. Full body, front view, standing straight, arms relaxed slightly away from the body, plain light parchment background, no text." $A/vorlagen/01-nordmann-frau.png --ratio 3:4
python3 -I $GEN/meshy.py img2img $A trollblut-frau-bild "Create the female counterpart of this Trollblut (troll-blooded) character from the same fantasy game. Just as tall and powerful, clearly female body shape, grey blue skin with rune tattoos, curved horns, small tusks, long dark braided hair. Same sleeveless dark blue tunic, wide leather belts, fur scraps, wrapped trousers and heavy wrapped boots. Same painted concept art style. Full body, front view, standing straight, arms relaxed slightly away from the body, plain light parchment background, no text." $A/vorlagen/04-trollblut-mann.png --ratio 3:4
python3 -I $GEN/meshy.py img2img $A frostwicht-frau-bild "Create the female counterpart of this Frostwicht (frost sprite) character from the same fantasy game. Slender and small, clearly female, pale blue white skin, long pointed ears with icy tips, white hair. Same light blue sleeveless embroidered tunic, leather belts, wrist wraps, dark trousers and wrapped boots. Same painted concept art style. Full body, front view, standing straight, arms relaxed slightly away from the body, plain light parchment background, no text." $A/vorlagen/05-frostwicht-mann.png --ratio 3:4
python3 -I $GEN/meshy.py img2img $A glutzwerg-mann-bild "Create the male counterpart of this Glutzwerg (ember dwarf) character from the same fantasy game. Short, stocky and very broad, dark brown skin with glowing ember orange rune tattoos, red orange braided hair and a thick braided beard. Same dark sleeveless tunic with red sash, wide leather belts, wrist guards, dark trousers and heavy boots. Same painted concept art style. Full body, front view, standing straight, arms relaxed slightly away from the body, plain light parchment background, no text." $A/vorlagen/06-glutzwerg-frau.png --ratio 3:4
```

## 2. Heldenkörper (Bild zu 3D in A-Haltung, je etwa 30 bis 35 Credits; danach Skelett je 5 Credits)

Die Nordmann-Frau gibt es schon aus der Web-App (GLB vom Kapitän). Nur erzeugen, was fehlt.

```sh
python3 -I $GEN/meshy.py img23d $A nordmann-mann <bild aus Schritt 1> --pose a-pose --pbr
python3 -I $GEN/meshy.py img23d $A trollblut-mann $A/vorlagen/04-trollblut-mann.png --pose a-pose --pbr
python3 -I $GEN/meshy.py img23d $A trollblut-frau <bild aus Schritt 1> --pose a-pose --pbr
python3 -I $GEN/meshy.py img23d $A frostwicht-mann $A/vorlagen/05-frostwicht-mann.png --pose a-pose --pbr
python3 -I $GEN/meshy.py img23d $A frostwicht-frau <bild aus Schritt 1> --pose a-pose --pbr
python3 -I $GEN/meshy.py img23d $A glutzwerg-frau $A/vorlagen/06-glutzwerg-frau.png --pose a-pose --pbr
python3 -I $GEN/meshy.py img23d $A glutzwerg-mann <bild aus Schritt 1> --pose a-pose --pbr
# danach je Koerper: python3 -I $GEN/meshy.py rig $A <name>-rig <auftrag-id> --height <meter>
```

Größen für das Skelett (Spielhöhe 2,0 entspricht etwa 1,8 m): Nordmann 1,9; Trollblut 2,4; Frostwicht 1,6; Glutzwerg 1,35.

## 3. Ausrüstung für den Wechseltest (an der Nordmann-Kriegerin)

Erst freistellen (Bild zu Bild), ansehen, dann Bild zu 3D ohne Haltung.

```sh
python3 -I $GEN/meshy.py img2img $A brust-normal-bild "From the warrior in the reference image, extract only the torso armor as a standalone 3D game asset: the steel breastplate with shoulder pauldrons, the quilted gambeson underneath with its short skirt, and the belt. No head, no neck, no arms below the pauldrons, no hands, no legs, no shield, no sword, no cape. Shown as if worn by an invisible mannequin, hollow inside, front view, plain white background, same materials, colors and painted style." $A/vorlagen/10-krieger-normal.png --ratio 3:4
python3 -I $GEN/meshy.py img2img $A brust-gruen-bild "From the warrior in the reference image, extract only the torso armor as a standalone 3D game asset: the steel scale armor cuirass with riveted pauldrons and the red tabard skirt. No head, no neck, no arms below the pauldrons, no hands, no legs, no shield, no sword, no cape. Shown as if worn by an invisible mannequin, hollow inside, front view, plain white background, same materials, colors and painted style." $A/vorlagen/11-krieger-gruen.png --ratio 3:4
python3 -I $GEN/meshy.py img2img $A helm-bild "From the warrior in the reference image, extract only the steel helmet with cheek guards as a standalone 3D game asset, empty inside, no head, front three quarter view, plain white background, same materials and painted style." $A/vorlagen/10-krieger-normal.png --ratio 1:1
python3 -I $GEN/meshy.py img2img $A handschuhe-bild "From the warrior in the reference image, extract only the pair of steel gauntlets with leather cuffs as a standalone 3D game asset, standing upright side by side as if worn by invisible hands, fingers straight, no arms, plain white background, same materials and painted style." $A/vorlagen/10-krieger-normal.png --ratio 1:1
python3 -I $GEN/meshy.py img2img $A stiefel-bild "From the warrior in the reference image, extract only the pair of armored boots with greaves (knee guard, shin plate, steel toe caps) as a standalone 3D game asset, standing upright side by side as if worn by invisible legs, no legs visible, plain white background, same materials and painted style." $A/vorlagen/10-krieger-normal.png --ratio 1:1
# danach je Teil: python3 -I $GEN/meshy.py img23d $A <teil> <bild> --pose none --pbr
python3 -I $GEN/meshy.py img23d $A schwert-gruen $A/vorlagen/12-schwert-gruen.png --pose none --pbr
```

## 4. Wolf und Kampfumgebung

```sh
python3 -I $GEN/meshy.py img23d $A wolf $A/vorlagen/03-wolf.png --pose none --pbr
# Runenstein aus dem Midgard-Designkonzept zuschneiden; Fels und verschneite Tanne per Bild zu Bild im Stil des Konzepts, dann Bild zu 3D
```

## 5. Einbau und Abnahme

- Körper und Teile mit Blender auf das Spielskelett bringen (Skelett von Meshy auf die 29 Spielknochen abbilden, siehe `build_figure.py`), Ausrüstung anpassen, Haut darunter ausblenden.
- Gegenstandsbilder im Spiel aus den echten Modellen rendern.
- Prüfen: Stand, Laufen, Angriff, Kampf; nichts drückt durch.
- Vergleichsseite: echte Spielbilder neben den Konzeptvorlagen, dazu Liste der Modelle, Nacharbeit je Modell und verbrauchte Credits (`meshy.py report`).
