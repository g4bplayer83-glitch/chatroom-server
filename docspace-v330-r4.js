/* DocSpace v3.3.0 BETA R4 — Discord UI Remake */
(() => {
  'use strict';

  const call = (name, ...args) => {
    try {
      const fn = window[name];
      if (typeof fn === 'function') return fn(...args);
    } catch (e) { console.warn('[R4]', name, e); }
  };

  function repairComposerPlacement(){
    const composer = document.querySelector('.chat-input-container');
    const root = document.querySelector('.chat-container');
    const voiceMini = document.getElementById('voiceMiniBar');
    if (!composer || !root) return;
    // The consolidated HTML had malformed mobile-tool nesting in some builds.
    // Make the composer a direct child of the application shell so overlays can never swallow it.
    if (composer.parentElement !== root) {
      if (voiceMini && voiceMini.parentElement === root) root.insertBefore(composer, voiceMini);
      else root.appendChild(composer);
    }
    composer.style.removeProperty('display');
    composer.style.removeProperty('visibility');
    composer.style.removeProperty('opacity');
  }

  function remakeRail(){
    const rail = document.getElementById('docspaceAppRailR3');
    if (!rail || rail.dataset.r4Ready) return;
    rail.dataset.r4Ready = '1';
    rail.innerHTML = `
      <button class="ds-r4-home-btn" data-r4-action="dm" title="Accueil / Messages privés">💬<span id="dsR4DmBadge" class="ds-r4-rail-badge">0</span></button>
      <div class="ds-r4-rail-sep"></div>
      <button class="ds-r4-server-btn active" data-r4-action="server" title="DocSpace — serveur principal">DS</button>
      <div class="ds-r4-rail-spacer"></div>
      <button class="ds-r4-settings-btn" data-r4-action="settings" title="Paramètres">⚙</button>`;
    rail.addEventListener('click', e => {
      const btn = e.target.closest('[data-r4-action]');
      if (!btn) return;
      if (btn.dataset.r4Action === 'dm') call('toggleDMSidebar');
      if (btn.dataset.r4Action === 'server') {
        call('closeDMSidebar');
        const general = document.querySelector('.channel-item[data-channel="général"]') || document.querySelector('.channel-item[data-channel]');
        if (general) call('switchChannel', general.dataset.channel);
      }
      if (btn.dataset.r4Action === 'settings') call('openSettings');
    });
  }

  function syncDmBadge(){
    const target = document.getElementById('dsR4DmBadge');
    if (!target) return;
    let n = 0;
    document.querySelectorAll('.dm-conversation-unread,.dm-unread-badge,[data-dm-unread]').forEach(el => {
      if (el === target || target.contains(el)) return;
      const v = parseInt(el.textContent || el.dataset.dmUnread || '0',10);
      if (Number.isFinite(v)) n += v;
    });
    target.textContent = n > 99 ? '99+' : String(n);
    target.classList.toggle('show', n > 0);
  }

  function remakeDM(){
    const dm = document.getElementById('dmSidebar');
    if (!dm || dm.dataset.r4Ready) return;
    dm.dataset.r4Ready = '1';
    const header = dm.querySelector('.dm-header');
    if (header) {
      const actions = document.createElement('div');
      actions.className = 'ds-r4-dm-home-actions';
      actions.innerHTML = `<button type="button" data-dm-home="friends">👥 Amis</button><button type="button" data-dm-home="close">Fermer</button>`;
      header.appendChild(actions);
      actions.addEventListener('click', e => {
        const b = e.target.closest('[data-dm-home]'); if(!b) return;
        if(b.dataset.dmHome === 'friends') call('openFriendsModal');
        if(b.dataset.dmHome === 'close') call('closeDMSidebar');
      });
    }
    const chatView = document.getElementById('dmChatView');
    if (chatView && !document.getElementById('dsR4DmEmpty')) {
      const empty = document.createElement('div');
      empty.id = 'dsR4DmEmpty';
      empty.className = 'ds-r4-dm-empty';
      empty.innerHTML = `<div><strong>Messages privés</strong><span>Sélectionne une conversation à gauche ou ouvre le profil d'un membre.</span></div>`;
      chatView.appendChild(empty);
    }
    updateDmState();
  }

  function updateDmState(){
    const dm = document.getElementById('dmSidebar');
    if (!dm) return;
    let has = false;
    try { has = !!currentDMUser; } catch (_) {}
    dm.classList.toggle('ds-dm-has-chat', has);
    document.body.classList.toggle('ds-dm-open', dm.classList.contains('open'));
    syncDmBadge();
  }

  function wrapDmFunctions(){
    ['openDMWith','backToDMList','toggleDMSidebar','closeDMSidebar','renderDMConversations'].forEach(name => {
      const orig = window[name];
      if (typeof orig !== 'function' || orig._r4Wrapped) return;
      const wrapped = function(...args){
        const ret = orig.apply(this,args);
        requestAnimationFrame(updateDmState);
        return ret;
      };
      wrapped._r4Wrapped = true;
      window[name] = wrapped;
    });
  }

  function enhanceFriends(){
    const modal = document.getElementById('friendsModal');
    const content = modal?.querySelector('.modal-content');
    const tabs = modal?.querySelector('.friends-tabs');
    if (!modal || !content || !tabs || content.dataset.r4Ready) return;
    content.dataset.r4Ready = '1';
    const add = document.createElement('div');
    add.className = 'ds-r4-friend-add';
    add.innerHTML = `<input id="dsR4FriendInput" type="text" autocomplete="off" placeholder="Ajouter un ami avec son pseudo"><button id="dsR4FriendAddBtn" type="button">Envoyer la demande</button>`;
    tabs.before(add);
    const send = () => {
      const input = document.getElementById('dsR4FriendInput');
      const username = (input?.value || '').trim();
      if (!username) return;
      call('sendFriendRequest', username);
      input.value = '';
    };
    add.querySelector('button').addEventListener('click', send);
    add.querySelector('input').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); send(); }});
  }

  function decorateMessage(msg){
    if (!(msg instanceof HTMLElement) || !msg.classList.contains('message') || msg.dataset.r4Toolbar) return;
    msg.dataset.r4Toolbar = '1';
    const id = msg.dataset.messageId;
    if (!id) return;
    const username = msg.dataset.username || '';
    const content = msg.dataset.content || '[Pièce jointe]';
    const own = msg.classList.contains('own');
    let admin = false; try { admin = !!isAdmin; } catch (_) {}
    const bar = document.createElement('div');
    bar.className = 'ds-message-toolbar';
    bar.innerHTML = `
      <button type="button" data-act="react" title="Ajouter une réaction">😊</button>
      <button type="button" data-act="reply" title="Répondre">↩</button>
      <span class="ds-message-toolbar-sep"></span>
      <button type="button" class="ds-message-advanced" data-act="bookmark" title="Sauvegarder">🔖</button>
      <button type="button" class="ds-message-advanced" data-act="copy" title="Copier le texte">📋</button>
      ${admin ? '<button type="button" class="ds-message-advanced" data-act="pin" title="Épingler">📌</button>' : ''}
      ${own ? '<button type="button" class="ds-message-advanced" data-act="edit" title="Modifier">✎</button>' : ''}
      ${own ? '<button type="button" class="ds-message-advanced danger" data-act="delete" title="Supprimer">🗑</button>' : ''}
      <button type="button" data-act="more" title="Plus">•••</button>`;
    bar.addEventListener('click', e => {
      e.stopPropagation();
      const b = e.target.closest('[data-act]'); if(!b) return;
      const act = b.dataset.act;
      if(act === 'react') call('openReactionPicker', e, id);
      if(act === 'reply') call('replyToMessage', id, username, content);
      if(act === 'bookmark') call('bookmarkMessage', id);
      if(act === 'pin') call('pinMessage', id, username, content);
      if(act === 'copy') {
        navigator.clipboard?.writeText(content).then(() => call('showNotification','📋 Copié','Texte du message copié','success')).catch(()=>{});
      }
      if(act === 'edit') call('openEditModal', id);
      if(act === 'delete') call('deleteMessage', id);
      if(act === 'more') call('toggleMessageMenu', e, id);
    });
    msg.appendChild(bar);
  }

  function installMessageToolbar(){
    const chat = document.getElementById('chatMessages');
    if (!chat) return;
    chat.querySelectorAll('.message').forEach(decorateMessage);
    const obs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (!(n instanceof HTMLElement)) return;
      if(n.classList.contains('message')) decorateMessage(n);
      n.querySelectorAll?.('.message').forEach(decorateMessage);
    })));
    obs.observe(chat,{childList:true,subtree:true});

    document.addEventListener('keydown', e => {
      if(e.key === 'Shift' && !e.repeat) document.body.classList.add('ds-shift-actions');
    });
    document.addEventListener('keyup', e => {
      if(e.key === 'Shift') document.body.classList.remove('ds-shift-actions');
    });
    window.addEventListener('blur', () => document.body.classList.remove('ds-shift-actions'));
  }

  function hardenContextMenus(){
    const origToggle = window.toggleMessageMenu;
    const origClose = window.closeAllMenus;
    if (typeof origToggle === 'function' && !origToggle._r4Wrapped) {
      const wrapped = function(event,id){
        const ret = origToggle.apply(this,arguments);
        requestAnimationFrame(() => {
          const menu = document.getElementById(`menu-${id}`);
          const source = event?.currentTarget || event?.target?.closest?.('button');
          if (!menu || !menu.classList.contains('active') || !source) return;
          const r = source.getBoundingClientRect();
          menu.style.position = 'fixed';
          menu.style.right = 'auto';
          menu.style.bottom = 'auto';
          const w = Math.max(menu.offsetWidth || 220,220);
          const h = Math.max(menu.offsetHeight || 160,120);
          let left = r.right - w;
          let top = r.bottom + 6;
          if (left < 8) left = 8;
          if (left + w > innerWidth - 8) left = innerWidth - w - 8;
          if (top + h > innerHeight - 8) top = Math.max(8,r.top - h - 6);
          menu.style.left = `${left}px`;
          menu.style.top = `${top}px`;
          menu.closest('.message')?.classList.add('ds-actions-pinned');
        });
        return ret;
      };
      wrapped._r4Wrapped = true;
      window.toggleMessageMenu = wrapped;
    }
    if (typeof origClose === 'function' && !origClose._r4Wrapped) {
      const wrapped = function(){
        const ret = origClose.apply(this,arguments);
        document.querySelectorAll('.message.ds-actions-pinned').forEach(m=>m.classList.remove('ds-actions-pinned'));
        document.querySelectorAll('.message-context-menu').forEach(menu => {
          if(!menu.classList.contains('active')) ['position','left','top','right','bottom'].forEach(p=>menu.style.removeProperty(p));
        });
        return ret;
      };
      wrapped._r4Wrapped = true;
      window.closeAllMenus = wrapped;
    }
  }

  function watchGlobalMenus(){
    const dropdown = document.getElementById('headerMoreDropdown');
    if (!dropdown) return;
    const sync = () => document.body.classList.toggle('ds-global-menu-open', dropdown.classList.contains('open'));
    new MutationObserver(sync).observe(dropdown,{attributes:true,attributeFilter:['class']});
    sync();
  }

  function makeAdminOverview(){
    const controls = document.getElementById('adminControls');
    const tabs = controls?.querySelector('.admin-tabs');
    if (!controls || !tabs || controls.dataset.r4Ready) return;
    controls.dataset.r4Ready = '1';

    const overviewBtn = document.createElement('button');
    overviewBtn.className = 'admin-tab';
    overviewBtn.setAttribute('onclick', "switchAdminTab('overview')");
    overviewBtn.textContent = '⌂ Vue d’ensemble';
    tabs.prepend(overviewBtn);

    const overview = document.createElement('div');
    overview.className = 'admin-tab-content';
    overview.id = 'adminTab-overview';
    overview.innerHTML = `
      <div class="ds-r4-admin-overview-grid">
        <div class="ds-r4-admin-metric"><span>Utilisateurs en ligne</span><strong id="dsAdminOnline">0</strong></div>
        <div class="ds-r4-admin-metric"><span>En vocal</span><strong id="dsAdminVoice">0</strong></div>
        <div class="ds-r4-admin-metric"><span>Salon actuel</span><strong id="dsAdminChannel">#général</strong></div>
        <div class="ds-r4-admin-metric"><span>État</span><strong id="dsAdminHealth">OK</strong></div>
      </div>
      <div class="admin-card"><div class="admin-card-title">⚡ Actions rapides</div><div class="ds-r4-admin-quick">
        <button data-admin-quick="stats">Actualiser stats</button><button data-admin-quick="broadcast">Message global</button><button data-admin-quick="announcement">Annonce</button>
        <button data-admin-quick="slow">Mode lent</button><button data-admin-quick="logs">Ouvrir logs</button><button data-admin-quick="cloud">État cloud</button>
      </div></div>
      <div class="admin-card"><div class="admin-card-title">🔐 Accès serveur</div><div class="ds-r4-admin-security">
        <label class="ds-r4-admin-security-row"><span><strong>Serveur privé</strong><br><small>Demander un code pour rejoindre</small></span><input id="privateServerToggle" type="checkbox"></label>
        <div id="privateServerSettings" style="display:none"><input id="serverAccessCode" class="admin-input" type="text" placeholder="Nouveau code d'accès"><button class="admin-btn" id="dsAdminSaveAccessCode">Enregistrer le code</button></div>
      </div></div>
      <div class="admin-card"><div class="admin-card-title">⭐ Gestion XP rapide</div>
        <input id="dsAdminXpUser" class="admin-input" placeholder="Pseudo cible"><div class="admin-grid"><input id="dsAdminXpAmount" class="admin-input" type="number" min="1" value="250"><button class="admin-btn" data-admin-quick="xpadd">Ajouter XP</button></div>
        <button class="admin-btn" data-admin-quick="xpset">Définir l'XP exacte</button>
      </div>`;
    tabs.after(overview);

    const shell = document.createElement('div'); shell.className='ds-r4-admin-shell';
    const nav = document.createElement('aside'); nav.className='ds-r4-admin-nav';
    const work = document.createElement('main'); work.className='ds-r4-admin-workspace';
    controls.insertBefore(shell, controls.firstChild);
    shell.append(nav,work); nav.appendChild(tabs);
    controls.querySelectorAll(':scope > .admin-tab-content').forEach(c=>work.appendChild(c));

    overview.addEventListener('click', e => {
      const b=e.target.closest('[data-admin-quick]'); if(!b) return;
      const a=b.dataset.adminQuick;
      if(a==='stats') call('refreshServerStats');
      if(a==='broadcast') call('adminBroadcast');
      if(a==='announcement') call('adminAnnouncement');
      if(a==='slow') call('adminSlowMode');
      if(a==='logs') call('switchAdminTab','logs');
      if(a==='cloud') call('switchAdminTab','cloud');
      if(a==='xpadd' || a==='xpset') {
        const user=(document.getElementById('dsAdminXpUser')?.value||'').trim();
        const amount=document.getElementById('dsAdminXpAmount')?.value||'0';
        const target=document.getElementById('adminTargetUserInput');
        const amt=document.getElementById('adminXpAmountInput');
        if(target) target.value=user; if(amt) amt.value=amount;
        if(a==='xpadd') call('adminGrantXPFromInput'); else call('adminSetXPFromInput');
      }
    });
    document.getElementById('privateServerToggle')?.addEventListener('change',()=>call('togglePrivateServer'));
    document.getElementById('dsAdminSaveAccessCode')?.addEventListener('click',()=>call('setAccessCode'));

    // Open the dashboard by default after admin authentication.
    const origSwitch = window.switchAdminTab;
    if(typeof origSwitch === 'function' && !origSwitch._r4Wrapped){
      const wrapped=function(tab){ return origSwitch.call(this,tab); };
      wrapped._r4Wrapped=true; window.switchAdminTab=wrapped;
    }
    updateAdminOverview();
  }

  function updateAdminOverview(){
    const online=document.getElementById('onlineCount')?.textContent?.match(/\d+/)?.[0]||'0';
    const voice=[...document.querySelectorAll('.voice-user-count')].reduce((s,e)=>s+(parseInt(e.dataset.count||e.textContent||'0',10)||0),0);
    const channel=document.getElementById('currentChannelName')?.textContent||'général';
    const a=document.getElementById('dsAdminOnline'); if(a)a.textContent=online;
    const v=document.getElementById('dsAdminVoice'); if(v)v.textContent=String(voice);
    const c=document.getElementById('dsAdminChannel'); if(c)c.textContent='#'+channel;
    const h=document.getElementById('dsAdminHealth'); if(h)h.textContent=(typeof navigator!=='undefined'&&navigator.onLine)?'OK':'Hors ligne';
  }

  function wrapAdminOpen(){
    const orig = window.showAdminLogin;
    if(typeof orig!=='function' || orig._r4Wrapped) return;
    const wrapped=function(...args){
      const ret=orig.apply(this,args);
      requestAnimationFrame(()=>{
        makeAdminOverview();
        let admin=false; try{admin=!!isAdmin}catch(_){}
        if(admin) call('switchAdminTab','overview');
      });
      return ret;
    };
    wrapped._r4Wrapped=true; window.showAdminLogin=wrapped;
  }

  function wrapAdminEnable(){
    const orig = window.enableAdminMode;
    if(typeof orig!=='function' || orig._r4Wrapped) return;
    const wrapped=function(...args){
      const ret=orig.apply(this,args);
      requestAnimationFrame(()=>{ makeAdminOverview(); call('switchAdminTab','overview'); updateAdminOverview(); });
      return ret;
    };
    wrapped._r4Wrapped=true; window.enableAdminMode=wrapped;
  }

  function wrapVoiceView(){
    const show = window.showVoiceView;
    const hide = window.hideVoiceView;
    if(typeof show==='function' && !show._r4Wrapped){
      const w=function(...args){ document.body.classList.add('ds-voice-view-active'); return show.apply(this,args); };
      w._r4Wrapped=true; window.showVoiceView=w;
    }
    if(typeof hide==='function' && !hide._r4Wrapped){
      const w=function(...args){ document.body.classList.remove('ds-voice-view-active'); return hide.apply(this,args); };
      w._r4Wrapped=true; window.hideVoiceView=w;
    }
  }

  function enhanceAdminUsers(){
    const tab=document.getElementById('adminTab-users');
    const list=document.getElementById('adminUsersList');
    if(!tab || !list || tab.dataset.r4Users) return;
    tab.dataset.r4Users='1';
    const card=list.closest('.admin-card');
    if(!card) return;
    const tools=document.createElement('div');
    tools.className='ds-r4-admin-user-tools';
    tools.innerHTML='<input id="dsAdminUserFilter" class="admin-input" placeholder="Rechercher un utilisateur..."><button class="admin-btn" id="dsAdminRefreshUsers">Actualiser</button>';
    card.querySelector('.admin-card-title')?.after(tools);
    const apply=()=>{
      const q=(document.getElementById('dsAdminUserFilter')?.value||'').trim().toLowerCase();
      list.querySelectorAll('.admin-user-item').forEach(row=>row.style.display=!q||row.textContent.toLowerCase().includes(q)?'':'none');
    };
    tools.querySelector('input').addEventListener('input',apply);
    tools.querySelector('button').addEventListener('click',()=>{ call('updateAdminUsersList'); call('refreshBannedUsers'); setTimeout(apply,60); });
    const obs=new MutationObserver(apply); obs.observe(list,{childList:true,subtree:true});
  }

  function centerLegacyPanels(){
    // Remove old accidental transforms/positions left by draggable states.
    ['friendsModal','galleryModal','adminPanel','presenceHistoryModal','leaderboardModal','settingsModal','patchNotesModal','statsModal','bookmarksModal','soundboardModal','remindersModal','statusModal','automodModal','aiChatModal','editMessageModal'].forEach(id=>{
      const el=document.getElementById(id); if(!el) return;
      el.addEventListener('transitionend',()=>{}, {passive:true});
    });
  }

  function init(){
    document.body.classList.add('ds-r4-ready');
    repairComposerPlacement();
    remakeRail();
    remakeDM();
    wrapDmFunctions();
    enhanceFriends();
    installMessageToolbar();
    hardenContextMenus();
    watchGlobalMenus();
    makeAdminOverview();
    wrapAdminOpen();
    wrapAdminEnable();
    wrapVoiceView();
    enhanceAdminUsers();
    centerLegacyPanels();
    updateAdminOverview();
    setInterval(()=>{syncDmBadge();updateAdminOverview();repairComposerPlacement();},2500);
  }

  let __r4InitDone=false;
  const __r4StartAfterLogin=()=>{
    if(__r4InitDone) return;
    __r4InitDone=true;
    init();
  };
  window.addEventListener('docspace:connected',__r4StartAfterLogin,{once:true});
  if(window.__docspaceConnected===true) __r4StartAfterLogin();
})();
