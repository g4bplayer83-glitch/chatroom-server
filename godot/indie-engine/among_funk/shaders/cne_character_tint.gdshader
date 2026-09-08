shader_type canvas_item;
render_mode unshaded;

uniform vec4 tint_color : source_color = vec4(1.0);
uniform float tint_amount : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec4 source = texture(TEXTURE, UV);
	vec3 tinted = mix(source.rgb, tint_color.rgb, clamp(tint_amount, 0.0, 1.0));
	COLOR = vec4(tinted, source.a);
}
