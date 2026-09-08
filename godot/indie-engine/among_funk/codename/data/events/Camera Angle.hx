import flixel.FlxG;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;

function onEvent(e) {
    if (e.event.name == "Camera Angle") {
        
        // 1. Récupération de tous tes paramètres
        var targetAngle:Float = Std.parseFloat(e.event.params[0]);
        var targetCam:String = Std.string(e.event.params[1]).toLowerCase();
        var duration:Float = Std.parseFloat(e.event.params[2]);
        var easeName:String = Std.string(e.event.params[3]);

        // 2. Sélection du style de fluidité (Ease)
        var easeFunc = FlxEase.cubeOut; // Très doux vers la fin (Par défaut)
        if (easeName == "linear") easeFunc = FlxEase.linear; // Vitesse constante
        else if (easeName == "cubeInOut") easeFunc = FlxEase.cubeInOut; // Lent au début ET à la fin
        else if (easeName == "backOut") easeFunc = FlxEase.backOut; // Dépasse un peu et revient (effet rebond)
        else if (easeName == "elasticOut") easeFunc = FlxEase.elasticOut; // Fait un gros effet élastique "boing"

        // 3. Fonction pour appliquer l'effet sans répéter le code
        function applyAngle(camObj:Dynamic) {
            if (camObj == null) return;
            
            // On annule uniquement les animations d'angle en cours pour ne pas annuler les zooms de la caméra !
            FlxTween.cancelTweensOf(camObj, ["angle"]); 
            
            if (duration <= 0) {
                // Si la durée est 0, on tourne d'un coup sec !
                camObj.angle = targetAngle;
            } else {
                // Sinon, on anime la rotation
                FlxTween.tween(camObj, {angle: targetAngle}, duration, {ease: easeFunc});
            }
        }

        // 4. On applique sur la bonne caméra selon ton choix dans la liste
        if (targetCam == "toutes") {
            applyAngle(FlxG.camera);
            applyAngle(camHUD);
        } else if (targetCam == "game") {
            applyAngle(FlxG.camera);
        } else if (targetCam == "hud") {
            applyAngle(camHUD);
        }
    }
}