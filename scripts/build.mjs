import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const files=['index.html','app.js','style.css','favicon.svg','charts.js','NOTICE.txt'];
const embedded=Object.fromEntries(files.map(f=>[f,fs.readFileSync('web/'+f,'utf8')]));
embedded['feed.json']=fs.readFileSync('site/feed.json','utf8');
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
fs.mkdirSync('dist/server',{recursive:true});fs.mkdirSync('dist/.openai',{recursive:true});
fs.writeFileSync('dist/server/embedded.mjs',`export const embedded=${JSON.stringify(embedded)};\nexport const sourceCommit=${JSON.stringify(commit)};\n`);
fs.copyFileSync('server/worker.mjs','dist/server/index.js');
fs.copyFileSync('server/market.mjs','dist/server/market.mjs');
fs.copyFileSync('.openai/hosting.json','dist/.openai/hosting.json');
if(fs.existsSync('drizzle'))fs.cpSync('drizzle','dist/.openai/drizzle',{recursive:true});
console.log('Worker and embedded fallback built.');

fs.copyFileSync('server/intelligence.mjs','dist/server/intelligence.mjs');

fs.copyFileSync('server/paper.mjs','dist/server/paper.mjs');

fs.copyFileSync('server/token-checks.mjs','dist/server/token-checks.mjs');

fs.copyFileSync('server/buy-alerts.mjs','dist/server/buy-alerts.mjs');

fs.copyFileSync('server/cap-momentum.mjs','dist/server/cap-momentum.mjs');

fs.copyFileSync('server/wallet-research.mjs','dist/server/wallet-research.mjs');

fs.copyFileSync('server/buyer-discovery.mjs','dist/server/buyer-discovery.mjs');
fs.copyFileSync('server/exit-quotes.mjs','dist/server/exit-quotes.mjs');
