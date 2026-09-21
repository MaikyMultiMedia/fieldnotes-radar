import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {capChange,captureCaps,capRadar,signalEvidence} from '../server/cap-momentum.mjs';
import {paper} from '../server/paper.mjs';
// Synthetic observations only; no market history or wallet records.
const start=Date.parse('2026-09-01T00:00:00Z'),contract='3'.repeat(32),pool='4'.repeat(32),quote='5'.repeat(32);
function database(){const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));let queries=0;function prepare(sql,params=[]){return{bind(...v){return prepare(sql,v)},async first(){queries++;return db.prepare(sql).get(...params)||null},async run(){queries++;if(/^SELECT|RETURNING/i.test(sql))return{results:db.prepare(sql).all(...params)};return{results:[],meta:{changes:Number(db.prepare(sql).run(...params).changes)}}}};}return{db,reset(){queries=0;},count:()=>queries,env:{DB:{prepare,async batch(ps){assert.ok(ps.length>0);db.exec('BEGIN');try{const r=[];for(const p of ps)r.push(await p.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}}};}
function token(cap=4000){return{chain:'solana',contract,pool,symbol:'SYNTHETIC',name:'Synthetic QA token',marketCap:cap,price:2,liquidity:100000,sourceUrl:'https://www.geckoterminal.com/solana/pools/'+pool};}
function snap(time=start,cap=4000){return{chain:'solana',provider:'GeckoTerminal',status:'fresh',fetchedAt:new Date(time).toISOString(),pools:[token(cap)]};}
function obs(time=start,cap=4000){return{...token(cap),provider:'GeckoTerminal',received:time,token:token(cap)};}
function provider(cap=8000){return{data:[{id:'solana_'+pool,type:'pool',attributes:{address:pool,name:'SYNTHETIC / USD',market_cap_usd:String(cap),base_token_price_usd:'2',reserve_in_usd:'100000'},relationships:{base_token:{data:{id:'solana_'+contract}},quote_token:{data:{id:'solana_'+quote}}}}],included:[{id:'solana_'+contract,type:'token',attributes:{address:contract,name:'Synthetic QA token',symbol:'TEST'}},{id:'solana_'+quote,type:'token',attributes:{address:quote,symbol:'USD'}}]};}
const request=(path='/api/radar')=>new Request('https://workspace.test'+path,{method:'POST'});

test('cap thresholds match the original engine while receipt times are explicit',()=>{
  for(const c of JSON.parse(fs.readFileSync('tests/fixtures/cap-thresholds.json'))){const found=capChange(obs(start,c.before),obs(start+c.seconds*1000,c.after));assert.equal(found?.direction||null,c.expected,c.name);if(found)assert.equal(found.sourceObservedAt,null);}
  for(const mismatch of [{chain:'base'},{pool:quote},{contract:quote},{provider:'different'}])assert.equal(capChange(obs(),{...obs(start+1000,8000),...mismatch}),null);
  for(const value of [null,0,-1,NaN,Infinity,'4000'])assert.equal(capChange(obs(start,value),obs(start+1000,8000)),null);
});
test('capture uses oldest qualifying baseline, persists evidence, deduplicates and enforces directional cooldown',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start;t.mock.method(Date,'now',()=>now);
  let r=await captureCaps(snap(),env);assert.equal(r.eligible,1);assert.equal(r.compared,0);assert.equal(r.added,0);
  now+=30000;r=await captureCaps(snap(now,7000),env);assert.equal(r.compared,1);assert.equal(r.added,1);assert.equal(r.signals[0].beforeReceived,start);assert.equal(r.signals[0].kind,'received_cap_change');
  r=await captureCaps(snap(now,9999),env);assert.equal(r.captured,0);assert.equal(r.added,0);assert.equal(r.signals[0].capAfter,7000);
  now+=30000;r=await captureCaps(snap(now,11000),env);assert.equal(r.added,0);
  now+=30000;r=await captureCaps(snap(now,12000),env);assert.equal(r.added,1);assert.equal(r.signals[0].beforeReceived,start);
  now+=1000;r=await captureCaps(snap(now,2500),env);assert.equal(r.added,1);assert.ok(r.signals.some(s=>s.direction==='fall'));
  const latest=r.signals;now+=1000;r=await captureCaps(snap(start+60000,8000),env);assert.equal(r.captured,0);assert.deepEqual(r.signals,latest);
  now+=301000;r=await captureCaps(snap(now,50000),env);assert.equal(r.added,0);assert.equal(r.compared,0);
});
test('stale, unknown and missing caps cannot substitute FDV or create observations',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start;t.mock.method(Date,'now',()=>now);
  for(const bad of [{...snap(),status:'stale'},snap(start+1000),snap(start-121000),{...snap(),provider:'other'}])assert.equal((await captureCaps(bad,env)).status,'unavailable');
  for(const cap of [null,0,-1,Infinity]){const s=snap(start,cap);s.pools[0].fdv=100000;const r=await captureCaps(s,env);assert.equal(r.eligible,0);}
  assert.equal(db.prepare('SELECT count(*) AS n FROM cap_observations').get().n,0);
});
test('radar obtains evidence server-side and a full 20-pool signal batch fits the free query budget',async t=>{
  const d=database();t.after(()=>d.db.close());let now=start;t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async()=>{const p=provider(now===start?4000:8000);p.data=Array.from({length:20},(_,i)=>{const v=structuredClone(p.data[0]),address='4'.repeat(30)+(i<10?'A':'B')+'123456789ABCDEFGHJKLM'[i];v.id='solana_'+address;v.attributes.address=address;return v;});return new Response(JSON.stringify(p));});
  await capRadar(request(),d.env,{chain:'solana',mode:'trending',pools:[token(1e9)]});now+=61000;d.reset();const r=await capRadar(request(),d.env,{chain:'solana',mode:'trending'});
  assert.equal(r.momentum.added,20);assert.ok(d.count()<=49);assert.equal(r.momentum.signals[0].capBefore,4000);
  await assert.rejects(capRadar(request(),d.env,{chain:'solana',mode:'https://evil.test'}),{status:400});
});
test('saved cap evidence links only to the exact paper identity and remains immutable',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start;t.mock.method(Date,'now',()=>now);
  await captureCaps(snap(),env);now+=61000;const r=await captureCaps(snap(now,8000),env),signal=r.signals[0];
  await assert.rejects(signalEvidence(env,signal.id,{chain:'solana',contract,pool:quote}),{status:400});
  t.mock.method(globalThis,'fetch',async()=>{const p=provider();p.data=p.data[0];return new Response(JSON.stringify(p));});
  const body={id:crypto.randomUUID(),chain:'solana',contract,pool,tag:'cap_momentum',signalId:signal.id,thesis:'Synthetic thesis recorded after a cap signal',outlay:5,feePct:1,fixedFee:.1,slippagePct:1,delaySeconds:60};
  let result=await paper(request('/api/paper'),env,'qa@example.test',body);assert.equal(result.trial.sourceSignal.id,signal.id);assert.equal(result.trial.entry,null);assert.equal(result.trial.createdAt,now);assert.equal(result.trial.sourceSignal.capBefore,4000);
  db.exec('DELETE FROM cap_signals');result=await paper(request('/api/paper'),env,'qa@example.test',body);assert.equal(result.trial.sourceSignal.capBefore,4000);
  await assert.rejects(paper(request('/api/paper'),env,'qa@example.test',{...body,signalId:'a'.repeat(64)}),{status:409});
  await assert.rejects(paper(request('/api/paper'),env,'qa@example.test',{...body,id:crypto.randomUUID()}),{status:409});
});
