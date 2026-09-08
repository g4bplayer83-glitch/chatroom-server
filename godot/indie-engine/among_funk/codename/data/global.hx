import funkin.menus.TitleState;
import funkin.menus.MainMenuState;
import funkin.menus.StoryMenuState;
import funkin.menus.FreeplayState;
import funkin.menus.credits.CreditsMain;
import funkin.menus.ModState;
import flixel.FlxG;
import lime.app.Application;
import lime.graphics.Image;

var appCustomized:Bool = false;

function preStateSwitch() {
    if (!appCustomized) {
        Application.current.window.title = "Friday Night Funkin': Among Funk";
        try {
            var iconImage:Image = Image.fromFile(Paths.file("icons.ico")); 
            Application.current.window.setIcon(iconImage);
        } catch(e:Dynamic) {
            try {
                var iconFallback:Image = Image.fromFile(Paths.image("icons")); 
                Application.current.window.setIcon(iconFallback);
            } catch(e:Dynamic) {}
        }
        appCustomized = true;
    }

    if (FlxG.game._requestedState is TitleState) {
        FlxG.game._requestedState = new ModState("AmongTitleState");
    }
    else if (FlxG.game._requestedState is MainMenuState) {
        FlxG.game._requestedState = new ModState("AmongMainMenuState");
    }
    else if (FlxG.game._requestedState is CreditsMain) {
        FlxG.game._requestedState = new ModState("AmongCreditsState");
    }
    else if (FlxG.game._requestedState is StoryMenuState) {
        FlxG.game._requestedState = new ModState("AmongStoryMenu");
    }
    else if (FlxG.game._requestedState is FreeplayState) {
        FlxG.game._requestedState = new ModState("AmongFreeplayState");
    }
}

function postStateSwitch() {
    try {
        FlxG.mouse.load(Paths.image('curseur'));
        FlxG.mouse.visible = true;
        FlxG.mouse.useSystemCursor = false;
    } catch(e:Dynamic) {}
}