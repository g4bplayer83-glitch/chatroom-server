extends BasicSong
class_name AmongFunkGameplay

signal cutscene_completed

const CNE_POST_PROCESS := preload("res://among_funk/scripts/cne_post_process.gd")
const AMONG_SHADER_FX := preload("res://among_funk/scripts/among_shader_fx.gd")

@onready var among_stage: CNEStage = %Stage
@onready var among_player: CNECharacter = %Player
@onready var among_enemy: CNECharacter = %Enemy
@onready var among_metronome: CNECharacter = %Metronome
@onready var among_ui: AmongFunkUI = %AmongUI
@onready var game_camera: Camera2D = %GameCamera
@onready var camera_controller: CameraController = %CameraController
@onready var player_camera_marker: Marker2D = %PlayerCamera
@onready var enemy_camera_marker: Marker2D = %EnemyCamera
@onready var gf_camera_marker: Marker2D = %GFCamera

var source_chart: Dictionary = {}
var current_info: Dictionary = {}
var current_stage_id := "Polus"
var character_ids := {"dad": "RedCrew", "boyfriend": "bf", "girlfriend": "gf"}
var initial_visibility := {"dad": true, "boyfriend": true, "girlfriend": true}
var virtual_characters: Dictionary = {}
var opponent_shake_enabled := false
var opponent_shake_intensity := 0.0
var cutscene_active := false
var cutscene_layer: CanvasLayer
var cutscene_player: VideoStreamPlayer
var last_note_time := {"player": -999.0, "enemy": -999.0}
var last_note_lane := {"player": -1, "enemy": -1}
var game_fx
var hud_fx
var among_shader_fx
var character_home_positions: Dictionary = {}
var character_blackout: ColorRect
var pro_zoom_enabled := false
var pro_zoom_target := "both"
var pro_zoom_every := 1
var pro_zoom_game_add := 0.035
var pro_zoom_hud_add := 0.02
var pro_zoom_return := 0.12
var pro_zoom_alternate := false
var pro_zoom_sign := 1.0
var pro_zoom_game_offset := 0.0
var pro_zoom_hud_offset := 0.0
var pro_zoom_last_game_applied := 0.0
var pro_zoom_last_hud_applied := 0.0
var cam_bounce_enabled := false
var cam_bounce_amount := 10.0
var cam_bounce_angle_enabled := false
var cam_bounce_angle := 1.0
var cam_bounce_hud_tween: Tween
var cam_bounce_angle_tween: Tween
var game_overlay_layer: CanvasLayer
var game_cover_overlay: ColorRect
var game_flash_overlay: ColorRect
var death_started := false


func _ready() -> void:
	_setup_post_process()
	_configure_from_selected_chart()
	Signals.play_new_event.connect(_on_among_funk_event)
	super()
	camera_positions = [player_camera_marker, enemy_camera_marker, gf_camera_marker]
	among_ui.target_zoom = Vector2.ONE
	among_ui.offset = Vector2(640, 360)
	among_ui.set_middle_scroll(false)
	_set_botplay(bool(SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "botplay")), false)


func _setup_post_process() -> void:
	among_shader_fx = AMONG_SHADER_FX.new()
	among_shader_fx.name = "Among Shader FX"
	add_child(among_shader_fx)
	game_fx = CNE_POST_PROCESS.new()
	game_fx.name = "Codename Game FX"
	game_fx.layer = 0
	add_child(game_fx)
	hud_fx = CNE_POST_PROCESS.new()
	hud_fx.name = "Codename HUD FX"
	hud_fx.layer = 2
	add_child(hud_fx)
	var shaders_enabled := bool(SettingsManager.get_value(SettingsManager.SEC_PREFERENCES, "gameplay_shaders", true))
	game_fx.visible = shaders_enabled
	hud_fx.visible = shaders_enabled
	game_overlay_layer = CanvasLayer.new()
	game_overlay_layer.name = "Codename Game Overlays"
	game_overlay_layer.layer = 0
	add_child(game_overlay_layer)
	game_cover_overlay = _create_game_overlay("Game Cover", 10)
	game_flash_overlay = _create_game_overlay("Game Flash", 20)


func apply_quick_option(action: String, enabled: bool) -> void:
	match action:
		"downscroll":
			among_ui.apply_downscroll(enabled)
		"gameplay_shaders":
			if is_instance_valid(game_fx):
				game_fx.visible = enabled
			if is_instance_valid(hud_fx):
				hud_fx.visible = enabled
		"camera_beat_zoom":
			if not enabled and is_instance_valid(camera_controller):
				camera_controller.target_zoom = Vector2.ONE * among_stage.stage_zoom


func _create_game_overlay(overlay_name: String, z_order: int) -> ColorRect:
	var overlay := ColorRect.new()
	overlay.name = overlay_name
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.z_index = z_order
	overlay.modulate.a = 0.0
	game_overlay_layer.add_child(overlay)
	return overlay


func _process(delta: float) -> void:
	if cutscene_active:
		if Input.is_action_just_pressed(&"menu_accept") or Input.is_action_just_pressed(&"menu_cancel"):
			_finish_cutscene()
		return
	if not among_ui.game_over_active:
		_update_pro_zoom(delta)
		_update_stage_mechanics(delta)
		super(delta)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.is_pressed() and not event.is_echo() and event.physical_keycode == KEY_P:
		var enabled := not bool(SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "botplay"))
		_set_botplay(enabled, true)


func _set_botplay(enabled: bool, play_sound: bool) -> void:
	SettingsManager.set_value(SettingsManager.SEC_GAMEPLAY, "botplay", enabled)
	among_ui.player_strum.set_auto_play(enabled)
	among_ui.player_strum.set_press(not enabled)
	among_ui.set_botplay(enabled)
	if play_sound:
		SettingsManager.flush()
		SoundManager.scroll.play()


