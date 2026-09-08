extends AmongFunkMenuBase

const WEEK_NAMES: Array[String] = ["WEEK 1", "WEEK 2", "BONUS", "WEEK 4"]

var current_week := 0
var current_song := 0
var song_items: Array[Dictionary] = []
var song_buttons: Array[Button] = []
var song_status_labels: Array[Label] = []
var preview_image: TextureRect
var song_title: Label
var creator_label: Label
var charter_label: Label
var difficulty_label: Label
var score_label: Label
var availability_label: Label
var week_label: Label
var week_status_label: Label
var lock_icon: TextureRect
var week_background: TextureRect
var character_preview: AnimatedSprite2D
var unlock_popup: PanelContainer


func _ready() -> void:
	current_week = clampi(AmongFunkManager.requested_freeplay_week, 0, 3)
	AmongFunkManager.requested_freeplay_week = 0
	AmongFunkManager.play_menu_music("res://among_funk/codename/music/freeplayMenu.ogg")
	Global.set_window_title("Among Funk — Freeplay")
	_build_background()
	_build_freeplay_layout()
	_refresh_week(false)
	if AmongFunkManager.consume_week2_unlock():
		_show_unlock_popup("WEEK 2 UNLOCKED  //  GOOD-TIMES + NO-MORE-TASKS")


func _build_freeplay_layout() -> void:
	week_background = add_texture("res://among_funk/codename/images/freeplay/week1_polus_bg.png", Vector2(0, 200), Vector2(1280, 520))
	week_background.stretch_mode = TextureRect.STRETCH_SCALE
	week_background.z_index = -96
	var shade := ColorRect.new()
	shade.position = Vector2(0, 164)
	shade.size = Vector2(1280, 556)
	shade.color = Color(0, 0, 0, 0.27)
	shade.z_index = -95
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	var top_strip := ColorRect.new()
	top_strip.size = Vector2(1280, 164)
	top_strip.color = Color(0, 0, 0, 0.74)
	top_strip.z_index = -95
	top_strip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(top_strip)

	var title := add_label("FREEPLAY", Vector2(0, 18), Vector2(1280, 72), 58, Color.WHITE)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_constant_override(&"outline_size", 4)
	week_label = add_label("", Vector2(520, 106), Vector2(240, 43), 31, Color.WHITE)
	week_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var left_arrow := add_label("<", Vector2(460, 102), Vector2(60, 48), 42, Color("54E6CF"))
	left_arrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var right_arrow := add_label(">", Vector2(760, 102), Vector2(60, 48), 42, Color("54E6CF"))
	right_arrow.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_add_week_arrow_button(Vector2(460, 102), -1)
	_add_week_arrow_button(Vector2(760, 102), 1)
	var info := add_label("LEFT / RIGHT  CHANGE WEEK", Vector2(0, 144), Vector2(1280, 24), 16, Color("8DA6A8"))
	info.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	var border := Panel.new()
	border.position = Vector2(48, 202)
	border.size = Vector2(560, 470)
	border.add_theme_stylebox_override(&"panel", make_terminal_style(Color("2B3435"), Color("9EACAE"), 4))
	add_child(border)
	var panel := Panel.new()
	panel.position = Vector2(658, 206)
	panel.size = Vector2(564, 462)
	panel.add_theme_stylebox_override(&"panel", make_terminal_style(Color(0.04, 0.04, 0.04, 0.82), Color("9EACAE"), 2))
	add_child(panel)

	preview_image = add_texture("", Vector2(740, 250), Vector2(390, 180))
	preview_image.visible = false
	character_preview = AnimatedSprite2D.new()
	character_preview.name = "Moogusred Preview"
	character_preview.sprite_frames = CNEAtlas.build_all_frames(
		"res://among_funk/codename/images/characters/Moogusred.png",
		"res://among_funk/codename/images/characters/Moogusred.xml"
	)
	character_preview.position = Vector2(940, 356)
	character_preview.scale = Vector2.ONE * 0.58
	character_preview.z_index = 2
	add_child(character_preview)
	if character_preview.sprite_frames and character_preview.sprite_frames.has_animation(&"idle"):
		character_preview.sprite_frames.set_animation_speed(&"idle", 12.0)
		character_preview.play(&"idle")

	week_status_label = add_label("", Vector2(686, 226), Vector2(500, 28), 16, Color("D6D6D6"))
	song_title = add_label("", Vector2(685, 444), Vector2(500, 44), 31, Color.WHITE)
	song_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	creator_label = add_label("", Vector2(695, 492), Vector2(480, 26), 17, Color("54E6CF"))
	creator_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	charter_label = add_label("", Vector2(695, 520), Vector2(480, 26), 17, Color("8DA6A8"))
	charter_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	difficulty_label = add_label("", Vector2(695, 552), Vector2(480, 26), 19, Color.WHITE)
	difficulty_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	score_label = add_label("", Vector2(695, 582), Vector2(480, 24), 16, Color("D0DFDF"))
	score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	availability_label = add_label("", Vector2(695, 615), Vector2(480, 24), 16, Color.WHITE)
	availability_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lock_icon = add_texture("res://among_funk/codename/images/lock.png", Vector2(895, 300), Vector2(90, 90))
	var footer := add_label("UP / DOWN SELECT   LEFT / RIGHT WEEK   ENTER PLAY   O UNLOCK   L RESET   ESC BACK", Vector2(0, 686), Vector2(1280, 28), 16, Color("BFC8C8"))
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _add_week_arrow_button(position_value: Vector2, direction: int) -> void:
	var button := Button.new()
	button.position = position_value
	button.size = Vector2(60, 48)
	button.flat = true
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(_change_week.bind(direction))
	add_child(button)


