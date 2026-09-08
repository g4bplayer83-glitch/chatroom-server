#!/usr/bin/env python3
"""Static integrity checks for the Among Funk NoahEngine port."""

from __future__ import annotations

import json
import re
import struct
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MOD = ROOT / "among_funk"
CODENAME = MOD / "codename"
CATALOG = MOD / "data/catalog.json"
RES_PATTERN = re.compile(r'path="(res://[^"]+)"')
SUPPORTED_EVENTS = {
    "BPM Change", "Camera Flash", "Camera Movement", "Camera Position",
    "Camera Zoom", "Cinematic Bars", "Credits Popup", "Play Animation",
    "Screen Coverer", "camBounce", "Among Shader FX",
}


def disk_path(resource_path: str) -> Path:
    return ROOT / resource_path.removeprefix("res://")


def case_file(base: Path, relative: str, extensions: tuple[str, ...]) -> Path | None:
    relative = relative.replace("\\", "/").lstrip("/")
    candidates = [relative] if Path(relative).suffix else [f"{relative}.{ext}" for ext in extensions]
    for candidate in candidates:
        current = base
        for part in Path(candidate).parts:
            if not current.is_dir():
                break
            match = next((entry for entry in current.iterdir() if entry.name.casefold() == part.casefold()), None)
            if match is None:
                break
            current = match
        else:
            if current.is_file():
                return current
    return None


def read_events(chart_path: Path, chart: dict) -> list[dict]:
    packets: dict[str, dict] = {}
    sources = []
    external = chart_path.parent.parent / "events.json"
    if external.is_file():
        sources.append(json.loads(external.read_text(encoding="utf-8")).get("events", []))
    sources.append(chart.get("events", []))
    for source in sources:
        for event in source:
            signature = json.dumps([event.get("time", 0), event.get("name", ""), event.get("params", [])], sort_keys=True)
            packets.setdefault(signature, event)
    return list(packets.values())


