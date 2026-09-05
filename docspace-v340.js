/* DocSpace 3.4 — account center, Discord-style DMs, custom emoji and Watch Together */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));
  const sock = () => { try { return socket || null; } catch (_) { return null; } };
  const username = () => { try { return String(currentUsername || ''); } catch (_) { return ''; } };
  const avatar = () => { try { return currentUserAvatar || ''; } catch (_) { return ''; } };
  const notifyUser = (title, message, type='info') => {
    try { if (typeof showNotification === 'function') return showNotification(title, message, type); } catch (_) {}
    if (type === 'error') console.error(`[${title}] ${message}`); else console.log(`[${title}] ${message}`);
  };
  const showSettingsError = message => notifyUser('Paramètres', message || 'Une erreur est survenue.', 'error');
  const emojiMap = new Map();
  let accountData = null;
  let plusData = null;
  let watchCode = '';
  let watchVideoId = '';
  let watchBoundSocket = null;
  let accountBoundSocket = null;
  let profileBoundSocket = null;
  let patched = false;

  document.body.classList.add('ds-v340-ready');

  function formatTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const today = new Date();
    const sameDay = date.toDateString() === today.toDateString();
    return sameDay
      ? date.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
      : date.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
  }

  function customEmojiHtml(value, small=false) {
    const text = esc(value);
    return text.replace(/:([a-z0-9_]{2,24}):/gi, (token, rawName) => {
      const item = emojiMap.get(String(rawName).toLowerCase());
      return item
        ? `<img class="ds-custom-emoji${small?' ds-small':''}" src="${esc(item.url)}" alt=":${esc(item.name)}:" title=":${esc(item.name)}:" loading="lazy">`
        : token;
    });
  }

  function replaceEmojiTokens(root=document) {
    if (!root || !emojiMap.size) return;
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!/:([a-z0-9_]{2,24}):/i.test(node.nodeValue || '')) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest('script,style,textarea,input,.ds-custom-emoji')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const parts = String(node.nodeValue || '').split(/(:[a-z0-9_]{2,24}:)/gi);
      if (parts.length < 2) return;
      const fragment = document.createDocumentFragment();
      parts.forEach(part => {
        const match = part.match(/^:([a-z0-9_]{2,24}):$/i);
        const item = match && emojiMap.get(match[1].toLowerCase());
        if (!item) return fragment.appendChild(document.createTextNode(part));
        const image = document.createElement('img');
        image.className = 'ds-custom-emoji';
        image.src = item.url;
        image.alt = `:${item.name}:`;
        image.title = image.alt;
        image.loading = 'lazy';
        fragment.appendChild(image);
      });
      node.replaceWith(fragment);
    });
  }

  function installEmojiMessagePatch() {
    const oldAdd = window.addMessage;
    if (typeof oldAdd === 'function' && !oldAdd._v340Wrapped) {
      const wrapped = function() {
        const result = oldAdd.apply(this, arguments);
        requestAnimationFrame(() => replaceEmojiTokens($('chatMessages')));
        return result;
      };
      wrapped._v340Wrapped = true;
      window.addMessage = wrapped;
    }
    const chat = $('chatMessages');
    if (chat && !chat.dataset.v340EmojiObserver) {
      chat.dataset.v340EmojiObserver = '1';
      new MutationObserver(mutations => mutations.forEach(m => m.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) replaceEmojiTokens(node);
      }))).observe(chat, { childList:true, subtree:true });
    }
  }

  function insertEmojiToken(name) {
    const dmOpen = $('dmSidebar')?.classList.contains('ds-dm-has-chat') && $('dmSidebar')?.classList.contains('open');
    const input = dmOpen ? $('dmInput') : $('messageInput');
    if (!input) return;
    const token = `:${name}:`;
    const start = Number.isFinite(input.selectionStart) ? input.selectionStart : input.value.length;
    const end = Number.isFinite(input.selectionEnd) ? input.selectionEnd : start;
    input.value = input.value.slice(0, start) + token + input.value.slice(end);
    input.focus();
    input.setSelectionRange?.(start + token.length, start + token.length);
    document.querySelector('.emoji-picker-popup')?.remove();
  }

  function decorateEmojiPicker() {
    const picker = $('emojiPickerPopup') || document.querySelector('.emoji-picker-popup,.emoji-picker');
    if (!picker || picker.querySelector('.ds-picker-custom')) return;
    const section = document.createElement('div');
    section.className = 'ds-picker-custom';
    const items = [...emojiMap.values()];
    section.innerHTML = `<div class="ds-picker-custom-title">Emojis DocSpace</div><div class="ds-picker-custom-grid">${
      items.length
        ? items.map(item => `<button class="ds-picker-emoji" type="button" data-ds-emoji="${esc(item.name)}" title=":${esc(item.name)}:"><img src="${esc(item.url)}" alt=""></button>`).join('')
        : '<span style="font-size:11px;color:#7f8899">Active DocSpace Plus pour ajouter tes emojis.</span>'
    }</div>`;
    section.addEventListener('click', event => {
      const button = event.target.closest('[data-ds-emoji]');
      if (button) insertEmojiToken(button.dataset.dsEmoji);
    });
    picker.prepend(section);
  }

  function installPickerPatch() {
    const oldPicker = window.openEmojiPicker;
    if (typeof oldPicker === 'function' && !oldPicker._v340Wrapped) {
      const wrapped = function() {
        const result = oldPicker.apply(this, arguments);
        setTimeout(decorateEmojiPicker, 0);
        return result;
      };
      wrapped._v340Wrapped = true;
      window.openEmojiPicker = wrapped;
    }
  }

  function dmData(peer) {
    try { return dmConversations?.[peer] || {}; } catch (_) { return {}; }
  }

  function dmMessages(peer) {
    const value = dmData(peer).messages;
    return Array.isArray(value) ? value : [];
  }

  function currentPeer() {
    try { return String(currentDMUser || ''); } catch (_) { return ''; }
  }

  function renderConversationListV340() {
    const container = $('dmConversations');
    if (!container) return;
    let entries = [];
    try { entries = Object.entries(dmConversations || {}); } catch (_) {}
    entries.sort((a,b) => {
      const left = dmMessages(a[0]).at(-1)?.timestamp || 0;
      const right = dmMessages(b[0]).at(-1)?.timestamp || 0;
      return new Date(right) - new Date(left);
    });
    if (!entries.length) {
      container.innerHTML = '<div style="padding:22px 12px;color:#858e9e;font-size:12px;line-height:1.5;text-align:center">Aucune conversation.<br>Choisis un ami ou un utilisateur en ligne.</div>';
      return;
    }
    container.innerHTML = entries.map(([peer, data]) => {
      const messages = dmMessages(peer);
      const last = messages.at(-1);
      const preview = last?.content || (last?.attachment ? '📎 Pièce jointe' : 'Nouvelle conversation');
      const isActive = currentPeer().toLowerCase() === peer.toLowerCase();
      return `<button type="button" class="dm-conversation${isActive?' active':''}" data-v340-dm="${esc(peer)}">
        <span class="dm-conversation-avatar">${data.avatar?`<img src="${esc(data.avatar)}" alt="">`:esc(peer.charAt(0).toUpperCase())}</span>
        <span class="dm-conversation-info"><span class="dm-conversation-name">${esc(peer)}</span><span class="dm-conversation-preview">${esc(preview.slice(0,42))}</span></span>
        ${last?`<span class="ds-dm-time">${esc(formatTime(last.timestamp))}</span>`:''}
        ${Number(data.unread)>0?`<span class="dm-conversation-unread">${Number(data.unread)}</span>`:''}
      </button>`;
    }).join('');
  }

  function renderMessagesV340() {
    const peer = currentPeer();
    const container = $('dmChatMessages');
    if (!peer || !container) return;
    const data = dmData(peer);
    const peerAvatar = data.avatar || '';
    const messages = dmMessages(peer);
    const me = username();
    const myAvatar = avatar();
    const welcome = `<div class="ds-dm-welcome"><div class="ds-dm-welcome-avatar">${peerAvatar?`<img src="${esc(peerAvatar)}" alt="">`:esc(peer.charAt(0).toUpperCase())}</div><h2>${esc(peer)}</h2><p>Début de ta conversation privée avec <strong>${esc(peer)}</strong>.</p></div>`;
    container.innerHTML = welcome + (messages.length ? messages.map(message => {
      const author = String(message.from || peer);
      const own = author.toLowerCase() === me.toLowerCase();
      const picture = own ? myAvatar : peerAvatar;
      let attachment = '';
      try { attachment = message.attachment && typeof renderDMAttachment === 'function' ? renderDMAttachment(message.attachment) : ''; } catch (_) {}
      return `<div class="ds-dm-message-row${own?' own':''}">
        <div class="ds-dm-message-avatar">${picture?`<img src="${esc(picture)}" alt="">`:esc(author.charAt(0).toUpperCase())}</div>
        <div class="ds-dm-message-meta"><span class="ds-dm-message-author">${esc(author)}</span><span class="ds-dm-message-time">${esc(formatTime(message.timestamp))}</span></div>
        <div class="ds-dm-message-body">${message.content?customEmojiHtml(message.content):''}${attachment}</div>
      </div>`;
    }).join('') : '<div style="padding:8px 5px;color:#7f8899;font-size:12px">Aucun message. Dis bonjour 👋</div>');
    container.scrollTop = container.scrollHeight;
  }

  function ensureProfilePane() {
    const sidebar = $('dmSidebar');
    if (!sidebar || $('dsDmProfilePane')) return;
    const pane = document.createElement('aside');
    pane.id = 'dsDmProfilePane';
    pane.className = 'ds-dm-profile';
    pane.innerHTML = '<div style="color:#7f8899;font-size:12px">Sélectionne une conversation.</div>';
    sidebar.appendChild(pane);
  }

  function renderDmProfile(profile) {
    if (!profile || String(profile.username || '').toLowerCase() !== currentPeer().toLowerCase()) return;
    const pane = $('dsDmProfilePane');
    if (!pane) return;
    const gradient = profile.profileGradient || profile.profileColor || 'linear-gradient(135deg,#4d57d6,#8d52d9)';
    const online = profile.status && profile.status !== 'offline';
    pane.innerHTML = `<div class="ds-dm-profile-banner" style="background:${esc(gradient)}"></div>
      <div class="ds-dm-profile-avatar">${profile.avatar?`<img src="${esc(profile.avatar)}" alt="">`:esc(String(profile.username||'?').charAt(0).toUpperCase())}</div>
      <h3>${esc(profile.username || '')}</h3>
      <div class="ds-dm-profile-status"><i class="${online?'online':''}"></i>${online?'En ligne':'Hors ligne'} · niveau ${Number(profile.level||0)}</div>
      <div class="ds-dm-profile-card"><h4>À propos</h4><p>${esc(profile.bio || 'Aucune biographie pour le moment.')}</p></div>
      <div class="ds-dm-profile-card"><h4>Membre DocSpace</h4><p>${profile.joinDate?esc(new Date(profile.joinDate).toLocaleDateString('fr-FR')):'Date inconnue'} · ${Number(profile.messageCount||0).toLocaleString('fr-FR')} messages</p></div>`;
  }

  function requestDmProfile() {
    const peer = currentPeer();
    if (peer) sock()?.emit('get_user_profile', { username:peer });
  }

  function installDmPatch() {
    ensureProfilePane();
    const sidebar = $('dmSidebar');
    const list = $('dmConversations');
    if (list && !list.dataset.v340Click) {
      list.dataset.v340Click = '1';
      list.addEventListener('click', event => {
        const row = event.target.closest('[data-v340-dm]');
        if (!row) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.openDMWith?.(row.dataset.v340Dm);
      }, true);
    }
    const oldOpen = window.openDMWith;
    if (typeof oldOpen === 'function' && !oldOpen._v340Wrapped) {
      const wrapped = function(peer) {
        const result = oldOpen.apply(this, arguments);
        sidebar?.classList.add('ds-dm-has-chat');
        requestAnimationFrame(() => {
          const listBox = $('dmConversations');
          if (listBox && window.innerWidth > 860) listBox.style.setProperty('display','block','important');
          renderConversationListV340();
          renderMessagesV340();
          requestDmProfile();
        });
        return result;
      };
      wrapped._v340Wrapped = true;
      window.openDMWith = wrapped;
    }
    const oldBack = window.backToDMList;
    if (typeof oldBack === 'function' && !oldBack._v340Wrapped) {
      const wrapped = function() {
        const result = oldBack.apply(this, arguments);
        sidebar?.classList.remove('ds-dm-has-chat');
        renderConversationListV340();
        return result;
      };
      wrapped._v340Wrapped = true;
      window.backToDMList = wrapped;
    }
    window.renderDMMessages = renderMessagesV340;
    window.renderDMConversations = renderConversationListV340;
    renderConversationListV340();
  }

  function accountPanel() {
    return `<section class="ds-settings-panel active" data-ds-settings-panel="account">
      <h2>Mon compte</h2><p class="ds-settings-lead">Gère ton email et ton mot de passe sans exposer tes identifiants dans le navigateur.</p>
      <div class="ds-settings-card"><div class="ds-account-summary"><span class="avatar" id="dsAccountAvatar">${avatar()?`<img src="${esc(avatar())}" alt="">`:'👤'}</span><div><strong id="dsAccountUsername">${esc(username()||'Compte invité')}</strong><span id="dsAccountState">Chargement du compte…</span></div></div></div>
      <div class="ds-settings-card"><h3>Adresse email</h3><p>Tu pourras te connecter avec ton pseudo ou cette adresse.</p><div class="ds-form-row"><div class="ds-form-field"><label for="dsAccountEmail">Nouvel email</label><input id="dsAccountEmail" type="email" autocomplete="email" placeholder="toi@exemple.fr"></div><button class="ds-primary" id="dsSaveEmail" type="button">Enregistrer</button></div><div class="ds-form-field" style="margin-top:9px"><label for="dsEmailPassword">Mot de passe actuel</label><input id="dsEmailPassword" type="password" autocomplete="current-password"></div></div>
      <div class="ds-settings-card"><h3>Changer le mot de passe</h3><p>Utilise au moins 8 caractères. La nouvelle session reste uniquement dans cet onglet.</p><div class="ds-form-row two"><div class="ds-form-field"><label for="dsCurrentPassword">Mot de passe actuel</label><input id="dsCurrentPassword" type="password" autocomplete="current-password"></div><div class="ds-form-field"><label for="dsNewPassword">Nouveau mot de passe</label><input id="dsNewPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password"></div></div><button class="ds-primary" id="dsSavePassword" type="button" style="margin-top:10px">Modifier le mot de passe</button></div>
      <div class="ds-settings-card"><h3>Administration</h3><p>Le mot de passe administrateur est maintenant vérifié uniquement par le serveur.</p><button class="ds-secondary" id="dsOpenAdmin" type="button">Ouvrir l’administration</button></div>
    </section>`;
  }

  function plusPanel() {
    return `<section class="ds-settings-panel" data-ds-settings-panel="plus">
      <h2>DocSpace Plus</h2><p class="ds-settings-lead">Pas d’achat intégré : Plus s’active une seule fois avec un code créé par l’administrateur.</p>
      <div class="ds-settings-card ds-plus-hero"><span class="ds-plus-badge" id="dsPlusBadge">◇ Plus inactif</span><h3 style="margin-top:12px">Emojis personnalisés et futures options bonus</h3><p id="dsPlusMessage">Entre ton code d’activation pour débloquer Plus sur ce compte.</p><div class="ds-form-row"><div class="ds-form-field"><label for="dsPlusCode">Code d’activation</label><input id="dsPlusCode" type="text" maxlength="80" autocomplete="off" placeholder="DOCSPACE-XXXX-XXXX"></div><button class="ds-primary" id="dsRedeemPlus" type="button">Activer</button></div></div>
      <div class="ds-settings-card"><h3>Emojis personnalisés</h3><p>PNG, JPG, WEBP ou GIF, 512 Ko maximum. Dans un message, écris ensuite <strong>:nom:</strong>.</p><div class="ds-form-row two"><div class="ds-form-field"><label for="dsEmojiName">Nom</label><input id="dsEmojiName" type="text" maxlength="24" placeholder="chat_content"></div><div class="ds-form-field"><label for="dsEmojiFile">Image</label><input id="dsEmojiFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></div></div><button class="ds-primary" id="dsCreateEmoji" type="button" style="margin-top:10px">Ajouter l’emoji</button><div class="ds-emoji-list" id="dsEmojiList"></div></div>
    </section>`;
  }

  function ensureSettingsCenter() {
    const modal = $('settingsModal');
    const content = modal?.querySelector('.modal-content');
    if (!content || content.querySelector('.ds-settings-shell')) return;
    const originalSections = [...content.children].filter(node => node.classList?.contains('settings-section'));
    const shell = document.createElement('div');
    shell.className = 'ds-settings-shell';
    shell.innerHTML = `<aside class="ds-settings-nav-wrap"><nav class="ds-settings-nav"><div class="ds-settings-user"><strong>${esc(username()||'DocSpace')}</strong><span>Paramètres utilisateur</span></div><button class="ds-settings-tab active" data-ds-settings="account" type="button">Mon compte</button><button class="ds-settings-tab" data-ds-settings="appearance" type="button">Apparence & application</button><button class="ds-settings-tab" data-ds-settings="voice" type="button">Voix & vidéo</button><button class="ds-settings-tab plus" data-ds-settings="plus" type="button">◇ DocSpace Plus</button></nav></aside><main class="ds-settings-main">${accountPanel()}<section class="ds-settings-panel" data-ds-settings-panel="appearance"><h2>Apparence & application</h2><p class="ds-settings-lead">Personnalise DocSpace, les notifications et le comportement du chat.</p><div id="dsAppearanceSettings"></div></section><section class="ds-settings-panel" data-ds-settings-panel="voice"><h2>Voix & vidéo</h2><p class="ds-settings-lead">Choisis ton micro, ta caméra, la sortie audio et le mode Push-to-Talk.</p><div id="dsVoiceSettings"></div></section>${plusPanel()}</main>`;
    content.appendChild(shell);
    const appearance = $('dsAppearanceSettings');
    const voice = $('dsVoiceSettings');
    originalSections.forEach(section => {
      const isVoice = !!section.querySelector('#voiceDefaultQualitySelect,#voiceAskEveryTimeToggle,#voiceAutoFocusDefaultToggle,#dsR504VoiceExtras') || /vocal|micro|caméra|audio|voice/i.test(section.textContent || '');
      (isVoice ? voice : appearance).appendChild(section);
    });
    shell.addEventListener('click', event => {
      const tab = event.target.closest('[data-ds-settings]');
      if (!tab) return;
      selectSettingsTab(tab.dataset.dsSettings);
    });
    $('dsSaveEmail')?.addEventListener('click', saveAccountEmail);
    $('dsSavePassword')?.addEventListener('click', saveAccountPassword);
    $('dsRedeemPlus')?.addEventListener('click', redeemPlus);
    $('dsCreateEmoji')?.addEventListener('click', createEmoji);
    $('dsOpenAdmin')?.addEventListener('click', () => window.openAdminFromSettings?.());
  }

  function selectSettingsTab(name='account') {
    document.querySelectorAll('[data-ds-settings]').forEach(button => button.classList.toggle('active', button.dataset.dsSettings === name));
    document.querySelectorAll('[data-ds-settings-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.dsSettingsPanel === name));
  }

  function saveAccountEmail() {
    const email = $('dsAccountEmail')?.value.trim();
    const currentPassword = $('dsEmailPassword')?.value || '';
    if (!email || !currentPassword) return showSettingsError('Entre le nouvel email et ton mot de passe actuel.');
    sock()?.emit('update_account_email', { email, currentPassword });
  }

  function saveAccountPassword() {
    const currentPassword = $('dsCurrentPassword')?.value || '';
    const newPassword = $('dsNewPassword')?.value || '';
    if (!currentPassword || newPassword.length < 8) return showSettingsError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    sock()?.emit('change_account_password', { currentPassword, newPassword });
  }

  function redeemPlus() {
    const code = $('dsPlusCode')?.value.trim();
    if (!code) return showSettingsError('Entre un code DocSpace Plus.');
    sock()?.emit('redeem_plus_code', { code });
  }

  function createEmoji() {
    const name = $('dsEmojiName')?.value.trim().toLowerCase();
    const file = $('dsEmojiFile')?.files?.[0];
    if (!/^[a-z0-9_]{2,24}$/.test(name || '')) return showSettingsError('Nom : 2 à 24 lettres, chiffres ou _.');
    if (!file) return showSettingsError('Choisis une image pour l’emoji.');
    if (file.size > 512 * 1024) return showSettingsError('L’image dépasse 512 Ko.');
    const reader = new FileReader();
    reader.onerror = () => showSettingsError('Impossible de lire cette image.');
    reader.onload = () => sock()?.emit('create_custom_emoji', { name, dataUrl:reader.result });
    reader.readAsDataURL(file);
  }

  function renderAccount(data) {
    accountData = data;
    if (!data?.authenticated) {
      if ($('dsAccountState')) $('dsAccountState').textContent = 'Mode invité — crée un compte pour utiliser ces réglages.';
      return;
    }
    if ($('dsAccountUsername')) $('dsAccountUsername').textContent = data.username || username();
    if ($('dsAccountState')) $('dsAccountState').textContent = data.email ? data.email : 'Ajoute une adresse email';
    if ($('dsAccountEmail')) $('dsAccountEmail').value = data.email || '';
  }

  function renderPlus(data) {
    plusData = data;
    const active = !!data?.plusActive;
    const badge = $('dsPlusBadge');
    if (badge) { badge.classList.toggle('active', active); badge.textContent = active ? '✓ Plus actif' : '◇ Plus inactif'; }
    if ($('dsPlusMessage')) $('dsPlusMessage').textContent = active ? 'Plus est actif sur ton compte. Tu peux créer et utiliser des emojis personnalisés.' : 'Entre ton code d’activation pour débloquer Plus sur ce compte.';
    if ($('dsRedeemPlus')) $('dsRedeemPlus').disabled = active;
    if ($('dsPlusCode')) $('dsPlusCode').disabled = active;
  }

  function renderEmojiList() {
    const container = $('dsEmojiList');
    if (!container) return;
    const me = username().toLowerCase();
    const items = [...emojiMap.values()];
    container.innerHTML = items.length ? items.map(item => `<div class="ds-emoji-item"><img src="${esc(item.url)}" alt=""><span>:${esc(item.name)}:</span>${String(item.owner||'').toLowerCase()===me?`<button type="button" data-delete-emoji="${esc(item.id)}" title="Supprimer">×</button>`:''}</div>`).join('') : '<span style="font-size:11px;color:#7f8899">Aucun emoji personnalisé.</span>';
    container.querySelectorAll('[data-delete-emoji]').forEach(button => button.addEventListener('click', () => sock()?.emit('delete_custom_emoji', { id:button.dataset.deleteEmoji })));
  }

  function bindAccountSocket() {
    const current = sock();
    if (!current || accountBoundSocket === current) return;
    accountBoundSocket = current;
    current.on('account_self', renderAccount);
    current.on('account_settings_saved', data => {
      renderAccount({ authenticated:true, ...data });
      if (data.type === 'password') {
        const newPassword = $('dsNewPassword')?.value || '';
        if (newPassword) sessionStorage.setItem('docspace_session_password', newPassword);
        if ($('dsCurrentPassword')) $('dsCurrentPassword').value = '';
        if ($('dsNewPassword')) $('dsNewPassword').value = '';
      }
      if ($('dsEmailPassword')) $('dsEmailPassword').value = '';
      notifyUser('Paramètres', data.type === 'email' ? 'Adresse email enregistrée.' : 'Mot de passe modifié.', 'success');
    });
    current.on('account_settings_error', data => showSettingsError(data?.message));
    current.on('plus_status', data => { renderPlus(data); if (data?.activated) notifyUser('DocSpace Plus', 'Plus est maintenant activé sur ton compte.', 'success'); });
    current.on('plus_error', data => showSettingsError(data?.message));
    current.on('custom_emojis_list', items => {
      emojiMap.clear();
      (Array.isArray(items)?items:[]).forEach(item => item?.name && emojiMap.set(String(item.name).toLowerCase(), item));
      renderEmojiList();
      replaceEmojiTokens(document);
    });
    current.on('custom_emoji_error', data => showSettingsError(data?.message));
    current.on('admin_login_result', data => {
      if (data?.success) {
        try {
          if (!isAdmin && typeof enableAdminMode === 'function') enableAdminMode(true);
          if (typeof showAdminLogin === 'function') showAdminLogin();
        } catch (_) {}
      } else {
        try {
          sessionStorage.removeItem('docspace_admin_password');
          ADMIN_PASSWORD = '';
          const field = $('adminPassword'); if (field) field.value = '';
        } catch (_) {}
        notifyUser('Administration', data?.message || 'Mot de passe administrateur incorrect.', 'error');
      }
    });
    current.emit('get_account_self');
    current.emit('get_plus_status');
    current.emit('get_custom_emojis');
  }

  function installSettingsPatch() {
    ensureSettingsCenter();
    const oldOpen = window.openSettings;
    if (typeof oldOpen === 'function' && !oldOpen._v340Wrapped) {
      const wrapped = function() {
        const result = oldOpen.apply(this, arguments);
        ensureSettingsCenter();
        selectSettingsTab('account');
        bindAccountSocket();
        sock()?.emit('get_account_self');
        sock()?.emit('get_plus_status');
        sock()?.emit('get_custom_emojis');
        return result;
      };
      wrapped._v340Wrapped = true;
      window.openSettings = wrapped;
    }
  }

  function installProfileSocket() {
    const current = sock();
    if (!current || profileBoundSocket === current) return;
    profileBoundSocket = current;
    current.on('user_profile', renderDmProfile);
    current.on('dm_history', () => setTimeout(() => { renderMessagesV340(); renderConversationListV340(); }, 20));
    current.on('dm_conversations', () => setTimeout(renderConversationListV340, 20));
    current.on('private_message', () => setTimeout(() => { renderMessagesV340(); renderConversationListV340(); }, 20));
  }

  function ensureWatchHub() {
    if ($('dsWatchHub')) return;
    const hub = document.createElement('section');
    hub.id = 'dsWatchHub';
    hub.innerHTML = `<div class="ds-watch-shell"><header class="ds-watch-header"><div><h1>▶ Regarder ensemble</h1><p>Un lecteur YouTube officiel synchronisé avec tes amis — sans proxy.</p></div><span class="grow"></span><button class="ds-secondary" id="dsWatchBack" type="button">Retour au serveur</button></header><div class="ds-watch-grid"><div class="ds-watch-player" id="dsWatchPlayer"><div class="ds-watch-empty">Rejoins une salle puis colle une URL YouTube.</div></div><aside class="ds-watch-side"><h3>Salle de visionnage</h3><div class="ds-watch-room"><input id="dsWatchCode" maxlength="16" value="WATCH" aria-label="Code de salle"><button class="ds-primary" id="dsWatchJoin" type="button">Rejoindre</button></div><div style="margin-top:12px"><input class="ds-watch-url" id="dsWatchUrl" placeholder="Lien YouTube ou identifiant vidéo" aria-label="Lien YouTube"></div><div class="ds-watch-controls"><button class="ds-primary" id="dsWatchLoad" type="button">Charger</button><button class="ds-secondary" id="dsWatchPlay" type="button">▶ Lecture</button><button class="ds-secondary" id="dsWatchPause" type="button">Ⅱ Pause</button></div><div class="ds-watch-members" id="dsWatchMembers"></div><p class="ds-watch-note">La vidéo vient directement de YouTube via son lecteur intégré. DocSpace synchronise seulement le lien, la lecture et la position.</p></aside></div></div>`;
    document.body.appendChild(hub);
    $('dsWatchBack')?.addEventListener('click', closeWatch);
    $('dsWatchJoin')?.addEventListener('click', joinWatch);
    $('dsWatchLoad')?.addEventListener('click', () => sendWatchState({ videoId:$('dsWatchUrl')?.value, playing:true, position:0 }));
    $('dsWatchPlay')?.addEventListener('click', () => { playerCommand('playVideo'); sendWatchState({ playing:true, position:currentWatchPosition() }); });
    $('dsWatchPause')?.addEventListener('click', () => { playerCommand('pauseVideo'); sendWatchState({ playing:false, position:currentWatchPosition() }); });
  }

  function installWatchRailButton() {
    const rail = $('docspaceAppRailR3') || document.querySelector('.server-sidebar');
    if (!rail || $('dsWatchRailButton')) return;
    const button = document.createElement('button');
    button.id = 'dsWatchRailButton';
    button.className = 'server-icon ds-watch-rail-btn';
    button.type = 'button';
    button.title = 'Regarder ensemble';
    button.innerHTML = '▶<span class="dot"></span>';
    button.addEventListener('click', openWatch);
    rail.appendChild(button);
  }

  function openWatch() {
    ensureWatchHub();
    document.body.classList.remove('ds-games-active');
    document.body.classList.add('ds-watch-active');
    $('dmSidebar')?.classList.remove('open');
  }

  function closeWatch() {
    document.body.classList.remove('ds-watch-active');
    try { if (typeof switchChannel === 'function') switchChannel(currentChannel || 'général'); } catch (_) {}
  }

  function normalizeVideoId(value) {
    const raw = String(value || '').trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    const match = raw.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/i);
    return match ? match[1] : '';
  }

  function joinWatch() {
    const code = String($('dsWatchCode')?.value || 'WATCH').toUpperCase().replace(/[^A-Z0-9_-]/g,'').slice(0,16) || 'WATCH';
    watchCode = code;
    if ($('dsWatchCode')) $('dsWatchCode').value = code;
    sock()?.emit('watch_join', { code });
  }

  function sendWatchState(partial) {
    if (!watchCode) joinWatch();
    const videoValue = partial.videoId;
    const videoId = videoValue === undefined ? undefined : normalizeVideoId(videoValue);
    if (videoValue !== undefined && !videoId) return notifyUser('Regarder ensemble', 'Ce lien YouTube n’est pas valide.', 'error');
    sock()?.emit('watch_control', { code:watchCode, ...partial, ...(videoId?{videoId}:{}) });
  }

  function loadWatchPlayer(id) {
    if (!id || id === watchVideoId) return;
    watchVideoId = id;
    const holder = $('dsWatchPlayer');
    if (!holder) return;
    const origin = encodeURIComponent(location.origin);
    holder.innerHTML = `<iframe id="dsWatchFrame" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?enablejsapi=1&playsinline=1&rel=0&origin=${origin}" title="Lecteur YouTube partagé" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  }

  function playerCommand(command, args=[]) {
    $('dsWatchFrame')?.contentWindow?.postMessage(JSON.stringify({ event:'command', func:command, args }), '*');
  }

  function currentWatchPosition() {
    return Number(sessionStorage.getItem('docspace_watch_position') || 0);
  }

  function applyWatchState(state) {
    if (!state) return;
    watchCode = state.code || watchCode;
    if ($('dsWatchCode') && watchCode) $('dsWatchCode').value = watchCode;
    if (state.videoId) {
      loadWatchPlayer(state.videoId);
      const elapsed = state.playing ? Math.max(0,(Date.now()-Number(state.updatedAt||Date.now()))/1000) : 0;
      const position = Math.max(0,Number(state.position||0)+elapsed);
      sessionStorage.setItem('docspace_watch_position', String(position));
      setTimeout(() => {
        playerCommand('seekTo',[position,true]);
        playerCommand(state.playing?'playVideo':'pauseVideo');
      }, 900);
    }
    if (Array.isArray(state.participants)) renderWatchMembers(state.participants);
  }

  function renderWatchMembers(items=[]) {
    const box = $('dsWatchMembers');
    if (box) box.innerHTML = items.map(name => `<span class="ds-watch-member">${esc(name)}</span>`).join('');
  }

  function bindWatchSocket() {
    const current = sock();
    if (!current || watchBoundSocket === current) return;
    watchBoundSocket = current;
    current.on('watch_snapshot', applyWatchState);
    current.on('watch_state', applyWatchState);
    current.on('watch_participants', data => renderWatchMembers(data?.participants || []));
    current.on('watch_error', data => notifyUser('Regarder ensemble', data?.message || 'Erreur de synchronisation.', 'error'));
  }

  function installWatchPositionTracking() {
    if (window.__dsWatchPositionTracking) return;
    window.__dsWatchPositionTracking = true;
    window.addEventListener('message', event => {
      if (!/https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com$/i.test(event.origin || '')) return;
      let data = event.data;
      try { if (typeof data === 'string') data = JSON.parse(data); } catch (_) { return; }
      const position = Number(data?.info?.currentTime);
      if (Number.isFinite(position) && position >= 0) sessionStorage.setItem('docspace_watch_position', String(position));
    });
  }

  function installNavigationPatch() {
    document.addEventListener('click', event => {
      if (event.target.closest('.channel-item,.voice-channel-item,[data-r4-action="server"],[data-r4-action="dm"]')) document.body.classList.remove('ds-watch-active');
    }, true);
  }

  function init() {
    if (patched) return;
    patched = true;
    document.body.classList.add('ds-v340-ready');
    installDmPatch();
    installSettingsPatch();
    installEmojiMessagePatch();
    installPickerPatch();
    ensureWatchHub();
    installWatchRailButton();
    installNavigationPatch();
    bindAccountSocket();
    installProfileSocket();
    bindWatchSocket();
    installWatchPositionTracking();
    console.log('[DocSpace 3.4] UI, account center, custom emojis and Watch Together ready');
  }

  const start = () => setTimeout(init, 0);
  window.addEventListener('docspace:connected', start, { once:true });
  if (window.__docspaceConnected === true) start();
})();
