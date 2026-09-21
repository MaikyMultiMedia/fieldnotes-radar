import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {assumptions,paperValue,quoteProblem,advancePaper,paperView,paperSummary,paper} from '../server/paper.mjs';

// Deliberately synthetic identities, prices and outcomes; no real trading records.
const contract='3'.repeat(32),pool='4'.repeat(32),quoteToken='5'.repeat(32);
const start=Date.parse('2026-09-01T00:00:00Z');
const costs={outlay:100,feePct:1,fixedFee:.1,slippagePct:2,delaySeconds:60};
function trial(){return{id:crypto.randomUUID(),chain:'solana',contract,pool,tag:'manual',thesis:'Synthetic QA thesis',assumptions:{...costs},createdAt:start,eligibleAt:start+60000,deadlineAt:start+360000,seed:{price:2,fetchedAt:new Date(start).toISOString()},status:'waiting',entry:null,lastMark:null,exit:null,marks:[],observations:0,highestObserved:null,lowestObserved:null};}
function snapshot(at=start+60000,price=2){return{status:'fresh',fetchedAt:new Date(at).toISOString(),poolDetails:{chain:'solana',contract,pool,price,liquidity:100000,sourceUrl:'https://www.geckoterminal.com/solana/pools/'+pool}};}
function database(){
  const db=new DatabaseSync(':memory:');
  for(const name of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
  function prepare(sql,params=[]){return{bind(...v){return prepare(sql,v)},async first(){return db.prepare(sql).get(...params)||null},async run(){if(/^SELECT|RETURNING/i.test(sql))return{results:db.prepare(sql).all(...params)};return{results:[],meta:{changes:Number(db.prepare(sql).run(...params).changes)}}}};}
  return{db,env:{DB:{prepare,async batch(ps){db.exec('BEGIN');try{const result=[];for(const p of ps)result.push(await p.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}}};
}
function provider(price=2){return{data:{id:'solana_'+pool,type:'pool',attributes:{address:pool,name:'SYNTHETIC / USD',base_token_price_usd:String(price),quote_token_price_usd:'1',reserve_in_usd:'100000',market_cap_usd:'200000',volume_usd:{h24:'60000'}},relationships:{base_token:{data:{id:'solana_'+contract}},quote_token:{data:{id:'solana_'+quoteToken}},dex:{data:{id:'synthetic-dex'}}}},included:[{id:'solana_'+contract,type:'token',attributes:{address:contract,name:'Synthetic QA token',symbol:'SYNTHETIC'}},{id:'solana_'+quoteToken,type:'token',attributes:{address:quoteToken,name:'Synthetic quote',symbol:'USD'}}]};}
const req=(path='/api/paper',method='POST')=>new Request('https://workspace.test'+path,{method});
const input=()=>({...costs,id:crypto.randomUUID(),chain:'solana',contract,pool,tag:'manual',thesis:'Synthetic immutable starting thesis'});

test('paper assumptions reject malformed inputs and impossible entry budgets',()=>{
  assert.deepEqual(assumptions(costs),costs);
  for(const bad of [{outlay:0},{outlay:Infinity},{outlay:''},{feePct:11},{fixedFee:-1},{slippagePct:31},{delaySeconds:0},{delaySeconds:61},{outlay:1,fixedFee:1}])assert.throws(()=>assumptions({...costs,...bad}));
  assert.equal(paperValue(0,1,costs),null);assert.equal(paperValue(1,null,costs),null);assert.equal(paperValue(Number.MAX_VALUE,2,costs),null);
});
test('entry requires a later snapshot within the precommitted delay window',()=>{
  const t=trial();
  assert.deepEqual(advancePaper(t,snapshot(start),start+30000),t);
  assert.equal(advancePaper(t,snapshot(start),start+60000).status,'waiting');
  assert.equal(advancePaper(t,snapshot(start+59000),start+60000).status,'waiting');
  const entered=advancePaper(t,snapshot(start+65000,2.1),start+65000);
  assert.equal(entered.status,'open');assert.equal(entered.entry.delaySeconds,65);assert.ok(Math.abs(entered.entry.driftPct-5)<1e-10);
  assert.equal(t.status,'waiting');assert.equal(t.entry,null);
  const missed=advancePaper(t,snapshot(start+400000),start+400000);
  assert.equal(missed.status,'missed');assert.equal(missed.entry,null);assert.equal(missed.observations,0);
});
test('quotes require exact identity, current receipt time and usable price/liquidity',()=>{
  const t=trial(),now=start+60000;
  for(const bad of [null,{...snapshot(),status:'stale'},{...snapshot(),fetchedAt:'bad'},snapshot(now+1),snapshot(now-120001)])assert.ok(quoteProblem(bad,t,now));
  for(const bad of [{chain:'base'},{contract:quoteToken},{pool:contract},{price:0},{price:null},{price:NaN},{liquidity:0},{liquidity:null},{liquidity:9999}])assert.ok(quoteProblem({...snapshot(),poolDetails:{...snapshot().poolDetails,...bad}},t,now));
  assert.equal(quoteProblem({...snapshot(),poolDetails:{...snapshot().poolDetails,liquidity:10000}},t,now),null);
  const noPrice=advancePaper(t,snapshot(now,0),now);assert.equal(noPrice.entry,null);assert.equal(noPrice.lastMark,null);assert.equal(noPrice.lastCheck.outcome,'unavailable');
});
test('paper returns include adverse entry/exit prices and both sets of fees',()=>{
  const t=advancePaper(trial(),snapshot(),start+60000);
  const expectedQuantity=(100*.99-.1)/(2*1.02),expectedProceeds=expectedQuantity*2*.98*.99-.1;
  assert.ok(Math.abs(t.entry.quantity-expectedQuantity)<1e-10);
  assert.ok(Math.abs(t.lastMark.proceeds-expectedProceeds)<1e-10);assert.ok(t.lastMark.pnl<0);
  assert.equal(t.lastMark.pnl,t.lastMark.proceeds-100);
  const next=advancePaper(t,snapshot(start+120000,3),start+120000);
  assert.ok(next.lastMark.pnl>t.lastMark.pnl);
  const stale=advancePaper(next,{...snapshot(start+130000),status:'stale'},start+130000);
  assert.equal(stale.lastMark.pnl,next.lastMark.pnl);assert.equal(paperView(stale,start+130000).currentMark,null);
});
test('observations deduplicate, retain bounded evidence and preserve sampled extrema',()=>{
  let t=advancePaper(trial(),snapshot(),start+60000);
  t=advancePaper(t,snapshot(),start+61000);assert.equal(t.observations,1);
  for(let i=2;i<=130;i++)t=advancePaper(t,snapshot(start+i*60000,i===2?4:2),start+i*60000);
  assert.equal(t.observations,130);assert.equal(t.marks.length,120);assert.equal(t.marks[0].at,new Date(start+60000).toISOString());
  assert.ok(t.highestObserved>Math.max(...t.marks.map(m=>m.proceeds)));
  const count=t.observations;t=advancePaper(t,snapshot(start+120000),start+130*60000);assert.equal(t.observations,count);
  assert.equal(paperView(t,start+132*60000+1).currentMark,null);
  const closed={...t,status:'closed',exit:t.lastMark};assert.equal(paperView(closed,start+99999999).markStatus,'closed');assert.equal(paperView(closed,start+99999999).exit.pnl,t.lastMark.pnl);
});
test('summary distinguishes no evidence, losses, missed entries and cancelled trials',()=>{
  assert.equal(paperSummary([]).closedPnl,null);assert.equal(paperSummary([]).winRate,null);
  const rows=[{status:'closed',tag:'manual',exit:{pnl:5,returnPct:5}},{status:'closed',tag:'manual',exit:{pnl:-10,returnPct:-10}},{status:'open',tag:'manual'},{status:'missed',tag:'shortlist'},{status:'cancelled',tag:'large_buy'}];
  const s=paperSummary(rows);assert.equal(s.total,5);assert.equal(s.closed,2);assert.equal(s.closedPnl,-5);assert.equal(s.winRate,50);assert.equal(s.byTag[0].meanReturnPct,-2.5);assert.equal(s.byTag[1].pnl,null);assert.equal(s.byTag[1].missed,1);assert.equal(s.byTag[2].cancelled,1);
  assert.equal(paperView(trial(),start+360001).status,'missed');
});
test('private journal persists delayed entries, idempotency, revisions and explicit closure',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start,price=2,calls=0;
  t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async url=>{assert.ok(String(url).startsWith('https://api.geckoterminal.com/api/v2/'));calls++;return new Response(JSON.stringify(provider(price)));});
  const body=input(),created=(await paper(req(),env,'first@example.test',body)).trial;
  assert.equal(created.status,'waiting');assert.equal(created.entry,null);assert.equal(calls,1);
  assert.equal((await paper(req(),env,'second@example.test',body)).trial.id,created.id);assert.equal(calls,1);
  await assert.rejects(paper(req(),env,'first@example.test',{...body,thesis:'Changed'}),{status:409});
  await assert.rejects(paper(req('/api/paper/'+created.id+'/close'),env,'first@example.test',{revision:1}),{status:409});
  now+=61000;price=2.1;await paper(req('/api/paper/observe'),env,'second@example.test');
  let record=(await paper(req('/api/paper','GET'),env,'second@example.test')).trials[0];
  assert.equal(record.status,'open');assert.equal(record.observations,1);assert.equal(record.author,'first@example.test');assert.equal(record.entry.delaySeconds,61);
  await assert.rejects(paper(req('/api/paper/'+record.id+'/reflection'),env,'first@example.test',{revision:1,reflection:'Stale edit'}),{status:409});
  record=(await paper(req('/api/paper/'+record.id+'/reflection'),env,'second@example.test',{revision:record.revision,reflection:'Synthetic takeaway',thesis:'cannot replace original',feePct:0})).trial;
  assert.equal(record.thesis,body.thesis);assert.equal(record.assumptions.feePct,1);assert.equal(record.reflection,'Synthetic takeaway');
  record=(await paper(req('/api/paper/'+record.id+'/close'),env,'second@example.test',{revision:record.revision})).trial;
  assert.equal(record.status,'closed');assert.equal(record.exit.closedBy,'second@example.test');assert.ok(Number.isFinite(record.exit.pnl));
  assert.equal((await paper(req('/api/paper/'+record.id+'/close'),env,'second@example.test',{revision:1})).trial.revision,record.revision);
  await assert.rejects(paper(req('/api/paper/'+record.id+'/cancel'),env,'first@example.test',{revision:record.revision,reason:'Synthetic'}),{status:409});
  assert.ok(db.prepare('SELECT count(*) AS n FROM activity').get().n>=4);
});
test('expired entries persist without retrospective fills; cancellation retains evidence',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start,calls=0;
  t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(JSON.stringify(provider()));});
  const first=(await paper(req(),env,'first@example.test',input())).trial;
  const second=(await paper(req(),env,'first@example.test',input())).trial;
  await assert.rejects(paper(req('/api/paper/'+second.id+'/cancel'),env,'first@example.test',{revision:1,reason:''}),{status:400});
  await paper(req('/api/paper/'+second.id+'/cancel'),env,'first@example.test',{revision:1,reason:'Synthetic cancellation'});
  now=start+360001;const priorCalls=calls;
  await paper(req('/api/paper/observe'),env,'first@example.test');assert.equal(calls,priorCalls);
  const rows=(await paper(req('/api/paper','GET'),env,'first@example.test')).trials;
  const missed=rows.find(x=>x.id===first.id);assert.equal(missed.status,'missed');assert.equal(missed.lastCheck.outcome,'missed');assert.equal(missed.entry,null);assert.equal(missed.revision,2);
  const summary=paperSummary(rows);assert.equal(summary.total,2);assert.equal(summary.missed,1);assert.equal(summary.cancelled,1);assert.equal(summary.closedPnl,null);
});
test('unavailable live quotes cannot create a closed result',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start;
  t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify(provider())));
  const created=(await paper(req(),env,'first@example.test',input())).trial;
  now+=61000;await paper(req('/api/paper/observe'),env,'first@example.test');
  const open=(await paper(req('/api/paper','GET'),env,'first@example.test')).trials[0];
  now+=61000;t.mock.method(globalThis,'fetch',async()=>{throw Error('offline');});
  await assert.rejects(paper(req('/api/paper/'+created.id+'/close'),env,'first@example.test',{revision:open.revision}),{status:422});
  const kept=(await paper(req('/api/paper','GET'),env,'first@example.test')).trials[0];assert.equal(kept.status,'open');assert.equal(kept.exit,null);
});

