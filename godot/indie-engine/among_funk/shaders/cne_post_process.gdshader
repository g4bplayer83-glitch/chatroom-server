shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform vec2 viewport_size = vec2(1280.0, 720.0);
uniform float effect_time = 0.0;

uniform float warp_intensity = 0.0;
uniform float warp_amount = 0.1;
uniform float crt_distortion = 0.0;
uniform float crt_chromatic = 0.0;
uniform float crt_zoom = 1.0;
uniform float fisheye_intensity = 0.0;
uniform float wave_intensity = 0.0;
uniform float wave_frequency = 6.0;
uniform float heat_intensity = 0.0;
uniform float heat_speed = 1.25;
uniform float heat_scale = 8.0;
uniform float glitch_intensity = 0.0;
uniform float glitch_speed = 16.0;
uniform float glitch_lines = 64.0;
uniform float pixelate_intensity = 0.0;
uniform float chromatic_intensity = 0.0;
uniform float vhs_intensity = 0.0;
uniform float vhs_chromatic = 0.006;
uniform float vhs_noise = 0.12;
uniform float blur_intensity = 0.0;
uniform float blur_radius = 4.0;
uniform float bloom_intensity = 0.0;
uniform float bloom_radius = 5.0;
uniform float grayscale_intensity = 0.0;
uniform float colorgrade_intensity = 0.0;
uniform float colorgrade_saturation = 0.0;
uniform float colorgrade_contrast = 0.0;
uniform vec4 colorgrade_tint : source_color = vec4(1.0);
uniform float vignette_intensity = 0.0;
uniform vec4 vignette_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float grain_intensity = 0.0;
uniform float grain_speed = 10.0;
uniform float scanlines_intensity = 0.0;
uniform float scanlines_density = 120.0;
uniform float neon_intensity = 0.0;
uniform float neon_radius = 5.0;
uniform float neon_threshold = 0.35;
uniform vec4 neon_color : source_color = vec4(1.0);
uniform float stagedim_intensity = 0.0;
uniform float stagedim_contrast = 0.0;
uniform vec4 stagedim_color : source_color = vec4(0.72, 0.77, 1.0, 1.0);
uniform float motionblur_intensity = 0.0;
uniform float motionblur_angle = 0.0;

float random_value(vec2 point) {
	return fract(sin(dot(point, vec2(12.9898, 78.233))) * 43758.5453);
}

vec4 read_screen(vec2 uv) {
	return texture(screen_texture, clamp(uv, vec2(0.001), vec2(0.999)));
}

