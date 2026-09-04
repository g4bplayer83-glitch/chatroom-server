# DocSpace — v3.3.0 Beta

DocSpace est un chat temps réel inspiré de Discord, avec salons texte/vocaux, messages privés, profils, fichiers, sondages, soundboard, présence et progression XP.

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

## Lancer
```bash
npm install
npm start
```
Puis ouvrir `http://localhost:8080`.

## Build
Cette version consolide les correctifs UI, login et stabilité des révisions précédentes de la branche 3.3.0 Beta.

## R5.1.0 — Arcade + Vocal + Fly.io
- Arcade accessible via le bouton 🎮 dans la barre de gauche ou `Arcade DocSpace` sous le salon `jeux`.
- Tetris Versus : solo + code de room 1v1.
- Neon Maze 3D : raycasting local + room jusqu'à 8 joueurs.
- Pulse Pong : bonus solo.
- Vocal adaptatif : audio/camera/screen share ajustés automatiquement selon le nombre de peers.
- Pour Fly.io : voir `FLY_PERFORMANCE_GUIDE.md` et `fly.toml`.
