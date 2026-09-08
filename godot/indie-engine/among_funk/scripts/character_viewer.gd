extends Node2D

const FONT: Font = preload("res://among_funk/codename/fonts/vcr.ttf")
const CHARACTER_DIR := "res://among_funk/codename/data/characters"
const IMAGE_DIR := "res://among_funk/codename/images/characters"
const PREVIEW_CENTER := Vector2(430.0, 390.0)

var ids: Array[String] = []
var selected_character := 0
var selected_animation := 0
var root_data: Dictionary = {}
var animations: Array[Dictionary] = []
var config_path := ""
var dirty := false
var loading_ui := false
var dragging_offset := false
var panning := false
var editor_camera: Camera2D
var character: CNECharacter

var title_label: Label
var status_label: Label
var character_picker: OptionButton
var tabs: TabContainer
var animation_list: ItemList
var sprite_edit: LineEdit
var icon_edit: LineEdit
var color_edit: LineEdit
var global_x: SpinBox
var global_y: SpinBox
var camera_x: SpinBox
var camera_y: SpinBox
var scale_spin: SpinBox
var flip_check: CheckBox
var player_check: CheckBox
var antialias_check: CheckBox
var anim_name_edit: LineEdit
var anim_prefix_edit: LineEdit
var anim_indices_edit: LineEdit
var anim_fps: SpinBox
var anim_x: SpinBox
var anim_y: SpinBox
var anim_loop: CheckBox
var play_button: Button


func _ready() -> void:
	AmongFunkManager.play_menu_music()
	Global.set_window_title("Among Funk — Character Editor")
	_build_world()
	_build_ui()
	_scan_characters()
	if not ids.is_empty():
		_load_character(0)


func _build_world() -> void:
	var background := ColorRect.new()
	background.position = Vector2(-2200, -1800)
	background.size = Vector2(4400, 3600)
	background.color = Color("0A1020")
	background.z_index = -100
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)

	editor_camera = Camera2D.new()
	editor_camera.position = Vector2(640, 360)
	editor_camera.enabled = true
	add_child(editor_camera)

	character = CNECharacter.new()
	character.name = "EditableCharacter"
	var sprite := AnimatedSprite2D.new()
	sprite.name = "AnimatedSprite2D"
	character.add_child(sprite)
	character.position = PREVIEW_CENTER
	character.z_index = 10
	add_child(character)


func _build_ui() -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 50
	add_child(canvas)

	var header := ColorRect.new()
	header.position = Vector2.ZERO
	header.size = Vector2(1280, 42)
	header.color = Color("17242A")
	canvas.add_child(header)
	title_label = _label("CHARACTER EDITOR", Vector2(18, 5), Vector2(680, 34), 25, Color("54E6CF"), canvas)
	status_label = _label("READY", Vector2(690, 8), Vector2(565, 28), 16, Color("9EACAE"), canvas)
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

	var side := Panel.new()
	side.position = Vector2(885, 42)
	side.size = Vector2(395, 678)
	side.add_theme_stylebox_override(&"panel", _style(Color("172124"), Color("9EACAE"), 2))
	canvas.add_child(side)

	character_picker = OptionButton.new()
	character_picker.position = Vector2(18, 14)
	character_picker.size = Vector2(359, 40)
	character_picker.add_theme_font_override(&"font", FONT)
	character_picker.add_theme_font_size_override(&"font_size", 18)
	character_picker.item_selected.connect(_load_character)
	side.add_child(character_picker)

	tabs = TabContainer.new()
	tabs.position = Vector2(14, 64)
	tabs.size = Vector2(367, 535)
	tabs.add_theme_font_override(&"font", FONT)
	tabs.add_theme_font_size_override(&"font_size", 17)
	side.add_child(tabs)
	_build_character_tab()
	_build_animation_tab()

	var save := _button("SAVE  CTRL+S", Vector2(16, 612), Vector2(145, 44), side)
	save.pressed.connect(_save_character)
	var reload := _button("RELOAD", Vector2(169, 612), Vector2(96, 44), side)
	reload.pressed.connect(_reload_current)
	var back := _button("BACK", Vector2(273, 612), Vector2(104, 44), side)
	back.pressed.connect(_go_back)

	var hint := _label("DRAG CHARACTER: ANIMATION OFFSET    MIDDLE DRAG: PAN    WHEEL: ZOOM", Vector2(18, 676), Vector2(840, 30), 15, Color("8DA6A8"), canvas)
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER


