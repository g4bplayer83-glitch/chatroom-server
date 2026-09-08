extends Node

const GAMEPLAY_SCENE := preload("res://among_funk/scenes/gameplay.tscn")
const WARMUP_FRAMES := 12

var failures: Array[String] = []
var tested_songs := 0
var capture_directory := ""
var probe_events := false
var probe_chart_events := false
var probe_assets := false
var probe_death := false
var probe_sustains := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	call_deferred("_run")


func _run() -> void:
	for _frame in 4:
		await get_tree().process_frame
	var requested_song := _argument_value("--song")
	capture_directory = _argument_value("--capture-dir")
	probe_events = OS.get_cmdline_user_args().has("--probe-events")
	probe_chart_events = OS.get_cmdline_user_args().has("--probe-chart-events")
	probe_assets = OS.get_cmdline_user_args().has("--probe-assets")
	probe_death = OS.get_cmdline_user_args().has("--probe-death")
	probe_sustains = OS.get_cmdline_user_args().has("--probe-sustains")
	if not capture_directory.is_empty():
		DirAccess.make_dir_recursive_absolute(capture_directory)
	var songs: Array = AmongFunkManager.get_songs()
	for info_value in songs:
		if info_value is not Dictionary:
			continue
		var info: Dictionary = info_value
		var song_id := str(info.get("id", ""))
		if not requested_song.is_empty() and song_id.nocasecmp_to(requested_song) != 0:
			continue
		await _test_song(info)
	if probe_assets:
		await _probe_all_stage_and_character_assets()
	if probe_sustains:
		await _probe_sustain_geometry()
	print("[AMONG_FUNK_SMOKE] songs=%d failures=%d" % [tested_songs, failures.size()])
	for failure in failures:
		push_error("[AMONG_FUNK_SMOKE] " + failure)
	get_tree().quit(1 if not failures.is_empty() else 0)


