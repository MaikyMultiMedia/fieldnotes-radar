import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context=vm.createContext({document:{addEventListener(){}},window:{addEventListener(){}},setInterval(){},Intl,URLSearchParams,Date,Number,console});
vm.runInContext(fs.readFileSync('web/app.js','utf8').replace(/\bboot\(\);\s*$/,''),context);
const evaluate=code=>vm.runInContext(code,context);
const now=Date.parse('2026-09-21T00:00:00Z');
context.now=now;context.fresh={status:'fresh',fetchedAt:new Date(now).toISOString()};
context.pools=[
{id:'base:a:one',symbol:'SAME',chain:'base',contract:'one',price:1,change5m:60,liquidity:50000,volume24h:100000,marketCap:1000000,poolCreatedAt:'2026-09-20T23:30:00Z'},
{id:'base:b:two',symbol:'SAME',chain:'base',contract:'two',price:2,change5m:-35,liquidity:0,volume24h:0,marketCap:0,poolCreatedAt:null},
{id:'base:c:three',symbol:'UNKNOWN',price:1,change5m:null,liquidity:null,volume24h:null,marketCap:null,poolCreatedAt:'bad'},
{id:'base:d:four',symbol:'OLDER',price:1,change5m:2,liquidity:50000,volume24h:100000,marketCap:2000000,poolCreatedAt:'2026-09-01T00:00:00Z'}
];
const ids=expr=>Array.from(evaluate(expr),p=>p.id);
test('filters keep exact pool identity, distinguish unknown from zero and compose ranges',()=>{
 assert.deepEqual(ids("filterMarkets(pools,{...defaultTokenFilters(),minLiquidity:'0',maxCap:'1500000'},fresh,now)"),['base:a:one','base:b:two']);
 assert.deepEqual(ids("filterMarkets(pools,{...defaultTokenFilters(),direction:'fall'},fresh,now)"),['base:b:two']);
 assert.deepEqual(ids("filterMarkets(pools,{...defaultTokenFilters(),direction:'rapid'},fresh,now)"),['base:a:one','base:b:two']);
 assert.deepEqual(ids("filterMarkets(pools,{...defaultTokenFilters(),maxAge:'1',minLiquidity:'25000',knownCap:true},fresh,now)"),['base:a:one']);
 assert.deepEqual(ids("filterMarkets(pools,{...defaultTokenFilters(),minCap:'1000000',maxCap:'1000000'},fresh,now)"),['base:a:one']);
});
test('sorting does not mutate provider rows and retains unknown values last',()=>{
 assert.deepEqual(ids("filterMarkets(pools,{...defaultTokenFilters(),sort:'falling'},fresh,now)"),['base:b:two','base:d:four','base:a:one','base:c:three']);
 assert.equal(evaluate('pools[0].id'),'base:a:one');
 evaluate('markets.data={pools};');
 assert.equal(evaluate("poolIndex(filterMarkets(pools,{...defaultTokenFilters(),sort:'falling'},fresh,now)[0])"),1);
});
test('research shortlist rejects stale, unknown, thin and inactive data',()=>{
 assert.equal(evaluate('researchAssessment(pools[0],fresh,now).candidate'),true);
 assert.equal(evaluate('researchAssessment({...pools[0],marketCap:0},fresh,now).candidate'),false);
 assert.equal(evaluate('researchAssessment(pools[1],fresh,now).key'),'caution');
 assert.equal(evaluate('researchAssessment(pools[2],fresh,now).candidate'),false);
 assert.equal(evaluate("researchAssessment(pools[0],{...fresh,status:'stale'},now).candidate"),false);
 assert.equal(evaluate('researchAssessment(pools[0],fresh,now+120001).candidate'),false);
 assert.equal(evaluate("researchAssessment({...pools[0],marketCap:null},fresh,now).label"),'Verify supply');
 assert.deepEqual(ids("filterMarkets(pools,{...defaultTokenFilters(),shortlist:true},fresh,now)"),['base:a:one','base:d:four']);
});

test('large-trade filters preserve unknowns and exact-chain follows',()=>{
  context.swaps=[{id:'buy',side:'buy',usd:1000,earlyPoolBuy:true,sender:'wallet',chain:'base'},{id:'sell',side:'sell',usd:2000,earlyPoolBuy:false,sender:'wallet',chain:'base'},{id:'unknown',side:'buy',usd:null,earlyPoolBuy:true,sender:'wallet',chain:'base'},{id:'zero',side:'buy',usd:0,earlyPoolBuy:false,sender:'wallet',chain:'solana'}];
  evaluate("state={wallets:[{address:'wallet',chain:'base'}]};flows.minUsd=0;flows.side='buy';flows.early=false;flows.followed=false;");
  assert.deepEqual(ids('matchingTrades(swaps)'),['buy','zero']);
  evaluate('flows.followed=true;');assert.deepEqual(ids('matchingTrades(swaps)'),['buy']);
  evaluate("flows.side='all';flows.early=true;");assert.deepEqual(ids('matchingTrades(swaps)'),['buy']);
  evaluate("flows.early=false;flows.minUsd=1500;");assert.deepEqual(ids('matchingTrades(swaps)'),['sell']);
});

