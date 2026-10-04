# Helden von Schwebfels: Spieldesign

Ein eigenständiges Browser-Rollenspiel, das die **Struktur** von Shakes & Fidget (Playa Games) aufgreift, aber eigene Welt, eigene Figuren, eigene Texte, eigene Formeln und eine eigene 3D-Optik hat.
Es wurden keine Grafiken, Namen oder Texte des Vorbilds übernommen.
Version 2 ergänzt eine Welt mit drei verfeindeten Reichen, deren Grundidee (drei Reiche mit eigenen Klassen, die gegeneinander kämpfen) an Dark Age of Camelot erinnert; Namen der Reiche stammen aus alter Sage (Albion, Midgard, Hibernia), alle Klassen, Völker, Figuren und Geschichten sind eigene Schöpfungen.

## 1. Wie Shakes & Fidget aufgebaut ist

Recherchegrundlage: der Wikipedia-Artikel zu Shakes & Fidget, die offizielle App-Store-Seite des Spiels und etablierte Spielerleitfäden.
Kernaussagen, die dort übereinstimmend beschrieben sind:

- Satirisches Fantasy-Browser-RPG aus Hamburg, entstanden aus dem gleichnamigen Webcomic.
- **Taverne**: Aufträge kosten „Abenteuerlust“, ein Kontingent, das sich täglich auffüllt und mit Bier (Premiumwährung) nachgefüllt werden kann.
- **Charakter**: fünf Attribute, die mit Gold gesteigert werden; Ausrüstungsslots links und rechts vom Charakterbild; Menü als senkrechte Leiste am linken Rand.
- **Arena** und **Ruhmeshalle**, **Gilden** mit eigener Rangliste, **Dungeons** ab Stufe 10, **Stadtwache**, **Reittiere**, ein **Glücksrad** mit täglichem Freidreh.
- Automatisch ablaufende Kämpfe; Klassen mit festen Eigenschaften.

## 2. Welt von Version 2

Vor tausend Jahren zerbrach der Weltstein. Drei Splitter tragen die Reiche durch das Nebelmeer, dazwischen schwebt **Schwebfels**, die Freistatt, in der jeder Krieg ruhen muss.

| Reich | Motto | Völker | Klassen (Krieger, Schurke, Jäger, Magier) |
|---|---|---|---|
| **Albion** (Kreideklippen, Ritterorden) | „Durch Eid und Eisen“ | Albier, Kreidezwerg | Schildritter, Meuchler, Langbogner, Lichtweber |
| **Midgard** (Frostlande, Runensteine) | „Kälte formt Helden“ | Nordmann, Trollblut | Sturmhüne, Nebelschleicher, Wolfsjäger, Runenwirker |
| **Hibernia** (Nebelwälder, Feenhügel) | „Der Hain vergisst nicht“ | Sidhe, Moorling | Hainwächter, Schattentänzer, Mondschütze, Dornenrufer |

- Die vier **Grundarten** sind in allen Reichen ähnlich (Krieger blocken, Schurken schlagen zuerst und kritisch, Jäger weichen aus, Magier zaubern unaufhaltsam). Jede der zwölf Klassen hat aber einen **eigenen Spezialangriff** (Betäuben, Gift, Heilung, Pfeilhagel, Schattentanz, Rüstung durchdringen usw.) und eine **eigene Geschichte**.
- Gegenstände gelten für die Grundart, nicht für das Reich: ein Midgarder Krieger kann eine Albioner Axt führen.

## 3. Was Schwebfels übernimmt und was es anders macht

