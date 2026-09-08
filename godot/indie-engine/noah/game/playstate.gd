@icon("uid://cn3dcg1gr2oo4")
extends Node
class_name PlayState

const COMPENSATION: float = 1.0 / 30.0

@onready var song_data: Song
@onready var vocals: AudioStreamPlayer
@onready var instrumental: AudioStreamPlayer
@onready var strums: Array = []
@onready var characters: Array = []

@export_group("Nodes")
## The host song script. Usually the parent of this node.
@export var host: Node
## The UI node that requires a list: [code]strums[/code].
@export var ui: BasicUI
## Camera with built-in functions.
@export var camera: CameraController

@export_group("Resources")
@export var note_skin: NoteSkin
@export var ui_skin: UISkin

@export_group("Scenes")
## The scene that will be switched to when the song ends.
@export_file('*.tscn') var next_scene: String = Constants.get("RESULTS_MENU_SCENE")

var song_starting:bool = false
var song_started: bool = false
var song_start_offset: float = -4.0
var song_start_time: float = 0.0
# So it turns out that the track ID's are not sequential and can be whatever number they want, I did this so it'd be easier
var vocal_tracks: Array = []
var vocal_streams: Array = []

var position_delta: float = 0.0
var position_lerp: float = 0.0
var sync_timer: float = 0.0
var song_speed: float = 1.0
var scroll_speed: float = 1.0
# The index of the latest loaded note
var current_note: int = -1
# The index of the latest loaded event
var current_event: int = -1
var output_latency: float = AudioServer.get_output_latency()

var chart: Chart

var misses: int = 0
var score: float = 0
var health: float = 50.0 : set = set_health
var combo: int = 0
var died: bool = false

# Codename defaults: camGameZoomMult=0.015, camHUDZoomMult=0.03.
var camera_bop_strength: Vector2 = Vector2(0.015, 0.015)
var ui_bop_strength: Vector2 = Vector2(0.03, 0.03)

func set_health(v: float):
	if health != v: #is this even necessary
		Signals.play_health_changed.emit(v)
	health = v


# Called when the node enters the scene tree for the first time.
func _ready() -> void:
	song_data = GameManager.get_current_song()
	assert(song_data, "No song was selected before entering PlayState.")
	
	assert(host, 'A Host was not assigned.')
	assert(ui, 'A UI was not assigned.')
	assert(camera, 'A Camera Controller was not assigned.')
	
	# This delay is so variables initialize
	await host.ready
	
	# Creating the Audio Tracks
	vocals = AudioStreamPlayer.new()
	vocals.stream = AudioStreamPolyphonic.new()
	vocals.stream.polyphony = song_data.vocals.size()
	vocals.set_bus(&"Music")
	for v in song_data.vocals:
		vocal_streams.append(SoundManager.get_stream(v))
	
	instrumental = AudioStreamPlayer.new()
	instrumental.stream = SoundManager.get_stream(song_data.instrumental)
	instrumental.connect("finished", song_finished)
	instrumental.pitch_scale = song_speed
	instrumental.set_bus(&"Music")
	self.add_child(vocals)
	vocals.play()
	self.add_child(instrumental)
	
	GameManager.reset_conductor()
	
	strums = ui.strums
	
	GameManager.song_scene = LoadingScreen.scene
	
	chart = Chart.load(song_data.difficulties[GameManager.difficulty].chart)
	assert(chart, 'Failed to load chart. is (%s) correct?' % (song_data.difficulties[GameManager.difficulty].chart))
	
	if not song_data.events.is_empty() and ResourceLoader.exists(song_data.events):
		var ext_events = load(song_data.events)
		if ext_events is ChartEvents:
			chart.merge_events_into_this(ext_events)
		else:
			ext_events.free()
	
	song_speed = SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "song_speed")
	
	match GameManager.play_mode:
		GameManager.PLAY_MODE.CHARTING:
			if SettingsManager.get_value(SettingsManager.SEC_CHART, "start_at_current_position"):
				# Keep PlayState independent from the optional native waveform/chart-editor
				# extension. GameManager already owns the shared playback position.
				play_song(maxf(0.0, GameManager.song_position))
			else:
				play_song(0)
		
		_:
			play_song(0)
	
	Global.set_window_title("Playing: " + song_data.title)
	
	if SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "botplay"):
		get_tree().call_group(&"strums", "set_auto_play", true)
		get_tree().call_group(&"strums", "set_press", false)
	
	if SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "downscroll"):
		ui.downscroll_ui()
	
	scroll_speed = chart.scroll_speed * SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "scroll_speed_scale")
	
	get_tree().call_group(&"strums", "set_scroll_speed", scroll_speed)
	get_tree().call_group(&"strums", "set_skin", note_skin)
	get_tree().call_group(&"strums", "set_offset",
	SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "offset"))
	
	if SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "downscroll"):
		get_tree().call_group(&"strums", "set_scroll", -1)
	
	Signals.play_note_hit.connect(self.note_hit)
	Signals.play_note_holding.connect(self.note_holding)
	Signals.play_note_miss.connect(self.note_miss)
	
	Signals.play_setup_finished.emit()


