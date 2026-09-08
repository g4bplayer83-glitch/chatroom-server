extends RefCounted
class_name CNEAtlas


static func read_atlas(xml_path: String) -> Array[Dictionary]:
	var records: Array[Dictionary] = []
	var parser := XMLParser.new()
	if parser.open(xml_path) != OK:
		push_error("(CNEAtlas) Could not open atlas: %s" % xml_path)
		return records
	while parser.read() == OK:
		if parser.get_node_type() != XMLParser.NODE_ELEMENT:
			continue
		if parser.get_node_name().to_lower() != "subtexture":
			continue
		var record: Dictionary = {}
		for index in parser.get_attribute_count():
			record[parser.get_attribute_name(index)] = parser.get_attribute_value(index)
		if record.has("name"):
			records.append(record)
	return records


static func build_character_frames(
	texture_path: String,
	xml_path: String,
	animation_specs: Array[Dictionary]
) -> SpriteFrames:
	var texture: Texture2D = ResourceLoader.load(texture_path)
	var records := read_atlas(xml_path)
	var frames := SpriteFrames.new()
	frames.remove_animation(&"default")
	for spec in animation_specs:
		var animation_name := StringName(str(spec.get("canonical", spec.get("name", "idle"))))
		var prefix := str(spec.get("prefix", spec.get("anim", animation_name)))
		var normalized_prefix := prefix.to_lower()
		var matches: Array[Dictionary] = []
		for record in records:
			if str(record.get("name", "")).to_lower().begins_with(normalized_prefix):
				matches.append(record)
		matches.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			return str(a.get("name", "")) < str(b.get("name", ""))
		)
		if matches.is_empty():
			continue
		if frames.has_animation(animation_name):
			frames.remove_animation(animation_name)
		frames.add_animation(animation_name)
		frames.set_animation_speed(animation_name, float(spec.get("fps", 24.0)))
		frames.set_animation_loop(animation_name, bool(spec.get("loop", false)))
		var selected_indices := _parse_indices(spec.get("indices", ""), matches.size())
		if selected_indices.is_empty():
			for record in matches:
				frames.add_frame(animation_name, _make_atlas_texture(texture, record), 1.0)
		else:
			for frame_index in selected_indices:
				if frame_index >= 0 and frame_index < matches.size():
					frames.add_frame(animation_name, _make_atlas_texture(texture, matches[frame_index]), 1.0)
	return frames


static func build_all_frames(texture_path: String, xml_path: String) -> SpriteFrames:
	var texture: Texture2D = ResourceLoader.load(texture_path)
	var records := read_atlas(xml_path)
	var groups: Dictionary = {}
	for record in records:
		var group_name := _strip_frame_suffix(str(record.get("name", "frame")))
		if not groups.has(group_name):
			groups[group_name] = []
		groups[group_name].append(record)
	var frames := SpriteFrames.new()
	frames.remove_animation(&"default")
	for group_name in groups:
		var animation_records: Array = groups[group_name]
		animation_records.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			return str(a.get("name", "")) < str(b.get("name", ""))
		)
		frames.add_animation(StringName(group_name))
		frames.set_animation_speed(StringName(group_name), 24.0)
		frames.set_animation_loop(StringName(group_name), true)
		for record in animation_records:
			frames.add_frame(StringName(group_name), _make_atlas_texture(texture, record), 1.0)
	return frames


static func _make_atlas_texture(texture: Texture2D, record: Dictionary) -> AtlasTexture:
	var atlas := AtlasTexture.new()
	atlas.atlas = texture
	var width := float(record.get("width", 0.0))
	var height := float(record.get("height", 0.0))
	atlas.region = Rect2(
		float(record.get("x", 0.0)),
		float(record.get("y", 0.0)),
		width,
		height
	)
	var frame_width := float(record.get("frameWidth", width))
	var frame_height := float(record.get("frameHeight", height))
	var frame_x := float(record.get("frameX", 0.0))
	var frame_y := float(record.get("frameY", 0.0))
	atlas.margin = Rect2(
		-frame_x,
		-frame_y,
		maxf(0.0, frame_width - width),
		maxf(0.0, frame_height - height)
	)
	return atlas


static func _strip_frame_suffix(value: String) -> String:
	var output := value
	while not output.is_empty() and output.right(1).is_valid_int():
		output = output.left(output.length() - 1)
	return output.strip_edges()


static func _parse_indices(raw_value: Variant, frame_count: int) -> Array[int]:
	var output: Array[int] = []
	if raw_value is Array or raw_value is PackedInt32Array or raw_value is PackedInt64Array:
		for raw_index in raw_value:
			var index := int(raw_index)
			if index >= 0 and index < frame_count:
				output.append(index)
		return output
	var value := str(raw_value).strip_edges()
	if value.is_empty():
		return output
	for token_value in value.replace(";", ",").split(",", false):
		var token := token_value.strip_edges()
		if ".." in token:
			var bounds := token.split("..", false, 1)
			if bounds.size() != 2 or not bounds[0].strip_edges().is_valid_int() or not bounds[1].strip_edges().is_valid_int():
				continue
			var first := int(bounds[0])
			var last := int(bounds[1])
			var direction := 1 if last >= first else -1
			var current := first
			while current != last + direction:
				if current >= 0 and current < frame_count:
					output.append(current)
				current += direction
		elif token.is_valid_int():
			var index := int(token)
			if index >= 0 and index < frame_count:
				output.append(index)
	return output
