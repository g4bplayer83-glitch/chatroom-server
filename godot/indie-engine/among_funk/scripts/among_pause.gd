extends Node2D

const FONT: Font = preload("res://among_funk/codename/fonts/vcr.ttf")
const PANEL := "res://among_funk/codename/images/Menu_Corner.png"
const QUICK_ACTIONS: Array[String] = ["downscroll", "ghost_tapping", "note_splashes", "camera_beat_zoom", "gameplay_shaders", "back"]
const QUICK_LABELS: Array[String] = ["DOWN SCROLL", "GHOST TAPPING", "NOTE SPLASHES", "CAMERA BEAT ZOOM", "GAMEPLAY SHADERS", "BACK"]
const CONTROL_ACTIONS: Array[String] = ["note_left", "note_down", "note_up", "note_right", "pause", "menu_accept", "menu_cancel"]
const CONTROL_LABELS: Array[String] = ["NOTE LEFT", "NOTE DOWN", "NOTE UP", "NOTE RIGHT", "PAUSE", "MENU ACCEPT", "MENU BACK"]

var main_buttons: Array[Button] = []
var quick_buttons: Array[Button] = []
var control_buttons: Array[Button] = []
var active_page := "main"
var selected := 0
var input_delay := 0.12
var canvas: CanvasLayer
var pause_content: Control
var inspect_button: TextureButton
var quick_title: Label
var quick_hint: Label
var footer: Label
var pause_music: AudioStreamPlayer
var inspection_mode := false
var waiting_for_bind := false
var waiting_control_index := -1
var main_actions: Array[String] = ["resume", "restart", "quick", "controls", "exit"]
var main_labels: Array[String] = ["RESUME", "RESTART SONG", "QUICK OPTIONS", "CHANGE CONTROLS", "EXIT TO MENU"]


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if GameManager.play_mode == GameManager.PLAY_MODE.CHARTING:
		main_actions.insert(4, "chart")
		main_labels.insert(4, "RETURN TO CHART EDITOR")
	_build_pause()
	_play_pause_theme()
	_select(0, false)


func _build_pause() -> void:
	canvas = CanvasLayer.new()
	canvas.layer = 127
	add_child(canvas)
	pause_content = Control.new()
	pause_content.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	canvas.add_child(pause_content)

	var dim := ColorRect.new()
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.color = Color("C9000000")
	pause_content.add_child(dim)

	var title := _label("PAUSED", Vector2(0, 35), Vector2(1280, 58), 48, Color("C0D1D4"), pause_content)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var song_name := GameManager.current_song.title if GameManager.current_song else "AMONG FUNK"
	var song := _label("%s  •  %s" % [song_name.to_upper(), GameManager.difficulty.to_upper()], Vector2(0, 91), Vector2(1280, 30), 17, Color("9EACAE"), pause_content)
	song.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	# Only one terminal is visible at a time. The previous two-panel layout made
	# Quick Options look active even while keyboard focus was still on Resume.
	_texture(PANEL, Vector2(350, 140), Vector2(580, 500), pause_content).stretch_mode = TextureRect.STRETCH_SCALE
	quick_title = _label("PAUSE MENU", Vector2(390, 172), Vector2(500, 42), 29, Color("C0D1D4"), pause_content)
	quick_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	var main_spacing := 60.0 if main_actions.size() > 5 else 72.0
	for index in main_actions.size():
		var button := _button(main_labels[index], Vector2(400, 220 + index * main_spacing), Vector2(480, 50), pause_content)
		button.mouse_entered.connect(_mouse_select.bind("main", index))
		button.pressed.connect(_activate.bind("main", index))
		main_buttons.append(button)
	for index in QUICK_ACTIONS.size():
		var button := _button("", Vector2(400, 220 + index * 58), Vector2(480, 46), pause_content)
		button.mouse_entered.connect(_mouse_select.bind("quick", index))
		button.pressed.connect(_activate.bind("quick", index))
		quick_buttons.append(button)
	for index in CONTROL_ACTIONS.size():
		var button := _button("", Vector2(400, 214 + index * 48), Vector2(480, 40), pause_content)
		button.add_theme_font_size_override(&"font_size", 18)
		button.mouse_entered.connect(_mouse_select.bind("controls", index))
		button.pressed.connect(_activate.bind("controls", index))
		button.visible = false
		control_buttons.append(button)

	quick_hint = _label("", Vector2(395, 576), Vector2(490, 44), 14, Color("8DA6A8"), pause_content)
	quick_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	quick_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	footer = _label("↑ ↓  SELECT     ENTER  CONFIRM     ESC  RESUME / BACK", Vector2(0, 675), Vector2(1280, 30), 18, Color("9EACAE"), pause_content)
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	inspect_button = TextureButton.new()
	inspect_button.name = "InspectGameButton"
	inspect_button.texture_normal = ResourceLoader.load("res://among_funk/codename/images/impostor_float.png")
	inspect_button.ignore_texture_size = true
	inspect_button.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	inspect_button.position = Vector2(1160, 590)
	inspect_button.size = Vector2(88, 88)
	inspect_button.tooltip_text = "Hide/show pause UI while the game stays paused"
	inspect_button.pressed.connect(_toggle_inspection)
	canvas.add_child(inspect_button)

	_refresh_quick_labels()
	_refresh_control_labels()
	_show_page("main")


