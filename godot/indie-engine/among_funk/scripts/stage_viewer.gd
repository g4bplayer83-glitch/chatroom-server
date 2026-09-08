extends Node2D

const STAGES_DIR := "res://among_funk/codename/data/stages"
const CHARACTERS_DIR := "res://among_funk/codename/data/characters"
const IMAGES_DIR := "res://among_funk/codename/images"
const GIZMO_SCRIPT := preload("res://among_funk/scripts/stage_transform_gizmo.gd")
const PANEL_X := 900.0
const REQUIRED_ROLES: Array[String] = ["dad", "boyfriend", "girlfriend"]
const DEFAULT_CHARACTER := {"dad": "RedCrew", "boyfriend": "bf", "girlfriend": "gf"}

var stage_ids: Array[String] = []
var character_ids: Array[String] = []
var elements: Array[Dictionary] = []
var root_attributes: Dictionary = {}
var visuals: Dictionary = {}
var guides: Dictionary = {}
var next_uid := 1
var current_stage_id := ""
var selected_uid := -1
var dirty := false
var loading_ui := false
var dragging := false
var panning := false
var drag_world := Vector2.ZERO
var drag_position := Vector2.ZERO
var selection_locked := false
var transform_mode := ""
var transform_center := Vector2.ZERO
var transform_axis_x := Vector2.RIGHT
var transform_axis_y := Vector2.DOWN
var transform_half_size := Vector2.ONE
var transform_start_scale := Vector2.ONE
var transform_start_angle := 0.0
var transform_start_mouse_angle := 0.0

var stage: CNEStage
var editor_camera: Camera2D
var main_guide: Node2D
var transform_gizmo: Node2D
var stage_select: OptionButton
var element_tree: Tree
var title_label: Label
var selection_label: Label
var status_label: Label
var folder_edit: LineEdit
var sprite_edit: LineEdit
var sprite_select: OptionButton
var role_select: OptionButton
var add_character_select: OptionButton
var selected_character_select: OptionButton
var name_edit: LineEdit
var flip_check: CheckBox
var visible_check: CheckBox
var fields: Dictionary = {}
var stage_fields: Dictionary = {}


func _ready() -> void:
	AmongFunkManager.play_menu_music()
	_collect_files()
	stage = CNEStage.new()
	add_child(stage)
	editor_camera = Camera2D.new()
	editor_camera.position = Vector2(640.0, 360.0)
	add_child(editor_camera)
	main_guide = _camera_guide(Color(1.0, 0.25, 0.25), "MAIN CAM")
	add_child(main_guide)
	transform_gizmo = GIZMO_SCRIPT.new()
	transform_gizmo.z_index = 4092
	add_child(transform_gizmo)
	_build_ui()
	if stage_ids.is_empty():
		_status("Aucun stage XML trouvé.", true)
	else:
		load_stage(stage_ids[0])


func _process(_delta: float) -> void:
	_update_transform_gizmo()


func _collect_files() -> void:
	for file_name: String in DirAccess.get_files_at(STAGES_DIR):
		if file_name.get_extension().to_lower() == "xml": stage_ids.append(file_name.get_basename())
	stage_ids.sort_custom(func(a: String, b: String) -> bool: return a.to_lower() < b.to_lower())
	for file_name: String in DirAccess.get_files_at(CHARACTERS_DIR):
		if file_name.get_extension().to_lower() == "xml": character_ids.append(file_name.get_basename())
	character_ids.sort_custom(func(a: String, b: String) -> bool: return a.to_lower() < b.to_lower())


