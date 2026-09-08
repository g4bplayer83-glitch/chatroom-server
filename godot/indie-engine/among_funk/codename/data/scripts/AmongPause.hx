import flixel.FlxG;
import flixel.FlxSprite;
import flixel.FlxCamera;
import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.util.FlxColor;
import flixel.math.FlxMath;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;

import funkin.game.PlayState;
import funkin.menus.ModState;
import funkin.options.Options;
import funkin.options.keybinds.KeybindsOptions;
import funkin.editors.charter.Charter;

var pauseCam:FlxCamera;
var dim:FlxSprite;
var terminal:FlxSprite;
var title:FlxText;
var currentSongText:FlxText;
var footerText:FlxText;
var helperText:FlxText;
var crewArt:FlxSprite;
var crewLabel:FlxText;

var menuNames:Array<String> = ["RESUME", "RESTART SONG", "QUICK OPTIONS", "CHANGE CONTROLS", "EXIT TO MENU"];
var menuBoxes:Array<FlxSprite> = [];
var menuTexts:Array<FlxText> = [];
var curSelected:Int = 0;

var quickNames:Array<String> = ["DOWN SCROLL", "GHOST TAPPING", "NOTE SPLASHES", "CAMERA BEAT ZOOM", "GAMEPLAY SHADERS"];
var quickBoxes:Array<FlxSprite> = [];
var quickTexts:Array<FlxText> = [];
var quickValues:Array<FlxText> = [];
var quickSelected:Int = 0;
var quickOpen:Bool = false;
var pauseHidden:Bool = false;
var inputCooldown:Float = 0;
var crewBaseScaleX:Float = 1;
var crewBaseScaleY:Float = 1;

