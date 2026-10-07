# Helden von Schwebfels: Übergabe für neue Sitzungen

Diese Datei ist der Einstieg für jede neue Claude-Sitzung, die an diesem Spiel weiterarbeitet.
Das Spiel liegt im Repository `valentino-sole/firstmate` im Ordner `games/schwebfels`, Zweig `claude/epic-brown-eplnsc`.

## Wichtig zuerst

- Das Spiel ist ein eigenständiges Projekt in diesem Ordner. Die Regeln aus `AGENTS.md` im Wurzelverzeichnis (Firstmate, Flotte, Crewmates, Worktrees) betreffen die Firstmate-Werkzeuge, nicht dieses Spiel. Arbeite hier direkt: lesen, ändern, testen, bauen, committen, pushen, veröffentlichen.
- Auftraggeber ist der Kapitän (Spieler und Ideengeber, kein Programmierer). Er gibt Feedback aus dem Spielen; setze es vollständig um und berichte danach in einfachen Worten.

## Wie der Kapitän angesprochen werden will

- Immer auf Deutsch, Anrede „Kapitän“.
- Empathisch und lösungsorientiert. Für Recherche nur seriöse Quellen, Quellen am Ende verlinken.
- Ihn nicht in Entscheidungen bestätigen, die unklug sind; ehrlich sagen, was nicht geht, und eine bessere Lösung vorschlagen.
- Niemals Gedankenstriche (weder den langen noch den mittellangen Strich, Unicode U+2014 und U+2013), auch nicht in Code-Kommentaren, Texten im Spiel oder Doku.
- Nach jeder Runde: was neu ist, was geprüft wurde (Tests, Balance), offene Punkte, Link zum Spiel.

## Arbeitsablauf

```sh
cd games/schwebfels
node build.mjs                       # baut dist/schwebfels.html und dist/artifact.html
node --test tests/engine.test.mjs    # Spiellogik (muss grün sein)
node tests/balance.mjs               # Klassen, Aufträge, Bosse
node tests/progression.mjs all 30    # Spielverlauf bis Stufe 30
node tests/talents.mjs               # Talentbäume je Schwerpunkt
node tests/e2e.mjs screens           # Browser-Durchlauf mit Bildschirmfotos (Playwright, Chromium)
```

- Der Browser-Durchlauf braucht three.js und Schriften vom CDN. Kommt der Testbrowser nicht ans Netz, lädt man die Dateien einmal herunter und zeigt mit `CDN_CACHE=<map.json>` darauf (Format in `README.md`).
- Neue Spielinhalte immer mit Balance-Simulation prüfen; Ziel: Klassen im Mittel etwa 40 bis 60 % gegeneinander, Aufträge „ordentlich“ rund 90 %.
- Alte Spielstände müssen weiter laden (Speicherschlüssel `schwebfels:save:v1`, Übernahme in `E.migrate`); neue Felder dort mit Standardwerten ergänzen.

## Veröffentlichen

- Das spielbare Spiel ist das Artifact https://claude.ai/artifact/U5K2ssSxMJTZaAhu4wCDmC (privat, gehört dem Kapitän).
- Immer dieselbe Adresse aktualisieren: zuerst das Artifact lesen (`action: "read"` mit dieser `url`), dann `dist/artifact.html` mit derselben `url` veröffentlichen und ein kurzes `label` setzen (zum Beispiel „Version 5: …“). `capabilities` weglassen, dann bleiben die gespeicherten Rechte (Heldenprofile und Gilden in der Datenbank, Nutzer) erhalten.
- Danach committen und auf `claude/epic-brown-eplnsc` pushen. Commit-Nachrichten auf Deutsch, ohne Mitautor-Zeile für einen Agenten. Keinen Pull Request ohne ausdrückliche Bitte.

## Stand (Version 4)

- Version 1: Grundspiel nach dem Aufbau von Shakes & Fidget mit eigener Welt und 3D.
- Version 2: drei Reiche (Albion, Midgard, Hibernia) mit je vier Klassen, Chronik, Horden, Ranglisten, Gilden, Heim, Musik, Tag und Nacht.
- Version 3: eigene Heimatinsel je Reich, Leben auf der Insel, Mondtor bei Nacht, Reichsmusik, Monster je Reich, Arena mit vier passenden Gegnern, Gesichtstätowierungen.
- Version 4: Talentbäume je Klasse (angelehnt an Dark Age of Camelot), Meldungen erst nach dem Kampf, Attribut-Erklärungen, Glück verbessert die Beute.
- Aufbau des Codes: `README.md`. Spieldesign, Formeln und Balance: `DESIGN.md`.

## Laufend: Qualitätstest mit Bild-zu-3D (Version 5)