func _play_pause_theme() -> void:
	if not ResourceLoader.exists(AmongFunkManager.PAUSE_MUSIC):
		return
	pause_music = AudioStreamPlayer.new()
	pause_music.name = "Among Pause Theme"
	pause_music.process_mode = Node.PROCESS_MODE_ALWAYS
	pause_music.bus = &"Music"
	pause_music.stream = SoundManager.get_stream(AmongFunkManager.PAUSE_MUSIC)
	if pause_music.stream is AudioStreamOggVorbis:
		(pause_music.stream as AudioStreamOggVorbis).loop = true
	add_child(pause_music)
	pause_music.play()


func _texture(path: String, position_value: Vector2, size_value: Vector2, parent: Node) -> TextureRect:
	var output := TextureRect.new()
	output.texture = ResourceLoader.load(path)
	output.position = position_value
	output.size = size_value
	output.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	output.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	output.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(output)
	return output


func _label(text_value: String, position_value: Vector2, size_value: Vector2, font_size: int, color: Color, parent: Node) -> Label:
	var output := Label.new()
	output.text = text_value
	output.position = position_value
	output.size = size_value
	output.add_theme_font_override(&"font", FONT)
	output.add_theme_font_size_override(&"font_size", font_size)
	output.add_theme_color_override(&"font_color", color)
	output.add_theme_color_override(&"font_outline_color", Color.BLACK)
	output.add_theme_constant_override(&"outline_size", 2)
	parent.add_child(output)
	return output


func _button(text_value: String, position_value: Vector2, size_value: Vector2, parent: Node) -> Button:
	var output := Button.new()
	output.text = text_value
	output.position = position_value
	output.size = size_value
	# Godot's built-in focus navigation would otherwise run in addition to our
	# custom menu actions and could move the highlight twice for one key press.
	output.focus_mode = Control.FOCUS_NONE
	output.alignment = HORIZONTAL_ALIGNMENT_LEFT
	output.add_theme_font_override(&"font", FONT)
	output.add_theme_font_size_override(&"font_size", 22)
	output.add_theme_stylebox_override(&"normal", _style(Color("51696B"), Color("6B7E80"), 2))
	output.add_theme_stylebox_override(&"hover", _style(Color("6B8A8C"), Color("7CFFD9"), 3))
	output.add_theme_stylebox_override(&"pressed", _style(Color("7DA09B"), Color.WHITE, 3))
	parent.add_child(output)
	return output


