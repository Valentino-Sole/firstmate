class_name Economy
extends RefCounted

## Reine Spiellogik ohne UI: Generatoren, Kostenkurve, Produktion, Upgrades,
## Tiefenschichten, Offline-Fortschritt und Prestige.
## Wird von Spiel und Tests gemeinsam genutzt.

const GENERATORS := [
	{"id": "handtaucher", "base_cost": 15.0, "growth": 1.15, "base_prod": 0.5},
	{"id": "bohrdrohne", "base_cost": 220.0, "growth": 1.15, "base_prod": 4.0},
	{"id": "tiefseekran", "base_cost": 3200.0, "growth": 1.16, "base_prod": 24.0},
	{"id": "uboot_flotte", "base_cost": 46000.0, "growth": 1.14, "base_prod": 140.0},
	{"id": "magmabohrer", "base_cost": 720000.0, "growth": 1.13, "base_prod": 3200.0},
	{"id": "abyss_portal", "base_cost": 6000000.0, "growth": 1.12, "base_prod": 24000.0},
]

## Tiefenschichten: jede erreichte Tiefe aendert genau eine Spielregel.
## Die Tiefe haengt am Verdienst der laufenden Runde und sinkt nie innerhalb
## einer Runde; ein Prestige beginnt den Tauchgang von vorn.
const DEPTHS := [
	{"id": "schelfmeer", "threshold": 0.0},
	{"id": "daemmerzone", "threshold": 50.0e3},
	{"id": "mitternachtszone", "threshold": 5.0e6},
	{"id": "abgrund", "threshold": 500.0e6},
	{"id": "hadalzone", "threshold": 50.0e9},
	{"id": "abyss_tor", "threshold": 5.0e12},
]

const DEPTH_CLICK_MULT := 3.0        # ab Daemmerzone
const DEPTH_EARLY_BOOST := 5.0       # ab Mitternachtszone fuer Stufe 1-2
const DEPTH_COST_DISCOUNT := 0.9     # ab Abgrund
const DEPTH_PRESTIGE_FACTOR := 1.5   # ab Abyss-Tor

const MAX_UPGRADE_TIERS := 4
const UPGRADE_OWNED_STEP := 10       # Tier t braucht 10*(t+1) Exemplare
const UPGRADE_COST_FACTOR := 80.0
const UPGRADE_COST_GROWTH := 10.0

const OFFLINE_CAP_SECONDS := 8 * 3600
const OFFLINE_RATE_BASE := 0.5
const PRESTIGE_UNLOCK := 1.0e9
const PRESTIGE_BONUS_PER_POINT := 0.02
const SAVE_VERSION := 2

var pearls := 0.0
var run_earned := 0.0
var lifetime_earned := 0.0
var owned: Array[int] = [0, 0, 0, 0, 0, 0]
var upgrades: Array[int] = [0, 0, 0, 0, 0, 0]
var abyss_points := 0


# --- Tiefenschichten ---------------------------------------------------------

## 1-basierte aktuelle Tiefe (1 = Schelfmeer ... 6 = Abyss-Tor).
func depth_level() -> int:
	var level := 1
	for i in DEPTHS.size():
		if run_earned >= float(DEPTHS[i]["threshold"]):
			level = i + 1
	return level


func depth_id() -> String:
	return DEPTHS[depth_level() - 1]["id"]


## Schwelle der naechsten Tiefe, oder -1 wenn die tiefste erreicht ist.
func next_depth_threshold() -> float:
	var level := depth_level()
	if level >= DEPTHS.size():
		return -1.0
	return float(DEPTHS[level]["threshold"])


func click_rule_multiplier() -> float:
	return DEPTH_CLICK_MULT if depth_level() >= 2 else 1.0


func early_boost(index: int) -> float:
	return DEPTH_EARLY_BOOST if depth_level() >= 3 and index < 2 else 1.0


func cost_discount() -> float:
	return DEPTH_COST_DISCOUNT if depth_level() >= 4 else 1.0


func offline_rate() -> float:
	return 1.0 if depth_level() >= 5 else OFFLINE_RATE_BASE


# --- Generatoren und Upgrades ------------------------------------------------

