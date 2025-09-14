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
    },
    pingTimeout: 60000,
    pingInterval: 25000
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
let serverStats = {
    totalMessages: 0,
    totalUploads: 0,
    totalConnections: 0,
    startTime: new Date()
};

// Stockage temporaire des réactions emoji sur les images (messageId -> {emoji: [usernames]})
let imageReactions = {};

// Fonction de logging améliorée
function logActivity(type, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logColors = {
        'CONNECTION': '\x1b[32m', // Vert
        'DISCONNECTION': '\x1b[31m', // Rouge
        'MESSAGE': '\x1b[36m', // Cyan
        'REPLY': '\x1b[35m', // Magenta
        'UPLOAD': '\x1b[33m', // Jaune
        'SYSTEM': '\x1b[34m', // Bleu
        'ERROR': '\x1b[31m', // Rouge
        'TYPING': '\x1b[90m', // Gris
        'PROFILE': '\x1b[95m' // Rose
    };
    
    const color = logColors[type] || '\x1b[37m';
    const resetColor = '\x1b[0m';
    
    console.log(`${color}[${timestamp}] ${type}:${resetColor} ${message}`);
    
    if (Object.keys(data).length > 0) {
        console.log(`${color}  └─ Données:${resetColor}`, JSON.stringify(data, null, 2));
    }
}

// Fonction utilitaire pour nettoyer les anciens fichiers
function cleanupOldFiles() {
    try {
        const files = fs.readdirSync(uploadDir);
        const now = Date.now();
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 jours
        let cleanedCount = 0;
        
        files.forEach(file => {
            const filePath = path.join(uploadDir, file);
            const stats = fs.statSync(filePath);
            
            if (now - stats.mtime.getTime() > maxAge) {
                fs.unlinkSync(filePath);
                cleanedCount++;
            }
        });
        
        if (cleanedCount > 0) {
            logActivity('SYSTEM', `Nettoyage automatique: ${cleanedCount} fichiers supprimés`);
        }
    } catch (error) {
        logActivity('ERROR', 'Erreur lors du nettoyage des fichiers', { error: error.message });
    }
}

// Routes
app.get('/', (req, res) => {
    logActivity('SYSTEM', `Page d'accueil visitée depuis ${req.ip}`);
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour l'upload de fichiers
app.post('/upload', (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            logActivity('ERROR', 'Erreur Multer lors de l\'upload', { 
                error: err.message, 
                code: err.code,
                ip: req.ip 
            });
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'Fichier trop volumineux (max 10MB)' });
            }
            return res.status(400).json({ error: `Erreur d'upload: ${err.message}` });
        } else if (err) {
            logActivity('ERROR', 'Erreur générique lors de l\'upload', { 
                error: err.message,
                ip: req.ip 
            });
            return res.status(400).json({ error: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier uploadé' });
        }
        
        serverStats.totalUploads++;
        logActivity('UPLOAD', `Fichier uploadé avec succès`, {
            filename: req.file.originalname,
            size: `${Math.round(req.file.size / 1024)}KB`,
            mimetype: req.file.mimetype,
            ip: req.ip,
            totalUploads: serverStats.totalUploads
        });
        
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
            logActivity('ERROR', 'Erreur upload avatar', { 
                error: err.message, 
                code: err.code,
                ip: req.ip 
            });
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'Image trop volumineuse (max 5MB)' });
            }
            return res.status(400).json({ error: `Erreur d'upload: ${err.message}` });
        } else if (err) {
            logActivity('ERROR', 'Erreur générique upload avatar', { 
                error: err.message,
                ip: req.ip 
            });
            return res.status(400).json({ error: err.message });
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'Aucune image uploadée' });
        }
        
        logActivity('PROFILE', `Avatar uploadé`, {
            filename: req.file.originalname,
            size: `${Math.round(req.file.size / 1024)}KB`,
            ip: req.ip
        });
        
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
        logActivity('SYSTEM', `Téléchargement de fichier`, {
            filename: filename,
            ip: req.ip
        });
        res.download(filepath);
    } else {
        logActivity('ERROR', `Tentative de téléchargement de fichier inexistant`, {
            filename: filename,
            ip: req.ip
        });
        res.status(404).json({ error: 'Fichier non trouvé' });
    }
});

