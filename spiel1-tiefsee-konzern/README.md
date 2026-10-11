# Tiefsee Konzern

Idle-/Incremental-Spiel (Arbeitstitel), Spiel 1 des Zwei-Stufen-Plans.
Engine: Godot 4.3, reine GDScript-Codebasis, UI wird im Code aufgebaut.

## Spielkern

Perlen abbauen, sechs Generator-Stufen vom Handtaucher bis zum Abyss-Portal kaufen,
ab 1 Mrd Perlen pro Runde per Neustart dauerhafte Abyss-Punkte verdienen
(+2 % Produktion pro Punkt). Offline-Fortschritt mit halber Rate, gedeckelt auf 8 Stunden.

## Struktur

- `src/economy.gd` - reine Spiellogik (Kosten, Produktion, Offline, Prestige), ohne UI
- `src/save_manager.gd` - JSON-Spielstand unter `user://`, Offline-Gutschrift beim Laden
- `src/i18n.gd` - Texte und Zahlenformat in DE/EN
- `src/game.gd` + `main.tscn` - Oberfläche und Spielschleife
- `tests/test_economy.gd` - Headless-Tests inkl. Kurven-Prüfung

## Starten

Projekt in Godot 4.3+ öffnen und ausführen, oder:

```sh
godot --path .
```

## Tests

```sh
godot --headless --path . --script res://tests/test_economy.gd
```

Exit-Code 0 bedeutet: alle Checks bestanden.
