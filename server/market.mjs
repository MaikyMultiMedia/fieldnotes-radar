const ROOT='https://api.geckoterminal.com/api/v2';
export const NETWORKS={solana:'solana',ethereum:'eth',base:'base',bsc:'bsc'};
const inflight=new Map();
const issue=(message,status=400)=>Object.assign(new Error(message),{status});
export const number=value=>{if(typeof value!=='number'&&(typeof value!=='string'||!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value)))return null;const n=Number(value);return Number.isFinite(n)?n:null;};
const positive=value=>{const n=number(value);return n!==null&&n>=0?n:null;};
const label=(value,max=100)=>typeof value==='string'?value.slice(0,max):'';
const same=(chain,a,b)=>chain==='solana'?a===b:a?.toLowerCase()===b?.toLowerCase();
export function address(chain,value) {
  if(!NETWORKS[chain])throw issue('Choose a supported network.');
  if(typeof value!=='string'||!(chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{32,44}$/:/^0x[a-fA-F0-9]{40}$/).test(value))throw issue('Enter a valid contract or pool address for this network.');
  return chain==='solana'?value:value.toLowerCase();
}
function date(value){const time=Date.parse(value);return Number.isFinite(time)?new Date(time).toISOString():null;}
export function normalizePools(payload,chain,target=null) {
  if(!payload||!Array.isArray(payload.data)||!Array.isArray(payload.included))throw issue('Market provider returned an unexpected response.',502);
  const included=new Map(payload.included.filter(x=>x&&typeof x.id==='string').map(x=>[x.id,x]));
  const list=payload.data.slice(0,20).flatMap(pool=>{
    if(pool?.type!=='pool')return [];
    const a=pool.attributes||{},relations=pool.relationships||{};
    const base=included.get(relations.base_token?.data?.id)?.attributes;
    const quote=included.get(relations.quote_token?.data?.id)?.attributes;
    if(!base||!quote)return [];
    let poolAddress,baseAddress,quoteAddress;
    try{poolAddress=address(chain,a.address);baseAddress=address(chain,base.address);quoteAddress=address(chain,quote.address);}catch{return [];}
    if(pool.id!==NETWORKS[chain]+'_'+a.address||relations.base_token?.data?.id!==NETWORKS[chain]+'_'+base.address||relations.quote_token?.data?.id!==NETWORKS[chain]+'_'+quote.address)return [];
    const side=target&&same(chain,target,quoteAddress)?'quote':'base';
    const token=side==='base'?base:quote,contract=side==='base'?baseAddress:quoteAddress;
    if(target&&!same(chain,contract,target))return [];
    const buys=positive(a.transactions?.h24?.buys),sells=positive(a.transactions?.h24?.sells);
    return [{
      id:chain+':'+poolAddress+':'+contract,chain,contract,pool:poolAddress,
      name:label(token.name,80)||label(token.symbol,20)||'Unnamed token',symbol:label(token.symbol,20)||'TOKEN',
      pair:label(a.name,100),dex:label(included.get(relations.dex?.data?.id)?.attributes?.name,60),
      price:positive(a[side+'_token_price_usd']),
      change5m:side==='base'?number(a.price_change_percentage?.m5):null,
      change24h:side==='base'?number(a.price_change_percentage?.h24):null,
      liquidity:positive(a.reserve_in_usd),volume24h:positive(a.volume_usd?.h24),
      marketCap:side==='base'?positive(a.market_cap_usd):null,fdv:side==='base'?positive(a.fdv_usd):null,
      buys24h:buys,sells24h:sells,poolCreatedAt:date(a.pool_created_at),
      holders:null,sourceObservedAt:null,
      sourceUrl:'https://www.geckoterminal.com/'+NETWORKS[chain]+'/pools/'+poolAddress,
    }];
  });
  if(payload.data.length&&!list.length)throw issue('The provider returned no valid matching pools.',502);
  return list;
}
export function normalizeChart(payload) {
  const raw=payload?.data?.attributes?.ohlcv_list;
  if(!Array.isArray(raw))throw issue('Chart data is unavailable.',502);
  const points=raw.slice(0,120).flatMap(row=>{
    if(!Array.isArray(row)||row.length<6)return [];
    const [time,open,high,low,close,volume]=row.map(number);
    if([time,open,high,low,close,volume].some(x=>x===null)||time<=0||time>Date.now()/1000+60||Math.min(open,high,low,close,volume)<0||high<Math.max(open,close,low)||low>Math.min(open,close))return [];
    return [{time,open,high,low,close,volume}];
  }).sort((a,b)=>a.time-b.time);
  if(raw.length&&!points.length)throw issue('The provider returned an invalid chart.',502);
  return points.filter((p,i)=>i===0||p.time!==points[i-1].time);
}
async function limitedJson(response) {
  const reader=response.body?.getReader();if(!reader)throw issue('Empty provider response.',502);
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1500000){await reader.cancel();throw issue('Provider response was too large.',502);}chunks.push(value);}
  const joined=new Uint8Array(size);let at=0;for(const c of chunks){joined.set(c,at);at+=c.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(joined));}catch{throw issue('Provider response was not valid JSON.',502);}
}
async function reserve(env,time){
  const result=await env.DB.prepare("INSERT INTO market_budget (id,calls,window_start,blocked_until) VALUES ('provider',1,?,0) ON CONFLICT(id) DO UPDATE SET calls=CASE WHEN window_start<=? THEN 1 ELSE calls+1 END,window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END RETURNING calls,blocked_until").bind(time,time-60,time-60,time).run();
  const budget=result.results?.[0];
  if(!budget||budget.calls>8||budget.blocked_until>time)throw issue('Market refresh limit reached. Try again in a minute.',429);
}
function envelope(payload,fetched,status,error=null){return{...payload,status,provider:'GeckoTerminal',fetchedAt:new Date(fetched*1000).toISOString(),sourceObservedAt:null,refreshSeconds:60,error};}
async function cached(env,key,path,convert){
  const time=Math.floor(Date.now()/1000);
  const old=await env.DB.prepare('SELECT payload,fetched FROM market_cache WHERE key=?').bind(key).first();
  if(old&&time-old.fetched<60)return envelope(JSON.parse(old.payload),old.fetched,'fresh');
  if(inflight.has(key))return inflight.get(key);
  const pending=(async()=>{
    try{
      await reserve(env,time);
      const response=await fetch(ROOT+path,{headers:{Accept:'application/json;version=20230302'},signal:AbortSignal.timeout(8000)});
      if(response.status===429){
        const retry=Math.min(3600,Math.max(60,Number(response.headers.get('retry-after'))||60));
        await env.DB.prepare("UPDATE market_budget SET blocked_until=? WHERE id='provider'").bind(time+retry).run();
        throw issue('GeckoTerminal is rate-limiting requests. Try again shortly.',429);
      }
      if(!response.ok)throw issue(response.status===404?'No market data was found for this token or pool.':'GeckoTerminal is temporarily unavailable.',response.status===404?404:502);
      const payload=convert(await limitedJson(response)),fetched=Math.floor(Date.now()/1000);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO market_cache (key,payload,fetched) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched=excluded.fetched').bind(key,JSON.stringify(payload),fetched),
        env.DB.prepare('DELETE FROM market_cache WHERE fetched < ?').bind(time-86400),
      ]);
      return envelope(payload,fetched,'fresh');
    }catch(e){
      if(old&&time-old.fetched<=900)return envelope(JSON.parse(old.payload),old.fetched,'stale',e.status?e.message:'Refresh failed. Showing the last successful observation.');
      throw issue(e.status?e.message:'Market data could not be refreshed. Please try again.',e.status||502);
    }finally{inflight.delete(key);}
  })();
  inflight.set(key,pending);return pending;
}
export async function market(request,env) {
  const url=new URL(request.url),q=url.searchParams,chain=q.get('chain')||'solana';
  if(!NETWORKS[chain])throw issue('Choose a supported network.');
  const network=NETWORKS[chain];
  if(url.pathname==='/api/market'){
    const mode=q.get('mode')||'trending';
    if(!['trending','new','search','token'].includes(mode))throw issue('Unknown market view.');
    let path;
    if(mode==='token'){const token=address(chain,q.get('contract'));path='/networks/'+network+'/tokens/'+token+'/pools?include=base_token,quote_token,dex';return cached(env,path,path,p=>({chain,mode,pools:normalizePools(p,chain,token)}));}
    if(mode==='search'){
      const phrase=(q.get('q')||'').trim();
      if(phrase.length<2||phrase.length>100)throw issue('Search with 2–100 characters.');
      // Address searches must match the exact token, including quote-side pools.
      try{const token=address(chain,phrase);path='/networks/'+network+'/tokens/'+token+'/pools?include=base_token,quote_token,dex';return cached(env,path,path,p=>({chain,mode,pools:normalizePools(p,chain,token)}));}catch(e){if(e.status!==400)throw e;}
      path='/search/pools?network='+network+'&query='+encodeURIComponent(phrase)+'&include=base_token,quote_token,dex';
    }else path='/networks/'+network+'/'+(mode==='new'?'new_pools':'trending_pools')+'?include=base_token,quote_token,dex';
    return cached(env,path,path,p=>({chain,mode,pools:normalizePools(p,chain)}));
  }
  if(url.pathname==='/api/market/chart'){
    const pool=address(chain,q.get('pool')),token=address(chain,q.get('contract'));
    const period=q.get('period')||'5m';
    if(!['5m','1h'].includes(period))throw issue('Unknown chart period.');
    const poolPath='/networks/'+network+'/pools/'+pool+'?include=base_token,quote_token,dex';
    const details=await cached(env,poolPath+':'+token,poolPath,p=>({pools:normalizePools({...p,data:Array.isArray(p.data)?p.data:[p.data]},chain,token)}));
    if(!details.pools.length||!same(chain,details.pools[0].pool,pool))throw issue('The token does not belong to this pool.',400);
    const path='/networks/'+network+'/pools/'+pool+'/ohlcv/'+(period==='5m'?'minute':'hour')+'?aggregate='+(period==='5m'?'5':'1')+'&limit=72&currency=usd&token='+token;
    return cached(env,path,path,p=>({chain,pool,contract:token,period,poolDetails:details.pools[0],detailsFetchedAt:details.fetchedAt,detailsStatus:details.status,candles:normalizeChart(p)}));
  }
  throw issue('Not found',404);
}
