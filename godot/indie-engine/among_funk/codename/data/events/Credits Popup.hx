import flixel.text.FlxText;
import flixel.text.FlxTextBorderStyle;
import flixel.util.FlxColor;
import flixel.group.FlxGroup;
import flixel.FlxSprite;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;
import flixel.util.FlxTimer;

var creditsGroup:FlxGroup;
var bgRect:FlxSprite;
var texts:Array<FlxText> = [];

function onEvent(creditsPopup) {
    if (creditsPopup.event.name == "Credits Popup") {
        var params:Array = creditsPopup.event.params;
        var songName:String = (params[0] == "" ? curSong : params[0]);
        var composer:String = params[1];
        var artist:String = params[2];
        var charter:String = params[3];
        var duration:Float = Std.parseFloat(params[4]);

        // Nettoyer l'ancien popup s'il est déjà affiché pour éviter les superpositions
        if (creditsGroup != null) {
            remove(creditsGroup);
            creditsGroup = null;
        }

        creditsGroup = new FlxGroup();
        add(creditsGroup);
        texts = [];

        // 1. CRÉATION DES TEXTES
        var titleText = new FlxText(0, 0, 0, songName.toUpperCase(), 32);
        titleText.setFormat(Paths.font("vcr.ttf"), 32, 0xFF00FFFF, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
        texts.push(titleText);

        if (composer != "") {
            var compText = new FlxText(0, 0, 0, "Music: " + composer, 22);
            compText.setFormat(Paths.font("vcr.ttf"), 22, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
            texts.push(compText);
        }

        if (artist != "") {
            var artText = new FlxText(0, 0, 0, "Art: " + artist, 22);
            artText.setFormat(Paths.font("vcr.ttf"), 22, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
            texts.push(artText);
        }

        if (charter != "") {
            var chartText = new FlxText(0, 0, 0, "Charter: " + charter, 22);
            chartText.setFormat(Paths.font("vcr.ttf"), 22, FlxColor.WHITE, "left", FlxTextBorderStyle.OUTLINE, FlxColor.BLACK);
            texts.push(chartText);
        }

        // 2. CALCUL DES DIMENSIONS POUR LE RECTANGLE
        var maxTextWidth:Float = 0;
        var totalHeight:Float = 0;
        var spacing:Float = 6;

        for (t in texts) {
            if (t.width > maxTextWidth) maxTextWidth = t.width;
            totalHeight += t.height + spacing;
        }

        // Dimensions finales du rectangle avec des marges internes (padding)
        var rectWidth:Int = Std.int(maxTextWidth + 40);
        var rectHeight:Int = Std.int(totalHeight + 20);

        // 3. POSITIONNEMENT DE DÉPART (Hors écran à droite, un peu en haut)
        var targetX:Float = FlxG.width - rectWidth - 0; // Position finale à l'écran
        var startX:Float = FlxG.width + 50;              // Position de départ cachée à droite
        var startY:Float = 450;                            // Hauteur (un peu en haut mais pas tout en haut)

        // Création du rectangle de fond (Gris/Bleu tablette avec contour noir style Among Us)
        bgRect = new FlxSprite(startX, startY).makeGraphic(rectWidth, rectHeight, 0xFF2C3E42);
        bgRect.alpha = 0.9;
        bgRect.cameras = [camHUD]; // Forcé sur le HUD pour ne pas bouger avec la caméra de jeu
        creditsGroup.add(bgRect);

        // Positionnement des textes à l'intérieur du rectangle
        var currentY:Float = startY + 15;
        for (t in texts) {
            t.x = startX + 20;
            t.y = currentY;
            t.cameras = [camHUD];
            creditsGroup.add(t);
            currentY += t.height + spacing;
        }

        // 4. ANIMATION EN "CIRC OUT" (Apparition depuis la droite)
        FlxTween.tween(bgRect, {x: targetX}, 0.8, {ease: FlxEase.circOut});
        for (i in 0...texts.length) {
            FlxTween.tween(texts[i], {x: targetX + 20}, 0.8, {ease: FlxEase.circOut});
        }

        // 5. ATTENTE PUIS ANIMATION EN "CIRC IN" (Disparition vers la droite)
        new FlxTimer().start(duration, function(tmr:FlxTimer) {
            var exitX:Float = FlxG.width + 50;
            
            FlxTween.tween(bgRect, {x: exitX}, 0.5, {ease: FlxEase.circIn, onComplete: function(twn:FlxTween) {
                // Supprime le groupe de la mémoire une fois l'animation finie
                if (creditsGroup != null) {
                    remove(creditsGroup);
                    creditsGroup = null;
                }
            }});

            for (i in 0...texts.length) {
                FlxTween.tween(texts[i], {x: exitX + 20}, 0.5, {ease: FlxEase.circIn});
            }
        });
    }
}