func _configure_from_selected_chart() -> void:
	var song := GameManager.get_current_song()
	assert(song, "Among Funk gameplay requires a selected Song resource.")
	current_info = AmongFunkManager.get_song_info(song.id)
	var difficulty_data: Dictionary = song.difficulties.get(GameManager.difficulty, {})
	if difficulty_data.is_empty() and not song.difficulties.is_empty():
		GameManager.difficulty = str(song.difficulties.keys()[0])
		difficulty_data = song.difficulties[GameManager.difficulty]
	var chart_path := str(difficulty_data.get("chart", ""))
	source_chart = _read_json(chart_path)
	current_stage_id = str(source_chart.get("stage", current_info.get("stage", "Polus")))
	_extract_character_data()
	among_stage.load_stage(current_stage_id)
	_configure_character(among_enemy, character_ids.dad, "dad")
	_configure_character(among_player, character_ids.boyfriend, "boyfriend")
	_configure_character(among_metronome, character_ids.girlfriend, "girlfriend")
	among_enemy.visible = bool(initial_visibility.dad)
	among_player.visible = bool(initial_visibility.boyfriend)
	among_metronome.visible = bool(initial_visibility.girlfriend) and not str(character_ids.girlfriend).is_empty()
	_apply_character_layout()
	_update_camera_layout()
	among_ui.refresh_icons(among_player, among_enemy)


