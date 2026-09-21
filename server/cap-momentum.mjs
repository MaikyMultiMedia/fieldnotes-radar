import {market,NETWORKS,address} from './market.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v))),n=>n.toString(16).padStart(2,'0')).join('');
export function capChange(before,after){
  if(['chain','contract','pool','provider'].some(k=>!before[k]||before[k]!==after[k]))return null;
  const elapsed=(after.received-before.received)/1000;
  if(!Number.isFinite(elapsed)||elapsed<=0||elapsed>300||!positive(before.marketCap)||!positive(after.marketCap))return null;
  const delta=after.marketCap-before.marketCap,changePct=100*delta/before.marketCap;
  if(!Number.isFinite(delta)||!Number.isFinite(changePct)||Math.abs(delta)<2000||!(changePct>=50||changePct<=-30))return null;
  return{kind:'received_cap_change',direction:delta>0?'rise':'fall',chain:after.chain,contract:after.contract,pool:after.pool,provider:after.provider,sourceObservedAt:null,beforeReceived:before.received,afterReceived:after.received,elapsedSeconds:elapsed,capBefore:before.marketCap,capAfter:after.marketCap,delta,changePct,token:after.token,classification:'Market-cap estimates between received snapshots; holder growth not established'};
}
async function savedSignals(env,chain){const r=await env.DB.prepare('SELECT id,payload FROM cap_signals WHERE chain=? AND detected>=? ORDER BY detected DESC,id LIMIT 30').bind(chain,Date.now()-86400000).run();return r.results.map(r=>({...JSON.parse(r.payload),id:r.id}));}
export async function signalEvidence(env,id,identity){
  if(!/^[a-f0-9]{64}$/.test(id||''))throw fail('Choose a saved market-cap signal.');
  const row=await env.DB.prepare('SELECT id,payload FROM cap_signals WHERE id=? AND detected>=?').bind(id,Date.now()-86400000).first();
  if(!row)throw fail('This signal is no longer available. Refresh Launch Radar.',409);
  const signal={...JSON.parse(row.payload),id:row.id};
  if(['chain','contract','pool'].some(k=>signal[k]!==identity[k]))throw fail('The signal does not match this exact token and pool.');
  return signal;
}
export async function captureCaps(snapshot,env){
  const now=Date.now(),received=Date.parse(snapshot.fetchedAt),base={status:'unavailable',receivedAt:snapshot.fetchedAt,eligible:0,compared:0,captured:0,added:0};
  if(snapshot.status!=='fresh'||snapshot.provider!=='GeckoTerminal'||!Number.isFinite(received)||received>now||now-received>120000)return{...base,signals:await savedSignals(env,snapshot.chain)};
  const seen=new Set(),samples=[];
  for(const t of snapshot.pools.slice(0,20)){
    if(!positive(t.marketCap)||t.chain!==snapshot.chain)continue;
    try{if(address(t.chain,t.contract)!==t.contract||address(t.chain,t.pool)!==t.pool)continue;}catch{continue;}
    const identity=await hash(t.chain+':'+t.contract+':'+t.pool);if(seen.has(identity))continue;seen.add(identity);
    samples.push({identity,id:await hash(identity+':'+received),chain:t.chain,contract:t.contract,pool:t.pool,marketCap:t.marketCap,provider:'GeckoTerminal',received,token:t});
  }
  base.status='collecting';base.eligible=samples.length;
  if(samples.length){
    const old=(await env.DB.prepare('SELECT identity,fetched,payload FROM cap_observations WHERE fetched>=? AND identity IN ('+samples.map(()=>'?').join(',')+') ORDER BY fetched ASC LIMIT 2000').bind(received-300000,...samples.map(s=>s.identity)).run()).results;
    const priorByKey=new Map();for(const r of old){const list=priorByKey.get(r.identity)||[];list.push(JSON.parse(r.payload));priorByKey.set(r.identity,list);}
    const work=samples.filter(s=>!(priorByKey.get(s.identity)||[]).some(p=>p.received>=s.received));
    const claims=work.length?await env.DB.batch(work.map(s=>env.DB.prepare('INSERT OR IGNORE INTO cap_observations (id,identity,fetched,payload) VALUES (?,?,?,?)').bind(s.id,s.identity,received,JSON.stringify(s)))):[];
    const alerts=[];
    for(let i=0;i<work.length;i++){
      if(!claims[i].meta.changes)continue;const sample=work[i],prior=priorByKey.get(sample.identity)||[];base.captured++;if(prior.length)base.compared++;
      // Match the original engine: oldest qualifying baseline, then a 60s directional cooldown.
      const signal=prior.map(p=>capChange(p,sample)).find(Boolean);if(!signal)continue;
      const id=await hash(sample.id+':'+signal.direction),payload={...signal,detected:now,beforeId:prior.find(p=>p.received===signal.beforeReceived).id,afterId:sample.id};
      alerts.push(env.DB.prepare('INSERT OR IGNORE INTO cap_signals (id,identity,chain,direction,after,detected,payload) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM cap_signals WHERE identity=? AND direction=? AND after>?)').bind(id,sample.identity,sample.chain,signal.direction,received,now,JSON.stringify(payload),sample.identity,signal.direction,received-60000));
    }
    // All 20 matches plus capture/read/prune remain under D1's 50-query free invocation limit.
    if(alerts.length){const saved=await env.DB.batch(alerts);base.added=saved.reduce((n,r)=>n+(r.meta.changes||0),0);}
  }
  await env.DB.batch([env.DB.prepare('DELETE FROM cap_observations WHERE fetched<? OR id NOT IN (SELECT id FROM cap_observations ORDER BY fetched DESC,id LIMIT 2000)').bind(now-600000),env.DB.prepare('DELETE FROM cap_signals WHERE detected<? OR id NOT IN (SELECT id FROM cap_signals ORDER BY detected DESC,id LIMIT 300)').bind(now-86400000)]);
  return{...base,signals:await savedSignals(env,snapshot.chain)};
}
export async function capRadar(request,env,input){
  if(request.method!=='POST')throw fail('Not found',404);
  const chain=input?.chain,mode=input?.mode;
  if(!NETWORKS[chain]||!['trending','new','search'].includes(mode))throw fail('Choose a supported network and radar view.');
  const params=new URLSearchParams({chain,mode});if(mode==='search')params.set('q',typeof input.q==='string'?input.q:'');
  const snapshot=await market(new Request(new URL('/api/market?'+params,request.url)),env);
  try{return{...snapshot,momentum:await captureCaps(snapshot,env)};}
  catch{return{...snapshot,momentum:{status:'unavailable',eligible:0,compared:0,captured:0,added:0,signals:[],error:'Market-cap tracking could not be saved. The market snapshot is still available.'}};}
}