func _build_character_tab() -> void:
	var page := VBoxContainer.new()
	page.name = "CHARACTER"
	page.add_theme_constant_override(&"separation", 7)
	tabs.add_child(page)
	sprite_edit = _line_row(page, "SPRITE", _on_root_text_changed.bind("sprite"))
	var rebuild := _button("REBUILD SPRITE / ATLAS", Vector2.ZERO, Vector2.ZERO, page)
	rebuild.custom_minimum_size = Vector2(330, 36)
	rebuild.pressed.connect(_rebuild_preview)
	global_x = _number_row(page, "GLOBAL X", -5000, 5000, _on_root_number_changed.bind("x"))
	global_y = _number_row(page, "GLOBAL Y", -5000, 5000, _on_root_number_changed.bind("y"))
	camera_x = _number_row(page, "CAMERA X", -5000, 5000, _on_root_number_changed.bind("camx"))
	camera_y = _number_row(page, "CAMERA Y", -5000, 5000, _on_root_number_changed.bind("camy"))
	scale_spin = _number_row(page, "SCALE", 0.01, 20, _on_root_number_changed.bind("scale"), 0.01)
	flip_check = _check_row(page, "FLIP X", _on_root_bool_changed.bind("flipx"))
	player_check = _check_row(page, "DESIGNED AS PLAYER", _on_root_bool_changed.bind("isplayer"))
	antialias_check = _check_row(page, "ANTIALIASING", _on_root_bool_changed.bind("antialiasing"))
	icon_edit = _line_row(page, "ICON", _on_root_text_changed.bind("icon"))
	color_edit = _line_row(page, "ICON COLOR", _on_root_text_changed.bind("color"))


func _build_animation_tab() -> void:
	var page := VBoxContainer.new()
	page.name = "ANIMATIONS"
	page.add_theme_constant_override(&"separation", 6)
	tabs.add_child(page)
	animation_list = ItemList.new()
	animation_list.custom_minimum_size = Vector2(340, 145)
	animation_list.add_theme_font_override(&"font", FONT)
	animation_list.add_theme_font_size_override(&"font_size", 16)
	animation_list.item_selected.connect(_select_animation)
	page.add_child(animation_list)
	var tools := HBoxContainer.new()
	page.add_child(tools)
	var add := _button("ADD", Vector2.ZERO, Vector2.ZERO, tools)
	add.custom_minimum_size = Vector2(94, 34)
	add.pressed.connect(_add_animation)
	var duplicate := _button("DUPLICATE", Vector2.ZERO, Vector2.ZERO, tools)
	duplicate.custom_minimum_size = Vector2(124, 34)
	duplicate.pressed.connect(_duplicate_animation)
	var remove := _button("DELETE", Vector2.ZERO, Vector2.ZERO, tools)
	remove.custom_minimum_size = Vector2(104, 34)
	remove.pressed.connect(_delete_animation)
	anim_name_edit = _line_row(page, "NAME", _on_anim_text_changed.bind("name"))
	anim_prefix_edit = _line_row(page, "ATLAS PREFIX", _on_anim_text_changed.bind("anim"))
	anim_indices_edit = _line_row(page, "INDICES", _on_anim_text_changed.bind("indices"))
	anim_fps = _number_row(page, "FPS", 1, 240, _on_anim_number_changed.bind("fps"), 1)
	anim_x = _number_row(page, "OFFSET X", -10000, 10000, _on_anim_number_changed.bind("x"))
	anim_y = _number_row(page, "OFFSET Y", -10000, 10000, _on_anim_number_changed.bind("y"))
	anim_loop = _check_row(page, "LOOP", _on_anim_bool_changed.bind("loop"))
	var playback := HBoxContainer.new()
	page.add_child(playback)
	play_button = _button("PLAY", Vector2.ZERO, Vector2.ZERO, playback)
	play_button.custom_minimum_size = Vector2(105, 34)
	play_button.pressed.connect(_play_animation)
	var stop := _button("STOP", Vector2.ZERO, Vector2.ZERO, playback)
	stop.custom_minimum_size = Vector2(105, 34)
	stop.pressed.connect(_stop_animation)
	var frame := _button("NEXT FRAME", Vector2.ZERO, Vector2.ZERO, playback)
	frame.custom_minimum_size = Vector2(115, 34)
	frame.pressed.connect(_next_frame)