func _build_ui() -> void:
	var canvas := CanvasLayer.new()
	canvas.layer = 100
	add_child(canvas)
	var top := _panel(Vector2.ZERO, Vector2(PANEL_X, 62.0))
	canvas.add_child(top)
	title_label = _label("STAGE EDITOR", Vector2(14, 10), Vector2(200, 40), 25, Color(0.3, 1, 1))
	top.add_child(title_label)
	stage_select = OptionButton.new()
	stage_select.position = Vector2(210, 12); stage_select.size = Vector2(300, 38)
	for id: String in stage_ids: stage_select.add_item(id)
	stage_select.item_selected.connect(_stage_selected)
	top.add_child(stage_select)
	top.add_child(_button("SAVE", Vector2(520, 12), Vector2(90, 38), _save_stage))
	top.add_child(_button("<", Vector2(618, 12), Vector2(44, 38), _previous_stage))
	top.add_child(_button(">", Vector2(668, 12), Vector2(44, 38), _next_stage))
	top.add_child(_button("RESET CAM", Vector2(720, 12), Vector2(165, 38), _reset_camera))

	var side := _panel(Vector2(PANEL_X, 0), Vector2(380, 720))
	canvas.add_child(side)
	side.add_child(_label("ELEMENTS", Vector2(14, 8), Vector2(350, 32), 22, Color(0.4, 0.95, 1)))
	element_tree = Tree.new()
	element_tree.position = Vector2(12, 45); element_tree.size = Vector2(356, 205)
	element_tree.columns = 2; element_tree.hide_root = true; element_tree.column_titles_visible = true
	element_tree.set_column_title(0, "ELEMENT"); element_tree.set_column_title(1, "POSITION")
	element_tree.set_column_custom_minimum_width(1, 105)
	element_tree.item_selected.connect(_tree_selected)
	side.add_child(element_tree)
	side.add_child(_button("UP", Vector2(12, 257), Vector2(58, 31), _move_up))
	side.add_child(_button("DOWN", Vector2(75, 257), Vector2(67, 31), _move_down))
	side.add_child(_button("DELETE", Vector2(147, 257), Vector2(78, 31), _delete_selected))
	side.add_child(_button("FOCUS", Vector2(230, 257), Vector2(75, 31), _focus_selected))

	selection_label = _label("NO SELECTION", Vector2(14, 294), Vector2(350, 27), 17, Color(1, 0.85, 0.3))
	side.add_child(selection_label)
	side.add_child(_label("NAME", Vector2(14, 327), Vector2(76, 27), 14))
	name_edit = _edit(Vector2(90, 324), Vector2(275, 30), "name")
	name_edit.text_changed.connect(_name_changed); side.add_child(name_edit)
	var specs: Array[Dictionary] = [
		{"k":"x","l":"X","p":Vector2(14,362),"s":1.0}, {"k":"y","l":"Y","p":Vector2(194,362),"s":1.0},
		{"k":"scalex","l":"SCALE X","p":Vector2(14,398),"s":0.01}, {"k":"scaley","l":"SCALE Y","p":Vector2(194,398),"s":0.01},
		{"k":"angle","l":"ANGLE","p":Vector2(14,434),"s":0.1}, {"k":"alpha","l":"ALPHA","p":Vector2(194,434),"s":0.01},
		{"k":"camxoffset","l":"CAM X","p":Vector2(14,470),"s":1.0}, {"k":"camyoffset","l":"CAM Y","p":Vector2(194,470),"s":1.0}
	]
	for spec: Dictionary in specs:
		var key := str(spec["k"]); var pos := Vector2(spec["p"])
		side.add_child(_label(str(spec["l"]), pos, Vector2(70, 27), 12))
		var spin := _spin(pos + Vector2(70, -2), Vector2(94, 29), float(spec["s"]))
		spin.value_changed.connect(_property_changed.bind(key)); fields[key] = spin; side.add_child(spin)
	flip_check = CheckBox.new(); flip_check.text = "FLIP X"; flip_check.position = Vector2(14, 503)
	flip_check.toggled.connect(_flip_changed); side.add_child(flip_check)
	visible_check = CheckBox.new(); visible_check.text = "VISIBLE"; visible_check.position = Vector2(105, 503)
	visible_check.toggled.connect(_visible_changed); side.add_child(visible_check)
	selected_character_select = OptionButton.new(); selected_character_select.position = Vector2(205, 504); selected_character_select.size = Vector2(160, 30)
	for id: String in character_ids: selected_character_select.add_item(id)
	selected_character_select.item_selected.connect(_preview_character_changed); side.add_child(selected_character_select)

	role_select = OptionButton.new(); role_select.position = Vector2(12, 546); role_select.size = Vector2(123, 31)
	for role: String in ["DAD", "BOYFRIEND", "GIRLFRIEND", "EXTRA"]: role_select.add_item(role)
	side.add_child(role_select)
	add_character_select = OptionButton.new(); add_character_select.position = Vector2(140, 546); add_character_select.size = Vector2(145, 31)
	for id: String in character_ids: add_character_select.add_item(id)
	side.add_child(add_character_select); side.add_child(_button("+ CHAR", Vector2(290,546), Vector2(77,31), _add_character))
	sprite_select = OptionButton.new(); sprite_select.position = Vector2(12,584); sprite_select.size = Vector2(123,31)
	sprite_select.item_selected.connect(_sprite_asset_selected); side.add_child(sprite_select)
	sprite_edit = _edit(Vector2(140,584), Vector2(145,31), "image id"); side.add_child(sprite_edit)
	side.add_child(_button("+ SPRITE", Vector2(290,584), Vector2(77,31), _add_sprite))

	var stage_box := _panel(Vector2(12, 625), Vector2(356, 82), Color(0.08,0.025,0.12,0.95)); side.add_child(stage_box)
	stage_box.add_child(_label("FOLDER", Vector2(5,4), Vector2(58,25), 11))
	folder_edit = _edit(Vector2(63,3), Vector2(285,28), "Stages/folder/"); folder_edit.text_changed.connect(_folder_changed); stage_box.add_child(folder_edit)
	for spec: Dictionary in [{"k":"zoom","l":"ZOOM","x":5.0,"s":0.01},{"k":"startcamposx","l":"CAM X","x":121.0,"s":1.0},{"k":"startcamposy","l":"CAM Y","x":237.0,"s":1.0}]:
		var key := str(spec["k"]); var x := float(spec["x"])
		stage_box.add_child(_label(str(spec["l"]), Vector2(x,42), Vector2(45,25), 10))
		var spin := _spin(Vector2(x+45,39), Vector2(66,29), float(spec["s"]))
		spin.value_changed.connect(_stage_property_changed.bind(key)); stage_fields[key] = spin; stage_box.add_child(spin)

	var bottom := _panel(Vector2(0,684), Vector2(PANEL_X,36)); canvas.add_child(bottom)
	status_label = _label("", Vector2(8,4), Vector2(884,28), 13, Color(0.8,0.92,1)); status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	bottom.add_child(status_label)
	_status("DRAG MOVE | WHEEL ZOOM | MIDDLE PAN | ARROWS NUDGE | CTRL+S SAVE | ESC BACK")


func load_stage(stage_id: String) -> void:
	current_stage_id = stage_id; selected_uid = -1; selection_locked = false; transform_mode = ""; dirty = false; visuals.clear(); _clear_guides()
	_parse_stage(STAGES_DIR.path_join(stage_id + ".xml"))
	stage.load_stage(stage_id)
	_map_sprites(); _create_character_previews(); _rebuild_tree(); _refresh_stage_ui(); _reset_camera(); _update_guides()
	title_label.text = "STAGE EDITOR"; _status("Loaded %s — click or drag an element." % stage_id)


