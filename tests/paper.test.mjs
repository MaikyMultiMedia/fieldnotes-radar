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



test('fixed exits start at observed entry and accept only a later usable snapshot inside their window',()=>{
 for(const holdSeconds of [300,900,3600]){
  const t=trial();t.assumptions.holdSeconds=holdSeconds;
  const entered=advancePaper(t,snapshot(start+65000),start+65000),due=start+65000+holdSeconds*1000;
  assert.equal(entered.exitDueAt,due);assert.equal(entered.exitDeadlineAt,due+300000);
  const before=advancePaper(entered,snapshot(due-1,3),due);assert.equal(before.status,'open');assert.equal(before.exit,null);
  for(const q of [null,{...snapshot(due),status:'stale'},snapshot(due,0)])assert.equal(advancePaper(before,q,due).exit,null);
  const closed=advancePaper(before,snapshot(due+60000,3),due+60000);
  assert.equal(closed.status,'closed');assert.equal(closed.exit.method,'planned');assert.equal(closed.exit.delaySeconds,60);assert.equal(closed.exit.holdingSeconds,holdSeconds+60);assert.equal(closed.exit.targetAt,new Date(due).toISOString());assert.equal(closed.exit.closedBy,null);
  assert.deepEqual(advancePaper(closed,snapshot(due+120000,100),due+120000),closed);
  assert.equal(advancePaper(entered,snapshot(due+300000,3),due+300000).status,'closed');
  const late=advancePaper(entered,snapshot(due+300000,3),due+300001);assert.equal(late.status,'missed_exit');assert.equal(late.exit,null);assert.equal(late.observations,1);assert.equal(paperView(late,due+300001).currentMark,null);
 }
 for(const holdSeconds of [null,'',1,-1,60,301,NaN,Infinity,'5m'])assert.throws(()=>assumptions({...costs,holdSeconds}));
 assert.deepEqual(assumptions({...costs,holdSeconds:'0'}),costs);assert.equal(assumptions({...costs,holdSeconds:'900'}).holdSeconds,900);
});

test('exit-plan groups keep missing and cancelled trials in their denominators and separate manual exits',()=>{
 const rows=[
  {status:'closed',assumptions:{holdSeconds:300},exit:{pnl:1,returnPct:10}},
  {status:'closed',assumptions:{holdSeconds:300},exit:{pnl:-2,returnPct:-20}},
  {status:'closed',assumptions:{holdSeconds:300},exit:{pnl:100,returnPct:1000}},
  {status:'missed_exit',assumptions:{holdSeconds:300},lastMark:{pnl:500}},
  {status:'missed',assumptions:{holdSeconds:300}},
  {status:'cancelled',assumptions:{holdSeconds:300}},
  {status:'open',assumptions:{holdSeconds:300}},
  {status:'closed',assumptions:{},exit:{pnl:5,returnPct:50}},
 ];
 const s=paperSummary(rows),g=s.byPlan.find(g=>g.holdSeconds===300);
 assert.equal(g.total,7);assert.equal(g.closed,3);assert.equal(g.active,1);assert.equal(g.missedEntry,1);assert.equal(g.missedExit,1);assert.equal(g.cancelled,1);assert.equal(g.medianReturnPct,10);assert.equal(g.meanReturnPct,330);
 assert.equal(s.missed,2);assert.equal(s.byPlan[0].closed,1);assert.equal(s.byPlan.find(g=>g.holdSeconds===900).medianReturnPct,null);
});

test('planned exit persists, cannot be manually closed or changed, and retries retain the same record',async t=>{
 const {db,env}=database();t.after(()=>db.close());let now=start,price=2;
 t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>Response.json(provider(price)));
 const body={...input(),holdSeconds:300},created=(await paper(req(),env,'one@example.test',body)).trial;
 assert.equal(created.assumptions.holdSeconds,300);
 await assert.rejects(paper(req(),env,'one@example.test',{...body,holdSeconds:900}),{status:409});
 now+=61000;await paper(req('/api/paper/observe'),env,'two@example.test');
 let record=(await paper(req('/api/paper','GET'),env,'two@example.test')).trials[0];
 await assert.rejects(paper(req('/api/paper/'+record.id+'/close'),env,'two@example.test',{revision:record.revision}),{status:409});
 const changed=(await paper(req('/api/paper/'+record.id+'/reflection'),env,'two@example.test',{revision:record.revision,reflection:'Synthetic note',holdSeconds:0})).trial;assert.equal(changed.assumptions.holdSeconds,300);
 now=record.exitDueAt+61000;price=3;await paper(req('/api/paper/observe'),env,'two@example.test');
 record=(await paper(req('/api/paper','GET'),env,'two@example.test')).trials[0];assert.equal(record.status,'closed');assert.equal(record.exit.method,'planned');assert.equal(record.exit.delaySeconds,61);assert.ok(record.exit.pnl>0);
 assert.equal((await paper(req(),env,'one@example.test',body)).trial.revision,record.revision);
 assert.equal(db.prepare("SELECT count(*) AS n FROM activity WHERE action='recorded planned paper exit'").get().n,1);
});