func generator_cost(index: int) -> float:
	var g: Dictionary = GENERATORS[index]
	return g["base_cost"] * pow(g["growth"], owned[index]) * cost_discount()


func can_buy(index: int) -> bool:
	return pearls >= generator_cost(index)


func buy(index: int) -> bool:
	var cost := generator_cost(index)
	if pearls < cost:
		return false
	pearls -= cost
	owned[index] += 1
	return true


## Besitzschwelle, ab der das naechste Upgrade dieses Generators kaufbar ist.
func upgrade_owned_required(index: int) -> int:
	return UPGRADE_OWNED_STEP * (upgrades[index] + 1)


func upgrade_cost(index: int) -> float:
	var g: Dictionary = GENERATORS[index]
	return g["base_cost"] * UPGRADE_COST_FACTOR * pow(UPGRADE_COST_GROWTH, upgrades[index])


func upgrade_available(index: int) -> bool:
	return upgrades[index] < MAX_UPGRADE_TIERS and owned[index] >= upgrade_owned_required(index)


func can_upgrade(index: int) -> bool:
	return upgrade_available(index) and pearls >= upgrade_cost(index)


func buy_upgrade(index: int) -> bool:
	if not can_upgrade(index):
		return false
	pearls -= upgrade_cost(index)
	upgrades[index] += 1
	return true


# --- Produktion ---------------------------------------------------------------

func global_multiplier() -> float:
	return 1.0 + float(abyss_points) * PRESTIGE_BONUS_PER_POINT


func generator_production(index: int) -> float:
	return float(owned[index]) * float(GENERATORS[index]["base_prod"]) \
		* pow(2.0, upgrades[index]) * early_boost(index)


func production_per_second() -> float:
	var total := 0.0
	for i in GENERATORS.size():
		total += generator_production(i)
	return total * global_multiplier()


func click_value() -> float:
	return (1.0 + production_per_second() * 0.02) * click_rule_multiplier() * global_multiplier()


func click() -> float:
	var value := click_value()
	_earn(value)
	return value


func advance(delta: float) -> float:
	var earned := production_per_second() * delta
	_earn(earned)
	return earned


## Offline-Fortschritt: reduzierte Rate (volle Rate ab Hadalzone), Deckel 8 h.
func offline_gain(seconds: float) -> float:
	var capped: float = clamp(seconds, 0.0, float(OFFLINE_CAP_SECONDS))
	var earned := production_per_second() * capped * offline_rate()
	_earn(earned)
	return earned


# --- Prestige -----------------------------------------------------------------

func prestige_points_on_reset() -> int:
	if run_earned < PRESTIGE_UNLOCK:
		return 0
	var base: float = floor(sqrt(run_earned / PRESTIGE_UNLOCK))
	if depth_level() >= 6:
		base = floor(base * DEPTH_PRESTIGE_FACTOR)
	return int(base)


func do_prestige() -> bool:
	var gained := prestige_points_on_reset()
	if gained <= 0:
		return false
	abyss_points += gained
	pearls = 0.0
	run_earned = 0.0
	for i in owned.size():
		owned[i] = 0
		upgrades[i] = 0
	return true


func _earn(amount: float) -> void:
	pearls += amount
	run_earned += amount
	lifetime_earned += amount


# --- Spielstand ----------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"pearls": pearls,
		"run_earned": run_earned,
		"lifetime_earned": lifetime_earned,
		"owned": Array(owned),
		"upgrades": Array(upgrades),
		"abyss_points": abyss_points,
	}


func from_dict(data: Dictionary) -> void:
	pearls = float(data.get("pearls", 0.0))
	run_earned = float(data.get("run_earned", 0.0))
	lifetime_earned = float(data.get("lifetime_earned", 0.0))
	abyss_points = int(data.get("abyss_points", 0))
	var stored_owned: Array = data.get("owned", [])
	var stored_upgrades: Array = data.get("upgrades", [])
	for i in owned.size():
		owned[i] = int(stored_owned[i]) if i < stored_owned.size() else 0
		upgrades[i] = int(stored_upgrades[i]) if i < stored_upgrades.size() else 0
