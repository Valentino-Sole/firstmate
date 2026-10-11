extends Control

## Hauptszene: baut die Oberfläche im Code auf, treibt die Simulation,
## speichert automatisch und schreibt Offline-Gewinne beim Start gut.

const EconomyScript := preload("res://src/economy.gd")
const SaveManagerScript := preload("res://src/save_manager.gd")
const I18nScript := preload("res://src/i18n.gd")

const AUTOSAVE_INTERVAL := 20.0
const UI_REFRESH_INTERVAL := 0.1

var eco = EconomyScript.new()
var locale := "de"

var pearl_label: Label
var rate_label: Label
var depth_label: Label
var depth_progress_label: Label
var offline_label: Label
var click_button: Button
var prestige_button: Button
var generator_buttons: Array[Button] = []
var upgrade_buttons: Array[Button] = []

var _autosave_accum := 0.0
var _ui_accum := 0.0


func _ready() -> void:
	locale = I18nScript.pick_locale()
	_build_ui()
	var load_result: Dictionary = SaveManagerScript.load_game(eco)
	if load_result["loaded"] and load_result["offline_gain"] > 0.5:
		offline_label.text = I18nScript.t(locale, "offline") % I18nScript.fmt(locale, load_result["offline_gain"])
		offline_label.visible = true
	_refresh()


func _process(delta: float) -> void:
	eco.advance(delta)
	_ui_accum += delta
	_autosave_accum += delta
	if _ui_accum >= UI_REFRESH_INTERVAL:
		_ui_accum = 0.0
		_refresh()
	if _autosave_accum >= AUTOSAVE_INTERVAL:
		_autosave_accum = 0.0
		SaveManagerScript.save_game(eco)


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		SaveManagerScript.save_game(eco)


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.add_theme_constant_override("margin_left", 32)
	margin.add_theme_constant_override("margin_right", 32)
	margin.add_theme_constant_override("margin_top", 24)
	margin.add_theme_constant_override("margin_bottom", 24)
	add_child(margin)

	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 48)
	margin.add_child(columns)

	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.add_theme_constant_override("separation", 12)
	columns.add_child(left)

	pearl_label = Label.new()
	pearl_label.add_theme_font_size_override("font_size", 56)
	left.add_child(pearl_label)

	rate_label = Label.new()
	rate_label.add_theme_font_size_override("font_size", 20)
	left.add_child(rate_label)

	depth_label = Label.new()
	depth_label.add_theme_font_size_override("font_size", 18)
	left.add_child(depth_label)

	depth_progress_label = Label.new()
	depth_progress_label.add_theme_font_size_override("font_size", 14)
	left.add_child(depth_progress_label)

	click_button = Button.new()
	click_button.custom_minimum_size = Vector2(260, 72)
	click_button.add_theme_font_size_override("font_size", 26)
	click_button.pressed.connect(_on_click)
	left.add_child(click_button)

	offline_label = Label.new()
	offline_label.visible = false
	offline_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(offline_label)

	prestige_button = Button.new()
	prestige_button.custom_minimum_size = Vector2(260, 48)
	prestige_button.pressed.connect(_on_prestige)
	left.add_child(prestige_button)

	var right := VBoxContainer.new()
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.add_theme_constant_override("separation", 8)
	columns.add_child(right)

	for i in EconomyScript.GENERATORS.size():
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 8)
		right.add_child(row)

		var buy_button := Button.new()
		buy_button.custom_minimum_size = Vector2(380, 56)
		buy_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		buy_button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		var index := i
		buy_button.pressed.connect(func() -> void: _on_buy(index))
		row.add_child(buy_button)
		generator_buttons.append(buy_button)

		var upgrade_button := Button.new()
		upgrade_button.custom_minimum_size = Vector2(130, 56)
		upgrade_button.pressed.connect(func() -> void: _on_upgrade(index))
		row.add_child(upgrade_button)
		upgrade_buttons.append(upgrade_button)


func _refresh() -> void:
	pearl_label.text = "%s %s" % [I18nScript.fmt(locale, eco.pearls), I18nScript.t(locale, "pearls")]
	rate_label.text = "+%s %s" % [I18nScript.fmt(locale, eco.production_per_second()), I18nScript.t(locale, "per_second")]
	click_button.text = "%s  +%s" % [I18nScript.t(locale, "mine"), I18nScript.fmt(locale, eco.click_value())]

	var depth_name: String = I18nScript.t(locale, eco.depth_id())
	var depth_rule: String = I18nScript.t(locale, "rule_" + eco.depth_id())
	depth_label.text = "%s: %s · %s" % [I18nScript.t(locale, "depth") % eco.depth_level(), depth_name, depth_rule]
	var next_threshold: float = eco.next_depth_threshold()
	if next_threshold > 0.0:
		depth_progress_label.text = I18nScript.t(locale, "next_depth") % I18nScript.fmt(locale, next_threshold)
	else:
		depth_progress_label.text = I18nScript.t(locale, "max_depth")

	for i in generator_buttons.size():
		var g: Dictionary = EconomyScript.GENERATORS[i]
		var name_text: String = I18nScript.t(locale, g["id"])
		generator_buttons[i].text = "%s   %s: %d   %s: %s" % [
			name_text,
			I18nScript.t(locale, "owned"),
			eco.owned[i],
			I18nScript.t(locale, "cost"),
			I18nScript.fmt(locale, eco.generator_cost(i)),
		]
		generator_buttons[i].disabled = not eco.can_buy(i)

		if eco.upgrades[i] >= EconomyScript.MAX_UPGRADE_TIERS:
			upgrade_buttons[i].text = I18nScript.t(locale, "upgrade_maxed")
			upgrade_buttons[i].disabled = true
		elif eco.upgrade_available(i):
			upgrade_buttons[i].text = I18nScript.t(locale, "upgrade") % I18nScript.fmt(locale, eco.upgrade_cost(i))
			upgrade_buttons[i].disabled = not eco.can_upgrade(i)
		else:
			upgrade_buttons[i].text = I18nScript.t(locale, "upgrade_locked") % eco.upgrade_owned_required(i)
			upgrade_buttons[i].disabled = true

	var points: int = eco.prestige_points_on_reset()
	if points > 0:
		prestige_button.text = I18nScript.t(locale, "prestige") % points
		prestige_button.disabled = false
	else:
		prestige_button.text = I18nScript.t(locale, "prestige_locked")
		prestige_button.disabled = true


func _on_click() -> void:
	eco.click()
	_refresh()


func _on_buy(index: int) -> void:
	if eco.buy(index):
		_refresh()


func _on_upgrade(index: int) -> void:
	if eco.buy_upgrade(index):
		_refresh()


func _on_prestige() -> void:
	if eco.do_prestige():
		SaveManagerScript.save_game(eco)
		_refresh()