- Der Kapitän fand die selbst gebauten Figuren (Code aus Grundformen) zu nah an „Playmobil“, Männer zu weiblich, und es fehlen sechs der zwölf Völker im Spiel. Neuer Weg: Modelle aus seinen Konzeptbildern mit einem Bild-zu-3D-Dienst erzeugen, in Blender anpassen, ins Spiel einbauen.
- Vorgabe des Kapitäns: erst ein vollständig eingebauter Qualitätstest (Nordmann und deutlich anders proportionierter Kreidezwerg, passende Bestie, kleine überarbeitete Kampfumgebung; an einem Helden zwei einzeln wechselbare Brustpanzer sowie wechselbare Handschuhe, Stiefel, Helm und Waffe; geprüft im Stand, beim Laufen und beim Angriff; keine Haut durch die Kleidung; Gegenstandsbild passt zum angelegten Modell; echte Spielbilder neben den Konzeptvorlagen; Doku der Modelle, Nacharbeit und tatsächlich verbrauchten Credits).
- Bezahlte Erzeugung erst nach vereinbartem Testbudget. Übrige Klassen, Völker und Gegenstände erst, wenn der Test überzeugt.
- Erledigt: Technikcheck der ganzen Strecke mit einem freien Modell ohne Credits (siehe `assets-src/README.md`, Abschnitt „Erzeugte Figuren“); Ladefunktion im Spiel (`gen` in `src/r3d-human.js`, `assets/gen.pack` in `build.mjs` und `src/r3d-assets.js`).
- Offen: Testbudget und Zugangsschlüssel. Empfehlung an den Kapitän: Meshy Pro im Monatsabo (Schlüssel nur mit bezahltem Tarif, Abrufe zahlen aus den Tarif-Credits, je Schlüssel ein monatliches Credit-Limit, fehlgeschlagene Aufträge kostenlos, Credit-Protokoll je Auftrag). Alternative: Tripo mit Guthaben. Der Schlüssel gehört in die Umgebungseinstellungen als `MESHY_API_KEY` (oder `TRIPO_API_KEY`), nie in den Chat. Meshy hält Ergebnisse nur 3 Tage vor: sofort herunterladen.
- Beschluss mit dem Kapitän (7. Oktober 2026): Meshy Premium (3.000 Credits im Monat, Schlüssel mit Monatslimit 3.000 als `MESHY_API_KEY`). Reihenfolge: (1) Midgard-Helden, je Frau und Mann für Nordmann, Trollblut, Frostwicht, Glutzwerg, plus Qualitätstest (Wechselausrüstung an einer Heldin, Wolf aus Tafel 19, kleine verschneite Kampfumgebung), etwa 1.000 Credits; (2) erst wenn der Kapitän das abnimmt: Insel Hrimholm (16 Gebäude inklusive Heim in 4 Stufen, Frostgipfel, großer Runenstein, Inselschmuck, Greif), etwa 2.000 Credits, vorher Vorlagenbilder der Gebäude zum Absegnen. Monats-Credits verfallen am Monatsersten: im laufenden Monat erzeugen. Modelle wegen der 16-MB-Grenze als nachladbare Dateien je Reich auslagern. Der Kapitän hat die Nordmann-Frau bereits in der Meshy-Web-App erzeugt (Vorlage aus Tafel 02) und lädt sie als GLB hoch. Neue Völker Frostwicht und Glutzwerg: Attributboni dem Kapitän zur Entscheidung vorschlagen. Verbrauchte Credits je Auftrag dokumentieren.
- Werkzeuge in einer neuen Sitzung: `python3 -m venv <ordner> && <ordner>/bin/pip install bpy==5.2.2 pillow scipy`.
- Das Konzeptpaket des Kapitäns (zwei Zip-Dateien „Schwebfels-Claude-Teil-1/2“) liegt nicht im Repository; in einer neuen Sitzung bitte erneut hochladen lassen. Testvorlagen: Tafel 02 (Nordmann, Frau), Tafel 01 (Kreidezwerg, Mann), Tafel 10 (Krieger in fünf Seltenheiten), Tafel 14 (Kriegerwaffen), Tafel 19 (Wolf), Midgard-Designkonzept (Umgebung).

## Offene Punkte

- Grafik der Figuren: Der Kapitän findet sie zu sehr „Playmobil“ und bringt ein eigenes Konzept. Bis dahin die Figurenform nicht grundlegend umbauen, danach nach seinem Konzept.
- Das Dokument „Spieldesign“ im Google-Drive-Ordner „Helden von Schwebfels (Claude-Projekt)“ zeigt noch Version 3; `DESIGN.md` ist aktuell.
- Feedback des Kapitäns sammelt er im Drive-Dokument „Feedback und Ideen“ im selben Ordner; bei Bedarf dort nachlesen.
