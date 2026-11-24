const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../history-trends.js');
const snapshot={year:2022,elections:[{election_id:'c',office:'council'}],contests:[
 {contest_id:'a',election_id:'c',county_name:'台中市',electorate:'regional',registered_voters:120,ballots_cast:100,invalid_votes:0},
 {contest_id:'b',election_id:'c',county_name:'台中县',electorate:'regional',registered_voters:120,ballots_cast:100,invalid_votes:0}],
 candidacies:[{contest_id:'a',party_name:'甲',votes:60,elected_official:true,gender:'女',incumbent_at_election:true},{contest_id:'a',party_name:'乙',votes:40,elected_official:false,gender:null,incumbent_at_election:null},
 {contest_id:'b',party_name:'乙',votes:55,elected_official:true,gender:'男',incumbent_at_election:false},{contest_id:'b',party_name:'甲',votes:45,elected_official:false,gender:'男',incumbent_at_election:false}],
 rows:[{type:'council',level:'town',county:'台中市',town:'中区',votes:100,party:'甲'}]};
test('Trend aggregates unique contest votes and combines historical counties without counting town rows twice',()=>{
 const r=T.aggregate(snapshot,{office:'council',county:'台中市'});
 assert.equal(r.valid,200);assert.equal(r.seats,2);assert.equal(T.value(r,'甲','votes'),105);assert.equal(T.value(r,'甲','share'),52.5);assert.equal(T.value(r,'乙','rank'),1);assert.equal(r.seatLeader,'并列');assert.equal(r.genderCoverage,75);assert.equal(r.incumbentCoverage,75);assert.equal(r.reelectionRate,100);
 assert.equal(T.aggregate(snapshot,{office:'council',county:'台中市',unified:false}).valid,100);
});
test('Incomplete historical coverage is null, not zero; complete absent party is zero',()=>{
 const r=T.aggregate({...snapshot,year:1994},{office:'council'});
 assert.equal(r.complete,false);assert.equal(T.value(r,'甲','share'),null);
 const complete=T.aggregate(snapshot,{office:'council'});
 assert.equal(T.value(complete,'丙','votes'),0);assert.equal(T.difference(r,complete,'甲','share'),null);
});
test('National presidential candidate counts are deduplicated and never turn local votes into seats',()=>{
 const s={...snapshot,elections:[{election_id:'c',office:'president'}],candidacies:snapshot.candidacies.map(c=>({...c,candidate_name:c.party_name,ballot_number:c.party_name}))};
 const r=T.aggregate(s,{office:'president'});assert.equal(r.candidateCount,2);assert.equal(r.seats,null);assert.equal(T.value(r,'甲','seats'),null);
});
test('List allocation seats require verified allocation and never imply geographic seats',()=>{
 const s={...snapshot,elections:[{election_id:'c',office:'legislative'}],contests:snapshot.contests.map(c=>({...c,electorate:'party'}))};
 const r=T.aggregate(s,{office:'legislative',electorate:'party'});assert.equal(r.seats,null);
 const v=T.aggregate(s,{office:'legislative',electorate:'party',partySeats:{matchesOfficial:true,totalAssigned:3,parties:[{party:'甲',seats:2},{party:'乙',seats:1}]}});
 assert.equal(v.seats,3);assert.equal(T.value(v,'甲','seats'),2);
});