const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const PACKAGE_INFO = require('./package.json');
const SERVER_NAME = 'DocSpace Server';
const SERVER_VERSION = PACKAGE_INFO.version || '3.2.8-alpha';

// === FIREBASE REALTIME DATABASE ===
let firebaseDb = null;
let useFirebase = false;

function initFirebase() {
    try {
        const credentialsJson = process.env.FIREBASE_CREDENTIALS;
        if (!credentialsJson) {
            console.log('ℹ️ FIREBASE_CREDENTIALS non défini — mode fichiers locaux');
            return;
        }
        const admin = require('firebase-admin');
        const serviceAccount = JSON.parse(credentialsJson);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
        });
        firebaseDb = admin.database();
        useFirebase = true;
        console.log('✅ Firebase Realtime Database connecté');
    } catch (error) {
        console.error('❌ Erreur Firebase init:', error.message);
        console.log('⚠️ Fallback vers fichiers locaux');
        useFirebase = false;
    }
}
initFirebase();

// Firebase helpers — lecture/écriture avec fallback fichiers locaux
async function fbLoad(key) {
    if (!useFirebase || !firebaseDb) return null;
    try {
        const snapshot = await firebaseDb.ref(key).once('value');
        return snapshot.val();
    } catch (e) {
        console.error(`❌ Firebase load [${key}]:`, e.message);
        return null;
    }
}

function fbSave(key, data) {
    if (!useFirebase || !firebaseDb) return;
    firebaseDb.ref(key).set(data).catch(e => {
        console.error(`❌ Firebase save [${key}]:`, e.message);
    });
}

// Debounced Firebase save — prevents flooding the DB
const _fbSaveTimers = {};
function fbSaveDebounced(key, dataFn, delayMs = 2000) {
    if (!useFirebase || !firebaseDb) return;
    if (_fbSaveTimers[key]) clearTimeout(_fbSaveTimers[key]);
    _fbSaveTimers[key] = setTimeout(() => {
        _fbSaveTimers[key] = null;
        fbSave(key, dataFn());
    }, delayMs);
}

function fbSaveImmediate(key, data) {
    if (_fbSaveTimers[key]) {
        clearTimeout(_fbSaveTimers[key]);
        _fbSaveTimers[key] = null;
    }
    fbSave(key, data);
}

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 45000,
    pingInterval: 25000,
    maxHttpBufferSize: 2e6
});
global.io = io;

// Configuration multer pour les fichiers
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
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

app.use((req, res, next) => {
    const start = Date.now();
    observability.http.requestsTotal += 1;
    observability.http.byPath[req.path] = (observability.http.byPath[req.path] || 0) + 1;

    res.on('finish', () => {
        const statusKey = String(res.statusCode || 0);
        observability.http.byStatus[statusKey] = (observability.http.byStatus[statusKey] || 0) + 1;

        const latency = Date.now() - start;
        observability.http.samples.push(latency);
        if (observability.http.samples.length > 200) observability.http.samples.shift();

        const samples = observability.http.samples;
        if (samples.length > 0) {
            const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
            observability.http.latencyMsAvg = Math.round(avg);

            const sorted = [...samples].sort((a, b) => a - b);
            const p95Index = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
            observability.http.latencyMsP95 = sorted[p95Index];
        }
    });

    next();
});

// Servir les fichiers statiques
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

// Variables pour stocker les données
let connectedUsers = new Map(); // socketId -> userData
let authenticatedSockets = new Set(); // socketIds that completed account auth
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
const SERVER_SESSION_START_MS = Date.now();
let shutdownInProgress = false;
let runtimeSessionCommitted = false;
let serverRuntimeStats = {
    version: 1,
    accumulatedUptimeSeconds: 0,
    boots: 0,
    lastBootAt: null,
    lastShutdownAt: null,
    updatedAt: null
};

// === 3.2.8-alpha: voix SFU / sync multi-device / observabilite ===
const VOICE_RUNTIME_MODE = String(process.env.DOCSPACE_VOICE_MODE || 'p2p').toLowerCase(); // p2p | sfu
const VOICE_SFU_PROVIDER = String(process.env.DOCSPACE_SFU_PROVIDER || 'mediasoup').toLowerCase();
const VOICE_SFU_SIGNALING_URL = process.env.DOCSPACE_SFU_SIGNALING_URL || '';
const VOICE_SFU_PUBLIC_WS = process.env.DOCSPACE_SFU_PUBLIC_WS || '';
const VOICE_FORCE_RELAY = String(process.env.DOCSPACE_FORCE_RELAY || 'false').toLowerCase() === 'true';
const VOICE_STUN_URLS = String(process.env.DOCSPACE_STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
    .split(',').map(v => v.trim()).filter(Boolean);
const VOICE_TURN_URLS = String(process.env.DOCSPACE_TURN_URLS || '')
    .split(',').map(v => v.trim()).filter(Boolean);
const VOICE_TURN_USERNAME = String(process.env.DOCSPACE_TURN_USERNAME || '');
const VOICE_TURN_CREDENTIAL = String(process.env.DOCSPACE_TURN_CREDENTIAL || '');
function getVoiceIceServers() {
    const servers = VOICE_STUN_URLS.map(urls => ({ urls }));
    if (VOICE_TURN_URLS.length && VOICE_TURN_USERNAME && VOICE_TURN_CREDENTIAL) {
        servers.push({ urls: VOICE_TURN_URLS, username: VOICE_TURN_USERNAME, credential: VOICE_TURN_CREDENTIAL });
    }
    return servers;
}

let userSocketIndex = new Map(); // username(lower) -> Set(socketId)
let multiDeviceSyncState = new Map(); // username(lower) -> { updatedAt, byDevice: { deviceId: state } }
let e2eeKeyDirectory = new Map(); // username(lower) -> Map(deviceId -> key metadata)

const observability = {
    startedAt: Date.now(),
    sockets: {
        totalConnections: 0,
        currentTransportConnections: 0,
        currentAuthenticatedUsers: 0,
        disconnections: 0
    },
    http: {
        requestsTotal: 0,
        byStatus: {},
        byPath: {},
        latencyMsAvg: 0,
        latencyMsP95: 0,
        samples: []
    },
    socketEvents: {},
    voice: {
        offers: 0,
        answers: 0,
        iceCandidates: 0,
        reconnectIntents: 0,
        sfuSignals: 0
    },
    runtime: {
        eventLoopLagMs: 0,
        eventLoopLagMsMax: 0
    }
};
let observabilityLastLoopTick = Date.now();

const LIVE_EVENT_DEFAULT_ROTATION_HOURS = 1;
const LIVE_EVENT_DEFAULT_DURATION_MINUTES = 30;
const LIVE_EVENT_MAX_DURATION_MINUTES = 180;
const LIVE_EVENTS_CATALOG = [
    {
        id: 'double_xp_rush',
        icon: '⚡',
        title: 'Double XP Rush',
        description: 'XP des messages x2 pendant une courte periode.',
        messageXpMultiplier: 2
    },
    {
        id: 'night_owl',
        icon: '🌙',
        title: 'Night Owl',
        description: 'Bonus nocturne: XP des messages x1.5.',
        messageXpMultiplier: 1.5
    },
    {
        id: 'creator_spotlight',
        icon: '🎨',
        title: 'Creator Spotlight',
        description: 'Session creative en direct, XP des messages x1.4.',
        messageXpMultiplier: 1.4
    },
    {
        id: 'community_pulse',
        icon: '💬',
        title: 'Community Pulse',
        description: 'Activité communautaire: XP des messages x1.3.',
        messageXpMultiplier: 1.3
    }
];

let liveOpsState = {
    version: 1,
    season: {
        number: 1,
        label: 'Saison 1 - Genesis',
        year: new Date().getFullYear(),
        startedAt: null,
        xpMultiplier: 1
    },
    activeEvent: null,
    autoModeEnabled: true,
    autoRotationHours: LIVE_EVENT_DEFAULT_ROTATION_HOURS,
    bannerDisplayMode: 'dismissible',
    eventRotationMinutes: LIVE_EVENT_DEFAULT_ROTATION_HOURS * 60,
    nextRotationAt: 0,
    updatedAt: null
};

// === SALONS MULTIPLES (BETA) ===
const DEFAULT_CHANNELS = [
    { name: 'général', icon: '#', category: '💬 Discussion' },
    { name: 'présentation', icon: '#', category: '💬 Discussion' },
    { name: 'jeux', icon: '🎮', category: '🎮 Loisirs' },
    { name: 'musique', icon: '🎵', category: '🎮 Loisirs' },
    { name: 'films', icon: '🎬', category: '🎮 Loisirs' },
    { name: 'random', icon: '🎲', category: '💡 Autres' },
    { name: 'aide', icon: '❓', category: '💡 Autres' },
    { name: 'ia', icon: '🤖', category: '🤖 Intelligence Artificielle' }
];
const DEFAULT_VOICE_CHANNELS = [
    { name: 'Vocal Général', icon: '🔊' },
    { name: 'Vocal Gaming', icon: '🎮' },
    { name: 'Vocal Musique', icon: '🎵' }
];

// Channel histories & reactions - initialized after AVAILABLE_CHANNELS (see below)
let channelHistories = {}; // { channelName: [messages] }
let channelReactions = {}; // { channelName: { messageId: {emoji: [usernames]} } }

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

// === BOOKMARKS (Messages sauvegardés) ===
let userBookmarks = {}; // username -> [{ messageId, content, author, channel, timestamp, savedAt }]

// === FRIEND SYSTEM ===
let friendships = {}; // username -> { friends: [username], pending: [username], requests: [username] }

// === LEVELING / XP SYSTEM — XP ONLY + COSMETIC UNLOCKS ===
let userXP = {}; // username -> persistent XP progression

const XP_PER_MESSAGE = 18;
const XP_PER_REACTION = 8;
const XP_LEVEL_BASE = 100;
const DAILY_LOGIN_XP_BONUS = 60;
const DAILY_LOGIN_STREAK_STEP = 15;
const DAILY_LOGIN_STREAK_MAX_BONUS = 90;
const XP_MESSAGE_COOLDOWN_MS = 25000;
const VOICE_PASSIVE_XP_PER_MINUTE = 5;
const VOICE_SPEAKING_EVENT_THROTTLE_MS = 120;
const CUSTOM_THEME_MIN_LEVEL = 20;
const THEME_LEVEL_UNLOCKS = {
    default: 0,
    dark: 0,
    retro: 0,
    bluenight: 2,
    red: 4,
    yellow: 4,
    purple: 4,
    pink: 7,
    'pink-light': 7,
    orange: 10,
    green: 10,
    custom: 20
};

const NAME_EFFECT_ITEMS = {
    name_glow: { minLevel: 3, label: 'Halo lumineux' },
    name_gradient: { minLevel: 7, label: 'Dégradé arc-en-ciel' },
    name_neon: { minLevel: 12, label: 'Néon vibrant' }
};

const DAILY_MISSIONS = {
    messages: { target: 10, rewardXP: 80, label: 'Messages du jour' },
    reactions: { target: 5, rewardXP: 60, label: 'Réactions du jour' },
    voiceMinutes: { target: 10, rewardXP: 100, label: 'Minutes en vocal' }
};

const SEASONAL_QUEST_ROTATION_DAYS = 7;
const SEASONAL_QUEST_POOL = [
    { id: 'season_messages', metric: 'messages', title: 'Sprint messagerie', label: 'Messages saison', baseTarget: 16, targetGrowthPerSeason: 2, rewardXP: 140 },
    { id: 'season_reactions', metric: 'reactions', title: 'Amplificateur social', label: 'Réactions saison', baseTarget: 12, targetGrowthPerSeason: 1, rewardXP: 110 },
    { id: 'season_voice', metric: 'voiceMinutes', title: 'Pulse vocal', label: 'Minutes vocal saison', baseTarget: 20, targetGrowthPerSeason: 2, rewardXP: 170 }
];

const XP_ROLES = [
    { minLevel: 50, key: 'eternal', label: 'Éternel', icon: '👑' },
    { minLevel: 40, key: 'diamond', label: 'Diamant', icon: '💎' },
    { minLevel: 30, key: 'platinum', label: 'Platine', icon: '🏛️' },
    { minLevel: 20, key: 'gold', label: 'Or', icon: '🥇' },
    { minLevel: 10, key: 'silver', label: 'Argent', icon: '🥈' },
    { minLevel: 5, key: 'bronze', label: 'Bronze', icon: '🥉' },
    { minLevel: 0, key: 'rookie', label: 'Recrue', icon: '🛡️' }
];

function buildDailyMissionProgressDefaults() {
    const defaults = {};
    Object.keys(DAILY_MISSIONS).forEach((key) => { defaults[key] = 0; });
    return defaults;
}
function buildDailyMissionCompletedDefaults() {
    const defaults = {};
    Object.keys(DAILY_MISSIONS).forEach((key) => { defaults[key] = false; });
    return defaults;
}
function getRoleForLevel(level) {
    const safeLevel = Math.max(0, Number(level || 0));
    return XP_ROLES.find((role) => safeLevel >= role.minLevel) || XP_ROLES[XP_ROLES.length - 1];
}
function getXPForLevel(level) { return Math.floor(XP_LEVEL_BASE * Math.pow(1.5, level - 1)); }
function getLevelFromXP(xp) {
    let level = 0;
    let totalNeeded = 0;
    const safeXP = Math.max(0, Number(xp || 0));
    while (totalNeeded + getXPForLevel(level + 1) <= safeXP) {
        level++;
        totalNeeded += getXPForLevel(level);
    }
    return { level, currentXP: safeXP - totalNeeded, neededXP: getXPForLevel(level + 1) };
}
function sanitizeNameEffect(effect) {
    const safe = String(effect || 'none').toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAME_EFFECT_ITEMS, safe) ? safe : 'none';
}
function getUnlockedNameEffects(level) {
    const safeLevel = Math.max(0, Number(level || 0));
    const out = {};
    Object.entries(NAME_EFFECT_ITEMS).forEach(([key, def]) => { out[key] = safeLevel >= def.minLevel; });
    return out;
}
function getActiveNameEffect(username) {
    const entry = ensureXPEntry(username);
    const level = getLevelFromXP(entry.xp || 0).level;
    const active = sanitizeNameEffect(entry.activeNameEffect || 'none');
    if (active === 'none') return 'none';
    return level >= NAME_EFFECT_ITEMS[active].minLevel ? active : 'none';
}

function mergeXPEntries(baseEntry, incomingEntry) {
    const base = baseEntry || {};
    const incoming = incomingEntry || {};
    base.xp = Math.max(0, Number(base.xp || 0)) + Math.max(0, Number(incoming.xp || 0));
    base.totalMessages = Math.max(0, Number(base.totalMessages || 0)) + Math.max(0, Number(incoming.totalMessages || 0));
    base.streakDays = Math.max(Number(base.streakDays || 0), Number(incoming.streakDays || 0));
    base.lastXpGain = Math.max(Number(base.lastXpGain || 0), Number(incoming.lastXpGain || 0));
    base.lastReactionXpAt = Math.max(Number(base.lastReactionXpAt || 0), Number(incoming.lastReactionXpAt || 0));
    base.lastLoginDay = base.lastLoginDay || incoming.lastLoginDay || null;
    base.dailyMissionDay = base.dailyMissionDay || incoming.dailyMissionDay || null;
    const progress = { ...buildDailyMissionProgressDefaults(), ...(base.dailyMissionProgress || {}), ...(incoming.dailyMissionProgress || {}) };
    const completed = { ...buildDailyMissionCompletedDefaults(), ...(base.dailyMissionCompleted || {}), ...(incoming.dailyMissionCompleted || {}) };
    Object.keys(DAILY_MISSIONS).forEach((key) => {
        progress[key] = Math.max(0, Number(progress[key] || 0));
        completed[key] = !!completed[key];
    });
    base.dailyMissionProgress = progress;
    base.dailyMissionCompleted = completed;
    base.customTheme = base.customTheme || incoming.customTheme || null;
    const level = getLevelFromXP(base.xp).level;
    const wanted = sanitizeNameEffect(base.activeNameEffect || incoming.activeNameEffect || 'none');
    base.activeNameEffect = wanted !== 'none' && level >= NAME_EFFECT_ITEMS[wanted].minLevel ? wanted : 'none';
    base.level = level;
    return base;
}

function ensureXPEntry(username) {
    if (!userXP[username]) {
        userXP[username] = {
            xp: 0, level: 0, totalMessages: 0, lastXpGain: 0,
            streakDays: 0, lastLoginDay: null, lastReactionXpAt: 0,
            activeNameEffect: 'none', customTheme: null,
            dailyMissionDay: null,
            dailyMissionProgress: buildDailyMissionProgressDefaults(),
            dailyMissionCompleted: buildDailyMissionCompletedDefaults()
        };
    }
    const entry = userXP[username];
    // Migration v3.3.0 consolidée: retirer les anciens champs de monnaie/boutique.
    ['bonusBananas', 'bananas', 'bananaPoints', 'xpBoostUntil', 'reactionBoostUntil',
     'cooldownReducerUntil', 'streakShieldCharges', 'inventory', 'ownedItems',
     'clicker', 'shopPurchases'].forEach((legacyKey) => { delete entry[legacyKey]; });
    entry.xp = Math.max(0, Number(entry.xp || 0));
    entry.level = getLevelFromXP(entry.xp).level;
    entry.totalMessages = Math.max(0, Number(entry.totalMessages || 0));
    entry.lastXpGain = Math.max(0, Number(entry.lastXpGain || 0));
    entry.streakDays = Math.max(0, Number(entry.streakDays || 0));
    entry.lastReactionXpAt = Math.max(0, Number(entry.lastReactionXpAt || 0));
    if (typeof entry.lastLoginDay !== 'string') entry.lastLoginDay = null;
    if (typeof entry.dailyMissionDay !== 'string') entry.dailyMissionDay = null;
    if (!entry.dailyMissionProgress || typeof entry.dailyMissionProgress !== 'object') entry.dailyMissionProgress = buildDailyMissionProgressDefaults();
    if (!entry.dailyMissionCompleted || typeof entry.dailyMissionCompleted !== 'object') entry.dailyMissionCompleted = buildDailyMissionCompletedDefaults();
    Object.keys(DAILY_MISSIONS).forEach((key) => {
        entry.dailyMissionProgress[key] = Math.max(0, Number(entry.dailyMissionProgress[key] || 0));
        entry.dailyMissionCompleted[key] = !!entry.dailyMissionCompleted[key];
    });
    entry.activeNameEffect = sanitizeNameEffect(entry.activeNameEffect || 'none');
    if (entry.activeNameEffect !== 'none' && entry.level < NAME_EFFECT_ITEMS[entry.activeNameEffect].minLevel) entry.activeNameEffect = 'none';
    return entry;
}

function getDayKey(ts = Date.now()) {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
function getPreviousDayKey(ts = Date.now()) { return getDayKey(ts - 24 * 60 * 60 * 1000); }

function buildXPDataPayload(username) {
    const data = ensureXPEntry(username);
    ensureDailyMissionsForEntry(data);
    const levelData = getLevelFromXP(data.xp || 0);
    const role = getRoleForLevel(levelData.level);
    const missionTargets = {};
    const missionRewards = {};
    const missionProgress = {};
    const missionCompleted = {};
    Object.entries(DAILY_MISSIONS).forEach(([key, mission]) => {
        missionTargets[key] = mission.target;
        missionRewards[key] = { xp: mission.rewardXP };
        missionProgress[key] = Number(data.dailyMissionProgress?.[key] || 0);
        missionCompleted[key] = !!data.dailyMissionCompleted?.[key];
    });
    const unlockedNameEffects = getUnlockedNameEffects(levelData.level);
    const themeUnlocks = {};
    Object.entries(THEME_LEVEL_UNLOCKS).forEach(([theme, minLevel]) => {
        themeUnlocks[theme] = levelData.level >= minLevel;
    });
    const unlockedThemes = Object.entries(themeUnlocks).filter(([, unlocked]) => unlocked).map(([theme]) => theme);
    return {
        xp: data.xp || 0,
        ...levelData,
        role,
        totalMessages: data.totalMessages || 0,
        streakDays: data.streakDays || 0,
        activeNameEffect: getActiveNameEffect(username),
        unlockedNameEffects,
        unlockedThemes,
        themeUnlocks,
        customThemeUnlocked: levelData.level >= CUSTOM_THEME_MIN_LEVEL,
        dailyMissions: {
            dayKey: data.dailyMissionDay || getDayKey(),
            targets: missionTargets,
            rewards: missionRewards,
            progress: missionProgress,
            completed: missionCompleted
        },
        seasonalQuests: buildSeasonalQuestsPayload(username),
        customThemeUnlocked: levelData.level >= CUSTOM_THEME_MIN_LEVEL,
        customThemeMinLevel: CUSTOM_THEME_MIN_LEVEL,
        customTheme: data.customTheme || null,
        serverEnv: SERVER_ENV
    };
}

function getMessageCooldownMs() { return XP_MESSAGE_COOLDOWN_MS; }
function ensureDailyMissionsForEntry(entry) {
    const todayKey = getDayKey();
    if (entry.dailyMissionDay !== todayKey) {
        entry.dailyMissionDay = todayKey;
        entry.dailyMissionProgress = buildDailyMissionProgressDefaults();
        entry.dailyMissionCompleted = buildDailyMissionCompletedDefaults();
    } else {
        Object.keys(DAILY_MISSIONS).forEach((key) => {
            entry.dailyMissionProgress[key] = Math.max(0, Number(entry.dailyMissionProgress[key] || 0));
            entry.dailyMissionCompleted[key] = !!entry.dailyMissionCompleted[key];
        });
    }
}
function addRawXP(username, amount) {
    const entry = ensureXPEntry(username);
    const safeAmount = Math.max(0, Math.floor(amount || 0));
    if (safeAmount <= 0) return { gainedXP: 0, levelUp: false, newLevel: getLevelFromXP(entry.xp).level };
    const oldLevel = getLevelFromXP(entry.xp).level;
    entry.xp += safeAmount;
    const newLevelData = getLevelFromXP(entry.xp);
    entry.level = newLevelData.level;
    return { gainedXP: safeAmount, levelUp: newLevelData.level > oldLevel, newLevel: newLevelData.level };
}
function applyMissionProgress(username, deltas = {}) {
    const entry = ensureXPEntry(username);
    ensureDailyMissionsForEntry(entry);
    Object.keys(deltas || {}).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(DAILY_MISSIONS, key)) return;
        entry.dailyMissionProgress[key] = Math.max(0, Number(entry.dailyMissionProgress[key] || 0) + Number(deltas[key] || 0));
    });
    const rewards = [];
    for (const key of Object.keys(DAILY_MISSIONS)) {
        const mission = DAILY_MISSIONS[key];
        if (entry.dailyMissionCompleted[key]) continue;
        if ((entry.dailyMissionProgress[key] || 0) >= mission.target) {
            entry.dailyMissionCompleted[key] = true;
            const xpResult = addRawXP(username, mission.rewardXP);
            rewards.push({ key, label: mission.label, rewardXP: mission.rewardXP, levelUp: xpResult.levelUp, newLevel: xpResult.newLevel });
        }
    }
    return rewards;
}
function emitMissionRewardsToSocket(targetSocket, username, rewards = [], options = {}) {
    if (!targetSocket || !Array.isArray(rewards) || rewards.length === 0) return;
    rewards.forEach((reward) => {
        targetSocket.emit('daily_mission_reward', {
            missionKey: reward.key,
            missionLabel: reward.label,
            rewardXP: reward.rewardXP
        });
        if (reward.levelUp) {
            io.emit('system_message', {
                type: 'system', message: `🎉 ${username} a atteint le niveau ${reward.newLevel} !`, timestamp: new Date(), id: messageId++
            });
        }
    });
    if (options.emitXpData) targetSocket.emit('xp_data', buildXPDataPayload(username));
}

