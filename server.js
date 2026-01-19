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
    // Autoriser tous les types de fichiers
    cb(null, true);
};

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max
        files: 1
    },
    fileFilter: fileFilter
});

const avatarUpload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max pour les avatars
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
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Servir les fichiers statiques
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Variables pour stocker les données
let connectedUsers = new Map(); // socketId -> userData
let chatHistory = []; // Historique des messages (général - rétrocompatibilité)
const MAX_HISTORY = 500; // Limite de l'historique (augmentée pour persistance)
let typingUsers = new Map(); // socketId -> {username, timestamp}
let userProfiles = new Map(); // username -> profile data
let messageId = 1; // Compteur pour les IDs de messages
let serverStats = {
    totalMessages: 0,
    totalUploads: 0,
    totalConnections: 0,
    startTime: new Date()
};

// === SALONS MULTIPLES (BETA) ===
const AVAILABLE_CHANNELS = ['général', 'présentation', 'jeux', 'musique', 'films', 'random', 'aide'];
let channelHistories = {}; // { channelName: [messages] }
let channelReactions = {}; // { channelName: { messageId: {emoji: [usernames]} } }

// Initialiser les historiques par salon
AVAILABLE_CHANNELS.forEach(ch => {
    channelHistories[ch] = [];
    channelReactions[ch] = {};
});

// Stockage des réactions emoji sur les messages (messageId -> {emoji: [usernames]})
let messageReactions = {};

// Stockage des statuts personnalisés (username -> {status, customText})
let userStatuses = {};

// Liste des admins connectés
let adminUsersList = [];

// === NOUVELLES VARIABLES ADMIN ===
// Configuration du serveur
let serverConfig = {
    isPrivate: false,
    accessCode: '',
    slowMode: 0, // secondes entre les messages (0 = désactivé)
    globalMute: false
};

// Liste des utilisateurs bannis: { identifier: { username, bannedAt, expiresAt, permanent, ip } }
let bannedUsers = new Map();

// Derniers messages par utilisateur (pour slow mode)
let lastMessageTime = new Map(); // socketId -> timestamp

// === SONDAGES ===
let polls = {}; // pollId -> { id, question, options: [{text, votes}], channel, creator, createdAt }
let pollVotes = {}; // pollId -> { username: optionIndex }
let pollIdCounter = 1;

// === MESSAGES PRIVÉS (DM) ===
let dmHistory = {}; // "user1:user2" (trié) -> [messages]

// === FICHIERS DE SAUVEGARDE POUR PERSISTANCE ===
// Pour render.com: créer un Disk persistant et définir RENDER_DISK_PATH=/var/data
// Sinon utilise le dossier local 'data'
const DATA_DIR = process.env.RENDER_DISK_PATH || path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'chat_history.json');
const REACTIONS_FILE = path.join(DATA_DIR, 'reactions.json');
const CHANNELS_FILE = path.join(DATA_DIR, 'channel_histories.json');
const DM_FILE = path.join(DATA_DIR, 'dm_history.json');
const POLLS_FILE = path.join(DATA_DIR, 'polls.json');
const PINNED_FILE = path.join(DATA_DIR, 'pinned.json');

console.log(`📂 Dossier de données: ${DATA_DIR}`);

// Créer le dossier data si nécessaire
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📁 Dossier créé: ${DATA_DIR}`);
}

// === FONCTIONS DE PERSISTANCE ===
// Variable d'environnement: RESET_HISTORY=true pour effacer l'historique au démarrage
const RESET_ON_START = process.env.RESET_HISTORY === 'true';

// Messages épinglés (persistés)
let pinnedMessages = [];

function loadPinnedMessages() {
    try {
        if (fs.existsSync(PINNED_FILE)) {
            const data = fs.readFileSync(PINNED_FILE, 'utf8');
            pinnedMessages = JSON.parse(data) || [];
            console.log(`✅ Messages épinglés chargés: ${pinnedMessages.length}`);
        }
    } catch (error) {
        console.error('❌ Erreur chargement messages épinglés:', error.message);
        pinnedMessages = [];
    }
}

function savePinnedMessages() {
    try {
        fs.writeFileSync(PINNED_FILE, JSON.stringify(pinnedMessages, null, 2));
    } catch (error) {
        console.error('❌ Erreur sauvegarde messages épinglés:', error.message);
    }
}

function loadPersistedData() {
    // Si RESET_HISTORY=true, on efface tout au démarrage
    if (RESET_ON_START) {
        console.log('🗑️ RESET_HISTORY activé - Historique effacé');
        chatHistory = [];
        messageReactions = {};
        channelHistories = {};
        AVAILABLE_CHANNELS.forEach(ch => {
            channelHistories[ch] = [];
            channelReactions[ch] = {};
        });
        messageId = 1;
        saveHistory();
        saveReactions();
        saveChannelHistories();
        pinnedMessages = [];
        savePinnedMessages();
        return;
    }
    
    try {
        // Charger l'historique général (rétrocompatibilité)
        if (fs.existsSync(HISTORY_FILE)) {
            const data = fs.readFileSync(HISTORY_FILE, 'utf8');
            const parsed = JSON.parse(data);
            chatHistory = parsed.messages || [];
            messageId = parsed.lastMessageId || 1;
            console.log(`✅ Historique chargé: ${chatHistory.length} messages`);
            
            // Migrer l'ancien historique vers le salon "général" si les salons sont vides
            if (chatHistory.length > 0 && (!channelHistories['général'] || channelHistories['général'].length === 0)) {
                channelHistories['général'] = chatHistory.map(msg => ({...msg, channel: 'général'}));
                console.log(`📦 Migration de ${chatHistory.length} messages vers le salon #général`);
            }
        } else {
            console.log('📝 Pas d\'historique existant - démarrage à zéro');
        }
        
        // Charger les historiques des salons
        if (fs.existsSync(CHANNELS_FILE)) {
            const data = fs.readFileSync(CHANNELS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (parsed.histories) {
                channelHistories = parsed.histories;
                // S'assurer que tous les salons existent
                AVAILABLE_CHANNELS.forEach(ch => {
                    if (!channelHistories[ch]) channelHistories[ch] = [];
                });
                const totalMessages = Object.values(channelHistories).reduce((sum, arr) => sum + arr.length, 0);
                console.log(`✅ Historiques salons chargés: ${totalMessages} messages total`);
            }
        }
        
        // Charger les réactions
        if (fs.existsSync(REACTIONS_FILE)) {
            const data = fs.readFileSync(REACTIONS_FILE, 'utf8');
            messageReactions = JSON.parse(data) || {};
            console.log(`✅ Réactions chargées: ${Object.keys(messageReactions).length} messages avec réactions`);
        }
    } catch (error) {
        console.error('❌ Erreur lors du chargement des données:', error.message);
    }
}

function saveHistory() {
    try {
        const data = {
            messages: chatHistory,
            lastMessageId: messageId,
            savedAt: new Date().toISOString()
        };
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ Erreur sauvegarde historique:', error.message);
    }
}

