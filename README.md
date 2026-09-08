<<<<<<< HEAD
# DocSpace — v3.4.0 Beta

DocSpace est un espace de travail et de discussion temps réel inspiré de Discord, avec salons texte/vocaux, messages privés, profils, fichiers, sondages, soundboard, présence, progression XP et jeux.

## Nouveautés 3.4

- Interface plus fluide et cohérente sur ordinateur et mobile.
- Messages privés en espace trois colonnes : conversations, fil de messages et profil.
- Connexion par pseudo **ou email**, email modifiable et changement de mot de passe.
- Mots de passe PBKDF2 renforcés et migration transparente des anciens comptes.
- DocSpace Plus activable par code, sans système de paiement.
- Emojis personnalisés Plus utilisables avec la syntaxe `:nom:`.
- Regarder ensemble avec le lecteur YouTube officiel et synchronisation de salle.
- Pause Tetris réellement fonctionnelle avec la touche `P`.
- Fichiers serveur, données privées et configuration bloqués côté HTTP.
=======
# DocSpace 3.5.0

Discuter, partager des fichiers et jouer ensemble. Cette archive contient le serveur, l’interface pour ordinateur et téléphone, les sources des jeux et les deux exports Godot déjà compilés.
>>>>>>> a4ba223 (Patch 3.5.2)

## Démarrage sur Windows

1. Extrais **tout le ZIP** dans un nouveau dossier.
2. Installe **Node.js 22 ou une version compatible plus récente** si nécessaire.
3. Lance **DEMARRER-DOCSPACE.bat**. Le premier lancement installe les dépendances et demande Internet.
4. Ouvre **http://localhost:8080** dans ton navigateur. Garde la fenêtre du serveur ouverte.

<<<<<<< HEAD
## Lancer en local
```bash
npm install
=======
Aucun export Godot ni pull request n’est nécessaire pour essayer ce ZIP. La connexion utilise un **pseudo et un mot de passe**, sans email. Une nouvelle installation locale ne contient pas les comptes de ton serveur Fly.io.

**[Guide de configuration et de mise à jour](DEMARRER.md)** · **[Nouveautés](NOUVEAUTES-3.5.0.md)** · **[Vérifications effectuées](VALIDATION.md)**

## Ce qui est inclus

- Interface compacte, navigation mobile, liste des membres avec ton propre compte et salons vocaux avec avatars.
- Treize ambiances, dont un thème personnalisé, et effets de pseudo disponibles sans niveau requis. L’XP indique seulement la participation.
- MP avec historique, réactions, édition, suppression, épingles, lecture et notifications.
- Menu de message par clic droit, Ctrl + clic ou appui long ; réponses, transfert, copie du texte, lien et identifiant.
- Menu **+** : fichiers, images/screenshots, sondages et messages vocaux avec écoute avant envoi. Images collables avec Ctrl + V et déposables dans la conversation.
- Plus de 900 émojis classés, GIFs, personnalisation du profil et changement du mot de passe.
- Menu **…** : amis, MP, fichiers, présence, soundboard, classement, statistiques, nouveautés, thèmes, paramètres et administration.
- Tetris Versus, Neon Maze, Pulse Pong, Orbit Garden 3D et Indie Engine 1.0.7 adapté au web.

## Développement

```sh
npm ci
npm test
>>>>>>> a4ba223 (Patch 3.5.2)
npm start
```

<<<<<<< HEAD
## Déployer sur Fly.io

Le volume `docspace_data` doit exister dans la région `cdg` :

```bash
fly volume create docspace_data --region cdg --size 1 -a docspace
```

Configure ensuite les secrets. Remplace les exemples par des valeurs privées :

```bash
fly secrets set ADMIN_PASSWORD="un-mot-de-passe-long" DOCSPACE_PLUS_CODES="CODE-AMI-1,CODE-AMI-2" -a docspace
```

Puis déploie :

```bash
fly deploy -a docspace --config fly.toml
```

Les codes Plus sont séparés par des virgules et ne peuvent être utilisés qu’une fois. Ne les ajoute jamais dans GitHub.

Les services externes restent désactivés tant que leurs clés ne sont pas configurées. Si tu les utilises :

```bash
fly secrets set GEMINI_API_KEY="..." GIPHY_API_KEY="..." -a docspace
```

## R5.1.0 — Arcade + Vocal + Fly.io
- Arcade accessible via le bouton 🎮 dans la barre de gauche ou `Arcade DocSpace` sous le salon `jeux`.
- Tetris Versus : solo + code de room 1v1.
- Neon Maze 3D : raycasting local + room jusqu'à 8 joueurs.
- Pulse Pong : bonus solo.
- Vocal adaptatif : audio/camera/screen share ajustés automatiquement selon le nombre de peers.
- Pour Fly.io : voir `FLY_PERFORMANCE_GUIDE.md` et `fly.toml`.

## Regarder ensemble

La fonction utilise `youtube-nocookie.com` et l’API du lecteur intégré. Elle ne fait pas proxy du trafic vidéo et n’est pas conçue pour contourner le filtrage d’un réseau ou d’un établissement.
=======
L’interface active se trouve dans `public/`, le serveur dans `server.js` et les ajouts de la 3.5.0 dans `lib/features.js`. Les anciens fichiers d’interface à la racine sont conservés comme historique ; le lanceur utilise `public/`.

Les 20 tests automatisés passent. Les exports Godot sont compilés ; une chanson d’Indie Engine a été lancée dans le moteur. Les canvas et périphériques audio sont simulés dans les tests d’interface. Le rendu sur un téléphone physique et les appels entre deux appareils restent à vérifier. Aucun APK signé ni déploiement Fly.io de cette version n’a été effectué.
>>>>>>> a4ba223 (Patch 3.5.2)
