extends AmongFunkMenuBase

const WEEKS: Array[Dictionary] = [
	{"title": "WEEK 1", "subtitle": "POLUS PROBLEMS", "action": "start", "songs": "Sussus Moogus  [SOON]\nSabotage\nDiscover\nMeltdown", "position": Vector2(150, 550)},
	{"title": "WEEK 2", "subtitle": "COMING SOON", "action": "locked", "songs": "???\n???", "position": Vector2(450, 550)},
	{"title": "BONUS", "subtitle": "IMPOSTOR SYNDROME", "action": "bonus", "songs": "Mando\nDlow", "position": Vector2(750, 550)},
	{"title": "WEEK 4", "subtitle": "COMING SOON", "action": "locked", "songs": "???\n???", "position": Vector2(1050, 550)}
]

var week_buttons: Array[Button] = []
var week_nodes: Array[ColorRect] = []
var week_centers: Array[ColorRect] = []
var ship: TextureRect
var week_title: Label
var week_subtitle: Label
var score_text: Label
var songs_text: Label
var status_text: Label
var lock_icon: TextureRect
var selected_week := 0
var anim_time := 0.0


func _ready() -> void:
	AmongFunkManager.play_menu_music()
	Global.set_window_title("Among Funk — Story Mode")
	_build_background()
	_build_story_layout()
	_select_week(0, false)


func _build_story_layout() -> void:
	var outer := ColorRect.new()
	outer.position = Vector2(20, 20)
	outer.size = Vector2(1240, 220)
	outer.color = Color("9EACAE")
	add_child(outer)
	var inner := ColorRect.new()
	inner.position = Vector2(26, 26)
	inner.size = Vector2(1228, 208)
	inner.color = Color("C0D1D4")
	add_child(inner)
	var divider := ColorRect.new()
	divider.position = Vector2(0, 240)
	divider.size = Vector2(1280, 7)
	divider.color = Color.WHITE
	add_child(divider)

	week_title = add_label("", Vector2(0, 37), Vector2(1280, 78), 66, Color.WHITE)
	week_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	week_subtitle = add_label("", Vector2(0, 110), Vector2(1280, 50), 34, Color.WHITE)
	week_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	score_text = add_label("", Vector2(45, 176), Vector2(450, 32), 20, Color.WHITE)
	songs_text = add_label("", Vector2(835, 42), Vector2(365, 135), 24, Color.WHITE)
	songs_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	status_text = add_label("", Vector2(415, 183), Vector2(450, 25), 17, Color("365A59"))
	status_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lock_icon = add_texture("res://among_funk/codename/images/lock.png", Vector2(610, 132), Vector2(58, 58))

	for index in WEEKS.size() - 1:
		var start: Vector2 = WEEKS[index]["position"]
		var finish: Vector2 = WEEKS[index + 1]["position"]
		var dot_x := start.x + 30.0
		while dot_x < finish.x - 20.0:
			var dot := ColorRect.new()
			dot.position = Vector2(dot_x, start.y - 3.0)
			dot.size = Vector2(15, 6)
			dot.color = Color(1, 1, 1, 0.55)
			add_child(dot)
			dot_x += 30.0

	for index in WEEKS.size():
		var node_position: Vector2 = WEEKS[index]["position"]
		var outer_node := ColorRect.new()
		outer_node.position = node_position - Vector2(20, 20)
		outer_node.size = Vector2(40, 40)
		outer_node.pivot_offset = Vector2(20, 20)
		outer_node.color = Color.WHITE
		add_child(outer_node)
		week_nodes.append(outer_node)
		var center_node := ColorRect.new()
		center_node.position = node_position - Vector2(15, 15)
		center_node.size = Vector2(30, 30)
		center_node.color = Color("51696B")
		add_child(center_node)
		week_centers.append(center_node)
		var label := add_label(str(WEEKS[index]["title"]), node_position + Vector2(-70, 38), Vector2(140, 25), 15, Color.WHITE)
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		var button := Button.new()
		button.position = node_position - Vector2(40, 40)
		button.size = Vector2(80, 80)
		button.flat = true
		button.modulate.a = 0.0
		button.mouse_entered.connect(_select_week.bind(index, true))
		button.pressed.connect(_activate_week.bind(index))
		add_child(button)
		week_buttons.append(button)

	ship = add_texture("res://among_funk/codename/images/ship_icon.png", Vector2(119, 464), Vector2(62, 62))
	ship.pivot_offset = ship.size * 0.5
	var footer := add_label("LEFT / RIGHT  SELECT WEEK      ENTER  START      ESC  BACK", Vector2(0, 665), Vector2(1280, 30), 17, Color("8DA6A8"))
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _select_week(index: int, play_sound: bool = true) -> void:
	selected_week = wrapi(index, 0, WEEKS.size())
	for button_index in week_nodes.size():
		var locked := _is_locked(button_index)
		week_nodes[button_index].modulate.a = 0.45 if locked else 1.0
		week_centers[button_index].modulate.a = 0.45 if locked else 1.0
		week_centers[button_index].color = Color.BLACK if locked else (Color("54E6CF") if button_index == selected_week else Color("51696B"))
		week_nodes[button_index].scale = Vector2.ONE * (1.2 if button_index == selected_week else 1.0)
	var selected_position: Vector2 = WEEKS[selected_week]["position"]
	var target_position := selected_position + Vector2(-31, -86)
	if play_sound and is_instance_valid(ship):
		create_tween().set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT).tween_property(ship, "position", target_position, 0.28)
	else:
		ship.position = target_position
	_update_panel()
	if play_sound:
		SoundManager.scroll.play()


