extends Node

const CATALOG_PATH := "res://among_funk/data/catalog.json"
const STORY_WEEK_PATH := "res://among_funk/data/week_among_funk.tres"
const MENU_MUSIC := "res://among_funk/codename/music/freakyMenu.ogg"
const OPTIONS_MUSIC := "res://among_funk/codename/music/optionsTheme.ogg"
const PAUSE_MUSIC := "res://among_funk/codename/music/amongPause.ogg"
const PROGRESS_PATH := "user://among_funk_progress.cfg"

var catalog: Dictionary = {}
var intro_seen := false
var requested_freeplay_week := 0
var progress := ConfigFile.new()

var character_aliases: Dictionary = {
	"dad": "RedCrew",
	"red": "RedCrew",
	"redcrew": "RedCrew",
	"red crewmate": "RedCrewmate",
	"redcrewmate": "RedCrewmate",
	"moogusred": "Moogusred",
	"moogus red": "Moogusred",
	"gf": "gf",
	"girlfriend": "gf",
	"gf ghost": "gf-ghost"
}
var stage_aliases: Dictionary = {
	"stage": "Polus",
	"polus": "Polus"
}


func _ready() -> void:
	catalog = read_json(CATALOG_PATH)
	progress.load(PROGRESS_PATH)
	call_deferred("_configure_audio")


func _configure_audio() -> void:
	_set_sound_stream(SoundManager.scroll, "res://among_funk/codename/sounds/scrollMenu.ogg")
	_set_sound_stream(SoundManager.cancel, "res://among_funk/codename/sounds/cancelMenu.ogg")
	_set_sound_stream(SoundManager.accept, "res://among_funk/codename/sounds/confirmMenu.ogg")
	_set_sound_stream(SoundManager.miss, "res://noah/tools/sounds/hit.ogg")
	_set_sound_stream(SoundManager.anti_spam, "res://noah/tools/sounds/hit.ogg")
	_set_sound_stream(SoundManager.hit, "res://noah/tools/sounds/hit.ogg")


func _set_sound_stream(player: AudioStreamPlayer, path: String) -> void:
	if is_instance_valid(player) and ResourceLoader.exists(path):
		player.stream = SoundManager.get_stream(path)


func read_json(path: String) -> Dictionary:
	var imported: Resource = ResourceLoader.load(path)
	if imported is JSON:
		var imported_data: Variant = (imported as JSON).data
		if imported_data is Dictionary:
			return imported_data
	var file := FileAccess.open(path, FileAccess.READ)
	if not file:
		push_error("(Among Funk) Could not open JSON: %s" % path)
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if parsed is Dictionary:
		return parsed
	push_error("(Among Funk) Invalid JSON object: %s" % path)
	return {}


func get_songs() -> Array:
	return catalog.get("songs", [])


func get_story_ids() -> Array:
	return catalog.get("story_order", [])


func get_song_info(song_id: String) -> Dictionary:
	for raw_item in get_songs():
		if raw_item is Dictionary:
			var item: Dictionary = raw_item
			if str(item.get("id", "")).nocasecmp_to(song_id) == 0:
				return item
	return {}


func get_song(song_id: String) -> Song:
	var info := get_song_info(song_id)
	if info.is_empty():
		return null
	var resource: Resource = ResourceLoader.load(str(info.get("resource", "")))
	return resource as Song if resource is Song else null


func get_current_info() -> Dictionary:
	var song := GameManager.get_current_song()
	if song and not song.id.is_empty():
		return get_song_info(song.id)
	return {}


func difficulty_names(info: Dictionary) -> Array[String]:
	var output: Array[String] = []
	for raw_difficulty in info.get("difficulties", []):
		if raw_difficulty is Dictionary:
			output.append(str(raw_difficulty.get("name", "hard")))
	return output


func start_freeplay(song_id: String, difficulty: String = "") -> void:
	var info := get_song_info(song_id)
	var song := get_song(song_id)
	if not song or info.is_empty():
		push_error("(Among Funk) Cannot start missing song: %s" % song_id)
		return
	var available := difficulty_names(info)
	if difficulty.is_empty() or not available.has(difficulty):
		difficulty = available[0] if not available.is_empty() else "hard"
	GameManager.reset_stats()
	GameManager.freeplay = true
	GameManager.play_mode = GameManager.PLAY_MODE.FREEPLAY
	GameManager.current_song = song
	GameManager.difficulty = difficulty
	GameManager.song_scene = Constants.FREEPLAY_MENU_SCENE
	SoundManager.music.stop()
	Global.change_scene_to(song.scene, &"fade", true)


func start_story(already_faded: bool = false) -> void:
	var week: Resource = ResourceLoader.load(STORY_WEEK_PATH)
	if week is not Week or week.song_list.is_empty():
		push_error("(Among Funk) Story week could not be loaded.")
		return
	GameManager.reset_stats()
	GameManager.start_week(week)
	GameManager.current_song = week.song_list[0]
	GameManager.difficulty = "hard"
	GameManager.song_scene = Constants.STORY_MODE_MENU_SCENE
	SoundManager.music.stop()
	if already_faded:
		Global.change_scene_to(week.song_list[0].scene, null)
	else:
		Global.change_scene_to(week.song_list[0].scene, &"fade", true)


