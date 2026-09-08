extends Node2D

var font: Font = preload("res://among_funk/codename/fonts/vcr.ttf")
var stars: Array[ColorRect] = []
var logo: Label
var impostor: TextureRect
var prompt: Label
var elapsed := 0.0
var leaving := false
var intro_active := false
var intro_overlay: ColorRect
var intro_text: Label
var intro_beat := 0
var intro_clock := 0.0
const INTRO_BEAT_SECONDS := 60.0 / 102.0


func _ready() -> void:
	AmongFunkManager.play_menu_music()
	Global.set_window_title("Friday Night Funkin': Among Funk [Demo 1]")
	var background := ColorRect.new()
	background.size = Vector2(1280, 720)
	background.color = Color("050510")
	add_child(background)
	for index in 100:
		var star := ColorRect.new()
		var side := 2.0 + float(index % 3)
		star.size = Vector2(side, side)
		star.position = Vector2(float((index * 149) % 1280), float((index * 83) % 720))
		star.color = Color(1, 1, 1, 0.3 + float(index % 6) * 0.1)
		star.set_meta(&"speed", 10.0 + float(index % 5) * 5.0)
		add_child(star)
		stars.append(star)
	impostor = TextureRect.new()
	impostor.texture = load("res://among_funk/codename/images/impostor_float.png")
	impostor.position = Vector2(200, 200)
	impostor.size = Vector2(200, 200)
	impostor.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	impostor.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	impostor.pivot_offset = impostor.size * 0.5
	add_child(impostor)
	logo = Label.new()
	logo.text = "AMONG FUNK"
	logo.position = Vector2(0, 150)
	logo.size = Vector2(1280, 130)
	logo.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	logo.add_theme_font_override(&"font", font)
	logo.add_theme_font_size_override(&"font_size", 100)
	logo.add_theme_color_override(&"font_color", Color.CYAN)
	logo.add_theme_color_override(&"font_outline_color", Color.BLACK)
	logo.add_theme_constant_override(&"outline_size", 6)
	logo.pivot_offset = logo.size * 0.5
	add_child(logo)
	prompt = Label.new()
	prompt.text = "> PRESS ENTER TO VENT <"
	prompt.position = Vector2(0, 570)
	prompt.size = Vector2(1280, 70)
	prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	prompt.add_theme_font_override(&"font", font)
	prompt.add_theme_font_size_override(&"font_size", 40)
	prompt.add_theme_color_override(&"font_color", Color.RED)
	prompt.add_theme_color_override(&"font_outline_color", Color.BLACK)
	prompt.add_theme_constant_override(&"outline_size", 1)
	add_child(prompt)
	if AmongFunkManager.is_mobile():
		prompt.text = "> TOUCH TO VENT <"
		var touch_accept := Button.new()
		touch_accept.name = "Touch To Vent"
		touch_accept.size = Vector2(1280, 720)
		touch_accept.flat = true
		touch_accept.focus_mode = Control.FOCUS_NONE
		touch_accept.modulate.a = 0.0
		touch_accept.z_index = 200
		touch_accept.pressed.connect(_accept_title)
		add_child(touch_accept)
	if not AmongFunkManager.has_seen_intro():
		_start_intro()


func _start_intro() -> void:
	intro_active = true
	intro_overlay = ColorRect.new()
	intro_overlay.color = Color.BLACK
	intro_overlay.position = Vector2.ZERO
	intro_overlay.size = Vector2(1280, 720)
	intro_overlay.z_index = 100
	add_child(intro_overlay)
	intro_text = Label.new()
	intro_text.position = Vector2(0, 190)
	intro_text.size = Vector2(1280, 340)
	intro_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	intro_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	intro_text.add_theme_font_override(&"font", font)
	intro_text.add_theme_font_size_override(&"font_size", 50)
	intro_text.add_theme_color_override(&"font_color", Color.WHITE)
	intro_text.add_theme_color_override(&"font_outline_color", Color.BLACK)
	intro_text.add_theme_constant_override(&"outline_size", 3)
	intro_text.z_index = 101
	add_child(intro_text)


func _process(delta: float) -> void:
	elapsed += delta
	if intro_active:
		intro_clock += delta
		var next_beat := floori(intro_clock / INTRO_BEAT_SECONDS) + 1
		while intro_beat < mini(next_beat, 16):
			intro_beat += 1
			_update_intro_beat(intro_beat)
	for star in stars:
		star.position.x -= float(star.get_meta(&"speed", 15.0)) * delta
		if star.position.x < -5.0:
			star.position.x = 1285.0
	logo.scale = Vector2.ONE * (1.0 + sin(elapsed * 2.0) * 0.025)
	prompt.modulate.a = 0.25 + (sin(elapsed * 5.0) + 1.0) * 0.375
	impostor.rotation += delta * 0.18
	impostor.position.x += delta * 15.0
	if impostor.position.x > 1330.0:
		impostor.position.x = -180.0


func _update_intro_beat(beat: int) -> void:
	match beat:
		1: intro_text.text = "L'EQUIPE AMONG FUNK"
		3: intro_text.text += "\nPRESENTE"
		4, 8, 12: intro_text.text = ""
		5: intro_text.text = "UN MOD\nTOTALEMENT"
		7: intro_text.text += "\nSUS"
		9: intro_text.text = "FRIDAY\nNIGHT"
		11: intro_text.text += "\nAMONG FUNK"
		13: intro_text.text = "L'IMPOSTEUR"
		14: intro_text.text += "\nEST"
		15: intro_text.text += "\nPARMI NOUS"
		16: _skip_intro()


func _skip_intro() -> void:
	if not intro_active:
		return
	intro_active = false
	AmongFunkManager.mark_intro_seen()
	if is_instance_valid(intro_overlay):
		intro_overlay.queue_free()
	if is_instance_valid(intro_text):
		intro_text.queue_free()


func _unhandled_input(event: InputEvent) -> void:
	if leaving or not event.is_pressed() or event.is_echo():
		return
	if event.is_action(&"menu_accept"):
		_accept_title()


func _accept_title() -> void:
	if leaving:
		return
	if intro_active:
		_skip_intro()
		return
	leaving = true
	SoundManager.accept.play()
	Global.change_scene_to(Constants.MAIN_MENU_SCENE, &"fade")
