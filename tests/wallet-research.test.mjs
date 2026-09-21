import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {normalizeWalletProfit,walletResearch} from '../server/wallet-research.mjs';
const wallet='3'.repeat(32),evm='0x'+'a'.repeat(40);
const req=(window='24h',chain='solana',owner=wallet)=>new Request('https://workspace.test/api/intelligence/wallet?'+new URLSearchParams({window,chain,address:owner,notes:'never-forward'}));
const payload=(owner=wallet,extra={})=>({code:0,data:{list:[{wallet_address:owner,realized_profit:'-12.50',realized_profit_cost:'100',buy:'10',sell:5,unrealized_profit:'0',private_account:'never-store',...extra}]}});
function database(t){const db=new DatabaseSync(':memory:');for(const name of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));t.after(()=>db.close());
  function prepare(sql,params=[]){return{bind(...v){return prepare(sql,v);},async first(){return db.prepare(sql).get(...params)||null;},async run(){if(/RETURNING|^SELECT/i.test(sql))return{results:db.prepare(sql).all(...params)};return{results:[],meta:{changes:Number(db.prepare(sql).run(...params).changes)}};}};}
  return{db,env:{GMGN_API_KEY:'synthetic-test-key',DB:{prepare,async batch(items){const results=[];for(const p of items)results.push(await p.run());return results;}}}};
}

test('wallet reports make no request without a key and reject unsupported periods and invalid identity',async t=>{
  let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('unexpected');});
  for(const w of ['24h','7d','30d']){const result=await walletResearch(req(w),{});assert.equal(result.status,'not_configured');assert.equal(result.report,null);assert.equal(result.fetchedAt,null);}
  for(const w of ['48h','72h','all','bad'])await assert.rejects(walletResearch(req(w),{}),{status:400});
  await assert.rejects(walletResearch(req('24h','solana','bad'),{}),{status:400});assert.equal(calls,0);
});

test('wallet normalization preserves losses, zero and missing values, and matches the requested address',()=>{
  const r=normalizeWalletProfit(payload(),'solana',wallet);assert.equal(r.realizedPnl,-12.5);assert.equal(r.unrealizedPnl,0);assert.equal(r.realizedReturn,-.125);assert.equal(r.buyCount,10);assert.ok(!JSON.stringify(r).includes('never-store'));
  for(const value of [null,undefined,'',' ','NaN',false,{},'0x10']){const r=normalizeWalletProfit(payload(wallet,{realized_profit:value,buy:value}),'solana',wallet);assert.equal(r.realizedPnl,null);assert.equal(r.buyCount,null);assert.equal(r.realizedReturn,null);}
  assert.equal(normalizeWalletProfit(payload(wallet,{realized_profit:'0',realized_profit_cost:0}),'solana',wallet).realizedReturn,null);
  assert.equal(normalizeWalletProfit(payload(wallet,{buy:-1,sell:1.5}),'solana',wallet).sellCount,null);
  assert.equal(normalizeWalletProfit({code:0,data:{list:[]}},'solana',wallet),null);
  assert.throws(()=>normalizeWalletProfit(payload('4'.repeat(32)),'solana',wallet));
  assert.throws(()=>normalizeWalletProfit({code:0,data:{list:[payload().data.list[0],payload().data.list[0]]}},'solana',wallet));
  assert.equal(normalizeWalletProfit(payload(evm.toUpperCase().replace('0X','0x')),'base',evm).realizedPnl,-12.5);
});

test('fixed read-only endpoint maps networks and periods without forwarding notes, cookies or signing headers',async t=>{
  const {env}=database(t);let now=1800000000000,expected;t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async(url,options)=>{const u=new URL(url),body=JSON.parse(options.body);assert.equal(u.origin,'https://openapi.gmgn.ai');assert.equal(u.pathname,'/v1/user/wallet_profits');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.deepEqual(body,{chain:expected[1],period:expected[3],wallet_addresses:[expected[4]]});assert.equal(options.headers['X-APIKEY'],'synthetic-test-key');assert.equal(options.headers['X-Signature'],undefined);assert.equal(options.headers.Cookie,undefined);assert.ok(!String(url).includes('notes'));assert.equal(Number(u.searchParams.get('timestamp')),Math.floor(now/1000));return Response.json(payload(expected[4]));});
  for(expected of [['solana','sol','24h','1d',wallet],['ethereum','eth','7d','7d',evm],['base','base','30d','30d',evm],['bsc','bsc','24h','1d',evm]]){const r=await walletResearch(req(expected[2],expected[0],expected[4]),env);assert.equal(r.status,'fresh');assert.equal(r.feesVerified,false);assert.equal(r.transfersVerified,false);assert.equal(r.sourceObservedAt,null);assert.ok(!JSON.stringify(r).includes('synthetic-test-key'));now+=61000;}
});

test('cache and stale fallback keep the original receipt time and stop after the one-hour limit',async t=>{
  const {env,db}=database(t);let now=1800000000000,calls=0;t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(payload());});
  const first=await walletResearch(req(),env);await walletResearch(req(),env);assert.equal(calls,1);
  now+=301000;t.mock.method(globalThis,'fetch',async()=>{throw Error('secret upstream body');});const stale=await walletResearch(req(),env);assert.equal(stale.status,'stale');assert.equal(stale.fetchedAt,first.fetchedAt);assert.ok(!stale.error.includes('secret'));
  now+=3600000;await assert.rejects(walletResearch(req(),env),{status:502});
  db.prepare('UPDATE market_cache SET fetched=?').run(Math.floor(now/1000)+1000);now+=3000;await assert.rejects(walletResearch(req(),env),{status:502});
});

test('shared spacing and provider cooldown prevent immediate retries, including non-JSON 429 responses',async t=>{
  const {env,db}=database(t);let now=1800000000000,calls=0;t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json(payload());});
  await walletResearch(req(),env);await assert.rejects(walletResearch(req('7d'),env),{status:429});assert.equal(calls,1);now+=2000;await walletResearch(req('7d'),env);assert.equal(calls,2);
  now+=2000;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('rate limit',{status:429,headers:{'x-ratelimit-reset':String(Math.floor(now/1000)+600)}});});await assert.rejects(walletResearch(req('30d'),env),{status:429});
  assert.equal(db.prepare("SELECT blocked_until FROM market_budget WHERE id='gmgn_wallet'").get().blocked_until,Math.floor(now/1000)+600);
  now+=3000;await assert.rejects(walletResearch(req('30d'),env),{status:429});assert.equal(calls,3);
});

test('upstream errors and oversized reports never expose provider bodies or become usable results',async t=>{
  const {env}=database(t);let now=1800000000000;t.mock.method(Date,'now',()=>now);
  for(const response of [new Response('private-provider-body',{status:403}),new Response('x'.repeat(350001)),Response.json({code:0,data:{list:[{wallet_address:'wrong'}]}})]){t.mock.method(globalThis,'fetch',async()=>response);await assert.rejects(walletResearch(req(),env),e=>!e.message.includes('private-provider'));now+=61000;}
});
