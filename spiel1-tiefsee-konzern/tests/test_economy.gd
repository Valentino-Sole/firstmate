extends SceneTree

## Headless-Tests für die Spiellogik und das Speichersystem.
## Ausführen aus dem Projektordner:
##   godot --headless --path . --script res://tests/test_economy.gd

const EconomyScript := preload("res://src/economy.gd")
const SaveManagerScript := preload("res://src/save_manager.gd")

var fails := 0
var checks := 0


func check(condition: bool, name: String) -> void:
	checks += 1
	if condition:
		print("PASS  " + name)
	else:
		fails += 1
		printerr("FAIL  " + name)


func approx(a: float, b: float, eps: float = 0.0001) -> bool:
	return abs(a - b) <= eps * max(1.0, abs(b))


func _init() -> void:
	_test_costs()
	_test_buy()
	_test_production_and_multiplier()
	_test_depth_levels()
	_test_depth_rules()
	_test_upgrades()
	_test_offline()
	_test_prestige()
	_test_dict_roundtrip()
	_test_save_file_roundtrip()
	_test_progression_curve()
	_test_long_session_depth()
	if checks == 0:
		fails += 1
		printerr("FAIL  Keine Checks gelaufen (Kompilierfehler?)")
	print("---")
	print("%d Checks, %d Fehler" % [checks, fails])
	quit(1 if fails > 0 else 0)


func _test_costs() -> void:
	var eco = EconomyScript.new()
	check(approx(eco.generator_cost(0), 15.0), "Startkosten Handtaucher = 15")
	eco.owned[0] = 10
	check(approx(eco.generator_cost(0), 15.0 * pow(1.15, 10)), "Kostenkurve waechst mit 1.15^n")
	check(eco.generator_cost(5) > eco.generator_cost(0), "Spaete Generatoren teurer als fruehe")


func _test_buy() -> void:
	var eco = EconomyScript.new()
	check(not eco.buy(0), "Kauf ohne Perlen schlaegt fehl")
	eco.pearls = 20.0
	check(eco.buy(0), "Kauf mit genug Perlen klappt")
	check(eco.owned[0] == 1, "Kauf erhoeht Besitz")
	check(approx(eco.pearls, 5.0), "Kauf zieht Kosten ab")


func _test_production_and_multiplier() -> void:
	var eco = EconomyScript.new()
	eco.owned[0] = 2
	check(approx(eco.production_per_second(), 1.0), "2 Handtaucher = 1.0/s")
	eco.abyss_points = 50
	check(approx(eco.global_multiplier(), 2.0), "50 Abyss-Punkte = Multiplikator 2.0")
	check(approx(eco.production_per_second(), 2.0), "Multiplikator wirkt auf Produktion")
	var before: float = eco.pearls
	eco.advance(10.0)
	check(approx(eco.pearls - before, 20.0), "advance() schreibt Produktion gut")


func _test_depth_levels() -> void:
	var eco = EconomyScript.new()
	check(eco.depth_level() == 1, "Start in Tiefe 1 (Schelfmeer)")
	eco.run_earned = 50.0e3
	check(eco.depth_level() == 2, "50 Tsd = Tiefe 2 (Daemmerzone)")
	eco.run_earned = 5.0e6
	check(eco.depth_level() == 3, "5 Mio = Tiefe 3 (Mitternachtszone)")
	eco.run_earned = 500.0e6
	check(eco.depth_level() == 4, "500 Mio = Tiefe 4 (Abgrund)")
	eco.run_earned = 50.0e9
	check(eco.depth_level() == 5, "50 Mrd = Tiefe 5 (Hadalzone)")
	eco.run_earned = 5.0e12
	check(eco.depth_level() == 6, "5 Bio = Tiefe 6 (Abyss-Tor)")
	check(eco.next_depth_threshold() < 0.0, "Tiefste Zone hat keine naechste Schwelle")
	eco.run_earned = 0.0
	check(approx(eco.next_depth_threshold(), 50.0e3), "Naechste Schwelle ab Start: 50 Tsd")