function create(event) {
    // Let Codename load the supplied pause song, but not its default pause UI.
    event.music = "amongPause";
    event.cancel();

    camera = pauseCam = new FlxCamera();
    pauseCam.bgColor = FlxColor.TRANSPARENT;
    pauseCam.scroll.set(0, 0);
    pauseCam.zoom = 1;
    FlxG.cameras.add(pauseCam, false);

    dim = new FlxSprite(0, 0).makeGraphic(1280, 720, 0xB8000000);
    dim.cameras = [pauseCam];
    add(dim);

    terminal = new FlxSprite();
    try {
        terminal.loadGraphic(Paths.image('Menu_Corner'));
        terminal.setGraphicSize(760, 535);
        terminal.updateHitbox();
    } catch(e:Dynamic) {
        terminal.makeGraphic(760, 535, 0xFF20292A);
    }
    terminal.x = 260;
    terminal.y = 92;
    terminal.cameras = [pauseCam];
    add(terminal);

    title = new FlxText(0, 120, 1280, "PAUSED", 46);
    title.setFormat(Paths.font("vcr.ttf"), 46, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    title.borderSize = 3;
    title.cameras = [pauseCam];
    add(title);

    var currentSong:String = "CURRENT SONG";
    try {
        var displayName:String = PlayState.SONG.meta.displayName;
        if (displayName != null && displayName != "") currentSong = displayName;
    } catch(e:Dynamic) {}
    var currentDifficulty:String = "";
    try { currentDifficulty = PlayState.difficulty; } catch(e:Dynamic) {}

    currentSongText = new FlxText(0, 171, 1280, currentSong.toUpperCase() + "  //  " + currentDifficulty.toUpperCase(), 16);
    currentSongText.setFormat(Paths.font("vcr.ttf"), 16, 0xFF8DA6A8, "center");
    currentSongText.cameras = [pauseCam];
    add(currentSongText);

    // Native Codename-style chart playtest return.
    // Keep EXIT TO MENU, then add RETURN TO CHART EDITOR directly underneath.
    if (PlayState.chartingMode) menuNames.push("RETURN TO CHART EDITOR");

    var menuSpacing:Float = PlayState.chartingMode ? 57 : 65;
    var menuStartY:Float = PlayState.chartingMode ? 205 : 220;

    for (i in 0...menuNames.length) {
        var box = new FlxSprite(380, menuStartY + (i * menuSpacing)).makeGraphic(520, 48, 0xFF51696B);
        box.cameras = [pauseCam];
        add(box);
        menuBoxes.push(box);

        var txt = new FlxText(404, box.y + 11, 470, menuNames[i], 21);
        txt.setFormat(Paths.font("vcr.ttf"), 21, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        txt.borderSize = 1;
        txt.cameras = [pauseCam];
        add(txt);
        menuTexts.push(txt);
    }

    for (i in 0...quickNames.length) {
        var box = new FlxSprite(380, 220 + (i * 65)).makeGraphic(520, 48, 0xFF51696B);
        box.cameras = [pauseCam];
        add(box);
        quickBoxes.push(box);

        var name = new FlxText(404, box.y + 11, 320, quickNames[i], 19);
        name.setFormat(Paths.font("vcr.ttf"), 19, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        name.borderSize = 1;
        name.cameras = [pauseCam];
        add(name);
        quickTexts.push(name);

        var value = new FlxText(738, box.y + 11, 138, "", 19);
        value.setFormat(Paths.font("vcr.ttf"), 19, FlxColor.WHITE, "right", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        value.borderSize = 1;
        value.cameras = [pauseCam];
        add(value);
        quickValues.push(value);
    }

    helperText = new FlxText(342, PlayState.chartingMode ? 568 : 550, 595, "Quick Options stay inside this pause menu.", 14);
    helperText.setFormat(Paths.font("vcr.ttf"), 14, 0xFF8DA6A8, "center");
    helperText.cameras = [pauseCam];
    add(helperText);

    crewArt = new FlxSprite(910, 535);
    try {
        crewArt.loadGraphic(Paths.image('impostor_float'));
        crewArt.setGraphicSize(68, 68);
        crewArt.updateHitbox();
        crewArt.color = 0xFFC57AFF;
    } catch(e:Dynamic) {
        crewArt.makeGraphic(68, 68, 0xFFC57AFF);
    }
    crewArt.cameras = [pauseCam];
    crewArt.alpha = 0.9;
    crewBaseScaleX = crewArt.scale.x;
    crewBaseScaleY = crewArt.scale.y;
    add(crewArt);

    crewLabel = new FlxText(875, 600, 140, "HIDE", 12);
    crewLabel.setFormat(Paths.font("vcr.ttf"), 12, 0xFFCFA9FF, "center");
    crewLabel.cameras = [pauseCam];
    add(crewLabel);

    footerText = new FlxText(0, 665, 1280, "UP / DOWN  SELECT     ENTER  CONFIRM     ESC  RESUME", 16);
    footerText.setFormat(Paths.font("vcr.ttf"), 16, 0xFF8DA6A8, "center");
    footerText.cameras = [pauseCam];
    add(footerText);

    refreshQuickValues();
    setQuickVisible(false);
    refreshMainSelection();

    terminal.alpha = 0;
    terminal.y = 108;
    FlxTween.tween(terminal, {alpha: 1, y: 92}, 0.20, {ease: FlxEase.quadOut});
}

function postCreate() {
    // Codename creates pauseMusic after create(event), so set its real volume here.
    try { if (pauseMusic != null) { pauseMusic.time = 0; pauseMusic.volume = 0.52; } } catch(e:Dynamic) {}
}

function update(elapsed:Float) {
    inputCooldown = Math.max(0, inputCooldown - elapsed);

    // PauseSubState uses its own camera, so mouse hit-tests explicitly use pauseCam.
    // Handle mouse clicks before keyboard/gamepad to prevent one click becoming two actions.
    var clickedCrew:Bool = FlxG.mouse.justPressed && mouseOverSprite(crewArt);
    if (clickedCrew || FlxG.keys.justPressed.H) {
        togglePauseHidden();
        inputCooldown = 0.12;
        return;
    }

    if (pauseHidden) {
        if (controls.BACK || controls.ACCEPT) togglePauseHidden();
        return;
    }

    if (quickOpen) updateQuick(elapsed);
    else updateMain(elapsed);
}

function updateMain(elapsed:Float) {
    var hovered:Int = -1;
    for (i in 0...menuBoxes.length) {
        if (mouseOverSprite(menuBoxes[i])) {
            hovered = i;
            break;
        }
    }

    // Hover is continuous instead of depending on justMoved, which makes
    // the pause menu reliable even when the camera or UI tween is moving.
    if (hovered >= 0 && curSelected != hovered) {
        curSelected = hovered;
        playScroll();
        refreshMainSelection();
    }

    if (FlxG.mouse.justPressed && hovered >= 0) {
        curSelected = hovered;
        refreshMainSelection();
        selectMain();
        inputCooldown = 0.14;
        return;
    }

    if (inputCooldown <= 0) {
        if (controls.UP_P || FlxG.mouse.wheel > 0) { changeMain(-1); inputCooldown = 0.10; }
        else if (controls.DOWN_P || FlxG.mouse.wheel < 0) { changeMain(1); inputCooldown = 0.10; }
        else if (controls.BACK) { close(); return; }
        else if (controls.ACCEPT) { selectMain(); inputCooldown = 0.14; return; }
    }

    for (i in 0...menuBoxes.length) {
        var selected:Bool = i == curSelected;
        menuBoxes[i].x = FlxMath.lerp(menuBoxes[i].x, selected ? 392 : 380, elapsed * 12);
        menuBoxes[i].color = FlxColor.interpolate(menuBoxes[i].color, selected ? 0xFF8DA6A8 : 0xFF51696B, elapsed * 12);
        menuTexts[i].x = menuBoxes[i].x + 24;
        menuTexts[i].color = selected ? 0xFF54E6CF : FlxColor.WHITE;
    }
}

function updateQuick(elapsed:Float) {
    var hovered:Int = -1;
    for (i in 0...quickBoxes.length) {
        if (mouseOverSprite(quickBoxes[i])) {
            hovered = i;
            break;
        }
    }

    if (hovered >= 0 && quickSelected != hovered) {
        quickSelected = hovered;
        playScroll();
        refreshQuickSelection();
    }

    if (FlxG.mouse.justPressed && hovered >= 0) {
        quickSelected = hovered;
        refreshQuickSelection();
        changeQuickValue();
        inputCooldown = 0.13;
        return;
    }

    if (inputCooldown <= 0) {
        if (controls.UP_P || FlxG.mouse.wheel > 0) { changeQuick(-1); inputCooldown = 0.10; }
        else if (controls.DOWN_P || FlxG.mouse.wheel < 0) { changeQuick(1); inputCooldown = 0.10; }
        else if (controls.LEFT_P || controls.RIGHT_P || controls.ACCEPT) {
            changeQuickValue();
            inputCooldown = 0.13;
        }
        else if (controls.BACK) {
            quickOpen = false;
            setQuickVisible(false);
            refreshMainSelection();
            footerText.text = "UP / DOWN  SELECT     ENTER  CONFIRM     ESC  RESUME";
            helperText.text = "Quick Options stay inside this pause menu.";
            playCancel();
            inputCooldown = 0.12;
            return;
        }
    }

    for (i in 0...quickBoxes.length) {
        var selected:Bool = i == quickSelected;
        quickBoxes[i].color = FlxColor.interpolate(quickBoxes[i].color, selected ? 0xFF8DA6A8 : 0xFF51696B, elapsed * 12);
        quickTexts[i].color = selected ? 0xFF54E6CF : FlxColor.WHITE;
        quickValues[i].color = selected ? 0xFF54E6CF : FlxColor.WHITE;
    }
}

function changeMain(change:Int) {
    curSelected += change;
    if (curSelected < 0) curSelected = menuNames.length - 1;
    if (curSelected >= menuNames.length) curSelected = 0;
    playScroll();
    refreshMainSelection();
}

function refreshMainSelection() {
    for (i in 0...menuTexts.length) menuTexts[i].color = i == curSelected ? 0xFF54E6CF : FlxColor.WHITE;
    var choice:String = menuNames[curSelected];
    if (choice == "QUICK OPTIONS") helperText.text = "Open Quick Options without leaving the song.";
    else if (choice == "RETURN TO CHART EDITOR") helperText.text = "Return to the Charter at the current chart data.";
    else helperText.text = "Game and song stay suspended while this menu is open.";
}

function selectMain() {
    var choice:String = menuNames[curSelected];
    switch(choice) {
        case "RESUME":
            close();
        case "RESTART SONG":
            game.registerSmoothTransition();
            FlxG.resetState();
        case "QUICK OPTIONS":
            quickOpen = true;
            quickSelected = 0;
            setQuickVisible(true);
            refreshQuickValues();
            refreshQuickSelection();
            footerText.text = "UP / DOWN  SELECT     LEFT / RIGHT / ENTER  CHANGE     ESC  BACK";
            helperText.text = "Changes are applied to the current song immediately.";
            playConfirm();
        case "CHANGE CONTROLS":
            playConfirm();
            openSubState(new KeybindsOptions());
        case "EXIT TO MENU":
            exitToCustomMenu();
        case "RETURN TO CHART EDITOR":
            returnToChartEditor();
    }
}

function setQuickVisible(value:Bool) {
    for (e in menuBoxes) e.visible = !value;
    for (e in menuTexts) e.visible = !value;
    for (e in quickBoxes) e.visible = value;
    for (e in quickTexts) e.visible = value;
    for (e in quickValues) e.visible = value;
    title.text = value ? "QUICK OPTIONS" : "PAUSED";
}

function changeQuick(change:Int) {
    quickSelected += change;
    if (quickSelected < 0) quickSelected = quickNames.length - 1;
    if (quickSelected >= quickNames.length) quickSelected = 0;
    playScroll();
    refreshQuickSelection();
}

function refreshQuickSelection() {
    for (i in 0...quickTexts.length) {
        quickTexts[i].color = i == quickSelected ? 0xFF54E6CF : FlxColor.WHITE;
        quickValues[i].color = i == quickSelected ? 0xFF54E6CF : FlxColor.WHITE;
    }
}

function changeQuickValue() {
    switch(quickSelected) {
        case 0: Options.downscroll = !Options.downscroll;
        case 1: Options.ghostTapping = !Options.ghostTapping;
        case 2: Options.splashesEnabled = !Options.splashesEnabled;
        case 3: Options.camZoomOnBeat = !Options.camZoomOnBeat;
        case 4: Options.gameplayShaders = !Options.gameplayShaders;
    }
    Options.applySettings();
    Options.save();
    applyCurrentSongSettings();
    refreshQuickValues();
    playScroll();
}

function applyCurrentSongSettings() {
    try {
        game.downscroll = Options.downscroll;
        game.ghostTapping = Options.ghostTapping;
        if (Options.ghostTapping) {
            game.comboBreaks = false;
            for (rating in game.ratingManager.ratingData) game.comboBreaks = game.comboBreaks || rating.breaksCombo;
        } else game.comboBreaks = true;
    } catch(e:Dynamic) {}
}

function refreshQuickValues() {
    if (quickValues.length < 5) return;
    quickValues[0].text = onOff(Options.downscroll);
    quickValues[1].text = onOff(Options.ghostTapping);
    quickValues[2].text = onOff(Options.splashesEnabled);
    quickValues[3].text = onOff(Options.camZoomOnBeat);
    quickValues[4].text = onOff(Options.gameplayShaders);
}

function togglePauseHidden() {
    pauseHidden = !pauseHidden;

    // Hidden really means hidden: no dark overlay, no terminal, no text.
    // The game and pause music remain suspended because the substate is still open.
    dim.alpha = pauseHidden ? 0 : 1;
    for (e in [terminal, title, currentSongText, footerText, helperText, crewLabel]) e.visible = !pauseHidden;
    for (e in menuBoxes) e.visible = !pauseHidden && !quickOpen;
    for (e in menuTexts) e.visible = !pauseHidden && !quickOpen;
    for (e in quickBoxes) e.visible = !pauseHidden && quickOpen;
    for (e in quickTexts) e.visible = !pauseHidden && quickOpen;
    for (e in quickValues) e.visible = !pauseHidden && quickOpen;

    crewArt.visible = true;
    crewArt.alpha = pauseHidden ? 0.96 : 0.9;

    if (pauseHidden) {
        crewArt.scale.set(crewBaseScaleX * 1.65, crewBaseScaleY * 1.65);
        crewArt.updateHitbox();
        crewArt.x = 1280 - crewArt.width - 22;
        crewArt.y = 720 - crewArt.height - 18;
    } else {
        crewArt.scale.set(crewBaseScaleX, crewBaseScaleY);
        crewArt.updateHitbox();
        crewArt.x = 910;
        crewArt.y = 535;
    }

    crewLabel.text = pauseHidden ? "SHOW" : "HIDE";
    crewLabel.visible = !pauseHidden;
    playScroll();
}

function mouseOverSprite(sprite:FlxSprite):Bool {
    if (sprite == null || !sprite.visible || sprite.alpha <= 0) return false;
    // PauseSubState is rendered by its own 1280x720 camera. Using overlaps()
    // here caused the mouse to inherit an extra camera offset on some builds.
    // Compare raw screen coordinates instead so the clickable area exactly
    // matches what is drawn on screen.
    var p = FlxG.mouse.getScreenPosition(pauseCam);
    return p.x >= sprite.x && p.x <= sprite.x + sprite.width
        && p.y >= sprite.y && p.y <= sprite.y + sprite.height;
}

function returnToChartEditor() {
    if (!PlayState.chartingMode) return;
    playConfirm();
    try {
        FlxG.switchState(new Charter(PlayState.SONG.meta.name, PlayState.difficulty, PlayState.variation, false));
    } catch(e:Dynamic) {
        close();
    }
}

function exitToCustomMenu() {
    playConfirm();
    var target:String = "freeplay";
    if (PlayState.isStoryMode || FlxG.save.data.amongReturnMenu == "story") target = "story";
    if (target == "story") FlxG.switchState(new ModState("AmongStoryMenu"));
    else FlxG.switchState(new ModState("AmongFreeplayState"));
}

function onOff(value:Bool):String { return value ? "ON" : "OFF"; }
function playScroll() { try { FlxG.sound.play(Paths.sound('scrollMenu'), 0.7); } catch(e:Dynamic) {} }
function playConfirm() { try { FlxG.sound.play(Paths.sound('confirmMenu'), 0.8); } catch(e:Dynamic) {} }
function playCancel() { try { FlxG.sound.play(Paths.sound('cancelMenu'), 0.8); } catch(e:Dynamic) {} }
