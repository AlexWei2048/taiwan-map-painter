'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Coverage=require('../history-coverage.js');
const election={office:'legislative',election_id:'legislative:2024:regional',electorate:'regional'};
const contest={contest_id:'r',election_id:election.election_id,county_name:'甲县',district_name:'甲县第1选区',electorate:'regional',seats:1,valid_votes:60,registered_voters:null,ballots_cast:null,invalid_votes:null};
const person={contest_id:'r',candidate_name:'甲候选人',party_name:'甲党',ballot_number:'1',votes:60,elected_official:true,gender:null,incumbent_at_election:null};
const build=(options={})=>Coverage.analyze({year:2024,elections:[election],contests:[{...contest,...(options.contest||{})}],candidacies:[{...person,...(options.person||{})}],rows:[{electorate:'regional',level:'county',county:'甲县',votes:60},{electorate:'regional',level:'town',county:'甲县',town:'甲镇',votes:60}]},'legislative',undefined,{turnout:options.turnout||{ballots:{regional:{county:{'甲县':[100,65,60,5]}}}}});
test('separate verified legislative turnout and archived result produce recorded rather than false partial',()=>{
 const r=build();assert.equal(r.all.status,'recorded');assert.equal(r.counties[0].status,'recorded');
 assert.equal(r.all.missingFields.registered_voters,0);assert.equal(r.all.missingFields.ballots_cast,0);
 assert.equal(r.all.missingGender,1);assert.equal(r.all.missingIncumbent,1);
 assert.equal(r.all.countyRows,1);assert.equal(r.all.townRows,1);
});
test('legislative totals must match candidate votes and certified turnout',()=>{
 assert.equal(build({person:{votes:59}}).all.status,'partial');
 assert.equal(build({turnout:{ballots:{regional:{county:{'甲县':[100,65,59,6]}}}}}).all.status,'partial');
 assert.equal(build({person:{elected_official:null}}).all.status,'partial');
});
test('multi-constituency county turnout is never attributed to either constituent district',()=>{
 const rows=[{...contest,contest_id:'r2',district_name:'甲县第2选区',seats:1,valid_votes:70}];
 const snapshot={year:2004,elections:[election],contests:[contest,...rows],candidacies:[person,{...person,contest_id:'r2',votes:70}],rows:[]};
 const profile={ballots:{regional:{county:{'甲县':[250,140,130,10]},district:{'甲县':{'1':[125,65,60,5]}}}}};
 const r=Coverage.analyze(snapshot,'legislative',undefined,{turnout:profile});
 assert.equal(r.counties[0].status,'partial');assert.equal(r.counties[0].missingFields.registered_voters,1);
});
test('pre-2008 party seat-calculation votes never require an independent party ballot',()=>{
 const s={year:2004,elections:[{election_id:'p',office:'legislative',electorate:'party'}],contests:[{contest_id:'c',election_id:'p',county_name:'全部地区',electorate:'party',valid_votes:100}],candidacies:[{contest_id:'c',party_name:'甲党',votes:100}],rows:[]};
 const r=Coverage.analyze(s,'legislative');assert.equal(r.all.status,'recorded');
 assert.deepEqual(r.all.missingFields,{registered_voters:0,ballots_cast:0,valid_votes:0,invalid_votes:0});
});