func _parse_stage(path: String) -> void:
	elements.clear(); root_attributes.clear(); next_uid = 1
	var parser := XMLParser.new()
	if parser.open(path) != OK: _status("Impossible d'ouvrir %s" % path, true); return
	var group := ""; var draw_index := 0
	while parser.read() == OK:
		var node_type := parser.get_node_type()
		if node_type == XMLParser.NODE_ELEMENT_END:
			if parser.get_node_name().to_lower() in ["high-memory","low-memory"]: group = ""
			continue
		if node_type != XMLParser.NODE_ELEMENT: continue
		var tag := parser.get_node_name().to_lower(); var attrs := _read_attrs(parser)
		if tag == "stage": root_attributes = attrs
		elif tag in ["high-memory","low-memory"]: group = tag
		elif tag in ["sprite","spr","sparrow"]: elements.append(_element("sprite",tag,attrs,group,draw_index)); draw_index += 1
		elif tag in ["dad","opponent","boyfriend","bf","player","girlfriend","gf","char"]: elements.append(_element("character",_role(tag) if tag != "char" else tag,attrs,group,draw_index)); draw_index += 1
		else: elements.append(_element("unknown",tag,attrs,group,-1))
	_ensure_roles(draw_index)


func _element(kind: String, tag: String, attrs: Dictionary, group: String, draw_index: int) -> Dictionary:
	var result := {"uid":next_uid,"kind":kind,"tag":tag,"attrs":attrs,"group":group,"draw":draw_index}
	next_uid += 1; return result


func _ensure_roles(draw_index: int) -> void:
	for role: String in REQUIRED_ROLES:
		if _find_role(role) >= 0: continue
		var pos := Vector2(400,130)
		if role == "dad": pos = Vector2(100,100)
		elif role == "boyfriend": pos = Vector2(770,100)
		var attrs := {"x":_num(pos.x),"y":_num(pos.y),"character":str(DEFAULT_CHARACTER[role])}
		elements.append(_element("character",role,attrs,"",draw_index)); draw_index += 1


func _map_sprites() -> void:
	for element: Dictionary in elements:
		if str(element["kind"]) != "sprite": continue
		for child: Node in stage.get_children():
			if (child is Sprite2D or child is AnimatedSprite2D) and child.z_index == int(element["draw"]) and not child.has_meta("editor_uid"):
				_register(int(element["uid"]), child as Node2D); break


func _create_character_previews() -> void:
	for element: Dictionary in elements:
		if str(element["kind"]) == "character": _create_character(element)


func _create_character(element: Dictionary) -> void:
	var attrs: Dictionary = element["attrs"]; var role := _role(str(element["tag"])); var id := str(attrs.get("character",DEFAULT_CHARACTER.get(role,"bf")))
	var character := CNECharacter.new(); var sprite := AnimatedSprite2D.new(); sprite.name = "AnimatedSprite2D"; character.add_child(sprite); stage.add_child(character)
	character.configure(id,role,_bool(attrs,"flipx",role=="boyfriend")); character.apply_stage_layout(_character_layout(element)); _pause_character_preview(character); _register(int(element["uid"]),character)
	var color := Color(0.35,0.75,1)
	if role == "boyfriend": color = Color(0.3,1,0.45)
	elif role == "girlfriend": color = Color(1,0.45,0.8)
	var guide := _camera_guide(color,role.to_upper()+" CAM"); add_child(guide); guides[int(element["uid"])] = guide


func _character_layout(element: Dictionary) -> Dictionary:
	var attrs: Dictionary = element["attrs"]; var role := _role(str(element["tag"])); var pos := Vector2(400,130); var flip := false
	if role == "dad": pos = Vector2(100,100)
	elif role == "boyfriend": pos = Vector2(770,100); flip = true
	var scale_value := _float(attrs,"scale",1.0)
	return {"position":Vector2(_float(attrs,"x",pos.x),_float(attrs,"y",pos.y)),"scale":Vector2(_float(attrs,"scalex",scale_value),_float(attrs,"scaley",scale_value)),"camera_offset":Vector2(_float(attrs,"camxoffset",0),_float(attrs,"camyoffset",0)),"skew":Vector2(_float(attrs,"skewx",0),_float(attrs,"skewy",0)),"alpha":_float(attrs,"alpha",1),"angle":_float(attrs,"angle",0),"flip":_bool(attrs,"flipx",flip),"z_index":int(element["draw"])}


func _register(uid: int, visual: Node2D) -> void:
	visual.set_meta("editor_uid",uid); visuals[uid] = visual


func _rebuild_tree() -> void:
	loading_ui = true; element_tree.clear(); var root := element_tree.create_item()
	for element: Dictionary in elements:
		var item := element_tree.create_item(root); var uid := int(element["uid"]); var attrs: Dictionary = element["attrs"]
		item.set_metadata(0,uid); item.set_text(0,_display(element)); item.set_text(1,"%d, %d" % [roundi(_float(attrs,"x",0)),roundi(_float(attrs,"y",0))])
		if uid == selected_uid: item.select(0)
	loading_ui = false; _refresh_selection_ui(); _update_transform_gizmo()


func _display(element: Dictionary) -> String:
	var attrs: Dictionary = element["attrs"]
	if str(element["kind"]) == "character":
		var role := _role(str(element["tag"])); return "%s [%s]" % [role.to_upper(),str(attrs.get("character",DEFAULT_CHARACTER.get(role,"bf")))]
	if str(element["kind"]) == "sprite": return str(attrs.get("name",attrs.get("sprite","sprite")))
	return str(element["tag"])+" (unknown)"