func _scan_characters() -> void:
	ids.clear()
	character_picker.clear()
	for file in DirAccess.get_files_at(CHARACTER_DIR):
		if file.get_extension().to_lower() == "xml":
			ids.append(file.get_basename())
	ids.sort_custom(func(a: String, b: String) -> bool: return a.naturalnocasecmp_to(b) < 0)
	for id in ids:
		character_picker.add_item(id)


func _load_character(index: int) -> void:
	if ids.is_empty():
		return
	selected_character = clampi(index, 0, ids.size() - 1)
	character_picker.select(selected_character)
	config_path = CHARACTER_DIR.path_join(ids[selected_character] + ".xml")
	var parsed := _read_config(config_path)
	root_data = Dictionary(parsed.get("root", {})).duplicate(true)
	animations.clear()
	for item in parsed.get("animations", []):
		if item is Dictionary:
			animations.append(Dictionary(item).duplicate(true))
	character.configure(ids[selected_character], "preview")
	character.position = PREVIEW_CENTER
	selected_animation = 0
	dirty = false
	_sync_root_ui()
	_rebuild_animation_list()
	_apply_root_to_preview()
	if not animations.is_empty():
		_select_animation(0)
	_set_status("Loaded %s — %d animations" % [ids[selected_character], animations.size()])
	queue_redraw()


func _reload_current() -> void:
	if dirty:
		_set_status("Reloaded from disk; unsaved changes discarded.", true)
	_load_character(selected_character)


func _read_config(path: String) -> Dictionary:
	var output := {"root": {}, "animations": []}
	var parser := XMLParser.new()
	if parser.open(path) != OK:
		return output
	while parser.read() == OK:
		if parser.get_node_type() != XMLParser.NODE_ELEMENT:
			continue
		var attrs: Dictionary = {}
		for index in parser.get_attribute_count():
			attrs[parser.get_attribute_name(index).to_lower()] = parser.get_attribute_value(index)
		var node_name := parser.get_node_name().to_lower()
		if node_name == "character":
			output["root"] = attrs
		elif node_name == "anim":
			output["animations"].append(attrs)
	return output


func _sync_root_ui() -> void:
	loading_ui = true
	sprite_edit.text = str(root_data.get("sprite", ids[selected_character]))
	global_x.value = _number(root_data.get("x", 0.0))
	global_y.value = _number(root_data.get("y", 0.0))
	camera_x.value = _number(root_data.get("camx", 0.0))
	camera_y.value = _number(root_data.get("camy", 0.0))
	scale_spin.value = maxf(_number(root_data.get("scale", 1.0)), 0.01)
	flip_check.button_pressed = _bool(root_data.get("flipx", false))
	player_check.button_pressed = _bool(root_data.get("isplayer", false))
	antialias_check.button_pressed = _bool(root_data.get("antialiasing", true), true)
	icon_edit.text = str(root_data.get("icon", ids[selected_character]))
	color_edit.text = str(root_data.get("color", "#FFFFFF"))
	loading_ui = false


func _rebuild_animation_list() -> void:
	animation_list.clear()
	for spec in animations:
		animation_list.add_item("%s   →   %s" % [str(spec.get("name", "idle")), str(spec.get("anim", spec.get("name", "idle")))])
	if not animations.is_empty():
		selected_animation = clampi(selected_animation, 0, animations.size() - 1)
		animation_list.select(selected_animation)


func _select_animation(index: int) -> void:
	if animations.is_empty():
		return
	selected_animation = clampi(index, 0, animations.size() - 1)
	animation_list.select(selected_animation)
	var spec := animations[selected_animation]
	loading_ui = true
	anim_name_edit.text = str(spec.get("name", "idle"))
	anim_prefix_edit.text = str(spec.get("anim", spec.get("name", "idle")))
	anim_indices_edit.text = str(spec.get("indices", ""))
	anim_fps.value = _number(spec.get("fps", 24.0), 24.0)
	anim_x.value = _number(spec.get("x", 0.0))
	anim_y.value = _number(spec.get("y", 0.0))
	anim_loop.button_pressed = _bool(spec.get("loop", false))
	loading_ui = false
	_apply_animation_to_preview()