// === REMINDERS ===
let reminders = []; // [{ id, username, message, triggerAt, channel, createdAt }]
let reminderIdCounter = 1;

// === AUTO-MODERATION ===
let autoModConfig = {
    enabled: false,
    spamThreshold: 5, // max messages in spamInterval seconds
    spamInterval: 10, // seconds
    linkFilter: false,
    capsFilter: false, // block messages >80% caps
    wordFilter: [], // banned words
    warnThreshold: 3, // warnings before auto-mute
};
let userWarnings = {}; // username -> { count, lastWarning }
let spamTracker = {}; // username -> [timestamps]

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

// === COMPTES UTILISATEURS ===
let accounts = {}; // username_lower -> { username, passwordHash, salt, createdAt, lastLogin }

// === FICHIERS DE SAUVEGARDE POUR PERSISTANCE ===
// Sur Fly.io les données sont persistées via Firebase
// En local, utilise le dossier 'data'
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'chat_history.json');
const REACTIONS_FILE = path.join(DATA_DIR, 'reactions.json');
const CHANNELS_FILE = path.join(DATA_DIR, 'channel_histories.json');
const DM_FILE = path.join(DATA_DIR, 'dm_history.json');
const POLLS_FILE = path.join(DATA_DIR, 'polls.json');
const PINNED_FILE = path.join(DATA_DIR, 'pinned.json');
const XP_FILE = path.join(DATA_DIR, 'user_xp.json');
const FRIENDS_FILE = path.join(DATA_DIR, 'friendships.json');
const BOOKMARKS_FILE = path.join(DATA_DIR, 'bookmarks.json');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const AUTOMOD_FILE = path.join(DATA_DIR, 'automod.json');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const CHANNEL_CONFIG_FILE = path.join(DATA_DIR, 'channel_config.json');
const SERVER_RUNTIME_FILE = path.join(DATA_DIR, 'server_runtime_stats.json');
const LIVE_EVENTS_FILE = path.join(DATA_DIR, 'live_events_state.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const PRESENCE_HISTORY_FILE = path.join(DATA_DIR, 'presence_history.json');

// === PRESENCE HISTORY (join/leave log) ===
let presenceHistory = []; // [{ username, action: 'join'|'leave', timestamp }]
const MAX_PRESENCE_HISTORY = 500;
function loadPresenceHistory() {
    try {
        if (fs.existsSync(PRESENCE_HISTORY_FILE)) {
            presenceHistory = JSON.parse(fs.readFileSync(PRESENCE_HISTORY_FILE, 'utf8'));
            console.log(`✅ Historique de présence chargé: ${presenceHistory.length} entrées`);
        }
    } catch (e) { console.error('❌ Erreur chargement historique présence:', e.message); presenceHistory = []; }
}
async function loadPresenceHistoryFromFirebase() {
    const data = await fbLoad('presenceHistory');
    if (data) { presenceHistory = Array.isArray(data) ? data : []; console.log(`✅ [FB] Présence chargée: ${presenceHistory.length}`); return true; }
    return false;
}
function savePresenceHistory() {
    try { fs.writeFileSync(PRESENCE_HISTORY_FILE, JSON.stringify(presenceHistory, null, 2)); } catch (e) { console.error('❌ Erreur sauvegarde présence:', e.message); }
    fbSaveDebounced('presenceHistory', () => presenceHistory);
}
function addPresenceEntry(username, action) {
    const entry = { username, action, timestamp: new Date().toISOString() };
    presenceHistory.push(entry);
    if (presenceHistory.length > MAX_PRESENCE_HISTORY) {
        presenceHistory = presenceHistory.slice(-MAX_PRESENCE_HISTORY);
    }
    savePresenceHistory();
    io.emit('presence_history_append', entry);
}

// === SERVER ENVIRONMENT DETECTION ===
const IS_FLY = !!(process.env.FLY_APP_NAME || process.env.FLY_REGION);
const IS_RENDER = !!(process.env.RENDER || process.env.RENDER_EXTERNAL_URL);
const IS_CLOUD = IS_FLY || IS_RENDER;
const SERVER_ENV = IS_FLY ? 'fly' : IS_RENDER ? 'render' : 'local';
const PERF_CONFIG = IS_CLOUD ? {
    maxHistory: 800,
    saveDebounceMs: 3000,
    keepAliveIntervalMs: 4 * 60 * 1000,
    maxPresenceHistory: 300,
    pingIntervalMs: 30000,
    pingTimeoutMs: 60000
} : {
    maxHistory: 2000,
    saveDebounceMs: 1200,
    keepAliveIntervalMs: 10 * 60 * 1000,
    maxPresenceHistory: 500,
    pingIntervalMs: 25000,
    pingTimeoutMs: 60000
};

// Charger ou initialiser la config des salons
let channelConfig = { channels: [...DEFAULT_CHANNELS], voiceChannels: [...DEFAULT_VOICE_CHANNELS], categories: ['💬 Discussion', '🎮 Loisirs', '💡 Autres', '🤖 Intelligence Artificielle'] };
function loadChannelConfig() {
    try {
        if (fs.existsSync(CHANNEL_CONFIG_FILE)) {
            const data = JSON.parse(fs.readFileSync(CHANNEL_CONFIG_FILE, 'utf8'));
            if (data.channels && data.channels.length > 0) channelConfig = data;
            console.log(`✅ Config salons chargée: ${channelConfig.channels.length} text, ${channelConfig.voiceChannels.length} voice`);
        }
    } catch (e) { console.error('❌ Erreur chargement config salons:', e.message); }
}
async function loadChannelConfigFromFirebase() {
    const data = await fbLoad('channelConfig');
    if (data && data.channels && data.channels.length > 0) { channelConfig = data; console.log(`✅ [FB] Config salons chargée: ${channelConfig.channels.length}`); return true; }
    return false;
}
function saveChannelConfig() {
    try { fs.writeFileSync(CHANNEL_CONFIG_FILE, JSON.stringify(channelConfig, null, 2)); } catch (e) { console.error('❌ Erreur sauvegarde config salons:', e.message); }
    fbSave('channelConfig', channelConfig);
}
loadChannelConfig();

// Derive AVAILABLE_CHANNELS and VOICE_CHANNELS from config
let AVAILABLE_CHANNELS = channelConfig.channels.map(c => c.name);
let VOICE_CHANNELS = channelConfig.voiceChannels.map(c => c.name);
let voiceRooms = {};
VOICE_CHANNELS.forEach(vc => {
    voiceRooms[vc] = { participants: new Map() };
});

// Initialiser les historiques par salon
AVAILABLE_CHANNELS.forEach(ch => {
    if (!channelHistories[ch]) channelHistories[ch] = [];
    if (!channelReactions[ch]) channelReactions[ch] = {};
});

console.log(`📂 Dossier de données: ${DATA_DIR}`);

// Créer le dossier data si nécessaire
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`📁 Dossier créé: ${DATA_DIR}`);
}

function normalizeRuntimeStats(data = {}) {
    const accumulated = Number(data.accumulatedUptimeSeconds || 0);
    const boots = Number(data.boots || 0);
    return {
        version: 1,
        accumulatedUptimeSeconds: Number.isFinite(accumulated) && accumulated > 0 ? Math.floor(accumulated) : 0,
        boots: Number.isFinite(boots) && boots > 0 ? Math.floor(boots) : 0,
        lastBootAt: data.lastBootAt || null,
        lastShutdownAt: data.lastShutdownAt || null,
        updatedAt: data.updatedAt || null
    };
}

function getSessionUptimeSeconds() {
    return Math.max(0, Math.floor((Date.now() - SERVER_SESSION_START_MS) / 1000));
}

function getTotalUptimeSeconds() {
    return Math.max(0, Math.floor((serverRuntimeStats.accumulatedUptimeSeconds || 0) + getSessionUptimeSeconds()));
}

function formatDurationShort(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
}

function incrementCounter(bucket, key, amount = 1) {
    if (!bucket || !key) return;
    bucket[key] = (bucket[key] || 0) + amount;
}

function normalizeUsernameKey(username) {
    return String(username || '').trim().toLowerCase();
}

function resolveCanonicalUsername(requested) {
    const raw = String(requested || '').trim();
    const key = normalizeUsernameKey(raw);
    if (!key) return null;

    for (const [, user] of connectedUsers.entries()) {
        if (normalizeUsernameKey(user?.username) === key) return user.username;
    }
    if (typeof accounts === 'object' && accounts) {
        const account = accounts[key];
        if (account?.username) return account.username;
    }
    if (typeof userProfiles !== 'undefined' && userProfiles) {
        for (const [name] of userProfiles.entries()) {
            if (normalizeUsernameKey(name) === key) return name;
        }
    }
    for (const name of Object.keys(friendships || {})) {
        if (normalizeUsernameKey(name) === key) return name;
    }
    for (const name of Object.keys(userXP || {})) {
        if (normalizeUsernameKey(name) === key) return name;
    }
    return null;
}

function getUserAvatarByName(username) {
    const canonical = resolveCanonicalUsername(username) || String(username || '').trim();
    for (const [, user] of connectedUsers.entries()) {
        if (normalizeUsernameKey(user?.username) === normalizeUsernameKey(canonical) && user?.avatar) return user.avatar;
    }
    const profile = userProfiles?.get?.(canonical);
    return profile?.avatar || '';
}

function getSocketsForUsername(username) {
    const key = normalizeUsernameKey(username);
    const set = userSocketIndex.get(key);
    return set ? Array.from(set) : [];
}

function registerUserSocket(username, socketId) {
    const key = normalizeUsernameKey(username);
    if (!key || !socketId) return;
    if (!userSocketIndex.has(key)) userSocketIndex.set(key, new Set());
    userSocketIndex.get(key).add(socketId);
}

function unregisterUserSocket(username, socketId) {
    const key = normalizeUsernameKey(username);
    const set = userSocketIndex.get(key);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) {
        userSocketIndex.delete(key);
    }
}

function upsertE2EEPublicKey(username, deviceId, keyData = {}) {
    const userKey = normalizeUsernameKey(username);
    const safeDeviceId = String(deviceId || '').trim().substring(0, 80);
    if (!userKey || !safeDeviceId) return;

    if (!e2eeKeyDirectory.has(userKey)) {
        e2eeKeyDirectory.set(userKey, new Map());
    }

    const bucket = e2eeKeyDirectory.get(userKey);
    bucket.set(safeDeviceId, {
        deviceId: safeDeviceId,
        fingerprint: String(keyData.fingerprint || '').trim().substring(0, 200),
        publicKey: String(keyData.publicKey || '').trim().substring(0, 6000),
        algorithm: String(keyData.algorithm || 'x25519').trim().substring(0, 60),
        updatedAt: Date.now()
    });
}

function removeE2EEPublicKey(username, deviceId) {
    const userKey = normalizeUsernameKey(username);
    const safeDeviceId = String(deviceId || '').trim().substring(0, 80);
    if (!userKey || !safeDeviceId) return;

    const bucket = e2eeKeyDirectory.get(userKey);
    if (!bucket) return;
    bucket.delete(safeDeviceId);
    if (bucket.size === 0) {
        e2eeKeyDirectory.delete(userKey);
    }
}

function getE2EEPublicKeys(username) {
    const userKey = normalizeUsernameKey(username);
    const bucket = e2eeKeyDirectory.get(userKey);
    if (!bucket) return [];
    return Array.from(bucket.values()).map((entry) => ({
        deviceId: entry.deviceId,
        fingerprint: entry.fingerprint,
        publicKey: entry.publicKey,
        algorithm: entry.algorithm,
        updatedAt: entry.updatedAt
    }));
}

function evictSocketConnection(socketId, options = {}) {
    const user = connectedUsers.get(socketId);
    if (!user) return false;

    // Nettoyer la présence vocale de cette socket pour éviter les "ghost users".
    for (const [roomName, roomData] of Object.entries(voiceRooms || {})) {
        if (!roomData || !roomData.participants || !roomData.participants.has(socketId)) continue;
        roomData.participants.delete(socketId);
        io.emit('voice_participants_update', { room: roomName, participants: getVoiceParticipants(roomName) });
        io.to('voice_' + roomName).emit('voice_peer_left', { socketId });
    }

    if (typingUsers.has(socketId)) {
        typingUsers.delete(socketId);
        updateTypingIndicator();
    }

    connectedUsers.delete(socketId);
    authenticatedSockets.delete(socketId);
    unregisterUserSocket(user.username, socketId);
    removeE2EEPublicKey(user.username, user.deviceId);

    const staleSocket = io.sockets.sockets.get(socketId);
    if (staleSocket) {
        staleSocket.disconnect(true);
    }

    if (!options.skipUsersRefresh) {
        updateUsersList();
    }

    return true;
}

function emitMultiDevicePresence(username) {
    const sockets = getSocketsForUsername(username);
    const payload = {
        username,
        activeDevices: sockets.length,
        updatedAt: Date.now()
    };
    sockets.forEach((socketId) => {
        io.to(socketId).emit('multi_device_presence', payload);
    });
}

setInterval(() => {
    const now = Date.now();
    const lag = Math.max(0, now - observabilityLastLoopTick - 10000);
    observability.runtime.eventLoopLagMs = lag;
    observability.runtime.eventLoopLagMsMax = Math.max(observability.runtime.eventLoopLagMsMax, lag);
    observabilityLastLoopTick = now;
}, 10000);

function saveServerRuntimeStats(options = {}) {
    const includeCurrentSession = options.includeCurrentSession !== false;
    try {
        const payload = normalizeRuntimeStats(serverRuntimeStats);
        if (includeCurrentSession && !runtimeSessionCommitted) {
            payload.accumulatedUptimeSeconds += getSessionUptimeSeconds();
        }
        payload.updatedAt = new Date().toISOString();
        fs.writeFileSync(SERVER_RUNTIME_FILE, JSON.stringify(payload, null, 2));
        fbSaveDebounced('serverRuntime', () => payload, 10000);
    } catch (error) {
        console.error('❌ Erreur sauvegarde runtime serveur:', error.message);
    }
}

function commitRuntimeSession() {
    if (runtimeSessionCommitted) return;
    serverRuntimeStats.accumulatedUptimeSeconds += getSessionUptimeSeconds();
    serverRuntimeStats.lastShutdownAt = new Date().toISOString();
    serverRuntimeStats.updatedAt = new Date().toISOString();
    runtimeSessionCommitted = true;
    saveServerRuntimeStats({ includeCurrentSession: false });
}

function loadServerRuntimeStats() {
    try {
        if (fs.existsSync(SERVER_RUNTIME_FILE)) {
            const raw = JSON.parse(fs.readFileSync(SERVER_RUNTIME_FILE, 'utf8'));
            serverRuntimeStats = normalizeRuntimeStats(raw);
        } else {
            serverRuntimeStats = normalizeRuntimeStats({});
        }
    } catch (error) {
        console.error('❌ Erreur chargement runtime serveur:', error.message);
        serverRuntimeStats = normalizeRuntimeStats({});
    }

    serverRuntimeStats.boots += 1;
    serverRuntimeStats.lastBootAt = new Date().toISOString();
    serverRuntimeStats.updatedAt = new Date().toISOString();
    saveServerRuntimeStats({ includeCurrentSession: false });
}

loadServerRuntimeStats();

function findLiveEventById(eventId) {
    const wanted = String(eventId || '').trim().toLowerCase();
    if (!wanted) return null;
    return LIVE_EVENTS_CATALOG.find((event) => String(event.id).toLowerCase() === wanted) || null;
}

function computeNextLiveRotationTs(hours = LIVE_EVENT_DEFAULT_ROTATION_HOURS, fromTs = Date.now()) {
    const safeHours = Math.max(1, Math.min(24, Number(hours) || LIVE_EVENT_DEFAULT_ROTATION_HOURS));
    return Number(fromTs) + safeHours * 60 * 60 * 1000;
}

function createDefaultLiveOpsState() {
    const now = Date.now();
    return {
        version: 1,
        season: {
            number: 1,
            label: 'Saison 1 - Genesis',
            year: new Date(now).getFullYear(),
            startedAt: new Date(now).toISOString(),
            xpMultiplier: 1
        },
        activeEvent: null,
        autoModeEnabled: true,
        autoRotationHours: LIVE_EVENT_DEFAULT_ROTATION_HOURS,
        bannerDisplayMode: 'dismissible',
        eventRotationMinutes: LIVE_EVENT_DEFAULT_ROTATION_HOURS * 60,
        nextRotationAt: computeNextLiveRotationTs(LIVE_EVENT_DEFAULT_ROTATION_HOURS, now),
        updatedAt: new Date(now).toISOString()
    };
}

function normalizeLiveOpsState(raw = {}) {
    const fallback = createDefaultLiveOpsState();

    const seasonRaw = raw.season || {};
    const seasonNumber = parseInt(seasonRaw.number, 10);
    const seasonYear = parseInt(seasonRaw.year, 10);
    const xpMultiplier = Number(seasonRaw.xpMultiplier);
    const eventRotationMinutes = parseInt(raw.eventRotationMinutes, 10);
    const autoRotationHoursRaw = parseInt(raw.autoRotationHours, 10);
    const derivedHoursFromMinutes = Number.isFinite(eventRotationMinutes) && eventRotationMinutes > 0
        ? Math.max(1, Math.min(24, Math.round(eventRotationMinutes / 60)))
        : fallback.autoRotationHours;
    const autoRotationHours = Number.isFinite(autoRotationHoursRaw) && autoRotationHoursRaw > 0
        ? Math.max(1, Math.min(24, autoRotationHoursRaw))
        : derivedHoursFromMinutes;
    const autoModeEnabled = typeof raw.autoModeEnabled === 'boolean' ? raw.autoModeEnabled : true;
    const bannerDisplayMode = String(raw.bannerDisplayMode || fallback.bannerDisplayMode).toLowerCase() === 'always'
        ? 'always'
        : 'dismissible';
    const nextRotationAt = Number(raw.nextRotationAt);
    const activeEventRaw = raw.activeEvent || null;

    let activeEvent = null;
    if (activeEventRaw && activeEventRaw.id) {
        const ref = findLiveEventById(activeEventRaw.id);
        const endsAt = Number(activeEventRaw.endsAt || 0);
        if (ref && Number.isFinite(endsAt) && endsAt > 0) {
            const customEventMultiplier = Number(activeEventRaw.messageXpMultiplier);
            activeEvent = {
                id: ref.id,
                icon: ref.icon,
                title: ref.title,
                description: ref.description,
                messageXpMultiplier: Number.isFinite(customEventMultiplier)
                    ? Math.min(10, Math.max(1, customEventMultiplier))
                    : Number(ref.messageXpMultiplier || 1),
                startsAt: activeEventRaw.startsAt || new Date().toISOString(),
                endsAt,
                activatedBy: String(activeEventRaw.activatedBy || 'system')
            };
        }
    }

    return {
        version: 1,
        season: {
            number: Number.isFinite(seasonNumber) && seasonNumber > 0 ? seasonNumber : fallback.season.number,
            label: String(seasonRaw.label || fallback.season.label).substring(0, 70) || fallback.season.label,
            year: Number.isFinite(seasonYear) && seasonYear >= 2000 && seasonYear <= 2200 ? seasonYear : fallback.season.year,
            startedAt: seasonRaw.startedAt || fallback.season.startedAt,
            xpMultiplier: Number.isFinite(xpMultiplier) ? Math.min(10, Math.max(0.5, xpMultiplier)) : fallback.season.xpMultiplier
        },
        activeEvent,
        autoModeEnabled,
        autoRotationHours,
        bannerDisplayMode,
        eventRotationMinutes: autoRotationHours * 60,
        nextRotationAt: autoModeEnabled
            ? (Number.isFinite(nextRotationAt) && nextRotationAt > 0
                ? nextRotationAt
                : computeNextLiveRotationTs(autoRotationHours))
            : 0,
        updatedAt: raw.updatedAt || fallback.updatedAt
    };
}

function saveLiveOpsState() {
    try {
        liveOpsState.updatedAt = new Date().toISOString();
        fs.writeFileSync(LIVE_EVENTS_FILE, JSON.stringify(liveOpsState, null, 2));
        fbSave('liveOpsState', liveOpsState);
    } catch (error) {
        console.error('❌ Erreur sauvegarde live events:', error.message);
    }
}

function loadLiveOpsState() {
    try {
        if (fs.existsSync(LIVE_EVENTS_FILE)) {
            const raw = JSON.parse(fs.readFileSync(LIVE_EVENTS_FILE, 'utf8'));
            liveOpsState = normalizeLiveOpsState(raw);
        } else {
            liveOpsState = createDefaultLiveOpsState();
            saveLiveOpsState();
        }
        console.log('✅ Live events charges');
    } catch (error) {
        console.error('❌ Erreur chargement live events:', error.message);
        liveOpsState = createDefaultLiveOpsState();
    }
}

