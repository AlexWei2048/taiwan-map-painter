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
test('Real presidential national vote totals agree with the original national profile',()=>{
 const s=require('../assets/history-president-2024.json');
 const r=T.aggregate(s,{office:'president'});
 assert.equal(r.complete,true);
 assert.equal(r.valid,s.national.valid_votes);
 assert.equal(r.registered,s.national.registered_voters);
 assert.equal(r.candidateCount,s.national.candidate_totals.length);
 for(const p of s.national.candidate_totals)assert.equal(T.value(r,p.party,'votes'),p.votes);
});
test('Real 2022 council counts reconcile to the 910 official seats',()=>{
 const s=require('../assets/history-2022.json'),norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const r=T.aggregate(s,{office:'council',electorate:'all',normalize:norm});
 assert.equal(r.complete,true);assert.equal(r.seats,910);
 assert.equal(Object.values(r.parties).reduce((n,p)=>n+p.seats,0),910);
 const regions=T.aggregate(s,{office:'council',electorate:'all',county:'台北市',normalize:norm});
 assert.equal(regions.seats,61);
});
test('Map trends follow county and metric; top individual votes are not party totals',()=>{
 const s={year:2022,rows:[
 {type:'council',electorate:'regional',level:'district',county:'甲县',district:'第1选举区',name:'甲',party:'A',votes:45,elected:true},
 {type:'council',electorate:'regional',level:'district',county:'甲县',district:'第1选举区',name:'乙',party:'A',votes:20,elected:true},
 {type:'council',electorate:'regional',level:'district',county:'甲县',district:'第1选举区',name:'丙',party:'B',votes:35,elected:false},
 {type:'council',electorate:'regional',level:'district',county:'乙县',district:'第1选举区',name:'丁',party:'B',votes:100,elected:true}]};
 const conf={office:'council',county:'甲县',electorate:'regional',level:'district'};
 assert.equal(T.mapTrend(s,{...conf,metric:'share'}).values.value,45);
 assert.equal(T.mapTrend(s,{...conf,metric:'votes'}).values.value,45);
 assert.equal(T.mapTrend(s,{...conf,metric:'seats',party:'A'}).values.value,2);
 assert.deepEqual(T.mapTrend(s,{...conf,metric:'party'}).parties,{A:2});
 assert.equal(T.mapTrend(s,{...conf,metric:'votes',candidateScope:'candidate',candidate:{name:'乙',party:'A',county:'甲县',district:'第1选举区'}}).values.value,20);
 assert.equal(T.mapTrend(s,{...conf,metric:'share',candidateScope:'candidate',candidate:{name:'未参选',party:'A'}}).complete,false);
});