func _on_root_number_changed(value: float, key: String) -> void:
	if loading_ui:
		return
	root_data[key] = _number_text(value)
	_mark_dirty()
	_apply_root_to_preview()


func _on_root_bool_changed(value: bool, key: String) -> void:
	if loading_ui:
		return
	root_data[key] = "true" if value else "false"
	_mark_dirty()
	_apply_root_to_preview()


func _on_root_text_changed(value: String, key: String) -> void:
	if loading_ui:
		return
	root_data[key] = value
	_mark_dirty()
	if key != "sprite":
		_apply_root_to_preview()


func _on_anim_number_changed(value: float, key: String) -> void:
	if loading_ui or animations.is_empty():
		return
	animations[selected_animation][key] = _number_text(value)
	_mark_dirty()
	_apply_animation_to_preview()


func _on_anim_bool_changed(value: bool, key: String) -> void:
	if loading_ui or animations.is_empty():
		return
	animations[selected_animation][key] = "true" if value else "false"
	_mark_dirty()
	_rebuild_preview()


func _on_anim_text_changed(value: String, key: String) -> void:
	if loading_ui or animations.is_empty():
		return
	animations[selected_animation][key] = value
	_mark_dirty()
	_rebuild_animation_list()
	call_deferred("_rebuild_preview")


func _apply_root_to_preview() -> void:
	if not is_instance_valid(character):
		return
	character.config_offset = Vector2(_number(root_data.get("x", 0.0)), _number(root_data.get("y", 0.0)))
	character.camera_offset = Vector2(_number(root_data.get("camx", 0.0)), _number(root_data.get("camy", 0.0)))
	character.requested_scale = maxf(_number(root_data.get("scale", 1.0), 1.0), 0.01)
	character.root_flip = _bool(root_data.get("flipx", false))
	character.player_offsets = _bool(root_data.get("isplayer", false))
	character.sprite.flip_h = character.root_flip
	character.sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR if _bool(root_data.get("antialiasing", true), true) else CanvasItem.TEXTURE_FILTER_NEAREST
	character._apply_total_scale()
	_apply_animation_to_preview()
	queue_redraw()


func _apply_animation_to_preview() -> void:
	if animations.is_empty() or not is_instance_valid(character):
		return
	var spec := animations[selected_animation]
	var canonical := StringName(_canonical_animation(str(spec.get("name", "idle"))))
	character.animation_offsets[canonical] = Vector2(_number(spec.get("x", 0.0)), _number(spec.get("y", 0.0)))
	character.play_animation(canonical)
	queue_redraw()


func _rebuild_preview() -> void:
	if animations.is_empty() or not is_instance_valid(character):
		return
	var sprite_id := str(root_data.get("sprite", ids[selected_character]))
	var animate_folder := IMAGE_DIR.path_join(sprite_id)
	if FileAccess.file_exists(animate_folder.path_join("Animation.json")):
		character.configure(ids[selected_character], "preview")
		_apply_root_to_preview()
		_set_status("Adobe atlas preview reloaded. XML changes save normally.")
		return
	var texture_path := AmongFunkManager.resolve_named_file(IMAGE_DIR, sprite_id, ["png"])
	var atlas_path := AmongFunkManager.resolve_named_file(IMAGE_DIR, sprite_id, ["xml"])
	if texture_path.is_empty() or atlas_path.is_empty():
		_set_status("Sprite or atlas not found: %s" % sprite_id, true)
		return
	var specs: Array[Dictionary] = []
	for item in animations:
		var spec := item.duplicate(true)
		spec["canonical"] = _canonical_animation(str(spec.get("name", "idle")))
		spec["prefix"] = str(spec.get("anim", spec.get("name", "idle")))
		spec["fps"] = _number(spec.get("fps", 24.0), 24.0)
		spec["loop"] = _bool(spec.get("loop", false))
		specs.append(spec)
	character.uses_animate = false
	character.sprite.visible = true
	character.sprite.sprite_frames = CNEAtlas.build_character_frames(texture_path, atlas_path, specs)
	character.animation_offsets.clear()
	character.animation_names.clear()
	for spec in specs:
		var canonical := StringName(str(spec["canonical"]))
		character.animation_names[canonical] = canonical
		character.animation_offsets[canonical] = Vector2(_number(spec.get("x", 0.0)), _number(spec.get("y", 0.0)))
	_apply_root_to_preview()
	_apply_animation_to_preview()
	_set_status("Preview rebuilt from %s." % sprite_id)


