const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../history-coverage.js');
test('Coverage distinguishes recorded, partial, missing and explicit non-election; zero is valid',()=>{
 const fixture={year:2022,elections:[{office:'mayor',election_id:'m',counties:['甲县','乙县','丙县'],noElectionCounties:['丁县']}],contests:[{election_id:'m',contest_id:'a',county_name:'甲县',seats:1,registered_voters:12,ballots_cast:10,valid_votes:9,invalid_votes:1},{election_id:'m',contest_id:'b',county_name:'乙县',seats:1,valid_votes:0}],candidacies:[{contest_id:'a',votes:9,elected_official:true,ballot_number:'1',gender:'女',party_name:'无党籍',incumbent_at_election:false},{contest_id:'b',votes:0,elected_official:true,ballot_number:'1',gender:'男',party_name:'无党籍',incumbent_at_election:false}],rows:[]};
 const r=C.analyze(fixture,'mayor');assert.deepEqual(Object.fromEntries(r.counties.map(x=>[x.county,x.status])),{'甲县':'recorded','乙县':'partial','丙县':'missing','丁县':'na'});assert.equal(r.counties[1].missingFields.valid_votes,0);
});
test('1994 real partial township archives are not counted as complete candidate results',()=>{
 const source=require('../assets/history-local-1994.json'),r=C.analyze(source,'township');
 assert.equal(r.all.status,'partial');assert.ok(r.all.partialArchives>0);
 const kinmen=r.counties.find(x=>x.county==='金门县');assert.equal(kinmen.status,'partial');assert.ok(kinmen.partialArchives>0);
 assert.equal(r.all.candidates,source.candidacies.filter(c=>source.contests.some(t=>t.contest_id===c.contest_id&&t.election_id==='1994-township')).length);
});
test('Unknown geography is not automatically an election that did not occur',()=>{
 const r=C.analyze({year:1994,elections:[{office:'mayor',election_id:'m'},{office:'township',election_id:'t'}],contests:[{election_id:'m',contest_id:'a',county_name:'甲市'}],candidacies:[],rows:[]},'township');
 assert.equal(r.counties[0].status,'unknown');
});