function getLiveMessageXpMultiplier() {
    const seasonMultiplier = Math.min(10, Math.max(0.5, Number(liveOpsState?.season?.xpMultiplier || 1)));
    let eventMultiplier = 1;
    const event = liveOpsState.activeEvent;
    if (event && Number(event.endsAt || 0) > Date.now()) {
        eventMultiplier = Math.min(10, Math.max(1, Number(event.messageXpMultiplier || 1)));
    }
    return Math.max(0.5, Math.min(10, Number((seasonMultiplier * eventMultiplier).toFixed(2))));
}

function getLiveOpsPayload() {
    const now = Date.now();
    const payload = {
        season: {
            number: liveOpsState.season.number,
            label: liveOpsState.season.label,
            year: liveOpsState.season.year,
            startedAt: liveOpsState.season.startedAt,
            xpMultiplier: liveOpsState.season.xpMultiplier
        },
        event: null,
        autoModeEnabled: !!liveOpsState.autoModeEnabled,
        autoRotationHours: Math.max(1, Math.min(24, Number(liveOpsState.autoRotationHours || LIVE_EVENT_DEFAULT_ROTATION_HOURS))),
        bannerDisplayMode: liveOpsState.bannerDisplayMode === 'always' ? 'always' : 'dismissible',
        nextRotationAt: liveOpsState.nextRotationAt,
        eventRotationMinutes: liveOpsState.eventRotationMinutes,
        effectiveMessageXpMultiplier: getLiveMessageXpMultiplier(),
        serverTime: now,
        catalog: LIVE_EVENTS_CATALOG.map((event) => ({
            id: event.id,
            icon: event.icon,
            title: event.title,
            description: event.description,
            messageXpMultiplier: event.messageXpMultiplier
        }))
    };

    if (liveOpsState.activeEvent && Number(liveOpsState.activeEvent.endsAt || 0) > now) {
        payload.event = {
            ...liveOpsState.activeEvent,
            remainingMs: Math.max(0, Number(liveOpsState.activeEvent.endsAt || 0) - now)
        };
    }

    return payload;
}

function broadcastLiveOpsState() {
    io.emit('season_event_state', getLiveOpsPayload());
}

function emitLiveOpsSystemMessage(message) {
    const systemMessage = {
        type: 'system',
        message,
        timestamp: new Date(),
        id: messageId++
    };
    addToHistory(systemMessage);
    io.emit('system_message', systemMessage);
}

function activateLiveEvent(eventId, options = {}) {
    const ref = findLiveEventById(eventId);
    if (!ref) return null;

    const now = Date.now();
    const durationRaw = parseInt(options.durationMinutes, 10);
    const durationMinutes = Number.isFinite(durationRaw)
        ? Math.min(LIVE_EVENT_MAX_DURATION_MINUTES, Math.max(5, durationRaw))
        : LIVE_EVENT_DEFAULT_DURATION_MINUTES;
    const customMultiplier = Number(options.messageXpMultiplier);
    const messageXpMultiplier = Number.isFinite(customMultiplier)
        ? Math.min(10, Math.max(1, customMultiplier))
        : Number(ref.messageXpMultiplier || 1);

    liveOpsState.activeEvent = {
        id: ref.id,
        icon: ref.icon,
        title: ref.title,
        description: ref.description,
        messageXpMultiplier,
        startsAt: new Date(now).toISOString(),
        endsAt: now + durationMinutes * 60 * 1000,
        activatedBy: String(options.actor || 'system')
    };
    liveOpsState.nextRotationAt = liveOpsState.autoModeEnabled
        ? computeNextLiveRotationTs(liveOpsState.autoRotationHours, now)
        : 0;
    saveLiveOpsState();
    broadcastLiveOpsState();

    if (options.announce !== false) {
        emitLiveOpsSystemMessage(`${ref.icon} Event live: ${ref.title} (${durationMinutes} min)`);
    }

    return liveOpsState.activeEvent;
}

function endLiveEvent(options = {}) {
    const current = liveOpsState.activeEvent;
    if (!current) return false;

    liveOpsState.activeEvent = null;
    liveOpsState.nextRotationAt = liveOpsState.autoModeEnabled
        ? computeNextLiveRotationTs(liveOpsState.autoRotationHours)
        : 0;
    saveLiveOpsState();
    broadcastLiveOpsState();

    if (options.announce !== false) {
        const actor = options.actor ? ` par ${options.actor}` : '';
        emitLiveOpsSystemMessage(`🧊 Event termine: ${current.title}${actor}`);
    }

    return true;
}

function rotateLiveEvent(options = {}) {
    const currentId = liveOpsState.activeEvent ? liveOpsState.activeEvent.id : null;
    const pool = LIVE_EVENTS_CATALOG.filter((event) => event.id !== currentId);
    const source = pool.length > 0 ? pool : LIVE_EVENTS_CATALOG;
    const selected = source[Math.floor(Math.random() * source.length)] || null;
    if (!selected) return null;
    return activateLiveEvent(selected.id, options);
}

function refreshLiveOpsState() {
    const now = Date.now();
    if (liveOpsState.activeEvent && Number(liveOpsState.activeEvent.endsAt || 0) <= now) {
        endLiveEvent({ actor: 'system', announce: true });
    }

    if (!liveOpsState.autoModeEnabled) return;

    if (!liveOpsState.activeEvent && Number(liveOpsState.nextRotationAt || 0) <= now) {
        rotateLiveEvent({ actor: 'system', announce: true, durationMinutes: LIVE_EVENT_DEFAULT_DURATION_MINUTES });
    }
}

function getSeasonalQuestWeekIndex(now = Date.now()) {
    const seasonStartRaw = liveOpsState?.season?.startedAt;
    const parsedSeasonStart = Date.parse(seasonStartRaw || '');
    const seasonStart = Number.isFinite(parsedSeasonStart) ? parsedSeasonStart : now;
    const elapsedMs = Math.max(0, now - seasonStart);
    return Math.floor(elapsedMs / (SEASONAL_QUEST_ROTATION_DAYS * 24 * 60 * 60 * 1000));
}

function buildSeasonalQuestsPayload(username) {
    const now = Date.now();
    const seasonNumber = Math.max(1, Number(liveOpsState?.season?.number || 1));
    const weekIndex = getSeasonalQuestWeekIndex(now);
    const selectionCount = Math.min(3, SEASONAL_QUEST_POOL.length);
    const selected = [];

    for (let i = 0; i < selectionCount; i += 1) {
        const idx = (weekIndex * 3 + seasonNumber + i * 2) % SEASONAL_QUEST_POOL.length;
        selected.push(SEASONAL_QUEST_POOL[idx]);
    }

    const entry = ensureXPEntry(username);
    ensureDailyMissionsForEntry(entry);
    const eventMultiplier = liveOpsState.activeEvent ? Number(liveOpsState.activeEvent.messageXpMultiplier || 1) : 1;

    const quests = selected.map((template, index) => {
        const progress = Math.max(0, Number(entry.dailyMissionProgress?.[template.metric] || 0));
        const dynamicTarget = Math.max(
            1,
            Math.floor(
                (template.baseTarget + Math.max(0, seasonNumber - 1) * template.targetGrowthPerSeason)
                * (eventMultiplier >= 1.8 ? 0.85 : 1)
            )
        );
        const completed = progress >= dynamicTarget;

        return {
            id: `${template.id}_${seasonNumber}_${weekIndex}_${index}`,
            metric: template.metric,
            title: template.title,
            label: template.label,
            progress,
            target: dynamicTarget,
            completed,
            rewards: {
                xp: template.rewardXP,
            }
        };
    });

    const seasonStartRaw = liveOpsState?.season?.startedAt;
    const parsedSeasonStart = Date.parse(seasonStartRaw || '');
    const seasonStart = Number.isFinite(parsedSeasonStart) ? parsedSeasonStart : now;

    return {
        seasonNumber,
        weekIndex,
        rotationDays: SEASONAL_QUEST_ROTATION_DAYS,
        generatedAt: now,
        rotatesAt: seasonStart + (weekIndex + 1) * SEASONAL_QUEST_ROTATION_DAYS * 24 * 60 * 60 * 1000,
        quests
    };
}

function getRecentChannelMapByUser(maxMessagesPerChannel = 120) {
    const usage = new Map();

    Object.entries(channelHistories || {}).forEach(([channelName, messages]) => {
        const recent = Array.isArray(messages) ? messages.slice(-maxMessagesPerChannel) : [];
        recent.forEach((message) => {
            if (message?.type !== 'user' || !message?.username) return;
            const key = normalizeUsernameKey(message.username);
            if (!key) return;
            if (!usage.has(key)) usage.set(key, new Set());
            usage.get(key).add(channelName);
        });
    });

    return usage;
}

function buildSocialRecommendations(username, limit = 5) {
    const safeUsername = String(username || '').trim();
    if (!safeUsername) return [];

    const userKey = normalizeUsernameKey(safeUsername);
    const myData = friendships[safeUsername] || { friends: [], pending: [], requests: [] };
    const blocked = new Set((global.blockedUsers?.[safeUsername] || []).map((u) => normalizeUsernameKey(u)));
    const exclusion = new Set([userKey]);

    (myData.friends || []).forEach((name) => exclusion.add(normalizeUsernameKey(name)));
    (myData.pending || []).forEach((name) => exclusion.add(normalizeUsernameKey(name)));
    (myData.requests || []).forEach((name) => exclusion.add(normalizeUsernameKey(name)));
    blocked.forEach((k) => exclusion.add(k));

    const allCandidates = new Map();
    Object.keys(friendships || {}).forEach((name) => allCandidates.set(normalizeUsernameKey(name), name));
    Array.from(userProfiles.keys()).forEach((name) => allCandidates.set(normalizeUsernameKey(name), name));
    Array.from(connectedUsers.values()).forEach((u) => allCandidates.set(normalizeUsernameKey(u.username), u.username));

    const myFriendsLower = new Set((myData.friends || []).map((name) => normalizeUsernameKey(name)));
    const recentChannels = getRecentChannelMapByUser();
    const myChannels = recentChannels.get(userKey) || new Set();

    const scored = [];
    allCandidates.forEach((candidateName, candidateKey) => {
        if (!candidateKey || exclusion.has(candidateKey)) return;

        const candidateData = friendships[candidateName] || { friends: [] };
        const candidateFriends = new Set((candidateData.friends || []).map((name) => normalizeUsernameKey(name)));
        let mutualFriends = 0;
        myFriendsLower.forEach((friendKey) => {
            if (candidateFriends.has(friendKey)) mutualFriends += 1;
        });

        const candidateChannels = recentChannels.get(candidateKey) || new Set();
        let sharedChannels = 0;
        myChannels.forEach((channelName) => {
            if (candidateChannels.has(channelName)) sharedChannels += 1;
        });

        const isOnline = getSocketsForUsername(candidateName).length > 0;
        const score = mutualFriends * 6 + sharedChannels * 4 + (isOnline ? 2 : 0);
        if (score <= 0) return;

        const reasons = [];
        if (mutualFriends > 0) reasons.push(`${mutualFriends} ami(s) en commun`);
        if (sharedChannels > 0) reasons.push(`${sharedChannels} salon(s) partagé(s)`);
        if (isOnline) reasons.push('en ligne');

        scored.push({
            username: candidateName,
            score,
            mutualFriends,
            sharedChannels,
            online: isOnline,
            reasons
        });
    });

    return scored
        .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username))
        .slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));
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
        fbSave('pinnedMessages', pinnedMessages);
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
        fbSaveDebounced('chatHistory', () => data);
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
        fbSaveDebounced('channelHistories', () => data);
    } catch (error) {
        console.error('❌ Erreur sauvegarde salons:', error.message);
    }
}

function saveReactions() {
    try {
        fs.writeFileSync(REACTIONS_FILE, JSON.stringify(messageReactions, null, 2));
        fbSaveDebounced('messageReactions', () => messageReactions);
    } catch (error) {
        console.error('❌ Erreur sauvegarde réactions:', error.message);
    }
}

// === SAUVEGARDE/CHARGEMENT DMs ===
function saveDMs() {
    try {
        fs.writeFileSync(DM_FILE, JSON.stringify(dmHistory, null, 2));
        fbSaveDebounced('dmHistory', () => dmHistory);
    } catch (error) {
        console.error('❌ Erreur sauvegarde DMs:', error.message);
    }
}

function loadDMs() {
    try {
        if (fs.existsSync(DM_FILE)) {
            const data = fs.readFileSync(DM_FILE, 'utf8');
            const rawHistory = JSON.parse(data) || {};
            // R5: normalize legacy conversation keys so old DMs remain visible after the
            // case-insensitive realtime rewrite. Messages themselves are preserved.
            const normalized = {};
            for (const [legacyKey, messages] of Object.entries(rawHistory)) {
                const parts = String(legacyKey).split(':').filter(Boolean);
                const key = parts.length >= 2
                    ? [parts[0].trim().toLowerCase(), parts.slice(1).join(':').trim().toLowerCase()].sort().join(':')
                    : String(legacyKey).trim().toLowerCase();
                if (!normalized[key]) normalized[key] = [];
                normalized[key].push(...(Array.isArray(messages) ? messages : []));
            }
            for (const key of Object.keys(normalized)) {
                const seen = new Set();
                normalized[key] = normalized[key]
                    .filter(msg => {
                        const id = String(msg?.id || `${msg?.from || ''}|${msg?.to || ''}|${msg?.timestamp || ''}|${msg?.content || ''}`);
                        if (seen.has(id)) return false;
                        seen.add(id); return true;
                    })
                    .sort((a,b) => new Date(a?.timestamp || 0) - new Date(b?.timestamp || 0))
                    .slice(-250);
            }
            dmHistory = normalized;
            const convCount = Object.keys(dmHistory).length;
            console.log(`✅ DMs chargés: ${convCount} conversations (clés normalisées R5)`);
        }
    } catch (error) {
        console.error('❌ Erreur chargement DMs:', error.message);
        dmHistory = {};
    }
}

// Charger les DMs au démarrage
// (Moved to async loadAllData below)

// Charger les données au démarrage
// (Moved to async loadAllData below)

// === CHARGEMENT DES NOUVELLES DONNÉES ===
function loadXPData() {
    try {
        if (fs.existsSync(XP_FILE)) {
            userXP = JSON.parse(fs.readFileSync(XP_FILE, 'utf8'));
            console.log(`✅ XP chargé: ${Object.keys(userXP).length} utilisateurs`);
        }
    } catch (e) { console.error('❌ Erreur chargement XP:', e.message); userXP = {}; }
}

const XP_SAVE_DEBOUNCE_MS = 1200;
let xpSaveTimer = null;

function writeXPDataNow() {
    try {
        fs.writeFileSync(XP_FILE, JSON.stringify(userXP, null, 2));
        fbSave('userXP', userXP);
    } catch (e) {
        console.error('❌ Erreur sauvegarde XP:', e.message);
    }
}

function saveXPData() {
    if (xpSaveTimer) return;
    xpSaveTimer = setTimeout(() => {
        xpSaveTimer = null;
        writeXPDataNow();
    }, XP_SAVE_DEBOUNCE_MS);
}

function saveXPDataImmediate() {
    if (xpSaveTimer) {
        clearTimeout(xpSaveTimer);
        xpSaveTimer = null;
    }
    writeXPDataNow();
}
function loadFriendships() {
    try {
        if (fs.existsSync(FRIENDS_FILE)) {
            friendships = JSON.parse(fs.readFileSync(FRIENDS_FILE, 'utf8'));
            console.log(`✅ Amitiés chargées: ${Object.keys(friendships).length} utilisateurs`);
        }
    } catch (e) { console.error('❌ Erreur chargement amitiés:', e.message); friendships = {}; }
}
function saveFriendships() {
    try { fs.writeFileSync(FRIENDS_FILE, JSON.stringify(friendships, null, 2)); fbSaveDebounced('friendships', () => friendships); } catch (e) { console.error('❌ Erreur sauvegarde amitiés:', e.message); }
}

// Envoyer la liste d'amis mise à jour à un utilisateur connecté (par username)
function emitFriendsListTo(username) {
    const data = friendships[username] || { friends: [], pending: [], requests: [] };
    const friendsWithStatus = (data.friends || []).map(f => {
        const friendKey = normalizeUsernameKey(f);
        let online = false;
        for (const [, u] of connectedUsers.entries()) {
            if (normalizeUsernameKey(u.username) === friendKey) { online = true; break; }
        }
        return { username: f, online };
    });
    const wantedKey = normalizeUsernameKey(username);
    for (const [sid, u] of connectedUsers.entries()) {
        if (normalizeUsernameKey(u.username) === wantedKey) {
            io.to(sid).emit('friends_list', { friends: friendsWithStatus, pending: data.pending, requests: data.requests });
        }
    }
}

// Notifier les amis d'un changement de statut en ligne
function notifyFriendsOfStatusChange(username) {
    const data = friendships[username];
    if (!data || !data.friends) return;
    data.friends.forEach(friendName => {
        emitFriendsListTo(friendName);
    });
}
function loadBookmarks() {
    try {
        if (fs.existsSync(BOOKMARKS_FILE)) {
            userBookmarks = JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf8'));
            console.log(`✅ Bookmarks chargés: ${Object.keys(userBookmarks).length} utilisateurs`);
        }
    } catch (e) { console.error('❌ Erreur chargement bookmarks:', e.message); userBookmarks = {}; }
}
function saveBookmarks() {
    try { fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(userBookmarks, null, 2)); fbSaveDebounced('bookmarks', () => userBookmarks); } catch (e) { console.error('❌ Erreur sauvegarde bookmarks:', e.message); }
}
function loadReminders() {
    try {
        if (fs.existsSync(REMINDERS_FILE)) {
            const data = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
            reminders = data.reminders || [];
            reminderIdCounter = data.lastId || 1;
            console.log(`✅ Rappels chargés: ${reminders.length}`);
        }
    } catch (e) { console.error('❌ Erreur chargement rappels:', e.message); reminders = []; }
}
function saveReminders() {
    try { fs.writeFileSync(REMINDERS_FILE, JSON.stringify({ reminders, lastId: reminderIdCounter }, null, 2)); fbSaveDebounced('reminders', () => ({ reminders, lastId: reminderIdCounter })); } catch (e) { console.error('❌ Erreur sauvegarde rappels:', e.message); }
}
function loadAutoMod() {
    try {
        if (fs.existsSync(AUTOMOD_FILE)) {
            autoModConfig = { ...autoModConfig, ...JSON.parse(fs.readFileSync(AUTOMOD_FILE, 'utf8')) };
            console.log(`✅ AutoMod chargé`);
        }
    } catch (e) { console.error('❌ Erreur chargement AutoMod:', e.message); }
}
function saveAutoMod() {
    try { fs.writeFileSync(AUTOMOD_FILE, JSON.stringify(autoModConfig, null, 2)); fbSave('autoModConfig', autoModConfig); } catch (e) { console.error('❌ Erreur sauvegarde AutoMod:', e.message); }
}

// === COMPTES ===
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}
function loadAccounts() {
    try {
        if (fs.existsSync(ACCOUNTS_FILE)) {
            accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
            console.log(`✅ Comptes chargés: ${Object.keys(accounts).length}`);
        }
    } catch (e) { console.error('❌ Erreur chargement comptes:', e.message); accounts = {}; }
}
function saveAccounts() {
    try { fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2)); fbSave('accounts', accounts); } catch (e) { console.error('❌ Erreur sauvegarde comptes:', e.message); }
}

function loadProfiles() {
    try {
        if (fs.existsSync(PROFILES_FILE)) {
            const data = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
            userProfiles = new Map(Object.entries(data));
            console.log(`✅ Profils chargés: ${userProfiles.size} utilisateurs`);
        }
    } catch (e) { console.error('❌ Erreur chargement profils:', e.message); userProfiles = new Map(); }
}
function saveProfiles() {
    try {
        const obj = Object.fromEntries(userProfiles);
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(obj, null, 2));
        fbSaveDebounced('profiles', () => Object.fromEntries(userProfiles));
    } catch (e) { console.error('❌ Erreur sauvegarde profils:', e.message); }
}

