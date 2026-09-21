import {address,number,retryDelay} from './market.mjs';
const ROOT='https://public-api.birdeye.so';
const WINDOWS={'24h':'24h','48h':'2d','72h':'3d','7d':'7d','30d':'30d'};
const pending=new Map();
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
export function normalizeLeaders(payload){
  if(payload?.success!==true||!Array.isArray(payload.data))throw fail('The profit provider returned an unexpected response.');
  const seen=new Set();
  const rows=payload.data.slice(0,20).flatMap((row,i)=>{
    let owner;try{owner=address('solana',row.owner);}catch{return [];}
    const pnl=number(row.realized_pnl),value=number(row.total_value),trades=number(row.trade_count),volume=number(row.volume_usd),unrealized=number(row.unrealized_pnl);
    if(seen.has(owner)||pnl===null||pnl<0||value===null||value<100000||trades===null||!Number.isInteger(trades)||trades<10)return [];
    seen.add(owner);return [{address:owner,chain:'solana',providerRank:i+1,realizedPnl:pnl,unrealizedPnl:unrealized,value,trades,volume:volume!==null&&volume>=0?volume:null}];
  });
  if(payload.data.length&&!rows.length)throw fail('No valid profit records matched the requested ranking scope.');
  return rows.sort((a,b)=>b.realizedPnl-a.realizedPnl);
}
export async function leaderboard(request,env){
  const window=new URL(request.url).searchParams.get('window')||'24h';
  if(!WINDOWS[window])throw fail('Choose 24h, 48h, 72h, 7d or 30d.',400);
  const scope={window,chain:'solana',method:'wac',minimumWalletValue:100000,minimumTrades:10,provider:'Birdeye',sourceUrl:'https://data.birdeye.so/docs/data-api/wallet-networth-pnl/get-wallet-v2-leaderboard',feesVerified:false,fomoIdentityVerified:false};
  if(!env.BIRDEYE_API_KEY)return {...scope,status:'not_configured',rows:[],fetchedAt:null};
  const key='birdeye:leaders:wac:v1:'+window,now=Math.floor(Date.now()/1000);
  const old=await env.DB.prepare('SELECT payload,fetched FROM market_cache WHERE key=?').bind(key).first();
  const result=(rows,fetched,status,error=null)=>({...scope,rows,fetchedAt:new Date(fetched*1000).toISOString(),status,error});
  if(old&&now>=old.fetched&&now-old.fetched<300)return result(JSON.parse(old.payload),old.fetched,'fresh');
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    try{
      const r=await env.DB.prepare("INSERT INTO market_budget (id,calls,window_start,blocked_until) VALUES ('birdeye',1,?,0) ON CONFLICT(id) DO UPDATE SET calls=CASE WHEN window_start<=? THEN 1 ELSE calls+1 END,window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END RETURNING calls,blocked_until").bind(now,now-60,now-60,now).run();
      if(!r.results?.[0]||r.results[0].calls>6||r.results[0].blocked_until>now)throw fail('Profit rankings are cooling down. Try again in a minute.',429);
      const params=new URLSearchParams({interval:WINDOWS[window],sort_by:'realized_pnl',pnl_method:'wac',from_value:'100000',min_trade:'10',min_realized_pnl:'0',limit:'20',offset:'0'});
      const response=await fetch(ROOT+'/wallet/v2/leaderboard?'+params,{headers:{'X-API-KEY':env.BIRDEYE_API_KEY,'x-chain':'solana',Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
      if(response.status===429){await env.DB.prepare("UPDATE market_budget SET blocked_until=? WHERE id='birdeye'").bind(now+retryDelay(response.headers.get('retry-after'),now)).run();throw fail('Birdeye is rate-limiting rankings. Try again shortly.',429);}
      if([401,403].includes(response.status))throw fail('Birdeye access needs attention. Check the connected key and endpoint entitlement.',503);
      if(!response.ok)throw fail('Profit rankings are temporarily unavailable.');
      const reader=response.body?.getReader();if(!reader)throw fail('Profit data is empty.');
      let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>500000){await reader.cancel();throw fail('Profit response is too large.');}chunks.push(value);}
      const joined=new Uint8Array(size);let at=0;for(const c of chunks){joined.set(c,at);at+=c.byteLength;}
      const rows=normalizeLeaders(JSON.parse(new TextDecoder().decode(joined))),fetched=Math.floor(Date.now()/1000);
      await env.DB.batch([env.DB.prepare('INSERT INTO market_cache (key,payload,fetched) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched=excluded.fetched').bind(key,JSON.stringify(rows),fetched),env.DB.prepare('DELETE FROM market_cache WHERE fetched < ?').bind(now-86400)]);
      return result(rows,fetched,'fresh');
    }catch(e){if(old&&now>=old.fetched&&now-old.fetched<=3600)return result(JSON.parse(old.payload),old.fetched,'stale',e.status?e.message:'Refresh failed.');throw e.status?e:fail('Profit data could not be refreshed.');}
    finally{pending.delete(key);}
  })();pending.set(key,task);return task;
}
