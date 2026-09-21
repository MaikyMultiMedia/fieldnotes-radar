import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {address,number,normalizePools,normalizeChart,market} from '../server/market.mjs';
const base='So11111111111111111111111111111111111111112',quote='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',pool='Bd4wKg3xEBKJ4Xrw8skXMmJ4W65gk3x8yd7AovuBJisZ';
function fixture(){return {data:[{id:'solana_'+pool,type:'pool',attributes:{address:pool,name:'TEST / USD',base_token_price_usd:'0.00012345',quote_token_price_usd:'1',price_change_percentage:{m5:'0',h24:'-3.5'},reserve_in_usd:'0',volume_usd:{h24:'1234'},market_cap_usd:null,fdv_usd:'12345',transactions:{h24:{buys:0,sells:12}},pool_created_at:'2026-01-01T00:00:00Z',wallets:['private-value']},relationships:{base_token:{data:{id:'solana_'+base}},quote_token:{data:{id:'solana_'+quote}},dex:{data:{id:'test-dex'}}}}],included:[{id:'solana_'+base,type:'token',attributes:{address:base,name:'Test',symbol:'TEST'}},{id:'solana_'+quote,type:'token',attributes:{address:quote,name:'USD',symbol:'USD'}},{id:'test-dex',type:'dex',attributes:{name:'Test DEX'}}],privateKey:'private-value'};}
function database(){
  const db=new DatabaseSync(':memory:');
  for(const name of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('drizzle/'+name,'utf8'));
  function prepare(sql,params=[]){return{bind(...v){return prepare(sql,v)},async first(){return db.prepare(sql).get(...params)||null},run(){if(/RETURNING|^SELECT/i.test(sql)){return {results:db.prepare(sql).all(...params)}}return{results:[],meta:{changes:Number(db.prepare(sql).run(...params).changes)}}}};}
  return{db,env:{DB:{prepare,async batch(ps){db.exec('BEGIN');try{const results=ps.map(p=>p.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}}};
}
const request=(query='',path='/api/market')=>new Request('https://workspace.test'+path+query);
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
test('numeric normalization distinguishes unknown, malformed, and measured zero',()=>{
  for(const v of [null,undefined,'',' ',true,false,[],{},'Infinity','NaN','0x10'])assert.equal(number(v),null);
  for(const v of [0,'0','0.0'])assert.equal(number(v),0);
  assert.equal(number('-3.25'),-3.25);assert.equal(number('1.2e-7'),1.2e-7);
  const result=normalizePools(fixture(),'solana')[0];
  assert.equal(result.liquidity,0);assert.equal(result.marketCap,null);assert.equal(result.fdv,12345);
  assert.equal(result.holders,null);assert.equal(result.sourceObservedAt,null);assert.equal(result.buys24h,0);
  assert.ok(!JSON.stringify(result).includes('private-value'));
});
test('chain, exact token identity and quote-side pricing are enforced',()=>{
  assert.throws(()=>address('ethereum',base));assert.throws(()=>address('unknown',base));
  assert.equal(address('base','0x'+'A'.repeat(40)),'0x'+'a'.repeat(40));
  assert.throws(()=>normalizePools(fixture(),'base'));
  assert.throws(()=>normalizePools(fixture(),'solana','11111111111111111111111111111111'));
  const q=normalizePools(fixture(),'solana',quote)[0];
  assert.equal(q.contract,quote);assert.equal(q.price,1);assert.equal(q.change24h,null);assert.equal(q.marketCap,null);assert.equal(q.fdv,null);
  const bad=fixture();bad.data[0].id='eth_'+pool;assert.throws(()=>normalizePools(bad,'solana'));
  const mixed=fixture();mixed.data[0].relationships.base_token.data.id='eth_'+base;assert.throws(()=>normalizePools(mixed,'solana'));
});
test('OHLCV validates bounds and timestamps, orders and deduplicates actual observations',()=>{
  const data=rows=>({data:{attributes:{ohlcv_list:rows}}});
  const result=normalizeChart(data([[200,1,3,0,2,0],[100,1,2,1,2,10],[200,1,3,0,2,0],[300,3,1,0,2,1],[400,null,3,0,2,1],[Date.now()/1000+3600,1,2,1,2,1]]));
  assert.deepEqual(result.map(x=>x.time),[100,200]);assert.equal(result[1].volume,0);
  assert.deepEqual(normalizeChart(data([])),[]);
  assert.throws(()=>normalizeChart(data([[100,true,1,0,1,1]])));
});
test('shared cache limits requests and stale fallback keeps original receipt time',async t=>{
  const {db,env}=database();t.after(()=>db.close());
  let calls=0;t.mock.method(globalThis,'fetch',async url=>{assert.ok(String(url).startsWith('https://api.geckoterminal.com/api/v2/'));calls++;return json(fixture());});
  const first=await market(request(),env),again=await market(request(),env);
  assert.equal(calls,1);assert.equal(again.fetchedAt,first.fetchedAt);assert.equal(again.status,'fresh');
  const old=Math.floor(Date.now()/1000)-70;db.prepare('UPDATE market_cache SET fetched=?').run(old);
  t.mock.method(globalThis,'fetch',async()=>{throw Error('offline');});
  const stale=await market(request(),env);assert.equal(stale.status,'stale');assert.equal(stale.fetchedAt,new Date(old*1000).toISOString());
  db.prepare('UPDATE market_cache SET fetched=?').run(Math.floor(Date.now()/1000)-901);
  await assert.rejects(market(request(),env),{status:502});
});
test('upstream budget and provider cooldown stop further outbound requests',async t=>{
  const {db,env}=database();t.after(()=>db.close());let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;return json(fixture());});
  for(let i=0;i<8;i++)await market(request('?mode=search&q=test'+i),env);
  await assert.rejects(market(request('?mode=search&q=ninth'),env),{status:429});assert.equal(calls,8);
  db.prepare('DELETE FROM market_budget').run();
  t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response('limited',{status:429,headers:{'retry-after':'120'}});});
  await assert.rejects(market(request('?mode=new'),env),{status:429});
  await assert.rejects(market(request('?mode=search&q=cooldown'),env),{status:429});assert.equal(calls,9);
});
test('invalid requests make no outbound call and exact chart membership is verified',async t=>{
  const {db,env}=database();t.after(()=>db.close());const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{urls.push(String(url));const data=fixture();return json({...data,data:data.data[0]});});
  for(const query of ['?chain=bogus','?mode=bogus','?mode=search&q=a','?mode=token&contract=https://evil.test'])await assert.rejects(market(request(query),env),{status:400});
  assert.equal(urls.length,0);
  await assert.rejects(market(request('?chain=solana&pool='+base+'&contract='+base,'/api/market/chart'),env),{status:400});
  assert.equal(urls.length,1);
});
test('chart requests use the selected exact token and candle interval',async t=>{
  const {db,env}=database();t.after(()=>db.close());const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{urls.push(String(url));if(String(url).includes('/ohlcv/'))return json({data:{attributes:{ohlcv_list:[[100,1,2,1,2,0]]}}});const data=fixture();return json({...data,data:data.data[0]});});
  const result=await market(request('?chain=solana&pool='+pool+'&contract='+quote+'&period=1h','/api/market/chart'),env);
  assert.equal(result.contract,quote);assert.equal(result.poolDetails.price,1);assert.equal(result.candles.length,1);
  assert.ok(urls[1].endsWith('/ohlcv/hour?aggregate=1&limit=72&currency=usd&token='+quote));
});
