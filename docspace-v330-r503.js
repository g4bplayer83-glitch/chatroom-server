/* DocSpace v3.3.0 BETA R5.0.3 — DM Home + Friends Navigation + Voice Composer Rules */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const sock = () => { try { return socket || null; } catch (_) { return null; } };
  const langNow = () => { try { return currentLanguage || 'fr'; } catch (_) { return 'fr'; } };

  const I18N = {
    fr:{dmHomeTitle:'Messages privés',dmHomeSub:'Démarre une nouvelle conversation ou choisis-en une dans la liste.',dmStart:'Écrire à une personne',dmUser:'Pseudo de la personne',dmGo:'Ouvrir la conversation',online:'En ligne maintenant',noOnline:'Personne d’autre en ligne pour le moment.',friends:'Amis'},
    en:{dmHomeTitle:'Direct Messages',dmHomeSub:'Start a new conversation or choose one from the list.',dmStart:'Message someone',dmUser:'Username',dmGo:'Open conversation',online:'Online now',noOnline:'No one else is online right now.',friends:'Friends'},
    es:{dmHomeTitle:'Mensajes privados',dmHomeSub:'Inicia una conversación o elige una de la lista.',dmStart:'Escribir a una persona',dmUser:'Nombre de usuario',dmGo:'Abrir conversación',online:'En línea ahora',noOnline:'No hay nadie más en línea.',friends:'Amigos'},
    de:{dmHomeTitle:'Direktnachrichten',dmHomeSub:'Starte eine neue Unterhaltung oder wähle links eine aus.',dmStart:'Jemandem schreiben',dmUser:'Benutzername',dmGo:'Unterhaltung öffnen',online:'Jetzt online',noOnline:'Zurzeit ist niemand sonst online.',friends:'Freunde'},
    pl:{dmHomeTitle:'Wiadomości prywatne',dmHomeSub:'Rozpocznij nową rozmowę albo wybierz ją z listy.',dmStart:'Napisz do osoby',dmUser:'Nazwa użytkownika',dmGo:'Otwórz rozmowę',online:'Teraz online',noOnline:'Nikt inny nie jest teraz online.',friends:'Znajomi'},
    ja:{dmHomeTitle:'ダイレクトメッセージ',dmHomeSub:'新しい会話を始めるか、左の一覧から選択してください。',dmStart:'ユーザーにメッセージ',dmUser:'ユーザー名',dmGo:'会話を開く',online:'オンライン',noOnline:'現在ほかのオンラインユーザーはいません。',friends:'フレンド'},
    it:{dmHomeTitle:'Messaggi privati',dmHomeSub:'Avvia una nuova conversazione o scegline una dalla lista.',dmStart:'Scrivi a una persona',dmUser:'Nome utente',dmGo:'Apri conversazione',online:'Online ora',noOnline:'Nessun altro è online in questo momento.',friends:'Amici'},
    pt:{dmHomeTitle:'Mensagens privadas',dmHomeSub:'Inicie uma conversa ou escolha uma na lista.',dmStart:'Enviar mensagem a alguém',dmUser:'Nome de utilizador',dmGo:'Abrir conversa',online:'Online agora',noOnline:'Ninguém mais está online agora.',friends:'Amigos'}
  };
  const t = key => (I18N[langNow()] || I18N.fr)[key] || I18N.fr[key] || key;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function setMode(mode) {
    document.body.classList.toggle('ds-r5-dm-page', mode === 'dm');
    document.body.classList.toggle('ds-r5-friends-page', mode === 'friends');
    document.body.classList.toggle('ds-r5-server-page', mode === 'server');
    const label = $('currentChannelName');
    const hash = $('currentChannelIndicator')?.querySelector('.channel-hash');
    if (mode === 'dm') { if (label) label.textContent=t('dmHomeTitle'); if(hash) hash.textContent='💬'; }
    if (mode === 'friends') { if (label) label.textContent=t('friends'); if(hash) hash.textContent='👥'; }
    if (mode === 'server') {
      try { if(label) label.textContent=currentChannel || 'général'; } catch (_) { if(label) label.textContent='général'; }
      if(hash) hash.textContent='#';
    }
    document.querySelectorAll('#docspaceAppRailR3 [data-r4-action]').forEach(b=>b.classList.remove('active'));
    document.querySelector(`#docspaceAppRailR3 [data-r4-action="${mode==='server'?'server':'dm'}"]`)?.classList.add('active');
  }

  function canonicalPeer(value) {
    const wanted=String(value||'').trim();
    if(!wanted) return '';
    const lower=wanted.toLowerCase();
    const names=[];
    try { (connectedUsers||[]).forEach(u=>u?.username&&names.push(String(u.username))); } catch(_) {}
    try { (myFriends?.friends||[]).forEach(u=>names.push(String(u?.username||u))); } catch(_) {}
    try { Object.keys(dmConversations||{}).forEach(u=>names.push(String(u))); } catch(_) {}
    return names.find(n=>n.toLowerCase()===lower) || wanted;
  }

  function startFromLanding(value) {
    const target=canonicalPeer(value);
    if(!target) return;
    let me=''; try { me=String(currentUsername||''); } catch(_) {}
    if(target.toLowerCase()===me.toLowerCase()) {
      try { showNotification('💬 DM','Tu ne peux pas ouvrir un MP avec toi-même.','info'); } catch(_) {}
      return;
    }
    if(typeof window.openDMWith==='function') window.openDMWith(target);
  }

  function onlinePeople() {
    let me=''; try{me=String(currentUsername||'').toLowerCase();}catch(_){}
    try { return (connectedUsers||[]).filter(u=>u?.username && String(u.username).toLowerCase()!==me).slice(0,8); }
    catch(_) { return []; }
  }

  function renderLanding() {
    const empty=$('dsR4DmEmpty');
    if(!empty) return;
    empty.classList.add('ds-r503-dm-landing-wrap');
    const people=onlinePeople();
    empty.innerHTML=`
      <div class="ds-r503-dm-landing">
        <div class="ds-r503-dm-icon">💬</div>
        <h2>${esc(t('dmHomeTitle'))}</h2>
        <p>${esc(t('dmHomeSub'))}</p>
        <div class="ds-r503-dm-start-label">${esc(t('dmStart'))}</div>
        <div class="ds-r503-dm-start">
          <input id="dsR503DmTarget" autocomplete="off" spellcheck="false" placeholder="${esc(t('dmUser'))}">
          <button id="dsR503DmOpen" type="button">${esc(t('dmGo'))}</button>
        </div>
        <div class="ds-r503-online-title">${esc(t('online'))}</div>
        <div class="ds-r503-online-list">
          ${people.length ? people.map(u=>`<button type="button" data-r503-peer="${esc(u.username)}"><span class="ds-r503-peer-avatar">${u.avatar?`<img src="${esc(u.avatar)}" alt="">`:esc(String(u.username).charAt(0).toUpperCase())}</span><span>${esc(u.username)}</span><i></i></button>`).join('') : `<span class="ds-r503-no-online">${esc(t('noOnline'))}</span>`}
        </div>
      </div>`;
    const input=$('dsR503DmTarget');
    const go=()=>startFromLanding(input?.value);
    $('dsR503DmOpen')?.addEventListener('click',go);
    input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();go();}});
    empty.querySelectorAll('[data-r503-peer]').forEach(b=>b.addEventListener('click',()=>startFromLanding(b.dataset.r503Peer)));
  }

  function syncDmState() {
    const dm=$('dmSidebar'); if(!dm) return;
    let has=false; try{has=!!currentDMUser;}catch(_){}
    dm.classList.toggle('ds-dm-has-chat',has);
    dm.classList.toggle('ds-r503-chat-open',has);
    if(!has) renderLanding();
  }

  function openDmHome() {
    const friends=$('friendsModal'); if(friends) friends.style.display='none';
    setMode('dm');
    const dm=$('dmSidebar'); if(dm) dm.classList.add('open');
    try { currentDMUser=null; } catch(_) {}
    $('dmChatView')?.classList.remove('active');
    const list=$('dmConversations'); if(list) list.style.display='block';
    try { hideDMTyping(); } catch(_) {}
    try { renderDMConversations(); } catch(_) {}
    syncDmState();
    const s=sock(); if(s?.connected) s.emit('get_dm_conversations');
  }
  window.docspaceOpenDmHome=openDmHome;

  function openFriendsHome() {
    setMode('friends');
    const dm=$('dmSidebar'); if(dm) dm.classList.add('open');
    if(typeof window.openFriendsModal==='function') window.openFriendsModal();
  }

  function fixHomeNavigation() {
    const rail=$('docspaceAppRailR3');
    if(rail && !rail.dataset.r503Nav){
      rail.dataset.r503Nav='1';
      rail.addEventListener('click',e=>{
        const b=e.target.closest('[data-r4-action]'); if(!b)return;
        if(b.dataset.r4Action==='dm'){
          e.preventDefault();e.stopImmediatePropagation();openDmHome();
        }
      },true);
    }
    const nav=document.querySelector('.ds-r5-home-nav');
    if(nav && !nav.dataset.r503Nav){
      nav.dataset.r503Nav='1';
      nav.addEventListener('click',e=>{
        const b=e.target.closest('[data-home-nav]');if(!b)return;
        e.preventDefault();e.stopImmediatePropagation();
        if(b.dataset.homeNav==='dm') openDmHome();
        if(b.dataset.homeNav==='friends') openFriendsHome();
      },true);
    }

    const close=$('friendsModal')?.querySelector('.modal-header .close');
    if(close && !close.dataset.r503Close){
      close.dataset.r503Close='1';
      close.addEventListener('click',e=>{
        e.preventDefault();e.stopImmediatePropagation();openDmHome();
      },true);
      close.title=t('dmHomeTitle');
    }
  }

  function wrapConversationFunctions() {
    const open=window.openDMWith;
    if(typeof open==='function'&&!open._r503Wrapped){
      const wrapped=function(peer){
        const friends=$('friendsModal'); if(friends) friends.style.display='none';
        setMode('dm');
        const dm=$('dmSidebar'); if(dm) dm.classList.add('open');
        const r=open.apply(this,arguments);
        requestAnimationFrame(syncDmState);
        return r;
      };
      wrapped._r503Wrapped=true;window.openDMWith=wrapped;
    }
    const back=window.backToDMList;
    if(typeof back==='function'&&!back._r503Wrapped){
      const wrapped=function(){const r=back.apply(this,arguments);requestAnimationFrame(()=>{syncDmState();renderLanding();});return r;};
      wrapped._r503Wrapped=true;window.backToDMList=wrapped;
    }
    const render=window.renderDMConversations;
    if(typeof render==='function'&&!render._r503Wrapped){
      const wrapped=function(){const r=render.apply(this,arguments);requestAnimationFrame(()=>{syncDmState();fixHomeNavigation();});return r;};
      wrapped._r503Wrapped=true;window.renderDMConversations=wrapped;
    }
  }

  function keepFriendsCompact() {
    const modal=$('friendsModal'); if(!modal)return;
    modal.classList.add('ds-r503-friends');
    fixHomeNavigation();
  }

  function installLanguageRefresh(){
    const fn=window.changeLanguage;
    if(typeof fn==='function'&&!fn._r503Wrapped){
      const wrapped=function(){const r=fn.apply(this,arguments);setTimeout(()=>{renderLanding();fixHomeNavigation();},0);return r;};
      wrapped._r503Wrapped=true;window.changeLanguage=wrapped;
    }
  }

  function installUserRefresh(){
    const s=sock(); if(!s||s.__r503Users)return; s.__r503Users=true;
    s.on('users_update',()=>{ if(document.body.classList.contains('ds-r5-dm-page')) setTimeout(renderLanding,0); });
  }

  function init(){
    document.body.classList.add('ds-r503-ready');
    wrapConversationFunctions();
    fixHomeNavigation();
    keepFriendsCompact();
    installLanguageRefresh();
    installUserRefresh();
    syncDmState();
    console.log('[DocSpace R5.0.3] DM/Home navigation ready');
  }

  let done=false;
  const start=()=>{if(done)return;done=true;setTimeout(init,0);};
  window.addEventListener('docspace:connected',start,{once:true});
  if(window.__docspaceConnected===true) start();
})();