function saveChannelHistories() {
    try {
        const data = {
            histories: channelHistories,
            savedAt: new Date().toISOString()
        };
        fs.writeFileSync(CHANNELS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('❌ Erreur sauvegarde salons:', error.message);
    }
}

function saveReactions() {
    try {
        fs.writeFileSync(REACTIONS_FILE, JSON.stringify(messageReactions, null, 2));
    } catch (error) {
        console.error('❌ Erreur sauvegarde réactions:', error.message);
    }
}

// === SAUVEGARDE/CHARGEMENT DMs ===
function saveDMs() {
    try {
        fs.writeFileSync(DM_FILE, JSON.stringify(dmHistory, null, 2));
    } catch (error) {
        console.error('❌ Erreur sauvegarde DMs:', error.message);
    }
}

function loadDMs() {
    try {
        if (fs.existsSync(DM_FILE)) {
            const data = fs.readFileSync(DM_FILE, 'utf8');
            dmHistory = JSON.parse(data);
            const convCount = Object.keys(dmHistory).length;
            console.log(`✅ DMs chargés: ${convCount} conversations`);
        }
    } catch (error) {
        console.error('❌ Erreur chargement DMs:', error.message);
        dmHistory = {};
    }
}

// Charger les DMs au démarrage
loadDMs();

// Charger les données au démarrage
loadPersistedData();
loadPinnedMessages();

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
        const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 jours
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
                return res.status(400).json({ error: 'Fichier trop volumineux (max 100MB)' });
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
                return res.status(400).json({ error: 'Image trop volumineuse (max 10MB)' });
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

// === ROUTE ADMIN POUR RESET L'HISTORIQUE ===
// Utiliser avec: /admin/reset?key=VOTRE_CLE_SECRETE
// Définir ADMIN_KEY dans les variables d'environnement de render.com
app.get('/admin/reset', (req, res) => {
    const adminKey = process.env.ADMIN_KEY || 'docspace2024';
    
    if (req.query.key !== adminKey) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    
    const oldCount = chatHistory.length;
    chatHistory = [];
    messageReactions = {};
    messageId = 1;
    saveHistory();
    saveReactions();
    
    // Notifier tous les clients
    io.emit('system_message', {
        type: 'system',
        message: '🗑️ L\'historique a été effacé par un administrateur',
        timestamp: new Date(),
        id: messageId++
    });
    
    logActivity('ADMIN', 'Historique effacé', { 
        oldMessagesCount: oldCount,
        ip: req.ip 
    });
    
    res.json({ 
        success: true, 
        message: `Historique effacé (${oldCount} messages supprimés)` 
    });
});

// === GEMINI AI API ===
const GEMINI_API_KEY = 'AIzaSyBlf5GI0LHIX82Itz6_18gOFgfIm3_nSqM';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

app.post('/api/gemini', express.json(), async (req, res) => {
    try {
        const { prompt, history } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt requis' });
        }
        
        const systemPrompt = `Tu es GeminiBot, un assistant IA intégré dans DocSpace, une application de chat en temps réel.
Tu es amical, serviable et tu réponds en français.
Tu peux aider avec des questions générales, donner des conseils, expliquer des concepts, écrire du code, raconter des blagues, etc.
Garde tes réponses concises (max 300 mots) car c'est un chat.
Si on te demande qui tu es, dis que tu es GeminiBot, l'IA de DocSpace powered by Google Gemini.
N'utilise pas de markdown complexe, juste du texte simple avec des emojis.`;
        
        const contents = [];
        
        // Ajouter l'historique si présent
        if (history && Array.isArray(history)) {
            history.slice(-10).forEach(msg => {
                contents.push({
                    role: msg.role,
                    parts: [{ text: msg.text }]
                });
            });
        }
        
        // Ajouter le message actuel
        contents.push({
            role: 'user',
            parts: [{ text: systemPrompt + '\n\nQuestion: ' + prompt }]
        });
        
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: contents,
                generationConfig: {
                    temperature: 0.8,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                },
                safetySettings: [
                    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
                ]
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Gemini API Error:', errorData);
            
            // Vérifier si c'est une erreur de quota
            if (errorData.error && errorData.error.status === 'RESOURCE_EXHAUSTED') {
                return res.status(429).json({ 
                    error: 'Quota dépassé', 
                    message: 'Trop de requêtes, réessaie dans 1 minute !',
                    retryAfter: 60
                });
            }
            
            return res.status(500).json({ error: 'Erreur API Gemini', details: errorData });
        }
        
        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const aiResponse = data.candidates[0].content.parts[0].text;
            res.json({ response: aiResponse });
        } else {
            res.status(500).json({ error: 'Format de réponse invalide' });
        }
    } catch (error) {
        console.error('Gemini Server Error:', error);
        res.status(500).json({ error: 'Erreur serveur', message: error.message });
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

    // L'historique sera envoyé après que l'utilisateur se soit identifié (user_join)
    
    // Réactions emoji sur les messages (synchronisées)
    socket.on('reaction', ({ messageId, emoji, action }) => {
        const user = connectedUsers.get(socket.id);
        if (!user || !messageId || !emoji) return;
        
        const username = user.username;
        
        if (!messageReactions[messageId]) {
            messageReactions[messageId] = {};
        }
        if (!messageReactions[messageId][emoji]) {
            messageReactions[messageId][emoji] = [];
        }
        
        const userIndex = messageReactions[messageId][emoji].indexOf(username);
        
        if (action === 'add' && userIndex === -1) {
            messageReactions[messageId][emoji].push(username);
            logActivity('MESSAGE', `Réaction ajoutée`, { messageId, emoji, username });
        } else if (action === 'remove' && userIndex > -1) {
            messageReactions[messageId][emoji].splice(userIndex, 1);
            // Nettoyer si vide
            if (messageReactions[messageId][emoji].length === 0) {
                delete messageReactions[messageId][emoji];
            }
            if (Object.keys(messageReactions[messageId]).length === 0) {
                delete messageReactions[messageId];
            }
            logActivity('MESSAGE', `Réaction retirée`, { messageId, emoji, username });
        }
        
        // Diffuser la mise à jour à tous les clients
        io.emit('reaction_update', { 
            messageId, 
            reactions: messageReactions[messageId] || {} 
        });
        
        // Sauvegarder les réactions
        saveReactions();
    });
    
    // Mise à jour du statut personnalisé
    socket.on('update_status', ({ status, customText }) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        const username = user.username;
        
        // Sauvegarder le statut
        userStatuses[username] = {
            status: status || 'online',
            customText: (customText || '').substring(0, 50),
            lastUpdate: new Date()
        };
        
        // Mettre à jour les données utilisateur
        user.status = status;
        user.customStatus = customText;
        connectedUsers.set(socket.id, user);
        
        logActivity('PROFILE', `Statut mis à jour`, { 
            username, 
            status, 
            customText: customText || '(vide)' 
        });
        
        // Diffuser la mise à jour à tous les clients
        io.emit('status_update', { 
            username, 
            status: userStatuses[username] 
        });
        
        // Mettre à jour la liste des utilisateurs
        updateUsersList();
    });

    // === CHANGEMENT DE PSEUDO EN TEMPS RÉEL ===
    socket.on('change_username', (data) => {
        try {
            const { newUsername } = data;
            const user = connectedUsers.get(socket.id);
            
            if (!user) {
                socket.emit('username_change_error', { message: 'Utilisateur non connecté' });
                return;
            }
            
            const oldUsername = user.username;
            const cleanNewUsername = (newUsername || '').trim().substring(0, 20);
            
            if (!cleanNewUsername || cleanNewUsername.length < 1) {
                socket.emit('username_change_error', { message: 'Pseudo invalide' });
                return;
            }
            
            // Vérifier si le nouveau pseudo est déjà pris
            const existingUser = Array.from(connectedUsers.values()).find(u => 
                u.username.toLowerCase() === cleanNewUsername.toLowerCase() && u.id !== socket.id
            );
            
            if (existingUser) {
                socket.emit('username_change_error', { message: 'Ce pseudo est déjà pris!' });
                return;
            }
            
            // Mettre à jour le pseudo
            user.username = cleanNewUsername;
            connectedUsers.set(socket.id, user);
            
            // Transférer le statut
            if (userStatuses[oldUsername]) {
                userStatuses[cleanNewUsername] = userStatuses[oldUsername];
                delete userStatuses[oldUsername];
            }
            
            // Mettre à jour le profil
            if (userProfiles.has(oldUsername)) {
                const profile = userProfiles.get(oldUsername);
                profile.username = cleanNewUsername;
                userProfiles.set(cleanNewUsername, profile);
                userProfiles.delete(oldUsername);
            }
            
            logActivity('PROFILE', `Pseudo changé`, { 
                oldUsername, 
                newUsername: cleanNewUsername,
                socketId: socket.id 
            });
            
            // Confirmer au client
            socket.emit('username_changed', { 
                oldUsername, 
                newUsername: cleanNewUsername 
            });
            
            // Annoncer à tous
            const changeMessage = {
                type: 'system',
                message: `${oldUsername} a changé son pseudo en ${cleanNewUsername}`,
                timestamp: new Date(),
                id: messageId++
            };
            
            addToHistory(changeMessage);
            io.emit('system_message', changeMessage);
            
            // Mettre à jour la liste
            updateUsersList();
            
        } catch (error) {
            logActivity('ERROR', 'Erreur changement pseudo', { error: error.message });
            socket.emit('username_change_error', { message: 'Erreur lors du changement' });
        }
    });

    // === ACTIONS ADMIN ===
    socket.on('admin_action', (data) => {
        const { password, action, target, value } = data;
        const adminPassword = process.env.ADMIN_PASSWORD || 'IndieGabVR2024';
        
        if (password !== adminPassword) {
            socket.emit('admin_response', { success: false, message: 'Mot de passe incorrect' });
            return;
        }
        
        const adminUser = connectedUsers.get(socket.id);
        const adminName = adminUser ? adminUser.username : 'Admin';
        
        logActivity('ADMIN', `Action admin: ${action}`, { admin: adminName, target, value });
        
        switch (action) {
            case 'kick':
                // Trouver et déconnecter l'utilisateur
                let kickedSocket = null;
                connectedUsers.forEach((user, sid) => {
                    if (user.username.toLowerCase() === target.toLowerCase()) {
                        kickedSocket = io.sockets.sockets.get(sid);
                    }
                });
                
                if (kickedSocket) {
                    kickedSocket.emit('kicked', { message: 'Vous avez été expulsé par un administrateur' });
                    kickedSocket.disconnect(true);
                    socket.emit('admin_response', { success: true, message: `${target} a été expulsé` });
                    
                    const kickMsg = {
                        type: 'system',
                        message: `⚠️ ${target} a été expulsé par un administrateur`,
                        timestamp: new Date(),
                        id: messageId++
                    };
                    addToHistory(kickMsg);
                    io.emit('system_message', kickMsg);
                } else {
                    socket.emit('admin_response', { success: false, message: 'Utilisateur non trouvé' });
                }
                break;
                
            case 'ban':
                // Ban avec durée (0 = permanent)
                const banDuration = data.duration || 0; // en minutes
                let bannedSocket = null;
                let bannedUserInfo = null;
                
                connectedUsers.forEach((user, sid) => {
                    if (user.username.toLowerCase() === target.toLowerCase()) {
                        bannedSocket = io.sockets.sockets.get(sid);
                        bannedUserInfo = user;
                    }
                });
                
                if (bannedSocket || target) {
                    // Créer l'entrée de ban
                    const banIdentifier = target.toLowerCase();
                    const banEntry = {
                        username: target,
                        bannedAt: new Date(),
                        expiresAt: banDuration > 0 ? new Date(Date.now() + banDuration * 60 * 1000) : null,
                        permanent: banDuration === 0,
                        ip: bannedSocket ? bannedSocket.handshake.address : null
                    };
                    
                    bannedUsers.set(banIdentifier, banEntry);
                    
                    // Déconnecter l'utilisateur s'il est connecté
                    if (bannedSocket) {
                        const banDurationText = banDuration === 0 ? 'permanent' : `${banDuration} minutes`;
                        bannedSocket.emit('kicked', { message: `Vous avez été banni (${banDurationText})` });
                        bannedSocket.disconnect(true);
                    }
                    
                    const banDurationText = banDuration === 0 ? 'permanentement' : `pour ${banDuration} minutes`;
                    socket.emit('admin_response', { success: true, message: `${target} a été banni ${banDurationText}` });
                    
                    const banMsg = {
                        type: 'system',
                        message: `🚫 ${target} a été banni ${banDurationText}`,
                        timestamp: new Date(),
                        id: messageId++
                    };
                    addToHistory(banMsg);
                    io.emit('system_message', banMsg);
                    
                    logActivity('ADMIN', `Ban: ${target}`, { admin: adminName, duration: banDuration });
                } else {
                    socket.emit('admin_response', { success: false, message: 'Utilisateur non trouvé' });
                }
                break;
                
            case 'rename':
                // Renommer un utilisateur
                let targetSocket = null;
                let targetUser = null;
                connectedUsers.forEach((user, sid) => {
                    if (user.username.toLowerCase() === target.toLowerCase()) {
                        targetSocket = io.sockets.sockets.get(sid);
                        targetUser = user;
                    }
                });
                
                if (targetUser && value) {
                    const oldName = targetUser.username;
                    targetUser.username = value.substring(0, 20);
                    
                    const renameMsg = {
                        type: 'system',
                        message: `👤 ${oldName} a été renommé en ${value} par un administrateur`,
                        timestamp: new Date(),
                        id: messageId++
                    };
                    addToHistory(renameMsg);
                    io.emit('system_message', renameMsg);
                    
                    if (targetSocket) {
                        targetSocket.emit('force_rename', { newUsername: value });
                    }
                    
                    updateUsersList();
                    socket.emit('admin_response', { success: true, message: `${oldName} renommé en ${value}` });
                } else {
                    socket.emit('admin_response', { success: false, message: 'Utilisateur non trouvé ou valeur manquante' });
                }
                break;
                
            case 'clear_history':
                chatHistory.length = 0;
                Object.keys(messageReactions).forEach(k => delete messageReactions[k]);
                saveHistory();
                saveReactions();
                
                const clearMsg = {
                    type: 'system',
                    message: `🗑️ L'historique a été effacé par un administrateur`,
                    timestamp: new Date(),
                    id: messageId++
                };
                io.emit('system_message', clearMsg);
                io.emit('history_cleared');
                
                socket.emit('admin_response', { success: true, message: 'Historique effacé' });
                break;
                
            case 'broadcast':
                if (value) {
                    const broadcastMsg = {
                        type: 'system',
                        message: `📢 [ADMIN] ${value}`,
                        timestamp: new Date(),
                        id: messageId++
                    };
                    addToHistory(broadcastMsg);
                    io.emit('system_message', broadcastMsg);
                    socket.emit('admin_response', { success: true, message: 'Message diffusé' });
                }
                break;

            case 'pin_message':
                if (data.messageId) {
                    const exists = pinnedMessages.find(m => String(m.id) === String(data.messageId));
                    if (!exists) {
                        pinnedMessages.push({
                            id: data.messageId,
                            username: data.username || 'Utilisateur',
                            content: (data.content || '').substring(0, 200),
                            pinnedAt: new Date()
                        });
                        savePinnedMessages();
                    }
                    io.emit('pinned_update', { pinnedMessages });
                    socket.emit('admin_response', { success: true, message: 'Message épinglé' });
                }
                break;

            case 'unpin_message':
                if (data.messageId) {
                    pinnedMessages = pinnedMessages.filter(m => String(m.id) !== String(data.messageId));
                    savePinnedMessages();
                    io.emit('pinned_update', { pinnedMessages });
                    socket.emit('admin_response', { success: true, message: 'Message désépinglé' });
                }
                break;
            
            // === NOUVELLES ACTIONS ADMIN ===
            case 'set_private':
                serverConfig.isPrivate = !!value;
                socket.emit('admin_response', { 
                    success: true, 
                    message: serverConfig.isPrivate ? 'Serveur en mode privé' : 'Serveur en mode public' 
                });
                logActivity('ADMIN', `Mode serveur: ${serverConfig.isPrivate ? 'privé' : 'public'}`, { admin: adminName });
                break;
            
            case 'set_access_code':
                if (value) {
                    serverConfig.accessCode = value;
                    socket.emit('admin_response', { success: true, message: `Code d'accès défini: ${value}` });
                    logActivity('ADMIN', 'Code d\'accès modifié', { admin: adminName });
                }
                break;
            
            case 'slow_mode':
                serverConfig.slowMode = parseInt(value) || 0;
                const slowModeMsg = {
                    type: 'system',
                    message: serverConfig.slowMode > 0 
                        ? `🐢 Mode lent activé (${serverConfig.slowMode}s entre les messages)`
                        : `🐢 Mode lent désactivé`,
                    timestamp: new Date(),
                    id: messageId++
                };
                io.emit('system_message', slowModeMsg);
                socket.emit('admin_response', { success: true, message: `Mode lent: ${serverConfig.slowMode}s` });
                break;
            
            case 'mute_all':
                serverConfig.globalMute = !serverConfig.globalMute;
                const muteMsg = {
                    type: 'system',
                    message: serverConfig.globalMute 
                        ? `🔇 Tous les utilisateurs sont maintenant mutés`
                        : `🔊 Les utilisateurs peuvent parler à nouveau`,
                    timestamp: new Date(),
                    id: messageId++
                };
                io.emit('system_message', muteMsg);
                socket.emit('admin_response', { 
                    success: true, 
                    message: serverConfig.globalMute ? 'Mute global activé' : 'Mute global désactivé' 
                });
                break;

            case 'unmute_all':
                serverConfig.globalMute = false;
                const unmuteMsg = {
                    type: 'system',
                    message: `🔊 Les utilisateurs peuvent parler à nouveau`,
                    timestamp: new Date(),
                    id: messageId++
                };
                io.emit('system_message', unmuteMsg);
                socket.emit('admin_response', { success: true, message: 'Mute global désactivé' });
                break;
            
            case 'kick_all':
                const kickAllMsg = {
                    type: 'system',
                    message: `👢 Tous les utilisateurs ont été expulsés par un administrateur`,
                    timestamp: new Date(),
                    id: messageId++
                };
                io.emit('system_message', kickAllMsg);
                
                // Expulser tout le monde sauf l'admin actuel
                connectedUsers.forEach((user, sid) => {
                    if (sid !== socket.id) {
                        const targetSocket = io.sockets.sockets.get(sid);
                        if (targetSocket) {
                            targetSocket.emit('kicked', { message: 'Tous les utilisateurs ont été expulsés' });
                            targetSocket.disconnect(true);
                        }
                    }
                });
                socket.emit('admin_response', { success: true, message: 'Tout le monde a été expulsé' });
                break;
            
            case 'restart':
                const restartMsg = {
                    type: 'system',
                    message: `🔄 Le serveur va redémarrer...`,
                    timestamp: new Date(),
                    id: messageId++
                };
                io.emit('system_message', restartMsg);
                io.emit('server_restart');
                socket.emit('admin_response', { success: true, message: 'Redémarrage en cours...' });
                
                // Sauvegarder avant de redémarrer
                saveHistory();
                saveReactions();
                
                setTimeout(() => {
                    process.exit(0); // render.com redémarrera automatiquement
                }, 2000);
                break;
            
            case 'get_stats':
                const uptimeSeconds = Math.floor((new Date() - serverStats.startTime) / 1000);
                socket.emit('server_stats', {
                    connectedUsers: connectedUsers.size,
                    totalMessages: serverStats.totalMessages,
                    totalUploads: serverStats.totalUploads,
                    uptime: uptimeSeconds,
                    isPrivate: serverConfig.isPrivate,
                    slowMode: serverConfig.slowMode
                });
                break;
            
            case 'get_banned_users':
                // Nettoyer les bans expirés
                const now = new Date();
                bannedUsers.forEach((ban, id) => {
                    if (!ban.permanent && new Date(ban.expiresAt) < now) {
                        bannedUsers.delete(id);
                    }
                });
                
                const bannedList = Array.from(bannedUsers.entries()).map(([id, ban]) => ({
                    identifier: id,
                    username: ban.username,
                    bannedAt: ban.bannedAt,
                    expiresAt: ban.expiresAt,
                    permanent: ban.permanent
                }));
                
                socket.emit('banned_users_list', { bannedUsers: bannedList });
                break;
            
            case 'unban':
                if (target) {
                    bannedUsers.delete(target);
                    socket.emit('admin_response', { success: true, message: `${target} a été débanni` });
                    logActivity('ADMIN', `${target} débanni`, { admin: adminName });
                }
                break;
                
            default:
                socket.emit('admin_response', { success: false, message: 'Action non reconnue' });
        }
    });

    // === LOGIN ADMIN ===
    socket.on('admin_login', (data) => {
        const { password, username } = data;
        const adminPassword = process.env.ADMIN_PASSWORD || 'IndieGabVR2024';
        
        if (password === adminPassword && username) {
            // Ajouter à la liste des admins
            if (!adminUsersList.includes(username)) {
                adminUsersList.push(username);
                logActivity('ADMIN', `${username} s'est connecté en tant qu'admin`);
            }
            
            // Broadcaster la liste des admins à tout le monde
            io.emit('admin_list_update', { admins: adminUsersList });
        }
    });

    // === SUPPRESSION DE MESSAGE ===
    socket.on('delete_message', (data) => {
        const { messageId, password } = data;
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        const adminPassword = process.env.ADMIN_PASSWORD || 'IndieGabVR2024';
        const isAdmin = password === adminPassword;
        
        // Trouver le message dans l'historique
        const msgIndex = chatHistory.findIndex(m => m.id == messageId);
        if (msgIndex === -1) {
            socket.emit('admin_response', { success: false, message: 'Message non trouvé' });
            return;
        }
        
        const msg = chatHistory[msgIndex];
        
        // Vérifier les permissions (admin ou propriétaire du message)
        if (!isAdmin && msg.username !== user.username) {
            socket.emit('admin_response', { success: false, message: 'Pas la permission' });
            return;
        }
        
        // Supprimer le message
        chatHistory.splice(msgIndex, 1);
        
        // Supprimer les réactions associées
        if (messageReactions[messageId]) {
            delete messageReactions[messageId];
        }
        
        saveHistory();
        saveReactions();
        
        logActivity('MESSAGE', `Message supprimé`, { 
            messageId, 
            deletedBy: user.username, 
            isAdmin 
        });
        
        // Notifier tous les clients
        io.emit('message_deleted', { messageId });
    });

    // === ÉDITION DE MESSAGE ===
    socket.on('edit_message', (data) => {
        const { messageId, newContent } = data;
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        // Trouver le message dans l'historique
        const msgIndex = chatHistory.findIndex(m => m.id == messageId);
        if (msgIndex === -1) {
            socket.emit('edit_response', { success: false, message: 'Message non trouvé' });
            return;
        }
        
        const msg = chatHistory[msgIndex];
        
        // Vérifier que c'est bien le propriétaire du message
        if (msg.username !== user.username) {
            socket.emit('edit_response', { success: false, message: 'Vous ne pouvez modifier que vos propres messages' });
            return;
        }
        
        // Valider le nouveau contenu
        const cleanContent = (newContent || '').trim().substring(0, 500);
        if (!cleanContent) {
            socket.emit('edit_response', { success: false, message: 'Le message ne peut pas être vide' });
            return;
        }
        
        // Échapper le contenu
        const escapedContent = cleanContent
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        
        // Sauvegarder l'ancien contenu
        const oldContent = msg.content;
        
        // Mettre à jour le message
        msg.content = escapedContent;
        msg.edited = true;
        msg.editedAt = new Date();
        
        saveHistory();
        
        logActivity('MESSAGE', `Message modifié`, { 
            messageId, 
            username: user.username,
            oldContent: oldContent.substring(0, 50),
            newContent: escapedContent.substring(0, 50)
        });
        
        // Notifier tous les clients
        io.emit('message_edited', { 
            messageId, 
            newContent: escapedContent,
            edited: true,
            editedAt: msg.editedAt
        });
        
        socket.emit('edit_response', { success: true, message: 'Message modifié' });
    });

    // Connexion d'un utilisateur
    socket.on('user_join', (userData) => {
        try {
            const { username, avatar, accessCode } = userData;
            
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
            
            // === VÉRIFICATION DU BAN ===
            const banIdentifier = cleanUsername.toLowerCase();
            if (bannedUsers.has(banIdentifier)) {
                const ban = bannedUsers.get(banIdentifier);
                const now = new Date();
                
                // Vérifier si le ban a expiré
                if (!ban.permanent && new Date(ban.expiresAt) < now) {
                    bannedUsers.delete(banIdentifier);
                } else {
                    const remainingTime = ban.permanent ? 'permanent' : 
                        `expire ${new Date(ban.expiresAt).toLocaleString()}`;
                    socket.emit('kicked', { 
                        message: `Vous êtes banni (${remainingTime})` 
                    });
                    logActivity('BLOCKED', `Utilisateur banni tenté de rejoindre`, {
                        username: cleanUsername,
                        ip: clientIp
                    });
                    socket.disconnect(true);
                    return;
                }
            }
            
            // === VÉRIFICATION DU SERVEUR PRIVÉ ===
            if (serverConfig.isPrivate && serverConfig.accessCode) {
                if (accessCode !== serverConfig.accessCode) {
                    socket.emit('access_denied', { 
                        message: 'Ce serveur est privé. Code d\'accès requis.' 
                    });
                    logActivity('BLOCKED', `Accès refusé - serveur privé`, {
                        username: cleanUsername,
                        ip: clientIp
                    });
                    return;
                }
            }
            
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

            // === ENVOYER L'HISTORIQUE AU NOUVEAU CLIENT ===
            // Envoyer TOUT l'historique AVANT le message de bienvenue
            socket.emit('chat_history', chatHistory);
            socket.emit('message_reactions_sync', messageReactions);
            socket.emit('user_statuses_sync', userStatuses);
            socket.emit('admin_list_update', { admins: adminUsersList });
            socket.emit('pinned_update', { pinnedMessages });
            
            logActivity('SYSTEM', `Historique envoyé à ${cleanUsername}`, {
                messagesCount: chatHistory.length,
                reactionsCount: Object.keys(messageReactions).length
            });
            
            // Message de bienvenue (APRES l'historique)
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

    // === GEMINI BOT RESPONSE ===
    socket.on('gemini_response', (data) => {
        try {
            const user = connectedUsers.get(socket.id);
            if (!user) return;
            
            const channel = data.channel || 'général';
            
            const botMessage = {
                type: 'user',
                id: messageId++,
                username: '🤖 GeminiBot',
                avatar: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
                content: data.content,
                timestamp: new Date(),
                userId: 'gemini-bot',
                replyTo: null,
                attachment: null,
                channel: channel,
                isBot: true
            };
            
            // Sauvegarder dans l'historique du salon
            if (!channelHistories[channel]) {
                channelHistories[channel] = [];
            }
            channelHistories[channel].push(botMessage);
            
            // Limiter l'historique
            if (channelHistories[channel].length > 500) {
                channelHistories[channel] = channelHistories[channel].slice(-500);
            }
            
            // Envoyer à tous les utilisateurs du salon
            io.emit('new_message', botMessage);
            
            logActivity('GEMINI', 'Réponse GeminiBot envoyée', {
                channel: channel,
                contentLength: data.content.length,
                requestedBy: user.username
            });
            
        } catch (error) {
            logActivity('ERROR', 'Erreur GeminiBot', { error: error.message });
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
            
            // === VÉRIFICATION MUTE GLOBAL ===
            if (serverConfig.globalMute && !adminUsersList.includes(user.username)) {
                socket.emit('muted', { message: 'Le chat est actuellement en mode silencieux' });
                return;
            }
            
            // === VÉRIFICATION SLOW MODE ===
            if (serverConfig.slowMode > 0 && !adminUsersList.includes(user.username)) {
                const lastTime = lastMessageTime.get(socket.id) || 0;
                const now = Date.now();
                const timeSinceLastMessage = (now - lastTime) / 1000;
                
                if (timeSinceLastMessage < serverConfig.slowMode) {
                    const remainingTime = Math.ceil(serverConfig.slowMode - timeSinceLastMessage);
                    socket.emit('slow_mode_active', { remainingTime });
                    return;
                }
                
                lastMessageTime.set(socket.id, now);
            }

            // Mettre à jour la dernière activité
            user.lastActivity = new Date();
            user.messagesCount++;

            // === GESTION DES SALONS ===
            const channel = messageData.channel || 'général';
            if (!AVAILABLE_CHANNELS.includes(channel)) {
                socket.emit('error', { message: 'Salon invalide' });
                return;
            }

            const message = {
                type: messageData.type || 'user',
                id: messageId++,
                username: user.username,
                avatar: user.avatar,
                content: messageData.content ? messageData.content.trim().substring(0, 500) : '',
                timestamp: new Date(),
                userId: socket.id,
                replyTo: messageData.replyTo || null,
                attachment: messageData.attachment || null,
                channel: channel // Ajouter le salon au message
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

            // Ajouter à l'historique du salon et diffuser
            addToChannelHistory(message, channel);
            addToHistory(message); // Garder aussi dans l'historique global pour rétrocompatibilité
            io.emit('new_message', message);
            serverStats.totalMessages++;
            
            // Sauvegarder l'historique après chaque message
            saveHistory();
            saveChannelHistories();
            
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

    // === CHANGEMENT DE SALON ===
    socket.on('switch_channel', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        const { channel, previousChannel } = data;
        
        if (!AVAILABLE_CHANNELS.includes(channel)) {
            socket.emit('error', { message: 'Salon invalide' });
            return;
        }
        
        // Mettre à jour le salon actuel de l'utilisateur
        user.currentChannel = channel;
        connectedUsers.set(socket.id, user);
        
        // Envoyer l'historique du nouveau salon
        const channelHistory = channelHistories[channel] || [];
        socket.emit('channel_history', { 
            channel: channel,
            messages: channelHistory,
            reactions: messageReactions // Envoyer aussi les réactions
        });
        
        logActivity('SYSTEM', `Changement de salon`, {
            username: user.username,
            from: previousChannel,
            to: channel
        });
    });

    // Indicateur de frappe (avec salon)
    socket.on('typing_start', (data) => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            const channel = data?.channel || user.currentChannel || 'général';
            typingUsers.set(socket.id, {
                username: user.username,
                channel: channel,
                timestamp: Date.now()
            });
            updateTypingIndicator();
            
            // Envoyer la mise à jour du typing par salon à tous
            io.emit('channel_typing_update', getChannelTypingUsers());
        }
    });

    socket.on('typing_stop', () => {
        const user = connectedUsers.get(socket.id);
        if (typingUsers.has(socket.id)) {
            typingUsers.delete(socket.id);
            updateTypingIndicator();
            
            // Envoyer la mise à jour du typing par salon
            io.emit('channel_typing_update', getChannelTypingUsers());
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
            
            // Retirer de la liste des admins
            const adminIndex = adminUsersList.indexOf(user.username);
            if (adminIndex > -1) {
                adminUsersList.splice(adminIndex, 1);
                io.emit('admin_list_update', { admins: adminUsersList });
            }
            
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
    
    // === HANDLERS SONDAGES ===
    socket.on('create_poll', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        const pollId = 'poll_' + pollIdCounter++;
        const poll = {
            id: pollId,
            question: data.question,
            options: data.options.map(text => ({ text, votes: 0 })),
            channel: data.channel || 'général',
            creator: user.username,
            createdAt: new Date()
        };
        
        polls[pollId] = poll;
        pollVotes[pollId] = {};
        
        // Émettre à tous les utilisateurs du même salon
        io.emit('poll_created', poll);
        
        logActivity('POLL', `Sondage créé`, {
            pollId,
            question: data.question,
            creator: user.username,
            channel: poll.channel
        });
    });
    
    socket.on('vote_poll', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        const { pollId, optionIndex } = data;
        const poll = polls[pollId];
        if (!poll) {
            socket.emit('vote_response', { success: false, message: 'Sondage introuvable' });
            return;
        }
        
        // Vérifier si l'utilisateur a déjà voté
        if (pollVotes[pollId] && pollVotes[pollId][user.username] !== undefined) {
            socket.emit('vote_response', { success: false, message: 'Vous avez déjà voté' });
            return;
        }
        
        // Enregistrer le vote
        if (!pollVotes[pollId]) pollVotes[pollId] = {};
        pollVotes[pollId][user.username] = optionIndex;
        poll.options[optionIndex].votes++;
        
        socket.emit('vote_response', { success: true, pollId, optionIndex });
        io.emit('poll_update', poll);
        
        logActivity('POLL', `Vote enregistré`, {
            pollId,
            username: user.username,
            optionIndex
        });
    });
    
    // === HANDLER PROFIL UTILISATEUR ===
    socket.on('get_user_profile', (data) => {
        const targetUsername = data.username;
        
        // Chercher l'utilisateur en ligne
        let targetUser = null;
        let isOnline = false;
        connectedUsers.forEach((u, sid) => {
            if (u.username === targetUsername) {
                targetUser = u;
                isOnline = true;
            }
        });
        
        // Récupérer le profil sauvegardé
        const savedProfile = userProfiles.get(targetUsername) || {};
        
        // Déterminer le statut
        let status = 'offline';
        if (isOnline) {
            status = userStatuses[targetUsername]?.status || 'online';
        }
        
        const profile = {
            username: targetUsername,
            status: status,
            bio: savedProfile.bio || '',
            joinDate: savedProfile.firstJoin || savedProfile.joinedAt,
            messageCount: savedProfile.totalMessages || 0,
            avatar: savedProfile.avatar || (targetUser?.avatar)
        };
        
        socket.emit('user_profile', profile);
    });
    
    // === HANDLERS MESSAGES PRIVÉS (DM) ===
    socket.on('send_dm', (data) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender) return;
        
        const { to, content, attachment } = data;
        if (!to || (!content && !attachment)) return;
        
        // Créer la clé de conversation (triée pour unicité)
        const key = [sender.username, to].sort().join(':');
        
        // Initialiser l'historique si nécessaire
        if (!dmHistory[key]) {
            dmHistory[key] = [];
        }
        
        const message = {
            from: sender.username,
            to: to,
            content: content || '',
            attachment: attachment || null,
            timestamp: new Date()
        };
        
        dmHistory[key].push(message);
        
        // Limiter l'historique DM
        if (dmHistory[key].length > 100) {
            dmHistory[key] = dmHistory[key].slice(-100);
        }
        
        // Trouver le destinataire s'il est connecté
        let recipientSocket = null;
        connectedUsers.forEach((u, sid) => {
            if (u.username === to) {
                recipientSocket = sid;
            }
        });
        
        // Envoyer au destinataire
        if (recipientSocket) {
            io.to(recipientSocket).emit('dm_received', {
                from: sender.username,
                content: content || '',
                attachment: attachment || null,
                timestamp: message.timestamp,
                avatar: sender.avatar
            });
        }
        
        // Sauvegarder les DMs
        saveDMs();
        
        logActivity('DM', `Message privé envoyé`, {
            from: sender.username,
            to: to
        });
    });

    // === INDICATEUR DE FRAPPE DM ===
    socket.on('dm_typing_start', (data) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender) return;
        const { to } = data || {};
        if (!to) return;

        let recipientSocket = null;
        connectedUsers.forEach((u, sid) => {
            if (u.username === to) {
                recipientSocket = sid;
            }
        });

        if (recipientSocket) {
            io.to(recipientSocket).emit('dm_typing', { from: sender.username, isTyping: true });
        }
    });

    socket.on('dm_typing_stop', (data) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender) return;
        const { to } = data || {};
        if (!to) return;

        let recipientSocket = null;
        connectedUsers.forEach((u, sid) => {
            if (u.username === to) {
                recipientSocket = sid;
            }
        });

        if (recipientSocket) {
            io.to(recipientSocket).emit('dm_typing', { from: sender.username, isTyping: false });
        }
    });
    
    // Récupérer la liste des conversations DM de l'utilisateur
    socket.on('get_dm_conversations', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        const conversations = [];
        Object.keys(dmHistory).forEach(key => {
            const users = key.split(':');
            if (users.includes(user.username)) {
                const otherUser = users[0] === user.username ? users[1] : users[0];
                const messages = dmHistory[key];
                const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
                
                conversations.push({
                    username: otherUser,
                    lastMessage: lastMessage ? lastMessage.content.substring(0, 50) : '',
                    lastTimestamp: lastMessage ? lastMessage.timestamp : null,
                    unread: 0 // Pour l'instant pas de système de non-lu
                });
            }
        });
        
        // Trier par date du dernier message
        conversations.sort((a, b) => {
            if (!a.lastTimestamp) return 1;
            if (!b.lastTimestamp) return -1;
            return new Date(b.lastTimestamp) - new Date(a.lastTimestamp);
        });
        
        socket.emit('dm_conversations', conversations);
    });
    
    socket.on('get_dm_history', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        const { username } = data;
        const key = [user.username, username].sort().join(':');
        const history = dmHistory[key] || [];
        
        socket.emit('dm_history', {
            username: username,
            messages: history
        });
    });

    // === HANDLERS MINI-JEUX MULTIJOUEURS ===
    
    // Stocker les parties en cours
    if (!global.activeGames) global.activeGames = new Map();
    if (!global.gameInvites) global.gameInvites = new Map();
    
    // Envoyer une invitation de jeu
    socket.on('game_invite', (data) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender) return;
        
        const { to, gameType } = data;
        
        // Trouver le destinataire
        let recipientSocket = null;
        connectedUsers.forEach((u, sid) => {
            if (u.username === to) {
                recipientSocket = sid;
            }
        });
        
        if (recipientSocket) {
            const inviteId = `${sender.username}-${to}-${Date.now()}`;
            global.gameInvites.set(inviteId, {
                from: sender.username,
                fromSocket: socket.id,
                to: to,
                toSocket: recipientSocket,
                gameType: gameType,
                timestamp: Date.now()
            });
            
            io.to(recipientSocket).emit('game_invite_received', {
                inviteId: inviteId,
                from: sender.username,
                gameType: gameType
            });
            
            socket.emit('game_invite_sent', { to, gameType });
            
            logActivity('GAME', `Invitation de jeu envoyée`, {
                from: sender.username,
                to: to,
                game: gameType
            });
        }
    });
    
    // Accepter une invitation
    socket.on('game_accept', (data) => {
        const { inviteId } = data;
        const invite = global.gameInvites.get(inviteId);
        
        if (!invite) return;
        
        const gameId = `game-${Date.now()}`;
        const game = {
            id: gameId,
            type: invite.gameType,
            players: [
                { username: invite.from, socket: invite.fromSocket },
                { username: invite.to, socket: invite.toSocket }
            ],
            state: initGameState(invite.gameType),
            currentTurn: 0, // Index du joueur dont c'est le tour
            started: Date.now()
        };
        
        global.activeGames.set(gameId, game);
        global.gameInvites.delete(inviteId);
        
        // Notifier les deux joueurs
        io.to(invite.fromSocket).emit('game_start', {
            gameId: gameId,
            gameType: invite.gameType,
            opponent: invite.to,
            yourTurn: true,
            playerIndex: 0
        });
        
        io.to(invite.toSocket).emit('game_start', {
            gameId: gameId,
            gameType: invite.gameType,
            opponent: invite.from,
            yourTurn: false,
            playerIndex: 1
        });
        
        logActivity('GAME', `Partie commencée`, {
            game: invite.gameType,
            players: [invite.from, invite.to]
        });
    });
    
    // Refuser une invitation
    socket.on('game_decline', (data) => {
        const { inviteId } = data;
        const invite = global.gameInvites.get(inviteId);
        
        if (!invite) return;
        
        io.to(invite.fromSocket).emit('game_declined', {
            by: invite.to,
            gameType: invite.gameType
        });
        
        global.gameInvites.delete(inviteId);
    });
    
    // Jouer un coup
    socket.on('game_move', (data) => {
        const { gameId, move } = data;
        const game = global.activeGames.get(gameId);
        
        if (!game) return;
        
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        // Vérifier que c'est bien le tour du joueur
        const playerIndex = game.players.findIndex(p => p.username === user.username);
        if (playerIndex === -1 || playerIndex !== game.currentTurn) return;
        
        // Appliquer le coup selon le type de jeu
        const result = applyGameMove(game, move, playerIndex);
        
        if (result.valid) {
            game.state = result.state;
            game.currentTurn = result.nextTurn;
            
            // Notifier les deux joueurs
            game.players.forEach((p, idx) => {
                io.to(p.socket).emit('game_update', {
                    gameId: gameId,
                    state: game.state,
                    yourTurn: idx === game.currentTurn,
                    lastMove: move,
                    lastMoveBy: user.username,
                    winner: result.winner,
                    draw: result.draw
                });
            });
            
            // Fin de partie
            if (result.winner || result.draw) {
                global.activeGames.delete(gameId);
                logActivity('GAME', `Partie terminée`, {
                    game: game.type,
                    winner: result.winner || 'Égalité'
                });
            }
        }
    });
    
    // Quitter une partie
    socket.on('game_quit', (data) => {
        const { gameId } = data;
        const game = global.activeGames.get(gameId);
        
        if (!game) return;
        
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        // Notifier l'adversaire
        game.players.forEach(p => {
            if (p.username !== user.username) {
                io.to(p.socket).emit('game_opponent_quit', {
                    gameId: gameId,
                    quitter: user.username
                });
            }
        });
        
        global.activeGames.delete(gameId);
    });
});

