extends Node2D
class_name AmongFunkMenuBase

var items: Array[Dictionary] = []
var buttons: Array[Button] = []
var selected: int = 0
var locked: bool = false
var title_label: Label
var detail_label: Label
var footer_label: Label
var preview: TextureRect
var selector: ColorRect
var menu_scroll: ScrollContainer
var preview_base_y: float = 100.0
var elapsed_time: float = 0.0
var menu_camera: Camera2D
var transition_fade: ColorRect

var menu_font: Font = preload("res://among_funk/codename/fonts/vcr.ttf")


func setup_menu(title: String, new_items: Array[Dictionary], music: String = AmongFunkManager.MENU_MUSIC) -> void:
	items = new_items
	AmongFunkManager.play_menu_music(music)
	Global.set_window_title(title)
	_build_background()
	_build_interface(title)
	_build_buttons()
	select_index(0, false)


func _build_background() -> void:
	# Menus live in a real 2D world so camera transitions can reveal more space
	# without ever leaving the star field.
	var background := ColorRect.new()
	background.name = "DeepSpace"
	background.position = Vector2(-900.0, -1900.0)
	background.size = Vector2(5000.0, 3000.0)
	background.color = Color("030714")
	background.z_index = -100
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var veil := ColorRect.new()
	veil.position = background.position
	veil.size = background.size
	veil.color = Color(0.0, 0.025, 0.09, 0.18)
	veil.z_index = -99
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(veil)
	for index in 260:
		var star := ColorRect.new()
		var size := 1.5 + float(index % 4)
		star.size = Vector2(size, size)
		star.position = Vector2(float((index * 347) % 4850) - 760.0, float((index * 193) % 2800) - 1800.0)
		star.color = Color(1.0, 1.0, 1.0, 0.28 + float(index % 6) * 0.11)
		star.set_meta("speed", 10.0 + float(index % 6) * 4.0)
		star.add_to_group(&"menu_stars")
		star.z_index = -98
		add_child(star)

	menu_camera = Camera2D.new()
	menu_camera.name = "MenuCamera"
	menu_camera.position = Vector2(640.0, 360.0)
	menu_camera.enabled = true
	menu_camera.position_smoothing_enabled = false
	add_child(menu_camera)

	var fade_canvas := CanvasLayer.new()
	fade_canvas.layer = 120
	add_child(fade_canvas)
	transition_fade = ColorRect.new()
	transition_fade.name = "MenuTransitionFade"
	transition_fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	transition_fade.color = Color.BLACK
	transition_fade.modulate.a = 1.0
	transition_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fade_canvas.add_child(transition_fade)
	# Every destination menu enters from the same black frame used by the
	# previous menu. This removes the one-frame hard cut between scene trees.
	var entrance := create_tween()
	entrance.tween_interval(0.05)
	entrance.tween_property(transition_fade, "modulate:a", 0.0, 0.36).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


