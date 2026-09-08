import funkin.backend.system.Conductor;
import funkin.backend.system.Conductor.BeatType;
import funkin.editors.charter.Charter;
import funkin.backend.MusicBeatGroup;
import funkin.backend.MusicBeatState;
import funkin.game.Stage;
import funkin.game.Character;
import funkin.game.PlayState;
import flixel.FlxObject;
import flixel.FlxCamera;
import flixel.FlxSprite;
import flixel.math.FlxPoint;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;
import flixel.util.FlxTimer;
import funkin.backend.system.Flags;
import flixel.text.FlxText;
import openfl.Lib;
import funkin.backend.shaders.CustomShader;
import StringTools;

public var PLAY_CHARTER_TRANSITION:Bool = false;
var stage:Stage = null;
var curStage:String = "";
var characterGroups:Array<Array<Character>> = [];
var characterGroupData:Array<Dynamic> = [];

public var boyfriend:Character = null;
public var dad:Character = null;
public var gf:Character = null;
public var camGame:FlxCamera;
public var camHUD:FlxCamera;

// ✨ GESTION SÉCURISÉE DES SHADERS
var editorShaders:Array<Dynamic> = [];

// ✨ GESTION DES PERSONNAGES VIRTUELS
var virtualCharsPreview:Array<Dynamic> = [];

// ✨ CACHE DE PERSONNAGES (ANTI-LAG ULTIME)
var charPool:Array<Character> = [];

// ✨ GESTION DE LA TIMELINE
var isReplaying:Bool = false;
var lastStepFloat:Float = 0.0;
var blackBg:FlxSprite;

// Among Funk event preview layer for the Charter.
var amongFxStageSnow:Array<FlxSprite> = [];
var amongFxHudSnow:Array<FlxSprite> = [];
var amongFxScanlines:Array<FlxSprite> = [];
var amongFxDust:Array<FlxSprite> = [];
var amongFxWarning:FlxSprite = null;
var amongFxAuroraA:FlxSprite = null;
var amongFxAuroraB:FlxSprite = null;
var amongFxStatus:FlxText = null;
var amongFxName:String = "";
var amongFxEnabled:Bool = false;
var amongFxIntensity:Float = 1;
var amongFxSpeed:Float = 1;
var amongFxTime:Float = 0;

public var cinematicBar1:FlxSprite = null;
public var cinematicBar2:FlxSprite = null;

// -------------------------------------------------- VISUALIZER SETTINGS -----------------------------------------------------

var visColor:Int = 0xFFFFFFFF;
var visNumBars(get, never):Int;          function get_visNumBars():Int          { if (FlxG.save.data.charterVisNumBars == null)       FlxG.save.data.charterVisNumBars       = 12;   return FlxG.save.data.charterVisNumBars; }
var visMaxBarWidth(get, never):Float;    function get_visMaxBarWidth():Float    { if (FlxG.save.data.charterVisMaxBarWidth == null)   FlxG.save.data.charterVisMaxBarWidth   = 100;  return FlxG.save.data.charterVisMaxBarWidth; }
var visBarGap(get, never):Float;         function get_visBarGap():Float         { if (FlxG.save.data.charterVisBarGap == null)        FlxG.save.data.charterVisBarGap        = 1.5;  return FlxG.save.data.charterVisBarGap; }
var visSpeed(get, never):Float;          function get_visSpeed():Float          { if (FlxG.save.data.charterVisSpeed == null)         FlxG.save.data.charterVisSpeed         = 1.0;  return FlxG.save.data.charterVisSpeed; }
var visHeatMin(get, never):Float;        function get_visHeatMin():Float        { if (FlxG.save.data.charterVisHeatMin == null)       FlxG.save.data.charterVisHeatMin       = 0.0;  return FlxG.save.data.charterVisHeatMin; }
var visHeatMax(get, never):Float;        function get_visHeatMax():Float        { if (FlxG.save.data.charterVisHeatMax == null)       FlxG.save.data.charterVisHeatMax       = 0.2;  return FlxG.save.data.charterVisHeatMax; }
var visPulseAlpha(get, never):Float;     function get_visPulseAlpha():Float     { if (FlxG.save.data.charterVisPulseAlpha == null)    FlxG.save.data.charterVisPulseAlpha    = 0.6;  return FlxG.save.data.charterVisPulseAlpha; }
var visDynamicExpand(get, never):Float;  function get_visDynamicExpand():Float  { if (FlxG.save.data.charterVisDynamicExpand == null) FlxG.save.data.charterVisDynamicExpand = 1.2;  return FlxG.save.data.charterVisDynamicExpand; }
var visPeakDecay(get, never):Float;      function get_visPeakDecay():Float      { if (FlxG.save.data.charterVisPeakDecay == null)     FlxG.save.data.charterVisPeakDecay     = 0.05; return FlxG.save.data.charterVisPeakDecay; }

var lockWindowSize(get, never):Bool;     function get_lockWindowSize():Bool     { if (FlxG.save.data.charterLockWindowSize == null)   FlxG.save.data.charterLockWindowSize   = false; return FlxG.save.data.charterLockWindowSize; }

var visCamera:FlxCamera;
var leftBars:Array<FlxSprite> = [];
var rightBars:Array<FlxSprite> = [];
var leftPeaks:Array<FlxSprite> = [];
var rightPeaks:Array<FlxSprite> = [];
var barScales:Array<Float> = [];
var rightBarScales:Array<Float> = [];
var peakScales:Array<Float> = [];

var camFollow:FlxObject;
var curCameraTarget:Int = 0;
var camMoveTween:FlxTween;
var camZoomTween:FlxTween;
public var defaultCamZoom:Float = Flags.DEFAULT_CAM_ZOOM;
var defaultZoom:Float = Flags.DEFAULT_ZOOM;
var camGameZoomLerp:Float = Flags.DEFAULT_CAM_ZOOM_LERP;
var camGameZoomMult:Float = Flags.DEFAULT_CAM_ZOOM_MULT;
var camZoomLerp:Float = Flags.DEFAULT_ZOOM_LERP;

var camZooming:Bool = false;
var camZoomingInterval:Float = Flags.DEFAULT_CAM_ZOOM_INTERVAL;
var camZoomingOffset:Float = Flags.DEFAULT_CAM_ZOOM_OFFSET;
var camZoomingEvery:BeatType = BeatType.BEAT;
var camZoomingLastBeat:Float = 0;
var camZoomingStrength:Float = Flags.DEFAULT_CAM_ZOOM_STRENGTH;
var maxCamZoomMult:Float = Flags.MAX_CAMERA_ZOOM_MULT;
var useCamZoomMult:Bool = Flags.USE_CAM_ZOOM_MULT;
var camZoomingMult:Float = Flags.DEFAULT_ZOOM;
var maxCamZoom:Float = Math.NaN;

var nextNoteIndex:Int = 0;
var nextEventLeftIndex:Int = 0;
var nextEventRightIndex:Int = 0;
var _eventsToTrigger:Array<Dynamic> = [];

var transitioningOut:Bool = false;
var currentPulse:Float = 0.0;
var zoomText:FlxText;
var zoomTextShadow:FlxText;
var _wasMusicPlaying:Bool = false;

var camEditorActive:Bool = false;
var camEditorTransitioning:Bool = false;
var camEditorPanLastX:Float = 0;
var camEditorPanLastY:Float = 0;
var camEditorPanning:Bool = false;
var camEditorMouseDown:Bool = false;
var camEditorZoom:Float = 0.0;
var camEditorInfoText:FlxText;
var camEditorInfoTextShadow:FlxText;
var camEditorUIHidden:Bool = false;

// ✨ RETRAIT SÉCURISÉ DES SHADERS
function clearEditorShaders() {
    if (editorShaders != null) {
        for (item in editorShaders) {
            if (item != null && item.shader != null) {
                try {
                    if (camGame != null) camGame.removeShader(item.shader);
                    if (camHUD != null) camHUD.removeShader(item.shader);
                } catch(e:Dynamic) {}
            }
        }
        editorShaders = [];
    }
}

function removeEditorShaderByType(shName:String) {
    var i = editorShaders.length - 1;
    while (i >= 0) {
        var item = editorShaders[i];
        if (item != null && item.name == shName) {
            if (item.shader != null) {
                try {
                    if (camGame != null) camGame.removeShader(item.shader);
                    if (camHUD != null) camHUD.removeShader(item.shader);
                } catch(e:Dynamic) {}
            }
            editorShaders.splice(i, 1);
        }
        i--;
    }
}

// ✨ LE CACHE MAGIQUE DES PERSONNAGES (0 LAG)
function getCharFromPool(charName:String, isPlayer:Bool):Character {
    for (c in charPool) {
        if (c.curCharacter == charName && c.isPlayer == isPlayer) {
            return c;
        }
    }
    // S'il n'existe pas en mémoire, on le crée et on le stocke
    var c = new Character(0, 0, charName, isPlayer);
    charPool.push(c);
    return c;
}

