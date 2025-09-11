const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Servir les fichiers statiques depuis la racine (pas de dossier public)
app.use(express.static(__dirname));

// Variables pour stocker les données
let connectedUsers = new Map(); // socketId -> userData
let chatHistory = []; // Historique des messages
const MAX_HISTORY = 100; // Limite de l'historique

// Route principale - servir index.html depuis la racine
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route de santé pour Render
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        users: connectedUsers.size,
        messages: chatHistory.length 
    });
});

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
    console.log(`🔱 Nouvelle connexion: ${socket.id}`);

    // Envoi de l'historique des messages au nouveau client
    socket.emit('chat_history', chatHistory);

    // Connexion d'un utilisateur
    socket.on('user_join', (userData) => {
        const { username } = userData;
        
        // Vérifier si le pseudo est déjà pris
        const existingUser = Array.from(connectedUsers.values()).find(user => user.username === username);
        if (existingUser) {
            socket.emit('username_taken', { message: 'Ce pseudo est déjà pris!' });
            return;
        }

        // Ajouter l'utilisateur
        const userInfo = {
            id: socket.id,
            username: username,
            joinTime: new Date(),
            ip: socket.request.connection.remoteAddress || 'unknown'
        };
        
        connectedUsers.set(socket.id, userInfo);

        // Notifier tous les clients
        const joinMessage = {
            type: 'system',
            message: `${username} a rejoint le chat`,
            timestamp: new Date(),
            id: Date.now()
        };
        
        addToHistory(joinMessage);
        io.emit('system_message', joinMessage);
        
        // Envoyer la liste des utilisateurs connectés
        updateUsersList();
        
        console.log(`👤 ${username} a rejoint le chat (${connectedUsers.size} utilisateurs)`);
    });

    // Réception d'un message
    socket.on('send_message', (messageData) => {
        const user = connectedUsers.get(socket.id);
        if (!user) {
            socket.emit('error', { message: 'Vous devez d\'abord vous connecter' });
            return;
        }

        const message = {
            type: 'user',
            id: Date.now() + Math.random(),
            username: user.username,
            content: messageData.content.trim(),
            timestamp: new Date(),
            userId: socket.id
        };

        // Validation du message
        if (!message.content || message.content.length > 500) {
            socket.emit('error', { message: 'Message invalide ou trop long' });
            return;
        }

        // Ajouter à l'historique et diffuser
        addToHistory(message);
        io.emit('new_message', message);
        
        console.log(`💬 [${user.username}]: ${message.content}`);
    });

    // Demande de la liste des utilisateurs
    socket.on('get_users', () => {
        updateUsersList();
    });

    // Déconnexion
    socket.on('disconnect', () => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            // Message de départ
            const leaveMessage = {
                type: 'system',
                message: `${user.username} a quitté le chat`,
                timestamp: new Date(),
                id: Date.now()
            };
            
            addToHistory(leaveMessage);
            io.emit('system_message', leaveMessage);
            
            // Retirer l'utilisateur
            connectedUsers.delete(socket.id);
            updateUsersList();
            
            console.log(`👋 ${user.username} a quitté le chat (${connectedUsers.size} utilisateurs)`);
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
        username: user.username,
        joinTime: user.joinTime
    }));
    
    io.emit('users_update', {
        count: connectedUsers.size,
        users: usersList
    });
}

// Affichage des statistiques serveur toutes les 30 secondes
setInterval(() => {
    if (connectedUsers.size > 0) {
        console.log(`📊 Stats: ${connectedUsers.size} utilisateurs connectés, ${chatHistory.length} messages en historique`);
    }
}, 30000);

// Démarrage du serveur
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Serveur de chat démarré sur le port ${PORT}`);
    console.log(`🌐 Serveur accessible sur Render !`);
});

// Gestion des erreurs serveur
server.on('error', (error) => {
    console.error('⛔ Erreur serveur:', error);
});

// Gestion propre de l'arrêt
process.on('SIGINT', () => {
    console.log('\n🛑 Arrêt du serveur...');
    server.close(() => {
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Arrêt du serveur...');
    server.close(() => {
        process.exit(0);
    });
});
