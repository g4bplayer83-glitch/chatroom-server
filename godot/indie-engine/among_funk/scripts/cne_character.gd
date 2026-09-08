extends Node2D
class_name CNECharacter

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D
var animate_sprite: AnimateSymbol2D
var animate_library: TextureAtlas
var animate_symbols: Dictionary = {}
var animate_ranges: Dictionary = {}
var animate_loops: Dictionary = {}
var uses_animate := false

var character_id: String = ""
var character_role: String = "dad"
var animation_names: Dictionary = {}
var animation_offsets: Dictionary = {}
var dance_animations: Array[StringName] = [&"idle"]
var dance_index := 0
var animation_prefix := ""
var sing_timer := 0.0
var config_offset := Vector2.ZERO
var camera_offset := Vector2.ZERO
var stage_camera_offset := Vector2.ZERO
var icon_name := "RedCrewmate"
var icon_color := Color.WHITE
var requested_scale := 1.0
var stage_scale := Vector2.ONE
var stage_flip := false
var player_offsets := false
var root_flip := false
var centered_camera := true
var current_animation := &"idle"
var silhouette_strength := 0.0
var silhouette_color := Color.WHITE
var silhouette_material: ShaderMaterial


func _ready() -> void:
	sprite.animation_finished.connect(_on_animation_finished)
	Signals.play_conductor_beat_hit.connect(_on_beat_hit)


func configure(requested_id: String, role: String = "dad", should_flip: bool = false) -> bool:
	character_role = _normalize_role(role)
	stage_flip = should_flip
	character_id = AmongFunkManager.resolve_character_id(requested_id)
	var config_path := AmongFunkManager.resolve_character_config(character_id)
	if config_path.is_empty():
		push_warning("(Among Funk) Character config not found: %s" % requested_id)
		_configure_fallback(requested_id)
		return false

	var parsed := _read_character_config(config_path)
	var root: Dictionary = parsed.get("root", {})
	var specs: Array = parsed.get("animations", [])
	var sprite_id := str(root.get("sprite", config_path.get_file().get_basename()))
	var texture_path := AmongFunkManager.resolve_named_file(
		"res://among_funk/codename/images/characters", sprite_id, ["png"]
	)
	var atlas_path := AmongFunkManager.resolve_named_file(
		"res://among_funk/codename/images/characters", sprite_id, ["xml"]
	)
	var animate_folder := "res://among_funk/codename/images/characters/" + sprite_id
	var has_animate_atlas := FileAccess.file_exists(animate_folder + "/Animation.json")
	if (texture_path.is_empty() or atlas_path.is_empty()) and not has_animate_atlas:
		push_warning("(Among Funk) Atlas not found for character: %s" % sprite_id)
		_configure_fallback(requested_id)
		return false

	player_offsets = _as_bool(root.get("isplayer", false))
	root_flip = _as_bool(root.get("flipx", false))
	requested_scale = _number(root.get("scale", 1.0), 1.0)
	config_offset = Vector2(
		_number(root.get("x", 0.0), 0.0),
		_number(root.get("y", 0.0), 0.0)
	)
	# Keep malformed source values from making a character permanently invisible.
	if requested_scale <= 0.00001:
		requested_scale = 1.0
	if absf(config_offset.x) > 10000.0 or absf(config_offset.y) > 10000.0:
		config_offset = Vector2.ZERO
	camera_offset = Vector2(
		_number(root.get("camx", 0.0), 0.0),
		_number(root.get("camy", 0.0), 0.0)
	)
	centered_camera = _as_bool(root.get("centercam", true))
	icon_name = str(root.get("icon", character_id))
	icon_color = AmongFunkManager.color_from_value(root.get("color", "#FFFFFF"))

	var canonical_specs: Array[Dictionary] = []
	for raw_spec in specs:
		if raw_spec is not Dictionary:
			continue
		var spec: Dictionary = raw_spec.duplicate(true)
		var original_name := str(spec.get("name", "idle"))
		spec["canonical"] = _canonical_animation(original_name)
		canonical_specs.append(spec)
	if stage_flip != player_offsets:
		_swap_left_right_specs(canonical_specs)

	animation_names.clear()
	animation_offsets.clear()
	animate_symbols.clear()
	animate_ranges.clear()
	animate_loops.clear()
	var dances: Array[StringName] = []
	for spec in canonical_specs:
		var canonical := str(spec.get("canonical", "idle"))
		var canonical_name := StringName(canonical)
		animation_names[canonical_name] = canonical_name
		animation_offsets[canonical_name] = Vector2(
			_number(spec.get("x", 0.0), 0.0),
			_number(spec.get("y", 0.0), 0.0)
		)
		if canonical == "idle" or canonical.begins_with("dance_"):
			dances.append(canonical_name)

	uses_animate = has_animate_atlas
	if uses_animate:
		_configure_animate_atlas(animate_folder, canonical_specs)
	else:
		_hide_animate_sprite()
		sprite.visible = true
		sprite.sprite_frames = CNEAtlas.build_character_frames(texture_path, atlas_path, canonical_specs)
	# A zero-strength tint must use the untouched atlas texture. Keeping the
	# shader attached here caused the sampled texture to be multiplied twice on
	# some renderers, making every character look permanently dark.
	_apply_silhouette_material()
	sprite.centered = false
	sprite.scale = Vector2.ONE
	sprite.flip_h = root_flip != stage_flip
	if uses_animate and is_instance_valid(animate_sprite):
		animate_sprite.centered = false
		animate_sprite.flip_h = root_flip != stage_flip
	if not _as_bool(root.get("antialiasing", true)):
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	else:
		sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	if dances.is_empty():
		dances.append(&"idle")
	dance_animations = dances
	dance_index = 0
	visible = true
	_apply_total_scale()
	play_animation(dance_animations[0])
	return true