void fragment() {
	vec2 uv = SCREEN_UV;
	vec2 centered = uv - vec2(0.5);
	float radius_squared = dot(centered, centered);

	float safe_zoom = max(crt_zoom, 0.05);
	uv = (uv - vec2(0.5)) / safe_zoom + vec2(0.5);
	centered = uv - vec2(0.5);
	radius_squared = dot(centered, centered);

	uv += centered * radius_squared * crt_distortion;
	uv += centered * radius_squared * warp_amount * warp_intensity * 0.18;
	uv += centered * radius_squared * fisheye_intensity * 0.24;

	float safe_frequency = max(abs(wave_frequency), 0.01);
	uv.x += sin(uv.y * safe_frequency + effect_time * 2.1) * wave_intensity * 0.012;
	float heat_wave = sin(uv.y * max(abs(heat_scale), 1.0) + effect_time * max(abs(heat_speed), 0.01) * 3.0);
	uv.x += heat_wave * heat_intensity * 0.009;

	float safe_lines = max(abs(glitch_lines), 1.0);
	float glitch_row = floor(uv.y * safe_lines);
	float glitch_tick = floor(effect_time * max(abs(glitch_speed), 1.0));
	float row_noise = random_value(vec2(glitch_row, glitch_tick));
	uv.x += (row_noise - 0.5) * step(0.82, row_noise) * glitch_intensity * 0.085;

	float vhs_wave = sin(uv.y * 640.0 + effect_time * 8.0) * vhs_intensity * 0.0018;
	uv.x += vhs_wave;

	float pixel_size = 1.0 + clamp(pixelate_intensity, 0.0, 4.0) * 18.0;
	if (pixelate_intensity > 0.0001) {
		vec2 pixel_grid = max(viewport_size / pixel_size, vec2(1.0));
		uv = (floor(uv * pixel_grid) + vec2(0.5)) / pixel_grid;
	}

	vec2 texel = vec2(1.0) / max(viewport_size, vec2(1.0));
	float chromatic = crt_chromatic + chromatic_intensity * 0.012 + vhs_intensity * vhs_chromatic;
	vec2 chroma_offset = centered * radius_squared * chromatic + vec2(chromatic * 0.35, 0.0);
	vec4 base_color = read_screen(uv);
	if (abs(chromatic) > 0.00001 || glitch_intensity > 0.0001) {
		float glitch_chroma = glitch_intensity * (row_noise - 0.5) * 0.015;
		vec2 total_offset = chroma_offset + vec2(glitch_chroma, 0.0);
		base_color.r = read_screen(uv + total_offset).r;
		base_color.b = read_screen(uv - total_offset).b;
	}

	float combined_blur = clamp(blur_intensity, 0.0, 1.0);
	float blur_pixels = max(blur_radius, 0.0);
	if (combined_blur > 0.0001) {
		vec2 step_x = vec2(texel.x * blur_pixels, 0.0);
		vec2 step_y = vec2(0.0, texel.y * blur_pixels);
		vec4 blurred = base_color * 0.2;
		blurred += read_screen(uv + step_x) * 0.12;
		blurred += read_screen(uv - step_x) * 0.12;
		blurred += read_screen(uv + step_y) * 0.12;
		blurred += read_screen(uv - step_y) * 0.12;
		blurred += read_screen(uv + step_x + step_y) * 0.08;
		blurred += read_screen(uv + step_x - step_y) * 0.08;
		blurred += read_screen(uv - step_x + step_y) * 0.08;
		blurred += read_screen(uv - step_x - step_y) * 0.08;
		base_color = mix(base_color, blurred, combined_blur);
	}

	if (motionblur_intensity > 0.0001) {
		float angle = radians(motionblur_angle);
		vec2 direction = vec2(cos(angle), sin(angle)) * texel * 8.0;
		vec4 motion = base_color * 0.4;
		motion += read_screen(uv + direction) * 0.3;
		motion += read_screen(uv - direction) * 0.3;
		base_color = mix(base_color, motion, clamp(motionblur_intensity, 0.0, 1.0));
	}

	if (bloom_intensity > 0.0001 || neon_intensity > 0.0001) {
		float glow_radius = max(max(bloom_radius, neon_radius), 1.0);
		vec2 glow_x = vec2(texel.x * glow_radius, 0.0);
		vec2 glow_y = vec2(0.0, texel.y * glow_radius);
		vec3 glow = (read_screen(uv + glow_x).rgb + read_screen(uv - glow_x).rgb
			+ read_screen(uv + glow_y).rgb + read_screen(uv - glow_y).rgb) * 0.25;
		float glow_luma = dot(glow, vec3(0.299, 0.587, 0.114));
		base_color.rgb += glow * max(glow_luma - 0.48, 0.0) * bloom_intensity * 1.8;
		float edge = length(base_color.rgb - glow);
		base_color.rgb += neon_color.rgb * max(edge - neon_threshold * 0.25, 0.0) * neon_intensity;
	}

	float luminance = dot(base_color.rgb, vec3(0.299, 0.587, 0.114));
	base_color.rgb = mix(base_color.rgb, vec3(luminance), clamp(grayscale_intensity, 0.0, 1.0));
	if (colorgrade_intensity > 0.0001) {
		float saturation = 1.0 + colorgrade_saturation * 0.02;
		vec3 graded = mix(vec3(luminance), base_color.rgb, max(saturation, 0.0));
		graded = (graded - vec3(0.5)) * (1.0 + colorgrade_contrast * 0.02) + vec3(0.5);
		graded *= colorgrade_tint.rgb;
		base_color.rgb = mix(base_color.rgb, graded, clamp(colorgrade_intensity, 0.0, 1.0));
	}

	float scan = 0.5 + 0.5 * sin(uv.y * max(scanlines_density, 1.0) * 6.2831853);
	base_color.rgb *= 1.0 - scanlines_intensity * (0.08 + scan * 0.18);
	float noise = random_value(uv * viewport_size + vec2(floor(effect_time * max(grain_speed, 1.0))));
	base_color.rgb += (noise - 0.5) * grain_intensity * 0.22;
	base_color.rgb += (random_value(vec2(floor(uv.y * 720.0), floor(effect_time * 30.0))) - 0.5) * vhs_noise * vhs_intensity * 0.12;

	vec2 vignette_uv = uv * (vec2(1.0) - uv.yx);
	float vignette_shape = pow(clamp(vignette_uv.x * vignette_uv.y * 18.0, 0.0, 1.0), 0.28);
	base_color.rgb = mix(vignette_color.rgb, base_color.rgb, mix(1.0, vignette_shape, clamp(vignette_intensity, 0.0, 1.0)));
	vec3 dimmed = mix(base_color.rgb * (1.0 - stagedim_contrast * 0.2), stagedim_color.rgb, 0.14);
	base_color.rgb = mix(base_color.rgb, dimmed, clamp(stagedim_intensity, 0.0, 1.0));

	bool outside = uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0;
	if (outside && (abs(crt_distortion) + abs(warp_intensity) + abs(fisheye_intensity) > 0.0001)) {
		base_color = vec4(0.0, 0.0, 0.0, 1.0);
	}
	COLOR = vec4(clamp(base_color.rgb, vec3(0.0), vec3(4.0)), 1.0);
}
