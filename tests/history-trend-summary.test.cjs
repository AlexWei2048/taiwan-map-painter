'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {build}=require('../scripts/build_history_trend_summaries.cjs');
const Local=require('../history-local.js'),Trends=require('../history-trends.js'),Summary=require('../history-trend-summary.js'),OpenCC=require('../assets/opencc.js');
test('precomputed trend summaries match source loaders and aggregation',async()=>{
 const files=await build({Local,Trends,Summary,OpenCC,read:async path=>{const bytes=await fs.readFile(path);return{content:bytes.toString('utf8'),sha:crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')}}});
 for(const [path,content] of files)assert.equal(await fs.readFile(path,'utf8'),content,path);
});
test('unsupported candidate/focused queries use original data; mismatched sources rejected',()=>{
 const conf={office:'mayor',county:'台北市',level:'county',metric:'party',electorate:'regional'};
 assert.equal(Summary.key(conf),'mayor-1');assert.equal(Summary.key({...conf,candidateScope:'candidate'}),'');assert.equal(Summary.key({...conf,focus:'中正区'}),'');
 assert.equal(Summary.compatible({schemaVersion:1,office:'mayor',county:'台北市',algorithmVersion:1,sourceVersion:'old',years:{}},conf,Local,Trends),false);
});

test('presidential and township summaries match source loaders and aggregation',async()=>{
 const config={Local,Trends,Summary,OpenCC,Presidential:require('../history-presidential.js'),PresidentialTurnout:require('../history-presidential-turnout.js'),read:async path=>{const bytes=await fs.readFile(path);return{content:bytes.toString('utf8'),sha:crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')}}};
 for(const office of ['president','township'])for(const [path,content] of await build({...config,offices:[office]}))assert.equal(await fs.readFile(path,'utf8'),content,path);
 assert.deepEqual(Summary.summaryYears('president',[2020,2024]),[2020,2024]);
 assert.deepEqual(Summary.summaryYears('township',[2018,2022,2026]),[2018]);
});
