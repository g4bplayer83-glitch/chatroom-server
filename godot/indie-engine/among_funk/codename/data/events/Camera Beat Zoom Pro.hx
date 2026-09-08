var zoomEnabled:Bool = false;
var zoomTarget:String = "both";
var zoomEvery:Int = 1;
var gameAdd:Float = 0.035;
var hudAdd:Float = 0.020;
var returnTime:Float = 0.12;
var alternate:Bool = false;
var alternateSide:Int = 1;

var gameOffset:Float = 0.0;
var hudOffset:Float = 0.0;
var lastGameApplied:Float = 0.0;
var lastHudApplied:Float = 0.0;

function f(v:Dynamic, fallback:Float):Float {
    var parsed = Std.parseFloat(Std.string(v));
    return Math.isNaN(parsed) ? fallback : parsed;
}

function i(v:Dynamic, fallback:Int):Int {
    var parsed = Std.parseInt(Std.string(v));
    return parsed == null ? fallback : parsed;
}

function b(v:Dynamic):Bool {
    return v == true || Std.string(v).toLowerCase() == "true";
}

function onEvent(e) {
    if (e == null || e.event == null || e.event.name != "Camera Beat Zoom Pro") return;

    var p = e.event.params;
    zoomEnabled = b(p[0]);
    zoomTarget = Std.string(p[1]);
    zoomEvery = i(p[2], 1);
    if (zoomEvery < 1) zoomEvery = 1;
    gameAdd = f(p[3], 0.035);
    hudAdd = f(p[4], 0.020);
    returnTime = f(p[5], 0.12);
    if (returnTime < 0.01) returnTime = 0.01;
    alternate = b(p[6]) || b(p[7]);

    if (!zoomEnabled) {
        gameOffset = 0;
        hudOffset = 0;
    }
}

function beatHit(curBeat:Int) {
    if (!zoomEnabled) return;
    if (curBeat % zoomEvery != 0) return;

    var mult = 1.0;
    if (alternate) {
        alternateSide *= -1;
        mult = alternateSide;
    }

    if (zoomTarget == "camGame" || zoomTarget == "both") {
        gameOffset += gameAdd * mult;
    }

    if (zoomTarget == "camHUD" || zoomTarget == "both") {
        hudOffset += hudAdd * mult;
    }
}

function update(elapsed:Float) {
    var decay = elapsed / returnTime;
    if (decay > 1) decay = 1;
    if (decay < 0) decay = 0;

    gameOffset += (0 - gameOffset) * decay;
    hudOffset += (0 - hudOffset) * decay;

    var gameDelta = gameOffset - lastGameApplied;
    var hudDelta = hudOffset - lastHudApplied;

    if (Math.abs(gameDelta) > 0.00001) camGame.zoom += gameDelta;
    if (Math.abs(hudDelta) > 0.00001) camHUD.zoom += hudDelta;

    lastGameApplied = gameOffset;
    lastHudApplied = hudOffset;
}