func apply_stage_layout(data: Dictionary) -> void:
	position = Vector2(data.get("position", position))
	stage_scale = Vector2(data.get("scale", Vector2.ONE))
	stage_camera_offset = Vector2(data.get("camera_offset", Vector2.ZERO))
	rotation = deg_to_rad(_number(data.get("angle", 0.0), 0.0))
	skew = deg_to_rad(Vector2(data.get("skew", Vector2.ZERO)).x)
	modulate.a = clampf(_number(data.get("alpha", 1.0), 1.0), 0.0, 1.0)
	z_index = int(data.get("z_index", z_index))
	_apply_total_scale()
	_refresh_sprite_position(current_animation)


func _apply_total_scale() -> void:
	scale = stage_scale * requested_scale


func _configure_fallback(requested_id: String) -> void:
	uses_animate = false
	_hide_animate_sprite()
	sprite.visible = true
	animation_names = {
		&"idle": &"idle", &"left": &"idle", &"down": &"idle",
		&"up": &"idle", &"right": &"idle"
	}
	animation_offsets.clear()
	var frames := SpriteFrames.new()
	frames.remove_animation(&"default")
	frames.add_animation(&"idle")
	var fallback_path := AmongFunkManager.resolve_image("icons/" + requested_id)
	if fallback_path.is_empty():
		fallback_path = "res://among_funk/codename/images/icons/RedCrewmate.png"
	var texture: Texture2D = ResourceLoader.load(fallback_path)
	if texture:
		frames.add_frame(&"idle", texture)
	sprite.sprite_frames = frames
	sprite.centered = true
	sprite.scale = Vector2.ONE
	sprite.flip_h = stage_flip
	requested_scale = 1.0
	stage_scale = Vector2.ONE
	config_offset = Vector2.ZERO
	camera_offset = Vector2.ZERO
	player_offsets = false
	root_flip = false
	dance_animations = [&"idle"]
	_apply_total_scale()
	play_animation(&"idle")