func _refresh_selection_ui() -> void:
	loading_ui = true; var element := _selected(); var active := not element.is_empty()
	name_edit.editable = active; flip_check.disabled = not active; visible_check.disabled = not active
	selected_character_select.disabled = not active or str(element.get("kind","")) != "character"
	for value: Variant in fields.values(): (value as SpinBox).editable = active
	if not active:
		selection_label.text = "NO SELECTION"; name_edit.text = ""; loading_ui = false; return
	var attrs: Dictionary = element["attrs"]; var scale_value := _float(attrs,"scale",1.0)
	selection_label.text = _display(element) + ("  [LIST LOCK]" if selection_locked else ""); name_edit.text = str(attrs.get("name",element["tag"]))
	_set_field("x",_float(attrs,"x",0)); _set_field("y",_float(attrs,"y",0)); _set_field("scalex",_float(attrs,"scalex",scale_value)); _set_field("scaley",_float(attrs,"scaley",scale_value))
	_set_field("angle",_float(attrs,"angle",0)); _set_field("alpha",_float(attrs,"alpha",1)); _set_field("camxoffset",_float(attrs,"camxoffset",0)); _set_field("camyoffset",_float(attrs,"camyoffset",0))
	flip_check.button_pressed = _bool(attrs,"flipx",_role(str(element["tag"]))=="boyfriend"); visible_check.button_pressed = _bool(attrs,"visible",true)
	if str(element["kind"]) == "character": _select_text(selected_character_select,str(attrs.get("character",DEFAULT_CHARACTER.get(_role(str(element["tag"])),"bf"))))
	loading_ui = false


func _refresh_stage_ui() -> void:
	loading_ui = true; _select_text(stage_select,current_stage_id); folder_edit.text = str(root_attributes.get("folder",""))
	(stage_fields["zoom"] as SpinBox).value = _float(root_attributes,"zoom",1.05)
	(stage_fields["startcamposx"] as SpinBox).value = _float(root_attributes,"startcamposx",0)
	(stage_fields["startcamposy"] as SpinBox).value = _float(root_attributes,"startcamposy",0)
	_populate_sprites(); loading_ui = false


func _tree_selected() -> void:
	if loading_ui: return
	var item := element_tree.get_selected()
	if item:
		selected_uid = int(item.get_metadata(0))
		selection_locked = true
	_refresh_selection_ui(); _update_transform_gizmo()
	_status("Sélection verrouillée sur la liste : seul cet élément sera transformé.")


func _property_changed(value: float, key: String) -> void:
	if loading_ui: return
	var element := _selected()
	if element.is_empty(): return
	var attrs: Dictionary = element["attrs"]
	if key in ["scalex","scaley"]: attrs.erase("scale")
	attrs[key] = _num(value); element["attrs"] = attrs; _apply_visual(element); _mark_dirty(); _rebuild_tree()


func _name_changed(value: String) -> void:
	if loading_ui: return
	_set_attr("name",value,false); _rebuild_tree()


func _flip_changed(value: bool) -> void:
	if not loading_ui: _set_attr("flipx","true" if value else "false",true)


func _visible_changed(value: bool) -> void:
	if not loading_ui: _set_attr("visible","true" if value else "false",true)


func _preview_character_changed(index: int) -> void:
	if loading_ui or index < 0 or index >= character_ids.size(): return
	_set_attr("character",character_ids[index],false)
	var element := _selected(); var visual: Node2D = visuals.get(selected_uid)
	if visual is CNECharacter and not element.is_empty():
		var role := _role(str(element["tag"])); var attrs: Dictionary = element["attrs"]
		(visual as CNECharacter).configure(character_ids[index],role,_bool(attrs,"flipx",role=="boyfriend")); (visual as CNECharacter).apply_stage_layout(_character_layout(element)); _pause_character_preview(visual as CNECharacter)
	_update_guides(); _rebuild_tree()


func _set_attr(key: String, value: String, refresh: bool) -> void:
	var element := _selected()
	if element.is_empty(): return
	var attrs: Dictionary = element["attrs"]; attrs[key] = value; element["attrs"] = attrs
	if refresh: _apply_visual(element)
	_mark_dirty()


func _apply_visual(element: Dictionary) -> void:
	var visual: Node2D = visuals.get(int(element["uid"])); var attrs: Dictionary = element["attrs"]
	if not is_instance_valid(visual): return
	if visual is CNECharacter:
		(visual as CNECharacter).apply_stage_layout(_character_layout(element)); visual.visible = _bool(attrs,"visible",true)
	else:
		var scale_value := _float(attrs,"scale",1.0)
		stage.apply_cne_visual_transform(visual,Vector2(_float(attrs,"x",0),_float(attrs,"y",0)),Vector2(_float(attrs,"scalex",scale_value),_float(attrs,"scaley",scale_value)),deg_to_rad(_float(attrs,"angle",0)),deg_to_rad(_float(attrs,"skewx",0)),deg_to_rad(_float(attrs,"skewy",0)))
		visual.visible = _bool(attrs,"visible",true); visual.modulate.a = clampf(_float(attrs,"alpha",1),0,1)
		if visual is Sprite2D or visual is AnimatedSprite2D: visual.set("flip_h",_bool(attrs,"flipx",false))
	_update_guides(); _update_transform_gizmo()


func _stage_property_changed(value: float, key: String) -> void:
	if loading_ui: return
	root_attributes[key] = _num(value); _update_guides(); _mark_dirty()


func _folder_changed(value: String) -> void:
	if loading_ui: return
	root_attributes["folder"] = value; _populate_sprites(); _mark_dirty()


func _stage_selected(index: int) -> void:
	if loading_ui or index < 0 or index >= stage_ids.size(): return
	if dirty:
		loading_ui = true; _select_text(stage_select,current_stage_id); loading_ui = false; _status("CTRL+S avant de changer de stage.",true); return
	load_stage(stage_ids[index])


