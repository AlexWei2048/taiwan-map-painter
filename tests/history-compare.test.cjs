const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../history-compare.js');
test('Actual 2024 presidential county results reconcile with official valid votes',()=>{
 const snapshot=require('../assets/history-president-2024.json'),r=C.summarize(snapshot,'president','all');
 assert.equal(r.counties.size,22);assert.equal(r.all.complete,true);assert.equal(r.all.valid,13947506);assert.equal(r.all.seats,null);
 assert.equal(r.all.parties['民主进步党'].votes,5586019);
});
test('Known partial township archive is not presented as a full result',()=>{
 const r=C.summarize(require('../assets/history-local-1994.json'),'township','all');
 assert.equal(r.all.complete,false);assert.equal(r.all.valid,null);
});
test('Vote deltas do not turn nonparticipation into zero, and merged counties are not compared',()=>{
 const a={complete:true,parties:{A:{share:40,seats:1}},seats:1},b={complete:true,parties:{B:{share:100,seats:1}},seats:1};
 assert.deepEqual(C.delta(a,b,'A'),{share:null,seats:-1});
 assert.deepEqual(C.delta(a,{complete:false},'A'),{share:null,seats:null});
 assert.equal(C.comparableCounty('台中市',{year:2009},{year:2014}),false);
 assert.equal(C.comparableCounty('台北市',{year:2009},{year:2014}),true);
});
test('Council ballot scope is not combined with other identities',()=>{
 const snapshot={year:2022,elections:[{office:'council',election_id:'c'}],contests:[{election_id:'c',contest_id:'a',county_name:'甲县',electorate:'regional',seats:1,valid_votes:100},{election_id:'c',contest_id:'b',county_name:'甲县',electorate:'plains',seats:1,valid_votes:100}],candidacies:[{contest_id:'a',party_name:'甲党',votes:100,elected_official:true},{contest_id:'b',party_name:'乙党',votes:100,elected_official:true}]};
 const r=C.summarize(snapshot,'council','regional');assert.equal(r.all.valid,100);assert.equal(r.all.parties['乙党'],undefined);assert.equal(r.all.seats,1);
});
