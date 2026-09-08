import flixel.FlxG;
import flixel.FlxSprite;
import flixel.FlxCamera;
import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.util.FlxColor;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;
import flixel.util.FlxTimer;

import funkin.game.PlayState;
import funkin.menus.ModState;

var deathCam:FlxCamera;
var statusText:FlxText;
var hintText:FlxText;
var subText:FlxText;
var progressBack:FlxSprite;
var progressFill:FlxSprite;
var reconnecting:Bool = false;
var retrySFXName:String = "gameOverEnd";
var gameOverMusic:Dynamic = null;

function create(event) {
    retrySFXName = event.retrySFX;
    event.cancel();

    camera = deathCam = new FlxCamera();
    deathCam.bgColor = FlxColor.BLACK;
    FlxG.cameras.add(deathCam, false);

    var black = new FlxSprite(0, 0).makeGraphic(1280, 720, FlxColor.BLACK);
    black.cameras = [deathCam];
    add(black);

    statusText = new FlxText(100, 282, 1080, "THE PLAYER HAS BEEN DISCONNECTED", 34);
    statusText.setFormat(Paths.font("vcr.ttf"), 34, 0xFFFF3B42, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    statusText.borderSize = 2;
    statusText.cameras = [deathCam];
    add(statusText);

    subText = new FlxText(180, 338, 920, "CONNECTION LOST", 16);
    subText.setFormat(Paths.font("vcr.ttf"), 16, 0xFF8C8C8C, "center");
    subText.cameras = [deathCam];
    add(subText);

    progressBack = new FlxSprite(390, 390).makeGraphic(500, 8, 0xFF20252A);
    progressBack.cameras = [deathCam];
    progressBack.visible = false;
    add(progressBack);

    progressFill = new FlxSprite(390, 390).makeGraphic(500, 8, 0xFF4FA8FF);
    progressFill.origin.set(0, 0);
    progressFill.scale.x = 0;
    progressFill.cameras = [deathCam];
    progressFill.visible = false;
    add(progressFill);

    hintText = new FlxText(160, 445, 960, "ENTER / R  RECONNECT        ESC  RETURN TO SONG SELECT", 15);
    hintText.setFormat(Paths.font("vcr.ttf"), 15, 0xFFB9B9B9, "center");
    hintText.cameras = [deathCam];
    add(hintText);

    // Custom death loop from the original Among Funk sounds folder.
    // The default GameOver UI/music is cancelled above, so play it ourselves.
    try {
        gameOverMusic = FlxG.sound.play(Paths.sound('gameOver'), 0.88, true);
    } catch(e:Dynamic) {}

    statusText.alpha = 0;
    FlxTween.tween(statusText, {alpha: 1}, 0.20, {ease: FlxEase.quadOut});
}

function update(elapsed:Float) {
    if (reconnecting) return;

    if (controls.ACCEPT || FlxG.keys.justPressed.R) {
        startReconnect();
        return;
    }

    if (controls.BACK || FlxG.keys.justPressed.ESCAPE) {
        returnToSelection();
    }
}

function startReconnect() {
    if (reconnecting) return;
    reconnecting = true;

    statusText.text = "THE PLAYER HAS BEEN RECONNECTED";
    statusText.color = 0xFF4FA8FF;
    subText.text = "RESTORING SESSION...";
    subText.color = 0xFFB8D8FF;
    hintText.alpha = 0;

    progressBack.visible = true;
    progressFill.visible = true;
    progressFill.scale.x = 0;

    try { if (gameOverMusic != null) gameOverMusic.stop(); } catch(e:Dynamic) {}
    try { FlxG.sound.play(Paths.sound(retrySFXName), 0.95); }
    catch(e:Dynamic) { try { FlxG.sound.play(Paths.sound('gameOverEnd'), 0.95); } catch(e2:Dynamic) {} }

    statusText.scale.set(0.96, 0.96);
    FlxTween.tween(statusText.scale, {x: 1.035, y: 1.035}, 0.20, {ease: FlxEase.quadOut, onComplete: function(twn) {
        FlxTween.tween(statusText.scale, {x: 1, y: 1}, 0.18, {ease: FlxEase.quadInOut});
    }});
    FlxTween.tween(progressFill.scale, {x: 1}, 0.78, {ease: FlxEase.quadInOut});

    new FlxTimer().start(0.90, function(tmr) {
        FlxTween.tween(statusText, {alpha: 0}, 0.28);
        FlxTween.tween(subText, {alpha: 0}, 0.28);
        FlxTween.tween(progressBack, {alpha: 0}, 0.28);
        FlxTween.tween(progressFill, {alpha: 0}, 0.28);
    });

    new FlxTimer().start(1.24, function(tmr) {
        FlxG.switchState(new PlayState());
    });
}

function returnToSelection() {
    try { if (gameOverMusic != null) gameOverMusic.stop(); } catch(e:Dynamic) {}
    if (FlxG.sound.music != null) FlxG.sound.music.stop();
    var target:String = "freeplay";
    if (PlayState.isStoryMode || FlxG.save.data.amongReturnMenu == "story") target = "story";
    if (target == "story") FlxG.switchState(new ModState("AmongStoryMenu"));
    else FlxG.switchState(new ModState("AmongFreeplayState"));
}
