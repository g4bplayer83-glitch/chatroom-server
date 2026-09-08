import flixel.FlxG;
import funkin.game.PlayState;
import funkin.backend.utils.Paths;
import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.util.FlxColor;

var botplayText:FlxText;
var isBotplay:Bool = false;
var offTimer:Float = 0;

function postCreate() {
    try {
        if (PlayState.instance != null && PlayState.instance.playerStrums != null)
            isBotplay = PlayState.instance.playerStrums.cpu;
    } catch(e:Dynamic) {}

    botplayText = new FlxText(0, 92, FlxG.width, "BOTPLAY  [P]", 20);
    botplayText.setFormat(Paths.font("vcr.ttf"), 20, 0xFF54E6CF, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    botplayText.borderSize = 2;
    try { if (PlayState.instance.camHUD != null) botplayText.cameras = [PlayState.instance.camHUD]; } catch(e:Dynamic) {}
    botplayText.alpha = isBotplay ? 0.9 : 0;
    add(botplayText);
}

function update(elapsed:Float) {
    if (FlxG.keys.justPressed.P) {
        try {
            if (PlayState.instance != null && PlayState.instance.playerStrums != null) {
                isBotplay = !PlayState.instance.playerStrums.cpu;
                PlayState.instance.playerStrums.cpu = isBotplay;
                offTimer = 0;
                botplayText.text = isBotplay ? "BOTPLAY  [P]" : "BOTPLAY OFF";
                botplayText.color = isBotplay ? 0xFF54E6CF : 0xFFFF7777;
                botplayText.alpha = 1;
                try { FlxG.sound.play(Paths.sound('scrollMenu'), 0.6); } catch(e:Dynamic) {}
            }
        } catch(e:Dynamic) {}
    }

    if (isBotplay) {
        botplayText.text = "BOTPLAY  [P]";
        botplayText.color = 0xFF54E6CF;
        botplayText.alpha = 0.88;
    } else if (botplayText.alpha > 0) {
        offTimer += elapsed;
        if (offTimer > 0.55) botplayText.alpha = Math.max(0, botplayText.alpha - elapsed * 2.5);
    }
}

function onPlayerHit(event) {
    if (isBotplay) event.showSplash = false;
}
