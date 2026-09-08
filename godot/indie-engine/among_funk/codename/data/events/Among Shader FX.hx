import flixel.FlxSprite;
import flixel.FlxG;
import flixel.util.FlxColor;

// Two snow layers: world/stage + a smaller HUD layer.
var stageSnow:Array<FlxSprite> = [];
var hudSnow:Array<FlxSprite> = [];
var fxDust:Array<FlxSprite> = [];
var scanlineBars:Array<FlxSprite> = [];
var glitchBars:Array<FlxSprite> = [];
var warningTint:FlxSprite = null;
var auroraA:FlxSprite = null;
var auroraB:FlxSprite = null;

var snowEnabled:Bool = false;
var dustEnabled:Bool = false;
var scanEnabled:Bool = false;
var warnEnabled:Bool = false;
var auroraEnabled:Bool = false;

var snowIntensity:Float = 1;
var dustIntensity:Float = 1;
var scanIntensity:Float = 1;
var warnIntensity:Float = 1;
var auroraIntensity:Float = 1;

var snowSpeed:Float = 1;
var dustSpeed:Float = 1;
var scanSpeed:Float = 1;
var warnSpeed:Float = 1;
var auroraSpeed:Float = 1;

var auroraTime:Float = 0;
var warningPulse:Float = 0;
var scanOffset:Float = 0;

function create() {
    // Stage snow: denser and attached to camGame so it lives inside the stage.
    for (i in 0...58) {
        var s = new FlxSprite();
        s.makeGraphic(FlxG.random.int(2, 5), FlxG.random.int(2, 5), FlxColor.WHITE);
        s.alpha = FlxG.random.float(0.25, 0.82);
        s.cameras = [camGame];
        s.scrollFactor.set(1, 1);
        s.visible = false;
        resetStageSnow(s, true);
        add(s);
        stageSnow.push(s);
    }

    // HUD snow: fewer particles, only enough to give depth in front of the screen.
    for (i in 0...16) {
        var s = new FlxSprite(FlxG.random.float(0, FlxG.width), FlxG.random.float(-FlxG.height, FlxG.height));
        s.makeGraphic(FlxG.random.int(2, 4), FlxG.random.int(2, 4), FlxColor.WHITE);
        s.alpha = FlxG.random.float(0.20, 0.62);
        s.cameras = [camHUD];
        s.scrollFactor.set(0, 0);
        s.visible = false;
        add(s);
        hudSnow.push(s);
    }

    for (i in 0...28) {
        var d = new FlxSprite(FlxG.random.float(0, FlxG.width), FlxG.random.float(0, FlxG.height));
        d.makeGraphic(FlxG.random.int(2, 5), FlxG.random.int(2, 5), 0xFF8FF9FF);
        d.alpha = FlxG.random.float(0.12, 0.42);
        d.cameras = [camHUD];
        d.scrollFactor.set(0, 0);
        d.visible = false;
        add(d);
        fxDust.push(d);
    }

    // Scanlines are sprites instead of pixel fillRect calls. This avoids
    // HScript rejecting openfl.geom.Rectangle on some Codename builds.
    for (i in 0...32) {
        var line = new FlxSprite(0, i * 24).makeGraphic(FlxG.width, 2, 0xFF000000);
        line.alpha = 0;
        line.cameras = [camHUD];
        line.scrollFactor.set(0, 0);
        line.visible = false;
        add(line);
        scanlineBars.push(line);
    }

    for (i in 0...6) {
        var bar = new FlxSprite(0, 0).makeGraphic(FlxG.width, FlxG.random.int(8, 24), 0xFFCCEEFF);
        bar.alpha = 0;
        bar.cameras = [camHUD];
        bar.scrollFactor.set(0, 0);
        bar.visible = false;
        add(bar);
        glitchBars.push(bar);
    }

    warningTint = new FlxSprite(0, 0).makeGraphic(FlxG.width, FlxG.height, 0xFFFF0000);
    warningTint.alpha = 0;
    warningTint.cameras = [camHUD];
    warningTint.scrollFactor.set(0, 0);
    warningTint.visible = false;
    add(warningTint);

    auroraA = new FlxSprite(-180, -90).makeGraphic(640, 900, 0xFF46B8FF);
    auroraA.alpha = 0;
    auroraA.angle = -24;
    auroraA.cameras = [camHUD];
    auroraA.scrollFactor.set(0, 0);
    auroraA.visible = false;
    add(auroraA);

    auroraB = new FlxSprite(760, -120).makeGraphic(500, 900, 0xFF8A6DFF);
    auroraB.alpha = 0;
    auroraB.angle = 18;
    auroraB.cameras = [camHUD];
    auroraB.scrollFactor.set(0, 0);
    auroraB.visible = false;
    add(auroraB);
}

function onEvent(ev) {
    if (ev == null || ev.event == null || ev.event.name != 'Among Shader FX') return;
    applyFxParams(ev.event.params);
}

// Also callable by the custom Charter preview.
function onEditorCustomEvent(e) {
    if (e == null || e.name != 'Among Shader FX') return;
    applyFxParams(e.params);
}

