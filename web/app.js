'use strict';
const $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const compact=n=>new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(n);
const icons={radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 6-6"/>',bookmark:'<path d="M6 4h12v17l-6-4-6 4z"/>',flask:'<path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10"/>',activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',arrow:'<path d="M7 17 17 7M7 7h10v10"/>',plus:'<path d="M12 5v14M5 12h14"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',logout:'<path d="M10 4H4v16h6m4-13 5 5-5 5M9 12h10"/>',refresh:'<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>'};
const icon=k=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[k]||icons.info}</svg>`;
const brand=`<a href="#radar" class="brand"><span class="mark">f.</span>fieldnotes<small> /</small></a>`;
const person=e=>e?.startsWith('maiky')?'Maiky':'Alexander';
const initials=e=>e?.startsWith('maiky')?'MM':'AP';
const statusName=s=>({researching:'Researching',watching:'Watching',passed:'Passed'})[s]||s;
let state=null,view='radar',filter='all',query='',busy=false,selected=null,currentCommit=null;
async function api(path,options={}){const r=await fetch('/api/'+path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});let d;try{d=await r.json();}catch{throw Error('The server did not respond. Please try again.');}if(!r.ok){if(r.status===401&&path!=='login'){state=null;login();}throw Error(d.error||'Something went wrong.');}return d;}
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,4500);}
function login(){document.title='Sign in · Fieldnotes';$('#app').innerHTML=`<div class="login"><section class="login-art">${brand}<div class="intro"><div class="eyebrow">YOUR SHARED RESEARCH DESK</div><h1>Less impulse.<br><em>More conviction.</em></h1><p>A place to inspect the move, compare your notes, and build your next watchlist together.</p><div class="graphic"><div class="row between"><span class="fine">Observe → Research → Decide</span>${icon('radar')}</div><svg viewBox="0 0 400 80" fill="none" aria-hidden="true"><path d="M0 60H400M0 30H400" stroke="#2b3a30"/><path d="M0 65 35 60 62 66 89 46 114 50 146 28 169 39 207 22 237 28 267 14 299 24 329 12 362 19 400 6" stroke="#aaf35f" stroke-width="2"/></svg><span class="fine">Illustration · not market data</span></div></div><div class="bottom">FIELDNOTES / PRIVATE WORKSPACE</div></section><section class="login-form-wrap"><div class="login-form"><div class="eyebrow">WELCOME BACK</div><h2>Enter your workspace</h2><p>Sign in with your invited email address.</p><form id="login-form"><label class="field">Email address<input type="email" name="email" autocomplete="username" placeholder="you@example.com" required maxlength="254"></label><label class="field">Password<div class="password-box"><input type="password" name="password" autocomplete="current-password" placeholder="Your password" required maxlength="200"><button type="button" id="show-password" aria-label="Show password">${icon('eye')}</button></div></label><button class="primary" type="submit">Sign in ${icon('arrow')}</button><div id="login-error" class="error" role="alert"></div></form><p class="fine">${icon('lock')} Invite-only access for Maiky and Alexander.<br>This is your research workspace. Your Fomo account stays separate.</p></div></section></div>`;}
const navItems=[['radar','radar','Launch Radar'],['watchlist','bookmark','Watchlist'],['research','flask','Research Desk'],['activity','activity','Activity']];
function shell(){document.title='Fieldnotes · '+(navItems.find(x=>x[0]===view)?.[2]||'Workspace');$('#app').innerHTML=`<div class="shell"><aside class="sidebar">${brand}<div class="eyebrow">SHARED RESEARCH LAB</div><nav class="nav" aria-label="Main navigation">${navItems.map(([id,ic,label])=>`<button data-view="${id}" class="${view===id?'active':''}" ${view===id?'aria-current="page"':''}>${icon(ic)}${label}${id==='watchlist'?`<span class="count">${state.watchlist.length}</span>`:''}</button>`).join('')}</nav><div class="side-bottom"><a class="github-link row" href="https://github.com/MaikyMultiMedia/fieldnotes-radar" target="_blank" rel="noopener noreferrer">${icon('code')} Connected to GitHub ${icon('arrow')}</a><div class="account row"><span class="avatar">${initials(state.user)}</span><div><div class="account-name">${person(state.user)}</div><div class="fine">Shared workspace</div></div><button class="quiet icon-btn" id="logout" aria-label="Sign out">${icon('logout')}</button></div></div></aside><main class="main"><header class="topbar"><div class="crumb">Workspace <strong>/ ${navItems.find(x=>x[0]===view)?.[2]}</strong></div><div class="row"><span class="workspace-pill">Maiky + Alexander</span><a class="button" href="https://fomo.family/" target="_blank" rel="noopener noreferrer">Open Fomo ${icon('arrow')}</a><button class="quiet icon-btn mobile-logout" data-action="logout" aria-label="Sign out">${icon('logout')}</button></div></header><div id="page"></div><footer class="footer"><span>Research here. Review and trade in Fomo.</span><span id="release-status">${state.release.mode==='github'?'GitHub sync active':'Bundled release'} · ${esc(state.release.commit.slice(0,7))}</span></footer></main></div>`;renderPage();}
function header(title,subtitle,action=''){return `<div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;}
const addButton=()=>`<button class="primary" data-action="add">${icon('plus')} Add token</button>`;
function emptyWatch(){return `<div class="empty">${icon('bookmark')}<h3>Your next idea starts here</h3><p>Add a token by its exact contract, then keep your research and notes together.</p><button data-action="add">${icon('plus')} Add your first token</button></div>`;}
function tokenRow(t){return `<article class="token-card"><div class="row between"><div class="row"><div class="coin">${esc(t.symbol.slice(0,1))}</div><div><div class="token-name">${esc(t.name)} <span class="fine">${esc(t.symbol)}</span></div><span class="fine">${esc(t.chain)} · ${person(t.author)}</span></div></div><span class="badge ${t.status==='watching'?'green':''}">${statusName(t.status)}</span></div><p class="notes">${esc(t.notes||'No research notes yet.')}</p><div class="address mono">${esc(t.contract)}</div><div class="row" style="margin-top:16px"><button data-live="${t.id}">Live research →</button><button data-edit="${t.id}">Edit notes</button><button class="quiet" data-copy="${t.id}">${icon('copy')} Copy contract</button></div></article>`;}
function watchlist(){const rows=state.watchlist.filter(t=>`${t.name} ${t.symbol} ${t.contract} ${t.notes}`.toLowerCase().includes(query.toLowerCase()));return header('Shared watchlist','Your contracts, your thesis, your next research step.',addButton())+`<section class="panel"><div class="panel-head"><div class="row"><h2>Saved tokens</h2><span class="badge">${state.watchlist.length}</span></div><input class="search" id="search" type="search" aria-label="Search watchlist" placeholder="Search your watchlist…" value="${esc(query)}"></div><div id="watch-rows">${state.watchlist.length?(rows.length?rows.map(tokenRow).join(''):'<div class="empty">No saved tokens match your search.</div>'):emptyWatch()}</div></section>`;}
function activity(){return header('Workspace activity','A shared record of who changed what.')+`<div class="columns"><section class="panel"><div class="panel-head"><h2>Recent activity</h2><button class="quiet" data-action="refresh">${icon('refresh')} Refresh</button></div><div class="panel-body">${state.activity.map(a=>`<div class="activity"><span class="avatar">${initials(a.user)}</span><div><strong>${person(a.user)}</strong> ${esc(a.action)} <strong>${esc(a.subject)}</strong><time datetime="${new Date(a.at*1000).toISOString()}">${new Date(a.at*1000).toLocaleString()}</time></div></div>`).join('')||'<div class="empty">No activity yet.</div>'}</div></section><section class="panel"><div class="panel-head"><h2>GitHub connection</h2>${icon('code')}</div><div class="panel-body"><div class="badge ${state.release.mode==='github'?'green':'amber'}">${state.release.mode==='github'?'Automatic updates active':'Bundled fallback active'}</div><p class="fine" style="margin-top:16px">Checked interface releases from the main branch appear here automatically. Login and saved-data changes require a new server release.</p><div class="definition"><span>Interface</span><b class="mono">${esc(state.release.commit.slice(0,7))}</b></div><div class="definition"><span>Server</span><b class="mono">${esc(state.release.backend.slice(0,7))}</b></div><a class="button" href="https://github.com/MaikyMultiMedia/fieldnotes-radar" target="_blank" rel="noopener noreferrer" style="margin-top:18px">Open project ${icon('arrow')}</a></div></section></div>`;}
function renderPage(){if(!state)return;$('#page').innerHTML=({radar,watchlist,research,activity})[view]();if(view==='radar'&&!markets.data&&!markets.loading&&!markets.error)refreshMarket();if(view==='research'&&selected&&!researchLoading&&!chart.loading&&!chart.error&&!chart.data)refreshChart();}
async function load(){state=await api('workspace');currentCommit??=state.release.commit;shell();}
function modal(token=null){const d=$('#modal');d.innerHTML=`<div class="panel-head"><h2>${token?'Edit token research':'Add to your watchlist'}</h2><button class="quiet icon-btn" data-close aria-label="Close dialog">${icon('close')}</button></div><div class="panel-body"><form id="token-form" data-id="${token?.id||''}"><div class="form-grid"><label class="field">Token name<input name="name" required maxlength="80" value="${esc(token?.name||'')}" placeholder="Token name"></label><label class="field">Symbol<input name="symbol" required maxlength="20" value="${esc(token?.symbol||'')}" placeholder="SYMBOL"></label><label class="field">Chain<select name="chain" ${token?'disabled':''}>${['solana','ethereum','base','bsc'].map(c=>`<option value="${c}" ${token?.chain===c?'selected':''}>${c==='bsc'?'BNB Chain':c[0].toUpperCase()+c.slice(1)}</option>`).join('')}</select></label><label class="field">Research status<select name="status">${['researching','watching','passed'].map(s=>`<option value="${s}" ${token?.status===s?'selected':''}>${statusName(s)}</option>`).join('')}</select></label><label class="field full">Exact token contract<input name="contract" required maxlength="44" value="${esc(token?.contract||'')}" ${token?'readonly':''} placeholder="Paste the contract address"></label><label class="field full">Research notes<textarea name="notes" maxlength="4000" placeholder="Why it caught your attention. Evidence to check. What would change your mind.">${esc(token?.notes||'')}</textarea></label></div><p class="fine" style="margin-top:12px">Shared with your teammate. Open Live research after saving to inspect available market data.</p><div id="form-error" class="error" role="alert"></div><div class="form-actions">${token?`<button type="button" class="quiet danger" data-remove="${token.id}">Remove</button>`:''}<button type="button" class="quiet" data-close>Cancel</button><button class="primary" type="submit">Save token</button></div></form></div>`;d.showModal();}
document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{if(b.dataset.view){view=b.dataset.view;location.hash=view;shell();}if(b.dataset.filter){filter=b.dataset.filter;renderPage();}if(b.dataset.research){selected=b.dataset.research;view='research';location.hash=view;shell();}if(b.dataset.action==='add')modal();if(b.dataset.edit)modal(state.watchlist.find(x=>x.id===b.dataset.edit));if(b.hasAttribute('data-close'))$('#modal').close();if(b.dataset.copy){await copyText(state.watchlist.find(x=>x.id===b.dataset.copy).contract,'Contract copied. Match the chain in Fomo.');}if(b.dataset.action==='refresh'){b.disabled=true;await load();toast('Workspace refreshed.');}if(b.id==='logout'||b.dataset.action==='logout'){await api('logout',{method:'POST',body:'{}'});state=null;login();}if(b.id==='show-password'){const p=$('input[name=password]');p.type=p.type==='password'?'text':'password';b.setAttribute('aria-label',p.type==='password'?'Show password':'Hide password');}if(b.dataset.remove){if(!b.dataset.confirm){b.dataset.confirm='true';b.textContent='Confirm removal';return;}const t=state.watchlist.find(x=>x.id===b.dataset.remove);b.disabled=true;await api('watchlist/'+t.id,{method:'DELETE',body:JSON.stringify({revision:t.revision})});$('#modal').close();await load();toast('Removed from the shared watchlist.');}}catch(e){toast(e.message);b.disabled=false;}});
document.addEventListener('input',e=>{if(e.target.id==='token-query')searchDraft=e.target.value;if(e.target.id==='search'){query=e.target.value;const rows=state.watchlist.filter(t=>`${t.name} ${t.symbol} ${t.contract} ${t.notes}`.toLowerCase().includes(query.toLowerCase()));$('#watch-rows').innerHTML=rows.map(tokenRow).join('')||'<div class="empty">No saved tokens match your search.</div>';}});
document.addEventListener('submit',async e=>{e.preventDefault();const form=e.target;if(form.id==='scenario'){const fd=new FormData(form),s=Number(fd.get('stake')),m=Number(fd.get('move'));if(!Number.isFinite(s)||s<1||s>10000||!Number.isFinite(m)||m< -100||m>1000)return;const proceeds=Math.max(0,(s*.99-.1)*(1+m/100)*.99-.1);$('#scenario-result').innerHTML=`<div class="result"><div class="fine">Hypothetical proceeds</div><strong class="mono">${usd(proceeds)}</strong><div class="fine">Net change: ${usd(proceeds-s)}</div></div>`;return;}if(busy)return;busy=true;const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=true;try{if(form.id==='login-form'){const data=Object.fromEntries(new FormData(form));await api('login',{method:'POST',body:JSON.stringify(data)});await load();}if(form.id==='token-form'){const data=Object.fromEntries(new FormData(form)),existing=state.watchlist.find(x=>x.id===form.dataset.id);if(existing){data.chain=existing.chain;data.revision=existing.revision;}await api('watchlist',{method:'POST',body:JSON.stringify(data)});$('#modal').close();await load();toast('Saved for you and your teammate.');}}catch(err){const target=form.querySelector('[role=alert]');if(target)target.textContent=err.message;else toast(err.message);}finally{busy=false;if(submit)submit.disabled=false;}});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(navItems.some(x=>x[0]===next)){view=next;if(state)shell();}});
async function boot(){view=navItems.some(x=>x[0]===location.hash.slice(1))?location.hash.slice(1):'radar';try{await load();}catch(e){login();if(!e.message.includes('sign in'))$('#login-error').textContent=e.message;}}
setInterval(async()=>{if(!state||document.hidden||$('#modal').open)return;try{const next=await api('workspace');if(next.release.commit!==currentCommit&&!$('#update-banner')){const el=document.createElement('div');el.className='update-banner';el.id='update-banner';el.innerHTML='<span>A new GitHub release is ready.</span><button id="reload-app">Update workspace</button>';$('.topbar').after(el);$('#reload-app').onclick=()=>location.reload();}state=next;}catch{}},60000);
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'show_research_view',title:'Show a research view',description:'Navigate the signed-in Fieldnotes workspace. Does not place trades or change saved research.',inputSchema:{type:'object',properties:{view:{type:'string',enum:['radar','watchlist','research','activity']}},required:['view'],additionalProperties:false},annotations:{readOnlyHint:true},execute:async input=>{if(!state)throw Error('Sign in first.');if(!input||!navItems.some(x=>x[0]===input.view))throw Error('Unknown view.');view=input.view;location.hash=view;shell();return{view,savedTokens:state.watchlist.length};}});}catch{}}