func _week_items(week: int) -> Array[Dictionary]:
	var output: Array[Dictionary] = []
	if week == 0:
		output.append({"title": "SUSSUS MOOGUS", "action": "locked", "creator": "COMING SOON", "charter": "", "available": false})
	elif week == 1:
		output.append({"title": "GOOD-TIMES", "action": "locked", "creator": "TBA", "charter": "TBA", "available": false})
		output.append({"title": "NO-MORE-TASKS", "action": "locked", "creator": "TBA", "charter": "TBA", "available": false})
	elif week == 3:
		output.append({"title": "???", "action": "locked", "creator": "COMING SOON", "charter": "", "available": false})
		output.append({"title": "???", "action": "locked", "creator": "COMING SOON", "charter": "", "available": false})
	for raw_info in AmongFunkManager.get_songs():
		if raw_info is not Dictionary:
			continue
		var item: Dictionary = raw_info
		if int(item.get("week", -1)) != week:
			continue
		var copy: Dictionary = item.duplicate(true)
		copy["action"] = str(item.get("id", ""))
		copy["available"] = true
		output.append(copy)
	return output


func _refresh_week(play_sound: bool = true) -> void:
	for button in song_buttons:
		button.queue_free()
	song_buttons.clear()
	for status in song_status_labels:
		status.queue_free()
	song_status_labels.clear()
	song_items = _week_items(current_week)
	week_label.text = WEEK_NAMES[current_week]
	for index in song_items.size():
		var button := Button.new()
		button.position = Vector2(78, 234 + index * 99)
		button.size = Vector2(500, 78)
		button.text = str(song_items[index].get("title", song_items[index].get("id", "SONG")))
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.focus_mode = Control.FOCUS_NONE
		button.add_theme_font_override(&"font", menu_font)
		button.add_theme_font_size_override(&"font_size", 28)
		button.add_theme_stylebox_override(&"normal", make_terminal_style(Color("7B1630"), Color("9C3A51"), 2))
		button.add_theme_stylebox_override(&"hover", make_terminal_style(Color("5A6E71"), Color("7CFFD9"), 3))
		button.add_theme_stylebox_override(&"pressed", make_terminal_style(Color("7DA09B"), Color.WHITE, 3))
		button.mouse_entered.connect(_select_song.bind(index, true))
		button.pressed.connect(_activate_song.bind(index))
		add_child(button)
		song_buttons.append(button)
		var status := add_label("", Vector2(425, 259 + index * 99), Vector2(115, 24), 16, Color("D0DFDF"))
		status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		status.mouse_filter = Control.MOUSE_FILTER_IGNORE
		song_status_labels.append(status)
	current_song = 0
	_select_song(0, play_sound)


func _is_current_week_unlocked() -> bool:
	return current_week == 0 or (current_week in [1, 2] and AmongFunkManager.is_week1_complete())