func _is_locked(index: int) -> bool:
	var action := str(WEEKS[index]["action"])
	return action == "locked" or (action == "bonus" and not AmongFunkManager.is_week1_complete())


func _update_panel() -> void:
	var week := WEEKS[selected_week]
	var locked := _is_locked(selected_week)
	lock_icon.visible = locked
	week_title.text = "???" if locked else str(week["title"])
	week_subtitle.text = str(week["subtitle"])
	songs_text.text = "???\n???\n???" if locked else str(week["songs"])
	if locked:
		score_text.text = "LOCKED"
		status_text.text = "Complete the required week or wait for a future update."
		status_text.modulate = Color("783D3D")
	elif str(week["action"]) == "start":
		score_text.text = "WEEK 1  /  3 SONGS PLAYABLE"
		status_text.text = "Sussus Moogus will be added when its chart is ready."
		status_text.modulate = Color("365A59")
	else:
		score_text.text = "BONUS SONGS"
		status_text.text = "Press ENTER to open the Bonus songs."
		status_text.modulate = Color("365A59")


func _activate_week(index: int) -> void:
	if locked:
		return
	selected_week = index
	var action := str(WEEKS[index]["action"])
	if action == "start" and not _is_locked(index):
		SoundManager.accept.play()
		await _launch_selected_week(false)
	elif action == "bonus" and not _is_locked(index):
		SoundManager.accept.play()
		await _launch_selected_week(true)
	else:
		SoundManager.cancel.play()


func _launch_selected_week(open_bonus: bool) -> void:
	locked = true
	for button in week_buttons:
		button.disabled = true
	var fly := create_tween().set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_IN)
	fly.tween_property(ship, "position:x", 1400.0, 0.58)
	await fly.finished
	if not is_inside_tree():
		return
	var camera_fly := create_tween().set_parallel(true).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_IN_OUT)
	camera_fly.tween_property(menu_camera, "position:x", 1510.0, 0.72)
	camera_fly.tween_property(menu_camera, "zoom", Vector2.ONE * 1.08, 0.72)
	var fade := create_tween()
	fade.tween_interval(0.22)
	fade.tween_property(transition_fade, "modulate:a", 1.0, 0.48).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	await camera_fly.finished
	if not is_inside_tree():
		return
	if open_bonus:
		AmongFunkManager.requested_freeplay_week = 2
		Global.change_scene_to(Constants.FREEPLAY_MENU_SCENE, null)
	else:
		AmongFunkManager.start_story(true)


func _unhandled_input(event: InputEvent) -> void:
	if locked or not event.is_pressed() or event.is_echo():
		return
	if event.is_action(&"menu_left") or event.is_action(&"menu_up"):
		_select_week(selected_week - 1)
	elif event.is_action(&"menu_right") or event.is_action(&"menu_down"):
		_select_week(selected_week + 1)
	elif event.is_action(&"menu_accept"):
		_activate_week(selected_week)
	elif event.is_action(&"menu_cancel"):
		SoundManager.cancel.play()
		Global.change_scene_to(Constants.MAIN_MENU_SCENE, &"fade")


func _process(delta: float) -> void:
	for star in get_tree().get_nodes_in_group(&"menu_stars"):
		star.position.x -= float(star.get_meta("speed", 8.0)) * delta
		if star.position.x < -850.0:
			star.position.x = 4050.0
