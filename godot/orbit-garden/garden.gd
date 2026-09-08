extends Node3D
## Petit jeu complet sans assets externes. Clavier et commandes tactiles.

var player: CharacterBody3D
var camera: Camera3D
var crystals: Array[Node3D] = []
var score := 0
var elapsed := 0.0
var finished := false
var hud: Label
var hint: Label
var touch := Vector2.ZERO
var best := 0.0
var best_label: Label
var crystal_positions: Array[Vector3] = [Vector3(-7, 0, -6), Vector3(5, 0, -7), Vector3(8, 0, 1), Vector3(5, 0, 7), Vector3(-5, 0, 7), Vector3(-8, 0, 1), Vector3(0, 0, -3), Vector3(2, 0, 3)]

func material(color: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = 0.75
	return m

func block(size: Vector3, at: Vector3, color: Color, collision: bool = true) -> Node3D:
	var root: Node3D = StaticBody3D.new() if collision else Node3D.new()
	add_child(root)
	root.position = at
	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = size
	mesh.mesh = box
	mesh.material_override = material(color)
	root.add_child(mesh)
	if collision:
		var shape := CollisionShape3D.new()
		var box_shape := BoxShape3D.new()
		box_shape.size = size
		shape.shape = box_shape
		root.add_child(shape)
	return root

func _ready() -> void:
	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("111524")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("b5b8ef")
	env.ambient_light_energy = 0.7
	environment.environment = env
	add_child(environment)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -30, 0)
	light.light_color = Color("e9dcff")
	light.light_energy = 1.2
	add_child(light)
	block(Vector3(23, 1, 23), Vector3(0, -0.5, 0), Color("293b47"))
	for x in [-12, 12]:
		block(Vector3(1, 2, 25), Vector3(x, 0.5, 0), Color("494776"))
		block(Vector3(25, 2, 1), Vector3(0, 0.5, x), Color("494776"))
	for at in [Vector3(-4, 0, -4), Vector3(4, 0, -4), Vector3(-4, 0, 4), Vector3(6, 0, 4)]:
		block(Vector3(0.6, 2, 0.6), at + Vector3(0, 1, 0), Color("665b70"))
		var crown := block(Vector3(2.5, 2.5, 2.5), at + Vector3(0, 3, 0), Color("407a70"), false)
		crown.rotation.y = PI / 4
	player = CharacterBody3D.new()
	add_child(player)
	var player_mesh := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.35
	capsule.height = 1.2
	player_mesh.mesh = capsule
	player_mesh.material_override = material(Color("aba1ff"))
	player_mesh.position.y = 0.6
	player.add_child(player_mesh)
	var collider := CollisionShape3D.new()
	var capsule_shape := CapsuleShape3D.new()
	capsule_shape.radius = 0.35
	capsule_shape.height = 1.2
	collider.shape = capsule_shape
	collider.position.y = 0.6
	player.add_child(collider)
	camera = Camera3D.new()
	add_child(camera)
	camera.position = Vector3(0, 17, 15)
	camera.look_at(Vector3.ZERO)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 27
	var layer := CanvasLayer.new()
	add_child(layer)
	var ui := Control.new()
	ui.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	ui.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(ui)
	hud = Label.new()
	hud.position = Vector2(24, 20)
	hud.add_theme_font_size_override("font_size", 24)
	ui.add_child(hud)
	hint = Label.new()
	hint.position = Vector2(24, 58)
	hint.text = "Récolte les 8 cristaux · Flèches / ZQSD / WASD"
	hint.add_theme_font_size_override("font_size", 15)
	ui.add_child(hint)
	var restart := Button.new()
	restart.text = "Rejouer"
	restart.focus_mode = Control.FOCUS_NONE
	restart.position = Vector2(815, 20)
	restart.size = Vector2(120, 45)
	restart.pressed.connect(reset_game)
	ui.add_child(restart)
	add_touch(ui, "↑", Vector2(85, 495), Vector2.UP)
	add_touch(ui, "←", Vector2(20, 560), Vector2.LEFT)
	add_touch(ui, "↓", Vector2(85, 560), Vector2.DOWN)
	add_touch(ui, "→", Vector2(150, 560), Vector2.RIGHT)
	for x in range(-9, 10, 3):
		for z in range(-9, 10, 3):
			block(Vector3(0.8, 0.025, 0.8), Vector3(x, 0.025, z), Color("3b535b"), false)
	for i in range(20):
		var flower_at := Vector3(sin(i * 8.13) * 10, 0.2, cos(i * 4.31) * 10)
		block(Vector3(0.15, 0.4, 0.15), flower_at, Color("548f73"), false)
		block(Vector3(0.4, 0.2, 0.4), flower_at + Vector3(0, 0.3, 0), Color("c69bdd"), false)
	var saved := ConfigFile.new()
	if saved.load("user://orbit-best.cfg") == OK:
		best = float(saved.get_value("score", "best", 0))
	best_label = Label.new()
	best_label.position = Vector2(24, 82)
	best_label.add_theme_font_size_override("font_size", 14)
	ui.add_child(best_label)
	reset_game()

