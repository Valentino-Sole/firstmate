# Genre-Recherche: Arena-Survivor / Horde-Roguelite

Stand: 2026-10-12. Grundlage für die Umsetzung von Fabelbruch; das Designpaket v0.4
deckt die meisten Erkenntnisse bereits ab, diese Datei dokumentiert das "Warum".

## Untersuchte Spiele

Brotato, Pickle Pete, Vampire Survivors, 20 Minutes Till Dawn, Halls of Torment,
Survivor.io, Rogue Genesia, Nordic Ashes, Entropy Survivors, Asgard's Fall.

## Was die erfolgreichen Spiele tragen

### 1. Kurze Wellen, viele Entscheidungsmomente (Brotato-Modell)
Brotato teilt den Lauf in ca. 20 kurze Wellen (20 bis 60 Sekunden) mit Laden
nach jeder Welle. Jede Welle ist ein eigener Spannungsbogen, jeder Ladenbesuch
eine Bauplan-Entscheidung. Das erzeugt deutlich mehr bewusste Entscheidungen pro
Stunde als das 30-Minuten-Dauerformat von Vampire Survivors.
Fabelbruch folgt diesem Modell (20 Wellen, 32 bis 60 Sekunden, Laden nach jeder Welle).

### 2. Mehrschichtige Belohnungen (Vampire-Survivors-Modell)
Analysen (u.a. Universität Portsmouth) führen den Sog von Vampire Survivors auf
geschichtete Belohnungen zurück: Beute im Lauf, Dauerwährung zwischen Läufen,
sichtbare Freischalt-Checklisten, dazu ein Wechsel aus dominanten Phasen und
Druckspitzen. Sichtbare Freischaltziele (statt versteckter Bedingungen) sind ein
nachweisbarer Bindungsfaktor.
Fabelbruch: Wachssplitter (Lauf), Erinnerungen (dauerhaft), Werkstatt,
Bezirksfreischaltung, Signaturwaffen nach Bosssiegen, Bestiarium mit
Entdeckungsstatus; Freischaltbedingungen werden in der Bezirkskarte offen angezeigt.

### 3. Stetige, frühe Freischaltungen
Game-Wisdom-Analyse zu Vampire Survivors: nicht die Materialmenge bindet, sondern
der stetige Takt an Neuem; Spiele, deren erste Freischaltung mehrere Siege
erfordert, verlieren Spieler früh. Fabelbruch: schon der erste Bosssieg schaltet
einen neuen Bezirk, eine Signaturwaffe als Startwaffe und Werkstattfortschritt frei.

### 4. Metaprogression stärkt, ohne zu trivialisieren (Pickle-Pete-Warnung)
Häufigste Kritik an Pickle Pete: so starke Dauerboni, dass Läufe übermächtig
beginnen und Entscheidungen im Lauf entwertet werden. Die Werkstatt im
Designpaket ist bewusst moderat (maximal +25 Startleben, +15 Bewegung, ein
Gratis-Neuwurf) - das ist die richtige Dosis.

### 5. Lesbarkeit bei hoher Dichte (häufigste Spielerkritik im Genre)
Steam-Review-Auswertungen zeigen als Hauptbeschwerden: visuelles Chaos im
Spätspiel, ununterscheidbare Projektile, Einbrüche der Bildrate, schwaches
Trefferfeedback. Das Designpaket adressiert genau das (Gefahrenkonturen vor
Bodendekor, Partikelbudget, Warnfarbe einheitlich Koralle, Lesbarkeitsabnahme
bei 50 Gegnern als Abnahmekriterium); die Umsetzung hält diese Regeln ein und
begrenzt Partikel hart.

### 6. Bau-Vielfalt gegen Einheitsmeta
Kritikmuster (20 Minutes Till Dawn, Rogue Genesia): wenige dominante Builds,
viele nutzlose Optionen. Gegenmittel im Rahmen des Pakets: 10 Waffenfamilien mit
unterschiedlicher Geometrie (Sektor, Linie, Projektil, Kreis, Orbit, Schild),
Stufenfusion I bis V, Relikt-Stapelgrenzen, globale Deckel (Kritchance 60 %,
Rüstung 20). Balance bleibt laut Paket ausdrücklich testpflichtig.

### 7. Festes Gefahrenvokabular
Halls of Torment und 20 Minutes Till Dawn zeigen den Wert klar telegraphierter
Angriffe (Vorbereitung, aktive Phase, sichere Lücken). Das Designpaket macht das
zur Kernregel (gestrichelte Warnung = kein Schaden, solide Fläche = Schaden,
Lücken bleiben frei) - das ist zugleich die größte Abgrenzung von der reinen
Masse-Überwältigung bei Vampire Survivors.

### 8. Was Fabelbruch bewusst anders macht als die Bekannten
- Handgebaute Bosse mit Phasenplänen statt Statuswände; Arena-Gefahren pausieren im Bosskampf.
- Erzählung mit auslösbaren Szenen und Erinnerungsbuch; das Genre ist fast durchweg erzählfrei.
- Festgelegte Wellen-Spawnpläne pro Bezirk statt Zufallsfluten: Bezirke bleiben wiedererkennbar.
- Eigene Welt (Fehlwünsche, Materialfamilien) statt Pixel-Grusel- oder Gemüse-Parodie.

## Bewusst NICHT übernommen (Mobile-Praktiken)

Energie-Systeme, Gacha-Ausrüstung, Season-Pass-Druck (Survivor.io, teils Pickle
Pete): binden über Druck statt Spielfreude und widersprechen einem Premium-Spiel.
Ausrüstungs-Fusion als Spielmechanik dagegen ist übernommen, aber als kostenlose
Waffenfusion im Lauf (Brotato-Modell), nicht als Dauergrind.

## Quellen

- https://adrianhon.substack.com/p/brotato und https://mssv.net/2023/08/29/brotato/ (Brotato-Designanalyse)
- https://brotato.wiki.spellsandguns.com/Waves (Brotato Wellenstruktur)
- https://researchportal.port.ac.uk/en/publications/vampire-survivors-how-developers-used-gambling-psychology-to-crea/ (Portsmouth-Analyse Belohnungsschichten)
- https://game-wisdom.com/critical/success-vampire-survivors (stetige Freischaltungen)
- https://loopandledger.beehiiv.com/p/the-overlooked-but-humble-magic-sauce-of-vampire-survivors (sichtbare Freischaltziele)
- https://www.pocketgamer.com/pickle-pete/review/ und https://vaporlens.app/app/3963030/pickle_pete (Pickle Pete Stärken/Kritik)
- https://www.pushsquare.com/reviews/ps5/halls-of-torment (Halls of Torment Struktur/Meta)
- https://vaporlens.app/app/1966900/20_minutes_till_dawn, https://vaporlens.app/app/2602030/entropy_survivors, https://vaporlens.app/app/2067920/rogue_genesia.md (Review-Auswertungen: Clutter, Build-Meta, Endgame)
