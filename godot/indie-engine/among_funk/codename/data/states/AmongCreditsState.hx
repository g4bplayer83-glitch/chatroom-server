import flixel.FlxG;
import flixel.FlxSprite;
import flixel.text.FlxText;
import flixel.util.FlxColor;
import flixel.group.FlxGroup.FlxTypedGroup;
import funkin.menus.ModState;
import flixel.math.FlxMath;

var categoryTextX:Float = 120;
var categoryTextY:Float = 145;
var listStartX:Float = 120;
var listStartY:Float = 210;
var listSpacingY:Float = 100;
var blueCrewmateX:Float = 680;
var blueCrewmateY:Float = 270;
var blueScale:Float = 1.0;

var bg:FlxSprite;
var cornerBox:FlxSprite;
var titleSpr:FlxSprite;
var catText:FlxText;
var leftArrow:FlxSprite;
var rightArrow:FlxSprite;
var closeBtn:FlxSprite;
var blueCrewmate:FlxSprite;
var iconsGroup:FlxTypedGroup<FlxSprite>;
var textsGroup:FlxTypedGroup<FlxText>;

var scrollTarget:Float = 0;
var curScroll:Float = 0;

var isExiting:Bool = false;
var exitTimer:Float = 0;

var bioBg:FlxSprite;
var bioPanel:FlxSprite;
var bioTitle:FlxText;
var bioDesc:FlxText;
var bioOpen:Bool = false;

var creditsData:Array<Dynamic> = [
    {
        category: "Director and Co-Director",
        people: ["Simontincs_god", "IndieGabVR"]
    },
    {
        category: "Coder",
        people: ["IndieGabVR"]
    },
    {
        category: "Composer",
        people: ["Simontincs_god", "IndieGabVR", "AlgerRayan", "Napstabeats", "hyras", "PV NIGHTS", "MungoCow", "OrangeVA", "Krotain"]
    },
    {
        category: "Artist",
        people: ["Gamma", "IndieGabVR", "Takari", "Kyllo", "Nexus", "Wiresthebat", "Mr.Golden", "Lolo"]
    },
    {
        category: "Concept artist",
        people: ["MallowPrime64"]
    },
    {
        category: "VA",
        people: ["BkBurnett", "AlgerRayan", "IndieGabVR", "Hevtel"]
    },
    {
        category: "Visualizer Maker",
        people: ["IndieGabVR", "Keith The D Salt", "Simontincs_god"]
    },
    {
        category: "Thumbnails maker",
        people: ["ADISHERE"]
    },
    {
        category: "Playtester",
        people: ["NLPB1925"]
    },
    {
        category: "Charter",
        people: ["IndieGabVR", "Simontincs_god"]
    },
    {
        category: "Lyrics Maker",
        people: ["Shinzzuka"]
    }
];

var bios:Map<String, String> = [
    "Simontincs_god" => "Director of the mod!! I charted and composed songs for this mod, but i also gived many ideas to indiegab for the hx code :D",
    "IndieGabVR" => "Co-Director here, i pretty make all thing here lmao",
    "AlgerRayan" => " ... but he never come back",
    "hyras" => "He leave the mod...",
    "PV NIGHTS" => "Composer - Injecting high-energy and celestial rhythms into our songs.",
    "Gamma" => "Brazil number one.",
    "Takari" => "Artist - Refining and polishing the in-game assets and sprites.",
    "MallowPrime64" => "Welcome to Wario World.",
    "BkBurnett" => "Voice Actor - Giving a realistic voice to our crewmate crew."
];

var curCategory:Int = 0;
var idleTimer:Float = 0;
var hasLooked:Bool = false;

