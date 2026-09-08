'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const key = n => String(n || '').trim().toLowerCase();
const same = (a,b) => key(a) === key(b);
function cleanAttachment(raw, root) {
  if (!raw) return null;
  const url = String(raw.path || raw.url || '');
  if (!/^\/uploads\/[a-zA-Z0-9_.-]+$/.test(url) || url.includes('..')) return null;
  const filename = path.basename(url);
  let size;
  try { size = fs.statSync(path.join(root,filename)).size; } catch { return null; }
  const voice = raw.isVoiceClip === true && /\.(webm|ogg|m4a|mp4|wav)$/i.test(filename);
  return { path:url, filename, originalname:String(raw.originalname || filename).slice(0,180), size,
    mimetype:voice ? (/\.(m4a|mp4)$/i.test(filename) ? 'audio/mp4' : /\.ogg$/i.test(filename) ? 'audio/ogg' : /\.wav$/i.test(filename) ? 'audio/wav' : 'audio/webm') : String(raw.mimetype || '').slice(0,80),
    ...(voice ? {isVoiceClip:true,duration:Math.min(180,Math.max(.1,Number(raw.duration)||1))} : {}) };
}
function setup(ctx) {
 const {io, DATA_DIR} = ctx;
 const attachOnline = require('./online')(ctx);
 const pollFile=path.join(DATA_DIR,'polls-v350.json');
 let polls=Object.create(null);
 try { polls=JSON.parse(fs.readFileSync(pollFile,'utf8')); } catch {}
 const savePolls=()=>fs.writeFileSync(pollFile,JSON.stringify(polls));
 const scope=(socket,data)=>{
  const user=ctx.connectedUsers.get(socket.id); if(!user)throw Error('Connecte-toi.');
  if(data.to){const to=ctx.resolve(data.to);if(!to||same(to,user.username))throw Error('Destinataire invalide.');
   const blocked=global.blockedUsers||{};
   if((blocked[to]||[]).some(n=>same(n,user.username))||(blocked[user.username]||[]).some(n=>same(n,to)))throw Error('Conversation bloquée.');
   return {user,to,dmKey:[key(user.username),key(to)].sort().join(':')};}
  const channel=String(data.channel||user.currentChannel||'général');
  if(!ctx.config().channels.some(c=>c.name===channel))throw Error('Salon inconnu.');
  return {user,channel};
 };
 const canSee=(poll,name)=>!poll.to || [poll.creator,poll.to].some(n=>same(n,name));
 const present=(poll,name)=>({id:poll.id,question:poll.question,options:poll.options,creator:poll.creator,channel:poll.channel,to:poll.to,closed:!!poll.closed,createdAt:poll.createdAt,vote:poll.votes?.[key(name)] ?? null});
 const pollBroadcast=p=>{for(const [sid,u] of ctx.connectedUsers)if(canSee(p,u.username))io.to(sid).emit('poll_update',present(p,u.username));};
 const toPeers=(names,event,data)=>{for(const name of names)for(const sid of ctx.sockets(name))io.to(sid).emit(event,data);};
 const dmMessage=(m)=>{toPeers([m.from],'dm_sent',m);toPeers([m.to],'dm_received',m);toPeers([m.from,m.to],'dm_conversations_changed',{});};
 return socket=>{
  attachOnline(socket);
  function handler(event,fn){socket.on(event,(data={},ack)=>{try{fn(data,result=>{if(typeof ack==='function')ack({success:true,...result});});}catch(e){const failure={success:false,message:e.message};if(typeof ack==='function')ack(failure);else socket.emit('feature_error',failure);}});}
  handler('create_poll',(data,done)=>{
   const s=scope(socket,data); const question=String(data.question||'').trim();
   const options=Array.isArray(data.options)?data.options.map(t=>String(t).trim()):[];
   if(question.length<3||question.length>200||options.length<2||options.length>8||options.some(t=>!t||t.length>100)||new Set(options).size!==options.length)throw Error('Une question et 2 à 8 réponses différentes sont nécessaires.');
   if(Date.now()-(socket.data.lastPoll||0)<5000)throw Error('Attends quelques secondes avant un autre sondage.');
   if(ctx.configServer().globalMute&&!socket.data.isAdmin)throw Error('Le chat est en mode silencieux.');
   socket.data.lastPoll=Date.now();
   const p={id:crypto.randomUUID(),question,options:options.map(text=>({text,votes:0})),creator:s.user.username,channel:s.channel,to:s.to,dmKey:s.dmKey,createdAt:new Date().toISOString(),votes:Object.create(null)};
   polls[p.id]=p;savePolls();
   if(s.dmKey){const m={id:crypto.randomUUID(),from:s.user.username,to:s.to,content:'',type:'poll',pollId:p.id,timestamp:p.createdAt,avatar:s.user.avatar};const history=(ctx.dms()[s.dmKey]||= []);history.push(m);if(history.length>1000)history.splice(0,history.length-1000);ctx.saveDMs();dmMessage(m);}
   else {const m={id:ctx.nextId(),username:s.user.username,content:'',type:'poll',pollId:p.id,channel:s.channel,timestamp:p.createdAt,avatar:s.user.avatar};ctx.addMessage(m,s.channel);io.to('authenticated').emit('new_message',m);}
   pollBroadcast(p);done({poll:present(p,s.user.username)});
  });
  handler('get_polls',(data,done)=>{const s=scope(socket,data);const visible=Object.values(polls).filter(p=>canSee(p,s.user.username)&&(s.dmKey?p.dmKey===s.dmKey:!p.to&&p.channel===s.channel)).map(p=>present(p,s.user.username));socket.emit('polls_list',visible);done({polls:visible});});
  handler('vote_poll',(data,done)=>{const name=ctx.connectedUsers.get(socket.id)?.username;const p=polls[String(data.pollId)];if(!name||!p||!canSee(p,name))throw Error('Sondage introuvable.');if(p.closed)throw Error('Le sondage est terminé.');
   const i=data.optionIndex;if(!Number.isInteger(i)||i<0||i>=p.options.length)throw Error('Réponse invalide.');
   const previous=p.votes[key(name)];if(Number.isInteger(previous))p.options[previous].votes=Math.max(0,p.options[previous].votes-1);
   Object.defineProperty(p.votes,key(name),{value:i,enumerable:true,writable:true,configurable:true});p.options[i].votes++;savePolls();pollBroadcast(p);done({poll:present(p,name)});
  });
  handler('close_poll',(data,done)=>{const p=polls[String(data.pollId)];const u=ctx.connectedUsers.get(socket.id);if(!p||!u||!canSee(p,u.username)||(!same(p.creator,u.username)&&!socket.data.isAdmin))throw Error('Action non autorisée.');p.closed=true;savePolls();pollBroadcast(p);done({});});
  handler('message_action',(data,done)=>{
   const s=scope(socket,data);const list=s.dmKey?(ctx.dms()[s.dmKey]||[]):(ctx.channels()[s.channel]||[]);
   const m=list.find(m=>String(m.id)===String(data.id));if(!m)throw Error('Message introuvable.');
   const owner=same(m.from||m.username,s.user.username),admin=socket.data.isAdmin&&!s.dmKey;
   if(data.action==='edit'){
    if(!owner)throw Error('Tu peux modifier uniquement tes messages.');const content=String(data.content||'').trim().slice(0,s.dmKey?4000:500);if(!content)throw Error('Le texte ne peut pas être vide.');
    m.content=s.dmKey?content:content.replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');m.edited=true;
   }else if(data.action==='delete'){
    if(!owner&&!admin)throw Error('Tu ne peux pas supprimer ce message.');list.splice(list.indexOf(m),1);
    if(!s.dmKey){const all=ctx.allMessages(),i=all.findIndex(x=>String(x.id)===String(m.id));if(i>=0)all.splice(i,1);delete ctx.reactions()[m.id];ctx.saveReactions();}
    if(m.pollId&&polls[m.pollId]){delete polls[m.pollId];savePolls();}
   }else if(data.action==='react'){
    const emoji=String(data.emoji||'');if(!emoji||emoji.length>64||['__proto__','constructor','prototype'].includes(emoji))throw Error('Réaction invalide.');
    const reactions=s.dmKey?(m.reactions||= {}):(ctx.reactions()[m.id]||= {});const names=reactions[emoji]||[];reactions[emoji]=names.some(n=>same(n,s.user.username))?names.filter(n=>!same(n,s.user.username)):[...names,s.user.username];if(!reactions[emoji].length)delete reactions[emoji];if(!s.dmKey)ctx.saveReactions();
   }else if(data.action==='pin'){
    if(s.dmKey){m.pinned=!m.pinned;}else{if(!admin)throw Error('Le mode administrateur est requis pour épingler dans un salon.');const pins=ctx.pinned();const i=pins.findIndex(x=>String(x.id)===String(m.id));if(i<0)pins.push({...m});else pins.splice(i,1);ctx.savePinnedMessages();io.to('authenticated').emit('pinned_update',{pinnedMessages:pins});}
   }else throw Error('Action inconnue.');
   if(s.dmKey){ctx.saveDMs();toPeers([m.from,m.to],'dm_message_changed',{peerA:m.from,peerB:m.to,id:m.id,action:data.action,message:data.action==='delete'?null:m});toPeers([m.from,m.to],'dm_conversations_changed',{});}
   else {if(['edit','delete'].includes(data.action)){const pins=ctx.pinned(),index=pins.findIndex(x=>String(x.id)===String(m.id));if(index>=0){if(data.action==='delete')pins.splice(index,1);else Object.assign(pins[index],m);ctx.savePinnedMessages();io.to('authenticated').emit('pinned_update',{pinnedMessages:pins});}}const all=ctx.allMessages().find(x=>String(x.id)===String(m.id));if(all&&data.action!=='delete')Object.assign(all,m);ctx.saveChannelHistories();ctx.saveHistory();io.to('authenticated').emit('channel_message_changed',{channel:s.channel,id:m.id,action:data.action,message:data.action==='delete'?null:m,reactions:ctx.reactions()[m.id]||{}});}
   done({});
  });
  handler('mark_dm_unread',(data,done)=>{const s=scope(socket,{to:data.to});const a=ctx.accounts()[key(s.user.username)];const m=(ctx.dms()[s.dmKey]||[]).find(m=>String(m.id)===String(data.id));if(!m||!a)throw Error('Message introuvable.');a.dmRead||={};a.dmRead[s.dmKey]=new Date(m.timestamp).getTime()-1;ctx.saveAccounts();toPeers([s.user.username],'dm_conversations_changed',{});done({});});
  handler('admin_snapshot',(data,done)=>{if(!socket.data.isAdmin)throw Error('Connexion administrateur requise.');done({users:[...ctx.connectedUsers.values()].map(u=>({username:u.username,avatar:u.avatar})),config:ctx.configServer(),channels:ctx.config(),configured:!!process.env.ADMIN_PASSWORD});});
  socket.on('disconnect',()=>{socket.data.isAdmin=false;});
 };
}
module.exports={setup,cleanAttachment};
