# Abweichungen und Auslegungen (mit betroffenen IDs)

Stand: 2026-10-12. Jede bewusste Abweichung von den Fachdateien und jede
Auslegung einer mehrdeutigen Stelle, wie vom Auftrag (Punkt 10) verlangt.

## Kapitänsanweisungen (aktueller, ausdrücklicher Auftrag)

1. **Vergrößerte Arenen mit Kamera** (Anweisung vom 2026-10-12:
   "arenen so wie sie sind aber größer, weil man viel laufen muss").
   arenen.json legt eigentlich fest: feste Arena vollständig sichtbar,
   1600×900. Umsetzung: alle Layoutmaße jeder Arena (Spielfläche,
   Hindernisse, Gefahrenzonen, Spawnpunkte, Startpositionen) werden
   einheitlich mit Faktor 1,75 skaliert (ARENA_SCALE in js/data.js);
   Figuren, Reichweiten, Tempi und Zeiten bleiben in Originaleinheiten.
   Eine Kamera (1600×900-Ausschnitt) folgt Knorz. Die Gestaltung der
   Arenen ist unverändert, nur vergrößert. Betroffen: AR01–AR10
   (alle Felder), spielablauf.json spawn_rule.edge_points.
2. **Engine-Entscheidung**: Das Paket legt keine Engine fest ("keine
   Engine-Auswahl"). Gewählt: Browserspiel ohne Fremdabhängigkeiten
   (HTML5 Canvas + natives JavaScript-Modulsystem), damit das Spiel ohne
   Installation auf PC spielbar ist und Maus/Tastatur/Controller über
   Web-APIs abgedeckt sind. Rückfrage beim Kapitän steht aus; Wechsel auf
   eine andere Engine wäre eine Neuumsetzung der Darstellungsschicht,
   die Fachdaten bleiben unverändert nutzbar.

## Auslegungen mehrdeutiger Stellen (Monster)

- **M003/M066 (Ringwelle)**: Die Fachdaten der Monster nennen keine
  safe_gap_degrees; die Ausweichregel nennt eine "stets markierte
  70°-Lücke". Umsetzung wie bei den Boss-Ringen: 70°-Lücke, auf die beim
  Vorbereitungsbeginn fixierte Spielerposition gerichtet.
- **M005/M025/M094 (guard, Frontpanzer)**: Kein Zahlenwert geliefert.
  Auslegung: Schaden aus dem frontalen Sektor (cone_angle_degrees, 90°)
  wird halbiert; Rücken voll verwundbar ("Hinter die sichtbare
  Frontplatte gelangen").
- **M048 (guard_shot)**: "Während der offenen Schussphase angreifen":
  volle Verwundbarkeit in Vorbereitung/Aktivphase, sonst halber Schaden.
- **M009/M029/M069/M089 (shield)**: shield_reduction 0,5 wird als
  anteilige Reduktion (50 %) auf Verbündete im Radius angewandt, solange
  der Schirm aktiv ist (Aktivphase plus ein kurzes Nachwirken von 1 s,
  damit der Schirm zwischen zwei Aktivierungen nicht flackert).
- **M021 (zigzag)**: Zickzack wird als Bewegungsstil umgesetzt (pendelnde
  Annäherung); der Angriff selbst ist der angegebene 75°-Sektor.
- **M030 (lure)**: Köderanzeige als Kreis mit gezacktem Beutesymbol;
  der Biss ist die angegebene 50er-Scheibe am Monster.
- **M037 (loot)**: Eingesammelte Beute wird beim Tod vollständig und
  unverändert fallen gelassen.
- **M038/M067/M085 (trail)**: Die Spur entsteht als Linienfeld entlang
  der fixierten Richtung; Lebensdauer = active_seconds, mindestens 1,6 s,
  damit die Spur spielbar bleibt (Warnung lief über die Vorbereitung).
- **slow_factor**: ausgelegt als Verlangsamungsanteil
  (Geschwindigkeit × (1 − slow_factor)); slow_factor 1 (Sperrzonen
  M050/B05_P3_A1) bedeutet Stillstand im Feld. Deckt sich mit der
  Boss-Ersatzregel "Wurzel → Slow" der Ergänzung v0.4.2.
- **new_spawn_safety_seconds (Arenagefahr)**: ausgelegt als Schonfrist
  nach Wellenbeginn, in der die Gefahr den Helden nicht trifft.
- **Bewegungsstile**: Fernkämpfer (trigger_range ≥ 240) halten Abstand,
  Unterstützer (shield/buff/pull mit großem Auslösebereich) halten 240
  Einheiten, Sammler (M037) laufen Beute an, Turm (M018) steht. Alle
  übrigen verfolgen; Flanker nähern sich seitlich versetzt.

## Auslegungen (Bosse)

- **B01_P3_A1/A2**: "zweiter Ring erhält +90° Drehung" - umgesetzt über
  safe_gap_rotation_degrees; beide Warnungen nacheinander, nie gleichzeitig
  (Aktionsfolge der Phase).
- **B08_P2_A1 (rewind)**: Der Boss läuft seine aufgezeichnete Spur
  rückwärts ab; Schaden einmal bei Körperkontakt während des Rücklaufs.
- **B02_P3_A1 (trail)/B05_P2_A1 (polyline)**: Linien-/Polylinienfelder
  nach denselben Regeln wie Monsterfelder.
- **Boss-Pause**: Sequenzregel "nach jeder Aktion 1,0 s Erholung, danach
  0,6 s Pause" - die Erholung ist recovery_seconds der Aktion, danach
  feste 0,6 s Pause; während der Pause langsame Annäherung (move_speed).

## Auslegungen (System)

- **Trefffenster des Helden**: Nach einem Treffer ist Knorz 0,35 s
  geschützt. Die Fachdateien begrenzen Treffer pro Angriff (1), aber bei
  Projektilringen (14 Projektile) wäre Hineinlaufen sonst sofort tödlich.
  Reine Glättung; zur Balanceprüfung vorgemerkt.
- **Kritische Treffer**: Krit-Wurf pro Haupttreffer (nicht pro
  Aktivierung); nur Haupttreffer können kritisch sein (v0.4.2-Regel).
- **Schadenszahlen**: Es werden keine schwebenden Schadenszahlen
  angezeigt; das Paket sieht keine vor (Trefferfeedback über kurzen
  Helligkeitswechsel und Materialpartikel laut Asset-Vertrag).
- **Buff-Dauer (M059/M079/M097)**: buff gilt während der Aktivphase und
  1 s darüber hinaus (nicht stapelnd, Zeiten werden verlängert).
- **E006/E020-Felder und Gegnerstatus**: Feldanwesenheit wird als
  Kurzzeitquelle (0,1 s, laufend erneuert) in die Maximumauswahl der
  Slow-/Schwächequellen eingespeist; beim Verlassen endet die Wirkung
  sofort, wie gefordert.
- **Speicherumfang der Effekte**: Sichere Punkte liegen an Wellen-/Laden-/
  Aufstiegsgrenzen; dort sind laut Lebenszyklusregel alle Effekte entfernt
  und Zähler zurückgesetzt. Instanzzähler werden deshalb nicht in den
  Speicherstand geschrieben (sie sind an jedem sicheren Punkt 0).
- **Erinnerungsbuch**: Kein eigener Bildschirm unter den 26 Vorlagen;
  untergebracht im Bestiarium (Fleck verwaltet laut Story "Erinnerungen
  und Bestiarium"), Text-ID ui.dialog_log.
- **Fehlende Text-IDs**: Hilfe-Titel (UI15), Randpuls-Schalter und
  Sprachauswahl haben keine IDs in spieltexte.de.json; Beschriftungen
  sind als Übergang direkt gesetzt und hier ausgewiesen.
- **Profil-Löschbestätigung**: UI02 verlangt namentliche Bestätigung;
  als Name gilt "Profil N" (ui.profile).
- **Beenden (ui.quit)**: Im Browser kann sich das Fenster nur selbst
  schließen, wenn es per Skript geöffnet wurde; sonst wird gespeichert
  und die Meldung "Gespeichert" gezeigt.
- **UI19-Beispielpreis**: Der in der UI-Vorlage genannte Betrag "45" ist
  laut Paketregel eine Beispielzahl; es gilt der echte Angebotspreis.

## Wachskarten (Stilreferenz v0.4.3)

- Rahmenfarben: Die Referenz zeigt nur Seltenheit I (gedämpftes
  Siegelwachsrot) und eine seltene Karte (Grünpetrol). Umsetzung: Stufe I
  rot, Stufe II und höher grünpetrol; keine frei erfundenen weiteren
  Farbstufen (Vorgabe der Ergänzung).
- Kartentexte: "Es fehlen {amount}." und "Angebot lösen" stammen wörtlich
  aus der Ergänzung v0.4.3 (data/wachskarten-texte.json); die englischen
  Fassungen sind Claude-Übersetzungen zur Freigabe.
- Die kurze Wirkungszeile auf der Karte ist die Rollenzeile der Fähigkeit
  (waffeneffekte.de.json); die vollständige Regel steht im Tooltip/Detail,
  wie von der Ergänzung verlangt.
- Abgeleitete Symbole nach den gemalten Stilreferenzen: gem-rot.svg
  (rote Währungsvariante des vorhandenen gem.svg), schloss.svg und
  wuerfel.svg (geometrische Ableitungen der in shop-stil.png gemalten
  Zeichen). Als Ableitungen im Dateititel gekennzeichnet.

## Testwerkzeuge (nur über URL-Parameter, ohne Parameter wirkungslos)

- `?zeitraffer=N` beschleunigt die Kampfzeit (Tests ganzer Läufe).
- `?unverwundbar=1` hält Knorz am Leben (Durchlauftests).
- `?testschaden=N` vervielfacht Heldenschaden (Bossablauf-Tests).
