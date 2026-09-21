import {address,number} from './market.mjs';
const ROOT='https://api.gopluslabs.io/api/v1';
const CHAINS={solana:'solana',ethereum:'1',base:'8453',bsc:'56'};
const pending=new Map();
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const flag=v=>v==='1'||v===1?true:v==='0'||v===0?false:null;
const amount=v=>{const n=number(v);return n!==null&&n>=0?n:null;};
const fraction=v=>{const n=amount(v);return n!==null&&n<=1?n*100:null;};
const bps=v=>{const n=amount(v);return n!==null&&Number.isInteger(n)&&n<=10000?n/100:null;};
const source=chain=>'https://docs.gopluslabs.io/reference/'+(chain==='solana'?'response-detail-1':'response-details');
const cacheKey=(chain,contract)=>'goplus:token:v1:'+chain+':'+contract;
const check=(id,label,value,detail)=>({id,label,value,detail});
const SOLANA_CHECKS=[
  ['mintable','Additional minting','Authority to issue more tokens.'],
  ['freezable','Account freezing','Authority over frozen token accounts.'],
  ['balance_mutable_authority','Balance changes','Privileged changes to token balances.'],
  ['closable','Mint closure','Inspect the authority and conditions for closure.'],
  ['transfer_fee_upgradable','Transfer fee changes','Authority to change transfer fees.'],
  ['transfer_hook_upgradable','Transfer hook changes','Authority to change transfer hooks.'],
  ['default_account_state_upgradable','Default account changes','Authority over initial account settings.'],
];
const EVM_CHECKS=[
  ['is_honeypot','Provider sell-block finding','Provider test for sell restrictions; not a live exit quote.'],
  ['is_mintable','Additional minting','Contract capability to issue more tokens.'],
  ['transfer_pausable','Transfers can pause','Inspect who can pause transfers.'],
  ['is_blacklisted','Address blacklist','Some addresses may be restricted.'],
  ['owner_change_balance','Owner balance changes','Privileged changes to token balances.'],
  ['is_proxy','Proxy contract','Inspect the implementation and upgrade controls.'],
  ['slippage_modifiable','Trading tax changes','Authority to change trading taxes.'],
  ['cannot_sell_all','Full-sale restriction','Selling an entire balance may be restricted.'],
  ['cannot_buy','Provider buy restriction','Provider test for purchase restrictions.'],
];
export function normalizeChecks(payload,chain,contract){
  contract=address(chain,contract);
  if(payload?.code!==1||!object(payload.result))throw fail('GoPlus did not return a usable token report.');
  const entries=Object.entries(payload.result).filter(([key])=>chain==='solana'?key===contract:key.toLowerCase()===contract);
  if(entries.length!==1||!object(entries[0][1])||!Object.keys(entries[0][1]).length)throw fail('GoPlus has no matching report for this exact token.',404);
  const t=entries[0][1],sol=chain==='solana';
  const checks=(sol?SOLANA_CHECKS:EVM_CHECKS).map(([id,label,detail])=>check(id,label,flag(sol?t[id]?.status:t[id]),detail));
  if(sol){
    checks.push(check('non_transferable','Non-transferable token',flag(t.non_transferable),'Transfers may be disabled by the token design.'));
    checks.push(check('default_frozen','New accounts start frozen',t.default_account_state==='2'||t.default_account_state===2?true:t.default_account_state==='1'||t.default_account_state===1?false:null,'New token accounts may require an authority to unfreeze them.'));
    checks.push(check('transfer_hook','Transfer hook present',Array.isArray(t.transfer_hook)?t.transfer_hook.length>0:null,'Custom logic can affect transfers; its code is not audited here.'));
  }else{
    const verified=flag(t.is_open_source);
    checks.push(check('unverified_source','Source not verified',verified===null?null:!verified,'Unverified source limits what can be inspected.'));
  }
  const supply=amount(t.total_supply),holderCount=amount(t.holder_count);
  const raw=Array.isArray(t.holders)?t.holders.slice(0,10):[],seen=new Set();
  const holders=raw.flatMap(row=>{
    if(!object(row))return [];
    let id;try{id=address(chain,sol?row.token_account:row.address);}catch{return [];}
    if(seen.has(id))return [];seen.add(id);
    const balance=amount(row.balance),share=supply!==null&&supply>0&&balance!==null&&balance<=supply?balance/supply*100:null;
    return [{address:id,sharePct:share,tag:typeof row.tag==='string'?row.tag.slice(0,80):'',isContract:sol?null:flag(row.is_contract)}];
  });
  const sum=holders.reduce((n,h)=>n+(h.sharePct??0),0);
  const sampleSharePct=holders.length&&holders.length===raw.length&&holders.every(h=>h.sharePct!==null)&&sum<=100.000001?Math.min(100,sum):null;
  const fees=sol?{transferPct:bps(t.transfer_fee?.current_fee_rate?.fee_rate),scheduledTransferPct:bps(t.transfer_fee?.scheduled_fee_rate?.fee_rate),scheduledEpoch:amount(t.transfer_fee?.scheduled_fee_rate?.epoch),buyPct:null,sellPct:null}:{transferPct:fraction(t.transfer_tax),scheduledTransferPct:null,scheduledEpoch:null,buyPct:null,sellPct:null};
  if(!sol){fees.buyPct=flag(t.is_in_dex)===true?fraction(t.buy_tax):null;fees.sellPct=flag(t.is_in_dex)===true?fraction(t.sell_tax):null;}
  return {chain,contract,checks,findings:checks.filter(c=>c.value===true).length,unknown:checks.filter(c=>c.value===null).length,fees,holderCount:holderCount!==null&&Number.isSafeInteger(holderCount)?holderCount:null,holders,sampleSharePct,holderCoverage:{received:raw.length,accepted:holders.length,limit:10,complete:false},sourceUrl:source(chain),provider:'GoPlus',sourceObservedAt:null,beta:sol};
}
async function limitedJson(response){
  const reader=response.body?.getReader();if(!reader)throw fail('Token report was empty.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>500000){await reader.cancel();throw fail('Token report exceeded the supported size.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
const envelope=(data,fetched,status,error=null)=>({...data,fetchedAt:new Date(fetched*1000).toISOString(),status,error});
export async function savedChecks(env,chain,contract,now=Date.now()){
  const row=await env.DB.prepare('SELECT payload,fetched FROM market_cache WHERE key=?').bind(cacheKey(chain,contract)).first();
  if(!row||now-row.fetched*1000>300000||row.fetched*1000>now)return null;
  const d=JSON.parse(row.payload);if(d.chain!==chain||d.contract!==contract)return null;
  return {provider:d.provider,chain,contract,fetchedAt:new Date(row.fetched*1000).toISOString(),sourceObservedAt:null,sourceUrl:d.sourceUrl,checks:d.checks,fees:d.fees,holderCount:d.holderCount,sampleSharePct:d.sampleSharePct};
}
export async function tokenChecks(request,env){
  const q=new URL(request.url).searchParams,chain=q.get('chain');
  if(!CHAINS[chain])throw fail('Choose a supported network for token checks.',400);
  const contract=address(chain,q.get('contract')),key=cacheKey(chain,contract),now=Math.floor(Date.now()/1000);
  const old=await env.DB.prepare('SELECT payload,fetched FROM market_cache WHERE key=?').bind(key).first();
  if(old&&now>=old.fetched&&now-old.fetched<300)return envelope(JSON.parse(old.payload),old.fetched,'fresh');
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{
    try{
      const r=await env.DB.prepare("INSERT INTO market_budget (id,calls,window_start,blocked_until) VALUES ('goplus',1,?,0) ON CONFLICT(id) DO UPDATE SET calls=CASE WHEN window_start<=? THEN 1 ELSE calls+1 END,window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END RETURNING calls,blocked_until").bind(now,now-60,now-60,now).run();
      if(!r.results?.[0]||r.results[0].calls>8||r.results[0].blocked_until>now)throw fail('Token checks are cooling down. Try again in a minute.',429);
      const path=chain==='solana'?'/solana/token_security':'/token_security/'+CHAINS[chain];
      const response=await fetch(ROOT+path+'?'+new URLSearchParams({contract_addresses:contract}),{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
      if(response.status===429){await env.DB.prepare("UPDATE market_budget SET blocked_until=? WHERE id='goplus'").bind(now+Math.min(3600,Math.max(60,Number(response.headers.get('retry-after'))||60))).run();throw fail('GoPlus is rate-limiting token checks. Try again shortly.',429);}
      if([401,403,402].includes(response.status))throw fail('Free GoPlus access is currently unavailable. No paid access is enabled.',503);
      if(!response.ok)throw fail('GoPlus token checks are temporarily unavailable.');
      const data=normalizeChecks(await limitedJson(response),chain,contract),fetched=Math.floor(Date.now()/1000);
      await env.DB.batch([env.DB.prepare('INSERT INTO market_cache (key,payload,fetched) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched=excluded.fetched').bind(key,JSON.stringify(data),fetched),env.DB.prepare('DELETE FROM market_cache WHERE fetched < ?').bind(now-86400)]);
      return envelope(data,fetched,'fresh');
    }catch(e){if(old&&now>=old.fetched&&now-old.fetched<=900)return envelope(JSON.parse(old.payload),old.fetched,'stale',e.status?e.message:'Token checks could not be refreshed.');throw e.status?e:fail('Token checks could not be refreshed.');}
    finally{pending.delete(key);}
  })();pending.set(key,task);return task;
}

export async function checkSummaries(env,now=Date.now()){
  const rows=await env.DB.prepare("SELECT payload,fetched FROM market_cache WHERE key LIKE ? AND fetched>=? ORDER BY fetched DESC LIMIT 100").bind("goplus:token:v1:%",Math.floor(now/1000)-86400).run();
  return rows.results.map(row=>{const d=JSON.parse(row.payload);return {chain:d.chain,contract:d.contract,findings:d.findings,unknown:d.unknown,fetchedAt:new Date(row.fetched*1000).toISOString(),status:now>=row.fetched*1000&&now-row.fetched*1000<=300000?"fresh":"stale"};});
}
