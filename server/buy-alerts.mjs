import {address,market} from './market.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
const WEEK=7*86400000;
const identity=r=>new URLSearchParams({chain:r.chain,contract:r.contract,pool:r.pool});
export function alertSettings(input){
  const chain=input.chain,contract=address(chain,input.contract),pool=address(chain,input.pool);
  if(typeof input.minUsd!=='number'||!Number.isFinite(input.minUsd)||input.minUsd<1||input.minUsd>1e9)throw fail('Minimum buy must be between $1 and $1 billion.');
  if(typeof input.early!=='boolean'||typeof input.followed!=='boolean')throw fail('Choose valid alert filters.');
  return{chain,contract,pool,minUsd:input.minUsd,early:input.early,followed:input.followed};
}
export function alertCandidates(rule,snapshot,wallets,now=Date.now()){
  const received=Date.parse(snapshot.fetchedAt),details=Date.parse(snapshot.detailsFetchedAt);
  if(snapshot.status!=='fresh'||snapshot.detailsStatus!=='fresh'||![received,details].every(t=>Number.isFinite(t)&&t<=now&&now-t<=120000))return[];
  if(['chain','contract','pool'].some(k=>snapshot[k]!==rule[k]||snapshot.poolDetails?.[k]!==rule[k]))return[];
  const followed=new Set(wallets.filter(w=>w.chain===rule.chain).map(w=>w.address));
  return snapshot.trades.filter(t=>t.side==='buy'&&Number.isFinite(t.usd)&&t.usd>=rule.minUsd&&Date.parse(t.time)>=rule.updated&&Date.parse(t.time)<=now&&(!rule.early||t.earlyPoolBuy===true)&&(!rule.followed||followed.has(t.sender)));
}
const ruleView=r=>({...JSON.parse(r.payload),id:r.id,updated:r.updated,revision:r.revision,checked:r.checked,lastScan:r.scan?JSON.parse(r.scan):null});
async function list(env,unread=false){
  const results=await env.DB.batch([env.DB.prepare('SELECT * FROM buy_alert_rules ORDER BY updated DESC LIMIT 3'),env.DB.prepare('SELECT * FROM buy_alerts WHERE detected>=?'+(unread?' AND seen=0':'')+' ORDER BY detected DESC,id LIMIT 100').bind(Date.now()-WEEK),env.DB.prepare('SELECT count(*) AS total, sum(CASE WHEN seen=0 THEN 1 ELSE 0 END) AS unread FROM buy_alerts WHERE detected>=?').bind(Date.now()-WEEK)]);
  return{rules:results[0].results.map(r=>{const v=ruleView(r);if(v.lastScan)delete v.lastScan.recentIds;return v;}),alerts:results[1].results.map(r=>({...JSON.parse(r.payload),id:r.id,detected:r.detected,seen:!!r.seen})),total:results[2].results[0].total,unread:results[2].results[0].unread||0};
}
async function audit(env,user,action,subject){await env.DB.prepare('INSERT INTO activity (id,user,action,subject,at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),user,action,subject,Math.floor(Date.now()/1000)).run();}
async function scan(env){
  const now=Date.now(),row=await env.DB.prepare('SELECT * FROM buy_alert_rules WHERE checked<=? ORDER BY checked,id LIMIT 1').bind(now-60000).first();
  if(!row)return{scanned:false,added:0,message:'No pool is due yet. Each saved pool can be checked once a minute.'};
  // Claim once across both users. Rules are checked in rotation; no background scheduler.
  const claim=await env.DB.prepare('UPDATE buy_alert_rules SET checked=? WHERE id=? AND revision=? AND checked=?').bind(now,row.id,row.revision,row.checked).run();
  if(!claim.meta.changes)return{scanned:false,added:0,message:'Another scan is already checking this pool.'};
  const rule=ruleView(row);let report,added=0;
  try{
    const snapshot=await market(new Request('https://workspace.internal/api/market/trades?'+identity(rule)),env),detected=Date.now();
    if(snapshot.status!=='fresh'||snapshot.detailsStatus!=='fresh'||[snapshot.fetchedAt,snapshot.detailsFetchedAt].some(t=>!Number.isFinite(Date.parse(t))||detected-Date.parse(t)>120000||Date.parse(t)>detected))throw fail('Only an older snapshot is available. No new alerts were recorded.',503);
    const wallets=(await env.DB.prepare('SELECT chain,address FROM wallets').run()).results;
    const previousIds=new Set(rule.lastScan?.recentIds||[]);
    const candidates=alertCandidates(rule,snapshot,wallets,detected).filter(t=>!previousIds.has(t.id)),writes=[];
    for(const trade of candidates){
      const id=await hash(rule.chain+':'+rule.contract+':'+rule.pool+':'+trade.id);
      const payload={trade,token:snapshot.poolDetails,chain:rule.chain,contract:rule.contract,pool:rule.pool,provider:'GeckoTerminal',fetchedAt:snapshot.fetchedAt,detailsFetchedAt:snapshot.detailsFetchedAt,latencySeconds:Math.floor((detected-Date.parse(trade.time))/1000),rule:{minUsd:rule.minUsd,early:rule.early,followed:rule.followed,since:rule.updated},coverage:snapshot.coverage};
      writes.push(env.DB.prepare('INSERT OR IGNORE INTO buy_alerts (id,detected,seen,payload) SELECT ?,?,0,? WHERE EXISTS (SELECT 1 FROM buy_alert_rules WHERE id=? AND revision=?)').bind(id,detected,JSON.stringify(payload),rule.id,rule.revision));
    }
    // D1 batches stay bounded; every insert still checks the rule revision.
    for(let i=0;i<writes.length;i+=50){const result=await env.DB.batch(writes.slice(i,i+50));added+=result.reduce((sum,r)=>sum+(r.meta.changes||0),0);}
    report={recentIds:snapshot.trades.map(t=>t.id),at:detected,status:'sampled',added,matched:candidates.length,fetchedAt:snapshot.fetchedAt,coverage:snapshot.coverage,unknownUsd:snapshot.trades.filter(t=>t.usd===null).length,gapPossible:!snapshot.coverage.oldest||Date.parse(snapshot.coverage.oldest)>Math.max(rule.updated,rule.lastScan?.status==='sampled'?Date.parse(rule.lastScan.fetchedAt):rule.updated)};
  }catch(e){report={recentIds:rule.lastScan?.recentIds||[],at:Date.now(),status:'unavailable',error:e.status?e.message:'The pool could not be checked. Try again shortly.'};}
  await env.DB.batch([env.DB.prepare('UPDATE buy_alert_rules SET scan=? WHERE id=? AND revision=? AND checked=?').bind(JSON.stringify(report),rule.id,rule.revision,now),env.DB.prepare('DELETE FROM buy_alerts WHERE detected<? OR id NOT IN (SELECT id FROM buy_alerts ORDER BY detected DESC,id LIMIT 500)').bind(Date.now()-WEEK)]);
  const {recentIds,...visibleReport}=report;return{scanned:true,added,report:visibleReport};
}
export async function buyAlerts(request,env,user,input){
  const url=new URL(request.url),path=url.pathname,method=request.method,unread=url.searchParams.get('unread')==='1';
  if(path==='/api/alerts'&&method==='GET')return list(env,unread);
  if(path==='/api/alerts/scan'&&method==='POST')return{...await scan(env),...await list(env,unread)};
  if(path==='/api/alerts/rules'&&method==='POST'){
    const settings=alertSettings(input),id=await hash(settings.chain+':'+settings.contract+':'+settings.pool),old=await env.DB.prepare('SELECT * FROM buy_alert_rules WHERE id=?').bind(id).first();
    if(old&&input.revision!==old.revision)throw fail('This rule changed. Refresh before saving.',409);
    const snapshot=await market(new Request('https://workspace.internal/api/market/pool?'+identity(settings)),env);
    const updated=Date.now(),payload=JSON.stringify({...settings,token:snapshot.poolDetails,author:user});
    const result=old?await env.DB.prepare('UPDATE buy_alert_rules SET payload=?,updated=?,revision=revision+1,checked=0,scan=NULL WHERE id=? AND revision=?').bind(payload,updated,id,input.revision).run():await env.DB.prepare('INSERT OR IGNORE INTO buy_alert_rules (id,payload,updated,revision,checked) SELECT ?,?,?,1,0 WHERE (SELECT count(*) FROM buy_alert_rules)<3').bind(id,payload,updated).run();
    if(!result.meta.changes)throw fail('Rules changed or all three pool slots are in use. Refresh before trying again.',409);
    await audit(env,user,old?'updated buy alert rule':'saved buy alert rule',snapshot.poolDetails.symbol);
    return list(env,unread);
  }
  const match=path.match(/^\/api\/alerts\/(rules|seen)\/([a-f0-9]{64})$/);
  if(match&&method==='POST'){
    if(match[1]==='seen'){await env.DB.prepare('UPDATE buy_alerts SET seen=1 WHERE id=?').bind(match[2]).run();return{ok:true};}
    const removed=await env.DB.prepare('DELETE FROM buy_alert_rules WHERE id=? AND revision=?').bind(match[2],input.revision).run();
    if(!removed.meta.changes)throw fail('This rule changed. Refresh before removing it.',409);
    await audit(env,user,'removed buy alert rule','Saved alerts retained');return list(env,unread);
  }
  throw fail('Not found',404);
}
