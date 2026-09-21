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
