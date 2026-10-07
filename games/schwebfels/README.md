# Helden von Schwebfels

Browser-Rollenspiel in der schwebenden Inselwelt Schwebfels zwischen drei verfeindeten Reichen (Albion, Midgard, Hibernia), jedes mit eigener Heimatinsel, eigener Musik und eigenen Monstern: zwölf Klassen mit eigener Geschichte, Aufträge und Hordenaufträge in der Taverne, automatische Kämpfe in 3D, Ausrüstung mit Vergleich, Gesichtstätowierungen, Talentbäume für jede Klasse, Chronik, Ring der Reiche mit passend starken Gegnern, Ranglisten für Helden, Gilden und Reiche, Gilden, Heim mit Einrichtung, Wachturm, sechs Dungeons, Reittiere, Wunschbrunnen, Tag-Nacht-Wechsel und das Mondtor, das sich nur nachts öffnet.
Aufbau und Abgrenzung zum Vorbild Shakes & Fidget stehen in [DESIGN.md](DESIGN.md).

## Spielen

`dist/schwebfels.html` im Browser öffnen. Eine Internetverbindung wird für die 3D-Bibliothek (cdnjs) und die Schriften (Google Fonts) gebraucht; ohne sie läuft das Spiel in einer 2D-Ansicht weiter.

Der Spielstand liegt im Browser. Unter Einstellungen lässt er sich als Code sichern und auf einem anderen Gerät wieder laden.

## Entwickeln

```sh
# Quellen live ansehen (beliebiger statischer Server)
npx serve .            # dann index.html öffnen

# Einzeldatei bauen: dist/schwebfels.html und dist/artifact.html
node build.mjs
# Modellpakete als eigene Dateien neben der Seite (dist/packs/), falls die Seite sonst über 16 MB käme
SPLIT=1 node build.mjs

# Tests der Spiellogik
node --test tests/engine.test.mjs

# Balance-Simulationen
node tests/balance.mjs
node tests/progression.mjs all 30
node tests/talents.mjs

# Browser-Durchlauf mit Bildschirmfotos (Playwright, Chromium)
node build.mjs && node tests/e2e.mjs screens

# Figuren mit eigenem Skelett (Meshy-Strecke) mit einer eigenen Prüffigur
node tests/rigged.mjs

# Rauchtest: alle Völker, Klassen, Monster, Gegenstände und Szenen; meldet auch stille Ausweichdarstellungen
node tests/smoke.mjs
```

Bekommt der Testbrowser keine direkte Verbindung zu den CDNs, kann `CDN_CACHE` auf eine JSON-Datei `{ "url": "lokaler/pfad" }` zeigen; die Anfragen werden dann aus diesen Dateien bedient.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/data.js` | Reiche und Heimatinseln, Völker, Klassen und ihre Geschichten, Talentbäume, Gegenstände, Monster je Reich, Nachtwesen, Dungeons, Auftragstexte, Heim, Abzeichen |
| `src/engine.js` | Spiellogik ohne DOM: Gegenstände, Kampf mit Talentwirkungen, Talentbäume, Mehrfachkämpfe, Aufträge, Chronik, Arena mit Stärkeabgleich, Ranglisten, Gilden, Heim, Dungeons, Läden, Tag und Nacht, Mondtor, Übernahme alter Spielstände |
| `src/icons.js` | Eigene Vektor-Symbole für Gegenstände, Reiche und Oberfläche |
| `src/r3d-models.js` | 3D-Helden: gemalte Texturen, Gesichter mit Tattoos und Narben, Reichsrüstungen, Prunkwaffen, Animationen |
| `src/r3d-assets.js`, `src/r3d-human.js` | Modellpakete laden (gzip), modellierte Helden aus `assets/schwebfels.pack` mit Bewegungen per Formel |
| `src/r3d-rigged.js` | Figuren mit eigenem Skelett aus `assets/gen.pack` (Meshy-Strecke): abgespielte Bewegungen je Kampfstil und Waffe, Schlag im Takt des Kampfes, Rüstungsteile, erzeugte Waffen und ihre Gegenstandsbilder |
| `src/r3d-monsters.js` | 15 Monstergattungen mit eigenen Animationen, Frost und Moos je nach Heimat |
| `src/r3d-scenes.js` | 3D-Schauplätze: Heimatinsel mit Tag-Nacht-Wechsel, Bewohnern und Mondtor, Heldenansicht, Heim, Kampfbühnen, Portraits |
| `src/r3d-realms.js` | Die drei Heimatinseln: Landschaft, Gebäude, Wetter und Wahrzeichen je Reich |
| `src/ui-*.js` | Oberfläche: Menüleiste, Orte, Kampfablauf, Heldenerschaffung |
| `src/store.js` | Speichern im Browser, Spielstand-Code, optional claude.ai-Konto, Helden- und Gildenprofile |
| `src/audio.js` | Musik je Ort und Reich sowie Klangeffekte per WebAudio |
| `src/main.js` | Start, Reichswahl für alte Spielstände, Spielstand-Wechsel |

Alle Figuren, Texte, Symbole, Musikstücke, Klänge und 3D-Modelle sind eigens für dieses Spiel entstanden. Die 3D-Darstellung nutzt [three.js](https://threejs.org) (MIT-Lizenz).
