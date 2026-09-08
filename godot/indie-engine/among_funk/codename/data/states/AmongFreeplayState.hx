import flixel.FlxSprite;
import flixel.FlxG;
import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.util.FlxColor;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;
import flixel.math.FlxMath;
import flixel.effects.FlxFlicker;
import StringTools;

import funkin.menus.ModState;
import funkin.game.PlayState;
import funkin.options.Options;
import funkin.savedata.FunkinSave;

var stars:Array<FlxSprite> = [];
var songBoxes:Array<FlxSprite> = [];
var songTexts:Array<FlxText> = [];
var statusTexts:Array<FlxText> = [];

var weekNames:Array<String> = ["WEEK 1", "WEEK 2", "BONUS", "WEEK 4"];
var weekSongs:Array<Array<String>> = [
    ["Sussus Moogus", "Sabotage", "Discover", "Meltdown"],
    ["good-times", "no-more-tasks"],
    ["Mando", "Dlow"],
    ["???", "???"]
];
var weekFolders:Array<Array<String>> = [
    ["", "Sabotage", "Discover", "Meltdown"],
    ["", ""],
    ["mando", "Dlow"],
    ["", ""]
];
var weekDiffs:Array<Array<String>> = [
    ["", "hard", "hard", "hard"],
    ["", ""],
    ["mando", "hard"],
    ["", ""]
];

var creditSongs:Array<String> = [];
var creditCreators:Array<String> = [];
var creditCharters:Array<String> = [];

var curWeek:Int = 0;
var curSelected:Int = 0;
var isTransitioning:Bool = false;
var unlockAnimActive:Bool = false;
var glitchTick:Float = 0;

var weekBg:FlxSprite;
var topStrip:FlxSprite;
var darkShade:FlxSprite;
var charSprite:FlxSprite;
var headerText:FlxText;
var weekText:FlxText;
var infoText:FlxText;
var leftArrow:FlxText;
var rightArrow:FlxText;
var weekStatusText:FlxText;
var songTitle:FlxText;
var creatorText:FlxText;
var charterText:FlxText;
var difficultyText:FlxText;
var scoreText:FlxText;
var availabilityText:FlxText;
var helpText:FlxText;
var bannerPanel:FlxSprite;
var listBorder:FlxSprite;
var listPanel:FlxSprite;
var glitchOverlay:FlxText;
var unlockPopupBg:FlxSprite;
var unlockPopup:FlxText;

