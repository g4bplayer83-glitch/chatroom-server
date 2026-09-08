extends AmongFunkMenuBase


func _ready() -> void:
	if not GameManager.freeplay:
		AmongFunkManager.mark_week1_complete()
	var menu_items: Array[Dictionary] = []
	if GameManager.freeplay:
		menu_items.append({"label": "RETRY", "action": "retry", "description": "Replay the current song and difficulty."})
	menu_items.append({"label": "CONTINUE", "action": "continue", "description": "Return to song selection."})
	setup_menu("RESULTS", menu_items)
	var grade := GameManager.get_grade(GameManager.tallies)
	var rank := GameManager.get_rank(grade).to_upper()
	var accuracy := grade * 100.0
	if grade > 1.0:
		accuracy = 100.0
	detail_label.text = "SCORE  %s\nMISSES  %s\nMAX COMBO  %s\nRANK  %s  •  %.2f%%" % [
		Global.format_number(GameManager.score),
		str(GameManager.tallies.get("miss", 0)),
		str(GameManager.tallies.get("max_combo", 0)),
		rank,
		accuracy
	]


func activate(action: String, _item: Dictionary) -> void:
	if action == "retry" and GameManager.current_song:
		GameManager.reset_stats()
		SoundManager.music.stop()
		Global.change_scene_to(GameManager.current_song.scene, &"fade", true)
	elif action == "continue":
		_return_to_selection()
	else:
		locked = false


func cancel() -> void:
	_return_to_selection()


func _return_to_selection() -> void:
	var target := Constants.FREEPLAY_MENU_SCENE if GameManager.freeplay else Constants.STORY_MODE_MENU_SCENE
	GameManager.reset_stats()
	GameManager.freeplay = true
	SoundManager.cancel.play()
	Global.change_scene_to(target, &"fade")
