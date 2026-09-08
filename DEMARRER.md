# Démarrer DocSpace 3.5.0

## 1. Sur ton PC Windows

Extrais complètement le ZIP, puis ouvre `DEMARRER-DOCSPACE.bat`. Il faut Node.js 22 ou une version compatible plus récente. Le lanceur installe les dépendances au premier démarrage, puis affiche l’adresse `http://localhost:8080`. Laisse cette fenêtre ouverte ; Ctrl + C arrête le serveur.

Tu peux aussi ouvrir un terminal dans le dossier et exécuter `npm ci`, puis `npm start`. Pour lancer les tests, installe toutes les dépendances avec `npm ci`, puis utilise `npm test`.

Crée un compte avec un pseudo et un mot de passe. La connexion par email a été retirée. **Paramètres → Mon compte** permet de changer le mot de passe ; les autres sessions sont alors révoquées.

La version locale et ton site Fly.io sont deux serveurs distincts. Le ZIP ne contient ni tes comptes, ni tes messages, ni tes fichiers personnels. Pour garder une ancienne installation locale, conserve une copie de ses dossiers `data/` et `uploads/`, puis réutilise-les dans le nouveau dossier, serveur arrêté.

## 2. Activer l’administration

Sur ton PC : copie `.env.example` sous le nom `.env`, ouvre-le dans un éditeur et renseigne `ADMIN_PASSWORD` avec un mot de passe long réservé à l’administration. Redémarre DocSpace. Dans le site, connecte-toi à ton compte puis ouvre **… → Administration** et saisis ce mot de passe administrateur. Il est distinct du mot de passe de connexion du compte.

Une valeur vide laisse l’administration désactivée. Ne partage pas le fichier `.env` et ne l’envoie pas sur GitHub. Le mode administrateur n’est pas mémorisé dans le navigateur après déconnexion. Les contrôles de permissions sont effectués par le serveur.

L’interface permet d’expulser, bannir ou débannir une personne, l’expulser du vocal, créer des salons texte/vocaux, retirer un salon texte, régler le mode lent, activer ou lever le silence global et publier une annonce. Dans un salon, les épingles demandent ce mode ; en MP, chacun des deux participants peut épingler. On peut modifier son propre texte et supprimer ses propres messages ; un administrateur peut aussi supprimer les messages d’un salon.

