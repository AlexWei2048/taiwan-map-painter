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