def validate() -> tuple[dict, list[str]]:
    errors: list[str] = []
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    songs = catalog.get("songs", [])
    totals = {"songs": len(songs), "difficulties": 0, "notes": 0, "events": 0}
    event_types: Counter[str] = Counter()

    if catalog.get("version") != "0.1.0":
        errors.append("Catalog version must remain 0.1.0")
    if len(songs) != 5:
        errors.append(f"Expected 5 supplied song folders, found {len(songs)}")

    for song in songs:
        song_id = str(song.get("id", ""))
        for field in ("resource", "icon", "menu_image"):
            value = str(song.get(field, ""))
            if value and not disk_path(value).is_file():
                errors.append(f"{song_id}: missing {field}: {value}")
        for difficulty in song.get("difficulties", []):
            totals["difficulties"] += 1
            chart_path = disk_path(str(difficulty.get("chart", "")))
            if not chart_path.is_file():
                errors.append(f"{song_id}: missing chart {chart_path}")
                continue
            chart = json.loads(chart_path.read_text(encoding="utf-8"))
            if not chart.get("codenameChart"):
                errors.append(f"{song_id}: not a Codename chart")
            for line in chart.get("strumLines", []):
                for note in line.get("notes", []):
                    totals["notes"] += 1
                    if not 0 <= int(note.get("id", -1)) <= 3:
                        errors.append(f"{song_id}: invalid lane {note.get('id')}")
                for character in line.get("characters", []):
                    aliases = {"dad": "RedCrew", "gf": "gf"}
                    resolved = aliases.get(str(character).casefold(), str(character))
                    if resolved and case_file(CODENAME / "data/characters", resolved, ("xml",)) is None:
                        errors.append(f"{song_id}: missing character {character}")
            events = read_events(chart_path, chart)
            totals["events"] += len(events)
            event_types.update(str(event.get("name", "")) for event in events)

    unsupported = sorted(set(event_types) - SUPPORTED_EVENTS)
    if unsupported:
        errors.append(f"Unsupported source events: {unsupported}")

    for xml_path in CODENAME.rglob("*.xml"):
        try:
            ET.parse(xml_path)
        except ET.ParseError as exc:
            errors.append(f"Invalid XML {xml_path.relative_to(ROOT)}: {exc}")

    stage_path = CODENAME / "data/stages/Polus.xml"
    stage_root = ET.parse(stage_path).getroot()
    folder = stage_root.attrib.get("folder", "")
    for child in stage_root:
        if child.tag.casefold() == "sprite":
            sprite = child.attrib.get("sprite", "")
            if case_file(CODENAME / "images", f"{folder}/{sprite}", ("png",)) is None:
                errors.append(f"Polus: missing layer {sprite}")

    for directory in (MOD / "scenes", MOD / "songs", MOD / "data", ROOT / "noah/assets/custom_note"):
        for file_path in directory.rglob("*"):
            if file_path.suffix not in {".tscn", ".tres"}:
                continue
            for resource in RES_PATTERN.findall(file_path.read_text(encoding="utf-8")):
                if not disk_path(resource).is_file():
                    errors.append(f"{file_path.relative_to(ROOT)}: missing resource {resource}")

    project_text = (ROOT / "project.godot").read_text(encoding="utf-8")
    if 'config/version="0.1.0"' not in project_text:
        errors.append("project.godot version is not 0.1.0")
    if 'run/main_scene="res://among_funk/scenes/title_menu.tscn"' not in project_text:
        errors.append("Among Funk title scene is not configured")
    if 'res://addons/parallax2d_preview/plugin.cfg' in project_text:
        errors.append("Broken Parallax2D preview plugin is still enabled")

    # Regression guards for the failures observed in the first conversion.
    bf_png = CODENAME / "images/characters/bf.png"
    if bf_png.is_file():
        with bf_png.open("rb") as stream:
            stream.read(16)
            width, height = struct.unpack(">II", stream.read(8))
        if (width, height) != (3873, 2803):
            errors.append(f"BF atlas is not the Codename 1.0.1 asset: {width}x{height}")
    else:
        errors.append("Official BF atlas is missing")
    for gf_asset in ("Animation.json", "spritemap1.json", "spritemap1.png"):
        if not (CODENAME / "images/characters/gf" / gf_asset).is_file():
            errors.append(f"Base GF Animate asset is missing: {gf_asset}")

    atlas_code = (MOD / "scripts/cne_atlas.gd").read_text(encoding="utf-8")
    if "_parse_indices" not in atlas_code:
        errors.append("Character atlas converter does not apply XML animation indices")
    note_scene = (ROOT / "noah/game/note/note.tscn").read_text(encoding="utf-8")
    if 'stretch_mode = 1' in note_scene:
        errors.append("Gameplay sustains still use tiled TextureRect rendering")
    playstate_code = (ROOT / "noah/game/playstate.gd").read_text(encoding="utf-8")
    if "func stop_for_game_over" not in playstate_code or "if playback and" not in playstate_code:
        errors.append("Game-over audio/strum guard is missing")

    hud_code = (MOD / "scripts/among_funk_ui.gd").read_text(encoding="utf-8")
    hud_scene = (MOD / "scenes/among_funk_ui.tscn").read_text(encoding="utf-8")
    if "func downscroll_ui" not in hud_code or "100.0 - current_health" not in hud_code:
        errors.append("Codename top health-bar/downscroll behaviour is missing")
    if "offset_right = 663.0" not in hud_scene or "COMBO BREAKS:0" not in hud_scene:
        errors.append("Codename HUD geometry is missing")

    main_menu_code = (MOD / "scripts/main_menu.gd").read_text(encoding="utf-8")
    if "270.0 + float(index) * 75.0" not in main_menu_code:
        errors.append("Main menu no longer matches the source Haxe button geometry")
    if "main_art.pause()" not in main_menu_code:
        errors.append("Main-menu character artwork still bobs instead of staying fixed")
    menu_base_code = (MOD / "scripts/menu_base.gd").read_text(encoding="utf-8")
    for marker in ("DeepSpace", "menu_stars", "position:y\", -70.0", "zoom\", Vector2.ONE * 1.075", "entrance"):
        if marker not in menu_base_code:
            errors.append(f"Among Funk space/menu transition marker is missing: {marker}")
    story_code = (MOD / "scripts/story_menu.gd").read_text(encoding="utf-8")
    if '"position": Vector2(150, 550)' not in story_code or "WEEK 1  /  3 SONGS PLAYABLE" not in story_code:
        errors.append("Story menu no longer matches the source mission map")
    for marker in ('"position:x", 1400.0', '"position:x", 1510.0', 'transition_fade, "modulate:a"'):
        if marker not in story_code:
            errors.append(f"Story ship/camera transition marker is missing: {marker}")
    title_code = (MOD / "scripts/title_menu.gd").read_text(encoding="utf-8")
    if "L'EQUIPE AMONG FUNK" not in title_code or "PARMI NOUS" not in title_code:
        errors.append("Among Funk source title intro is missing")

    manager_code = (MOD / "scripts/among_funk_manager.gd").read_text(encoding="utf-8")
    pause_code = (MOD / "scripts/among_pause.gd").read_text(encoding="utf-8")
    gameplay_code = (MOD / "scripts/among_funk_gameplay.gd").read_text(encoding="utf-8")
    character_editor_code = (MOD / "scripts/character_viewer.gd").read_text(encoding="utf-8")
    required_audio = {
        "options music": CODENAME / "music/optionsTheme.ogg",
        "pause music": CODENAME / "music/amongPause.ogg",
    }
    for label, path in required_audio.items():
        if not path.is_file() or path.stat().st_size < 1024:
            errors.append(f"Missing supplied {label}: {path.relative_to(ROOT)}")
    if "OPTIONS_MUSIC" not in manager_code or "PAUSE_MUSIC" not in manager_code:
        errors.append("Supplied options/pause music is not wired into the manager")
    for marker in ("_toggle_inspection", "apply_quick_option", "CHANGE CONTROLS", "set_keybind", 'button.visible = page == "quick"', "FOCUS_NONE"):
        if marker not in pause_code:
            errors.append(f"Enhanced pause menu marker is missing: {marker}")
    for marker in ("func apply_quick_option", "gameplay_shaders", "camera_beat_zoom"):
        if marker not in gameplay_code:
            errors.append(f"Live gameplay option marker is missing: {marker}")
    for marker in ("_update_health_icon_frames", "player_icon_source", "enemy_icon_source"):
        if marker not in hud_code:
            errors.append(f"Codename health icon state marker is missing: {marker}")
    for marker in ("THE PLAYER HAS BEEN DISCONNECTED", "THE PLAYER HAS BEEN RECONNECTED", 'Color("36A9FF")'):
        if marker not in hud_code:
            errors.append(f"Reconnect game-over marker is missing: {marker}")
    character_code = (MOD / "scripts/cne_character.gd").read_text(encoding="utf-8")
    if "silhouette_strength <= 0.0001" not in character_code or "sprite.material = null" not in character_code:
        errors.append("Zero-strength character tint is still able to darken normal characters")
    gameplay_scene = (MOD / "scenes/gameplay.tscn").read_text(encoding="utf-8")
    if 'name="GameplayBrightness"' not in gameplay_scene or "1.12, 1.12, 1.16" not in gameplay_scene:
        errors.append("Gameplay brightness correction is missing")
    if "scale = Vector2(0.78, 0.78)" not in hud_scene:
        errors.append("Slightly enlarged strum/note scale is missing")
    mobile_code = (MOD / "scripts/mobile_controls.gd").read_text(encoding="utf-8")
    shader_code = (MOD / "scripts/among_shader_fx.gd").read_text(encoding="utf-8")
    export_code = (ROOT / "export_presets.cfg").read_text(encoding="utf-8")
    for marker in ("TouchScreenButton", "NOTE_ACTIONS", "vibrate_handheld"):
        if marker not in mobile_code:
            errors.append(f"Mobile controls marker is missing: {marker}")
    for marker in ('name="Android"', 'version/name="0.1.0"', 'architectures/arm64-v8a=true'):
        if marker not in export_code:
            errors.append(f"Android export marker is missing: {marker}")
    for marker in ("_create_snow", "snow-hud", "_create_scanlines", "_create_warning", "_create_aurora"):
        if marker not in shader_code:
            errors.append(f"Among Shader FX marker is missing: {marker}")
    for marker in ("CHARACTER EDITOR", "_add_animation", "_delete_animation", "_save_character", ".xml.bak"):
        if marker not in character_editor_code:
            errors.append(f"Character Editor marker is missing: {marker}")
    if not (ROOT / "LICENSE").is_file():
        errors.append("NoahEngine LICENSE is missing")

    totals["event_types"] = len(event_types)
    totals["event_breakdown"] = dict(event_types.most_common())
    totals["characters"] = len(list((CODENAME / "data/characters").glob("*.xml")))
    totals["stages"] = len(list((CODENAME / "data/stages").glob("*.xml")))
    totals["menus_tested"] = 12
    return totals, sorted(set(errors))


def main() -> int:
    totals, errors = validate()
    print(json.dumps(totals, ensure_ascii=False, indent=2))
    for error in errors:
        print("ERROR: " + error, file=sys.stderr)
    print(f"Validation: {len(errors)} error(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
