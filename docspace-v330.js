/* DocSpace v3.3.0 BETA — Consolidated behavior layer */
/* ===== merged from retro-discord.js ===== */
/* DocSpace 3.3.0-beta — Quick Switcher + retro UI helpers */
(() => {
    'use strict';

    const state = {
        open: false,
        activeIndex: 0,
        items: []
    };

    function safeCall(name, ...args) {
        const fn = window[name];
        if (typeof fn === 'function') return fn(...args);
        console.warn(`[DocSpace] Action indisponible: ${name}`);
        return undefined;
    }

    function makeOverlay() {
        if (document.getElementById('docspaceQuickOverlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'docspaceQuickOverlay';
        overlay.className = 'docspace-quick-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <div class="docspace-quick" role="dialog" aria-modal="true" aria-label="Navigation rapide DocSpace">
                <div class="docspace-quick-head">
                    <div class="docspace-quick-mark">DS</div>
                    <input id="docspaceQuickInput" type="text" autocomplete="off" spellcheck="false" placeholder="Aller à un salon ou lancer une action…">
                    <span class="docspace-quick-key">ESC</span>
                </div>
                <div id="docspaceQuickList" class="docspace-quick-list"></div>
            </div>`;
        overlay.addEventListener('mousedown', (event) => {
            if (event.target === overlay) closeQuickSwitcher();
        });
        document.body.appendChild(overlay);

        const input = document.getElementById('docspaceQuickInput');
        input.addEventListener('input', () => renderQuickItems(input.value));
        input.addEventListener('keydown', (event) => {
            const buttons = [...document.querySelectorAll('.docspace-quick-item')];
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                if (!buttons.length) return;
                state.activeIndex = (state.activeIndex + 1) % buttons.length;
                updateActiveItem(buttons);
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                if (!buttons.length) return;
                state.activeIndex = (state.activeIndex - 1 + buttons.length) % buttons.length;
                updateActiveItem(buttons);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                if (buttons[state.activeIndex]) buttons[state.activeIndex].click();
            }
        });
    }

    function updateActiveItem(buttons) {
        buttons.forEach((button, index) => button.classList.toggle('active', index === state.activeIndex));
        buttons[state.activeIndex]?.scrollIntoView({ block: 'nearest' });
    }

    function getQuickItems() {
        const items = [];
        const seen = new Set();

        document.querySelectorAll('.channel-item[data-channel]').forEach((el) => {
            const channel = el.dataset.channel;
            if (!channel || seen.has(`c:${channel}`)) return;
            seen.add(`c:${channel}`);
            items.push({
                section: 'Salons texte',
                icon: '#',
                title: channel,
                subtitle: 'Ouvrir le salon texte',
                keywords: `salon texte channel ${channel}`,
                run: () => safeCall('switchChannel', channel)
            });
        });

        document.querySelectorAll('.voice-channel-item[data-voice-room]').forEach((el) => {
            const room = el.dataset.voiceRoom;
            if (!room || seen.has(`v:${room}`)) return;
            seen.add(`v:${room}`);
            items.push({
                section: 'Salons vocaux',
                icon: '◖',
                title: room,
                subtitle: 'Rejoindre le vocal',
                keywords: `vocal voix room ${room}`,
                run: () => safeCall('joinVoiceChannel', room)
            });
        });

        const actions = [
            ['Navigation', '⌕', 'Rechercher dans les messages', 'recherche search messages', () => safeCall('toggleSearch')],
            ['Navigation', '✉', 'Messages privés', 'dm messages privés', () => safeCall('toggleDMSidebar')],
            ['Navigation', '♙', 'Amis', 'amis friends', () => safeCall('openFriendsModal')],
            ['Contenu', '⌖', 'Épinglés & sauvegardés', 'pinned favoris sauvegardés', () => safeCall('togglePinnedSavedPanel')],
            ['Contenu', '▣', 'Fichiers & médias', 'gallery fichiers medias stockage', () => safeCall('openGallery')],
            ['Outils', '⚙', 'Paramètres', 'settings paramètres theme', () => safeCall('openSettings')],
            ['Outils', '▥', 'Nouveautés', 'patchnotes version nouveautés', () => safeCall('showPatchNotes', true)],
            ['Outils', '▤', 'Statistiques serveur', 'stats ping serveur', () => safeCall('openServerStats')],
            ['Interface', '◩', 'Mode Focus', 'focus zen masquer utilisateurs', toggleFocusMode],
            ['Interface', '▦', 'Lignes rétro CRT', 'retro crt scanlines lignes', toggleScanlines]
        ];

        actions.forEach(([section, icon, title, keywords, run]) => {
            items.push({ section, icon, title, subtitle: 'Action rapide', keywords, run });
        });

        return items;
    }

    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
    }

    function renderQuickItems(query = '') {
        const list = document.getElementById('docspaceQuickList');
        if (!list) return;

        const q = normalize(query);
        const source = getQuickItems();
        state.items = q
            ? source.filter(item => normalize(`${item.title} ${item.subtitle} ${item.keywords}`).includes(q))
            : source;
        state.activeIndex = 0;

        if (!state.items.length) {
            list.innerHTML = '<div class="docspace-quick-empty">Aucun salon ou action trouvé.</div>';
            return;
        }

        list.innerHTML = '';
        let currentSection = '';
        state.items.forEach((item, index) => {
            if (item.section !== currentSection) {
                currentSection = item.section;
                const heading = document.createElement('div');
                heading.className = 'docspace-quick-section';
                heading.textContent = currentSection;
                list.appendChild(heading);
            }

            const button = document.createElement('button');
            button.type = 'button';
            button.className = `docspace-quick-item${index === 0 ? ' active' : ''}`;
            button.innerHTML = `
                <span class="docspace-quick-icon"></span>
                <span class="docspace-quick-text">
                    <span class="docspace-quick-title"></span>
                    <span class="docspace-quick-sub"></span>
                </span>`;
            button.querySelector('.docspace-quick-icon').textContent = item.icon;
            button.querySelector('.docspace-quick-title').textContent = item.title;
            button.querySelector('.docspace-quick-sub').textContent = item.subtitle;
            button.addEventListener('mouseenter', () => {
                state.activeIndex = [...list.querySelectorAll('.docspace-quick-item')].indexOf(button);
                updateActiveItem([...list.querySelectorAll('.docspace-quick-item')]);
            });
            button.addEventListener('click', () => {
                closeQuickSwitcher();
                requestAnimationFrame(() => item.run());
            });
            list.appendChild(button);
        });
    }

    function openQuickSwitcher() {
        makeOverlay();
        const overlay = document.getElementById('docspaceQuickOverlay');
        const input = document.getElementById('docspaceQuickInput');
        state.open = true;
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        input.value = '';
        renderQuickItems('');
        requestAnimationFrame(() => input.focus());
    }

    function closeQuickSwitcher() {
        const overlay = document.getElementById('docspaceQuickOverlay');
        if (!overlay) return;
        state.open = false;
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
    }

    function toggleFocusMode() {
        const enabled = !document.body.classList.contains('docspace-focus');
        document.body.classList.toggle('docspace-focus', enabled);
        localStorage.setItem('docspaceFocusMode', enabled ? '1' : '0');
        if (typeof window.showNotification === 'function') {
            window.showNotification('Mode Focus', enabled ? 'Liste des membres masquée' : 'Liste des membres rétablie', 'info');
        }
    }

    function toggleScanlines() {
        const disabled = !document.body.classList.contains('retro-scanlines-off');
        document.body.classList.toggle('retro-scanlines-off', disabled);
        localStorage.setItem('docspaceRetroScanlines', disabled ? '0' : '1');
        if (typeof window.showNotification === 'function') {
            window.showNotification('Effet rétro', disabled ? 'Lignes CRT désactivées' : 'Lignes CRT activées', 'info');
        }
    }

    function injectQuickButton() {
        if (document.getElementById('docspaceCommandButton')) return;
        const headerActions = document.querySelector('.header-actions');
        if (!headerActions) return;

        const button = document.createElement('button');
        button.id = 'docspaceCommandButton';
        button.type = 'button';
        button.className = 'header-btn docspace-command-btn';
        button.title = 'Navigation rapide (Ctrl+K)';
        button.setAttribute('aria-label', 'Navigation rapide');
        button.textContent = '⌘K';
        button.addEventListener('click', openQuickSwitcher);
        headerActions.insertBefore(button, headerActions.firstChild);
    }

    function enhanceVersionBadge() {
        const version = document.querySelector('.version-info');
        if (!version || version.querySelector('.retro-build-chip')) return;
        const chip = document.createElement('span');
        chip.className = 'retro-build-chip';
        chip.textContent = 'RETRO';
        version.appendChild(chip);
    }

    function restoreLocalUiState() {
        if (localStorage.getItem('docspaceFocusMode') === '1') {
            document.body.classList.add('docspace-focus');
        }
        if (localStorage.getItem('docspaceRetroScanlines') === '0') {
            document.body.classList.add('retro-scanlines-off');
        }
    }

    function bindKeyboard() {
        document.addEventListener('keydown', (event) => {
            const ctrlOrMeta = event.ctrlKey || event.metaKey;
            if (ctrlOrMeta && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                state.open ? closeQuickSwitcher() : openQuickSwitcher();
                return;
            }
            if (event.key === 'Escape' && state.open) {
                event.preventDefault();
                closeQuickSwitcher();
            }
        });
    }

    function init() {
        restoreLocalUiState();
        makeOverlay();
        injectQuickButton();
        enhanceVersionBadge();
        bindKeyboard();
    }

    window.openQuickSwitcher = openQuickSwitcher;
    window.closeQuickSwitcher = closeQuickSwitcher;
    window.toggleFocusMode = toggleFocusMode;
    window.toggleRetroScanlines = toggleScanlines;

    let __dsInitDone = false;
    const __dsStartAfterLogin = () => {
        if (__dsInitDone) return;
        __dsInitDone = true;
        init();
    };
    window.addEventListener('docspace:connected', __dsStartAfterLogin, { once: true });
    if (window.__docspaceConnected === true) __dsStartAfterLogin();
})();


/* ===== merged from v330-polish.js ===== */
/* DocSpace v3.3.0-beta R2 — small behavior fixes kept outside the legacy monolith. */
(() => {
    'use strict';

    let presenceToastTimer = null;
    let presenceSocketBound = false;

    function notify(title, message, type = 'info') {
        if (typeof window.showNotification === 'function') {
            window.showNotification(title, message, type);
        }
    }

    function relocateVersionBadge() {
        const badge = document.getElementById('versionBadge') || document.querySelector('.version-info');
        const sidebar = document.getElementById('channelsSidebar');
        const selfPanel = document.getElementById('sidebarSelfPanel');
        if (!badge || !sidebar || !selfPanel) return;

        if (badge.parentElement !== sidebar) {
            sidebar.insertBefore(badge, selfPanel);
        }
        badge.setAttribute('title', 'V3.3.0 BETA · cliquer pour les patch notes');
        if (!badge.dataset.r2Bound) {
            badge.dataset.r2Bound = '1';
            badge.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                if (typeof window.showAdminLogin === 'function') window.showAdminLogin();
            });
        }
    }

    function updateHeaderAria() {
        const btn = document.getElementById('headerMoreBtn');
        const menu = document.getElementById('headerMoreDropdown');
        if (!btn || !menu) return;
        btn.setAttribute('aria-expanded', menu.classList.contains('open') ? 'true' : 'false');
    }

    function bindHeaderMenu() {
        const btn = document.getElementById('headerMoreBtn');
        const menu = document.getElementById('headerMoreDropdown');
        if (!btn || !menu || menu.dataset.r2Bound) return;
        menu.dataset.r2Bound = '1';

        btn.addEventListener('click', () => requestAnimationFrame(updateHeaderAria));
        document.addEventListener('pointerdown', (event) => {
            if (!menu.classList.contains('open')) return;
            if (menu.contains(event.target) || btn.contains(event.target)) return;
            if (typeof window.closeHeaderMore === 'function') window.closeHeaderMore();
            updateHeaderAria();
        }, true);
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !menu.classList.contains('open')) return;
            if (typeof window.closeHeaderMore === 'function') window.closeHeaderMore();
            updateHeaderAria();
            btn.focus();
        });
    }

    async function copyDocSpaceInvite() {
        const url = window.location.href;
        try {
            await navigator.clipboard.writeText(url);
            const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);
            if (isLocal) {
                notify('🔗 Invitation copiée', 'Le lien localhost est local à ce PC. Pour inviter quelqu’un, copie plutôt ton URL publique/tunnel DocSpace.', 'info');
            } else {
                notify('🔗 Invitation copiée', 'Le lien DocSpace est dans le presse-papiers.', 'success');
            }
        } catch (error) {
            const area = document.createElement('textarea');
            area.value = url;
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
            notify('🔗 Invitation copiée', 'Le lien DocSpace est dans le presse-papiers.', 'success');
        }
    }

    function ensurePresenceToast() {
        const sidebar = document.querySelector('.users-sidebar');
        if (!sidebar) return null;
        let toast = document.getElementById('presenceMiniToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'presenceMiniToast';
            toast.className = 'presence-mini-toast';
            sidebar.appendChild(toast);
        }
        return toast;
    }

    function showPresenceActivity(entry) {
        if (!entry || !entry.username) return;
        const toast = ensurePresenceToast();
        if (!toast) return;
        const joined = entry.action === 'join';
        toast.className = `presence-mini-toast ${joined ? 'join' : 'leave'}`;
        toast.textContent = `${entry.username} ${joined ? 'est en ligne' : 'est parti'}`;
        requestAnimationFrame(() => toast.classList.add('show'));
        clearTimeout(presenceToastTimer);
        presenceToastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
    }

    function tryBindPresenceSocket() {
        if (presenceSocketBound) return;
        try {
            if (typeof socket !== 'undefined' && socket && typeof socket.on === 'function') {
                presenceSocketBound = true;
                socket.on('presence_history_append', showPresenceActivity);
                return;
            }
        } catch (_) {}
        setTimeout(tryBindPresenceSocket, 750);
    }

    function autoOpenPatchNotesOnceConnected() {
        let tries = 0;
        const timer = setInterval(() => {
            tries += 1;
            const overlay = document.getElementById('connectionOverlay');
            const connected = overlay && getComputedStyle(overlay).display === 'none';
            if (connected) {
                clearInterval(timer);
                setTimeout(() => {
                    if (typeof window.showPatchNotes === 'function') window.showPatchNotes(false);
                }, 650);
            } else if (tries > 80) {
                clearInterval(timer);
            }
        }, 500);
    }

    function hardenBrokenImages() {
        document.addEventListener('error', (event) => {
            const img = event.target;
            if (!(img instanceof HTMLImageElement)) return;
            if (!img.closest('.message-avatar, .user-avatar, .voice-participant-avatar, .voice-user-card-avatar')) return;
            const holder = img.parentElement;
            if (!holder || holder.dataset.fallbackApplied) return;
            holder.dataset.fallbackApplied = '1';
            const label = (img.alt || '?').trim().charAt(0).toUpperCase() || '?';
            holder.innerHTML = `<span>${label}</span>`;
        }, true);
    }

    function init() {
        relocateVersionBadge();
        bindHeaderMenu();
        tryBindPresenceSocket();
        autoOpenPatchNotesOnceConnected();
        hardenBrokenImages();
    }

    window.copyDocSpaceInvite = copyDocSpaceInvite;

    let __dsInitDone = false;
    const __dsStartAfterLogin = () => {
        if (__dsInitDone) return;
        __dsInitDone = true;
        init();
    };
    window.addEventListener('docspace:connected', __dsStartAfterLogin, { once: true });
    if (window.__docspaceConnected === true) __dsStartAfterLogin();
})();


/* ===== merged from v330-r3.js ===== */
/* DocSpace v3.3.0 BETA R3 — left rail, build header, timeline hardening */
(() => {
    'use strict';

    function call(name, ...args) {
        const fn = window[name];
        if (typeof fn === 'function') return fn(...args);
        console.warn(`[DocSpace R3] Action indisponible: ${name}`);
    }

    function openVoiceArea() {
        try {
            if (typeof currentVoiceRoom !== 'undefined' && currentVoiceRoom) {
                call('returnToVoiceView');
                return;
            }
        } catch (_) {}
        const firstVoice = document.querySelector('.voice-channel-item');
        if (firstVoice) {
            firstVoice.scrollIntoView({ block: 'center', behavior: 'smooth' });
            firstVoice.animate([
                { backgroundColor: 'rgba(var(--accent-rgb),0.05)' },
                { backgroundColor: 'rgba(var(--accent-rgb),0.28)' },
                { backgroundColor: 'rgba(var(--accent-rgb),0.05)' }
            ], { duration: 700 });
        }
    }

    function injectRail() {
        if (document.getElementById('docspaceAppRailR3')) return;
        const rail = document.createElement('nav');
        rail.id = 'docspaceAppRailR3';
        rail.className = 'docspace-app-rail-r3';
        rail.setAttribute('aria-label', 'Navigation DocSpace');
        rail.innerHTML = `
            <button class="ds-r3-rail-logo" type="button" title="DocSpace / premier salon" data-r3-action="home">DS</button>
            <div class="ds-r3-rail-separator"></div>
            <button class="ds-r3-rail-btn" type="button" title="Messages privés" data-r3-action="dm">✉<span class="ds-r3-rail-badge" id="dsR3DmBadge">0</span></button>
            <button class="ds-r3-rail-btn" type="button" title="Amis" data-r3-action="friends">♙</button>
            <button class="ds-r3-rail-btn" type="button" title="Vocal" data-r3-action="voice">◖</button>
            <button class="ds-r3-rail-btn" type="button" title="Fichiers & médias" data-r3-action="files">▣</button>
            <button class="ds-r3-rail-btn" type="button" title="Hub / navigation rapide" data-r3-action="hub">☰</button>
            <div class="ds-r3-rail-spacer"></div>
            <button class="ds-r3-rail-btn" type="button" title="Paramètres" data-r3-action="settings">⚙</button>`;

        rail.addEventListener('click', (event) => {
            const button = event.target.closest('[data-r3-action]');
            if (!button) return;
            const action = button.dataset.r3Action;
            if (action === 'home') {
                const general = document.querySelector('.channel-item[data-channel="général"]') || document.querySelector('.channel-item[data-channel]');
                if (general) call('switchChannel', general.dataset.channel);
            } else if (action === 'dm') call('toggleDMSidebar');
            else if (action === 'friends') call('openFriendsModal');
            else if (action === 'voice') openVoiceArea();
            else if (action === 'files') call('openGallery');
            else if (action === 'hub') {
                if (typeof window.openQuickSwitcher === 'function') window.openQuickSwitcher();
                else call('toggleHeaderMore');
            } else if (action === 'settings') call('openSettings');
        });
        document.body.appendChild(rail);
    }

    function installServerHeader() {
        const header = document.querySelector('.channels-header');
        if (!header || header.dataset.r3Ready) return;
        header.dataset.r3Ready = '1';
        header.innerHTML = `
            <div class="ds-r3-server-head">
                <div class="ds-r3-server-row">
                    <span class="ds-r3-server-name">DocSpace</span>
                    <button class="ds-r3-server-menu" type="button" title="Plus d'options">⌄</button>
                </div>
                <div class="ds-r3-build-row">
                    <button class="ds-r3-chip" id="dsR3VersionChip" type="button" title="Voir les patch notes">V3.3 BETA</button>
                    <button class="ds-r3-chip admin" id="dsR3AdminChip" type="button" title="Administration" style="display:none">ADMIN</button>
                    <span class="ds-r3-chip retro">RETRO</span>
                </div>
            </div>`;

        header.querySelector('#dsR3VersionChip')?.addEventListener('click', () => call('showPatchNotes', true));
        header.querySelector('#dsR3AdminChip')?.addEventListener('click', () => call('showAdminLogin'));
        header.querySelector('.ds-r3-server-menu')?.addEventListener('click', () => {
            if (typeof window.toggleHeaderMore === 'function') window.toggleHeaderMore();
            else if (typeof window.openQuickSwitcher === 'function') window.openQuickSwitcher();
        });
        syncAdminChip();
    }

    function syncAdminChip() {
        const target = document.getElementById('dsR3AdminChip');
        const source = document.getElementById('versionAdminBadge') || document.getElementById('adminBadge');
        if (!target) return;
        let active = false;
        if (source) active = source.style.display !== 'none' && source.style.display !== '';
        try {
            if (typeof isAdmin !== 'undefined' && isAdmin) active = true;
        } catch (_) {}
        target.style.display = active ? 'inline-flex' : 'none';
    }

    function observeAdminState() {
        const source = document.getElementById('versionAdminBadge') || document.getElementById('adminBadge');
        if (!source) return;
        new MutationObserver(syncAdminChip).observe(source, { attributes: true, attributeFilter: ['style', 'class'] });
        setInterval(syncAdminChip, 1600);
    }

    function normalizeMessage(message) {
        if (!(message instanceof HTMLElement) || !message.classList.contains('message')) return;
        message.classList.remove('grouped');
        message.style.removeProperty('height');
        message.style.removeProperty('max-height');
        message.style.removeProperty('min-height');
        message.style.removeProperty('position');
        const image = message.querySelector('.message-image');
        if (image) image.closest('.attachment')?.classList.add('image-attachment');
    }

    function hardenTimeline() {
        const chat = document.getElementById('chatMessages');
        if (!chat) return;
        [...chat.children].forEach(normalizeMessage);
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof HTMLElement)) continue;
                    if (node.classList.contains('message')) normalizeMessage(node);
                    node.querySelectorAll?.('.message').forEach(normalizeMessage);
                }
            }
        });
        observer.observe(chat, { childList: true, subtree: true });
    }

    function syncDmBadge() {
        const badge = document.getElementById('dsR3DmBadge');
        if (!badge) return;
        let count = 0;
        const candidates = document.querySelectorAll('.dm-unread-badge, .dm-unread-count, [data-dm-unread]');
        candidates.forEach((el) => {
            // Ne jamais recompter le badge R3 lui-même si une classe change plus tard.
            if (el === badge || badge.contains(el)) return;
            const n = parseInt(el.textContent || el.dataset.dmUnread || '0', 10);
            if (Number.isFinite(n)) count += n;
        });

        const nextText = String(Math.min(count, 99));
        const shouldShow = count > 0;
        // Important : ne pas réécrire le DOM si la valeur n'a pas changé.
        // L'ancienne version pouvait créer une boucle infinie MutationObserver -> textContent -> MutationObserver.
        if (badge.textContent !== nextText) badge.textContent = nextText;
        if (badge.classList.contains('show') !== shouldShow) {
            badge.classList.toggle('show', shouldShow);
        }
    }

    let dmSyncQueued = false;
    function queueDmBadgeSync() {
        if (dmSyncQueued) return;
        dmSyncQueued = true;
        requestAnimationFrame(() => {
            dmSyncQueued = false;
            syncDmBadge();
        });
    }

    function observeDmStateSafely() {
        // R3.2: ne plus observer tout le document. Le panneau DM existe déjà dans le HTML,
        // donc seules ses mutations peuvent nécessiter une resynchronisation du badge.
        const dmSidebar = document.getElementById('dmSidebar');
        if (dmSidebar) {
            const observer = new MutationObserver(queueDmBadgeSync);
            observer.observe(dmSidebar, { childList: true, subtree: true, characterData: true });
        }

        // Filet de sécurité léger pour les compteurs mis à jour hors du panneau DM.
        setInterval(syncDmBadge, 2000);
    }

    function init() {
        document.body.classList.add('ds-r3-ready');
        injectRail();
        installServerHeader();
        observeAdminState();
        hardenTimeline();
        syncDmBadge();
        observeDmStateSafely();
    }

    let __dsInitDone = false;
    const __dsStartAfterLogin = () => {
        if (__dsInitDone) return;
        __dsInitDone = true;
        init();
    };
    window.addEventListener('docspace:connected', __dsStartAfterLogin, { once: true });
    if (window.__docspaceConnected === true) __dsStartAfterLogin();
})();



