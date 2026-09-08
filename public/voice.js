/* DocSpace 3.5.1 — audio, caméra et écran sur trois pistes distinctes. */
(() => {
'use strict';
const {socket,state,toast,preferences,esc,icon}=window.DocSpace;
const $=id=>document.getElementById(id);
let stream=null,camera=null,screen=null,room='',muted=false,deafened=false,joining=false,generation=0,cameraTicket=0,screenTicket=0,cameraBusy=false,screenBusy=false,config={iceServers:[]};
let testStream=null,testContext=null,testFrame=0,speakingContext=null,speakingTimer=0,speaking=false;
const peers=new Map(),pendingICE=new Map(),remoteMedia=new Map();
function constraints(){return {audio:{deviceId:preferences.microphone?{exact:preferences.microphone}:undefined,echoCancellation:preferences.echo!==false,noiseSuppression:preferences.noise!==false,autoGainControl:true},video:false};}
function captureError(e){return e.name==='NotAllowedError'?'Autorisation refusée. Tu peux réessayer et choisir ce que tu partages.':e.name==='NotFoundError'?'Aucun périphérique correspondant détecté.':e.name==='NotReadableError'?'Le périphérique est déjà utilisé ou indisponible.':e.message||'Capture impossible.';}
function snapshot(){return {room,muted,deafened,camera:!!camera,screen:!!screen,cameraBusy,screenBusy};}
function notify(){window.dispatchEvent(new CustomEvent('docspace:media',{detail:snapshot()}));}
function stopTracks(s){s?.getTracks().forEach(t=>{t.onended=null;t.stop();});}
function closePeer(id){const p=peers.get(id);if(p){p.ontrack=null;p.onicecandidate=null;p.onconnectionstatechange=null;p.close();peers.delete(id);}pendingICE.delete(id);const media=remoteMedia.get(id);if(media)Object.values(media).forEach(stopTracks);remoteMedia.delete(id);$(`audio-${id}`)?.remove();notify();}
function stopSpeaking(){clearInterval(speakingTimer);speakingContext?.close().catch(()=>{});speakingContext=null;if(speaking&&socket.connected)socket.emit('voice_speaking',{speaking:false});speaking=false;}
function watchSpeaking(){stopSpeaking();try{speakingContext=new (window.AudioContext||window.webkitAudioContext)();const a=speakingContext.createAnalyser();a.fftSize=512;speakingContext.createMediaStreamSource(stream).connect(a);const samples=new Uint8Array(512);let activeUntil=0;speakingTimer=setInterval(()=>{a.getByteTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,n)=>sum+((n-128)/128)**2,0)/samples.length);if(!muted&&rms>.025)activeUntil=Date.now()+350;const next=!muted&&Date.now()<activeUntil;if(next!==speaking){speaking=next;socket.emit('voice_speaking',{speaking});}},120);}catch{stopSpeaking();}}
function updateButtons(){for(const [id,on,title] of [['mic-toggle',muted,muted?'Activer le micro':'Couper le micro'],['audio-toggle',deafened,deafened?'Activer le son':'Couper le son'],['camera-toggle',!!camera,camera?'Arrêter la caméra':'Activer la caméra'],['screen-toggle',!!screen,screen?'Arrêter le partage':'Partager l’écran']]){const b=$(id);if(b){b.classList.toggle('danger',on);b.setAttribute('aria-label',title);b.title=title;}}if(room&&socket.connected)socket.emit('voice_status_update',{muted,deafened,video:!!camera,screen:!!screen});notify();}
function leave(notifyServer=true){generation++;cameraTicket++;screenTicket++;joining=false;cameraBusy=false;screenBusy=false;stopSpeaking();if(notifyServer&&room&&socket.connected)socket.emit('voice_leave');room='';stopTracks(stream);stopTracks(camera);stopTracks(screen);stream=camera=screen=null;for(const id of [...peers.keys()])closePeer(id);pendingICE.clear();$('voice-panel').hidden=true;$('remote-audio').replaceChildren();window.dispatchEvent(new Event('docspace:voice-left'));notify();}
function tracks(){return [stream?.getAudioTracks()[0]||null,camera?.getVideoTracks()[0]||null,screen?.getVideoTracks()[0]||null];}
async function assignTracks(p){const transceivers=p.getTransceivers();const local=tracks();for(let i=0;i<3;i++)if(transceivers[i]){transceivers[i].direction='sendrecv';await transceivers[i].sender.replaceTrack(local[i]);}}
async function replaceSlot(slot,track){const result=await Promise.allSettled([...peers.values()].map(p=>p.getTransceivers()[slot]?.sender.replaceTrack(track)));if(result.some(r=>r.status==='rejected'))toast('Une connexion vidéo n’a pas pu être mise à jour. Rejoins le salon si nécessaire.');}
function createPeer(id,initiator=false){if(peers.has(id))return peers.get(id);const p=new RTCPeerConnection({iceServers:config.iceServers||[],iceTransportPolicy:config.forceRelay?'relay':'all'});peers.set(id,p);
 if(initiator)for(const kind of ['audio','video','video'])p.addTransceiver(kind,{direction:'sendrecv',streams:[new MediaStream()]});
 p.onicecandidate=e=>{if(e.candidate&&room)socket.emit('voice_ice_candidate',{targetId:id,candidate:e.candidate});};
 p.ontrack=e=>{if(!room)return;const slot=p.getTransceivers().indexOf(e.transceiver);const media=new MediaStream([e.track]);if(e.track.kind==='audio'){let a=$(`audio-${id}`);if(!a){a=document.createElement('audio');a.id=`audio-${id}`;a.autoplay=true;$('remote-audio').append(a);}a.srcObject=media;a.muted=deafened;a.play().catch(()=>toast('Appuie sur le casque pour activer le son.'));}else{const store=remoteMedia.get(id)||{};store[slot===2?'screen':'camera']=media;remoteMedia.set(id,store);e.track.onunmute=notify;e.track.onmute=notify;e.track.onended=notify;notify();}};
 p.onconnectionstatechange=()=>{if(p.connectionState==='failed'){toast('Connexion avec un participant impossible. Un relais TURN peut être nécessaire sur ce réseau.');closePeer(id);}};
 return p;
}
async function flushICE(id,p){for(const c of pendingICE.get(id)||[])try{await p.addIceCandidate(c);}catch{}pendingICE.delete(id);}
async function join(target){if(!state.ready)return toast('Connecte-toi avant de rejoindre le vocal.');if(joining||room===target)return;leave();joining=true;const ticket=generation;try{const r=await fetch('/api/voice/runtime-config');if(!r.ok)throw Error('Configuration vocale indisponible.');config=await r.json();if(ticket!==generation)return;if(config.sfuEnabled)throw Error('Cette version demande le mode vocal P2P.');if(!navigator.mediaDevices?.getUserMedia)throw Error('Le micro demande HTTPS ou localhost.');const captured=await navigator.mediaDevices.getUserMedia(constraints());if(ticket!==generation){stopTracks(captured);return;}stream=captured;muted=false;deafened=false;room=target;socket.emit('voice_join',{room});$('voice-panel').hidden=false;$('voice-status').textContent=room;updateButtons();watchSpeaking();await listDevices();}catch(e){if(ticket===generation){leave();toast(captureError(e));}}finally{if(ticket===generation)joining=false;}}
socket.on('voice_joined',async d=>{if(!stream||room!==d.room)return;const ticket=generation;for(const other of d.participants||[])try{const p=createPeer(other.socketId,true);await assignTracks(p);if(ticket!==generation)return;await p.setLocalDescription(await p.createOffer());if(ticket!==generation)return;socket.emit('voice_offer',{targetId:other.socketId,offer:p.localDescription});}catch{toast('Un participant n’a pas pu être connecté.');}});
socket.on('voice_offer',async d=>{if(!stream||!room)return;const ticket=generation;try{const p=createPeer(d.fromId);await p.setRemoteDescription(d.offer);if(ticket!==generation)return;await assignTracks(p);await flushICE(d.fromId,p);await p.setLocalDescription(await p.createAnswer());if(ticket===generation)socket.emit('voice_answer',{targetId:d.fromId,answer:p.localDescription});}catch{closePeer(d.fromId);toast('Connexion vocale impossible.');}});
socket.on('voice_answer',async d=>{const p=peers.get(d.fromId);if(!p)return;try{await p.setRemoteDescription(d.answer);await flushICE(d.fromId,p);}catch{closePeer(d.fromId);}});
socket.on('voice_ice_candidate',async d=>{if(!room)return;const p=peers.get(d.fromId);if(p?.remoteDescription){try{await p.addIceCandidate(d.candidate);}catch{}}else{const queued=pendingICE.get(d.fromId)||[];if(queued.length<100)queued.push(d.candidate);pendingICE.set(d.fromId,queued);}});
socket.on('voice_peer_left',d=>closePeer(d.socketId));
for(const event of ['voice_forced_disconnect','voice_force_disconnect'])socket.on(event,d=>{leave(false);toast(d.message||d.reason||'Tu as quitté le vocal.');});
socket.on('voice_force_status',d=>{if(!stream)return;if(d.muted||d.deafened)muted=true;deafened=!!d.deafened;stream.getAudioTracks().forEach(t=>{t.enabled=!muted;});document.querySelectorAll('#remote-audio audio').forEach(a=>{a.muted=deafened;});updateButtons();toast(d.muted||d.deafened?'Micro coupé par un administrateur.':'Le silence est levé. Tu peux réactiver ton micro.');});
socket.on('voice_force_move',d=>{leave();toast(`Rejoins ${d.room} pour suivre le déplacement demandé.`);});
socket.on('voice_participants_update',d=>{document.querySelectorAll('[data-voice-count]').forEach(el=>{if(el.dataset.voiceCount===d.room)el.textContent=String(d.participants?.length||0);});});
async function setCamera(enabled){const ticket=++cameraTicket,session=generation;if(!enabled){cameraBusy=false;const old=camera;camera=null;stopTracks(old);await replaceSlot(1,null);updateButtons();return;}if(!room)throw Error('Rejoins un salon vocal.');cameraBusy=true;notify();try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Caméra non disponible dans ce navigateur.');const captured=await navigator.mediaDevices.getUserMedia({audio:false,video:{deviceId:preferences.camera?{exact:preferences.camera}:undefined,width:{ideal:1280,max:1280},height:{ideal:720,max:720},frameRate:{ideal:24,max:30}}});if(ticket!==cameraTicket||session!==generation||!room){stopTracks(captured);return;}const old=camera;camera=captured;const track=camera.getVideoTracks()[0];track.onended=()=>{if(camera===captured)setCamera(false);};await replaceSlot(1,track);stopTracks(old);updateButtons();await listDevices();}finally{if(ticket===cameraTicket){cameraBusy=false;notify();}}}
async function setScreen(enabled){const ticket=++screenTicket,session=generation;if(!enabled){screenBusy=false;const old=screen;screen=null;stopTracks(old);await replaceSlot(2,null);updateButtons();return;}if(!room)throw Error('Rejoins un salon vocal.');if(!navigator.mediaDevices?.getDisplayMedia)throw Error('Le partage d’écran n’est pas disponible dans ce navigateur.');screenBusy=true;notify();try{const captured=await navigator.mediaDevices.getDisplayMedia({video:{width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:15,max:30}},audio:false});if(ticket!==screenTicket||session!==generation||!room){stopTracks(captured);return;}const old=screen;screen=captured;stopTracks(old);const track=screen.getVideoTracks()[0];track.onended=()=>{if(screen===captured)setScreen(false);};await replaceSlot(2,track);updateButtons();}finally{if(ticket===screenTicket){screenBusy=false;notify();}}}
async function listDevices(){if(!navigator.mediaDevices?.enumerateDevices)return;try{const devices=await navigator.mediaDevices.enumerateDevices();for(const [id,kind,pref,label] of [['mic-device','audioinput','microphone','Microphone'],['camera-device','videoinput','camera','Caméra'],['voice-camera-device','videoinput','camera','Caméra']]){const select=$(id);if(!select)continue;select.replaceChildren(new Option(label+' par défaut',''));devices.filter(d=>d.kind===kind&&d.deviceId).forEach((d,i)=>select.add(new Option(d.label||label+' '+(i+1),d.deviceId)));select.value=preferences[pref]||'';select.onchange=()=>{preferences[pref]=select.value;localStorage.setItem('docspace.preferences',JSON.stringify(preferences));if(pref==='camera'&&camera)setCamera(true).catch(e=>toast(captureError(e)));};}}catch{toast('Impossible de lister les périphériques.');}}
function renderPage(target,users){const page=$('page');if(state.view!=='voice')return;const joined=room===target;
 if(page.dataset.mediaRoom!==target||!$('voice-media-grid')){page.dataset.mediaRoom=target;page.innerHTML=`<div class="page-heading"><div><h2>${esc(target)}</h2><p id="voice-participant-total"></p></div><button data-view="channels">Retour au chat</button></div><div class="voice-grid" id="voice-media-grid"></div><div class="voice-controls" id="voice-page-controls"></div>`;}
 $('voice-participant-total').textContent=users.length+' participant'+(users.length>1?'s':'');const grid=$('voice-media-grid');const wanted=new Set();
 for(const u of users){for(const slot of ['camera',...(u.screen?['screen']:[])]){const id=u.socketId+':'+slot;wanted.add(id);let tile=[...grid.children].find(n=>n.dataset.mediaId===id);if(!tile){tile=document.createElement('div');tile.dataset.mediaId=id;tile.className='voice-tile';tile.innerHTML='<video autoplay playsinline muted></video><div class="voice-avatar"></div><div class="voice-caption"><strong></strong><small></small></div><button class="media-fullscreen" title="Agrandir" aria-label="Agrandir la vidéo">⛶</button>';grid.append(tile);tile.querySelector('button').onclick=()=>tile.requestFullscreen?.();}
 const self=u.socketId===socket.id,src=self?(slot==='camera'?camera:screen):(remoteMedia.get(u.socketId)?.[slot]);const enabled=slot==='screen'?u.screen:u.video;const video=tile.querySelector('video');if(video.srcObject!==src){video.srcObject=src||null;if(src)video.play().catch(()=>{});}video.muted=true;video.hidden=!enabled||!src;video.classList.toggle('mirror',self&&slot==='camera');tile.classList.toggle('screen-tile',slot==='screen');tile.classList.toggle('speaking',!!u.speaking);tile.querySelector('.voice-avatar').hidden=!video.hidden;const avatarKey=u.username+':'+(u.avatar||'');if(tile.dataset.avatarKey!==avatarKey){tile.dataset.avatarKey=avatarKey;tile.querySelector('.voice-avatar').innerHTML=window.DocSpace.avatarHTML?.(u.username,u.avatar)||`<span class="avatar">${esc(u.username.slice(0,2).toUpperCase())}</span>`;}tile.querySelector('strong').textContent=u.username+(self?' (toi)':'');tile.querySelector('small').textContent=slot==='screen'?'Partage d’écran':u.muted?'Micro coupé':u.deafened?'Son coupé':'';tile.querySelector('button').hidden=video.hidden;
 }}
 for(const tile of [...grid.children])if(!wanted.has(tile.dataset.mediaId)){tile.querySelector('video')?.pause();tile.remove();}
 if(!users.length)grid.innerHTML='<div class="empty">Ce salon est ouvert. Rejoins tes amis ici.</div>';
 const controls=$('voice-page-controls');const mode=joined?'joined':'outside';if(controls.dataset.mode!==mode){controls.dataset.mode=mode;controls.innerHTML=joined?`<button data-voice-control="mic-toggle">${icon('mic')}<span>Micro</span></button><button data-voice-control="audio-toggle">${icon('headphones')}<span>Casque</span></button><button data-camera-toggle>${icon('camera')}<span>Caméra</span></button><button data-screen-toggle>${icon('screen')}<span>Écran</span></button><button data-voice-control="voice-leave" class="danger">Quitter</button><label>Caméra<select id="voice-camera-device"><option value="">Par défaut</option></select></label>`:`<button class="primary" data-join-voice="${esc(target)}">Rejoindre le vocal</button>`;listDevices();}
 for(const [id,on] of [['mic-toggle',muted],['audio-toggle',deafened]]){const b=controls.querySelector(`[data-voice-control="${id}"]`);if(b){b.classList.toggle('danger',on);b.setAttribute('aria-pressed',String(on));}}
 const cam=controls.querySelector('[data-camera-toggle]'),share=controls.querySelector('[data-screen-toggle]');if(cam){cam.disabled=cameraBusy;cam.classList.toggle('active',!!camera);cam.querySelector('span').textContent=camera?'Arrêter caméra':'Caméra';}if(share){share.disabled=screenBusy;share.classList.toggle('active',!!screen);share.querySelector('span').textContent=screen?'Arrêter partage':'Écran';}
}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{if(b.dataset.voiceRoom)await join(b.dataset.voiceRoom);if(b.id==='voice-leave')leave();if(b.id==='mic-toggle'&&stream){muted=!muted;if(!muted&&deafened){deafened=false;document.querySelectorAll('#remote-audio audio').forEach(a=>{a.muted=false;a.play().catch(()=>{});});}stream.getAudioTracks().forEach(t=>{t.enabled=!muted;});updateButtons();}if(b.id==='audio-toggle'){deafened=!deafened;if(deafened&&stream){muted=true;stream.getAudioTracks().forEach(t=>{t.enabled=false;});}document.querySelectorAll('#remote-audio audio').forEach(a=>{a.muted=deafened;if(!deafened)a.play().catch(()=>{});});updateButtons();}if(b.id==='camera-toggle'||b.hasAttribute('data-camera-toggle'))await setCamera(!camera);if(b.id==='screen-toggle'||b.hasAttribute('data-screen-toggle'))await setScreen(!screen);if(b.id==='refresh-devices')await listDevices();if(b.id==='test-mic')await toggleTest();}catch(error){toast(captureError(error));}});
  function stopTest() {
    generationTest++;
    cancelAnimationFrame(testFrame);
    testStream?.getTracks().forEach((t) => t.stop());
    testStream = null;
    testContext?.close();
    testContext = null;
    if ($("test-mic")) $("test-mic").textContent = "Tester mon micro";
    if ($("mic-level")) $("mic-level").value = 0;
  }
  let generationTest = 0;
  async function toggleTest() {
    if (testStream) {
      stopTest();
      return;
    }
    const ticket = ++generationTest;
    try {
      const capture = await navigator.mediaDevices.getUserMedia(constraints());
      if (
        ticket !== generationTest ||
        !$("settings-dialog").open ||
        !$("mic-level")
      ) {
        capture.getTracks().forEach((t) => t.stop());
        return;
      }
      testStream = capture;
      testContext = new AudioContext();
      const source = testContext.createMediaStreamSource(testStream),
        analyser = testContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      $("test-mic").textContent = "Arrêter le test";
      const tick = () => {
        if (!$("mic-level") || !$("settings-dialog").open) return stopTest();
        analyser.getByteTimeDomainData(data);
        const rms = Math.sqrt(
          data.reduce((sum, n) => sum + ((n - 128) / 128) ** 2, 0) /
            data.length,
        );
        $("mic-level").value = Math.min(100, rms * 400);
        testFrame = requestAnimationFrame(tick);
      };
      tick();
      await listDevices();
    } catch (e) {
      stopTest();
      toast(captureError(e));
    }
  }
  $("settings-dialog").addEventListener("close", stopTest);
  document.getElementById("settings-tabs").addEventListener("click", stopTest);
  window.addEventListener("pagehide", () => {
    leave();
    stopTest();
  });
  window.DocSpaceVoice = {join,leave,listDevices,setCamera,setScreen,snapshot,renderPage};
})();