// ✨ CHANGEMENT DE STAGE DYNAMIQUE (OPTIMISÉ)
function changePreviewStage(stageName:String) {
    if (stageName == null || stageName == "" || stageName == "none" || stageName == "null") return;
    if (curStage == stageName) return; // <-- ANTI-LAG : Évite de recharger le même décor !
    
    if (stage != null) {
        for (obj in stage.stageSprites) {
            remove(obj);
            obj.destroy();
        }
        remove(stage);
        stage.destroy();
    }
    
    curStage = stageName;
    stage = new Stage(stageName);
    var insertPos = 0;
    if (blackBg != null) insertPos = members.indexOf(blackBg);
    if (insertPos < 0) insertPos = 0;
    
    for (obj in stage.stageSprites) {
        obj.cameras = [camGame];
        insert(insertPos, obj);
        insertPos++;
    }
    insert(insertPos, stage);
    
    if (stage.stageXML.exists("zoom")) {
        var parsedZoom = Std.parseFloat(stage.stageXML.get("zoom"));
        if (!Math.isNaN(parsedZoom)) defaultCamZoom = parsedZoom;
    }
    
    if (stage.characterPoses != null) {
        if (dad != null && stage.characterPoses.exists("dad")) {
            var p = stage.characterPoses.get("dad");
            dad.setPosition(p.x, p.y);
        }
        if (boyfriend != null && stage.characterPoses.exists("boyfriend")) {
            var p = stage.characterPoses.get("boyfriend");
            boyfriend.setPosition(p.x, p.y);
        }
        if (gf != null && stage.characterPoses.exists("girlfriend")) {
            var p = stage.characterPoses.get("girlfriend");
            gf.setPosition(p.x, p.y);
        }
    }
}

function get_maxCamZoom():Float {
	return Math.isNaN(maxCamZoom) ? defaultCamZoom + (camZoomingMult * camGameZoomMult) : maxCamZoom;
}

function postCreate() {
	topMenu[2].childs[0].onSelect = _chart_playtest_override;
	topMenu[2].childs[1].onSelect = _chart_playtest_here_override;
	topMenu[2].childs[3].onSelect = _chart_playtest_opponent_override;
	topMenu[2].childs[4].onSelect = _chart_playtest_opponent_here_override;

	remove(charterBG);
	charterCamera.bgColor = 0;

	camGame = new FlxCamera();
	camGame.bgColor = 0;
	FlxG.cameras.insert(camGame, 0, false);

	visCamera = new FlxCamera();
	visCamera.bgColor = 0;
	FlxG.cameras.insert(visCamera, 1, false);

	camHUD = new FlxCamera();
	camHUD.bgColor = 0;
	FlxG.cameras.insert(camHUD, 2, false);

    setupAmongFxPreview();

    for (i in 0...2) {
        var cinematicBar = new FlxSprite().makeGraphic(1, 1, 0xFF000000);
        cinematicBar.scrollFactor.set(0, 0);
        cinematicBar.cameras = [camHUD];
        add(cinematicBar);
        cinematicBar.scale.set(FlxG.width, 0);
        cinematicBar.updateHitbox();

        if (i == 1) cinematicBar2 = cinematicBar;
        else cinematicBar1 = cinematicBar;
    }
    cinematicBar1.y = -10;

	{
		var slotH:Int = Math.floor(FlxG.height / visNumBars);
		var barH:Int = slotH - visBarGap;
		var mw:Int = Std.int(visMaxBarWidth);

		for (i in 0...visNumBars) {
			var y:Int = i * slotH;

			var lb = new FlxSprite(0, y).makeGraphic(mw, barH, 0xFFFFFFFF);
			lb.color = visColor;
			lb.origin.set(0, 0);
			lb.scale.x = 0.01;
			lb.cameras = [visCamera];
			add(lb);
			leftBars.push(lb);

			var rb = new FlxSprite(FlxG.width - mw, y).makeGraphic(mw, barH, 0xFFFFFFFF);
			rb.color = visColor;
			rb.origin.set(mw, 0);
			rb.scale.x = 0.01;
			rb.cameras = [visCamera];
			add(rb);
			rightBars.push(rb);

			var lp = new FlxSprite(0, y).makeGraphic(3, barH, 0xFFFFFFFF);
			lp.color = 0xFFFFFFFF;
			lp.alpha = 0;
			lp.cameras = [visCamera];
			add(lp);
			leftPeaks.push(lp);

			var rp = new FlxSprite(FlxG.width - 3, y).makeGraphic(3, barH, 0xFFFFFFFF);
			rp.color = 0xFFFFFFFF;
			rp.alpha = 0;
			rp.cameras = [visCamera];
			add(rp);
			rightPeaks.push(rp);

			barScales.push(0.0);
			rightBarScales.push(0.0);
			peakScales.push(0.0);
		}
	}

	camFollow = new FlxObject(0, 0, 2, 2);
	add(camFollow);

	zoomTextShadow = new FlxText(1, FlxG.height - 21, FlxG.width, "Zoom: 1.00");
	zoomTextShadow.setFormat(null, 14, 0xFF000000, "center");
	zoomTextShadow.scrollFactor.set(0, 0);
	zoomTextShadow.cameras = [uiCamera];
	zoomTextShadow.alpha = 0.7;
	add(zoomTextShadow);

	zoomText = new FlxText(0, FlxG.height - 22, FlxG.width, "Zoom: 1.00");
	zoomText.setFormat(null, 14, 0xFFFFFFFF, "center");
	zoomText.scrollFactor.set(0, 0);
	zoomText.cameras = [uiCamera];
	zoomText.alpha = 0.7;
	add(zoomText);

	camEditorInfoTextShadow = new FlxText(11, 1, FlxG.width - 20, "");
	camEditorInfoTextShadow.setFormat(null, 15, 0xFF000000, "left");
	camEditorInfoTextShadow.scrollFactor.set(0, 0);
	camEditorInfoTextShadow.cameras = [uiCamera];
	camEditorInfoTextShadow.visible = false;
	add(camEditorInfoTextShadow);

	camEditorInfoText = new FlxText(10, 0, FlxG.width - 20, "");
	camEditorInfoText.setFormat(null, 15, 0xFFFFFFFF, "left");
	camEditorInfoText.scrollFactor.set(0, 0);
	camEditorInfoText.cameras = [uiCamera];
	camEditorInfoText.visible = false;
	add(camEditorInfoText);

	if (PLAY_CHARTER_TRANSITION) {
		uiCamera.alpha = 0;
		charterCamera.alpha = 0;
		visCamera.alpha = 0;
		camGame.alpha = 0;
		camHUD.alpha = 0;
		FlxTween.tween(charterCamera, {alpha: 1}, 1, {ease: FlxEase.quintOut});
		FlxTween.tween(uiCamera, {alpha: 1}, 1, {ease: FlxEase.quintOut});
		FlxTween.tween(visCamera, {alpha: 1}, 1, {ease: FlxEase.quintOut});
		FlxTween.tween(camGame, {alpha: 1}, 1, {ease: FlxEase.quintOut});
		FlxTween.tween(camHUD, {alpha: 1}, 1, {ease: FlxEase.quintOut});
	}
	PLAY_CHARTER_TRANSITION = false;
	camZoomingInterval = PlayState.SONG.meta.beatsPerMeasure != null ? PlayState.SONG.meta.beatsPerMeasure : 4;

	reloadStage(true);
}

function destroy() {
	FlxG.animationTimeScale = 1;
	FlxG.cameras.reset();
	if (camGame != null) camGame.destroy();
	if (camHUD != null) camHUD.destroy();
	if (visCamera != null) visCamera.destroy();
}

function clearStage() {
	if (stage != null) {
		for (obj in stage.stageSprites) {
			remove(obj);
			obj.destroy();
		}
		remove(stage);
		stage.destroy();
		stage = null;
	}

    if (blackBg != null) {
        remove(blackBg);
        blackBg.destroy();
        blackBg = null;
    }

    // ✨ NETTOYAGE DU CACHE
    for (char in charPool) {
        if (char != null) {
            remove(char);
            char.destroy();
        }
    }
    charPool = [];

	characterGroups = [];
	characterGroupData = [];
    virtualCharsPreview = [];

    clearEditorShaders();
}

