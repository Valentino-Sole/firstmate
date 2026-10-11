extends Control

## Hauptszene: baut die Oberfläche im Code auf, treibt die Simulation,
## speichert automatisch und schreibt Offline-Gewinne beim Start gut.
## Tiefsee-Optik: der Hintergrund dunkelt mit jeder erreichten Tiefenzone ab.

const EconomyScript := preload("res://src/economy.gd")
const SaveManagerScript := preload("res://src/save_manager.gd")
const I18nScript := preload("res://src/i18n.gd")

const AUTOSAVE_INTERVAL := 20.0
const UI_REFRESH_INTERVAL := 0.1
const TOAST_SECONDS := 5.0

const COL_BG_BY_DEPTH: Array[Color] = [
	Color("114a63"), # Schelfmeer
	Color("0d3a52"), # Daemmerzone
	Color("092a41"), # Mitternachtszone
	Color("061b2e"), # Abgrund
	Color("040f1d"), # Hadalzone
	Color("05060f"), # Abyss-Tor
]
const COL_PANEL := Color("0b1c30")
const COL_PANEL_HOVER := Color("11253e")
const COL_PANEL_DISABLED := Color("091626")
const COL_BORDER := Color("1e3a5f")
const COL_TEXT := Color("dbeafe")
const COL_TEXT_DIM := Color("7a9cc0")
const COL_TEXT_DISABLED := Color("4a6584")
const COL_GOLD := Color("fbbf24")
const COL_GOLD_DARK := Color("d97706")
const COL_GOLD_TEXT := Color("211203")
const COL_GREEN := Color("4ade80")
const COL_CYAN := Color("7dd3fc")

var eco = EconomyScript.new()
var locale := "de"

var bg: ColorRect
var pearl_label: Label
var rate_label: Label
var depth_label: Label
var depth_progress_label: Label
var toast_label: Label
var offline_label: Label
var click_button: Button
var prestige_button: Button
var generator_buttons: Array[Button] = []
var upgrade_buttons: Array[Button] = []

var _bg_target: Color = COL_BG_BY_DEPTH[0]
var _last_depth := 1
var _toast_left := 0.0
var _autosave_accum := 0.0
var _ui_accum := 0.0


func _ready() -> void:
	locale = I18nScript.pick_locale()
	_build_ui()
	var load_result: Dictionary = SaveManagerScript.load_game(eco)
	if load_result["loaded"] and load_result["offline_gain"] > 0.5:
		offline_label.text = I18nScript.t(locale, "offline") % I18nScript.fmt(locale, load_result["offline_gain"])
		offline_label.visible = true
	_last_depth = eco.depth_level()
	_bg_target = COL_BG_BY_DEPTH[_last_depth - 1]
	bg.color = _bg_target
	_refresh()


func _process(delta: float) -> void:
	eco.advance(delta)
	bg.color = bg.color.lerp(_bg_target, minf(delta * 1.5, 1.0))
	if _toast_left > 0.0:
		_toast_left -= delta
		if _toast_left <= 0.0:
			toast_label.visible = false
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


func _panel_style(bg_color: Color, border_color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg_color
	style.border_color = border_color
	style.set_border_width_all(1)
	style.set_corner_radius_all(10)
	style.set_content_margin_all(12)
	return style


func _apply_dark_button(button: Button) -> void:
	button.add_theme_stylebox_override("normal", _panel_style(COL_PANEL, COL_BORDER))
	button.add_theme_stylebox_override("hover", _panel_style(COL_PANEL_HOVER, COL_BORDER))
	button.add_theme_stylebox_override("pressed", _panel_style(COL_PANEL_HOVER, COL_GOLD_DARK))
	button.add_theme_stylebox_override("disabled", _panel_style(COL_PANEL_DISABLED, COL_BORDER))
	button.add_theme_color_override("font_color", COL_TEXT)
	button.add_theme_color_override("font_hover_color", COL_TEXT)
	button.add_theme_color_override("font_pressed_color", COL_TEXT)
	button.add_theme_color_override("font_disabled_color", COL_TEXT_DISABLED)


func _apply_gold_button(button: Button) -> void:
	button.add_theme_stylebox_override("normal", _panel_style(COL_GOLD, COL_GOLD_DARK))
	button.add_theme_stylebox_override("hover", _panel_style(Color("fcd34d"), COL_GOLD_DARK))
	button.add_theme_stylebox_override("pressed", _panel_style(COL_GOLD_DARK, COL_GOLD_DARK))
	button.add_theme_stylebox_override("disabled", _panel_style(COL_PANEL_DISABLED, COL_BORDER))
	button.add_theme_color_override("font_color", COL_GOLD_TEXT)
	button.add_theme_color_override("font_hover_color", COL_GOLD_TEXT)
	button.add_theme_color_override("font_pressed_color", COL_GOLD_TEXT)
	button.add_theme_color_override("font_disabled_color", COL_TEXT_DISABLED)


func _build_ui() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)

	bg = ColorRect.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.color = COL_BG_BY_DEPTH[0]
	add_child(bg)

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
	pearl_label.add_theme_color_override("font_color", Color.WHITE)
	left.add_child(pearl_label)

	rate_label = Label.new()
	rate_label.add_theme_font_size_override("font_size", 20)
	rate_label.add_theme_color_override("font_color", COL_GREEN)
	left.add_child(rate_label)

	depth_label = Label.new()
	depth_label.add_theme_font_size_override("font_size", 18)
	depth_label.add_theme_color_override("font_color", COL_CYAN)
	left.add_child(depth_label)

	depth_progress_label = Label.new()
	depth_progress_label.add_theme_font_size_override("font_size", 14)
	depth_progress_label.add_theme_color_override("font_color", COL_TEXT_DIM)
	left.add_child(depth_progress_label)

	click_button = Button.new()
	click_button.custom_minimum_size = Vector2(260, 72)
	click_button.add_theme_font_size_override("font_size", 26)
	click_button.pressed.connect(_on_click)
	_apply_gold_button(click_button)
	left.add_child(click_button)

	toast_label = Label.new()
	toast_label.visible = false
	toast_label.add_theme_font_size_override("font_size", 16)
	toast_label.add_theme_color_override("font_color", COL_GOLD)
	toast_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(toast_label)

	offline_label = Label.new()
	offline_label.visible = false
	offline_label.add_theme_color_override("font_color", COL_CYAN)
	offline_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	left.add_child(offline_label)

	prestige_button = Button.new()
	prestige_button.custom_minimum_size = Vector2(260, 48)
	prestige_button.pressed.connect(_on_prestige)
	_apply_dark_button(prestige_button)
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
		_apply_dark_button(buy_button)
		row.add_child(buy_button)
		generator_buttons.append(buy_button)

		var upgrade_button := Button.new()
		upgrade_button.custom_minimum_size = Vector2(130, 56)
		upgrade_button.pressed.connect(func() -> void: _on_upgrade(index))
		_apply_dark_button(upgrade_button)
		upgrade_button.add_theme_color_override("font_color", COL_GOLD)
		upgrade_button.add_theme_color_override("font_hover_color", COL_GOLD)
		row.add_child(upgrade_button)
		upgrade_buttons.append(upgrade_button)


