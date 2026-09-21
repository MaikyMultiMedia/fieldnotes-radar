import {address,number} from './market.mjs';
const ROOT='https://openapi.gmgn.ai';
const NETWORKS={solana:'sol',ethereum:'eth',base:'base',bsc:'bsc'};
const WINDOWS={'24h':'1d','7d':'7d','30d':'30d'};
const pending=new Map();
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
const nonnegative=value=>{const n=number(value);return n!==null&&n>=0?n:null;};
const count=value=>{const n=nonnegative(value);return Number.isSafeInteger(n)?n:null;};

export function normalizeWalletProfit(payload,chain,wallet){
  if(payload?.code!==0||!Array.isArray(payload.data?.list))throw fail('GMGN returned an unexpected wallet report.');
  if(!payload.data.list.length)return null;
  if(payload.data.list.length!==1)throw fail('GMGN returned a different wallet set.');
  const row=payload.data.list[0];let owner;
  try{owner=address(chain,row.wallet_address);}catch{throw fail('GMGN did not identify the requested wallet.');}
  if(owner!==wallet)throw fail('GMGN did not identify the requested wallet.');
  const realizedPnl=number(row.realized_profit),realizedCost=nonnegative(row.realized_profit_cost);
  const ratio=realizedPnl!==null&&realizedCost>0?realizedPnl/realizedCost:null;
  return{realizedPnl,realizedCost,realizedReturn:Number.isFinite(ratio)?ratio:null,buyCount:count(row.buy),sellCount:count(row.sell),unrealizedPnl: number(row.unrealized_profit)};
}

async function readJson(response){
  const reader=response.body?.getReader();if(!reader)throw fail('GMGN returned an empty response.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>350000){await reader.cancel();throw fail('The wallet report exceeded the response limit.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail('GMGN returned an unreadable wallet report.');}
}

async function reserve(env,now){
  // Weight-three requests share a minimum two-second gap and eight attempts/minute.
  const row=await env.DB.prepare("INSERT INTO market_budget (id,calls,window_start,blocked_until) VALUES ('gmgn_wallet',1,?,?) ON CONFLICT(id) DO UPDATE SET calls=CASE WHEN window_start<=? THEN 1 ELSE calls+1 END,window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END,blocked_until=? WHERE blocked_until<=? RETURNING calls").bind(now,now+2,now-60,now-60,now,now+2,now).run();
  if(!row.results?.length||row.results[0].calls>8)throw fail('Wallet checks are cooling down. Try again shortly.',429);
}

export async function walletResearch(request,env){
  const params=new URL(request.url).searchParams,chain=params.get('chain')||'solana',wallet=address(chain,params.get('address')),window=params.get('window')||'24h';
  if(!NETWORKS[chain]||!WINDOWS[window])throw fail('GMGN wallet reports support 24h, 7d and 30d on Solana, Ethereum, Base and BNB Chain.',400);
  const scope={chain,address:wallet,window,provider:'GMGN',sourceUrl:'https://github.com/GMGNAI/gmgn-skills/blob/main/skills/gmgn-portfolio/SKILL.md',feesVerified:false,transfersVerified:false,fomoIdentityVerified:false,sourceObservedAt:null};
  if(!env.GMGN_API_KEY)return{...scope,status:'not_configured',report:null,fetchedAt:null};
  const key='gmgn:wallet-profit:v1:'+chain+':'+wallet+':'+window,now=Math.floor(Date.now()/1000);
  const old=await env.DB.prepare('SELECT payload,fetched FROM market_cache WHERE key=?').bind(key).first();
  const result=(report,fetched,status,error=null)=>({...scope,report,fetchedAt:new Date(fetched*1000).toISOString(),status,error});
  if(old&&now>=old.fetched&&now-old.fetched<300)return result(JSON.parse(old.payload),old.fetched,'fresh');
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    try{
      await reserve(env,now);
      const auth=new URLSearchParams({timestamp:String(Math.floor(Date.now()/1000)),client_id:crypto.randomUUID()});
      const response=await fetch(ROOT+'/v1/user/wallet_profits?'+auth,{method:'POST',headers:{'X-APIKEY':env.GMGN_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({chain:NETWORKS[chain],period:WINDOWS[window],wallet_addresses:[wallet]}),signal:AbortSignal.timeout(10000)});
      if([401,403].includes(response.status))throw fail('GMGN access needs attention. Check the connected API key and read-only access.',503);
      let payload;
      if(response.status===429){try{payload=await readJson(response);}catch{payload={};}}
      else{if(!response.ok)throw fail('The wallet profit source is temporarily unavailable.');payload=await readJson(response);}
      if(response.status===429||payload.code===429){
        const reset=Math.min(now+86400,Math.max(now+300,nonnegative(response.headers.get('x-ratelimit-reset'))||0,nonnegative(payload.reset_at)||0));
        await env.DB.prepare("UPDATE market_budget SET blocked_until=? WHERE id='gmgn_wallet'").bind(reset).run();
        throw fail('GMGN rate limit reached. Retry after '+new Date(reset*1000).toISOString()+'.',429);
      }
      if(!response.ok)throw fail('The wallet profit source is temporarily unavailable.');
      const report=normalizeWalletProfit(payload,chain,wallet),fetched=Math.floor(Date.now()/1000);
      await env.DB.batch([env.DB.prepare('INSERT INTO market_cache (key,payload,fetched) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched=excluded.fetched').bind(key,JSON.stringify(report),fetched),env.DB.prepare('DELETE FROM market_cache WHERE fetched<?').bind(fetched-86400)]);
      return result(report,fetched,'fresh');
    }catch(e){if(old&&now>=old.fetched&&now-old.fetched<=3600)return result(JSON.parse(old.payload),old.fetched,'stale',e.status?e.message:'Wallet refresh failed.');throw e.status?e:fail('The wallet report could not be refreshed.');}
    finally{pending.delete(key);}
  })();pending.set(key,task);return task;
}
