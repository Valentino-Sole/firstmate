# Fehlende Produktionsmedien und eingesetzte Zwischenlösungen

Stand: 2026-10-12, nach Designpaket v0.4, Ergänzung v0.4.1 (Glück) und
Ergänzung v0.4.2 (Waffeneffekte). Grundlage: asset-vertrag.json
"not_delivered_as_finished_media" und die Hinweise der Ergänzungen.
Das Spiel ist vollständig spielbar; alles Folgende ist klar gekennzeichnete
Zwischenlösung und wartet auf nachgereichte Produktionsmedien.
Es wurden keine Designs erfunden; jede Zwischenlösung ist eine technische
Aufbereitung der gelieferten Konzeptbilder oder eine engine-gezeichnete
Fläche nach den Geometrie- und Farbvorgaben der Fachdateien.

## 1. Freigestellte animierte Monster-/Bossatlanten (110 Stück)

Fehlen laut Asset-Vertrag.
Zwischenlösung: `tools/build_assets.py` schneidet aus den gelieferten
Konzeptkarten die Quadranten 01 (Wesen), 02 (Vorbereitung) und
04 (Erholung) frei (Hintergrundentfernung, Etiketten-/Rahmenfilter) und
nutzt sie als Standbilder je Zustand:

- idle/move: Quadrant 01, mit Atmen von maximal 2 % Körperhöhe,
- windup und aktiv: Quadrant 02 (die Angriffsflächen zeichnet die Engine
  nach den JSON-Geometrien; Panel 03 enthält Diagrammelemente und wird
  deshalb nicht freigestellt),
- recovery: Quadrant 04.

Keine Richtungsanimationen (front/back/left/right), keine move/hit/death-
Clips. Monster werden horizontal gespiegelt; laut Regelwerk ist das nur für
Knorz verboten. Bosse nutzen die große Figur der linken Kartenhälfte für
alle Phasen; die Phasenposen der Kartenstreifen sind nicht freigestellt.

Benötigt werden: je Monster 512er-Atlanten (idle 4, move 6, windup 3,
attack 3, recovery 3, hit 2, death 5 Bilder; 4 Richtungen), Bosse auf
1024er-Flächen inkl. Phasenwechsel (6 Bilder, 1,2 s), Benennung
`M001_move_front_00.png` usw. (asset-vertrag.json "sprite_export"/"animation").

## 2. Vollständige Heldenrichtungsanimation

Fehlt. Zwischenlösung: `held/knorz-freisteller-v03.png` (neutrale Pose) als
Standbild; Ausweichen staucht die Figur leicht; keine Spiegelung (Ring und
großer Arm bleiben anatomisch links). Benötigt: idle/move/hit in vier
Richtungen ohne Spiegelung.

## 3. 40 separate transparente Waffenbilder

Fehlen. Zwischenlösung: Quadrantenzuschnitt aus den Familienblättern
(waffen/WF01-10.png) anhand `sheet_position`; Pivot ist nicht gesetzt
(Asset-Vertrag verlangt Griffansatz). Im Spiel werden die Bilder nur als
Symbole (Laden, Inventar, HUD) genutzt, nicht als geschwungene Waffensprites;
die Angriffsdarstellung erfolgt engine-seitig nach waffen.json-Geometrie.

## 4. Getrennte Arena-Ebenen und Hindernisgrafiken

Fehlen. Zwischenlösung: die vollständigen Arenabilder (inkl. eingebrannter
Hindernisse) als eine Bodenebene; Figuren werden darüber nach Fußpunkt-Y
sortiert. Folge: Figuren können Hindernissockel überdecken, auch wenn sie
dahinter stehen (korrekte Y-Sortierung erst mit getrennten Ebenen möglich).
Kollision folgt ausschließlich arenen.json, nie der Illustration.

## 5. Gemalte UI-Komponenten als finale Einzelexporte

Fehlen. Zwischenlösung: natives HTML/CSS nach den 26 SVG-Layouts und den
Farb-/Abstands-/Fokusregeln der ui-spezifikation.json. Die drei gemalten
Referenzen werden als Stimmungshintergrund (Startbildschirm) bzw. Stilreferenz
genutzt; PNG-Schrift und -Knöpfe sind nirgends klickbare Flächen.

## 6. Lizenzierte Schriftdateien

Fehlen. Zwischenlösung: Systemschrift Segoe UI/Arial (die im Paket benannte
Vorschau-Schrift). Vor Veröffentlichung ist eine ausdrücklich lizenzierte
Spielschrift zu wählen und einzubinden (ui-spezifikation.json "typography").

## 7. Audiodateien

Fehlen vollständig (Asset-Vertrag "audio_brief": Klangregie ohne Dateien).
Zwischenlösung: kleine WebAudio-Synthesen in js/audio.js setzen die
beschriebenen Hinweise um (Messing-Tick, Siegel-Plopp, drei Glockentöne,
Anlaute je Angriffsgrundform, Keramikklack, Materialbruch). Keine Musik.
Warnklänge sind nie der einzige Gefahrenhinweis.

## 8. VFX-Sprites der Waffeneffekte (v0.4.2)

Die 40 SVGs unter effekte/diagramme sind technische Storyboards, keine
fertigen Effekt-Sprites. Zwischenlösung: prozedurale Effekte nach der
Geometrie der Effektdatensätze mit den Farbregeln aus
gemeinsame-regeln.json "vfx" (Mint/Elfenbein, Brand Gold, Nähte Mauve,
Statusformen zusätzlich zur Farbe, höchstens 3 Statussymbole je Ziel).

## 9. Wachskarten-Produktionsteile (Stilreferenz v0.4.3)

Die Ergänzung v0.4.3 (glimms-laden-wachskarten.png, in
docs/stilreferenzen/) ist eine Stil- und Kompositionsreferenz, kein
UI-Atlas. Für die Produktion werden laut ihrer Übergabe benötigt:
getrennte skalierbare Wachsrahmen mit geschützten Ecken, geprägte Siegel,
Knöpfe, die Werkstattkulisse als Hintergrund und Gegenstandsfreisteller
der Relikte in gemeinsamer Material- und Lichtwirkung.
Zwischenlösung: Wachsrahmen, Nieten, Tropfen, Siegel, Messinglasche und
Kantenlicht werden per CSS gezeichnet (Palette und Aufbau exakt nach der
Referenz); Reliktbilder bleiben vorerst die flachen SVG-Symbole; die
Werkstattkulisse ist ein dezenter Lichtsaum statt einer Illustration.
Abgeleitete Symbolvarianten nach den Stilreferenzen (gem-rot, schloss,
wuerfel) liegen unter assets/symbole/ und sind als Ableitungen markiert.

## 10. Fehlende Text-IDs

Die Textdatei enthält keine Beschriftungen für: Hilfe-Titel (UI15),
Randpuls-Schalter (UI05-Zustand "Randpuls optional abschaltbar"),
Sprachauswahl. Übergangsbeschriftungen sind im Code markiert; siehe
docs/abweichungen.md. Eine englische Gesamtübersetzung war nicht Teil der
Pakete; die mitgelieferten Dateien spieltexte.en.json, namen.en.json,
glueck.en.json und waffeneffekte.en.json sind eine Claude-Übersetzung und
warten auf redaktionelle Freigabe.
