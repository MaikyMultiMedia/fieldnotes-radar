import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const assets=Object.fromEntries(['index.html','app.js','style.css','favicon.svg','charts.js','NOTICE.txt'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync('web/'+f)).digest('hex')]));
fs.writeFileSync('site/workspace-release.json',JSON.stringify({apiVersion:8,commit,assets},null,2));
console.log('Checked workspace release manifest prepared.');
