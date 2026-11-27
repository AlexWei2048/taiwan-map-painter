'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const loader=require('../history-loader.js');
const unique=(values,label)=>assert.equal(new Set(values).size,values.length,label);
test('Entry pages and lazy-loaded JavaScript have unique IDs, existing assets and valid classic scripts',()=>{
 const scripts=new Set([...loader.HISTORY_SCRIPTS,...loader.TREND_SCRIPTS,loader.LEGISLATIVE_CANDIDATES]);
 for(const page of ['index.html','map-v60.html']){
  const html=read(page),markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  unique([...markup.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map(m=>m[1]),page+' duplicate IDs');
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   const src=/\bsrc=["']([^"']+)["']/.exec(m[1]);
   if(src){const path=src[1].split('?')[0];if(!/^https?:/.test(path))scripts.add(path)}
   else if(!/type=["'](?:application\/json|application\/ld\+json)["']/.test(m[1])&&m[2].trim())assert.doesNotThrow(()=>new vm.Script(m[2],{filename:page+' inline script'}),page);
  }
 }
 for(const name of scripts)assert.doesNotThrow(()=>new vm.Script(read(name),{filename:name}),name);
 unique(loader.HISTORY_SCRIPTS,'duplicate history scripts');
 unique(loader.TREND_SCRIPTS,'duplicate trend scripts');
 assert.ok(loader.HISTORY_SCRIPTS.indexOf('history-query-cache.js')>=0);
 for(const name of ['history-local.js','history-presidential.js','history-legislative.js'])assert.ok(loader.HISTORY_SCRIPTS.indexOf('history-query-cache.js')<loader.HISTORY_SCRIPTS.indexOf(name),name+' requires query cache');
 for(const name of loader.HISTORY_STYLES)assert.ok(fs.existsSync(name),name);
});
test('Every named Chromium browser test belongs to exactly one CI shard',()=>{
 const workflow=read('.github/workflows/checks.yml'),line=workflow.match(/^\s+pattern:\s*\[(.*)\]\s*$/m);assert.ok(line,'browser shard matrix missing');
 const patterns=[...line[1].matchAll(/'([^']+)'/g)].map(x=>new RegExp(x[1]));assert.ok(patterns.length>0);
 const source=read('tests/browser-smoke.mjs');
 const declarations=[...source.matchAll(/^\s*test\(/gm)];
 const names=[...source.matchAll(/^\s*test\((['"`])([^\n]+?)\1\s*,/gm)].map(m=>m[2]);
 assert.equal(names.length,declarations.length,'Every test needs a statically inspectable name');assert.ok(names.length>100);
 unique(names,'duplicate browser test names');
 for(const name of names)assert.equal(patterns.filter(p=>p.test(name)).length,1,'Uncovered or duplicate browser shard: '+name);
});
