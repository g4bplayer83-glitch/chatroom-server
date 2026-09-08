import flixel.FlxSprite;
import flixel.FlxG;
import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.util.FlxColor;
import flixel.util.FlxTimer;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;
import flixel.math.FlxMath;

import funkin.menus.ModState;
import funkin.menus.credits.CreditsMain;
import funkin.editors.EditorPicker;
import funkin.menus.ModSwitchMenu;

var characterYOffset:Float = 90;
var logoYPosition:Float = 18;
var panelYPosition:Float = 245;
var buttonStartYOffset:Float = 25;
var buttonSpacing:Float = 75;

var stars:Array<FlxSprite> = [];
var buttons:Array<FlxSprite> = [];
var curSelected:Int = 0;
var isTransitioning:Bool = false;
var patchOpen:Bool = false;
var patchClosing:Bool = false;

var centralPanel:FlxSprite;
var logo:FlxSprite;
var mainArtSprite:FlxSprite;
var versionText:FlxText;
var patchButtonOuter:FlxSprite;
var patchButtonInner:FlxSprite;
var patchButtonText:FlxText;
var patchButtonIcon:FlxSprite;

var patchDim:FlxSprite;
var patchPanel:FlxSprite;
var patchTitle:FlxText;
var patchVersion:FlxText;
var patchBody:FlxText;
var patchHint:FlxText;
var patchClose:FlxSprite;
var patchCrew:FlxSprite;
var patchLineTop:FlxSprite;
var patchLineBottom:FlxSprite;
var patchElements:Array<Dynamic> = [];

