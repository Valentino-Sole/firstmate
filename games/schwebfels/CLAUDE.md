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
- Erledigt: Technikcheck der ganzen Strecke mit einem freien Modell ohne Credits (siehe `assets-src/README.md`, Abschnitt „Erzeugte Figuren“); Ladefunktion im Spiel (`gen` in `src/r3d-human.js`; `assets/gen-<reich>.pack` wird von `build.mjs` zu `dist/gen-<reich>.js`, das `SB.assets.loadGen(reich)` in `src/r3d-assets.js` erst bei Bedarf nachlädt).
- Figurenprobe: Einstellungen, „Figurenprobe Midgard öffnen“ zeigt die acht Midgard-Helden zum Drehen, mit Stand, Laufen, Angriff, Jubel, Axt an oder aus und Nahansicht (`P.figurenprobe` in `src/ui-panels.js`). Beim Veröffentlichen `dist/gen-midgard.js` als Zusatzdatei `gen-midgard.js` mitgeben (`files`), sonst meldet die Probe, dass die Daten fehlen. `assets/gen-*.pack` und `dist/gen-*.js` stehen bis zur Abnahme in `.gitignore`.
- Einstellung „Neue Figuren im Spiel“ (`S.settings.genFigures`, fehlt = an): Bei Midgard-Helden lädt `main.js` die Figurendatei beim Start im Hintergrund, `HU.preloadGen` dekodiert die Hautbilder, danach setzen `UI.heroDesc` und `UI.fighterDesc` für Nordmann und Trollblut `gen` (Charakter, Insel, Kämpfe, Arena, Portraits). Auf den neuen Körpern wirken bisher nur Waffe und Schild, nicht Rüstung, Helm, Umhang und Aussehen (Tätowierung, Haarfarbe); das kommt mit der Wechselausrüstung.
- Meshy-Grundlagen: Schlüssel nur mit bezahltem Tarif; Abrufe verbrauchen laut Doku die Tarif-Credits (beim ersten Abruf mit `meshy.py balance` bestätigen); je Schlüssel ein monatliches Credit-Limit; fehlgeschlagene Aufträge kostenlos; jede Antwort enthält `consumed_credits`; Ergebnisse nur 3 Tage vorgehalten, daher sofort herunterladen. Der Schlüssel nie in Chat oder Repository.
- Beschluss mit dem Kapitän (7. Oktober 2026): Meshy Premium (3.000 Credits im Monat, Schlüssel mit Monatslimit 3.000 als `MESHY_API_KEY`). Reihenfolge: (1) Midgard-Helden, je Frau und Mann für Nordmann, Trollblut, Frostwicht, Glutzwerg, plus Qualitätstest (Wechselausrüstung an einer Heldin, Wolf aus Tafel 19, kleine verschneite Kampfumgebung), etwa 1.000 Credits; (2) erst wenn der Kapitän das abnimmt: Insel Hrimholm (16 Gebäude inklusive Heim in 4 Stufen, Frostgipfel, großer Runenstein, Inselschmuck, Greif), etwa 2.000 Credits, vorher Vorlagenbilder der Gebäude zum Absegnen. Monats-Credits verfallen am Monatsersten: im laufenden Monat erzeugen. Modelle wegen der 16-MB-Grenze als nachladbare Dateien je Reich auslagern. Der Kapitän hat die Nordmann-Frau bereits in der Meshy-Web-App erzeugt (Vorlage aus Tafel 02) und lädt sie als GLB hoch. Neue Völker Frostwicht und Glutzwerg: Attributboni dem Kapitän zur Entscheidung vorschlagen. Verbrauchte Credits je Auftrag dokumentieren.
- Einstieg für die nächste Sitzung: `assets-src/gen/PLAN-MIDGARD.md` Schritt für Schritt abarbeiten (Vorlagen, Meshy-Aufträge mit Credit-Protokoll, Einbau mit `build_figure.py`, Abnahme). Vorbereitet und geprüft: `meshy.py` (Weg zu Meshy steht, Testaufruf mit falschem Schlüssel ergibt korrekt 401), `build_figure.py` (mit einer Mixamo-Übungsfigur geprüft: alle 29 Knochen zugeordnet, Stand, Laufen, Angriff, Waffe im Griff).
- Stand 7. Oktober 2026: Alle acht Midgard-Körper (Nordmann, Trollblut, Frostwicht, Glutzwerg, je Frau und Mann) sind erzeugt, mit Skelett versehen und im Spiel geprüft (Stand, Laufen, Angriff, Waffe in der Faust). Verbraucht: 313 Credits (Vorlagen 33, Bild zu 3D 8 × 30, Skelett 8 × 5). Strecke je Körper: `meshy.py img23d` (A-Haltung) → `bake_lowpoly.py` (30.000 Flächen, Textur aufgebacken) → `meshy.py rig` mit der GLB → `build_figure.py` (Höhe Frostwicht 1,62/1,70, Glutzwerg 1,46/1,52) → `gen_pack.py`. Rohdaten liegen nur in der Sitzung (Meshy hält sie 3 Tage); `assets/gen-midgard.pack` (gut 10 MB, als `dist/gen-midgard.js` knapp 14 MB) erst nach Abnahme ins Repository.
- Waffengriff: Der Kapitän fragte, ob man die Modelle besser gleich mit Waffe erzeugt. Nein: Waffen müssen wechselbar sein, eine eingebackene Waffe verbiegt sich mit der Hand, und die automatische Skelettierung braucht Figuren mit klar getrennten Gliedmaßen. Stattdessen schließt `build_figure.py` die Hand zur Faust (siehe `assets-src/README.md`). Behoben: schwarze Flecken an Händen und Gelenken (neu gebacken mit `bake_lowpoly.py --low`, Texturen in der Sitzung unter `meshy-out/neu`). Offen: Hautton etwas heller als im Konzept; Waffe noch die alte Axt.
- Wechselausrüstung, geänderter Weg (günstiger und passgenauer als einzeln freigestellte Teile): die Nordmann-Frau per Bild zu Bild in voller Rüstung erzeugen (normal nach Tafel 10, grün nach Tafel 11, je 9 Credits, beide Vorlagen am 7. Oktober erzeugt und dem Kapitän gezeigt; Stand damit 331 Credits), dann je Rüstung Bild zu 3D in A-Haltung und Skelett, in Blender nach Körperbereichen in Brust, Handschuhe und Stiefel zerlegen und auf den Grundkörper übertragen. Helm und Schwert als starre Einzelteile. Erst nach Freigabe der Vorlagen durch den Kapitän in 3D.
- Nächste Schritte nach `PLAN-MIDGARD.md`: Schritt 3 (Wechselausrüstung wie oben), Schritt 4 (Wolf, Umgebung), Schritt 5 (Einbau, Vergleichsseite). Frostwicht und Glutzwerg im Spiel wählbar machen (Attributboni dem Kapitän vorschlagen).
- Zugang: Der Kapitän hat `MESHY_API_KEY` in den Umgebungseinstellungen hinterlegt (erst ab einer neuen Sitzung sichtbar). Zuerst kostenlos prüfen: `GET https://api.meshy.ai/openapi/v1/balance` mit `Authorization: Bearer $MESHY_API_KEY` zeigt den Stand; den Schlüssel nie ausgeben. Vorlagen aus den Tafeln schneidet `assets-src/gen/crop_templates.py`.
- Werkzeuge in einer neuen Sitzung: `python3 -m venv <ordner> && <ordner>/bin/pip install bpy==5.2.2 pillow scipy`.
- Das Konzeptpaket des Kapitäns (zwei Zip-Dateien „Schwebfels-Claude-Teil-1/2“) liegt nicht im Repository; in einer neuen Sitzung bitte erneut hochladen lassen. Testvorlagen: Tafel 02 (Nordmann, Frau), Tafel 01 (Kreidezwerg, Mann), Tafel 10 (Krieger in fünf Seltenheiten), Tafel 14 (Kriegerwaffen), Tafel 19 (Wolf), Midgard-Designkonzept (Umgebung).