func _add_animation() -> void:
	animations.append({"name": "newAnim", "anim": "prefix", "fps": "24", "x": "0", "y": "0", "loop": "false"})
	selected_animation = animations.size() - 1
	_mark_dirty()
	_rebuild_animation_list()
	_select_animation(selected_animation)


func _duplicate_animation() -> void:
	if animations.is_empty():
		return
	var copy := animations[selected_animation].duplicate(true)
	copy["name"] = str(copy.get("name", "anim")) + "_copy"
	animations.insert(selected_animation + 1, copy)
	selected_animation += 1
	_mark_dirty()
	_rebuild_animation_list()
	_select_animation(selected_animation)


func _delete_animation() -> void:
	if animations.size() <= 1:
		_set_status("A character must keep at least one animation.", true)
		return
	animations.remove_at(selected_animation)
	selected_animation = clampi(selected_animation, 0, animations.size() - 1)
	_mark_dirty()
	_rebuild_animation_list()
	_select_animation(selected_animation)
	_rebuild_preview()


func _play_animation() -> void:
	_apply_animation_to_preview()


func _stop_animation() -> void:
	if character.uses_animate and is_instance_valid(character.animate_sprite):
		character.animate_sprite.pause()
	elif is_instance_valid(character.sprite):
		character.sprite.pause()


func _next_frame() -> void:
	if character.uses_animate:
		return
	if not is_instance_valid(character.sprite) or not character.sprite.sprite_frames:
		return
	character.sprite.pause()
	var count := character.sprite.sprite_frames.get_frame_count(character.sprite.animation)
	if count > 0:
		character.sprite.frame = wrapi(character.sprite.frame + 1, 0, count)
	queue_redraw()


func _save_character() -> void:
	if config_path.is_empty():
		return
	var original := FileAccess.get_file_as_string(config_path)
	if not original.is_empty():
		var backup := FileAccess.open(config_path + ".bak", FileAccess.WRITE)
		if backup:
			backup.store_string(original)
	var file := FileAccess.open(config_path, FileAccess.WRITE)
	if not file:
		_set_status("Cannot write %s" % config_path, true)
		return
	file.store_string(_serialize_xml())
	file.close()
	dirty = false
	_update_title()
	_set_status("Saved %s (backup: .xml.bak)" % config_path.get_file())
	SoundManager.accept.play()


func _serialize_xml() -> String:
	var lines: Array[String] = ["<!DOCTYPE codename-engine-character>"]
	var root_parts: Array[String] = []
	var root_order := ["x", "y", "sprite", "scale", "camx", "camy", "flipx", "isplayer", "icon", "color", "centercam", "antialiasing", "holdtime"]
	for key in root_order:
		if root_data.has(key) and not str(root_data[key]).is_empty():
			root_parts.append('%s="%s"' % [_xml_key(key), _escape_xml(str(root_data[key]))])
	for key in root_data.keys():
		if key not in root_order and not str(root_data[key]).is_empty():
			root_parts.append('%s="%s"' % [str(key), _escape_xml(str(root_data[key]))])
	lines.append("<character %s>" % " ".join(root_parts))
	var anim_order := ["name", "anim", "x", "y", "fps", "loop", "indices"]
	for spec in animations:
		var parts: Array[String] = []
		for key in anim_order:
			if spec.has(key) and not str(spec[key]).is_empty():
				parts.append('%s="%s"' % [key, _escape_xml(str(spec[key]))])
		for key in spec.keys():
			if key not in anim_order and not str(spec[key]).is_empty():
				parts.append('%s="%s"' % [str(key), _escape_xml(str(spec[key]))])
		lines.append("\t<anim %s/>" % " ".join(parts))
	lines.append("</character>")
	return "\n".join(lines) + "\n"


func _xml_key(key: String) -> String:
	return str({"flipx": "flipX", "isplayer": "isPlayer", "centercam": "centercam", "holdtime": "holdTime"}.get(key, key))


func _escape_xml(value: String) -> String:
	return value.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")


func _mark_dirty() -> void:
	dirty = true
	_update_title()