// Initialiser l'état d'un jeu
function initGameState(gameType) {
    switch (gameType) {
        case 'tictactoe':
            return { board: ['', '', '', '', '', '', '', '', ''] };
        case 'connect4':
            return { board: Array(6).fill(null).map(() => Array(7).fill('')) };
        default:
            return {};
    }
}

// Appliquer un coup
function applyGameMove(game, move, playerIndex) {
    const symbols = ['X', 'O'];
    const colors = ['red', 'yellow'];
    
    switch (game.type) {
        case 'tictactoe': {
            const { index } = move;
            if (game.state.board[index]) {
                return { valid: false };
            }
            
            game.state.board[index] = symbols[playerIndex];
            
            const winner = checkTTTWinner(game.state.board);
            const draw = !winner && !game.state.board.includes('');
            
            return {
                valid: true,
                state: game.state,
                nextTurn: winner || draw ? -1 : (playerIndex + 1) % 2,
                winner: winner ? game.players[playerIndex].username : null,
                draw: draw
            };
        }
        
        case 'connect4': {
            const { col } = move;
            let row = -1;
            for (let r = 5; r >= 0; r--) {
                if (!game.state.board[r][col]) {
                    row = r;
                    break;
                }
            }
            if (row === -1) return { valid: false };
            
            game.state.board[row][col] = colors[playerIndex];
            
            const winner = checkC4Winner(game.state.board, row, col, colors[playerIndex]);
            const draw = !winner && game.state.board[0].every(cell => cell);
            
            return {
                valid: true,
                state: game.state,
                nextTurn: winner || draw ? -1 : (playerIndex + 1) % 2,
                winner: winner ? game.players[playerIndex].username : null,
                draw: draw
            };
        }
        
        default:
            return { valid: false };
    }
}

