# Helden von Schwebfels: Spieldesign

Ein eigenständiges Browser-Rollenspiel, das die **Struktur** von Shakes & Fidget (Playa Games) aufgreift, aber eigene Welt, eigene Figuren, eigene Texte, eigene Formeln und eine eigene 3D-Optik hat.
Es wurden keine Grafiken, Namen oder Texte des Vorbilds übernommen.

## 1. Wie Shakes & Fidget aufgebaut ist

Recherchegrundlage: der Wikipedia-Artikel zu Shakes & Fidget, die offizielle App-Store-Seite des Spiels und etablierte Spielerleitfäden.
Kernaussagen, die dort übereinstimmend beschrieben sind:

- Satirisches Fantasy-Browser-RPG aus Hamburg, entstanden aus dem gleichnamigen Webcomic.
- **Taverne**: Aufträge kosten „Abenteuerlust“, ein Kontingent, das sich täglich auffüllt und mit Bier (Premiumwährung) nachgefüllt werden kann. Aufträge bringen Gold, Erfahrung und gelegentlich Gegenstände.
- **Charakter**: fünf Attribute (Stärke, Geschick, Intelligenz, Konstitution, Glück), die mit Gold gesteigert werden; Ausrüstungsslots am Charakterbild.
- **Arena**: Kämpfe gegen andere Spieler um Ehre und einen Platz in der **Ruhmeshalle**.
- **Dungeons** ab Stufe 10, jeweils eine Reihe von Gegnern mit wertvoller Beute.
- **Stadtwache** als Gold-Arbeit, **Reittiere** für kürzere Reisezeiten, ein **Glücksrad** mit täglichen Preisen.
- Zwei Währungen: Gold und Pilze (Premium, auch für Echtgeld).
- Automatisch ablaufende, rundenbasierte Kämpfe; Klassen mit festen Eigenschaften (Block, Ausweichen, Zauber).

## 2. Was Schwebfels übernimmt und was es anders macht

| Vorbild | Schwebfels | Eigene Note |
|---|---|---|
| Satirische Fantasy-Stadt, 2D-Comicgrafik | **Schwebfels**, eine Stadt auf einer Wolkeninsel; komplett prozedurale **Low-Poly-3D-Welt** mit Cartoon-Schattierung und Umrisslinien | Die Insel ist das Hauptmenü: drehbar, zoombar, Gebäude anklickbar, Tageszeit nach Uhrzeit |
| Taverne, Abenteuerlust (täglich) | Taverne „Zur Schiefen Möwe“, **Tatendrang** | Regeneriert laufend (1 Punkt pro 36 s), jeder Auftrag zeigt **Schwierigkeit** und eine berechnete **Siegchance**; Gegner wachsen mit dem Helden, aber nur halb so schnell |
| Bier gegen Pilze | Wolkenbräu gegen **Wolkenperlen** | Perlen gibt es nur im Spiel (Stufenaufstieg, Abzeichen, Brunnen, Bosse), kein Echtgeld |
| Krieger, Kundschafter, Magier | **Klingenwache**, **Windläufer**, **Runenwirker** | Jede Klasse hat einen Spezialangriff bei jeder vierten Aktion (Schildbrecher betäubt, Pfeilhagel trifft dreifach, Sternenbruch ignoriert Rüstung); Schilde fangen auch Zauber ab, aber seltener |
| Menschen, Elfen, Zwerge usw. | Fünf eigene Völker: Wolkling, Steinbart, Moosling, Hornvolk, Nebelalb | Volk verändert Körperbau und Startwerte |
| Stadtwache | **Leuchtturmwache** | Schichten zu 5 Minuten, bis zu 8 am Stück |
| Arena und Ruhmeshalle | **Wolkenarena**, **Ruhmeshalle** | 140 mitwachsende Inselhelden; in claude.ai erscheinen zusätzlich **echte Mitspieler** als Gegner |
| Dungeons | **Das Tor zur Tiefe** | 6 Dungeons mit je 8 eigenen Bossen, Endbosse mit Krone, garantierte seltene Beute |
| Waffenschmied, Zauberladen | **Brumms Amboss**, **Zinnobers Kuriositäten** | Grüner Pfeil markiert Verbesserungen, Vergleich mit angelegter Ausrüstung, Tränke mit Laufzeit |
| Reittiere | **Greifenstall** | Dauerhaft gekauft, bis zu 45 % kürzere Reisezeit |
| Glücksrad | **Wunschbrunnen** | Münzwurf mit 3D-Animation, ein freier Wurf pro Tag |
| Album | **Bestiarium** | Jedes entdeckte Wesen gibt dauerhaft +0,5 % Erfahrung und Gold |
| Erfolge | **Abzeichen** | 16 Abzeichen mit Perlen-Belohnung |
| Pergament-Oberfläche | „Luftschiffer-Instrumententafel“ | Messingrahmen, Bullaugen-Portraits, Tatendrang als Manometer |

