extends Note
## This note type is better for performance however the sustain isn't friendly
## for modcharts.
class_name BasicNote

const PIXELS_PER_SECOND = 450
const HURT_NOTE_FRAMES: SpriteFrames = preload("res://noah/assets/custom_note/hurt_notes.tres")

@onready var note: OffsetSprite = $Note
@onready var tail = $Tail
@onready var end = null

var start_length: float = 0.0
var can_press: bool = false
var time_difference: float = INF
var on_screen: bool = false
var holding: bool = false

var no_animation: bool = false
var damage_mult: float = 1.0
var health_mult: float = 1.0
var anim_prefix: String = ''
var splash_animation: StringName = &""
var scoreable: bool = true
var mine: bool = false
var hit: bool = false

# Applying Note Skin
func _ready() -> void: 
	end = $Tail/End
	note.sprite_frames = HURT_NOTE_FRAMES if note_type == "hurt" else note_skin.notes_texture
	if note_skin.animation_names != null: 
		if note_skin.animation_names.keys().size() > 0: 
			note.animation_names.merge(note_skin.animation_names, true)
	
	note.play_animation(animation)
	
	var tail_animation = note.get_animation_name(animation + &"_tail")
	if tail_animation and tail:
		tail.texture = note_skin.notes_texture.get_frame_texture(tail_animation, 0)
		if tail.texture:
			# The sustain texture is authored vertically (50 px wide). Tail is
			# rotated 90 degrees, so its Control height becomes the visible width.
			tail.size.y = tail.texture.get_width()
	
	var end_animation = note.get_animation_name(animation + &"_end")
	if end_animation and end:
		end.texture = note_skin.notes_texture.get_frame_texture(end_animation, 0)
		if end.texture:
			# Transpose the cap before the parent rotation: 64 px along the hold,
			# the same 50 px cross-width as the body.
			end.size = Vector2(end.texture.get_height(), end.texture.get_width())
	
	note.offsets = note_skin.offsets
	
	if note_skin.pixel_texture: 
		note.texture_filter = TEXTURE_FILTER_NEAREST
		tail.texture_filter = TEXTURE_FILTER_NEAREST
	
	note.scale = Vector2.ONE * note_skin.notes_scale
	
	if tail:
		tail.scale = Vector2.ONE * note_skin.notes_scale
		var body_width: float = tail.size.y if tail.size.y > 0.0 else 1.0
		tail.position.x = body_width * tail.scale.y * 0.5
		tail.modulate.a = note_skin.sustain_opacity
	
	load_basic_type()

# Called every frame. 'delta' is the elapsed time since the previous frame.
func _process(delta) -> void:
	time_difference = time - GameManager.song_position
	
	if length > 0:
		var line_length: float = length * scroll_speed * grid_size.y
		tail.visible = true
		tail.scale.x = scroll
		tail.size.x = maxf(absf(line_length), 1.0)
		if end and end.texture:
			end.position.x = maxf(tail.size.x - end.size.x, 0.0)
	else:
		tail.visible = false


func update():
	if !holding:
		position.y = PIXELS_PER_SECOND * time_difference * scroll_speed * scroll
		var grid_scaler = PIXELS_PER_SECOND * GameManager.seconds_per_beat
		grid_size.y = grid_scaler
	else:
		position.y = 0


func load_basic_type():
	match note_type:
		"no_animation":
			no_animation = true
		"alt_prefix":
			anim_prefix = 'alt_'
		"hurt":
			mine = true
			damage_mult = 1.4
			scoreable = false
			anim_prefix = "miss_"
			note.modulate = Color.WHITE
		"heal":
			health_mult = 12.5
			damage_mult = 0.0
			scoreable = false
			note.modulate = Color(0.35, 1.5, 0.55)
		"ghost":
			health_mult = 0.0
			damage_mult = 0.0
			scoreable = false
			no_animation = true
			note.modulate.a = 0.35
		"instakill":
			health_mult = 0.0
			scoreable = false
			anim_prefix = "miss_"
			note.modulate = Color(0.35, 0.0, 0.0)
		"hey":
			no_animation = true