function postCreate() {
    try {
        FlxG.sound.playMusic(Paths.music('creditsMenu'), 0.7, true);
    } catch(e:Dynamic) {
        FlxG.sound.playMusic(Paths.music('freakyMenu'), 0.7, true);
    }

    bg = new FlxSprite(0, 0).loadGraphic(Paths.image('menus/credit/CreditBack'));
    add(bg);

    cornerBox = new FlxSprite(0, 0).loadGraphic(Paths.image('menus/credit/Credit-Corner'));
    add(cornerBox);

    titleSpr = new FlxSprite(0, 0).loadGraphic(Paths.image('menus/credit/Credit'));
    add(titleSpr);

    catText = new FlxText(categoryTextX, categoryTextY, 500, "", 38);
    catText.setFormat(Paths.font("vcr.ttf"), 24, FlxColor.WHITE, "left");
    add(catText);

    iconsGroup = new FlxTypedGroup();
    add(iconsGroup);

    textsGroup = new FlxTypedGroup();
    add(textsGroup);

    leftArrow = new FlxSprite(100, 550).loadGraphic(Paths.image('menus/credit/Credit-Left'));
    add(leftArrow);

    rightArrow = new FlxSprite(550, 550).loadGraphic(Paths.image('menus/credit/Credit-Right'));
    add(rightArrow);

    closeBtn = new FlxSprite(0, 0).loadGraphic(Paths.image('menus/credit/Credit-Close'));
    add(closeBtn);

    blueCrewmate = new FlxSprite(blueCrewmateX, blueCrewmateY);
    blueCrewmate.frames = Paths.getSparrowAtlas('menus/credit/Credit-Blue');
    blueCrewmate.animation.addByPrefix('Idle', 'Idle', 24, true);
    blueCrewmate.animation.addByPrefix('Look', 'Look', 24, false);
    blueCrewmate.animation.play('Idle');
    blueCrewmate.scale.set(blueScale, blueScale);
    blueCrewmate.updateHitbox();
    add(blueCrewmate);

    bioBg = new FlxSprite(0, 0).makeGraphic(1280, 720, FlxColor.BLACK);
    bioBg.alpha = 0.6;
    bioBg.visible = false;
    add(bioBg);

    bioPanel = new FlxSprite().makeGraphic(600, 300, 0xFF181F24);
    bioPanel.screenCenter();
    bioPanel.visible = false;
    add(bioPanel);

    bioTitle = new FlxText(bioPanel.x + 20, bioPanel.y + 30, 560, "", 28);
    bioTitle.setFormat(Paths.font("vcr.ttf"), 32, FlxColor.YELLOW, "center");
    bioTitle.visible = false;
    add(bioTitle);

    bioDesc = new FlxText(bioPanel.x + 40, bioPanel.y + 110, 520, "", 20);
    bioDesc.setFormat(Paths.font("vcr.ttf"), 24, FlxColor.WHITE, "center");
    bioDesc.visible = false;
    add(bioDesc);

    changeCategory(0);
}

function showBio(name:String, desc:String) {
    bioTitle.text = name;
    bioDesc.text = desc;
    bioBg.visible = true;
    bioPanel.visible = true;
    bioTitle.visible = true;
    bioDesc.visible = true;
    bioOpen = true;
}

function closeBio() {
    bioBg.visible = false;
    bioPanel.visible = false;
    bioTitle.visible = false;
    bioDesc.visible = false;
    bioOpen = false;
}

function startExitSequence() {
    isExiting = true;
    exitTimer = 0;
}

function changeCategory(change:Int) {
    curCategory += change;
    
    if (curCategory < 0) curCategory = creditsData.length - 1;
    if (curCategory >= creditsData.length) curCategory = 0;

    catText.text = creditsData[curCategory].category;

    scrollTarget = 0;
    curScroll = 0;

    iconsGroup.clear();
    textsGroup.clear();

    var peopleList = creditsData[curCategory].people;
    for (i in 0...peopleList.length) {
        var iconSpr = new FlxSprite(listStartX, listStartY + (i * listSpacingY));
        
        try {
            iconSpr.loadGraphic(Paths.image('menus/credit/icons/' + peopleList[i]));
        } catch(e:Dynamic) {
            iconSpr.makeGraphic(64, 64, FlxColor.WHITE);
        }
        
        iconSpr.setGraphicSize(64, 64);
        iconSpr.updateHitbox();
        iconsGroup.add(iconSpr);

        var nameTxt = new FlxText(iconSpr.x + 80, iconSpr.y + 12, 400, peopleList[i], 32);
        nameTxt.setFormat(Paths.font("vcr.ttf"), 36, FlxColor.WHITE, "left");
        textsGroup.add(nameTxt);
    }
}

function updateLerpScale(sprite:FlxSprite, elapsed:Float) {
    var targetScale = 1.0;
    if (FlxG.mouse.overlaps(sprite)) {
        targetScale = 1.1;
    }
    var newScale = FlxMath.lerp(sprite.scale.x, targetScale, elapsed * 12);
    sprite.scale.set(newScale, newScale);
}