function reloadStage(firstLoad:Bool) {
	if (!firstLoad) clearStage();

	curStage = (chart.stage == null || StringTools.trim(chart.stage) == "") ? "stage" : chart.stage;
	stage = new Stage(curStage);

	for (obj in stage.stageSprites) obj.cameras = [camGame];
	add(stage);

    blackBg = new FlxSprite(-2000, -2000).makeGraphic(1, 1, 0xFF000000);
    blackBg.scale.set(10000, 10000);
    blackBg.updateHitbox();
    blackBg.scrollFactor.set(0, 0);
    blackBg.alpha = 0;
    blackBg.cameras = [camGame];
    add(blackBg);

	if (stage.stageXML.exists("startCamPosX")) {
		var parsedX = Std.parseFloat(stage.stageXML.get("startCamPosX"));
		if (!Math.isNaN(parsedX)) camFollow.x = parsedX;
	}
	if (stage.stageXML.exists("startCamPosY")) {
		var parsedY = Std.parseFloat(stage.stageXML.get("startCamPosY"));
		if (!Math.isNaN(parsedY)) camFollow.y = parsedY;
	}
	if (stage.stageXML.exists("zoom")) {
		var parsedZoom = Std.parseFloat(stage.stageXML.get("zoom"));
		if (!Math.isNaN(parsedZoom)) defaultCamZoom = parsedZoom;
	}

	camGame.follow(camFollow, 0x00, 0.04);
	camGame.zoom = defaultCamZoom;

	boyfriend = null; dad = null; gf = null;

	for (i => strumLineGrp in strumLines.members) {
		var strumLine = strumLineGrp.strumLine;
		if (strumLine == null) continue;
		var chars:Array<Character> = [];
        var origNames:Array<String> = [];
        var origPos:Array<Dynamic> = [];

		var charPosName:String = strumLine.position == null ?
			(switch(strumLine.type) {
				case 0: "dad";
				case 1: "boyfriend";
				case 2: "girlfriend";
				default: "dad";
			}) : strumLine.position;
            
		if (strumLine.characters != null) {
			for (k => charName in strumLine.characters) {
				var isFlipped = stage.isCharFlipped(stage.characterPoses[charName] != null ? charName : charPosName, strumLine.type == 1);
				
                // ✨ UTILISATION DU CACHE AU LIEU DE CREER UN NOUVEL OBJET
                var char = getCharFromPool(charName, isFlipped);
                char.setPosition(0, 0); // Reset temporaire

				stage.applyCharStuff(char, charPosName, k);
				char.cameras = [camGame];
                char.visible = true;
                char.active = true;
				chars.push(char);
				add(char);

                origNames.push(charName);
                origPos.push({x: char.x, y: char.y});

				if (charPosName == "boyfriend" || charPosName == "bf") boyfriend = char;
				else if (charPosName == "girlfriend" || charPosName == "gf") gf = char;
				else if (dad == null) dad = char;
			}
		}
		
		characterGroups.push(chars);
		characterGroupData.push({
			animSuffix: "",
			lastHit: { time: 0, endTime: 0, dir: -1, animSuffix: "" },
			characterList: Std.string(strumLine.characters),
            originalNames: origNames,
            originalPositions: origPos
		});
	}

	if (firstLoad) {
		if (PlayState.smoothTransitionData != null && PlayState.smoothTransitionData.stage == curStage) {
			camGame.scroll.set(PlayState.smoothTransitionData.camX, PlayState.smoothTransitionData.camY);
			camGame.zoom = PlayState.smoothTransitionData.camZoom;
			MusicBeatState.skipTransIn = true;
			camFollow.setPosition(PlayState.smoothTransitionData.camFollowX, PlayState.smoothTransitionData.camFollowY);
		} else {
			camGame.focusOn(camFollow.getPosition(FlxPoint.weak()));
		}
		PlayState.smoothTransitionData = null;
	}
}

// ✨ RECONSTRUCTION EXTRÊMEMENT RAPIDE (0 LAG GARANTI)
function rebuildPreviewState(targetStep:Float) {
    isReplaying = true;
    
    // 1. Rassemble tous les évènements passés
    var allPastEvents:Array<Dynamic> = [];
    for (slot in leftEventsGroup.members) {
        if (slot != null && slot.events != null && slot.step <= targetStep) {
            for (ev in slot.events) allPastEvents.push({ step: slot.step, ev: ev });
        }
    }
    for (slot in rightEventsGroup.members) {
        if (slot != null && slot.events != null && slot.step <= targetStep) {
            for (ev in slot.events) allPastEvents.push({ step: slot.step, ev: ev });
        }
    }
    allPastEvents.sort(function(a, b) { return Std.int(a.step - b.step); });

    // 2. Détecte si la salle a changé pour ne charger que la DERNIERE salle voulue (Anti-Lag)
    var targetStageName = (chart.stage == null || StringTools.trim(chart.stage) == "") ? "stage" : chart.stage;
    for (item in allPastEvents) {
        if (item.ev.name == "Stage Swap" || item.ev.name == "Change Stage") {
            targetStageName = Std.string(item.ev.params[0]);
        }
    }
    changePreviewStage(targetStageName); // Ne lag pas si on est déjà dessus !
    
    // 3. Reset simple des caméras
    camGame.zoom = defaultCamZoom;
    camHUD.zoom = 1.0;
    camGame.angle = 0;
    camHUD.angle = 0;
    
    FlxTween.cancelTweensOf(camGame);
    FlxTween.cancelTweensOf(camHUD);
    if (cinematicBar1 != null) FlxTween.cancelTweensOf(cinematicBar1.scale);
    if (cinematicBar2 != null) FlxTween.cancelTweensOf(cinematicBar2.scale);
    
    camZoomingMult = 0.0;
    camZoomingInterval = PlayState.SONG.meta.beatsPerMeasure != null ? PlayState.SONG.meta.beatsPerMeasure : 4;
    camZoomingStrength = Flags.DEFAULT_CAM_ZOOM_STRENGTH;
    camZoomingEvery = BeatType.BEAT;
    camZoomingOffset = Flags.DEFAULT_CAM_ZOOM_OFFSET;

    onEditorEventHit({name: "Visual_FX", params: ["", false]});
    onEditorEventHit({name: "CRT Effect", params: [0, 0, 1, 0]});
    onEditorEventHit({name: "Cinematic Bars", params: [false, 0.0, 0.01, "linear", "", "camHUD"]});
    onEditorEventHit({name: "LightsOut", params: [false]});
    onEditorEventHit({name: "Among Shader FX", params: ["snow", false, 1, 1, 0xFFFFFFFF]});
    onEditorEventHit({name: "Among Shader FX", params: ["space-dust", false, 1, 1, 0xFFFFFFFF]});
    onEditorEventHit({name: "Among Shader FX", params: ["scanlines", false, 1, 1, 0xFFFFFFFF]});
    onEditorEventHit({name: "Among Shader FX", params: ["warning", false, 1, 1, 0xFFFF3333]});
    onEditorEventHit({name: "Among Shader FX", params: ["aurora", false, 1, 1, 0xFF66CCFF]});

    // 4. RESTAURATION ULTRA-RAPIDE DES PERSONNAGES DE BASE
    for (i in 0...characterGroupData.length) {
        var data = characterGroupData[i];
        if (data.originalNames != null) {
            for (j in 0...data.originalNames.length) {
                onEditorEventHit({name: "Change Character", params: [i, data.originalNames[j], j]});
                if (characterGroups[i] != null && characterGroups[i][j] != null && data.originalPositions[j] != null) {
                    characterGroups[i][j].setPosition(data.originalPositions[j].x, data.originalPositions[j].y);
                }
            }
        }
    }
    
    for (v in virtualCharsPreview) {
        if (v != null && v.char != null) v.char.visible = false;
    }

    // 5. On rejoue les vieux events silencieusement (Sauf Stage Swap déjà traité)
    for (item in allPastEvents) {
        if (item.ev.name != "Stage Swap" && item.ev.name != "Change Stage") {
            onEditorEventHit(item.ev);
        }
    }
    
    onCameraMove();
    camGame.scroll.set(camFollow.x - camGame.width * 0.5, camFollow.y - camGame.height * 0.5);
    camGame.snapToTarget();
    
    isReplaying = false;
}