// === CHARGEMENT ASYNC DEPUIS FIREBASE + FALLBACK LOCAL ===
async function loadAllData() {
    console.log('📦 Chargement des données...');
    const fbStart = Date.now();

    if (useFirebase) {
        console.log('☁️ Tentative de chargement depuis Firebase...');
        try {
            // Load all data from Firebase in parallel
            const [
                fbAccounts, fbXP, fbFriends, fbBookmarks, fbReminders,
                fbAutoMod, fbProfiles, fbDMs, fbHistory,
                fbChannels, fbReactions, fbPinned, fbPresence, fbChannelCfg
            ] = await Promise.all([
                fbLoad('accounts'),
                fbLoad('userXP'),
                fbLoad('friendships'),
                fbLoad('bookmarks'),
                fbLoad('reminders'),
                fbLoad('autoModConfig'),
                fbLoad('profiles'),
                fbLoad('dmHistory'),
                fbLoad('chatHistory'),
                fbLoad('channelHistories'),
                fbLoad('messageReactions'),
                fbLoad('pinnedMessages'),
                fbLoad('presenceHistory'),
                fbLoad('channelConfig')
            ]);

            let fbCount = 0;

            if (fbAccounts && Object.keys(fbAccounts).length > 0) { accounts = fbAccounts; fbCount++; console.log(`  ✅ [FB] Comptes: ${Object.keys(accounts).length}`); }
            if (fbXP && Object.keys(fbXP).length > 0) { userXP = fbXP; fbCount++; console.log(`  ✅ [FB] XP: ${Object.keys(userXP).length}`); }
            if (fbFriends && Object.keys(fbFriends).length > 0) { friendships = fbFriends; fbCount++; console.log(`  ✅ [FB] Amitiés: ${Object.keys(friendships).length}`); }
            if (fbBookmarks && Object.keys(fbBookmarks).length > 0) { userBookmarks = fbBookmarks; fbCount++; }
            if (fbReminders) { reminders = fbReminders.reminders || []; reminderIdCounter = fbReminders.lastId || 1; fbCount++; }
            if (fbAutoMod) { autoModConfig = { ...autoModConfig, ...fbAutoMod }; fbCount++; }
            if (fbProfiles && Object.keys(fbProfiles).length > 0) { userProfiles = new Map(Object.entries(fbProfiles)); fbCount++; }
            if (fbDMs && Object.keys(fbDMs).length > 0) { dmHistory = fbDMs; fbCount++; }
            if (fbHistory) {
                chatHistory = fbHistory.messages || [];
                messageId = fbHistory.lastMessageId || 1;
                fbCount++;
                console.log(`  ✅ [FB] Historique: ${chatHistory.length} messages`);
            }
            if (fbChannels && fbChannels.histories) {
                channelHistories = fbChannels.histories;
                AVAILABLE_CHANNELS.forEach(ch => { if (!channelHistories[ch]) channelHistories[ch] = []; });
                fbCount++;
            }
            if (fbReactions && Object.keys(fbReactions).length > 0) { messageReactions = fbReactions; fbCount++; }
            if (fbPinned) { pinnedMessages = Array.isArray(fbPinned) ? fbPinned : []; fbCount++; }
            if (fbPresence) { presenceHistory = Array.isArray(fbPresence) ? fbPresence : []; fbCount++; }
            if (fbChannelCfg && fbChannelCfg.channels && fbChannelCfg.channels.length > 0) { channelConfig = fbChannelCfg; fbCount++; }

            console.log(`☁️ Firebase: ${fbCount}/14 collections chargées en ${Date.now() - fbStart}ms`);

            // If Firebase had data, skip local file loading for loaded collections
            if (fbCount > 5) {
                console.log('☁️ Données Firebase utilisées comme source principale');
                loadLiveOpsState();
                refreshLiveOpsState();
                return;
            }
        } catch (e) {
            console.error('❌ Erreur chargement Firebase, fallback local:', e.message);
        }
    }

    // Fallback: load from local files
    console.log('💾 Chargement depuis fichiers locaux...');
    loadDMs();
    loadPersistedData();
    loadPinnedMessages();
    loadLiveOpsState();
    refreshLiveOpsState();
    loadPresenceHistory();
    loadXPData();
    loadFriendships();
    loadBookmarks();
    loadReminders();
    loadAutoMod();
    loadAccounts();
    loadProfiles();

    // If Firebase is available but had no data, seed it from local files
    if (useFirebase) {
        console.log('☁️ Synchronisation initiale local → Firebase...');
        fbSave('accounts', accounts);
        fbSave('userXP', userXP);
        fbSave('friendships', friendships);
        fbSave('bookmarks', userBookmarks);
        fbSave('reminders', { reminders, lastId: reminderIdCounter });
        fbSave('autoModConfig', autoModConfig);
        fbSave('profiles', Object.fromEntries(userProfiles));
        fbSave('dmHistory', dmHistory);
        fbSave('chatHistory', { messages: chatHistory, lastMessageId: messageId });
        fbSave('channelHistories', { histories: channelHistories });
        fbSave('messageReactions', messageReactions);
        fbSave('pinnedMessages', pinnedMessages);
        fbSave('presenceHistory', presenceHistory);
        fbSave('channelConfig', channelConfig);
        console.log('☁️ Sync initial terminé');
    }
}

// Lancement async du chargement
loadAllData().then(() => {
    console.log('✅ Toutes les données chargées');
}).catch(e => {
    console.error('❌ Erreur fatale chargement données:', e.message);
    // Fallback local d'urgence
    loadDMs(); loadPersistedData(); loadPinnedMessages(); loadLiveOpsState(); refreshLiveOpsState();
    loadPresenceHistory(); loadXPData(); loadFriendships(); loadBookmarks(); loadReminders();
    loadAutoMod(); loadAccounts(); loadProfiles();
});

// === REMINDER CHECKER (every 10 seconds) ===
setInterval(() => {
    const now = Date.now();
    const triggered = reminders.filter(r => r.triggerAt <= now);
    if (triggered.length === 0) return;
    
    triggered.forEach(reminder => {
        // Find user socket
        for (const [socketId, userData] of connectedUsers.entries()) {
            if (userData.username === reminder.username) {
                io.to(socketId).emit('reminder_triggered', {
                    id: reminder.id,
                    message: reminder.message,
                    createdAt: reminder.createdAt
                });
                break;
            }
        }
    });
    
    reminders = reminders.filter(r => r.triggerAt > now);
    saveReminders();
}, 10000);

// === AUTO-MODERATION HELPER ===
function checkAutoMod(username, content) {
    if (!autoModConfig.enabled) return { allowed: true };
    if (adminUsersList.includes(username)) return { allowed: true };
    
    // Spam check
    if (!spamTracker[username]) spamTracker[username] = [];
    const now = Date.now();
    spamTracker[username].push(now);
    spamTracker[username] = spamTracker[username].filter(t => now - t < autoModConfig.spamInterval * 1000);
    if (spamTracker[username].length > autoModConfig.spamThreshold) {
        addWarning(username);
        return { allowed: false, reason: '🚫 Spam détecté ! Ralentissez.' };
    }
    
    // Link filter
    if (autoModConfig.linkFilter && /https?:\/\//i.test(content)) {
        addWarning(username);
        return { allowed: false, reason: '🚫 Les liens ne sont pas autorisés.' };
    }
    
    // Caps filter
    if (autoModConfig.capsFilter && content.length > 10) {
        const caps = content.replace(/[^a-zA-Z]/g, '');
        const upperCount = caps.replace(/[^A-Z]/g, '').length;
        if (caps.length > 0 && upperCount / caps.length > 0.8) {
            return { allowed: false, reason: '🚫 Trop de MAJUSCULES !' };
        }
    }
    
    // Word filter
    if (autoModConfig.wordFilter.length > 0) {
        const lowerContent = content.toLowerCase();
        for (const word of autoModConfig.wordFilter) {
            if (lowerContent.includes(word.toLowerCase())) {
                addWarning(username);
                return { allowed: false, reason: '🚫 Message contient un mot interdit.' };
            }
        }
    }
    
    return { allowed: true };
}

function addWarning(username) {
    if (!userWarnings[username]) userWarnings[username] = { count: 0, lastWarning: 0 };
    userWarnings[username].count++;
    userWarnings[username].lastWarning = Date.now();
}

// === XP HELPER ===
function grantXP(username, amount, options = {}) {
    const entry = ensureXPEntry(username);
    const source = options.source || 'message';
    const ignoreCooldown = !!options.ignoreCooldown;
    
    const now = Date.now();
    const cooldownMs = getMessageCooldownMs(entry);
    if (!ignoreCooldown && source === 'message' && (now - entry.lastXpGain < cooldownMs)) return null;
    const multiplier = Math.max(1, Number(options.multiplier || 1));
    const gainedXP = Math.max(1, Math.floor(amount * multiplier));
    
    const oldLevel = getLevelFromXP(entry.xp).level;
    entry.xp += gainedXP;
    entry.lastXpGain = now;
    const newLevelData = getLevelFromXP(entry.xp);
    entry.level = newLevelData.level;
    
    if (newLevelData.level > oldLevel) {
        saveXPData();
        return { levelUp: true, newLevel: newLevelData.level, username, gainedXP };
    }
    
    // Save periodically (every 5 XP gains)
    if (entry.xp % (gainedXP * 5) < gainedXP) saveXPData();
    return { levelUp: false, username, gainedXP };
}

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
// Définir ADMIN_KEY dans les variables d'environnement de Fly.io
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
    Tu es amical, serviable, et tu peux être taquin de façon légère MAIS toujours respectueux.
    Tu réponds en français, avec un ton naturel et varié.
    Tu peux aider avec des questions générales, donner des conseils, expliquer des concepts, écrire du code, raconter des blagues, etc.
    Quand on te dit "quoi", "pourquoi", "comment", ou des relances similaires, réponds avec une explication claire et courte.
    Refuse poliment toute demande d'insultes, d'harcèlement ou de contenu offensant.
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

app.get('/ADMIN', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/runtime/fly', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        platform: IS_FLY ? 'fly.io' : (IS_RENDER ? 'render' : 'local'),
        region: process.env.FLY_REGION || null,
        primaryRegion: process.env.PRIMARY_REGION || null,
        machineId: process.env.FLY_MACHINE_ID || null,
        users: connectedUsers.size,
        websocketConnections: io.engine.clientsCount,
        voiceRooms: Object.fromEntries(Object.entries(voiceRooms).map(([name, room]) => [name, room.participants.size])),
        memoryMB: Math.round(mem.rss / 1024 / 1024),
        heapMB: Math.round(mem.heapUsed / 1024 / 1024),
        uptimeSeconds: getTotalUptimeSeconds(),
        turnConfigured: VOICE_TURN_URLS.length > 0 && !!VOICE_TURN_USERNAME && !!VOICE_TURN_CREDENTIAL,
        voiceMode: VOICE_RUNTIME_MODE
    });
});

app.get('/api/voice/runtime-config', (req, res) => {
    const sfuEnabled = VOICE_RUNTIME_MODE === 'sfu';
    res.json({
        mode: sfuEnabled ? 'sfu' : 'p2p',
        sfuEnabled,
        provider: VOICE_SFU_PROVIDER,
        signalingUrl: VOICE_SFU_SIGNALING_URL,
        publicWsUrl: VOICE_SFU_PUBLIC_WS,
        iceServers: getVoiceIceServers(),
        forceRelay: VOICE_FORCE_RELAY,
        region: process.env.FLY_REGION || null,
        generatedAt: Date.now()
    });
});

app.get('/api/observability/summary', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        timestamp: Date.now(),
        uptimeSeconds: getTotalUptimeSeconds(),
        sockets: {
            ...observability.sockets,
            currentTransportConnections: io.engine.clientsCount,
            currentAuthenticatedUsers: connectedUsers.size
        },
        http: {
            requestsTotal: observability.http.requestsTotal,
            latencyMsAvg: observability.http.latencyMsAvg,
            latencyMsP95: observability.http.latencyMsP95,
            byStatus: observability.http.byStatus,
            topPaths: Object.entries(observability.http.byPath)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([pathName, count]) => ({ path: pathName, count }))
        },
        voice: observability.voice,
        runtime: {
            ...observability.runtime,
            memory: {
                heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
                heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
                rssMb: Math.round(mem.rss / 1024 / 1024)
            }
        }
    });
});

app.get('/metrics', (req, res) => {
    const lines = [];
    lines.push('# HELP docspace_http_requests_total Total HTTP requests');
    lines.push('# TYPE docspace_http_requests_total counter');
    lines.push(`docspace_http_requests_total ${observability.http.requestsTotal}`);
    lines.push('# HELP docspace_socket_connections_total Total socket transport connections');
    lines.push('# TYPE docspace_socket_connections_total counter');
    lines.push(`docspace_socket_connections_total ${observability.sockets.totalConnections}`);
    lines.push('# HELP docspace_connected_users Current authenticated users');
    lines.push('# TYPE docspace_connected_users gauge');
    lines.push(`docspace_connected_users ${connectedUsers.size}`);
    lines.push('# HELP docspace_event_loop_lag_ms Event loop lag in milliseconds');
    lines.push('# TYPE docspace_event_loop_lag_ms gauge');
    lines.push(`docspace_event_loop_lag_ms ${observability.runtime.eventLoopLagMs}`);
    lines.push('# HELP docspace_voice_offers_total Total WebRTC offers relayed');
    lines.push('# TYPE docspace_voice_offers_total counter');
    lines.push(`docspace_voice_offers_total ${observability.voice.offers}`);
    lines.push('# HELP docspace_voice_answers_total Total WebRTC answers relayed');
    lines.push('# TYPE docspace_voice_answers_total counter');
    lines.push(`docspace_voice_answers_total ${observability.voice.answers}`);
    lines.push('# HELP docspace_voice_ice_candidates_total Total ICE candidates relayed');
    lines.push('# TYPE docspace_voice_ice_candidates_total counter');
    lines.push(`docspace_voice_ice_candidates_total ${observability.voice.iceCandidates}`);

    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(lines.join('\n') + '\n');
});