function applyFxParams(p:Array<Dynamic>) {
    if (p == null || p.length < 2) return;
    var effect:String = Std.string(p[0]).toLowerCase();
    var enable:Bool = p[1] == true || Std.string(p[1]).toLowerCase() == 'true';
    var intensity:Float = p.length > 2 ? Std.parseFloat(Std.string(p[2])) : 1;
    if (Math.isNaN(intensity)) intensity = 1;
    var speed:Float = p.length > 3 ? Std.parseFloat(Std.string(p[3])) : 1;
    if (Math.isNaN(speed)) speed = 1;
    var colorValue:Int = 0xFFFFFFFF;
    try { if (p.length > 4 && p[4] != null) colorValue = p[4]; } catch(e:Dynamic) {}

    switch(effect) {
        case 'snow':
            snowEnabled = enable;
            snowIntensity = intensity;
            snowSpeed = speed;
            for (s in stageSnow) { s.visible = enable; s.color = colorValue; }
            for (s in hudSnow) { s.visible = enable; s.color = colorValue; }
        case 'space-dust':
            dustEnabled = enable;
            dustIntensity = intensity;
            dustSpeed = speed;
            for (d in fxDust) { d.visible = enable; d.color = colorValue; }
        case 'scanlines':
            scanEnabled = enable;
            scanIntensity = intensity;
            scanSpeed = speed;
            for (line in scanlineBars) line.visible = enable;
            for (bar in glitchBars) bar.visible = enable;
        case 'warning':
            warnEnabled = enable;
            warnIntensity = intensity;
            warnSpeed = speed;
            if (warningTint != null) { warningTint.visible = enable; warningTint.color = colorValue; }
        case 'aurora':
            auroraEnabled = enable;
            auroraIntensity = intensity;
            auroraSpeed = speed;
            if (auroraA != null) { auroraA.visible = enable; auroraA.color = colorValue; }
            if (auroraB != null) { auroraB.visible = enable; auroraB.color = colorValue; }
    }
}

function update(elapsed:Float) {
    if (snowEnabled) {
        var cx:Float = camGame.scroll.x;
        var cy:Float = camGame.scroll.y;
        for (s in stageSnow) {
            s.y += (48 + s.height * 7) * elapsed * snowSpeed * Math.max(0.25, snowIntensity);
            s.x -= (8 + s.width * 2) * elapsed * snowSpeed;
            if (s.y > cy + FlxG.height + 90 || s.x < cx - 120) resetStageSnow(s, false);
        }
        for (s in hudSnow) {
            s.y += (58 + s.height * 8) * elapsed * snowSpeed * Math.max(0.25, snowIntensity);
            s.x -= (10 + s.width * 2) * elapsed * snowSpeed;
            if (s.y > FlxG.height + 10 || s.x < -12) {
                s.x = FlxG.random.float(0, FlxG.width + 80);
                s.y = FlxG.random.float(-70, -5);
            }
        }
    }

    if (dustEnabled) {
        for (d in fxDust) {
            d.x += (30 + d.width * 3) * elapsed * dustSpeed * Math.max(0.2, dustIntensity);
            d.y += (5 + d.height) * elapsed * dustSpeed;
            if (d.x > FlxG.width + 12) { d.x = -12; d.y = FlxG.random.float(0, FlxG.height); }
            if (d.y > FlxG.height + 12) d.y = -12;
        }
    }

    if (scanEnabled) {
        scanOffset += elapsed * 42 * scanSpeed;
        if (scanOffset >= 24) scanOffset -= 24;
        for (i in 0...scanlineBars.length) {
            var line = scanlineBars[i];
            line.y = (i * 24 + scanOffset) % (FlxG.height + 24) - 12;
            line.alpha = Math.min(0.35, 0.055 + 0.085 * scanIntensity);
        }
        for (bar in glitchBars) {
            bar.alpha *= 0.84;
            if (FlxG.random.bool(Std.int(Math.max(1, 3 * scanSpeed)))) {
                bar.alpha = FlxG.random.float(0.04, 0.14) * scanIntensity;
                bar.y = FlxG.random.float(0, FlxG.height - 24);
                bar.color = FlxG.random.bool() ? 0xFF66FFFF : 0xFFFF77B7;
            }
        }
    } else {
        for (line in scanlineBars) line.alpha = 0;
        for (bar in glitchBars) bar.alpha = 0;
    }

    if (warningTint != null) {
        if (warnEnabled) {
            warningPulse += elapsed * warnSpeed * 3.5;
            warningTint.alpha = Math.min(0.45, (0.025 + 0.11 * (0.5 + 0.5 * Math.sin(warningPulse))) * warnIntensity);
        } else warningTint.alpha = 0;
    }

    if (auroraA != null && auroraB != null) {
        if (auroraEnabled) {
            auroraTime += elapsed * auroraSpeed;
            auroraA.alpha = Math.min(0.26, 0.04 + 0.075 * auroraIntensity);
            auroraB.alpha = Math.min(0.22, 0.035 + 0.06 * auroraIntensity);
            auroraA.x = -190 + Math.sin(auroraTime * 1.2) * 115;
            auroraB.x = 760 + Math.cos(auroraTime) * 95;
            auroraA.angle = -24 + Math.sin(auroraTime) * 5;
            auroraB.angle = 18 + Math.cos(auroraTime * 0.7) * 4;
        } else {
            auroraA.alpha = 0;
            auroraB.alpha = 0;
        }
    }
}

function resetStageSnow(s:FlxSprite, first:Bool) {
    var cx:Float = camGame != null ? camGame.scroll.x : 0;
    var cy:Float = camGame != null ? camGame.scroll.y : 0;
    s.x = cx + FlxG.random.float(-80, FlxG.width + 120);
    s.y = first ? cy + FlxG.random.float(-FlxG.height, FlxG.height + 60) : cy + FlxG.random.float(-120, -8);
}