## Klang (Version 5)

- Wunsch des Kapitäns (10. Oktober 2026): Magie soll wie Magie klingen, ein Pfeil wie ein Pfeil, Kämpfe authentisch, der Drache brüllt, jedes Volk und jeder Gegnertyp hat eigene Laute. Freie Aufnahmen hat er erlaubt; erst wenn die Stimmen nicht überzeugen, ElevenLabs (Starter 6 Dollar im Monat) vorschlagen.
- Umgesetzt: Klangbank aus CC0-Sammlungen (`assets-src/klang/QUELLEN.md`, Bau mit `build_klang.py`, Ergebnis `assets/klang.pack`, eingebettet). Zuordnung in `src/audio.js` (Tabellen `WAFFE`, `GEGNER`, `RUESTUNG`, `SCHULE`, `VOLK`), Kampf ruft `opts.sfx(name, { a, d, side, how })` in `src/r3d-scenes.js`. Klangprobe: Einstellungen, „Klangprobe öffnen“ (`P.klangprobe`). Ich kann Klänge nicht hören: Auswahl nach Messwerten und Klangbildern, das Urteil fällt der Kapitän in der Klangprobe.
- Offen: Lautstärken je Klang nach Rückmeldung des Kapitäns feinstellen; Hintergrundgeräusche je Ort (Stufe 3); Musik ist weiter erzeugt.

## Offene Punkte

- Grafik der Figuren: Der Kapitän findet sie zu sehr „Playmobil“ und bringt ein eigenes Konzept. Bis dahin die Figurenform nicht grundlegend umbauen, danach nach seinem Konzept.
- Das Dokument „Spieldesign“ im Google-Drive-Ordner „Helden von Schwebfels (Claude-Projekt)“ zeigt noch Version 3; `DESIGN.md` ist aktuell.
- Feedback des Kapitäns sammelt er im Drive-Dokument „Feedback und Ideen“ im selben Ordner; bei Bedarf dort nachlesen.
