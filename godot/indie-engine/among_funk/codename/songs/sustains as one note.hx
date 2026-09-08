function onPlayerMiss(e) {
	if (!e.cancelled && e.note != null) {
		if ((e.note.extra.get('__missedSustain') == true)) { // == true cus its null by default
			//trace('a!');
			e.cancel();
			if (e.deleteNote && e.note != null && e.note.strumLine != null)
				e.note.strumLine.deleteNote(e.note);
			return;
		}
		//trace('KILL.');
		if (!e.note.avoid) { // avoid having effect on notes youre supposed to miss
			var not = e.note;

			// the first sustain hold is missed Before the parent note, do hacky fix
			if (e.note.isSustainNote && (!e.note.prevNote?.isSustainNote ?? false)) {
				//trace('note ' + e.note.strumTime + ' (' + e.note.strumID + ', ' + e.note.animation.name + ') has head before it..');
				//trace('yes im talking about note ' + e.note.prevNote.strumTime + ' (' + e.note.prevNote.strumID + ', ' + e.note.prevNote.animation.name + ')');
				ghostNote(e.note.prevNote);
			}
			while (not != null) {
				//trace('looping..' + not + ' (' + not.animation.name + ')');
				ghostNote(not);
				not.alpha *= 0.5;
				not = not.nextSustain;
			}
		}
	}
}

function ghostNote(n) {
	n.avoid = true;
	n.earlyPressWindow = n.latePressWindow = -1;
	n.extra.set('__missedSustain', true);
}