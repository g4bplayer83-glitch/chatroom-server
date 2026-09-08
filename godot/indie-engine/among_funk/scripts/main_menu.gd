extends AmongFunkMenuBase

const ACTIONS := ["story", "freeplay", "options", "credits", "gallery"]
const ART_PATHS := [
	"res://among_funk/codename/images/Menu_Story.png",
	"res://among_funk/codename/images/Menu_Freeplay.png",
	"res://among_funk/codename/images/Menu_Settings.png",
	"res://among_funk/codename/images/Menu_Credits.png",
	"res://among_funk/codename/images/Gallery.png"
]

var art_buttons: Array[TextureButton] = []
var selected_art := 0
var main_art: AnimatedSprite2D


func _ready() -> void:
	GameManager.song_scene = null
	AmongFunkManager.play_menu_music()
	Global.set_window_title("Among Funk — Main Menu")
	_build_background()
	_build_original_layout()
	_select_art(0, false)


func _build_original_layout() -> void:
	var panel := add_texture("res://among_funk/codename/images/Menu_Corner.png", Vector2(424.5, 260.0), Vector2(431, 464))
	panel.z_index = 0

	main_art = AnimatedSprite2D.new()
	main_art.name = "Menu Main Art"
	main_art.sprite_frames = CNEAtlas.build_all_frames(
		"res://among_funk/codename/images/MenuMainArt.png",
		"res://among_funk/codename/images/MenuMainArt.xml"
	)
	main_art.centered = true
	main_art.position = Vector2(640, 529.5)
	main_art.z_index = 1
	add_child(main_art)
	if main_art.sprite_frames and main_art.sprite_frames.has_animation(&"Idle"):
		# The source atlas alternates between two poses. Keep the requested
		# characters perfectly still instead of making them bob vertically.
		main_art.animation = &"Idle"
		main_art.frame = 0
		main_art.pause()

	# TextureRect could briefly display this large source texture at its native
	# size while the menu entered the tree. A Sprite2D with an explicit scale is
	# stable and keeps the logo centred above the terminal buttons.
	var logo_texture: Texture2D = ResourceLoader.load("res://among_funk/codename/images/logo.png")
	if logo_texture:
		var logo := Sprite2D.new()
		logo.name = "Among Funk Logo"
		logo.texture = logo_texture
		logo.centered = true
		logo.position = Vector2(640.0, 96.0)
		var logo_scale := 227.0 / maxf(float(logo_texture.get_width()), 1.0)
		logo.scale = Vector2.ONE * logo_scale
		logo.z_index = 4
		add_child(logo)

	for index in ART_PATHS.size():
		var texture: Texture2D = ResourceLoader.load(ART_PATHS[index])
		var button := TextureButton.new()
		button.name = ACTIONS[index].capitalize()
		button.texture_normal = texture
		button.ignore_texture_size = true
		button.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
		var natural_size := texture.get_size() if texture else Vector2(320, 70)
		button.size = natural_size
		button.position = Vector2(640.0 - natural_size.x * 0.5, 270.0 + float(index) * 75.0)
		button.pivot_offset = natural_size * 0.5
		button.z_index = 3
		button.mouse_entered.connect(_select_art.bind(index, true))
		button.pressed.connect(_activate.bind(index))
		add_child(button)
		art_buttons.append(button)

	var version := add_label("DEMO 1  /  v0.1.0", Vector2(1010, 18), Vector2(240, 28), 16, Color("8DA6A8"))
	version.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	version.z_index = 5

	var patch_button := Button.new()
	patch_button.text = "PATCH NOTES"
	patch_button.position = Vector2(1010, 631)
	patch_button.size = Vector2(224, 50)
	patch_button.add_theme_font_override(&"font", menu_font)
	patch_button.add_theme_font_size_override(&"font_size", 18)
	patch_button.add_theme_stylebox_override(&"normal", make_terminal_style(Color("2B3435"), Color("9EACAE"), 2))
	patch_button.add_theme_stylebox_override(&"hover", make_terminal_style(Color("51696B"), Color("7CFFD9"), 3))
	patch_button.pressed.connect(_show_patch_notes)
	patch_button.z_index = 5
	add_child(patch_button)


