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
	_test_offline()
	_test_prestige()
	_test_dict_roundtrip()
	_test_save_file_roundtrip()
	_test_progression_curve()
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
	eco.pearls = 123.0
	eco.owned[0] = 7
	eco.lifetime_earned = 5.0e9
	check(eco.do_prestige(), "Prestige ueber Schwelle klappt")
	check(eco.abyss_points == 2, "Abyss-Punkte gutgeschrieben")
	check(approx(eco.pearls, 0.0, 1.0) and eco.owned[0] == 0 and approx(eco.run_earned, 0.0, 1.0), "Prestige setzt Runde zurueck")
	check(approx(eco.lifetime_earned, 5.0e9), "Lebenszeit-Verdienst bleibt erhalten")


func _test_dict_roundtrip() -> void:
	var eco = EconomyScript.new()
	eco.pearls = 987.5
	eco.run_earned = 5000.0
	eco.lifetime_earned = 9000.0
	eco.owned[2] = 3
	eco.abyss_points = 4
	var eco2 = EconomyScript.new()
	eco2.from_dict(eco.to_dict())
	check(approx(eco2.pearls, 987.5) and eco2.owned[2] == 3 and eco2.abyss_points == 4, "to_dict/from_dict erhaelt den Zustand")
	var eco3 = EconomyScript.new()
	eco3.from_dict({})
	check(approx(eco3.pearls, 0.0, 1.0) and eco3.owned[0] == 0, "Leeres Save laedt als Neustart")


func _test_save_file_roundtrip() -> void:
	SaveManagerScript.clear_save()
	var eco = EconomyScript.new()
	eco.pearls = 4242.0
	eco.owned[1] = 5
	check(SaveManagerScript.save_game(eco), "Speichern legt Datei an")
	var eco2 = EconomyScript.new()
	var result: Dictionary = SaveManagerScript.load_game(eco2)
	check(result["loaded"], "Laden findet die Datei")
	check(approx(eco2.pearls, 4242.0, 0.01) and eco2.owned[1] == 5, "Spielstand uebersteht Datei-Roundtrip")
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
