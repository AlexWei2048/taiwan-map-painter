'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const H=require('../history-core.js');

const snapshot=JSON.parse(fs.readFileSync('assets/history-2022.json','utf8'));

test('historical constituency order is numeric within each county and electorate, then highest vote first',()=>{
 const rows=[
  {county:'台北市',electorate:'regional',district:'第10选区',name:'十',votes:900},
  {county:'台北市',electorate:'mountain',district:'第1选区',name:'山',votes:40},
  {county:'新北市',electorate:'regional',district:'第1选区',name:'新北',votes:110},
  {county:'台北市',electorate:'regional',district:'第2选区',name:'乙',votes:10},
  {county:'台北市',electorate:'regional',district:'第1选区',name:'甲次',votes:80},
  {county:'台北市',electorate:'regional',district:'第1选区',name:'甲首',votes:150},
  {county:'台北市',electorate:'plains',district:'第1选区',name:'平',votes:20}
 ];
 rows.sort((a,b)=>H.compareResultRows(a,b,'council'));
 assert.deepEqual(rows.map(x=>x.name),['甲首','甲次','乙','十','平','山','新北']);
 const mixed=['第11選舉區','第2選舉區','第1選舉區'].map(district=>({county_name:'台北市',electorate:'regional',district_name:district}));
 assert.deepEqual(mixed.sort((a,b)=>H.compareResultRows(a,b,'council')).map(x=>x.district_name),['第1選舉區','第2選舉區','第11選舉區']);
});

test('2022 snapshot exposes a versioned entity model with stable identifiers',()=>{
 assert.equal(snapshot.schemaVersion,2);
 assert.ok(Array.isArray(snapshot.elections)&&snapshot.elections.length===3);
 assert.ok(Array.isArray(snapshot.contests)&&snapshot.contests.length>300);
 assert.ok(Array.isArray(snapshot.candidacies)&&snapshot.candidacies.length>2000);
 assert.ok(snapshot.elections.every(e=>/^2022-(mayor|council|township)$/.test(e.election_id)));
 assert.ok(snapshot.contests.every(c=>c.contest_id&&c.election_id&&c.county_id));
 assert.ok(snapshot.candidacies.every(c=>c.candidacy_id&&c.contest_id&&'candidate_id' in c));
});

