import unittest
from copy import deepcopy
from momentum import signal,paper_update,ts,cap_signal,holder_signal

def sample(second,cap,holders,price=1):
    return {'id':str(second),'contract':'mint','symbol':'TEST','observed_at':f'2026-09-20T12:{second//60:02}:{second%60:02}+00:00','checks':{'market':{'pool':'pool','market_cap':cap,'price':price,'liquidity_usd':10000},'holders':{'complete':True,'method':'fixture-full','total_holders':holders}}}

class MomentumTests(unittest.TestCase):
    def test_cap_only_works_without_holders_and_labels_it(self):
        a,b=sample(0,3500,2),sample(5,10000,15)
        a['checks']['holders']={};b['checks']['holders']={}
        event=cap_signal(a,b)
        self.assertEqual(event['kind'],'cap_only')
        self.assertIsNone(event['holders_after'])
        self.assertIsNone(signal(a,b))
        self.assertEqual(cap_signal(sample(0,10000,2),sample(5,5000,2))['direction'],'fall')

    def test_cap_alert_threshold_and_pool_guards(self):
        self.assertIsNotNone(cap_signal(sample(0,3500,2),sample(10,10000,15)))
        self.assertIsNotNone(cap_signal(sample(0,3500,2),sample(300,10000,15)))
        self.assertIsNone(cap_signal(sample(0,100,2),sample(5,300,2)))
        self.assertIsNone(cap_signal(sample(0,3500,2),sample(301,10000,15)))
        b=sample(5,10000,15);b['checks']['market']['pool']='different'
        self.assertIsNone(cap_signal(sample(0,3500,2),b))
    def test_full_signal_and_reject_sampled_or_cross_pool(self):
        a,b=sample(0,3500,2),sample(30,10000,15)
        self.assertIsNotNone(signal(a,b))
        for field,value in [('complete',False),('total_holders',None),('method','other')]:
            bad=deepcopy(b);bad['checks']['holders'][field]=value
            self.assertIsNone(signal(a,bad))
        b['checks']['market']['pool']='other';self.assertIsNone(signal(a,b))

    def test_gap_and_nonfinite_do_not_trigger(self):
        self.assertIsNone(signal(sample(0,3500,2),sample(61,10000,15)))
        self.assertIsNone(signal(sample(0,float('nan'),2),sample(30,10000,15)))

    def test_next_observation_costs_peak_and_staleness(self):
        a=signal(sample(0,3500,2),sample(30,10000,15))
        marks=[sample(40,11000,16,1),sample(50,15000,17,2),sample(60,12000,18,1.5)]
        p=paper_update(a,marks,ts(marks[-1]['observed_at']))
        self.assertLess(p['highest_observed_net_value'],10)
        self.assertGreater(p['highest_observed_net_value'],p['current_net_value'])
        stale=paper_update(a,marks,ts(marks[-1]['observed_at'])+100)
        self.assertIsNone(stale['current_net_value'])
        self.assertEqual(paper_update(a,[sample(100,12000,18)],ts(marks[-1]['observed_at'])+100)['status'],'Entry missed')

    def test_holder_growth_is_independent_and_complete(self):
        self.assertIsNotNone(holder_signal(sample(0,3000,2),sample(300,3000,20)))
        self.assertIsNone(holder_signal(sample(0,3000,2),sample(301,3000,20)))
        b=sample(300,3000,20);b['checks']['holders']['complete']=False
        self.assertIsNone(holder_signal(sample(0,3000,2),b))
    def test_no_liquidity_means_no_paper_entry(self):
        a=cap_signal(sample(0,3000,2),sample(5,10000,2))
        b=sample(10,11000,2);b['checks']['market']['liquidity_usd']=None
        self.assertNotIn('entry_at',paper_update(a,[b],ts(b['observed_at'])+100))

class LiveCapParityTests(unittest.TestCase):
    def test_shared_live_cap_threshold_fixtures(self):
        import json
        from pathlib import Path
        from datetime import datetime, timedelta, timezone
        start=datetime(2026,9,1,tzinfo=timezone.utc)
        rows=json.loads((Path(__file__).parent/'fixtures'/'cap-thresholds.json').read_text(encoding='utf-8-sig'))
        for row in rows:
            with self.subTest(row=row['name']):
                before=sample(0,row['before'],2);after=sample(0,row['after'],2)
                before['observed_at']=start.isoformat();after['observed_at']=(start+timedelta(seconds=row['seconds'])).isoformat()
                result=cap_signal(before,after)
                self.assertEqual(result['direction'] if result else None,row['expected'])