func _style(background: Color, border: Color, width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(width)
	style.content_margin_left = 16
	return style


func _mouse_select(page: String, index: int) -> void:
	if waiting_for_bind or inspection_mode or active_page != page:
		return
	selected = index
	_select(selected)


func _show_page(page: String, preferred_index: int = 0) -> void:
	active_page = page
	for button in main_buttons:
		button.visible = page == "main"
	for button in quick_buttons:
		button.visible = page == "quick"
	for button in control_buttons:
		button.visible = page == "controls"
	if page == "controls":
		quick_title.text = "CHANGE CONTROLS"
		quick_hint.text = "ENTER selects a control. Press a new key, or ESC to cancel."
		footer.text = "↑ ↓  SELECT     ENTER  REBIND     ESC  BACK"
		_refresh_control_labels()
	elif page == "quick":
		quick_title.text = "QUICK OPTIONS"
		quick_hint.text = "Changes are saved and applied to this song immediately."
		footer.text = "↑ ↓  SELECT     ← → / ENTER  CHANGE     ESC  BACK"
	else:
		quick_title.text = "PAUSE MENU"
		quick_hint.text = ""
		footer.text = "↑ ↓  SELECT     ENTER  CONFIRM     ESC  RESUME"
	selected = preferred_index
	_select(selected, false)


func _select(index: int, play_sound: bool = true) -> void:
	var count := _page_buttons().size()
	if count <= 0:
		return
	selected = wrapi(index, 0, count)
	for button_index in main_buttons.size():
		main_buttons[button_index].modulate = Color.WHITE if active_page == "main" and button_index == selected else Color(0.55, 0.61, 0.62)
	for button_index in quick_buttons.size():
		quick_buttons[button_index].modulate = Color.WHITE if active_page == "quick" and button_index == selected else Color(0.55, 0.61, 0.62)
	for button_index in control_buttons.size():
		control_buttons[button_index].modulate = Color.WHITE if active_page == "controls" and button_index == selected else Color(0.55, 0.61, 0.62)
	if play_sound:
		SoundManager.scroll.play()


func _page_buttons() -> Array:
	if active_page == "quick":
		return quick_buttons
	if active_page == "controls":
		return control_buttons
	return main_buttons


func _activate(page: String, index: int) -> void:
	if waiting_for_bind or inspection_mode or active_page != page:
		return
	selected = index
	if page == "quick":
		var action := QUICK_ACTIONS[index]
		if action == "back":
			_show_page("main", 2)
			return
		var section := SettingsManager.SEC_GAMEPLAY if action in ["downscroll", "ghost_tapping"] else SettingsManager.SEC_PREFERENCES
		var enabled := not bool(SettingsManager.get_value(section, action, false))
		SettingsManager.set_value(section, action, enabled)
		SettingsManager.flush()
		_apply_live_option(action, enabled)
		_refresh_quick_labels()
		_select(selected)
		return
	if page == "controls":
		waiting_for_bind = true
		waiting_control_index = index
		control_buttons[index].text = "%s             PRESS A KEY..." % CONTROL_LABELS[index]
		quick_hint.text = "Waiting for a keyboard key. ESC cancels."
		SoundManager.accept.play()
		return
	match main_actions[index]:
		"resume": _resume()
		"restart":
			get_tree().paused = false
			get_tree().reload_current_scene()
		"quick":
			_show_page("quick", 0)
		"controls":
			_show_page("controls", 0)
		"chart":
			get_tree().paused = false
			Global.change_scene_to(Constants.CHART_EDITOR_SCENE, &"fade")
		"exit":
			get_tree().paused = false
			GameManager.reset_stats()
			Global.change_scene_to(Constants.FREEPLAY_MENU_SCENE if GameManager.freeplay else Constants.STORY_MODE_MENU_SCENE, &"fade")


func _apply_live_option(action: String, enabled: bool) -> void:
	var host := get_parent()
	if is_instance_valid(host) and host.has_method(&"apply_quick_option"):
		host.call(&"apply_quick_option", action, enabled)


func _refresh_quick_labels() -> void:
	for index in QUICK_ACTIONS.size():
		var action := QUICK_ACTIONS[index]
		if action == "back":
			quick_buttons[index].text = QUICK_LABELS[index]
			continue
		var section := SettingsManager.SEC_GAMEPLAY if action in ["downscroll", "ghost_tapping"] else SettingsManager.SEC_PREFERENCES
		var value := "ON" if bool(SettingsManager.get_value(section, action, false)) else "OFF"
		quick_buttons[index].text = "%s              %s" % [QUICK_LABELS[index], value]


func _refresh_control_labels() -> void:
	for index in CONTROL_ACTIONS.size():
		var binds: Array = SettingsManager.get_keybind(CONTROL_ACTIONS[index])
		var key_name := "UNBOUND"
		if not binds.is_empty() and int(binds[0]) != KEY_NONE:
			key_name = OS.get_keycode_string(int(binds[0]))
		control_buttons[index].text = "%s              %s" % [CONTROL_LABELS[index], key_name]


func _input(event: InputEvent) -> void:
	if not waiting_for_bind or event is not InputEventKey:
		return
	var key_event := event as InputEventKey
	if not key_event.pressed or key_event.echo:
		return
	if key_event.keycode == KEY_ESCAPE:
		waiting_for_bind = false
		waiting_control_index = -1
		quick_hint.text = "Rebind cancelled."
		_refresh_control_labels()
		get_viewport().set_input_as_handled()
		return
	var keycode := key_event.physical_keycode if key_event.physical_keycode != KEY_NONE else key_event.keycode
	var action := CONTROL_ACTIONS[waiting_control_index]
	var binds: Array = SettingsManager.get_keybind(action)
	if binds.is_empty():
		binds = [keycode]
		SettingsManager.set_value(SettingsManager.SEC_KEY_BINDS, action, binds)
	else:
		SettingsManager.set_keybind(action, keycode, 0)
	SettingsManager.flush()
	SettingsManager.load_keybinds()
	waiting_for_bind = false
	waiting_control_index = -1
	input_delay = 0.18
	quick_hint.text = "%s updated." % CONTROL_LABELS[selected]
	_refresh_control_labels()
	SoundManager.accept.play()
	get_viewport().set_input_as_handled()


func _toggle_inspection() -> void:
	inspection_mode = not inspection_mode
	pause_content.visible = not inspection_mode
	inspect_button.modulate = Color(0.65, 1.0, 0.95, 0.72) if inspection_mode else Color.WHITE
	inspect_button.tooltip_text = "Show pause UI" if inspection_mode else "Hide pause UI while the game stays paused"


func _resume() -> void:
	get_tree().paused = false
	Signals.play_unpaused.emit()
	queue_free()


func _process(delta: float) -> void:
	if input_delay > 0.0:
		input_delay -= delta
		return
	if waiting_for_bind:
		return
	if inspection_mode:
		if Input.is_action_just_pressed(&"menu_cancel"):
			_toggle_inspection()
		return
	if Input.is_action_just_pressed(&"menu_up"):
		_select(selected - 1)
	elif Input.is_action_just_pressed(&"menu_down"):
		_select(selected + 1)
	elif Input.is_action_just_pressed(&"menu_accept"):
		_activate(active_page, selected)
	elif Input.is_action_just_pressed(&"menu_cancel"):
		if active_page == "quick" or active_page == "controls":
			_show_page("main", 2 if active_page == "quick" else 3)
		else:
			_resume()