func _test_song(info: Dictionary) -> void:
	tested_songs += 1
	var song_id := str(info.get("id", ""))
	var song := AmongFunkManager.get_song(song_id)
	if not song:
		failures.append("Missing Song resource: " + song_id)
		return
	var difficulties := AmongFunkManager.difficulty_names(info)
	if difficulties.is_empty():
		failures.append("No difficulty: " + song_id)
		return
	GameManager.reset_stats()
	GameManager.current_song = song
	GameManager.difficulty = difficulties[0]
	GameManager.freeplay = true
	GameManager.play_mode = GameManager.PLAY_MODE.FREEPLAY
	AmongFunkManager.mark_cutscene_seen(song_id)

	var gameplay := GAMEPLAY_SCENE.instantiate()
	get_tree().root.add_child(gameplay)
	for _frame in WARMUP_FRAMES:
		await get_tree().process_frame
	var stage: CNEStage = gameplay.get_node_or_null("Stage")
	var player: CNECharacter = gameplay.get_node_or_null("Player")
	var enemy: CNECharacter = gameplay.get_node_or_null("Enemy")
	var girlfriend: CNECharacter = gameplay.get_node_or_null("Metronome")
	var camera: Camera2D = gameplay.get_node_or_null("GameCamera")
	var playstate: PlayState = gameplay.get_node_or_null("PlayState")
	var among_ui: AmongFunkUI = gameplay.get_node_or_null("AmongUI")
	if not stage or not player or not enemy or not camera:
		failures.append("Gameplay nodes missing: " + song_id)
	elif not playstate or not playstate.chart:
		failures.append("Chart failed to load: " + song_id)
	elif stage.get_child_count() <= 0:
		failures.append("Stage has no visuals: " + song_id)
	elif not player.sprite.sprite_frames or not enemy.sprite.sprite_frames:
		failures.append("Character atlas missing: " + song_id)
	else:
		var player_size: Vector2 = player.call("_current_frame_size")
		if player.character_id.to_lower() == "bf" and (player_size.x > 520.0 or player_size.y > 520.0):
			failures.append("Wrong oversized BF atlas: %s %s" % [song_id, player_size])
		if song_id.nocasecmp_to("Meltdown") != 0 and girlfriend and girlfriend.character_id.to_lower() == "gf" and not girlfriend.uses_animate:
			failures.append("Base GF Adobe atlas was not loaded: " + song_id)
		if enemy.character_id.to_lower() == "redcrew" and enemy.sprite.sprite_frames:
			var expected_counts := {&"idle": 10, &"left": 4, &"right": 4, &"down": 4, &"up": 4}
			for animation_name in expected_counts:
				if enemy.sprite.sprite_frames.get_frame_count(animation_name) != int(expected_counts[animation_name]):
					failures.append("RedCrew animation indices invalid: %s %s" % [animation_name, song_id])
		if stage.stage_id.to_lower() in ["polus", "stage"]:
			if not enemy.position.is_equal_approx(Vector2(393.221059558646, 344.148167407661)):
				failures.append("Polus opponent position changed: " + song_id)
			if not player.position.is_equal_approx(Vector2(1243.54446847127, 377.423326102246)):
				failures.append("Polus player position changed: " + song_id)
			if enemy.get_camera_position().distance_to(Vector2(584.82106, 874.54816)) > 0.1:
				failures.append("Polus opponent camera invalid: " + song_id)
			if player.get_camera_position().distance_to(Vector2(1349.0444, 833.42334)) > 0.1:
				failures.append("Polus player camera invalid: " + song_id)
			var first_layer := stage.get_child(0) as Node2D if stage.get_child_count() > 0 else null
			if not first_layer or first_layer.position.distance_to(Vector2(943, 564)) > 0.1 or first_layer.scale.distance_to(Vector2(1.4, 1.4)) > 0.01:
				failures.append("Polus background transform invalid: " + song_id)
		if not among_ui:
			failures.append("Among Funk UI missing: " + song_id)
		elif among_ui.middle_scroll:
			failures.append("Middle scroll unexpectedly enabled: " + song_id)
		elif not among_ui.player_strum.position.is_equal_approx(Vector2(330.0, -255.0)):
			failures.append("Player strum is not on the classic side: " + song_id)
		elif not among_ui.enemy_strum.position.is_equal_approx(Vector2(-330.0, -255.0)):
			failures.append("Opponent strum is not on the classic side: " + song_id)
		elif among_ui.enemy_strum.modulate.a < 0.99:
			failures.append("Opponent notes are hidden: " + song_id)
		elif among_ui.top_bar.z_index >= 0 or among_ui.bottom_bar.z_index >= 0:
			failures.append("Cinematic bars render above notes: " + song_id)
		elif among_ui.health_bar.position.y > -250.0:
			failures.append("Codename health bar is not at the top: " + song_id)
		elif among_ui.player_icon.size.distance_to(Vector2(150, 150)) > 0.1 or among_ui.enemy_icon.size.distance_to(Vector2(150, 150)) > 0.1:
			failures.append("Codename health icons are not 150x150: " + song_id)
		if player.silhouette_strength <= 0.0001 and player.sprite.material != null:
			failures.append("Player keeps a tint material at zero strength: " + song_id)
		if enemy.silhouette_strength <= 0.0001 and enemy.sprite.material != null:
			failures.append("Opponent keeps a tint material at zero strength: " + song_id)
		print(
			"[AMONG_FUNK_SMOKE] %s stage=%s zoom=%.3f camera=%s enemy=%s size=%s flip=%s player=%s size=%s cam=%s flip=%s"
			% [
				song_id, stage.stage_id, camera.zoom.x, camera.position,
				enemy.position, enemy.call("_current_frame_size"), enemy.sprite.flip_h,
				player.position, player_size, player.get_camera_position(), player.sprite.flip_h
			]
		)
		if probe_events:
			await _probe_event_handlers(gameplay, playstate, song_id)
		if probe_chart_events:
			await _probe_actual_chart_events(playstate, song_id)
		if probe_death:
			await _probe_game_over(gameplay, playstate, among_ui, song_id)
		if song_id.nocasecmp_to("Sabotage") == 0:
			_probe_downscroll_layout(among_ui, song_id)
		if not capture_directory.is_empty():
			RenderingServer.force_draw(false, 0.0)
			var screenshot := get_viewport().get_texture().get_image()
			if screenshot:
				var capture_path := capture_directory.path_join(song_id.validate_filename() + ".png")
				var save_error := screenshot.save_png(capture_path)
				if save_error != OK:
					failures.append("Screenshot failed: " + song_id)
				else:
					print("[AMONG_FUNK_SMOKE] capture=" + capture_path)
			else:
				print("[AMONG_FUNK_SMOKE] capture skipped (dummy renderer): " + song_id)
	gameplay.queue_free()
	get_tree().paused = false
	for _frame in 4:
		await get_tree().process_frame


