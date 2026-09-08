extends BasicUI
class_name AmongFunkUI

@onready var player_strum: StrumManager = $"Player Strum"
@onready var enemy_strum: StrumManager = $"Enemy Strum"
@onready var health_bar: ProgressBar = $"Health Bar"
@onready var core_hud: Control = $CoreHUD
@onready var score_label: Label = $CoreHUD/Score
@onready var song_label: Label = $CoreHUD/Song
@onready var time_label: Label = $CoreHUD/Time
@onready var botplay_label: Label = $CoreHUD/Botplay
@onready var subtitle_label: Label = $Subtitle
@onready var credits_panel: PanelContainer = $Credits
@onready var credits_label: Label = $Credits/Text
@onready var player_icon: TextureRect = $CoreHUD/PlayerIcon
@onready var enemy_icon: TextureRect = $CoreHUD/EnemyIcon
@onready var task_fill: ColorRect = $CoreHUD/Task/Fill
@onready var task_text: Label = $CoreHUD/Task/Text
@onready var task_panel: Control = $CoreHUD/Task
@onready var black_overlay: ColorRect = $BlackOverlay
@onready var cover_overlay: ColorRect = $CoverOverlay
@onready var flash_overlay: ColorRect = $FlashOverlay
@onready var top_bar: ColorRect = $TopBar
@onready var bottom_bar: ColorRect = $BottomBar
@onready var hurt_border: Panel = $HurtBorder
@onready var game_over: PanelContainer = $GameOver
@onready var game_over_text: Label = $GameOver/Content/Text
@onready var game_over_subtext: Label = $GameOver/Content/SubText
@onready var game_over_progress: ColorRect = $GameOver/Content/ProgressBack/Fill
@onready var game_over_hint: Label = $GameOver/Content/Hint
@onready var reconnect_button: Button = $GameOver/Content/ReconnectButton
@onready var song_select_button: Button = $GameOver/Content/SongSelectButton
@onready var game_over_music: AudioStreamPlayer = $GameOverMusic

var player_color := Color(0.58, 0.17, 0.83)
var enemy_color := Color(0.8, 0.08, 0.18)
var health_fill_style: StyleBoxFlat
var health_background_style: StyleBoxFlat
var current_health := 50.0
var middle_scroll := false
var game_over_active := false
var game_over_can_retry := false
var game_over_transitioning := false
var game_over_character: CNECharacter
var botplay_phase := 0.0
var hurt_hits := 0
var hurt_reset_token := 0
var credits_home_x := 0.0
var downscroll_enabled := false
var player_icon_source: Texture2D
var enemy_icon_source: Texture2D
var player_icon_losing := false
var enemy_icon_losing := false


func _ready() -> void:
	super()
	# SceneTree group iteration order is not guaranteed; Noah uses slot 0 for
	# the player and slot 1 for the opponent when routing chart lanes.
	strums = [player_strum, enemy_strum]
	player_strum.set_ignored_note_types(["hurt"])
	process_mode = Node.PROCESS_MODE_ALWAYS
	Signals.play_health_changed.connect(_on_health_changed)
	set_middle_scroll(false)
	_setup_styles()
	var current_song := GameManager.get_current_song()
	if current_song:
		song_label.text = "%s  •  %s" % [current_song.title, GameManager.difficulty]
	black_overlay.modulate.a = 0.0
	cover_overlay.modulate.a = 0.0
	flash_overlay.modulate.a = 0.0
	credits_panel.modulate.a = 0.0
	hurt_border.modulate.a = 0.0
	game_over.visible = false
	reconnect_button.visible = AmongFunkManager.is_mobile()
	song_select_button.visible = AmongFunkManager.is_mobile()
	reconnect_button.pressed.connect(_retry_game)
	song_select_button.pressed.connect(_return_to_song_select)
	credits_home_x = credits_panel.position.x


