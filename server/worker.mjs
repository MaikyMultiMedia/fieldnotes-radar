import { embedded, sourceCommit } from './embedded.mjs';
import { buyAlerts } from './buy-alerts.mjs';
import { paper } from './paper.mjs';
import { tokenChecks, checkSummaries } from './token-checks.mjs';
import { leaderboard } from './intelligence.mjs';
import { address } from './market.mjs';
import { market } from './market.mjs';

const USERS = new Set(['maikymultimedia@gmail.com', 'alexanderpinedo94@gmail.com']);
const enc = new TextEncoder();
const cookieName = '__Host-fieldnotes';
const base = 'https://maikymultimedia.github.io/fieldnotes-radar';
const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/charts.js': ['charts.js', 'text/javascript'], '/NOTICE.txt': ['NOTICE.txt', 'text/plain'], '/style.css': ['style.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
const hash = async value => hex(await crypto.subtle.digest('SHA-256', enc.encode(value)));
const now = () => Math.floor(Date.now()/1000);
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const secure = response => {
  response.headers.set('X-Content-Type-Options','nosniff');
  response.headers.set('Referrer-Policy','no-referrer');
  response.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'");
  response.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  return response;
};
const fail = (message, status=400) => Object.assign(new Error(message), {status});
async function body(request) {
  if(!request.headers.get('content-type')?.startsWith('application/json')) throw fail('JSON required.',415);
  const text = await request.text();
  if(text.length>14000) throw fail('Request too large.',413);
  try {return JSON.parse(text);} catch {throw fail('Invalid request.');}
}
export async function verifyPassword(password, record) {
  if(!record || typeof password!=='string' || password.length>200) return false;
  const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
  const digest=hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(record.salt),iterations:100000},key,256));
  let diff=digest.length^record.hash.length;
  for(let i=0;i<digest.length;i++) diff |= digest.charCodeAt(i)^record.hash.charCodeAt(i);
  return diff===0;
}
export function validateToken(value) {
  const chain = value.chain;
  const contract = String(value.contract||'').trim();
  if(!['solana','ethereum','base','bsc'].includes(chain)) throw fail('Choose a supported chain.');
  if(chain==='solana'?!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(contract):!/^0x[a-fA-F0-9]{40}$/.test(contract)) throw fail('Enter a valid token contract for this chain.');
  const name=String(value.name||'').trim(), symbol=String(value.symbol||'').trim().toUpperCase(), notes=String(value.notes||'').trim();
  if(!name||name.length>80||!symbol||symbol.length>20||notes.length>4000) throw fail('Use a name (80 characters), symbol (20), and notes (4,000 or fewer).');
  const status=value.status||'researching';
  if(!['researching','watching','passed'].includes(status)) throw fail('Invalid research status.');
  return {chain,contract:chain==='solana'?contract:contract.toLowerCase(),name,symbol,notes,status};
}
export function scenario(stake, move, fee=1, fixed=.1) {
  if(!Number.isFinite(stake)||stake<1||stake>10000||!Number.isFinite(move)||move< -100||move>1000) throw fail('Scenario is outside the supported range.');
  const proceeds=Math.max(0,Math.max(0,stake*(1-fee/100)-fixed)*(1+move/100)*(1-fee/100)-fixed);
  return {proceeds,net:proceeds-stake};
}
async function currentUser(request, env) {
  const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token)) return null;
  const user=await env.DB.prepare('SELECT user FROM sessions WHERE hash = ? AND expires > ?').bind(await hash(token),now()).first();
  return user&&USERS.has(user.user)?user.user:null;
}
async function audit(env,user,action,subject) {
  await env.DB.prepare('INSERT INTO activity (id,user,action,subject,at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),user,action,subject,now()).run();
}

// Only the GitHub Pages workflow can advance this release pointer, after checks pass.
// An immutable commit pins every asset; backend/auth code is never loaded remotely.
let releaseCache=null;
let loadingRelease=null;
const verifiedReleases=new Map();
export async function release() {
  if(releaseCache&&releaseCache.until>Date.now()) return releaseCache;
  if(loadingRelease)return loadingRelease;
  loadingRelease=loadRelease();
  try{return await loadingRelease;}finally{loadingRelease=null;}
}
async function loadRelease() {
  try {
    const r=await fetch(base+'/workspace-release.json', {signal:AbortSignal.timeout(3500),cache:'no-store'});
    if(!r.ok) throw Error('Release unavailable');
    const data=await r.json();
    if(data.apiVersion!==6||!/^([a-f0-9]{40})$/.test(data.commit)||!data.assets) throw Error('Incompatible release');
    if(Object.values(files).some(([f])=>!/^[a-f0-9]{64}$/.test(data.assets[f]||''))) throw Error('Incomplete release');
    let contents=verifiedReleases.get(data.commit);
    if(!contents){
      const pairs=await Promise.all(Object.values(files).map(async([file])=>{
        const remote=await fetch(`https://raw.githubusercontent.com/MaikyMultiMedia/fieldnotes-radar/${data.commit}/web/${file}`,{signal:AbortSignal.timeout(5000),cf:{cacheTtl:86400}});
        if(!remote.ok)throw Error('Asset unavailable');
        const text=await remote.text();
        if(text.length>400000||await hash(text)!==data.assets[file])throw Error('Asset integrity mismatch');
        return[file,text];
      }));
      contents=Object.fromEntries(pairs);
      verifiedReleases.set(data.commit,contents);
      while(verifiedReleases.size>3)verifiedReleases.delete(verifiedReleases.keys().next().value);
    }
    releaseCache={commit:data.commit,assets:data.assets,contents,mode:'github',until:Date.now()+60000};
  } catch {
    releaseCache=releaseCache?{...releaseCache,until:Date.now()+15000}:{commit:sourceCommit,assets:{},contents:embedded,mode:'bundled',until:Date.now()+15000};
  }
  return releaseCache;
}
async function asset(request, path) {
  const [file,type]=files[path];
  const requested = new URL(request.url).searchParams.get('v');
  const selected=await release();
  let content=selected.contents[file];
  let commit=selected.commit;
  if(requested&&requested!==selected.commit) {
    if(requested===sourceCommit){content=embedded[file];commit=sourceCommit;}
    else if(verifiedReleases.has(requested)){content=verifiedReleases.get(requested)[file];commit=requested;}
    else return new Response('This release is no longer cached. Reload the workspace.',{status:409});
  }
  if(file==='index.html') content=content.replaceAll('/app.js','/app.js?v='+commit).replaceAll('/charts.js','/charts.js?v='+commit).replaceAll('/style.css','/style.css?v='+commit).replaceAll('/favicon.svg','/favicon.svg?v='+commit);
  return new Response(content,{headers:{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Fieldnotes-Revision':commit}});
}
async function handle(request,env) {
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&files[path]) return asset(request,path);
  if(path==='/health') return json({ok:true});
  if(!path.startsWith('/api/')) return json({error:'Not found'},404);
  if(!env.DB||!env.ACCOUNT_CREDENTIALS) return json({error:'The workspace is still being configured. Please try again shortly.'},503);
  if(request.method!=='GET'&&request.headers.get('origin')!==new URL(request.url).origin) return json({error:'Request origin rejected.'},403);
  if(path==='/api/login'&&request.method==='POST') {
    const input=await body(request), email=String(input.email||'').trim().toLowerCase();
    const client=request.headers.get('cf-connecting-ip')||'local';
    const bucket=Math.floor(now()/900), keys=[await hash('ip:'+client+':'+bucket),await hash('user:'+email+':'+bucket)];
    const checks=await env.DB.batch(keys.map(k=>env.DB.prepare('INSERT INTO login_throttle (key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(k,now()+1800)));
    if(checks.some(r=>(r.results?.[0]?.attempts||0)>20)) return json({error:'Too many attempts. Try again in 15 minutes.'},429,{'Retry-After':'900'});
    const accounts=JSON.parse(env.ACCOUNT_CREDENTIALS), record=accounts[email]||Object.values(accounts)[0];
    const valid=await verifyPassword(input.password,record);
    if(!valid||!USERS.has(email)||!accounts[email]) return json({error:'Email or password is incorrect.'},401);
    const token=hex(crypto.getRandomValues(new Uint8Array(32)));
    await env.DB.batch([
      env.DB.prepare('INSERT INTO sessions (hash,user,expires) VALUES (?,?,?)').bind(await hash(token),email,now()+604800),
      env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(now()),
      env.DB.prepare('DELETE FROM login_throttle WHERE expires < ?').bind(now()),
    ]);
    await audit(env,email,'signed in','workspace');
    return json({user:email},200,{'Set-Cookie':`${cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=604800`});
  }
  const user=await currentUser(request,env);
  if(!user) return json({error:'Please sign in.'},401);
  if(request.method==='GET'&&(path==='/api/market'||path==='/api/market/chart'||path==='/api/market/trades')) return json(await market(request,env));
  if(path==='/api/alerts'||path.startsWith('/api/alerts/'))return json(await buyAlerts(request,env,user,request.method==='POST'?await body(request):null));
  if(path==='/api/paper'||path.startsWith('/api/paper/'))return json(await paper(request,env,user,request.method==='POST'?await body(request):null));
  if(path==='/api/token-checks'&&request.method==='GET')return json(await tokenChecks(request,env));
  if(path==='/api/intelligence/leaders'&&request.method==='GET')return json(await leaderboard(request,env));
  if(path==='/api/logout'&&request.method==='POST') {
    const token=request.headers.get('cookie').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'=')).slice(cookieName.length+1);
    await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(await hash(token)).run();
    return json({ok:true},200,{'Set-Cookie':`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
  }
  if(path==='/api/workspace'&&request.method==='GET') {
    const results=await env.DB.batch([env.DB.prepare('SELECT * FROM watchlist ORDER BY updated DESC LIMIT 300'),env.DB.prepare('SELECT * FROM activity ORDER BY at DESC LIMIT 25'),env.DB.prepare('SELECT * FROM wallets ORDER BY updated DESC LIMIT 100')]);
    const rev=await release();
    return json({user,tokenCheckSummaries:await checkSummaries(env),watchlist:results[0].results,activity:results[1].results,wallets:results[2].results,release:{commit:rev.commit,mode:rev.mode,backend:sourceCommit},feed:JSON.parse(embedded['feed.json'])});
  }
  if(path==='/api/wallets'&&request.method==='POST') {
    const data=await body(request),chain=data.chain,account=address(chain,data.address),label=String(data.label||'').trim();
    if(!label||label.length>60)throw fail('Give this public address a label of 1–60 characters.');
    const id=await hash(chain+':'+account),existing=await env.DB.prepare('SELECT * FROM wallets WHERE id=?').bind(id).first();
    if(existing){
      if(data.revision!==existing.revision)throw fail('This wallet changed. Refresh before saving.',409);
      const result=await env.DB.prepare('UPDATE wallets SET label=?,author=?,updated=?,revision=revision+1 WHERE id=? AND revision=?').bind(label,user,now(),id,data.revision).run();
      if(!result.meta.changes)throw fail('This wallet changed. Refresh before saving.',409);
    }else{
      const count=await env.DB.prepare('SELECT count(*) AS n FROM wallets').first();
      if(count.n>=100)throw fail('The wallet list is full. Remove an address before adding another.');
      const result=await env.DB.prepare('INSERT OR IGNORE INTO wallets (id,chain,address,label,author,updated,revision) VALUES (?,?,?,?,?,?,1)').bind(id,chain,account,label,user,now()).run();
      if(!result.meta.changes)throw fail('Your teammate just added this wallet. Refresh to see it.',409);
    }
    await audit(env,user,existing?'renamed wallet':'followed wallet',label);
    return json({ok:true,id});
  }
  if(path.startsWith('/api/wallets/')&&request.method==='DELETE'){
    const id=path.split('/').pop(),data=await body(request);
    if(!/^[a-f0-9]{64}$/.test(id))throw fail('Invalid wallet.');
    const existing=await env.DB.prepare('SELECT * FROM wallets WHERE id=?').bind(id).first();
    if(!existing)throw fail('This wallet is no longer followed.',404);
    const result=await env.DB.prepare('DELETE FROM wallets WHERE id=? AND revision=?').bind(id,data.revision).run();
    if(!result.meta.changes)throw fail('This wallet changed. Refresh before removing it.',409);
    await audit(env,user,'unfollowed wallet',existing.label);return json({ok:true});
  }
  if(path==='/api/watchlist'&&request.method==='POST') {
    const data=await body(request), t=validateToken(data), id=await hash(t.chain+':'+t.contract);
    const existing=await env.DB.prepare('SELECT * FROM watchlist WHERE id=?').bind(id).first();
    if(existing) {
      if(data.revision!==existing.revision) return json({error:'This token was updated by your teammate. Refresh before saving again.'},409);
      const result=await env.DB.prepare('UPDATE watchlist SET name=?,symbol=?,notes=?,status=?,author=?,updated=?,revision=revision+1 WHERE id=? AND revision=?').bind(t.name,t.symbol,t.notes,t.status,user,now(),id,data.revision).run();
      if(!result.meta.changes) return json({error:'Another update arrived. Refresh before saving.'},409);
    } else {
      const count=await env.DB.prepare('SELECT count(*) AS n FROM watchlist').first();
      if(count.n>=300) throw fail('The watchlist is full. Remove an item before adding another.');
      const inserted=await env.DB.prepare('INSERT OR IGNORE INTO watchlist (id,chain,contract,symbol,name,notes,status,author,updated,revision) VALUES (?,?,?,?,?,?,?,?,?,1)').bind(id,t.chain,t.contract,t.symbol,t.name,t.notes,t.status,user,now()).run();
      if(!inserted.meta.changes) throw fail('Your teammate just added this token. Refresh to see it.',409);
    }
    await audit(env,user,existing?'updated research':'added to watchlist',t.symbol);
    return json({ok:true,id});
  }
  if(path.startsWith('/api/watchlist/')&&request.method==='DELETE') {
    const id=path.split('/').pop(), input=await body(request);
    if(!/^[a-f0-9]{64}$/.test(id)) throw fail('Invalid item.');
    const item=await env.DB.prepare('SELECT * FROM watchlist WHERE id=?').bind(id).first();
    if(!item) throw fail('This item is no longer in the watchlist.',404);
    const removed=await env.DB.prepare('DELETE FROM watchlist WHERE id=? AND revision=?').bind(id,input.revision).run();
    if(!removed.meta.changes) throw fail('This token changed. Refresh before removing it.',409);
    await audit(env,user,'removed from watchlist',item.symbol);
    return json({ok:true});
  }
  return json({error:'Not found'},404);
}
export default { async fetch(request,env) {
  try {return secure(await handle(request,env));} catch(e) {
    if(!e.status) console.error('Workspace request failed',e.name);
    return secure(json({error:e.status?e.message:'The workspace is temporarily unavailable. Your changes were not confirmed. Please try again.'},e.status||503));
  }
}};
