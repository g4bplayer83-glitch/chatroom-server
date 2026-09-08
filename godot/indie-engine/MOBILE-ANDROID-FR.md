# Among Funk v0.1.0 — version Android

Le projet contient maintenant une interface mobile en paysage : quatre touches de notes multitouch, un bouton pause, la navigation tactile des menus et des boutons tactiles pour le game-over.

## Exporter l'APK sous Windows

1. Ouvrir le projet avec Godot 4.7.2.
2. Installer les templates d'export de la même version : `Editeur > Gerer les templates d'export`.
3. Installer Android Studio avec le SDK Android, puis Java 17.
4. Dans Godot, renseigner les chemins Android dans `Editeur > Parametres de l'editeur > Export > Android`.
5. Fermer Godot et lancer `BUILD-ANDROID.bat`, ou utiliser `Projet > Exporter > Android`.

L'APK sera cree dans `export/Among-Funk-v0.1.0-Android.apk`.

## Tester les touches mobiles sur PC

Dans `project.godot`, changer temporairement :

```ini
mobile/force_touch_controls=true
```

Remettre la valeur a `false` avant une livraison PC. L'emulation tactile depuis la souris est activee pour faciliter ce test.

## Remarques

- L'orientation est verrouillee en paysage 16:9.
- Les effets de particules reduisent automatiquement leur nombre sur Android/iOS.
- Le preset cible ARM64 et garde le renderer Compatibility utilise par le projet.
