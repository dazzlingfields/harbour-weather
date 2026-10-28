import {readFile,access,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const files=await readdir('dist');
for(const file of files.filter(f=>f.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',`dist/${file}`],{encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);}
const html=await readFile('dist/index.html','utf8');
for(const m of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g))await access('dist/'+m[1]);
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate HTML IDs');
const manifest=JSON.parse(await readFile('dist/manifest.webmanifest','utf8'));
for(const icon of manifest.icons)await access('dist/'+icon.src.replace('./',''));
const cap=JSON.parse(await readFile('capacitor.config.json','utf8'));assert.equal(cap.webDir,'dist');assert.ok(!cap.server,'Android must bundle local assets');
assert.ok(!html.includes('codex-preview'));
console.log('JavaScript syntax, HTML assets, manifest icons and bundled Android configuration passed.');
