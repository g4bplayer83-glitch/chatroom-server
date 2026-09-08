'use strict';
// Sélection de liens publics reprise du getFallbackGifs de l’ancien DocSpace.
const GIFS = [
 ['3o7TKSjRrfIPjeiVyM','Découverte 1','decouverte tendance trending gratuit'],
 ['l0MYt5jPR6QX5pnqM','Découverte 2','decouverte tendance trending gratuit'],
 ['xT9IgG50Fb7Mi0prBC','Découverte 3','decouverte tendance trending gratuit'],
 ['3oEjI6SIIHBdRxXI40','Découverte 4','decouverte tendance trending gratuit'],
 ['l0MYGzh7pUHKLDyP6','Bonne humeur','heureux happy joie bravo merci gg gaming salut'],
 ['5GoVLqeAOo6PK','On fête ça !','heureux happy joie bravo merci gg gaming salut'],
 ['OPU6wzx8JrHna','Tristesse','triste sad pleurer'],
 ['d2lcHJTG5Tscg','Petit chagrin','triste sad pleurer'],
 ['26BRv0ThflsHCqDrG','Amour','amour love coeur cœur'],
 ['l4pTdcifPZLpDjL1e','Avec amour','amour love coeur cœur'],
 ['10JhviFuU2gWD6','Rire','rire lol drôle drole funny mdr'],
 ['ZqlvCTNHpqrio','Fou rire','rire lol drôle drole funny mdr'],
 ['l3q2K5jinAlChoCLS','Réaction','reaction oups attente patience gene stress'],
 ['xT9IgEYXCNqPZnfFBK','Surprise','reaction oups attente patience gene surprise']
];
function selection(q,warning='') {
 const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 return {configured:false,source:'GIPHY_SELECTION',warning,gifs:GIFS.filter(g=>!q||q==='trending'||normalize(g.join(' ')).includes(normalize(q))).map(([id,title])=>({id,title,preview:'https://media.giphy.com/media/'+id+'/giphy.gif',full:'https://media.giphy.com/media/'+id+'/giphy.gif'}))};
}
module.exports=function catalog(app){
 const cache=new Map(),pending=new Map(),limits=new Map();
 function rate(req,res){const id=req.ip||req.socket.remoteAddress,now=Date.now();let item=limits.get(id);if(!item||item.until<now){if(limits.size>1000)limits.delete(limits.keys().next().value);item={until:now+60000,count:0};limits.set(id,item);}if(++item.count>20){res.set('Retry-After','60').status(429).json({error:'Trop de recherches. Réessaie dans une minute.',gifs:[],videos:[]});return false;}return true;}

 async function cached(key,load){const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.data;if(pending.has(key))return pending.get(key);const request=load().then(data=>{if(cache.size>150)cache.delete(cache.keys().next().value);cache.set(key,{data,until:Date.now()+300000});return data;}).finally(()=>pending.delete(key));pending.set(key,request);return request;}
 app.get('/api/gifs',async(req,res)=>{
  const q=String(req.query.q||'').trim().slice(0,64),key=String(process.env.GIPHY_API_KEY||'').trim();
  if(!key)return res.json(selection(q));
  if(!rate(req,res))return;
  try {const data=await cached('gif:'+q,async()=>{const search=q&&q!=='trending';const params=new URLSearchParams({api_key:key,limit:'30',rating:'pg-13',lang:'fr'});if(search)params.set('q',q);const r=await fetch('https://api.giphy.com/v1/gifs/'+(search?'search':'trending')+'?'+params,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const body=await r.json();return {configured:true,source:'GIPHY',gifs:(body.data||[]).slice(0,30).map(g=>({id:g.id,preview:g.images?.fixed_height_small?.url||g.images?.fixed_height?.url,full:g.images?.original?.url,title:String(g.title||'GIF').slice(0,120)})).filter(g=>g.preview&&g.full)};});res.json(data);}catch{res.json(selection(q,'La recherche GIPHY est indisponible ; sélection de l’ancien DocSpace affichée.'));}
 });
 app.get('/api/videos',async(req,res)=>{
  const key=String(process.env.YOUTUBE_API_KEY||'').trim();
  if(!key)return res.json({configured:false,videos:[]});
  if(!rate(req,res))return;
  const q=String(req.query.q||'jeux vidéo').trim().slice(0,80);
  try {const data=await cached('yt:'+q,async()=>{const params=new URLSearchParams({key,part:'snippet',type:'video',videoEmbeddable:'true',safeSearch:'moderate',maxResults:'12',q});const r=await fetch('https://www.googleapis.com/youtube/v3/search?'+params,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error();const body=await r.json();return {configured:true,videos:(body.items||[]).filter(v=>/^[\w-]{11}$/.test(v.id?.videoId||'')).map(v=>({id:v.id.videoId,title:String(v.snippet?.title||'Vidéo').slice(0,160),channel:String(v.snippet?.channelTitle||'').slice(0,120),thumbnail:'https://i.ytimg.com/vi/'+v.id.videoId+'/mqdefault.jpg'}))};});res.json(data);}catch{res.status(502).json({error:'La recherche YouTube est temporairement indisponible.',videos:[]});}
 });
};