func _setup_styles() -> void:
	var background := StyleBoxFlat.new()
	# Codename's RIGHT_TO_LEFT health bar draws the opponent colour on the
	# filled (left) side and the player's colour on the remaining (right) side.
	background.bg_color = player_color
	background.border_color = Color("C0D1D4")
	background.set_border_width_all(2)
	background.set_corner_radius_all(1)
	health_bar.add_theme_stylebox_override(&"background", background)
	health_background_style = background

	var fill := StyleBoxFlat.new()
	fill.bg_color = enemy_color
	fill.set_corner_radius_all(1)
	health_bar.add_theme_stylebox_override(&"fill", fill)
	health_fill_style = fill

	var credits_style := StyleBoxFlat.new()
	credits_style.bg_color = Color(0.025, 0.035, 0.075, 0.94)
	credits_style.border_color = Color(0.0, 0.9, 1.0)
	credits_style.set_border_width_all(3)
	credits_style.set_corner_radius_all(12)
	credits_panel.add_theme_stylebox_override(&"panel", credits_style)

	var hurt_style := StyleBoxFlat.new()
	hurt_style.bg_color = Color.TRANSPARENT
	hurt_style.border_color = Color(1.0, 0.04, 0.06, 0.9)
	hurt_style.set_border_width_all(16)
	hurt_border.add_theme_stylebox_override(&"panel", hurt_style)

	var over_style := StyleBoxFlat.new()
	over_style.bg_color = Color.BLACK
	over_style.border_color = Color.BLACK
	game_over.add_theme_stylebox_override(&"panel", over_style)


func _process(delta: float) -> void:
	if game_over_active:
		return
	super(delta)
	# Godot's ProgressBar fills left-to-right; Codename's health bar is
	# RIGHT_TO_LEFT. Invert Noah's 0..100 health to preserve that behaviour.
	health_bar.value = Global.frame_independent_lerp(health_bar.value, 100.0 - current_health, 18.0, delta)
	if health_fill_style:
		health_fill_style.bg_color = enemy_color
	if health_background_style:
		health_background_style.bg_color = player_color
	var misses := int(GameManager.tallies.get("miss", 0))
	var total := int(GameManager.tallies.get("total_notes", 0))
	var good_hits := int(GameManager.tallies.get("sick", 0)) + int(GameManager.tallies.get("good", 0))
	good_hits += int(GameManager.tallies.get("bad", 0)) + int(GameManager.tallies.get("shit", 0))
	var accuracy := 100.0 if total <= 0 else clampf(float(good_hits) / float(total) * 100.0, 0.0, 100.0)
	if total <= 0:
		song_label.text = "ACCURACY: -%  -  [N/A]"
	else:
		var rank := GameManager.get_rank(accuracy / 100.0).to_upper()
		song_label.text = "ACCURACY: %.2f%%  -  [%s]" % [accuracy, rank]
	time_label.text = "COMBO BREAKS:%d" % misses
	score_label.text = "SCORE:%s" % Global.format_number(GameManager.score)
	botplay_label.visible = SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "botplay")
	if botplay_label.visible:
		botplay_phase += delta * 3.0
		botplay_label.modulate.a = 1.0 if sin(botplay_phase * PI) > 0.0 else 0.22
	else:
		botplay_phase = 0.0
		botplay_label.modulate.a = 0.0
	_update_health_icon_positions()
	_update_health_icon_frames()
	_update_task_bar()


func _song_length() -> float:
	var scene := get_tree().current_scene
	if scene and scene.get("playstate"):
		var state: PlayState = scene.get("playstate")
		if state and state.instrumental and state.instrumental.stream:
			return state.instrumental.stream.get_length()
	return 0.0


func _clock(seconds: float) -> String:
	seconds = maxf(seconds, 0.0)
	return "%02d:%02d" % [floori(seconds / 60.0), floori(fmod(seconds, 60.0))]


func _update_task_bar() -> void:
	var duration := _song_length()
	var ratio := clampf(GameManager.song_position / duration, 0.0, 1.0) if duration > 0.0 else 0.0
	task_fill.size.x = 572.0 * ratio
	var current_song := GameManager.get_current_song()
	task_text.text = current_song.title.to_upper() if current_song else "AMONG FUNK"


func _on_health_changed(value: float) -> void:
	current_health = clampf(value, 0.0, 100.0)


func _update_health_icon_positions() -> void:
	# Port of SmoothHealthBar.hx/PlayState.hx: both 150 px icons straddle the
	# moving split in the 620 px bar instead of sitting at fixed positions.
	var split_x := 330.0 + 620.0 * (health_bar.value / 100.0)
	player_icon.position.x = split_x - 26.0
	enemy_icon.position.x = split_x - 127.0


