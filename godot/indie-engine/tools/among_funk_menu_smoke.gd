extends Node

const SCENES: Array[String] = [
	"res://among_funk/scenes/title_menu.tscn",
	"res://among_funk/scenes/main_menu.tscn",
	"res://among_funk/scenes/story_menu.tscn",
	"res://among_funk/scenes/freeplay_menu.tscn",
	"res://among_funk/scenes/options_menu.tscn",
	"res://among_funk/scenes/credits_menu.tscn",
	"res://among_funk/scenes/gallery_menu.tscn",
	"res://among_funk/scenes/results_menu.tscn",
	"res://among_funk/scenes/developer_menu.tscn",
	"res://among_funk/scenes/character_viewer.tscn",
	"res://among_funk/scenes/stage_viewer.tscn"
]


func _ready() -> void:
	call_deferred(&"_run")


func _run() -> void:
	for _frame in 4:
		await get_tree().process_frame
	GameManager.current_song = AmongFunkManager.get_song("Sabotage")
	GameManager.difficulty = "hard"
	GameManager.freeplay = true
	var capture_directory := _argument_value("--capture-dir")
	if not capture_directory.is_empty():
		DirAccess.make_dir_recursive_absolute(capture_directory)
	for path in SCENES:
		var packed: PackedScene = load(path)
		if not packed:
			push_error("[AMONG_FUNK_MENU_SMOKE] Missing scene: " + path)
			get_tree().quit(1)
			return
		var instance := packed.instantiate()
		add_child(instance)
		for _frame in 4:
			await get_tree().process_frame
		if not capture_directory.is_empty():
			RenderingServer.force_draw(false, 0.0)
			var screenshot := get_viewport().get_texture().get_image()
			if screenshot:
				screenshot.save_png(capture_directory.path_join(path.get_file().get_basename() + ".png"))
		print("[AMONG_FUNK_MENU_SMOKE] OK " + path)
		instance.queue_free()
		for _frame in 2:
			await get_tree().process_frame
	var pause_scene: PackedScene = load("res://among_funk/scenes/among_pause.tscn")
	var pause := pause_scene.instantiate()
	add_child(pause)
	for _frame in 4:
		await get_tree().process_frame
	print("[AMONG_FUNK_MENU_SMOKE] OK pause")
	pause.queue_free()
	print("[AMONG_FUNK_MENU_SMOKE] scenes=%d failures=0" % (SCENES.size() + 1))
	get_tree().quit(0)


func _argument_value(name: String) -> String:
	var arguments := OS.get_cmdline_user_args()
	for index in arguments.size():
		if arguments[index] == name and index + 1 < arguments.size():
			return arguments[index + 1]
		if arguments[index].begins_with(name + "="):
			return arguments[index].trim_prefix(name + "=")
	return ""
