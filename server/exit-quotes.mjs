import {address} from './market.mjs';

export const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOURCE='https://docs.raydium.io/sdk-api/trade-api';
const pending=new Map();
const fail=(message,status=502)=>Object.assign(new Error(message),{status});
const raw=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,19})$/.test(v)&&BigInt(v)<=18446744073709551615n;

export function tokenUnits(value,decimals){
  if(!Number.isInteger(decimals)||decimals<0||decimals>18)throw fail('Token precision is not supported.');
  if(typeof value!=='string'||value.length>50||!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value))throw fail('Enter a positive token amount using digits and a decimal point.',400);
  const [whole,fraction='']=value.split('.');
  if(fraction.length>decimals)throw fail('This token supports at most '+decimals+' decimal places.',400);
  const units=BigInt(whole)*10n**BigInt(decimals)+BigInt(fraction.padEnd(decimals,'0')||'0');
  if(units<=0n||units>18446744073709551615n)throw fail('Token amount is outside the supported range.',400);
  return String(units);
}
export function tokenAmount(units,decimals){
  const s=String(units).padStart(decimals+1,'0');
  return decimals?s.slice(0,-decimals)+(s.slice(-decimals).replace(/0+$/,'')?'.'+s.slice(-decimals).replace(/0+$/,''):''):s;
}
export function normalizeMint(payload,contract){
  const matches=payload?.success===true&&Array.isArray(payload.data)?payload.data.filter(r=>r?.address===contract):[];
  if(matches.length!==1||matches[0].chainId!==101||!Number.isInteger(matches[0].decimals)||matches[0].decimals<0||matches[0].decimals>18)throw fail('Raydium has no usable precision metadata for this exact token.',404);
  return {contract,decimals:matches[0].decimals};
}
export function normalizeQuote(payload,contract,units,slippageBps,decimals){
  if(payload?.success===false)throw fail('Raydium did not return a route for this amount. No sale has been attempted.',422);
  const d=payload?.data;
  if(payload?.success!==true||d?.swapType!=='BaseIn'||d.inputMint!==contract||d.outputMint!==USDC||d.inputAmount!==units||d.slippageBps!==slippageBps||!raw(d.outputAmount)||BigInt(d.outputAmount)<=0n||!raw(d.otherAmountThreshold)||BigInt(d.otherAmountThreshold)<=0n||BigInt(d.otherAmountThreshold)>BigInt(d.outputAmount))throw fail('Raydium returned an inconsistent quote. Request a new preview.');
  if(d.referrerAmount!==undefined&&d.referrerAmount!=='0')throw fail('A quote with referral charges was rejected.');
  if(d.actualInputAmount!==undefined&&(!raw(d.actualInputAmount)||BigInt(d.actualInputAmount)>BigInt(units)||BigInt(d.actualInputAmount)<=0n))throw fail('Raydium returned an inconsistent input amount.');
  if(!Array.isArray(d.routePlan)||!d.routePlan.length||d.routePlan.length>5)throw fail('Raydium returned an unsupported route.');
  let previous=contract;
  const route=d.routePlan.map(leg=>{
    const pool=address('solana',leg?.poolId),inputMint=address('solana',leg?.inputMint),outputMint=address('solana',leg?.outputMint);
    if(inputMint!==previous||inputMint===outputMint)throw fail('Raydium returned an inconsistent route.');
    previous=outputMint;return {pool,inputMint,outputMint};
  });
  if(previous!==USDC)throw fail('Raydium returned a route to a different token.');
  return {provider:'Raydium',chain:'solana',contract,inputDecimals:decimals,inputRaw:units,inputAmount:tokenAmount(units,decimals),outputMint:USDC,outputSymbol:'USDC',outputDecimals:6,outputRaw:d.outputAmount,outputAmount:tokenAmount(d.outputAmount,6),minimumRaw:d.otherAmountThreshold,minimumAmount:tokenAmount(d.otherAmountThreshold,6),actualInputRaw:d.actualInputAmount??null,slippageBps,route,sourceUrl:SOURCE,sourceObservedAt:null,feesVerified:false};
}
async function limitedJson(response){
  const reader=response.body?.getReader();if(!reader)throw fail('Raydium returned an empty response.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000){await reader.cancel();throw fail('Raydium response exceeded the supported size.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function read(env,url){
  const now=Math.floor(Date.now()/1000);
  const r=await env.DB.prepare("INSERT INTO market_budget (id,calls,window_start,blocked_until) VALUES ('raydium_quote',1,?,0) ON CONFLICT(id) DO UPDATE SET calls=CASE WHEN window_start<=? THEN 1 ELSE calls+1 END,window_start=CASE WHEN window_start<=? THEN ? ELSE window_start END WHERE blocked_until<=? RETURNING calls,blocked_until").bind(now,now-60,now-60,now,now).run();
  if(!r.results?.[0]||r.results[0].calls>8)throw fail('Quote requests are cooling down. Try again in a minute.',429);
  const response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(10000)});
  if(response.status===429){
    const retry=response.headers.get('retry-after'),seconds=/^\d+$/.test(retry||'')?Number(retry):(Date.parse(retry)-Date.now())/1000;
    await env.DB.prepare("UPDATE market_budget SET blocked_until=? WHERE id='raydium_quote'").bind(now+Math.min(3600,Math.max(60,Math.ceil(seconds)||60))).run();
    throw fail('Raydium is rate-limiting quotes. Please wait before retrying.',429);
  }
  if(!response.ok)throw fail('The free Raydium quote service is temporarily unavailable.',503);
  return limitedJson(response);
}
async function saved(env,key,age){
  const row=await env.DB.prepare('SELECT payload,fetched FROM market_cache WHERE key=?').bind(key).first(),now=Math.floor(Date.now()/1000);
  if(!row||now<row.fetched||now-row.fetched>=age)return null;
  try{return JSON.parse(row.payload);}catch{return null;}
}
async function save(env,key,value){
  const now=Math.floor(Date.now()/1000);
  await env.DB.batch([env.DB.prepare('INSERT INTO market_cache (key,payload,fetched) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched=excluded.fetched').bind(key,JSON.stringify(value),now),env.DB.prepare('DELETE FROM market_cache WHERE fetched < ?').bind(now-86400)]);
}
export async function exitQuote(request,env){
  const q=new URL(request.url).searchParams;
  if(q.get('chain')!=='solana')throw fail('Free sell previews currently support Solana tokens only.',400);
  const contract=address('solana',q.get('contract')),amount=q.get('amount'),bps=q.get('slippageBps');
  if(contract===USDC)throw fail('Choose a token other than the USDC output token.',400);
  if(!/^[0-9]{1,3}$/.test(bps||'')||Number(bps)<1||Number(bps)>500)throw fail('Choose slippage between 0.01% and 5%.',400);
  if(typeof amount!=='string'||amount.length>50||!/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(amount)||BigInt(amount.replace('.',''))<=0n)throw fail('Enter a positive token amount using digits and a decimal point.',400);
  const slippageBps=Number(bps),key='raydium:quote:v1:'+contract+':'+amount+':'+slippageBps;
  const cached=await saved(env,key,10);
  if(cached&&Date.parse(cached.expiresAt)>Date.now())return {...cached,cached:true};
  if(pending.has(key))return pending.get(key);
  const task=(async()=>{try{
    const mintKey='raydium:mint:v1:'+contract;
    let mint=await saved(env,mintKey,86400);
    if(!mint){mint=normalizeMint(await read(env,'https://api-v3.raydium.io/mint/ids?'+new URLSearchParams({mints:contract})),contract);await save(env,mintKey,mint);}
    const units=tokenUnits(amount,mint.decimals),requestedAt=Date.now();
    const quote=normalizeQuote(await read(env,'https://transaction-v1.raydium.io/compute/swap-base-in?'+new URLSearchParams({inputMint:contract,outputMint:USDC,amount:units,slippageBps:String(slippageBps),txVersion:'V0'})),contract,units,slippageBps,mint.decimals);
    const received=Date.now(),expires=requestedAt+30000;
    if(received>=expires)throw fail('The quote expired while loading. Request another preview.');
    const result={...quote,requestedAt:new Date(requestedAt).toISOString(),fetchedAt:new Date(received).toISOString(),expiresAt:new Date(expires).toISOString(),cached:false};
    await save(env,key,result);return result;
  }catch(e){throw e.status?e:fail('The sell preview could not be loaded. Please try again.');}finally{pending.delete(key);}})();
  pending.set(key,task);return task;
}
