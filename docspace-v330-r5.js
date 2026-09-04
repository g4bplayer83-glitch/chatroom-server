/* DocSpace v3.3.0 BETA R5 — Sync + Discord Navigation + Layering */
(() => {
  'use strict';
  const log = (...a) => console.log('[DocSpace R5]', ...a);
  const safeCall = (name, ...args) => {
    try { const fn = window[name]; if (typeof fn === 'function') return fn(...args); }
    catch (e) { console.warn('[R5]', name, e); }
  };
  const byId = id => document.getElementById(id);
  const usernameNow = () => { try { return String(currentUsername || ''); } catch (_) { return ''; } };
  const socketNow = () => { try { return socket || null; } catch (_) { return null; } };

  // ---------- Layer manager ----------
  const LAYERS = { panel: 180000, nested: 320000, media: 520000, toast: 700000 };
  const panelIds = new Set([
    'galleryModal','friendsModal','leaderboardModal','patchNotesModal','settingsModal','statsModal','bookmarksModal',
    'presenceHistoryModal','soundboardModal','remindersModal','statusModal','automodModal','aiChatModal','editMessageModal',
    'adminPanel','userProfileModal','pollModal','searchPanel','pinnedSavedPanel'
  ]);

  function raiseLayer(el, type='panel') {
    if (!el) return;
    const wantedZ = String(LAYERS[type] || LAYERS.panel);
    // Do not rewrite observed attributes when nothing changed: this prevents
    // MutationObserver -> style/class write -> MutationObserver feedback loops.
    if (!el.classList.contains('ds-r5-layer-open')) el.classList.add('ds-r5-layer-open');
    if (el.style.getPropertyValue('z-index') !== wantedZ || el.style.getPropertyPriority('z-index') !== 'important') {
      el.style.setProperty('z-index', wantedZ, 'important');
    }
  }
  function lowerLayer(el) {
    if (!el) return;
    if (el.classList.contains('ds-r5-layer-open')) el.classList.remove('ds-r5-layer-open');
  }
  function installLayering() {
    panelIds.forEach(id => {
      const el = byId(id); if (!el) return;
      const obs = new MutationObserver(() => {
        const cs = getComputedStyle(el);
        const visible = cs.display !== 'none' && cs.visibility !== 'hidden';
        if (visible) raiseLayer(el, id === 'userProfileModal' ? 'nested' : 'panel'); else lowerLayer(el);
      });
      obs.observe(el, { attributes:true, attributeFilter:['style','class'] });
    });

    const origImage = window.openImageModal;
    if (typeof origImage === 'function' && !origImage._r5Wrapped) {
      const wrapped = function(...args) {
        const ret = origImage.apply(this,args);
        const modal = byId('imageModal');
        raiseLayer(modal, 'media');
        if (modal && modal.parentElement !== document.body) document.body.appendChild(modal);
        return ret;
      };
      wrapped._r5Wrapped = true; window.openImageModal = wrapped;
    }
    const img = byId('imageModal'); if (img) img.style.setProperty('z-index', String(LAYERS.media), 'important');

    // Toasts/popups must never be trapped under panels.
    const toastObs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (!(n instanceof HTMLElement)) return;
      if (n.matches?.('.notification,#friendRequestPopup,.reaction-picker-popup,.emoji-picker-popup,.message-context-menu')) {
        n.style.setProperty('z-index', String(LAYERS.toast), 'important');
      }
    })));
    toastObs.observe(document.body,{childList:true,subtree:true});
  }

  // ---------- DM as a real app page ----------
  function setHomeMode(mode) {
    document.body.classList.toggle('ds-r5-dm-page', mode === 'dm');
    document.body.classList.toggle('ds-r5-friends-page', mode === 'friends');
    document.body.classList.toggle('ds-r5-server-page', mode === 'server');
    document.querySelectorAll('#docspaceAppRailR3 [data-r4-action]').forEach(b => b.classList.remove('active'));
    const key = mode === 'dm' || mode === 'friends' ? 'dm' : 'server';
    document.querySelector(`#docspaceAppRailR3 [data-r4-action="${key}"]`)?.classList.add('active');
    const label = byId('currentChannelName');
    const hash = byId('currentChannelIndicator')?.querySelector('.channel-hash');
    if (label) {
      if (mode === 'dm') label.textContent = r502Text('dm');
      else if (mode === 'friends') label.textContent = r502Text('friends');
      else { try { label.textContent = currentChannel || 'général'; } catch (_) { label.textContent = 'général'; } }
    }
    if (hash) hash.textContent = mode === 'server' ? '#' : mode === 'friends' ? '👥' : '💬';
  }

  function wrapNavigation() {
    const origToggle = window.toggleDMSidebar;
    if (typeof origToggle === 'function' && !origToggle._r5Wrapped) {
      const wrapped = function(...args) {
        const dm = byId('dmSidebar');
        if (!dm?.classList.contains('open')) {
          setHomeMode('dm');
          const ret = origToggle.apply(this,args);
          setTimeout(() => socketNow()?.emit('get_dm_conversations'), 20);
          return ret;
        }
        const ret = origToggle.apply(this,args); setHomeMode('server'); return ret;
      };
      wrapped._r5Wrapped = true; window.toggleDMSidebar = wrapped;
    }
    const origOpen = window.openDMWith;
    if (typeof origOpen === 'function' && !origOpen._r5Wrapped) {
      const wrapped = function(username) {
        setHomeMode('dm');
        const dm=byId('dmSidebar'); if (dm && !dm.classList.contains('open')) dm.classList.add('open');
        const ret=origOpen.call(this,username);
        setTimeout(()=>socketNow()?.emit('get_dm_history',{username}),20);
        return ret;
      };
      wrapped._r5Wrapped=true; window.openDMWith=wrapped;
    }
    const origClose = window.closeDMSidebar;
    if (typeof origClose === 'function' && !origClose._r5Wrapped) {
      const wrapped=function(...args){ const r=origClose.apply(this,args); setHomeMode('server'); return r; };
      wrapped._r5Wrapped=true; window.closeDMSidebar=wrapped;
    }

    const origFriends = window.openFriendsModal;
    if (typeof origFriends === 'function' && !origFriends._r5Wrapped) {
      const wrapped=function(...args){
        setHomeMode('friends');
        const r=origFriends.apply(this,args);
        raiseLayer(byId('friendsModal'),'panel');
        setTimeout(()=>socketNow()?.emit('get_friends'),20);
        return r;
      };
      wrapped._r5Wrapped=true; window.openFriendsModal=wrapped;
    }
    const friendClose = byId('friendsModal')?.querySelector('.close-modal,.modal-close,.close');
    friendClose?.addEventListener('click',()=>setHomeMode('server'));

    // Rail server button must really exit Home/DM/Friends.
    document.getElementById('docspaceAppRailR3')?.addEventListener('click', e => {
      const b=e.target.closest('[data-r4-action]'); if(!b) return;
      if(b.dataset.r4Action==='server') {
        byId('dmSidebar')?.classList.remove('open');
        if(byId('friendsModal')) byId('friendsModal').style.display='none';
        setHomeMode('server');
      }
    }, true);
  }

  function addDmHomeSidebar() {
    const dm=byId('dmSidebar'); if(!dm || dm.dataset.r5Ready) return;
    dm.dataset.r5Ready='1';
    const conv=byId('dmConversations'); if (!conv) return;
    const nav=document.createElement('div'); nav.className='ds-r5-home-nav';
    nav.innerHTML=`<button data-home-nav="friends">👥 Amis</button><button class="active" data-home-nav="dm">💬 Messages privés</button><div class="ds-r5-home-label">Messages privés</div>`;
    conv.before(nav);
    nav.addEventListener('click',e=>{
      const b=e.target.closest('[data-home-nav]'); if(!b)return;
      if(b.dataset.homeNav==='friends') safeCall('openFriendsModal');
      if(b.dataset.homeNav==='dm') setHomeMode('dm');
    });
  }

  // ---------- DM realtime truth from server ----------
  function mergeDMMessage(peer, msg, avatar) {
    if (!peer || !msg) return;
    try {
      if (!dmConversations[peer]) dmConversations[peer] = { messages:[], unread:0, avatar:avatar||null };
      const list=dmConversations[peer].messages || (dmConversations[peer].messages=[]);
      const id=String(msg.id||'');
      if (id && list.some(x=>String(x.id||'')===id)) return;
      list.push({ ...msg, timestamp:new Date(msg.timestamp || Date.now()) });
      if (avatar && !dmConversations[peer].avatar) dmConversations[peer].avatar=avatar;
      if (typeof currentDMUser !== 'undefined' && currentDMUser===peer) safeCall('renderDMMessages');
      safeCall('renderDMConversations');
    } catch(e){ console.warn('[R5 DM merge]',e); }
  }

  function overrideSendDM() {
    const old = window.sendDM;
    if (typeof old !== 'function' || old._r5Wrapped) return;
    const wrapped=function(){
      const s=socketNow();
      const input=byId('dmInput');
      let peer=''; try{peer=String(currentDMUser||'')}catch(_){}
      let attach=null; try{attach=pendingDMAttachment||null}catch(_){}
      const content=(input?.value||'').trim();
      if(!s || !peer || (!content && !attach)) return;
      if(input) input.value='';
      try{ pendingDMAttachment=null; }catch(_){}
      const composer=byId('dmInput')?.closest('.dm-input-container');
      composer?.classList.add('sending');
      s.timeout(7000).emit('send_dm',{to:peer,content,attachment:attach},(err,res)=>{
        composer?.classList.remove('sending');
        if(err || !res?.success) safeCall('showNotification','❌ DM',res?.message||'Envoi impossible','error');
      });
      try{
        if(isDMTyping){ isDMTyping=false; s.emit('dm_typing_stop',{to:peer}); }
      }catch(_){}
    };
    wrapped._r5Wrapped=true; window.sendDM=wrapped;
  }

  function setupR5Socket(s) {
    if (!s || s.__docspaceR5Bound) return;
    s.__docspaceR5Bound=true;
    installR502DmSocket(s);

    s.on('user_join_ready',()=>{
      // Explicit recovery requests remove all race conditions.
      s.emit('get_friends'); s.emit('get_bookmarks'); s.emit('get_presence_history'); s.emit('get_xp'); s.emit('get_dm_conversations');
      try{ if(currentVoiceRoom) s.emit('voice_sync_request',{room:currentVoiceRoom}); }catch(_){}
      setTimeout(()=>{ s.emit('get_friends'); s.emit('get_xp'); s.emit('get_dm_conversations'); },350);
    });
    s.on('dm_sent', data=>{
      const peer=data?.peer || data?.to;
      mergeDMMessage(peer,data,data?.peerAvatar);
      if (peer) s.emit('get_dm_conversations');
    });
    s.on('dm_conversations_changed',()=>s.emit('get_dm_conversations'));
    s.on('dm_conversations', conversations=>{
      try{
        (conversations||[]).forEach(conv=>{
          const peer=String(conv?.username||''); if(!peer) return;
          if(!dmConversations[peer]) dmConversations[peer]={messages:[],unread:0,avatar:null};
          dmConversations[peer].avatar=conv.avatar||dmConversations[peer].avatar||null;
          dmConversations[peer].online=!!conv.online;
          dmConversations[peer].lastMessage=conv.lastMessage||'';
          dmConversations[peer].lastTimestamp=conv.lastTimestamp||null;
        });
        setTimeout(()=>safeCall('renderDMConversations'),0);
      }catch(e){console.warn('[R5 DM conversations]',e);}
    });
    s.on('dm_error',d=>safeCall('showNotification','❌ Message privé',d?.message||'Erreur DM','error'));
    s.on('friend_request_sent', d=>{
      safeCall('showNotification','👥 Demande envoyée',d?.username||'','success');
      s.emit('get_friends');
    });
    s.on('friend_request_received',()=>setTimeout(()=>s.emit('get_friends'),20));
    s.on('friend_accepted',()=>setTimeout(()=>s.emit('get_friends'),20));
    s.on('friends_list',()=>setTimeout(()=>{
      try{
        const active=[...document.querySelectorAll('#friendsModal .friends-tab')].find(b=>b.classList.contains('active'));
        const oc=active?.getAttribute('onclick')||'';
        const m=oc.match(/showFriendsTab\('([^']+)'\)/);
        if(m) renderFriendsList(m[1]);
      }catch(_){}
    },0));
    s.on('bookmark_added',()=>safeCall('showNotification','🔖 Sauvegardé','Message ajouté aux éléments sauvegardés','success'));
    s.on('bookmark_error',d=>safeCall('showNotification','🔖 Sauvegarde',d?.message||'Erreur','warning'));
    s.on('presence_history_sync',()=>setTimeout(()=>{
      const modal=byId('presenceHistoryModal');
      if(modal?.classList.contains('open')) safeCall('renderPresenceHistory');
    },0));
    s.on('presence_history_append',entry=>{
      if (!entry || entry.username===usernameNow()) return;
      const action=entry.action==='join'?'a rejoint DocSpace':'a quitté DocSpace';
      safeCall('showNotification',entry.action==='join'?'🟢 Présence':'⚫ Présence',`${entry.username} ${action}`,'info');
      const modal=byId('presenceHistoryModal'); if(modal?.classList.contains('open')) setTimeout(()=>safeCall('renderPresenceHistory'),0);
    });
    s.on('xp_data',()=>requestAnimationFrame(enhanceXPCards));
    s.on('voice_participants_update', data=>{
      setTimeout(()=>repairVoicePeers(data),250);
      requestAnimationFrame(enhanceVoiceUI);
    });
    s.on('voice_sync_snapshot', data=>{
      if(!data?.room) return;
      try{ if(typeof currentVoiceRoom!=='undefined' && currentVoiceRoom===data.room) safeCall('updateVoiceParticipantsUI',data.room,data.participants||[]); }catch(_){}
      setTimeout(()=>repairVoicePeers(data),80);
      requestAnimationFrame(enhanceVoiceUI);
    });
  }
  window.setupDocSpaceR5Socket=setupR5Socket;

  // ---------- Friends ----------
  function improveFriends() {
    const modal=byId('friendsModal'); if(!modal || modal.dataset.r5Ready)return;
    modal.dataset.r5Ready='1';
    const content=modal.querySelector('.modal-content');
    if(content){
      const title=content.querySelector('h2,.modal-title');
      if(title) title.textContent='Amis';
    }
    modal.addEventListener('click',e=>{
      if(e.target===modal){ modal.style.display='none'; setHomeMode('server'); }
    });
    const oldSend=window.sendFriendRequest;
    if(typeof oldSend==='function'&&!oldSend._r5Wrapped){
      const send=function(username){
        const name=String(username||'').trim(); if(!name)return safeCall('showNotification','👥 Amis','Entre un pseudo','warning');
        const s=socketNow(); if(!s?.connected)return safeCall('showNotification','👥 Amis','Connexion requise','warning');
        s.emit('send_friend_request',{username:name});
        safeCall('showNotification','👥 Amis',`Demande envoyée à ${name}…`,'info');
        setTimeout(()=>s.emit('get_friends'),180);
      }; send._r5Wrapped=true; window.sendFriendRequest=send;
    }
  }

  // ---------- Presence explicit sync ----------
  function overridePresence() {
    const orig=window.openPresenceHistory;
    if(typeof orig!=='function'||orig._r5Wrapped)return;
    const wrapped=function(...args){ socketNow()?.emit('get_presence_history'); const r=orig.apply(this,args); raiseLayer(byId('presenceHistoryModal'),'panel'); return r; };
    wrapped._r5Wrapped=true; window.openPresenceHistory=wrapped;
  }

  // ---------- Bookmark reliability + both views ----------
  function overrideBookmarks() {
    const origRender=window.renderBookmarks;
    if(typeof origRender==='function'&&!origRender._r5Wrapped){
      const wrapped=function(bookmarks){
        const r=origRender.apply(this,arguments);
        const target=byId('pinnedSavedBookmarksList');
        if(target){
          const list=Array.isArray(bookmarks)?bookmarks:[];
          target.innerHTML=list.length?list.map(b=>`<div class="bookmark-item ds-r5-saved-item"><div class="bookmark-author">${escapeHtml(b.author||'Inconnu')} <span>dans #${escapeHtml(b.channel||'?')}</span></div><div class="bookmark-content">${escapeHtml(b.content||'[Pièce jointe]')}</div><div class="bookmark-meta"><span>${new Date(b.savedAt||Date.now()).toLocaleString('fr-FR')}</span><button class="bookmark-remove" onclick="removeBookmark('${String(b.messageId).replace(/'/g,"\\'")}')">✕</button></div></div>`).join(''):'<div class="gallery-empty">Aucun message sauvegardé</div>';
        }
        return r;
      };
      wrapped._r5Wrapped=true; window.renderBookmarks=wrapped;
    }
    const origBookmark=window.bookmarkMessage;
    if(typeof origBookmark==='function'&&!origBookmark._r5Wrapped){
      const wrapped=function(messageId){
        const el=document.querySelector(`[data-message-id="${CSS.escape(String(messageId))}"]`);
        const s=socketNow(); if(!el||!s)return;
        const content=el.dataset.content || el.querySelector('.message-content')?.textContent?.replace(/\s*\(modifié\)\s*$/,'').trim() || '';
        const author=el.dataset.username || el.querySelector('.message-username')?.textContent?.trim() || 'Inconnu';
        let channel='général'; try{channel=currentChannel||'général'}catch(_){}
        s.emit('bookmark_message',{messageId:String(messageId),content,author,channel,timestamp:new Date().toISOString()});
      };
      wrapped._r5Wrapped=true; window.bookmarkMessage=wrapped;
    }
    const origToggle=window.togglePinnedSavedPanel;
    if(typeof origToggle==='function'&&!origToggle._r5Wrapped){
      const wrapped=function(...args){ const r=origToggle.apply(this,args); socketNow()?.emit('get_bookmarks'); raiseLayer(byId('pinnedSavedPanel'),'nested'); return r; };
      wrapped._r5Wrapped=true; window.togglePinnedSavedPanel=wrapped;
    }
  }

  // ---------- Discord-like typing indicator ----------
  function overrideTyping() {
    const original=window.updateTypingIndicator;
    if(typeof original!=='function'||original._r5Wrapped)return;
    const wrapped=function(users){
      const arr=[...new Set((users||[]).filter(Boolean).filter(u=>u.toLowerCase()!==usernameNow().toLowerCase()))];
      const activity=byId('chatActivityStatus');
      const legacy=byId('typingIndicator');
      if(!arr.length){
        if(activity){activity.innerHTML='<span class="ds-r5-idle-dot"></span><span>Aucune activité</span>';activity.classList.remove('active');}
        legacy?.classList.remove('active'); return;
      }
      let usersData=[]; try{ usersData=Array.isArray(connectedUsers)?connectedUsers:[]; }catch(_){}
      const first=usersData.find(x=>String(x.username).toLowerCase()===arr[0].toLowerCase());
      const avatar=first?.avatar?`<img src="${first.avatar}" alt="">`:`<span>${escapeHtml(arr[0][0]?.toUpperCase()||'?')}</span>`;
      const text=arr.length===1?`${arr[0]} est en train d’écrire`:arr.length===2?`${arr[0]} et ${arr[1]} écrivent`:`${arr.length} personnes écrivent`;
      if(activity){activity.innerHTML=`<span class="chat-activity-avatar">${avatar}</span><strong>${escapeHtml(text)}</strong><span class="ds-r5-typing-dots"><i></i><i></i><i></i></span>`;activity.classList.add('active');}
      if(legacy) legacy.classList.remove('active');
    };
    wrapped._r5Wrapped=true; window.updateTypingIndicator=wrapped;
  }

  // ---------- XP rewards that actually act ----------
  const themeRewards = {
    'Bleu Nuit':['bluenight'],
    'Pack Couleurs':['red','yellow','purple'],
    'Pack Rose':['pink','pink-light'],
    'Pack Nature':['orange','green'],
    'Theme Lab':['custom']
  };
  function openThemesFromReward(themes){
    const theme=themes?.[0];
    if(theme && themes.length===1){ safeCall('changeTheme',theme); return; }
    safeCall('openSettings');
    setTimeout(()=>{
      const first=themes?.map(t=>document.querySelector(`[data-theme="${t}"]`)).find(Boolean);
      first?.scrollIntoView({behavior:'smooth',block:'center'});
      (themes||[]).forEach(t=>document.querySelector(`[data-theme="${t}"]`)?.classList.add('ds-r5-reward-pulse'));
      setTimeout(()=>document.querySelectorAll('.ds-r5-reward-pulse').forEach(x=>x.classList.remove('ds-r5-reward-pulse')),1800);
    },120);
  }
  function enhanceXPCards(){
    const grid=byId('xpCosmeticsGrid'); if(!grid)return;
    grid.querySelectorAll('.xp-unlock-card').forEach(card=>{
      const name=card.querySelector('.xp-unlock-name')?.textContent?.trim()||'';
      const themes=themeRewards[name];
      if(themes && card.classList.contains('unlocked')){
        card.classList.add('actionable'); card.title=themes.length===1?'Cliquer pour utiliser cette récompense':'Cliquer pour voir les thèmes débloqués';
        card.onclick=()=>openThemesFromReward(themes);
      }
    });
    const openThemes=grid.closest('.xp-cosmetics-section')?.querySelector('button');
    if(openThemes) openThemes.title='Les thèmes verrouillés se débloquent automatiquement avec ton niveau XP';
  }
  function wrapXPRender(){
    const fn=window.renderXPCosmetics;
    if(typeof fn==='function'&&!fn._r5Wrapped){
      const w=function(...args){const r=fn.apply(this,args);requestAnimationFrame(enhanceXPCards);return r;};w._r5Wrapped=true;window.renderXPCosmetics=w;
    }
    const open=window.openLeaderboard;
    if(typeof open==='function'&&!open._r5Wrapped){
      const w=function(...args){const r=open.apply(this,args);const s=socketNow();s?.emit('get_xp');s?.emit('get_leaderboard');raiseLayer(byId('leaderboardModal'),'panel');setTimeout(enhanceXPCards,80);return r;};w._r5Wrapped=true;window.openLeaderboard=w;
    }
  }

  // ---------- Voice UI + peer recovery ----------
  function repairVoicePeers(data){
    try{
      if(!data || !data.room || data.room!==currentVoiceRoom || !socketNow()) return;
      (data.participants||[]).forEach(p=>{
        if(!p?.socketId || p.socketId===socketNow().id || voicePeerConnections[p.socketId]) return;
        // deterministic initiator avoids both clients starting at once
        const initiator=String(socketNow().id)<String(p.socketId);
        createPeerConnection(p.socketId,p.username,initiator);
      });
    }catch(e){console.warn('[R5 voice recovery]',e);}
  }
  function enhanceVoiceUI(){
    const view=byId('voiceChannelView'); if(!view)return;
    view.classList.add('ds-r5-voice');
    const header=view.querySelector('.voice-view-header,.voice-channel-header');
    if(header && !header.querySelector('.ds-r5-voice-sub')){
      const sub=document.createElement('div');sub.className='ds-r5-voice-sub';sub.innerHTML='<span class="ds-r5-live-dot"></span> Audio/vidéo synchronisés en temps réel';header.appendChild(sub);
    }
    view.querySelectorAll('.voice-video-tile,.voice-participant-card,.voice-user-tile').forEach(x=>x.classList.add('ds-r5-voice-tile'));
  }
  function wrapVoice(){
    ['showVoiceView','updateVoiceParticipantsUI'].forEach(name=>{
      const fn=window[name]; if(typeof fn!=='function'||fn._r5Wrapped)return;
      const w=function(...args){
        const r=fn.apply(this,args);requestAnimationFrame(enhanceVoiceUI);
        try{ const s=socketNow(); if(s && currentVoiceRoom) setTimeout(()=>s.emit('voice_sync_request',{room:currentVoiceRoom}),120); }catch(_){}
        return r;
      };w._r5Wrapped=true;window[name]=w;
    });
  }

  // ---------- Patch notes ----------
  function patchPatchnotesUI(){
    const modal=byId('patchNotesModal'); if(!modal)return;
    modal.classList.add('ds-r5-patchnotes');
    const header=modal.querySelector('.patchnotes-header');
    if(header&&!header.querySelector('.ds-r5-history-note')){
      const note=document.createElement('div');note.className='ds-r5-history-note';note.textContent='Historique complet de DocSpace · les anciennes fonctionnalités retirées restent visibles comme archive.';header.appendChild(note);
    }
    const orig=window.showPatchNotes;
    if(typeof orig==='function'&&!orig._r5Wrapped){const w=async function(...args){const r=await orig.apply(this,args);raiseLayer(modal,'panel');return r;};w._r5Wrapped=true;window.showPatchNotes=w;}
  }

  // ---------- recover panel data whenever opened ----------
  function installSelfHealing(){
    document.addEventListener('click',e=>{
      const text=(e.target.closest('button,[onclick]')?.getAttribute('onclick')||'');
      const s=socketNow(); if(!s)return;
      if(/openFriendsModal/.test(text)) setTimeout(()=>s.emit('get_friends'),30);
      if(/openPresenceHistory/.test(text)) setTimeout(()=>s.emit('get_presence_history'),30);
      if(/openLeaderboard/.test(text)) setTimeout(()=>{s.emit('get_xp');s.emit('get_leaderboard');},30);
      if(/togglePinnedSavedPanel|openBookmarksModal/.test(text)) setTimeout(()=>s.emit('get_bookmarks'),30);
      if(/toggleDMSidebar/.test(text)) setTimeout(()=>s.emit('get_dm_conversations'),30);
    },true);
  }



  // ---------- R5.0.2: stable UI polish / i18n / authoritative DM refresh ----------
  const R502_I18N = {
    fr:{friends:'Amis',dm:'Messages privés',dmLabel:'Messages privés',addFriend:'Ajouter un ami avec son pseudo',sendRequest:'Envoyer la demande',all:'Tous',online:'En ligne',pending:'En attente',requests:'Demandes',blocked:'Bloqués',dmInput:'Écrire un message…',dmEmpty:'Sélectionne une conversation à gauche ou ouvre le profil d’un membre.',voiceSync:'Audio/vidéo synchronisés en temps réel',voiceChat:'Écrire dans #{channel} · vocal actif',notifPos:'Position des notifications'},
    en:{friends:'Friends',dm:'Direct Messages',dmLabel:'Direct Messages',addFriend:'Add a friend by username',sendRequest:'Send Friend Request',all:'All',online:'Online',pending:'Pending',requests:'Requests',blocked:'Blocked',dmInput:'Message…',dmEmpty:'Select a conversation on the left or open a member profile.',voiceSync:'Audio/video synced in real time',voiceChat:'Message #{channel} · voice active',notifPos:'Notification position'},
    es:{friends:'Amigos',dm:'Mensajes privados',dmLabel:'Mensajes privados',addFriend:'Añadir un amigo por nombre',sendRequest:'Enviar solicitud',all:'Todos',online:'En línea',pending:'Pendientes',requests:'Solicitudes',blocked:'Bloqueados',dmInput:'Escribe un mensaje…',dmEmpty:'Selecciona una conversación a la izquierda o abre el perfil de un miembro.',voiceSync:'Audio/vídeo sincronizados en tiempo real',voiceChat:'Escribir en #{channel} · voz activa',notifPos:'Posición de las notificaciones'},
    de:{friends:'Freunde',dm:'Direktnachrichten',dmLabel:'Direktnachrichten',addFriend:'Freund per Benutzername hinzufügen',sendRequest:'Anfrage senden',all:'Alle',online:'Online',pending:'Ausstehend',requests:'Anfragen',blocked:'Blockiert',dmInput:'Nachricht schreiben…',dmEmpty:'Wähle links eine Unterhaltung oder öffne das Profil eines Mitglieds.',voiceSync:'Audio/Video in Echtzeit synchronisiert',voiceChat:'In #{channel} schreiben · Sprachchat aktiv',notifPos:'Position der Benachrichtigungen'},
    pl:{friends:'Znajomi',dm:'Wiadomości prywatne',dmLabel:'Wiadomości prywatne',addFriend:'Dodaj znajomego po nazwie',sendRequest:'Wyślij zaproszenie',all:'Wszyscy',online:'Online',pending:'Oczekujące',requests:'Zaproszenia',blocked:'Zablokowani',dmInput:'Napisz wiadomość…',dmEmpty:'Wybierz rozmowę po lewej lub otwórz profil użytkownika.',voiceSync:'Audio/wideo synchronizowane w czasie rzeczywistym',voiceChat:'Napisz w #{channel} · rozmowa głosowa aktywna',notifPos:'Pozycja powiadomień'},
    ja:{friends:'フレンド',dm:'ダイレクトメッセージ',dmLabel:'ダイレクトメッセージ',addFriend:'ユーザー名でフレンドを追加',sendRequest:'申請を送信',all:'すべて',online:'オンライン',pending:'送信済み',requests:'申請',blocked:'ブロック済み',dmInput:'メッセージを入力…',dmEmpty:'左の会話を選択するか、メンバーのプロフィールを開いてください。',voiceSync:'音声/映像をリアルタイム同期',voiceChat:'#{channel} にメッセージ · ボイス接続中',notifPos:'通知の位置'},
    it:{friends:'Amici',dm:'Messaggi privati',dmLabel:'Messaggi privati',addFriend:'Aggiungi un amico con il nome utente',sendRequest:'Invia richiesta',all:'Tutti',online:'Online',pending:'In attesa',requests:'Richieste',blocked:'Bloccati',dmInput:'Scrivi un messaggio…',dmEmpty:'Seleziona una conversazione a sinistra o apri il profilo di un membro.',voiceSync:'Audio/video sincronizzati in tempo reale',voiceChat:'Scrivi in #{channel} · vocale attivo',notifPos:'Posizione notifiche'},
    pt:{friends:'Amigos',dm:'Mensagens privadas',dmLabel:'Mensagens privadas',addFriend:'Adicionar amigo pelo nome',sendRequest:'Enviar pedido',all:'Todos',online:'Online',pending:'Pendentes',requests:'Pedidos',blocked:'Bloqueados',dmInput:'Escrever uma mensagem…',dmEmpty:'Selecione uma conversa à esquerda ou abra o perfil de um membro.',voiceSync:'Áudio/vídeo sincronizados em tempo real',voiceChat:'Escrever em #{channel} · voz ativa',notifPos:'Posição das notificações'}
  };
  function extendBaseTranslationsR502(){
    try{
      if(typeof translations!=='object'||!translations)return;
      const extra={
        en:{theme_retro:'Retro Discord'},
        es:{theme_retro:'Discord Retro',voice_connected_label:'Voz conectada',voice_auto_focus_label:'Auto',voice_stats_label:'Estadísticas',voice_ping_label:'Ping',voice_jitter_label:'Jitter',voice_bitrate_in_label:'Bitrate entrante',voice_packet_loss_label:'Pérdida de paquetes',voice_rtt_label:'RTT RTC',voice_peers_label:'Peers conectados',voice_quality_low:'Calidad baja (más estable)',voice_quality_medium:'Calidad media',voice_quality_high:'Calidad alta',voice_prompt_each_share:'Preguntar en cada transmisión',voice_share_title:'Compartir pantalla',voice_audio_title:'Audio',voice_volume_label:'Volumen',voice_measuring:'Midiendo…',voice_settings_label:'Ajustes de voz',voice_default_quality_label:'Calidad predeterminada',voice_share_prompt_label:'Preguntar antes de compartir',voice_auto_focus_default:'Autoenfoque vocal activado por defecto'},
        de:{theme_retro:'Retro Discord',voice_connected_label:'Sprachchat verbunden',voice_auto_focus_label:'Auto',voice_stats_label:'Statistiken',voice_ping_label:'Ping',voice_jitter_label:'Jitter',voice_bitrate_in_label:'Eingehende Bitrate',voice_packet_loss_label:'Paketverlust',voice_rtt_label:'RTC RTT',voice_peers_label:'Verbundene Peers',voice_quality_low:'Niedrige Qualität (stabiler)',voice_quality_medium:'Mittlere Qualität',voice_quality_high:'Hohe Qualität',voice_prompt_each_share:'Bei jeder Übertragung fragen',voice_share_title:'Bildschirmfreigabe',voice_audio_title:'Audio',voice_volume_label:'Lautstärke',voice_measuring:'Messung…',voice_settings_label:'Spracheinstellungen',voice_default_quality_label:'Standardqualität',voice_share_prompt_label:'Vor Bildschirmfreigabe fragen',voice_auto_focus_default:'Sprach-Autofokus standardmäßig aktiv'},
        pl:{theme_retro:'Retro Discord',voice_connected_label:'Połączono z głosem',voice_auto_focus_label:'Auto',voice_stats_label:'Statystyki',voice_ping_label:'Ping',voice_jitter_label:'Jitter',voice_bitrate_in_label:'Bitrate przychodzący',voice_packet_loss_label:'Utrata pakietów',voice_rtt_label:'RTC RTT',voice_peers_label:'Połączeni użytkownicy',voice_quality_low:'Niska jakość (stabilniejsza)',voice_quality_medium:'Średnia jakość',voice_quality_high:'Wysoka jakość',voice_prompt_each_share:'Pytaj przy każdym udostępnieniu',voice_share_title:'Udostępnianie ekranu',voice_audio_title:'Dźwięk',voice_volume_label:'Głośność',voice_measuring:'Pomiar…',voice_settings_label:'Ustawienia głosu',voice_default_quality_label:'Domyślna jakość',voice_share_prompt_label:'Pytaj przed udostępnieniem',voice_auto_focus_default:'Automatyczne skupienie głosu domyślnie włączone'},
        ja:{theme_retro:'レトロ Discord',voice_connected_label:'ボイス接続中',voice_auto_focus_label:'自動',voice_stats_label:'統計',voice_ping_label:'Ping',voice_jitter_label:'ジッター',voice_bitrate_in_label:'受信ビットレート',voice_packet_loss_label:'パケットロス',voice_rtt_label:'RTC RTT',voice_peers_label:'接続中のピア',voice_quality_low:'低画質（安定）',voice_quality_medium:'標準画質',voice_quality_high:'高画質',voice_prompt_each_share:'共有のたびに確認',voice_share_title:'画面共有',voice_audio_title:'音声',voice_volume_label:'音量',voice_measuring:'計測中…',voice_settings_label:'ボイス設定',voice_default_quality_label:'既定の品質',voice_share_prompt_label:'共有前に確認',voice_auto_focus_default:'ボイスの自動フォーカスを既定で有効'},
        it:{theme_retro:'Discord Retro',voice_connected_label:'Voce connessa',voice_auto_focus_label:'Auto',voice_stats_label:'Statistiche',voice_ping_label:'Ping',voice_jitter_label:'Jitter',voice_bitrate_in_label:'Bitrate in ingresso',voice_packet_loss_label:'Perdita pacchetti',voice_rtt_label:'RTT RTC',voice_peers_label:'Peer connessi',voice_quality_low:'Qualità bassa (più stabile)',voice_quality_medium:'Qualità media',voice_quality_high:'Qualità alta',voice_prompt_each_share:'Chiedi a ogni condivisione',voice_share_title:'Condivisione schermo',voice_audio_title:'Audio',voice_volume_label:'Volume',voice_measuring:'Misurazione…',voice_settings_label:'Impostazioni voce',voice_default_quality_label:'Qualità predefinita',voice_share_prompt_label:'Chiedi prima di condividere',voice_auto_focus_default:'Auto-focus vocale attivo per impostazione predefinita'},
        pt:{theme_retro:'Discord Retrô',voice_connected_label:'Voz conectada',voice_auto_focus_label:'Auto',voice_stats_label:'Estatísticas',voice_ping_label:'Ping',voice_jitter_label:'Jitter',voice_bitrate_in_label:'Bitrate de entrada',voice_packet_loss_label:'Perda de pacotes',voice_rtt_label:'RTT RTC',voice_peers_label:'Peers conectados',voice_quality_low:'Qualidade baixa (mais estável)',voice_quality_medium:'Qualidade média',voice_quality_high:'Qualidade alta',voice_prompt_each_share:'Perguntar em cada compartilhamento',voice_share_title:'Compartilhamento de tela',voice_audio_title:'Áudio',voice_volume_label:'Volume',voice_measuring:'Medindo…',voice_settings_label:'Configurações de voz',voice_default_quality_label:'Qualidade padrão',voice_share_prompt_label:'Perguntar antes de compartilhar',voice_auto_focus_default:'Foco automático de voz ativo por padrão'}
      };
      Object.entries(extra).forEach(([lang,values])=>{if(translations[lang])Object.assign(translations[lang],values);});
    }catch(e){console.warn('[R5.0.2 i18n extension]',e);}
  }
  function r502Language(){ try{return R502_I18N[currentLanguage] ? currentLanguage : 'fr';}catch(_){return 'fr';} }
  function r502Text(key){ const lang=r502Language(); return R502_I18N[lang]?.[key] ?? R502_I18N.fr[key] ?? key; }
  function r502SetText(el,text){ if(el && el.textContent!==text) el.textContent=text; }
  function applyR502Translations(){
    const nav=byId('dmSidebar')?.querySelector('.ds-r5-home-nav');
    r502SetText(nav?.querySelector('[data-home-nav="friends"]'),`👥 ${r502Text('friends')}`);
    r502SetText(nav?.querySelector('[data-home-nav="dm"]'),`💬 ${r502Text('dm')}`);
    r502SetText(nav?.querySelector('.ds-r5-home-label'),r502Text('dmLabel'));
    const dmTitle=byId('dmSidebar')?.querySelector('.dm-title'); if(dmTitle) dmTitle.textContent=`💬 ${r502Text('dm')}`;
    const dmInput=byId('dmInput'); if(dmInput) dmInput.placeholder=r502Text('dmInput');
    const empty=document.querySelector('.ds-r4-dm-empty');
    if(empty){ const p=empty.querySelector('p')||empty.querySelector('div:last-child'); if(p) p.textContent=r502Text('dmEmpty'); }
    const fm=byId('friendsModal');
    if(fm){
      const title=fm.querySelector('.modal-header h3,.modal-header h2'); if(title) title.textContent=`👥 ${r502Text('friends')}`;
      const addInput=byId('dsR4FriendInput'); if(addInput) addInput.placeholder=r502Text('addFriend');
      r502SetText(byId('dsR4FriendAddBtn'),r502Text('sendRequest'));
      const tabs=[['all','all'],['online','online'],['pending','pending'],['requests','requests'],['blocked','blocked']];
      tabs.forEach(([tab,key])=>{
        const b=[...fm.querySelectorAll('.friends-tab')].find(x=>(x.getAttribute('onclick')||'').includes(`'${tab}'`));
        if(!b) return;
        if(tab==='requests'){
          const badge=byId('friendRequestsBadge');
          [...b.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).forEach(n=>n.remove());
          b.insertBefore(document.createTextNode(r502Text(key)+' '),badge||null);
        } else b.textContent=(tab==='blocked'?'🚫 ':'')+r502Text(key);
      });
    }
    document.querySelectorAll('.ds-r5-voice-sub').forEach(el=>{el.innerHTML=`<span class="ds-r5-live-dot"></span> ${r502Text('voiceSync')}`;});
    const notifSelect=byId('notifPositionSelect'); if(notifSelect?.previousElementSibling) notifSelect.previousElementSibling.textContent=r502Text('notifPos');
    const mode=document.body.classList.contains('ds-r5-dm-page')?'dm':document.body.classList.contains('ds-r5-friends-page')?'friends':'server';
    setHomeMode(mode);
  }
  function installR502I18n(){
    extendBaseTranslationsR502();
    const old=window.changeLanguage;
    if(typeof old==='function'&&!old._r502Wrapped){
      const wrapped=function(...args){ const r=old.apply(this,args); setTimeout(applyR502Translations,0); return r; };
      wrapped._r502Wrapped=true; window.changeLanguage=wrapped;
    }
    applyR502Translations();
  }

  let r502FriendsTab='all';
  function installR502FriendsTabs(){
    const old=window.showFriendsTab;
    if(typeof old==='function'&&!old._r502Wrapped){
      const wrapped=function(tab='all'){
        r502FriendsTab=String(tab||'all');
        const fm=byId('friendsModal');
        fm?.querySelectorAll('.friends-tab').forEach(b=>b.classList.toggle('active',(b.getAttribute('onclick')||'').includes(`'${r502FriendsTab}'`)));
        safeCall('renderFriendsList',r502FriendsTab);
      };
      wrapped._r502Wrapped=true; window.showFriendsTab=wrapped;
    }
    const oldOpen=window.openFriendsModal;
    if(typeof oldOpen==='function'&&!oldOpen._r502Wrapped){
      const wrapped=function(...args){ const r=oldOpen.apply(this,args); setTimeout(()=>window.showFriendsTab?.(r502FriendsTab),0); return r; };
      wrapped._r502Wrapped=true; window.openFriendsModal=wrapped;
    }
  }

  const r502DmTimers=new Map();
  function r502FindDmKey(peer){
    const wanted=String(peer||'').toLowerCase();
    try{return Object.keys(dmConversations||{}).find(k=>String(k).toLowerCase()===wanted)||String(peer||'');}catch(_){return String(peer||'');}
  }
  function r502ScheduleDmSync(peer,delay=75){
    const s=socketNow(); const name=String(peer||'').trim(); if(!s?.connected||!name)return;
    const key=name.toLowerCase(); clearTimeout(r502DmTimers.get(key));
    r502DmTimers.set(key,setTimeout(()=>{
      r502DmTimers.delete(key);
      s.emit('get_dm_history',{username:name}); s.emit('get_dm_conversations');
    },Math.max(0,delay)));
  }
  function r502DecorateDmConversations(){
    document.querySelectorAll('#dmConversations .dm-conversation').forEach(row=>{
      const name=row.querySelector('.dm-conversation-name')?.textContent?.trim(); if(!name)return;
      const key=r502FindDmKey(name); let online=false;
      try{online=!!dmConversations[key]?.online;}catch(_){ }
      const av=row.querySelector('.dm-conversation-avatar');
      if(av){ let dot=av.querySelector('.ds-r502-online-dot'); if(online&&!dot){dot=document.createElement('span');dot.className='ds-r502-online-dot';av.appendChild(dot);} if(!online&&dot)dot.remove(); }
    });
  }
  function installR502DmUi(){
    const oldRender=window.renderDMConversations;
    if(typeof oldRender==='function'&&!oldRender._r502Wrapped){
      const wrapped=function(...args){const r=oldRender.apply(this,args);requestAnimationFrame(r502DecorateDmConversations);return r;};
      wrapped._r502Wrapped=true;window.renderDMConversations=wrapped;
    }
    const oldOpen=window.openDMWith;
    if(typeof oldOpen==='function'&&!oldOpen._r502Wrapped){
      const wrapped=function(peer){
        const r=oldOpen.call(this,peer);
        const key=r502FindDmKey(peer); let count=0; try{count=dmConversations[key]?.messages?.length||0}catch(_){ }
        const box=byId('dmChatMessages'); if(box&&!count)box.innerHTML='<div class="ds-r502-dm-loading">Synchronisation…</div>';
        r502ScheduleDmSync(peer,20); return r;
      };
      wrapped._r502Wrapped=true;window.openDMWith=wrapped;
    }
  }
  function installR502DmSocket(s){
    if(!s||s.__docspaceR502DmBound)return; s.__docspaceR502DmBound=true;
    s.on('dm_received',d=>{ const peer=d?.from; if(peer)r502ScheduleDmSync(peer,30); });
    s.on('dm_sent',d=>{ const peer=d?.peer||d?.to; if(peer)r502ScheduleDmSync(peer,30); });
    s.on('dm_conversations_changed',d=>{ if(d?.peer)r502ScheduleDmSync(d.peer,50); else setTimeout(()=>s.emit('get_dm_conversations'),50); });
    s.on('dm_history',data=>setTimeout(()=>{
      const peer=String(data?.username||'').trim(); if(!peer)return;
      try{
        const key=r502FindDmKey(peer);
        if(!dmConversations[key])dmConversations[key]={messages:[],unread:0,avatar:null};
        const seen=new Set();
        dmConversations[key].messages=(data.messages||[]).filter(m=>{
          const sig=String(m?.id||`${m?.from}|${m?.timestamp}|${m?.content||''}|${m?.attachment?.filename||''}`);
          if(seen.has(sig))return false; seen.add(sig); return true;
        }).map(m=>({...m,timestamp:new Date(m.timestamp||Date.now())}));
        if(data.avatar)dmConversations[key].avatar=data.avatar;
        if(typeof currentDMUser!=='undefined'&&String(currentDMUser).toLowerCase()===peer.toLowerCase())safeCall('renderDMMessages');
        safeCall('renderDMConversations');
      }catch(e){console.warn('[R5.0.2 DM history]',e);}
    },0));
    s.on('dm_conversations',list=>setTimeout(()=>{
      try{(list||[]).forEach(c=>{const key=r502FindDmKey(c.username);if(dmConversations[key])dmConversations[key].online=!!c.online;});r502DecorateDmConversations();}catch(_){ }
    },0));
  }

  function installR502VoiceComposer(){
    const update=(active)=>{
      const input=byId('messageInput'); if(!input)return;
      let channel='général';try{channel=currentChannel||channel}catch(_){ }
      input.placeholder=active?r502Text('voiceChat').replace('{channel}',channel):(typeof translateText==='function'?translateText('message_placeholder'):'Tapez votre message…');
    };
    const show=window.showVoiceView;
    if(typeof show==='function'&&!show._r502Wrapped){const w=function(...args){const r=show.apply(this,args);setTimeout(()=>update(true),0);return r;};w._r502Wrapped=true;window.showVoiceView=w;}
    const hide=window.hideVoiceView;
    if(typeof hide==='function'&&!hide._r502Wrapped){const w=function(...args){const r=hide.apply(this,args);setTimeout(()=>update(false),0);return r;};w._r502Wrapped=true;window.hideVoiceView=w;}
  }

  function init(){
    document.body.classList.add('ds-r5-ready','ds-r5-server-page');
    installLayering(); wrapNavigation(); addDmHomeSidebar(); overrideSendDM(); improveFriends(); overridePresence(); overrideBookmarks(); overrideTyping(); wrapXPRender(); wrapVoice(); patchPatchnotesUI(); installSelfHealing();
    installR502FriendsTabs(); installR502DmUi(); installR502VoiceComposer(); installR502I18n();
    setTimeout(()=>{ enhanceXPCards(); enhanceVoiceUI(); applyR502Translations(); const s=socketNow(); if(s?.connected){ setupR5Socket(s); installR502DmSocket(s); } },300);
    log('ready');
  }
  // BOOT STABILITY: helpers (including setupDocSpaceR5Socket) are defined immediately,
  // but MutationObservers / layering / Home UI initialize only after user_join_ready.
  let __r5InitDone=false;
  const __r5StartAfterLogin=()=>{
    if(__r5InitDone) return;
    __r5InitDone=true;
    init();
  };
  window.addEventListener('docspace:connected',__r5StartAfterLogin,{once:true});
  if(window.__docspaceConnected===true) __r5StartAfterLogin();
})();
