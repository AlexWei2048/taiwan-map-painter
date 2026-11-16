'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../forecast-archive-core.js');
const db={
 asOf:'2026-11-16',
 districts:[
  {id:'mayor:10000',type:'mayor',county:'台北市',seats:1,candidateIds:['a','b']},
  {id:'council:10000:01',type:'council',county:'台北市',seats:2,candidateIds:['c','d','e']},
  {id:'township:10000:001',type:'township',county:'台北市',seats:1,candidateIds:['f','g']}
 ],
 candidates:[
  {id:'a',districtId:'mayor:10000',party:'甲'},{id:'b',districtId:'mayor:10000',party:'乙'},
  {id:'c',districtId:'council:10000:01',party:'甲'},{id:'d',districtId:'council:10000:01',party:'乙'},
  {id:'e',districtId:'council:10000:01',party:'甲'},
  {id:'f',districtId:'township:10000:001',party:'甲'},{id:'g',districtId:'township:10000:001',party:'乙'}
 ],
 towns:[{id:'12345678',county:'台北市',name:'中正区'}]
};
const current=()=>({
 predictions:{
  'mayor:10000':{winners:['a'],estimates:{a:{votes:650,share:65},b:{votes:350,share:35}},note:'预测'},
  'council:10000:01':{winners:['c','d'],estimates:{}},
  'township:10000:001':{winners:['f'],estimates:{}}
 },
 localPredictions:{'mayor:10000':{'12345678':{leaderId:'a',estimates:{a:{votes:65,share:65},b:{votes:35,share:35}},totalVotes:100}}}
});
const meta={id:'snapshot-2026-aabbcc',createdAt:'2026-11-16T00:00:00.000Z',label:'最终版',note:'选前归档'};
function official(){
 const contestOf=cid=>db.candidates.find(c=>c.id===cid).districtId;
 const elected=new Set(['b','c','e','f']);
 return {
  schemaVersion:2,year:2026,completeness:'full',publicationStatus:'certified',
  candidacies:db.candidates.map(c=>({candidate_id:c.id,contest_id:contestOf(c.id),votes:
   ({a:600,b:400,c:100,d:75,e:65,f:60,g:40})[c.id],
   elected_official:elected.has(c.id),vote_share:({a:60,b:40,c:100/2.4,d:75/2.4,e:65/2.4,f:60,g:40})[c.id]})),
  rows:[
   {type:'mayor',level:'town',county:'台北市',town:'中正区',candidateId:'a',votes:51},
   {type:'mayor',level:'town',county:'台北市',town:'中正区',candidateId:'b',votes:49}
  ]
 };
}
test('Manual snapshots are detached from editable predictions and contain stable IDs',()=>{
 const editing=current(),arch=A.capture(editing,db,meta);
 editing.predictions['mayor:10000'].winners=['b'];
 editing.localPredictions['mayor:10000']['12345678'].leaderId='b';
 assert.deepEqual(arch.predictions['mayor:10000'].winners,['a']);
 assert.equal(arch.localPredictions['mayor:10000']['12345678'].leaderId,'a');
 assert.equal(arch.rosterAsOf,'2026-11-16');
 assert.deepEqual(A.coverage(arch,db),{districtsRecorded:3,districtsComplete:3,seatsSelected:4,
  localAreas:1,voteForecasts:2,office:{mayor:1,council:1,township:1}});
 assert.deepEqual(A.validate(JSON.parse(JSON.stringify(arch)),db),arch);
});
test('Imported snapshots must have known district, candidate, valid shares and no duplicate winners',()=>{
 const archive=A.capture(current(),db,meta);
 const broken=JSON.parse(JSON.stringify(archive));
 broken.predictions['council:10000:01'].winners=['c','c'];
 assert.throws(()=>A.validate(broken,db),/重复/);
 broken.predictions['council:10000:01'].winners=['a'];
 assert.throws(()=>A.validate(broken,db),/不属于选区/);
 broken.predictions['council:10000:01'].winners=['c'];
 broken.predictions['mayor:10000'].estimates.a.share=101;
 assert.throws(()=>A.validate(broken,db),/得票率/);
});
test('Actual-result comparisons score exact districts, seats, parties and vote error separately',()=>{
 const forecast=A.capture(current(),db,meta);
 const out=A.compare(forecast,official(),db);
 assert.equal(out.districtsEvaluated,3);
 assert.equal(out.districtsExact,1);
 assert.equal(out.seatHits,2);
 assert.equal(out.seatsEvaluated,4);
 assert.equal(out.partySeatError,2);
 assert.equal(out.voteEstimatesCompared,2);
 assert.equal(out.voteMAE,50);
 assert.equal(out.shareEstimatesCompared,2);
 assert.equal(out.shareMAE,5);
 assert.deepEqual(out.offices.council,{districts:1,exact:0});
});
test('Missing or prepublication result files never yield an accuracy score',()=>{
 const arch=A.capture(current(),db,meta);
 const results=official();
 results.completeness='partial';assert.throws(()=>A.compare(arch,results,db),/正式发布/);
 results.completeness='full';results.year=2022;
 assert.throws(()=>A.compare(arch,results,db),/正式发布/);
});
test('Unfilled seats and missing official candidate IDs are excluded from accuracy denominator',()=>{
 const draft=current();draft.predictions['council:10000:01'].winners=['c'];
 const arch=A.capture(draft,db,meta);
 const data=official();data.candidacies=data.candidacies.filter(x=>x.candidate_id!=='g');
 const result=A.compare(arch,data,db);
 assert.equal(result.districtsEvaluated,1);
 assert.equal(result.skippedIncomplete,1);
 assert.equal(result.skippedUnmatchedOfficial,1);
});
test('Town-level accuracy only uses full official town results, not county totals',()=>{
 const arch=A.capture(current(),db,meta);
 const d={...db,towns:[{id:'12345678',county:'台北市',name:'中正区'}]};
 const data=official();
 const result=A.compare(arch,data,d);
 assert.equal(result.local.evaluated,1);
 assert.equal(result.local.correct,1);
 data.rows=data.rows.slice(0,1);
 const missing=A.compare(arch,data,d);
 assert.equal(missing.local.evaluated,0);
 assert.equal(missing.local.skipped,1);
});


test('Archived party identity is frozen even when the live candidate roster changes later',()=>{
 const archive=A.capture(current(),db,meta);
 const changed=JSON.parse(JSON.stringify(db));
 changed.candidates.find(c=>c.id==='a').party='新政党';
 const reopened=A.validate(archive,changed);
 assert.equal(reopened.candidateParties.a,'甲');
 const record=official();
 record.candidacies.forEach(c=>{c.party_name=db.candidates.find(x=>x.id===c.candidate_id).party});
 const result=A.compare(reopened,record,changed);
 assert.equal(result.partySeatError,2,'forecast party seats use archived names while actual uses official party');
});
