class_name I18n
extends RefCounted

## Minimale Zweisprachigkeit (DE/EN) ohne Engine-Übersetzungsdateien.

const STRINGS := {
	"de": {
		"pearls": "Perlen",
		"per_second": "pro Sekunde",
		"mine": "ABBAUEN",
		"owned": "Besitz",
		"cost": "Kosten",
		"prestige": "Neustart: +%d Abyss-Punkte",
		"prestige_locked": "Neustart ab 1 Mrd Perlen dieser Runde",
		"offline": "Willkommen zurück! Offline verdient: %s",
		"handtaucher": "Handtaucher",
		"bohrdrohne": "Bohrdrohne",
		"tiefseekran": "Tiefseekran",
		"uboot_flotte": "U-Boot-Flotte",
		"magmabohrer": "Magmabohrer",
		"abyss_portal": "Abyss-Portal",
	},
	"en": {
		"pearls": "Pearls",
		"per_second": "per second",
		"mine": "MINE",
		"owned": "Owned",
		"cost": "Cost",
		"prestige": "Reset: +%d abyss points",
		"prestige_locked": "Reset unlocks at 1B pearls this run",
		"offline": "Welcome back! Earned offline: %s",
		"handtaucher": "Hand Diver",
		"bohrdrohne": "Drill Drone",
		"tiefseekran": "Deep-Sea Crane",
		"uboot_flotte": "Submarine Fleet",
		"magmabohrer": "Magma Drill",
		"abyss_portal": "Abyss Portal",
	},
}

const UNITS := {
	"de": ["Tsd", "Mio", "Mrd", "Bio", "Brd"],
	"en": ["K", "M", "B", "T", "Qa"],
}


static func pick_locale() -> String:
	return "de" if OS.get_locale_language() == "de" else "en"


static func t(locale: String, key: String) -> String:
	var table: Dictionary = STRINGS.get(locale, STRINGS["en"])
	return table.get(key, key)


static func fmt(locale: String, value: float) -> String:
	if value < 1000.0:
		return str(int(value))
	var units: Array = UNITS.get(locale, UNITS["en"])
	var v := value
	var idx := -1
	while v >= 1000.0 and idx < units.size() - 1:
		v /= 1000.0
		idx += 1
	return "%.2f %s" % [v, units[idx]]
