import flixel.FlxSprite;
import flixel.FlxG;
import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.util.FlxColor;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;
import flixel.util.FlxTimer;

import funkin.menus.ModState;
import funkin.game.PlayState;
import funkin.backend.week.Week;

var stars:Array<FlxSprite> = [];
var nodes:Array<FlxSprite> = [];
var nodeCenters:Array<FlxSprite> = [];
var nodeHitboxes:Array<FlxSprite> = [];
var curSelected:Int = 0;
var isTransitioning:Bool = false;

var shipCursor:FlxSprite;
var weekTitleText:FlxText;
var weekSubText:FlxText;
var scoreText:FlxText;
var songsText:FlxText;
var lockIcon:FlxSprite;
var statusText:FlxText;

var weeksData:Array<Dynamic> = [
    {name:"WEEK 1", sub:"POLUS PROBLEMS", songs:"Sussus Moogus  [SOON]\nSabotage\nDiscover\nMeltdown", x:150, y:550, locked:false, type:"story", weekFile:"amongfunk-week1"},
    {name:"WEEK 2", sub:"COMING SOON", songs:"???\n???", x:450, y:550, locked:true, type:"none", weekFile:""},
    {name:"BONUS", sub:"IMPOSTOR SYNDROME", songs:"Mando\nDlow", x:750, y:550, locked:true, type:"bonus", weekFile:""},
    {name:"WEEK 4", sub:"COMING SOON", songs:"???\n???", x:1050, y:550, locked:true, type:"none", weekFile:""}
];

function checkSaves() {
    weeksData[0].locked = false;
    weeksData[1].locked = true;
    weeksData[2].locked = FlxG.save.data.week1Completed != true;
    weeksData[3].locked = true;
}

