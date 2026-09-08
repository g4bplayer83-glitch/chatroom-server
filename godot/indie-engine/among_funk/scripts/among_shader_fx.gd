extends Node

var world_layer: CanvasLayer
var hud_layer: CanvasLayer
var effects: Dictionary = {}
var intensity := 1.0
var speed := 1.0
var warning_phase := 0.0


func _ready() -> void:
	world_layer = CanvasLayer.new()
	world_layer.name = "Among Shader World"
	world_layer.layer = 0
	add_child(world_layer)
	hud_layer = CanvasLayer.new()
	hud_layer.name = "Among Shader HUD"
	hud_layer.layer = 3
	add_child(hud_layer)


func set_effect(effect_name: String, enabled: bool, new_intensity: float = 1.0, new_speed: float = 1.0, tint: Color = Color.WHITE) -> void:
	var key := effect_name.strip_edges().to_lower().replace("_", "-").replace(" ", "-")
	intensity = clampf(new_intensity, 0.0, 3.0)
	speed = clampf(new_speed, 0.0, 4.0)
	_remove_effect(key)
	if key == "snow":
		_remove_effect("snow-hud")
	if not enabled:
		return
	match key:
		"snow": _create_snow(tint)
		"space-dust": _create_space_dust(tint)
		"scanlines": _create_scanlines(tint)
		"warning": _create_warning(tint)
		"aurora": _create_aurora(tint)
		_: push_warning("(Among Shader FX) Unknown effect: %s" % effect_name)


func _new_container(key: String, layer: CanvasLayer) -> Control:
	var container := Control.new()
	container.name = key.capitalize()
	container.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	container.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(container)
	effects[key] = container
	return container


func _remove_effect(key: String) -> void:
	if effects.has(key) and is_instance_valid(effects[key]):
		(effects[key] as Node).queue_free()
	effects.erase(key)


func _create_snow(tint: Color) -> void:
	var count_scale := 0.55 if AmongFunkManager.is_mobile() else 1.0
	var world := _new_container("snow", world_layer)
	_add_particles(world, maxi(12, roundi(58.0 * count_scale)), tint, 2.0, 6.0, 42.0, 104.0, true)
	var hud := _new_container("snow-hud", hud_layer)
	_add_particles(hud, maxi(6, roundi(16.0 * count_scale)), tint, 2.0, 4.0, 25.0, 62.0, true)


func _create_space_dust(tint: Color) -> void:
	var count := 16 if AmongFunkManager.is_mobile() else 28
	var container := _new_container("space-dust", hud_layer)
	_add_particles(container, count, tint, 1.0, 3.0, 10.0, 38.0, false)


func _add_particles(container: Control, count: int, tint: Color, min_size: float, max_size: float, min_speed: float, max_speed: float, fall: bool) -> void:
	for index in count:
		var particle := ColorRect.new()
		var side := randf_range(min_size, max_size) * maxf(0.45, intensity)
		particle.size = Vector2(side, side)
		particle.position = Vector2(randf_range(0.0, 1280.0), randf_range(-40.0, 720.0))
		particle.color = Color(tint.r, tint.g, tint.b, randf_range(0.30, 0.88))
		particle.mouse_filter = Control.MOUSE_FILTER_IGNORE
		particle.set_meta(&"velocity", Vector2(randf_range(-16.0, 16.0), randf_range(min_speed, max_speed) if fall else randf_range(-8.0, 8.0)))
		particle.set_meta(&"wrap_y", fall)
		container.add_child(particle)


func _create_scanlines(tint: Color) -> void:
	var container := _new_container("scanlines", hud_layer)
	var line_count := 20 if AmongFunkManager.is_mobile() else 32
	for index in line_count:
		var line := ColorRect.new()
		line.position = Vector2(0, float(index) * (720.0 / float(line_count)))
		line.size = Vector2(1280, 1.0 + intensity)
		line.color = Color(tint.r, tint.g, tint.b, clampf(0.05 * intensity, 0.02, 0.16))
		line.mouse_filter = Control.MOUSE_FILTER_IGNORE
		line.set_meta(&"velocity", Vector2(0, 9.0))
		line.set_meta(&"wrap_y", true)
		container.add_child(line)
	var glitch_count := 3 if AmongFunkManager.is_mobile() else 6
	for index in glitch_count:
		var glitch := ColorRect.new()
		glitch.position = Vector2(randf_range(0, 880), randf_range(0, 720))
		glitch.size = Vector2(randf_range(140, 420), randf_range(2, 8))
		glitch.color = Color(tint.r, tint.g, tint.b, 0.06 * intensity)
		glitch.mouse_filter = Control.MOUSE_FILTER_IGNORE
		glitch.set_meta(&"velocity", Vector2(randf_range(20, 70), 0))
		container.add_child(glitch)


func _create_warning(tint: Color) -> void:
	var container := _new_container("warning", hud_layer)
	var overlay := ColorRect.new()
	overlay.name = "Warning Pulse"
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.color = tint if tint != Color.WHITE else Color("FF2538")
	overlay.color.a = 0.0
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	container.add_child(overlay)


func _create_aurora(tint: Color) -> void:
	var container := _new_container("aurora", hud_layer)
	for index in 2:
		var ribbon := ColorRect.new()
		ribbon.position = Vector2(-180 + index * 430, 90 + index * 180)
		ribbon.size = Vector2(1050, 150)
		ribbon.rotation = deg_to_rad(-14.0 + index * 24.0)
		var ribbon_color := tint if tint != Color.WHITE else (Color("4EFFE0") if index == 0 else Color("8A62FF"))
		ribbon_color.a = 0.10 * intensity
		ribbon.color = ribbon_color
		ribbon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		ribbon.set_meta(&"velocity", Vector2(12.0 + index * 7.0, 0))
		container.add_child(ribbon)


func _process(delta: float) -> void:
	var movement_scale := maxf(speed, 0.05) * delta
	for raw_container in effects.values():
		if not is_instance_valid(raw_container):
			continue
		var container := raw_container as Control
		for child in container.get_children():
			if child is not Control or not child.has_meta(&"velocity"):
				continue
			var item := child as Control
			var velocity: Vector2 = item.get_meta(&"velocity", Vector2.ZERO)
			item.position += velocity * movement_scale
			if bool(item.get_meta(&"wrap_y", false)) and item.position.y > 730.0:
				item.position.y = -maxf(item.size.y, 4.0)
			if item.position.x > 1320.0:
				item.position.x = -item.size.x
			elif item.position.x < -item.size.x - 20.0:
				item.position.x = 1300.0
	if effects.has("warning") and is_instance_valid(effects["warning"]):
		warning_phase += delta * maxf(speed, 0.2) * TAU
		var warning := effects["warning"] as Control
		if warning.get_child_count() > 0:
			(warning.get_child(0) as CanvasItem).modulate.a = (0.06 + (sin(warning_phase) + 1.0) * 0.07) * intensity
