extends AmongFunkMenuBase

const GALLERY_ROOT := "res://among_funk/codename/images/menus/gallery/"
const CREDIT_ROOT := "res://among_funk/codename/images/menus/credit/"

var current_image := 0
var image_paths: Array[String] = []
var display: TextureRect
var counter: Label


func _ready() -> void:
	AmongFunkManager.play_menu_music()
	Global.set_window_title("Among Funk — Gallery")
	_build_background()
	for index in range(1, 5):
		var path := GALLERY_ROOT + "image%d.png" % index
		if ResourceLoader.exists(path):
			image_paths.append(path)
	_build_gallery_layout()
	_show_image(0, false)


func _build_gallery_layout() -> void:
	var title := add_label("GALLERY", Vector2(0, 20), Vector2(1280, 72), 60, Color("C0D1D4"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	display = TextureRect.new()
	display.position = Vector2(190, 105)
	display.size = Vector2(900, 520)
	display.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	display.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	display.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(display)

	var left := TextureButton.new()
	left.texture_normal = ResourceLoader.load(CREDIT_ROOT + "Credit-Left.png")
	left.position = Vector2(50, 320)
	left.size = Vector2(80, 80)
	left.ignore_texture_size = true
	left.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	left.pressed.connect(_show_image.bind(-1, true))
	add_child(left)
	var right := TextureButton.new()
	right.texture_normal = ResourceLoader.load(CREDIT_ROOT + "Credit-Right.png")
	right.position = Vector2(1150, 320)
	right.size = Vector2(80, 80)
	right.ignore_texture_size = true
	right.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	right.pressed.connect(_show_image.bind(1, true))
	add_child(right)

	counter = add_label("", Vector2(0, 650), Vector2(1280, 48), 40, Color("9EACAE"))
	counter.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _show_image(direction_or_index: int, play_sound: bool = true) -> void:
	if image_paths.is_empty():
		return
	if direction_or_index in [-1, 1] and play_sound:
		current_image = wrapi(current_image + direction_or_index, 0, image_paths.size())
	else:
		current_image = clampi(direction_or_index, 0, image_paths.size() - 1)
	display.texture = ResourceLoader.load(image_paths[current_image])
	counter.text = "%02d / %02d" % [current_image + 1, image_paths.size()]
	if play_sound:
		SoundManager.scroll.play()
		var tween := create_tween()
		display.modulate.a = 0.25
		tween.tween_property(display, "modulate:a", 1.0, 0.22)


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	if event.is_action(&"menu_left") or event.is_action(&"menu_up"):
		_show_image(-1)
	elif event.is_action(&"menu_right") or event.is_action(&"menu_down"):
		_show_image(1)
	elif event.is_action(&"menu_cancel"):
		SoundManager.cancel.play()
		Global.change_scene_to(Constants.MAIN_MENU_SCENE, &"fade")


func _process(delta: float) -> void:
	for star in get_tree().get_nodes_in_group(&"menu_stars"):
		star.position.x -= float(star.get_meta("speed", 8.0)) * delta
		if star.position.x < -850.0:
			star.position.x = 4050.0
