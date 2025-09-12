const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Configuration multer pour les fichiers
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, uniqueSuffix + '-' + sanitizedName);
    }
});

const fileFilter = (req, file, cb) => {
    // Types de fichiers autorisés
    const allowedTypes = [
        'image/', 'video/', 'audio/', 'text/', 'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument',
        'application/zip', 'application/x-rar-compressed'
    ];
    
    const isAllowed = allowedTypes.some(type => file.mimetype.startsWith(type));
    
    if (isAllowed) {
        cb(null, true);
    } else {
        cb(new Error('Type de fichier non autorisé'), false);
    }
};

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
        files: 1
    },
    fileFilter: fileFilter
});

const avatarUpload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max pour les avatars
        files: 1
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Seules les images sont autorisées pour les avatars'), false);
        }
    }
});

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Servir les fichiers statiques
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Variables pour stocker les données
let connectedUsers = new Map(); // socketId -> userData
let chatHistory = []; // Historique des messages
const MAX_HISTORY = 100; // Limite de l'historique
let typingUsers = new Map(); // socketId -> {username, timestamp}
let userProfiles = new Map(); // username -> profile data
let messageId = 1; // Compteur pour les IDs de messages

// Fonction utilitaire pour nettoyer les anciens fichiers
function cleanupOldFiles() {
    try {
        const files = fs.readdirSync(uploadDir);
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 jours
        
        files.forEach(file => {
            const filePath = path.join(uploadDir, file);
            const stats = fs.statSync(filePath);
            
            if (now - stats.mtime.getTime() > maxAge) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Fichier supprimé: ${file}`);
            }
        });
    } catch (error) {
        console.error('Erreur lors du nettoyage des fichiers:', error);
    }
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour l'upload de fichiers
app.post('/upload', (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'Fichier trop volumineux (max 10MB)' });
            }
            return res.status(400).json({ error: `Erreur d'upload: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier uploadé' });
        }
        
        console.log(`📎 Fichier uploadé: ${req.file.originalname} (${req.file.size} bytes)`);
        
        res.json({
            success: true,
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            mimetype: req.file.mimetype,
            path: `/uploads/${req.file.filename}`
        });
    });
});

// Route pour l'upload d'avatars
app.post('/upload-avatar', (req, res) => {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'Image trop volumineuse (max 5MB)' });
            }
            return res.status(400).json({ error: `Erreur d'upload: ${err.message}` });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'Aucune image uploadée' });
        }
        
        console.log(`👤 Avatar uploadé: ${req.file.originalname}`);
        
        res.json({
            success: true,
            filename: req.file.filename,
            path: `/uploads/${req.file.filename}`
        });
    });
});

// Route pour télécharger les fichiers
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filepath = path.join(uploadDir, filename);
    
    if (fs.existsSync(filepath)) {
        console.log(`⬇️ Téléchargement: ${filename}`);
        res.download(filepath);
    } else {
        res.status(404).json({ error: 'Fichier non trouvé' });
    }
});

