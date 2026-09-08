extends CanvasLayer

const FONT: Font = preload("res://among_funk/codename/fonts/vcr.ttf")
const NOTE_ACTIONS: Array[StringName] = [&"note_left", &"note_down", &"note_up", &"note_right"]
const NOTE_LABELS: Array[String] = ["<", "V", "^", ">"]
const NOTE_COLORS: Array[Color] = [Color("B45CFF"), Color("5DE4FF"), Color("61F18A"), Color("FF5D72")]


func _ready() -> void:
	layer = 105
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = AmongFunkManager.is_mobile()
	if not visible:
		return
	for index in NOTE_ACTIONS.size():
		_create_touch_button(NOTE_ACTIONS[index], NOTE_LABELS[index], NOTE_COLORS[index], Vector2(322 + index * 152, 520), Vector2(140, 125))
	_create_touch_button(&"pause", "II", Color("8DA6A8"), Vector2(1186, 18), Vector2(72, 64))


func _create_touch_button(action: StringName, label_text: String, color: Color, position_value: Vector2, size_value: Vector2) -> void:
	var button := TouchScreenButton.new()
	button.name = str(action).capitalize()
	button.position = position_value + size_value * 0.5
	button.action = action
	button.passby_press = false
	var shape := RectangleShape2D.new()
	shape.size = size_value
	button.shape = shape
	button.shape_centered = true
	add_child(button)

	var panel := Panel.new()
	panel.name = "Visual"
	panel.position = -size_value * 0.5
	panel.size = size_value
	panel.pivot_offset = size_value * 0.5
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.modulate.a = 0.58
	var style := StyleBoxFlat.new()
	style.bg_color = Color(color.r, color.g, color.b, 0.32)
	style.border_color = Color(color.r, color.g, color.b, 0.92)
	style.set_border_width_all(4)
	style.set_corner_radius_all(18)
	panel.add_theme_stylebox_override(&"panel", style)
	button.add_child(panel)

	var label := Label.new()
	label.text = label_text
	label.size = size_value
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_override(&"font", FONT)
	label.add_theme_font_size_override(&"font_size", 46 if size_value.x > 100 else 28)
	label.add_theme_color_override(&"font_color", Color.WHITE)
	label.add_theme_color_override(&"font_outline_color", Color.BLACK)
	label.add_theme_constant_override(&"outline_size", 5)
	panel.add_child(label)
	button.pressed.connect(_set_pressed.bind(panel, true))
	button.released.connect(_set_pressed.bind(panel, false))


func _set_pressed(panel: Panel, pressed: bool) -> void:
	panel.modulate.a = 0.94 if pressed else 0.58
	panel.scale = Vector2.ONE * (0.94 if pressed else 1.0)
	if pressed:
		Input.vibrate_handheld(18)
