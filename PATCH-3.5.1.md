# DocSpace 3.5.1 — patch pour la version 3.5.0

Ce ZIP contient uniquement les fichiers nouveaux ou modifiés depuis le ZIP DocSpace-3.5.0 fourni précédemment. Il s’applique à ce projet complet : il ne peut pas démarrer tout seul. Il ne contient ni comptes, ni messages, ni fichiers envoyés par les utilisateurs.

## Installation sur ton PC

1. Arrête DocSpace avec **Ctrl + C** dans sa fenêtre de terminal. Garde une copie de ton dossier actuel pour pouvoir revenir en arrière.
2. Extrais ce ZIP dans un dossier temporaire. Copie son contenu dans **le dossier contenant ton `package.json` et ton `server.js` actuels**. Accepte le remplacement des fichiers et la fusion des dossiers `public`, `lib` et `tests`. Il ne faut pas supprimer puis remplacer ces dossiers entiers : ils contiennent aussi des fichiers inchangés.
3. Relance **DEMARRER-DOCSPACE.bat**, puis ferme les anciens onglets DocSpace et ouvre de nouveau le site. Utilise **Ctrl + F5** si tu vois encore 3.5.0.

Garde ton fichier `.env`, tes dossiers `data`, `uploads`, `sound`, `godot` et `public/games`. Le patch ne les remplace pas. Les 41 sons utilisés sont déjà fournis dans la version complète 3.5.0. Aucun nouveau paquet de production n’est nécessaire.

Si tu as modifié le code toi-même depuis 3.5.0, compare les fichiers concernés avant de les remplacer. `PATCH-FICHIERS.json` donne leur empreinte avant/après pour identifier exactement cette base.

Sur Fly.io, applique ces fichiers dans le projet complet, puis déploie-le comme d’habitude. Cette livraison n’a pas modifié l’application en production. Le volume existant `docspace_data` et la configuration de montage doivent rester présents pour conserver les données. Le patch utilise l’état en mémoire du serveur pour les parties : les joueurs doivent arriver sur la même instance DocSpace.

## Ce qui change

- **Pong en ligne** : duel à deux, ballon et score calculés côté serveur, premier à 7 points. Le mode solo reste disponible. Une déconnexion libère la place dans la partie.
- **Invitations** : depuis l’Arcade, le profil d’une personne ou **… → Inviter à jouer**, choisis un utilisateur connecté et Pong, Tetris ou Neon Maze. La personne dispose de 90 secondes pour accepter ou refuser. Après acceptation, vous rejoignez le même code. Pour une revanche à Pong, envoie une nouvelle invitation ou choisissez un nouveau code.
- **Jeux Godot** : Orbit Garden et Indie Engine restent en solo dans ce patch. Leurs exports n’ont pas été reconstruits.
- **Amis** : boutons distincts pour ajouter, accepter, attendre une réponse et « Déjà amis ». Les demandes et acceptations apparaissent dans les notifications.
- **Mentions** : tape `@` dans un message pour obtenir des suggestions. Flèches pour choisir, Entrée/Tab pour insérer, Échap pour fermer. Les mentions sont mises en évidence et déclenchent une alerte selon les réglages.
- **Sons** : notifications, navigation, vocal, micro et clavier utilisent les fichiers du projet. Dans **Paramètres → Notifications**, active chaque catégorie et écoute les 41 aperçus. Les sons du clavier sont désactivés au départ. Le mode « Ne pas déranger » coupe les sons de notification.
- **Profil** : la photo enregistrée est répercutée aux autres sessions et aux participants vocaux. Sa conservation a été testée après un redémarrage du serveur.
- **GIFs** : galerie, catégories, favoris dans ce navigateur, recherche et import de fichier. Huit GIFs animés originaux DocSpace fonctionnent sans service externe. La recherche étendue GIPHY reste facultative.
- **Vocal** : caméra sélectionnable et partage d’écran distinct de la caméra. Tu peux garder les deux actifs. Chaque capture possède son propre bouton d’arrêt ; quitter le vocal coupe les périphériques. Le bouton d’arrêt du navigateur met également fin au partage. Le partage transmet l’image de l’écran, sans le son système.
- **Interface** : outils des messages visibles, icônes de la barre supérieure alignées, tuiles vocales plus compactes, notes de mise à jour présentées par version.
- **Statistiques** : durée cumulée du serveur et durée depuis le dernier démarrage affichées en heures, minutes et secondes. Les compteurs de messages/fichiers restent ceux du démarrage courant.

## GIFs et YouTube facultatifs

Sans clé, les GIFs DocSpace et leurs favoris fonctionnent. Les vidéos récemment ouvertes dans ce navigateur apparaissent dans l’Arcade. Tu peux toujours coller un lien YouTube.

Pour étendre la recherche, ajoute dans ton `.env` local existant, puis redémarre avec le lanceur :

```dotenv
GIPHY_API_KEY=ta_cle_giphy
YOUTUBE_API_KEY=ta_cle_youtube_data_api_v3
```

Sur Fly.io, utilise les secrets de l’application. Ne mets pas tes clés dans le JavaScript public ni sur GitHub. La recherche utilise les API officielles et un cache de cinq minutes ; les quotas du fournisseur continuent de s’appliquer. La limite locale est de 20 recherches par minute et par adresse IP.

Les suggestions YouTube exigent que YouTube Data API v3 soit activée pour la clé. Le lecteur officiel reste soumis à l’accès au réseau, aux droits de lecture et aux restrictions d’intégration de la vidéo. **Ce patch ne contourne pas un blocage de YouTube sur le Chromebook ou le réseau.**

## Vérifications effectuées et limites

**35 tests automatisés réussis avec `npm test`** : comptes, messages privés, fichiers, sondages, permissions d’administration, reconnexion, amis et avatars après redémarrage, invitations privées, Pong avec plusieurs clients, interface via DOM simulé, galerie/favoris GIF, mentions et parcours des jeux existants.

Le vocal a été testé avec des périphériques et connexions WebRTC simulés : pistes séparées micro/caméra/écran, changement de caméra, nouvel arrivant, arrêt natif du partage et refus des captures arrivées après le départ du salon. Ces tests ne remplacent pas un essai réel entre deux appareils. Aucun test visuel dans un vrai navigateur, test physique de caméra ou déploiement Fly.io n’est revendiqué pour ce patch.

La capture demande une permission du navigateur et un contexte sécurisé (HTTPS ou localhost). Le partage d’écran dépend du navigateur et reste limité sur téléphone. Certains réseaux demandent un relais TURN pour le vocal et la vidéo : la configuration TURN déjà disponible dans le projet reste utilisée. La recherche externe GIPHY/YouTube n’a pas été testée avec une clé réelle.

Pour un essai à deux : ouvre deux comptes, échange un MP et une demande d’ami, envoie une invitation Pong, puis rejoins le même salon vocal. Active une caméra, partage une fenêtre et arrête chaque capture séparément.

Documentation des services et API : [GIPHY](https://developers.giphy.com/docs/api/endpoint/), [YouTube Search](https://developers.google.com/youtube/v3/docs/search/list), [partage d’écran](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia), [pistes WebRTC](https://developer.mozilla.org/en-US/docs/Web/API/RTCRtpSender/replaceTrack).