function postCreate() {
    clear();
    FlxG.camera.target = null;
    FlxG.camera.scroll.set(0, 0);
    FlxG.camera.zoom = 1;

    try { funkin.backend.system.rpc.DiscordUtil.changePresence("In the Menus", "Story Mode"); } catch(e:Dynamic) {}
    try {
        if (FlxG.sound.music == null || !FlxG.sound.music.playing)
            FlxG.sound.playMusic(Paths.music('freakyMenu'), 0.8, true);
    } catch(e:Dynamic) {}
    try { FlxG.camera.fade(FlxColor.BLACK, 0.32, true); } catch(e:Dynamic) {}

    checkSaves();

    // The transition travels to the right, so keep real star field beyond 1280.
    var bg = new FlxSprite(0, 0).makeGraphic(2100, 720, 0xFF050510);
    add(bg);

    for (i in 0...210) {
        var star = new FlxSprite(FlxG.random.float(0, 2100), FlxG.random.float(0, 720));
        star.makeGraphic(FlxG.random.int(2, 3), FlxG.random.int(2, 3), FlxColor.WHITE);
        star.alpha = FlxG.random.float(0.1, 0.8);
        star.velocity.x = FlxG.random.float(-15, -5);
        add(star);
        stars.push(star);
    }

    var topPanel = new FlxSprite(20, 20).makeGraphic(1240, 220, 0xFF9EACAE);
    add(topPanel);
    var panelInner = new FlxSprite(26, 26).makeGraphic(1228, 208, 0xFFC0D1D4);
    add(panelInner);
    var panelBottom = new FlxSprite(0, 240).makeGraphic(1280, 7, FlxColor.WHITE);
    add(panelBottom);

    weekTitleText = new FlxText(0, 37, 1280, "", 66);
    weekTitleText.setFormat(Paths.font("vcr.ttf"), 66, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    weekTitleText.borderSize = 4;
    add(weekTitleText);

    weekSubText = new FlxText(0, 110, 1280, "", 34);
    weekSubText.setFormat(Paths.font("vcr.ttf"), 34, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    weekSubText.borderSize = 3;
    add(weekSubText);

    scoreText = new FlxText(45, 176, 450, "", 20);
    scoreText.setFormat(Paths.font("vcr.ttf"), 20, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    scoreText.borderSize = 2;
    add(scoreText);

    songsText = new FlxText(835, 42, 365, "", 24);
    songsText.setFormat(Paths.font("vcr.ttf"), 24, FlxColor.WHITE, "right", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    songsText.borderSize = 2;
    add(songsText);

    statusText = new FlxText(415, 183, 450, "", 17);
    statusText.setFormat(Paths.font("vcr.ttf"), 17, 0xFF365A59, "center");
    add(statusText);

    lockIcon = new FlxSprite(610, 132);
    try {
        lockIcon.loadGraphic(Paths.image('lock'));
        lockIcon.setGraphicSize(58, 58);
        lockIcon.updateHitbox();
    } catch(e:Dynamic) { lockIcon.makeGraphic(58, 58, 0xFF555555); }
    add(lockIcon);

    for (i in 0...weeksData.length - 1) {
        var start = weeksData[i];
        var end = weeksData[i + 1];
        var dotX:Float = start.x + 30;
        while (dotX < end.x - 20) {
            var dot = new FlxSprite(dotX, start.y - 3).makeGraphic(15, 6, FlxColor.WHITE);
            dot.alpha = 0.55;
            add(dot);
            dotX += 30;
        }
    }

    for (i in 0...weeksData.length) {
        var w = weeksData[i];
        var outer = new FlxSprite(w.x - 20, w.y - 20).makeGraphic(40, 40, FlxColor.WHITE);
        add(outer);
        nodes.push(outer);

        var inner = new FlxSprite(w.x - 15, w.y - 15).makeGraphic(30, 30, 0xFF51696B);
        add(inner);
        nodeCenters.push(inner);

        var label = new FlxText(w.x - 70, w.y + 38, 140, w.name, 15);
        label.setFormat(Paths.font("vcr.ttf"), 15, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        label.borderSize = 1;
        add(label);

        var hitbox = new FlxSprite(w.x - 40, w.y - 40).makeGraphic(80, 80, FlxColor.TRANSPARENT);
        add(hitbox);
        nodeHitboxes.push(hitbox);
    }

    shipCursor = new FlxSprite();
    try {
        shipCursor.loadGraphic(Paths.image('ship_icon'));
        shipCursor.setGraphicSize(62, 62);
        shipCursor.updateHitbox();
    } catch(e:Dynamic) { shipCursor.makeGraphic(62, 62, 0xFF54E6CF); }
    add(shipCursor);

    var hint = new FlxText(0, 665, 1280, "LEFT / RIGHT  SELECT WEEK      ENTER  START      ESC  BACK", 17);
    hint.setFormat(Paths.font("vcr.ttf"), 17, 0xFF8DA6A8, "center");
    add(hint);

    moveShip(false);
    updatePanel();
    updateNodes();
}

function update(elapsed:Float) {
    for (star in stars) if (star.x < -10) { star.x = 2100; star.y = FlxG.random.float(0, 720); }
    if (isTransitioning) return;

    if (controls.BACK) {
        isTransitioning = true;
        FlxG.sound.play(Paths.sound('cancelMenu'));
        FlxG.switchState(new ModState("AmongMainMenuState"));
        return;
    }

    var left = FlxG.keys.justPressed.LEFT || FlxG.keys.justPressed.A || FlxG.mouse.wheel > 0;
    var right = FlxG.keys.justPressed.RIGHT || FlxG.keys.justPressed.D || FlxG.mouse.wheel < 0;
    if (left) changeSelection(-1);
    if (right) changeSelection(1);

    if (FlxG.mouse.justMoved) {
        for (i in 0...nodeHitboxes.length) {
            if (FlxG.mouse.overlaps(nodeHitboxes[i]) && curSelected != i) {
                curSelected = i;
                FlxG.sound.play(Paths.sound('scrollMenu'));
                moveShip(true);
                updatePanel();
                updateNodes();
            }
        }
    }

    if (FlxG.mouse.justPressed) {
        for (i in 0...nodeHitboxes.length) {
            if (FlxG.mouse.overlaps(nodeHitboxes[i])) {
                if (curSelected == i) selectWeek();
                else {
                    curSelected = i;
                    FlxG.sound.play(Paths.sound('scrollMenu'));
                    moveShip(true);
                    updatePanel();
                    updateNodes();
                }
                break;
            }
        }
    }

    if (controls.ACCEPT) selectWeek();
}

function changeSelection(change:Int) {
    curSelected += change;
    if (curSelected < 0) curSelected = weeksData.length - 1;
    if (curSelected >= weeksData.length) curSelected = 0;
    FlxG.sound.play(Paths.sound('scrollMenu'));
    moveShip(true);
    updatePanel();
    updateNodes();
}

function moveShip(animated:Bool) {
    var targetX:Float = weeksData[curSelected].x - (shipCursor.width / 2);
    var targetY:Float = weeksData[curSelected].y - 86;
    FlxTween.cancelTweensOf(shipCursor);
    if (animated) FlxTween.tween(shipCursor, {x: targetX, y: targetY}, 0.28, {ease: FlxEase.quadOut});
    else shipCursor.setPosition(targetX, targetY);
}

function updateNodes() {
    checkSaves();
    for (i in 0...weeksData.length) {
        var locked:Bool = weeksData[i].locked;
        nodes[i].alpha = locked ? 0.45 : 1;
        nodeCenters[i].alpha = locked ? 0.45 : 1;
        nodeCenters[i].color = locked ? FlxColor.BLACK : (i == curSelected ? 0xFF54E6CF : 0xFF51696B);
        var selectedScale:Float = i == curSelected ? 1.2 : 1;
        nodes[i].scale.set(selectedScale, selectedScale);
    }
}

function updatePanel() {
    checkSaves();
    var w = weeksData[curSelected];

    if (w.locked) {
        weekTitleText.text = "???";
        weekSubText.text = w.sub;
        songsText.text = "???\n???\n???";
        scoreText.text = "LOCKED";
        statusText.text = "Complete the required week or wait for a future update.";
        statusText.color = 0xFF783D3D;
        lockIcon.visible = true;
    } else {
        weekTitleText.text = w.name;
        weekSubText.text = w.sub;
        songsText.text = w.songs;
        scoreText.text = w.type == "story" ? "WEEK 1  /  3 SONGS PLAYABLE" : "BONUS SONGS";
        statusText.text = w.type == "story" ? "Sussus Moogus will be added when its chart is ready." : "Press ENTER to open the Bonus songs.";
        statusText.color = 0xFF365A59;
        lockIcon.visible = false;
    }
}

function selectWeek() {
    checkSaves();
    var w = weeksData[curSelected];

    if (w.locked || w.type == "none") {
        FlxG.sound.play(Paths.sound('cancelMenu'));
        FlxG.camera.shake(0.006, 0.15);
        return;
    }

    if (w.type == "bonus") {
        isTransitioning = true;
        FlxG.sound.play(Paths.sound('confirmMenu'));
        FlxG.save.data.amongFreeplayStartWeek = 2;
        FlxG.save.flush();

        // Ship moves first; the camera chases it a moment later.
        FlxTween.tween(shipCursor, {x: 1510}, 0.46, {ease: FlxEase.circIn});
        new FlxTimer().start(0.16, function(tmr) {
            FlxTween.tween(FlxG.camera.scroll, {x: 470}, 0.58, {ease: FlxEase.circInOut});
        });
        new FlxTimer().start(0.42, function(tmr) {
            FlxG.camera.fade(FlxColor.BLACK, 0.36, false, function() {
                FlxG.switchState(new ModState("AmongFreeplayState"));
            });
        });
        return;
    }

    if (w.type == "story") {
        var weekData = Week.loadWeek(w.weekFile, false);
        if (weekData == null) {
            FlxG.sound.play(Paths.sound('cancelMenu'));
            statusText.text = "The Week 1 data could not be loaded.";
            statusText.color = 0xFF8A3D3D;
            return;
        }

        isTransitioning = true;
        FlxG.sound.play(Paths.sound('confirmMenu'));
        FlxG.save.data.amongReturnMenu = "story";
        FlxG.save.flush();

        PlayState.loadWeek(weekData, "hard");
        if (FlxG.sound.music != null) FlxG.sound.music.fadeOut(0.58, 0);

        // Staged launch: the ship leaves first, then the camera follows it to
        // the right through real stars. The black fade only starts near the end.
        FlxTween.tween(shipCursor, {x: 1540}, 0.48, {ease: FlxEase.circIn});
        new FlxTimer().start(0.17, function(tmr) {
            FlxTween.tween(FlxG.camera.scroll, {x: 520}, 0.60, {ease: FlxEase.circInOut});
        });
        new FlxTimer().start(0.43, function(tmr) {
            FlxG.camera.fade(FlxColor.BLACK, 0.37, false, function() {
                FlxG.switchState(new PlayState());
            });
        });
    }
}
