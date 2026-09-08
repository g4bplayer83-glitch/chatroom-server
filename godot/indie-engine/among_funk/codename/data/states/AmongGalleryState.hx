import flixel.FlxSprite;
import flixel.FlxG;
import flixel.text.FlxText;
import flixel.util.FlxColor;
import flixel.tweens.FlxTween;
import flixel.tweens.FlxEase;
import flixel.math.FlxMath;
import funkin.menus.ModState;

var stars:Array<FlxSprite> = [];

var imageList:Array<String> = [
    "image1",
    "image2",
    "image3",
    "image4"
];

var curImageIndex:Int = 0;
var displaySprite:FlxSprite;
var titleText:FlxText;
var counterText:FlxText;
var leftArrow:FlxText;
var rightArrow:FlxText;
var isTransitioning:Bool = false;

function postCreate() {
    try {
        funkin.backend.system.rpc.DiscordUtil.changePresence("Viewing Gallery", "Browsing Art");
    } catch(e:Dynamic) {}

    var bg = new FlxSprite(0, 0).makeGraphic(1280, 720, 0xFF050510);
    add(bg);

    for (i in 0...100) {
        var star = new FlxSprite(FlxG.random.float(0, 1280), FlxG.random.float(0, 720));
        star.makeGraphic(FlxG.random.int(2,3), FlxG.random.int(2,3), FlxColor.WHITE);
        star.velocity.x = FlxG.random.float(-30, -10);
        add(star);
        stars.push(star);
    }

    displaySprite = new FlxSprite();
    add(displaySprite);

    titleText = new FlxText(0, 20, 0, "GALLERY", 60);
    titleText.font = Paths.font("vcr.ttf");
    titleText.screenCenter(FlxAxes.X);
    add(titleText);

    leftArrow = new FlxText(50, 0, 0, "<", 80);
    leftArrow.font = Paths.font("vcr.ttf");
    leftArrow.screenCenter(FlxAxes.Y);
    add(leftArrow);

    rightArrow = new FlxText(1180, 0, 0, ">", 80);
    rightArrow.font = Paths.font("vcr.ttf");
    rightArrow.screenCenter(FlxAxes.Y);
    add(rightArrow);

    counterText = new FlxText(0, 650, 0, "1 / 1", 40);
    counterText.font = Paths.font("vcr.ttf");
    counterText.screenCenter(FlxAxes.X);
    add(counterText);

    changeImage(0);
}

function update(elapsed:Float) {
    if (isTransitioning) return;

    for (star in stars) {
        if (star.x < -10) { star.x = 1290; star.y = FlxG.random.float(0, 720); }
    }

    if (controls.BACK || FlxG.keys.justPressed.ESCAPE) {
        isTransitioning = true;
        FlxG.sound.play(Paths.sound('cancelMenu'));
        FlxG.switchState(new ModState("AmongMainMenuState"));
        return;
    }

    var left = FlxG.keys.justPressed.LEFT || FlxG.keys.justPressed.A || FlxG.mouse.wheel > 0;
    var right = FlxG.keys.justPressed.RIGHT || FlxG.keys.justPressed.D || FlxG.mouse.wheel < 0;

    if (left) changeImage(-1);
    if (right) changeImage(1);

    var targetScaleLeft = 1.0;
    if (FlxG.mouse.overlaps(leftArrow)) {
        targetScaleLeft = 1.2;
        if (FlxG.mouse.justPressed) changeImage(-1);
    }
    leftArrow.scale.set(FlxMath.lerp(leftArrow.scale.x, targetScaleLeft, elapsed * 10), FlxMath.lerp(leftArrow.scale.y, targetScaleLeft, elapsed * 10));

    var targetScaleRight = 1.0;
    if (FlxG.mouse.overlaps(rightArrow)) {
        targetScaleRight = 1.2;
        if (FlxG.mouse.justPressed) changeImage(1);
    }
    rightArrow.scale.set(FlxMath.lerp(rightArrow.scale.x, targetScaleRight, elapsed * 10), FlxMath.lerp(rightArrow.scale.y, targetScaleRight, elapsed * 10));
}

function changeImage(change:Int) {
    if (imageList.length == 0) return;

    curImageIndex += change;
    if (curImageIndex < 0) curImageIndex = imageList.length - 1;
    if (curImageIndex >= imageList.length) curImageIndex = 0;

    if (change != 0) FlxG.sound.play(Paths.sound('scrollMenu'));

    try {
        var imgPath = Paths.image('menus/gallery/' + imageList[curImageIndex]);
        if (imgPath != null) {
            displaySprite.loadGraphic(imgPath);
            
            var ratio = Math.min(900 / displaySprite.width, 500 / displaySprite.height);
            displaySprite.setGraphicSize(Std.int(displaySprite.width * ratio), Std.int(displaySprite.height * ratio));
            displaySprite.updateHitbox();
            displaySprite.screenCenter();
        } else {
            displaySprite.makeGraphic(500, 500, FlxColor.RED);
            displaySprite.screenCenter();
        }
    } catch(e:Dynamic) {
        displaySprite.makeGraphic(500, 500, FlxColor.RED);
        displaySprite.screenCenter();
    }

    counterText.text = (curImageIndex + 1) + " / " + imageList.length;
    counterText.screenCenter(FlxAxes.X);
}