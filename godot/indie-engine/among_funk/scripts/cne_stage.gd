extends Stage
class_name CNEStage

const CNE_VIEWPORT_SIZE := Vector2(1280.0, 720.0)

var stage_id: String = ""
var stage_zoom: float = 1.05
var stage_start_camera := Vector2.ZERO
var has_start_camera_x := false
var has_start_camera_y := false
var character_data: Dictionary = {}
var beat_sprites: Array[AnimatedSprite2D] = []


func _ready() -> void:
	Signals.play_conductor_beat_hit.connect(_on_conductor_new_beat)


func load_stage(requested_id: String) -> bool:
	stage_id = requested_id
	for child in get_children():
		child.queue_free()
	beat_sprites.clear()
	_reset_stage_values()

	var config_path := AmongFunkManager.resolve_stage_config(requested_id)
	if config_path.is_empty():
		_create_fallback()
		return false

	var parser := XMLParser.new()
	if parser.open(config_path) != OK:
		_create_fallback()
		return false

	var folder := ""
	var draw_index := 0
	while parser.read() == OK:
		if parser.get_node_type() != XMLParser.NODE_ELEMENT:
			continue
		var node_name := parser.get_node_name().to_lower()
		var attributes := _normalized_attributes(parser)
		match node_name:
			"stage":
				folder = str(attributes.get("folder", ""))
				stage_zoom = _number(attributes.get("zoom", 1.05), 1.05)
				has_start_camera_x = attributes.has("startcamposx")
				has_start_camera_y = attributes.has("startcamposy")
				stage_start_camera.x = _number(attributes.get("startcamposx", 0.0), 0.0)
				stage_start_camera.y = _number(attributes.get("startcamposy", 0.0), 0.0)
			"sprite", "spr", "sparrow":
				_create_stage_sprite(folder, attributes, draw_index)
				draw_index += 1
			"dad", "opponent":
				_parse_character_marker("dad", attributes, draw_index)
				draw_index += 1
			"boyfriend", "bf", "player":
				_parse_character_marker("boyfriend", attributes, draw_index)
				draw_index += 1
			"girlfriend", "gf":
				_parse_character_marker("girlfriend", attributes, draw_index)
				draw_index += 1

	return true


func _reset_stage_values() -> void:
	stage_zoom = 1.05
	stage_start_camera = Vector2.ZERO
	has_start_camera_x = false
	has_start_camera_y = false
	# Exact Codename Engine Stage.getDefaultPos() values.
	character_data = {
		"dad": _default_character_data(Vector2(100.0, 100.0), false, 1.0, 5),
		"boyfriend": _default_character_data(Vector2(770.0, 100.0), true, 1.0, 6),
		"girlfriend": _default_character_data(Vector2(400.0, 130.0), false, 0.95, 4)
	}


func _default_character_data(position: Vector2, flip: bool, scroll: float, z_index: int) -> Dictionary:
	return {
		"position": position,
		"scale": Vector2.ONE,
		"scroll": Vector2.ONE * scroll,
		"flip": flip,
		"spacing": Vector2(20.0, 0.0),
		"camera_offset": Vector2.ZERO,
		"skew": Vector2.ZERO,
		"alpha": 1.0,
		"angle": 0.0,
		"zoom_factor": 1.0,
		"z_index": z_index
	}


func _parse_character_marker(role: String, attributes: Dictionary, draw_index: int) -> void:
	var data: Dictionary = character_data.get(role, _default_character_data(Vector2.ZERO, false, 1.0, draw_index))
	var position: Vector2 = data["position"]
	position.x = _number(attributes.get("x", position.x), position.x)
	position.y = _number(attributes.get("y", position.y), position.y)
	data["position"] = position

	var uniform_scale := _number(attributes.get("scale", 1.0), 1.0)
	data["scale"] = Vector2(
		_number(attributes.get("scalex", uniform_scale), uniform_scale),
		_number(attributes.get("scaley", uniform_scale), uniform_scale)
	)
	var scroll: Vector2 = data["scroll"]
	if attributes.has("scroll"):
		var uniform_scroll := _number(attributes["scroll"], 1.0)
		scroll = Vector2.ONE * uniform_scroll
	scroll.x = _number(attributes.get("scrollx", scroll.x), scroll.x)
	scroll.y = _number(attributes.get("scrolly", scroll.y), scroll.y)
	data["scroll"] = scroll
	data["spacing"] = Vector2(
		_number(attributes.get("spacingx", 20.0), 20.0),
		_number(attributes.get("spacingy", 0.0), 0.0)
	)
	data["camera_offset"] = Vector2(
		_number(attributes.get("camxoffset", 0.0), 0.0),
		_number(attributes.get("camyoffset", 0.0), 0.0)
	)
	data["skew"] = Vector2(
		_number(attributes.get("skewx", 0.0), 0.0),
		_number(attributes.get("skewy", 0.0), 0.0)
	)
	data["alpha"] = _number(attributes.get("alpha", 1.0), 1.0)
	data["angle"] = _number(attributes.get("angle", 0.0), 0.0)
	data["zoom_factor"] = _number(attributes.get("zoomfactor", 1.0), 1.0)
	data["z_index"] = draw_index
	if attributes.has("flip") or attributes.has("flipx"):
		data["flip"] = _as_bool(attributes.get("flip", attributes.get("flipx", false)))
	character_data[role] = data