func play_menu_music(path: String = MENU_MUSIC) -> void:
	if not ResourceLoader.exists(path):
		return
	var needs_change := SoundManager.music.stream == null
	if SoundManager.music.stream and SoundManager.music.stream.resource_path != path:
		needs_change = true
	if needs_change:
		var stream := SoundManager.get_stream(path)
		if stream is AudioStreamOggVorbis:
			(stream as AudioStreamOggVorbis).loop = true
		elif stream is AudioStreamMP3:
			(stream as AudioStreamMP3).loop = true
		SoundManager.play_music(stream)
	elif not SoundManager.music.playing:
		SoundManager.music.play()


func mark_week1_complete() -> void:
	if not is_week1_complete():
		progress.set_value("progress", "week2_unlock_pending", true)
	progress.set_value("progress", "week1_completed", true)
	progress.save(PROGRESS_PATH)


func consume_week2_unlock() -> bool:
	var pending := bool(progress.get_value("progress", "week2_unlock_pending", false))
	if pending:
		progress.set_value("progress", "week2_unlock_pending", false)
		progress.save(PROGRESS_PATH)
	return pending


func reset_week1_progress() -> void:
	progress.set_value("progress", "week1_completed", false)
	progress.set_value("progress", "week2_unlock_pending", false)
	progress.save(PROGRESS_PATH)


func is_mobile() -> bool:
	return OS.has_feature("android") or OS.has_feature("ios") or bool(ProjectSettings.get_setting("among_funk/mobile/force_touch_controls", false))


func has_seen_intro() -> bool:
	return bool(progress.get_value("progress", "intro_played", false))


func mark_intro_seen() -> void:
	intro_seen = true
	progress.set_value("progress", "intro_played", true)
	progress.save(PROGRESS_PATH)


func is_week1_complete() -> bool:
	return bool(progress.get_value("progress", "week1_completed", false))


func has_seen_cutscene(song_id: String) -> bool:
	return bool(progress.get_value("cutscenes", song_id.to_lower(), false))


func mark_cutscene_seen(song_id: String) -> void:
	progress.set_value("cutscenes", song_id.to_lower(), true)
	progress.save(PROGRESS_PATH)


func get_highscore(song_id: String, difficulty: String) -> int:
	var song := get_song(song_id)
	return SaveManager.get_highscore(song, difficulty) if song else 0


func resolve_character_id(requested: String) -> String:
	var key := requested.strip_edges().to_lower()
	return str(character_aliases.get(key, requested))


func resolve_character_config(requested: String) -> String:
	return resolve_named_file(
		"res://among_funk/codename/data/characters",
		resolve_character_id(requested),
		["xml"]
	)


func resolve_stage_config(requested: String) -> String:
	var resolved := str(stage_aliases.get(requested.strip_edges().to_lower(), requested))
	return resolve_named_file("res://among_funk/codename/data/stages", resolved, ["xml"])


func resolve_image(relative_without_extension: String) -> String:
	return resolve_named_file(
		"res://among_funk/codename/images",
		relative_without_extension,
		["png", "jpg", "jpeg", "webp"]
	)


func resolve_named_file(base_dir: String, relative: String, extensions: Array) -> String:
	var normalized := relative.replace("\\", "/").trim_prefix("/")
	var explicit_extension := normalized.get_extension()
	var candidates: Array[String] = []
	if not explicit_extension.is_empty():
		candidates.append(normalized)
	else:
		for extension in extensions:
			candidates.append(normalized + "." + str(extension))
	for candidate in candidates:
		var resolved := _resolve_case_insensitive(base_dir, candidate)
		if not resolved.is_empty():
			return resolved
		var exact := base_dir.path_join(candidate)
		if FileAccess.file_exists(exact):
			return exact
	return ""


func _resolve_case_insensitive(base_dir: String, relative_file: String) -> String:
	var current := base_dir
	var parts := relative_file.split("/", false)
	for index in parts.size():
		var wanted := str(parts[index])
		var last := index == parts.size() - 1
		var directory := DirAccess.open(current)
		if not directory:
			return ""
		var entries: PackedStringArray = directory.get_files() if last else directory.get_directories()
		var matched := ""
		for entry in entries:
			if entry.nocasecmp_to(wanted) == 0:
				matched = entry
				break
		if matched.is_empty():
			return ""
		current = current.path_join(matched)
	return current


func color_from_value(value: Variant, fallback: Color = Color.WHITE) -> Color:
	if value is Color:
		return value
	if value is int or value is float:
		var raw: int = int(value) & 0xffffffff
		return Color.from_rgba8((raw >> 16) & 255, (raw >> 8) & 255, raw & 255, (raw >> 24) & 255)
	var text := str(value).strip_edges()
	if text.begins_with("0x"):
		text = "#" + text.trim_prefix("0x")
	return Color.from_string(text, fallback)


func bool_from_value(value: Variant, fallback: bool = false) -> bool:
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


func number_from_value(value: Variant, fallback: float = 0.0) -> float:
	if value == null:
		return fallback
	if value is int or value is float:
		return float(value)
	var text := str(value).strip_edges()
	return text.to_float() if text.is_valid_float() else fallback