func _process(delta) -> void:
	health = clamp(health, 0.0, 100.0)
	GameManager.score = int(score)
	
	if health <= 0 and !died:
		died = true
		GameManager.deaths += 1
		GameManager.song_scene = get_tree().current_scene.scene_file_path
		Signals.play_died.emit()
		return
	if died:
		return
	
	# Why is this a thing I have to do
	if get_tree():
		get_tree().call_group(&"note", &"update")
	
	if !song_started and song_starting:
		song_start_offset += delta
		GameManager.song_position = song_start_offset
		GameManager.conductor.time = GameManager.song_position
		
		if song_start_offset >= max(chart.offset, song_start_time):
			play_audios(song_start_time)
			song_starting = false
	else:
		GameManager.song_position = instrumental.get_playback_position() + \
				AudioServer.get_time_since_last_mix() - output_latency
		
		GameManager.conductor.offset = chart.get_tempo_time_at(GameManager.song_position)
		GameManager.conductor.offset += chart.offset
		
		# Idk how exactly this works I stole this code from sqirradotdev
		position_delta = abs(position_lerp - GameManager.song_position)
		position_lerp += delta * instrumental.pitch_scale
		
		if delta > COMPENSATION or sync_timer <= 0.0 or position_delta >= 0.01 * instrumental.pitch_scale:
			if position_delta >= 0.025 * instrumental.pitch_scale:
				position_lerp = GameManager.song_position
			sync_timer = 0.5
		
		GameManager.song_position = position_lerp
		sync_timer -= delta
	
	GameManager.conductor.tempo = chart.get_tempo_at(GameManager.song_position)
	var meter: Array = chart.get_meter_at(GameManager.song_position)
	GameManager.conductor.numerator = meter[0]
	GameManager.conductor.denominator = meter[1]
	
	# Instead of before where I would do a linear search per section, a faster method
	# would just be to iterate through as the song is playing, making it faster
	var notes_list = chart.get_notes_data()
	
	if notes_list.size() > 0:
		# A chart may contain chords and several notes at the exact same time.
		# Drain every note that belongs in the spawn window this frame instead of
		# leaking only one note per rendered frame.
		while current_note >= 0 and current_note < notes_list.size():
			var note = notes_list[current_note]
			
			var spawn_time = GameManager.song_position + GameManager.conductor.seconds_per_beat * 4
			if scroll_speed < 1:
				spawn_time /= scroll_speed 
			
			if note[0] > spawn_time:
				break
			var time: float = note[0]
			var lane: int = note[1]
			var length: float = note[2]
			var type: Variant = note[3]
			
			Signals.play_create_note.emit(time, lane, length, type, chart.get_tempo_at(time))
			current_note += 1
	
	if instrumental.playing:
		var events_list = chart.get_events_data()
		if events_list.size() > 0:
			# Codename charts routinely stack several camera/visual events on one
			# timestamp. Dispatch all of them in-order during the same frame.
			while current_event >= 0 and current_event < events_list.size():
				var event = events_list[current_event]
				if event[0] > GameManager.song_position:
					break
				var time: float = event[0]
				var event_name: String = event[1]
				var event_parameters: Array = event[2]
				
				print("(PlayState) Song Event: \"", event_name, "\" ", str(event_parameters))
				basic_event(time, event_name, event_parameters)
				current_event += 1


