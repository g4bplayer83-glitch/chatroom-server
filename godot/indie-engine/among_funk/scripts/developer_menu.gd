extends AmongFunkMenuBase


func _ready() -> void:
	setup_menu("DEVELOPER TOOLS", [
		{"label": "CHART EDITOR", "action": "chart", "description": "Open NoahEngine's chart editor. Codename charts remain available as JSON."},
		{"label": "EVENT EDITOR", "action": "events", "description": "Open the chart editor directly in event mode."},
		{"label": "CHARACTER EDITOR", "action": "characters", "description": "Edit sprites, animations, offsets, camera, scale and save Codename character XML."},
		{"label": "STAGE EDITOR", "action": "stages", "description": "Move, resize, rotate, add and save stage objects and characters."},
		{"label": "BACK", "action": "back", "description": "Return to the main menu."}
	])


func activate(action: String, _item: Dictionary) -> void:
	match action:
		"chart":
			ChartManager.event_editor = false
			Global.change_scene_to(Constants.CHART_EDITOR_SCENE, &"fade")
		"events":
			ChartManager.event_editor = true
			Global.change_scene_to(Constants.CHART_EDITOR_SCENE, &"fade")
		"characters": Global.change_scene_to(Constants.CHARACTER_EDITOR_SCENE, &"fade")
		"stages": Global.change_scene_to(Constants.STAGE_EDITOR_SCENE, &"fade")
		"back": cancel()
		_: locked = false
