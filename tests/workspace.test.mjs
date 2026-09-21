import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync,createHash} from 'node:crypto';
import worker,{validateToken,scenario,verifyPassword} from '../dist/server/index.js';
const db=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')))db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const record={salt:'test-only-random-salt',hash:pbkdf2Sync('test-password','test-only-random-salt',100000,32,'sha256').toString('hex')};
function prepared(sql,params=[]){return{bind(...v){return prepared(sql,v)},async first(){return db.prepare(sql).get(...params)||null},async run(){if(/RETURNING/i.test(sql)||/^SELECT/i.test(sql)){const rows=db.prepare(sql).all(...params);return{results:rows,meta:{changes:rows.length}};}return{results:[],meta:{changes:Number(db.prepare(sql).run(...params).changes)}}}};}
const env={ACCOUNT_CREDENTIALS:JSON.stringify({'maikymultimedia@gmail.com':record,'alexanderpinedo94@gmail.com':record}),DB:{prepare:prepared,async batch(ps){db.exec('BEGIN');try{const results=[];for(const p of ps)results.push(await p.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};
globalThis.fetch=async()=>new Response('not available',{status:404});
const req=(path,method='GET',data=null,cookie='',origin='https://workspace.test')=>new Request('https://workspace.test'+path,{method,headers:{origin,'content-type':'application/json',cookie,'cf-connecting-ip':'test'},body:data?JSON.stringify(data):undefined});
const token={name:'Test token',symbol:'TEST',chain:'solana',contract:'So11111111111111111111111111111111111111112',notes:'Disposable test',status:'researching'};
test('contract identity validation rejects invalid chains, addresses and status',()=>{
  assert.equal(validateToken(token).contract,token.contract);
  assert.throws(()=>validateToken({...token,chain:'anything'}));assert.throws(()=>validateToken({...token,contract:'TEST'}));
  assert.throws(()=>validateToken({...token,status:'buy-now'}));
  const evm={...token,chain:'base',contract:'0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'};
  assert.equal(validateToken(evm).contract,'0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
});
test('password validation and scenario boundaries',async()=>{
  assert.equal(await verifyPassword('test-password',record),true);assert.equal(await verifyPassword('wrong',record),false);
  assert.equal(scenario(5,-100).proceeds,0);assert.ok(Math.abs(scenario(5,50).proceeds-7.10225)<.00001);
  assert.throws(()=>scenario(NaN,5));assert.throws(()=>scenario(5,-101));
});
test('server enforces authentication, origin, sharing, revisions and logout',async()=>{
  for(const path of ['/api/workspace','/api/market','/api/market/chart','/api/market/trades','/api/intelligence/leaders','/api/token-checks','/api/wallets','/api/paper','/api/paper/observe'])assert.equal((await worker.fetch(req(path),env)).status,401);
  assert.equal((await worker.fetch(req('/.env'),env)).status,404);
  assert.equal((await worker.fetch(req('/api/login','POST',{email:'maikymultimedia@gmail.com',password:'test-password'},'','https://evil.test'),env)).status,403);
  assert.equal((await worker.fetch(req('/api/login','POST',{email:'stranger@gmail.com',password:'test-password'}),env)).status,401);
  assert.equal((await worker.fetch(req('/api/login','POST',{email:'maikymultimedia@gmail.com',password:'wrong'}),env)).status,401);
  const login=await worker.fetch(req('/api/login','POST',{email:'maikymultimedia@gmail.com',password:'test-password'}),env);
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await worker.fetch(req('/api/watchlist','POST',token,cookie),env)).status,200);
  const duplicate=await worker.fetch(req('/api/watchlist','POST',token,cookie),env);assert.equal(duplicate.status,409);
  const other=await worker.fetch(req('/api/login','POST',{email:'alexanderpinedo94@gmail.com',password:'test-password'}),env);
  const cookie2=other.headers.get('set-cookie').split(';')[0];
  const workspace=await(await worker.fetch(req('/api/workspace','GET',null,cookie2),env)).json();
  assert.equal(workspace.watchlist.length,1);assert.equal(workspace.watchlist[0].notes,token.notes);
  assert.equal(workspace.user,'alexanderpinedo94@gmail.com');
  for(const path of ['/api/radar','/api/alerts/scan','/api/alerts/rules','/api/alerts/seen/'+('a'.repeat(64)), '/api/paper','/api/paper/observe','/api/paper/'+crypto.randomUUID()+'/close']){
    assert.equal((await worker.fetch(req(path,'POST',{},cookie2,'https://evil.test'),env)).status,403);
    assert.equal((await worker.fetch(req(path,'POST',{}),env)).status,401);
  }
  assert.deepEqual((await (await worker.fetch(req('/api/alerts','GET',null,cookie2),env)).json()).rules,[]);
  assert.equal((await worker.fetch(req('/api/alerts'),env)).status,401);
  assert.deepEqual((await (await worker.fetch(req('/api/paper','GET',null,cookie2),env)).json()).trials,[]);
  const update={...token,notes:'Team review',revision:1};
  assert.equal((await worker.fetch(req('/api/watchlist','POST',update,cookie2),env)).status,200);
  assert.equal((await worker.fetch(req('/api/watchlist','POST',update,cookie),env)).status,409);
  assert.equal((await worker.fetch(req('/api/watchlist/'+workspace.watchlist[0].id,'DELETE',{revision:1},cookie),env)).status,409);
  assert.equal((await worker.fetch(req('/api/logout','POST',{},cookie),env)).status,200);
  assert.equal((await worker.fetch(req('/api/workspace','GET',null,cookie),env)).status,401);
  db.prepare('UPDATE sessions SET expires=0').run();
  assert.equal((await worker.fetch(req('/api/workspace','GET',null,cookie2),env)).status,401);
});
test('login attempts are rate-limited in durable storage',async()=>{
  let response;for(let i=0;i<22;i++)response=await worker.fetch(req('/api/login','POST',{email:'nobody@example.com',password:'wrong'}),env);
  assert.equal(response.status,429);
});
test('source code and static assets expose no actual credential',()=>{
  const js=fs.readFileSync('web/app.js','utf8');assert.ok(!js.includes(record.hash));assert.ok(!js.includes('ACCOUNT_CREDENTIALS'));
  assert.match(fs.readFileSync('server/worker.mjs','utf8'),/INSERT INTO login_throttle/);
});
test('GitHub release switches atomically only after all hashes verify',async()=>{
  const commit='a'.repeat(40),files={'index.html':'<html>Verified release <script src="/app.js"></script></html>','app.js':'/* verified */','style.css':'body{}','favicon.svg':'<svg/>','charts.js':'/* chart vendor */','NOTICE.txt':'Apache 2.0 notice'};
  const assets=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,createHash('sha256').update(v).digest('hex')]));
  globalThis.fetch=async url=>new Response(String(url).endsWith('workspace-release.json')?JSON.stringify({apiVersion:7,commit,assets}):files[String(url).split('/').pop()]);
  const good=(await import('../dist/server/index.js?good-release')).default;
  const response=await good.fetch(req('/'),env);assert.equal(response.headers.get('X-Fieldnotes-Revision'),commit);assert.match(await response.text(),/Verified release/);
  const bad=(await import('../dist/server/index.js?bad-release')).default;
  globalThis.fetch=async url=>new Response(String(url).endsWith('workspace-release.json')?JSON.stringify({apiVersion:7,commit,assets}):'tampered');
  const fallback=await bad.fetch(req('/'),env);assert.notEqual(fallback.headers.get('X-Fieldnotes-Revision'),commit);assert.doesNotMatch(await fallback.text(),/tampered/);
  assert.equal((await good.fetch(req('/app.js?v='+ 'b'.repeat(40)),env)).status,409);
});