func _refresh() -> void:
	var depth: int = eco.depth_level()
	if depth != _last_depth:
		_last_depth = depth
		_bg_target = COL_BG_BY_DEPTH[depth - 1]
		toast_label.text = "%s %s · %s" % [
			I18nScript.t(locale, "new_depth"),
			I18nScript.t(locale, eco.depth_id()),
			I18nScript.t(locale, "rule_" + eco.depth_id()),
		]
		toast_label.visible = true
		_toast_left = TOAST_SECONDS

	pearl_label.text = "%s %s" % [I18nScript.fmt(locale, eco.pearls), I18nScript.t(locale, "pearls")]
	rate_label.text = "+%s %s" % [I18nScript.fmt(locale, eco.production_per_second()), I18nScript.t(locale, "per_second")]
	click_button.text = "%s  +%s" % [I18nScript.t(locale, "mine"), I18nScript.fmt(locale, eco.click_value())]

	var depth_name: String = I18nScript.t(locale, eco.depth_id())
	var depth_rule: String = I18nScript.t(locale, "rule_" + eco.depth_id())
	depth_label.text = "%s: %s · %s" % [I18nScript.t(locale, "depth") % depth, depth_name, depth_rule]
	var next_threshold: float = eco.next_depth_threshold()
	if next_threshold > 0.0:
		depth_progress_label.text = I18nScript.t(locale, "next_depth") % I18nScript.fmt(locale, next_threshold)
	else:
		depth_progress_label.text = I18nScript.t(locale, "max_depth")

	for i in generator_buttons.size():
		var g: Dictionary = EconomyScript.GENERATORS[i]
		var name_text: String = I18nScript.t(locale, g["id"])
		var line := "%s   %s: %d   %s: %s" % [
			name_text,
			I18nScript.t(locale, "owned"),
			eco.owned[i],
			I18nScript.t(locale, "cost"),
			I18nScript.fmt(locale, eco.generator_cost(i)),
		]
		if eco.owned[i] > 0:
			line += "   +%s/s" % I18nScript.fmt(locale, eco.generator_production(i) * eco.global_multiplier())
		generator_buttons[i].text = line
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
	var value: float = eco.click()
	_spawn_click_float(value)
	_pop_click_button()
	_refresh()


## Aufsteigendes "+X" beim Abbau-Klick.
func _spawn_click_float(value: float) -> void:
	var float_label := Label.new()
	float_label.text = "+" + I18nScript.fmt(locale, value)
	float_label.add_theme_font_size_override("font_size", 22)
	float_label.add_theme_color_override("font_color", COL_GOLD)
	add_child(float_label)
	var base: Vector2 = click_button.global_position + Vector2(click_button.size.x * randf_range(0.15, 0.7), -10.0)
	float_label.global_position = base
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(float_label, "global_position:y", base.y - 46.0, 0.7)
	tween.tween_property(float_label, "modulate:a", 0.0, 0.7)
	tween.chain().tween_callback(float_label.queue_free)


func _pop_click_button() -> void:
	click_button.pivot_offset = click_button.size / 2.0
	var tween := create_tween()
	tween.tween_property(click_button, "scale", Vector2(0.96, 0.96), 0.04)
	tween.tween_property(click_button, "scale", Vector2.ONE, 0.08)


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