const chainLabels={solana:'Solana',ethereum:'Ethereum',base:'Base',bsc:'BNB Chain'};
const price=v=>v===null||!Number.isFinite(v)?'Unknown':v===0?'$0.00':v<1?'$'+v.toPrecision(5):usd(v);
const money=v=>v===null||!Number.isFinite(v)?'Unknown':v>=1000?'$'+compact(v):usd(v);
const percent=v=>v===null?'—':(v>0?'+':'')+v.toFixed(2)+'%';
const trend=v=>v===null?'muted':v>=0?'positive':'negative';
let markets={chain:'solana',mode:'trending',search:'',data:null,error:'',loading:false,serial:0};
let chart={data:null,error:'',loading:false,period:'5m',key:null,serial:0};
let researchLoading=false,researchSerial=0;
function freshness(data){
  if(!data)return '';
  const age=Math.max(0,Math.floor((Date.now()-Date.parse(data.fetchedAt))/1000));
  const stale=data.status==='stale'||age>120;
  return '<span class="badge '+(stale?'amber':'green')+'">'+(stale?'Stale snapshot':'Live API')+'</span> <span class="fine">Fetched '+(age<60?age+'s':Math.floor(age/60)+'m')+' ago</span>';
}
function providerFooter(){return '<div class="provider-note">Market data by <a href="https://www.geckoterminal.com/" target="_blank" rel="noopener noreferrer">GeckoTerminal ↗</a>. Pool prices may differ from Fomo quotes. Listing does not establish safety or availability on Fomo.</div>';}
function marketRow(t,i){return '<tr><td><button class="token-link" data-inspect="'+i+'"><span class="coin">'+esc(t.symbol.slice(0,1))+'</span><span><strong>'+esc(t.symbol)+'</strong><span class="fine token-sub">'+esc(t.name)+'</span></span></button><div class="fine pair-label">'+esc(t.pair)+' · '+esc(t.dex)+'</div></td><td class="mono">'+price(t.price)+'</td><td class="mono '+trend(t.change5m)+'">'+percent(t.change5m)+'</td><td class="mono '+trend(t.change24h)+'">'+percent(t.change24h)+'</td><td class="mono">'+money(t.liquidity)+'</td><td class="mono">'+money(t.volume24h)+'</td><td><button class="quiet" data-inspect="'+i+'">Research →</button></td></tr>';}
function lineChart(data){
  const points=data?.candles||[];
  if(!points.length)return '<div class="empty"><h3>No candles available</h3><p>This pool may be too new or have no recorded trades in the requested intervals.</p></div>';
  if(points.length===1)return '<div class="empty"><h3>'+price(points[0].close)+'</h3><p>One candle is available. More trades are needed to draw a price history.</p></div>';
  const lo=Math.min(...points.map(p=>p.close)),hi=Math.max(...points.map(p=>p.close)),span=hi-lo||Math.max(hi*.01,.00000001);
  const from=points[0].time,to=points.at(-1).time;
  const coords=points.map(p=>((p.time-from)/(to-from)*720+10).toFixed(1)+','+(180-(p.close-lo)/span*155).toFixed(1)).join(' ');
  const table=points.slice(-12).reverse().map(p=>'<tr><td>'+new Date(p.time*1000).toLocaleString()+'</td><td class="mono">'+price(p.close)+'</td><td class="mono">'+money(p.volume)+'</td></tr>').join('');
  return '<div class="chart-axis"><span>'+price(hi)+'</span><span>USD · candle closes</span></div><svg class="price-chart" role="img" aria-label="Historical closing prices for the selected token and pool" viewBox="0 0 740 200" preserveAspectRatio="none"><path d="M10 25H730 M10 102H730 M10 180H730" stroke="var(--line)" stroke-width="1"/><polyline points="'+coords+'" fill="none" stroke="var(--green)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg><div class="chart-axis"><span>'+price(lo)+'</span><span>'+new Date(from*1000).toLocaleString()+' → '+new Date(to*1000).toLocaleString()+'</span></div><p class="fine">Intervals without trades may be absent. Last candle: '+new Date(to*1000).toLocaleString()+'.</p><details class="candle-details"><summary>Recent candle values</summary><div class="table-wrap"><table><thead><tr><th>Time</th><th>Close</th><th>Volume (USD)</th></tr></thead><tbody>'+table+'</tbody></table></div></details>';
}
function research(){
  if(researchLoading)return header('Loading token research','Finding pools for this exact contract…')+'<div class="panel empty">Requesting live market data.</div>';
  if(!selected)return header('Research desk','Choose a real token to inspect its pool data and price history.')+'<div class="panel empty">'+icon('flask')+'<h3>Start with a token</h3><p>Select Research on the live radar, or open a saved token from your watchlist.</p><button class="primary" data-view="radar">Explore live markets</button></div>';
  const t=selected;
  return header(esc(t.name),esc(t.symbol)+' · '+esc(chainLabels[t.chain])+' · '+esc(t.dex),'<div class="card-actions research-actions"><button data-action="copy-market">'+icon('copy')+'Copy contract</button><button class="primary" data-action="save-market">'+icon('bookmark')+'Save research</button></div>')+
  '<div class="market-status"><div class="row">'+freshness(t)+'</div><a class="text-action" href="'+esc(t.sourceUrl)+'" target="_blank" rel="noopener noreferrer">View source pool ↗</a></div>'+
  researchBrief(t,t)+'<section class="metrics"><div class="metric"><div class="metric-label">Token price</div><div class="metric-value mono token-price">'+price(t.price)+'</div><small>'+esc(t.pair)+'</small></div><div class="metric"><div class="metric-label">5m / 24h price change</div><div class="metric-value mono small-value"><span class="'+trend(t.change5m)+'">'+percent(t.change5m)+'</span> / <span class="'+trend(t.change24h)+'">'+percent(t.change24h)+'</span></div><small>Provider pool observations</small></div><div class="metric"><div class="metric-label">Pool liquidity</div><div class="metric-value mono">'+money(t.liquidity)+'</div><small>Not a size-specific exit quote</small></div><div class="metric"><div class="metric-label">24h pool volume</div><div class="metric-value mono">'+money(t.volume24h)+'</div><small>Not since-launch volume</small></div></section>'+
  '<section class="panel"><div class="panel-head"><h2>Price history</h2><div class="row"><div class="tabs">'+[['5m','5m candles'],['1h','1h candles']].map(([id,n])=>'<button data-period="'+id+'" class="'+(chart.period===id?'active':'')+'">'+n+'</button>').join('')+'</div><button class="quiet icon-btn" data-action="chart-refresh" aria-label="Refresh chart">'+icon('refresh')+'</button></div></div><div class="panel-body">'+
  (chart.loading?'<p class="fine" role="status">Refreshing price history…</p>':'')+
  (chart.error?'<div class="notice">'+esc(chart.error)+'</div>':'')+
  (chart.data?.status==='stale'?'<div class="notice">Chart refresh failed. Showing an older snapshot.</div>':'')+
  (chart.data?lineChart(chart.data):!chart.loading&&!chart.error?'<div class="empty">Select Refresh chart to load price history.</div>':'')+'</div>'+providerFooter()+'</section>'+
  '<div class="detail-grid section-space"><section class="panel"><div class="panel-head"><h2>Token & pool evidence</h2></div><div class="panel-body"><label class="fine">Token contract</label><div class="address mono">'+esc(t.contract)+'</div><button class="quiet" data-action="copy-market" style="margin-top:12px">'+icon('copy')+'Copy token contract</button><div class="definition"><span>Market cap</span><b>'+money(t.marketCap)+'</b></div><div class="definition"><span>Fully diluted valuation</span><b>'+money(t.fdv)+'</b></div><div class="definition"><span>24h buys / sells</span><b>'+ (t.buys24h??'Unknown')+' / '+(t.sells24h??'Unknown')+'</b></div><div class="definition"><span>Pool created</span><b>'+(t.poolCreatedAt?new Date(t.poolCreatedAt).toLocaleString():'Unknown')+'</b></div><div class="definition"><span>Complete holders</span><b>Not supplied</b></div><p class="fine" style="margin-top:14px">Pool creation is not proof of a token’s launch time. The provider does not supply an exact observation timestamp for these price snapshots.</p><p class="address mono" style="margin-top:14px">Pool: '+esc(t.pool)+'</p></div></section>'+
  '<section class="panel"><div class="panel-head"><h2>Paper scenario</h2><span class="badge">Hypothetical</span></div><div class="panel-body"><p class="fine" style="margin:0 0 20px">Explore an assumed price move. This does not estimate an actual Fomo fill.</p><form id="scenario" class="form-grid"><label class="field">Hypothetical outlay ($)<input name="stake" type="number" min="1" max="10000" step=".01" value="5" required></label><label class="field">Price change (%)<input name="move" type="number" min="-100" max="1000" step=".01" value="50" required></label><button class="primary full" type="submit">Calculate scenario</button></form><div id="scenario-result" aria-live="polite"></div><p class="fine" style="margin-top:18px">Example fees: 1% + $0.10 each way. Slippage, taxes and failed-transaction costs excluded. No orders or positions are created.</p></div></section></div>';
}
async function refreshMarket(){
  const serial=++markets.serial;
  markets.loading=true;markets.error='';if(view==='radar')renderPage();
  try{
    const params=new URLSearchParams({chain:markets.chain,mode:markets.mode});if(markets.mode==='search')params.set('q',markets.search);
    const data=await api('market?'+params);if(serial!==markets.serial)return;markets.data=data;
  }catch(e){if(serial===markets.serial){markets.error=e.message;if(markets.data)markets.data.status='stale';}}
  finally{if(serial===markets.serial){markets.loading=false;if(view==='radar'&&state)renderPage();}}
}
async function refreshChart(){
  if(!selected)return;const token=selected,serial=++chart.serial;
  chart.loading=true;chart.error='';chart.key=token.id+':'+chart.period;if(view==='research')renderPage();
  try{
    const data=await api('market/chart?'+new URLSearchParams({chain:token.chain,pool:token.pool,contract:token.contract,period:chart.period}));
    if(serial!==chart.serial||selected?.id!==token.id)return;chart.data=data;
    if(data.poolDetails)selected={...data.poolDetails,fetchedAt:data.detailsFetchedAt,status:data.detailsStatus};
  }catch(e){if(serial===chart.serial){chart.error=e.message;if(chart.data)chart.data.status='stale';}}
  finally{if(serial===chart.serial){chart.loading=false;if(view==='research'&&state)renderPage();}}
}
function inspectToken(t,data){researchSerial++;researchLoading=false;selected={...t,fetchedAt:data.fetchedAt,status:data.status};chart={data:null,error:'',loading:false,period:'5m',key:null,serial:chart.serial+1};view='research';location.hash=view;shell();}
async function inspectSaved(id){
  const token=state.watchlist.find(t=>t.id===id);if(!token)return;
  const serial=++researchSerial;researchLoading=true;selected=null;view='research';location.hash=view;shell();
  try{const data=await api('market?'+new URLSearchParams({chain:token.chain,mode:'token',contract:token.contract}));if(serial!==researchSerial)return;
    if(!data.pools.length)throw Error('No indexed pools found for this exact token contract.');
    inspectToken(data.pools[0],data);
  }catch(e){toast(e.message);}finally{researchLoading=false;if(state&&view==='research')renderPage();}
}
function saveMarket(token=selected){
  if(!token)return;const existing=state.watchlist.find(t=>t.chain===token.chain&&t.contract===token.contract);
  if(existing){modal(existing);return;}modal();
  const form=$('#token-form');for(const k of ['chain','contract','name','symbol'])form.elements[k].value=token[k];
}
document.addEventListener('change',e=>{if(e.target.id==='market-chain'){markets.chain=e.target.value;markets.data=null;markets.error='';refreshMarket();}});
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||!state)return;
  try{
    if(b.dataset.marketMode){markets.mode=b.dataset.marketMode;markets.search='';searchDraft='';markets.data=null;refreshMarket();}
    if(b.dataset.action==='market-refresh')refreshMarket();
    if(b.dataset.inspect!==undefined){const t=markets.data?.pools[Number(b.dataset.inspect)];if(t)inspectToken(t,markets.data);}
    if(b.dataset.live)inspectSaved(b.dataset.live);
    if(b.dataset.period){chart.period=b.dataset.period;chart.data=null;refreshChart();}
    if(b.dataset.action==='chart-refresh')refreshChart();
    if(b.dataset.action==='save-market')saveMarket();
    if(b.dataset.action==='copy-market'){await copyText(selected.contract,'Token contract copied. Verify the network in Fomo.');}
  }catch(err){toast(err.message);}
});
document.addEventListener('submit',e=>{if(e.target.id!=='market-search')return;e.preventDefault();markets.search=new FormData(e.target).get('query').trim();searchDraft=markets.search;markets.mode='search';markets.data=null;refreshMarket();});
setInterval(()=>{
  if(!state||document.hidden||$('#modal').open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
  if(view==='radar'&&!markets.loading)refreshMarket();
  if(view==='research'&&selected&&!chart.loading)refreshChart();
},60000);




const defaultTokenFilters=()=>({direction:'all',minLiquidity:'',minVolume:'',minCap:'',maxCap:'',maxAge:'',knownCap:false,shortlist:false,sort:'provider'});
let tokenFilters=defaultTokenFilters(),radarLayout='cards',filterProblem='',searchDraft='';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
function snapshotIsStale(data,now=Date.now()){return !data||data.status==='stale'||!Number.isFinite(Date.parse(data.fetchedAt))||now-Date.parse(data.fetchedAt)>120000;}
function researchAssessment(t,data,now=Date.now()){
  if(snapshotIsStale(data,now))return{key:'stale',label:'Refresh first',reason:'This snapshot is older or its refresh failed. Get a fresh observation before comparing it.',candidate:false};
  if(!finite(t.price)||t.price<=0)return{key:'unknown',label:'Price evidence missing',reason:'No usable price is available for this pool.',candidate:false};
  if(!finite(t.liquidity))return{key:'unknown',label:'Check liquidity',reason:'Pool liquidity is not supplied. Inspect a current quote in Fomo.',candidate:false};
  if(t.liquidity<10000)return{key:'caution',label:'Thin liquidity',reason:'Reported pool liquidity is below $10,000. A small trade may move the price.',candidate:false};
  if(!finite(t.marketCap)||t.marketCap<=0)return{key:'unknown',label:'Verify supply',reason:'A usable market cap is not supplied. FDV is shown separately and cannot establish circulating value.',candidate:false};
  if(t.liquidity>=25000&&finite(t.volume24h)&&t.volume24h>=50000)return{key:'candidate',label:'Research candidate',reason:'Known market cap, at least $25,000 pool liquidity and $50,000 in 24h pool volume. Review the evidence below.',candidate:true};
  return{key:'watch',label:'Watch for activity',reason:'This pool falls below one or more shortlist thresholds. Compare another observation before drawing conclusions.',candidate:false};
}
function filterMarkets(pools,filters,data,now=Date.now()){
  const minKeys=[['liquidity',filters.minLiquidity],['volume24h',filters.minVolume],['marketCap',filters.minCap]];
  let rows=pools.filter(t=>{
    const c=t.change5m;
    if(filters.direction==='rise'&&(!finite(c)||c<=0))return false;
    if(filters.direction==='fall'&&(!finite(c)||c>=0))return false;
    if(filters.direction==='rapid'&&(!finite(c)||!(c>=50||c<=-30)))return false;
    if(minKeys.some(([key,v])=>v!==''&&(!finite(t[key])||t[key]<Number(v))))return false;
    if(filters.maxCap!==''&&(!finite(t.marketCap)||t.marketCap>Number(filters.maxCap)))return false;
    if(filters.knownCap&&!finite(t.marketCap))return false;
    if(filters.maxAge!==''){const created=Date.parse(t.poolCreatedAt);if(!Number.isFinite(created)||created>now||now-created>Number(filters.maxAge)*3600000)return false;}
    if(filters.shortlist&&!researchAssessment(t,data,now).candidate)return false;
    return true;
  });
  const key={liquidity:'liquidity',volume:'volume24h',cap:'marketCap',rising:'change5m',falling:'change5m'}[filters.sort];
  if(key)rows.sort((a,b)=>{const av=a[key],bv=b[key];if(!finite(av))return finite(bv)?1:0;if(!finite(bv))return -1;return filters.sort==='falling'?av-bv:bv-av;});
  if(filters.sort==='newest')rows.sort((a,b)=>(Date.parse(b.poolCreatedAt)||0)-(Date.parse(a.poolCreatedAt)||0));
  return rows;
}
function filterField(name,label,placeholder){return '<label class="field">'+label+'<input type="number" name="'+name+'" min="0" step="any" placeholder="'+placeholder+'" value="'+esc(tokenFilters[name])+'"></label>';}
function filterControls(){
  const f=tokenFilters,sel=(key,label)=>'<option value="'+key+'" '+(f.sort===key?'selected':'')+'>'+label+'</option>';
  return '<div class="filter-bar"><div class="tabs direction-tabs" aria-label="Five-minute price direction">'+[['all','All changes'],['rise','Rising'],['fall','Falling'],['rapid','Rapid moves']].map(([key,label])=>'<button data-direction="'+key+'" class="'+(f.direction===key?'active':'')+'" aria-pressed="'+(f.direction===key)+'">'+label+'</button>').join('')+'</div><div class="layout-switch" aria-label="Result layout"><button data-layout="cards" aria-pressed="'+(radarLayout==='cards')+'" class="'+(radarLayout==='cards'?'active':'')+'">Cards</button><button data-layout="table" aria-pressed="'+(radarLayout==='table')+'" class="'+(radarLayout==='table'?'active':'')+'">Table</button></div></div>'+
  '<details class="filter-panel" '+(filterProblem?'open':'')+'><summary>Token filters <span class="fine">Liquidity · volume · market cap · pool age</span></summary><form id="token-filters"><div class="filter-grid">'+filterField('minLiquidity','Minimum liquidity ($)','Any')+filterField('minVolume','Minimum 24h volume ($)','Any')+filterField('minCap','Minimum market cap ($)','Any')+filterField('maxCap','Maximum market cap ($)','Any')+'<label class="field">Pool age<select name="maxAge">'+[['','Any age'],['1','Under 1 hour'],['6','Under 6 hours'],['24','Under 24 hours'],['168','Under 7 days']].map(([v,n])=>'<option value="'+v+'" '+(f.maxAge===v?'selected':'')+'>'+n+'</option>').join('')+'</select></label><label class="field">Sort results<select name="sort">'+[['provider','Provider order'],['rising','5m change: highest first'],['falling','5m change: lowest first'],['liquidity','Liquidity: highest first'],['volume','24h volume: highest first'],['cap','Market cap: highest first'],['newest','Newest pools first']].map(([k,n])=>sel(k,n)).join('')+'</select></label></div><div class="filter-bottom"><label class="check-field"><input type="checkbox" name="knownCap" '+(f.knownCap?'checked':'')+'> Known market cap only</label><div class="row"><button type="button" data-action="clear-filters">Clear filters</button><button class="primary" type="submit">Apply filters</button></div></div><p id="filter-error" class="error" role="alert">'+esc(filterProblem)+'</p></form></details>';
}
function poolIndex(t){return markets.data.pools.findIndex(p=>p.id===t.id);}
function contractActions(t){
  const i=poolIndex(t);
  return '<div class="contract-line"><code title="'+esc(t.contract)+'">'+esc(t.contract)+'</code><button class="quiet" data-copy-pool="'+i+'" aria-label="Copy '+esc(t.symbol)+' contract">'+icon('copy')+'Copy</button></div>';
}
function marketCard(t){
  const i=poolIndex(t),a=researchAssessment(t,markets.data),change=t.change5m;
  return '<article class="panel launch-card"><div class="launch-top"><div><h2>'+esc(t.name)+'</h2><p class="fine">'+esc(t.symbol)+' · '+esc(chainLabels[t.chain])+' · '+esc(t.dex)+'</p><p class="fine">'+esc(t.pair)+'</p></div><span class="badge '+(finite(change)&&change<0?'red':'green')+'">'+(finite(change)?change>0?'Rising':change<0?'Falling':'Unchanged':'Change unknown')+'</span></div><div class="launch-move"><strong class="'+trend(change)+'">'+percent(change)+'</strong><div><span>5m price change</span><b class="mono">'+price(t.price)+'</b></div></div><div class="evidence-grid"><div><span>Market cap</span><strong>'+money(t.marketCap)+'</strong></div><div><span>Pool liquidity</span><strong>'+money(t.liquidity)+'</strong></div><div><span>24h pool volume</span><strong>'+money(t.volume24h)+'</strong></div></div><div class="research-note '+a.key+'"><strong>'+a.label+'</strong><p>'+a.reason+'</p></div>'+contractActions(t)+'<div class="card-actions"><button class="primary" data-inspect="'+i+'">Research token →</button><button data-save-pool="'+i+'">'+icon('bookmark')+'Save</button><a class="source-link" href="'+esc(t.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Source pool ↗</a></div></article>';
}
function revisedMarketRow(t){
  const i=poolIndex(t);
  return '<tr><td><button class="token-link" data-inspect="'+i+'"><strong>'+esc(t.symbol)+'</strong></button><span class="token-sub fine">'+esc(t.name)+'</span>'+contractActions(t)+'</td><td class="mono">'+price(t.price)+'</td><td class="mono '+trend(t.change5m)+'">'+percent(t.change5m)+'</td><td class="mono">'+money(t.marketCap)+'</td><td class="mono">'+money(t.liquidity)+'</td><td class="mono">'+money(t.volume24h)+'</td><td><button data-inspect="'+i+'">Research →</button></td></tr>';
}
function radarResults(){
  const data=markets.data,pools=data?.pools||[],rows=filterMarkets(pools,tokenFilters,data);
  const active=Object.keys(defaultTokenFilters()).some(k=>tokenFilters[k]!==defaultTokenFilters()[k]);
  return '<div class="results-heading"><div><h2>'+esc(chainLabels[markets.chain])+' · '+(tokenFilters.shortlist?'Research shortlist':'Launch Radar')+'</h2><p class="fine">'+rows.length+' of '+pools.length+' loaded pools'+(active?' · filters applied':'')+'. Filters apply to this provider result set, not every token on-chain.</p></div>'+(active?'<button class="quiet" data-action="clear-filters">Reset filters</button>':'')+'</div>'+
    (rows.length?(radarLayout==='cards'?'<div class="launch-grid">'+rows.map(marketCard).join('')+'</div>':'<section class="panel"><div class="table-wrap"><table class="market-table"><thead><tr><th>Token / contract</th><th>Price</th><th>5m change</th><th>Market cap</th><th>Liquidity</th><th>24h volume</th><th>Research</th></tr></thead><tbody>'+rows.map(revisedMarketRow).join('')+'</tbody></table></div></section>'):
    '<section class="panel empty"><h3>'+(markets.loading?'Loading live pools…':markets.error?'Market data unavailable':pools.length?'No pools match these filters':'No matching pools')+'</h3><p>'+(markets.loading?'Fetching the latest available observations.':pools.length?'Lower a threshold or reset your filters. Unknown values are excluded when a numeric filter needs them.':'Try another contract, network or data view.')+'</p>'+(active?'<button data-action="clear-filters">Reset filters</button>':'')+'</section>');
}
function radar(){
  const data=markets.data;
  return header('Catch the change. Check the evidence.','Launch Radar · paste a contract, filter the activity, and decide what to research.',addButton())+
    '<section class="panel search-desk"><form id="market-search"><label class="field" for="token-query">Token name or exact contract</label><div class="contract-search"><input id="token-query" name="query" type="search" required minlength="2" maxlength="100" aria-label="Search live tokens" placeholder="Paste the token contract here…" value="'+esc(searchDraft)+'"><button type="button" data-action="paste-contract">Paste</button><button class="primary" type="submit">Find token</button></div></form><div class="market-toolbar"><div class="tabs">'+[['trending','Trending pools'],['new','New pools']].map(([id,n])=>'<button data-market-mode="'+id+'" class="'+(markets.mode===id?'active':'')+'" aria-pressed="'+(markets.mode===id)+'">'+n+'</button>').join('')+'</div><div class="row"><label class="network-label">Network<select id="market-chain" aria-label="Market network">'+Object.entries(chainLabels).map(([id,n])=>'<option value="'+id+'" '+(markets.chain===id?'selected':'')+'>'+n+'</option>').join('')+'</select></label><button class="quiet" data-action="market-refresh" '+(markets.loading?'disabled':'')+' aria-label="Refresh markets">'+icon('refresh')+'Refresh</button></div></div></section>'+
    filterControls()+
    '<section class="shortlist-strip"><div><h2>Recommendations for your research</h2><p>Shortlist pools with a known market cap, $25K+ liquidity and $50K+ daily volume. These are screening rules, not a safety score or a buy signal.</p></div><button data-action="shortlist" aria-pressed="'+tokenFilters.shortlist+'" class="'+(tokenFilters.shortlist?'primary':'')+'">'+(tokenFilters.shortlist?'Show all pools':'Show research shortlist')+'</button></section>'+
    '<div class="market-status" aria-live="polite"><div class="row">'+(markets.loading?'<span class="badge">Refreshing…</span>':freshness(data))+'</div><span class="fine">'+(markets.mode==='new'?'Newly indexed pools · pool creation is not token launch':markets.mode==='search'?'Search results · match the exact contract':'Provider-ranked pools · checked about every minute')+'</span></div>'+
    (markets.error?'<div class="notice" role="alert">'+esc(markets.error)+'</div>':'')+
    (data?.status==='stale'?'<div class="notice">Refresh failed. These figures are an older snapshot.</div>':'')+
    '<div id="radar-results">'+radarResults()+'</div>'+providerFooter()+
    '<details class="method-note"><summary>How this relates to the original launch rules</summary><p>The original repository detects a market-cap rise of at least 50% or fall of at least 30%, with a $2,000 change within five minutes. This live view filters the provider’s <strong>five-minute price change</strong>. It does not claim those market-cap alerts were triggered. Complete-holder data and the original persistent $5 paper tracker are not connected.</p></details>';
}
function researchBrief(t,data){
  const a=researchAssessment(t,data),change=finite(t.change5m)?percent(t.change5m)+' over the provider’s 5-minute price window':'no 5-minute price change supplied';
  return '<section class="panel research-brief"><div class="panel-head"><h2>What does this change mean?</h2><span class="badge">Rule-based research</span></div><div class="brief-columns"><div><span class="brief-label">OBSERVATION</span><h3>'+esc(t.symbol)+': '+change+'</h3><p>'+esc(t.pair)+' on '+esc(t.dex)+'. Reported pool liquidity is '+money(t.liquidity)+' and 24h volume is '+money(t.volume24h)+'.</p><div class="research-note '+a.key+'"><strong>'+a.label+'</strong><p>'+a.reason+'</p></div><h3>Possible explanations</h3><p>Trades, thin liquidity or provider updates can move the displayed price. These figures alone do not establish the cause.</p></div><div><span class="brief-label">RECOMMENDED NEXT CHECKS</span><ol class="research-checks"><li><strong>Match the contract.</strong> Copy the address below and confirm '+esc(chainLabels[t.chain])+' in Fomo.</li><li><strong>Inspect the actual quote.</strong> Review the received amount, fees and available sell route for your intended size.</li><li><strong>Verify the token.</strong> Check token controls, issuer information and holder concentration; this feed does not supply them.</li><li><strong>Compare another observation.</strong> Keep your thesis and evidence in the shared notes before making a decision.</li></ol><button data-action="copy-brief">'+icon('copy')+'Copy research brief</button></div></div></section>';
}
function briefText(t){
  const a=researchAssessment(t,t);
  return t.name+' ('+t.symbol+') — '+chainLabels[t.chain]+'\nContract: '+t.contract+'\nPool: '+t.pool+'\nSource: '+t.sourceUrl+'\nFetched: '+t.fetchedAt+'\nPrice: '+price(t.price)+' | 5m: '+percent(t.change5m)+' | 24h: '+percent(t.change24h)+'\nMarket cap: '+money(t.marketCap)+' | FDV: '+money(t.fdv)+'\nPool liquidity: '+money(t.liquidity)+' | 24h pool volume: '+money(t.volume24h)+'\nResearch recommendation: '+a.label+'. '+a.reason+'\nNext checks: match chain/contract in Fomo; inspect the actual quote and sell route; verify token controls, issuer and holders; compare another observation.\nRule-based research, not a safety rating or trade instruction.';
}
async function copyText(text,message){
  try{await navigator.clipboard.writeText(text);toast(message);}catch{
    const d=$('#modal');d.innerHTML='<div class="panel-head"><h2>Copy text</h2><button data-close aria-label="Close dialog">Close</button></div><div class="panel-body"><p>Select and copy the text below.</p><textarea aria-label="Text to copy" readonly>'+esc(text)+'</textarea></div>';if(!d.open)d.showModal();d.querySelector('textarea').select();
  }
}
async function pasteContract(){
  const field=$('#token-query');
  try{
    const text=(await navigator.clipboard.readText()).trim();
    if(!/^(?:0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(text)){toast('Clipboard does not contain a token contract. Paste or type it in the search field.');field.focus();return;}
    searchDraft=text;field.value=text;field.focus();toast('Contract pasted. Check the network, then select Find token.');
  }catch{field.focus();toast('Use Ctrl+V, Cmd+V, or your phone’s Paste command in the contract field.');}
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||!state)return;
  if(b.dataset.direction){tokenFilters.direction=b.dataset.direction;renderPage();}
  if(b.dataset.layout){radarLayout=b.dataset.layout;renderPage();}
  if(b.dataset.action==='clear-filters'){tokenFilters=defaultTokenFilters();filterProblem='';renderPage();}
  if(b.dataset.action==='shortlist'){tokenFilters.shortlist=!tokenFilters.shortlist;renderPage();}
  if(b.dataset.action==='paste-contract')await pasteContract();
  if(b.dataset.copyPool!==undefined){const t=markets.data?.pools[Number(b.dataset.copyPool)];if(t)await copyText(t.contract,t.symbol+' contract copied. Match the network in Fomo.');}
  if(b.dataset.savePool!==undefined){const t=markets.data?.pools[Number(b.dataset.savePool)];if(t)saveMarket(t);}
  if(b.dataset.action==='copy-brief'&&selected)await copyText(briefText(selected),'Research brief copied.');
});
document.addEventListener('submit',e=>{
  if(e.target.id!=='token-filters')return;e.preventDefault();
  const form=e.target,values=Object.fromEntries(new FormData(form)),next={...tokenFilters,...values,knownCap:values.knownCap==='on'};
  if(['minLiquidity','minVolume','minCap','maxCap'].some(k=>next[k]!==''&&(!Number.isFinite(Number(next[k]))||Number(next[k])<0))){$('#filter-error').textContent='Use a positive number or leave a field empty.';return;}
  if(next.minCap!==''&&next.maxCap!==''&&Number(next.minCap)>Number(next.maxCap)){$('#filter-error').textContent='Maximum market cap must be at least the minimum.';return;}
  tokenFilters=next;filterProblem='';renderPage();
});


boot();