function update(elapsed:Float) {
    if (isExiting) {
        exitTimer += elapsed;
        if (FlxG.sound.music != null) {
            var progress:Float = Math.max(0, 1.0 - (exitTimer / 1.0));
            FlxG.sound.music.pitch = progress;
            FlxG.sound.music.volume = progress * 0.7;
        }
        if (exitTimer >= 1.0) {
            isExiting = false;
            if (FlxG.sound.music != null) {
                FlxG.sound.music.stop();
                FlxG.sound.music.pitch = 1.0;
                FlxG.sound.music.volume = 1.0;
            }
            try {
                FlxG.sound.playMusic(Paths.music('freakyMenu'), 1, true);
            } catch(e:Dynamic) {}
            FlxG.switchState(new ModState("AmongMainMenuState"));
        }
        return;
    }

    if (bioOpen) {
        if (FlxG.mouse.justPressed || FlxG.keys.justPressed.ESCAPE || FlxG.keys.justPressed.ENTER) {
            closeBio();
        }
        return;
    }

    var isMoving = FlxG.keys.justPressed.ANY || FlxG.mouse.justPressed || FlxG.mouse.justMoved || FlxG.mouse.wheel != 0;
    
    if (!hasLooked) {
        if (isMoving) {
            idleTimer = 0;
        } else {
            idleTimer += elapsed;
            if (idleTimer >= 10) {
                blueCrewmate.animation.play('Look');
                hasLooked = true;
            }
        }
    } else {
        if (blueCrewmate.animation.curAnim.name == 'Look' && blueCrewmate.animation.finished) {
            blueCrewmate.animation.play('Idle');
        }
    }

    var maxScroll:Float = Math.max(0, (creditsData[curCategory].people.length - 3.2) * listSpacingY);

    if (FlxG.mouse.wheel != 0) {
        scrollTarget -= FlxG.mouse.wheel * listSpacingY;
    }
    if (FlxG.keys.justPressed.UP) {
        scrollTarget -= listSpacingY;
    }
    if (FlxG.keys.justPressed.DOWN) {
        scrollTarget += listSpacingY;
    }

    if (scrollTarget < 0) scrollTarget = 0;
    if (scrollTarget > maxScroll) scrollTarget = maxScroll;

    curScroll = FlxMath.lerp(curScroll, scrollTarget, elapsed * 10);

    for (i in 0...iconsGroup.members.length) {
        var icon = iconsGroup.members[i];
        var txt = textsGroup.members[i];
        
        if (icon != null && txt != null) {
            var targetY = listStartY + (i * listSpacingY) - curScroll;
            icon.y = targetY;
            txt.y = targetY + 12;
            
            var alphaCalc:Float = 1.0;
            if (targetY < 200) {
                alphaCalc = (targetY - 150) / 50;
            } else if (targetY > 460) {
                alphaCalc = (510 - targetY) / 50;
            }
            
            if (alphaCalc < 0) alphaCalc = 0;
            if (alphaCalc > 1) alphaCalc = 1;
            
            icon.alpha = alphaCalc;
            txt.alpha = alphaCalc;
        }
    }

    if (FlxG.keys.justPressed.ESCAPE) {
        startExitSequence();
    }
    
    if (FlxG.keys.justPressed.LEFT) {
        leftArrow.scale.set(0.8, 0.8);
        changeCategory(-1);
    }
    
    if (FlxG.keys.justPressed.RIGHT) {
        rightArrow.scale.set(0.8, 0.8);
        changeCategory(1);
    }

    updateLerpScale(leftArrow, elapsed);
    updateLerpScale(rightArrow, elapsed);
    updateLerpScale(closeBtn, elapsed);

    for (icon in iconsGroup.members) {
        if (icon != null) updateLerpScale(icon, elapsed);
    }

    if (FlxG.mouse.justPressed) {
        var clickedIcon:Bool = false;
        for (i in 0...iconsGroup.members.length) {
            var icon = iconsGroup.members[i];
            if (icon != null && FlxG.mouse.overlaps(icon) && icon.alpha > 0.1) {
                var name = creditsData[curCategory].people[i];
                if (bios.exists(name) && bios.get(name) != "") {
                    showBio(name, bios.get(name));
                    clickedIcon = true;
                    break;
                }
            }
        }

        if (!clickedIcon) {
            if (FlxG.mouse.overlaps(leftArrow)) {
                leftArrow.scale.set(0.8, 0.8);
                changeCategory(-1);
            } 
            else if (FlxG.mouse.overlaps(rightArrow)) {
                rightArrow.scale.set(0.8, 0.8);
                changeCategory(1);
            } 
            else if (FlxG.mouse.overlaps(closeBtn)) {
                closeBtn.scale.set(0.8, 0.8);
                startExitSequence();
            }
        }
    }
}