| Vorbild | Schwebfels | Eigene Note |
|---|---|---|
| 2D-Comicgrafik | prozedurale **3D-Welt** mit handgemalt wirkenden Texturen | Freistatt-Insel im Nebelmeer mit Steinkreis, Wasserfällen ins Nichts, Glühwürmchen, Himmelswal; **automatischer Tag-Nacht-Wechsel** (20 Minuten, echte Uhrzeit, immer Tag oder immer Nacht) mit Mond, Sternen und Polarlicht |
| Taverne, Abenteuerlust | Taverne „Zur Schiefen Krähe“, **Tatendrang** | Siegchance je Auftrag; **seltene Hordenaufträge** mit drei Gegnern nacheinander, Lebenspunkte werden mitgenommen, kurzes Atemholen dazwischen |
| Bier gegen Pilze | Nebelmet gegen **Wolkenperlen** | Perlen gibt es nur im Spiel, kein Echtgeld; Perlen werden nie ungefragt ausgegeben |
| Charakterbild mit Slots | **Charakterbogen** im gleichen Aufbau | Große Erfahrungsleiste mit „noch X EP bis Stufe Y“, in der Kopfleiste immer sichtbar; **Vergleichstabelle** beim Anlegen (Wert für Wert und die eigenen Werte danach) |
| Aussehen | Haut, Haare, Bart, Augen (auch glühend), **Tätowierungen** in sieben Mustern und Farben (teils leuchtend), Narben, Hörner | Jederzeit kostenlos änderbar |
| Geschichte | **Chronik** im Steinkreis | Je Reich fünf Kapitel, je Klasse drei; Kapitel mit mehreren Gegnern, seltene und epische Belohnungen |
| Arena und Ruhmeshalle | **Ring der Reiche**, **Halle der Helden** | Gegner nur aus den anderen Reichen; Ranglisten global, je Reich, für Gilden und als **Reichskrieg** (Summe der Ehre je Reich) |
| Gilden | **Gildenhalle** | Gilden des eigenen Reiches beitreten oder gründen; in claude.ai sehen echte Mitspieler die Gilde |
| Stadtwache | **Wachturm** | Schichten zu 5 Minuten |
| Dungeons | **Das Tor zur Tiefe** | 6 Dungeons mit je 8 Bossen |
| Glücksrad | **Wunschbrunnen** | Freier Wurf mit sichtbarem **Zeitgeber bis Mitternacht**, Perlenwurf nur als eigener Knopf |
| (kein Gegenstück) | **Heim** | Vier Ausbaustufen (Zeltlager bis Turmfeste) und sieben Einrichtungen mit dauerhaften Boni, als begehbare 3D-Ansicht |
| Album, Erfolge | **Bestiarium**, **Abzeichen** | 20 Abzeichen mit Perlen-Belohnung |

## 4. Kampf

Kämpfe laufen automatisch und abwechselnd ab, höchstens 90 Aktionen; ab der 30. Aktion steigt der Schaden („Raserei“), damit kein Kampf festfährt.

- **Schaden** = Waffenwurf × (1 + Hauptwert / 10) × Klassenfaktor × (1 − Schadensminderung).
- **Schadensminderung** = Klassenobergrenze × Rüstung / (Rüstung + 2,8 × Angreiferstufe + 30).
- **Kritischer Treffer**: 3 % + 50 % × Glück / (Glück + 8 × Gegnerstufe + 20) plus Klassenbonus, höchstens 60 %; Schurken treffen härter kritisch.
- **Spezialangriff** bei jeder vierten Aktion, je Klasse verschieden.
- **Mehrere Gegner** (Horden, Chronik): der Held kämpft nacheinander gegen alle, zwischen zwei Gegnern kehren 12 % der Lebenspunkte zurück.
- Ein Kampf ist durch einen festen Zufallswert bestimmt: Neuladen ändert den Ausgang nicht.

## 5. Balance

- `tests/balance.mjs`: Klassen-Duelle im Mittel zwischen etwa 44 und 58 %; Aufträge und Dungeon-Bosse für alle zwölf Klassen.
- `tests/progression.mjs`: simulierter Spieler; alle Grundarten erreichen Stufe 30 nach rund 12 bis 15 Spielstunden reinem Tatendrang, ohne Abwärtsspirale.
- Hordenaufträge: gemütlich fast immer, ordentlich rund 90 %, halsbrecherisch bewusst schwer (25 bis 50 %) bei 1,5-facher Belohnung.
- Chronik-Kapitel: auf der Kapitelstufe mit durchschnittlicher Ausrüstung meist 60 bis 100 %.

## 6. Technik

- Reines HTML, CSS und JavaScript; `build.mjs` bündelt alles zu einer Datei.
- 3D mit three.js 0.160 (vom CDN). Figuren, Monster, Gebäude, Waffen und alle Texturen entstehen zur Laufzeit im Code (Canvas-Malerei, Formen, Röhren, Drehkörper). Ohne WebGL schaltet das Spiel auf eine 2D-Ansicht um.
- Musik und Klänge werden live mit WebAudio erzeugt: eigene Stücke für Insel bei Tag und Nacht, Taverne, Kampf, Dungeon, Heim und Chronik.
- Speichern im Browser (localStorage) und als Spielstand-Code; in claude.ai zusätzlich privat im Konto, mit öffentlichem Heldenprofil für Arena und Ranglisten und öffentlichen Gildenprofilen.
- Spielstände aus Version 1 werden übernommen; beim ersten Start wählt der Held sein Reich, Stufe, Gold, Ausrüstung und Erfolge bleiben.
