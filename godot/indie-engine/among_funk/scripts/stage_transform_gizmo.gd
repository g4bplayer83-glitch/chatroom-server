extends Node2D

const OUTLINE_COLOR := Color(0.1,0.8,1.0,0.95)
const HANDLE_FILL := Color(0.94,0.98,1.0,1.0)
const ROTATE_FILL := Color(0.35,1.0,0.75,1.0)

var corners := PackedVector2Array()
var handles: Dictionary = {}
var camera_zoom := 1.0


func set_geometry(world_corners: PackedVector2Array, zoom_value: float) -> void:
	corners = world_corners
	camera_zoom = maxf(zoom_value,0.01)
	handles.clear()
	if corners.size() != 4:
		visible = false
		queue_redraw()
		return
	visible = true
	var top := (corners[0]+corners[1])*0.5
	var right := (corners[1]+corners[2])*0.5
	var bottom := (corners[2]+corners[3])*0.5
	var left := (corners[3]+corners[0])*0.5
	var center := (corners[0]+corners[1]+corners[2]+corners[3])*0.25
	var outward := (top-center).normalized()
	if outward.is_zero_approx(): outward = Vector2.UP
	handles = {
		"scale_tl":corners[0], "scale_t":top, "scale_tr":corners[1],
		"scale_r":right, "scale_br":corners[2], "scale_b":bottom,
		"scale_bl":corners[3], "scale_l":left, "move":center,
		"rotate":top+outward*(52.0/camera_zoom)
	}
	queue_redraw()


func clear() -> void:
	corners = PackedVector2Array()
	handles.clear()
	visible = false
	queue_redraw()


func get_handle_at(world_point: Vector2) -> String:
	if not visible: return ""
	var radius := 11.0/camera_zoom
	var priority: Array[String] = ["rotate","scale_tl","scale_tr","scale_br","scale_bl","scale_t","scale_r","scale_b","scale_l","move"]
	for handle_name: String in priority:
		if world_point.distance_to(Vector2(handles[handle_name])) <= radius:
			return handle_name
	return ""


func get_center() -> Vector2:
	return Vector2(handles.get("move",Vector2.ZERO))


func _draw() -> void:
	if corners.size() != 4: return
	var width := 2.0/camera_zoom
	var closed := PackedVector2Array([corners[0],corners[1],corners[2],corners[3],corners[0]])
	draw_polyline(closed,OUTLINE_COLOR,width,true)
	var top := Vector2(handles["scale_t"])
	var rotate_point := Vector2(handles["rotate"])
	draw_line(top,rotate_point,OUTLINE_COLOR,width,true)
	var radius := 5.5/camera_zoom
	for handle_name: String in ["scale_tl","scale_t","scale_tr","scale_r","scale_br","scale_b","scale_bl","scale_l"]:
		var point := Vector2(handles[handle_name])
		draw_circle(point,radius,HANDLE_FILL)
		draw_arc(point,radius,0.0,TAU,18,OUTLINE_COLOR,width,true)
	var center := Vector2(handles["move"])
	draw_circle(center,radius*0.72,OUTLINE_COLOR)
	draw_circle(rotate_point,radius*1.15,ROTATE_FILL)
	draw_arc(rotate_point,radius*1.15,0.0,TAU,18,OUTLINE_COLOR,width,true)
