# Among Funk — NoahEngine Edition

Portage Godot 4.7.2 / NoahEngine du projet Among Funk, version `0.1.0`.

## Lancer le projet

1. Ouvrir `project.godot` avec Godot 4.7.2.
2. Attendre la fin du premier import des ressources.
3. Appuyer sur `F6` ou sur le bouton de lancement du projet.

## Contenu porté

- Title, Main Menu, Story Menu, Freeplay, Options, Credits, Gallery et Pause reconstruits d'après les fichiers Haxe originaux, avec leurs images et leurs coordonnées 1280×720.
- Fond spatial noir-bleu continu, 260 étoiles blanches et personnages du Main Menu figés, sans oscillation verticale.
- Logo principal réduit et centré au-dessus du terminal Story/Freeplay, avec une taille stable en 1280×720.
- Transitions de menu inspirées du Haxe : impulsion de zoom, déplacement vertical fluide, fondu vers le noir puis fondu d'entrée dans le menu suivant. Dans Story Mode, le vaisseau part à droite avant que la caméra le suive.
- Thèmes audio fournis intégrés séparément aux Options et à la Pause, avec lecture en boucle.
- Story Week 1 : Sabotage, Discover et Meltdown.
- Freeplay Polus du nouveau ZIP : liste rouge, panneau de mission, prévisualisation animée de `Moogusred`, progression Week 2/Bonus et raccourcis développeur `O`/`L`.
- Week 2 affiche maintenant `good-times` et `no-more-tasks` après la Week 1. Le nouveau ZIP ne fournit pas encore leurs charts/audio : elles restent donc indiquées `COMING SOON` au lieu de lancer un contenu inexistant.
- Freeplay jouable : Sabotage, Discover, Meltdown, mando et Dlow.
- `Moogusred` est ajouté avec son atlas, ses animations et son icône ; les nouveaux charts de Sabotage et Discover l'utilisent automatiquement.
- Pause, résultats, game over sans callbacks audio tardifs, Botplay (`P`) et HUD Codename fidèle (barre de vie en haut, icônes mobiles, états normal/danger, Accuracy/Combo Breaks/Score).
- Game over façon connexion Among Us : écran noir, message rouge de déconnexion, statut, barre de restauration, reconnexion bleue animée avec `Entrée`, puis relance.
- Pause Among Funk centrée sur un seul terminal : Quick Options masquées par défaut puis ouvertes à la demande, navigation souris/clavier unifiée, bouton imposteur violet pour masquer l'interface tout en gardant le jeu et la musique suspendus.
- Stage Polus restauré avec les huit couches, l'ordre, l'échelle `1.4`, les positions de personnages et les coordonnées XML originales.
- Pivot de mise à l'échelle Codename reproduit dans Godot, positions XML exactes et caméras incluant les offsets globaux de chaque personnage.
- Événements de caméra, zoom, flash, barres cinématiques, animation, écran de couverture, crédits et BPM.
- Notes de l'adversaire à gauche et notes du joueur à droite. Le middlescroll est désactivé.
- Notes légèrement agrandies et longues notes continues, correctement dimensionnées et terminées par leur cap, sans répétition de texture.
- Atlas Sparrow avec plages `indices` et personnages Adobe Animate officiels (`bf` et `gf`) pris en charge.
- Shaders et effets Godot compatibles, sans dépendre des shaders Haxe au runtime. Le matériau de silhouette est retiré à intensité nulle afin de conserver les couleurs originales des personnages.
- Nouvel événement `Among Shader FX` porté nativement : neige sur le stage et le HUD, poussière spatiale, scanlines/glitch, alerte et aurore.
- Chart Editor, Event Editor, Character Editor et Stage Editor amélioré de NoahEngine.
- Sources Codename/Haxe originales conservées dans `among_funk/codename`.

## Version mobile / Android

- Contrôles de notes multitouch semi-transparents avec retour haptique.
- Bouton pause tactile, écran titre tactile, navigation des menus à la souris ou au doigt et boutons de game-over mobiles.
- Mode paysage 1280×720, renderer Compatibility et quantité de particules automatiquement réduite sur téléphone.
- Preset d'export Android ARM64 inclus sans changer la version du jeu (`0.1.0`).

Pour fabriquer l'APK, consulter `MOBILE-ANDROID-FR.md` ou lancer `BUILD-ANDROID.bat` après avoir installé les templates d'export Android de Godot 4.7.2, Java 17 et le SDK Android.

## Stage Editor

Dans `Developer Tools`, ouvrir `Stage Editor`. Il permet de sélectionner un élément dans la liste, le déplacer, le redimensionner et le faire pivoter avec le gizmo, ajouter/supprimer des éléments, régler les caméras et sauvegarder le XML avec `Ctrl+S`.

Les réglages manuels du stage sont dans :

`among_funk/codename/data/stages/Polus.xml`

## Character Editor

Dans `Developer Tools`, ouvrir `Character Editor`. Il permet de choisir le sprite/atlas, modifier la position globale, la caméra, l'échelle, le flip et les propriétés d'icône, puis d'ajouter, dupliquer, supprimer et prévisualiser les animations. Les offsets d'animation peuvent être réglés numériquement ou en faisant glisser le personnage. `Ctrl+S` sauvegarde le XML et crée d'abord une copie `.xml.bak`.

## Limites déjà présentes dans les fichiers source

- `Discover` contient 23 notes dans le chart fourni.
- `Dlow` contient 66 notes dans le chart fourni.
- `mando` possède l'audio mais son chart fourni est vide.
- `Sussus Moogus` est annoncé/verrouillé dans les menus Haxe, mais aucun dossier de chanson correspondant n'est fourni. Il reste donc affiché comme contenu planifié.
- `good-times` et `no-more-tasks` sont ajoutés par le nouveau Freeplay Haxe, mais leurs dossiers de chanson ne sont pas présents dans le ZIP reçu.

Ces données n'ont pas été inventées ou complétées artificiellement afin de rester fidèle à l'archive originale.