func play_song(time: float):
	await Signals.play_song_ready_to_start
	
	song_starting = true
	
	GameManager.started_song(song_data)
	GameManager.conductor.stream_player = instrumental
	GameManager.conductor.tempo = chart.get_tempo_at(-chart.offset + time)
	GameManager.conductor.seconds_per_beat = 60.0 / GameManager.conductor.tempo
	
	GameManager.conductor.offset = chart.offset + SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "offset")
	
	song_started = false
	song_start_time = time + chart.offset
	song_start_offset = song_start_time - (GameManager.conductor.seconds_per_beat * 4)
	GameManager.song_position = song_start_offset
	GameManager.conductor.time = song_start_time
	
	if time >= GameManager.conductor.seconds_per_beat * 4:
		play_audios(song_start_offset)
	else:
		if !ui_skin.countdown.is_empty():
			var countdown_instance: AnimationPlayer = load(ui_skin.countdown).instantiate()
			
			countdown_instance.speed_scale = chart.get_tempo_at(time - chart.offset) / 60.0
			
			ui.add_child(countdown_instance)
			countdown_instance.seek(time)
	
	var notes_list = chart.get_notes_data()
	current_note = bsearch_left_range(notes_list, time)
	var events_list = chart.get_events_data()
	current_event = bsearch_left_range(events_list, max(song_start_offset, 0))

# This if for actually playing the audio tracks, the reason this is a function is because
# I also call it in the process function for when the song starts before 4 beats are possible.
func play_audios(time: float):
	var playback = vocals.get_stream_playback()
	
	if playback:
		for stream in vocal_streams:
			vocal_tracks.append(playback.play_stream(stream, time, \
			0.0, song_speed))
	instrumental.play(time)
	instrumental.pitch_scale = song_speed
	if not song_started:
		Signals.play_song_start.emit()
	song_started = true

# Binary Search of notes and events, gives the index of the note nearest to the given time
func bsearch_left_range(value_set: Array, left_range: float) -> int:
	var length = value_set.size()
	if (length == 0):
		return -1
	if (value_set[length - 1][0] < left_range):
		return -1
	
	var low: int = 0
	var high: int = length - 1
	
	while (low <= high):
		var mid: int = (low + high) / 2
		
		if (value_set[mid][0] >= left_range):
			high = mid - 1
		else:
			low = mid + 1
	
	return high + 1


static func get_rating(time: float) -> String:
	var ratings = [
		[time <= GameManager.SICK_RATING_WINDOW, "sick"],
		[time <= GameManager.GOOD_RATING_WINDOW, "good"],
		[time <= GameManager.BAD_RATING_WINDOW, "bad"],
		[time <= GameManager.SHIT_RATING_WINDOW, "shit"],
		[true, "miss"],
	]
	
	for condition in ratings:
		if condition[0]:
			return condition[1]
	
	return "miss"


func score_note(hit_time: float):
	var factor: float = 1.0 - (1.0 / (1.0 + exp(-Constants.SCORING_SLOPE * ((abs(hit_time) - Constants.SCORING_OFFSET) * 1000))))
	var add: float = Constants.MAX_SCORE_GAIN * factor + Constants.MIN_SCORE_GAIN
	add = clamp(add, Constants.MIN_SCORE_GAIN, Constants.MAX_SCORE_GAIN)
	score += add