function checkTTTWinner(board) {
    const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
}

function checkC4Winner(board, row, col, player) {
    const directions = [[0,1], [1,0], [1,1], [1,-1]];
    
    for (const [dr, dc] of directions) {
        let count = 1;
        for (let dir = -1; dir <= 1; dir += 2) {
            for (let i = 1; i < 4; i++) {
                const r = row + dr * i * dir;
                const c = col + dc * i * dir;
                if (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === player) {
                    count++;
                } else break;
            }
        }
        if (count >= 4) return player;
    }
    return null;
}

// Fonctions utilitaires
function addToHistory(message) {
    chatHistory.push(message);
    // Limiter l'historique
    if (chatHistory.length > MAX_HISTORY) {
        const removed = chatHistory.length - MAX_HISTORY;
        chatHistory = chatHistory.slice(-MAX_HISTORY);
        logActivity('SYSTEM', `Historique tronqué: ${removed} messages supprimés`);
        
        // Nettoyer les réactions pour les messages supprimés de l'historique
        const validIds = new Set(chatHistory.map(m => String(m.id)));
        let reactionsRemoved = 0;
        Object.keys(messageReactions).forEach(mid => { 
            if (!validIds.has(mid) && !validIds.has(String(mid))) {
                delete messageReactions[mid];
                reactionsRemoved++;
            }
        });
        if (reactionsRemoved > 0) {
            saveReactions();
        }
    }
}

