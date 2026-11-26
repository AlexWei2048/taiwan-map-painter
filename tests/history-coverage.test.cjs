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

test('Merger and renaming cells use period geography, not false missing flags',()=>{
 assert.equal(C.countyKey('台中市',2009),'原台中市');
 assert.equal(C.countyKey('台中市',2010),'台中市');
 for(const name of ['台中县','原台中市','台南县','原台南市','高雄县','原高雄市','台北县'])
  assert.equal(C.matrixEntry({counties:[]},name,2010,'mayor').status,'na');
 for(const name of ['新北市','台中市','台南市','高雄市'])
  assert.equal(C.matrixEntry({counties:[]},name,2009,'president').status,'na');
 assert.equal(C.matrixEntry({counties:[]},'桃园市',2010,'mayor').status,'na');
 assert.equal(C.matrixEntry({counties:[]},'桃园县',2014,'council').status,'na');
 assert.equal(C.matrixEntry({counties:[]},'台北市',2022,'township').status,'na');
 assert.equal(C.matrixEntry({counties:[]},'台南市',2014,'township').status,'na');
 assert.equal(C.matrixEntry({counties:[]},'新北市',2014,'township').status,'unknown');
 assert.equal(C.matrixEntry({counties:[]},'花莲县',1994,'township').status,'unknown');
 assert.equal(C.matrixEntry({error:true},'台北县',2022,'mayor').status,'error');
});
test('A partial election does not make every recorded county partial',()=>{
 const s={year:1994,elections:[{office:'township',election_id:'t',coverage:'partial'}],contests:[{election_id:'t',contest_id:'a',county_name:'花莲县',seats:1,registered_voters:12,ballots_cast:10,valid_votes:9,invalid_votes:1}],candidacies:[{contest_id:'a',votes:9,elected_official:true,ballot_number:'1',gender:'女',party_name:'无党籍',incumbent_at_election:false}],rows:[]};
 const r=C.analyze(s,'township');assert.equal(r.all.status,'partial');assert.equal(r.counties[0].status,'recorded');
});
