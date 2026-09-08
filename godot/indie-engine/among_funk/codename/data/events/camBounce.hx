import flixel.tweens.FlxTween;
import flixel.tweens.FlxTweenType;
import flixel.util.FlxTimer;

var bounceyay = false;
var angleyay = false;
var stronk = 20;
var angled = 2;

function onEvent(eve){
    if (eve.event.name == "camBounce") {
        bounceyay = eve.event.params[0];
        stronk = eve.event.params[1];
        angleyay = eve.event.params[2];
        angled = eve.event.params[3];
    }
}

function stepHit() {
    if (bounceyay){
      if (curStep % 4 == 0){
        FlxTween.tween(camHUD, {y: 0}, 0.17, {ease: FlxEase.circOut});
      }
      if (curStep % 4 == 2){
        FlxTween.tween(camHUD, {y: stronk}, 0.17, {ease: FlxEase.sineIn});
      }
    }
}

function beatHit(curBeat){
    if (angleyay){
        if (curBeat % 2 == 0){
            FlxTween.tween(camGame, {angle: -angled}, 0.3, {ease: FlxEase.cubeIn, type: FlxTweenType.BACKWARD});
        }
        else if (curBeat % 1 == 0){
            FlxTween.tween(camGame, {angle: angled}, 0.3, {ease: FlxEase.cubeIn, type: FlxTweenType.BACKWARD});
        }
    }
}