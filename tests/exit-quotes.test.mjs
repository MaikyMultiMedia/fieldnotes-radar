import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {exitQuote,normalizeMint,normalizeQuote,tokenUnits,tokenAmount,USDC} from '../server/exit-quotes.mjs';
// Synthetic quote data; never a live observation or execution fixture.
const mint='3'.repeat(32),pool='4'.repeat(32),mid='5'.repeat(32);
const metadata=()=>({success:true,data:[{chainId:101,address:mint,decimals:9,private:'discard'}]});
const quote=(extra={})=>({success:true,data:{swapType:'BaseIn',inputMint:mint,inputAmount:'1000000000',outputMint:USDC,outputAmount:'125123456',otherAmountThreshold:'124497838',slippageBps:50,referrerAmount:'0',transaction:'never-store',routePlan:[{poolId:pool,inputMint:mint,outputMint:USDC,remainingAccounts:['never-store']}],...extra}});
const request=(extra={})=>new Request('https://workspace.test/api/market/exit-quote?'+new URLSearchParams({chain:'solana',contract:mint,amount:'1',slippageBps:'50',notes:'never-forward',wallet:'never-forward',...extra}),{headers:{cookie:'never-forward'}});
function database(t){const db=new DatabaseSync(':memory:');for(const name of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));t.after(()=>db.close());
  function prepare(sql,params=[]){return{bind(...v){return prepare(sql,v);},async first(){return db.prepare(sql).get(...params)||null;},async run(){if(/RETURNING|^SELECT/i.test(sql))return{results:db.prepare(sql).all(...params)};return{results:[],meta:{changes:Number(db.prepare(sql).run(...params).changes)}};}};}
  return {db,env:{DB:{prepare,async batch(items){return Promise.all(items.map(p=>p.run()));}}}};
}
test('token amounts preserve smallest units and enforce precision, positivity and u64 boundaries',()=>{
  assert.equal(tokenUnits('1000',9),'1000000000000');assert.equal(tokenUnits('9007199254.740993001',9),'9007199254740993001');
  assert.equal(tokenUnits('0.000000001',9),'1');assert.equal(tokenAmount('1',9),'0.000000001');assert.equal(tokenAmount('125123456',6),'125.123456');
  assert.equal(tokenUnits('18446744073709551615',0),'18446744073709551615');
  for(const [v,d] of [['0',9],['1e6',9],['-1',9],['1,000',9],['01',9],['1.0000000001',9],['18446744073709551616',0],['1',19]])assert.throws(()=>tokenUnits(v,d));
});
test('metadata and quote checks reject mismatches, unknown amounts, discontinuous routes and referral charges',()=>{
  assert.deepEqual(normalizeMint(metadata(),mint),{contract:mint,decimals:9});
  assert.throws(()=>normalizeMint(metadata(),mid));assert.throws(()=>normalizeMint({success:true,data:[...metadata().data,...metadata().data]},mint));
  const r=normalizeQuote(quote(),mint,'1000000000',50,9);assert.equal(r.outputAmount,'125.123456');assert.equal(r.minimumAmount,'124.497838');assert.ok(!JSON.stringify(r).includes('never-store'));
  for(const changes of [{inputMint:mid},{inputAmount:'1000000001'},{outputMint:mid},{outputAmount:null},{outputAmount:'0'},{otherAmountThreshold:'0'},{otherAmountThreshold:'999999999'},{slippageBps:500},{referrerAmount:'1'},{actualInputAmount:'1000000001'},{routePlan:[]},{routePlan:[{poolId:pool,inputMint:mid,outputMint:USDC}]}])assert.throws(()=>normalizeQuote(quote(changes),mint,'1000000000',50,9));
  const multi=quote({routePlan:[{poolId:pool,inputMint:mint,outputMint:mid},{poolId:mid,inputMint:mid,outputMint:USDC}]});assert.equal(normalizeQuote(multi,mint,'1000000000',50,9).route.length,2);
  assert.throws(()=>normalizeQuote({success:false,msg:'private raw error'},mint,'1000000000',50,9),e=>e.status===422&&!e.message.includes('private'));
});
test('invalid requests make no upstream call and quote transport forwards only public inputs',async t=>{
  const {env,db}=database(t);let calls=0;
  t.mock.method(globalThis,'fetch',async(url,options)=>{calls++;const u=new URL(url);assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.deepEqual(options.headers,{Accept:'application/json'});assert.ok(!String(url).includes('never-forward'));if(u.pathname==='/mint/ids'){assert.equal(u.origin,'https://api-v3.raydium.io');return Response.json(metadata());}assert.equal(u.origin,'https://transaction-v1.raydium.io');assert.equal(u.pathname,'/compute/swap-base-in');assert.deepEqual(Object.fromEntries(u.searchParams),{inputMint:mint,outputMint:USDC,amount:'1000000000',slippageBps:'50',txVersion:'V0'});return Response.json(quote());});
  for(const extra of [{chain:'base'},{contract:USDC},{contract:'bad'},{amount:'1e6'},{amount:'0'},{slippageBps:'501'},{slippageBps:'NaN'}])await assert.rejects(exitQuote(request(extra),env),{status:400});assert.equal(calls,0);
  const r=await exitQuote(request(),env);assert.equal(calls,2);assert.equal(r.sourceObservedAt,null);assert.equal(r.feesVerified,false);assert.ok(!JSON.stringify(db.prepare('SELECT payload FROM market_cache').all()).includes('never-store'));
});
test('quotes reuse a ten-second cache, never reuse stale output, and expire from request start',async t=>{
  const {env}=database(t);let now=1800000000000,calls=0;t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async url=>{calls++;if(new URL(url).pathname==='/mint/ids')return Response.json(metadata());now+=5000;return Response.json(quote());});
  const first=await exitQuote(request(),env);assert.equal(Date.parse(first.expiresAt)-Date.parse(first.requestedAt),30000);assert.equal(Date.parse(first.expiresAt)-Date.parse(first.fetchedAt),25000);
  const cached=await exitQuote(request(),env);assert.equal(cached.cached,true);assert.equal(cached.fetchedAt,first.fetchedAt);assert.equal(calls,2);
  now+=10000;t.mock.method(globalThis,'fetch',async()=>{throw Error('private response');});await assert.rejects(exitQuote(request(),env),e=>e.status===502&&!e.message.includes('private'));
  now+=30000;await assert.rejects(exitQuote(request(),env),{status:502});
});
test('workspace budgets cap attempts and provider Retry-After suppresses retries',async t=>{
  const {env,db}=database(t);let now=1800000000000,calls=0;t.mock.method(Date,'now',()=>now);
  t.mock.method(globalThis,'fetch',async url=>{calls++;return Response.json(new URL(url).pathname==='/mint/ids'?metadata():quote({inputAmount:tokenUnits(new URL(url).searchParams.get('amount')==='1000000000'?'1':'2',9)}));});
  await exitQuote(request(),env);
  db.prepare("UPDATE market_budget SET calls=8 WHERE id='raydium_quote'").run();await assert.rejects(exitQuote(request({amount:'2'}),env),{status:429});assert.equal(calls,2);
  now+=61000;t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('private error',{status:429,headers:{'Retry-After':new Date(now+120000).toUTCString()}});});
  await assert.rejects(exitQuote(request({amount:'2'}),env),{status:429});assert.equal(db.prepare("SELECT blocked_until FROM market_budget WHERE id='raydium_quote'").get().blocked_until,Math.floor(now/1000)+120);
  now+=5000;await assert.rejects(exitQuote(request({amount:'2'}),env),{status:429});assert.equal(calls,3);
});
test('oversized and unavailable provider responses cannot become usable quotes',async t=>{
  const {env}=database(t);let now=1800000000000;t.mock.method(Date,'now',()=>now);
  for(const response of [new Response('secret',{status:403}),new Response('x'.repeat(100001)),Response.json({success:true,data:[]})]){
    t.mock.method(globalThis,'fetch',async()=>response);await assert.rejects(exitQuote(request(),env),e=>!e.message.includes('secret'));now+=61000;
  }
});