func get_character_data(role: String) -> Dictionary:
	var normalized := _normalize_role(role)
	var data: Dictionary = character_data.get(normalized, {})
	return data.duplicate(true)


func get_character_position(role: String) -> Vector2:
	return Vector2(get_character_data(role).get("position", Vector2.ZERO))


func get_character_scale(role: String) -> Vector2:
	return Vector2(get_character_data(role).get("scale", Vector2.ONE))


func get_character_z_index(role: String) -> int:
	return int(get_character_data(role).get("z_index", 5))


func is_character_flipped(role: String) -> bool:
	return bool(get_character_data(role).get("flip", role.to_lower() == "boyfriend"))


func get_initial_camera(fallback: Vector2) -> Vector2:
	var result := fallback
	if has_start_camera_x:
		result.x = stage_start_camera.x
	if has_start_camera_y:
		result.y = stage_start_camera.y
	return result


func _create_stage_sprite(folder: String, attributes: Dictionary, draw_index: int) -> void:
	var sprite_id := str(attributes.get("sprite", attributes.get("name", "")))
	if sprite_id.is_empty():
		return
	var relative := folder.path_join(sprite_id).trim_prefix("/")
	var texture_path := AmongFunkManager.resolve_image(relative)
	if texture_path.is_empty() and sprite_id.nocasecmp_to("Starman_BG_Fire_Assets") == 0:
		# This one file is referenced by the source XML but is absent even from
		# the original archive. FireV2 is the matching supplied animated backdrop.
		relative = folder.path_join("FireV2").trim_prefix("/")
		texture_path = AmongFunkManager.resolve_image(relative)
	if texture_path.is_empty():
		push_warning("(Among Funk) Stage image not found: %s" % relative)
		return

	var atlas_path := AmongFunkManager.resolve_named_file(
		"res://among_funk/codename/images", relative, ["xml"]
	)
	var visual: Node2D
	if not atlas_path.is_empty():
		var animated := AnimatedSprite2D.new()
		animated.sprite_frames = CNEAtlas.build_all_frames(texture_path, atlas_path)
		animated.centered = true
		var animation_names := animated.sprite_frames.get_animation_names()
		if not animation_names.is_empty():
			animated.play(animation_names[0])
		visual = animated
		if str(attributes.get("type", "loop")).to_lower() == "beat":
			beat_sprites.append(animated)
	else:
		var static_sprite := Sprite2D.new()
		static_sprite.texture = ResourceLoader.load(texture_path)
		static_sprite.centered = true
		visual = static_sprite

	visual.name = str(attributes.get("name", sprite_id)).validate_node_name()
	var position := Vector2(
		_number(attributes.get("x", 0.0), 0.0),
		_number(attributes.get("y", 0.0), 0.0)
	)
	var uniform_scale := _number(attributes.get("scale", 1.0), 1.0)
	var sprite_scale := Vector2(
		_number(attributes.get("scalex", uniform_scale), uniform_scale),
		_number(attributes.get("scaley", uniform_scale), uniform_scale)
	)
	sprite_scale = _apply_graphic_size(visual, attributes, sprite_scale)
	var angle := deg_to_rad(_number(attributes.get("angle", 0.0), 0.0))
	var skew_x := deg_to_rad(_number(attributes.get("skewx", 0.0), 0.0))
	var skew_y := deg_to_rad(_number(attributes.get("skewy", 0.0), 0.0))
	apply_cne_visual_transform(visual, position, sprite_scale, angle, skew_x, skew_y)

	if visual is Sprite2D or visual is AnimatedSprite2D:
		visual.set("flip_h", _as_bool(attributes.get("flipx", false)))
		visual.set("flip_v", _as_bool(attributes.get("flipy", false)))
	if not _as_bool(attributes.get("antialiasing", true)):
		visual.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	var tint := AmongFunkManager.color_from_value(attributes.get("color", Color.WHITE), Color.WHITE)
	tint.a *= clampf(_number(attributes.get("alpha", 1.0), 1.0), 0.0, 1.0)
	visual.modulate = tint
	visual.visible = _as_bool(attributes.get("visible", true))
	visual.z_index = draw_index
	_apply_blend_mode(visual, str(attributes.get("blend", "")))
	add_child(visual)


