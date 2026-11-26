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

test('Merger and renaming cells use period geography and unified rows',()=>{
 assert.equal(C.countyKey('台中市',2009),'原台中市');
 assert.equal(C.countyKey('台中市',2010),'台中市');
 for(const name of ['台中县','台南县','高雄县'])assert.equal(C.countyKey(name,2009),'原'+name);
 for(const name of ['原台中县','原台中市','原台南县','原台南市','原高雄县','原高雄市'])
  assert.equal(C.matrixEntry({counties:[]},name,2010,'mayor').status,'na');
 for(const name of ['台中市','台南市','高雄市'])
  assert.equal(C.matrixEntry({counties:[]},name,2009,'president').status,'na');
 for(const [a,b,key,year] of [['台北县','新北市','新北市／台北县',2010],['桃园县','桃园市','桃园市／桃园县',2014]]){
  assert.equal(C.countyKey(a,year-1),key);assert.equal(C.countyKey(b,year),key);
  assert.equal(C.countyLabel(key,year-1),a);assert.equal(C.countyLabel(key,year),b);
  assert.equal(C.matrixEntry({counties:[{county:key,status:'recorded'}]},key,year,'mayor').status,'recorded');
  assert.equal(C.matrixEntry({counties:[]},key,year-1,'mayor').status,'unknown');
 }
 assert.equal(C.matrixEntry({counties:[]},'台北市',2022,'township').status,'na');
 assert.equal(C.matrixEntry({counties:[]},'台南市',2014,'township').status,'na');
 assert.equal(C.matrixEntry({counties:[]},'新北市／台北县',2014,'township').status,'unknown');
 assert.equal(C.matrixEntry({counties:[]},'花莲县',1994,'township').status,'unknown');
 assert.equal(C.matrixEntry({error:true},'原台中县',2022,'mayor').status,'error');
 const names=C.countyRows([{counties:[{county:'测试县'}]}]);
 assert.deepEqual(names.slice(0,6),['台北市','新北市／台北县','桃园市／桃园县','台中市','原台中市','原台中县']);
 assert.deepEqual(names.slice(-4),['嘉义市','金门县','连江县','测试县']);
 assert.equal(names.length,29);
});
test('Renamed jurisdictions share a row, but merged city and county never share a bucket',()=>{
 const s={year:2006,elections:[{office:'mayor',election_id:'m'}],contests:['台北县','桃园县','台中市','台中县'].map((county,i)=>({county_name:county,election_id:'m',contest_id:String(i),seats:1})),candidacies:[],rows:[]};
 const r=C.analyze(s,'mayor');assert.deepEqual(r.counties.map(x=>x.county),['新北市／台北县','桃园市／桃园县','原台中市','原台中县']);assert.equal(r.all.contests,4);
});
test('A partial election does not make every recorded county partial',()=>{
 const s={year:1994,elections:[{office:'township',election_id:'t',coverage:'partial'}],contests:[{election_id:'t',contest_id:'a',county_name:'花莲县',seats:1,registered_voters:12,ballots_cast:10,valid_votes:9,invalid_votes:1}],candidacies:[{contest_id:'a',votes:9,elected_official:true,ballot_number:'1',gender:'女',party_name:'无党籍',incumbent_at_election:false}],rows:[]};
 const r=C.analyze(s,'township');assert.equal(r.all.status,'partial');assert.equal(r.counties[0].status,'recorded');
});

test('Party-list ballots do not require individual gender or incumbency; national aggregates are not county rows',()=>{
 const s={year:2004,elections:[{office:'legislative',election_id:'p',electorate:'party'}],contests:[{election_id:'p',contest_id:'p1',county_name:'全部地区',electorate:'party',valid_votes:100}],candidacies:[{contest_id:'p1',party_name:'甲党',votes:100}],rows:[]};
 const r=C.analyze(s,'legislative');assert.equal(r.all.missingGender,0);assert.equal(r.all.missingIncumbent,0);assert.equal(r.all.missingNumber,0);assert.equal(r.counties.length,0);assert.equal(r.all.status,'recorded');
});