func update_player(character: Node) -> void:
	if character is CNECharacter:
		player_color = character.icon_color
		_set_icon(player_icon, character.icon_name, true)


func update_enemy(character: Node) -> void:
	if character is CNECharacter:
		enemy_color = character.icon_color
		_set_icon(enemy_icon, character.icon_name, false)


func downscroll_ui() -> void:
	apply_downscroll(true)


func apply_downscroll(enabled: bool) -> void:
	# Idempotent so the Quick Options switch can be changed repeatedly without
	# multiplying positions or restarting the chart.
	downscroll_enabled = enabled
	var target_y := 255.0 if enabled else -255.0
	player_strum.position.y = target_y
	enemy_strum.position.y = target_y
	botplay_label.position.y = 586.0 if enabled else 92.0
	task_panel.position.y = 12.0 if enabled else 680.0
	var stats_y := 48.0 if enabled else 650.0
	song_label.position.y = stats_y
	time_label.position.y = stats_y
	score_label.position.y = stats_y
	for strum_manager in strums:
		if is_instance_valid(strum_manager):
			strum_manager.set_scroll(-1.0 if enabled else 1.0)


func refresh_icons(player_character: CNECharacter, enemy_character: CNECharacter) -> void:
	update_player(player_character)
	update_enemy(enemy_character)


func set_botplay(enabled: bool) -> void:
	botplay_label.visible = enabled
	botplay_phase = 0.0


func _set_icon(target: TextureRect, icon_name: String, player_side: bool) -> void:
	var path := AmongFunkManager.resolve_image("icons/" + icon_name)
	if path.is_empty():
		path = "res://among_funk/codename/images/icons/RedCrewmate.png"
	var texture: Texture2D = ResourceLoader.load(path)
	if not texture:
		return
	if player_side:
		player_icon_source = texture
		player_icon_losing = false
	else:
		enemy_icon_source = texture
		enemy_icon_losing = false
	_apply_icon_frame(target, texture, false)


func _update_health_icon_frames() -> void:
	var wants_player_losing := current_health <= 20.0
	var wants_enemy_losing := current_health >= 80.0
	if wants_player_losing != player_icon_losing:
		player_icon_losing = wants_player_losing
		_apply_icon_frame(player_icon, player_icon_source, player_icon_losing)
	if wants_enemy_losing != enemy_icon_losing:
		enemy_icon_losing = wants_enemy_losing
		_apply_icon_frame(enemy_icon, enemy_icon_source, enemy_icon_losing)


func _apply_icon_frame(target: TextureRect, texture: Texture2D, losing: bool) -> void:
	if not is_instance_valid(target) or not is_instance_valid(texture):
		return
	if texture.get_width() >= texture.get_height() * 1.7:
		var atlas := AtlasTexture.new()
		atlas.atlas = texture
		var frame_width := texture.get_width() / 2.0
		atlas.region = Rect2(frame_width if losing else 0.0, 0.0, frame_width, texture.get_height())
		target.texture = atlas
	else:
		target.texture = texture


func set_middle_scroll(enabled: bool, duration_seconds: float = 0.0) -> void:
	# Among Funk always uses the classic two-sided layout.
	middle_scroll = false
	var target_y := 255.0 if downscroll_enabled else -255.0
	var player_target := Vector2(330.0, target_y)
	var enemy_target := Vector2(-330.0, target_y)
	var enemy_alpha := 1.0
	if duration_seconds <= 0.0:
		player_strum.position = player_target
		enemy_strum.position = enemy_target
		enemy_strum.modulate.a = enemy_alpha
		return
	var tween := create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN_OUT)
	tween.tween_property(player_strum, "position", player_target, duration_seconds)
	tween.tween_property(enemy_strum, "position", enemy_target, duration_seconds)
	tween.tween_property(enemy_strum, "modulate:a", enemy_alpha, duration_seconds)


func set_camera_angle(angle_radians: float, duration: float, ease_name: String) -> void:
	if duration <= 0.0:
		rotation = angle_radians
		return
	var ease_info: Array = Global.string_to_ease(ease_name)
	create_tween().set_trans(ease_info[0]).set_ease(ease_info[1]).tween_property(self, "rotation", angle_radians, duration)