function update(elapsed:Float) {
	if (FlxG.keys.justPressed.R) {
		clearStage();
		reloadStage(false);
		return;
	}
	var doReload = false;
	var stageName = (chart.stage == null || StringTools.trim(chart.stage) == "") ? "stage" : chart.stage;
	if (curStage != stageName || gridBackdrops.strumlinesAmount != characterGroupData.length) {
		doReload = true;
	} else {
		for (i => data in characterGroupData) {
			if (strumLines.members[i] == null || data.characterList != Std.string(strumLines.members[i].strumLine.characters)) {
				doReload = true;
				break;
			}
		}
	}

	if (doReload) reloadStage(false);

    updateAmongFxPreview(elapsed);

    // DÉTECTION DU SCRUBBING / SAUT DANS LA TIMELINE !
    var isJump = Math.abs(curStepFloat - lastStepFloat) > 4.0 || curStepFloat < lastStepFloat;

    if (isJump) {
        rebuildPreviewState(curStepFloat);

        nextEventLeftIndex = 0;
        while (nextEventLeftIndex < leftEventsGroup.members.length && curStepFloat >= leftEventsGroup.members[nextEventLeftIndex].step) nextEventLeftIndex++;
        
        nextEventRightIndex = 0;
        while (nextEventRightIndex < rightEventsGroup.members.length && curStepFloat >= rightEventsGroup.members[nextEventRightIndex].step) nextEventRightIndex++;
        
        nextNoteIndex = 0;
        while (nextNoteIndex < notesGroup.members.length && curStepFloat >= notesGroup.members[nextNoteIndex].step) nextNoteIndex++;
        
        _eventsToTrigger.resize(0);
    } else {
        _eventsToTrigger.resize(0);
        nextEventLeftIndex  = _processEvents(leftEventsGroup,  nextEventLeftIndex,  true);
        nextEventRightIndex = _processEvents(rightEventsGroup, nextEventRightIndex, false);
        
        if (_eventsToTrigger.length > 1) _eventsToTrigger.sort(function(a, b) { return Std.int(a.step - b.step); });
        
		for (item in _eventsToTrigger) onEditorEventHit(item.ev);

        while (nextNoteIndex < notesGroup.members.length && curStepFloat >= notesGroup.members[nextNoteIndex].step) {
            _onEditorNoteHit(notesGroup.members[nextNoteIndex]);
            nextNoteIndex++;
        }
    }
    
    lastStepFloat = curStepFloat;

    if (cinematicBar1 != null && cinematicBar2 != null) {
        cinematicBar1.updateHitbox();
        cinematicBar2.updateHitbox();
        cinematicBar2.y = FlxG.height - cinematicBar2.height + 10;
    }

    for (v in virtualCharsPreview) {
        if (v.char != null && v.char.visible && v.char.animation.curAnim != null) {
            if (StringTools.startsWith(v.char.animation.curAnim.name, "sing")) {
                v.customTimer += elapsed;
                if (v.customTimer >= v.holdTimeRequired) {
                    v.char.dance();
                    v.customTimer = 0.0;
                }
            }
        }
    }

	if (leftBars.length > 0) {
		var ampLeft:Float = 0.0;
		var ampRight:Float = 0.0;
		if (FlxG.sound.music != null && FlxG.sound.music.playing) {
			ampLeft  = FlxG.sound.music.amplitudeLeft;
			ampRight = FlxG.sound.music.amplitudeRight;
		}

		var _sr:Int = (visColor >> 16) & 0xFF;
		var _sg:Int = (visColor >> 8)  & 0xFF;
		var _sb:Int =  visColor        & 0xFF;

		for (i in 0...visNumBars) {
			var lb = leftBars[i];
			var rb = rightBars[i];
			var lp = leftPeaks[i];
			var rp = rightPeaks[i];
			var ni:Float = i / visNumBars;

			var bassFreq:Float = 1.0 - (ni * 0.7);
			var speed:Float = 200 - (ni * 140);
			var wave1:Float = Math.sin((Conductor.songPosition / speed) + (i * 0.4));
			var wave2:Float = Math.cos((Conductor.songPosition / (speed * 0.6)) - (i * 0.7));
			var combined:Float = Math.abs(wave1 * wave2);
			var eqShape:Float = 1.0 - (ni * 0.35);
			var sensitivity:Float = 0.6 + bassFreq * 0.8;

			var noiseL:Float = FlxG.random.float(0.65, 1.35);
			var noiseR:Float = FlxG.random.float(0.65, 1.35);

			var targetL:Float = 0.0;
			var targetR:Float = 0.0;
			if (ampLeft > 0.015)
				targetL = combined * noiseL * ampLeft * 2.4 * eqShape * sensitivity;
			if (ampRight > 0.015)
				targetR = combined * noiseR * ampRight * 2.4 * eqShape * sensitivity;
			if (targetL > 1) targetL = 1;
			if (targetR > 1) targetR = 1;

			if (targetL > barScales[i])
				barScales[i] = CoolUtil.fpsLerp(barScales[i], targetL, visSpeed);
			else
				barScales[i] = CoolUtil.fpsLerp(barScales[i], targetL, 0.2);

			if (targetR > rightBarScales[i])
				rightBarScales[i] = CoolUtil.fpsLerp(rightBarScales[i], targetR, visSpeed);
			else
				rightBarScales[i] = CoolUtil.fpsLerp(rightBarScales[i], targetR, 0.2);

			var lDynMult:Float = 1.0 + (barScales[i] * ampLeft * visDynamicExpand);
			var rDynMult:Float = 1.0 + (rightBarScales[i] * ampRight * visDynamicExpand);
			lb.scale.x = barScales[i] * lDynMult;
			rb.scale.x = rightBarScales[i] * rDynMult;

			var amplitude:Float = (ampLeft + ampRight) * 0.5;
			var heat:Float = visHeatMin + barScales[i] * (visHeatMax - visHeatMin);
			if (heat > 1) heat = 1;
			var hr:Int = Std.int(_sr + (255 - _sr) * heat);
			var hg:Int = Std.int(_sg + (255 - _sg) * heat);
			var hb:Int = Std.int(_sb + (255 - _sb) * heat);
			var heatColor:Int = 0xFF000000 | (hr << 16) | (hg << 8) | hb;
			lb.color = heatColor;
			rb.color = heatColor;

			var barAlpha:Float = visHeatMin + barScales[i] * (visHeatMax - visHeatMin) + currentPulse;
			if (barAlpha < visHeatMin) barAlpha = visHeatMin;
			if (barAlpha > 1) barAlpha = 1;
			lb.alpha = barAlpha;
			rb.alpha = barAlpha;

			var lVisual:Float = barScales[i] * lDynMult;
			var rVisual:Float = rightBarScales[i] * rDynMult;
			var maxVisual:Float = lVisual > rVisual ? lVisual : rVisual;

			if (maxVisual >= peakScales[i])
				peakScales[i] = maxVisual;

			peakScales[i] = Math.max(0, peakScales[i] - visPeakDecay * elapsed * 60);

			var peakX:Float = peakScales[i] * visMaxBarWidth;
			lp.x = peakX - 3;
			lp.alpha = peakScales[i] > 0.02 ? 0.7 : 0;
			lp.color = visColor;
			rp.x = FlxG.width - peakX;
			rp.alpha = lp.alpha;
			rp.color = visColor;
		}
	}

	if (camZooming) {
		var beat = Conductor.getBeats(camZoomingEvery, camZoomingInterval, camZoomingOffset);
		if (camZoomingLastBeat != beat) {
			camZoomingLastBeat = beat;
			if (useCamZoomMult && camZoomingMult < maxCamZoomMult) {
				camZoomingMult += camZoomingStrength;
			} else if (!useCamZoomMult && camGame.zoom < maxCamZoom) {
				camGame.zoom += camGameZoomMult * camZoomingStrength;
				camHUD.zoom += camGameZoomMult * camZoomingStrength;
			}
			if (!transitioningOut) {
				currentPulse = visPulseAlpha;
				if (!camEditorActive) {
					camGame.zoom += 0.015;
					camHUD.zoom += 0.03;
				}
			}
		}
		
		if (useCamZoomMult) {
			camZoomingMult = CoolUtil.fpsLerp(camZoomingMult, defaultZoom, camZoomLerp) - defaultZoom;
			camGame.zoomMultiplier = (camZoomingMult * camGameZoomMult) + defaultZoom;
			camZoomingMult += defaultZoom;
		}
		camGame.zoom = CoolUtil.fpsLerp(camGame.zoom, defaultCamZoom, camGameZoomLerp * playBackSlider.value);
		camHUD.zoom = CoolUtil.fpsLerp(camHUD.zoom, 1.0, camGameZoomLerp * playBackSlider.value);
	}

	if (curCameraTarget != -1) onCameraMove();

	var _isMusicPlaying:Bool = FlxG.sound.music != null && FlxG.sound.music.playing;
	if (_isMusicPlaying && !_wasMusicPlaying) {
		FlxTween.cancelTweensOf(charterCamera, ["alpha"]);
		FlxTween.tween(charterCamera, {alpha: 0.5}, 0.4, {ease: FlxEase.quartOut});
	} else if (!_isMusicPlaying && _wasMusicPlaying) {
		FlxTween.cancelTweensOf(charterCamera, ["alpha"]);
		FlxTween.tween(charterCamera, {alpha: 1.0}, 0.4, {ease: FlxEase.quartOut});
	}
	_wasMusicPlaying = _isMusicPlaying;

	if (lockWindowSize) _enforceWindowSize();
	FlxG.animationTimeScale = playBackSlider.value;

	if (nextNoteIndex == 0 && (notesGroup.members[0] == null || notesGroup.members[0].step > curStepFloat)) {
		camZooming = false;
	}

	if (!transitioningOut) {
		currentPulse = CoolUtil.fpsLerp(currentPulse, 0.0, 0.07);
	}

	var zoomStr:String = Math.round(camGame.zoom * 100) / 100 + "";
	if (zoomStr.indexOf(".") == -1) zoomStr += ".00";
	else if (zoomStr.indexOf(".") == zoomStr.length - 2) zoomStr += "0";
	var modType:String = switch(camZoomingEvery) {
		case BeatType.STEP: "Step:";
		case BeatType.MEASURE: "Measure:";
		default: "Beat:";
	};
	var modInterval:Int = Std.int(camZoomingInterval);
	var timeSig:Int = PlayState.SONG != null && PlayState.SONG.meta != null && PlayState.SONG.meta.beatsPerMeasure != null ? Std.int(PlayState.SONG.meta.beatsPerMeasure) : 4;
	zoomText.text = "Zoom: " + zoomStr + " | " + modType + " " + modInterval + "/" + timeSig;
	zoomTextShadow.text = zoomText.text;

	if (camEditorActive && !camEditorTransitioning) {
		if (FlxG.keys.justPressed.W) {
			camEditorUIHidden = !camEditorUIHidden;
			var a:Float = camEditorUIHidden ? 0.0 : 1.0;
			camEditorInfoText.alpha = a;
			camEditorInfoTextShadow.alpha = a;
		}

		var songPlaying:Bool = FlxG.sound.music != null && FlxG.sound.music.playing;
		if (songPlaying) {
			camEditorZoom = camGame.zoom;
		} else {
			if (FlxG.keys.justPressed.E) camEditorZoom = Math.max(0.1, Math.round((camEditorZoom + 0.05) * 1000) / 1000);
			if (FlxG.keys.justPressed.Q) camEditorZoom = Math.max(0.1, Math.round((camEditorZoom - 0.05) * 1000) / 1000);
		}

		if (FlxG.keys.justPressed.S) {
			var posX:Float = Math.round(camGame.scroll.x + camGame.width * 0.5);
			var posY:Float = Math.round(camGame.scroll.y + camGame.height * 0.5);
			Charter.instance.addEventAtCurrentStep("Camera Position", [posX, posY, false, null, null, null, false], true, false);
			closeCamEditor();
		} else if (FlxG.keys.justPressed.F1) {
			closeCamEditor();
		}
	} else if (!camEditorActive && !camEditorTransitioning && FlxG.keys.justPressed.F1) {
		openCamEditor();
	}

	if (camEditorActive && !camEditorTransitioning) updateCamEditor(elapsed);
}

