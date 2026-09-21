import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {flag,normalizeChecks,tokenChecks,savedChecks} from '../server/token-checks.mjs';
import {paper} from '../server/paper.mjs';
// All identities and values in tests are deliberately synthetic.
const mint='3'.repeat(32),pool='4'.repeat(32),evm='0x'+'a'.repeat(40),holder='0x'+'b'.repeat(40);
const sol=()=>({mintable:{status:'1'},freezable:{status:'0'},balance_mutable_authority:{status:'0'},closable:{status:'0'},non_transferable:'0',default_account_state:'1',transfer_hook:[],transfer_fee:{current_fee_rate:{fee_rate:'250'},scheduled_fee_rate:{fee_rate:'500',epoch:'100'}},total_supply:'1000',holder_count:'30',holders:[{token_account:'5'.repeat(32),balance:'200',percent:'0.2',tag:'Synthetic vault'}],privateKey:'must not leave normalization'});
const ev=()=>({is_open_source:'1',is_proxy:'0',is_honeypot:'0',is_in_dex:'1',buy_tax:'0',sell_tax:'0.03',total_supply:'1000',holder_count:'30',holders:[{address:holder,balance:'400',percent:'0.4',tag:'Synthetic exchange',is_contract:'1'}]});
const payload=(chain='solana',data=sol())=>({code:1,result:{[chain==='solana'?mint:evm]:data}});
function database(){const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));function prepare(sql,params=[]){return{bind(...v){return prepare(sql,v)},async first(){return db.prepare(sql).get(...params)||null},async run(){if(/^SELECT|RETURNING/i.test(sql))return{results:db.prepare(sql).all(...params)};return{results:[],meta:{changes:Number(db.prepare(sql).run(...params).changes)}}}};}return{db,env:{DB:{prepare,async batch(ps){db.exec('BEGIN');try{const out=[];for(const p of ps)out.push(await p.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}}};}
const request=(chain='solana',contract=mint)=>new Request('https://workspace.test/api/token-checks?'+new URLSearchParams({chain,contract}));
const json=p=>new Response(JSON.stringify(p));
test('token flags preserve unknown and do not convert empty or malformed values to false',()=>{
  for(const v of [undefined,null,'',false,true,{},[],'false','true','2'])assert.equal(flag(v),null);
  assert.equal(flag('0'),false);assert.equal(flag(1),true);
  const d=normalizeChecks(payload(),'solana',mint);assert.equal(d.findings,1);assert.ok(d.unknown>0);assert.equal(d.checks.find(c=>c.id==='freezable').value,false);assert.equal(d.fees.transferPct,2.5);assert.equal(d.fees.scheduledTransferPct,5);assert.equal(d.sampleSharePct,20);assert.equal(d.holderCoverage.complete,false);assert.ok(!JSON.stringify(d).includes('must not leave'));
  const empty=normalizeChecks(payload('solana',{mintable:{status:null}}),'solana',mint);assert.equal(empty.findings,0);assert.equal(empty.unknown,empty.checks.length);assert.equal(empty.fees.transferPct,null);assert.equal(empty.sampleSharePct,null);assert.equal(empty.holderCount,null);
});
test('exact network/contract and EVM taxes are verified without inferring tradability',()=>{
  assert.throws(()=>normalizeChecks({code:1,result:{[mint.toUpperCase()]:{}}},'solana',mint));
  assert.throws(()=>normalizeChecks({code:1,result:{[pool]:sol()}},'solana',mint));
  assert.throws(()=>normalizeChecks({code:0,result:{[mint]:sol()}},'solana',mint));
  const d=normalizeChecks(payload('base',ev()),'base',evm.toUpperCase().replace('0X','0x'));assert.equal(d.contract,evm);assert.equal(d.fees.buyPct,0);assert.equal(d.fees.sellPct,3);assert.equal(d.sampleSharePct,40);
  const unknown=normalizeChecks(payload('base',{...ev(),is_in_dex:undefined,buy_tax:'1',sell_tax:''}),'base',evm);assert.equal(unknown.fees.buyPct,null);assert.equal(unknown.fees.sellPct,null);
  assert.equal(normalizeChecks(payload('base',{...ev(),is_open_source:'0'}),'base',evm).checks.find(c=>c.id==='unverified_source').value,true);
});
test('holder samples reject malformed/duplicate rows and invalid denominators',()=>{
  for(const supply of [undefined,null,'0','bad'])assert.equal(normalizeChecks(payload('solana',{...sol(),total_supply:supply}),'solana',mint).sampleSharePct,null);
  const raw=sol();raw.holders.push({...raw.holders[0]},{token_account:'bad',balance:'100'});const d=normalizeChecks(payload('solana',raw),'solana',mint);assert.equal(d.holders.length,1);assert.equal(d.holderCoverage.received,3);assert.equal(d.sampleSharePct,null);
  const over=sol();over.holders=[{token_account:'5'.repeat(32),balance:'700'},{token_account:'6'.repeat(32),balance:'600'}];assert.equal(normalizeChecks(payload('solana',over),'solana',mint).sampleSharePct,null);
  const inconsistent=normalizeChecks(payload('solana',{...sol(),holders:[{token_account:'5'.repeat(32),balance:'2000'}]}),'solana',mint);assert.equal(inconsistent.holders[0].sharePct,null);
});
test('free checks use one fixed upstream, bounded shared caching, and original stale timestamps',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=Date.parse('2026-09-01T00:00:00Z'),calls=0;
  t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;assert.equal(String(url),'https://api.gopluslabs.io/api/v1/solana/token_security?contract_addresses='+mint);assert.deepEqual(options.headers,{Accept:'application/json'});assert.equal(options.redirect,'error');return json(payload());});
  const first=await tokenChecks(request(),env),again=await tokenChecks(request(),env);assert.equal(calls,1);assert.equal(first.fetchedAt,again.fetchedAt);assert.equal((await savedChecks(env,'solana',mint)).checks.length,first.checks.length);
  now+=301000;t.mock.method(globalThis,'fetch',async()=>{throw Error('sensitive upstream error');});
  const stale=await tokenChecks(request(),env);assert.equal(stale.status,'stale');assert.equal(stale.fetchedAt,first.fetchedAt);assert.ok(!stale.error.includes('sensitive'));assert.equal(await savedChecks(env,'solana',mint),null);
  now+=600000;await assert.rejects(tokenChecks(request(),env),{status:502});
});
test('network mapping, invalid inputs, shared budget and upstream cooldown prevent uncontrolled requests',async t=>{
  const {db,env}=database();t.after(()=>db.close());const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{urls.push(String(url));const id=new URL(url).searchParams.get('contract_addresses');return json({code:1,result:{[id]:ev()}});});
  for(const chain of ['base','ethereum','bsc'])await tokenChecks(request(chain,evm),env);
  assert.ok(urls.some(u=>u.includes('/8453?')));assert.ok(urls.some(u=>u.includes('/1?')));assert.ok(urls.some(u=>u.includes('/56?')));
  await assert.rejects(tokenChecks(request('unknown',mint),env),{status:400});await assert.rejects(tokenChecks(request('solana','https://evil.test'),env),{status:400});assert.equal(urls.length,3);
  for(let i=0;i<5;i++)await tokenChecks(request('base','0x'+String(i+1).repeat(40)),env);
  await assert.rejects(tokenChecks(request('base','0x'+'9'.repeat(40)),env),{status:429});assert.equal(urls.length,8);
  db.prepare('DELETE FROM market_budget WHERE id=?').run('goplus');
  t.mock.method(globalThis,'fetch',async()=>{urls.push('limited');return new Response('',{status:429,headers:{'retry-after':'120'}});});
  await assert.rejects(tokenChecks(request('base','0x'+'9'.repeat(40)),env),{status:429});
  await assert.rejects(tokenChecks(request('base','0x'+'8'.repeat(40)),env),{status:429});assert.equal(urls.length,9);
});
test('missing, oversized and paid-access responses never become clean reports',async t=>{
  const {db,env}=database();t.after(()=>db.close());
  for(const response of [json({code:1,result:{}}),json({code:1,result:{[mint]:{}}}),new Response('x'.repeat(500001)),new Response('upgrade',{status:402})]){t.mock.method(globalThis,'fetch',async()=>response);await assert.rejects(tokenChecks(request(),env));}
  assert.equal(db.prepare('SELECT count(*) AS n FROM market_cache').get().n,0);
});
test('paper entry saves fresh token checks as historical evidence without new provider calls',async t=>{
  const {db,env}=database();t.after(()=>db.close());const now=Date.parse('2026-09-01T00:00:00Z');t.mock.method(Date,'now',()=>now);
  const checked=normalizeChecks(payload(),'solana',mint);db.prepare('INSERT INTO market_cache (key,payload,fetched) VALUES (?,?,?)').run('goplus:token:v1:solana:'+mint,JSON.stringify(checked),now/1000);
  let calls=0;t.mock.method(globalThis,'fetch',async url=>{calls++;assert.ok(String(url).includes('geckoterminal'));return json({data:{id:'solana_'+pool,type:'pool',attributes:{address:pool,name:'SYNTHETIC / USD',base_token_price_usd:'1',reserve_in_usd:'100000'},relationships:{base_token:{data:{id:'solana_'+mint}},quote_token:{data:{id:'solana_'+'7'.repeat(32)}}}},included:[{id:'solana_'+mint,attributes:{address:mint,name:'Synthetic',symbol:'TEST'}},{id:'solana_'+'7'.repeat(32),attributes:{address:'7'.repeat(32)}}]});});
  const created=(await paper(new Request('https://workspace.test/api/paper',{method:'POST'}),env,'synthetic@example.test',{id:crypto.randomUUID(),chain:'solana',contract:mint,pool,thesis:'Synthetic QA',tag:'manual',outlay:5,feePct:1,fixedFee:.1,slippagePct:1,delaySeconds:60})).trial;
  assert.equal(calls,1);assert.equal(created.tokenChecks.checks.find(c=>c.id==='mintable').value,true);
  db.prepare('UPDATE market_cache SET payload=? WHERE key=?').run(JSON.stringify({...checked,checks:[]}), 'goplus:token:v1:solana:'+mint);
  const stored=(await paper(new Request('https://workspace.test/api/paper'),env,'synthetic@example.test')).trials[0];assert.equal(stored.tokenChecks.checks.length,10);assert.equal(stored.tokenChecks.holders,undefined);
});

test('shared cached checks keep warnings across reloads and do not expose raw holdings in workspace summaries',async t=>{
 const {db,env}=database();t.after(()=>db.close());const now=Date.now(),data=normalizeChecks(payload(),'solana',mint);
 db.prepare('INSERT INTO market_cache (key,payload,fetched) VALUES (?,?,?)').run('goplus:token:v1:solana:'+mint,JSON.stringify(data),Math.floor(now/1000));
 const {checkSummaries}=await import('../server/token-checks.mjs');
 const reports=await checkSummaries(env,now);assert.equal(reports[0].findings,1);assert.equal(reports[0].holders,undefined);assert.equal(reports[0].status,'fresh');assert.equal((await checkSummaries(env,now+301000))[0].status,'stale');assert.equal((await checkSummaries(env,now+86401000)).length,0);
});