// === FONCTION POUR HISTORIQUE PAR SALON ===
function addToChannelHistory(message, channel) {
    if (!channelHistories[channel]) {
        channelHistories[channel] = [];
    }
    channelHistories[channel].push(message);
    
    // Limiter l'historique par salon (200 messages max par salon)
    const MAX_CHANNEL_HISTORY = 200;
    if (channelHistories[channel].length > MAX_CHANNEL_HISTORY) {
        channelHistories[channel] = channelHistories[channel].slice(-MAX_CHANNEL_HISTORY);
    }
}

// === FONCTION POUR TYPING PAR SALON ===
function getChannelTypingUsers() {
    const now = Date.now();
    const channelTyping = {};
    
    AVAILABLE_CHANNELS.forEach(ch => {
        channelTyping[ch] = [];
    });
    
    typingUsers.forEach((data, socketId) => {
        if (now - data.timestamp < 5000 && connectedUsers.has(socketId)) {
            const channel = data.channel || 'général';
            if (channelTyping[channel]) {
                channelTyping[channel].push(data.username);
            }
        }
    });
    
    return channelTyping;
}

function updateUsersList() {
    const usersList = Array.from(connectedUsers.values()).map(user => {
        // Récupérer le statut personnalisé s'il existe
        const savedStatus = userStatuses[user.username] || {};
        return {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            joinTime: user.joinTime,
            lastActivity: user.lastActivity,
            messagesCount: user.messagesCount,
            repliesCount: user.repliesCount,
            status: savedStatus.status || 'online',
            customStatus: savedStatus.customText || ''
        };
    });
    
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
    logActivity('SYSTEM', `DocSpace Server v2.3 démarré avec succès !`, {
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

// === NETTOYAGE AUTOMATIQUE DES TYPINGS EXPIRÉS ===
// Vérifie toutes les 2 secondes et nettoie les typings > 5 secondes
setInterval(() => {
    const now = Date.now();
    let hasExpired = false;
    
    typingUsers.forEach((data, socketId) => {
        if (now - data.timestamp > 5000) {
            typingUsers.delete(socketId);
            hasExpired = true;
        }
    });
    
    // Si des typings ont expiré, envoyer la mise à jour
    if (hasExpired) {
        io.emit('channel_typing_update', getChannelTypingUsers());
        updateTypingIndicator();
    }
}, 2000);

// === KEEP-ALIVE AMÉLIORÉ POUR RENDER.COM ===
// Render.com éteint les serveurs inactifs après 15 minutes
// On fait des pings réguliers pour maintenir le serveur actif
const KEEP_ALIVE_INTERVAL = 4 * 60 * 1000; // 4 minutes (plus fréquent)
let keepAliveCount = 0;

// Créer une route /health pour le ping
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        users: connectedUsers.size,
        keepAliveCount: keepAliveCount
    });
});