## 3. Kampf

Kämpfe laufen automatisch und abwechselnd ab, höchstens 90 Aktionen.

- **Schaden** = Waffenwurf (Waffe plus stufenabhängiger Grundschaden) × (1 + Hauptwert / 10) × Klassenfaktor × (1 − Schadensminderung).
- Im Duell zwischen Helden schwächt das gleiche Attribut des Verteidigers den Angriff (halber Wert wird abgezogen, mindestens die Hälfte bleibt). Gegen Monster gilt das nicht.
- **Schadensminderung** = Klassenobergrenze × Rüstung / (Rüstung + 2,8 × Angreiferstufe + 30). Obergrenzen: Klingenwache 45 %, Windläufer 30 %, Runenwirker 15 %.
- **Kritischer Treffer** (doppelter Schaden): 3 % + 50 % × Glück / (Glück + 8 × Gegnerstufe + 20), höchstens 45 %.
- **Lebenspunkte** = Konstitution × Klassenfaktor × (Stufe + 1).
- Ein Kampf ist durch einen festen Zufallswert bestimmt: Neuladen ändert den Ausgang nicht.

## 4. Balance

Die Werte sind mit zwei Simulationen eingestellt:

- `tests/balance.mjs`: Modellhelden gegen Monster, Bosse und andere Klassen. Klassen-Duelle liegen zwischen etwa 38 und 65 %.
- `tests/progression.mjs`: ein simulierter Spieler, der Aufträge wählt, einkauft und Attribute steigert. Alle drei Klassen erreichen Stufe 30 nach rund 160 Aufträgen (etwa 15 Spielstunden reiner Tatendrang), ohne Abwärtsspirale.

Wichtige Erkenntnisse aus der Simulation:

1. Ein festes Monsterniveau ist instabil: Wer verliert, bekommt kein Gold, wird schwächer und verliert öfter. Deshalb gibt es bei Niederlagen ein Trostpflaster (25 % Erfahrung und Gold) und Auftragsgegner, die halb mit der tatsächlichen Stärke des Helden wachsen.
2. Die Waffe dominiert den Schaden. Damit eine veraltete Waffe nicht alles blockiert, wächst ein Teil des Schadens mit der Stufe.
3. Die Klingenwache braucht ihren Schild zum Blocken, deshalb beginnt sie mit einem.

## 5. Technik

- Reines HTML, CSS und JavaScript ohne Build-Werkzeuge außer `build.mjs`, das alles zu einer Datei bündelt.
- 3D mit three.js 0.160 (vom CDN). Ohne WebGL schaltet das Spiel auf eine 2D-Ansicht mit Gebäudeliste und Kampfprotokoll um.
- Speichern im Browser (localStorage), zusätzlich als Spielstand-Code. Als claude.ai-Artifact zusätzlich privat im Konto und mit einem öffentlichen Heldenprofil für die Arena.
- Klangeffekte werden live mit WebAudio erzeugt.