// Route de santé pour Fly.io avec stats détaillées
app.get('/health', (req, res) => {
    const uptimeSession = getSessionUptimeSeconds();
    const uptimeTotal = getTotalUptimeSeconds();
    const memUsage = process.memoryUsage();
    
    const healthData = {
        status: 'OK',
        uptime: formatDurationShort(uptimeTotal),
        uptimeSession: formatDurationShort(uptimeSession),
        uptimeTotalSeconds: uptimeTotal,
        users: connectedUsers.size,
        messages: chatHistory.length,
        totalMessages: serverStats.totalMessages,
        totalUploads: serverStats.totalUploads,
        totalConnections: serverStats.totalConnections,
        serverName: SERVER_NAME,
        serverVersion: SERVER_VERSION,
        serverEnv: SERVER_ENV,
        perfProfile: IS_CLOUD ? 'cloud-optimized' : 'local-full',
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

// === API CLOUD STATS (Fly.io + Firebase) ===
app.get('/api/cloud-stats', (req, res) => {
    const memUsage = process.memoryUsage();
    const osInfo = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        pid: process.pid
    };

    // Fly.io environment info
    const flyInfo = {
        appName: process.env.FLY_APP_NAME || null,
        region: process.env.FLY_REGION || null,
        allocId: process.env.FLY_ALLOC_ID || null,
        machineId: process.env.FLY_MACHINE_ID || null,
        publicIp: process.env.FLY_PUBLIC_IP || null,
        isCloud: IS_CLOUD,
        environment: SERVER_ENV
    };

    // Memory usage
    const memory = {
        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        rssMB: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        externalMB: Math.round((memUsage.external || 0) / 1024 / 1024 * 100) / 100,
        heapPercent: Math.round(memUsage.heapUsed / memUsage.heapTotal * 100)
    };

    // Firebase status
    const firebase = {
        connected: useFirebase,
        projectId: useFirebase ? ((() => { try { return JSON.parse(process.env.FIREBASE_CREDENTIALS || '{}').project_id; } catch(e) { return null; } })()) : null
    };

    // Data sizes (approximate)
    const dataSizes = {
        accounts: Object.keys(accounts).length,
        users: Object.keys(userXP).length,
        channels: Object.keys(channelHistories).length,
        totalMessages: Object.values(channelHistories).reduce((s, a) => s + a.length, 0),
        dms: Object.keys(dmHistory).length,
        friendships: Object.keys(friendships).length,
        profiles: userProfiles.size,
        presenceEntries: presenceHistory.length
    };

    res.json({
        fly: flyInfo,
        memory,
        firebase,
        dataSizes,
        os: osInfo,
        uptime: {
            session: getSessionUptimeSeconds(),
            total: getTotalUptimeSeconds(),
            sessionFormatted: formatDurationShort(getSessionUptimeSeconds()),
            totalFormatted: formatDurationShort(getTotalUptimeSeconds())
        }
    });
});

// === API PING ===
app.get('/api/stats/ping', (req, res) => {
    const start = Date.now();
    res.json({
        serverTime: start,
        processingTime: Date.now() - start
    });
});

// === API STATISTIQUES PUBLIQUES ===
app.get('/api/stats', (req, res) => {
    const uptimeTotal = getTotalUptimeSeconds();
    const totalChannelMessages = Object.values(channelHistories).reduce((sum, arr) => sum + arr.length, 0);
    refreshLiveOpsState();
    const liveOpsPayload = getLiveOpsPayload();
    
    // Top channels by activity
    const channelStats = {};
    AVAILABLE_CHANNELS.forEach(ch => {
        channelStats[ch] = channelHistories[ch] ? channelHistories[ch].length : 0;
    });
    
    res.json({
        online: connectedUsers.size,
        totalMessages: serverStats.totalMessages,
        totalChannelMessages: totalChannelMessages,
        totalUploads: serverStats.totalUploads,
        totalConnectionsEver: serverStats.totalConnections,
        serverName: SERVER_NAME,
        serverVersion: SERVER_VERSION,
        channels: channelStats,
        uptime: `${Math.floor(uptimeTotal / 3600)}h ${Math.floor((uptimeTotal % 3600) / 60)}m`,
        uptimeTotalSeconds: uptimeTotal,
        activePolls: Object.keys(polls).length,
        dmConversations: Object.keys(dmHistory).length,
        season: liveOpsPayload.season,
        activeLiveEvent: liveOpsPayload.event ? {
            id: liveOpsPayload.event.id,
            title: liveOpsPayload.event.title,
            icon: liveOpsPayload.event.icon,
            remainingMs: liveOpsPayload.event.remainingMs,
            messageXpMultiplier: liveOpsPayload.event.messageXpMultiplier
        } : null
    });
});

// === API DASHBOARD POUR OUTILS EXTERNES (ex: interface Python) ===
app.get('/api/server/dashboard', (req, res) => {
    const sessionUptimeSeconds = getSessionUptimeSeconds();
    const uptimeSeconds = getTotalUptimeSeconds();
    refreshLiveOpsState();
    const liveOpsPayload = getLiveOpsPayload();
    const mem = process.memoryUsage();
    const textChannels = Array.isArray(AVAILABLE_CHANNELS) ? AVAILABLE_CHANNELS : [];
    const voiceRoomsSummary = Object.entries(voiceRooms || {}).map(([roomName, roomData]) => ({
        name: roomName,
        participants: roomData?.participants ? roomData.participants.size : 0
    }));

    const channelsByActivity = textChannels.map((ch) => ({
        name: ch,
        messages: Array.isArray(channelHistories[ch]) ? channelHistories[ch].length : 0
    })).sort((a, b) => b.messages - a.messages);

    res.json({
        server: {
            name: SERVER_NAME,
            version: SERVER_VERSION,
            node: process.version,
            uptimeSeconds,
            sessionUptimeSeconds,
            boots: serverRuntimeStats.boots,
            lastBootAt: serverRuntimeStats.lastBootAt
        },
        traffic: {
            onlineUsers: connectedUsers.size,
            totalConnections: serverStats.totalConnections,
            totalMessages: serverStats.totalMessages,
            totalUploads: serverStats.totalUploads
        },
        memory: {
            heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
            rssMB: Math.round(mem.rss / 1024 / 1024)
        },
        channels: {
            textTotal: textChannels.length,
            voiceTotal: voiceRoomsSummary.length,
            topTextByMessages: channelsByActivity.slice(0, 8),
            voiceRooms: voiceRoomsSummary
        },
        realtime: {
            typingUsers: typingUsers.size
        },
        liveOps: {
            season: liveOpsPayload.season,
            activeEvent: liveOpsPayload.event,
            effectiveMessageXpMultiplier: liveOpsPayload.effectiveMessageXpMultiplier,
            nextRotationAt: liveOpsPayload.nextRotationAt,
            eventRotationMinutes: liveOpsPayload.eventRotationMinutes
        },
        generatedAt: new Date().toISOString()
    });
});

// Gestion des connexions Socket.IO
io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    serverStats.totalConnections++;
    observability.sockets.totalConnections++;
    observability.sockets.currentTransportConnections = io.engine.clientsCount;

    socket.onAny((eventName) => {
        incrementCounter(observability.socketEvents, eventName, 1);
    });
    
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
        let addedReaction = false;
        
        if (action === 'add' && userIndex === -1) {
            messageReactions[messageId][emoji].push(username);
            addedReaction = true;
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

        if (addedReaction) {
            const xpEntry = ensureXPEntry(username);
            const now = Date.now();
            if (!xpEntry.lastReactionXpAt || now - xpEntry.lastReactionXpAt >= 5000) {
                const reactionMultiplier = 1;
                const xpResult = grantXP(username, XP_PER_REACTION, {
                    source: 'reaction',
                    ignoreCooldown: true,
                    multiplier: reactionMultiplier
                });
                xpEntry.lastReactionXpAt = now;

                if (xpResult && xpResult.levelUp) {
                    io.emit('system_message', {
                        type: 'system',
                        message: `🎉 ${username} a atteint le niveau ${xpResult.newLevel} !`,
                        timestamp: new Date(),
                        id: messageId++
                    });
                }
            }

            const missionRewards = applyMissionProgress(username, { reactions: 1 });
            for (const reward of missionRewards) {
                socket.emit('daily_mission_reward', {
                    missionKey: reward.key,
                    missionLabel: reward.label,
                    rewardXP: reward.rewardXP
                });
                if (reward.levelUp) {
                    io.emit('system_message', {
                        type: 'system',
                        message: `🎉 ${username} a atteint le niveau ${reward.newLevel} !`,
                        timestamp: new Date(),
                        id: messageId++
                    });
                }
            }

            socket.emit('xp_data', buildXPDataPayload(username));
            saveXPData();
        }
        
        // Sauvegarder les réactions
        saveReactions();
    });
    
    // Mise à jour du statut personnalisé
    socket.on('update_status', ({ status, customText }) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        
        const username = user.username;
        
        // Préserver les champs existants quand non fournis (ex: auto-idle)
        const existing = userStatuses[username] || {};
        
        // Sauvegarder le statut
        userStatuses[username] = {
            status: status || 'online',
            customText: (customText !== undefined ? customText : existing.customText || '').toString().substring(0, 50),
            emoji: existing.emoji || '',
            lastUpdate: new Date()
        };
        
        // Mettre à jour les données utilisateur
        user.status = status || 'online';
        user.customStatus = userStatuses[username].customText;
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

            if (oldUsername !== cleanNewUsername) {
                const oldXP = userXP[oldUsername];
                const newXP = userXP[cleanNewUsername];
                if (oldXP && newXP) {
                    userXP[cleanNewUsername] = mergeXPEntries(ensureXPEntry(cleanNewUsername), oldXP);
                    delete userXP[oldUsername];
                    saveXPData();
                } else if (oldXP && !newXP) {
                    userXP[cleanNewUsername] = oldXP;
                    delete userXP[oldUsername];
                    ensureXPEntry(cleanNewUsername);
                    saveXPData();
                }

                for (const [, rData] of Object.entries(voiceRooms)) {
                    const participant = rData.participants.get(socket.id);
                    if (participant) participant.username = cleanNewUsername;
                }
            }
            
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
        const findSocketIdByUsername = (username) => {
            if (!username) return null;
            const targetLower = username.toLowerCase();
            for (const [sid, user] of connectedUsers.entries()) {
                if ((user.username || '').toLowerCase() === targetLower) return sid;
            }
            return null;
        };
        const findVoiceParticipantByUsername = (username) => {
            if (!username) return null;
            const targetLower = username.toLowerCase();
            for (const [roomName, roomData] of Object.entries(voiceRooms)) {
                for (const [sid, participant] of roomData.participants.entries()) {
                    if ((participant.username || '').toLowerCase() === targetLower) {
                        return { roomName, socketId: sid, participant };
                    }
                }
            }
            return null;
        };
        const resolveXPUsername = (username) => {
            if (!username) return null;
            const targetLower = username.toLowerCase();
            for (const [, user] of connectedUsers.entries()) {
                if ((user.username || '').toLowerCase() === targetLower) return user.username;
            }
            for (const key of Object.keys(userXP)) {
                if ((key || '').toLowerCase() === targetLower) return key;
            }
            return username;
        };
        
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

            case 'voice_kick': {
                const voiceTarget = findVoiceParticipantByUsername(target);
                if (!voiceTarget) {
                    socket.emit('admin_response', { success: false, message: 'Utilisateur non trouvé en vocal' });
                    break;
                }

                const { roomName, socketId: targetSid } = voiceTarget;
                const targetSocket = io.sockets.sockets.get(targetSid);
                voiceRooms[roomName].participants.delete(targetSid);

                if (targetSocket) {
                    targetSocket.leave('voice_' + roomName);
                    targetSocket.emit('voice_forced_disconnect', {
                        room: roomName,
                        message: 'Vous avez été expulsé du vocal par un administrateur'
                    });
                }

                io.to('voice_' + roomName).emit('voice_peer_left', { socketId: targetSid });
                io.emit('voice_participants_update', { room: roomName, participants: getVoiceParticipants(roomName) });

                socket.emit('admin_response', { success: true, message: `${target} a été expulsé du vocal ${roomName}` });
                logActivity('ADMIN', `Expulsion vocale: ${target}`, { admin: adminName, room: roomName });
                break;
            }

            case 'voice_force_status': {
                const voiceTarget = findVoiceParticipantByUsername(target);
                if (!voiceTarget) {
                    socket.emit('admin_response', { success: false, message: 'Utilisateur non trouvé en vocal' });
                    break;
                }

                const { roomName, socketId: targetSid, participant } = voiceTarget;
                const mode = data.mode === 'deafen' ? 'deafen' : 'mute';
                const enabled = !!data.enabled;

                if (mode === 'mute') {
                    participant.muted = enabled;
                    if (!enabled && participant.deafened) participant.deafened = false;
                } else {
                    participant.deafened = enabled;
                    if (enabled) participant.muted = true;
                }

                const targetSocket = io.sockets.sockets.get(targetSid);
                if (targetSocket) {
                    targetSocket.emit('voice_force_status', {
                        muted: !!participant.muted,
                        deafened: !!participant.deafened,
                        message: mode === 'mute'
                            ? (enabled ? 'Un administrateur a coupé votre micro' : 'Un administrateur a réactivé votre micro')
                            : (enabled ? 'Un administrateur vous a passé en sourdine' : 'Un administrateur a retiré votre sourdine')
                    });
                }

                io.emit('voice_participants_update', { room: roomName, participants: getVoiceParticipants(roomName) });
                socket.emit('admin_response', {
                    success: true,
                    message: `${target}: ${mode === 'mute' ? 'micro' : 'sourdine'} ${enabled ? 'activé(e)' : 'désactivé(e)'}`
                });
                logActivity('ADMIN', `Voice status forcé`, {
                    admin: adminName,
                    target,
                    mode,
                    enabled,
                    room: roomName
                });
                break;
            }

            case 'voice_move': {
                const targetRoom = (data.room || value || '').toString().trim();
                if (!targetRoom || !voiceRooms[targetRoom]) {
                    socket.emit('admin_response', { success: false, message: 'Salon vocal cible invalide' });
                    break;
                }

                const voiceTarget = findVoiceParticipantByUsername(target);
                if (!voiceTarget) {
                    socket.emit('admin_response', { success: false, message: 'Utilisateur non trouvé en vocal' });
                    break;
                }

                if (voiceTarget.roomName === targetRoom) {
                    socket.emit('admin_response', { success: true, message: `${target} est déjà dans ${targetRoom}` });
                    break;
                }

                const targetSocket = io.sockets.sockets.get(voiceTarget.socketId);
                if (!targetSocket) {
                    socket.emit('admin_response', { success: false, message: 'Socket utilisateur introuvable' });
                    break;
                }

                targetSocket.emit('voice_force_move', {
                    room: targetRoom,
                    message: `Un administrateur vous a déplacé vers ${targetRoom}`
                });

                socket.emit('admin_response', { success: true, message: `${target} déplacé vers ${targetRoom}` });
                logActivity('ADMIN', `Déplacement vocal`, { admin: adminName, target, from: voiceTarget.roomName, to: targetRoom });
                break;
            }

            case 'xp_add': {
                const xpName = resolveXPUsername(target);
                const amount = parseInt(data.amount, 10);
                if (!xpName || !Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
                    socket.emit('admin_response', { success: false, message: 'Paramètres XP invalides' });
                    break;
                }

                const entry = ensureXPEntry(xpName);
                entry.xp = Math.max(0, (entry.xp || 0) + amount);
                const levelData = getLevelFromXP(entry.xp);
                entry.level = levelData.level;
                saveXPData();

                const targetSid = findSocketIdByUsername(xpName);
                if (targetSid) {
                    io.to(targetSid).emit('xp_data', buildXPDataPayload(xpName));
                }

                socket.emit('admin_response', { success: true, message: `${xpName}: +${amount} XP (total ${entry.xp})` });
                logActivity('ADMIN', 'XP ajouté', { admin: adminName, target: xpName, amount, totalXP: entry.xp });
                break;
            }

            case 'xp_set': {
                const xpName = resolveXPUsername(target);
                const amount = parseInt(data.amount, 10);
                if (!xpName || !Number.isFinite(amount) || amount < 0 || amount > 100000000) {
                    socket.emit('admin_response', { success: false, message: 'Paramètres XP invalides' });
                    break;
                }

                const entry = ensureXPEntry(xpName);
                entry.xp = amount;
                const levelData = getLevelFromXP(entry.xp);
                entry.level = levelData.level;
                saveXPData();

                const targetSid = findSocketIdByUsername(xpName);
                if (targetSid) {
                    io.to(targetSid).emit('xp_data', buildXPDataPayload(xpName));
                }

                socket.emit('admin_response', { success: true, message: `${xpName}: XP défini à ${amount}` });
                logActivity('ADMIN', 'XP défini', { admin: adminName, target: xpName, totalXP: amount });
                break;
            }


            case 'live_ops_get': {
                refreshLiveOpsState();
                socket.emit('season_event_state', getLiveOpsPayload());
                socket.emit('admin_response', { success: true, message: 'Etat saison/event transmis' });
                break;
            }

            case 'season_update': {
                const wantedNumber = parseInt(data.seasonNumber, 10);
                const wantedYear = parseInt(data.seasonYear, 10);
                const wantedLabel = String(data.seasonLabel || '').trim();
                const wantedMultiplier = Number(data.xpMultiplier);

                if (Number.isFinite(wantedNumber) && wantedNumber > 0) {
                    liveOpsState.season.number = Math.min(999, wantedNumber);
                }
                if (wantedLabel) {
                    liveOpsState.season.label = wantedLabel.substring(0, 70);
                }
                if (Number.isFinite(wantedYear) && wantedYear >= 2000 && wantedYear <= 2200) {
                    liveOpsState.season.year = wantedYear;
                }
                if (Number.isFinite(wantedMultiplier)) {
                    liveOpsState.season.xpMultiplier = Math.min(10, Math.max(0.5, wantedMultiplier));
                }
                if (!liveOpsState.season.startedAt) {
                    liveOpsState.season.startedAt = new Date().toISOString();
                }

                saveLiveOpsState();
                broadcastLiveOpsState();
                socket.emit('admin_response', {
                    success: true,
                    message: `Saison ${liveOpsState.season.number} mise a jour (x${liveOpsState.season.xpMultiplier.toFixed(2)})`
                });
                logActivity('ADMIN', 'Saison mise a jour', {
                    admin: adminName,
                    season: liveOpsState.season
                });
                break;
            }

            case 'live_ops_settings_update': {
                const autoModeEnabled = !!data.autoModeEnabled;
                const autoRotationHours = parseInt(data.autoRotationHours, 10);
                const bannerDisplayMode = String(data.bannerDisplayMode || '').toLowerCase() === 'always'
                    ? 'always'
                    : 'dismissible';

                liveOpsState.autoModeEnabled = autoModeEnabled;
                if (Number.isFinite(autoRotationHours) && autoRotationHours > 0) {
                    liveOpsState.autoRotationHours = Math.max(1, Math.min(24, autoRotationHours));
                }
                liveOpsState.eventRotationMinutes = liveOpsState.autoRotationHours * 60;
                liveOpsState.bannerDisplayMode = bannerDisplayMode;
                liveOpsState.nextRotationAt = liveOpsState.autoModeEnabled
                    ? computeNextLiveRotationTs(liveOpsState.autoRotationHours)
                    : 0;

                saveLiveOpsState();
                broadcastLiveOpsState();
                socket.emit('admin_response', {
                    success: true,
                    message: `Live ops: auto ${liveOpsState.autoModeEnabled ? 'active' : 'desactive'} · toutes ${liveOpsState.autoRotationHours}h · banniere ${liveOpsState.bannerDisplayMode === 'always' ? 'toujours visible' : 'fermable'}`
                });
                logActivity('ADMIN', 'Parametres live ops', {
                    admin: adminName,
                    autoModeEnabled: liveOpsState.autoModeEnabled,
                    autoRotationHours: liveOpsState.autoRotationHours,
                    bannerDisplayMode: liveOpsState.bannerDisplayMode
                });
                break;
            }

            case 'live_event_set': {
                const eventId = data.eventId || value;
                const durationMinutes = parseInt(data.duration, 10);
                const messageXpMultiplier = Number(data.messageXpMultiplier);
                const activated = activateLiveEvent(eventId, {
                    actor: adminName,
                    durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : LIVE_EVENT_DEFAULT_DURATION_MINUTES,
                    messageXpMultiplier: Number.isFinite(messageXpMultiplier) ? messageXpMultiplier : undefined,
                    announce: true
                });
                if (!activated) {
                    socket.emit('admin_response', { success: false, message: 'Event live introuvable' });
                    break;
                }
                socket.emit('admin_response', {
                    success: true,
                    message: `Event live lance: ${activated.title}`
                });
                logActivity('ADMIN', 'Event live lance', {
                    admin: adminName,
                    eventId: activated.id,
                    durationMinutes: Math.round((activated.endsAt - Date.now()) / 60000)
                });
                break;
            }

            case 'live_event_rotate': {
                const rotated = rotateLiveEvent({
                    actor: adminName,
                    announce: true,
                    durationMinutes: LIVE_EVENT_DEFAULT_DURATION_MINUTES
                });
                if (!rotated) {
                    socket.emit('admin_response', { success: false, message: 'Impossible de tourner l\'event live' });
                    break;
                }
                socket.emit('admin_response', { success: true, message: `Event tourne: ${rotated.title}` });
                logActivity('ADMIN', 'Event live tourne', { admin: adminName, eventId: rotated.id });
                break;
            }

            case 'live_event_end': {
                const ended = endLiveEvent({ actor: adminName, announce: true });
                if (!ended) {
                    socket.emit('admin_response', { success: false, message: 'Aucun event live actif' });
                    break;
                }
                socket.emit('admin_response', { success: true, message: 'Event live termine' });
                logActivity('ADMIN', 'Event live termine', { admin: adminName });
                break;
            }



            
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
                commitRuntimeSession();
                
                setTimeout(() => {
                    process.exit(0); // Fly.io redémarrera automatiquement
                }, 2000);
                break;
            
            case 'get_stats':
                const uptimeSeconds = getTotalUptimeSeconds();
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

            case 'screen_broadcast':
                // Broadcast a message on everyone's screen
                const sbText = (data.text || '').substring(0, 200);
                const sbStyle = ['info','warning','success','alert','fun'].includes(data.style) ? data.style : 'info';
                const sbDuration = Math.min(Math.max(parseInt(data.duration) || 5, 1), 30);
                io.emit('screen_broadcast', { text: sbText, style: sbStyle, duration: sbDuration });
                socket.emit('admin_response', { success: true, message: 'Message diffusé sur tous les écrans' });
                logActivity('ADMIN', `Screen broadcast: "${sbText}"`, { admin: adminName, style: sbStyle });
                break;

            case 'trigger_effect':
                // Trigger a visual effect on all clients
                const effect = ['confetti','shake','flash','matrix'].includes(data.effect) ? data.effect : null;
                if (effect) {
                    io.emit('admin_effect', { effect: effect });
                    socket.emit('admin_response', { success: true, message: `Effet "${effect}" déclenché` });
                    logActivity('ADMIN', `Effet visuel: ${effect}`, { admin: adminName });
                } else {
                    socket.emit('admin_response', { success: false, message: 'Effet non reconnu' });
                }
                break;
                
            case 'set_announcement':
                const annText = (data.value || '').substring(0, 500);
                if (annText) {
                    io.emit('server_announcement', { message: annText });
                    socket.emit('admin_response', { success: true, message: 'Annonce épinglée pour tous' });
                    logActivity('ADMIN', `Annonce: "${annText}"`, { admin: adminName });
                } else {
                    socket.emit('admin_response', { success: false, message: 'Texte vide' });
                }
                break;

            case 'clear_announcement':
                io.emit('server_announcement', { message: null });
                socket.emit('admin_response', { success: true, message: 'Annonce supprimée' });
                logActivity('ADMIN', 'Annonce supprimée', { admin: adminName });
                break;

            case 'set_server_name':
                const srvName = (data.value || '').substring(0, 50);
                if (srvName) {
                    io.emit('server_name_update', { name: srvName });
                    socket.emit('admin_response', { success: true, message: `Nom du serveur: ${srvName}` });
                    logActivity('ADMIN', `Nom du serveur changé: ${srvName}`, { admin: adminName });
                } else {
                    socket.emit('admin_response', { success: false, message: 'Nom vide' });
                }
                break;

            case 'set_welcome_message':
                const welcomeMsg = (data.value || '').substring(0, 500);
                io.emit('welcome_message_update', { message: welcomeMsg });
                socket.emit('admin_response', { success: true, message: 'Message de bienvenue mis à jour' });
                logActivity('ADMIN', `Message de bienvenue: "${welcomeMsg}"`, { admin: adminName });
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

    socket.on('admin_logout', (data) => {
        const user = connectedUsers.get(socket.id);
        const username = String(data?.username || user?.username || '').trim();
        if (!username) return;
        const idx = adminUsersList.indexOf(username);
        if (idx > -1) {
            adminUsersList.splice(idx, 1);
            io.emit('admin_list_update', { admins: adminUsersList });
            logActivity('ADMIN', `${username} s'est déconnecté du mode admin`);
        }
    });

    // === ADMIN CHANNEL MANAGEMENT ===
    socket.on('admin_get_channel_config', (data) => {
        const adminPassword = process.env.ADMIN_PASSWORD || 'IndieGabVR2024';
        if (data?.password !== adminPassword) return;
        socket.emit('channel_config', channelConfig);
    });

    socket.on('admin_channel_action', (data) => {
        const adminPassword = process.env.ADMIN_PASSWORD || 'IndieGabVR2024';
        if (data?.password !== adminPassword) {
            socket.emit('admin_response', { success: false, message: 'Non autorisé' });
            return;
        }
        const { action } = data;
        switch (action) {
            case 'create_text': {
                const name = String(data.name || '').trim().toLowerCase();
                const icon = String(data.icon || '#').trim();
                const category = String(data.category || '💬 Discussion').trim();
                if (!name || name.length > 30) { socket.emit('admin_response', { success: false, message: 'Nom invalide (1-30 caractères)' }); return; }
                if (channelConfig.channels.some(c => c.name === name)) { socket.emit('admin_response', { success: false, message: 'Ce salon existe déjà' }); return; }
                channelConfig.channels.push({ name, icon, category });
                if (!channelConfig.categories.includes(category)) channelConfig.categories.push(category);
                AVAILABLE_CHANNELS = channelConfig.channels.map(c => c.name);
                if (!channelHistories[name]) { channelHistories[name] = []; channelReactions[name] = {}; }
                saveChannelConfig(); saveChannelHistories();
                io.emit('channel_config_update', channelConfig);
                socket.emit('admin_response', { success: true, message: `Salon #${name} créé` });
                logActivity('ADMIN', `Salon #${name} créé`, { icon, category });
                break;
            }
            case 'create_voice': {
                const name = String(data.name || '').trim();
                const icon = String(data.icon || '🔊').trim();
                if (!name || name.length > 30) { socket.emit('admin_response', { success: false, message: 'Nom invalide' }); return; }
                if (channelConfig.voiceChannels.some(c => c.name === name)) { socket.emit('admin_response', { success: false, message: 'Ce vocal existe déjà' }); return; }
                channelConfig.voiceChannels.push({ name, icon });
                VOICE_CHANNELS = channelConfig.voiceChannels.map(c => c.name);
                voiceRooms[name] = { participants: new Map() };
                saveChannelConfig();
                io.emit('channel_config_update', channelConfig);
                socket.emit('admin_response', { success: true, message: `Vocal "${name}" créé` });
                logActivity('ADMIN', `Vocal "${name}" créé`);
                break;
            }
            case 'delete_text': {
                const name = String(data.name || '').trim();
                if (name === 'général') { socket.emit('admin_response', { success: false, message: 'Impossible de supprimer #général' }); return; }
                const idx = channelConfig.channels.findIndex(c => c.name === name);
                if (idx === -1) { socket.emit('admin_response', { success: false, message: 'Salon non trouvé' }); return; }
                channelConfig.channels.splice(idx, 1);
                AVAILABLE_CHANNELS = channelConfig.channels.map(c => c.name);
                saveChannelConfig();
                io.emit('channel_config_update', channelConfig);
                socket.emit('admin_response', { success: true, message: `Salon #${name} supprimé` });
                logActivity('ADMIN', `Salon #${name} supprimé`);
                break;
            }
            case 'delete_voice': {
                const name = String(data.name || '').trim();
                const idx = channelConfig.voiceChannels.findIndex(c => c.name === name);
                if (idx === -1) { socket.emit('admin_response', { success: false, message: 'Vocal non trouvé' }); return; }
                // Kick everyone from this voice channel first
                if (voiceRooms[name]) {
                    for (const [sid] of voiceRooms[name].participants) {
                        const s = io.sockets.sockets.get(sid);
                        if (s) s.emit('voice_force_disconnect', { reason: 'Salon vocal supprimé' });
                    }
                    delete voiceRooms[name];
                }
                channelConfig.voiceChannels.splice(idx, 1);
                VOICE_CHANNELS = channelConfig.voiceChannels.map(c => c.name);
                saveChannelConfig();
                io.emit('channel_config_update', channelConfig);
                socket.emit('admin_response', { success: true, message: `Vocal "${name}" supprimé` });
                logActivity('ADMIN', `Vocal "${name}" supprimé`);
                break;
            }
            case 'edit_text': {
                const oldName = String(data.oldName || '').trim();
                const ch = channelConfig.channels.find(c => c.name === oldName);
                if (!ch) { socket.emit('admin_response', { success: false, message: 'Salon non trouvé' }); return; }
                if (data.icon) ch.icon = String(data.icon).trim();
                if (data.category) {
                    ch.category = String(data.category).trim();
                    if (!channelConfig.categories.includes(ch.category)) channelConfig.categories.push(ch.category);
                }
                if (data.newName && data.newName !== oldName) {
                    const newName = String(data.newName).trim().toLowerCase();
                    if (channelConfig.channels.some(c => c.name === newName)) { socket.emit('admin_response', { success: false, message: 'Ce nom existe déjà' }); return; }
                    // Migrate history
                    if (channelHistories[oldName]) { channelHistories[newName] = channelHistories[oldName]; delete channelHistories[oldName]; }
                    if (channelReactions[oldName]) { channelReactions[newName] = channelReactions[oldName]; delete channelReactions[oldName]; }
                    ch.name = newName;
                    AVAILABLE_CHANNELS = channelConfig.channels.map(c => c.name);

                    // Migrate users currently in the old channel to keep server state in sync
                    connectedUsers.forEach((u, sid) => {
                        if (u && u.currentChannel === oldName) {
                            u.currentChannel = newName;
                            connectedUsers.set(sid, u);
                        }
                    });

                    saveChannelHistories();
                    // Migrate users currently in the old channel
                    io.emit('channel_renamed', { oldName, newName });
                }
                saveChannelConfig();
                io.emit('channel_config_update', channelConfig);
                socket.emit('admin_response', { success: true, message: `Salon modifié` });
                logActivity('ADMIN', `Salon modifié: ${oldName}`, data);
                break;
            }
            case 'edit_voice': {
                const oldName = String(data.oldName || '').trim();
                const vc = channelConfig.voiceChannels.find(c => c.name === oldName);
                if (!vc) { socket.emit('admin_response', { success: false, message: 'Vocal non trouvé' }); return; }
                if (data.icon) vc.icon = String(data.icon).trim();
                if (data.newName && data.newName !== oldName) {
                    const newName = String(data.newName).trim();
                    if (channelConfig.voiceChannels.some(c => c.name === newName)) { socket.emit('admin_response', { success: false, message: 'Ce nom existe déjà' }); return; }
                    if (voiceRooms[oldName]) { voiceRooms[newName] = voiceRooms[oldName]; delete voiceRooms[oldName]; }
                    vc.name = newName;
                    VOICE_CHANNELS = channelConfig.voiceChannels.map(c => c.name);
                }
                saveChannelConfig();
                io.emit('channel_config_update', channelConfig);
                socket.emit('admin_response', { success: true, message: `Vocal modifié` });
                logActivity('ADMIN', `Vocal modifié: ${oldName}`, data);
                break;
            }
            case 'reorder': {
                if (Array.isArray(data.channels)) {
                    // Validate all names exist
                    const valid = data.channels.every(n => channelConfig.channels.some(c => c.name === n));
                    if (valid && data.channels.length === channelConfig.channels.length) {
                        const reordered = data.channels.map(n => channelConfig.channels.find(c => c.name === n));
                        channelConfig.channels = reordered;
                        AVAILABLE_CHANNELS = reordered.map(c => c.name);
                        saveChannelConfig();
                        io.emit('channel_config_update', channelConfig);
                        socket.emit('admin_response', { success: true, message: 'Ordre mis à jour' });
                    }
                }
                if (Array.isArray(data.voiceChannels)) {
                    const valid = data.voiceChannels.every(n => channelConfig.voiceChannels.some(c => c.name === n));
                    if (valid && data.voiceChannels.length === channelConfig.voiceChannels.length) {
                        const reordered = data.voiceChannels.map(n => channelConfig.voiceChannels.find(c => c.name === n));
                        channelConfig.voiceChannels = reordered;
                        VOICE_CHANNELS = reordered.map(c => c.name);
                        saveChannelConfig();
                        io.emit('channel_config_update', channelConfig);
                        socket.emit('admin_response', { success: true, message: 'Ordre vocal mis à jour' });
                    }
                }
                break;
            }
            case 'add_category': {
                const cat = String(data.category || '').trim();
                if (!cat) { socket.emit('admin_response', { success: false, message: 'Nom vide' }); return; }
                if (!channelConfig.categories.includes(cat)) {
                    channelConfig.categories.push(cat);
                    saveChannelConfig();
                    io.emit('channel_config_update', channelConfig);
                    socket.emit('admin_response', { success: true, message: `Catégorie "${cat}" ajoutée` });
                }
                break;
            }
            case 'delete_category': {
                const cat = String(data.category || '').trim();
                channelConfig.categories = channelConfig.categories.filter(c => c !== cat);
                // Move orphaned channels to first category
                channelConfig.channels.forEach(ch => { if (ch.category === cat) ch.category = channelConfig.categories[0] || '💬 Discussion'; });
                saveChannelConfig();
                io.emit('channel_config_update', channelConfig);
                socket.emit('admin_response', { success: true, message: `Catégorie supprimée` });
                break;
            }
            default:
                socket.emit('admin_response', { success: false, message: 'Action inconnue' });
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
            const { username, avatar, accessCode, deviceId } = userData;
            
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
            const safeDeviceId = String(deviceId || '').trim().substring(0, 80) || `device_${socket.id.substring(0, 8)}`;

            const existingSocketSession = connectedUsers.get(socket.id);
            if (existingSocketSession) {
                if (normalizeUsernameKey(existingSocketSession.username) === normalizeUsernameKey(cleanUsername)) {
                    existingSocketSession.avatar = avatar || existingSocketSession.avatar || '';
                    existingSocketSession.lastActivity = new Date();
                    connectedUsers.set(socket.id, existingSocketSession);
                    updateUsersList();
                    return;
                }
                evictSocketConnection(socket.id, { skipUsersRefresh: true });
            }
            
            // === VÉRIFICATION COMPTE PROTÉGÉ ===
            const accountKey = cleanUsername.toLowerCase();
            if (accounts[accountKey] && !authenticatedSockets.has(socket.id)) {
                socket.emit('account_required', { message: 'Ce pseudo est protégé par un mot de passe. Entrez votre mot de passe.' });
                return;
            }
            
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
            
            const allowMultiDevice = !!accounts[accountKey] && authenticatedSockets.has(socket.id);
            const hadPresenceBeforeCleanup = getSocketsForUsername(cleanUsername).length > 0;

            // Reconnexion même compte/même appareil: remplace les sockets obsolètes.
            const staleSocketIds = getSocketsForUsername(cleanUsername).filter((sid) => {
                if (sid === socket.id) return false;
                const existing = connectedUsers.get(sid);
                return !!existing && existing.deviceId === safeDeviceId;
            });
            staleSocketIds.forEach((sid) => {
                evictSocketConnection(sid, { skipUsersRefresh: true });
            });

            const hasAnotherActiveSocket = getSocketsForUsername(cleanUsername).length > 0;
            if (hasAnotherActiveSocket && !allowMultiDevice) {
                logActivity('ERROR', `Tentative d'utilisation d'un pseudo déjà pris`, {
                    socketId: socket.id,
                    username: cleanUsername,
                    ip: clientIp,
                    existingSocketId: getSocketsForUsername(cleanUsername)[0] || null
                });
                socket.emit('username_taken', { message: 'Ce pseudo est déjà pris!' });
                return;
            }

            // Ajouter l'utilisateur
            const userInfo = {
                id: socket.id,
                username: cleanUsername,
                avatar: avatar || '',
                deviceId: safeDeviceId,
                joinTime: new Date(),
                ip: clientIp,
                lastActivity: new Date(),
                messagesCount: 0,
                repliesCount: 0
            };
            
            connectedUsers.set(socket.id, userInfo);
            registerUserSocket(cleanUsername, socket.id);
            emitMultiDevicePresence(cleanUsername);
            observability.sockets.currentAuthenticatedUsers = connectedUsers.size;

            // === DAILY XP BONUS + STREAK (simple progression) ===
            const xpEntry = ensureXPEntry(cleanUsername);
            const todayKey = getDayKey();
            const yesterdayKey = getPreviousDayKey();
            let loginBonusAwarded = null;

            if (xpEntry.lastLoginDay !== todayKey) {
                if (xpEntry.lastLoginDay === yesterdayKey) {
                    xpEntry.streakDays = (xpEntry.streakDays || 0) + 1;
                } else {
                    xpEntry.streakDays = 1;
                }
                xpEntry.lastLoginDay = todayKey;
                ensureDailyMissionsForEntry(xpEntry);

                const streakBonus = Math.min((xpEntry.streakDays - 1) * DAILY_LOGIN_STREAK_STEP, DAILY_LOGIN_STREAK_MAX_BONUS);
                const bonusXP = DAILY_LOGIN_XP_BONUS + streakBonus;
                xpEntry.xp = Math.max(0, (xpEntry.xp || 0) + bonusXP);
                xpEntry.level = getLevelFromXP(xpEntry.xp).level;

                loginBonusAwarded = {
                    bonusXP,
                    streakDays: xpEntry.streakDays
                };
                saveXPData();
            }

            // Sauvegarder le profil
            const existingProfile = userProfiles.get(cleanUsername) || {};
            userProfiles.set(cleanUsername, {
                username: cleanUsername,
                avatar: userInfo.avatar,
                lastSeen: new Date(),
                joinCount: (existingProfile.joinCount || 0) + (hadPresenceBeforeCleanup ? 0 : 1),
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
            socket.emit('channel_config_update', channelConfig);
            refreshLiveOpsState();
            socket.emit('season_event_state', getLiveOpsPayload());
            socket.emit('voice_runtime_config', {
                mode: VOICE_RUNTIME_MODE === 'sfu' ? 'sfu' : 'p2p',
                sfuEnabled: VOICE_RUNTIME_MODE === 'sfu',
                provider: VOICE_SFU_PROVIDER,
                signalingUrl: VOICE_SFU_SIGNALING_URL,
                publicWsUrl: VOICE_SFU_PUBLIC_WS
            });

            const usernameKey = normalizeUsernameKey(cleanUsername);
            const syncSnapshot = multiDeviceSyncState.get(usernameKey) || null;
            if (syncSnapshot) {
                socket.emit('sync_state_snapshot', {
                    updatedAt: syncSnapshot.updatedAt || Date.now(),
                    byDevice: syncSnapshot.byDevice || {}
                });
            }
            
            // Send new feature data
            socket.emit('xp_data', buildXPDataPayload(cleanUsername));
            emitFriendsListTo(cleanUsername);
            socket.emit('bookmarks_list', { bookmarks: userBookmarks[cleanUsername] || [] });
            socket.emit('reminders_list', { reminders: (reminders[cleanUsername] || []).filter(r => r.triggerAt > Date.now()) });
            socket.emit('seasonal_quests_state', buildSeasonalQuestsPayload(cleanUsername));
            socket.emit('social_recommendations', { recommendations: buildSocialRecommendations(cleanUsername, 6) });
            socket.emit('e2ee_key_directory', { username: cleanUsername, keys: getE2EEPublicKeys(cleanUsername) });

            if (loginBonusAwarded) {
                socket.emit('xp_daily_bonus', loginBonusAwarded);
            }
            
            // Envoyer l'état des salons vocaux
            for (const [room, data] of Object.entries(voiceRooms)) {
                socket.emit('voice_participants_update', { room, participants: getVoiceParticipants(room) });
            }
            
            logActivity('SYSTEM', `Historique envoyé à ${cleanUsername}`, {
                messagesCount: chatHistory.length,
                reactionsCount: Object.keys(messageReactions).length
            });
            
            // Message de présence uniquement à la première connexion active du compte.
            // On enregistre dans l'historique de présence (pas dans le chat).
            if (!hadPresenceBeforeCleanup) {
                addPresenceEntry(cleanUsername, 'join');
            }
            
            // Envoyer l'historique de présence au nouvel utilisateur
            socket.emit('presence_history_sync', presenceHistory);
            
            // Signal que le join est complet
            socket.emit('user_join_ready', { username: cleanUsername });
            
            // Envoyer la liste des utilisateurs connectés
            updateUsersList();
            
            // Notifier les amis seulement lors d'une vraie transition offline -> online.
            if (!hadPresenceBeforeCleanup) {
                notifyFriendsOfStatusChange(cleanUsername);
            }
            
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

    let lastAIResponse = 0;
    async function generateAIResponse(userMessage, username, channel) {
        const now = Date.now();
        if (now - lastAIResponse < 3000) return;
        lastAIResponse = now;

        try {
            const systemPrompt = `Tu es GeminiBot, l'IA de DocSpace. Tu réponds en français de façon naturelle, vivante et conversationnelle.
Tu restes respectueux, utile, et plutôt court (max 200 mots). Tu peux utiliser quelques emojis avec modération.`;

            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nUtilisateur (${username}) : ${userMessage}` }] }],
                    generationConfig: {
                        temperature: 0.9,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 512,
                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
                    ]
                })
            });

            if (!response.ok) return;
            const data = await response.json();
            const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!aiText) return;

            const botMessage = {
                type: 'user',
                id: messageId++,
                username: '🤖 GeminiBot',
                avatar: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d4735304ff6292a690345.svg',
                content: aiText.substring(0, 500),
                timestamp: new Date(),
                userId: 'gemini-bot',
                replyTo: null,
                attachment: null,
                channel: channel,
                isBot: true
            };

            addToChannelHistory(botMessage, channel);
            addToHistory(botMessage);
            io.emit('new_message', botMessage);
            serverStats.totalMessages++;
            saveHistory();
            saveChannelHistories();
        } catch (error) {
            logActivity('ERROR', 'Erreur auto-réponse IA', { error: error.message });
        }
    }

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

            // === AUTO-MODERATION CHECK ===
            if (messageData.content) {
                const modResult = checkAutoMod(user.username, messageData.content);
                if (!modResult.allowed) {
                    socket.emit('automod_blocked', { reason: modResult.reason });
                    return;
                }
            }

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
                nameEffect: getActiveNameEffect(user.username),
                avatar: user.avatar,
                content: messageData.content ? messageData.content.trim().substring(0, 500) : '',
                timestamp: new Date(),
                userId: socket.id,
                replyTo: messageData.replyTo || null,
                attachment: messageData.attachment || null,
                channel: channel // Ajouter le salon au message
            };

            if (message.attachment && typeof message.attachment === 'object' && message.attachment.isVoiceClip) {
                const clipMime = String(message.attachment.mimetype || '');
                const clipSize = Number(message.attachment.size || 0);
                const clipDuration = Number(message.attachment.duration || 0);
                if (!clipMime.startsWith('audio/')) {
                    socket.emit('error', { message: 'Clip vocal invalide (format)' });
                    return;
                }
                if (!Number.isFinite(clipSize) || clipSize <= 0 || clipSize > 8 * 1024 * 1024) {
                    socket.emit('error', { message: 'Clip vocal invalide (taille max 8MB)' });
                    return;
                }
                if (!Number.isFinite(clipDuration) || clipDuration <= 0 || clipDuration > 25) {
                    socket.emit('error', { message: 'Clip vocal invalide (max 20s)' });
                    return;
                }
                message.attachment.clipLabel = String(message.attachment.clipLabel || '').substring(0, 80);
            }

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
            
            // === XP SYSTEM ===
            const xpEntry = ensureXPEntry(user.username);
            xpEntry.totalMessages++;
            const xpResult = grantXP(user.username, XP_PER_MESSAGE, {
                source: 'message',
                multiplier: getLiveMessageXpMultiplier()
            });
            if (xpResult && xpResult.levelUp) {
                io.emit('system_message', {
                    type: 'system',
                    message: `🎉 ${user.username} a atteint le niveau ${xpResult.newLevel} !`,
                    timestamp: new Date(),
                    id: messageId++
                });
            }

            const missionRewards = applyMissionProgress(user.username, { messages: 1 });
            for (const reward of missionRewards) {
                socket.emit('daily_mission_reward', {
                    missionKey: reward.key,
                    missionLabel: reward.label,
                    rewardXP: reward.rewardXP
                });
                if (reward.levelUp) {
                    io.emit('system_message', {
                        type: 'system',
                        message: `🎉 ${user.username} a atteint le niveau ${reward.newLevel} !`,
                        timestamp: new Date(),
                        id: messageId++
                    });
                }
            }
            socket.emit('xp_data', buildXPDataPayload(user.username));
            saveXPData();
            
            // Sauvegarder l'historique après chaque message
            saveHistory();
            saveChannelHistories();

            if (channel === 'ia' && message.content && !message.content.startsWith('🤖')) {
                setTimeout(() => {
                    generateAIResponse(message.content, user.username, channel);
                }, 500);
            }
            
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

        const channel = typeof data === 'string' ? data : data?.channel;
        const previousChannel = typeof data === 'string' ? user.currentChannel : data?.previousChannel;
        
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

    // Mise à jour de la bio
    socket.on('update_bio', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const bio = String(data?.bio || '').slice(0, 300).trim();
        const profile = userProfiles.get(user.username) || {};
        profile.bio = bio;
        profile.lastUpdate = new Date();
        userProfiles.set(user.username, profile);
        saveProfiles();
        socket.emit('bio_updated', { bio });
    });

    // Mise à jour couleur/gradient de profil
    socket.on('update_profile_color', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const xpEntry = ensureXPEntry(user.username);
        const level = getLevelFromXP(xpEntry.xp || 0).level;
        const profile = userProfiles.get(user.username) || {};
        const type = data?.type; // 'solid' or 'gradient'
        if (type === 'gradient') {
            if (level < 10) {
                socket.emit('profile_color_error', { message: 'Niveau 10 requis pour les dégradés' });
                return;
            }
            const color1 = String(data?.color1 || '#5865F2').slice(0, 7);
            const color2 = String(data?.color2 || '#9b59b6').slice(0, 7);
            if (!/^#[0-9a-fA-F]{6}$/.test(color1) || !/^#[0-9a-fA-F]{6}$/.test(color2)) {
                socket.emit('profile_color_error', { message: 'Couleur invalide' });
                return;
            }
            profile.profileGradient = `linear-gradient(135deg, ${color1}, ${color2})`;
            profile.profileColor = null;
        } else {
            const color = String(data?.color || '#5865F2').slice(0, 7);
            if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
                socket.emit('profile_color_error', { message: 'Couleur invalide' });
                return;
            }
            profile.profileColor = color;
            profile.profileGradient = null;
        }
        profile.lastUpdate = new Date();
        userProfiles.set(user.username, profile);
        saveProfiles();
        socket.emit('profile_color_updated', { profileColor: profile.profileColor, profileGradient: profile.profileGradient });
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

    socket.on('sync_state_request', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const key = normalizeUsernameKey(user.username);
        const snapshot = multiDeviceSyncState.get(key);
        socket.emit('sync_state_snapshot', {
            updatedAt: snapshot?.updatedAt || Date.now(),
            byDevice: snapshot?.byDevice || {}
        });
    });

    socket.on('sync_state_update', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const key = normalizeUsernameKey(user.username);
        const safeDeviceId = String(data?.deviceId || user.deviceId || '').trim().substring(0, 80) || `device_${socket.id.substring(0, 8)}`;
        const patch = data?.patch && typeof data.patch === 'object' ? data.patch : {};

        const allowedPatch = {
            activeChannel: typeof patch.activeChannel === 'string' ? patch.activeChannel.substring(0, 64) : undefined,
            voiceRoom: typeof patch.voiceRoom === 'string' ? patch.voiceRoom.substring(0, 64) : (patch.voiceRoom === null ? null : undefined),
            draft: typeof patch.draft === 'string' ? patch.draft.substring(0, 800) : undefined,
            focus: typeof patch.focus === 'string' ? patch.focus.substring(0, 32) : undefined
        };

        const current = multiDeviceSyncState.get(key) || { updatedAt: Date.now(), byDevice: {} };
        const previousDeviceState = current.byDevice[safeDeviceId] || {};
        const nextDeviceState = {
            ...previousDeviceState,
            ...Object.fromEntries(Object.entries(allowedPatch).filter(([, value]) => value !== undefined)),
            updatedAt: Date.now()
        };
        current.byDevice[safeDeviceId] = nextDeviceState;
        current.updatedAt = Date.now();
        multiDeviceSyncState.set(key, current);

        const sockets = getSocketsForUsername(user.username);
        sockets.forEach((targetSocketId) => {
            if (targetSocketId === socket.id) return;
            io.to(targetSocketId).emit('sync_state_remote_update', {
                fromSocketId: socket.id,
                fromDeviceId: safeDeviceId,
                patch: nextDeviceState,
                updatedAt: current.updatedAt
            });
        });
    });

    socket.on('get_seasonal_quests', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        socket.emit('seasonal_quests_state', buildSeasonalQuestsPayload(user.username));
    });

    socket.on('get_social_recommendations', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const limit = Math.max(1, Math.min(10, Number(data?.limit) || 6));
        socket.emit('social_recommendations', {
            recommendations: buildSocialRecommendations(user.username, limit)
        });
    });

    // E2EE alpha: le serveur ne voit que des blobs chiffrés et relaie les envelopes.
    socket.on('e2ee_key_publish', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const safeDeviceId = String(data?.deviceId || user.deviceId || '').trim().substring(0, 80) || `device_${socket.id.substring(0, 8)}`;
        upsertE2EEPublicKey(user.username, safeDeviceId, {
            fingerprint: data?.fingerprint,
            publicKey: data?.publicKey,
            algorithm: data?.algorithm
        });

        socket.emit('e2ee_key_directory', {
            username: user.username,
            keys: getE2EEPublicKeys(user.username)
        });
    });

    socket.on('get_e2ee_keys', (data) => {
        const requester = connectedUsers.get(socket.id);
        if (!requester) return;
        const wantedUsername = String(data?.username || requester.username).trim().substring(0, 40);
        if (!wantedUsername) return;

        socket.emit('e2ee_key_directory', {
            username: wantedUsername,
            keys: getE2EEPublicKeys(wantedUsername)
        });
    });

    socket.on('e2ee_message', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const targetUsername = String(data?.targetUsername || '').trim().substring(0, 40);
        const room = String(data?.room || '').trim().substring(0, 64);
        const envelope = {
            fromUsername: user.username,
            fromDeviceId: user.deviceId || null,
            targetUsername: targetUsername || null,
            room: room || null,
            algorithm: String(data?.algorithm || 'xchacha20poly1305').trim().substring(0, 64),
            ciphertext: String(data?.ciphertext || '').substring(0, 12000),
            nonce: String(data?.nonce || '').substring(0, 300),
            keyId: String(data?.keyId || '').substring(0, 200),
            metadata: data?.metadata && typeof data.metadata === 'object' ? data.metadata : {},
            sentAt: Date.now()
        };

        if (!envelope.ciphertext) return;

        if (targetUsername) {
            getSocketsForUsername(targetUsername).forEach((targetSocketId) => {
                io.to(targetSocketId).emit('e2ee_message', envelope);
            });
            return;
        }

        if (room && voiceRooms[room]) {
            socket.to('voice_' + room).emit('e2ee_message', envelope);
        }
    });

    socket.on('e2ee_file_manifest', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;

        const targetUsername = String(data?.targetUsername || '').trim().substring(0, 40);
        if (!targetUsername) return;

        const manifest = {
            fromUsername: user.username,
            fromDeviceId: user.deviceId || null,
            targetUsername,
            fileName: String(data?.fileName || 'encrypted.bin').substring(0, 180),
            cipherBlobPath: String(data?.cipherBlobPath || '').substring(0, 500),
            cipherBlobSha256: String(data?.cipherBlobSha256 || '').substring(0, 128),
            wrappedKey: String(data?.wrappedKey || '').substring(0, 10000),
            nonce: String(data?.nonce || '').substring(0, 300),
            algorithm: String(data?.algorithm || 'xchacha20poly1305').substring(0, 64),
            sentAt: Date.now()
        };

        if (!manifest.cipherBlobPath || !manifest.wrappedKey) return;

        getSocketsForUsername(targetUsername).forEach((targetSocketId) => {
            io.to(targetSocketId).emit('e2ee_file_manifest', manifest);
        });
    });

    socket.on('voice_sfu_signal', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        observability.voice.sfuSignals += 1;

        const targetId = data?.targetId;
        const room = data?.room;
        const payload = {
            fromId: socket.id,
            fromUsername: user.username,
            type: data?.type || 'signal',
            data: data?.data || null,
            room: room || null
        };

        if (targetId) {
            io.to(targetId).emit('voice_sfu_signal', payload);
            return;
        }

        if (room && voiceRooms[room]) {
            socket.to('voice_' + room).emit('voice_sfu_signal', payload);
        }
    });

    socket.on('voice_reconnect_intent', () => {
        observability.voice.reconnectIntents += 1;
    });


    socket.on('get_presence_history', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        socket.emit('presence_history_sync', presenceHistory.slice(-MAX_PRESENCE_HISTORY));
    });

    // === VOCAL WebRTC ===
    
    // Rejoindre un salon vocal
    socket.on('voice_join', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const room = data.room;
        if (!voiceRooms[room]) return;
        
        // Quitter l'ancien salon vocal si nécessaire
        for (const [rName, rData] of Object.entries(voiceRooms)) {
            if (rData.participants.has(socket.id)) {
                rData.participants.delete(socket.id);
                socket.leave('voice_' + rName);
                socket.to('voice_' + rName).emit('voice_peer_left', { socketId: socket.id });
                io.emit('voice_participants_update', { room: rName, participants: getVoiceParticipants(rName) });
            }
        }
        
        // Rejoindre le nouveau salon
        voiceRooms[room].participants.set(socket.id, {
            username: user.username,
            avatar: user.avatar || '',
            muted: false,
            deafened: false,
            video: false,
            screen: false,
            speaking: false
        });
        socket.join('voice_' + room);
        
        // Notifier les autres participants pour qu'ils créent des connexions WebRTC
        const otherParticipants = [];
        voiceRooms[room].participants.forEach((pData, pId) => {
            if (pId !== socket.id) {
                otherParticipants.push({ socketId: pId, username: pData.username, avatar: pData.avatar || connectedUsers.get(pId)?.avatar || '', video: !!pData.video, screen: !!pData.screen });
            }
        });
        
        // Envoyer la liste des participants existants au nouvel arrivant
        socket.emit('voice_joined', { room, participants: otherParticipants });
        
        // Notifier tous les clients de la mise à jour des participants
        io.emit('voice_participants_update', { room, participants: getVoiceParticipants(room) });
        
        logActivity('VOICE', `${user.username} a rejoint ${room}`, { room });
    });
    
    // R5: explicit vocal resync. A client can request the authoritative room snapshot
    // after reconnect/F12/device changes instead of relying on one transient event.
    socket.on('voice_sync_request', (data = {}) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        let room = String(data.room || '').trim();
        if (!room || !voiceRooms[room]?.participants?.has(socket.id)) {
            room = Object.entries(voiceRooms).find(([, rData]) => rData.participants.has(socket.id))?.[0] || '';
        }
        if (!room || !voiceRooms[room]) {
            socket.emit('voice_sync_snapshot', { room: null, participants: [] });
            return;
        }
        socket.emit('voice_sync_snapshot', { room, participants: getVoiceParticipants(room) });
    });

    // Quitter le salon vocal
    socket.on('voice_leave', () => {
        const user = connectedUsers.get(socket.id);
        for (const [rName, rData] of Object.entries(voiceRooms)) {
            if (rData.participants.has(socket.id)) {
                rData.participants.delete(socket.id);
                socket.leave('voice_' + rName);
                io.emit('voice_participants_update', { room: rName, participants: getVoiceParticipants(rName) });
                socket.to('voice_' + rName).emit('voice_peer_left', { socketId: socket.id });
                if (user) logActivity('VOICE', `${user.username} a quitté ${rName}`, { room: rName });
            }
        }
    });
    
    // Signaling WebRTC - Offer
    socket.on('voice_offer', (data) => {
        const { targetId, offer } = data;
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        observability.voice.offers += 1;
        io.to(targetId).emit('voice_offer', { fromId: socket.id, fromUsername: user.username, offer });
    });
    
    // Signaling WebRTC - Answer
    socket.on('voice_answer', (data) => {
        const { targetId, answer } = data;
        observability.voice.answers += 1;
        io.to(targetId).emit('voice_answer', { fromId: socket.id, answer });
    });
    
    // Signaling WebRTC - ICE Candidate
    socket.on('voice_ice_candidate', (data) => {
        const { targetId, candidate } = data;
        observability.voice.iceCandidates += 1;
        io.to(targetId).emit('voice_ice_candidate', { fromId: socket.id, candidate });
    });

    // Sonde de latence (ping UI côté client)
    socket.on('voice_ping_probe', (data, ack) => {
        if (typeof ack === 'function') {
            ack({
                serverTime: Date.now(),
                clientSentAt: data && data.sentAt ? data.sentAt : null
            });
        }
    });
    
    // Détection de parole
    socket.on('voice_speaking', (data) => {
        for (const [rName, rData] of Object.entries(voiceRooms)) {
            const participant = rData.participants.get(socket.id);
            if (participant) {
                const speaking = !!data.speaking;
                const now = Date.now();
                const previous = !!participant.speaking;
                const lastEmit = Number(participant.speakingUpdatedAt || 0);
                if (previous !== speaking || now - lastEmit >= VOICE_SPEAKING_EVENT_THROTTLE_MS) {
                    participant.speaking = speaking;
                    participant.speakingUpdatedAt = now;
                    io.emit('voice_speaking_update', {
                        room: rName,
                        socketId: socket.id,
                        speaking
                    });
                }
                break;
            }
        }
    });

    // Mise à jour du statut vocal (mute, deafen, video, screen)
    socket.on('voice_status_update', (data) => {
        for (const [rName, rData] of Object.entries(voiceRooms)) {
            const participant = rData.participants.get(socket.id);
            if (participant) {
                if (data.muted !== undefined) participant.muted = data.muted;
                if (data.deafened !== undefined) participant.deafened = data.deafened;
                if (data.video !== undefined) participant.video = data.video;
                if (data.screen !== undefined) participant.screen = data.screen;
                io.emit('voice_participants_update', { room: rName, participants: getVoiceParticipants(rName) });
                break;
            }
        }
    });

    // Déconnexion
    socket.on('disconnect', (reason) => {
        const user = connectedUsers.get(socket.id);
        if (user) {
            const sessionDuration = Date.now() - user.joinTime.getTime();
            
            // Retirer des salons vocaux
            for (const [rName, rData] of Object.entries(voiceRooms)) {
                if (rData.participants.has(socket.id)) {
                    rData.participants.delete(socket.id);
                    io.emit('voice_participants_update', { room: rName, participants: getVoiceParticipants(rName) });
                    io.to('voice_' + rName).emit('voice_peer_left', { socketId: socket.id });
                }
            }
            
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
            authenticatedSockets.delete(socket.id);
            unregisterUserSocket(user.username, socket.id);
            removeE2EEPublicKey(user.username, user.deviceId);

            const remainingForUser = getSocketsForUsername(user.username).length;
            const isLastConnectionForUser = remainingForUser === 0;

            // Retirer de la liste admin uniquement si c'est la dernière connexion active.
            if (isLastConnectionForUser) {
                const adminIndex = adminUsersList.indexOf(user.username);
                if (adminIndex > -1) {
                    adminUsersList.splice(adminIndex, 1);
                    io.emit('admin_list_update', { admins: adminUsersList });
                }
            }

            emitMultiDevicePresence(user.username);
            observability.sockets.currentAuthenticatedUsers = connectedUsers.size;
            observability.sockets.currentTransportConnections = io.engine.clientsCount;
            observability.sockets.disconnections += 1;
            updateUsersList();

            if (isLastConnectionForUser) {
                addPresenceEntry(user.username, 'leave');

                // Notifier les amis uniquement lors d'une vraie transition online -> offline.
                notifyFriendsOfStatusChange(user.username);
            }
            
            logActivity('DISCONNECTION', `Utilisateur déconnecté`, {
                username: user.username,
                reason: reason,
                sessionDuration: `${Math.floor(sessionDuration / 1000)}s`,
                messagesInSession: user.messagesCount,
                repliesInSession: user.repliesCount,
                remainingUsers: connectedUsers.size,
                remainingSocketsForUser: remainingForUser
            });
        } else {
            observability.sockets.currentTransportConnections = io.engine.clientsCount;
            observability.sockets.disconnections += 1;
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
        
        const xpEntry = userXP[targetUsername] || {};
        const levelData = getLevelFromXP(xpEntry.xp || 0);
        const role = getRoleForLevel(levelData.level);
        const profile = {
            username: targetUsername,
            status: status,
            bio: savedProfile.bio || '',
            joinDate: savedProfile.firstJoin || savedProfile.joinedAt,
            messageCount: savedProfile.totalMessages || 0,
            avatar: savedProfile.avatar || (targetUser?.avatar),
            level: levelData.level,
            xp: xpEntry.xp || 0,
            role: role,
            profileColor: savedProfile.profileColor || null,
            profileGradient: savedProfile.profileGradient || null
        };
        
        socket.emit('user_profile', profile);
    });
    
    // === HANDLERS MESSAGES PRIVÉS (DM) — R5 SYNC ===
    socket.on('send_dm', (data, ack) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender) {
            if (typeof ack === 'function') ack({ success: false, message: 'Session non connectée' });
            return;
        }

        const requestedTarget = String(data?.to || '').trim();
        const target = resolveCanonicalUsername(requestedTarget);
        const content = String(data?.content || '').trim().substring(0, 4000);
        const attachment = data?.attachment || null;
        if (!target) {
            const payload = { success: false, message: 'Utilisateur introuvable' };
            socket.emit('dm_error', payload);
            if (typeof ack === 'function') ack(payload);
            return;
        }
        if (normalizeUsernameKey(target) === normalizeUsernameKey(sender.username)) {
            const payload = { success: false, message: 'Impossible de vous envoyer un DM à vous-même' };
            socket.emit('dm_error', payload);
            if (typeof ack === 'function') ack(payload);
            return;
        }
        if (!content && !attachment) return;

        const key = [normalizeUsernameKey(sender.username), normalizeUsernameKey(target)].sort().join(':');
        if (!dmHistory[key]) dmHistory[key] = [];

        const message = {
            id: crypto.randomUUID ? crypto.randomUUID() : `dm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            from: sender.username,
            to: target,
            content,
            attachment,
            timestamp: new Date().toISOString(),
            avatar: sender.avatar || getUserAvatarByName(sender.username)
        };
        dmHistory[key].push(message);
        if (dmHistory[key].length > 250) dmHistory[key] = dmHistory[key].slice(-250);
        saveDMs();

        // Serveur = source de vérité : confirmation à l'expéditeur + push à tous les appareils du destinataire.
        socket.emit('dm_sent', { ...message, peer: target, peerAvatar: getUserAvatarByName(target) });
        getSocketsForUsername(target).forEach((sid) => {
            io.to(sid).emit('dm_received', { ...message, avatar: message.avatar });
        });
        getSocketsForUsername(sender.username).forEach((sid) => {
            io.to(sid).emit('dm_conversations_changed', { peer: target });
        });
        getSocketsForUsername(target).forEach((sid) => {
            io.to(sid).emit('dm_conversations_changed', { peer: sender.username });
        });

        const result = { success: true, message };
        if (typeof ack === 'function') ack(result);
        logActivity('DM', 'Message privé envoyé', { from: sender.username, to: target, messageId: message.id });
    });

    socket.on('dm_typing_start', (data) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender) return;
        const target = resolveCanonicalUsername(data?.to);
        if (!target) return;
        getSocketsForUsername(target).forEach((sid) => io.to(sid).emit('dm_typing', {
            from: sender.username, avatar: sender.avatar || '', isTyping: true
        }));
    });

    socket.on('dm_typing_stop', (data) => {
        const sender = connectedUsers.get(socket.id);
        if (!sender) return;
        const target = resolveCanonicalUsername(data?.to);
        if (!target) return;
        getSocketsForUsername(target).forEach((sid) => io.to(sid).emit('dm_typing', {
            from: sender.username, avatar: sender.avatar || '', isTyping: false
        }));
    });

    socket.on('get_dm_conversations', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const me = normalizeUsernameKey(user.username);
        const conversations = [];
        Object.entries(dmHistory).forEach(([key, messages]) => {
            const users = key.split(':');
            if (!users.includes(me)) return;
            const otherKey = users[0] === me ? users[1] : users[0];
            const otherUser = resolveCanonicalUsername(otherKey) || otherKey;
            const lastMessage = messages.length ? messages[messages.length - 1] : null;
            conversations.push({
                username: otherUser,
                avatar: getUserAvatarByName(otherUser),
                online: getSocketsForUsername(otherUser).length > 0,
                lastMessage: lastMessage ? (lastMessage.content || (lastMessage.attachment ? '📎 Fichier' : '')).substring(0, 80) : '',
                lastTimestamp: lastMessage?.timestamp || null,
                lastSender: lastMessage?.from || null,
                unread: 0
            });
        });
        conversations.sort((a,b) => new Date(b.lastTimestamp || 0) - new Date(a.lastTimestamp || 0));
        socket.emit('dm_conversations', conversations);
    });

    socket.on('get_dm_history', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const target = resolveCanonicalUsername(data?.username) || String(data?.username || '').trim();
        if (!target) return;
        const key = [normalizeUsernameKey(user.username), normalizeUsernameKey(target)].sort().join(':');
        socket.emit('dm_history', {
            username: target,
            avatar: getUserAvatarByName(target),
            online: getSocketsForUsername(target).length > 0,
            messages: dmHistory[key] || []
        });
    });

    // =========================================
    // === ACCOUNT SYSTEM ===
    // =========================================
    socket.on('register_account', (data) => {
        const { username, password } = data;
        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
            socket.emit('account_error', { message: 'Données invalides' });
            return;
        }
        const cleanName = username.trim().substring(0, 20);
        const key = cleanName.toLowerCase();
        if (password.length < 4) {
            socket.emit('account_error', { message: 'Mot de passe trop court (min 4 caractères)' });
            return;
        }
        if (accounts[key]) {
            socket.emit('account_error', { message: 'Ce pseudo est déjà enregistré. Connectez-vous.' });
            return;
        }
        const salt = crypto.randomBytes(16).toString('hex');
        accounts[key] = {
            username: cleanName,
            passwordHash: hashPassword(password, salt),
            salt,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        };
        saveAccounts();
        authenticatedSockets.add(socket.id);
        socket.emit('account_registered', { username: cleanName });
    });

    socket.on('login_account', (data) => {
        const { username, password } = data;
        if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
            socket.emit('account_error', { message: 'Données invalides' });
            return;
        }
        const key = username.trim().toLowerCase();
        const account = accounts[key];
        if (!account) {
            socket.emit('account_error', { message: 'Compte inexistant. Créez un compte.' });
            return;
        }
        const hash = hashPassword(password, account.salt);
        if (hash !== account.passwordHash) {
            socket.emit('account_error', { message: 'Mot de passe incorrect' });
            return;
        }
        account.lastLogin = new Date().toISOString();
        saveAccounts();
        authenticatedSockets.add(socket.id);
        socket.emit('account_logged_in', { username: account.username });
    });

    socket.on('check_account', (data) => {
        const { username } = data;
        if (!username) return;
        const key = username.trim().toLowerCase();
        socket.emit('account_check_result', { exists: !!accounts[key] });
    });

    // =========================================
    // === BOOKMARK SYSTEM — R5 ===
    // =========================================
    socket.on('bookmark_message', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const messageId = String(data?.messageId ?? '');
        if (!messageId) return;
        if (!userBookmarks[user.username]) userBookmarks[user.username] = [];
        if (userBookmarks[user.username].some(b => String(b.messageId) === messageId)) {
            socket.emit('bookmark_error', { message: 'Message déjà sauvegardé' });
            socket.emit('bookmarks_list', { bookmarks: userBookmarks[user.username] });
            return;
        }

        // Rechercher le message serveur pour ne pas dépendre uniquement du dataset DOM du client.
        let source = null;
        let sourceChannel = String(data?.channel || '').trim();
        for (const [channelName, messages] of Object.entries(channelHistories || {})) {
            const found = (messages || []).find(m => String(m.id) === messageId);
            if (found) { source = found; sourceChannel = channelName; break; }
        }
        const bookmark = {
            messageId,
            content: String(source?.content ?? data?.content ?? '').substring(0, 1000),
            author: String(source?.username ?? data?.author ?? 'Inconnu').substring(0, 80),
            channel: sourceChannel || 'général',
            timestamp: source?.timestamp || data?.timestamp || new Date().toISOString(),
            savedAt: new Date().toISOString(),
            attachment: source?.attachment || null
        };
        userBookmarks[user.username].unshift(bookmark);
        userBookmarks[user.username] = userBookmarks[user.username].slice(0, 250);
        saveBookmarks();
        socket.emit('bookmark_added', bookmark);
        socket.emit('bookmarks_list', { bookmarks: userBookmarks[user.username] });
    });

    socket.on('remove_bookmark', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const messageId = String(data?.messageId ?? '');
        if (!userBookmarks[user.username]) userBookmarks[user.username] = [];
        userBookmarks[user.username] = userBookmarks[user.username].filter(b => String(b.messageId) !== messageId);
        saveBookmarks();
        socket.emit('bookmark_removed', { messageId });
        socket.emit('bookmarks_list', { bookmarks: userBookmarks[user.username] });
    });

    socket.on('get_bookmarks', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        socket.emit('bookmarks_list', { bookmarks: userBookmarks[user.username] || [] });
    });

    // =========================================
    // === FRIEND SYSTEM — R5 CANONICAL SYNC ===
    // =========================================
    socket.on('send_friend_request', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const target = resolveCanonicalUsername(data?.username);
        if (!target) {
            socket.emit('friend_error', { message: 'Utilisateur introuvable' });
            return;
        }
        if (normalizeUsernameKey(target) === normalizeUsernameKey(user.username)) {
            socket.emit('friend_error', { message: 'Tu ne peux pas t’ajouter toi-même' });
            return;
        }
        if (!friendships[user.username]) friendships[user.username] = { friends: [], pending: [], requests: [] };
        if (!friendships[target]) friendships[target] = { friends: [], pending: [], requests: [] };

        const mine = friendships[user.username];
        const theirs = friendships[target];
        const contains = (arr, name) => (arr || []).some(v => normalizeUsernameKey(v) === normalizeUsernameKey(name));
        if (contains(mine.friends, target)) return socket.emit('friend_error', { message: 'Déjà amis !' });
        if (contains(mine.pending, target)) return socket.emit('friend_error', { message: 'Demande déjà envoyée' });
        if (contains(mine.requests, target)) {
            // Demandes croisées : accepter automatiquement.
            mine.requests = mine.requests.filter(v => normalizeUsernameKey(v) !== normalizeUsernameKey(target));
            theirs.pending = theirs.pending.filter(v => normalizeUsernameKey(v) !== normalizeUsernameKey(user.username));
            if (!contains(mine.friends, target)) mine.friends.push(target);
            if (!contains(theirs.friends, user.username)) theirs.friends.push(user.username);
            saveFriendships();
            emitFriendsListTo(user.username); emitFriendsListTo(target);
            getSocketsForUsername(target).forEach(sid => io.to(sid).emit('friend_accepted', { username: user.username }));
            socket.emit('friend_accepted', { username: target });
            return;
        }

        mine.pending.push(target);
        theirs.requests.push(user.username);
        saveFriendships();
        socket.emit('friend_request_sent', { username: target });
        emitFriendsListTo(user.username);
        getSocketsForUsername(target).forEach(sid => io.to(sid).emit('friend_request_received', {
            from: user.username, avatar: user.avatar || getUserAvatarByName(user.username)
        }));
        emitFriendsListTo(target);
    });

    socket.on('accept_friend', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const from = resolveCanonicalUsername(data?.username);
        if (!from || !friendships[user.username] || !friendships[from]) return;
        const key = normalizeUsernameKey;
        friendships[user.username].requests = (friendships[user.username].requests || []).filter(u => key(u) !== key(from));
        friendships[from].pending = (friendships[from].pending || []).filter(u => key(u) !== key(user.username));
        if (!(friendships[user.username].friends || []).some(u => key(u) === key(from))) friendships[user.username].friends.push(from);
        if (!(friendships[from].friends || []).some(u => key(u) === key(user.username))) friendships[from].friends.push(user.username);
        saveFriendships();
        socket.emit('friend_accepted', { username: from });
        getSocketsForUsername(from).forEach(sid => io.to(sid).emit('friend_accepted', { username: user.username }));
        emitFriendsListTo(user.username); emitFriendsListTo(from);
    });

    socket.on('reject_friend', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const from = resolveCanonicalUsername(data?.username);
        if (!from || !friendships[user.username] || !friendships[from]) return;
        const k = normalizeUsernameKey;
        friendships[user.username].requests = (friendships[user.username].requests || []).filter(u => k(u) !== k(from));
        friendships[from].pending = (friendships[from].pending || []).filter(u => k(u) !== k(user.username));
        saveFriendships();
        emitFriendsListTo(user.username); emitFriendsListTo(from);
    });

    socket.on('remove_friend', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const target = resolveCanonicalUsername(data?.username);
        if (!target) return;
        const k = normalizeUsernameKey;
        if (friendships[user.username]) friendships[user.username].friends = (friendships[user.username].friends || []).filter(u => k(u) !== k(target));
        if (friendships[target]) friendships[target].friends = (friendships[target].friends || []).filter(u => k(u) !== k(user.username));
        saveFriendships();
        socket.emit('friend_removed', { username: target });
        emitFriendsListTo(user.username); emitFriendsListTo(target);
    });

    socket.on('get_friends', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        emitFriendsListTo(user.username);
    });

    // =========================================
    // === BLOCK USERS ===
    // =========================================
    if (!global.blockedUsers) global.blockedUsers = {};

    socket.on('block_user', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const target = data.username;
        if (!target || target === user.username) return;

        if (!global.blockedUsers[user.username]) global.blockedUsers[user.username] = [];
        if (!global.blockedUsers[user.username].includes(target)) {
            global.blockedUsers[user.username].push(target);
        }

        // Also remove from friends
        if (friendships[user.username]) {
            friendships[user.username].friends = friendships[user.username].friends.filter(u => u !== target);
        }
        if (friendships[target]) {
            friendships[target].friends = friendships[target].friends.filter(u => u !== user.username);
        }
        saveFriendships();

        socket.emit('user_blocked', { username: target });
        socket.emit('blocked_users_list', { blocked: global.blockedUsers[user.username] || [] });
        emitFriendsListTo(user.username);

        logActivity('BLOCK', `${user.username} a bloqué ${target}`);
    });

    socket.on('unblock_user', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const target = data.username;

        if (global.blockedUsers[user.username]) {
            global.blockedUsers[user.username] = global.blockedUsers[user.username].filter(u => u !== target);
        }

        socket.emit('user_unblocked', { username: target });
        socket.emit('blocked_users_list', { blocked: global.blockedUsers[user.username] || [] });

        logActivity('UNBLOCK', `${user.username} a débloqué ${target}`);
    });

    socket.on('get_blocked_users', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        socket.emit('blocked_users_list', { blocked: global.blockedUsers[user.username] || [] });
    });
    // =========================================
    // === XP / LEVELING — XP ONLY ===
    // =========================================
    socket.on('get_xp', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        socket.emit('xp_data', buildXPDataPayload(user.username));
    });

    socket.on('set_name_effect', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const xpEntry = ensureXPEntry(user.username);
        const requested = sanitizeNameEffect(data?.effect || 'none');
        const level = getLevelFromXP(xpEntry.xp || 0).level;
        if (requested !== 'none' && level < NAME_EFFECT_ITEMS[requested].minLevel) {
            socket.emit('cosmetic_error', { message: `Niveau ${NAME_EFFECT_ITEMS[requested].minLevel} requis pour ${NAME_EFFECT_ITEMS[requested].label}.` });
            return;
        }
        xpEntry.activeNameEffect = requested;
        saveXPData();
        socket.emit('xp_data', buildXPDataPayload(user.username));
        updateUsersList();
        for (const [rName, rData] of Object.entries(voiceRooms)) {
            if (rData.participants.has(socket.id)) io.emit('voice_participants_update', { room: rName, participants: getVoiceParticipants(rName) });
        }
    });

    socket.on('save_custom_theme', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const xpEntry = ensureXPEntry(user.username);
        const level = getLevelFromXP(xpEntry.xp || 0).level;
        if (level < CUSTOM_THEME_MIN_LEVEL) {
            socket.emit('cosmetic_error', { message: `Niveau ${CUSTOM_THEME_MIN_LEVEL} requis pour sauvegarder un thème personnalisé.` });
            return;
        }
        const colors = Array.isArray(data?.colors) ? data.colors.slice(0, 5).map(c => String(c).slice(0, 9)) : ['#5865F2'];
        const opacity = Math.min(1, Math.max(0.1, parseFloat(data?.opacity) || 0.9));
        const textColor = String(data?.textColor || '#eef2ff').slice(0, 9);
        const accentColor = String(data?.accentColor || '#5865F2').slice(0, 9);
        const msgColor = String(data?.msgColor || '#5865F2').slice(0, 9);
        xpEntry.customTheme = { colors, opacity, textColor, accentColor, msgColor };
        saveXPData();
        socket.emit('custom_theme_saved', xpEntry.customTheme);
        socket.emit('xp_data', buildXPDataPayload(user.username));
    });

    socket.on('get_leaderboard', () => {
        const leaderboard = Object.entries(userXP)
            .map(([username, data]) => {
                const levelData = getLevelFromXP(data.xp || 0);
                return { username, xp: Number(data.xp || 0), ...levelData, role: getRoleForLevel(levelData.level), totalMessages: Number(data.totalMessages || 0) };
            })
            .sort((a, b) => b.xp - a.xp)
            .slice(0, 20);
        socket.emit('leaderboard_data', { leaderboard });
    });



    // =========================================
    // === REMINDERS ===
    // =========================================
    socket.on('create_reminder', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const { message, delay } = data; // delay in seconds
        if (!message || !delay || delay < 10 || delay > 86400 * 7) {
            socket.emit('reminder_error', { message: 'Durée invalide (10s - 7 jours)' });
            return;
        }
        const reminder = {
            id: reminderIdCounter++,
            username: user.username,
            message: message.substring(0, 200),
            triggerAt: Date.now() + delay * 1000,
            channel: data.channel || 'général',
            createdAt: new Date().toISOString()
        };
        reminders.push(reminder);
        saveReminders();
        socket.emit('reminder_created', { id: reminder.id, triggerAt: reminder.triggerAt, message: reminder.message });
    });

    socket.on('get_reminders', () => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        socket.emit('reminders_list', { reminders: reminders.filter(r => r.username === user.username) });
    });

    socket.on('delete_reminder', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        reminders = reminders.filter(r => !(r.id === data.id && r.username === user.username));
        saveReminders();
        socket.emit('reminder_deleted', { id: data.id });
    });

    // =========================================
    // === AUTOMOD CONFIG (admin only) ===
    // =========================================
    socket.on('get_automod_config', () => {
        const user = connectedUsers.get(socket.id);
        if (!user || !adminUsersList.includes(user.username)) return;
        socket.emit('automod_config', autoModConfig);
    });

    socket.on('update_automod', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user || !adminUsersList.includes(user.username)) return;
        autoModConfig = { ...autoModConfig, ...data };
        saveAutoMod();
        socket.emit('automod_updated', autoModConfig);
    });

    // =========================================
    // === USER STATUS ===
    // =========================================
    socket.on('set_custom_status', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const { status, customText, emoji } = data;
        userStatuses[user.username] = {
            status: status || 'online',
            customText: (customText || '').substring(0, 50),
            emoji: emoji || '',
            updatedAt: new Date().toISOString()
        };
        updateUsersList();
        io.emit('user_status_changed', { username: user.username, ...userStatuses[user.username] });
    });

    // =========================================
    // === LINK PREVIEW ===
    // =========================================
    socket.on('request_link_preview', async (data) => {
        const { url } = data;
        if (!url || !/^https?:\/\//i.test(url)) return;
        
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(url, {
                headers: { 'User-Agent': 'DocSpace-Bot/1.0' },
                signal: controller.signal,
                redirect: 'follow'
            });
            clearTimeout(timeout);
            
            if (!response.ok) return;
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/html')) return;
            
            const html = (await response.text()).substring(0, 50000); // Limit to 50KB
            
            const getMetaContent = (name) => {
                const match = html.match(new RegExp(`<meta[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i'))
                    || html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i'));
                return match ? match[1] : '';
            };
            
            const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
            const preview = {
                url,
                title: getMetaContent('og:title') || (titleMatch ? titleMatch[1].trim() : ''),
                description: (getMetaContent('og:description') || getMetaContent('description') || '').substring(0, 200),
                image: getMetaContent('og:image') || '',
                siteName: getMetaContent('og:site_name') || ''
            };
            
            if (preview.title) {
                socket.emit('link_preview_data', preview);
            }
        } catch (e) {
            // Silently fail for link previews
        }
    });


    // =========================================
    // === SOUNDBOARD ===
    // =========================================
    socket.on('play_sound', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const allowedSounds = ['applause','airhorn','rimshot','sadtrombone','tada','drumroll','crickets','laugh','wow','bruh'];
        if (!allowedSounds.includes(data.sound)) return;
        // Broadcast to all users in same channel
        io.emit('sound_played', { sound: data.sound, username: user.username, channel: data.channel || 'général' });
    });

    // =========================================
    // === READ RECEIPTS ===
    // =========================================
    socket.on('mark_read', (data) => {
        const user = connectedUsers.get(socket.id);
        if (!user) return;
        const { channel, lastMessageId } = data;
        io.emit('read_receipt', { username: user.username, channel, lastMessageId, timestamp: Date.now() });
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

// === FONCTION POUR PARTICIPANTS VOCAUX ===
function getVoiceParticipants(room) {
    if (!voiceRooms[room]) return [];
    const participants = [];
    voiceRooms[room].participants.forEach((data, socketId) => {
        const liveUser = connectedUsers.get(socketId);
        const savedProfile = userProfiles.get(data.username) || {};
        participants.push({
            socketId,
            username: data.username,
            avatar: (liveUser && liveUser.avatar) || savedProfile.avatar || '',
            nameEffect: getActiveNameEffect(data.username),
            muted: data.muted,
            deafened: data.deafened,
            video: data.video,
            screen: data.screen,
            speaking: data.speaking || false
        });
    });
    return participants;
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
    const byUsername = new Map();

    Array.from(connectedUsers.values()).forEach((user) => {
        const key = normalizeUsernameKey(user.username);
        if (!key) return;

        const existing = byUsername.get(key);
        if (!existing) {
            byUsername.set(key, {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
                joinTime: user.joinTime,
                lastActivity: user.lastActivity,
                messagesCount: Number(user.messagesCount || 0),
                repliesCount: Number(user.repliesCount || 0),
                activeDevices: 1
            });
            return;
        }

        existing.activeDevices += 1;
        existing.messagesCount += Number(user.messagesCount || 0);
        existing.repliesCount += Number(user.repliesCount || 0);

        if (!existing.avatar && user.avatar) {
            existing.avatar = user.avatar;
        }
        if (new Date(user.joinTime).getTime() < new Date(existing.joinTime).getTime()) {
            existing.joinTime = user.joinTime;
        }
        if (new Date(user.lastActivity).getTime() > new Date(existing.lastActivity).getTime()) {
            existing.lastActivity = user.lastActivity;
            existing.id = user.id;
        }
    });

    const usersList = Array.from(byUsername.values()).map((user) => {
        const savedStatus = userStatuses[user.username] || {};
        const xpEntry = ensureXPEntry(user.username);
        const level = getLevelFromXP(xpEntry.xp || 0).level;
        const role = getRoleForLevel(level);
        return {
            id: user.id,
            username: user.username,
            nameEffect: getActiveNameEffect(user.username),
            level,
            role,
            avatar: user.avatar,
            joinTime: user.joinTime,
            lastActivity: user.lastActivity,
            messagesCount: user.messagesCount,
            repliesCount: user.repliesCount,
            status: savedStatus.status || 'online',
            customStatus: savedStatus.customText || '',
            activeDevices: user.activeDevices
        };
    });
    
    io.emit('users_update', {
        count: usersList.length,
        users: usersList
    });
    
    logActivity('SYSTEM', `Liste des utilisateurs mise à jour`, {
        totalUsers: usersList.length,
        totalSockets: connectedUsers.size,
        activeUsers: usersList.map(u => u.username)
    });
}

function broadcastLeaderboard() {
    const leaderboard = Object.entries(userXP)
        .map(([username, data]) => {
            const levelData = getLevelFromXP(data.xp);
            return {
                username,
                xp: data.xp,
                ...levelData,
                role: getRoleForLevel(levelData.level),
                totalMessages: data.totalMessages
            };
        })
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 20);
    io.emit('leaderboard_data', { leaderboard });
}

function updateTypingIndicator() {
    const now = Date.now();
    typingUsers.forEach((data, socketId) => {
        if (now - data.timestamp >= 5000 || !connectedUsers.has(socketId)) typingUsers.delete(socketId);
    });

    // Chaque client ne reçoit que les personnes qui écrivent dans son salon courant.
    connectedUsers.forEach((viewer, viewerSocketId) => {
        const active = [];
        typingUsers.forEach((data, typerSocketId) => {
            if (typerSocketId === viewerSocketId) return;
            if ((data.channel || 'général') !== (viewer.currentChannel || 'général')) return;
            const typer = connectedUsers.get(typerSocketId);
            if (!typer) return;
            active.push(data.username);
        });
        io.to(viewerSocketId).emit('typing_update', { users: [...new Set(active)] });
    });
    io.emit('channel_typing_update', getChannelTypingUsers());
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

// XP passif vocal + progression mission vocal (1 fois / minute)
setInterval(() => {
    let anyXpChanged = false;
    for (const [roomName, roomData] of Object.entries(voiceRooms)) {
        for (const [socketId, participant] of roomData.participants.entries()) {
            if (!participant || participant.muted || participant.deafened) continue;
            const username = participant.username;
            if (!username) continue;

            const passiveResult = addRawXP(username, VOICE_PASSIVE_XP_PER_MINUTE);
            const missionRewards = applyMissionProgress(username, { voiceMinutes: 1 });

            if (passiveResult.gainedXP > 0 || missionRewards.length > 0) {
                anyXpChanged = true;
                io.to(socketId).emit('xp_data', buildXPDataPayload(username));
            }

            if (passiveResult.levelUp) {
                io.emit('system_message', {
                    type: 'system',
                    message: `🎉 ${username} a atteint le niveau ${passiveResult.newLevel} !`,
                    timestamp: new Date(),
                    id: messageId++
                });
            }

            for (const reward of missionRewards) {
                io.to(socketId).emit('daily_mission_reward', {
                    missionKey: reward.key,
                    missionLabel: reward.label,
                    rewardXP: reward.rewardXP
                });
                if (reward.levelUp) {
                    io.emit('system_message', {
                        type: 'system',
                        message: `🎉 ${username} a atteint le niveau ${reward.newLevel} !`,
                        timestamp: new Date(),
                        id: messageId++
                    });
                }
            }
        }
    }

    if (anyXpChanged) saveXPData();
}, 60000);

// Nettoyage des fichiers une fois par jour
setInterval(cleanupOldFiles, 24 * 60 * 60 * 1000);

// Rotation/expiration des evenements live
setInterval(() => {
    refreshLiveOpsState();
}, 10000);

// Affichage des statistiques serveur
setInterval(() => {
    if (connectedUsers.size > 0 || serverStats.totalMessages > 0) {
        const memUsage = process.memoryUsage();
        const uptime = getTotalUptimeSeconds();
        
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

// Sauvegarde régulière du temps serveur cumulé
setInterval(() => {
    saveServerRuntimeStats({ includeCurrentSession: true });
}, 30000);

// === R5.1.0 ARCADE: Tetris Versus + Neon Maze 3D ===
const arcadeTetrisRooms = new Map();
const arcadeMazeRooms = new Map();
const ARCADE_MAZE_ORBS = [
    { id:'o0', x:2.5, y:2.5 }, { id:'o1', x:7.5, y:2.5 }, { id:'o2', x:11.5, y:3.5 },
    { id:'o3', x:4.5, y:6.5 }, { id:'o4', x:9.5, y:7.5 }, { id:'o5', x:13.5, y:8.5 }
];
function arcadeRoomCode(value, fallback='PUBLIC') {
    const code = String(value || fallback).toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,16);
    return code || fallback;
}
function arcadeUsername(socket) {
    return connectedUsers.get(socket.id)?.username || `Guest-${socket.id.slice(0,4)}`;
}
function emitTetrisRoom(code) {
    const room = arcadeTetrisRooms.get(code); if (!room) return;
    io.to(`arcade:tetris:${code}`).emit('arcade_tetris_room', {
        code,
        started: room.started,
        seed: room.seed,
        players: [...room.players.values()].map(p => ({ username:p.username, socketId:p.socketId, score:p.score||0, lines:p.lines||0, level:p.level||1, alive:p.alive!==false }))
    });
}
function cleanupTetrisSocket(socketId) {
    for (const [code, room] of arcadeTetrisRooms) {
        if (!room.players.has(socketId)) continue;
        room.players.delete(socketId);
        io.to(`arcade:tetris:${code}`).emit('arcade_tetris_peer_left', { socketId });
        if (!room.players.size) arcadeTetrisRooms.delete(code); else { room.started=false; emitTetrisRoom(code); }
    }
}
function mazeSnapshot(code) {
    const room = arcadeMazeRooms.get(code);
    if (!room) return null;
    return {
        code,
        players:[...room.players.values()],
        orbs: ARCADE_MAZE_ORBS.map(o => ({...o, active: !room.collected.has(o.id)}))
    };
}
function cleanupMazeSocket(socketId) {
    for (const [code, room] of arcadeMazeRooms) {
        if (!room.players.has(socketId)) continue;
        room.players.delete(socketId);
        io.to(`arcade:maze:${code}`).emit('arcade_maze_peer_left', { socketId });
        if (!room.players.size) arcadeMazeRooms.delete(code);
    }
}
io.on('connection', (socket) => {
    socket.on('arcade_tetris_join', data => {
        cleanupTetrisSocket(socket.id);
        const code=arcadeRoomCode(data?.code);
        let room=arcadeTetrisRooms.get(code);
        if (!room) { room={players:new Map(),started:false,seed:Math.floor(Math.random()*2147483647)}; arcadeTetrisRooms.set(code,room); }
        if (room.players.size>=2 && !room.players.has(socket.id)) return socket.emit('arcade_error',{game:'tetris',message:'Cette partie Tetris est pleine.'});
        socket.join(`arcade:tetris:${code}`);
        room.players.set(socket.id,{socketId:socket.id,username:arcadeUsername(socket),score:0,lines:0,level:1,alive:true});
        emitTetrisRoom(code);
        if (room.players.size===2) {
            room.started=true; room.seed=Math.floor(Math.random()*2147483647);
            for (const p of room.players.values()) { p.score=0;p.lines=0;p.level=1;p.alive=true; }
            io.to(`arcade:tetris:${code}`).emit('arcade_tetris_start',{code,seed:room.seed,startedAt:Date.now()+800});
            emitTetrisRoom(code);
        }
    });
    socket.on('arcade_tetris_state', data => {
        const code=arcadeRoomCode(data?.code); const room=arcadeTetrisRooms.get(code); const p=room?.players.get(socket.id); if(!p)return;
        p.score=Math.max(0,Math.min(99999999,Number(data.score)||0)); p.lines=Math.max(0,Math.min(9999,Number(data.lines)||0)); p.level=Math.max(1,Math.min(99,Number(data.level)||1));
        socket.to(`arcade:tetris:${code}`).emit('arcade_tetris_peer_state',{socketId:socket.id,username:p.username,score:p.score,lines:p.lines,level:p.level,board:Array.isArray(data.board)?data.board.slice(0,20):null});
    });
    socket.on('arcade_tetris_attack', data => {
        const code=arcadeRoomCode(data?.code); const room=arcadeTetrisRooms.get(code); if(!room?.players.has(socket.id))return;
        const lines=Math.max(1,Math.min(4,Number(data.lines)||1)); socket.to(`arcade:tetris:${code}`).emit('arcade_tetris_garbage',{from:arcadeUsername(socket),lines});
    });
    socket.on('arcade_tetris_gameover', data => {
        const code=arcadeRoomCode(data?.code); const room=arcadeTetrisRooms.get(code); const p=room?.players.get(socket.id); if(!p)return;
        p.alive=false; socket.to(`arcade:tetris:${code}`).emit('arcade_tetris_win',{winner:[...room.players.values()].find(x=>x.socketId!==socket.id)?.username||null,loser:p.username}); emitTetrisRoom(code);
    });
    socket.on('arcade_tetris_leave', data => { const code=arcadeRoomCode(data?.code); socket.leave(`arcade:tetris:${code}`); cleanupTetrisSocket(socket.id); });

    socket.on('arcade_maze_join', data => {
        cleanupMazeSocket(socket.id);
        const code=arcadeRoomCode(data?.code,'MAZE'); let room=arcadeMazeRooms.get(code);
        if(!room){room={players:new Map(),collected:new Set()};arcadeMazeRooms.set(code,room);}
        if(room.players.size>=8&&!room.players.has(socket.id))return socket.emit('arcade_error',{game:'maze',message:'Cette arène est pleine.'});
        socket.join(`arcade:maze:${code}`);
        room.players.set(socket.id,{socketId:socket.id,username:arcadeUsername(socket),x:1.5,y:1.5,a:0,score:0});
        socket.emit('arcade_maze_snapshot',mazeSnapshot(code));
        socket.to(`arcade:maze:${code}`).emit('arcade_maze_peer_join',room.players.get(socket.id));
    });
    socket.on('arcade_maze_move', data => {
        const code=arcadeRoomCode(data?.code,'MAZE'); const room=arcadeMazeRooms.get(code); const p=room?.players.get(socket.id); if(!p)return;
        p.x=Math.max(1.05,Math.min(14.95,Number(data.x)||p.x));p.y=Math.max(1.05,Math.min(9.95,Number(data.y)||p.y));p.a=Number(data.a)||0;
        socket.to(`arcade:maze:${code}`).volatile.emit('arcade_maze_peer_move',{socketId:socket.id,x:p.x,y:p.y,a:p.a,score:p.score});
    });
    socket.on('arcade_maze_collect', data => {
        const code=arcadeRoomCode(data?.code,'MAZE'); const room=arcadeMazeRooms.get(code); const p=room?.players.get(socket.id); const orb=ARCADE_MAZE_ORBS.find(o=>o.id===String(data?.orbId||'')); if(!room||!p||!orb||room.collected.has(orb.id))return;
        const dx=p.x-orb.x,dy=p.y-orb.y;if(dx*dx+dy*dy>1.5)return;
        room.collected.add(orb.id);p.score=(p.score||0)+1;io.to(`arcade:maze:${code}`).emit('arcade_maze_orb',{orbId:orb.id,by:p.username,score:p.score,active:false});
        setTimeout(()=>{const r=arcadeMazeRooms.get(code);if(!r)return;r.collected.delete(orb.id);io.to(`arcade:maze:${code}`).emit('arcade_maze_orb',{orbId:orb.id,active:true});},7000);
    });
    socket.on('arcade_maze_leave', data => { const code=arcadeRoomCode(data?.code,'MAZE');socket.leave(`arcade:maze:${code}`);cleanupMazeSocket(socket.id); });
    socket.on('disconnect',()=>{cleanupTetrisSocket(socket.id);cleanupMazeSocket(socket.id);});
});

// Démarrer le serveur
const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    logActivity('SYSTEM', `${SERVER_NAME} v${SERVER_VERSION} démarré avec succès !`, {
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
    if (shutdownInProgress) return;
    shutdownInProgress = true;

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
    const uptimeSession = getSessionUptimeSeconds();
    commitRuntimeSession();
    const uptimeTotal = Math.max(0, Math.floor(serverRuntimeStats.accumulatedUptimeSeconds || 0));
    const finalStats = {
        totalMessages: serverStats.totalMessages,
        totalUploads: serverStats.totalUploads,
        totalConnections: serverStats.totalConnections,
        uptimeSession,
        uptimeTotal,
        shutdownTime: new Date()
    };
    
    logActivity('SYSTEM', `Statistiques finales du serveur`, finalStats);

    // Flush explicite des buffers de persistance avant fermeture
    saveXPDataImmediate();
    
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

// === KEEP-ALIVE POUR FLY.IO ===
// Fly.io peut arrêter les machines inactives
// On fait des pings réguliers pour maintenir le serveur actif
const KEEP_ALIVE_INTERVAL = PERF_CONFIG.keepAliveIntervalMs;
let keepAliveCount = 0;

// Créer une route /health-lite dédiée au ping interne
app.get('/health-lite', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: getTotalUptimeSeconds(),
        sessionUptime: getSessionUptimeSeconds(),
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
    
    // Sur Fly.io ou Render, utiliser l'URL publique si disponible
    const publicUrl = process.env.FLY_APP_NAME ? `https://${process.env.FLY_APP_NAME}.fly.dev` : process.env.RENDER_EXTERNAL_URL;
    if (publicUrl) {
        const protocol = publicUrl.startsWith('https') ? https : require('http');
        protocol.get(`${publicUrl}/health`, (res) => {
            // Ping réussi
        }).on('error', (err) => {
            // Ignorer les erreurs silencieusement
        });
    } else {
        // En local, ping localhost
        const PORT = process.env.PORT || 8080;
        require('http').get(`http://localhost:${PORT}/health`, (res) => {
            // Ping réussi
        }).on('error', (err) => {
            // Ignorer les erreurs
        });
    }
}

// Le self-ping est désactivé par défaut sur Fly.io : une Machine toujours active
// est plus stable pour Socket.IO/WebRTC et évite du trafic artificiel.
const SELF_KEEPALIVE_ENABLED = String(process.env.DOCSPACE_SELF_KEEPALIVE || 'false').toLowerCase() === 'true' && !IS_FLY;
if (SELF_KEEPALIVE_ENABLED) {
    setInterval(keepAlive, KEEP_ALIVE_INTERVAL);
    keepAlive();
    console.log(`⏰ Self keep-alive activé (${Math.round(KEEP_ALIVE_INTERVAL / 1000)} s)`);
} else {
    console.log(`⏰ Self keep-alive désactivé (recommandé sur Fly.io)`);
}
console.log(`🌐 Route /health disponible pour monitoring`);
console.log(`🌐 Route /api/server/dashboard disponible pour supervision externe`);

logActivity('SYSTEM', 'Tous les gestionnaires d\'événements configurés', {
    maxHistoryMessages: MAX_HISTORY,
    uploadDir: uploadDir
});
