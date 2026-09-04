/* DocSpace v3.3.0 BETA R5.0.4 — DM reliability + text composer state + safe Discord extras */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const socketNow = () => { try { return socket || null; } catch (_) { return null; } };
  const usernameNow = () => { try { return String(currentUsername || ''); } catch (_) { return ''; } };
  const languageNow = () => { try { return String(currentLanguage || 'fr'); } catch (_) { return 'fr'; } };
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const TEXT = {
    fr:{ptt:'Push-to-Talk',pttHelp:'Maintiens la touche pour parler quand tu es en vocal.',pttKey:'Touche PTT',mic:'Microphone',cam:'Caméra',out:'Sortie audio',auto:'Par défaut',devices:'Périphériques audio / vidéo',noMessages:'Aucun message pour le moment. Dis bonjour !',dmSync:'Synchronisation de la conversation…'},
    en:{ptt:'Push-to-Talk',pttHelp:'Hold the key to talk while connected to voice.',pttKey:'PTT key',mic:'Microphone',cam:'Camera',out:'Audio output',auto:'Default',devices:'Audio / video devices',noMessages:'No messages yet. Say hello!',dmSync:'Syncing conversation…'},
    es:{ptt:'Pulsar para hablar',pttHelp:'Mantén la tecla para hablar mientras estás en un canal de voz.',pttKey:'Tecla PTT',mic:'Micrófono',cam:'Cámara',out:'Salida de audio',auto:'Predeterminado',devices:'Dispositivos de audio / vídeo',noMessages:'Todavía no hay mensajes. ¡Saluda!',dmSync:'Sincronizando conversación…'},
    de:{ptt:'Push-to-Talk',pttHelp:'Halte die Taste gedrückt, um im Sprachchat zu sprechen.',pttKey:'PTT-Taste',mic:'Mikrofon',cam:'Kamera',out:'Audioausgabe',auto:'Standard',devices:'Audio-/Videogeräte',noMessages:'Noch keine Nachrichten. Sag Hallo!',dmSync:'Unterhaltung wird synchronisiert…'},
    pl:{ptt:'Naciśnij, aby mówić',pttHelp:'Przytrzymaj klawisz, aby mówić na kanale głosowym.',pttKey:'Klawisz PTT',mic:'Mikrofon',cam:'Kamera',out:'Wyjście audio',auto:'Domyślne',devices:'Urządzenia audio / wideo',noMessages:'Brak wiadomości. Przywitaj się!',dmSync:'Synchronizacja rozmowy…'},
    ja:{ptt:'プッシュ・トゥ・トーク',pttHelp:'ボイス接続中にキーを押している間だけ話します。',pttKey:'PTTキー',mic:'マイク',cam:'カメラ',out:'音声出力',auto:'デフォルト',devices:'音声 / 映像デバイス',noMessages:'まだメッセージはありません。挨拶してみよう！',dmSync:'会話を同期中…'},
    it:{ptt:'Premi per parlare',pttHelp:'Tieni premuto il tasto per parlare mentre sei nel vocale.',pttKey:'Tasto PTT',mic:'Microfono',cam:'Fotocamera',out:'Uscita audio',auto:'Predefinito',devices:'Dispositivi audio / video',noMessages:'Ancora nessun messaggio. Saluta!',dmSync:'Sincronizzazione conversazione…'},
    pt:{ptt:'Pressionar para falar',pttHelp:'Mantém a tecla premida para falar enquanto estás no canal de voz.',pttKey:'Tecla PTT',mic:'Microfone',cam:'Câmara',out:'Saída de áudio',auto:'Predefinido',devices:'Dispositivos de áudio / vídeo',noMessages:'Ainda não há mensagens. Diz olá!',dmSync:'A sincronizar conversa…'}
  };
  const txt = key => (TEXT[languageNow()] || TEXT.fr)[key] || TEXT.fr[key] || key;

  function canonicalPeer(value) {
    const wanted = String(value || '').trim();
    if (!wanted) return '';
    const lower = wanted.toLowerCase();
    const names = [];
    try { Object.keys(dmConversations || {}).forEach(n => names.push(String(n))); } catch (_) {}
    try { (connectedUsers || []).forEach(u => u?.username && names.push(String(u.username))); } catch (_) {}
    try { (myFriends?.friends || []).forEach(u => names.push(String(u?.username || u))); } catch (_) {}
    return names.find(n => n.toLowerCase() === lower) || wanted;
  }

  function dmKey(peer) {
    const p = canonicalPeer(peer);
    if (!p) return '';
    try {
      return Object.keys(dmConversations || {}).find(k => String(k).toLowerCase() === p.toLowerCase()) || p;
    } catch (_) { return p; }
  }

  function setDmPageMode() {
    document.body.classList.add('ds-r5-ready','ds-r5-dm-page');
    document.body.classList.remove('ds-r5-friends-page','ds-r5-server-page','ds-voice-view-active');
    const friends = $('friendsModal'); if (friends) friends.style.display = 'none';
    const dm = $('dmSidebar'); if (dm) dm.classList.add('open');
    const channelName = $('currentChannelName'); if (channelName) channelName.textContent = languageNow()==='en'?'Direct Messages':'Messages privés';
    const hash = $('currentChannelIndicator')?.querySelector('.channel-hash'); if (hash) hash.textContent='💬';
  }

  function ensureDmUi(peer, { requestHistory=true } = {}) {
    const name = canonicalPeer(peer);
    if (!name) return false;
    let me = usernameNow();
    if (me && name.toLowerCase() === me.toLowerCase()) return false;

    setDmPageMode();
    try {
      const key = dmKey(name) || name;
      if (!dmConversations[key]) dmConversations[key] = { messages:[], unread:0, avatar:null };
      currentDMUser = key;
      dmConversations[key].unread = 0;
    } catch (_) {
      try { currentDMUser = name; } catch (_) {}
    }

    const current = (() => { try { return String(currentDMUser || name); } catch (_) { return name; } })();
    const dm = $('dmSidebar');
    dm?.classList.add('open','ds-dm-has-chat','ds-r503-chat-open','ds-r504-chat-open');
    $('dmConversations')?.style.setProperty('display','none');
    $('dmChatView')?.classList.add('active');
    const chatName = $('dmChatName'); if (chatName) chatName.textContent = current;

    try {
      const data = dmConversations[current] || dmConversations[dmKey(current)] || {};
      const av = $('dmChatAvatar');
      if (av) av.innerHTML = data.avatar ? `<img src="${escapeText(data.avatar)}" alt="${escapeText(current)}">` : '👤';
      data.unread = 0;
    } catch (_) {}

    try { if (typeof updateDMUnreadBadge === 'function') updateDMUnreadBadge(); } catch (_) {}
    try { if (typeof hideDMTyping === 'function') hideDMTyping(); } catch (_) {}
    try { if (typeof renderDMMessages === 'function') renderDMMessages(); } catch (e) { console.warn('[R5.0.4 DM render]',e); }

    const input = $('dmInput');
    if (input) { input.disabled = false; setTimeout(() => input.focus(), 0); }

    if (requestHistory) {
      const s = socketNow();
      if (s?.connected) {
        const box = $('dmChatMessages');
        let count = 0;
        try { count = (dmConversations[current]?.messages || []).length; } catch (_) {}
        if (box && count === 0) box.innerHTML = `<div class="ds-r504-dm-state">${escapeText(txt('dmSync'))}</div>`;
        s.emit('get_dm_history',{username:current});
        s.emit('get_dm_conversations');
      }
    }
    return true;
  }

  function installDmOpenReliability() {
    const list = $('dmConversations');
    if (list && !list.dataset.r504Click) {
      list.dataset.r504Click='1';
      list.addEventListener('click', e => {
        const row = e.target.closest('.dm-conversation');
        if (!row) return;
        const name = row.querySelector('.dm-conversation-name')?.textContent?.trim();
        if (!name) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        ensureDmUi(name);
      }, true);
    }

    const old = window.openDMWith;
    if (typeof old === 'function' && !old._r504Wrapped) {
      const wrapped = function(peer) {
        let result;
        try { result = old.apply(this, arguments); } catch (e) { console.warn('[R5.0.4 old openDMWith]',e); }
        ensureDmUi(peer);
        return result;
      };
      wrapped._r504Wrapped=true;
      window.openDMWith=wrapped;
    }

    const s=socketNow();
    if (s?.connected && !s.__r504DmBound) {
      s.__r504DmBound=true;
      s.on('dm_history', data => {
        const peer=String(data?.username||'').trim();
        let active=''; try { active=String(currentDMUser||''); } catch (_) {}
        if (!peer || !active || peer.toLowerCase()!==active.toLowerCase()) return;
        // Let the existing authoritative handlers merge first, then enforce the selected chat state.
        setTimeout(()=>{
          const key=dmKey(peer);
          try { currentDMUser=key; } catch(_) {}
          ensureDmUi(key,{requestHistory:false});
          const box=$('dmChatMessages');
          let count=0; try { count=(dmConversations[key]?.messages||[]).length; } catch(_) {}
          if(box && count===0) box.innerHTML=`<div class="ds-r504-dm-state">${escapeText(txt('noMessages'))}</div>`;
        },15);
      });
      s.on('dm_conversations',()=>setTimeout(installDmOpenReliability,0));
    }
  }

  function forceServerTextMode() {
    document.body.classList.remove('ds-r5-dm-page','ds-r5-friends-page','ds-voice-view-active');
    document.body.classList.add('ds-r5-server-page');
    const friends=$('friendsModal'); if(friends) friends.style.display='none';
    const dm=$('dmSidebar'); if(dm) dm.classList.remove('open');
    const voice=$('voiceChannelView'); if(voice) voice.style.display='none';
    const chat=$('chatMessages'); if(chat) chat.style.display='';
    const composer=document.querySelector('.chat-input-container');
    if(composer){
      composer.style.removeProperty('display'); composer.style.removeProperty('visibility'); composer.style.removeProperty('opacity'); composer.style.removeProperty('pointer-events');
    }
    const input=$('messageInput'); if(input) input.style.removeProperty('display');
  }

  function syncComposerState() {
    const voice=$('voiceChannelView');
    const voiceVisible=!!voice && getComputedStyle(voice).display!=='none';
    const home=document.body.classList.contains('ds-r5-dm-page')||document.body.classList.contains('ds-r5-friends-page');
    const composer=document.querySelector('.chat-input-container');
    if(!composer)return;
    if(voiceVisible || home){
      if(voiceVisible) document.body.classList.add('ds-voice-view-active');
      return;
    }
    document.body.classList.remove('ds-voice-view-active');
    if(document.body.classList.contains('ds-r5-server-page')){
      composer.style.removeProperty('display'); composer.style.removeProperty('visibility'); composer.style.removeProperty('opacity'); composer.style.removeProperty('pointer-events');
      const input=$('messageInput'); if(input){input.style.removeProperty('display'); if(isConnected)input.disabled=false;}
      const send=$('sendButton'); if(send && isConnected)send.disabled=false;
    }
  }

  function installComposerFix() {
    const oldSwitch=window.switchChannel;
    if(typeof oldSwitch==='function'&&!oldSwitch._r504Wrapped){
      const wrapped=function(channel){
        forceServerTextMode();
        const r=oldSwitch.apply(this,arguments);
        requestAnimationFrame(()=>{forceServerTextMode();syncComposerState();});
        return r;
      };
      wrapped._r504Wrapped=true;window.switchChannel=wrapped;
    }
    const oldShow=window.showVoiceView;
    if(typeof oldShow==='function'&&!oldShow._r504Wrapped){
      const wrapped=function(){const r=oldShow.apply(this,arguments);document.body.classList.add('ds-voice-view-active');requestAnimationFrame(syncComposerState);return r;};
      wrapped._r504Wrapped=true;window.showVoiceView=wrapped;
    }
    const oldHide=window.hideVoiceView;
    if(typeof oldHide==='function'&&!oldHide._r504Wrapped){
      const wrapped=function(){const r=oldHide.apply(this,arguments);document.body.classList.remove('ds-voice-view-active');requestAnimationFrame(syncComposerState);return r;};
      wrapped._r504Wrapped=true;window.hideVoiceView=wrapped;
    }
    document.querySelector('.channels-sidebar')?.addEventListener('click',e=>{
      if(e.target.closest('.channel-item')) setTimeout(()=>{forceServerTextMode();syncComposerState();},0);
    },true);
    syncComposerState();
  }

  // ---------- Safe voice extras: device selectors + Push-to-Talk ----------
  let pttEnabled = localStorage.getItem('docspacePttEnabled') === '1';
  let pttCode = localStorage.getItem('docspacePttKey') || 'KeyV';
  let pttPressed = false;
  let capturingKey = false;

  function voiceActive() { try { return !!currentVoiceRoom && !!localAudioStream; } catch (_) { return false; } }
  function setVoiceTrackEnabled(enabled) {
    try { localAudioStream?.getAudioTracks().forEach(t=>{t.enabled=!!enabled;}); } catch (_) {}
    try { voiceMuted=!enabled; socketNow()?.emit('voice_status_update',{muted:voiceMuted}); } catch (_) {}
    try { if(typeof updateVoiceControlUI==='function')updateVoiceControlUI(); } catch (_) {}
  }
  function applyPttIdle() { if(pttEnabled && voiceActive() && !pttPressed)setVoiceTrackEnabled(false); }
  function keyLabel(code){return ({Space:'Space',AltLeft:'Alt G',AltRight:'Alt D',ControlLeft:'Ctrl G',ControlRight:'Ctrl D',ShiftLeft:'Shift G',ShiftRight:'Shift D'}[code]||code.replace(/^Key/,'').replace(/^Digit/,''));}

  function installPttKeyboard(){
    if(document.documentElement.dataset.r504Ptt)return; document.documentElement.dataset.r504Ptt='1';
    document.addEventListener('keydown',e=>{
      if(capturingKey)return;
      if(!pttEnabled||e.code!==pttCode||e.repeat||!voiceActive())return;
      const tag=e.target?.tagName?.toLowerCase(); if(tag==='input'||tag==='textarea'||e.target?.isContentEditable)return;
      e.preventDefault(); pttPressed=true; setVoiceTrackEnabled(true); document.body.classList.add('ds-r504-ptt-speaking');
    },true);
    document.addEventListener('keyup',e=>{
      if(!pttEnabled||e.code!==pttCode||!pttPressed)return;
      e.preventDefault(); pttPressed=false; setVoiceTrackEnabled(false); document.body.classList.remove('ds-r504-ptt-speaking');
    },true);
    window.addEventListener('blur',()=>{if(pttPressed){pttPressed=false;applyPttIdle();document.body.classList.remove('ds-r504-ptt-speaking');}});
  }

  async function populateDevices(){
    const mic=$('dsR504Mic'),cam=$('dsR504Cam'),out=$('dsR504Out'); if(!mic||!cam||!out||!navigator.mediaDevices?.enumerateDevices)return;
    try{
      const devices=await navigator.mediaDevices.enumerateDevices();
      const fill=(el,kind,current)=>{
        const filtered=devices.filter(d=>d.kind===kind); el.innerHTML=`<option value="">${escapeText(txt('auto'))}</option>`+filtered.map((d,i)=>`<option value="${escapeText(d.deviceId)}">${escapeText(d.label||`${kind==='audioinput'?txt('mic'):kind==='videoinput'?txt('cam'):txt('out')} ${i+1}`)}</option>`).join('');
        if(current && [...el.options].some(o=>o.value===current))el.value=current;
      };
      let mi='',ca='',ou=''; try{mi=selectedAudioInputId||'';ca=selectedVideoInputId||'';ou=selectedAudioOutputId||'';}catch(_){}
      fill(mic,'audioinput',mi);fill(cam,'videoinput',ca);fill(out,'audiooutput',ou);
    }catch(e){console.warn('[R5.0.4 devices]',e);}
  }

  function installVoiceSettings(){
    const anchor=$('voiceSettingsLabel')?.closest('.settings-section'); if(!anchor||$('dsR504VoiceExtras'))return;
    const box=document.createElement('div'); box.id='dsR504VoiceExtras'; box.className='ds-r504-voice-settings';
    box.innerHTML=`
      <div class="ds-r504-settings-title">${escapeText(txt('devices'))}</div>
      <label>${escapeText(txt('mic'))}<select id="dsR504Mic"><option value="">${escapeText(txt('auto'))}</option></select></label>
      <label>${escapeText(txt('cam'))}<select id="dsR504Cam"><option value="">${escapeText(txt('auto'))}</option></select></label>
      <label>${escapeText(txt('out'))}<select id="dsR504Out"><option value="">${escapeText(txt('auto'))}</option></select></label>
      <div class="ds-r504-ptt-row"><label class="ds-r504-check"><input type="checkbox" id="dsR504Ptt" ${pttEnabled?'checked':''}> <span>${escapeText(txt('ptt'))}</span></label><button type="button" id="dsR504PttKey">${escapeText(txt('pttKey'))}: ${escapeText(keyLabel(pttCode))}</button></div>
      <div class="ds-r504-settings-help">${escapeText(txt('pttHelp'))}</div>`;
    anchor.appendChild(box);
    $('dsR504Mic')?.addEventListener('change',async e=>{try{if(typeof applySelectedMicrophone==='function')await applySelectedMicrophone(e.target.value);}catch(err){console.warn(err);}});
    $('dsR504Cam')?.addEventListener('change',async e=>{try{if(typeof applySelectedCamera==='function')await applySelectedCamera(e.target.value);}catch(err){console.warn(err);}});
    $('dsR504Out')?.addEventListener('change',async e=>{try{if(typeof applySelectedOutputDevice==='function')await applySelectedOutputDevice(e.target.value);}catch(err){console.warn(err);}});
    $('dsR504Ptt')?.addEventListener('change',e=>{pttEnabled=!!e.target.checked;localStorage.setItem('docspacePttEnabled',pttEnabled?'1':'0');pttPressed=false;if(pttEnabled)applyPttIdle();});
    $('dsR504PttKey')?.addEventListener('click',e=>{
      capturingKey=true;e.currentTarget.textContent='…';
      const capture=ev=>{ev.preventDefault();ev.stopPropagation();pttCode=ev.code||'KeyV';localStorage.setItem('docspacePttKey',pttCode);e.currentTarget.textContent=`${txt('pttKey')}: ${keyLabel(pttCode)}`;capturingKey=false;document.removeEventListener('keydown',capture,true);};
      document.addEventListener('keydown',capture,true);
    });
    populateDevices();
  }

  function wrapSettings(){
    const old=window.openSettings;
    if(typeof old==='function'&&!old._r504Wrapped){const wrapped=function(){const r=old.apply(this,arguments);setTimeout(()=>{installVoiceSettings();populateDevices();},0);return r;};wrapped._r504Wrapped=true;window.openSettings=wrapped;}
    navigator.mediaDevices?.addEventListener?.('devicechange',()=>{if($('dsR504VoiceExtras'))populateDevices();});
  }

  function installLanguageRefresh(){
    const old=window.changeLanguage;
    if(typeof old==='function'&&!old._r504Wrapped){const wrapped=function(){const r=old.apply(this,arguments);setTimeout(()=>{const oldBox=$('dsR504VoiceExtras');if(oldBox)oldBox.remove();installVoiceSettings();},0);return r;};wrapped._r504Wrapped=true;window.changeLanguage=wrapped;}
  }

  function init(){
    document.body.classList.add('ds-r504-ready');
    installDmOpenReliability();
    installComposerFix();
    installPttKeyboard();
    installVoiceSettings();
    wrapSettings();
    installLanguageRefresh();
    console.log('[DocSpace R5.0.4] DM reliability + composer + voice extras ready');
  }

  let started=false;
  const start=()=>{if(started)return;started=true;setTimeout(init,0);};
  window.addEventListener('docspace:connected',start,{once:true});
  if(window.__docspaceConnected===true)start();
})();
