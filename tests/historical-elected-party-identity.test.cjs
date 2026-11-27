'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const root=__dirname+'/..';
const read=p=>fs.readFileSync(root+'/'+p,'utf8');
test('1992 mountain vote difference is exactly two in the one candidate, not apportioned to towns',()=>{
 const source=JSON.parse(read('assets/history-legislative-1992-local.json'));
 const counties=source.ballots.mountain.counties;
 const totals=Array(9).fill(0);
 for(const record of Object.values(counties))for(const item of record.towns)
  item[1].forEach((votes,index)=>totals[index]+=votes);
 assert.equal(Object.keys(counties).length,23);
 assert.deepEqual(totals,[10638,16782,6553,581,3769,6102,1715,4398,13291]);
 assert.equal(totals.reduce((a,b)=>a+b,0),63829);
 const national=JSON.parse(read('assets/history-legislative-1992.json'));
 const mountain=national.contests.find(x=>x.electorate==='mountain');
 const candidates=national.candidacies.filter(x=>x.contest_id===mountain.contest_id);
 const hua=candidates.find(x=>x.candidate_name==='华加志');
 assert.equal(hua.votes,16784);
 assert.equal(mountain.valid_votes,63831);
 assert.equal(hua.votes-totals[1],2);
});
test('Historical aboriginal political party is a party proper noun, not an ethnic-constituency label',()=>{
 const source=read('history-2022.js');
 assert.ok(source.includes(".replace(/^中国台湾少数民族党$/,'中国台湾原住民党')"));
 assert.ok(read('history-trends-ui.js').includes(".replace(/^中国台湾少数民族党$/,'中国台湾原住民党')"));
 assert.ok(read('app.js').includes(".replace(/^中国台湾少数民族党$/,'中国台湾原住民党')"));
 const coverage=JSON.parse(read('reports/coverage-audit.json'));
 assert.ok(coverage.missing_elected_party_logos?.some(r=>r.name==='中国台湾原住民党'));
 assert.ok(!coverage.missing_elected_party_logos.some(r=>r.name==='中国台湾少数民族党'));
});
test('Registered party logo never impersonates the unrelated indigenous party',()=>{
 const importer=read('scripts/import_verified_seated_party_emblem.py');
 assert.ok(importer.includes('s=157'));
 assert.ok(importer.includes('ff8080816b88b9f5016bd0204db2045e.jpg'));
 assert.ok(!importer.includes('758d1127-709c-4b7a-a5dd-c43d72ce9751.jpg'));
});