func _previous_stage() -> void: _change_stage(-1)
func _next_stage() -> void: _change_stage(1)
func _change_stage(direction: int) -> void:
	if dirty: _status("Sauvegarde d'abord avec CTRL+S.",true); return
	if not stage_ids.is_empty(): load_stage(stage_ids[wrapi(stage_ids.find(current_stage_id)+direction,0,stage_ids.size())])


func _add_character() -> void:
	if character_ids.is_empty(): return
	var role: String = ["dad","boyfriend","girlfriend","char"][role_select.selected]
	if role in REQUIRED_ROLES and _find_role(role) >= 0: role = "char"
	var attrs := {"name":"character_%d"%next_uid,"character":character_ids[add_character_select.selected],"x":_num(editor_camera.position.x),"y":_num(editor_camera.position.y)}
	if role == "boyfriend": attrs["flipx"] = "true"
	var element := _element("character",role,attrs,"",_next_draw()); elements.append(element); _create_character(element)
	selected_uid = int(element["uid"]); selection_locked = true; _update_order(); _mark_dirty(); _rebuild_tree(); _status("Character ajouté et verrouillé — déplace-le puis CTRL+S.")


func _add_sprite() -> void:
	var id := sprite_edit.text.strip_edges()
	if id.is_empty() and sprite_select.item_count > 0: id = sprite_select.get_item_text(sprite_select.selected)
	if id.is_empty(): _status("Choisis ou écris un sprite.",true); return
	var attrs := {"name":"sprite_%d"%next_uid,"sprite":id,"x":_num(editor_camera.position.x),"y":_num(editor_camera.position.y)}
	var element := _element("sprite","sprite",attrs,"",_next_draw()); var before := stage.get_child_count()
	stage._create_stage_sprite(str(root_attributes.get("folder","")),attrs,int(element["draw"]))
	if stage.get_child_count() <= before: _status("Image introuvable : %s"%id,true); return
	elements.append(element); _register(int(element["uid"]),stage.get_child(stage.get_child_count()-1) as Node2D); selected_uid = int(element["uid"]); selection_locked = true
	_update_order(); _mark_dirty(); _rebuild_tree(); _status("Sprite ajouté et verrouillé — déplace-le puis CTRL+S.")


func _delete_selected() -> void:
	var index := _element_index(selected_uid)
	if index < 0: return
	var element: Dictionary = elements[index]; var role := _role(str(element["tag"]))
	if str(element["kind"]) == "character" and role in REQUIRED_ROLES: _status("DAD / BOYFRIEND / GIRLFRIEND sont obligatoires.",true); return
	var visual: Node2D = visuals.get(selected_uid)
	if is_instance_valid(visual): visual.queue_free()
	var guide: Node2D = guides.get(selected_uid)
	if is_instance_valid(guide): guide.queue_free()
	visuals.erase(selected_uid); guides.erase(selected_uid); elements.remove_at(index); selected_uid = -1; selection_locked = false; transform_mode = ""; _update_order(); _mark_dirty(); _rebuild_tree()


func _move_up() -> void: _move_selected(-1)
func _move_down() -> void: _move_selected(1)
func _move_selected(direction: int) -> void:
	var old := _element_index(selected_uid)
	if old < 0: return
	var target := clampi(old+direction,0,elements.size()-1)
	if target == old: return
	var element: Dictionary = elements.pop_at(old); elements.insert(target,element); _update_order(); _mark_dirty(); _rebuild_tree()


func _update_order() -> void:
	var draw_order := 0
	for element: Dictionary in elements:
		if str(element["kind"]) not in ["sprite","character"]: continue
		element["draw"] = draw_order
		var visual: Node2D = visuals.get(int(element["uid"]))
		if is_instance_valid(visual): visual.z_index = draw_order
		draw_order += 1


func _save_stage() -> void:
	if current_stage_id.is_empty(): return
	var path := STAGES_DIR.path_join(current_stage_id+".xml"); var absolute := ProjectSettings.globalize_path(path)
	if FileAccess.file_exists(path): DirAccess.copy_absolute(absolute,absolute+".bak")
	var file := FileAccess.open(path,FileAccess.WRITE)
	if not file: _status("Sauvegarde refusée : ouvre le projet dans Godot, pas l'EXE exporté.",true); return
	file.store_string(_build_xml()); file.close(); dirty = false; title_label.text = "STAGE EDITOR"; _status("Sauvegardé : %s (backup .bak créé)"%path); SoundManager.accept.play()


func _build_xml() -> String:
	var lines: Array[String] = ["<!DOCTYPE codename-engine-stage>","<stage%s>"%_attrs_xml(root_attributes)]; var open_group := ""
	for element: Dictionary in elements:
		var group := str(element["group"])
		if group != open_group:
			if not open_group.is_empty(): lines.append("\t</%s>"%open_group)
			open_group = group
			if not open_group.is_empty(): lines.append("\t<%s>"%open_group)
		lines.append(("\t\t" if not open_group.is_empty() else "\t")+"<%s%s/>"%[str(element["tag"]),_attrs_xml(element["attrs"])])
	if not open_group.is_empty(): lines.append("\t</%s>"%open_group)
	lines.append("</stage>"); return "\n".join(lines)+"\n"


func _attrs_xml(attrs: Dictionary) -> String:
	var keys: Array[String] = []
	for raw: Variant in attrs.keys(): keys.append(str(raw))
	keys.sort()
	var output := ""
	for key: String in keys: output += " %s=\"%s\""%[_canonical_key(key),str(attrs[key]).xml_escape(true)]
	return output