func flash_screen(parameters: Array) -> void:
	var color := Color.WHITE
	if parameters.size() > 1:
		color = AmongFunkManager.color_from_value(parameters[1], Color.WHITE)
	color.a = 1.0
	flash_overlay.color = color
	var duration := _steps_to_seconds(float(parameters[2]) if parameters.size() > 2 else 4.0)
	var tween := create_tween()
	var reversed := AmongFunkManager.bool_from_value(parameters[0]) if not parameters.is_empty() else false
	if reversed:
		flash_overlay.modulate.a = 0.0
		tween.tween_property(flash_overlay, "modulate:a", 1.0, maxf(0.04, duration))
		tween.tween_callback(func() -> void: flash_overlay.modulate.a = 0.0)
	else:
		flash_overlay.modulate.a = 1.0
		tween.tween_property(flash_overlay, "modulate:a", 0.0, maxf(0.04, duration))


func set_black(parameters: Array) -> void:
	var should_show := true
	if not parameters.is_empty():
		should_show = str(parameters[0]).to_lower() in ["show", "true", "1"]
	var duration := float(parameters[1]) if parameters.size() > 1 else 0.0
	_tween_alpha(black_overlay, 1.0 if should_show else 0.0, duration)


func set_cover(parameters: Array) -> void:
	if parameters.size() > 1:
		cover_overlay.color = AmongFunkManager.color_from_value(parameters[1], Color.BLACK)
		cover_overlay.color.a = 1.0
	var target := 1.0
	if parameters.size() > 2:
		target = clampf(float(parameters[2]), 0.0, 1.0)
	var should_tween := AmongFunkManager.bool_from_value(parameters[0], true) if not parameters.is_empty() else true
	var duration := _steps_to_seconds(float(parameters[3]) if parameters.size() > 3 else 0.0)
	if not should_tween or duration <= 0.0:
		cover_overlay.modulate.a = target
		return
	var ease_base := str(parameters[4]) if parameters.size() > 4 else "linear"
	var ease_direction := str(parameters[5]) if parameters.size() > 5 else "In"
	var ease_info: Array = Global.string_to_ease(ease_base + ("" if ease_base == "linear" else ease_direction))
	create_tween().set_trans(ease_info[0]).set_ease(ease_info[1]).tween_property(cover_overlay, "modulate:a", target, duration)


func set_bars(parameters: Array) -> void:
	var should_tween := AmongFunkManager.bool_from_value(parameters[0], true) if not parameters.is_empty() else true
	var amount := float(parameters[1]) if parameters.size() > 1 else 0.2
	var height := clampf(amount, 0.0, 1.1) * 370.0
	var duration := _steps_to_seconds(float(parameters[2]) if parameters.size() > 2 else 4.0)
	top_bar.visible = height > 0.5 or top_bar.size.y > 0.5
	bottom_bar.visible = height > 0.5 or bottom_bar.size.y > 0.5
	if not should_tween or duration <= 0.0:
		_set_bar_height(height)
		return
	var ease_base := str(parameters[3]) if parameters.size() > 3 else "linear"
	var ease_direction := str(parameters[4]) if parameters.size() > 4 else "In"
	var ease_info: Array = Global.string_to_ease(ease_base + ("" if ease_base == "linear" else ease_direction))
	var tween := create_tween().set_trans(ease_info[0]).set_ease(ease_info[1])
	tween.tween_method(_set_bar_height, top_bar.size.y, height, duration)
	tween.finished.connect(func() -> void:
		top_bar.visible = height > 0.5
		bottom_bar.visible = height > 0.5
	)


func _set_bar_height(height: float) -> void:
	top_bar.size.y = height
	bottom_bar.position.y = 360.0 - height
	bottom_bar.size.y = height


