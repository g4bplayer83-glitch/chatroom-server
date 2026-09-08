extends AmongFunkMenuBase

const FPS_VALUES: Array[int] = [60, 120, 144, 165, 240]
const OPTIONS: Array[Dictionary] = [
	{"label": "DOWN SCROLL", "action": "downscroll", "description": "PUT THE RECEPTORS AT THE BOTTOM."},
	{"label": "GHOST TAPPING", "action": "ghost_tapping", "description": "EMPTY KEY PRESSES DO NOT COUNT AS MISSES."},
	{"label": "NOTE SPLASHES", "action": "note_splashes", "description": "SHOW SPLASHES ON ACCURATE HITS."},
	{"label": "CAMERA BEAT ZOOM", "action": "camera_beat_zoom", "description": "LET THE CAMERA REACT TO THE BEAT."},
	{"label": "GAMEPLAY SHADERS", "action": "gameplay_shaders", "description": "ENABLE CODENAME VISUAL EFFECTS."},
	{"label": "FPS COUNTER", "action": "show_performance", "description": "SHOW ENGINE PERFORMANCE INFORMATION."},
	{"label": "GRAPHICS QUALITY", "action": "low_quality", "description": "LOW REDUCES EFFECTS; HIGH KEEPS THEM."},
	{"label": "FRAMERATE", "action": "fps_cap", "description": "CHOOSE THE MAXIMUM ENGINE FRAMERATE."},
	{"label": "CONTROLS / MORE", "action": "advanced", "description": "OPEN THE COMPLETE NOAH CONTROL MENU."}
]

var option_buttons: Array[Button] = []
var option_name_labels: Array[Label] = []
var option_value_labels: Array[Label] = []
var selected_option := 0
var description_label: Label
var value_label: Label


func _ready() -> void:
	AmongFunkManager.play_menu_music(AmongFunkManager.OPTIONS_MUSIC)
	Global.set_window_title("Among Funk — Options")
	_build_background()
	_build_options_layout()
	_select_option(0, false)