func _read_json(path: String) -> Dictionary:
	var imported: Resource = ResourceLoader.load(path)
	if imported is JSON:
		var imported_data: Variant = (imported as JSON).data
		if imported_data is Dictionary:
			return imported_data
	var file := FileAccess.open(path, FileAccess.READ)
	if not file:
		push_error("(Among Funk) Could not read chart source: %s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return parsed if parsed is Dictionary else {}


func _extract_character_data() -> void:
	var info_characters: Dictionary = current_info.get("characters", {})
	character_ids.dad = str(info_characters.get("dad", "RedCrew"))
	character_ids.boyfriend = str(info_characters.get("boyfriend", "bf"))
	character_ids.girlfriend = str(info_characters.get("girlfriend", "")) if info_characters.get("girlfriend") != null else ""
	for raw_line in source_chart.get("strumLines", []):
		if raw_line is not Dictionary:
			continue
		var line: Dictionary = raw_line
		var role := str(line.get("position", "")).to_lower()
		if role == "opponent":
			role = "dad"
		elif role == "player":
			role = "boyfriend"
		if role not in ["dad", "boyfriend", "girlfriend"]:
			continue
		var characters: Array = line.get("characters", [])
		if not characters.is_empty() and characters[0] != null:
			character_ids[role] = str(characters[0])
		# A strumLine's visible flag controls its receptors, not its character.
		# The old port hid gf-ghost because her receptor line is hidden in charts.
		initial_visibility[role] = not str(character_ids[role]).is_empty()


func _configure_character(character: CNECharacter, character_id: String, role: String) -> void:
	if character_id.is_empty():
		character.visible = false
		return
	character.configure(character_id, role, among_stage.is_character_flipped(role))


func _apply_character_layout() -> void:
	_place_character(among_enemy, "dad")
	_place_character(among_player, "boyfriend")
	_place_character(among_metronome, "girlfriend")
	character_home_positions = {
		among_enemy.character_id.to_lower(): among_enemy.position,
		among_player.character_id.to_lower(): among_player.position,
		among_metronome.character_id.to_lower(): among_metronome.position
	}


func _place_character(character: CNECharacter, role: String) -> void:
	character.apply_stage_layout(among_stage.get_character_data(role))


func _update_camera_layout() -> void:
	var stage_zoom := clampf(among_stage.stage_zoom, 0.25, 2.0)
	game_camera.zoom = Vector2.ONE * stage_zoom
	camera_controller.target_zoom = game_camera.zoom
	player_camera_marker.position = among_player.get_camera_position()
	enemy_camera_marker.position = among_enemy.get_camera_position()
	gf_camera_marker.position = among_metronome.get_camera_position()
	game_camera.position = enemy_camera_marker.position
	camera_controller.position_smoothing_speed = 7.0


func before_song_start() -> void:
	var video_path := str(current_info.get("video", ""))
	var song := GameManager.get_current_song()
	if video_path.is_empty() or not song or AmongFunkManager.has_seen_cutscene(song.id):
		return
	if not ResourceLoader.exists(video_path):
		return
	var stream: Resource = ResourceLoader.load(video_path)
	if not stream or stream is not VideoStream:
		push_warning("(Among Funk) FFmpeg video loader unavailable; skipping %s" % video_path)
		return
	AmongFunkManager.mark_cutscene_seen(song.id)
	_start_cutscene(stream as VideoStream)
	await cutscene_completed


func _start_cutscene(stream: VideoStream) -> void:
	cutscene_active = true
	cutscene_layer = CanvasLayer.new()
	cutscene_layer.name = "Intro Cutscene"
	cutscene_layer.layer = 500
	add_child(cutscene_layer)
	var background := ColorRect.new()
	background.color = Color.BLACK
	cutscene_layer.add_child(background)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cutscene_player = VideoStreamPlayer.new()
	cutscene_player.expand = true
	cutscene_player.stream = stream
	cutscene_player.bus = &"Music"
	cutscene_layer.add_child(cutscene_player)
	cutscene_player.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	cutscene_player.finished.connect(_finish_cutscene)
	var skip := Label.new()
	skip.text = "ENTER / ESC  SKIP"
	skip.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	skip.add_theme_font_size_override(&"font_size", 18)
	skip.add_theme_color_override(&"font_color", Color(0.8, 0.95, 1, 0.8))
	skip.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	skip.offset_left = 20.0
	skip.offset_top = -44.0
	skip.offset_right = -24.0
	skip.offset_bottom = -12.0
	cutscene_layer.add_child(skip)
	cutscene_player.play()


func _finish_cutscene() -> void:
	if not cutscene_active:
		return
	cutscene_active = false
	if is_instance_valid(cutscene_player):
		cutscene_player.stop()
	if is_instance_valid(cutscene_layer):
		cutscene_layer.queue_free()
	cutscene_completed.emit()


func note_hit(note: BasicNote, lane: int, hit_time: float, strum_manager: StrumManager) -> void:
	var routed := note.note_type in ["bf_note", "character_note", "hey"]
	var previous_no_animation := note.no_animation
	if routed:
		note.no_animation = true
	super(note, lane, hit_time, strum_manager)
	note.no_animation = previous_no_animation
	var direction := get_direction(lane % 4)
	if note.note_type == "bf_note":
		among_metronome.play_animation(direction, Character.AnimContext.SING, true)
		among_metronome.set_sing_timer()
	elif note.note_type == "character_note":
		among_player.play_animation(direction, Character.AnimContext.SING, true)
		among_player.set_sing_timer()
	elif note.note_type == "hey":
		var target := among_enemy if strum_manager.enemy_slot else among_player
		target.play_animation(&"hey", Character.AnimContext.SPECIAL, true)
	elif note.note_type == "hurt":
		if among_ui.register_hurt():
			playstate.health = 0.0
		camera_controller.shake(2.0 + float(among_ui.hurt_hits) * 0.35, 0.1)
		among_ui.flash_screen([true, Color.RED, 1.0])
		among_player.modulate = Color(1.0, 0.25, 0.25)
		create_tween().tween_property(among_player, "modulate", Color.WHITE, 0.8).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
	elif note.note_type == "instakill":
		among_ui.show_hurt(Color(1.0, 0.03, 0.08))
	elif note.note_type == "heal":
		among_ui.show_hurt(Color(0.08, 1.0, 0.35))

	var side := "enemy" if strum_manager.enemy_slot else "player"
	if absf(note.time - float(last_note_time[side])) <= 0.002 and lane != int(last_note_lane[side]):
		_spawn_note_trail(among_enemy if strum_manager.enemy_slot else among_player, direction)
	last_note_time[side] = note.time
	last_note_lane[side] = lane

	if strum_manager.enemy_slot:
		if opponent_shake_enabled:
			camera_controller.shake(maxf(0.5, opponent_shake_intensity), 0.08)


func note_miss(note: Note, lane: int, strum_manager: StrumManager) -> void:
	super(note, lane, strum_manager)


func _update_stage_mechanics(_delta: float) -> void:
	# Reserved for stage-specific mechanics added through the Stage Editor.
	pass


func _spawn_note_trail(character: CNECharacter, direction: StringName) -> void:
	if not character.visible or character.uses_animate or not character.sprite or not character.sprite.sprite_frames:
		return
	var trail := AnimatedSprite2D.new()
	trail.sprite_frames = character.sprite.sprite_frames
	trail.animation = character.sprite.animation
	trail.frame = character.sprite.frame
	trail.centered = character.sprite.centered
	trail.flip_h = character.sprite.flip_h
	trail.z_index = 40
	add_child(trail)
	trail.global_position = character.sprite.global_position
	trail.global_scale = character.sprite.global_scale
	trail.modulate = character.icon_color
	game_camera.zoom += Vector2.ONE * 0.015
	among_ui.scale += Vector2.ONE * 0.007
	# Avoid inferring from Dictionary.get(), which is a Variant and becomes a
	# parse error when Godot's "warnings as errors" option is enabled.
	var movement := Vector2.ZERO
	match direction:
		&"left": movement = Vector2(-100, 0)
		&"down": movement = Vector2(0, 100)
		&"up": movement = Vector2(0, -100)
		&"right": movement = Vector2(100, 0)
	var tween := create_tween().set_parallel(true)
	tween.tween_property(trail, "position", trail.position + movement, 0.85).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.tween_property(trail, "modulate:a", 0.0, 0.55)
	tween.chain().tween_callback(trail.queue_free)


func died() -> void:
	if death_started:
		return
	death_started = true
	playstate.stop_for_game_over()
	var song := GameManager.get_current_song()
	among_ui.show_game_over(song.title if song else "Among Funk")
	if AmongFunkManager.is_mobile() and has_node("MobileControls"):
		$MobileControls.visible = false
	get_tree().paused = true


func _on_among_funk_event(_time: float, event_name: String, parameters: Array) -> void:
	match event_name:
		"Camera Angle": _event_camera_angle(parameters)
		"Camera Position": _event_camera_position(parameters)
		"Camera Flash": _event_camera_flash(parameters)
		"Cinematic Bars": among_ui.set_bars(parameters)
		"Screen Coverer": _event_screen_cover(parameters)
		"BlackScreen": among_ui.set_black(parameters)
		"PA Lyrics": among_ui.show_subtitle(parameters)
		"Credits Popup": among_ui.show_credits(parameters)
		"ShowMedia": among_ui.show_media(parameters)
		"Visual_FX", "Visual FX": _event_visual_fx(parameters)
		"ShadersEdit": _event_shaders_edit(parameters)
		"CRT Effect": _event_crt(parameters)
		"Screen FX Pro": _event_screen_fx(parameters)
		"Among Shader FX": _event_among_shader_fx(parameters)
		"Change Character": _event_change_character(parameters)
		"Change Stage": _event_change_stage(parameters)
		"Middle Scroll":
			among_ui.set_middle_scroll(false, float(parameters[1]) if parameters.size() > 1 else 0.0)
		"Virtual Character": _event_virtual_character(parameters)
		"Additional Character Slide": _event_character_slide(parameters)
		"CharacterColorChange": _event_character_color(parameters)
		"OpponentWindowShake":
			opponent_shake_enabled = AmongFunkManager.bool_from_value(parameters[0]) if not parameters.is_empty() else false
			opponent_shake_intensity = float(parameters[1]) if parameters.size() > 1 else 5.0
		"Camera Beat Zoom Pro": _event_beat_zoom(parameters)
		"camBounce": _event_camera_bounce(parameters)
		"Camera snap":
			if not parameters.is_empty():
				camera_controller.position_smoothing = not AmongFunkManager.bool_from_value(parameters[0])
		_: pass


func _event_among_shader_fx(parameters: Array) -> void:
	if parameters.is_empty() or not is_instance_valid(among_shader_fx):
		return
	var effect := str(parameters[0])
	var enabled := AmongFunkManager.bool_from_value(parameters[1], true) if parameters.size() > 1 else true
	var effect_intensity := float(parameters[2]) if parameters.size() > 2 else 1.0
	var effect_speed := float(parameters[3]) if parameters.size() > 3 else 1.0
	var tint := AmongFunkManager.color_from_value(parameters[4] if parameters.size() > 4 else Color.WHITE)
	among_shader_fx.set_effect(effect, enabled, effect_intensity, effect_speed, tint)
	if effect.strip_edges().to_lower() == "scanlines":
		for stack in [game_fx, hud_fx]:
			stack.apply_effect("Scanlines", enabled, effect_intensity, tint, effect_speed, 0.0, 0.18, "cubeOut")


func _event_camera_flash(parameters: Array) -> void:
	var target := str(parameters[3]).to_lower() if parameters.size() > 3 else "camhud"
	if target not in ["camgame", "game"]:
		among_ui.flash_screen(parameters)
		return
	var color := AmongFunkManager.color_from_value(parameters[1] if parameters.size() > 1 else Color.WHITE)
	color.a = 1.0
	game_flash_overlay.color = color
	var duration := _steps_to_seconds(float(parameters[2]) if parameters.size() > 2 else 4.0)
	var reversed := AmongFunkManager.bool_from_value(parameters[0]) if not parameters.is_empty() else false
	var tween := create_tween()
	if reversed:
		game_flash_overlay.modulate.a = 0.0
		tween.tween_property(game_flash_overlay, "modulate:a", 1.0, maxf(duration, 0.04))
		tween.tween_callback(func() -> void: game_flash_overlay.modulate.a = 0.0)
	else:
		game_flash_overlay.modulate.a = 1.0
		tween.tween_property(game_flash_overlay, "modulate:a", 0.0, maxf(duration, 0.04))


func _event_screen_cover(parameters: Array) -> void:
	var target_camera := str(parameters[6]).to_lower() if parameters.size() > 6 else "camhud"
	if target_camera not in ["camgame", "game"]:
		among_ui.set_cover(parameters)
		return
	game_cover_overlay.color = AmongFunkManager.color_from_value(parameters[1] if parameters.size() > 1 else Color.BLACK)
	game_cover_overlay.color.a = 1.0
	var target_alpha := clampf(float(parameters[2]) if parameters.size() > 2 else 1.0, 0.0, 1.0)
	var should_tween := AmongFunkManager.bool_from_value(parameters[0], true) if not parameters.is_empty() else true
	var duration := _steps_to_seconds(float(parameters[3]) if parameters.size() > 3 else 4.0)
	if not should_tween or duration <= 0.0:
		game_cover_overlay.modulate.a = target_alpha
		return
	var ease_base := str(parameters[4]) if parameters.size() > 4 else "linear"
	var ease_direction := str(parameters[5]) if parameters.size() > 5 else "In"
	var ease_info: Array = Global.string_to_ease(ease_base + ("" if ease_base == "linear" else ease_direction))
	create_tween().set_trans(ease_info[0]).set_ease(ease_info[1]).tween_property(game_cover_overlay, "modulate:a", target_alpha, duration)


func _event_visual_fx(parameters: Array) -> void:
	if parameters.is_empty():
		return
	var effect := str(parameters[0])
	var enabled := AmongFunkManager.bool_from_value(parameters[1], true) if parameters.size() > 1 else true
	var modern := parameters.size() > 7 and _is_fx_camera(str(parameters[7]))
	var preset := str(parameters[2]) if modern and parameters.size() > 2 else "Custom"
	var intensity := float(parameters[3]) if modern and parameters.size() > 3 else (float(parameters[2]) if parameters.size() > 2 else 1.0)
	var color_value: Variant = parameters[4] if modern and parameters.size() > 4 else (parameters[3] if parameters.size() > 3 else Color.WHITE)
	var parameter_a := float(parameters[5]) if modern and parameters.size() > 5 else (float(parameters[4]) if parameters.size() > 4 else 0.0)
	var parameter_b := float(parameters[6]) if modern and parameters.size() > 6 else (float(parameters[5]) if parameters.size() > 5 else 0.0)
	var target := str(parameters[7]) if modern else (str(parameters[6]) if parameters.size() > 6 else "camGame")
	var transition := float(parameters[8]) if modern and parameters.size() > 8 else (float(parameters[7]) if parameters.size() > 7 else 0.25)
	var ease_name := str(parameters[9]) if modern and parameters.size() > 9 else (str(parameters[8]) if parameters.size() > 8 else "cubeOut")
	var end_mode := str(parameters[10]) if modern and parameters.size() > 10 else "Rester"
	var hold_seconds := float(parameters[11]) if modern and parameters.size() > 11 else 0.0
	var settings := _visual_preset(effect, preset, intensity, color_value, parameter_a, parameter_b)
	if not (end_mode.contains("Partir") or end_mode.contains("Burst")):
		hold_seconds = 0.0
	var settings_color: Color = settings["color"]
	for stack in _fx_targets(target):
		stack.apply_effect(
			effect, enabled, float(settings.intensity), settings_color,
			float(settings.parameter_a), float(settings.parameter_b),
			maxf(transition, 0.0), ease_name, maxf(hold_seconds, 0.0)
		)


func _event_shaders_edit(parameters: Array) -> void:
	if parameters.is_empty():
		return
	var effect := str(parameters[0])
	var enabled := AmongFunkManager.bool_from_value(parameters[1], true) if parameters.size() > 1 else true
	var intensity := float(parameters[2]) if parameters.size() > 2 else 1.0
	var color := AmongFunkManager.color_from_value(parameters[3] if parameters.size() > 3 else Color.WHITE)
	var parameter_a := float(parameters[4]) if parameters.size() > 4 else 0.0
	var parameter_b := float(parameters[5]) if parameters.size() > 5 else 0.0
	var target := str(parameters[6]) if parameters.size() > 6 else "camGame"
	var transition := float(parameters[7]) if parameters.size() > 7 else 0.25
	var ease_name := str(parameters[8]) if parameters.size() > 8 else "cubeOut"
	var hold := float(parameters[9]) if parameters.size() > 9 else 0.0
	for stack in _fx_targets(target):
		stack.apply_effect(effect, enabled, intensity, color, parameter_a, parameter_b, transition, ease_name, hold)


func _event_crt(parameters: Array) -> void:
	var distortion := float(parameters[0]) if parameters.size() > 0 else 0.0
	var chromatic := float(parameters[1]) if parameters.size() > 1 else 0.0
	var zoom := float(parameters[2]) if parameters.size() > 2 else 1.0
	var smoothing := float(parameters[3]) if parameters.size() > 3 else 5.0
	game_fx.set_crt(distortion, chromatic, zoom, smoothing)
	hud_fx.set_crt(distortion, chromatic, zoom, smoothing)


func _event_screen_fx(parameters: Array) -> void:
	if parameters.is_empty():
		return
	var mode := str(parameters[0]).to_lower()
	var enabled := AmongFunkManager.bool_from_value(parameters[1]) if parameters.size() > 1 else true
	var target := str(parameters[2]) if parameters.size() > 2 else "game"
	var transition := float(parameters[16]) if parameters.size() > 16 else 0.0
	var ease_name := str(parameters[17]) if parameters.size() > 17 else "cubeOut"
	for stack in _fx_targets(target):
		if mode in ["bloom", "all"]:
			var bloom_strength := float(parameters[18]) if parameters.size() > 18 else 0.45
			var bloom_radius := float(parameters[19]) if parameters.size() > 19 else 5.0
			stack.apply_effect("Bloom", enabled, bloom_strength, Color.WHITE, bloom_radius, 0.0, transition, ease_name)
		if mode in ["blur", "all"]:
			var blur_strength := float(parameters[20]) if parameters.size() > 20 else 0.35
			var blur_radius := float(parameters[21]) if parameters.size() > 21 else 4.0
			stack.apply_effect("Blur", enabled, blur_strength, Color.WHITE, blur_radius, 0.0, transition, ease_name)
		if mode in ["motionblur", "all"]:
			var motion_strength := float(parameters[14]) if parameters.size() > 14 else 0.0
			var motion_angle := float(parameters[15]) if parameters.size() > 15 else 0.0
			stack.apply_effect("MotionBlur", enabled, motion_strength, Color.WHITE, motion_angle, 0.0, transition, ease_name)


func _visual_preset(
	effect: String, preset: String, intensity: float, color_value: Variant,
	parameter_a: float, parameter_b: float
) -> Dictionary:
	var settings := {
		"intensity": intensity,
		"color": AmongFunkManager.color_from_value(color_value),
		"parameter_a": parameter_a,
		"parameter_b": parameter_b
	}
	match preset:
		"Soft": settings.merge({"intensity": 0.35, "parameter_a": 3.0, "parameter_b": 24.0}, true)
		"Normal": settings.merge({"intensity": 0.65, "parameter_a": 6.0, "parameter_b": 48.0}, true)
		"Strong": settings.merge({"intensity": 1.0, "parameter_a": 10.0, "parameter_b": 80.0}, true)
		"Beat Flash": settings.merge({"intensity": 1.25, "parameter_a": 5.0, "parameter_b": 40.0}, true)
		"Dream": settings.merge({"intensity": 0.55, "parameter_a": 9.0, "parameter_b": 0.35, "color": Color.from_string("#A7D8FF", Color.WHITE)}, true)
		"Night": settings.merge({"intensity": 0.55, "parameter_a": -0.35, "parameter_b": 0.35, "color": Color.from_string("#7C8CFF", Color.WHITE)}, true)
		"Danger": settings.merge({"intensity": 0.9, "parameter_a": 0.25, "parameter_b": 0.45, "color": Color.from_string("#FF2B2B", Color.WHITE)}, true)
		"Static": settings.merge({"intensity": 0.9, "parameter_a": 16.0, "parameter_b": 90.0}, true)
		"Broken TV": settings.merge({"intensity": 1.15, "parameter_a": 22.0, "parameter_b": 120.0, "color": Color.from_string("#D7F6FF", Color.WHITE)}, true)
		"Old VHS": settings.merge({"intensity": 0.75, "parameter_a": 0.006, "parameter_b": 0.12}, true)
		_: pass
	var normalized := effect.to_lower()
	if normalized in ["bloom", "blur"] and preset != "Custom":
		settings.parameter_a = maxf(float(settings.parameter_a), 4.0)
	if normalized == "blur" and preset != "Custom":
		settings.intensity = float(settings.intensity) * 0.55
	elif normalized == "motionblur" and preset != "Custom":
		settings.parameter_a = maxf(float(settings.parameter_a), 45.0)
	elif normalized == "pixelate" and preset != "Custom":
		settings.intensity = minf(float(settings.intensity), 0.9)
	elif normalized == "grain" and preset != "Custom":
		settings.parameter_a = maxf(float(settings.parameter_a), 10.0)
	elif normalized == "glitch" and preset != "Custom":
		settings.parameter_a = maxf(float(settings.parameter_a), 16.0)
		settings.parameter_b = maxf(float(settings.parameter_b), 64.0)
	elif normalized == "datamosh" and preset != "Custom":
		settings.parameter_a = maxf(float(settings.parameter_a), 8.0)
		settings.parameter_b = maxf(float(settings.parameter_b), 40.0)
	elif normalized == "heat" and preset != "Custom":
		settings.intensity = float(settings.intensity) * 0.65
		settings.parameter_a = maxf(float(settings.parameter_a), 1.25)
		settings.parameter_b = maxf(float(settings.parameter_b), 8.0)
	elif normalized == "neonglow" and preset != "Custom":
		settings.parameter_a = maxf(float(settings.parameter_a), 5.0)
		settings.parameter_b = 0.35
	elif normalized == "vhs" and preset != "Custom":
		settings.parameter_a = 0.006
		settings.parameter_b = maxf(float(settings.parameter_b) / 1000.0, 0.08)
	elif normalized == "scanlines" and preset != "Custom":
		settings.parameter_a = maxf(float(settings.parameter_b), 120.0)
	elif normalized == "stagedim" and preset != "Custom":
		settings.intensity = minf(float(settings.intensity), 0.85)
		settings.parameter_a = maxf(float(settings.parameter_a) / 20.0, 0.0)
		var stage_dim_color: Color = settings["color"]
		if stage_dim_color.is_equal_approx(Color.WHITE):
			settings.color = Color.from_string("#B7C4FF", Color.WHITE)
	return settings


func _is_fx_camera(value: String) -> bool:
	return value.strip_edges().to_lower() in ["camgame", "camhud", "game", "hud", "both", "toutes"]


func _fx_targets(value: String) -> Array:
	var normalized := value.strip_edges().to_lower()
	if normalized in ["camhud", "hud"]:
		return [hud_fx]
	if normalized in ["both", "toutes"]:
		return [game_fx, hud_fx]
	return [game_fx]


func _event_camera_angle(parameters: Array) -> void:
	if parameters.is_empty():
		return
	var angle := deg_to_rad(float(parameters[0]))
	var target := str(parameters[1]).to_lower() if parameters.size() > 1 else "toutes"
	var duration := maxf(float(parameters[2]) if parameters.size() > 2 else 0.0, 0.0)
	var ease_name := str(parameters[3]) if parameters.size() > 3 else "cubeOut"
	var ease_info: Array = Global.string_to_ease(ease_name)
	if target in ["toutes", "both", "game", "camgame"]:
		if duration <= 0.0:
			game_camera.rotation = angle
		else:
			create_tween().set_trans(ease_info[0]).set_ease(ease_info[1]).tween_property(game_camera, "rotation", angle, duration)
	if target in ["toutes", "both", "hud", "camhud"]:
		among_ui.set_camera_angle(angle, duration, ease_name)


func _event_camera_position(parameters: Array) -> void:
	if parameters.size() < 2:
		return
	var target := Vector2(float(parameters[0]), float(parameters[1]))
	if parameters.size() > 6 and AmongFunkManager.bool_from_value(parameters[6]):
		target += game_camera.position
	var should_tween := AmongFunkManager.bool_from_value(parameters[2], true) if parameters.size() > 2 else true
	var duration := _steps_to_seconds(AmongFunkManager.number_from_value(parameters[3], 4.0) if parameters.size() > 3 else 4.0)
	var ease_base := str(parameters[4]) if parameters.size() > 4 and parameters[4] != null else "CLASSIC"
	var ease_direction := str(parameters[5]) if parameters.size() > 5 and parameters[5] != null else "In"
	if not should_tween:
		var old_smoothing := camera_controller.position_smoothing
		camera_controller.position_smoothing = false
		camera_controller.position = target
		camera_controller.position_smoothing = old_smoothing
	elif ease_base.to_upper() == "CLASSIC" or duration <= 0.0:
		camera_controller.position = target
	else:
		var ease_info: Array = Global.string_to_ease(ease_base + ease_direction)
		var old_smoothing := camera_controller.position_smoothing
		camera_controller.position_smoothing = false
		var tween := create_tween().set_trans(ease_info[0]).set_ease(ease_info[1])
		tween.tween_property(game_camera, "position", target, duration)
		tween.finished.connect(func() -> void: camera_controller.position_smoothing = old_smoothing)


func _event_change_character(parameters: Array) -> void:
	if parameters.size() < 2:
		return
	var role_index := clampi(int(parameters[0]), 0, 2)
	var roles := ["dad", "boyfriend", "girlfriend"]
	var characters: Array[CNECharacter] = [among_enemy, among_player, among_metronome]
	var role: String = roles[role_index]
	character_ids[role] = str(parameters[1])
	characters[role_index].configure(
		str(parameters[1]), role, among_stage.is_character_flipped(role)
	)
	characters[role_index].visible = true
	_place_character(characters[role_index], role)
	_update_camera_layout()
	among_ui.refresh_icons(among_player, among_enemy)


func _event_change_stage(parameters: Array) -> void:
	if parameters.is_empty():
		return
	current_stage_id = str(parameters[0])
	among_stage.load_stage(current_stage_id)
	# Stage markers define the player/opponent flip. Reconfigure animations too,
	# because Codename swaps LEFT/RIGHT frames when that flag changes.
	_configure_character(among_enemy, character_ids.dad, "dad")
	_configure_character(among_player, character_ids.boyfriend, "boyfriend")
	_configure_character(among_metronome, character_ids.girlfriend, "girlfriend")
	_apply_character_layout()
	_update_camera_layout()


func _event_virtual_character(parameters: Array) -> void:
	if parameters.is_empty():
		return
	var character_id := str(parameters[0])
	var role := str(parameters[1]).to_lower() if parameters.size() > 1 else "none"
	var character := _get_or_create_virtual(character_id, role)
	if parameters.size() > 3:
		character.position = Vector2(float(parameters[2]), float(parameters[3]))
	if parameters.size() > 4:
		character.scale = Vector2.ONE * float(parameters[4])
	if parameters.size() > 5:
		character.visible = AmongFunkManager.bool_from_value(parameters[5], true)
	else:
		character.visible = true
	_set_virtual_target(character, role)


func _event_character_slide(parameters: Array) -> void:
	if parameters.size() < 3:
		return
	var character_id := str(parameters[0])
	var character := _find_character(character_id)
	if not character:
		character = _get_or_create_virtual(character_id, "boyfriend")
	character.visible = true
	var key := character_id.to_lower()
	if not character_home_positions.has(key):
		character_home_positions[key] = character.position
	var destination: Vector2 = character_home_positions[key]
	var destination_mode := str(parameters[5]).to_lower() if parameters.size() > 5 else "original position"
	if destination_mode == "right of player":
		destination = among_player.position + Vector2(450.0, 0.0)
	elif destination_mode == "left of player":
		destination = among_player.position - Vector2(450.0, 0.0)
	var take_notes := AmongFunkManager.bool_from_value(parameters[4]) if parameters.size() > 4 else false
	if take_notes:
		character.add_to_group(&"player")
	elif character != among_player and character.is_in_group(&"player"):
		character.remove_from_group(&"player")
	character.position = destination + Vector2(float(parameters[2]), 0.0)
	var duration := maxf(float(parameters[1]), 0.0)
	var ease_name := str(parameters[3]) if parameters.size() > 3 else "circInOut"
	var ease_info: Array = Global.string_to_ease(ease_name)
	create_tween().set_trans(ease_info[0]).set_ease(ease_info[1]).tween_property(character, "position", destination, maxf(0.01, duration))


func _get_or_create_virtual(character_id: String, role: String) -> CNECharacter:
	var key := character_id.to_lower()
	if virtual_characters.has(key) and is_instance_valid(virtual_characters[key]):
		return virtual_characters[key]
	var character := CNECharacter.new()
	character.name = ("Virtual " + character_id).validate_node_name()
	var sprite := AnimatedSprite2D.new()
	sprite.name = "AnimatedSprite2D"
	character.add_child(sprite)
	add_child(character)
	var stage_role := _virtual_stage_role(role)
	character.configure(character_id, stage_role, among_stage.is_character_flipped(stage_role))
	character.z_index = among_stage.get_character_z_index(stage_role) + 1
	_set_virtual_target(character, role)
	virtual_characters[key] = character
	return character


func _set_virtual_target(character: CNECharacter, target: String) -> void:
	for group in [&"enemy", &"player", &"metronome"]:
		if character.is_in_group(group):
			character.remove_from_group(group)
	match target.strip_edges().to_lower():
		"dad", "opponent": character.add_to_group(&"enemy")
		"bf", "boyfriend", "player": character.add_to_group(&"player")
		"gf", "girlfriend": character.add_to_group(&"metronome")
		_: pass


func _virtual_stage_role(target: String) -> String:
	match target.strip_edges().to_lower():
		"bf", "boyfriend", "player": return "boyfriend"
		"gf", "girlfriend": return "girlfriend"
		_: return "dad"


func _find_character(character_id: String) -> CNECharacter:
	for character in [among_enemy, among_player, among_metronome]:
		if character.character_id.nocasecmp_to(character_id) == 0:
			return character
	var value: Variant = virtual_characters.get(character_id.to_lower())
	return value if value is CNECharacter else null


func _event_character_color(parameters: Array) -> void:
	if parameters.size() < 3:
		return
	var turn_off := AmongFunkManager.bool_from_value(parameters[0])
	var automatic_color := AmongFunkManager.bool_from_value(parameters[1])
	var chosen_color := AmongFunkManager.color_from_value(parameters[2], Color.WHITE)
	var should_tween := AmongFunkManager.bool_from_value(parameters[3]) if parameters.size() > 3 else false
	var duration := maxf(float(parameters[4]) if parameters.size() > 4 else 1.0, 0.0)
	var ease_base := str(parameters[5]) if parameters.size() > 5 else "linear"
	var ease_direction := str(parameters[6]) if parameters.size() > 6 else ""
	var ease_info: Array = Global.string_to_ease(ease_base + ("" if ease_base == "linear" else ease_direction))
	var amount := 0.0 if turn_off else 1.0
	for character in [among_enemy, among_player, among_metronome]:
		if not character:
			continue
		var target_color: Color = character.icon_color if automatic_color else chosen_color
		if not should_tween or duration <= 0.0:
			character.set_silhouette(target_color, amount)
		else:
			var start_amount: float = character.silhouette_strength
			var color_for_tween := target_color
			var character_for_tween: CNECharacter = character
			create_tween().set_trans(ease_info[0]).set_ease(ease_info[1]).tween_method(
				func(value: float) -> void: character_for_tween.set_silhouette(color_for_tween, value),
				start_amount, amount, duration
			)
	var hide_background := AmongFunkManager.bool_from_value(parameters[7], true) if parameters.size() > 7 else true
	var background_color := AmongFunkManager.color_from_value(parameters[8] if parameters.size() > 8 else Color.BLACK, Color.BLACK)
	_set_character_blackout(background_color, amount if hide_background and not turn_off else 0.0, duration if should_tween else 0.0, ease_info)


func _event_beat_zoom(parameters: Array) -> void:
	pro_zoom_enabled = AmongFunkManager.bool_from_value(parameters[0], true) if not parameters.is_empty() else true
	pro_zoom_target = str(parameters[1]).strip_edges().to_lower() if parameters.size() > 1 else "both"
	pro_zoom_every = maxi(1, int(parameters[2]) if parameters.size() > 2 else 1)
	pro_zoom_game_add = float(parameters[3]) if parameters.size() > 3 else 0.035
	pro_zoom_hud_add = float(parameters[4]) if parameters.size() > 4 else 0.02
	pro_zoom_return = maxf(float(parameters[5]) if parameters.size() > 5 else 0.12, 0.01)
	pro_zoom_alternate = (
		AmongFunkManager.bool_from_value(parameters[6]) if parameters.size() > 6 else false
	) or (
		AmongFunkManager.bool_from_value(parameters[7]) if parameters.size() > 7 else false
	)
	if not pro_zoom_enabled:
		# The source event removes its accumulated offset instead of leaving the
		# camera permanently enlarged when the effect is switched off.
		pro_zoom_game_offset = 0.0
		pro_zoom_hud_offset = 0.0


func _event_camera_bounce(parameters: Array) -> void:
	cam_bounce_enabled = AmongFunkManager.bool_from_value(parameters[0], true) if not parameters.is_empty() else true
	cam_bounce_amount = float(parameters[1]) if parameters.size() > 1 else 10.0
	cam_bounce_angle_enabled = AmongFunkManager.bool_from_value(parameters[2], true) if parameters.size() > 2 else true
	cam_bounce_angle = float(parameters[3]) if parameters.size() > 3 else 1.0
	if not cam_bounce_enabled:
		if cam_bounce_hud_tween and cam_bounce_hud_tween.is_valid():
			cam_bounce_hud_tween.kill()
		cam_bounce_hud_tween = create_tween().set_trans(Tween.TRANS_CIRC).set_ease(Tween.EASE_OUT)
		cam_bounce_hud_tween.tween_property(among_ui, "offset:y", 360.0, 0.17)
	if not cam_bounce_angle_enabled and cam_bounce_angle_tween and cam_bounce_angle_tween.is_valid():
		cam_bounce_angle_tween.kill()


func _update_pro_zoom(delta: float) -> void:
	# Direct port of Camera Beat Zoom Pro.hx: retain an independent transient
	# offset and only add its per-frame delta, so Camera Zoom events remain the
	# authoritative base zoom while the beat pulse cleanly decays to zero.
	var decay := clampf(delta / maxf(pro_zoom_return, 0.01), 0.0, 1.0)
	pro_zoom_game_offset = lerpf(pro_zoom_game_offset, 0.0, decay)
	pro_zoom_hud_offset = lerpf(pro_zoom_hud_offset, 0.0, decay)
	var game_delta := pro_zoom_game_offset - pro_zoom_last_game_applied
	var hud_delta := pro_zoom_hud_offset - pro_zoom_last_hud_applied
	if absf(game_delta) > 0.00001:
		game_camera.zoom += Vector2.ONE * game_delta
	if absf(hud_delta) > 0.00001:
		among_ui.scale += Vector2.ONE * hud_delta
	pro_zoom_last_game_applied = pro_zoom_game_offset
	pro_zoom_last_hud_applied = pro_zoom_hud_offset


func _set_character_blackout(color: Color, target_alpha: float, duration: float, ease_info: Array) -> void:
	if not is_instance_valid(character_blackout):
		character_blackout = ColorRect.new()
		character_blackout.name = "Character Color Background"
		character_blackout.position = Vector2(-10000.0, -10000.0)
		character_blackout.size = Vector2(20000.0, 20000.0)
		character_blackout.mouse_filter = Control.MOUSE_FILTER_IGNORE
		character_blackout.z_index = mini(among_enemy.z_index, among_player.z_index) - 1
		add_child(character_blackout)
	character_blackout.color = color
	if duration <= 0.0:
		character_blackout.modulate.a = target_alpha
	else:
		create_tween().set_trans(ease_info[0]).set_ease(ease_info[1]).tween_property(character_blackout, "modulate:a", target_alpha, duration)


func _on_conductor_new_beat(current_beat: int, measure_relative: int) -> void:
	super(current_beat, measure_relative)
	if pro_zoom_enabled and current_beat % pro_zoom_every == 0:
		var multiplier := 1.0
		if pro_zoom_alternate:
			pro_zoom_sign *= -1.0
			multiplier = pro_zoom_sign
		if pro_zoom_target in ["camgame", "game", "both"]:
			pro_zoom_game_offset += pro_zoom_game_add * multiplier
		if pro_zoom_target in ["camhud", "hud", "both"]:
			pro_zoom_hud_offset += pro_zoom_hud_add * multiplier
	if cam_bounce_angle_enabled:
		if cam_bounce_angle_tween and cam_bounce_angle_tween.is_valid():
			cam_bounce_angle_tween.kill()
		var base_angle := game_camera.rotation
		var target_angle := deg_to_rad(-cam_bounce_angle if current_beat % 2 == 0 else cam_bounce_angle)
		# FlxTweenType.BACKWARD starts at the requested angle and eases back to
		# the previous angle. Reproduce that instead of leaving the camera tilted.
		game_camera.rotation = target_angle
		cam_bounce_angle_tween = create_tween().set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		cam_bounce_angle_tween.tween_property(game_camera, "rotation", base_angle, 0.3)


func _on_conductor_new_step(current_step: int, measure_relative: int) -> void:
	super(current_step, measure_relative)
	if not cam_bounce_enabled:
		return
	if current_step % 4 == 0:
		if cam_bounce_hud_tween and cam_bounce_hud_tween.is_valid():
			cam_bounce_hud_tween.kill()
		cam_bounce_hud_tween = create_tween().set_trans(Tween.TRANS_CIRC).set_ease(Tween.EASE_OUT)
		cam_bounce_hud_tween.tween_property(among_ui, "offset:y", 360.0, 0.17)
	elif current_step % 4 == 2:
		if cam_bounce_hud_tween and cam_bounce_hud_tween.is_valid():
			cam_bounce_hud_tween.kill()
		cam_bounce_hud_tween = create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		cam_bounce_hud_tween.tween_property(among_ui, "offset:y", 360.0 + cam_bounce_amount, 0.17)


func _steps_to_seconds(steps: float) -> float:
	return maxf(0.0, steps * GameManager.conductor.seconds_per_step)
