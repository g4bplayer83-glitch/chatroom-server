extends AnimationPlayer

@onready var audio: AudioStreamPlayer = $AudioStreamPlayer

var last_step := -1


func _process(_delta: float) -> void:
	if current_animation != &"countdown":
		return
	var step := floori(current_animation_position)
	if step == last_step or step < 0 or step > 3:
		return
	last_step = step
	var sound_name: String = ["3", "2", "1", "go"][step]
	var sound_path := "res://among_funk/codename/sounds/%s.ogg" % sound_name
	audio.stream = SoundManager.get_stream(sound_path) if ResourceLoader.exists(sound_path) else null
	if audio.stream:
		audio.play()