func _probe_downscroll_layout(among_ui: AmongFunkUI, song_id: String) -> void:
	var health_y := among_ui.health_bar.position.y
	var player_y := among_ui.player_strum.position.y
	var enemy_y := among_ui.enemy_strum.position.y
	among_ui.downscroll_ui()
	if not is_equal_approx(among_ui.health_bar.position.y, health_y):
		failures.append("Downscroll moved the health bar away from the top: " + song_id)
	if not is_equal_approx(among_ui.player_strum.position.y, -player_y) or not is_equal_approx(among_ui.enemy_strum.position.y, -enemy_y):
		failures.append("Downscroll did not flip both strumlines: " + song_id)
	if not is_equal_approx(among_ui.botplay_label.position.y, 600.0):
		failures.append("Downscroll botplay label is not at the source position: " + song_id)
	# Restore the original orientation so later probes remain deterministic.
	among_ui.player_strum.position.y = player_y
	among_ui.enemy_strum.position.y = enemy_y
	among_ui.botplay_label.position.y = 92.0


func _probe_event_handlers(gameplay: Node, playstate: PlayState, song_id: String) -> void:
	gameplay.call("_on_among_funk_event", 0.0, "Visual_FX", ["Wave", true, "Soft", 1.0, -1, 6.0, 48.0, "camGame", 0.01, "linear", "Rester", 0.0])
	gameplay.call("_on_among_funk_event", 0.0, "ShadersEdit", ["warp", true, 0.2, -1, 0.1, 0.0, "camGame", 0.01, "linear", 0.0])
	gameplay.call("_on_among_funk_event", 0.0, "CRT Effect", [0.1, 0.01, 1.0, 0.0])
	gameplay.call("_on_among_funk_event", 0.0, "Screen FX Pro", ["Bloom", true, "game", 0.0, -1, 0, 1, 0.7, "Realiste", -1, 0, 2, 1, -1, 0, 0, 0.01, "linear", 0.45, 5.0, 0.0, 4.0])
	gameplay.call("_on_among_funk_event", 0.0, "Camera Angle", [2.0, "toutes", 0.01, "linear"])
	gameplay.call("_on_among_funk_event", 0.0, "Camera Position", [640.0, 360.0, true, 1.0, "linear", "In", false])
	gameplay.call("_on_among_funk_event", 0.0, "Middle Scroll", [true, 0.01])
	gameplay.call("_on_among_funk_event", 0.0, "Cinematic Bars", [true, 0.1, 1.0, "linear", "In", "camHUD"])
	gameplay.call("_on_among_funk_event", 0.0, "Screen Coverer", [true, -16777216, 0.1, 1.0, "linear", "In", "camHUD", "back"])
	gameplay.call("_on_among_funk_event", 0.0, "PA Lyrics", ["Red,Runtime probe,$", -1, -65536, "0,0", "vcr.ttf", true])
	gameplay.call("_on_among_funk_event", 0.0, "Credits Popup", ["Probe", "Music", "Art", "Chart", 0.01])
	gameplay.call("_on_among_funk_event", 0.0, "ShowMedia", ["Image", "host_credit", "Center", 0, 0, 0.01, 0.01, 0.01, "HUD", 0.25, -1, true, false])
	gameplay.call("_on_among_funk_event", 0.0, "ShowMedia", ["Video", "video", "Center", 0, 0, 0.0, 0.01, 0.01, "HUD", 0.25, -1, true, false])
	gameplay.call("_on_among_funk_event", 0.0, "CharacterColorChange", [false, false, -65536, true, 0.01, "linear", "In", true, -16777216])
	gameplay.call("_on_among_funk_event", 0.0, "Virtual Character", ["red-not-imposter", "none", 100.0, 100.0, 1.0, false])
	gameplay.call("_on_among_funk_event", 0.0, "Camera Beat Zoom Pro", [true, "both", 1, 0.035, 0.02, 0.12, true])
	gameplay.call("_on_among_funk_event", 0.0, "camBounce", [true, 10.0, true, 1.0])
	playstate.basic_event(0.0, "cne_camera_zoom", [true, 0.9, "camGame", 1.0, "linear", "In", "direct", false])
	playstate.basic_event(0.0, "cne_scroll_speed", [true, 2.0, 1.0, "linear", "In", false])
	playstate.basic_event(0.0, "cne_camera_modulo", [1, 1.0, "BEAT", 0])
	for _frame in 8:
		await get_tree().process_frame
	var game_fx: Variant = gameplay.get("game_fx")
	if not game_fx or not game_fx.get("shader_material"):
		failures.append("Shader stack failed: " + song_id)
	var enemy: CNECharacter = gameplay.get_node_or_null("Enemy")
	if not enemy or not enemy.silhouette_material:
		failures.append("Character shader failed: " + song_id)
	else:
		print("[AMONG_FUNK_SMOKE] event-probe=" + song_id + " OK")