func set_silhouette(color: Color, amount: float) -> void:
	silhouette_color = color
	silhouette_strength = clampf(amount, 0.0, 1.0)
	_apply_silhouette_material()
	if silhouette_material:
		silhouette_material.set_shader_parameter(&"tint_color", silhouette_color)
		silhouette_material.set_shader_parameter(&"tint_amount", silhouette_strength)


func _apply_silhouette_material() -> void:
	if silhouette_strength <= 0.0001:
		sprite.material = null
		if is_instance_valid(animate_sprite):
			animate_sprite.material = null
		return
	_ensure_silhouette_material()


func _ensure_silhouette_material() -> void:
	if not silhouette_material:
		silhouette_material = ShaderMaterial.new()
		silhouette_material.shader = ResourceLoader.load("res://among_funk/shaders/cne_character_tint.gdshader")
	sprite.material = silhouette_material
	if is_instance_valid(animate_sprite):
		animate_sprite.material = silhouette_material
	silhouette_material.set_shader_parameter(&"tint_color", silhouette_color)
	silhouette_material.set_shader_parameter(&"tint_amount", silhouette_strength)


func _read_character_config(path: String) -> Dictionary:
	var parser := XMLParser.new()
	var output := {"root": {}, "animations": []}
	if parser.open(path) != OK:
		return output
	while parser.read() == OK:
		if parser.get_node_type() != XMLParser.NODE_ELEMENT:
			continue
		var node_name := parser.get_node_name().to_lower()
		var attributes: Dictionary = {}
		for index in parser.get_attribute_count():
			attributes[parser.get_attribute_name(index).to_lower()] = parser.get_attribute_value(index)
		if node_name == "character":
			output["root"] = attributes
		elif node_name == "anim":
			attributes["prefix"] = attributes.get("anim", attributes.get("name", "idle"))
			attributes["fps"] = _number(attributes.get("fps", 24.0), 24.0)
			attributes["loop"] = _as_bool(attributes.get("loop", false))
			output["animations"].append(attributes)
	return output


func _swap_left_right_specs(specs: Array[Dictionary]) -> void:
	var pairs := [
		["left", "right"],
		["miss_left", "miss_right"],
		["alt_left", "alt_right"]
	]
	for pair in pairs:
		var left_index := -1
		var right_index := -1
		for index in specs.size():
			var canonical := str(specs[index].get("canonical", ""))
			if canonical == pair[0]:
				left_index = index
			elif canonical == pair[1]:
				right_index = index
		if left_index >= 0 and right_index >= 0:
			specs[left_index]["canonical"] = pair[1]
			specs[right_index]["canonical"] = pair[0]


func play_animation(
	anim_id: StringName = &"idle",
	_context: int = 0,
	restart: bool = true,
	time: float = -1.0
) -> void:
	if uses_animate:
		_play_animate_animation(anim_id, restart, time)
		return
	if not is_instance_valid(sprite) or sprite.sprite_frames == null:
		return
	var requested := animation_prefix + str(anim_id)
	var canonical := StringName(_canonical_animation(requested))
	if not sprite.sprite_frames.has_animation(canonical):
		canonical = StringName(_canonical_animation(str(anim_id)))
	if not sprite.sprite_frames.has_animation(canonical):
		canonical = &"idle"
	if not sprite.sprite_frames.has_animation(canonical):
		return
	current_animation = canonical
	_refresh_sprite_position(canonical)
	sprite.play(canonical)
	if restart:
		sprite.set_frame_and_progress(0, 0.0)
	if time >= 0.0:
		sing_timer = time
	elif canonical in [
		&"left", &"down", &"up", &"right",
		&"miss_left", &"miss_down", &"miss_up", &"miss_right"
	]:
		set_sing_timer()