test('enriched 2022 history has verified complete candidate and turnout fields',()=>{
 assert.equal(snapshot.candidacies.length,2280);
 assert.equal(snapshot.contests.length,441);
 assert.ok(snapshot.candidacies.every(c=>['男','女'].includes(c.gender)&&typeof c.incumbent_at_election==='boolean'));
 assert.ok(snapshot.rows.every(r=>['男','女'].includes(r.gender)&&typeof r.incumbent==='boolean'));
 for(const c of snapshot.contests){
  assert.ok(Number.isInteger(c.registered_voters)&&Number.isInteger(c.ballots_cast)&&Number.isInteger(c.invalid_votes),c.contest_id);
  assert.equal(c.valid_votes+c.invalid_votes,c.ballots_cast,c.contest_id);
  assert.ok(c.ballots_cast<=c.registered_voters,c.contest_id);
 }
 assert.match(snapshot.provenance.cecArchiveEnrichment.source,/^https:\/\/data\.cec\.gov\.tw\//);
 assert.match(snapshot.provenance.cecArchiveEnrichment.sha256,/^[a-f0-9]{64}$/);
 const chiayi=snapshot.contests.find(c=>c.election_id==='2022-mayor'&&c.county_name==='嘉义市');
 assert.ok(chiayi);
 assert.equal(chiayi.election_date,'2022-12-18');
 assert.deepEqual([chiayi.registered_voters,chiayi.ballots_cast,chiayi.valid_votes,chiayi.invalid_votes],[214130,94188,93813,375]);
 const chiayiCandidates=snapshot.candidacies.filter(c=>c.contest_id===chiayi.contest_id);
 assert.equal(chiayiCandidates.length,5);
 assert.equal(chiayiCandidates.filter(c=>c.incumbent_at_election).length,1);
 assert.equal(chiayiCandidates.find(c=>c.candidate_name==='黄敏惠').gender,'女');
});

test('official result semantics and source labels survive normalization',()=>{
 const marks=new Set(snapshot.candidacies.map(c=>c.elected_mark));
 assert.ok(marks.has('*'),'ordinary official winners retained');
 assert.ok(snapshot.candidacies.every(c=>['','*','!','?'].includes(c.elected_mark)));
 assert.ok(snapshot.candidacies.every(c=>typeof c.candidate_name==='string'&&typeof c.candidate_name_official==='string'));
 assert.ok(snapshot.candidacies.every(c=>c.elected_official===(c.elected_mark==='*'||c.elected_mark==='!')));
});

test('contest statistics are explicit and missing figures are null rather than invented',()=>{
 for(const contest of snapshot.contests){
  for(const key of ['registered_voters','ballots_cast','valid_votes','invalid_votes']){
   assert.ok(contest[key]===null||Number.isInteger(contest[key]),contest.contest_id+' '+key);
  }
  if(contest.valid_votes!==null){
   const votes=snapshot.candidacies.filter(c=>c.contest_id===contest.contest_id).reduce((n,c)=>n+c.votes,0);
   assert.equal(votes,contest.valid_votes,contest.contest_id+' valid vote reconciliation');
  }
  if(contest.ballots_cast!==null&&contest.invalid_votes!==null&&contest.valid_votes!==null)
   assert.equal(contest.ballots_cast,contest.valid_votes+contest.invalid_votes);
 }
});

test('snapshot provenance identifies every downloaded source and its checksum',()=>{
 assert.equal(snapshot.provenance.schemaVersion,2);
 assert.ok(Array.isArray(snapshot.provenance.files)&&snapshot.provenance.files.length>=55);
 assert.ok(snapshot.provenance.files.every(f=>f.filename&&/^https:\/\//.test(f.url)&&/^[a-f0-9]{64}$/.test(f.sha256)));
});

function fixture(){
 const elections=[
  {election_id:'2022-mayor',year:2022,office:'mayor'},
  {election_id:'2022-council',year:2022,office:'council'}
 ];
 const contests=[
  {contest_id:'m-a',election_id:'2022-mayor',county_id:'a',electorate:'regional',seats:1,
   registered_voters:200,ballots_cast:160,valid_votes:150,invalid_votes:10},
  {contest_id:'c-r',election_id:'2022-council',county_id:'a',electorate:'regional',seats:4,
   registered_voters:200,ballots_cast:150,valid_votes:140,invalid_votes:10},
  {contest_id:'c-p',election_id:'2022-council',county_id:'a',electorate:'plains',seats:1,
   registered_voters:40,ballots_cast:30,valid_votes:28,invalid_votes:2}
 ];
 const candidacies=[
  {candidacy_id:'m1',contest_id:'m-a',candidate_name:'甲',party_name:'蓝党',gender:'男',votes:90,vote_share:60,elected_official:true,elected_mark:'*',incumbent_at_election:true},
  {candidacy_id:'m2',contest_id:'m-a',candidate_name:'乙',party_name:'绿党',gender:'女',votes:60,vote_share:40,elected_official:false,elected_mark:'',incumbent_at_election:false},
  {candidacy_id:'r1',contest_id:'c-r',candidate_name:'丙',party_name:'蓝党',gender:'女',votes:50,vote_share:35.714286,elected_official:true,elected_mark:'!'},
  {candidacy_id:'r2',contest_id:'c-r',candidate_name:'丁',party_name:'绿党',gender:'男',votes:40,vote_share:28.571429,elected_official:true,elected_mark:'*'},
  {candidacy_id:'r3',contest_id:'c-r',candidate_name:'戊',party_name:'蓝党',gender:'男',votes:30,vote_share:21.428571,elected_official:true,elected_mark:'*'},
  {candidacy_id:'r4',contest_id:'c-r',candidate_name:'己',party_name:'绿党',gender:'女',votes:20,vote_share:14.285714,elected_official:true,elected_mark:'*'},
  {candidacy_id:'p1',contest_id:'c-p',candidate_name:'庚',party_name:'绿党',gender:'女',votes:28,vote_share:100,elected_official:true,elected_mark:'*'}
 ];
 return{schemaVersion:2,elections,contests,candidacies};
}

test('single-seat summaries expose leader, winner and hand-calculated margin',()=>{
 const data=fixture(),contest=data.contests[0];
 const summary=H.contestSummary(contest,data.candidacies.filter(c=>c.contest_id===contest.contest_id));
 assert.equal(summary.leader.candidate_name,'甲');
 assert.equal(summary.winners[0].candidate_name,'甲');
 assert.equal(summary.margin,20);
 assert.equal(summary.turnout,80);
 assert.equal(summary.validVotes,150);
});

test('councillor badges preserve every party and tied seat composition',()=>{
 const data=fixture(),contest=data.contests[1];
 const summary=H.contestSummary(contest,data.candidacies.filter(c=>c.contest_id===contest.contest_id));
 assert.deepEqual(H.councilBadges(summary),[
  {party:'蓝党',seats:2},{party:'绿党',seats:2}
 ]);
 assert.equal(summary.winners.length,4);
});

test('filter uses stable IDs and overview keeps overlapping electorates separate',()=>{
 const index=H.index(fixture());
 const result=H.filter(index,{year:2022,office:'council',countyId:'a',electorate:'all'});
 assert.equal(result.contests.length,2);
 const overview=H.overview(result);
 assert.equal(overview.turnout,null,'no misleading combined turnout');
 assert.deepEqual(overview.turnoutGroups.map(x=>[x.electorate,x.registeredVoters,x.ballotsCast,x.turnout]),[
  ['regional',200,150,75],['plains',40,30,75]
 ]);
 assert.equal(overview.candidateCount,5);
 assert.equal(overview.electedCount,5);
 assert.equal(overview.validVotes,null,'overlapping electorates must not publish one combined valid-vote total');
 assert.equal(overview.invalidVotes,null,'overlapping electorates must not publish one combined invalid-vote total');
});

test('missing ballot statistics stay unavailable while candidate totals remain usable',()=>{
 const data=fixture();data.contests[0]={...data.contests[0],registered_voters:null,ballots_cast:null,invalid_votes:null};
 const result=H.filter(H.index(data),{year:2022,office:'mayor',countyId:'a',electorate:'regional'});
 const summary=result.summaries[0],overview=H.overview(result);
 assert.equal(summary.turnout,null);
 assert.equal(overview.turnout,null);
 assert.equal(overview.validVotes,150);
});

test('missing incumbency is unavailable rather than reported as zero incumbents',()=>{
 const data=fixture();for(const item of data.candidacies)item.incumbent_at_election=null;
 const result=H.filter(H.index(data),{year:2022,office:'mayor',countyId:'a',electorate:'regional'});
 assert.equal(H.overview(result).incumbentCount,null);
});
