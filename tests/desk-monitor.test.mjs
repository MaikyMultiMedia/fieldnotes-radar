import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Synthetic UI state only. No real wallets or provider data.
const source=fs.readFileSync('web/app.js','utf8').replace(/\bboot\(\);\s*$/,'');
function setup(){
  const nodes=Object.fromEntries(['#alerts-nav-count','#buy-monitor-status','#modal'].map(id=>[id,{open:false,setAttribute(k,v){this[k]=v;}}]));
  const saved=new Map(),requests=[],events={};let time=1000000;
  const document={hidden:false,activeElement:{tagName:'BODY'},addEventListener(name,fn){(events[name]??=[]).push(fn);},querySelector:id=>nodes[id]||null};
  const context=vm.createContext({document,window:{addEventListener(){}},sessionStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},setInterval(){},Intl,URLSearchParams,Date:class extends Date{static now(){return time;}},Number,console});
  vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  context.reply={rules:[{id:'synthetic-rule'}],alerts:[],unread:3};
  context.request=async(path,options)=>{requests.push({path,options});return context.reply;};
  run("state={user:'synthetic@example.test'};view='research';let renders=0,toasts=0;renderPage=()=>renders++;toast=()=>toasts++;api=request;");
  return{run,context,document,nodes,saved,requests,events,advance:n=>time+=n};
}

test('saved pools scan across every desk view without replacing the view, and attempts stay a minute apart',async()=>{
  const c=setup();c.run('alertsData=reply;');
  for(const view of ['research','radar','watchlist','flow','journal','traders','activity']){
    c.context.nextView=view;c.run('view=nextView;');await c.run('monitorAlerts()');
    assert.equal(c.requests.at(-1).path,'alerts/scan');
    assert.equal(c.requests.at(-1).options.method,'POST');
    const count=c.requests.length;c.advance(10000);await c.run('monitorAlerts()');assert.equal(c.requests.length,count);c.advance(50000);
  }
  assert.equal(c.requests.length,7);assert.equal(c.run('renders'),0);assert.equal(c.run('toasts'),0);
  assert.equal(c.nodes['#alerts-nav-count'].textContent,'3');assert.equal(c.nodes['#alerts-nav-count']['aria-label'],'3 unread buy alerts');
});

test('unknown or empty rules use a read-only refresh; hidden, paused and signed-out tabs start no requests',async()=>{
  const c=setup();await c.run('monitorAlerts()');assert.equal(c.requests[0].path,'alerts');
  c.advance(60000);await c.run('monitorAlerts()');assert.equal(c.requests[1].path,'alerts/scan');
  c.advance(60000);c.document.hidden=true;await c.run('monitorAlerts()');assert.equal(c.requests.length,2);
  c.document.hidden=false;c.run('toggleAlertMonitor()');assert.equal(c.saved.get('fieldnotes:buy-monitor-paused'),'1');await c.run('monitorAlerts()');assert.equal(c.requests.length,2);
  c.run('alertMonitorPaused=false;state=null;');await c.run('monitorAlerts()');assert.equal(c.requests.length,2);
  c.run("state={user:'synthetic@example.test'};alertsData={rules:[],alerts:[],unread:0};");await c.run('monitorAlerts()');assert.equal(c.requests[2].path,'alerts');
});

test('quiet completion preserves a focused alert control or open note dialog; concurrent ticks do not duplicate requests',async()=>{
  const c=setup();let resolve;c.context.request=()=>new Promise(r=>{resolve=r;});c.run("api=request;alertsData=reply;view='alerts';");
  const pending=c.run('monitorAlerts()');assert.equal(c.run('alertsBusy'),true);
  c.advance(60000);await c.run('monitorAlerts()');
  c.document.activeElement={tagName:'INPUT'};resolve(c.context.reply);await pending;assert.equal(c.run('renders'),0);
  c.document.activeElement={tagName:'BODY'};c.nodes['#modal'].open=true;
  const next=c.run('monitorAlerts()');resolve(c.context.reply);await next;assert.equal(c.run('renders'),0);
  assert.equal(c.run('alertsBusy'),false);
});

test('old in-flight snapshots cannot overwrite a saved rule change or a signed-out session',async()=>{
  const c=setup();let resolve;c.context.request=()=>new Promise(r=>{resolve=r;});c.run('api=request;alertsData=reply;');
  const pending=c.run('monitorAlerts()');c.run('alertRevision++;alertsData={rules:[],alerts:[],unread:0};');resolve(c.context.reply);await pending;
  assert.equal(c.run('alertsData.rules.length'),0);assert.equal(c.nodes['#alerts-nav-count'].hidden,true);
  c.advance(60000);const next=c.run('monitorAlerts()');c.run('state=null');resolve(c.context.reply);await next;assert.equal(c.run('alertsData.rules.length'),0);
});

test('failed scans expose attention without noisy toasts and recover on the next eligible tick',async()=>{
  const c=setup();c.run('alertsData=reply;api=async()=>{throw Error("Provider cooling down");};');await c.run('monitorAlerts()');
  assert.equal(c.run('alertsBusy'),false);assert.equal(c.nodes['#buy-monitor-status'].textContent,'Buy checks need attention');assert.equal(c.run('toasts'),0);
  c.run('api=request;');c.advance(60000);await c.run('monitorAlerts()');assert.equal(c.requests.length,1);assert.equal(c.run('alertsError'),'');
});
