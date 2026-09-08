'use strict';
const crypto = require('node:crypto');
const same = (a,b) => String(a).toLowerCase() === String(b).toLowerCase();
module.exports = function setupOnline(ctx) {
  const {io} = ctx, invites = new Map(), rooms = new Map();
  const sendUser = (name,event,data) => ctx.sockets(name).forEach(id => io.to(id).emit(event,data));
  const snapshot = r => ({code:r.code,players:r.players.map(p=>({socketId:p.id,username:p.username})),paddles:r.paddles,scores:r.scores,ball:{x:r.x,y:r.y},phase:r.phase,winner:r.winner??null});
  const broadcast = r => r.players.forEach(p=>io.to(p.id).emit('pong_state',snapshot(r)));
  function serve(r,dir=1) {r.x=.5;r.y=.5;r.vx=.42*dir;r.vy=(Math.random()-.5)*.35;r.pauseUntil=Date.now()+700;}
  function leave(socket) {
    for(const [code,r] of rooms) {
      const i=r.players.findIndex(p=>p.id===socket.id); if(i<0)continue;
      r.players.splice(i,1);r.paddles.splice(i,1);r.targets.splice(i,1);
      if(!r.players.length) rooms.delete(code);
      else {r.phase='waiting';r.scores=[0,0];serve(r);broadcast(r);io.to(r.players[0].id).emit('pong_peer_left',{});}
    }
  }
  const tick=setInterval(()=>{
    const now=Date.now();
    for(const [id,v] of invites) if(v.expiresAt<=now){invites.delete(id);sendUser(v.from,'game_invite_closed',{id,reason:'expired'});sendUser(v.to,'game_invite_closed',{id,reason:'expired'});}
    for(const [code,r] of rooms) {
      if(now-r.touched>600000){r.players.forEach(p=>io.to(p.id).emit('pong_expired',{}));rooms.delete(code);continue;}
      if(r.phase!=='playing')continue;
      const dt=Math.min(.06,(now-r.last)/1000);r.last=now;
      for(let i=0;i<2;i++)r.paddles[i]+=Math.max(-dt*1.2,Math.min(dt*1.2,r.targets[i]-r.paddles[i]));
      if(now>=r.pauseUntil){
        const oldX=r.x;r.x+=r.vx*dt;r.y+=r.vy*dt;
        if(r.y<.025||r.y>.975){r.y=Math.max(.025,Math.min(.975,r.y));r.vy*=-1;}
        if(r.vx<0&&oldX>=.065&&r.x<=.065&&Math.abs(r.y-r.paddles[0])<.13){r.x=.065;r.vx=Math.min(.9,Math.abs(r.vx)*1.035);r.vy=Math.max(-.8,Math.min(.8,(r.y-r.paddles[0])*3));}
        if(r.vx>0&&oldX<=.935&&r.x>=.935&&Math.abs(r.y-r.paddles[1])<.13){r.x=.935;r.vx=-Math.min(.9,Math.abs(r.vx)*1.035);r.vy=Math.max(-.8,Math.min(.8,(r.y-r.paddles[1])*3));}
        if(r.x<0||r.x>1){const scorer=r.x<0?1:0;r.scores[scorer]++;if(r.scores[scorer]>=7){r.phase='finished';r.winner=scorer;}else serve(r,scorer===0?1:-1);}
      }
      broadcast(r);
    }
  },1000/30);tick.unref();
  return socket=>{
    const handle=(event,fn)=>socket.on(event,(data={},ack)=>{try{const user=ctx.connectedUsers.get(socket.id);if(!user)throw Error('Connexion requise.');const result=fn(data,user);if(typeof ack==='function')ack({success:true,...result});}catch(e){if(typeof ack==='function')ack({success:false,message:e.message});else socket.emit('feature_error',{message:e.message});}});
    handle('game_invite',(d,user)=>{
      if(!['tetris','maze','pong'].includes(d.game))throw Error('Jeu en ligne inconnu.');
      const to=ctx.resolve(d.to);if(!to||same(to,user.username)||!ctx.sockets(to).length)throw Error('Choisis une autre personne connectée.');
      const blocked=global.blockedUsers||{};
      if((blocked[to]||[]).some(n=>same(n,user.username))||(blocked[user.username]||[]).some(n=>same(n,to)))throw Error('Invitation impossible.');
      if(Date.now()-(socket.data.lastGameInvite||0)<5000)throw Error('Attends quelques secondes avant une autre invitation.');
      socket.data.lastGameInvite=Date.now();
      const invite={id:crypto.randomUUID(),from:user.username,to,game:d.game,code:crypto.randomBytes(5).toString('hex').toUpperCase(),expiresAt:Date.now()+90000};
      invites.set(invite.id,{...invite,fromSocket:socket.id});sendUser(to,'game_invite_received',invite);return {invite};
    });
    handle('game_invite_reply',(d,user)=>{
      const invite=invites.get(d.id);if(!invite||!same(invite.to,user.username)||invite.expiresAt<=Date.now())throw Error('Cette invitation a expiré.');
      if(typeof d.accept!=='boolean')throw Error('Réponse invalide.');
      invites.delete(invite.id);
      for(const name of [invite.from,invite.to])sendUser(name,'game_invite_closed',{id:invite.id,reason:d.accept?'accepted':'declined'});
      if(d.accept){if(!ctx.sockets(invite.from).includes(invite.fromSocket))throw Error('La personne a quitté cette session.');const {fromSocket,...publicInvite}=invite;io.to(fromSocket).emit('game_invite_start',publicInvite);socket.emit('game_invite_start',publicInvite);}
      return {};
    });
    handle('pong_join',(d,user)=>{
      const code=String(d.code||'').trim().toUpperCase();if(!/^[A-Z0-9_-]{4,20}$/.test(code))throw Error('Code de partie invalide.');
      let r=rooms.get(code);
      if(r?.players.some(p=>p.id===socket.id))return {state:snapshot(r)};
      if(r?.players.length>=2||r?.players.some(p=>same(p.username,user.username)))throw Error('Cette partie est déjà occupée.');
      if(!r&&rooms.size>=500)throw Error('Trop de parties en attente.');
      leave(socket);
      if(!r){r={code,players:[],paddles:[],targets:[],scores:[0,0],phase:'waiting',last:Date.now(),touched:Date.now()};serve(r);rooms.set(code,r);}
      r.players.push({id:socket.id,username:user.username});r.paddles.push(.5);r.targets.push(.5);r.touched=Date.now();
      if(r.players.length===2){r.phase='playing';r.winner=null;r.scores=[0,0];r.last=Date.now();serve(r);}
      broadcast(r);return {state:snapshot(r)};
    });
    handle('pong_move',(d)=>{const r=rooms.get(String(d.code));const i=r?.players.findIndex(p=>p.id===socket.id);if(!r||i<0||i===undefined||r.phase!=='playing')return {};if(typeof d.y!=='number'||!Number.isFinite(d.y))throw Error('Position invalide.');r.targets[i]=Math.max(.12,Math.min(.88,d.y));r.touched=Date.now();return {};});
    handle('pong_leave',()=>{leave(socket);return {};});
    socket.on('disconnect',()=>{leave(socket);for(const [id,v] of invites)if(v.fromSocket===socket.id||(!ctx.sockets(v.from).length)){invites.delete(id);sendUser(v.to,'game_invite_closed',{id,reason:'left'});}});
  };
};
