import {address} from './market.mjs';
const WINDOWS={'24h':24,'48h':48,'72h':72,'7d':168};
const fail=()=>Object.assign(new Error('Saved buyer discovery supports 24h, 48h, 72h and 7d. Only seven days of observations are retained.'),{status:400});
const label=(value,max)=>typeof value==='string'?value.slice(0,max):'';

export function summarizeBuyers(records,window='24h',now=Date.now()){
  if(!Object.hasOwn(WINDOWS,window))throw fail();
  const since=now-WINDOWS[window]*3600000,groups=new Map(),seen=new Set();let matched=0,excluded=0;
  for(const record of records.slice(0,500)){
    const t=record.trade,time=Date.parse(t?.time);
    if(!Number.isFinite(record.detected)||record.detected>now||record.detected<now-7*86400000||!Number.isFinite(time)||time<since||time>now)continue;
    let sender,contract,pool,tx;
    try{
      sender=address(record.chain,t.sender);contract=address(record.chain,record.contract);pool=address(record.chain,record.pool);
      if(record.provider!=='GeckoTerminal'||t.side!=='buy'||!Number.isFinite(t.usd)||t.usd<=0||typeof t.id!=='string'||!t.id||t.id.length>240)throw Error();
      if(typeof t.tx!=='string'||!(record.chain==='solana'?/^[1-9A-HJ-NP-Za-km-z]{64,88}$/:/^0x[a-fA-F0-9]{64}$/).test(t.tx))throw Error();
      tx=record.chain==='solana'?t.tx:t.tx.toLowerCase();
    }catch{excluded++;continue;}
    const eventKey=[record.chain,contract,pool,t.id].join(':');if(seen.has(eventKey))continue;seen.add(eventKey);matched++;
    const key=record.chain+':'+sender,early=t.earlyPoolBuy===true&&Number.isFinite(t.poolAgeSeconds)&&t.poolAgeSeconds>=0&&t.poolAgeSeconds<=600;
    const evidence={usd:t.usd,time:new Date(time).toISOString(),detected:new Date(record.detected).toISOString(),tx,contract,pool,symbol:label(record.token?.symbol,20),early};
    let row=groups.get(key);
    if(!row){row={key,chain:record.chain,address:sender,swaps:0,earlySwaps:0,first:time,last:time,largest:evidence,transactions:new Set(),pools:new Set(),tokens:new Set()};groups.set(key,row);}
    row.swaps++;row.earlySwaps+=Number(early);row.first=Math.min(row.first,time);row.last=Math.max(row.last,time);row.transactions.add(tx);row.pools.add(pool);row.tokens.add(contract);
    if(t.usd>row.largest.usd||(t.usd===row.largest.usd&&time>Date.parse(row.largest.time)))row.largest=evidence;
  }
  const rows=[...groups.values()].map(({transactions,pools,tokens,first,last,...row})=>({...row,transactions:transactions.size,pools:pools.size,tokens:tokens.size,first:new Date(first).toISOString(),last:new Date(last).toISOString()}));
  rows.sort((a,b)=>b.largest.usd-a.largest.usd||b.transactions-a.transactions||a.key.localeCompare(b.key));
  return{window,since:new Date(since).toISOString(),assembledAt:new Date(now).toISOString(),provider:'GeckoTerminal',scope:'saved_buy_alerts',complete:false,retentionDays:7,recordLimit:500,recordsRead:Math.min(records.length,500),atRecordLimit:records.length>=500,matchedSwaps:matched,excluded,rows};
}

export async function discoverBuyers(request,env){
  const window=new URL(request.url).searchParams.get('window')||'24h';if(!Object.hasOwn(WINDOWS,window))throw fail();
  const now=Date.now();
  const result=await env.DB.prepare('SELECT payload,detected FROM buy_alerts WHERE detected>=? AND detected<=? ORDER BY detected DESC,id LIMIT 500').bind(now-7*86400000,now).run();
  const records=result.results.map(row=>{try{return{...JSON.parse(row.payload),detected:row.detected};}catch{return{detected:row.detected};}});
  return summarizeBuyers(records,window,now);
}