func show_subtitle(parameters: Array) -> void:
	var packet := str(parameters[0]) if not parameters.is_empty() else ""
	var parts := packet.split(",", true, 2)
	var speaker := str(parts[0]) if parts.size() > 0 else ""
	var body := str(parts[1]) if parts.size() > 1 else ""
	var marker := str(parts[2]) if parts.size() > 2 else "$"
	if speaker.is_empty() or body.is_empty():
		subtitle_label.text = ""
		_tween_alpha(subtitle_label, 0.0, 0.3)
		return
	if not marker.is_empty():
		body = body.replace(marker, "")
	subtitle_label.text = speaker + ":\n" + body
	if parameters.size() > 1:
		subtitle_label.add_theme_color_override(&"font_color", AmongFunkManager.color_from_value(parameters[1], Color.WHITE))
	if parameters.size() > 3:
		var offsets := str(parameters[3]).split(",", true, 1)
		var offset_x := float(offsets[0]) if offsets.size() > 0 and str(offsets[0]).is_valid_float() else 0.0
		var offset_y := float(offsets[1]) if offsets.size() > 1 and str(offsets[1]).is_valid_float() else 0.0
		subtitle_label.position = Vector2(-620.0 + offset_x, 105.0 + offset_y)
	if parameters.size() > 4 and not str(parameters[4]).strip_edges().is_empty():
		var font_path := AmongFunkManager.resolve_named_file("res://among_funk/codename/fonts", str(parameters[4]), ["ttf", "otf"])
		if not font_path.is_empty():
			var font: Font = ResourceLoader.load(font_path)
			if font:
				subtitle_label.add_theme_font_override(&"font", font)
	var outlined := AmongFunkManager.bool_from_value(parameters[5], true) if parameters.size() > 5 else true
	subtitle_label.add_theme_constant_override(&"outline_size", 2 if outlined else 0)
	_tween_alpha(subtitle_label, 1.0, 0.3)