// Self-ping pour garder le serveur actif
const https = require('https');
function keepAlive() {
    keepAliveCount++;
    const now = new Date().toLocaleTimeString('fr-FR');
    
    // Log moins verbeux (1 sur 5)
    if (keepAliveCount % 5 === 1) {
        console.log(`[${now}] 💓 Keep-alive #${keepAliveCount} - ${connectedUsers.size} utilisateurs connectés`);
    }
    
    // Sur Render, utiliser l'URL publique si disponible
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
        const protocol = renderUrl.startsWith('https') ? https : require('http');
        protocol.get(`${renderUrl}/health`, (res) => {
            // Ping réussi
        }).on('error', (err) => {
            // Ignorer les erreurs silencieusement
        });
    } else {
        // En local, ping localhost
        const PORT = process.env.PORT || 3000;
        require('http').get(`http://localhost:${PORT}/health`, (res) => {
            // Ping réussi
        }).on('error', (err) => {
            // Ignorer les erreurs
        });
    }
}

// Démarrer le keep-alive
setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
keepAlive(); // Premier ping immédiat

console.log(`⏰ Keep-alive configuré: ping toutes les 4 minutes`);
console.log(`🌐 Route /health disponible pour monitoring`);

logActivity('SYSTEM', 'Tous les gestionnaires d\'événements configurés', {
    maxHistoryMessages: MAX_HISTORY,
    uploadDir: uploadDir
});
