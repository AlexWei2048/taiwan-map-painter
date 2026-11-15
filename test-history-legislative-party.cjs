'use strict';
// Regression tests: source-checked original election winners and nomination inventory.
// Run: node --test test-history-legislative-party.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Party=require('./history-legislative-party.js');

test('Historical at-large original winners sum to actual seats in all ten elections',()=>{
 const expected=new Map([[1992,30],[1995,30],[1998,41],[2001,41],[2004,41],[2008,34],[2012,34],[2016,34],[2020,34],[2024,34]]);
 for(const [year,seats] of expected){
  const actual=Object.keys(Party.VERIFIED[year]).reduce((n,party)=>
   n+Party.nominees(year,party).filter(c=>c.elected).length,0);
  assert.equal(actual,seats,year+' at-large winner count');
 }
});
test('Complete modern nomination records cover every party and preserve audited totals',()=>{
 const count={2001:129,2004:109,2008:128,2012:127,2016:179,2020:216,2024:177};
 for(const [year,total] of Object.entries(count)){
  assert.equal(Party.nominationCount(+year),total,year+' nominations');
 }
});
test("Women\u0027s guarantee modifies original winners rather than replacing nomination ranks",()=>{
 for(const [year,party,won,lost] of [
  [2012,'台湾团结联盟',4,3],
  [2016,'民主进步党',19,18],
  [2016,'中国国民党',12,11],
  [2024,'民主进步党',15,13]
 ]){
  const names=Party.nominees(year,party);
  assert.equal(names.find(c=>c.rank===won)?.elected,true,year+' '+party+' rank '+won);
  assert.equal(names.find(c=>c.rank===lost)?.elected,false,year+' '+party+' rank '+lost);
 }
});
test('Historical sources without official slate order never manufacture a rank',()=>{
 for(const year of [1992,1995,1998,2004]){
  for(const party of Object.keys(Party.VERIFIED[year])){
   for(const item of Party.nominees(year,party)){
    assert.equal(item.rank,null,year+' '+party+' unverified order');
   }
  }
 }
});
test('2024 approved CEC full slate names and 34 original winners remain intact',()=>{
 assert.equal(Party.nominees(2024,'台湾绿党')[4]?.name,'希婕·玛飞洑');
 assert.equal(Party.nominees(2024,'台湾绿党')[5]?.name,'林莉蔡');
 assert.equal(Party.nominees(2024,'小民参政欧巴桑联盟')[2]?.name,'阎柏陵');
 assert.equal(Party.nominees(2024,'中国国民党')[28]?.name,'李继显');
 assert.equal(Party.nominees(2024,'台湾民众党').filter(c=>c.elected).length,8);
 assert.equal(Party.nominees(2024,'民主进步党').filter(c=>c.elected).length,13);
});
test('2004 old two-category allocation and 2008 two-party allocation reconcile',()=>{
 const input=(year,object)=>({rows:Object.entries(object).map(([party,votes])=>({electorate:'party',level:'national',party,votes})),year});
 const old=Party.build(2004,input(2004,{'民主进步党':3471429,'中国国民党':3190081,'亲民党':1350613,'台湾团结联盟':756712}));
 assert.equal(old.matchesOfficial,true);
 assert.equal(old.totalAssigned,49);
 assert.deepEqual(old.parties.filter(p=>p.seats).map(p=>[p.party,p.atLarge,p.overseas]),[
  ['民主进步党',16,3],['中国国民党',15,3],['亲民党',6,1],['台湾团结联盟',4,1]
 ]);
 const recent=Party.build(2008,input(2008,{'中国国民党':5010801,'民主进步党':3610106}));
 assert.equal(recent.matchesOfficial,true);
 assert.deepEqual(recent.parties.map(p=>[p.party,p.seats]),[['中国国民党',20],['民主进步党',14]]);
});