func basic_event(time: float, event_name: String, event_parameters: Array):
	match event_name:
		"camera_position":
			if host.camera_positions.size() == 0:
				printerr('(PlayState): no camera_positions exist')
				return
			if event_parameters.is_empty():
				return
			var index: int = int(event_parameters[0])
			if index < 0 or index >= host.camera_positions.size():
				printerr("(PlayState): Camera marker index is out of range: ", index)
				return
			var marker = host.camera_positions[index]
			if !marker:
				printerr("(PlayState): Marker does not exist at index: ", index)
				return
			
			var should_tween := _event_bool(event_parameters[1], true) if event_parameters.size() > 1 else true
			var duration_steps := float(event_parameters[2]) if event_parameters.size() > 2 else 4.0
			var ease_base := str(event_parameters[3]) if event_parameters.size() > 3 else "CLASSIC"
			var ease_direction := str(event_parameters[4]) if event_parameters.size() > 4 and event_parameters[4] != null else "In"
			var target_position: Vector2 = marker.global_position + Vector2(
				float(event_parameters[5]) if event_parameters.size() > 5 and event_parameters[5] != null else 0.0,
				float(event_parameters[6]) if event_parameters.size() > 6 and event_parameters[6] != null else 0.0
			)
			if not should_tween:
				var smoothing_before := camera.position_smoothing
				camera.position_smoothing = false
				camera.position = target_position
				camera.position_smoothing = smoothing_before
			elif ease_base.to_upper() == "CLASSIC":
				camera.position = target_position
			else:
				var duration := maxf(0.0, duration_steps * GameManager.conductor.seconds_per_step / song_speed)
				var temporary_marker := Marker2D.new()
				host.add_child(temporary_marker)
				temporary_marker.global_position = target_position
				camera.tween_to_marker(temporary_marker, duration, ease_base + ease_direction)
				temporary_marker.queue_free()
		
		"camera_bop":
			var camera_bop: float = 0.015
			if event_parameters.size() > 0 and not str(event_parameters[0]).is_empty():
				camera_bop = float(event_parameters[0])
				
			var ui_bop: float = 0.03
			if event_parameters.size() > 1 and not str(event_parameters[1]).is_empty():
				ui_bop = float(event_parameters[1])
			
			camera.bump(camera_bop)
			ui.bump(Vector2.ONE * ui_bop)
		
		"psych_camera_zoom":
			if event_parameters.is_empty():
				return
			var new_zoom = Vector2(float(event_parameters[0]), float(event_parameters[0]))
			camera.target_zoom = new_zoom
		
		"camera_zoom":
			if event_parameters.is_empty():
				return
			var new_zoom = Vector2(float(event_parameters[0]), float(event_parameters[0]))
			var zoom_time: float = 0.0
			if event_parameters.size() > 1:
				zoom_time = Global.string_to_time(str(event_parameters[1]))
			var _ease: String = "CLASSIC"
			
			var ease_string = event_parameters[2] if event_parameters.size() > 2 else null
			if ease_string:
				_ease = ease_string
			
			if _ease.to_lower() == "classic":
				camera.target_zoom = new_zoom
			else:
				camera.tween_zoom(new_zoom, zoom_time / song_speed, _ease)

		"cne_camera_zoom":
			if event_parameters.size() < 2:
				return
			var should_tween := _event_bool(event_parameters[0], true)
			var zoom_value := float(event_parameters[1])
			var target_name := str(event_parameters[2]).to_lower() if event_parameters.size() > 2 else "camgame"
			var duration_steps := float(event_parameters[3]) if event_parameters.size() > 3 else 4.0
			var ease_base := str(event_parameters[4]) if event_parameters.size() > 4 else "linear"
			var ease_direction := str(event_parameters[5]) if event_parameters.size() > 5 and event_parameters[5] != null else "In"
			var zoom_mode := str(event_parameters[6]).to_lower() if event_parameters.size() > 6 else "direct"
			var multiplicative := _event_bool(event_parameters[7]) if event_parameters.size() > 7 else false
			var stage_node: Variant = host.get("among_stage")
			if zoom_mode == "stage" and stage_node:
				zoom_value *= float(stage_node.get("stage_zoom"))
			var duration := maxf(0.0, duration_steps * GameManager.conductor.seconds_per_step / song_speed)
			var ease_name := ease_base + ("" if ease_base.to_lower() == "linear" else ease_direction)
			if target_name in ["camhud", "hud"]:
				var hud_zoom := Vector2.ONE * zoom_value
				if multiplicative:
					hud_zoom *= ui.target_zoom
				if not should_tween:
					ui.target_zoom = hud_zoom
					ui.scale = hud_zoom
				elif ease_base.to_upper() == "CLASSIC":
					ui.target_zoom = hud_zoom
				else:
					var ease_info: Array = Global.string_to_ease(ease_name)
					var hud_tween := create_tween().set_parallel(true).set_trans(ease_info[0]).set_ease(ease_info[1])
					hud_tween.tween_property(ui, "target_zoom", hud_zoom, duration)
					hud_tween.tween_property(ui, "scale", hud_zoom, duration)
			else:
				var game_zoom := Vector2.ONE * zoom_value
				if multiplicative:
					game_zoom *= camera.target_zoom
				if not should_tween:
					camera.target_zoom = game_zoom
					camera.zoom = game_zoom
				elif ease_base.to_upper() == "CLASSIC":
					camera.target_zoom = game_zoom
				else:
					camera.tween_zoom(game_zoom, duration, ease_name)
		
		"bop_rate", "bop_delay":
			if not event_parameters.is_empty():
				host.bop_rate = maxi(1, int(event_parameters[0]))
		
		"bop_strength":
			if event_parameters.size() > 0:
				camera_bop_strength = Vector2.ONE * float(event_parameters[0])
			if event_parameters.size() > 1:
				ui_bop_strength = Vector2.ONE * float(event_parameters[1])
		
		"set_smoothing", 'lerping':
			if event_parameters.is_empty():
				return
			var raw_smoothing: Variant = event_parameters[0]
			var smoothing: bool = (
				raw_smoothing
				if raw_smoothing is bool
				else str(raw_smoothing).strip_edges().to_lower() in ["true", "1", "yes"]
			)
			ui.zoom_smoothing = smoothing
			camera.zoom_smoothing = smoothing
		
		"scroll_speed":
			if event_parameters.is_empty():
				return
			var tween_time: float = 0.0
			if event_parameters.size() > 1:
				tween_time = Global.string_to_time(str(event_parameters[1]))
			
			scroll_speed = float(event_parameters[0]) * SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "scroll_speed_scale")
			
			for strum in strums:
				var initial_speed: float = strum.get_scroll_speed(0)
				var tween = create_tween()
				tween.tween_method(strum.set_scroll_speed, initial_speed, scroll_speed, tween_time / song_speed)

		"cne_scroll_speed":
			if event_parameters.size() < 2:
				return
			var should_tween := _event_bool(event_parameters[0], true)
			var final_speed := float(event_parameters[1])
			var duration_steps := float(event_parameters[2]) if event_parameters.size() > 2 else 4.0
			var ease_base := str(event_parameters[3]) if event_parameters.size() > 3 else "linear"
			var ease_direction := str(event_parameters[4]) if event_parameters.size() > 4 else "In"
			var multiplicative := _event_bool(event_parameters[5]) if event_parameters.size() > 5 else false
			if multiplicative:
				final_speed *= scroll_speed
			final_speed *= SettingsManager.get_value(SettingsManager.SEC_GAMEPLAY, "scroll_speed_scale")
			var duration := maxf(0.0, duration_steps * GameManager.conductor.seconds_per_step / song_speed)
			var ease_info: Array = Global.string_to_ease(ease_base + ("" if ease_base.to_lower() == "linear" else ease_direction))
			for strum in strums:
				if not should_tween or duration <= 0.0:
					strum.set_scroll_speed(final_speed)
				else:
					var initial_speed: float = strum.get_scroll_speed(0)
					create_tween().set_trans(ease_info[0]).set_ease(ease_info[1]).tween_method(strum.set_scroll_speed, initial_speed, final_speed, duration)
			scroll_speed = final_speed

		"cne_camera_modulo":
			if event_parameters.is_empty():
				return
			var interval := maxi(1, int(event_parameters[0]))
			var beat_type := str(event_parameters[2]).to_upper() if event_parameters.size() > 2 else "BEAT"
			var factor := 1
			match beat_type:
				"MEASURE": factor = GameManager.conductor.numerator * GameManager.conductor.denominator
				"BEAT": factor = GameManager.conductor.denominator
				_: factor = 1
			host.bop_rate = maxi(1, interval * factor)
			host.bop_rate_offset = int(event_parameters[3]) * factor if event_parameters.size() > 3 else 0
			var strength := float(event_parameters[1]) if event_parameters.size() > 1 else 1.0
			camera_bop_strength = Vector2.ONE * 0.015 * strength
			ui_bop_strength = Vector2.ONE * 0.03 * strength
		
		"camera_shake":
			if event_parameters.size() >= 2:
				camera.shake(float(event_parameters[0]), Global.string_to_time(str(event_parameters[1])) / song_speed)
	
	Signals.play_new_event.emit(time, event_name, event_parameters)


