import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {summarizeBuyers,discoverBuyers} from '../server/buyer-discovery.mjs';
// Synthetic identities, amounts and timestamps; never real wallet histories.
const now=Date.parse('2026-09-21T00:00:00Z'),hour=3600000,sol='3'.repeat(32),contract='4'.repeat(32),pool='5'.repeat(32),tx='6'.repeat(64);
const record=(id,patch={})=>({detected:now-1000,chain:'solana',contract,pool,provider:'GeckoTerminal',token:{symbol:'SYNTHETIC'},trade:{id,tx,sender:sol,side:'buy',usd:1000,time:new Date(now-hour).toISOString(),poolAgeSeconds:100,earlyPoolBuy:true},...patch});
const change=(id,trade,patch={})=>record(id,{...patch,trade:{...record(id).trade,...trade}});

test('buyer discovery deduplicates events and routed transactions without summing swap legs',()=>{
 const a=record('leg-a'),b=record('leg-b',{pool:'7'.repeat(32)}),c=change('other',{tx:'8'.repeat(64),usd:5000,time:new Date(now-2*hour).toISOString(),earlyPoolBuy:false});
 const d=summarizeBuyers([a,a,b,c],'24h',now);assert.equal(d.rows.length,1);const r=d.rows[0];
 assert.equal(r.swaps,3);assert.equal(r.transactions,2);assert.equal(r.pools,2);assert.equal(r.tokens,1);assert.equal(r.earlySwaps,2);assert.equal(r.largest.usd,5000);assert.equal(r.largest.tx,c.trade.tx);assert.equal(r.first,c.trade.time);assert.equal(r.last,a.trade.time);assert.equal(d.matchedSwaps,3);assert.equal(d.complete,false);assert.equal('totalUsd' in r,false);
});

test('window membership uses block time, respects boundaries and rejects unsupported month history',()=>{
 const records=[0,24,48,72,168,169].map((hours,i)=>change('event-'+i,{time:new Date(now-hours*hour).toISOString(),tx:String(i+1).repeat(64)}));
 for(const [w,n]of [['24h',2],['48h',3],['72h',4],['7d',5]])assert.equal(summarizeBuyers(records,w,now).matchedSwaps,n);
 assert.throws(()=>summarizeBuyers(records,'30d',now),{status:400});assert.throws(()=>summarizeBuyers(records,'toString',now),{status:400});
 assert.equal(summarizeBuyers([change('future',{time:new Date(now+1).toISOString()}),record('future-detection',{detected:now+1}),record('expired',{detected:now-169*hour})],'7d',now).rows.length,0);
});

test('identity checks separate chains and exclude missing values, sells and malformed evidence',()=>{
 const evm='0x'+'a'.repeat(40),etx='0x'+'b'.repeat(64),base={chain:'base',contract:evm,pool:evm};
 const records=[change('a',{sender:evm.toUpperCase().replace('0X','0x'),tx:etx.toUpperCase().replace('0X','0x')},base),change('b',{sender:evm,tx:etx},base),change('c',{sender:evm,tx:etx},{...base,chain:'ethereum'}),change('missing',{usd:null}),change('sell',{side:'sell'}),change('sender',{sender:null}),change('bad-tx',{tx:'<script>'}),change('zero',{usd:0}),record('wrong-source',{provider:'other'}),record('bad-pool',{pool:'invalid'})];
 const d=summarizeBuyers(records,'24h',now);assert.equal(d.rows.length,2);assert.equal(d.rows.find(r=>r.chain==='base').transactions,1);assert.equal(d.rows.find(r=>r.chain==='base').swaps,2);assert.ok(d.rows.every(r=>r.address===evm));assert.equal(d.excluded,7);
 assert.equal(summarizeBuyers([change('no-age',{poolAgeSeconds:null})],'24h',now).rows[0].earlySwaps,0);
});

test('saved buyer query is bounded, includes reviewed alerts, and needs no upstream requests',async t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(fs.readFileSync('drizzle/0004_goofy_machine_man.sql','utf8'));t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',()=>{throw Error('No upstream call is allowed')});
 const insert=db.prepare('INSERT INTO buy_alerts VALUES (?,?,?,?)');for(let i=0;i<510;i++)insert.run(String(i).padStart(4,'0'),now-i,1,JSON.stringify(record('event-'+i)));
 insert.run('future',now+1,0,JSON.stringify(record('future')));insert.run('expired',now-169*hour,0,JSON.stringify(record('expired')));
 const env={DB:{prepare(sql){
   assert.match(sql,/LIMIT 500$/);
   return{bind(...params){return{async run(){return{results:db.prepare(sql).all(...params)};}};}};
 }}};
 const d=await discoverBuyers(new Request('https://workspace.test/api/alerts/buyers?window=7d'),env);assert.equal(d.recordsRead,500);assert.equal(d.atRecordLimit,true);assert.equal(d.rows[0].swaps,500);assert.equal(d.rows[0].transactions,1);
 await assert.rejects(discoverBuyers(new Request('https://workspace.test/api/alerts/buyers?window=30d'),{}),{status:400});
 const plan=db.prepare('EXPLAIN QUERY PLAN SELECT payload,detected FROM buy_alerts WHERE detected>=? AND detected<=? ORDER BY detected DESC,id LIMIT 500').all(now-7*24*hour,now);assert.ok(plan.some(r=>r.detail.includes('buy_alerts_detected_idx')));
});
