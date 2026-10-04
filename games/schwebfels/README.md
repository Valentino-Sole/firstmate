# Helden von Schwebfels

Browser-Rollenspiel auf einer schwebenden Wolkeninsel: Aufträge in der Taverne, automatische Kämpfe in 3D, Ausrüstung, Attribute, Arena, Leuchtturmwache, sechs Dungeons, Reittiere, Wunschbrunnen und Ruhmeshalle.
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
| `src/data.js` | Völker, Klassen, Gegenstände, Monster, Dungeons, Auftragstexte, Abzeichen |
| `src/engine.js` | Spiellogik ohne DOM: Gegenstände, Kampf, Aufträge, Arena, Dungeons, Läden, Zeit |
| `src/icons.js` | Eigene Vektor-Symbole für Gegenstände und Oberfläche |
| `src/r3d-models.js` | 3D-Figuren: Helden mit sichtbarer Ausrüstung, 12 Monstergattungen, Animationen |
| `src/r3d-scenes.js` | 3D-Schauplätze: Insel, Heldenansicht, Kampfbühnen, Portraits |
| `src/ui-*.js` | Oberfläche: Leisten, Gebäude, Kampfablauf, Charaktererstellung |
| `src/store.js` | Speichern im Browser, Spielstand-Code, optional claude.ai-Konto und Arena-Profile |
| `src/audio.js` | Klangeffekte per WebAudio |
| `src/main.js` | Start und Spielstand-Wechsel |

Alle Figuren, Texte, Symbole und 3D-Modelle sind eigens für dieses Spiel entstanden. Die 3D-Darstellung nutzt [three.js](https://threejs.org) (MIT-Lizenz).
