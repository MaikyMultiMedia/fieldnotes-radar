import fs from 'node:fs';
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
// Preview local edits even when a verified GitHub interface release exists.
const upstreamFetch=globalThis.fetch;
globalThis.fetch=(input,options)=>['maikymultimedia.github.io','raw.githubusercontent.com'].includes(new URL(typeof input==='string'?input:input.url||input).hostname)?Promise.resolve(new Response('Local interface preview',{status:503})):upstreamFetch(input,options);
const {default:worker}=await import('../dist/server/index.js');
fs.mkdirSync('.local',{recursive:true});
const db=new DatabaseSync('.local/workspace.sqlite');
db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
for(const name of fs.readdirSync('drizzle').filter(n=>n.endsWith('.sql')).sort()){
  if(!db.prepare('SELECT name FROM _migrations WHERE name=?').get(name)){
    db.exec('BEGIN');try{db.exec(fs.readFileSync('drizzle/'+name,'utf8'));db.prepare('INSERT INTO _migrations VALUES (?)').run(name);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
}
function prepared(sql,params=[]){return{bind(...values){return prepared(sql,values);},async first(){return db.prepare(sql).get(...params)||null;},async run(){if(/RETURNING/i.test(sql)){const rows=db.prepare(sql).all(...params);return{results:rows,meta:{changes:rows.length}};}if(/^SELECT/i.test(sql))return{results:db.prepare(sql).all(...params),meta:{changes:0}};const r=db.prepare(sql).run(...params);return{results:[],meta:{changes:Number(r.changes)}};}};}
const env={BIRDEYE_API_KEY:process.env.BIRDEYE_API_KEY,DB:{prepare:prepared,async batch(list){db.exec('BEGIN');try{const results=[];for(const p of list)results.push(await p.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}},ACCOUNT_CREDENTIALS:fs.readFileSync('.local/accounts.json','utf8')};
http.createServer(async(req,res)=>{
  try{const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks);
  const response=await worker.fetch(new Request('http://localhost:8891'+req.url,{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:raw}),env);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
  catch{res.writeHead(500);res.end('Preview unavailable');}
}).listen(8891,'127.0.0.1',()=>console.log('Fieldnotes preview: http://localhost:8891'));
