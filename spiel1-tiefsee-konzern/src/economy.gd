class_name Economy
extends RefCounted

## Reine Spiellogik ohne UI: Generatoren, Kostenkurve, Produktion,
## Offline-Fortschritt und Prestige. Wird von Spiel und Tests gemeinsam genutzt.

const GENERATORS := [
	{"id": "handtaucher", "base_cost": 15.0, "growth": 1.15, "base_prod": 0.5},
	{"id": "bohrdrohne", "base_cost": 220.0, "growth": 1.15, "base_prod": 4.0},
	{"id": "tiefseekran", "base_cost": 3200.0, "growth": 1.16, "base_prod": 24.0},
	{"id": "uboot_flotte", "base_cost": 46000.0, "growth": 1.17, "base_prod": 140.0},
	{"id": "magmabohrer", "base_cost": 720000.0, "growth": 1.18, "base_prod": 900.0},
	{"id": "abyss_portal", "base_cost": 12000000.0, "growth": 1.2, "base_prod": 6500.0},
]

const OFFLINE_CAP_SECONDS := 8 * 3600
const OFFLINE_RATE := 0.5
const PRESTIGE_UNLOCK := 1.0e9
const PRESTIGE_BONUS_PER_POINT := 0.02
const SAVE_VERSION := 1

var pearls := 0.0
var run_earned := 0.0
var lifetime_earned := 0.0
var owned: Array[int] = [0, 0, 0, 0, 0, 0]
var abyss_points := 0


func generator_cost(index: int) -> float:
	var g: Dictionary = GENERATORS[index]
	return g["base_cost"] * pow(g["growth"], owned[index])


func can_buy(index: int) -> bool:
	return pearls >= generator_cost(index)


func buy(index: int) -> bool:
	var cost := generator_cost(index)
	if pearls < cost:
		return false
	pearls -= cost
	owned[index] += 1
	return true


func global_multiplier() -> float:
	return 1.0 + float(abyss_points) * PRESTIGE_BONUS_PER_POINT


func production_per_second() -> float:
	var total := 0.0
	for i in GENERATORS.size():
		total += float(owned[i]) * float(GENERATORS[i]["base_prod"])
	return total * global_multiplier()


func click_value() -> float:
	return (1.0 + production_per_second() * 0.02) * global_multiplier()


func click() -> float:
	var value := click_value()
	_earn(value)
	return value


func advance(delta: float) -> float:
	var earned := production_per_second() * delta
	_earn(earned)
	return earned


## Offline-Fortschritt: halbe Rate, gedeckelt auf 8 Stunden.
func offline_gain(seconds: float) -> float:
	var capped: float = clamp(seconds, 0.0, float(OFFLINE_CAP_SECONDS))
	var earned := production_per_second() * capped * OFFLINE_RATE
	_earn(earned)
	return earned


func prestige_points_on_reset() -> int:
	if run_earned < PRESTIGE_UNLOCK:
		return 0
	return int(floor(sqrt(run_earned / PRESTIGE_UNLOCK)))


func do_prestige() -> bool:
	var gained := prestige_points_on_reset()
	if gained <= 0:
		return false
	abyss_points += gained
	pearls = 0.0
	run_earned = 0.0
	for i in owned.size():
		owned[i] = 0
	return true


func _earn(amount: float) -> void:
	pearls += amount
	run_earned += amount
	lifetime_earned += amount


func to_dict() -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"pearls": pearls,
		"run_earned": run_earned,
		"lifetime_earned": lifetime_earned,
		"owned": Array(owned),
		"abyss_points": abyss_points,
	}


func from_dict(data: Dictionary) -> void:
	pearls = float(data.get("pearls", 0.0))
	run_earned = float(data.get("run_earned", 0.0))
	lifetime_earned = float(data.get("lifetime_earned", 0.0))
	abyss_points = int(data.get("abyss_points", 0))
	var stored: Array = data.get("owned", [])
	for i in owned.size():
		owned[i] = int(stored[i]) if i < stored.size() else 0