// Route de santé pour Render avec stats détaillées
app.get('/health', (req, res) => {
    const uptime = Math.floor(process.uptime());
    const memUsage = process.memoryUsage();
    
    const healthData = {
        status: 'OK',
        uptime: `${Math.floor(uptime / 60)}min ${uptime % 60}s`,
        users: connectedUsers.size,
        messages: chatHistory.length,
        totalMessages: serverStats.totalMessages,
        totalUploads: serverStats.totalUploads,
        totalConnections: serverStats.totalConnections,
        memory: {
            used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
            total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`
        },
        startTime: serverStats.startTime
    };
    
    logActivity('SYSTEM', `Vérification de santé depuis ${req.ip}`, {
        currentUsers: connectedUsers.size,
        totalMessages: serverStats.totalMessages
    });
    
    res.status(200).json(healthData);
});

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    serverStats.totalConnections++;
    
    logActivity('CONNECTION', `Nouvelle connexion Socket.IO`, {
        socketId: socket.id,
        ip: clientIp,
        totalConnections: serverStats.totalConnections
    });

    // Envoi de l'historique des messages au nouveau client
    socket.emit('chat_history', chatHistory);
    // Envoi des réactions emoji sur images à la connexion
    socket.emit('image_reactions', imageReactions);
    logActivity('SYSTEM', `Historique envoyé`, {
        socketId: socket.id,
        messagesCount: chatHistory.length
    });
    // Synchronisation des réactions emoji sur images
    socket.on('add_image_reaction', ({ messageId, emoji, username }) => {
        if (!messageId || !emoji || !username) return;
        if (!imageReactions[messageId]) imageReactions[messageId] = {};
        if (!imageReactions[messageId][emoji]) imageReactions[messageId][emoji] = [];
        // Empêche le spam : un utilisateur ne peut réagir qu'une fois par emoji par image
        if (!imageReactions[messageId][emoji].includes(username)) {
            imageReactions[messageId][emoji].push(username);
            io.emit('image_reaction_update', { messageId, emoji, users: imageReactions[messageId][emoji] });
            logActivity('MESSAGE', `Réaction emoji ajoutée`, { messageId, emoji, username });
        }
    });

    // Connexion d'un utilisateur
    socket.on('user_join', (userData) => {
        try {
            const { username, avatar } = userData;
            
            // Validation
            if (!username || typeof username !== 'string' || username.trim().length === 0) {
                logActivity('ERROR', `Tentative de connexion avec nom invalide`, {
                    socketId: socket.id,
                    ip: clientIp,
                    providedUsername: username
                });
                socket.emit('error', { message: 'Nom d\'utilisateur invalide' });
                return;
            }
            
            const cleanUsername = username.trim().substring(0, 20);
            
            // Vérifier si le pseudo est déjà pris
            const existingUser = Array.from(connectedUsers.values()).find(user => 
                user.username.toLowerCase() === cleanUsername.toLowerCase()
            );
            
            if (existingUser) {
                logActivity('ERROR', `Tentative d'utilisation d'un pseudo déjà pris`, {
                    socketId: socket.id,
                    username: cleanUsername,
                    ip: clientIp,
                    existingSocketId: existingUser.id
                });
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
                lastActivity: new Date(),
                messagesCount: 0,
                repliesCount: 0
            };
            
            connectedUsers.set(socket.id, userInfo);

            // Sauvegarder le profil
            const existingProfile = userProfiles.get(cleanUsername) || {};
            userProfiles.set(cleanUsername, {
                username: cleanUsername,
                avatar: userInfo.avatar,
                lastSeen: new Date(),
                joinCount: (existingProfile.joinCount || 0) + 1,
                totalMessages: existingProfile.totalMessages || 0,
                totalReplies: existingProfile.totalReplies || 0
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
            
            logActivity('CONNECTION', `Utilisateur rejoint le chat`, {
                username: cleanUsername,
                socketId: socket.id,
                hasAvatar: !!avatar,
                ip: clientIp,
                totalUsers: connectedUsers.size,
                joinCount: userProfiles.get(cleanUsername).joinCount
            });
            
        } catch (error) {
            logActivity('ERROR', 'Erreur lors de la connexion utilisateur', {
                error: error.message,
                stack: error.stack,
                socketId: socket.id,
                ip: clientIp
            });
            socket.emit('error', { message: 'Erreur lors de la connexion' });
        }
    });

    // Réception d'un message
    socket.on('send_message', (messageData) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) {
                logActivity('ERROR', `Message reçu d'un utilisateur non connecté`, {
                    socketId: socket.id,
                    ip: clientIp
                });
                socket.emit('error', { message: 'Vous devez d\'abord vous connecter' });
                return;
            }

            // Mettre à jour la dernière activité
            user.lastActivity = new Date();
            user.messagesCount++;

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
                logActivity('ERROR', `Message vide reçu`, {
                    username: user.username,
                    socketId: socket.id
                });
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

            // Compter les réponses
            if (message.replyTo) {
                user.repliesCount++;
                const profile = userProfiles.get(user.username);
                if (profile) {
                    profile.totalReplies = (profile.totalReplies || 0) + 1;
                    userProfiles.set(user.username, profile);
                }
                
                logActivity('REPLY', `Réponse envoyée`, {
                    username: user.username,
                    replyToUsername: message.replyTo.username,
                    content: message.content || '[Pièce jointe]',
                    userRepliesCount: user.repliesCount
                });
            } else {
                logActivity('MESSAGE', `Message envoyé`, {
                    username: user.username,
                    content: message.content || '[Pièce jointe]',
                    hasAttachment: !!message.attachment,
                    userMessagesCount: user.messagesCount
                });
            }

            // Mettre à jour les statistiques du profil
            const profile = userProfiles.get(user.username);
            if (profile) {
                profile.totalMessages = (profile.totalMessages || 0) + 1;
                profile.lastActivity = new Date();
                userProfiles.set(user.username, profile);
            }

            // Ajouter à l'historique et diffuser
            addToHistory(message);
            io.emit('new_message', message);
            serverStats.totalMessages++;
            
            // Arrêter l'indicateur de frappe pour cet utilisateur
            if (typingUsers.has(socket.id)) {
                typingUsers.delete(socket.id);
                updateTypingIndicator();
            }
            
        } catch (error) {
            logActivity('ERROR', 'Erreur lors de l\'envoi du message', {
                error: error.message,
                stack: error.stack,
                socketId: socket.id,
                username: connectedUsers.get(socket.id)?.username || 'Inconnu'
            });
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
            
            logActivity('TYPING', `Début de frappe`, {
                username: user.username,
                typingUsersCount: typingUsers.size
            });
        }
    });

    socket.on('typing_stop', () => {
        const user = connectedUsers.get(socket.id);
        if (typingUsers.has(socket.id)) {
            typingUsers.delete(socket.id);
            updateTypingIndicator();
            
            if (user) {
                logActivity('TYPING', `Arrêt de frappe`, {
                    username: user.username,
                    typingUsersCount: typingUsers.size
                });
            }
        }
    });

    // Mise à jour du profil utilisateur
    socket.on('update_profile', (profileData) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) return;

            // Mettre à jour l'avatar
            if (profileData.avatar && typeof profileData.avatar === 'string') {
                const oldAvatar = user.avatar;
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
                
                logActivity('PROFILE', `Profil mis à jour`, {
                    username: user.username,
                    oldAvatar: oldAvatar ? 'Oui' : 'Non',
                    newAvatar: 'Oui'
                });
            }
        } catch (error) {
            logActivity('ERROR', 'Erreur mise à jour profil', {
                error: error.message,
                socketId: socket.id,
                username: connectedUsers.get(socket.id)?.username || 'Inconnu'
            });
            socket.emit('error', { message: 'Erreur lors de la mise à jour du profil' });
        }
    });

    // Demande de la liste des utilisateurs
    socket.on('get_users', () => {
        const user = connectedUsers.get(socket.id);
        logActivity('SYSTEM', `Liste des utilisateurs demandée`, {
            username: user?.username || 'Inconnu',
            currentUsersCount: connectedUsers.size
        });
        updateUsersList();
    });

    // Ping pour maintenir la connexion active
    socket.on('ping', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            user.lastActivity = new Date();
            socket.emit('pong');
            
            // Log uniquement si on veut du debug très détaillé
            // logActivity('SYSTEM', `Ping reçu de ${user.username}`);
        }
    });

    // Déconnexion
    socket.on('disconnect', (reason) => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            const sessionDuration = Date.now() - user.joinTime.getTime();
            
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
                profile.totalTime = (profile.totalTime || 0) + sessionDuration;
                profile.lastSessionMessages = user.messagesCount;
                profile.lastSessionReplies = user.repliesCount;
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
            
            logActivity('DISCONNECTION', `Utilisateur déconnecté`, {
                username: user.username,
                reason: reason,
                sessionDuration: `${Math.floor(sessionDuration / 1000)}s`,
                messagesInSession: user.messagesCount,
                repliesInSession: user.repliesCount,
                remainingUsers: connectedUsers.size
            });
        } else {
            logActivity('DISCONNECTION', `Socket déconnecté sans utilisateur associé`, {
                socketId: socket.id,
                reason: reason
            });
        }
    });

    // Gestion des erreurs de socket
    socket.on('error', (error) => {
        const user = connectedUsers.get(socket.id);
        logActivity('ERROR', `Erreur socket`, {
            socketId: socket.id,
            username: user?.username || 'Inconnu',
            error: error.message,
            ip: clientIp
        });
    });
});