func _canonical_key(key: String) -> String:
	var aliases := {"startcamposx":"startCamPosX","startcamposy":"startCamPosY","flipx":"flipX","flipy":"flipY","zoomfactor":"zoomFactor","playoncountdown":"playOnCountdown","beatoffset":"beatOffset","graphicsize":"graphicSize","graphicsizex":"graphicSizeX","graphicsizey":"graphicSizeY","updatehitbox":"updateHitbox"}
	return str(aliases.get(key.to_lower(),key))


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.ctrl_pressed and event.keycode == KEY_S: _save_stage(); get_viewport().set_input_as_handled(); return
		if event.keycode == KEY_ESCAPE:
			if dirty: _status("Modifications non sauvegardées — CTRL+S puis ESC.",true)
			else: Global.change_scene_to(Constants.DEVELOPER_MENU_SCENE,&"fade")
			get_viewport().set_input_as_handled(); return
		if event.keycode == KEY_DELETE: _delete_selected(); return
		if event.keycode == KEY_F: _focus_selected(); return
		if event.keycode == KEY_R: _reset_camera(); return
		if event.keycode in [KEY_LEFT,KEY_RIGHT,KEY_UP,KEY_DOWN] and selected_uid >= 0:
			var amount := 10.0 if event.shift_pressed else 1.0; var delta := Vector2.ZERO
			if event.keycode == KEY_LEFT: delta.x = -amount
			elif event.keycode == KEY_RIGHT: delta.x = amount
			elif event.keycode == KEY_UP: delta.y = -amount
			else: delta.y = amount
			_nudge(delta); return
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed: _zoom(1.12); return
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed: _zoom(1.0/1.12); return
		if event.button_index == MOUSE_BUTTON_MIDDLE: panning = event.pressed; return
		if event.button_index == MOUSE_BUTTON_LEFT:
			if event.pressed:
				var mouse_world := get_global_mouse_position()
				var handle := ""
				if selected_uid >= 0 and is_instance_valid(transform_gizmo):
					handle = str(transform_gizmo.call("get_handle_at",mouse_world))
				if not handle.is_empty():
					_begin_transform(handle,mouse_world)
				elif selection_locked and selected_uid >= 0:
					var locked_visual: Node2D = visuals.get(selected_uid)
					if is_instance_valid(locked_visual) and _contains(locked_visual,mouse_world):
						_begin_transform("move",mouse_world)
				else:
					var picked_uid := _pick(mouse_world)
					if picked_uid >= 0:
						selected_uid = picked_uid
						selection_locked = false
						_begin_transform("move",mouse_world)
					else:
						selected_uid = -1
						transform_mode = ""
					_rebuild_tree()
			else:
				dragging = false
				transform_mode = ""
				_rebuild_tree()
			return
	if event is InputEventMouseMotion:
		if panning: editor_camera.position -= event.relative/maxf(editor_camera.zoom.x,0.01); return
		if dragging:
			_update_transform(get_global_mouse_position(),event.shift_pressed)
			return


func _pick(point: Vector2) -> int:
	var result := -1; var top_z := -100000
	for raw: Variant in visuals.keys():
		var uid := int(raw); var visual: Node2D = visuals[uid]
		if not is_instance_valid(visual) or not visual.visible: continue
		if _contains(visual,point) and visual.z_index >= top_z: result = uid; top_z = visual.z_index
	return result


func _contains(visual: Node2D, point: Vector2) -> bool:
	if visual is CNECharacter:
		var character := visual as CNECharacter
		if character.uses_animate and is_instance_valid(character.animate_sprite) and is_instance_valid(character.animate_library):
			var animate_rect := character.animate_library.get_symbol_rect(character.animate_sprite.symbol)
			return animate_rect.grow(12).has_point(character.animate_sprite.to_local(point))
		return is_instance_valid(character.sprite) and _animated_rect(character.sprite).grow(12).has_point(character.sprite.to_local(point))
	if visual is AnimatedSprite2D:
		return _animated_rect(visual as AnimatedSprite2D).grow(10).has_point(visual.to_local(point))
	if visual is Sprite2D:
		return (visual as Sprite2D).get_rect().grow(10).has_point(visual.to_local(point))
	return point.distance_to(visual.global_position) < 50


func _animated_rect(animated: AnimatedSprite2D) -> Rect2:
	var frames := animated.sprite_frames
	if not frames or not frames.has_animation(animated.animation):
		return Rect2(Vector2(-24,-24),Vector2(48,48))
	var frame_count := frames.get_frame_count(animated.animation)
	if frame_count <= 0:
		return Rect2(Vector2(-24,-24),Vector2(48,48))
	var texture := frames.get_frame_texture(animated.animation,clampi(animated.frame,0,frame_count-1))
	if not texture:
		return Rect2(Vector2(-24,-24),Vector2(48,48))
	var frame_size := texture.get_size()
	var rect_position := animated.offset
	if animated.centered:
		rect_position -= frame_size*0.5
	return Rect2(rect_position,frame_size)


func _visual_world_corners(visual: Node2D) -> PackedVector2Array:
	var target: Node2D = visual
	var rect := Rect2(Vector2(-24,-24),Vector2(48,48))
	if visual is CNECharacter:
		var character := visual as CNECharacter
		if character.uses_animate and is_instance_valid(character.animate_sprite) and is_instance_valid(character.animate_library):
			target = character.animate_sprite
			rect = character.animate_library.get_symbol_rect(character.animate_sprite.symbol)
		elif is_instance_valid(character.sprite):
			target = character.sprite
			rect = _animated_rect(character.sprite)
	elif visual is AnimatedSprite2D:
		rect = _animated_rect(visual as AnimatedSprite2D)
	elif visual is Sprite2D:
		rect = (visual as Sprite2D).get_rect()
	return PackedVector2Array([
		target.to_global(rect.position),
		target.to_global(Vector2(rect.end.x,rect.position.y)),
		target.to_global(rect.end),
		target.to_global(Vector2(rect.position.x,rect.end.y))
	])