func _update_title() -> void:
	title_label.text = "%sCHARACTER EDITOR  •  %s" % ["* " if dirty else "", ids[selected_character] if not ids.is_empty() else "NONE"]


func _set_status(text: String, error: bool = false) -> void:
	status_label.text = text
	status_label.modulate = Color("FF8A8A") if error else Color("9EACAE")
	_update_title()


func _go_back() -> void:
	if dirty:
		_set_status("Unsaved changes — Ctrl+S saves, press BACK again to discard.", true)
		dirty = false
		return
	Global.change_scene_to(Constants.DEVELOPER_MENU_SCENE, &"fade")


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.ctrl_pressed and event.keycode == KEY_S:
			_save_character()
			get_viewport().set_input_as_handled()
			return
		if event.is_action(&"menu_cancel"):
			_go_back()
			return
		if event.keycode == KEY_SPACE:
			_play_animation()
			return
	if event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if mouse.position.x >= 880.0:
			return
		if mouse.button_index == MOUSE_BUTTON_WHEEL_UP and mouse.pressed:
			var zoom_in := clampf(editor_camera.zoom.x * 1.12, 0.25, 4.0)
			editor_camera.zoom = Vector2.ONE * zoom_in
		elif mouse.button_index == MOUSE_BUTTON_WHEEL_DOWN and mouse.pressed:
			var zoom_out := clampf(editor_camera.zoom.x / 1.12, 0.25, 4.0)
			editor_camera.zoom = Vector2.ONE * zoom_out
		elif mouse.button_index == MOUSE_BUTTON_MIDDLE:
			panning = mouse.pressed
		elif mouse.button_index == MOUSE_BUTTON_LEFT:
			dragging_offset = mouse.pressed and _character_rect().grow(18.0).has_point(_screen_to_world(mouse.position))
	if event is InputEventMouseMotion:
		var motion := event as InputEventMouseMotion
		if panning:
			editor_camera.position -= motion.relative / editor_camera.zoom
		elif dragging_offset and not animations.is_empty():
			var delta_world := motion.relative / editor_camera.zoom
			var safe_scale := Vector2(maxf(absf(character.scale.x), 0.01), maxf(absf(character.scale.y), 0.01))
			var offset := Vector2(_number(animations[selected_animation].get("x", 0.0)), _number(animations[selected_animation].get("y", 0.0)))
			offset -= delta_world / safe_scale
			animations[selected_animation]["x"] = _number_text(offset.x)
			animations[selected_animation]["y"] = _number_text(offset.y)
			loading_ui = true
			anim_x.value = offset.x
			anim_y.value = offset.y
			loading_ui = false
			_mark_dirty()
			_apply_animation_to_preview()


func _screen_to_world(screen: Vector2) -> Vector2:
	return editor_camera.position + (screen - Vector2(640, 360)) / editor_camera.zoom


func _character_rect() -> Rect2:
	if not is_instance_valid(character):
		return Rect2()
	var visual: Node2D = character.animate_sprite if character.uses_animate and is_instance_valid(character.animate_sprite) else character.sprite
	if not is_instance_valid(visual):
		return Rect2()
	var frame_size := character._current_frame_size()
	var top_left := character.position + visual.position * character.scale
	return Rect2(top_left, frame_size * character.scale.abs()).abs()


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	var left_limit := 880.0
	for x in range(-1800, 2600, 50):
		draw_line(Vector2(x, -1600), Vector2(x, 2200), Color(0.3, 0.45, 0.58, 0.10), 1.0)
	for y in range(-1600, 2200, 50):
		draw_line(Vector2(-1800, y), Vector2(2600, y), Color(0.3, 0.45, 0.58, 0.10), 1.0)
	draw_line(Vector2.ZERO, Vector2(0, 720), Color("76BC02"), 2.0)
	draw_line(Vector2.ZERO, Vector2(left_limit, 0), Color("D72C47"), 2.0)
	if is_instance_valid(character):
		var rect := _character_rect()
		draw_rect(rect, Color("00A9D6"), false, 3.0)
		var cam := character.get_camera_position()
		draw_line(cam - Vector2(14, 0), cam + Vector2(14, 0), Color("54E6CF"), 3.0)
		draw_line(cam - Vector2(0, 14), cam + Vector2(0, 14), Color("54E6CF"), 3.0)


