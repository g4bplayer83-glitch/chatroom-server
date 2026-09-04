const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Clé secrète pour mettre à jour le lien — change-la !
const UPDATE_SECRET = process.env.UPDATE_SECRET || 'IndieGabVR2024';

// URL du serveur Fly.io (fallback quand le PC est hors ligne)
const FALLBACK_URL = process.env.FALLBACK_URL || 'https://docspace.fly.dev';

// Lien Cloudflare actuel (stocké en mémoire)
let currentTunnelUrl = null;
let lastUpdated = null;

app.use(express.json());

// ============================================
// Page d'accueil — redirection automatique
// ============================================
app.get('/', (req, res) => {
    const online = !!currentTunnelUrl;
    const redirectUrl = online ? escapeHtml(currentTunnelUrl) : escapeHtml(FALLBACK_URL);
    const statusText = online ? 'Serveur PC détecté — redirection...' : 'Serveur PC hors ligne — redirection vers Render...';
    const statusIcon = online ? '🟢' : '🔴';

    res.send(`<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DocSpace — Redirection</title>
    <meta http-equiv="refresh" content="2;url=${redirectUrl}">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='%235865F2' rx='20' width='100' height='100'/><text y='.9em' font-size='80' x='50%' text-anchor='middle'>🗄️</text></svg>">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #fff;
        }
        .card {
            background: rgba(255,255,255,0.06);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 24px;
            padding: 48px 40px;
            text-align: center;
            max-width: 420px;
            width: 90%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }
        .logo { font-size: 56px; margin-bottom: 16px; }
        h1 { font-size: 28px; font-weight: 800; margin-bottom: 8px; }
        .status { color: #a0a0b0; font-size: 15px; margin-bottom: 24px; }
        .spinner {
            width: 40px; height: 40px;
            border: 4px solid rgba(255,255,255,0.1);
            border-top: 4px solid #5865F2;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .manual-link {
            color: #7289DA;
            text-decoration: none;
            font-size: 13px;
        }
        .manual-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="card">
        <div class="logo">🗄️</div>
        <h1>DocSpace</h1>
        <div class="spinner"></div>
        <div class="status">${statusIcon} ${statusText}</div>
        <a href="${redirectUrl}" class="manual-link">Cliquez ici si la redirection ne fonctionne pas</a>
    </div>
    <script>setTimeout(() => { window.location.href = "${redirectUrl}"; }, 1500);</script>
</body>
</html>`);
});

// ============================================
// API — mise à jour du lien tunnel (POST)
// ============================================
app.post('/update-link', (req, res) => {
    const secret = req.headers['x-secret'] || req.body.secret;
    if (secret !== UPDATE_SECRET) {
        return res.status(403).json({ error: 'Accès refusé' });
    }

    const url = req.body.url;
    if (!url || typeof url !== 'string' || !url.startsWith('https://')) {
        return res.status(400).json({ error: 'URL invalide — doit commencer par https://' });
    }

    currentTunnelUrl = url.trim();
    lastUpdated = Date.now();
    console.log(`✅ Lien tunnel mis à jour : ${currentTunnelUrl}`);
    res.json({ success: true, url: currentTunnelUrl });
});

// API — marquer le serveur comme hors ligne
app.post('/set-offline', (req, res) => {
    const secret = req.headers['x-secret'] || req.body.secret;
    if (secret !== UPDATE_SECRET) {
        return res.status(403).json({ error: 'Accès refusé' });
    }
    currentTunnelUrl = null;
    lastUpdated = Date.now();
    console.log('⛔ Serveur marqué hors ligne');
    res.json({ success: true });
});

// API — vérifier le statut (utile pour debug)
app.get('/status', (req, res) => {
    res.json({
        online: !!currentTunnelUrl,
        url: currentTunnelUrl,
        lastUpdated
    });
});

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

app.listen(PORT, () => {
    console.log(`🚀 Proxy Render démarré sur le port ${PORT}`);
    console.log(`🔑 Secret: ${UPDATE_SECRET.slice(0, 4)}...`);
});
