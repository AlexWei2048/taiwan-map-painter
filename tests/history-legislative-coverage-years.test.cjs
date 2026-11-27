'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const Legislative=require('../history-legislative.js'),Coverage=require('../history-coverage.js');
const years=[1992,1995,1998,2001,2004,2008,2012,2016,2020,2024];
const fetcher=async url=>{
 const path=url.split('?')[0];
 const value=await fs.readFile(path,'utf8');
 return{ok:true,json:async()=>JSON.parse(value)};
};
test('Legislative historical coverage uses verified separate turnout files in all ten years',async()=>{
 const summaries=[];
 for(const year of years){
  const [snapshot,turnout]=await Promise.all([
   Legislative.load(year,fetcher),
   fs.readFile('assets/history-legislative-turnout-'+year+'.json','utf8').then(JSON.parse)
  ]);
  const result=Coverage.analyze(snapshot,'legislative',undefined,{turnout});
  const summary={year,status:result.all.status,contests:result.all.contests,candidates:result.all.candidates,
   missingVotes:result.all.missingVotes,missingWinner:result.all.missingWinners,
   missingParty:result.all.missingParty,missingNumber:result.all.missingNumber,
   missingGender:result.all.missingGender,missingIncumbent:result.all.missingIncumbent,
   missingTurnout:result.all.missingFields.registered_voters,
   unreconciled:result.all.unreconciled,
   countyRows:result.all.countyRows,townRows:result.all.townRows,
   countyPartial:result.counties.filter(c=>c.status==='partial').length};
  summaries.push(summary);
  assert.ok(summary.contests>0&&summary.candidates>0,year+' missing registered results');
  assert.ok(summary.countyRows>0,year+' missing county vote records');
  assert.equal(summary.missingVotes,0,year+' must not have missing candidate votes');
  assert.equal(summary.unreconciled,0,year+' candidate valid-vote sums must reconcile');
 }
 console.log('LEGISLATIVE_COVERAGE_VERIFIED',JSON.stringify(summaries));
});