test('missed planned exits persist without fetching historical replacements and do not become cancellations',async t=>{
 const {db,env}=database();t.after(()=>db.close());let now=start,calls=0;
 t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(provider());});
 const first=(await paper(req(),env,'one@example.test',{...input(),holdSeconds:300})).trial;
 const second=(await paper(req(),env,'one@example.test',{...input(),holdSeconds:300})).trial;
 now+=61000;await paper(req('/api/paper/observe'),env,'one@example.test');
 let rows=(await paper(req('/api/paper','GET'),env,'one@example.test')).trials;
 now=rows[0].exitDeadlineAt+1;const before=calls;
 const virtual=(await paper(req('/api/paper','GET'),env,'one@example.test')).trials;assert.ok(virtual.every(r=>r.status==='missed_exit'&&r.currentMark===null&&r.exit===null));
 const cancel=rows.find(r=>r.id===second.id);const ended=(await paper(req('/api/paper/'+second.id+'/cancel'),env,'one@example.test',{revision:cancel.revision,reason:'Synthetic missed window'})).trial;assert.equal(ended.status,'missed_exit');
 const observed=await paper(req('/api/paper/observe'),env,'one@example.test');assert.equal(observed.missedExits,1);assert.equal(calls,before);
 const saved=JSON.parse(db.prepare('SELECT payload FROM paper_trials WHERE id=?').get(first.id).payload);assert.equal(saved.status,'missed_exit');assert.equal(saved.exit,null);
});

test('saved buy evidence is exact, server-owned and immutable after alert retention expires',async t=>{
 const {db,env}=database();t.after(()=>db.close());let now=start,calls=0;
 t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(provider());});
 const id='a'.repeat(64),evidence={chain:'solana',contract,pool,provider:'GeckoTerminal',token:{chain:'solana',contract,pool,sourceUrl:'https://www.geckoterminal.com/solana/pools/'+pool},trade:{side:'buy',usd:1500,sender:'6'.repeat(32),tx:'7'.repeat(88),id:'synthetic-event',time:new Date(start-30000).toISOString(),earlyPoolBuy:true,poolAgeSeconds:100},fetchedAt:new Date(start).toISOString(),rule:{minUsd:1000,early:true,followed:false},coverage:{complete:false}};
 db.prepare('INSERT INTO buy_alerts (id,detected,seen,payload) VALUES (?,?,0,?)').run(id,start,JSON.stringify(evidence));
 await assert.rejects(paper(req(),env,'one@example.test',{...input(),tag:'large_buy',contract:quoteToken,buyAlertId:id}),{status:400});
 await assert.rejects(paper(req(),env,'one@example.test',{...input(),buyAlertId:id}),{status:400});assert.equal(calls,0);
 const body={...input(),tag:'large_buy',buyAlertId:id,holdSeconds:300,sourceBuy:{trade:{usd:1e9}}},created=(await paper(req(),env,'one@example.test',body)).trial;
 assert.equal(created.sourceBuy.trade.usd,1500);assert.equal(created.sourceBuy.trade.sender,evidence.trade.sender);assert.equal(created.entry,null);assert.equal(created.seed.fetchedAt,new Date(now).toISOString());
 db.prepare('DELETE FROM buy_alerts WHERE id=?').run(id);now+=8*86400000;
 const retry=(await paper(req(),env,'one@example.test',body)).trial;assert.equal(retry.sourceBuy.trade.usd,1500);assert.equal(calls,1);
 await assert.rejects(paper(req(),env,'one@example.test',{...body,buyAlertId:'b'.repeat(64)}),{status:409});
 await assert.rejects(paper(req(),env,'one@example.test',{...body,id:crypto.randomUUID()}),{status:409});
});


test('due planned exits take sampling priority over ordinary marks while the four-trial bound holds',async t=>{
 const {db,env}=database();t.after(()=>db.close());const now=start+600000;t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>Response.json(provider()));
 for(let i=0;i<6;i++){
  const initial=trial();if(i===5)initial.assumptions.holdSeconds=300;
  const opened=advancePaper(initial,snapshot(start+60000),start+60000);
  if(i===5){opened.exitDueAt=now-1000;opened.exitDeadlineAt=now+299000;}
  db.prepare('INSERT INTO paper_trials (id,chain,contract,pool,status,author,created,eligible,updated,revision,payload) VALUES (?,?,?,?,?,?,?,?,?,1,?)').run(opened.id,'solana',contract,pool,'open','qa@example.test',start,start+60000,start+i,JSON.stringify(opened));
 }
 const observed=await paper(req('/api/paper/observe'),env,'qa@example.test');assert.equal(observed.results.length,4);
 const rows=(await paper(req('/api/paper','GET'),env,'qa@example.test')).trials;
 assert.equal(rows.find(r=>r.assumptions.holdSeconds===300).status,'closed');assert.equal(rows.filter(r=>r.status==='open').length,5);
});
