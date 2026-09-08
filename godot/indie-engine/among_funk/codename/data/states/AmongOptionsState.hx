import flixel.FlxSprite;
import flixel.FlxG;
import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.util.FlxColor;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;
import flixel.math.FlxMath;

import funkin.menus.ModState;
import funkin.options.Options;
import funkin.options.OptionsMenu;

var stars:Array<FlxSprite> = [];
var optionBoxes:Array<FlxSprite> = [];
var optionTexts:Array<FlxText> = [];
var valueTexts:Array<FlxText> = [];

var optionNames:Array<String> = [
    "DOWN SCROLL",
    "GHOST TAPPING",
    "NOTE SPLASHES",
    "CAMERA BEAT ZOOM",
    "GAMEPLAY SHADERS",
    "FPS COUNTER",
    "GRAPHICS QUALITY",
    "FRAMERATE",
    "CODENAME OPTIONS"
];

var optionDescriptions:Array<String> = [
    "Put your notes at the bottom of the screen.",
    "Pressing a key with no note nearby will not count as a miss.",
    "Show note splashes on accurate hits.",
    "Let the camera zoom slightly with the beat.",
    "Enable gameplay shaders and visual effects.",
    "Show or hide Codename Engine's FPS counter.",
    "LOW reduces effects. HIGH keeps the full visual quality.",
    "Choose the maximum framerate used by the engine.",
    "Open Codename Engine's complete Options and Controls menu."
];

var curSelected:Int = 0;
var isTransitioning:Bool = false;
var descText:FlxText;
var pageTitle:FlxText;
var leftPanel:FlxSprite;
var rightPanel:FlxSprite;
var crewArt:FlxSprite;