function openCamEditor() {
	if (camEditorTransitioning) return;
	camEditorTransitioning = true;
	camEditorMouseDown = false;
	camEditorPanning = false;
	camEditorZoom = camGame.zoom;

	FlxG.mouse.enabled = false;
	Lib.current.stage.addEventListener("mouseDown", _camEditorMouseDown);
	Lib.current.stage.addEventListener("mouseUp", _camEditorMouseUp);

	var fadeDur:Float = 0.35;
	FlxTween.tween(charterCamera, {alpha: 0}, fadeDur, {ease: FlxEase.quartOut});
	FlxTween.tween(visCamera, {alpha: 0}, fadeDur, {
		ease: FlxEase.quartOut,
		onComplete: function(_) {
			camEditorInfoText.visible = true;
			camEditorInfoTextShadow.visible = true;
			zoomText.visible = false;
			zoomTextShadow.visible = false;
			camEditorActive = true;
			camEditorTransitioning = false;
		}
	});
}

function closeCamEditor() {
	if (camEditorTransitioning) return;
	camEditorTransitioning = true;
	camEditorActive = false;
	camEditorPanning = false;
	camEditorMouseDown = false;
	camEditorUIHidden = false;
	camEditorInfoText.alpha = 1;
	camEditorInfoTextShadow.alpha = 1;
	camGame.zoom = defaultCamZoom;
	camGame.followEnabled = true;

	FlxG.mouse.enabled = true;
	Lib.current.stage.removeEventListener("mouseDown", _camEditorMouseDown);
	Lib.current.stage.removeEventListener("mouseUp", _camEditorMouseUp);

	camEditorInfoText.visible = false;
	camEditorInfoTextShadow.visible = false;
	zoomText.visible = true;
	zoomTextShadow.visible = true;

	var fadeDur:Float = 0.35;
	var targetCharterAlpha:Float = (FlxG.sound.music != null && FlxG.sound.music.playing) ? 0.5 : 1.0;
	FlxTween.cancelTweensOf(charterCamera, ["alpha"]);
	FlxTween.tween(charterCamera, {alpha: targetCharterAlpha}, fadeDur, {ease: FlxEase.quartOut});
	FlxTween.tween(visCamera, {alpha: 1}, fadeDur, {
		ease: FlxEase.quartOut,
		onComplete: function(_) { camEditorTransitioning = false; }
	});
}

function _camEditorMouseDown(e) {
	camEditorMouseDown = true;
	camEditorPanning = true;
	camEditorPanLastX = FlxG.mouse.screenX;
	camEditorPanLastY = FlxG.mouse.screenY;
}

function _camEditorMouseUp(e) {
	camEditorMouseDown = false;
	camEditorPanning = false;
}

function updateCamEditor(elapsed:Float) {
	var songPlaying:Bool = FlxG.sound.music != null && FlxG.sound.music.playing;

	camGame.zoom = camEditorZoom;

	if (!songPlaying && camEditorPanning && camEditorMouseDown) {
		var dx:Float = (FlxG.mouse.screenX - camEditorPanLastX) / camGame.zoom;
		var dy:Float = (FlxG.mouse.screenY - camEditorPanLastY) / camGame.zoom;
		camGame.scroll.x -= dx;
		camGame.scroll.y -= dy;
		camGame.followEnabled = false;
		camFollow.setPosition(
			camGame.scroll.x + camGame.width * 0.5,
			camGame.scroll.y + camGame.height * 0.5
		);
		camEditorPanLastX = FlxG.mouse.screenX;
		camEditorPanLastY = FlxG.mouse.screenY;
	}

	var scrollX:Float = Math.round(camGame.scroll.x + camGame.width * 0.5);
	var scrollY:Float = Math.round(camGame.scroll.y + camGame.height * 0.5);
	var camZ:Float = Math.round(camEditorZoom * 100) / 100;
	var followX:Float = Math.round(camFollow.x);
	var followY:Float = Math.round(camFollow.y);
	var lockStr:String = songPlaying ? "  [stop song to pan]" : "";

	camEditorInfoText.text =
		"CAMERA MODE  [F1 to exit]" + lockStr + "\n" +
		"Camera Center:  X=" + scrollX + "  Y=" + scrollY + "\n" +
		"Follow Target:  X=" + followX + "  Y=" + followY + "\n" +
		"Zoom: " + camZ + "x\n" +
		"[S] Save position  [Q/E] Zoom  [W] Hide UI";
	camEditorInfoText.y = FlxG.height - camEditorInfoText.height - 8;
	camEditorInfoTextShadow.text = camEditorInfoText.text;
	camEditorInfoTextShadow.y = camEditorInfoText.y + 1;
}

function _processEvents(group:Dynamic, index:Int, isLeft:Bool):Int {
	if (index > group.members.length) index = group.members.length;
    while (index < group.members.length && curStepFloat >= group.members[index].step) {
        var slot = group.members[index];
        if (slot != null && slot.events != null) {
            for (ev in slot.events) {
                _eventsToTrigger.push({ step: slot.step, ev: ev, isLeft: isLeft });
            }
        }
        index++;
    }
	return index;
}

function onCameraMove() {
	if (curCameraTarget >= 0 && characterGroups[curCameraTarget] != null) {
		var pos = FlxPoint.get();
		var validChars = 0;
		for (c in characterGroups[curCameraTarget]) {
			if (c == null || !c.visible) continue;
			var cpos = c.getCameraPosition();
			pos.addPoint(cpos);
			cpos.put();
			validChars++;
		}
		if (validChars > 0) {
			pos.scale(1 / validChars);
			camFollow.setPosition(pos.x, pos.y);
		}
		pos.put();
	}
}

function _onEditorNoteHit(note:Dynamic) {
	var noteType = noteTypes[note.type - 1];
	var animSuffix = characterGroupData[note.strumLineID].animSuffix;
	var animCancelled = false;
	var enableCamZooming = true;

	if (noteType == "Alt Anim Note") animSuffix = "-alt";
	if (noteType == "No Anim Note") animCancelled = true;

	if (!animCancelled) {
		var time = Conductor.getTimeForStep(note.step);
		var data = characterGroupData[note.strumLineID];
		if (!(time >= data.lastHit.time && data.lastHit.endTime > time)) {
			data.lastHit.time = time;
			data.lastHit.endTime = time + (Conductor.stepCrochet * note.susLength);
			data.lastHit.dir = note.id;
			data.lastHit.animSuffix = animSuffix;
		}
		for (char in characterGroups[note.strumLineID]) {
			char.playSingAnim(note.id, animSuffix, "SING", true);
			char.lastHit = data.lastHit.endTime;
		}
	}
    
    var isPlayerNote = false;
    var isOpponentNote = false;
    if (note.strumLineID == 0) isOpponentNote = true;
    if (note.strumLineID == 1) isPlayerNote = true;

    for (v in virtualCharsPreview) {
        if (v.char == null || !v.char.visible) continue;
        var wantsBf = (v.target == "bf" || v.target == "boyfriend" || v.target == "player");
        var wantsDad = (v.target == "dad" || v.target == "opponent");

        if ((isPlayerNote && wantsBf) || (isOpponentNote && wantsDad)) {
            var animSuffixVC = characterGroupData[note.strumLineID].animSuffix;
            v.char.playSingAnim(note.id, animSuffixVC, "SING", true);
            var noteTime = (Conductor.stepCrochet * note.susLength) / 1000.0;
            v.holdTimeRequired = noteTime + 1.5;
            v.customTimer = 0.0;
        }
    }
    
	if (enableCamZooming) camZooming = true;
}

