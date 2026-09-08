import flixel.FlxG;
import flixel.FlxSprite;
import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.util.FlxColor;
import funkin.game.PlayState;
import funkin.options.Options;

var taskOuter:FlxSprite;
var taskInner:FlxSprite;
var taskFill:FlxSprite;
var taskLabel:FlxText;
var taskDividers:Array<FlxSprite> = [];
var statsText:FlxText;
var displayName:String = "UNKNOWN SONG";

function postCreate() {
    var game = PlayState.instance;
    if (game == null || game.camHUD == null) return;

    // Hide Codename's separate text widgets when available.
    // We keep only one compact stat line plus the Among Us task bar.
    try { game.scoreTxt.visible = false; } catch(e:Dynamic) {}
    try { game.missesTxt.visible = false; } catch(e:Dynamic) {}
    try { game.accuracyTxt.visible = false; } catch(e:Dynamic) {}

    try {
        if (PlayState.SONG.meta.displayName != null && PlayState.SONG.meta.displayName != "")
            displayName = PlayState.SONG.meta.displayName;
    } catch(e:Dynamic) {}

    // Among Us style task bar. In Among Funk, the song name replaces
    // "TOTAL TASKS COMPLETED" so there is no second song title in the center.
    // Thinner + slightly longer task bar, centered horizontally.
    // It automatically moves opposite the strumline: bottom in upscroll, top in downscroll.
    var barX:Float = 350;
    var barY:Float = Options.downscroll ? 12 : 680;

    taskOuter = new FlxSprite(barX, barY).makeGraphic(580, 30, 0xFFB9C2C5);
    taskOuter.cameras = [game.camHUD];
    add(taskOuter);

    taskInner = new FlxSprite(barX + 4, barY + 4).makeGraphic(572, 22, 0xFF111714);
    taskInner.cameras = [game.camHUD];
    add(taskInner);

    taskFill = new FlxSprite(barX + 7, barY + 7).makeGraphic(566, 16, 0xFF38D84A);
    taskFill.origin.set(0, 0);
    taskFill.scale.x = 0;
    taskFill.cameras = [game.camHUD];
    add(taskFill);

    for (i in 1...6) {
        var divider = new FlxSprite(barX + 7 + Std.int(566 * i / 6), barY + 7).makeGraphic(3, 16, 0xFF050806);
        divider.alpha = 0.85;
        divider.cameras = [game.camHUD];
        add(divider);
        taskDividers.push(divider);
    }

    taskLabel = new FlxText(barX + 12, barY + 5, 552, displayName.toUpperCase(), 14);
    taskLabel.setFormat(Paths.font("vcr.ttf"), 14, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    taskLabel.borderSize = 2;
    taskLabel.cameras = [game.camHUD];
    add(taskLabel);

    var statsY:Float = Options.downscroll ? 48 : 650;
    statsText = new FlxText(320, statsY, 640, "", 14);
    statsText.setFormat(Paths.font("vcr.ttf"), 14, 0xFFE6EEEE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    statsText.borderSize = 1;
    statsText.cameras = [game.camHUD];
    add(statsText);
}

function update(elapsed:Float) {
    var game = PlayState.instance;
    if (game == null) return;

    var progress:Float = 0;
    try {
        if (FlxG.sound.music != null && FlxG.sound.music.length > 0)
            progress = FlxG.sound.music.time / FlxG.sound.music.length;
    } catch(e:Dynamic) {}
    progress = Math.max(0, Math.min(1, progress));
    if (taskFill != null) taskFill.scale.x = progress;

    if (statsText != null) {
        var acc:Float = 0;
        try {
            acc = game.accuracy;
            if (Math.isNaN(acc)) acc = 0;
        } catch(e:Dynamic) { acc = 0; }
        statsText.text = "SCORE  " + game.songScore + "     MISSES  " + game.misses + "     ACC  " + Std.string(Math.round(acc * 10000) / 100) + "%";
    }
}
