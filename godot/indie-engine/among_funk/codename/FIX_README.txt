AMONG FUNK v0.1.0 - SMALL FIX 2
================================

Apply this ZIP AFTER:
1) Among_Funk_Demo1_v0.1.0_Original_Style_Rework_RedCrew
2) Among_Funk_v0.1.0_FIX_Death_Pause_HUD_MenuMusic

Replace the files when Windows asks.

CHANGED FILES ONLY
------------------
data/scripts/AmongGameOver.hx
- The disconnected death screen now plays sounds/gameOver.ogg.
- Reconnect stops gameOver.ogg, then plays the retry jingle.

songs/AmongHUD.hx
- Removed the separate song-name card from the center/top/bottom.
- The Among Us task bar now displays the current SONG NAME instead of
  "TOTAL TASKS COMPLETED".
- The green task progress still fills with real song progress.

data/scripts/AmongPause.hx
- Mouse hit testing now uses the Pause camera.
- Hover works continuously and clicks are handled before keyboard input.
- Clicking the purple crewmate hides ALL pause UI without resuming.
- While hidden, the purple crewmate moves to the bottom-right and is larger.
- Click it again (or press H / Back / Accept) to show the pause menu.

data/states/AmongStoryMenu.hx
- Ship launches to the right first.
- Camera follows to the right after a short delay.
- Extended right-side star field prevents an empty void.
- Black fade starts late, near the end of the camera chase.

data/states/AmongMainMenuState.hx
- New sub-second CircOut zoom pulse.
- Zoom returns to normal before the camera lift.
- Camera then flies upward.
- Extended star field above the menu remains visible while the camera rises.
- Black fade starts later instead of immediately.

VERSION
-------
The mod version remains 0.1.0.