static func _event_bool(value: Variant, fallback: bool = false) -> bool:
	if value == null:
		return fallback
	if value is bool:
		return value
	if value is int or value is float:
		return not is_zero_approx(float(value))
	var normalized := str(value).strip_edges().to_lower()
	if normalized in ["true", "1", "yes", "on", "show", "enabled"]:
		return true
	if normalized in ["false", "0", "no", "off", "hide", "disabled", ""]:
		return false
	return fallback


func song_finished():
	Signals.play_song_finished.emit()
	
	if GameManager.freeplay:
		match GameManager.play_mode:
			GameManager.PLAY_MODE.CHARTING:
				Global.change_scene_to(Constants.CHART_EDITOR_SCENE)
			
			GameManager.PLAY_MODE.PRACTICE:
				Global.change_scene_to(Constants.RESULTS_MENU_SCENE)
			
			_:
				GameManager.finished_song(int(score))
				Global.change_scene_to(Constants.RESULTS_MENU_SCENE)
	else:
		GameManager.finished_song(int(score))
		if (GameManager.week_songs.size() == GameManager.current_week_song):
			Global.change_scene_to(next_scene)
		else:
			Global.change_scene_to(GameManager.week_songs[GameManager.current_week_song].scene)

# Strum Util
func note_hit(note: Note, lane: int, hit_time: float, strum_manager: StrumManager):
	if died:
		return
	var playback: AudioStreamPlayback = vocals.get_stream_playback()
	if playback and vocal_tracks.size() == 1:
		playback.set_stream_volume(vocal_tracks[0], linear_to_db(1.0))
	elif playback and vocal_tracks.size() > strum_manager.id:
		playback.set_stream_volume(vocal_tracks[strum_manager.id], linear_to_db(1.0))
	
	# Codename custom-note behavior retained by Among Funk.
	if note.note_type == "instakill":
		health = 100.0 if strum_manager.enemy_slot else 0.0
		if not strum_manager.enemy_slot:
			Signals.play_note_miss.emit(note, lane, strum_manager)
		return
	if note.note_type == "hurt":
		if strum_manager.enemy_slot:
			health += 10.0
		else:
			health -= 10.0
			Signals.play_note_miss.emit(note, lane, strum_manager)
		return
	if note.note_type == "heal" and strum_manager.enemy_slot:
		health -= 12.5
		return

	if !strum_manager.enemy_slot:
		if SettingsManager.get_value(SettingsManager.SEC_PREFERENCES, "hit_sounds"):
			SoundManager.hit.play()
		
		if note.mine:
			Signals.play_note_miss.emit(note, lane, strum_manager)
			return
		
		var rating: String = get_rating(abs(hit_time))
		
		GameManager.tallies[rating] += 1
		GameManager.tallies["total_notes"] += 1
		if note.scoreable:
			score_note(hit_time)
		
		match rating:
			"sick":
				health += Constants.HEALTH_GAIN * note.health_mult
				strum_manager.create_splash(lane, note.splash_animation)
				if note.scoreable:
					add_combo()
			"good":
				health += Constants.HEALTH_GAIN * note.health_mult
				if note.scoreable:
					add_combo()
			"bad":
				health -= Constants.BAD_HIT_HEALTH_PENALTY * note.health_mult
				if note.scoreable:
					reset_combo()
			"shit":
				health -= Constants.BAD_HIT_HEALTH_PENALTY * note.health_mult
				if note.scoreable:
					reset_combo()
			_:
				note_miss(note, lane, strum_manager)