func _probe_actual_chart_events(playstate: PlayState, song_id: String) -> void:
	var dispatched: Dictionary = {}
	for packet_value in playstate.chart.get_events_data():
		if packet_value is not Array:
			continue
		var packet: Array = packet_value
		if packet.size() < 3:
			continue
		var event_name := str(packet[1])
		if dispatched.has(event_name):
			continue
		dispatched[event_name] = true
		playstate.basic_event(float(packet[0]), event_name, Array(packet[2]))
	for _frame in 6:
		await get_tree().process_frame
	print("[AMONG_FUNK_SMOKE] chart-event-probe=%s types=%d" % [song_id, dispatched.size()])


func _probe_all_stage_and_character_assets() -> void:
	var stage_probe := CNEStage.new()
	stage_probe.name = "Stage Asset Probe"
	get_tree().root.add_child(stage_probe)
	await get_tree().process_frame
	var stage_count := 0
	for filename in DirAccess.get_files_at("res://among_funk/codename/data/stages"):
		if filename.get_extension().to_lower() != "xml":
			continue
		var stage_id := filename.get_basename()
		if not stage_probe.load_stage(stage_id):
			failures.append("Stage config failed: " + stage_id)
		elif stage_probe.get_child_count() <= 0:
			failures.append("Stage has no visual: " + stage_id)
		stage_count += 1
		await get_tree().process_frame
	stage_probe.queue_free()
	await get_tree().process_frame

	var character_probe := CNECharacter.new()
	character_probe.name = "Character Asset Probe"
	var character_sprite := AnimatedSprite2D.new()
	character_sprite.name = "AnimatedSprite2D"
	character_probe.add_child(character_sprite)
	get_tree().root.add_child(character_probe)
	await get_tree().process_frame
	var character_count := 0
	for filename in DirAccess.get_files_at("res://among_funk/codename/data/characters"):
		if filename.get_extension().to_lower() != "xml":
			continue
		var character_id := filename.get_basename()
		for flipped in [false, true]:
			if not character_probe.configure(character_id, "dad", flipped):
				failures.append("Character config failed: %s flip=%s" % [character_id, flipped])
				break
			if character_probe.uses_animate:
				if not is_instance_valid(character_probe.animate_library) or character_probe.animate_symbols.is_empty():
					failures.append("Adobe character atlas is empty: " + character_id)
					break
			elif not character_probe.sprite.sprite_frames or character_probe.sprite.sprite_frames.get_animation_names().is_empty():
				failures.append("Character atlas is empty: " + character_id)
				break
			for animation_id in character_probe.animation_names:
				if character_probe.uses_animate:
					if not character_probe.animate_symbols.has(animation_id):
						failures.append("Missing Adobe animation: %s/%s" % [character_id, animation_id])
						break
				elif not character_probe.sprite.sprite_frames.has_animation(animation_id) or character_probe.sprite.sprite_frames.get_frame_count(animation_id) <= 0:
					failures.append("Missing Sparrow animation: %s/%s" % [character_id, animation_id])
					break
		character_count += 1
		await get_tree().process_frame
	character_probe.queue_free()
	print("[AMONG_FUNK_SMOKE] assets stages=%d characters=%d" % [stage_count, character_count])