function postCreate() {
    try { funkin.backend.system.rpc.DiscordUtil.changePresence("In the Menus", "Main Menu"); } catch(e:Dynamic) {}

    for (m in members) if (m != null) { m.visible = false; m.active = false; }
    clear();
    FlxG.camera.target = null;
    FlxG.camera.scroll.set(0, 0);
    FlxG.camera.zoom = 1;

    // Always restore the real Main Menu theme. This prevents Options/Freeplay/Credits
    // music from leaking back into this menu.
    try {
        FlxG.sound.playMusic(Paths.music('freakyMenu'), 0.8, true);
    } catch(e:Dynamic) {}
    try { FlxG.camera.fade(FlxColor.BLACK, 0.34, true); } catch(e:Dynamic) {}

    // Extra sky exists above the normal menu so the camera can actually
    // fly upward through stars during transitions instead of revealing empty black.
    var bg = new FlxSprite(0, -720).makeGraphic(1280, 1440, 0xFF050510);
    add(bg);

    for (i in 0...140) {
        var star = new FlxSprite(FlxG.random.float(0, 1280), FlxG.random.float(-680, 720));
        star.makeGraphic(FlxG.random.int(2, 3), FlxG.random.int(2, 3), FlxColor.WHITE);
        star.alpha = FlxG.random.float(0.3, 1);
        star.velocity.x = FlxG.random.float(-30, -10);
        add(star);
        stars.push(star);
    }

    centralPanel = new FlxSprite();
    try { centralPanel.loadGraphic(Paths.image('Menu_Corner')); }
    catch(e:Dynamic) { centralPanel.makeGraphic(431, 464, 0xFF51696B); }
    centralPanel.screenCenter(FlxAxes.X);
    centralPanel.y = panelYPosition;
    add(centralPanel);

    logo = new FlxSprite(0, logoYPosition);
    try { logo.loadGraphic(Paths.image('logo')); }
    catch(e:Dynamic) { logo.makeGraphic(400, 150, FlxColor.WHITE); }
    logo.screenCenter(FlxAxes.X);
    logo.scale.set(0.42, 0.42);
    logo.updateHitbox();
    logo.screenCenter(FlxAxes.X);
    add(logo);

    var buttonImages = ["Menu_Story", "Menu_Freeplay", "Menu_Settings", "Menu_Credits", "Gallery"];
    for (i in 0...5) {
        var btn = new FlxSprite();
        try { btn.loadGraphic(Paths.image(buttonImages[i])); }
        catch(e:Dynamic) { btn.makeGraphic(280, 50, 0xFF51696B); }
        btn.x = centralPanel.x + (centralPanel.width - btn.width) / 2;
        btn.y = centralPanel.y + buttonStartYOffset + (i * buttonSpacing);
        btn.updateHitbox();
        add(btn);
        buttons.push(btn);
    }

    mainArtSprite = new FlxSprite(0, 0);
    try {
        mainArtSprite.frames = Paths.getSparrowAtlas('MenuMainArt');
        mainArtSprite.animation.addByPrefix('idle', 'Idle', 4, true);
        mainArtSprite.animation.addByPrefix('confirm', 'Confirm', 14, false);
        mainArtSprite.animation.play('idle');
        // Keep the menu characters still until a selection is confirmed.
        mainArtSprite.animation.pause();
    } catch(e:Dynamic) {}
    mainArtSprite.screenCenter(FlxAxes.X);
    mainArtSprite.y = (FlxG.height - mainArtSprite.height) + characterYOffset;
    add(mainArtSprite);

    versionText = new FlxText(1010, 18, 240, "DEMO 1  /  v0.1.0", 16);
    versionText.setFormat(Paths.font("vcr.ttf"), 16, 0xFF8DA6A8, "right");
    add(versionText);

    patchButtonOuter = new FlxSprite(1010, 631).makeGraphic(224, 50, 0xFF2B3435);
    add(patchButtonOuter);
    patchButtonInner = new FlxSprite(1014, 635).makeGraphic(216, 42, 0xFF51696B);
    add(patchButtonInner);

    patchButtonIcon = new FlxSprite(1024, 643);
    try {
        patchButtonIcon.loadGraphic(Paths.image('ship_icon'));
        patchButtonIcon.setGraphicSize(26, 26);
        patchButtonIcon.updateHitbox();
    } catch(e:Dynamic) { patchButtonIcon.makeGraphic(26, 26, 0xFF59E6D0); }
    add(patchButtonIcon);

    patchButtonText = new FlxText(1056, 644, 160, "PATCH NOTES", 18);
    patchButtonText.setFormat(Paths.font("vcr.ttf"), 18, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    patchButtonText.borderSize = 1;
    add(patchButtonText);

    createPatchOverlay();
    setPatchVisible(false, false);
    changeSelection(0);
}

function createPatchOverlay() {
    patchDim = new FlxSprite(0, 0).makeGraphic(1280, 720, 0xD9000000);
    add(patchDim);

    patchPanel = new FlxSprite();
    try {
        patchPanel.loadGraphic(Paths.image('Menu_Corner'));
        patchPanel.setGraphicSize(900, 535);
        patchPanel.updateHitbox();
    } catch(e:Dynamic) { patchPanel.makeGraphic(900, 535, 0xFF1D2425); }
    patchPanel.x = 190;
    patchPanel.y = 95;
    add(patchPanel);

    patchLineTop = new FlxSprite(245, 178).makeGraphic(790, 4, 0xFF54E6CF);
    add(patchLineTop);
    patchLineBottom = new FlxSprite(245, 555).makeGraphic(790, 3, 0xFF51696B);
    add(patchLineBottom);

    patchTitle = new FlxText(245, 123, 560, "PATCH NOTES", 40);
    patchTitle.setFormat(Paths.font("vcr.ttf"), 40, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    patchTitle.borderSize = 2;
    add(patchTitle);

    patchVersion = new FlxText(760, 138, 250, "DEMO 1  /  v0.1.0", 18);
    patchVersion.setFormat(Paths.font("vcr.ttf"), 18, 0xFF8DA6A8, "right");
    add(patchVersion);

    patchBody = new FlxText(255, 205, 700,
        "DEMO 1 - CURRENT FIX\n" +
        "- New disconnected / reconnected death screen.\n" +
        "- Custom Among Funk pause music + centered pause panel.\n" +
        "- Quick Options stay hidden until selected.\n" +
        "- Purple impostor can hide the pause UI without resuming.\n\n" +
        "MENUS\n" +
        "- Custom Options theme and fixed music when returning to Main Menu.\n" +
        "- Cleaner Main Menu transition and Story ship departure.\n\n" +
        "GAMEPLAY\n" +
        "- New Among Us HUD with song title and TOTAL TASKS COMPLETED bar.\n" +
        "- P still toggles BotPlay during songs.", 17);
    patchBody.setFormat(Paths.font("vcr.ttf"), 17, 0xFFE7EEEE, "left");
    patchBody.wordWrap = true;
    add(patchBody);

    patchHint = new FlxText(280, 573, 650, "P / ESC / BACK TO CLOSE", 15);
    patchHint.setFormat(Paths.font("vcr.ttf"), 15, 0xFF8DA6A8, "center");
    add(patchHint);

    patchClose = new FlxSprite(1002, 116);
    try {
        patchClose.loadGraphic(Paths.image('close_btn'));
        patchClose.setGraphicSize(48, 48);
        patchClose.updateHitbox();
    } catch(e:Dynamic) { patchClose.makeGraphic(48, 48, 0xFFFF5555); }
    add(patchClose);

    patchCrew = new FlxSprite(935, 425);
    try {
        patchCrew.loadGraphic(Paths.image('impostor_float'));
        patchCrew.setGraphicSize(105, 105);
        patchCrew.updateHitbox();
    } catch(e:Dynamic) { patchCrew.makeGraphic(105, 105, 0xFFB84CFF); }
    patchCrew.alpha = 0.82;
    add(patchCrew);

    patchElements = [patchDim, patchPanel, patchLineTop, patchLineBottom, patchTitle, patchVersion, patchBody, patchHint, patchClose, patchCrew];
}

function setPatchVisible(value:Bool, animate:Bool) {
    patchOpen = value;
    patchClosing = false;
    for (e in patchElements) if (e != null) e.visible = value;
    if (!value) return;

    if (!animate) return;
    patchDim.alpha = 0;
    patchPanel.alpha = 0;
    patchPanel.y = 108;
    for (e in [patchLineTop, patchLineBottom, patchTitle, patchVersion, patchBody, patchHint, patchClose, patchCrew]) e.alpha = 0;

    FlxTween.tween(patchDim, {alpha: 1}, 0.15, {ease: FlxEase.quadOut});
    FlxTween.tween(patchPanel, {alpha: 1, y: 95}, 0.20, {ease: FlxEase.quadOut});
    for (e in [patchLineTop, patchLineBottom, patchTitle, patchVersion, patchBody, patchHint, patchClose])
        FlxTween.tween(e, {alpha: 1}, 0.22, {ease: FlxEase.quadOut});
    FlxTween.tween(patchCrew, {alpha: 0.82}, 0.28, {ease: FlxEase.quadOut});
    FlxTween.tween(patchCrew, {y: 421}, 1.4, {ease: FlxEase.sineInOut, type: 4});
}

function closePatch() {
    if (!patchOpen || patchClosing) return;
    patchClosing = true;
    FlxG.sound.play(Paths.sound('cancelMenu'));
    FlxTween.tween(patchDim, {alpha: 0}, 0.12);
    FlxTween.tween(patchPanel, {alpha: 0, y: 104}, 0.14, {ease: FlxEase.quadIn, onComplete: function(twn:FlxTween) {
        setPatchVisible(false, false);
    }});
    for (e in [patchLineTop, patchLineBottom, patchTitle, patchVersion, patchBody, patchHint, patchClose, patchCrew])
        FlxTween.tween(e, {alpha: 0}, 0.10);
}

function update(elapsed:Float) {
    for (star in stars) {
        if (star.x < -10) { star.x = 1290; star.y = FlxG.random.float(-680, 720); }
    }

    if (patchOpen) {
        if (controls.BACK || FlxG.keys.justPressed.P || (FlxG.mouse.justPressed && FlxG.mouse.overlaps(patchClose))) closePatch();
        return;
    }

    if (FlxG.keys.justPressed.SEVEN) { openSubState(new EditorPicker()); return; }
    if (FlxG.keys.justPressed.TAB) { openSubState(new ModSwitchMenu()); return; }
    if (FlxG.keys.justPressed.P) {
        FlxG.sound.play(Paths.sound('confirmMenu'));
        setPatchVisible(true, true);
        return;
    }

    var overPatch:Bool = FlxG.mouse.overlaps(patchButtonOuter);
    patchButtonInner.color = overPatch ? 0xFF8DA6A8 : 0xFF51696B;
    patchButtonText.color = overPatch ? 0xFF54E6CF : FlxColor.WHITE;
    if (FlxG.mouse.justPressed && overPatch) {
        FlxG.sound.play(Paths.sound('confirmMenu'));
        setPatchVisible(true, true);
        return;
    }

    if (isTransitioning) return;

    if (controls.BACK) {
        isTransitioning = true;
        FlxG.sound.play(Paths.sound('cancelMenu'));
        FlxG.switchState(new ModState("AmongTitleState"));
        return;
    }

    var up = FlxG.keys.justPressed.UP || FlxG.keys.justPressed.W || FlxG.mouse.wheel > 0;
    var down = FlxG.keys.justPressed.DOWN || FlxG.keys.justPressed.S || FlxG.mouse.wheel < 0;
    var accepted = FlxG.keys.justPressed.ENTER;

    if (up) changeSelection(-1);
    if (down) changeSelection(1);

    if (FlxG.mouse.justMoved && !overPatch) {
        for (i in 0...buttons.length) {
            if (FlxG.mouse.overlaps(buttons[i]) && curSelected != i) {
                curSelected = i;
                FlxG.sound.play(Paths.sound('scrollMenu'));
            }
        }
    }

    if (FlxG.mouse.justPressed && !overPatch) {
        for (i in 0...buttons.length) {
            if (FlxG.mouse.overlaps(buttons[i])) { curSelected = i; accepted = true; }
        }
    }

    for (i in 0...buttons.length) {
        if (i == curSelected) {
            buttons[i].color = FlxColor.interpolate(buttons[i].color, 0xFF63E5D4, elapsed * 10);
            buttons[i].scale.set(FlxMath.lerp(buttons[i].scale.x, 1.08, elapsed * 12), FlxMath.lerp(buttons[i].scale.y, 1.08, elapsed * 12));
            buttons[i].alpha = 1;
        } else {
            buttons[i].color = FlxColor.interpolate(buttons[i].color, FlxColor.WHITE, elapsed * 10);
            buttons[i].scale.set(FlxMath.lerp(buttons[i].scale.x, 1, elapsed * 12), FlxMath.lerp(buttons[i].scale.y, 1, elapsed * 12));
            buttons[i].alpha = 0.8;
        }
    }

    if (accepted) {
        isTransitioning = true;
        FlxG.sound.play(Paths.sound('confirmMenu'));
        if (mainArtSprite != null) mainArtSprite.animation.play('confirm');

        // 1) very short smooth zoom pulse (CircOut), 2) return to normal,
        // 3) camera flies upward through the extended star field,
        // 4) black fade starts late so the stars remain visible during the lift.
        FlxTween.tween(FlxG.camera, {zoom: 1.075}, 0.18, {ease: FlxEase.circOut, onComplete: function(twn:FlxTween) {
            FlxTween.tween(FlxG.camera, {zoom: 1.0}, 0.20, {ease: FlxEase.circInOut});
        }});
        FlxTween.tween(buttons[curSelected], {alpha: 0.45}, 0.18, {ease: FlxEase.circOut});

        new FlxTimer().start(0.28, function(tmr:FlxTimer) {
            FlxTween.tween(FlxG.camera.scroll, {y: -430}, 0.52, {ease: FlxEase.circIn});
        });

        new FlxTimer().start(0.50, function(tmr:FlxTimer) {
            FlxG.camera.fade(FlxColor.BLACK, 0.34, false, function() {
                switch(curSelected) {
                    case 0: FlxG.switchState(new ModState("AmongStoryMenu"));
                    case 1: FlxG.switchState(new ModState("AmongFreeplayState"));
                    case 2: FlxG.switchState(new ModState("AmongOptionsState"));
                    case 3: FlxG.switchState(new CreditsMain());
                    case 4: FlxG.switchState(new ModState("AmongGalleryState"));
                }
            });
        });
    }
}

function changeSelection(change:Int) {
    curSelected += change;
    if (curSelected < 0) curSelected = 4;
    if (curSelected >= 5) curSelected = 0;
    if (change != 0) FlxG.sound.play(Paths.sound('scrollMenu'));
}