function postCreate() {
    clear();
    FlxG.camera.target = null;
    FlxG.camera.scroll.set(0, 0);
    FlxG.camera.zoom = 1;

    // Dedicated Among Funk Options theme supplied with the patch.
    try { FlxG.sound.playMusic(Paths.music('optionsTheme'), 0.78, true); } catch(e:Dynamic) {}
    try { FlxG.camera.fade(FlxColor.BLACK, 0.28, true); } catch(e:Dynamic) {}

    try { funkin.backend.system.rpc.DiscordUtil.changePresence("In the Menus", "Options"); } catch(e:Dynamic) {}

    var bg = new FlxSprite(0, 0).makeGraphic(1280, 720, 0xFF050510);
    add(bg);

    for (i in 0...95) {
        var star = new FlxSprite(FlxG.random.float(0, 1280), FlxG.random.float(0, 720));
        star.makeGraphic(FlxG.random.int(2, 3), FlxG.random.int(2, 3), FlxColor.WHITE);
        star.alpha = FlxG.random.float(0.2, 0.85);
        star.velocity.x = FlxG.random.float(-28, -8);
        add(star);
        stars.push(star);
    }

    pageTitle = new FlxText(0, 26, 1280, "OPTIONS", 52);
    pageTitle.setFormat(Paths.font("vcr.ttf"), 52, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    pageTitle.borderSize = 3;
    add(pageTitle);

    var sub = new FlxText(0, 82, 1280, "AMONG FUNK SETTINGS  /  DEMO 1", 16);
    sub.setFormat(Paths.font("vcr.ttf"), 16, 0xFF8DA6A8, "center");
    add(sub);

    leftPanel = new FlxSprite();
    try {
        leftPanel.loadGraphic(Paths.image('Menu_Corner'));
        leftPanel.setGraphicSize(790, 550);
        leftPanel.updateHitbox();
    } catch(e:Dynamic) { leftPanel.makeGraphic(790, 550, 0xFF20292A); }
    leftPanel.x = 38;
    leftPanel.y = 120;
    add(leftPanel);

    rightPanel = new FlxSprite();
    try {
        rightPanel.loadGraphic(Paths.image('Menu_Corner'));
        rightPanel.setGraphicSize(375, 430);
        rightPanel.updateHitbox();
    } catch(e:Dynamic) { rightPanel.makeGraphic(375, 430, 0xFF20292A); }
    rightPanel.x = 864;
    rightPanel.y = 180;
    add(rightPanel);

    crewArt = new FlxSprite(968, 205);
    try {
        crewArt.loadGraphic(Paths.image('impostor_float'));
        crewArt.setGraphicSize(150, 150);
        crewArt.updateHitbox();
    } catch(e:Dynamic) { crewArt.makeGraphic(150, 150, 0xFFB14BFF); }
    add(crewArt);

    var about = new FlxText(900, 355, 305, "ABOUT THIS OPTION", 20);
    about.setFormat(Paths.font("vcr.ttf"), 20, 0xFF54E6CF, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    about.borderSize = 1;
    add(about);

    descText = new FlxText(902, 400, 300, "", 18);
    descText.setFormat(Paths.font("vcr.ttf"), 18, FlxColor.WHITE, "center");
    descText.wordWrap = true;
    add(descText);

    var controlsText = new FlxText(900, 535, 305, "UP / DOWN   SELECT\nLEFT / RIGHT   CHANGE\nENTER   TOGGLE\nESC   BACK", 15);
    controlsText.setFormat(Paths.font("vcr.ttf"), 15, 0xFF8DA6A8, "center");
    add(controlsText);

    for (i in 0...optionNames.length) {
        var box = new FlxSprite(80, 148 + (i * 54)).makeGraphic(705, 44, 0xFF51696B);
        add(box);
        optionBoxes.push(box);

        var txt = new FlxText(100, box.y + 10, 430, optionNames[i], 20);
        txt.setFormat(Paths.font("vcr.ttf"), 20, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        txt.borderSize = 1;
        add(txt);
        optionTexts.push(txt);

        var val = new FlxText(530, box.y + 10, 225, "", 20);
        val.setFormat(Paths.font("vcr.ttf"), 20, FlxColor.WHITE, "right", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        val.borderSize = 1;
        add(val);
        valueTexts.push(val);
    }

    refreshValues();
    changeSelection(0);

    leftPanel.alpha = 0;
    rightPanel.alpha = 0;
    FlxTween.tween(leftPanel, {alpha: 1}, 0.24, {ease: FlxEase.quadOut});
    FlxTween.tween(rightPanel, {alpha: 1}, 0.28, {ease: FlxEase.quadOut});
}

function update(elapsed:Float) {
    for (star in stars) if (star.x < -10) { star.x = 1290; star.y = FlxG.random.float(0, 720); }
    if (isTransitioning) return;

    if (controls.BACK) {
        isTransitioning = true;
        Options.save();
        Options.applySettings();
        FlxG.sound.play(Paths.sound('cancelMenu'));
        try { if (FlxG.sound.music != null) FlxG.sound.music.fadeOut(0.24, 0); } catch(e:Dynamic) {}
        FlxG.camera.fade(FlxColor.BLACK, 0.3, false, function() {
            FlxG.switchState(new ModState("AmongMainMenuState"));
        });
        return;
    }

    var up = FlxG.keys.justPressed.UP || FlxG.keys.justPressed.W || FlxG.mouse.wheel > 0;
    var down = FlxG.keys.justPressed.DOWN || FlxG.keys.justPressed.S || FlxG.mouse.wheel < 0;
    var left = FlxG.keys.justPressed.LEFT || FlxG.keys.justPressed.A;
    var right = FlxG.keys.justPressed.RIGHT || FlxG.keys.justPressed.D;
    var accepted = controls.ACCEPT;

    if (up) changeSelection(-1);
    if (down) changeSelection(1);

    for (i in 0...optionBoxes.length) {
        if (FlxG.mouse.overlaps(optionBoxes[i])) {
            if (curSelected != i && FlxG.mouse.justMoved) {
                curSelected = i;
                FlxG.sound.play(Paths.sound('scrollMenu'));
                changeSelection(0);
            }
            if (FlxG.mouse.justPressed) accepted = true;
        }
    }

    if (left) changeValue(-1);
    if (right) changeValue(1);

    if (accepted) {
        if (curSelected == 8) {
            isTransitioning = true;
            Options.save();
            Options.applySettings();
            FlxG.sound.play(Paths.sound('confirmMenu'));
            FlxG.switchState(new OptionsMenu());
            return;
        }
        changeValue(1);
    }

    for (i in 0...optionBoxes.length) {
        var selected:Bool = i == curSelected;
        var targetX:Float = selected ? 94 : 80;
        optionBoxes[i].x = FlxMath.lerp(optionBoxes[i].x, targetX, elapsed * 12);
        optionBoxes[i].color = FlxColor.interpolate(optionBoxes[i].color, selected ? 0xFF8DA6A8 : 0xFF51696B, elapsed * 12);
        optionBoxes[i].alpha = selected ? 1 : 0.72;
        optionTexts[i].x = optionBoxes[i].x + 20;
        valueTexts[i].x = optionBoxes[i].x + 450;
        optionTexts[i].color = selected ? 0xFF54E6CF : FlxColor.WHITE;
        valueTexts[i].color = selected ? 0xFF54E6CF : FlxColor.WHITE;
    }
}

function changeSelection(change:Int) {
    curSelected += change;
    if (curSelected < 0) curSelected = optionNames.length - 1;
    if (curSelected >= optionNames.length) curSelected = 0;
    if (change != 0) FlxG.sound.play(Paths.sound('scrollMenu'));
    descText.text = optionDescriptions[curSelected];
    refreshValues();
}

function changeValue(dir:Int) {
    if (curSelected == 8) return;

    switch(curSelected) {
        case 0: Options.downscroll = !Options.downscroll;
        case 1: Options.ghostTapping = !Options.ghostTapping;
        case 2: Options.splashesEnabled = !Options.splashesEnabled;
        case 3: Options.camZoomOnBeat = !Options.camZoomOnBeat;
        case 4: Options.gameplayShaders = !Options.gameplayShaders;
        case 5: Options.fpsCounter = !Options.fpsCounter;
        case 6: Options.quality = Options.quality == 0 ? 1 : 0;
        case 7:
            var fpsChoices:Array<Int> = [60, 120, 144, 165, 240];
            var idx = fpsChoices.indexOf(Options.framerate);
            if (idx < 0) idx = 1;
            idx += dir;
            if (idx < 0) idx = fpsChoices.length - 1;
            if (idx >= fpsChoices.length) idx = 0;
            Options.framerate = fpsChoices[idx];
    }

    Options.applySettings();
    Options.save();
    FlxG.sound.play(Paths.sound('scrollMenu'));
    refreshValues();
}

function refreshValues() {
    if (valueTexts.length < 9) return;
    valueTexts[0].text = onOff(Options.downscroll);
    valueTexts[1].text = onOff(Options.ghostTapping);
    valueTexts[2].text = onOff(Options.splashesEnabled);
    valueTexts[3].text = onOff(Options.camZoomOnBeat);
    valueTexts[4].text = onOff(Options.gameplayShaders);
    valueTexts[5].text = onOff(Options.fpsCounter);
    valueTexts[6].text = Options.quality == 0 ? "LOW" : "HIGH";
    valueTexts[7].text = Std.string(Options.framerate) + " FPS";
    valueTexts[8].text = "OPEN  >";
}

function onOff(value:Bool):String { return value ? "ON" : "OFF"; }
