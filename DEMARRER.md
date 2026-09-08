# DocSpace 3.5 bêta

Cette version remplace l’interface par un client web dans `public/`, tout en gardant le serveur Node.js / Socket.IO et les fichiers de données existants. Godot sert aux jeux embarqués ; il ne remplace pas le chat.

## Sur ton PC

1. Installe Node.js 22 ou une version plus récente compatible.
2. Dans le dossier du projet : `npm ci`, puis `npm start`.
3. Ouvre `http://localhost:8080`.
4. Connecte-toi avec ton pseudo existant, ou clique sur **Créer un compte**. L’email ne sert plus à la connexion.

Les comptes et les messages de ton serveur Fly.io ne sont pas téléchargés automatiquement sur ton PC. Une installation locale neuve commence vide. Les mots de passe ne sont pas envoyés dans le ZIP ni enregistrés par le navigateur ; la session utilise un jeton dans le stockage de l’onglet.

## Avant de remplacer la version Fly.io

Sauvegarde ton volume et garde une copie de la version actuelle. Le nom de l’application reste `docspace`, la région `cdg`, le volume `docspace_data` monté sur `/data`. Ne remplace pas `/data/data` ni `/data/uploads` avec un dossier vide du projet. Cette version lit les mêmes comptes, profils, salons et DM. Les champs de session et de lecture des DM sont ajoutés aux comptes ; les hashes historiques sont toujours acceptés et migrés à la connexion.

Les fichiers `data/` étaient suivis par Git dans la version précédente. Cette branche retire leur suivi : cela ne supprime pas le volume Fly.io. L’ancien historique Git reste inchangé. Pour travailler localement sur des données réelles, garde ta sauvegarde à part avant de changer de branche.

Vérifie la branche sur ton PC avec `npm test` puis `npm start`. Pour publier toi-même après vérification :

```powershell
flyctl auth login
flyctl volumes list -a docspace
flyctl deploy -a docspace
flyctl logs -a docspace
```

Si le volume existe déjà, ne le recrée pas. Seulement si Fly.io indique qu’il manque : `flyctl volumes create docspace_data -a docspace -r cdg --size 1`.

Le Dockerfile installe Node.js 22 et les dépendances de production. Le fichier `.dockerignore` exclut les données locales du build. Une seule machine avec son volume est recommandée pour ce stockage JSON ; les données et les salons en mémoire ne sont pas répliqués entre plusieurs machines.

Les fichiers partagés ne sont plus supprimés automatiquement après 30 jours. Une suppression par ancienneté demande maintenant une configuration explicite de `DOCSPACE_UPLOAD_RETENTION_DAYS` ; laisse cette variable absente pour conserver les documents.

## Téléphone

La même adresse HTTPS affiche l’interface mobile : barre de navigation en bas, liste des salons dans le menu, commandes tactiles des jeux. Le manifeste et le service worker préparent l’installation sur l’écran d’accueil depuis le menu Chrome/Edge, ou **Partager → Sur l’écran d’accueil** sur iPhone selon le navigateur. Le cache contient seulement les ressources publiques du client, jamais les API, mots de passe, DM ou uploads. Discuter demande toujours une connexion au serveur.

Aucun APK signé n’est fourni. Une application Android emballant le site pourra être produite ensuite ; elle ne rendra pas le chat utilisable sans réseau.

## Vocal

Rejoins un salon vocal pour autoriser le microphone. Les paramètres permettent de choisir le micro, tester son niveau, régler l’écho et le bruit. Le casque coupe le son reçu ; le micro coupe l’émission. Quitter le salon ferme les connexions et arrête la capture. Sur téléphone, utilise HTTPS.

Le mode P2P existant reste utilisé. Les réseaux restrictifs peuvent demander un relais TURN ; renseigne alors `DOCSPACE_TURN_URLS`, `DOCSPACE_TURN_USERNAME`, `DOCSPACE_TURN_CREDENTIAL`. Les tests automatisés vérifient la signalisation et l’isolation des salons, pas la qualité audio entre deux appareils physiques. Le client ne gère pas le mode SFU ni la vidéo dans cette version.

## DocSpace Plus

Crée des codes longs et aléatoires puis configure `DOCSPACE_PLUS_CODES` dans les secrets Fly.io (codes séparés par des virgules). Chaque code s’active une fois. **Paramètres → DocSpace Plus** permet d’ajouter un emoji PNG, JPEG, WebP ou GIF de 512 Ko maximum. Les utilisateurs peuvent insérer les emojis du serveur dans le compositeur. Aucun paiement et aucun email ne sont nécessaires.

## Godot : Orbit Garden

Le projet éditable est `godot/orbit-garden/project.godot` : un jeu 3D de collecte, huit cristaux, obstacles, chronomètre, bouton Rejouer, clavier et boutons tactiles. Il utilise GDScript, le moteur Compatibility et un export web sans threads. Il se lance dans une iframe dédiée ; quitter la vue retire l’iframe.

Pour le publier :

1. Ouvre le projet dans Godot 4.4.1 et installe ses modèles d’export.
2. Crée `public/games/orbit-garden/` si nécessaire.
3. **Projet → Exporter → Web → Exporter le projet**, vers `public/games/orbit-garden/index.html`.
4. Démarre DocSpace et ouvre **Arcade → Orbit Garden**.
5. Conserve **tous** les fichiers exportés (`.html`, `.js`, `.wasm`, `.pck`, etc.) dans ce dossier au moment du déploiement Fly.io.

Le workflow GitHub `Vérifier DocSpace` contient aussi un export Godot et publie le résultat comme artefact `orbit-garden-web`. Cet artefact doit être décompressé dans `public/games/orbit-garden/` avant un déploiement local. Les exports sont ignorés par Git pour ne pas ajouter de gros binaires au dépôt ; ils sont inclus dans le contexte Docker local s’ils sont présents.

Le moteur et l’export n’ont pas pu être exécutés dans l’environnement de préparation. Tant que l’export n’est pas installé, la carte indique clairement que le jeu est en préparation. Tetris, Neon Maze et Pong fonctionnent indépendamment de Godot.

Sources : [export web Godot](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html), [Godot 4.4.1 et modèles officiels](https://godotengine.org/download/archive/4.4.1-stable/).

## Validation et limites

`npm test` démarre un vrai serveur dans un dossier temporaire et utilise plusieurs clients Socket.IO. Il vérifie les comptes, la session, la bio, l’envoi/édition/suppression des messages, les DM et fichiers, Plus, la signalisation vocale, les parties multijoueurs, et les interactions du nouveau client avec jsdom. Les canvas et les APIs média sont simulés dans ces tests d’interface.

Le navigateur distant de préparation refuse l’accès au serveur local : aucune validation visuelle Chrome/Safari, mesure de fluidité sur téléphone, ni capture microphone réelle n’est revendiquée. Vérifie ces points avant la mise en production. Cette branche n’a pas été déployée sur Fly.io.

Le lecteur YouTube est le lecteur intégré officiel, ouvert à la demande. Il dépend de l’accès à YouTube sur le réseau ; il ne fournit ni proxy ni streaming vidéo depuis Fly.io. Les anciens systèmes serveur (progression, outils administrateur, etc.) restent dans le code mais tous leurs écrans historiques ne sont pas reconstruits dans cette interface bêta.