func _refresh_sprite_position(animation: StringName) -> void:
	var animation_offset := Vector2(animation_offsets.get(animation, Vector2.ZERO))
	# Codename renders frameOffset with a negative translation. Its character
	# global offset is not scaled, so compensate for the Node2D scale here.
	var render_config_offset := Vector2(
		config_offset.x if stage_flip == player_offsets else -config_offset.x,
		config_offset.y
	)
	var safe_scale := Vector2(
		scale.x if absf(scale.x) > 0.00001 else 1.0,
		scale.y if absf(scale.y) > 0.00001 else 1.0
	)
	var render_position := -animation_offset + render_config_offset / safe_scale
	if uses_animate and is_instance_valid(animate_sprite):
		animate_sprite.position = render_position
	else:
		sprite.position = render_position


func get_camera_position() -> Vector2:
	var midpoint := position
	if centered_camera:
		var total_scale := Vector2(absf(stage_scale.x * requested_scale), absf(stage_scale.y * requested_scale))
		midpoint += _current_frame_size() * total_scale * 0.5
	return midpoint + Vector2(-100.0 if stage_flip else 150.0, -100.0) \
		+ config_offset + camera_offset + stage_camera_offset


func _current_frame_size() -> Vector2:
	if uses_animate and is_instance_valid(animate_sprite) and is_instance_valid(animate_library):
		return animate_library.get_symbol_rect(animate_sprite.symbol).size
	if not is_instance_valid(sprite) or not sprite.sprite_frames:
		return Vector2.ZERO
	var animation := sprite.animation
	if not sprite.sprite_frames.has_animation(animation):
		return Vector2.ZERO
	var count := sprite.sprite_frames.get_frame_count(animation)
	if count <= 0:
		return Vector2.ZERO
	var frame_index := clampi(sprite.frame, 0, count - 1)
	var texture := sprite.sprite_frames.get_frame_texture(animation, frame_index)
	return texture.get_size() if texture else Vector2.ZERO


func set_sing_timer(time: float = -1.0) -> void:
	if time < 0.0:
		time = maxf(0.12, GameManager.seconds_per_step * 6.0)
	sing_timer = time


func set_prefix(prefix: StringName) -> void:
	animation_prefix = str(prefix)


func dance() -> void:
	if dance_animations.is_empty():
		return
	play_animation(dance_animations[dance_index])
	dance_index = wrapi(dance_index + 1, 0, dance_animations.size())


func _process(delta: float) -> void:
	if uses_animate and is_instance_valid(animate_sprite) and animate_ranges.has(current_animation):
		var frame_range: Vector2i = animate_ranges[current_animation]
		if animate_sprite.frame >= frame_range.y:
			if bool(animate_loops.get(current_animation, false)):
				animate_sprite.frame = frame_range.x
			else:
				animate_sprite.frame = frame_range.y
				animate_sprite.playing = false
	if sing_timer > 0.0:
		sing_timer -= delta
		if sing_timer <= 0.0:
			dance()


func _on_beat_hit(_beat: int, measure: int) -> void:
	if sing_timer <= 0.0 and measure % 2 == 0:
		dance()


func _on_animation_finished() -> void:
	if sing_timer <= 0.0 and not dance_animations.has(current_animation):
		dance()


func _configure_animate_atlas(folder: String, specs: Array[Dictionary]) -> void:
	sprite.visible = false
	if not is_instance_valid(animate_sprite):
		animate_sprite = AnimateSymbol2D.new()
		animate_sprite.name = "AnimateSymbol2D"
		add_child(animate_sprite)
		animate_sprite.animation_finished.connect(_on_animation_finished)
	animate_sprite.visible = true
	animate_library = TextureAtlas.new()
	animate_library.folder = folder
	animate_sprite.symbol_libraries = [animate_library]
	var available := animate_library.get_symbol_list()
	for spec in specs:
		var canonical := StringName(str(spec.get("canonical", "idle")))
		var prefix := str(spec.get("prefix", spec.get("name", "idle")))
		var resolved := _resolve_animate_symbol(prefix, available)
		if resolved.is_empty():
			continue
		animate_symbols[canonical] = StringName(resolved)
		animate_loops[canonical] = _as_bool(spec.get("loop", false))
		var last_frame := maxi(animate_library.get_symbol_length(StringName(resolved)) - 1, 0)
		animate_ranges[canonical] = _parse_frame_range(str(spec.get("indices", "")), last_frame)
	animate_sprite.centered = false
	animate_sprite.playing = false