func _select_song(index: int, play_sound: bool = true) -> void:
	if song_items.is_empty():
		return
	current_song = wrapi(index, 0, song_items.size())
	var unlocked := _is_current_week_unlocked()
	for button_index in song_buttons.size():
		var active := button_index == current_song
		song_buttons[button_index].position.x = 88.0 if active else 78.0
		song_buttons[button_index].modulate = Color.WHITE if active else Color(1, 1, 1, 0.75)
		song_status_labels[button_index].position.x = 435.0 if active else 425.0
		if not unlocked:
			song_status_labels[button_index].text = "LOCKED"
		elif bool(song_items[button_index].get("available", false)):
			song_status_labels[button_index].text = "HARD"
		else:
			song_status_labels[button_index].text = "SOON"
	var info := song_items[current_song]
	song_title.text = str(info.get("title", info.get("id", "SONG"))).to_upper() if unlocked else "????????"
	creator_label.text = "MUSIC: %s" % str(info.get("creator", "TBA")) if unlocked else ""
	charter_label.text = "CHART: %s" % str(info.get("charter", "TBA")) if unlocked else ""
	var names := AmongFunkManager.difficulty_names(info)
	difficulty_label.text = "DIFFICULTY  /  %s" % str(names[0]).to_upper() if unlocked and not names.is_empty() else ""
	score_label.text = "BEST SCORE: %s" % Global.format_number(AmongFunkManager.get_highscore(str(info.get("id", "")), str(names[0]) if not names.is_empty() else "hard")) if unlocked and bool(info.get("available", false)) else ""
	availability_label.text = "PRESS ENTER TO PLAY" if bool(info.get("available", false)) else "COMING SOON  //  CHART NOT INCLUDED YET"
	availability_label.modulate = Color("65E8A0") if bool(info.get("available", false)) else Color("FFC35B")
	if not unlocked:
		availability_label.text = "COMPLETE WEEK 1 TO UNLOCK THIS TAB"
		availability_label.modulate = Color("FF7777")
	week_status_label.text = "WEEK 1  //  POLUS PROBLEMS" if current_week == 0 else ("%s  //  UNLOCKED DATA" % WEEK_NAMES[current_week] if unlocked else "CREW DATA ENCRYPTED")
	lock_icon.visible = not unlocked
	character_preview.visible = unlocked
	character_preview.scale = Vector2.ONE * (0.58 if current_week == 0 else 0.52)
	week_background.modulate = Color.WHITE if unlocked else Color("6D6D6D")
	if play_sound:
		SoundManager.scroll.play()


func _activate_song(index: int) -> void:
	current_song = index
	var info := song_items[index]
	if not _is_current_week_unlocked() or not bool(info.get("available", false)):
		SoundManager.cancel.play()
		return
	SoundManager.accept.play()
	var names := AmongFunkManager.difficulty_names(info)
	AmongFunkManager.start_freeplay(str(info.get("id", "")), str(names[0]) if not names.is_empty() else "hard")


func _change_week(direction: int) -> void:
	current_week = wrapi(current_week + direction, 0, WEEK_NAMES.size())
	_refresh_week()


func _show_unlock_popup(message: String) -> void:
	unlock_popup = PanelContainer.new()
	unlock_popup.position = Vector2(220, 18)
	unlock_popup.size = Vector2(840, 50)
	unlock_popup.modulate.a = 0.0
	unlock_popup.add_theme_stylebox_override(&"panel", make_terminal_style(Color(0, 0, 0, 0.9), Color("8CFFF1"), 2))
	add_child(unlock_popup)
	var message_label := add_label(message, Vector2.ZERO, unlock_popup.size, 23, Color("8CFFF1"), unlock_popup)
	message_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	message_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	var tween := create_tween()
	tween.tween_property(unlock_popup, "modulate:a", 1.0, 0.25).set_trans(Tween.TRANS_CIRC).set_ease(Tween.EASE_OUT)
	tween.tween_interval(1.2)
	tween.tween_property(unlock_popup, "modulate:a", 0.0, 0.55).set_trans(Tween.TRANS_CIRC).set_ease(Tween.EASE_IN)
	tween.tween_callback(unlock_popup.queue_free)


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	if event.is_action(&"menu_up"):
		_select_song(current_song - 1)
	elif event.is_action(&"menu_down"):
		_select_song(current_song + 1)
	elif event.is_action(&"menu_left"):
		_change_week(-1)
	elif event.is_action(&"menu_right"):
		_change_week(1)
	elif event is InputEventKey and event.physical_keycode == KEY_O:
		AmongFunkManager.mark_week1_complete()
		_refresh_week()
		_show_unlock_popup("DEV TOOL  //  WEEK 1 CLEARED  //  WEEK 2 UNLOCKED")
	elif event is InputEventKey and event.physical_keycode == KEY_L:
		AmongFunkManager.reset_week1_progress()
		_refresh_week()
		_show_unlock_popup("DEV TOOL  //  WEEK 1 SAVE RESET")
	elif event.is_action(&"menu_accept") and not song_items.is_empty():
		_activate_song(current_song)
	elif event.is_action(&"menu_cancel"):
		SoundManager.cancel.play()
		Global.change_scene_to(Constants.MAIN_MENU_SCENE, &"fade")


func _process(delta: float) -> void:
	for star in get_tree().get_nodes_in_group(&"menu_stars"):
		star.position.x -= float(star.get_meta("speed", 8.0)) * delta
		if star.position.x < -850.0:
			star.position.x = 4050.0