func _build_interface(title: String) -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 1
	add_child(canvas)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	canvas.add_child(root)

	title_label = Label.new()
	title_label.text = title.to_upper()
	title_label.position = Vector2(55, 22)
	title_label.size = Vector2(1170, 70)
	title_label.add_theme_font_override("font", menu_font)
	title_label.add_theme_font_size_override("font_size", 52)
	title_label.add_theme_color_override("font_color", Color(0.78, 0.91, 0.92))
	title_label.add_theme_color_override("font_outline_color", Color.BLACK)
	title_label.add_theme_constant_override("outline_size", 10)
	root.add_child(title_label)

	var list_panel := Panel.new()
	list_panel.position = Vector2(45, 105)
	list_panel.size = Vector2(515, 535)
	list_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.035, 0.055, 0.06, 0.94), Color(0.61, 0.68, 0.69), 3))
	root.add_child(list_panel)

	selector = ColorRect.new()
	selector.position = Vector2(18, 23)
	selector.size = Vector2(6, 56)
	selector.color = Color(0.47, 1.0, 0.87)
	selector.mouse_filter = Control.MOUSE_FILTER_IGNORE
	list_panel.add_child(selector)

	menu_scroll = ScrollContainer.new()
	menu_scroll.position = Vector2(28, 14)
	menu_scroll.size = Vector2(474, 507)
	menu_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	menu_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	list_panel.add_child(menu_scroll)

	var list := VBoxContainer.new()
	list.name = "MenuList"
	list.custom_minimum_size = Vector2(440, 0)
	list.add_theme_constant_override("separation", 9)
	menu_scroll.add_child(list)

	var preview_panel := Panel.new()
	preview_panel.position = Vector2(600, 105)
	preview_panel.size = Vector2(630, 535)
	preview_panel.add_theme_stylebox_override("panel", _panel_style(Color(0.035, 0.055, 0.06, 0.94), Color(0.61, 0.68, 0.69), 3))
	root.add_child(preview_panel)

	preview = TextureRect.new()
	preview.position = Vector2(30, 20)
	preview.size = Vector2(570, 345)
	preview.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	preview.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	preview_panel.add_child(preview)

	detail_label = Label.new()
	detail_label.position = Vector2(28, 374)
	detail_label.size = Vector2(574, 105)
	detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	detail_label.add_theme_font_override("font", menu_font)
	detail_label.add_theme_font_size_override("font_size", 22)
	detail_label.add_theme_color_override("font_color", Color.WHITE)
	preview_panel.add_child(detail_label)

	footer_label = Label.new()
	footer_label.position = Vector2(45, 658)
	footer_label.size = Vector2(1190, 40)
	footer_label.text = "↑ ↓  SELECT    ENTER  CONFIRM    ESC  BACK    7  EDITORS"
	footer_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	footer_label.add_theme_font_override("font", menu_font)
	footer_label.add_theme_font_size_override("font_size", 18)
	footer_label.add_theme_color_override("font_color", Color(0.55, 0.8, 0.85))
	root.add_child(footer_label)


func _build_buttons() -> void:
	var list: VBoxContainer = get_tree().current_scene.find_child("MenuList", true, false)
	for index in items.size():
		var item := items[index]
		var button := Button.new()
		button.text = str(item.get("label", item.get("title", "OPTION"))).to_upper()
		button.custom_minimum_size = Vector2(450, 56)
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.add_theme_font_override("font", menu_font)
		button.add_theme_font_size_override("font_size", 27)
		button.add_theme_color_override("font_color", Color(0.72, 0.72, 0.82))
		button.add_theme_color_override("font_hover_color", Color.WHITE)
		button.add_theme_color_override("font_pressed_color", Color(0.0, 1.0, 1.0))
		button.add_theme_stylebox_override("normal", _panel_style(Color(0.18, 0.25, 0.26, 0.9), Color(0.43, 0.52, 0.53), 1))
		button.add_theme_stylebox_override("hover", _panel_style(Color(0.32, 0.42, 0.43, 1.0), Color(0.57, 1.0, 0.88), 2))
		button.add_theme_stylebox_override("pressed", _panel_style(Color(0.45, 0.76, 0.68, 1.0), Color.WHITE, 2))
		button.mouse_entered.connect(select_index.bind(index, true))
		button.pressed.connect(_activate_index.bind(index))
		list.add_child(button)
		buttons.append(button)


