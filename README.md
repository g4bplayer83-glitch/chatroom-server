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

## Progression XP
L’XP est la seule ressource de progression. Elle se gagne via les messages, les réactions, le vocal, le bonus quotidien et les missions. Les niveaux débloquent automatiquement des thèmes et styles de pseudo.

## Cosmétiques
- Thèmes de base dès le niveau 0.
- Bleu Nuit niveau 2.
- Pseudo Glow niveau 3.
- Rouge / Jaune / Deep Purple niveau 4.
- Pseudo Gradient + thèmes roses niveau 7.
- Orange / Forest niveau 10.
- Pseudo Néon niveau 12.
- Theme Lab personnalisé niveau 20.

## Lancer en local
```bash
npm install
npm start
```
Puis ouvrir `http://localhost:8080`.

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