func note_holding(note: Note, lane: int, hold_difference: float, strum_manager: StrumManager):
	if died:
		return
	var playback: AudioStreamPlayback = vocals.get_stream_playback()
	if playback and vocal_tracks.size() > strum_manager.id:
		playback.set_stream_volume(vocal_tracks[strum_manager.id],  linear_to_db(1.0))
	
	if !strum_manager.enemy_slot:
		health += hold_difference * Constants.HOLD_HEALTH_GAIN_PER_SECOND
		
		if note.scoreable:
			score += hold_difference * Constants.HOLD_SCORE_GAIN_PER_SECOND


func note_miss(note: Note, lane: int, strum_manager: StrumManager):
	if died:
		return
	var playback: AudioStreamPlayback = vocals.get_stream_playback()
	if playback and vocal_tracks.size() > strum_manager.id:
		if (note and !note.mine) or !note:
			playback.set_stream_volume(vocal_tracks[strum_manager.id], linear_to_db(0.0))
	
	if !strum_manager.enemy_slot:
		# Ghost tapping
		if not note:
			score -= Constants.SPAM_SCORE_PENALTY
			health -= Constants.SPAM_HEALTH_PENALTY
		elif note.scoreable:
			if note.mine and !note.hit:
				return
			
			score -= Constants.MISS_SCORE_PENALTY
			health -= min(Constants.MISS_BASE_HEALTH_PENALTY + (combo / Constants.COMBO_SLOPE) + (note.length * Constants.HOLD_HEALTH_GAIN_PER_SECOND),
			Constants.MISS_MAX_HEALTH_PENALTY) * note.damage_mult
			reset_combo()
			misses += 1
			
			GameManager.tallies["miss"] = misses
			GameManager.tallies["total_notes"] += 1
			
			Signals.play_combo_break.emit()


func stop_for_game_over() -> void:
	# Death is a terminal state for this PlayState. Freeze every producer before
	# stopping audio so a sustain cannot emit another holding callback afterward.
	died = true
	song_starting = false
	for strum_manager in strums:
		if is_instance_valid(strum_manager) and strum_manager.has_method(&"stop_for_game_over"):
			strum_manager.stop_for_game_over(true)
	if is_instance_valid(instrumental):
		instrumental.stop()
	if is_instance_valid(vocals):
		vocals.stop()


func add_combo():
	combo += 1
	if combo > GameManager.tallies["max_combo"]:
		GameManager.tallies["max_combo"] = combo


func reset_combo():
	combo = 0
