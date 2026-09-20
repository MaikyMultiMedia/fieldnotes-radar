"""Evidence-gated momentum alerts and persistent $5 paper observations. No execution."""
import math
from datetime import datetime

def ts(value):return datetime.fromisoformat(value.replace('Z','+00:00')).timestamp()
def positive(value):return isinstance(value,(float,int)) and not isinstance(value,bool) and math.isfinite(value) and value>0

def cap_signal(before,after):
    a=before['checks'].get('market',{});b=after['checks'].get('market',{})
    elapsed=ts(after['observed_at'])-ts(before['observed_at'])
    if before['contract']!=after['contract'] or not a.get('pool') or a['pool']!=b.get('pool') or not 0<elapsed<=300:return None
    if not all(positive(v) for v in (a.get('market_cap'),b.get('market_cap'))):return None
    delta=b['market_cap']-a['market_cap'];percent=100*delta/a['market_cap']
    if abs(delta)<2000 or not (percent>=50 or percent<=-30):return None
    direction='rise' if delta>0 else 'fall'
    return {'id':f'cap:{direction}:{after["contract"]}:{after["observed_at"]}','contract':after['contract'],
        'symbol':after.get('symbol','Unknown'),'observed_at':after['observed_at'],'pool':b['pool'],
        'title':'Rapid market-cap '+direction,'kind':'cap_only','direction':direction,'change_percent':percent,
        'before_at':before['observed_at'],'after_at':after['observed_at'],'before_id':before['id'],'after_id':after['id'],'elapsed_seconds':elapsed,'cap_before':a['market_cap'],'cap_after':b['market_cap'],
        'holders_before':None,'holders_after':None,'signal_price':b.get('price'),
        'source_url':b.get('source_url'),'classification':'Market-cap change only; holder growth not established',
        'limitations':['Market cap is a provider estimate, not money entering the pool','Supply changes or thin liquidity can move capitalization','Holder growth, issuer and sell route not established']}

def holder_signal(before,after):
    """Alert on comparable complete owner counts, independently of cap changes."""
    a=before['checks'].get('holders',{});b=after['checks'].get('holders',{})
    elapsed=ts(after['observed_at'])-ts(before['observed_at'])
    if before['contract']!=after['contract'] or not 0<elapsed<=300:return None
    if not (a.get('complete') is True and b.get('complete') is True and a.get('method') and a['method']==b.get('method')):return None
    old=a.get('total_holders');new=b.get('total_holders')
    if type(old) is not int or type(new) is not int or old<1 or new-old<10 or new<old*2:return None
    market=after['checks'].get('market',{})
    return {'id':f'holders:{after["contract"]}:{after["observed_at"]}', 'contract':after['contract'],
        'symbol':after.get('symbol','Unknown'),'kind':'holder_only','direction':'holders',
        'title':'Rapid holder growth','observed_at':after['observed_at'],'before_at':before['observed_at'],
        'after_at':after['observed_at'],'elapsed_seconds':elapsed,'holders_before':old,'holders_after':new,
        'cap_before':None,'cap_after':None,'pool':market.get('pool'),'source_url':b.get('source_url'),
        'classification':'Complete owner counts; wallets are not independent people'}

def signal(before,after):
    """Full holder counts only; top-20 samples cannot establish population growth."""
    a=before['checks'].get('market',{});b=after['checks'].get('market',{})
    ha=before['checks'].get('holders',{});hb=after['checks'].get('holders',{})
    if before['contract']!=after['contract'] or not a.get('pool') or a['pool']!=b.get('pool'):return None
    elapsed=ts(after['observed_at'])-ts(before['observed_at'])
    if not 0<elapsed<=60:return None
    if not all(positive(v) for v in (a.get('market_cap'),b.get('market_cap'),b.get('price'))):return None
    if not (ha.get('complete') is True and hb.get('complete') is True and ha.get('method') and ha['method']==hb.get('method')):return None
    old=ha.get('total_holders');new=hb.get('total_holders')
    if not isinstance(old,int) or not isinstance(new,int) or old<1:return None
    if not (a['market_cap']<=3500 and b['market_cap']>=10000 and old<=2 and new>=15):return None
    return {'id':'momentum:'+after['contract'], 'contract':after['contract'],'symbol':after.get('symbol','Unknown'),
        'observed_at':after['observed_at'],'pool':b['pool'],'title':'Rapid launch activity detected',
        'before_at':before['observed_at'],'after_at':after['observed_at'],'before_id':before['id'],'after_id':after['id'],'elapsed_seconds':elapsed,
        'cap_before':a['market_cap'],'cap_after':b['market_cap'],'holders_before':old,'holders_after':new,
        'signal_price':b['price'],'classification':'Research signal; not a safety rating',
        'limitations':['Wallets are not independent people','Market cap is not liquidity','Sell route and issuer not verified'],
        'paper_status':'Waiting for next fresh same-pool price; no real purchase'}