func add_touch(ui: Control, title: String, at: Vector2, direction: Vector2) -> void:
	var b := Button.new()
	b.text = title
	b.focus_mode = Control.FOCUS_NONE
	b.position = at
	b.size = Vector2(60, 55)
	b.add_theme_font_size_override("font_size", 25)
	b.button_down.connect(func(): touch = direction)
	b.button_up.connect(func(): touch = Vector2.ZERO)
	ui.add_child(b)

func reset_game() -> void:
	for crystal in crystals:
		if is_instance_valid(crystal):
			crystal.queue_free()
	crystals.clear()
	for at in crystal_positions:
		var crystal := block(Vector3(0.7, 0.7, 0.7), at + Vector3(0, 1, 0), Color("72efd2"), false)
		crystal.rotation.z = PI / 4
		crystals.append(crystal)
	player.position = Vector3(0, 0.1, 0)
	player.velocity = Vector3.ZERO
	score = 0
	elapsed = 0.0
	finished = false
	if best_label:
		best_label.text = "Meilleur temps : %.1f s" % best if best > 0 else "Un petit jardin, ton prochain record."
	touch = Vector2.ZERO
	hint.text = "Récolte les 8 cristaux · Flèches / ZQSD / WASD"

func _physics_process(delta: float) -> void:
	if not finished:
		elapsed += delta
	var direction := touch
	if Input.is_physical_key_pressed(KEY_LEFT) or Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_Q):
		direction.x -= 1
	if Input.is_physical_key_pressed(KEY_RIGHT) or Input.is_physical_key_pressed(KEY_D):
		direction.x += 1
	if Input.is_physical_key_pressed(KEY_UP) or Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_Z):
		direction.y -= 1
	if Input.is_physical_key_pressed(KEY_DOWN) or Input.is_physical_key_pressed(KEY_S):
		direction.y += 1
	direction = direction.normalized()
	player.velocity = Vector3(direction.x * 5, -2, direction.y * 5)
	player.move_and_slide()
	for crystal in crystals:
		if not crystal.visible:
			continue
		crystal.rotate_y(delta)
		crystal.position.y = 1.1 + sin(elapsed * 2 + crystal.position.x) * 0.2
		if Vector2(player.position.x, player.position.z).distance_to(Vector2(crystal.position.x, crystal.position.z)) < 0.8:
			crystal.hide()
			score += 1
			if score == 8:
				finished = true
				if best <= 0.0 or elapsed < best:
					best = elapsed
					var saved := ConfigFile.new()
					saved.set_value("score", "best", best)
					saved.save("user://orbit-best.cfg")
					best_label.text = "Nouveau record : %.1f s" % best
				hint.text = "Le jardin brille à nouveau ! Rejoue pour améliorer ton temps."
	hud.text = "ORBIT GARDEN     %d / 8     %02d:%02d" % [score, int(elapsed) / 60, int(elapsed) % 60]

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		touch = Vector2.ZERO