func _pause_character_preview(character: CNECharacter) -> void:
	if character.uses_animate and is_instance_valid(character.animate_sprite):
		character.animate_sprite.playing = false
	elif is_instance_valid(character.sprite):
		character.sprite.pause()


func _update_transform_gizmo() -> void:
	if not is_instance_valid(transform_gizmo): return
	var visual: Node2D = visuals.get(selected_uid)
	if not is_instance_valid(visual) or not visual.visible:
		transform_gizmo.call("clear")
		return
	transform_gizmo.call("set_geometry",_visual_world_corners(visual),editor_camera.zoom.x)


func _begin_transform(mode: String, mouse_world: Vector2) -> void:
	var element := _selected()
	var visual: Node2D = visuals.get(selected_uid)
	if element.is_empty() or not is_instance_valid(visual): return
	transform_mode = mode
	dragging = true
	drag_world = mouse_world
	var attrs: Dictionary = element["attrs"]
	drag_position = Vector2(_float(attrs,"x",0),_float(attrs,"y",0))
	var scale_value := _float(attrs,"scale",1.0)
	transform_start_scale = Vector2(_float(attrs,"scalex",scale_value),_float(attrs,"scaley",scale_value))
	transform_start_angle = _float(attrs,"angle",0)
	var corners := _visual_world_corners(visual)
	transform_center = (corners[0]+corners[1]+corners[2]+corners[3])*0.25
	var horizontal := corners[1]-corners[0]
	var vertical := corners[3]-corners[0]
	transform_axis_x = horizontal.normalized() if horizontal.length_squared() > 0.0001 else Vector2.RIGHT
	transform_axis_y = vertical.normalized() if vertical.length_squared() > 0.0001 else Vector2.DOWN
	transform_half_size = Vector2(maxf(horizontal.length()*0.5,0.001),maxf(vertical.length()*0.5,0.001))
	transform_start_mouse_angle = (mouse_world-transform_center).angle()


func _update_transform(mouse_world: Vector2, snap: bool) -> void:
	if transform_mode == "move":
		_set_position(drag_position+mouse_world-drag_world)
		return
	var element := _selected()
	if element.is_empty(): return
	var attrs: Dictionary = element["attrs"]
	if transform_mode == "rotate":
		var delta_angle := wrapf((mouse_world-transform_center).angle()-transform_start_mouse_angle,-PI,PI)
		var angle := transform_start_angle+rad_to_deg(delta_angle)
		if snap: angle = snappedf(angle,15.0)
		attrs["angle"] = _num(angle)
	else:
		var relative := mouse_world-transform_center
		var factor_x := maxf(absf(relative.dot(transform_axis_x))/transform_half_size.x,0.02)
		var factor_y := maxf(absf(relative.dot(transform_axis_y))/transform_half_size.y,0.02)
		var affects_x := transform_mode in ["scale_tl","scale_tr","scale_r","scale_br","scale_bl","scale_l"]
		var affects_y := transform_mode in ["scale_tl","scale_t","scale_tr","scale_br","scale_b","scale_bl"]
		if snap and affects_x and affects_y:
			var uniform_factor := maxf(factor_x,factor_y)
			factor_x = uniform_factor
			factor_y = uniform_factor
		attrs.erase("scale")
		attrs["scalex"] = _num(transform_start_scale.x*(factor_x if affects_x else 1.0))
		attrs["scaley"] = _num(transform_start_scale.y*(factor_y if affects_y else 1.0))
	element["attrs"] = attrs
	_apply_visual(element)
	_mark_dirty()
	_sync_transform_fields(attrs)


func _sync_transform_fields(attrs: Dictionary) -> void:
	loading_ui = true
	var scale_value := _float(attrs,"scale",1.0)
	_set_field("scalex",_float(attrs,"scalex",scale_value))
	_set_field("scaley",_float(attrs,"scaley",scale_value))
	_set_field("angle",_float(attrs,"angle",0))
	loading_ui = false


func _set_position(value: Vector2) -> void:
	var element := _selected()
	if element.is_empty(): return
	var attrs: Dictionary = element["attrs"]; attrs["x"] = _num(value.x); attrs["y"] = _num(value.y); element["attrs"] = attrs
	_apply_visual(element); _mark_dirty(); loading_ui = true; _set_field("x",value.x); _set_field("y",value.y); loading_ui = false


func _nudge(delta: Vector2) -> void:
	var element := _selected()
	if element.is_empty(): return
	var attrs: Dictionary = element["attrs"]; _set_position(Vector2(_float(attrs,"x",0),_float(attrs,"y",0))+delta); _rebuild_tree()


func _focus_selected() -> void:
	var visual: Node2D = visuals.get(selected_uid)
	if is_instance_valid(visual): editor_camera.position = visual.global_position


func _reset_camera() -> void:
	if root_attributes.has("startcamposx") or root_attributes.has("startcamposy"): editor_camera.position = Vector2(_float(root_attributes,"startcamposx",0),_float(root_attributes,"startcamposy",0))
	else: editor_camera.position = Vector2(640,360)
	editor_camera.zoom = Vector2.ONE*clampf(_float(root_attributes,"zoom",1.05),0.1,3.0)


func _zoom(factor: float) -> void:
	editor_camera.zoom = Vector2.ONE*clampf(editor_camera.zoom.x*factor,0.1,3.0)


func _update_guides() -> void:
	main_guide.position = Vector2(_float(root_attributes,"startcamposx",0),_float(root_attributes,"startcamposy",0))
	for raw: Variant in guides.keys():
		var uid := int(raw); var guide: Node2D = guides[uid]; var visual: Node2D = visuals.get(uid)
		if is_instance_valid(guide) and visual is CNECharacter: guide.position = (visual as CNECharacter).get_camera_position()