func _probe_game_over(gameplay: Node, playstate: PlayState, among_ui: AmongFunkUI, song_id: String) -> void:
	playstate.health = 0.0
	for _frame in 4:
		await get_tree().process_frame
	if not playstate.died:
		failures.append("Death state did not latch: " + song_id)
	if not among_ui.game_over_active or not among_ui.game_over.visible:
		failures.append("Game-over panel missing: " + song_id)
	elif "THE PLAYER HAS BEEN DISCONNECTED" not in among_ui.game_over_text.text:
		failures.append("Disconnect game-over text missing: " + song_id)
	elif among_ui.game_over.size.distance_to(Vector2(1280.0, 720.0)) > 0.1:
		failures.append("Game-over is not full-screen: " + song_id)
	if among_ui.player_strum.visible or among_ui.enemy_strum.visible:
		failures.append("Strums remain visible during game-over: " + song_id)
	if playstate.instrumental.playing or playstate.vocals.playing:
		failures.append("Audio still playing during game-over: " + song_id)
	# Reproduce the original crash precisely: a sustain used to emit one final
	# holding callback after vocals.stop(), then dereference a null playback.
	var late_note := BasicNote.new()
	playstate.note_holding(late_note, 0, 0.016, among_ui.player_strum)
	playstate.note_hit(late_note, 0, 0.0, among_ui.player_strum)
	playstate.note_miss(late_note, 0, among_ui.player_strum)
	late_note.free()
	print("[AMONG_FUNK_SMOKE] death-probe=%s OK" % song_id)
	get_tree().paused = false


func _probe_sustain_geometry() -> void:
	var packed: PackedScene = load("res://noah/game/note/note.tscn")
	var sustain: BasicNote = packed.instantiate()
	sustain.note_skin = load("res://noah/assets/custom_note/custom_note_skin.tres")
	sustain.animation = &"left"
	sustain.note_type = ""
	sustain.time = 1.0
	sustain.length = 2.0
	sustain.scroll_speed = 2.7
	add_child(sustain)
	for _frame in 3:
		await get_tree().process_frame
	var tail: TextureRect = sustain.get_node("Tail")
	var cap: TextureRect = sustain.get_node("Tail/End")
	var visible_width := tail.size.y * absf(tail.scale.y)
	if tail.stretch_mode != TextureRect.STRETCH_SCALE:
		failures.append("Sustain body still tiles instead of stretching")
	if visible_width < 35.0 or visible_width > 45.0:
		failures.append("Sustain width invalid: %.2f" % visible_width)
	if not cap.texture or cap.position.x < 0.0 or cap.position.x > tail.size.x:
		failures.append("Sustain end cap geometry invalid")
	print("[AMONG_FUNK_SMOKE] sustain-probe width=%.2f length=%.2f cap=%.2f" % [visible_width, tail.size.x, cap.position.x])
	sustain.queue_free()


func _argument_value(name: String) -> String:
	var arguments := OS.get_cmdline_user_args()
	for index in arguments.size():
		if arguments[index] == name and index + 1 < arguments.size():
			return arguments[index + 1]
		if arguments[index].begins_with(name + "="):
			return arguments[index].trim_prefix(name + "=")
	return ""
