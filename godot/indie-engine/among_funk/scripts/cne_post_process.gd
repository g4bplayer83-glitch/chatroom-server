extends CanvasLayer
class_name CNEPostProcess

const SHADER_PATH := "res://among_funk/shaders/cne_post_process.gdshader"

var shader_material: ShaderMaterial
var strengths: Dictionary = {}
var strength_tweens: Dictionary = {}
var removal_tokens: Dictionary = {}
var elapsed_time := 0.0
var crt_current := Vector3(0.0, 0.0, 1.0)
var crt_target := Vector3(0.0, 0.0, 1.0)
var crt_smoothing := 5.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var copy := BackBufferCopy.new()
	copy.name = "Screen Copy"
	copy.copy_mode = BackBufferCopy.COPY_MODE_VIEWPORT
	add_child(copy)

	var rect := ColorRect.new()
	rect.name = "Post Process"
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rect.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shader_material = ShaderMaterial.new()
	shader_material.shader = ResourceLoader.load(SHADER_PATH)
	rect.material = shader_material
	add_child(rect)
	_update_viewport_size()


func _process(delta: float) -> void:
	elapsed_time += delta
	if not shader_material:
		return
	shader_material.set_shader_parameter(&"effect_time", elapsed_time)
	_update_viewport_size()
	if crt_smoothing <= 0.0:
		crt_current = crt_target
	else:
		crt_current = Global.frame_independent_lerp(crt_current, crt_target, crt_smoothing, delta)
	shader_material.set_shader_parameter(&"crt_distortion", crt_current.x)
	shader_material.set_shader_parameter(&"crt_chromatic", crt_current.y)
	shader_material.set_shader_parameter(&"crt_zoom", maxf(crt_current.z, 0.05))


func set_crt(distortion: float, chromatic: float, zoom: float, smoothing: float) -> void:
	crt_target = Vector3(distortion, chromatic, maxf(zoom, 0.05))
	crt_smoothing = maxf(smoothing, 0.0)
	if crt_smoothing <= 0.0:
		crt_current = crt_target


func apply_effect(
	effect_name: String,
	enabled: bool,
	intensity: float,
	color: Color,
	parameter_a: float,
	parameter_b: float,
	transition: float,
	ease_name: String,
	hold_seconds: float = 0.0
) -> void:
	var effect := _normalize_effect(effect_name)
	if effect.is_empty():
		return
	# Disabling/removing a shader only fades its current state. Reconfiguring it
	# with zero/default parameters first made auto-removal visibly jump.
	if enabled:
		_configure_effect(effect, color, parameter_a, parameter_b)
	var start := float(strengths.get(effect, 0.0))
	var target := maxf(0.0, intensity) if enabled else 0.0
	if strength_tweens.has(effect):
		var previous: Tween = strength_tweens[effect]
		if previous and previous.is_valid():
			previous.kill()
	var token := int(removal_tokens.get(effect, 0)) + 1
	removal_tokens[effect] = token
	if transition <= 0.0:
		_set_strength(effect, target)
	else:
		var ease_info: Array = Global.string_to_ease(ease_name)
		var tween := create_tween().set_trans(ease_info[0]).set_ease(ease_info[1])
		tween.tween_method(func(value: float) -> void: _set_strength(effect, value), start, target, transition)
		strength_tweens[effect] = tween
	if enabled and hold_seconds > 0.0:
		_remove_later(effect, token, hold_seconds, transition, ease_name)


func _remove_later(effect: String, token: int, hold_seconds: float, transition: float, ease_name: String) -> void:
	await get_tree().create_timer(maxf(hold_seconds, 0.01), false).timeout
	if int(removal_tokens.get(effect, -1)) != token:
		return
	apply_effect(effect, false, 0.0, Color.WHITE, 0.0, 0.0, transition, ease_name)


func _set_strength(effect: String, value: float) -> void:
	strengths[effect] = value
	if shader_material:
		shader_material.set_shader_parameter(StringName(effect + "_intensity"), value)


func _configure_effect(effect: String, color: Color, parameter_a: float, parameter_b: float) -> void:
	if not shader_material:
		return
	match effect:
		"warp": shader_material.set_shader_parameter(&"warp_amount", parameter_a)
		"wave": shader_material.set_shader_parameter(&"wave_frequency", parameter_a)
		"heat":
			shader_material.set_shader_parameter(&"heat_speed", parameter_a)
			shader_material.set_shader_parameter(&"heat_scale", parameter_b)
		"glitch":
			shader_material.set_shader_parameter(&"glitch_speed", parameter_a)
			shader_material.set_shader_parameter(&"glitch_lines", parameter_b)
		"vhs":
			shader_material.set_shader_parameter(&"vhs_chromatic", parameter_a)
			shader_material.set_shader_parameter(&"vhs_noise", parameter_b)
		"blur": shader_material.set_shader_parameter(&"blur_radius", parameter_a)
		"bloom": shader_material.set_shader_parameter(&"bloom_radius", parameter_a)
		"colorgrade":
			shader_material.set_shader_parameter(&"colorgrade_saturation", parameter_a)
			shader_material.set_shader_parameter(&"colorgrade_contrast", parameter_b)
			shader_material.set_shader_parameter(&"colorgrade_tint", color)
		"vignette": shader_material.set_shader_parameter(&"vignette_color", color)
		"grain": shader_material.set_shader_parameter(&"grain_speed", parameter_a)
		"scanlines": shader_material.set_shader_parameter(&"scanlines_density", parameter_a)
		"neon":
			shader_material.set_shader_parameter(&"neon_radius", parameter_a)
			shader_material.set_shader_parameter(&"neon_threshold", parameter_b)
			shader_material.set_shader_parameter(&"neon_color", color)
		"stagedim":
			shader_material.set_shader_parameter(&"stagedim_contrast", parameter_a)
			shader_material.set_shader_parameter(&"stagedim_color", color)
		"motionblur": shader_material.set_shader_parameter(&"motionblur_angle", parameter_a)


func _normalize_effect(effect_name: String) -> String:
	var normalized := effect_name.strip_edges().to_lower().replace("_", "").replace(" ", "")
	var aliases := {
		"warp": "warp", "perspective": "warp", "distort": "warp",
		"fisheye": "fisheye", "wave": "wave", "heat": "heat",
		"glitch": "glitch", "datamosh": "glitch", "pixelate": "pixelate",
		"chromatic": "chromatic", "vhs": "vhs", "terminalvhs": "vhs",
		"blur": "blur", "bloom": "bloom", "bloomsigma": "bloom",
		"grayscale": "grayscale", "colorgrade": "colorgrade",
		"colorcorrection": "colorgrade", "vignette": "vignette",
		"grain": "grain", "scanlines": "scanlines", "neonglow": "neon",
		"stagedim": "stagedim", "lightsout": "stagedim",
		"motionblur": "motionblur"
	}
	return str(aliases.get(normalized, ""))


func _update_viewport_size() -> void:
	if shader_material and get_viewport():
		shader_material.set_shader_parameter(&"viewport_size", Vector2(get_viewport().get_visible_rect().size))