func _hide_animate_sprite() -> void:
	if is_instance_valid(animate_sprite):
		animate_sprite.visible = false
		animate_sprite.playing = false


func _play_animate_animation(anim_id: StringName, restart: bool, time: float) -> void:
	if not is_instance_valid(animate_sprite) or not is_instance_valid(animate_library):
		return
	var requested := animation_prefix + str(anim_id)
	var canonical := StringName(_canonical_animation(requested))
	if not animate_symbols.has(canonical):
		canonical = StringName(_canonical_animation(str(anim_id)))
	if not animate_symbols.has(canonical):
		canonical = &"idle" if animate_symbols.has(&"idle") else (animate_symbols.keys()[0] if not animate_symbols.is_empty() else &"")
	if canonical.is_empty():
		return
	current_animation = canonical
	_refresh_sprite_position(canonical)
	animate_sprite.symbol = animate_symbols[canonical]
	var frame_range: Vector2i = animate_ranges.get(canonical, Vector2i.ZERO)
	if restart:
		animate_sprite.frame = frame_range.x
	animate_sprite.loop = false
	animate_sprite.playing = true
	if time >= 0.0:
		sing_timer = time
	elif canonical in [&"left", &"down", &"up", &"right", &"miss_left", &"miss_down", &"miss_up", &"miss_right"]:
		set_sing_timer()


func _resolve_animate_symbol(prefix: String, available: PackedStringArray) -> String:
	for symbol_name in available:
		if str(symbol_name).nocasecmp_to(prefix) == 0:
			return str(symbol_name)
	for symbol_name in available:
		if str(symbol_name).to_lower().begins_with(prefix.to_lower()):
			return str(symbol_name)
	return ""


func _parse_frame_range(value: String, last_frame: int) -> Vector2i:
	var cleaned := value.strip_edges()
	if cleaned.is_empty():
		return Vector2i(0, last_frame)
	if ".." in cleaned:
		var bounds := cleaned.split("..", false, 1)
		if bounds.size() == 2 and bounds[0].is_valid_int() and bounds[1].is_valid_int():
			return Vector2i(clampi(int(bounds[0]), 0, last_frame), clampi(int(bounds[1]), 0, last_frame))
	var indices := cleaned.split(",", false)
	if not indices.is_empty() and indices[0].strip_edges().is_valid_int():
		var first := clampi(int(indices[0]), 0, last_frame)
		var last := first
		for raw_index in indices:
			if raw_index.strip_edges().is_valid_int():
				last = clampi(int(raw_index), 0, last_frame)
		return Vector2i(first, last)
	return Vector2i(0, last_frame)


func _canonical_animation(value: String) -> String:
	var compact := value.strip_edges().replace("-", "_").replace(" ", "_")
	var lower := compact.to_lower()
	var mapping := {
		"singleft": "left", "singdown": "down", "singup": "up", "singright": "right",
		"singleftmiss": "miss_left", "singdownmiss": "miss_down",
		"singupmiss": "miss_up", "singrightmiss": "miss_right",
		"singleft_alt": "alt_left", "singdown_alt": "alt_down",
		"singup_alt": "alt_up", "singright_alt": "alt_right",
		"danceleft": "dance_left", "danceright": "dance_right"
	}
	return str(mapping.get(lower, lower.to_snake_case()))


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
