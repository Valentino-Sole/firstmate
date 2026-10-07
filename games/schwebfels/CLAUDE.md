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
- Entscheidung des Kapitäns (Oktober 2026): Dienst ist **Meshy** (statt Tripo), Modelle mit Meshy-Skelett und Meshy-Bewegungen. Spiellogik, Lichtsetzung und Render-Einstellungen bleiben unverändert.
- Erledigt (Meshy-Strecke, siehe `assets-src/README.md`, Abschnitt „Erzeugte Figuren“):
  - `assets-src/gen/meshy_api.py` bestellt Figur, Rigging und Bewegungen mit Budgetgrenze und Credit-Protokoll.
  - `assets-src/gen/meshy.py` bringt geriggte GLBs samt Bewegungen ins Spielformat (T-Haltung, Skelett ohne Ruhedrehungen, gemeinsame Bewegungen für alle Figuren, Schlagmarken, Haltepunkte).
  - `src/r3d-rigged.js` spielt die Bewegungen im Spiel ab (AnimationMixer), wählt je Kampfstil und Waffe einen Clip und legt den Schlag genau auf das Ende der Spieldauer; Waffen, Schild und Helm hängen an den Meshy-Knochen.
  - Modellpakete werden mit gzip eingebettet (Seite 8,9 MB auf 6,7 MB).
  - Rüstungsteile (`assets-src/gen/fit_piece.py`): ein einzeln erzeugtes Teil wird einmal an einen Referenzkörper angepasst und knochenbezogen gespeichert; im Spiel legt es sich über Querschnittsprofile an jeden Körper mit Meshy-Skelett an (schlank oder breit), die Haut darunter wird ausgeblendet. Getragen wird das Teil, dessen Form oder Grundart zum angelegten Gegenstand passt; ein Helm als Teil ersetzt den gebauten Helm.
  - Gegenstandsbilder: Gegenstände mit eigenem 3D-Teil zeigen im Inventar ein Bild des Teils selbst (passt zum angelegten Modell).
  - Bestien (`assets-src/beasts/from_glb.py`): Tier aus einer GLB bekommt ein Vierbeiner-Skelett mit den Rollen des Bestiensystems und bewegt sich wie die übrigen Bestien, mit eigener Textur; `--archs` wählt die Monsterarten.
  - Werkstatt (`assets-src/gen/werkstatt.py`): Figur, Rüstungsteil oder Bestie in einem Befehl bestellen, umrechnen, ins Paket legen und eine Spielvorschau bauen.
  - Geprüft mit freien Testmodellen aus dem three.js- und Khronos-Repository (nicht im Spiel): Umrechnung exakt (unter 1 mm), Bewegungen eines Modells laufen auf anderen, Rüstungsteile auf zwei sehr verschiedenen Körpern, Bestie im Kampf, Insel und Browser-Durchlauf ohne Fehler. `tests/rigged.mjs` prüft das alles mit einer eigenen Prüffigur ohne fremde Modelle.
- Echtes Meshy-Skelett (aus Meshys Bibliotheksvorschau): 24 Knochen ohne Finger, alle ohne Ruhedrehung in T-Haltung. Bewegungen deshalb nur einmal kaufen (20 Stück, 60 Credits) und mit allen Figuren teilen.
- Offen: Testbudget und Zugangsschlüssel. Der Schlüssel gehört in die Umgebungseinstellungen als `MESHY_API_KEY`, nie in den Chat. Die Meshy-API braucht einen bezahlten Plan; Modelle gehören dann dem Kapitän (Gratis-Plan: CC BY 4.0 mit Nennung).
- Offen: Feinabstimmung mit den ersten echten Meshy-Modellen: Lage der Waffe in der Hand bei Meshy-Schlägen (`RG.GRIP` in `src/r3d-rigged.js`), Schlagmarken einzelner Clips (`RG.MARKS`), Ausrichtung einzeln erzeugter Rüstungsteile (Handschuhe richten sich selbst aus, sonst `--rot` oder `--flip`), Form der Bestie. Meshy liefert Figuren mit Kleidung aus einem Guss; für wechselbare Brustpanzer eine Figur in schlichter Grundkleidung erzeugen und die Panzer als eigene Teile.
- Prüfen nach jeder Änderung an Figuren: `node tests/rigged.mjs` (zusätzlich zu den übrigen Tests).
- Werkzeuge in einer neuen Sitzung: `python3 -m venv <ordner> && <ordner>/bin/pip install bpy==5.2.2 pillow scipy`.
- Das Konzeptpaket des Kapitäns (zwei Zip-Dateien „Schwebfels-Claude-Teil-1/2“) liegt nicht im Repository; in einer neuen Sitzung bitte erneut hochladen lassen. Testvorlagen: Tafel 02 (Nordmann, Frau), Tafel 01 (Kreidezwerg, Mann), Tafel 10 (Krieger in fünf Seltenheiten), Tafel 14 (Kriegerwaffen), Tafel 19 (Wolf), Midgard-Designkonzept (Umgebung).

## Offene Punkte

- Grafik der Figuren: Der Kapitän findet sie zu sehr „Playmobil“ und bringt ein eigenes Konzept. Bis dahin die Figurenform nicht grundlegend umbauen, danach nach seinem Konzept.
- Das Dokument „Spieldesign“ im Google-Drive-Ordner „Helden von Schwebfels (Claude-Projekt)“ zeigt noch Version 3; `DESIGN.md` ist aktuell.
- Feedback des Kapitäns sammelt er im Drive-Dokument „Feedback und Ideen“ im selben Ordner; bei Bedarf dort nachlesen.