func _build_options_layout() -> void:
	var title := add_label("OPTIONS", Vector2(0, 26), Vector2(1280, 62), 52, Color("C0D1D4"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var subtitle := add_label("AMONG FUNK SETTINGS  /  DEMO 1", Vector2(0, 82), Vector2(1280, 26), 16, Color("8DA6A8"))
	subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	var left_panel := add_texture("res://among_funk/codename/images/Menu_Corner.png", Vector2(38, 120), Vector2(790, 550))
	left_panel.stretch_mode = TextureRect.STRETCH_SCALE
	var right_panel := add_texture("res://among_funk/codename/images/Menu_Corner.png", Vector2(864, 180), Vector2(375, 430))
	right_panel.stretch_mode = TextureRect.STRETCH_SCALE
	add_texture("res://among_funk/codename/images/impostor_float.png", Vector2(968, 205), Vector2(150, 150))
	var about := add_label("ABOUT THIS OPTION", Vector2(900, 355), Vector2(305, 30), 20, Color("54E6CF"))
	about.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	for index in OPTIONS.size():
		var button := Button.new()
		button.position = Vector2(80, 148 + index * 54)
		button.size = Vector2(705, 44)
		button.text = ""
		button.add_theme_font_override(&"font", menu_font)
		button.add_theme_font_size_override(&"font_size", 20)
		button.add_theme_stylebox_override(&"normal", make_terminal_style(Color("51696B"), Color("6B7E80"), 1))
		button.add_theme_stylebox_override(&"hover", make_terminal_style(Color("6B8A8C"), Color("7CFFD9"), 2))
		button.add_theme_stylebox_override(&"pressed", make_terminal_style(Color("7DA09B"), Color.WHITE, 2))
		button.mouse_entered.connect(_select_option.bind(index, true))
		button.pressed.connect(_change_option.bind(index))
		add_child(button)
		option_buttons.append(button)
		var name_label := add_label(str(OPTIONS[index]["label"]), Vector2(100, 158 + index * 54), Vector2(430, 28), 20, Color.WHITE)
		name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		option_name_labels.append(name_label)
		var option_value := add_label("", Vector2(530, 158 + index * 54), Vector2(225, 28), 20, Color.WHITE)
		option_value.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		option_value.mouse_filter = Control.MOUSE_FILTER_IGNORE
		option_value_labels.append(option_value)

	description_label = add_label("", Vector2(902, 400), Vector2(300, 105), 18, Color.WHITE)
	description_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	description_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	description_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	value_label = add_label("UP / DOWN   SELECT\nLEFT / RIGHT   CHANGE\nENTER   TOGGLE\nESC   BACK", Vector2(900, 535), Vector2(305, 90), 15, Color("8DA6A8"))
	value_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _select_option(index: int, play_sound: bool = true) -> void:
	selected_option = wrapi(index, 0, OPTIONS.size())
	for button_index in option_buttons.size():
		var active := button_index == selected_option
		var target_x := 94.0 if active else 80.0
		option_buttons[button_index].position.x = target_x
		option_buttons[button_index].modulate = Color.WHITE if active else Color(1, 1, 1, 0.72)
		option_name_labels[button_index].position.x = target_x + 20.0
		option_value_labels[button_index].position.x = target_x + 450.0
		option_name_labels[button_index].modulate = Color("54E6CF") if active else Color.WHITE
		option_value_labels[button_index].modulate = Color("54E6CF") if active else Color.WHITE
	_refresh_option_text()
	if play_sound:
		SoundManager.scroll.play()


func _refresh_option_text() -> void:
	for index in option_buttons.size():
		var action := str(OPTIONS[index]["action"])
		var value := "OPEN  >" if action == "advanced" else _value_text(action)
		option_value_labels[index].text = value
	var current := OPTIONS[selected_option]
	description_label.text = str(current["description"])


func _change_option(index: int) -> void:
	selected_option = index
	var action := str(OPTIONS[index]["action"])
	if action == "advanced":
		SettingsManager.flush()
		SoundManager.accept.play()
		Global.change_scene_to("res://noah/menus/options/options.tscn", &"fade")
		return
	if action == "fps_cap":
		var current := int(SettingsManager.get_value(SettingsManager.SEC_DEBUG, "fps_cap", 60))
		var fps_index := FPS_VALUES.find(current)
		fps_index = wrapi((fps_index + 1) if fps_index >= 0 else 0, 0, FPS_VALUES.size())
		SettingsManager.set_value(SettingsManager.SEC_DEBUG, "fps_cap", FPS_VALUES[fps_index])
		Engine.max_fps = FPS_VALUES[fps_index]
	else:
		var section := SettingsManager.SEC_GAMEPLAY if action in ["downscroll", "ghost_tapping"] else SettingsManager.SEC_PREFERENCES
		if action == "show_performance":
			section = SettingsManager.SEC_DEBUG
		var enabled := bool(SettingsManager.get_value(section, action, false))
		SettingsManager.set_value(section, action, not enabled)
	SettingsManager.flush()
	SoundManager.scroll.play()
	_refresh_option_text()


func _value_text(action: String) -> String:
	if action == "fps_cap":
		return "%d FPS" % int(SettingsManager.get_value(SettingsManager.SEC_DEBUG, "fps_cap", 60))
	var section := SettingsManager.SEC_GAMEPLAY if action in ["downscroll", "ghost_tapping"] else SettingsManager.SEC_PREFERENCES
	if action == "show_performance":
		section = SettingsManager.SEC_DEBUG
	var enabled := bool(SettingsManager.get_value(section, action, false))
	if action == "low_quality":
		return "LOW" if enabled else "HIGH"
	return "ON" if enabled else "OFF"


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	if event.is_action(&"menu_up"):
		_select_option(selected_option - 1)
	elif event.is_action(&"menu_down"):
		_select_option(selected_option + 1)
	elif event.is_action(&"menu_left") or event.is_action(&"menu_right") or event.is_action(&"menu_accept"):
		_change_option(selected_option)
	elif event.is_action(&"menu_cancel"):
		SettingsManager.flush()
		SoundManager.cancel.play()
		Global.change_scene_to(Constants.MAIN_MENU_SCENE, &"fade")


func _process(delta: float) -> void:
	for star in get_tree().get_nodes_in_group(&"menu_stars"):
		star.position.x -= float(star.get_meta("speed", 8.0)) * delta
		if star.position.x < -850.0:
			star.position.x = 4050.0
