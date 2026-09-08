import funkin.game.PlayState;

function postCreate() {
    // On s'assure qu'on est bien en train de jouer une musique
    if (PlayState.instance == null || PlayState.instance.ratings == null) return;

    // 1. On élargit la zone de frappe globale maximale (166ms = standard Psych Engine)
    Conductor.safeZoneOffset = 166;

    // 2. On modifie chaque appréciation pour correspondre aux timings de Psych/V-Slice
    for (rating in PlayState.instance.ratings) {
        switch(rating.name) {
            case "sick": 
                rating.hitWindow = 45;  // Précision parfaite
            case "good": 
                rating.hitWindow = 90;  // Bonne précision
            case "bad":  
                rating.hitWindow = 135; // Mauvaise précision
            case "shit": 
                rating.hitWindow = 166; // À la limite de rater la note
        }
    }
}