// Route de santé pour Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        users: connectedUsers.size,
        messages: chatHistory.length,
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    console.log(`📱 Nouvelle connexion: ${socket.id} (IP: ${clientIp})`);

    // Envoi de l'historique des messages au nouveau client
    socket.emit('chat_history', chatHistory);

    // Connexion d'un utilisateur
    socket.on('user_join', (userData) => {
        try {
            const { username, avatar } = userData;
            
            // Validation
            if (!username || typeof username !== 'string' || username.trim().length === 0) {
                socket.emit('error', { message: 'Nom d\'utilisateur invalide' });
                return;
            }
            
            const cleanUsername = username.trim().substring(0, 20);
            
            // Vérifier si le pseudo est déjà pris
            const existingUser = Array.from(connectedUsers.values()).find(user => 
                user.username.toLowerCase() === cleanUsername.toLowerCase()
            );
            
            if (existingUser) {
                socket.emit('username_taken', { message: 'Ce pseudo est déjà pris!' });
                return;
            }

            // Ajouter l'utilisateur
            const userInfo = {
                id: socket.id,
                username: cleanUsername,
                avatar: avatar || '',
                joinTime: new Date(),
                ip: clientIp,
                lastActivity: new Date()
            };
            
            connectedUsers.set(socket.id, userInfo);

            // Sauvegarder le profil
            userProfiles.set(cleanUsername, {
                username: cleanUsername,
                avatar: userInfo.avatar,
                lastSeen: new Date(),
                joinCount: (userProfiles.get(cleanUsername)?.joinCount || 0) + 1
            });

            // Message de bienvenue
            const joinMessage = {
                type: 'system',
                message: `${cleanUsername} a rejoint le chat`,
                timestamp: new Date(),
                id: messageId++
            };
            
            addToHistory(joinMessage);
            io.emit('system_message', joinMessage);
            
            // Envoyer la liste des utilisateurs connectés
            updateUsersList();
            
            console.log(`✅ ${cleanUsername} a rejoint le chat (${connectedUsers.size} utilisateurs)`);
            
        } catch (error) {
            console.error('Erreur lors de la connexion utilisateur:', error);
            socket.emit('error', { message: 'Erreur lors de la connexion' });
        }
    });

    // Réception d'un message
    socket.on('send_message', (messageData) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) {
                socket.emit('error', { message: 'Vous devez d\'abord vous connecter' });
                return;
            }

            // Mettre à jour la dernière activité
            user.lastActivity = new Date();

            const message = {
                type: messageData.type || 'user',
                id: messageId++,
                username: user.username,
                avatar: user.avatar,
                content: messageData.content ? messageData.content.trim().substring(0, 500) : '',
                timestamp: new Date(),
                userId: socket.id,
                replyTo: messageData.replyTo || null,
                attachment: messageData.attachment || null
            };

            // Validation du message
            if (!message.content && !message.attachment) {
                socket.emit('error', { message: 'Message vide' });
                return;
            }

            // Filtrage basique du contenu
            if (message.content) {
                // Remplacer les caractères potentiellement dangereux
                message.content = message.content
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }

            // Ajouter à l'historique et diffuser
            addToHistory(message);
            io.emit('new_message', message);
            
            // Arrêter l'indicateur de frappe pour cet utilisateur
            if (typingUsers.has(socket.id)) {
                typingUsers.delete(socket.id);
                updateTypingIndicator();
            }
            
            console.log(`💬 [${user.username}]: ${message.content || '[Pièce jointe]'}`);
            
        } catch (error) {
            console.error('Erreur lors de l\'envoi du message:', error);
            socket.emit('error', { message: 'Erreur lors de l\'envoi du message' });
        }
    });

    // Indicateur de frappe
    socket.on('typing_start', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            typingUsers.set(socket.id, {
                username: user.username,
                timestamp: Date.now()
            });
            updateTypingIndicator();
        }
    });

    socket.on('typing_stop', () => {
        if (typingUsers.has(socket.id)) {
            typingUsers.delete(socket.id);
            updateTypingIndicator();
        }
    });

    // Mise à jour du profil utilisateur
    socket.on('update_profile', (profileData) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) return;

            // Mettre à jour l'avatar
            if (profileData.avatar && typeof profileData.avatar === 'string') {
                user.avatar = profileData.avatar;
                connectedUsers.set(socket.id, user);
                
                // Sauvegarder dans les profils
                const profile = userProfiles.get(user.username) || {};
                profile.avatar = profileData.avatar;
                profile.lastUpdate = new Date();
                userProfiles.set(user.username, profile);
                
                // Notifier tous les clients
                updateUsersList();
                
                socket.emit('profile_updated', { avatar: user.avatar });
                console.log(`👤 ${user.username} a mis à jour son avatar`);
            }
        } catch (error) {
            console.error('Erreur mise à jour profil:', error);
            socket.emit('error', { message: 'Erreur lors de la mise à jour du profil' });
        }
    });

    // Demande de la liste des utilisateurs
    socket.on('get_users', () => {
        updateUsersList();
    });

    // Ping pour maintenir la connexion active
    socket.on('ping', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            user.lastActivity = new Date();
            socket.emit('pong');
        }
    });

    // Déconnexion
    socket.on('disconnect', (reason) => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            // Message de départ
            const leaveMessage = {
                type: 'system',
                message: `${user.username} a quitté le chat`,
                timestamp: new Date(),
                id: messageId++
            };
            
            addToHistory(leaveMessage);
            io.emit('system_message', leaveMessage);
            
            // Mettre à jour le profil avec la dernière connexion
            const profile = userProfiles.get(user.username);
            if (profile) {
                profile.lastSeen = new Date();
                profile.totalTime = (profile.totalTime || 0) + (Date.now() - user.joinTime.getTime());
                userProfiles.set(user.username, profile);
            }
            
            // Retirer l'utilisateur de la liste de frappe
            if (typingUsers.has(socket.id)) {
                typingUsers.delete(socket.id);
                updateTypingIndicator();
            }
            
            // Retirer l'utilisateur
            connectedUsers.delete(socket.id);
            updateUsersList();
            
            console.log(`👋 ${user.username} a quitté le chat (${reason}) - ${connectedUsers.size} utilisateurs restants`);
        }
    });

    // Gestion des erreurs de socket
    socket.on('error', (error) => {
        console.error(`⛔ Erreur socket ${socket.id}:`, error);
    });
});

