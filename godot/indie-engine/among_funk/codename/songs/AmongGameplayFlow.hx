import flixel.FlxG;
import funkin.game.PlayState;
import funkin.menus.PauseSubState;

function postCreate() {
    PauseSubState.script = "data/scripts/AmongPause";
}

function onSongEnd() {
    try {
        if (PlayState.isStoryMode && PlayState.SONG != null && PlayState.SONG.meta.displayName != null && PlayState.SONG.meta.displayName.toLowerCase() == "meltdown") {
            FlxG.save.data.week1Completed = true;
            FlxG.save.data.triggerFreeplayAnim = true;
            FlxG.save.flush();
        }
    } catch(e:Dynamic) {}
}