func _clear_guides() -> void:
	for value: Variant in guides.values():
		var guide := value as Node2D
		if is_instance_valid(guide): guide.queue_free()
	guides.clear()


func _camera_guide(color: Color, text: String) -> Node2D:
	var root := Node2D.new(); root.z_index = 4090
	for points: PackedVector2Array in [PackedVector2Array([Vector2(-18,0),Vector2(18,0)]),PackedVector2Array([Vector2(0,-18),Vector2(0,18)])]:
		var line := Line2D.new(); line.points = points; line.width = 3; line.default_color = color; root.add_child(line)
	var label := _label(text,Vector2(22,-16),Vector2(150,28),13,color); root.add_child(label); return root


func _populate_sprites() -> void:
	if not is_instance_valid(sprite_select): return
	var previous := sprite_edit.text if is_instance_valid(sprite_edit) else ""; sprite_select.clear()
	var folder := str(root_attributes.get("folder","")).replace("\\","/").trim_prefix("/"); var directory := IMAGES_DIR.path_join(folder)
	if DirAccess.dir_exists_absolute(ProjectSettings.globalize_path(directory)):
		for file_name: String in DirAccess.get_files_at(directory):
			if file_name.get_extension().to_lower() in ["png","jpg","jpeg","webp"]: sprite_select.add_item(file_name.get_basename())
	if not previous.is_empty(): sprite_edit.text = previous
	elif sprite_select.item_count > 0: sprite_edit.text = sprite_select.get_item_text(0)


func _sprite_asset_selected(index: int) -> void:
	if not loading_ui and index >= 0 and index < sprite_select.item_count: sprite_edit.text = sprite_select.get_item_text(index)


func _mark_dirty() -> void: dirty = true; title_label.text = "* STAGE EDITOR"
func _status(text: String, error := false) -> void:
	if not is_instance_valid(status_label): return
	status_label.text = text; status_label.add_theme_color_override("font_color",Color(1,0.35,0.35) if error else Color(0.8,0.92,1))


func _selected() -> Dictionary:
	var index := _element_index(selected_uid); return elements[index] if index >= 0 else {}


func _element_index(uid: int) -> int:
	for index: int in range(elements.size()):
		if int(elements[index]["uid"]) == uid: return index
	return -1


func _find_role(role: String) -> int:
	for index: int in range(elements.size()):
		if str(elements[index]["kind"]) == "character" and _role(str(elements[index]["tag"])) == role: return index
	return -1


func _next_draw() -> int:
	var result := 0
	for element: Dictionary in elements:
		if str(element["kind"]) in ["sprite","character"]: result = maxi(result,int(element["draw"])+1)
	return result


func _read_attrs(parser: XMLParser) -> Dictionary:
	var result: Dictionary = {}
	for index: int in range(parser.get_attribute_count()): result[parser.get_attribute_name(index).to_lower()] = parser.get_attribute_value(index)
	return result


func _role(value: String) -> String:
	var key := value.to_lower()
	if key in ["dad","opponent"]: return "dad"
	if key in ["boyfriend","bf","player"]: return "boyfriend"
	if key in ["girlfriend","gf"]: return "girlfriend"
	return "char"


func _float(attrs: Dictionary, key: String, fallback: float) -> float:
	var value: Variant = attrs.get(key.to_lower(),fallback)
	if value is float or value is int: return float(value)
	var text := str(value).strip_edges(); return text.to_float() if text.is_valid_float() else fallback


func _bool(attrs: Dictionary, key: String, fallback: bool) -> bool:
	if not attrs.has(key.to_lower()): return fallback
	return str(attrs[key.to_lower()]).strip_edges().to_lower() in ["true","1","yes","on"]


func _num(value: float) -> String: return str(snappedf(value,0.001))
func _set_field(key: String, value: float) -> void: (fields[key] as SpinBox).value = value
func _select_text(option: OptionButton, text: String) -> void:
	for index: int in range(option.item_count):
		if option.get_item_text(index).nocasecmp_to(text) == 0: option.select(index); return


func _panel(pos: Vector2, size: Vector2, color := Color(0.03,0.009,0.06,0.97)) -> Panel:
	var panel := Panel.new(); panel.position = pos; panel.size = size; var style := StyleBoxFlat.new(); style.bg_color = color; style.border_color = Color(0.2,0.75,0.9,0.5); style.set_border_width_all(1); panel.add_theme_stylebox_override("panel",style); return panel


func _label(text: String, pos: Vector2, size: Vector2, font_size: int, color := Color.WHITE) -> Label:
	var label := Label.new(); label.text = text; label.position = pos; label.size = size; label.add_theme_font_override("font",load("res://among_funk/codename/fonts/vcr.ttf")); label.add_theme_font_size_override("font_size",font_size); label.add_theme_color_override("font_color",color); return label


func _button(text: String, pos: Vector2, size: Vector2, callback: Callable) -> Button:
	var button := Button.new(); button.text = text; button.position = pos; button.size = size; button.add_theme_font_override("font",load("res://among_funk/codename/fonts/vcr.ttf")); button.pressed.connect(callback); return button


func _edit(pos: Vector2, size: Vector2, placeholder: String) -> LineEdit:
	var edit := LineEdit.new(); edit.position = pos; edit.size = size; edit.placeholder_text = placeholder; edit.add_theme_font_override("font",load("res://among_funk/codename/fonts/vcr.ttf")); return edit


func _spin(pos: Vector2, size: Vector2, step: float) -> SpinBox:
	var spin := SpinBox.new(); spin.position = pos; spin.size = size; spin.min_value = -100000; spin.max_value = 100000; spin.step = step; spin.allow_greater = true; spin.allow_lesser = true; return spin