func _apply_graphic_size(visual: Node2D, attributes: Dictionary, current_scale: Vector2) -> Vector2:
	var size := get_visual_frame_size(visual)
	if size.x <= 0.0 or size.y <= 0.0:
		return current_scale
	if attributes.has("graphicsize"):
		var graphic_size := _number(attributes["graphicsize"], size.x)
		return Vector2(graphic_size / size.x, graphic_size / size.y)
	if attributes.has("graphicsizex"):
		current_scale.x = _number(attributes["graphicsizex"], size.x) / size.x
	if attributes.has("graphicsizey"):
		current_scale.y = _number(attributes["graphicsizey"], size.y) / size.y
	return current_scale


func get_visual_frame_size(visual: Node2D) -> Vector2:
	var size := Vector2.ZERO
	if visual is Sprite2D and visual.texture:
		size = visual.texture.get_size()
	elif visual is AnimatedSprite2D and visual.sprite_frames:
		var names: PackedStringArray = visual.sprite_frames.get_animation_names()
		if not names.is_empty() and visual.sprite_frames.get_frame_count(names[0]) > 0:
			var frame_texture: Texture2D = visual.sprite_frames.get_frame_texture(names[0], 0)
			if frame_texture:
				size = frame_texture.get_size()
	return size


func apply_cne_visual_transform(
	visual: Node2D,
	source_position: Vector2,
	scale_value: Vector2,
	angle: float,
	skew_x: float,
	skew_y: float
) -> void:
	# Flixel/Codename stores x/y as the unscaled top-left position, but applies
	# scale and rotation around the graphic's centre. Godot's old port used a
	# top-left pivot, which shifted Polus by hundreds of pixels at scale 1.4.
	var frame_size := get_visual_frame_size(visual)
	if visual is Sprite2D:
		visual.centered = true
	elif visual is AnimatedSprite2D:
		visual.centered = true
	var pivot_position := source_position + frame_size * 0.5
	visual.transform = _sprite_transform(pivot_position, scale_value, angle, skew_x, skew_y)


func _sprite_transform(
	position: Vector2,
	scale_value: Vector2,
	angle: float,
	skew_x: float,
	skew_y: float
) -> Transform2D:
	var output := Transform2D(angle, scale_value, skew_x, position)
	if not is_zero_approx(skew_y):
		var y_shear := Transform2D(
			Vector2(1.0, tan(skew_y)),
			Vector2(0.0, 1.0),
			Vector2.ZERO
		)
		output = output * y_shear
	return output


func _apply_blend_mode(visual: CanvasItem, raw_mode: String) -> void:
	var mode := raw_mode.strip_edges().to_lower()
	if mode.is_empty() or mode == "normal":
		return
	var canvas_material := CanvasItemMaterial.new()
	match mode:
		"add", "additive": canvas_material.blend_mode = CanvasItemMaterial.BLEND_MODE_ADD
		"multiply": canvas_material.blend_mode = CanvasItemMaterial.BLEND_MODE_MUL
		"subtract": canvas_material.blend_mode = CanvasItemMaterial.BLEND_MODE_SUB
		_: return
	visual.material = canvas_material


func _create_fallback() -> void:
	stage_zoom = 1.0
	var background := Sprite2D.new()
	background.texture = ResourceLoader.load("res://among_funk/codename/images/stages/polus/Polus-Fond.png")
	background.centered = true
	background.position = background.texture.get_size() * 0.5 if background.texture else Vector2.ZERO
	add_child(background)


func _on_conductor_new_beat(_current_beat: int, _measure_relative: int) -> void:
	for animated in beat_sprites:
		if is_instance_valid(animated):
			animated.set_frame_and_progress(0, 0.0)
			animated.play()


func _normalized_attributes(parser: XMLParser) -> Dictionary:
	var output: Dictionary = {}
	for index in parser.get_attribute_count():
		output[parser.get_attribute_name(index).to_lower()] = parser.get_attribute_value(index)
	return output


func _normalize_role(role: String) -> String:
	var normalized := role.strip_edges().to_lower()
	match normalized:
		"opponent": return "dad"
		"bf", "player": return "boyfriend"
		"gf": return "girlfriend"
		_: return normalized


func _number(value: Variant, fallback: float) -> float:
	if value is int or value is float:
		return float(value)
	var text := str(value).strip_edges()
	return text.to_float() if text.is_valid_float() else fallback


func _as_bool(value: Variant) -> bool:
	if value is bool:
		return value
	return str(value).strip_edges().to_lower() in ["true", "1", "yes"]
