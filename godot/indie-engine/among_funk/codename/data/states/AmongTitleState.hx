import flixel.FlxSprite;
import flixel.FlxG;
import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;
import flixel.util.FlxColor;
import flixel.group.FlxTypedGroup;
import funkin.menus.ModState;

var starsBg:Array<FlxSprite> = [];
var logoText:FlxText;
var enterText:FlxText;
var floatingImpostor:FlxSprite;

var pressedEnter:Bool = false;

// Variables intro FNF
var introGroup:FlxTypedGroup<FlxText>;
var blackScreen:FlxSprite;
var skippedIntro:Bool = false;

function create() {
    // Fond spatial profond
    var bg = new FlxSprite(0, 0).makeGraphic(1280, 720, 0xFF050510);
    bg.scrollFactor.set(0, 0);
    add(bg);

    // Étoiles qui défilent de manière fluide
    for (i in 0...100) {
        var star = new FlxSprite(FlxG.random.float(0, 1280), FlxG.random.float(0, 720));
        var size = FlxG.random.int(2, 4);
        star.makeGraphic(size, size, FlxColor.WHITE);
        star.alpha = FlxG.random.float(0.3, 1.0);
        star.velocity.x = FlxG.random.float(-30, -10);
        add(star);
        starsBg.push(star);
    }

    // Imposteur flottant (très smooth)
    floatingImpostor = new FlxSprite(200, 200);
    try {
        floatingImpostor.loadGraphic(Paths.image('impostor_float'));
    } catch(e:Dynamic) {
        floatingImpostor.makeGraphic(100, 150, FlxColor.RED); 
    }
    floatingImpostor.angularVelocity = 10; 
    floatingImpostor.velocity.set(15, 3);  
    add(floatingImpostor);

    // Logo AMONG FUNK (plus fluide)
    logoText = new FlxText(0, 150, 0, "AMONG FUNK", 100);
    logoText.setFormat(Paths.font("vcr.ttf"), 100, 0xFF00FFFF, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    logoText.borderSize = 6;
    logoText.screenCenter(FlxAxes.X);
    add(logoText);

    // Flottement constant du logo
    FlxTween.tween(logoText, {y: logoText.y - 15}, 2, {ease: FlxEase.sineInOut, type: 4});

    // Texte d'interaction
    enterText = new FlxText(0, FlxG.height - 150, 0, "> PRESS ENTER TO VENT <", 40);
    enterText.setFormat(Paths.font("vcr.ttf"), 40, FlxColor.RED, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    enterText.screenCenter(FlxAxes.X);
    add(enterText);
    FlxTween.tween(enterText, {alpha: 0.2}, 0.8, {ease: FlxEase.sineInOut, type: 4});

    // SYSTÈME D'INTRO
    blackScreen = new FlxSprite().makeGraphic(FlxG.width * 2, FlxG.height * 2, FlxColor.BLACK);
    blackScreen.screenCenter();
    add(blackScreen);

    introGroup = new FlxTypedGroup();
    add(introGroup);

    if (FlxG.sound.music == null || !FlxG.sound.music.playing) {
        FlxG.sound.playMusic(Paths.music('freakyMenu'), 0);
        FlxG.sound.music.fadeIn(2, 0, 0.7);
    }

    if (FlxG.save.data.amongIntroPlayed != null && FlxG.save.data.amongIntroPlayed == true) {
        forceSkipIntro();
    }
}

function createIntroText(textArray:Array<String>) {
    introGroup.clear();
    for (i in 0...textArray.length) {
        var txt = new FlxText(0, (i * 60) + 200, 0, textArray[i], 50);
        txt.setFormat(Paths.font("vcr.ttf"), 50, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        txt.borderSize = 3;
        txt.screenCenter(FlxAxes.X);
        introGroup.add(txt);
    }
}

function addIntroText(text:String) {
    var txt = new FlxText(0, (introGroup.length * 60) + 200, 0, text, 50);
    txt.setFormat(Paths.font("vcr.ttf"), 50, FlxColor.WHITE, "center", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
    txt.borderSize = 3;
    txt.screenCenter(FlxAxes.X);
    introGroup.add(txt);
}

function forceSkipIntro() {
    if (skippedIntro) return;
    skippedIntro = true;
    FlxG.save.data.amongIntroPlayed = true;
    FlxG.save.flush();

    remove(blackScreen);
    remove(introGroup);
    FlxG.camera.flash(FlxColor.WHITE, 2);
}

function update(elapsed:Float) {
    for (star in starsBg) {
        if (star.x < -10) {
            star.x = 1290;
            star.y = FlxG.random.float(0, 720);
        }
    }
    if (floatingImpostor.x > 1350) floatingImpostor.x = -150;

    if (!skippedIntro && controls.ACCEPT) {
        forceSkipIntro();
    }

    if (skippedIntro && !pressedEnter && controls.ACCEPT) {
        pressedEnter = true;
        FlxG.sound.play(Paths.sound('confirmMenu'));

        FlxTween.cancelTweensOf(enterText);
        enterText.alpha = 1;
        enterText.color = FlxColor.CYAN; 
        
        FlxTween.tween(enterText, {alpha: 0}, 0.1, {ease: FlxEase.linear, type: 4}); 

        FlxTween.tween(FlxG.camera, {zoom: 3.0}, 1.5, {ease: FlxEase.expoIn});
        FlxG.camera.fade(FlxColor.BLACK, 1.2, false, function() {
            FlxG.switchState(new ModState("AmongMainMenuState"));
        });
    }
}

function beatHit(beat:Int) {
    if (!skippedIntro) {
        switch(beat) {
            case 1: createIntroText(["L'Equipe Among Funk"]);
            case 3: addIntroText("Presente");
            case 4: introGroup.clear();
            case 5: createIntroText(["Un mod", "Totalement"]);
            case 7: addIntroText("SUS");
            case 8: introGroup.clear();
            case 9: createIntroText(["Friday", "Night"]);
            case 11: addIntroText("AMONG FUNK");
            case 12: introGroup.clear();
            case 13: createIntroText(["L'Imposteur"]);
            case 14: addIntroText("Est");
            case 15: addIntroText("PARMI NOUS");
            case 16: forceSkipIntro();
        }
    } else {
        if (logoText != null) {
            logoText.scale.set(1.15, 1.15);
            FlxTween.tween(logoText.scale, {x: 1, y: 1}, 0.3, {ease: FlxEase.backOut});
            if (beat % 2 == 0) logoText.color = FlxColor.RED;
            else logoText.color = 0xFF00FFFF;
        }
    }
}