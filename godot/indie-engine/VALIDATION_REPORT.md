# Rapport de validation — Among Funk v0.1.0

## Intégration du nouveau ZIP

- Fichiers du nouveau ZIP contrôlés : 201/201.
- Fichiers manquants après fusion : 0.
- Fichiers différents de la source après fusion : 0.
- Les anciens fichiers nécessaires au port Godot ont été conservés ; le nouveau ZIP a été fusionné sans suppression destructive.
- Personnages disponibles : 7, dont le nouveau `Moogusred`.
- Stages disponibles : 1/1 (`Polus`).

## Charts et événements

- Chansons chargées : 5/5.
- Difficultés chargées : 5/5.
- Notes lues : 1 582.
- Événements lus : 127, répartis sur 11 types.
- Nouveau type détecté et géré : `Among Shader FX`.
- Sabotage : nouveau chart conservé avec `Moogusred` et la neige activée à la première frame.
- Discover : nouveau chart conservé avec le stage `Polus` et `Moogusred`.

## Ressources

- JSON/XML analysés : aucune erreur de structure.
- Médias audio/vidéo contrôlés avec FFprobe : 22/22, aucun échec.
- `optionsTheme.ogg` est raccordé au menu Options.
- L'atlas, le XML et l'icône de `Moogusred` sont présents et référencés.
- Les longues notes restent rendues avec un corps continu et un cap séparé, sans retour au TextureRect carrelé qui provoquait les anciennes coupures.

## Interface et gameplay

- Nouveau Freeplay Polus porté avec sa liste de missions, sa prévisualisation animée et ses onglets verrouillés.
- HUD Among Us horizontal, nom de chanson dans la barre de tâches et position haut/bas adaptée au downscroll.
- Game-over de connexion : état déconnecté, barre de restauration, état reconnecté et commandes tactiles.
- Pause : Quick Options, inspection du jeu, changement de touches et retour direct au Chart Editor en mode charting.
- `Among Shader FX` : neige monde/HUD, space-dust, scanlines/glitch, warning et aurora.

## Android

- Contrôles multitouch : 4 directions + pause.
- Retour haptique et réduction de particules sur mobile.
- Écran titre, Freeplay, Story, Options, Pause et Game-over utilisables au toucher.
- Preset Android ARM64, mode immersif paysage et script `BUILD-ANDROID.bat` inclus.
- Version du projet, du catalogue et du preset Android : `0.1.0`.

## Résultat des contrôles disponibles ici

Le validateur statique du projet termine avec `0 erreur`. Les 201 fichiers du nouveau ZIP sont tous retrouvés à l'identique et les 22 médias passent FFprobe.

Le binaire Godot et le SDK Android ne sont pas installés dans cet environnement. L'APK n'a donc pas été compilé ici : le test final de l'export Android doit être effectué sur une machine équipée de Godot 4.7.2, de ses templates Android, de Java 17 et du SDK Android.