func show_credits(parameters: Array) -> void:
	var title := str(parameters[0]) if parameters.size() > 0 else "AMONG FUNK"
	var musician := str(parameters[1]) if parameters.size() > 1 else ""
	var artist := str(parameters[2]) if parameters.size() > 2 else ""
	var charter := str(parameters[3]) if parameters.size() > 3 else ""
	credits_label.text = "%s\nMUSIC  %s\nART  %s\nCHART  %s" % [title, musician, artist, charter]
	credits_panel.position.x = credits_home_x - credits_panel.size.x - 80.0
	credits_panel.modulate.a = 1.0
	var duration := float(parameters[4]) if parameters.size() > 4 else 4.0
	var tween := create_tween()
	tween.tween_property(credits_panel, "position:x", credits_home_x, 0.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_interval(maxf(1.5, duration))
	tween.tween_property(credits_panel, "position:x", credits_home_x - credits_panel.size.x - 80.0, 0.6).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.tween_callback(func() -> void: credits_panel.modulate.a = 0.0)


func show_media(parameters: Array) -> void:
	if parameters.size() < 2:
		return
	var media_type := str(parameters[0]).to_lower()
	var clean_name := str(parameters[1]).strip_edges().get_basename().get_file()
	# Two source chart entries contain typos/missing zero-index names. Resolve
	# them to the intended frames instead of silently dropping the event.
	clean_name = str({"imag5": "image5", "image": "image1"}.get(clean_name.to_lower(), clean_name))
	var placement := str(parameters[2]) if parameters.size() > 2 else "Center"
	var custom_position := Vector2(
		float(parameters[3]) if parameters.size() > 3 else 0.0,
		float(parameters[4]) if parameters.size() > 4 else 0.0
	)
	var fade_in := maxf(float(parameters[5]) if parameters.size() > 5 else 0.5, 0.0)
	var duration := maxf(float(parameters[6]) if parameters.size() > 6 else 2.0, 0.0)
	var fade_out := maxf(float(parameters[7]) if parameters.size() > 7 else 0.5, 0.0)
	var scale_value := maxf(float(parameters[9]) if parameters.size() > 9 else 1.0, 0.01)
	var tint := AmongFunkManager.color_from_value(parameters[10] if parameters.size() > 10 else Color.WHITE)
	var clamp_to_screen := AmongFunkManager.bool_from_value(parameters[11]) if parameters.size() > 11 else false
	var random_position := AmongFunkManager.bool_from_value(parameters[12]) if parameters.size() > 12 else false
	var node: Control
	var media_size := Vector2(640.0, 360.0) * scale_value
	if media_type == "video":
		var path := AmongFunkManager.resolve_named_file("res://among_funk/codename/videos/events", clean_name, ["mp4", "webm", "ogv"])
		if path.is_empty():
			return
		var stream: Resource = ResourceLoader.load(path)
		if not stream or stream is not VideoStream:
			return
		var video := VideoStreamPlayer.new()
		video.expand = true
		video.stream = stream
		video.bus = &"Music"
		video.size = media_size
		node = video
	else:
		var path := AmongFunkManager.resolve_image("events/" + clean_name)
		if path.is_empty():
			return
		var texture: Texture2D = ResourceLoader.load(path)
		if not texture:
			return
		var image := TextureRect.new()
		image.texture = texture
		image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		media_size = texture.get_size() * scale_value
		image.size = media_size
		node = image
	node.name = "Event Media"
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.z_index = 70
	node.modulate = tint
	node.modulate.a = 0.0001 if fade_in > 0.0 else 1.0
	add_child(node)
	var screen_position := _media_screen_position(placement, custom_position, media_size, random_position)
	if clamp_to_screen:
		screen_position.x = clampf(screen_position.x, 0.0, maxf(0.0, 1280.0 - media_size.x))
		screen_position.y = clampf(screen_position.y, 0.0, maxf(0.0, 720.0 - media_size.y))
	node.position = screen_position - Vector2(640.0, 360.0)
	if node is VideoStreamPlayer:
		(node as VideoStreamPlayer).play()
	_show_media_lifecycle(node, fade_in, duration, fade_out)


func _media_screen_position(placement: String, custom: Vector2, size: Vector2, random_position: bool) -> Vector2:
	if random_position:
		return Vector2(randf_range(0.0, maxf(0.0, 1280.0 - size.x)), randf_range(0.0, maxf(0.0, 720.0 - size.y)))
	match placement.to_lower():
		"left": return Vector2(50.0, (720.0 - size.y) * 0.5)
		"right": return Vector2(1280.0 - size.x - 50.0, (720.0 - size.y) * 0.5)
		"custom": return custom
		_: return Vector2((1280.0 - size.x) * 0.5, (720.0 - size.y) * 0.5)


func _show_media_lifecycle(node: Control, fade_in: float, duration: float, fade_out: float) -> void:
	if fade_in > 0.0:
		create_tween().tween_property(node, "modulate:a", 1.0, fade_in).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	await get_tree().create_timer(fade_in + duration, false).timeout
	if not is_instance_valid(node):
		return
	if fade_out > 0.0:
		var fade_tween := create_tween()
		fade_tween.tween_property(node, "modulate:a", 0.0, fade_out).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
		await fade_tween.finished
	if is_instance_valid(node):
		if node is VideoStreamPlayer:
			(node as VideoStreamPlayer).stop()
		node.queue_free()


func show_hurt(color: Color = Color.RED) -> void:
	var style := hurt_border.get_theme_stylebox(&"panel") as StyleBoxFlat
	if style:
		style.border_color = color
	hurt_border.modulate.a = 1.0
	var tween := create_tween()
	tween.tween_property(hurt_border, "modulate:a", 0.0, 0.75)


func register_hurt() -> bool:
	hurt_hits += 1
	hurt_reset_token += 1
	var token := hurt_reset_token
	var style := hurt_border.get_theme_stylebox(&"panel") as StyleBoxFlat
	if style:
		style.border_color = Color(1.0, 0.02, 0.04, 0.95)
	hurt_border.modulate.a = clampf(float(hurt_hits) / 10.0 * 0.8, 0.08, 0.8)
	_reset_hurt_later(token)
	return hurt_hits >= 10


func _reset_hurt_later(token: int) -> void:
	await get_tree().create_timer(3.0, false).timeout
	if token != hurt_reset_token or not is_instance_valid(hurt_border):
		return
	hurt_hits = 0
	var tween := create_tween()
	tween.tween_property(hurt_border, "modulate:a", 0.0, 2.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)


func show_game_over(_song_title: String) -> void:
	game_over_active = true
	game_over_can_retry = true
	game_over_transitioning = false
	current_health = 0.0
	player_icon_losing = true
	_apply_icon_frame(player_icon, player_icon_source, true)
	game_over.visible = true
	game_over.modulate.a = 0.0
	game_over_text.text = "THE PLAYER HAS BEEN DISCONNECTED"
	game_over_text.add_theme_color_override(&"font_color", Color("F13B47"))
	game_over_subtext.text = "CONNECTION LOST"
	game_over_subtext.add_theme_color_override(&"font_color", Color("A9B2B4"))
	game_over_hint.text = "ENTER / R  RECONNECT        ESC  RETURN TO SONG SELECT"
	game_over_progress.size.x = 0.0
	game_over_text.modulate = Color.WHITE
	game_over_text.scale = Vector2.ONE
	var reveal := create_tween()
	reveal.tween_property(game_over, "modulate:a", 1.0, 0.24).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	var game_over_path := "res://among_funk/codename/sounds/gameOver.ogg"
	if ResourceLoader.exists(game_over_path):
		game_over_music.stream = SoundManager.get_stream(game_over_path)
		if game_over_music.stream is AudioStreamOggVorbis:
			(game_over_music.stream as AudioStreamOggVorbis).loop = true
		game_over_music.play()


func _unhandled_input(event: InputEvent) -> void:
	if not game_over_active or not game_over_can_retry or game_over_transitioning or not event.is_pressed() or event.is_echo():
		return
	if event.is_action(&"menu_accept") or event.is_action(&"reload") or event.is_action(&"kill"):
		_retry_game()
	elif event.is_action(&"menu_cancel"):
		_return_to_song_select()


func _return_to_song_select() -> void:
	if game_over_transitioning:
		return
	game_over_transitioning = true
	game_over_music.stop()
	get_tree().paused = false
	GameManager.reset_stats()
	var target := Constants.FREEPLAY_MENU_SCENE if GameManager.freeplay else Constants.STORY_MODE_MENU_SCENE
	Global.change_scene_to(target, &"fade")


func _retry_game() -> void:
	game_over_transitioning = true
	game_over_can_retry = false
	game_over_music.stop()
	var ending_path := "res://among_funk/codename/sounds/gameOverEnd.ogg"
	if ResourceLoader.exists(ending_path):
		game_over_music.stream = SoundManager.get_stream(ending_path)
		if game_over_music.stream is AudioStreamOggVorbis:
			(game_over_music.stream as AudioStreamOggVorbis).loop = false
		game_over_music.play()
	game_over_text.text = "THE PLAYER HAS BEEN RECONNECTED"
	game_over_text.add_theme_color_override(&"font_color", Color("36A9FF"))
	game_over_subtext.text = "RESTORING SESSION..."
	game_over_subtext.add_theme_color_override(&"font_color", Color("67D8FF"))
	game_over_hint.text = ""
	reconnect_button.visible = false
	song_select_button.visible = false
	game_over_text.pivot_offset = game_over_text.size * 0.5
	game_over_text.scale = Vector2.ONE * 0.82
	game_over_text.modulate.a = 0.0
	var progress_tween := create_tween()
	progress_tween.tween_property(game_over_progress, "size:x", 500.0, 0.78).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN_OUT)
	var reconnect := create_tween().set_parallel(true)
	reconnect.tween_property(game_over_text, "modulate:a", 1.0, 0.24).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	reconnect.tween_property(game_over_text, "scale", Vector2.ONE * 1.06, 0.24).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	await reconnect.finished
	if not is_inside_tree():
		return
	var finish := create_tween()
	finish.tween_property(game_over_text, "scale", Vector2.ONE, 0.13).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	finish.tween_interval(0.50)
	finish.tween_property(game_over_subtext, "modulate:a", 0.0, 0.20)
	finish.tween_property(game_over_text, "modulate:a", 0.0, 0.38).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	await finish.finished
	if is_inside_tree():
		get_tree().paused = false
		get_tree().reload_current_scene()


func _steps_to_seconds(steps: float) -> float:
	if GameManager.conductor:
		return maxf(0.0, steps * GameManager.conductor.seconds_per_step)
	return maxf(0.0, steps * 0.125)


func _tween_alpha(node: CanvasItem, target: float, duration: float) -> void:
	if duration <= 0.0:
		node.modulate.a = target
		return
	var tween := create_tween()
	tween.tween_property(node, "modulate:a", target, duration)
