# DocSpace 3.5 bêta

Ton espace pour discuter, partager des fichiers et jouer ensemble. Interface web sur ordinateur et téléphone, serveur Node.js / Socket.IO, déploiement Fly.io.

## Démarrer

Node.js 22 ou plus récent compatible :

```sh
npm ci
npm test
npm start
```

Ouvre http://localhost:8080. **[Lis le guide complet](DEMARRER.md)** pour conserver tes données Fly.io, configurer le vocal, installer le site sur téléphone et exporter le jeu Godot.

## Cette version

- Nouveau client dans `public/`, avec navigation mobile, thèmes clair/sombre et animations réduites.
- Pseudo + mot de passe, sans connexion par email. Sessions par jeton, changement du mot de passe et révocation des autres sessions.
- Conversations privées, profils, amis, réponses, pièces jointes, indicateur de frappe et compteurs de messages non lus.
- Salons texte, réactions, édition/suppression et vue des fichiers de l’historique récent.
- Paramètres du microphone et salons vocaux P2P.
- DocSpace Plus activé par code et emojis personnalisés.
- Tetris (solo/duel), Neon Maze (solo/multi) et Pong avec contrôles tactiles.
- Projet Godot 3D `godot/orbit-garden`, automatiquement exporté dans l’image Docker pour Fly.io.

## État de validation

Les 12 tests passent avec un vrai serveur, plusieurs clients Socket.IO et jsdom pour les interactions d’interface. Les canvas et médias y sont simulés. GitHub Actions a également réussi l’export du jeu avec Godot 4.4.1. Le rendu sur un téléphone réel et les appels audio réels restent à vérifier. Le workflow GitHub vérifie Node/Docker et publie l’export Godot en artefact.

Aucun APK signé n’est fourni. L’installation via le navigateur utilise le manifeste web. Les fonctions serveur historiques restent présentes, mais leurs anciens écrans ne sont pas tous reconstruits dans cette bêta.

## Données

`data/` et `uploads/` ne doivent pas être suivis par Git. Sur Fly.io, ils sont conservés dans le volume `docspace_data` sous `/data/data` et `/data/uploads`. Sauvegarde le volume avant une mise à jour. La version 3.5 conserve les formats existants.