Sur Fly.io, configure `ADMIN_PASSWORD` comme secret de l’application au lieu d’envoyer `.env`. Les commandes officielles sont décrites dans [fly secrets set](https://fly.io/docs/flyctl/secrets-set/).

## 3. Messages, notifications et médias

**+ → Joindre un fichier** ou **Image ou screenshot** prépare une pièce jointe. Tu peux aussi coller une image avec Ctrl + V ou la déposer dans la conversation. Une pièce jointe par message, puis **Envoyer**. Les images apparaissent dans le fil et les audios disposent d’un lecteur.

**+ → Créer un sondage** accepte une question et 2 à 8 réponses. Chacun peut changer son vote. Le créateur peut terminer le sondage. Les votes sont conservés au redémarrage ; les sondages privés sont limités aux deux participants.

**+ → Message vocal** : clique sur Enregistrer, autorise le micro, parle, puis Arrêter. Écoute l’aperçu, clique sur Joindre au message et enfin Envoyer. Maximum 3 minutes et 8 Mo. Fermer la fenêtre ou changer de conversation arrête la capture. Un serveur HTTPS ou localhost est nécessaire pour le microphone.

Le clic droit, Ctrl + clic sur le texte ou l’appui long ouvre les actions du message. Ctrl + K ouvre la navigation rapide. La cloche rassemble les MP et mentions reçus ; les compteurs indiquent les messages non lus. Les notifications du système doivent être activées volontairement dans **Paramètres → Notifications** et restent soumises aux permissions du navigateur. Le mode Ne pas déranger coupe les alertes sonores.

La touche **GIF** permet de joindre un fichier GIF ou d’insérer un lien direct GIPHY/Tenor. La recherche en ligne demande la variable `GIPHY_API_KEY` sur le serveur. Sans clé, l’interface propose les deux autres méthodes. Les thèmes et effets de pseudo sont tous ouverts ; les niveaux ne débloquent aucun thème.

**DocSpace Plus** conserve l’activation par code, sans paiement. Configure des codes longs dans `DOCSPACE_PLUS_CODES`, séparés par des virgules. Chaque code s’utilise une fois. L’onglet Plus permet alors d’ajouter des émojis personnalisés de 512 Ko maximum. Les émojis du serveur sont accessibles dans le sélecteur.

## 4. Vocal et téléphone

Rejoins un salon vocal pour démarrer le micro. Les paramètres permettent de choisir et tester le microphone, et de régler l’annulation de l’écho et la réduction du bruit. Couper le casque coupe aussi l’émission du micro ; le réactiver demande un clic. Quitter arrête la capture. Une commande administrateur ne réactive pas ton micro sans action de ta part.

Le vocal utilise WebRTC en P2P. Des réseaux restrictifs peuvent nécessiter un relais TURN : configure `DOCSPACE_TURN_URLS`, `DOCSPACE_TURN_USERNAME` et `DOCSPACE_TURN_CREDENTIAL`. Le client ne gère pas la vidéo, le partage d’écran ou le mode SFU dans cette version.

Sur téléphone, ouvre l’adresse HTTPS du serveur : la navigation s’adapte et les jeux proposent des boutons tactiles. Pour les jeux de rythme et la 3D, le mode paysage est plus pratique. Le site dispose d’un manifeste et d’un service worker pour l’installation sur l’écran d’accueil lorsque le navigateur la propose. Aucun APK signé n’est inclus. La discussion nécessite une connexion réseau ; le cache contient seulement l’interface publique.

## 5. Jeux inclus : rien à exporter pour ce ZIP

Les dossiers `public/games/orbit-garden/` et `public/games/indie-engine/` contiennent les exports complets : conserve leurs fichiers HTML, JavaScript, WASM et PCK ensemble. N’ouvre pas leur HTML par double-clic ; lance DocSpace puis ouvre l’Arcade.

- **Tetris Versus** : solo ou duel avec le même code. Flèches, Espace pour poser, P pour pause, commandes tactiles.
- **Neon Maze** : flèches ou clavier de déplacement, solo ou groupe avec un code commun.
- **Pulse Pong** : déplace la raquette au clavier ou avec les commandes tactiles.
- **Orbit Garden** : flèches ou ZQSD, collecte de huit cristaux, chronomètre, meilleur temps local et bouton Rejouer.
- **Indie Engine** : Entrée pour avancer/valider, flèches pour naviguer et jouer les notes, Entrée pour la pause et Échap pour revenir. Les boutons tactiles reproduisent les touches. Clique dans le jeu pour autoriser le son. Les scores restent dans le stockage local du navigateur.

Les sources éditables se trouvent sous `godot/`. Les deux projets ont été compilés avec Godot 4.4.1 et ses modèles d’export web, en mode Compatibility et sans threads. Pour les modifier, installe cette version et ses modèles, ouvre le projet souhaité et utilise le préréglage **Web**. Le Dockerfile reconstruit les deux jeux pour Fly.io. Le workflow fourni dans le ZIP exporte aussi les deux jeux vers l’artefact `docspace-games-web`.

Le portage d’Indie Engine conserve le jeu et ses ressources de l’archive fournie. Les adaptations sont détaillées dans `godot/indie-engine/PORTAGE_WEB_DOCSPACE.md`. Le chargement de mods Windows externes est désactivé sur le web ; les DLL et exécutables Windows ne sont pas nécessaires à ce ZIP.

Références : [export web Godot](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [Godot 4.4.1](https://godotengine.org/download/archive/4.4.1-stable/).

## 6. Publier toi-même sur Fly.io

Teste d’abord l’archive sur ton PC. Le déploiement remplace le programme de ton site ; conserve une sauvegarde du volume. La configuration fournie garde l’application `docspace`, la région `cdg` et le volume `docspace_data` monté sur `/data`. Ne remplace pas `/data/data` ni `/data/uploads` par des dossiers vides.

Dans le dossier extrait, avec flyctl installé et ton compte connecté :

```powershell
flyctl volumes list -a docspace
flyctl deploy -a docspace --ha=false
flyctl logs -a docspace
```

Si Fly.io signale encore que `docspace_data` manque en `cdg`, crée ce volume une seule fois :

```powershell
flyctl volumes create docspace_data -a docspace -r cdg --size 1
```

S’il existe déjà, réutilise-le. Ce serveur stocke ses données dans des fichiers JSON ; garde une seule machine pour éviter plusieurs copies indépendantes des comptes et historiques. Les fichiers partagés sont conservés sans expiration automatique, sauf configuration explicite de `DOCSPACE_UPLOAD_RETENTION_DAYS`.

Les exports Godot et dépendances sont construits dans l’image. Un build réussi ne suffit pas à prouver que la machine démarre : consulte les logs en cas d’échec. Cette livraison n’a pas modifié ton serveur Fly.io.

Documentation des commandes : [déployer](https://fly.io/docs/flyctl/deploy/) et [créer un volume](https://fly.io/docs/flyctl/volumes-create/).