function postCreate() {
    clear();
    FlxG.camera.target = null;
    FlxG.camera.scroll.set(0, 0);
    FlxG.camera.zoom = 1;

    try { funkin.backend.system.rpc.DiscordUtil.changePresence("In the Menus", "Freeplay"); } catch(e:Dynamic) {}
    try { FlxG.sound.playMusic(Paths.music('freeplayMenu'), 0.8, true); } catch(e:Dynamic) {}

    loadSongCredits();

    if (FlxG.save.data.amongFreeplayStartWeek != null) {
        var requestedWeek:Int = Std.int(FlxG.save.data.amongFreeplayStartWeek);
        if (requestedWeek >= 0 && requestedWeek < weekNames.length) curWeek = requestedWeek;
        FlxG.save.data.amongFreeplayStartWeek = -1;
        FlxG.save.flush();
    }

    var bg = new FlxSprite(0, 0).makeGraphic(1280, 720, 0xFF040107);
    add(bg);

    try {
        weekBg = new FlxSprite(0, 200).loadGraphic(Paths.image('freeplay/week1_polus_bg'));
        weekBg.setGraphicSize(1280, 520);
        weekBg.updateHitbox();
        weekBg.antialiasing = true;
        add(weekBg);
    } catch(e:Dynamic) {
        weekBg = new FlxSprite(0, 200).makeGraphic(1280, 520, 0xFF2D2141);
        add(weekBg);
    }

    darkShade = new FlxSprite(0, 0).makeGraphic(1280, 720, 0x44000000);
    add(darkShade);

    for (i in 0...80) {
        var star = new FlxSprite(FlxG.random.float(0, 1280), FlxG.random.float(0, 300));
        star.makeGraphic(FlxG.random.int(2, 3), FlxG.random.int(2, 3), FlxColor.WHITE);
        star.alpha = FlxG.random.float(0.35, 0.95);
        star.velocity.x = FlxG.random.float(-16, -6);
        add(star);
        stars.push(star);
    }

    topStrip = new FlxSprite(0, 0).makeGraphic(1280, 164, 0xBB000000);
    add(topStrip);

    headerText = new FlxText(0, 18, 1280, "FREEPLAY", 58);
    headerText.setFormat(Paths.font("vcr.ttf"), 58, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    headerText.borderSize = 4;
    add(headerText);

    leftArrow = new FlxText(460, 104, 60, "<", 42);
    leftArrow.setFormat(Paths.font("vcr.ttf"), 42, 0xFF54E6CF, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    add(leftArrow);

    weekText = new FlxText(520, 108, 240, "", 30);
    weekText.setFormat(Paths.font("vcr.ttf"), 30, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    add(weekText);

    rightArrow = new FlxText(760, 104, 60, ">", 42);
    rightArrow.setFormat(Paths.font("vcr.ttf"), 42, 0xFF54E6CF, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    add(rightArrow);

    infoText = new FlxText(0, 144, 1280, "LEFT / RIGHT  CHANGE WEEK", 16);
    infoText.setFormat(Paths.font("vcr.ttf"), 16, 0xFF8DA6A8, "center");
    add(infoText);

    listBorder = new FlxSprite(48, 202).makeGraphic(560, 470, 0xFF2B3435);
    add(listBorder);
    listPanel = new FlxSprite(52, 206).makeGraphic(552, 462, 0xAA051018);
    add(listPanel);

    for (i in 0...4) {
        var box = new FlxSprite(78, 234 + (i * 99)).makeGraphic(500, 78, 0xCC7B1630);
        add(box);
        songBoxes.push(box);

        var txt = new FlxText(98, box.y + 14, 360, "", 28);
        txt.setFormat(Paths.font("vcr.ttf"), 28, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        txt.borderSize = 1;
        add(txt);
        songTexts.push(txt);

        var status = new FlxText(420, box.y + 25, 132, "", 18);
        status.setFormat(Paths.font("vcr.ttf"), 18, 0xFFD0DFDF, "right", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        status.borderSize = 1;
        add(status);
        statusTexts.push(status);
    }

    bannerPanel = new FlxSprite(658, 206).makeGraphic(564, 462, 0xAA0A0A0A);
    add(bannerPanel);

    weekStatusText = new FlxText(686, 226, 500, "", 16);
    weekStatusText.setFormat(Paths.font("vcr.ttf"), 16, 0xFFD6D6D6, "left");
    add(weekStatusText);

    charSprite = new FlxSprite(780, 240);
    try {
        charSprite.frames = Paths.getSparrowAtlas('characters/Moogusred');
        charSprite.animation.addByPrefix('idle', 'idle', 12, true);
        charSprite.animation.play('idle');
        charSprite.scale.set(0.72, 0.72);
        charSprite.updateHitbox();
    } catch(e:Dynamic) {
        charSprite.makeGraphic(300, 300, 0xFFAA2233);
    }
    add(charSprite);

    songTitle = new FlxText(680, 444, 500, "", 31);
    songTitle.setFormat(Paths.font("vcr.ttf"), 31, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    songTitle.borderSize = 2;
    add(songTitle);

    creatorText = new FlxText(690, 492, 480, "", 18);
    creatorText.setFormat(Paths.font("vcr.ttf"), 18, 0xFF54E6CF, "center");
    add(creatorText);

    charterText = new FlxText(690, 520, 480, "", 18);
    charterText.setFormat(Paths.font("vcr.ttf"), 18, 0xFFB7C3C4, "center");
    add(charterText);

    difficultyText = new FlxText(690, 552, 480, "", 20);
    difficultyText.setFormat(Paths.font("vcr.ttf"), 20, FlxColor.WHITE, "center");
    add(difficultyText);

    scoreText = new FlxText(690, 582, 480, "", 18);
    scoreText.setFormat(Paths.font("vcr.ttf"), 18, 0xFFD0DFDF, "center");
    add(scoreText);

    availabilityText = new FlxText(690, 615, 480, "", 18);
    availabilityText.setFormat(Paths.font("vcr.ttf"), 18, FlxColor.WHITE, "center");
    add(availabilityText);

    glitchOverlay = new FlxText(660, 262, 560, "", 22);
    glitchOverlay.setFormat(Paths.font("vcr.ttf"), 22, 0xFFD3D3D3, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    glitchOverlay.borderSize = 2;
    glitchOverlay.wordWrap = true;
    add(glitchOverlay);

    unlockPopupBg = new FlxSprite(220, 18).makeGraphic(840, 44, 0xCC000000);
    unlockPopupBg.alpha = 0;
    add(unlockPopupBg);
    unlockPopup = new FlxText(230, 27, 820, "", 24);
    unlockPopup.setFormat(Paths.font("vcr.ttf"), 24, 0xFF8CFFF1, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    unlockPopup.borderSize = 1;
    unlockPopup.alpha = 0;
    add(unlockPopup);

    helpText = new FlxText(0, 686, 1280, "UP / DOWN SELECT   LEFT / RIGHT WEEK   ENTER PLAY   O UNLOCK   L RESET   ESC BACK", 16);
    helpText.setFormat(Paths.font("vcr.ttf"), 16, 0xFFBFC8C8, "center");
    add(helpText);

    refreshWeek();
    if (FlxG.save.data.triggerFreeplayAnim == true) {
        FlxG.save.data.triggerFreeplayAnim = false;
        FlxG.save.flush();
        triggerUnlockAnimation("WEEK 2 UNLOCKED  //  GOOD-TIMES + NO-MORE-TASKS");
    }
}

function update(elapsed:Float) {
    for (star in stars) if (star.x < -10) { star.x = 1290; star.y = FlxG.random.float(0, 280); }
    if (isTransitioning) return;

    if (FlxG.keys.justPressed.O) {
        FlxG.save.data.week1Completed = true;
        FlxG.save.data.triggerFreeplayAnim = false;
        FlxG.save.flush();
        if (curWeek == 1 && !isWeekUnlocked(1)) refreshWeek();
        refreshWeek();
        triggerUnlockAnimation("DEV TOOL  //  WEEK 1 CLEARED  //  WEEK 2 UNLOCKED");
    }
    if (FlxG.keys.justPressed.L) {
        FlxG.save.data.week1Completed = false;
        FlxG.save.flush();
        if (curWeek == 1) curSelected = 0;
        refreshWeek();
        triggerUnlockAnimation("DEV TOOL  //  WEEK 1 SAVE RESET");
    }

    if (controls.BACK) {
        isTransitioning = true;
        FlxG.sound.play(Paths.sound('cancelMenu'));
        if (FlxG.sound.music != null) FlxG.sound.music.fadeOut(0.3, 0);
        FlxG.camera.fade(FlxColor.BLACK, 0.3, false, function() {
            try { FlxG.sound.playMusic(Paths.music('freakyMenu'), 0.8, true); } catch(e:Dynamic) {}
            FlxG.switchState(new ModState("AmongMainMenuState"));
        });
        return;
    }

    var up = FlxG.keys.justPressed.UP || FlxG.keys.justPressed.W || FlxG.mouse.wheel > 0;
    var down = FlxG.keys.justPressed.DOWN || FlxG.keys.justPressed.S || FlxG.mouse.wheel < 0;
    var left = FlxG.keys.justPressed.LEFT || FlxG.keys.justPressed.A;
    var right = FlxG.keys.justPressed.RIGHT || FlxG.keys.justPressed.D;
    if (up) changeSelection(-1);
    if (down) changeSelection(1);
    if (left) changeWeek(-1);
    if (right) changeWeek(1);

    if (FlxG.mouse.justPressed) {
        if (FlxG.mouse.overlaps(leftArrow)) changeWeek(-1);
        else if (FlxG.mouse.overlaps(rightArrow)) changeWeek(1);
        else {
            for (i in 0...songBoxes.length) {
                if (songBoxes[i].visible && FlxG.mouse.overlaps(songBoxes[i])) {
                    if (curSelected == i) tryLaunchSong();
                    else { curSelected = i; FlxG.sound.play(Paths.sound('scrollMenu')); refreshSelection(); }
                }
            }
        }
    } else if (FlxG.mouse.justMoved) {
        for (i in 0...songBoxes.length) {
            if (songBoxes[i].visible && FlxG.mouse.overlaps(songBoxes[i]) && curSelected != i) {
                curSelected = i;
                FlxG.sound.play(Paths.sound('scrollMenu'));
                refreshSelection();
            }
        }
    }

    if (controls.ACCEPT) tryLaunchSong();

    var weekUnlocked = isWeekUnlocked(curWeek);
    glitchTick += elapsed;
    if (!weekUnlocked) {
        if (glitchTick > 0.06) {
            glitchTick = 0;
            weekStatusText.text = "CREW DATA CORRUPTED  //  COMPLETE WEEK 1 TO RESTORE";
            glitchOverlay.text = makeGlitch("WEEK LOCKED // SIGNAL LOST // MEMORY FRAGMENTED");
        }
    } else {
        glitchOverlay.text = "";
    }

    for (i in 0...songBoxes.length) {
        if (!songBoxes[i].visible) continue;
        var selected:Bool = i == curSelected;
        var tx:Float = selected ? 88 : 78;
        songBoxes[i].x = FlxMath.lerp(songBoxes[i].x, tx, elapsed * 12);
        var targetColor:Int = 0xCC7B1630;
        if (!weekUnlocked) targetColor = 0x88484D52;
        else if (selected) targetColor = 0xD45A6E71;
        songBoxes[i].color = FlxColor.interpolate(songBoxes[i].color, targetColor, elapsed * 12);
        songBoxes[i].alpha = selected ? 1 : 0.82;
        songTexts[i].x = songBoxes[i].x + 20;
        statusTexts[i].x = songBoxes[i].x + 344;
        songTexts[i].color = !weekUnlocked ? 0xFFB6B6B6 : (selected ? 0xFFAAFFF3 : FlxColor.WHITE);
        statusTexts[i].color = !weekUnlocked ? 0xFF8A8A8A : 0xFFD0DFDF;
    }

    weekBg.color = weekUnlocked ? FlxColor.WHITE : 0xFF6D6D6D;
    if (charSprite != null) charSprite.color = weekUnlocked ? FlxColor.WHITE : 0xFF8C8C8C;
}

function changeWeek(change:Int) {
    curWeek += change;
    if (curWeek < 0) curWeek = weekNames.length - 1;
    if (curWeek >= weekNames.length) curWeek = 0;
    curSelected = 0;
    FlxG.sound.play(Paths.sound('scrollMenu'));
    refreshWeek();
}

function changeSelection(change:Int) {
    var count:Int = weekSongs[curWeek].length;
    if (count <= 0) return;
    curSelected += change;
    if (curSelected < 0) curSelected = count - 1;
    if (curSelected >= count) curSelected = 0;
    if (change != 0) FlxG.sound.play(Paths.sound('scrollMenu'));
    refreshSelection();
}

function refreshWeek() {
    var unlocked:Bool = isWeekUnlocked(curWeek);
    weekText.text = weekNames[curWeek];
    weekText.color = unlocked ? FlxColor.WHITE : 0xFF9E9E9E;

    var count:Int = weekSongs[curWeek].length;
    if (curSelected >= count) curSelected = 0;

    for (i in 0...songBoxes.length) {
        var visible:Bool = i < count;
        songBoxes[i].visible = visible;
        songTexts[i].visible = visible;
        statusTexts[i].visible = visible;
        if (visible) {
            songTexts[i].text = unlocked ? weekSongs[curWeek][i] : makeLockName(weekSongs[curWeek][i]);
            if (!unlocked) statusTexts[i].text = "LOCKED";
            else if (weekFolders[curWeek][i] == "") statusTexts[i].text = "SOON";
            else statusTexts[i].text = weekDiffs[curWeek][i].toUpperCase();
        }
    }
    refreshSelection();
}

function refreshSelection() {
    var unlocked:Bool = isWeekUnlocked(curWeek);
    var displayName:String = weekSongs[curWeek][curSelected];
    var folder:String = weekFolders[curWeek][curSelected];
    var diff:String = weekDiffs[curWeek][curSelected];

    weekStatusText.text = curWeek == 0 ? "WEEK 1  //  POLUS PROBLEMS" : (unlocked ? weekNames[curWeek] + "  //  UNLOCKED DATA" : "CREW DATA ENCRYPTED");

    songTitle.text = unlocked ? displayName.toUpperCase() : "????????";
    creatorText.text = unlocked ? "MUSIC: " + getSongCreator(displayName) : "";
    charterText.text = unlocked ? "CHART: " + getSongCharter(displayName) : "";
    difficultyText.text = (unlocked && folder != "") ? "DIFFICULTY  /  " + diff.toUpperCase() : "";

    if (!unlocked) {
        availabilityText.text = "COMPLETE WEEK 1 TO UNLOCK THIS TAB";
        availabilityText.color = 0xFFFF7777;
        scoreText.text = "";
        creatorText.text = "";
        charterText.text = "";
    } else if (folder == "") {
        availabilityText.text = "COMING SOON  //  CHART NOT INCLUDED YET";
        availabilityText.color = 0xFFFFC35B;
        scoreText.text = "";
    } else {
        availabilityText.text = "PRESS ENTER TO PLAY";
        availabilityText.color = 0xFF65E8A0;
        updateScore(folder, diff);
    }

    if (charSprite != null) {
        charSprite.visible = unlocked;
        charSprite.x = (curWeek == 0 ? 785 : 805);
        charSprite.y = (curWeek == 0 ? 236 : 255);
        charSprite.scale.set(curWeek == 0 ? 0.72 : 0.62, curWeek == 0 ? 0.72 : 0.62);
        charSprite.updateHitbox();
        if (charSprite.animation.getByName('idle') != null) charSprite.animation.play('idle');
    }
}

function updateScore(folder:String, diff:String) {
    var score:Int = 0;
    try {
        var saveData = FunkinSave.getSongHighscore(folder, diff, null, []);
        score = saveData.score;
    } catch(e:Dynamic) {}
    scoreText.text = "BEST SCORE: " + score;
}

function tryLaunchSong() {
    if (!isWeekUnlocked(curWeek)) {
        FlxG.sound.play(Paths.sound('cancelMenu'));
        FlxG.camera.shake(0.008, 0.15);
        return;
    }

    var folder:String = weekFolders[curWeek][curSelected];
    var diff:String = weekDiffs[curWeek][curSelected];
    if (folder == "" || diff == "") {
        FlxG.sound.play(Paths.sound('cancelMenu'));
        FlxG.camera.shake(0.008, 0.15);
        return;
    }

    isTransitioning = true;
    FlxG.sound.play(Paths.sound('confirmMenu'));
    if (FlxG.sound.music != null) FlxG.sound.music.fadeOut(0.4, 0);

    Options.freeplayLastSong = folder;
    Options.freeplayLastDifficulty = diff;
    Options.freeplayLastVariation = null;
    Options.save();

    FlxG.save.data.amongReturnMenu = "freeplay";
    FlxG.save.flush();
    PlayState.isStoryMode = false;

    FlxG.camera.fade(FlxColor.BLACK, 0.45, false, function() {
        PlayState.loadSong(folder, diff);
        FlxG.switchState(new PlayState());
    });
}

function isWeekUnlocked(index:Int):Bool {
    switch(index) {
        case 0: return true;
        case 1: return FlxG.save.data.week1Completed == true;
        case 2: return FlxG.save.data.week1Completed == true;
        case 3: return false;
    }
    return false;
}

function triggerUnlockAnimation(message:String) {
    unlockPopup.text = message;
    unlockPopupBg.alpha = 0;
    unlockPopup.alpha = 0;
    unlockPopupBg.y = 18;
    unlockPopup.y = 27;
    FlxG.sound.play(Paths.sound('confirmMenu'));
    FlxG.camera.flash(0x50AAFFF3, 0.35);
    FlxTween.cancelTweensOf(unlockPopupBg);
    FlxTween.cancelTweensOf(unlockPopup);
    FlxTween.tween(unlockPopupBg, {alpha: 0.92, y: 26}, 0.25, {ease: FlxEase.circOut});
    FlxTween.tween(unlockPopup, {alpha: 1, y: 35}, 0.25, {ease: FlxEase.circOut, onComplete: function(_) {
        FlxTween.tween(unlockPopupBg, {alpha: 0}, 0.55, {startDelay: 1.2, ease: FlxEase.circIn});
        FlxTween.tween(unlockPopup, {alpha: 0}, 0.55, {startDelay: 1.2, ease: FlxEase.circIn});
    }});
}

function makeGlitch(text:String):String {
    var chars = ["#", "?", "/", "-", "%", "&"];
    var out:String = "";
    for (i in 0...text.length) {
        var c = text.substr(i, 1);
        if (c == " ") out += " ";
        else out += FlxG.random.bool(65) ? chars[FlxG.random.int(0, chars.length - 1)] : c;
    }
    return out;
}

function makeLockName(text:String):String {
    return StringTools.rpad("", "?", text.length <= 3 ? 8 : text.length);
}

function loadSongCredits() {
    creditSongs = [];
    creditCreators = [];
    creditCharters = [];
    try {
        var lines:Array<String> = CoolUtil.coolTextFile(Paths.txt('config/songCredits'));
        for (line in lines) {
            var clean:String = StringTools.trim(line);
            if (clean.length <= 0 || clean.substr(0, 1) == "#") continue;
            var parts:Array<String> = clean.split("|");
            if (parts.length < 2) continue;
            creditSongs.push(StringTools.trim(parts[0]).toLowerCase());
            creditCreators.push(StringTools.trim(parts[1]));
            creditCharters.push(parts.length >= 3 ? StringTools.trim(parts[2]) : "TBA");
        }
    } catch(e:Dynamic) {}
}

function getSongCreator(song:String):String {
    var index:Int = creditSongs.indexOf(song.toLowerCase());
    if (index >= 0 && index < creditCreators.length && creditCreators[index] != "") return creditCreators[index];
    return "TBA";
}

function getSongCharter(song:String):String {
    var index:Int = creditSongs.indexOf(song.toLowerCase());
    if (index >= 0 && index < creditCharters.length && creditCharters[index] != "") return creditCharters[index];
    return "TBA";
}
