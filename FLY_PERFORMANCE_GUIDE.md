# DocSpace — Fly.io performance / vocal

## Configuration recommandée
- Région principale : `cdg` (Paris).
- **1 seule Machine** tant que DocSpace garde ses rooms Socket.IO / jeux en mémoire locale.
- Machine : `shared-cpu-2x`, 1 Go RAM.
- Autostop désactivé pour éviter les cold starts et coupures de WebSocket/vocal.
- Volume `docspace_data` monté sur `/data` pour conserver JSON + uploads.

## Première installation
```powershell
fly launch --no-deploy
fly volumes create docspace_data --region cdg --size 1
fly scale count 1 --region cdg
fly deploy
```

Si l'app existe déjà, garde son nom et remplace seulement la configuration par le `fly.toml` fourni.

## TURN pour les réseaux difficiles
Le serveur vocal est P2P : Fly.io transporte surtout la signalisation Socket.IO. Pour les utilisateurs derrière un NAT/pare-feu strict, configure un TURN :

```powershell
fly secrets set DOCSPACE_TURN_URLS="turn:turn.example.com:3478,turn:turn.example.com:3478?transport=tcp" DOCSPACE_TURN_USERNAME="docspace" DOCSPACE_TURN_CREDENTIAL="mot-de-passe-long"
fly deploy
```

Le site récupère automatiquement ces informations via `/api/voice/runtime-config`.

### TURN auto-hébergé sur Fly.io
C'est possible, mais l'UDP public Fly.io demande une **IPv4 dédiée**. Pour la simplicité et la fiabilité, un service TURN géré est souvent plus simple. Si tu auto-héberges coturn sur Fly, déploie-le dans une app séparée et garde DocSpace sur son app Node principale.

## Pourquoi une seule Machine pour l'instant ?
Les salons vocaux, parties Tetris/3D et plusieurs états Socket.IO sont en mémoire Node. Deux Machines sans Redis/adapter partageraient mal les utilisateurs. Pour passer à 2+ Machines, ajouter d'abord un adapter Socket.IO Redis et une persistance partagée.

## Diagnostic
- `/health-lite` : santé rapide.
- `/api/runtime/fly` : région, RAM, sockets, TURN, rooms vocales.
- `/api/observability/summary` : métriques détaillées.
