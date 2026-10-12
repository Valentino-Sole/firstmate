# FABELBRUCH

Arena-Survivor-Spiel ("Wünsche brauchen Grenzen.") nach dem Designpaket
FABELBRUCH v0.4 mit den Ergänzungen v0.4.1 (Glück) und v0.4.2
(Waffeneffekte). Deutsch und Englisch.

Knorz, ein fehlgegossener Schutzgeist, beruhigt zehn Bezirke, deren
Wünsche außer Kontrolle geraten sind: 20 Wellen je Bezirk, Levelaufstiege
mit genau drei Wunschsplitter-Karten, Glimms Laden zwischen den Wellen,
zehn Bosse mit Phasen, Brassas Werkstatt für dauerhafte Fortschritte,
Bestiarium mit Erinnerungsbuch.

## Starten

Das Spiel ist ein Browserspiel ohne Installations- oder Bauschritt.
Es braucht nur einen kleinen lokalen Webserver (wegen der Datendateien):

```bash
cd fabelbruch
python3 -m http.server 8080
# dann im Browser: http://localhost:8080/
```

Alternativ jeder andere statische Server (`npx serve` usw.).
Empfohlen: Chrome/Edge/Firefox in aktueller Version, Vollbild (F11).

## Steuerung

- Bewegen: WASD oder Pfeiltasten; Controller: linker Stick/D-Pad
- Ausweichen: Leertaste oder Shift; Controller: A
- Pause/Zurück: ESC; Controller: Start/B
- Menüs: Maus, Tab/Pfeile + Enter, oder Controller (A bestätigt, B zurück)
- Die Waffen greifen automatisch an (nächster Gegner in Reichweite).

## Projektaufbau

```
index.html, css/, js/     Spiel (natives JavaScript, HTML5 Canvas, ohne Abhängigkeiten)
data/                     Fachdateien aus dem Designpaket (unverändert) + EN-Übersetzungen
assets/                   web-aufbereitete Grafiken aus dem Designpaket (WebP/SVG)
tools/build_assets.py     Asset-Aufbereitung aus dem Originalpaket (Python, Pillow+scipy)
tools/build_en.py         erzeugt spieltexte.en.json aus der Übersetzungstabelle
tests/validate.mjs        Datums- und Formelprüfungen (node tests/validate.mjs)
docs/                     Recherche, fehlende Produktionsmedien, Abweichungen, Pakethinweise
```

Die Fachdateien bleiben die einzige Quelle der Wahrheit; die Engine liest
sie zur Laufzeit (design.json, arenen.json, waffen.json, boni-und-laden.json,
spielablauf.json, ui-spezifikation.json, waffeneffekte.json,
statusregister.json, gemeinsame-regeln.json, spieltexte.de.json).

## Stand und offene Punkte

- Vollständig umgesetzt: 10 Arenen (vergrößert mit mitfahrender Kamera,
  Kapitänsanweisung), 100 Monster (36 Angriffsarchetypen), 10 Bosse mit
  Phasenplänen, 40 Waffen mit allen 40 Fähigkeiten und Statusregister,
  13 Levelboni, 26 Relikte, Glückssystem, Laden mit Halten/Neuwurf/
  Fusion/Tausch/Verkauf, Werkstatt, Erinnerungen, 45 Story-Szenen,
  Tutorials, Bestiarium mit Angriffsdiagrammen und Erinnerungsbuch,
  3 Profile, Speichern an sicheren Punkten, Deutsch/Englisch.
- Die Grafiken im Spiel sind Zwischenlösungen aus den Konzeptkarten;
  die noch zu produzierenden Medien stehen in
  [docs/fehlende-produktionsmedien.md](docs/fehlende-produktionsmedien.md).
- Bewusste Auslegungen und Abweichungen mit IDs:
  [docs/abweichungen.md](docs/abweichungen.md).
- Alle Zahlwerte sind die verbindlichen Erstwerte der Pakete; Balance
  braucht Spieltests (Prüfberichte der Pakete).

## Tests

```bash
node tests/validate.mjs          # Daten- und Formelprüfungen
```

Für Durchlauftests existieren URL-Testwerkzeuge (`?zeitraffer=`,
`?unverwundbar=1`, `?testschaden=`), siehe docs/abweichungen.md;
ohne Parameter sind sie wirkungslos.