test('loaded token reports preserve exact identity and reject flagged, incomplete or stale shortlisting',()=>{
 evaluate("tokenReports.set('base:one',{data:{chain:'base',contract:'one',status:'fresh',fetchedAt:fresh.fetchedAt,findings:1,unknown:0}})");
 assert.equal(evaluate('researchAssessment(pools[0],fresh,now).candidate'),false);
 assert.equal(evaluate('researchAssessment({...pools[0],contract:"other"},fresh,now).candidate'),true);
 evaluate("tokenReports.get('base:one').data.findings=0;tokenReports.get('base:one').data.unknown=1;");
 assert.equal(evaluate('researchAssessment(pools[0],fresh,now).label'),'Token checks incomplete');
 evaluate("tokenReports.get('base:one').data.unknown=0;");assert.equal(evaluate('researchAssessment(pools[0],fresh,now).candidate'),true);
 assert.equal(evaluate('researchAssessment(pools[0],{...fresh,fetchedAt:new Date(now+301000).toISOString()},now+301000).label'),'Token checks need refresh');
 evaluate('tokenReports.clear()');
});
test('token-check UI treats missing reports and historical paper evidence explicitly',()=>{
 assert.match(evaluate('tokenChecksPanel(pools[0])'),/Load free checks/);
 assert.match(evaluate('paperChecksEvidence({})'),/No fresh token-check report/);
 assert.equal(evaluate("checksFresh({status:'fresh',fetchedAt:new Date(now+1).toISOString()},now)"),false);
 assert.equal(evaluate("checkValue({value:null})"),'Unknown');
 assert.equal(evaluate("checkValue({value:false})"),'Not reported');
});

test('shared report summaries apply across browser reloads and distinguish other contracts',()=>{
 evaluate("state={tokenCheckSummaries:[{chain:'base',contract:'one',status:'fresh',fetchedAt:fresh.fetchedAt,findings:1,unknown:0}]}");
 assert.equal(evaluate('researchAssessment(pools[0],fresh,now).candidate'),false);
 assert.equal(evaluate('researchAssessment({...pools[0],contract:"other"},fresh,now).candidate'),true);
 evaluate('state=null');
});

test('cap signal text preserves exact evidence and linked paper records remain distinct from starting prices',()=>{
 const signal={id:'a'.repeat(64),chain:'solana',contract:'3'.repeat(32),pool:'4'.repeat(32),direction:'rise',changePct:100,delta:4000,capBefore:4000,capAfter:8000,beforeReceived:now-60000,afterReceived:now,detected:now,elapsedSeconds:60,provider:'GeckoTerminal',token:{symbol:'SYNTHETIC <QA>',sourceUrl:'https://www.geckoterminal.com/solana/pools/'+'4'.repeat(32)}};
 context.capFixture=signal;const text=evaluate('capText(capFixture)');assert.ok(text.split('\n').length>=12);assert.ok(text.includes(signal.contract));assert.ok(text.includes('Receipt interval: 60 seconds'));assert.ok(text.includes('provider observation times unknown'));
 const html=evaluate('capEvidence(capFixture)');assert.ok(html.includes('SYNTHETIC &lt;QA&gt;'));assert.ok(html.includes('Exact provider observation times are unknown'));
});

test('wallet reports copy the selected period and preserve losses, missing fields, stale status and source limits',()=>{
 context.walletFixture={chain:'solana',address:'3'.repeat(32),window:'7d',provider:'GMGN',status:'stale',fetchedAt:new Date(now).toISOString(),sourceUrl:'https://example.test/synthetic-source',report:{realizedPnl:-12.5,realizedCost:100,realizedReturn:-.125,buyCount:0,sellCount:null,unrealizedPnl:0}};
 const text=evaluate('walletProfitText(walletFixture)');assert.match(text,/Period: 7d/);assert.match(text,/Status: stale/);assert.match(text,/\-\$12\.50/);assert.match(text,/Buys \/ sells: 0 \/ Unknown/);assert.match(text,/Fomo identity are unverified/);
 evaluate('state={wallets:[]};walletReport.data=walletFixture;walletReport.loading=false;');
 const html=evaluate('walletProfitBody()');assert.match(html,/Stale report/);assert.match(html,/Current holdings, separate/);assert.match(html,/Refresh report/);
 evaluate("walletReport.data={status:'not_configured',report:null};");assert.match(evaluate('walletProfitBody()'),/no connected key yet/);
 evaluate("walletReport.data={status:'fresh',report:null};");assert.match(evaluate('walletProfitBody()'),/does not mean zero profit/);
 evaluate('state=null;');
});
