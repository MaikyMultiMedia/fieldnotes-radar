import {address,number,market} from './market.mjs';
import {savedChecks} from './token-checks.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const iso=at=>new Date(at).toISOString();
export const PAPER_TAGS=['manual','shortlist','large_buy'];
export function assumptions(input){
  const range=(key,min,max)=>{const n=number(input[key]);if(n===null||n<min||n>max)throw fail('Invalid paper assumption: '+key+'.');return n;};
  const value={outlay:range('outlay',1,10000),feePct:range('feePct',0,10),fixedFee:range('fixedFee',0,100),slippagePct:range('slippagePct',0,30),delaySeconds:range('delaySeconds',60,300)};
  if(![60,120,300].includes(value.delaySeconds))throw fail('Choose a 1, 2 or 5 minute entry delay.');
  if(value.outlay*(1-value.feePct/100)-value.fixedFee<=0)throw fail('The assumed entry fees consume the entire outlay.');
  return value;
}
export function paperValue(quantity,price,a){
  if(!finite(quantity)||quantity<=0||!finite(price)||price<=0)return null;
  const gross=quantity*price,proceeds=Math.max(0,gross*(1-a.slippagePct/100)*(1-a.feePct/100)-a.fixedFee);
  const pnl=proceeds-a.outlay,returnPct=pnl/a.outlay*100;
  return [gross,proceeds,pnl,returnPct].every(finite)?{gross,proceeds,pnl,returnPct}:null;
}
export function quoteProblem(q,trial,now){
  if(!q||q.status!=='fresh')return 'A fresh provider snapshot is unavailable.';
  const at=Date.parse(q.fetchedAt);
  if(!Number.isFinite(at)||at>now||now-at>120000)return 'This provider snapshot is too old to use.';
  const t=q.poolDetails;
  if(!t||t.chain!==trial.chain||t.contract!==trial.contract||t.pool!==trial.pool)return 'The quote does not match the saved network, contract and pool.';
  if(!finite(t.price)||t.price<=0)return 'A positive observed price is required.';
  if(!finite(t.liquidity)||t.liquidity<=0)return 'Positive reported pool liquidity is required.';
  const value=trial.entry?trial.entry.quantity*t.price:trial.assumptions.outlay;
  if(!finite(value)||value>t.liquidity*.01)return 'The hypothetical size exceeds 1% of reported pool liquidity. No mark is assumed.';
  return null;
}
function markFrom(trial,q,now){
  const value=paperValue(trial.entry.quantity,q.poolDetails.price,trial.assumptions);
  if(!value)return null;
  return {...value,at:q.fetchedAt,capturedAt:iso(now),price:q.poolDetails.price,liquidity:q.poolDetails.liquidity,sourceUrl:q.poolDetails.sourceUrl};
}
export function advancePaper(trial,q,now){
  const t=structuredClone(trial);
  if(!['waiting','open'].includes(t.status))return t;
  if(t.status==='waiting'&&now>t.deadlineAt){t.status='missed';t.lastCheck={at:iso(now),outcome:'missed',reason:'No usable later snapshot was captured inside the five-minute entry window.'};return t;}
  if(t.status==='waiting'&&now<t.eligibleAt)return t;
  const problem=quoteProblem(q,t,now);
  if(problem){t.lastCheck={at:iso(now),outcome:'unavailable',reason:problem};return t;}
  const fetched=Date.parse(q.fetchedAt);
  if(t.status==='waiting'){
    if(fetched<t.eligibleAt||fetched<=Date.parse(t.seed.fetchedAt)){t.lastCheck={at:iso(now),outcome:'waiting',reason:'Waiting for a new provider snapshot after the entry delay.'};return t;}
    const a=t.assumptions,entryPrice=q.poolDetails.price*(1+a.slippagePct/100),quantity=(a.outlay*(1-a.feePct/100)-a.fixedFee)/entryPrice;
    const driftPct=(q.poolDetails.price/t.seed.price-1)*100;
    if(!finite(quantity)||quantity<=0||!finite(driftPct)){t.lastCheck={at:iso(now),outcome:'unavailable',reason:'The paper calculation is outside the supported numeric range.'};return t;}
    t.entry={at:q.fetchedAt,capturedAt:iso(now),sourcePrice:q.poolDetails.price,effectivePrice:entryPrice,quantity,liquidity:q.poolDetails.liquidity,delaySeconds:(fetched-t.createdAt)/1000,driftPct};t.status='open';
  }
  if(t.lastMark&&fetched<Date.parse(t.lastMark.at))return t;
  const mark=markFrom(t,q,now);
  if(!mark){t.lastCheck={at:iso(now),outcome:'unavailable',reason:'The paper calculation is outside the supported numeric range.'};return t;}
  if(!t.lastMark||fetched>Date.parse(t.lastMark.at)){
    t.lastMark=mark;t.observations++;t.highestObserved=Math.max(t.highestObserved??mark.proceeds,mark.proceeds);t.lowestObserved=Math.min(t.lowestObserved??mark.proceeds,mark.proceeds);
    t.marks.push(mark);if(t.marks.length>120)t.marks.splice(1,t.marks.length-120);
  }
  t.lastCheck={at:iso(now),outcome:'observed',reason:'Provider snapshot captured; no execution quote or fill verified.'};return t;
}
export function paperView(t,now){
  const status=t.status==='waiting'&&now>t.deadlineAt?'missed':t.status;
  const fresh=status==='open'&&t.lastMark&&now-Date.parse(t.lastMark.at)<=120000&&t.lastCheck?.outcome==='observed';
  return {...t,status,currentMark:fresh?t.lastMark:null,markStatus:status==='closed'?'closed':fresh?'fresh':t.lastMark?'stale':'unavailable'};
}
export function paperSummary(trials){
  const closed=trials.filter(t=>t.status==='closed'&&finite(t.exit?.pnl));
  const result={total:trials.length,waiting:trials.filter(t=>t.status==='waiting').length,open:trials.filter(t=>t.status==='open').length,closed:closed.length,missed:trials.filter(t=>t.status==='missed').length,cancelled:trials.filter(t=>t.status==='cancelled').length,closedPnl:closed.length?closed.reduce((sum,t)=>sum+t.exit.pnl,0):null,winRate:closed.length?closed.filter(t=>t.exit.pnl>0).length/closed.length*100:null};
  result.byTag=PAPER_TAGS.map(tag=>{const all=trials.filter(t=>t.tag===tag),done=closed.filter(t=>t.tag===tag);return{tag,total:all.length,closed:done.length,missed:all.filter(t=>t.status==='missed').length,cancelled:all.filter(t=>t.status==='cancelled').length,meanReturnPct:done.length?done.reduce((sum,t)=>sum+t.exit.returnPct,0)/done.length:null,pnl:done.length?done.reduce((sum,t)=>sum+t.exit.pnl,0):null};});return result;
}
const decode=row=>row?{...JSON.parse(row.payload),revision:row.revision}:null;
const get=(env,id)=>env.DB.prepare('SELECT payload,revision FROM paper_trials WHERE id=?').bind(id).first().then(decode);
async function audit(env,user,action,subject,now){await env.DB.prepare('INSERT INTO activity (id,user,action,subject,at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),user,action,subject,Math.floor(now/1000)).run();}
async function update(env,before,after,now){
  const payload={...after};delete payload.revision;
  const r=await env.DB.prepare('UPDATE paper_trials SET status=?,updated=?,revision=revision+1,payload=? WHERE id=? AND revision=?').bind(after.status,now,JSON.stringify(payload),before.id,before.revision).run();
  if(!r.meta.changes)throw fail('This paper trial changed. Refresh before trying again.',409);
  return {...after,revision:before.revision+1};
}
async function quote(request,env,t){return market(new Request(new URL('/api/market/pool?'+new URLSearchParams({chain:t.chain,contract:t.contract,pool:t.pool}),request.url)),env);}
export async function paper(request,env,user,input=null){
  const path=new URL(request.url).pathname,now=Date.now();
  if(path==='/api/paper'&&request.method==='GET'){
    const rows=await env.DB.prepare('SELECT payload,revision FROM paper_trials ORDER BY created DESC LIMIT 200').run();
    const trials=rows.results.map(row=>paperView(decode(row),now));return {trials,summary:paperSummary(trials),asOf:iso(now)};
  }
  if(path==='/api/paper'&&request.method==='POST'){
    if(!input||!/^[-a-f0-9]{36}$/.test(input.id||''))throw fail('A paper trial request ID is required.');
    const a=assumptions(input),chain=input.chain,contract=address(chain,input.contract),pool=address(chain,input.pool);
    const tag=input.tag,thesis=typeof input.thesis==='string'?input.thesis.trim():'';
    if(!PAPER_TAGS.includes(tag)||!thesis||thesis.length>2000)throw fail('Choose a research reason and write a thesis of 1–2,000 characters.');
    const prior=await get(env,input.id);
    if(prior){if(prior.chain!==chain||prior.contract!==contract||prior.pool!==pool||prior.tag!==tag||prior.thesis!==thesis||JSON.stringify(prior.assumptions)!==JSON.stringify(a))throw fail('This request ID already belongs to another trial.',409);return {trial:paperView(prior,now)};}
    const count=await env.DB.prepare("SELECT count(*) AS total,sum(CASE WHEN status='open' OR (status='waiting' AND eligible+300000>=?) THEN 1 ELSE 0 END) AS active FROM paper_trials").bind(now).first();
    if(count.total>=200||count.active>=20)throw fail('Paper journal limit reached: 200 total trials and 20 active. Close or cancel active trials first.');
    const t={id:input.id,chain,contract,pool,tag,thesis,reflection:'',assumptions:a,createdAt:now,eligibleAt:now+a.delaySeconds*1000,deadlineAt:now+(a.delaySeconds+300)*1000,author:user,status:'waiting',entry:null,lastMark:null,exit:null,marks:[],observations:0,highestObserved:null,lowestObserved:null,lastCheck:null};
    const q=await quote(request,env,t),problem=quoteProblem(q,t,Date.now());if(problem)throw fail(problem,422);
    t.tokenChecks=await savedChecks(env,chain,contract,Date.now());
    t.symbol=q.poolDetails.symbol;t.name=q.poolDetails.name;t.seed={price:q.poolDetails.price,liquidity:q.poolDetails.liquidity,marketCap:q.poolDetails.marketCap,volume24h:q.poolDetails.volume24h,change5m:q.poolDetails.change5m,fetchedAt:q.fetchedAt,sourceUrl:q.poolDetails.sourceUrl,provider:q.provider};
    const r=await env.DB.prepare('INSERT OR IGNORE INTO paper_trials (id,chain,contract,pool,status,author,created,eligible,updated,revision,payload) VALUES (?,?,?,?,?,?,?,?,?,1,?)').bind(t.id,chain,contract,pool,'waiting',user,now,t.eligibleAt,now,JSON.stringify(t)).run();
    if(!r.meta.changes)throw fail('The trial was already created. Refresh the journal.',409);
    await audit(env,user,'started paper trial',t.symbol,now);return {trial:paperView({...t,revision:1},Date.now())};
  }
  if(path==='/api/paper/observe'&&request.method==='POST'){
    const expired=await env.DB.prepare("UPDATE paper_trials SET status='missed',updated=?,revision=revision+1,payload=json_set(payload,'$.status','missed','$.lastCheck',json(?)) WHERE status='waiting' AND eligible+300000<?").bind(now,JSON.stringify({at:iso(now),outcome:'missed',reason:'No usable later snapshot was captured inside the five-minute entry window.'}),now).run();
    if(expired.meta.changes)await audit(env,user,'recorded missed paper entries',String(expired.meta.changes),now);
    const rows=await env.DB.prepare("SELECT payload,revision FROM paper_trials WHERE status='open' OR (status='waiting' AND eligible<=?) ORDER BY CASE WHEN status='waiting' THEN 0 ELSE 1 END,updated ASC LIMIT 4").bind(now).run();
    const results=[];
    for(const row of rows.results){const before=decode(row);try{
      let q=null,error=null;
      if(!(before.status==='waiting'&&Date.now()>before.deadlineAt))try{q=await quote(request,env,before);}catch(e){error=e.status?e.message:'Provider refresh failed.';}
      const after=advancePaper(before,q,Date.now());if(error&&after.status!=='missed')after.lastCheck.reason=error;
      const saved=await update(env,before,after,Date.now());
      if(before.status!==after.status)await audit(env,user,after.status==='open'?'observed paper entry':'missed paper entry',after.symbol,Date.now());
      results.push({id:before.id,status:saved.status,error:saved.lastCheck?.outcome==='unavailable'?saved.lastCheck.reason:null});
    }catch(e){results.push({id:before.id,error:e.status?e.message:'Observation could not be saved.'});}}
    return {results};
  }
  const match=path.match(/^\/api\/paper\/([-a-f0-9]{36})\/(close|cancel|reflection)$/);
  if(match&&request.method==='POST'){
    const t=await get(env,match[1]);if(!t)throw fail('Paper trial not found.',404);
    const action=match[2];if(action==='close'&&t.status==='closed')return {trial:paperView(t,now)};
    if(input?.revision!==t.revision)throw fail('This paper trial changed. Refresh before saving.',409);
    let after=structuredClone(t);
    if(action==='reflection'){
      if(typeof input.reflection!=='string'||input.reflection.length>2000)throw fail('Use at most 2,000 characters for the takeaway.');
      after.reflection=input.reflection.trim();
    }else if(action==='cancel'){
      if(!['waiting','open'].includes(t.status))throw fail('This paper trial has already ended.',409);
      const reason=typeof input.reason==='string'?input.reason.trim():'';if(!reason||reason.length>500)throw fail('Record a reason of 1–500 characters.');
      after.status=t.status==='waiting'&&now>t.deadlineAt?'missed':'cancelled';after.endedAt=iso(now);after.endReason=reason;
    }else{
      if(t.status!=='open')throw fail('A paper entry must be observed before it can close.',409);
      const q=await quote(request,env,t),problem=quoteProblem(q,t,Date.now());if(problem)throw fail(problem,422);
      if(Date.parse(q.fetchedAt)<Date.parse(t.lastMark.at))throw fail('The provider snapshot is older than the last observation.',422);
      after=advancePaper(t,q,Date.now());if(after.lastCheck?.outcome!=='observed'||!after.lastMark)throw fail('A current valid paper mark is required.',422);
      after.status='closed';after.exit={...after.lastMark,closedAt:iso(Date.now()),closedBy:user};
    }
    const saved=await update(env,t,after,Date.now());await audit(env,user,action==='reflection'?'updated paper takeaway':action==='close'?'closed paper trial':'ended paper trial',t.symbol,Date.now());return {trial:paperView(saved,Date.now())};
  }
  throw fail('Not found',404);
}
