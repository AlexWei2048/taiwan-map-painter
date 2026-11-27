'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const dir=path.join(__dirname,'..','assets');
const rows=years=>years.map(y=>JSON.parse(fs.readFileSync(path.join(dir,'history-legislative-turnout-'+y+'.json'),'utf8')).ballots.regional);
for(const [year,expected] of [[1992,27],[1995,27],[1998,29],[2001,29],[2004,29]]){
 test(year+' effective legacy regional district turnout coverage is complete',()=>{
  const p=JSON.parse(fs.readFileSync(path.join(dir,'history-legislative-turnout-'+year+'.json'),'utf8')).ballots.regional;
  const counties=Object.keys(p.county),multis=Object.entries(p.district||{});
  assert.equal(counties.length,25,'all historical counties must have four-field turnout');
  let total=0;
  for(const [county,record] of Object.entries(p.county)){
   assert.ok(record.every(v=>Number.isSafeInteger(v)&&v>=0));
   assert.equal(record[1],record[2]+record[3],county);
   const details=p.district[county];
   if(details&&Object.keys(details).length>1){
    const vectors=Object.values(details);
    assert.deepEqual(vectors.reduce((acc,r)=>acc.map((v,i)=>v+r[i]),[0,0,0,0]),record,county);
    total+=vectors.length;
   }else{
    // A single-seat-count constituency at the historical county scope
    // uses the verified county profile as its district turnout.
    if(details&&Object.keys(details).length===1)assert.deepEqual(Object.values(details)[0],record);
    total++;
   }
  }
  assert.equal(total,expected,'multi-constituency counts plus singleton county fallback');
  if(year===2001){
   assert.deepEqual(p.national,Object.values(p.county).reduce((acc,r)=>acc.map((v,i)=>v+r[i]),[0,0,0,0]));
   assert.equal(Object.values(p.town).reduce((n,ts)=>n+Object.keys(ts).length,0),369);
  }
 });
}