def paper_update(alert,samples,now):
    samples=sorted([s for s in samples if s['contract']==alert['contract'] and s['checks'].get('market',{}).get('pool')==alert['pool'] and ts(s['observed_at'])>ts(alert['observed_at'])],key=lambda s:ts(s['observed_at']))
    entry=next((s for s in samples if positive(s['checks']['market'].get('price')) and positive(s['checks']['market'].get('liquidity_usd'))),None)
    if not entry or ts(entry['observed_at'])-ts(alert['observed_at'])>60:
        return {'status':'Entry missed' if now-ts(alert['observed_at'])>60 else 'Waiting for next observation','outlay':5}
    # Assumptions: 1% fee + $0.10 each side and 1% adverse price impact each side.
    units=(5*.99-.10)/(entry['checks']['market']['price']*1.01)
    marks=[]
    for s in samples:
        p=s['checks']['market'].get('price')
        if ts(s['observed_at'])>=ts(entry['observed_at']) and positive(p):
            marks.append({'at':s['observed_at'],'net':max(0,units*p*.99*.99-.10)})
    last=marks[-1];fresh=now-ts(last['at'])<=90
    return {'status':'Paper position · fresh mark' if fresh else 'Paper position · stale mark','outlay':5,'entry_at':entry['observed_at'],
        'quantity':units,'current_net_value':last['net'] if fresh else None,'last_observed_net_value':last['net'],
        'pnl':last['net']-5 if fresh else None,'highest_observed_net_value':max(m['net'] for m in marks),
        'as_of':last['at'],'cost_assumptions':'1% + $0.10 per side, plus 1% adverse price impact per side; not provider fees',
        'execution':'Hypothetical only. No verified sell route, fills or realized profit.'}

def view(con,now):
    import json
    samples=[json.loads(r[0]) for r in con.execute("SELECT payload FROM records WHERE type IN ('screening','fast_market') ORDER BY observed_at DESC")]
    alerts=[json.loads(r[0]) for r in con.execute("SELECT payload FROM records WHERE type='momentum_alert' ORDER BY observed_at DESC LIMIT 30")]
    latest={}
    for s in samples:latest.setdefault(s['contract'],s)
    tracking=[{'contract':s['contract'],'symbol':s.get('symbol','Unknown'),'market_cap':s['checks']['market']['market_cap'],'observed_at':s['observed_at'],'first_seen':s.get('launch_observed_at'),'market':s['checks']['market']} for s in latest.values() if now-ts(s['observed_at'])<=15 and positive(s['checks'].get('market',{}).get('market_cap'))]
    return {'alerts':[{**a,'paper':({'status':'Observation only; no paper entry','outlay':None} if a.get('direction') in ('fall','holders') else paper_update(a,samples,now))} for a in alerts],
            'tracking':tracking,'status':f'Market-cap alerts active · {len(tracking)} tokens with recent cap observations',
            'rule':'Within 5 minutes, same mint/pool: rise ≥50% or fall ≥30%, with at least $2,000 absolute change. Market polling targets every 5 seconds; provider updates may lag.',
            'coverage':'Complete-holder growth alerts need a complete-count provider; current holder samples cannot trigger them. The combined $3,500→$10,000 and 2→15-holder rule remains separate and awaits complete holder data. The bounded collector does not monitor every launch; unindexed tokens lack quotes.'}

def ingest(con,current):
    import json
    from app import put
    previous=[json.loads(r[0]) for r in con.execute("SELECT payload FROM records WHERE type IN ('screening','fast_market') AND observed_at>=? ORDER BY observed_at DESC LIMIT 5000",(datetime.fromtimestamp(ts(current['observed_at'])-300,__import__('datetime').timezone.utc).isoformat(),))]
    # Oldest valid baseline within the window; do not invent a full 60s history.
    found=[]
    for detector in (signal,cap_signal,holder_signal):
        for older in reversed(previous):
            alert=detector(older,current)
            if not alert:continue
            if alert.get('kind') in ('cap_only','holder_only'):
                prior=[json.loads(r[0]) for r in con.execute("SELECT payload FROM records WHERE type='momentum_alert' ORDER BY observed_at DESC LIMIT 1000")]
                if any(a['contract']==alert['contract'] and a.get('direction')==alert['direction'] and ts(alert['observed_at'])-ts(a['observed_at'])<60 for a in prior):break
            put(con,alert['id'],'momentum_alert',alert);found.append(alert);break
    return found
