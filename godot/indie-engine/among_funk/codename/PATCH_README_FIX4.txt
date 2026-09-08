AMONG FUNK v0.1.0 - FIX 4 FREEPLAY + MOOGUSRED + FX EVENT

Files included:
- data/states/AmongFreeplayState.hx
- data/characters/Moogusred.xml
- images/characters/Moogusred.png
- images/characters/Moogusred.xml
- images/icons/Moogusred.png
- images/freeplay/week1_polus_bg.png
- data/events/Among Shader FX.hx
- data/events/Among Shader FX.json
- songs/AmongGameplayFlow.hx

What this patch changes:
- New Week 1 Freeplay presentation using the provided Polus background.
- Added Moogusred sprite + icon files.
- Week 2 now shows good-times / no-more-tasks, unlocked after Week 1 clear.
- O in Freeplay: marks Week 1 as completed and plays an unlock animation.
- L in Freeplay: resets Week 1 completion state.
- New chart event: Among Shader FX.

Among Shader FX usage:
Effect names:
- snow
- space-dust
- scanlines
- warning
- aurora

Params:
1) Effect
2) Enable (true/false)
3) Intensity
4) Speed
5) Color

Examples:
- snow / true / 1 / 1 / #FFFFFF
- aurora / true / 1.3 / 0.8 / #66CCFF
- warning / true / 1 / 1 / #FF3333
