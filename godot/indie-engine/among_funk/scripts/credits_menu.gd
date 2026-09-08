extends AmongFunkMenuBase

const CREDIT_ROOT := "res://among_funk/codename/images/menus/credit/"
const CATEGORIES: Array[Dictionary] = [
	{"title": "Director and Co-Director", "people": [["Simontincs_god", "Simontincs_god"], ["IndieGabVR", "IndieGabVR"]]},
	{"title": "Coder", "people": [["IndieGabVR", "IndieGabVR"]]},
	{"title": "Composer", "people": [["Simontincs_god", "Simontincs_god"], ["IndieGabVR", "IndieGabVR"], ["AlgerRayan", "algerrayan"], ["Napstabeats", "Napstabeats"], ["hyras", "hyras"], ["PV NIGHTS", "PV NIGHTS"], ["MungoCow", "MungoCow"], ["OrangeVA", "OrangeVA"], ["Krotain", ""]]},
	{"title": "Artist", "people": [["Gamma", "Gamma"], ["IndieGabVR", "IndieGabVR"], ["Takari", "takari"], ["Kyllo", ""], ["Nexus", "Nexus"], ["Wiresthebat", "Wiresthebat"], ["Mr.Golden", "Mr.Golden"], ["Lolo", ""]]},
	{"title": "Concept artist", "people": [["MallowPrime64", "MallowPrime64"]]},
	{"title": "VA", "people": [["BkBurnett", "BkBurnett"], ["AlgerRayan", "algerrayan"], ["IndieGabVR", "IndieGabVR"], ["Hevtel", "Hevtel"]]},
	{"title": "Visualizer Maker", "people": [["IndieGabVR", "IndieGabVR"], ["Keith The D Salt", ""], ["Simontincs_god", "Simontincs_god"]]},
	{"title": "Thumbnails maker", "people": [["ADISHERE", ""]]},
	{"title": "Playtester", "people": [["NLPB1925", ""]]},
	{"title": "Charter", "people": [["IndieGabVR", "IndieGabVR"], ["Simontincs_god", "Simontincs_god"]]},
	{"title": "Lyrics Maker", "people": [["Shinzzuka", ""]]}
]

var category := 0
var category_label: Label
var list_box: VBoxContainer
var blue: AnimatedSprite2D


func _ready() -> void:
	AmongFunkManager.play_menu_music("res://among_funk/codename/music/creditsMenu.ogg")
	Global.set_window_title("Among Funk — Credits")
	_build_credit_layout()
	_show_category(0, false)


func _build_credit_layout() -> void:
	add_texture(CREDIT_ROOT + "CreditBack.png", Vector2.ZERO, Vector2(1280, 720)).stretch_mode = TextureRect.STRETCH_SCALE
	add_texture(CREDIT_ROOT + "Credit-Corner.png", Vector2.ZERO, Vector2(1280, 720)).stretch_mode = TextureRect.STRETCH_SCALE
	add_texture(CREDIT_ROOT + "Credit.png", Vector2.ZERO, Vector2(1280, 720)).stretch_mode = TextureRect.STRETCH_SCALE
	category_label = add_label("", Vector2(120, 145), Vector2(500, 48), 24, Color.WHITE)

	var clip := ScrollContainer.new()
	clip.position = Vector2(120, 210)
	clip.size = Vector2(520, 320)
	clip.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	clip.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	add_child(clip)
	list_box = VBoxContainer.new()
	list_box.custom_minimum_size = Vector2(500, 0)
	list_box.add_theme_constant_override(&"separation", 12)
	clip.add_child(list_box)

	var left := TextureButton.new()
	left.texture_normal = ResourceLoader.load(CREDIT_ROOT + "Credit-Left.png")
	left.position = Vector2(100, 550)
	left.size = Vector2(100, 100)
	left.ignore_texture_size = true
	left.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	left.pressed.connect(_show_category.bind(-1, true))
	add_child(left)
	var right := TextureButton.new()
	right.texture_normal = ResourceLoader.load(CREDIT_ROOT + "Credit-Right.png")
	right.position = Vector2(550, 550)
	right.size = Vector2(100, 100)
	right.ignore_texture_size = true
	right.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	right.pressed.connect(_show_category.bind(1, true))
	add_child(right)
	var close := TextureButton.new()
	close.texture_normal = ResourceLoader.load(CREDIT_ROOT + "Credit-Close.png")
	close.position = Vector2.ZERO
	close.size = Vector2(100, 100)
	close.ignore_texture_size = true
	close.stretch_mode = TextureButton.STRETCH_KEEP_ASPECT_CENTERED
	close.pressed.connect(_leave_credits)
	add_child(close)

	blue = AnimatedSprite2D.new()
	blue.sprite_frames = CNEAtlas.build_all_frames(CREDIT_ROOT + "Credit-Blue.png", CREDIT_ROOT + "Credit-Blue.xml")
	blue.centered = false
	blue.position = Vector2(680, 270)
	add_child(blue)
	var animations := blue.sprite_frames.get_animation_names() if blue.sprite_frames else PackedStringArray()
	if blue.sprite_frames and blue.sprite_frames.has_animation(&"Idle"):
		blue.play(&"Idle")
	elif not animations.is_empty():
		blue.play(animations[0])
	var footer := add_label("← →  CATEGORY     MOUSE WHEEL  LIST     ESC  BACK", Vector2(60, 674), Vector2(1160, 30), 18, Color("263A3C"))
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	footer.add_theme_color_override(&"font_outline_color", Color.TRANSPARENT)


func _show_category(direction_or_index: int, play_sound: bool = true) -> void:
	if direction_or_index in [-1, 1] and play_sound:
		category = wrapi(category + direction_or_index, 0, CATEGORIES.size())
	else:
		category = clampi(direction_or_index, 0, CATEGORIES.size() - 1)
	for child in list_box.get_children():
		child.queue_free()
	var data := CATEGORIES[category]
	category_label.text = str(data["title"])
	for raw_person in data["people"]:
		var person: Array = raw_person
		var row := HBoxContainer.new()
		row.custom_minimum_size = Vector2(500, 88)
		row.add_theme_constant_override(&"separation", 16)
		list_box.add_child(row)
		var icon := TextureRect.new()
		icon.custom_minimum_size = Vector2(64, 64)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		var icon_name := str(person[1])
		var icon_path := CREDIT_ROOT + "Icons/" + icon_name + ".png"
		icon.texture = ResourceLoader.load(icon_path) if not icon_name.is_empty() and ResourceLoader.exists(icon_path) else ResourceLoader.load("res://among_funk/codename/images/impostor_float.png")
		row.add_child(icon)
		var name_label := Label.new()
		name_label.text = str(person[0])
		name_label.custom_minimum_size = Vector2(410, 70)
		name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		name_label.add_theme_font_override(&"font", menu_font)
		name_label.add_theme_font_size_override(&"font_size", 36)
		name_label.add_theme_color_override(&"font_color", Color.WHITE)
		row.add_child(name_label)
	if play_sound:
		SoundManager.scroll.play()


func _unhandled_input(event: InputEvent) -> void:
	if not event.is_pressed() or event.is_echo():
		return
	if event.is_action(&"menu_left"):
		_show_category(-1)
	elif event.is_action(&"menu_right"):
		_show_category(1)
	elif event.is_action(&"menu_cancel"):
		_leave_credits()


func _leave_credits() -> void:
	SoundManager.cancel.play()
	Global.change_scene_to(Constants.MAIN_MENU_SCENE, &"fade")