func _test_depth_rules() -> void:
	var eco = EconomyScript.new()
	eco.run_earned = 60.0e3
	check(approx(eco.click_value(), 3.0), "Daemmerzone: Klicks zaehlen dreifach")

	var eco2 = EconomyScript.new()
	eco2.run_earned = 6.0e6
	eco2.owned[0] = 2
	check(approx(eco2.production_per_second(), 5.0), "Mitternachtszone: fruehe Stufen x5")
	eco2.owned[2] = 1
	check(approx(eco2.production_per_second(), 29.0), "Boost gilt nur fuer Stufe 1-2")

	var eco3 = EconomyScript.new()
	eco3.run_earned = 600.0e6
	check(approx(eco3.generator_cost(0), 13.5), "Abgrund: 10 Prozent Kaufrabatt")

	var eco4 = EconomyScript.new()
	eco4.run_earned = 60.0e9
	eco4.owned[1] = 1
	check(approx(eco4.offline_gain(3600.0), 4.0 * 5.0 * 3600.0), "Hadalzone: Offline volle Rate (inkl. Boost frueher Stufen)")


func _test_upgrades() -> void:
	var eco = EconomyScript.new()
	var step: int = EconomyScript.UPGRADE_OWNED_STEP
	var factor: float = EconomyScript.UPGRADE_COST_FACTOR
	var growth: float = EconomyScript.UPGRADE_COST_GROWTH
	check(not eco.upgrade_available(0), "Upgrade ohne Besitz gesperrt")
	eco.owned[0] = step
	check(eco.upgrade_available(0), "Upgrade ab Besitzschwelle verfuegbar")
	check(approx(eco.upgrade_cost(0), 15.0 * factor), "Upgrade-Kosten Stufe 1 = Faktor x Basis")
	check(not eco.buy_upgrade(0), "Upgrade ohne Perlen schlaegt fehl")
	eco.pearls = 15.0 * factor + 100.0
	check(eco.buy_upgrade(0), "Upgrade-Kauf klappt")
	check(eco.upgrades[0] == 1 and approx(eco.pearls, 100.0), "Upgrade kostet und zaehlt")
	check(approx(eco.production_per_second(), float(step) * 0.5 * 2.0), "Upgrade verdoppelt Produktion")
	check(not eco.upgrade_available(0), "Naechstes Upgrade braucht doppelte Schwelle")
	eco.owned[0] = step * 2
	check(approx(eco.upgrade_cost(0), 15.0 * factor * growth), "Upgrade-Kosten steigen mit dem Wachstumsfaktor")
	eco.upgrades[0] = EconomyScript.MAX_UPGRADE_TIERS
	eco.owned[0] = 999
	check(not eco.upgrade_available(0), "Upgrade-Stufen sind gedeckelt")


func _test_offline() -> void:
	var eco = EconomyScript.new()
	eco.owned[1] = 1
	var gain: float = eco.offline_gain(3600.0)
	check(approx(gain, 4.0 * 3600.0 * 0.5), "Offline: halbe Rate fuer 1 h")
	var eco2 = EconomyScript.new()
	eco2.owned[1] = 1
	var capped: float = eco2.offline_gain(100.0 * 3600.0)
	check(approx(capped, 4.0 * 8.0 * 3600.0 * 0.5), "Offline-Gewinn ist auf 8 h gedeckelt")
	var eco3 = EconomyScript.new()
	eco3.owned[1] = 1
	check(approx(eco3.offline_gain(-5.0), 0.0, 1.0), "Negative Offline-Zeit bringt nichts")


func _test_prestige() -> void:
	var eco = EconomyScript.new()
	eco.run_earned = 0.5e9
	check(eco.prestige_points_on_reset() == 0, "Unter 1 Mrd keine Abyss-Punkte")
	check(not eco.do_prestige(), "Prestige unter Schwelle verweigert")
	eco.run_earned = 4.0e9
	check(eco.prestige_points_on_reset() == 2, "4 Mrd verdient = 2 Abyss-Punkte")
	var eco_deep = EconomyScript.new()
	eco_deep.run_earned = 5.0e12
	check(eco_deep.prestige_points_on_reset() == 105, "Abyss-Tor: Punkte x1.5 (70 -> 105)")
	eco.pearls = 123.0
	eco.owned[0] = 7
	eco.upgrades[0] = 2
	eco.lifetime_earned = 5.0e9
	check(eco.do_prestige(), "Prestige ueber Schwelle klappt")
	check(eco.abyss_points == 2, "Abyss-Punkte gutgeschrieben")
	check(approx(eco.pearls, 0.0, 1.0) and eco.owned[0] == 0 and eco.upgrades[0] == 0, "Prestige setzt Runde samt Upgrades zurueck")
	check(eco.depth_level() == 1, "Prestige beginnt den Tauchgang von vorn")
	check(approx(eco.lifetime_earned, 5.0e9), "Lebenszeit-Verdienst bleibt erhalten")