func _panel_style(background: Color, border: Color, width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(2)
	style.content_margin_left = 16
	style.content_margin_right = 16
	return style


func select_index(index: int, play_sound: bool = true) -> void:
	if items.is_empty():
		return
	selected = wrapi(index, 0, items.size())
	for button_index in buttons.size():
		var active := button_index == selected
		buttons[button_index].modulate = Color.WHITE if active else Color(0.72, 0.72, 0.8)
		buttons[button_index].scale = Vector2(1.02, 1.02) if active else Vector2.ONE
	menu_scroll.ensure_control_visible(buttons[selected])
	call_deferred("_sync_selector")
	var item := items[selected]
	detail_label.text = str(item.get("description", ""))
	var image_path := str(item.get("image", ""))
	preview.texture = ResourceLoader.load(image_path) if not image_path.is_empty() and ResourceLoader.exists(image_path) else null
	if play_sound:
		SoundManager.scroll.play()
	on_selection_changed(selected, item)


func _sync_selector() -> void:
	if buttons.is_empty() or not menu_scroll:
		return
	selector.position.y = 18.0 + buttons[selected].position.y - float(menu_scroll.scroll_vertical)


func _activate_index(index: int) -> void:
	if locked or index < 0 or index >= items.size():
		return
	selected = index
	locked = true
	SoundManager.accept.play()
	activate(str(items[index].get("action", "")), items[index])


func activate(_action: String, _item: Dictionary) -> void:
	locked = false


func on_selection_changed(_index: int, _item: Dictionary) -> void:
	pass


func cancel() -> void:
	SoundManager.cancel.play()
	Global.change_scene_to(Constants.MAIN_MENU_SCENE, &"fade")


func _unhandled_input(event: InputEvent) -> void:
	if locked or not event.is_pressed() or event.is_echo():
		return
	if event.is_action(&"menu_up"):
		select_index(selected - 1)
	elif event.is_action(&"menu_down"):
		select_index(selected + 1)
	elif event.is_action(&"menu_accept"):
		_activate_index(selected)
	elif event.is_action(&"menu_cancel"):
		cancel()
	elif event.is_action(&"chart_editor"):
		Global.change_scene_to(Constants.DEVELOPER_MENU_SCENE, &"fade")


func _process(delta: float) -> void:
	elapsed_time += delta
	for star in get_tree().get_nodes_in_group(&"menu_stars"):
		star.position.x -= float(star.get_meta("speed", 8.0)) * delta
		if star.position.x < -850.0:
			star.position.x = 4050.0


func transition_to_scene(scene_path: String, move_up: bool = true) -> void:
	if not is_instance_valid(menu_camera):
		Global.change_scene_to(scene_path, &"fade")
		return
	locked = true
	transition_fade.modulate.a = 0.0
	var camera_tween := create_tween().set_parallel(true)
	camera_tween.set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	camera_tween.tween_property(menu_camera, "zoom", Vector2.ONE * 1.075, 0.18)
	camera_tween.tween_property(menu_camera, "zoom", Vector2.ONE, 0.20).set_delay(0.18)
	if move_up:
		camera_tween.tween_property(menu_camera, "position:y", -70.0, 0.52).set_delay(0.28)
	else:
		camera_tween.tween_property(menu_camera, "position", menu_camera.position, 0.76)
	var fade_tween := create_tween()
	fade_tween.tween_interval(0.50)
	fade_tween.tween_property(transition_fade, "modulate:a", 1.0, 0.34).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	await fade_tween.finished
	if is_inside_tree():
		# The screen is already fully black here. Passing no transition avoids
		# stacking NoahEngine's default fade over the Among Funk camera move.
		Global.change_scene_to(scene_path, null)


func add_texture(path: String, position_value: Vector2, size_value: Vector2, parent: Node = null) -> TextureRect:
	var texture_rect := TextureRect.new()
	if not path.is_empty() and ResourceLoader.exists(path):
		texture_rect.texture = ResourceLoader.load(path)
	texture_rect.position = position_value
	texture_rect.size = size_value
	texture_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	texture_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	texture_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var target_parent: Node = self if parent == null else parent
	target_parent.add_child(texture_rect)
	return texture_rect


func add_label(text_value: String, position_value: Vector2, size_value: Vector2, font_size: int, color: Color = Color.WHITE, parent: Node = null) -> Label:
	var label := Label.new()
	label.text = text_value
	label.position = position_value
	label.size = size_value
	label.add_theme_font_override(&"font", menu_font)
	label.add_theme_font_size_override(&"font_size", font_size)
	label.add_theme_color_override(&"font_color", color)
	label.add_theme_color_override(&"font_outline_color", Color.BLACK)
	label.add_theme_constant_override(&"outline_size", 2)
	var target_parent: Node = self if parent == null else parent
	target_parent.add_child(label)
	return label


func make_terminal_style(background: Color = Color("51696B"), border: Color = Color("9EACAE"), width: int = 2) -> StyleBoxFlat:
	return _panel_style(background, border, width)