function onEditorEventHit(e:Dynamic) {
    if (e == null || e.name == null) return;
    
	var p = e.params;
    var durationMult:Float = isReplaying ? 0.0 : 1.0; 
    
    if (!isReplaying) trace("[Charter Preview] " + e.name);
    if (amongFxStatus != null && !isReplaying) {
        var paramText:String = "";
        try { if (p != null) paramText = p.join("  /  "); } catch(err:Dynamic) {}
        amongFxStatus.text = "EVENT PREVIEW  //  " + Std.string(e.name).toUpperCase() + (paramText == "" ? "" : "\n" + paramText);
        amongFxStatus.alpha = 1;
    }

	switch (e.name) {
		case "Camera Movement":
			if (camMoveTween != null) camMoveTween.cancel();
			curCameraTarget = p[0];
			onCameraMove();
			camGame.followEnabled = true;
			if (p[1] == false || isReplaying) {
				camGame.scroll.set(camFollow.x - camGame.width * 0.5, camFollow.y - camGame.height * 0.5);
				camGame.snapToTarget();
			}
			if (p[3] != null && p[3] != "CLASSIC" && !isReplaying) {
				var oldFollow = camGame.followEnabled;
				camGame.followEnabled = false;
				camMoveTween = FlxTween.tween(camGame.scroll,
					{x: camFollow.x - camGame.width * 0.5, y: camFollow.y - camGame.height * 0.5},
					(Conductor.stepCrochet / 1000) * (p[2] == null ? 4 : p[2]),
					{
						ease: CoolUtil.flxeaseFromString(p[3], p[4]),
						onComplete: function(_) { camGame.followEnabled = oldFollow; }
					});
			}

		case "Camera Position":
			if (camMoveTween != null) camMoveTween.cancel();
			var isOffset = p[6] == true;
			camFollow.setPosition(isOffset ? (camFollow.x + p[0]) : p[0], isOffset ? (camFollow.y + p[1]) : p[1]);
			curCameraTarget = -1;
			if (p[2] == false || isReplaying) {
				camGame.scroll.set(camFollow.x, camFollow.y);
				camGame.snapToTarget();
			}
			if (p[4] == "CLASSIC") {
				camGame.followEnabled = true;
			} else if (p[4] != null && !isReplaying) {
				camMoveTween = FlxTween.tween(camGame.scroll,
					{x: camFollow.x - camGame.width * 0.5, y: camFollow.y - camGame.height * 0.5},
					(Conductor.stepCrochet / 1000) * (p[3] == null ? 4 : p[3]),
					{ ease: CoolUtil.flxeaseFromString(p[4], p[5]) });
			}

		case "Camera Zoom":
			var isHud = (p[2] == "camHUD");
			if (!isHud && camZoomTween != null) camZoomTween.cancel();

			var finalZoom:Float = p[1];
			if (p[7] == true) { 
				finalZoom = (isHud ? camHUD.zoom : defaultCamZoom) * p[1];
			}

			if (p[0] == true && !isReplaying) {
				var timeAhh = (Conductor.stepCrochet / 1000) * p[3];
				if (isHud) {
					FlxTween.num(camHUD.zoom, finalZoom, timeAhh,
						{ ease: CoolUtil.flxeaseFromString(p[4], p[5]) },
						function(value:Float) { camHUD.zoom = value; });
				} else {
					camZoomTween = FlxTween.num(defaultCamZoom, finalZoom, timeAhh,
						{ ease: CoolUtil.flxeaseFromString(p[4], p[5]) },
						function(value:Float) { defaultCamZoom = value; camGame.zoom = value; });
				}
			} else {
				if (isHud) camHUD.zoom = finalZoom;
				else {
					defaultCamZoom = finalZoom;
					camGame.zoom = finalZoom;
				}
			}

		case "Play Animation":
			if (!isReplaying && characterGroups[p[0]] != null) {
				for (char in characterGroups[p[0]]) char.playAnim(p[1], p[2]);
			}

		case "Alt Animation Toggle":
			var singSuffix = p[0] ? "-alt" : "";
			var idleSuffix = p[1] ? "-alt" : "";
			if (characterGroupData[p[2]] != null) {
				characterGroupData[p[2]].animSuffix = singSuffix;
				for (char in characterGroups[p[2]]) char.idleSuffix = idleSuffix;
			}

		case "Add Camera Zoom":
			if (!isReplaying) {
				if (p[1] != "camHUD") camGame.zoom += p[0];
				else camHUD.zoom += p[0];
			}

		case "Camera Bop":
			camZoomingMult += p[0];
			if (!transitioningOut && !isReplaying) currentPulse = visPulseAlpha;

		case "Camera Modulo Change":
			camZoomingInterval = p[0];
			camZoomingStrength = p[1];
			if (p[2] != null) camZoomingEvery = _parseBeatType(p[2]);
			if (p[3] != null) camZoomingOffset = p[3];

		case "Camera Flash":
			if (!isReplaying) {
				var targetCam = (p[3] == "camHUD") ? camHUD : camGame;
				if (p[0]) {
					targetCam.fade(p[1], (Conductor.stepCrochet / 1000) * p[2], false, function() { targetCam._fxFadeAlpha = 0; }, true);
				} else {
					targetCam.flash(p[1], (Conductor.stepCrochet / 1000) * p[2], null, true);
				}
			}

        case "Camera Angle":
            var targetAngle:Float = Std.parseFloat(Std.string(p[0]));
            if (Math.isNaN(targetAngle)) targetAngle = 0;
            var targetCam:String = Std.string(p[1]).toLowerCase();
            var dur:Float = Std.parseFloat(Std.string(p[2])) * durationMult;
            if (Math.isNaN(dur)) dur = 0;
            var easeName:String = Std.string(p[3]);

            function applyAng(camObj:FlxCamera) {
                if (camObj == null) return;
                FlxTween.cancelTweensOf(camObj, ["angle"]);
                if (dur <= 0) camObj.angle = targetAngle;
                else FlxTween.tween(camObj, {angle: targetAngle}, dur, {ease: CoolUtil.flxeaseFromString(easeName)});
            }

            if (targetCam == "toutes" || targetCam == "both") {
                applyAng(camGame);
                applyAng(camHUD);
            } else if (targetCam == "game" || targetCam == "camgame") {
                applyAng(camGame);
            } else if (targetCam == "hud" || targetCam == "camhud") {
                applyAng(camHUD);
            }

        case "Cinematic Bars", "Cinematic Border":
            var isGameCam = (p[5] == "camGame");
            for (bar in [cinematicBar1, cinematicBar2]) {
                bar.cameras = isGameCam ? [camGame] : [camHUD];
            }

            var targetScaleY = ((FlxG.height/2) * p[1] + 0.1);

            if (p[0] == false || isReplaying) {
                for (bar in [cinematicBar1, cinematicBar2]) {
                    FlxTween.cancelTweensOf(bar.scale);
                    bar.scale.y = targetScaleY;
                    bar.updateHitbox();
                }
            } else {
                var flxease:String = p[3] + (p[3] == "linear" ? "" : p[4]);
                var dur = ((Conductor.crochet / 4) / 1000) * p[2];
                for (bar in [cinematicBar1, cinematicBar2]) {
                    FlxTween.cancelTweensOf(bar.scale);
                    FlxTween.tween(bar.scale, {y: targetScaleY}, dur, {
                        ease: Reflect.field(FlxEase, flxease)
                    });
                }
            }

        case "CRT Effect":
            var dist = Std.parseFloat(Std.string(p[0]));
            var chrom = Std.parseFloat(Std.string(p[1]));
            var cZoom = Std.parseFloat(Std.string(p[2]));

            if (Math.isNaN(dist)) dist = 0.0;
            if (Math.isNaN(chrom)) chrom = 0.0;
            if (Math.isNaN(cZoom)) cZoom = 1.0;

            if (dist == 0 && chrom == 0 && (cZoom == 1 || cZoom == 0)) {
                removeEditorShaderByType("crt");
            } else {
                var existingCrt = null;
                for (item in editorShaders) {
                    if (item != null && item.name == "crt") {
                        existingCrt = item.shader;
                        break;
                    }
                }

                if (existingCrt == null) {
                    try {
                        existingCrt = new CustomShader("crt");
                        camGame.addShader(existingCrt);
                        camHUD.addShader(existingCrt);
                        editorShaders.push({ name: "crt", shader: existingCrt });
                    } catch(err:Dynamic) {}
                }

                if (existingCrt != null) {
                    if (existingCrt.data.distortion != null) existingCrt.data.distortion.value = [dist];
                    if (existingCrt.data.chromaticIntensity != null) existingCrt.data.chromaticIntensity.value = [chrom];
                    if (existingCrt.data.crtZoom != null) existingCrt.data.crtZoom.value = [cZoom];
                }
            }

		case "Visual FX", "Visual_FX":
			var active = (p[1] == true || p[1] == "true");
            var effect = Std.string(p[0]);
            var shName = effect == "VHS" ? "terminalVHS" : effect;

			if (active) {
                removeEditorShaderByType(shName); 
				try {
					var sh = new CustomShader(shName);
					var intensity = Std.parseFloat(Std.string(p[3]));
					if (Math.isNaN(intensity)) intensity = 1.0;
					
					if (sh.data.intensity != null) sh.data.intensity.value = [intensity];
					else if (sh.data.opacity != null) sh.data.opacity.value = [intensity];

					var camT = Std.string(p[7]);
					if (camT == "camHUD" || camT == "hud") {
						camHUD.addShader(sh);
					} else if (camT == "both" || camT == "toutes") {
						camGame.addShader(sh);
						camHUD.addShader(sh);
					} else {
						camGame.addShader(sh);
					}
                    
                    editorShaders.push({ name: shName, shader: sh });
				} catch(err:Dynamic) {}
			} else {
                removeEditorShaderByType(shName);
			}

        case "LightsOut":
            var active = (p[0] == true || p[0] == "true");
            if (active) {
                if (blackBg != null) blackBg.alpha = 1.0;
                var thickness = Std.parseFloat(Std.string(p[1]));
                if (Math.isNaN(thickness)) thickness = 4.0;

                for (grp in characterGroups) {
                    for (char in grp) {
                        try {
                            var sh = new CustomShader("LightsOut");
                            if (sh.data.effectAmount != null) sh.data.effectAmount.value = [1.0];
                            if (sh.data.thick != null) sh.data.thick.value = [thickness];
                            char.shader = sh;
                        } catch(err:Dynamic) {}
                    }
                }
            } else {
                if (blackBg != null) blackBg.alpha = 0.0;
                for (grp in characterGroups) {
                    for (char in grp) char.shader = null;
                }
            }

        // ✨ PREVIEW: CHANGE CHARACTER (ANTI-LAG)
        case "Change Character":
            var strumIndex = Std.int(p[0]);
            var charName = Std.string(p[1]);
            var memberIndex = p[2] != null ? Std.int(p[2]) : 0;
            
            if (characterGroups[strumIndex] != null && characterGroups[strumIndex][memberIndex] != null) {
                var oldChar = characterGroups[strumIndex][memberIndex];
                
                // ANTI-LAG : Si le personnage est déjà le bon, on ne fait rien !
                if (oldChar.curCharacter == charName) return;

                var isPlayer = oldChar.isPlayer;
                
                // ANTI-LAG : On ressort le personnage du cache !
                var newChar = getCharFromPool(charName, isPlayer);
                newChar.setPosition(oldChar.x, oldChar.y);
                newChar.cameras = [camGame];
                newChar.visible = true;
                newChar.active = true;
                
                var idx = members.indexOf(oldChar);
                if (idx != -1) {
                    insert(idx, newChar);
                    remove(oldChar);
                } else {
                    remove(oldChar);
                    add(newChar);
                }
                
                oldChar.visible = false;
                oldChar.active = false;
                
                characterGroups[strumIndex][memberIndex] = newChar;
                newChar.dance();
                
                if (strumIndex == 0 && memberIndex == 0) dad = newChar;
                if (strumIndex == 1 && memberIndex == 0) boyfriend = newChar;
                if (strumIndex == 2 && memberIndex == 0) gf = newChar;
            }

        case "Change Stage":
            changePreviewStage(Std.string(p[0]));
            
        case "Stage Swap":
            if (isReplaying) return; // ANTI-LAG: Géré proprement dans rebuildPreviewState
            changePreviewStage(Std.string(p[0]));
            var charsParams = p[1] != null ? Std.string(p[1]) : "none, none, none";
            var chars = charsParams.split(",");
            if (chars.length > 0 && StringTools.trim(chars[0]) != "none" && StringTools.trim(chars[0]) != "") {
                onEditorEventHit({name: "Change Character", params: [0, StringTools.trim(chars[0]), 0]});
            }
            if (chars.length > 1 && StringTools.trim(chars[1]) != "none" && StringTools.trim(chars[1]) != "") {
                onEditorEventHit({name: "Change Character", params: [1, StringTools.trim(chars[1]), 0]});
            }
            if (chars.length > 2 && StringTools.trim(chars[2]) != "none" && StringTools.trim(chars[2]) != "") {
                onEditorEventHit({name: "Change Character", params: [2, StringTools.trim(chars[2]), 0]});
            }

        // ✨ PREVIEW: VIRTUAL CHARACTER (ANTI-LAG)
        case "Virtual Character":
            var charName = p[0] != null ? Std.string(p[0]) : "bf";
            var singsWith = p[1] != null ? Std.string(p[1]).toLowerCase() : "none";
            var posX = p[2] != null ? Std.parseFloat(Std.string(p[2])) : 100.0;
            var posY = p[3] != null ? Std.parseFloat(Std.string(p[3])) : 100.0;
            var charScale = p[4] != null ? Std.parseFloat(Std.string(p[4])) : 1.0;
            var isVis = p[5] != null ? (Std.string(p[5]).toLowerCase() != "false" && Std.string(p[5]) != "0") : true;
            
            if (Math.isNaN(posX)) posX = 100.0;
            if (Math.isNaN(posY)) posY = 100.0;
            if (Math.isNaN(charScale)) charScale = 1.0;
            
            var existing = null;
            for (v in virtualCharsPreview) {
                if (v.name == charName) {
                    existing = v;
                    break;
                }
            }
            
            if (existing != null) {
                existing.char.setPosition(posX, posY);
                existing.char.scale.set(charScale, charScale);
                existing.char.updateHitbox();
                existing.char.visible = isVis;
                existing.target = singsWith;
                if (!isVis) existing.char.dance();
                if (members.indexOf(existing.char) == -1) add(existing.char);
            } else {
                var isPlayer = (singsWith == "bf" || singsWith == "boyfriend" || singsWith == "player");
                var newChar = getCharFromPool(charName, isPlayer);
                newChar.setPosition(posX, posY);
                newChar.scale.set(charScale, charScale);
                newChar.updateHitbox();
                newChar.visible = isVis;
                newChar.active = true;
                newChar.cameras = [camGame];
                
                if (boyfriend != null) {
                    var idx = members.indexOf(boyfriend);
                    if(idx != -1) insert(idx, newChar);
                    else add(newChar);
                }
                else add(newChar);
                
                newChar.dance();
                virtualCharsPreview.push({
                    name: charName,
                    char: newChar,
                    target: singsWith,
                    customTimer: 0.0,
                    holdTimeRequired: 1.5
                });
            }

        case "Among Shader FX":
            applyAmongFxPreview(p);

        // DÉLÉGATION DES AUTRES CUSTOM EVENTS AU PLAYSTATE
        default:
            if (PlayState.instance != null && PlayState.instance.scripts != null) {
                try {
                    PlayState.instance.scripts.call("onEditorCustomEvent", [e]);
                } catch(err:Dynamic) {}
            }
	}
}