test('wallet follows are shared, canonical, revision-safe and origin-protected',async()=>{
  db.prepare('DELETE FROM login_throttle').run();
  const sign=async email=>(await worker.fetch(req('/api/login','POST',{email,password:'test-password'}),env)).headers.get('set-cookie').split(';')[0];
  const a=await sign('maikymultimedia@gmail.com'),b=await sign('alexanderpinedo94@gmail.com');
  const data={chain:'base',address:'0x'+'A'.repeat(40),label:'Synthetic QA wallet'};
  assert.equal((await worker.fetch(req('/api/wallets','POST',data,a,'https://evil.test'),env)).status,403);
  assert.equal((await worker.fetch(req('/api/wallets','POST',{...data,address:'bad'},a),env)).status,400);
  assert.equal((await worker.fetch(req('/api/wallets','POST',data,a),env)).status,200);
  assert.equal((await worker.fetch(req('/api/wallets','POST',data,b),env)).status,409);
  const ws=await(await worker.fetch(req('/api/workspace','GET',null,b),env)).json(),wallet=ws.wallets[0];
  assert.equal(wallet.address,data.address.toLowerCase());
  assert.equal((await worker.fetch(req('/api/wallets','POST',{...data,label:'Updated label',revision:1},b),env)).status,200);
  assert.equal((await worker.fetch(req('/api/wallets/'+wallet.id,'DELETE',{revision:1},a),env)).status,409);
  assert.equal((await worker.fetch(req('/api/wallets/'+wallet.id,'DELETE',{revision:2},a),env)).status,200);
  const next=await(await worker.fetch(req('/api/workspace','GET',null,b),env)).json();assert.equal(next.wallets.length,0);
  assert.ok(next.activity.some(x=>x.action==='followed wallet'));assert.ok(next.activity.some(x=>x.action==='unfollowed wallet'));
});
