# Helden von Schwebfels

Browser-Rollenspiel in der Freistatt Schwebfels zwischen drei verfeindeten Reichen (Albion, Midgard, Hibernia): zwölf Klassen mit eigener Geschichte, Aufträge und Hordenaufträge in der Taverne, automatische Kämpfe in 3D, Ausrüstung mit Vergleich, Tätowierungen, Chronik, Ring der Reiche, Ranglisten für Helden, Gilden und Reiche, Gilden, Heim mit Einrichtung, Wachturm, sechs Dungeons, Reittiere, Wunschbrunnen, Tag-Nacht-Wechsel und Musik.
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

# Tests der Spiellogik
node --test tests/engine.test.mjs

# Balance-Simulationen
node tests/balance.mjs
node tests/progression.mjs all 30

# Browser-Durchlauf mit Bildschirmfotos (Playwright, Chromium)
node build.mjs && node tests/e2e.mjs screens
```

Bekommt der Testbrowser keine direkte Verbindung zu den CDNs, kann `CDN_CACHE` auf eine JSON-Datei `{ "url": "lokaler/pfad" }` zeigen; die Anfragen werden dann aus diesen Dateien bedient.

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/data.js` | Reiche, Völker, Klassen und ihre Geschichten, Gegenstände, Monster, Dungeons, Auftragstexte, Heim, Abzeichen |
| `src/engine.js` | Spiellogik ohne DOM: Gegenstände, Kampf, Mehrfachkämpfe, Aufträge, Chronik, Arena, Ranglisten, Gilden, Heim, Dungeons, Läden, Zeit, Übernahme alter Spielstände |
| `src/icons.js` | Eigene Vektor-Symbole für Gegenstände, Reiche und Oberfläche |
| `src/r3d-models.js` | 3D-Helden: gemalte Texturen, Gesichter mit Tattoos und Narben, Reichsrüstungen, Prunkwaffen, Animationen |
| `src/r3d-monsters.js` | 15 Monstergattungen mit eigenen Animationen |
| `src/r3d-scenes.js` | 3D-Schauplätze: Freistatt-Insel mit Tag-Nacht-Wechsel, Heldenansicht, Heim, Kampfbühnen, Portraits |
| `src/ui-*.js` | Oberfläche: Menüleiste, Orte, Kampfablauf, Heldenerschaffung |
| `src/store.js` | Speichern im Browser, Spielstand-Code, optional claude.ai-Konto, Helden- und Gildenprofile |
| `src/audio.js` | Musik je Ort und Klangeffekte per WebAudio |
| `src/main.js` | Start, Reichswahl für alte Spielstände, Spielstand-Wechsel |

Alle Figuren, Texte, Symbole, Musikstücke, Klänge und 3D-Modelle sind eigens für dieses Spiel entstanden. Die 3D-Darstellung nutzt [three.js](https://threejs.org) (MIT-Lizenz).