function setupAmongFxPreview() {
    // Stage/world snow preview.
    for (i in 0...34) {
        var s = new FlxSprite();
        s.makeGraphic(FlxG.random.int(2, 5), FlxG.random.int(2, 5), 0xFFFFFFFF);
        s.alpha = FlxG.random.float(0.25, 0.75);
        s.cameras = [camGame];
        s.scrollFactor.set(1, 1);
        s.visible = false;
        add(s);
        amongFxStageSnow.push(s);
    }
    for (i in 0...10) {
        var s = new FlxSprite(FlxG.random.float(0, FlxG.width), FlxG.random.float(0, FlxG.height));
        s.makeGraphic(FlxG.random.int(2, 4), FlxG.random.int(2, 4), 0xFFFFFFFF);
        s.alpha = FlxG.random.float(0.20, 0.55);
        s.cameras = [camHUD];
        s.scrollFactor.set(0, 0);
        s.visible = false;
        add(s);
        amongFxHudSnow.push(s);
    }
    for (i in 0...18) {
        var d = new FlxSprite(FlxG.random.float(0, FlxG.width), FlxG.random.float(0, FlxG.height));
        d.makeGraphic(3, 3, 0xFF8FF9FF);
        d.alpha = FlxG.random.float(0.12, 0.4);
        d.cameras = [camHUD];
        d.scrollFactor.set(0, 0);
        d.visible = false;
        add(d);
        amongFxDust.push(d);
    }
    for (i in 0...26) {
        var line = new FlxSprite(0, i * 28).makeGraphic(FlxG.width, 2, 0xFF000000);
        line.alpha = 0.10;
        line.cameras = [camHUD];
        line.scrollFactor.set(0, 0);
        line.visible = false;
        add(line);
        amongFxScanlines.push(line);
    }
    amongFxWarning = new FlxSprite(0, 0).makeGraphic(FlxG.width, FlxG.height, 0xFFFF3333);
    amongFxWarning.alpha = 0;
    amongFxWarning.cameras = [camHUD];
    amongFxWarning.scrollFactor.set(0, 0);
    add(amongFxWarning);

    amongFxAuroraA = new FlxSprite(-180, -80).makeGraphic(620, 900, 0xFF55CCFF);
    amongFxAuroraA.alpha = 0;
    amongFxAuroraA.angle = -24;
    amongFxAuroraA.cameras = [camHUD];
    amongFxAuroraA.scrollFactor.set(0, 0);
    add(amongFxAuroraA);

    amongFxAuroraB = new FlxSprite(760, -100).makeGraphic(480, 900, 0xFF8C66FF);
    amongFxAuroraB.alpha = 0;
    amongFxAuroraB.angle = 18;
    amongFxAuroraB.cameras = [camHUD];
    amongFxAuroraB.scrollFactor.set(0, 0);
    add(amongFxAuroraB);

    amongFxStatus = new FlxText(16, 14, 520, "EVENT PREVIEW  //  READY", 14);
    amongFxStatus.setFormat(Paths.font("vcr.ttf"), 14, 0xFF92FFF1, "left");
    amongFxStatus.cameras = [camHUD];
    amongFxStatus.alpha = 0.80;
    add(amongFxStatus);
}