func _select_art(index: int, play_sound: bool = true) -> void:
	selected_art = wrapi(index, 0, art_buttons.size())
	for button_index in art_buttons.size():
		var active := button_index == selected_art
		art_buttons[button_index].modulate = Color.WHITE if active else Color(0.52, 0.59, 0.61, 0.82)
		art_buttons[button_index].scale = Vector2.ONE * (1.08 if active else 1.0)
	if play_sound:
		SoundManager.scroll.play()


func _activate(index: int) -> void:
	if locked:
		return
	selected_art = index
	locked = true
	SoundManager.accept.play()
	if main_art and main_art.sprite_frames and main_art.sprite_frames.has_animation(&"Confirm"):
		main_art.sprite_frames.set_animation_speed(&"Confirm", 14.0)
		main_art.sprite_frames.set_animation_loop(&"Confirm", false)
		main_art.play(&"Confirm")
	for button in art_buttons:
		button.modulate.a = 0.35
	art_buttons[index].modulate.a = 1.0
	match ACTIONS[index]:
		"story": await transition_to_scene(Constants.STORY_MODE_MENU_SCENE)
		"freeplay": await transition_to_scene(Constants.FREEPLAY_MENU_SCENE)
		"options": await transition_to_scene(Constants.OPTIONS_MENU_SCENE)
		"credits": await transition_to_scene(Constants.CREDITS_MENU_SCENE)
		"gallery": await transition_to_scene(Constants.GALLERY_MENU_SCENE)


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	if has_node("PatchNotes"):
		if event.is_action(&"menu_cancel") or event.is_action(&"menu_accept") or (event is InputEventKey and event.physical_keycode == KEY_P):
			get_node("PatchNotes").queue_free()
		return
	if locked:
		return
	if event.is_action(&"menu_up"):
		_select_art(selected_art - 1)
	elif event.is_action(&"menu_down"):
		_select_art(selected_art + 1)
	elif event.is_action(&"menu_accept"):
		_activate(selected_art)
	elif event is InputEventKey and event.physical_keycode == KEY_P:
		_show_patch_notes()
	elif event.is_action(&"chart_editor"):
		Global.change_scene_to(Constants.DEVELOPER_MENU_SCENE, &"fade")


func _process(delta: float) -> void:
	elapsed_time += delta
	for star in get_tree().get_nodes_in_group(&"menu_stars"):
		star.position.x -= float(star.get_meta("speed", 8.0)) * delta
		if star.position.x < -850.0:
			star.position.x = 4050.0


func _show_patch_notes() -> void:
	if has_node("PatchNotes"):
		get_node("PatchNotes").queue_free()
		return
	var panel := Panel.new()
	panel.name = "PatchNotes"
	panel.position = Vector2(190, 95)
	panel.size = Vector2(900, 535)
	panel.z_index = 200
	panel.add_theme_stylebox_override(&"panel", make_terminal_style(Color(0.025, 0.04, 0.045, 0.98), Color("9EACAE"), 4))
	add_child(panel)
	var body := add_label(
		"PATCH NOTES — DEMO 1 / v0.1.0\n\nNEW ZIP\nMoogusred, updated Sabotage/Discover charts and Polus Freeplay.\n\nGAMEPLAY\nHorizontal task bar, connection game-over and Among Shader FX.\n\nMOBILE\nAndroid ARM64 preset, multitouch notes, pause and mobile game-over controls.\n\nWEEK 2\nGood-Times and No-More-Tasks are listed as coming soon because their song files were not supplied.\n\nP / ENTER / ESC TO CLOSE",
		Vector2(45, 28), Vector2(810, 475), 23, Color.WHITE, panel
	)
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