// Fonctions utilitaires
function addToHistory(message) {
    chatHistory.push(message);
    // Limiter l'historique
    if (chatHistory.length > MAX_HISTORY) {
        chatHistory = chatHistory.slice(-MAX_HISTORY);
    }
}

function updateUsersList() {
    const usersList = Array.from(connectedUsers.values()).map(user => ({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        joinTime: user.joinTime,
        lastActivity: user.lastActivity
    }));
    
    io.emit('users_update', {
        count: connectedUsers.size,
        users: usersList
    });
}

function updateTypingIndicator() {
    const now = Date.now();
    // Supprimer les utilisateurs qui tapent depuis plus de 5 secondes
    const activeTypers = [];
    
    typingUsers.forEach((data, socketId) => {
        if (now - data.timestamp < 5000 && connectedUsers.has(socketId)) {
            activeTypers.push(data.username);
        } else {
            typingUsers.delete(socketId);
        }
    });
    
    io.emit('typing_update', { users: activeTypers });
}

// Tâches de maintenance périodiques
setInterval(() => {
    // Nettoyer les indicateurs de frappe expirés
    updateTypingIndicator();
    
    // Nettoyer les utilisateurs inactifs (optionnel)
    const now = Date.now();
    connectedUsers.forEach((user, socketId) => {
        if (now - user.lastActivity.getTime() > 30 * 60 * 1000) { // 30 minutes
            console.log(`⏰ Utilisateur inactif déconnecté: ${user.username}`);
            const socket = io.sockets.sockets.get(socketId);
            if (socket) socket.disconnect(true);
        }
    });
}, 60000); // Chaque minute

// Nettoyage des fichiers une fois par jour
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);

// Affichage des statistiques serveur
setInterval(() => {
    if (connectedUsers.size > 0) {
        const memUsage = process.memoryUsage();
        console.log(`📊 Stats: ${connectedUsers.size} utilisateurs, ${chatHistory.length} messages, RAM: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
    }
}, 300000); // Toutes les 5 minutes

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`🚀 ChatRoom Server v2.0 démarré !`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 Host: ${HOST}`);
    console.log(`📁 Uploads: ${uploadDir}`);
    console.log(`⚡ Environnement: ${process.env.NODE_ENV || 'development'}`);
    
    // Nettoyage initial des anciens fichiers
    cleanupOldFiles();
});

// Gestion des erreurs serveur
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} déjà utilisé`);
        process.exit(1);
    } else {
        console.error('⛔ Erreur serveur:', error);
    }
});

// Gestion propre de l'arrêt
function gracefulShutdown(signal) {
    console.log(`\n🛑 Signal ${signal} reçu, arrêt propre du serveur...`);
    
    // Notifier tous les clients
    io.emit('system_message', {
        type: 'system',
        message: 'Le serveur va redémarrer dans quelques instants...',
        timestamp: new Date(),
        id: messageId++
    });
    
    // Fermer le serveur
    server.close(() => {
        console.log('✅ Serveur arrêté proprement');
        process.exit(0);
    });
    
    // Forcer l'arrêt après 10 secondes
    setTimeout(() => {
        console.log('⏰ Arrêt forcé');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
    console.error('💥 Erreur non capturée:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Promesse rejetée:', reason);
    // Ne pas arrêter le serveur pour les promesses rejetées
});
