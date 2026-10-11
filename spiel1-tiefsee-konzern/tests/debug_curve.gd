extends SceneTree

## Entwicklungswerkzeug: druckt den Kurvenverlauf einer gierigen Sitzung.

const EconomyScript := preload("res://src/economy.gd")


func _init() -> void:
	var eco = EconomyScript.new()
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
		if seconds % 900 == 0:
			print("t=%5ds  tiefe=%d  pps=%12.0f  kum=%14.0f  besitz=%s  upg=%s" % [
				seconds, eco.depth_level(), eco.production_per_second(), eco.run_earned,
				str(eco.owned), str(eco.upgrades),
			])
	quit(0)