func _label(text: String, position_value: Vector2, size_value: Vector2, font_size: int, color: Color, parent: Node) -> Label:
	var label := Label.new()
	label.text = text
	label.position = position_value
	label.size = size_value
	label.add_theme_font_override(&"font", FONT)
	label.add_theme_font_size_override(&"font_size", font_size)
	label.add_theme_color_override(&"font_color", color)
	label.add_theme_color_override(&"font_outline_color", Color.BLACK)
	label.add_theme_constant_override(&"outline_size", 2)
	parent.add_child(label)
	return label


func _button(text: String, position_value: Vector2, size_value: Vector2, parent: Node) -> Button:
	var button := Button.new()
	button.text = text
	button.position = position_value
	button.size = size_value
	button.add_theme_font_override(&"font", FONT)
	button.add_theme_font_size_override(&"font_size", 16)
	button.add_theme_stylebox_override(&"normal", _style(Color("34494B"), Color("6B7E80"), 1))
	button.add_theme_stylebox_override(&"hover", _style(Color("51696B"), Color("54E6CF"), 2))
	parent.add_child(button)
	return button


func _style(background: Color, border: Color, width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(2)
	style.content_margin_left = 8
	style.content_margin_right = 8
	return style


func _line_row(parent: VBoxContainer, label_text: String, callback: Callable) -> LineEdit:
	var row := HBoxContainer.new()
	parent.add_child(row)
	var label := _label(label_text, Vector2.ZERO, Vector2.ZERO, 15, Color("C0D1D4"), row)
	label.custom_minimum_size = Vector2(120, 31)
	var edit := LineEdit.new()
	edit.custom_minimum_size = Vector2(205, 31)
	edit.add_theme_font_override(&"font", FONT)
	edit.add_theme_font_size_override(&"font_size", 15)
	edit.text_changed.connect(callback)
	row.add_child(edit)
	return edit


func _number_row(parent: VBoxContainer, label_text: String, minimum: float, maximum: float, callback: Callable, step: float = 1.0) -> SpinBox:
	var row := HBoxContainer.new()
	parent.add_child(row)
	var label := _label(label_text, Vector2.ZERO, Vector2.ZERO, 15, Color("C0D1D4"), row)
	label.custom_minimum_size = Vector2(120, 31)
	var spin := SpinBox.new()
	spin.custom_minimum_size = Vector2(205, 31)
	spin.min_value = minimum
	spin.max_value = maximum
	spin.step = step
	spin.allow_greater = true
	spin.allow_lesser = true
	spin.value_changed.connect(callback)
	row.add_child(spin)
	return spin


func _check_row(parent: VBoxContainer, label_text: String, callback: Callable) -> CheckBox:
	var check := CheckBox.new()
	check.text = label_text
	check.custom_minimum_size = Vector2(330, 30)
	check.add_theme_font_override(&"font", FONT)
	check.add_theme_font_size_override(&"font_size", 15)
	check.toggled.connect(callback)
	parent.add_child(check)
	return check


func _canonical_animation(value: String) -> String:
	var normalized := value.strip_edges().to_lower().replace("-", "_").replace(" ", "")
	var aliases := {
		"singleft": "left", "left": "left", "sleft": "left",
		"singdown": "down", "down": "down", "sdown": "down",
		"singup": "up", "up": "up", "sup": "up",
		"singright": "right", "right": "right", "sright": "right",
		"singleftmiss": "miss_left", "missleft": "miss_left",
		"singdownmiss": "miss_down", "missdown": "miss_down",
		"singupmiss": "miss_up", "missup": "miss_up",
		"singrightmiss": "miss_right", "missright": "miss_right",
		"danceleft": "dance_left", "danceright": "dance_right"
	}
	return str(aliases.get(normalized, normalized))


func _number(value: Variant, fallback: float = 0.0) -> float:
	if value is int or value is float:
		return float(value)
	var text := str(value).strip_edges()
	return text.to_float() if text.is_valid_float() else fallback


func _bool(value: Variant, fallback: bool = false) -> bool:
	return AmongFunkManager.bool_from_value(value, fallback)


func _number_text(value: float) -> String:
	var rounded := snappedf(value, 0.001)
	return str(int(rounded)) if is_equal_approx(rounded, roundf(rounded)) else str(rounded)
