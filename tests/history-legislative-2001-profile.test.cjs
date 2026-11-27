'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const root=path.join(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'assets/history-legislative-turnout-2001.json'),'utf8'));
const source=JSON.parse(fs.readFileSync(path.join(root,'sources/history-legislative-2001-vote-reconciliation.json'),'utf8'));
const p=data.ballots.regional;
const aggregate=rows=>rows.reduce((acc,r)=>acc.map((v,i)=>v+r[i]),[0,0,0,0]);
const good=r=>Array.isArray(r)&&r.length===4&&r.every(x=>Number.isSafeInteger(x)&&x>=0)&&r[0]>=r[1]&&r[1]===r[2]+r[3];
test('2001 regional four-field national totals and all 25 counties reconcile',()=>{
 assert.deepEqual(p.national,source.district3OfficialTotals.profiles.national);
 assert.equal(Object.keys(p.county).length,25);
 assert.deepEqual(aggregate(Object.values(p.county)),p.national);
 for(const [county,record] of Object.entries(p.county)){
  assert.ok(good(record),county);
  assert.deepEqual(aggregate(Object.values(p.town[county]||{})),record,county+' town sum');
 }
});
test('2001 recovered constituency profiles match contemporaneous archived corrections',()=>{
 const corrected=source.district3OfficialTotals.profiles;
 assert.deepEqual(p.county['台北县'],corrected.county);
 assert.deepEqual(p.district['台北县']['3'],corrected.district);
 for(const record of source.profiles){
  const actual=record.scope==='county'?p.county[record.county]:
   p[record.scope][record.county][record.area];
  assert.deepEqual(actual,record.profile,record.county+':'+record.scope+':'+record.area);
 }
 for(const [county,ds]of Object.entries(p.district)){
  assert.deepEqual(aggregate(Object.values(ds)),p.county[county],county+' district sum');
 }
 assert.equal(Object.values(p.town).reduce((n,x)=>n+Object.keys(x).length,0),369);
});