func _test_dict_roundtrip() -> void:
	var eco = EconomyScript.new()
	eco.pearls = 987.5
	eco.run_earned = 5000.0
	eco.lifetime_earned = 9000.0
	eco.owned[2] = 3
	eco.upgrades[2] = 2
	eco.abyss_points = 4
	var eco2 = EconomyScript.new()
	eco2.from_dict(eco.to_dict())
	check(approx(eco2.pearls, 987.5) and eco2.owned[2] == 3 and eco2.upgrades[2] == 2 and eco2.abyss_points == 4, "to_dict/from_dict erhaelt den Zustand")
	var eco3 = EconomyScript.new()
	eco3.from_dict({})
	check(approx(eco3.pearls, 0.0, 1.0) and eco3.owned[0] == 0, "Leeres Save laedt als Neustart")
	var eco4 = EconomyScript.new()
	eco4.from_dict({"version": 1, "pearls": 42.0, "owned": [1, 2, 3, 4, 5, 6]})
	check(eco4.owned[5] == 6 and eco4.upgrades[0] == 0, "Alter v1-Spielstand laedt ohne Upgrades sauber")


func _test_save_file_roundtrip() -> void:
	SaveManagerScript.clear_save()
	var eco = EconomyScript.new()
	eco.pearls = 4242.0
	eco.owned[1] = 5
	eco.upgrades[1] = 1
	check(SaveManagerScript.save_game(eco), "Speichern legt Datei an")
	var eco2 = EconomyScript.new()
	var result: Dictionary = SaveManagerScript.load_game(eco2)
	check(result["loaded"], "Laden findet die Datei")
	check(approx(eco2.pearls, 4242.0, 0.01) and eco2.owned[1] == 5 and eco2.upgrades[1] == 1, "Spielstand uebersteht Datei-Roundtrip")
	SaveManagerScript.clear_save()
	var eco3 = EconomyScript.new()
	var empty: Dictionary = SaveManagerScript.load_game(eco3)
	check(not empty["loaded"], "Ohne Datei: sauberer Neustart")


## Grobe Kurven-Pruefung: Ein gieriger Spieler (3 Klicks/s, kauft immer das
## teuerste Leistbare) muss den Tiefseekran in unter 20 Minuten erreichen.
func _test_progression_curve() -> void:
	var eco = EconomyScript.new()
	var seconds := 0
	var crane_at := -1
	while seconds < 1800:
		seconds += 1
		eco.advance(1.0)
		for c in 3:
			eco.click()
		var bought := true
		while bought:
			bought = false
			for i in range(EconomyScript.GENERATORS.size() - 1, -1, -1):
				if eco.can_buy(i):
					eco.buy(i)
					bought = true
					break
		if crane_at < 0 and eco.owned[2] > 0:
			crane_at = seconds
			break
	check(crane_at > 0 and crane_at <= 1200, "Tiefseekran in unter 20 min erreichbar (war: %d s)" % crane_at)
	check(eco.production_per_second() > 20.0, "Produktion traegt nach dem Kran")


## Langzeit-Kurve: In 3 Stunden aktivem Spiel (inkl. Upgrades) muss der
## Abgrund (Tiefe 4, 500 Mio kumuliert) erreichbar sein, damit die erste
## lange Sitzung sichtbar Fortschritt durch die Zonen macht.
func _test_long_session_depth() -> void:
	var eco = EconomyScript.new()
	var abgrund_at := -1
	for seconds in range(1, 10801):
		eco.advance(1.0)
		for c in 3:
			eco.click()
		var acted := true
		while acted:
			acted = false
			for i in range(EconomyScript.GENERATORS.size() - 1, -1, -1):
				if eco.can_upgrade(i):
					eco.buy_upgrade(i)
					acted = true
					break
				if eco.can_buy(i):
					eco.buy(i)
					acted = true
					break
		if abgrund_at < 0 and eco.depth_level() >= 4:
			abgrund_at = seconds
			break
	check(abgrund_at > 0, "Abgrund (Tiefe 4) in unter 3 h aktivem Spiel erreichbar (war: %d s)" % abgrund_at)