// Fonctions utilitaires
function addToHistory(message) {
    chatHistory.push(message);
    // Limiter l'historique
    if (chatHistory.length > MAX_HISTORY) {
        const removed = chatHistory.length - MAX_HISTORY;
        chatHistory = chatHistory.slice(-MAX_HISTORY);
        logActivity('SYSTEM', `Historique tronqué: ${removed} messages supprimés`);
    }
    // Nettoyer les réactions d'images pour les messages supprimés de l'historique
    const validIds = new Set(chatHistory.map(m => m.id));
    Object.keys(imageReactions).forEach(mid => { if (!validIds.has(Number(mid))) delete imageReactions[mid]; });
}

function updateUsersList() {
    const usersList = Array.from(connectedUsers.values()).map(user => ({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        joinTime: user.joinTime,
        lastActivity: user.lastActivity,
        messagesCount: user.messagesCount,
        repliesCount: user.repliesCount
    }));
    
    io.emit('users_update', {
        count: connectedUsers.size,
        users: usersList
    });
    
    logActivity('SYSTEM', `Liste des utilisateurs mise à jour`, {
        totalUsers: connectedUsers.size,
        activeUsers: usersList.map(u => u.username)
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
    
    if (activeTypers.length > 0) {
        logActivity('TYPING', `Indicateur de frappe mis à jour`, {
            activeTypers: activeTypers
        });
    }
}

// Tâches de maintenance périodiques
setInterval(() => {
    // Nettoyer les indicateurs de frappe expirés
    const beforeCount = typingUsers.size;
    updateTypingIndicator();
    const afterCount = typingUsers.size;
    
    if (beforeCount > afterCount) {
        logActivity('SYSTEM', `Nettoyage indicateurs de frappe expirés`, {
            removed: beforeCount - afterCount
        });
    }
    
    // Nettoyer les utilisateurs inactifs (optionnel)
    const now = Date.now();
    const inactiveUsers = [];
    connectedUsers.forEach((user, socketId) => {
        if (now - user.lastActivity.getTime() > 30 * 60 * 1000) { // 30 minutes
            inactiveUsers.push({username: user.username, socketId});
            const socket = io.sockets.sockets.get(socketId);
            if (socket) socket.disconnect(true);
        }
    });
    
    if (inactiveUsers.length > 0) {
        logActivity('SYSTEM', `Utilisateurs inactifs déconnectés`, {
            count: inactiveUsers.length,
            users: inactiveUsers.map(u => u.username)
        });
    }
}, 60000); // Chaque minute

// Nettoyage des fichiers une fois par jour
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);

// Affichage des statistiques serveur
setInterval(() => {
    if (connectedUsers.size > 0 || serverStats.totalMessages > 0) {
        const memUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        logActivity('SYSTEM', `Statistiques serveur`, {
            utilisateursConnectes: connectedUsers.size,
            totalMessages: serverStats.totalMessages,
            totalUploads: serverStats.totalUploads,
            totalConnexions: serverStats.totalConnections,
            memoire: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
            uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}min`,
            messagesEnHistorique: chatHistory.length,
            utilisateursEnFrappe: typingUsers.size
        });
    }
}, 300000); // Toutes les 5 minutes

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    logActivity('SYSTEM', `ChatRoom Server v2.3 démarré avec succès !`, {
        port: PORT,
        host: HOST,
        uploadsDir: uploadDir,
        environnement: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        memoire: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    });
    
    // Nettoyage initial des anciens fichiers
    cleanupOldFiles();
});

// Gestion des erreurs serveur
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        logActivity('ERROR', `Port ${PORT} déjà utilisé - arrêt du serveur`, {
            port: PORT,
            host: HOST
        });
        process.exit(1);
    } else {
        logActivity('ERROR', 'Erreur serveur critique', {
            error: error.message,
            code: error.code,
            stack: error.stack
        });
    }
});

// Gestion propre de l'arrêt
function gracefulShutdown(signal) {
    logActivity('SYSTEM', `Signal ${signal} reçu - arrêt propre du serveur`, {
        signal: signal,
        utilisateursConnectes: connectedUsers.size,
        totalMessages: serverStats.totalMessages
    });
    
    // Notifier tous les clients
    io.emit('system_message', {
        type: 'system',
        message: 'Le serveur va redémarrer dans quelques instants...',
        timestamp: new Date(),
        id: messageId++
    });
    
    // Sauvegarder les statistiques finales
    const finalStats = {
        totalMessages: serverStats.totalMessages,
        totalUploads: serverStats.totalUploads,
        totalConnections: serverStats.totalConnections,
        uptime: process.uptime(),
        shutdownTime: new Date()
    };
    
    logActivity('SYSTEM', `Statistiques finales du serveur`, finalStats);
    
    // Fermer le serveur
    server.close(() => {
        logActivity('SYSTEM', 'Serveur arrêté proprement');
        process.exit(0);
    });
    
    // Forcer l'arrêt après 10 secondes
    setTimeout(() => {
        logActivity('SYSTEM', 'Arrêt forcé du serveur');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
    logActivity('ERROR', 'Erreur non capturée - arrêt critique', {
        error: error.message,
        stack: error.stack
    });
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    logActivity('ERROR', 'Promesse rejetée non gérée', {
        reason: reason,
        promise: promise
    });
    // Ne pas arrêter le serveur pour les promesses rejetées
});

logActivity('SYSTEM', 'Tous les gestionnaires d\'événements configurés', {
    maxHistoryMessages: MAX_HISTORY,
    uploadDir: uploadDir
});
