import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {alertSettings,alertCandidates,buyAlerts} from '../server/buy-alerts.mjs';
// Synthetic public identities and trades only. No real wallet history.
const start=Date.parse('2026-09-01T00:00:00Z'),contract='3'.repeat(32),pool='4'.repeat(32),quote='5'.repeat(32),sender='6'.repeat(32),tx='7'.repeat(64);
const settings={chain:'solana',contract,pool,minUsd:1000,early:false,followed:false};
const req=(path='/api/alerts/rules',method='POST')=>new Request('https://workspace.test'+path,{method});
function database(){const db=new DatabaseSync(':memory:');for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+f,'utf8'));function prepare(sql,params=[]){return{bind(...v){return prepare(sql,v)},async first(){return db.prepare(sql).get(...params)||null},async run(){if(/^SELECT|RETURNING/i.test(sql))return{results:db.prepare(sql).all(...params)};return{results:[],meta:{changes:Number(db.prepare(sql).run(...params).changes)}}}};}return{db,env:{DB:{prepare,async batch(ps){db.exec('BEGIN');try{const r=[];for(const p of ps)r.push(await p.run());db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}}};}
function provider(at=start){return{data:{id:'solana_'+pool,type:'pool',attributes:{address:pool,name:'SYNTHETIC / USD',pool_created_at:new Date(start-60000).toISOString(),base_token_price_usd:'2'},relationships:{base_token:{data:{id:'solana_'+contract}},quote_token:{data:{id:'solana_'+quote}}}},included:[{id:'solana_'+contract,type:'token',attributes:{address:contract,name:'Synthetic token',symbol:'TEST'}},{id:'solana_'+quote,type:'token',attributes:{address:quote,symbol:'USD'}}]};}
function trade(id='new',at=start+1000,usd='2000'){return{id:'solana_'+id,type:'trade',attributes:{block_timestamp:new Date(at).toISOString(),tx_hash:tx,tx_from_address:sender,from_token_address:quote,to_token_address:contract,volume_in_usd:usd,to_token_amount:'1000'}};}
function snapshot(){return{...settings,status:'fresh',detailsStatus:'fresh',fetchedAt:new Date(start+2000).toISOString(),detailsFetchedAt:new Date(start+2000).toISOString(),poolDetails:{...settings},trades:[{id:'synthetic_event',side:'buy',time:new Date(start+1000).toISOString(),usd:2000,sender,earlyPoolBuy:true}]};}
test('alert filters require exact identities, fresh samples and forward evidence',()=>{
  const rule={...settings,updated:start},s=snapshot();assert.equal(alertCandidates(rule,s,[],start+2000).length,1);
  for(const input of [{minUsd:0},{minUsd:'1000'},{minUsd:Infinity},{early:'false'},{chain:'fake'},{pool:'SYMBOL'}])assert.throws(()=>alertSettings({...settings,...input}));
  for(const change of [{status:'stale'},{detailsStatus:'stale'},{chain:'base'},{pool:quote},{contract:quote},{fetchedAt:new Date(start-200000).toISOString()},{fetchedAt:new Date(start+3000).toISOString()}])assert.equal(alertCandidates(rule,{...s,...change},[],start+2000).length,0);
  for(const change of [{side:'sell'},{usd:null},{usd:999},{time:new Date(start-1).toISOString()},{time:new Date(start+3000).toISOString()}])assert.equal(alertCandidates(rule,{...s,trades:[{...s.trades[0],...change}]},[],start+2000).length,0);
  assert.equal(alertCandidates({...rule,early:true},{...s,trades:[{...s.trades[0],earlyPoolBuy:false}]},[],start+2000).length,0);
  assert.equal(alertCandidates({...rule,followed:true},s,[{chain:'base',address:sender}],start+2000).length,0);
  assert.equal(alertCandidates({...rule,followed:true},s,[{chain:'solana',address:sender}],start+2000).length,1);
});
test('saved alerts persist, reject historical backfill, deduplicate events and retain reviewed status',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start,calls=0;
  t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async url=>{calls++;return new Response(JSON.stringify(String(url).endsWith('/trades')?{data:[trade('old',start-1000),trade(),trade('same-tx-other-event'),trade('unknown',start+1000,'unknown')]}:provider()));});
  let data=await buyAlerts(req(),env,'qa@example.test',settings);assert.equal(data.rules.length,1);assert.equal(data.alerts.length,0);
  now+=2000;data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.added,2);assert.equal(data.unread,2);assert.equal(data.alerts[0].latencySeconds,1);assert.equal(data.rules[0].lastScan.unknownUsd,1);assert.equal(data.rules[0].lastScan.recentIds,undefined);
  const callCount=calls;data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.scanned,false);assert.equal(calls,callCount);
  const saved=data.alerts[0];await buyAlerts(req('/api/alerts/seen/'+saved.id),env,'qa@example.test');now+=61000;data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.added,0);assert.equal(data.total,2);assert.equal(data.unread,1);assert.equal(data.alerts.find(a=>a.id===saved.id).detected,saved.detected);
  // Archive pruning cannot re-notify events in the last sampled set.
  db.exec('DELETE FROM buy_alerts');now+=61000;data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.added,0);
  const rule=data.rules[0];await assert.rejects(buyAlerts(req(),env,'qa@example.test',{...settings,revision:0}),{status:409});
  now+=1000;data=await buyAlerts(req(),env,'qa@example.test',{...settings,revision:rule.revision,minUsd:1500});assert.equal(data.rules[0].revision,2);assert.equal(data.rules[0].lastScan,null);
  data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.added,0);
  await assert.rejects(buyAlerts(req('/api/alerts/rules/'+rule.id),env,'qa@example.test',{revision:1}),{status:409});
  data=await buyAlerts(req('/api/alerts/rules/'+rule.id),env,'qa@example.test',{revision:2});assert.equal(data.rules.length,0);
});
test('stale provider failures cannot create new alerts and rule changes during a scan win',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start,failed=false,changeRule=false;
  t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async url=>{if(failed)return new Response('unavailable',{status:503});if(String(url).endsWith('/trades')){if(changeRule)db.exec('UPDATE buy_alert_rules SET revision=revision+1');return new Response(JSON.stringify({data:[trade()]}));}return new Response(JSON.stringify(provider()));});
  let data=await buyAlerts(req(),env,'qa@example.test',settings);now+=2000;changeRule=true;data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.added,0);assert.equal(data.total,0);assert.equal(data.rules[0].lastScan,null);
  now+=61000;failed=true;data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.added,0);assert.equal(data.total,0);assert.equal(data.rules[0].lastScan.status,'unavailable');
});
test('three-rule bound, rotation, retention and unread queries work across the shared inbox',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start;
  t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async url=>{
    if(String(url).endsWith('/trades'))return new Response(JSON.stringify({data:[]}));
    const p=new URL(url).pathname.split('/').pop(),data=provider();data.data.id='solana_'+p;data.data.attributes.address=p;return new Response(JSON.stringify(data));
  });
  for(const p of ['4','8','9'])await buyAlerts(req(),env,'qa@example.test',{...settings,pool:p.repeat(32)});
  await assert.rejects(buyAlerts(req(),env,'qa@example.test',{...settings,pool:'A'.repeat(32)}),{status:409});
  now+=2000;let data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.rules.filter(r=>r.checked).length,1);
  data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.rules.filter(r=>r.checked).length,2);
  data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.rules.filter(r=>r.checked).length,3);
  assert.equal((await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test')).scanned,false);
  const insert=db.prepare('INSERT INTO buy_alerts VALUES (?,?,?,?)');
  for(let i=0;i<510;i++)insert.run(String(i),now-i,i<105?1:0,JSON.stringify({synthetic:true}));
  data=await buyAlerts(req('/api/alerts?unread=1','GET'),env,'qa@example.test');assert.equal(data.alerts.length,100);assert.ok(data.alerts.every(a=>!a.seen));assert.equal(data.unread,405);
  now+=61000;await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(db.prepare('SELECT count(*) AS n FROM buy_alerts').get().n,500);
  now+=8*86400000;data=await buyAlerts(req('/api/alerts','GET'),env,'qa@example.test');assert.equal(data.total,0);assert.equal(data.alerts.length,0);
});
test('a full 300-match sample stays within free database query and binding limits',async t=>{
  const {db,env}=database();t.after(()=>db.close());let now=start,queries=0;const original=env.DB.prepare;
  env.DB.prepare=(sql)=>{queries++;assert.ok(queries<=50);assert.ok((sql.match(/\?/g)||[]).length<=100);return original(sql);};
  t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async url=>new Response(JSON.stringify(String(url).endsWith('/trades')?{data:Array.from({length:300},(_,i)=>trade('synthetic_'+i))}:provider())));
  await buyAlerts(req(),env,'qa@example.test',settings);now+=61000;queries=0;let data=await buyAlerts(req('/api/alerts/scan'),env,'qa@example.test');assert.equal(data.added,300);assert.equal(data.total,300);assert.ok(queries<30);
});