function applyAmongFxPreview(p:Array<Dynamic>) {
    if (p == null || p.length < 2) return;
    amongFxName = Std.string(p[0]).toLowerCase();
    amongFxEnabled = p[1] == true || Std.string(p[1]).toLowerCase() == "true";
    amongFxIntensity = p.length > 2 ? Std.parseFloat(Std.string(p[2])) : 1;
    if (Math.isNaN(amongFxIntensity)) amongFxIntensity = 1;
    amongFxSpeed = p.length > 3 ? Std.parseFloat(Std.string(p[3])) : 1;
    if (Math.isNaN(amongFxSpeed)) amongFxSpeed = 1;
    var c:Int = 0xFFFFFFFF;
    try { if (p.length > 4 && p[4] != null) c = p[4]; } catch(err:Dynamic) {}

    if (amongFxName == "snow") {
        for (s in amongFxStageSnow) { s.visible = amongFxEnabled; s.color = c; resetAmongStageSnow(s, true); }
        for (s in amongFxHudSnow) { s.visible = amongFxEnabled; s.color = c; }
    }
    if (amongFxName == "space-dust") for (d in amongFxDust) { d.visible = amongFxEnabled; d.color = c; }
    if (amongFxName == "scanlines") for (line in amongFxScanlines) line.visible = amongFxEnabled;
    if (amongFxName == "warning" && amongFxWarning != null) { amongFxWarning.visible = amongFxEnabled; amongFxWarning.color = c; }
    if (amongFxName == "aurora") {
        if (amongFxAuroraA != null) { amongFxAuroraA.visible = amongFxEnabled; amongFxAuroraA.color = c; }
        if (amongFxAuroraB != null) { amongFxAuroraB.visible = amongFxEnabled; amongFxAuroraB.color = c; }
    }
}

function updateAmongFxPreview(elapsed:Float) {
    amongFxTime += elapsed * amongFxSpeed;
    if (amongFxStatus != null && amongFxStatus.alpha > 0.55) amongFxStatus.alpha -= elapsed * 0.03;

    for (s in amongFxStageSnow) if (s.visible) {
        s.y += (48 + s.height * 7) * elapsed * amongFxSpeed * Math.max(0.25, amongFxIntensity);
        s.x -= (8 + s.width * 2) * elapsed * amongFxSpeed;
        if (s.y > camGame.scroll.y + FlxG.height + 80 || s.x < camGame.scroll.x - 100) resetAmongStageSnow(s, false);
    }
    for (s in amongFxHudSnow) if (s.visible) {
        s.y += 60 * elapsed * amongFxSpeed * Math.max(0.25, amongFxIntensity);
        s.x -= 12 * elapsed * amongFxSpeed;
        if (s.y > FlxG.height + 8 || s.x < -8) { s.x = FlxG.random.float(0, FlxG.width); s.y = FlxG.random.float(-60, -4); }
    }
    for (d in amongFxDust) if (d.visible) {
        d.x += 36 * elapsed * amongFxSpeed * Math.max(0.25, amongFxIntensity);
        if (d.x > FlxG.width + 8) { d.x = -8; d.y = FlxG.random.float(0, FlxG.height); }
    }
    for (i in 0...amongFxScanlines.length) if (amongFxScanlines[i].visible) {
        amongFxScanlines[i].y = (i * 28 + (amongFxTime * 28)) % (FlxG.height + 28) - 14;
        amongFxScanlines[i].alpha = Math.min(0.30, 0.06 + 0.08 * amongFxIntensity);
    }
    if (amongFxWarning != null) {
        if (amongFxWarning.visible) amongFxWarning.alpha = Math.min(0.40, (0.03 + 0.10 * (0.5 + 0.5 * Math.sin(amongFxTime * 3.5))) * amongFxIntensity);
        else amongFxWarning.alpha = 0;
    }
    if (amongFxAuroraA != null && amongFxAuroraB != null) {
        if (amongFxAuroraA.visible) {
            amongFxAuroraA.alpha = Math.min(0.24, 0.04 + 0.07 * amongFxIntensity);
            amongFxAuroraB.alpha = Math.min(0.20, 0.03 + 0.06 * amongFxIntensity);
            amongFxAuroraA.x = -180 + Math.sin(amongFxTime * 1.2) * 100;
            amongFxAuroraB.x = 760 + Math.cos(amongFxTime) * 90;
        } else {
            amongFxAuroraA.alpha = 0;
            amongFxAuroraB.alpha = 0;
        }
    }
}

function resetAmongStageSnow(s:FlxSprite, first:Bool) {
    s.x = camGame.scroll.x + FlxG.random.float(-70, FlxG.width + 100);
    s.y = first ? camGame.scroll.y + FlxG.random.float(-FlxG.height, FlxG.height) : camGame.scroll.y + FlxG.random.float(-100, -4);
}

function _parseBeatType(str:String):BeatType {
	return switch (str.toUpperCase()) {
		case "STEP": BeatType.STEP;
		case "MEASURE": BeatType.MEASURE;
		default: BeatType.BEAT;
	};
}

function _enforceWindowSize() {
	var win = Lib.application.window;
	if (win.width != 1280 || win.height != 720) {
		win.width  = 1280;
		win.height = 720;
	}
}

function stepHit() {
	for (id => grp in characterGroupData) {
		if (Conductor.songPosition > grp.lastHit.time && Conductor.songPosition < grp.lastHit.endTime) {
			for (char in characterGroups[id]) {
				char.playSingAnim(grp.lastHit.dir, grp.lastHit.animSuffix, "SING", true);
				char.lastHit = grp.lastHit.endTime;
			}
		} else if (Conductor.songPosition < grp.lastHit.time) {
			for (char in characterGroups[id]) {
				if (char.lastAnimContext == "SING") char.dance();
			}
		}
	}
}

function beatHit() {
}

function _chart_playtest_override(_) playtestChart_override(0, false, false);
function _chart_playtest_here_override(_) playtestChart_override(Conductor.songPosition, false, true);
function _chart_playtest_opponent_override(_) playtestChart_override(0, true, false);
function _chart_playtest_opponent_here_override(_) playtestChart_override(Conductor.songPosition, true, true);

function playtestChart_override(time:Float, opponentMode:Bool, here:Bool) {
	buildChart();
	Charter.startHere = here;
	Charter.startTime = Conductor.songPosition;
	PlayState.opponentMode = opponentMode;
	PlayState.chartingMode = true;

	MusicBeatState.skipTransIn = true;
	MusicBeatState.skipTransOut = true;
	persistentUpdate = false;
	for (grp in characterGroups) for (char in grp) char.dance();

	FlxG.animationTimeScale = 1;
	
	transitioningOut = true;
	FlxTween.tween(uiCamera, {alpha: 0}, 0.5, {ease: FlxEase.quintOut});
	FlxTween.tween(charterCamera, {alpha: 0}, 0.5, {ease: FlxEase.quintOut});
	FlxTween.tween(visCamera, {alpha: 0}, 0.5, {ease: FlxEase.quintOut});
	FlxTween.tween(camHUD, {alpha: 0}, 0.5, {ease: FlxEase.quintOut});

	new FlxTimer().start(0.5, function(tmr) {
		PlayState.smoothTransitionData = {
			stage: curStage,
			camX: camGame.scroll.x,
			camY: camGame.scroll.y,
			camFollowX: camFollow.x,
			camFollowY: camFollow.y,
			camZoom: camGame.zoom
		};
		FlxG.switchState(new PlayState());
	});
}