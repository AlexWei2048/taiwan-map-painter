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
test('1992 and 1998 never invent an unverified rank or an unsuccessful nominee',()=>{
 for(const year of [1992,1998])for(const party of Object.keys(Party.VERIFIED[year])){
  for(const item of Party.nominees(year,party))assert.equal(item.rank,null,year+' '+party);
 }
});
test('1995 CEC published full candidate lists and official order are restored',()=>{
 assert.equal(Party.nominationCount(1995),55);
 assert.deepEqual(['中国国民党','民主进步党','新党'].map(p=>Party.nominees(1995,p).length),[28,19,8]);
 assert.equal(Party.nominees(1995,'中国国民党')[14].name,'陈琼赞');
 assert.equal(Party.nominees(1995,'民主进步党')[11].name,'范巽绿');
 assert.equal(Party.nominees(1995,'新党')[7].name,'袁琼琼');
});
test('2004 CEC published full ranked major-party rosters, and annulment is explicit',()=>{
 assert.equal(Party.nominees(2004,'中国国民党')[0].name,'王金平');
 assert.equal(Party.nominees(2004,'中国国民党').length,24);
 assert.equal(Party.nominees(2004,'民主进步党')[0].name,'蔡煌瑯');
 assert.equal(Party.nominees(2004,'民主进步党').length,31);
 assert.equal(Party.nominees(2004,'亲民党')[0].name,'刘忆如');
 assert.equal(Party.nominees(2004,'亲民党').length,19);
 const tsu=Party.nominees(2004,'台湾团结联盟');
 assert.equal(tsu.length,10);
 assert.deepEqual(tsu.slice(0,4).map(n=>[n.rank,n.name,n.elected]),[[1,'赖幸媛',true],[2,'黄政哲',true],[3,'郭林勇',true],[4,'陈银河',true]]);
 assert.equal(tsu.at(-1).disqualified,true);
 assert.equal(tsu.at(-1).elected,false);
 assert.equal(Party.nominees(2004,'无党团结联盟').every(n=>n.rank===null),true);
});
test('2024 approved CEC full slate names and 34 original winners remain intact',()=>{
 assert.equal(Party.nominees(2024,'台湾绿党')[4]?.name,'希婻·玛飞洑');
 assert.equal(Party.nominees(2024,'台湾绿党')[5]?.name,'林莉棻');
 assert.equal(Party.nominees(2024,'小民参政欧巴桑联盟')[2]?.name,'闵柏陵');
 assert.equal(Party.nominees(2024,'中国国民党')[28]?.name,'李缙颖');
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

test('2001/2004 minor parties without an overseas slate never crash nomination rendering',()=>{
 for(const year of [2001,2004]){
  const m=Party.build(year,{rows:[{electorate:'party',level:'national',party:'劳动党',votes:900000},
   {electorate:'party',level:'national',party:'中国国民党',votes:8000000}]});
  assert.equal(m.parties.length,2);
  const small=m.parties.find(x=>x.party==='劳动党');
  assert.deepEqual(small.overseasNominees,[]);
 }
});

test('1995, 2004 and 2024 nominee identities and at-large winners match the source',()=>{
 const expected={1995:{'中国国民党':15,'民主进步党':11,'新党':4},
 2004:{'中国国民党':15,'民主进步党':16,'亲民党':6,'台湾团结联盟':4},
 2024:{'中国国民党':13,'民主进步党':13,'台湾民众党':8}};
 for(const year of [1995,2004,2024])for(const party of Object.keys(Party.VERIFIED[year])){
  const names=Party.nominees(year,party).map(n=>n.name);
  assert.equal(new Set(names).size,names.length,year+' '+party);
  assert.equal(Party.nominees(year,party).filter(n=>n.elected).length,expected[year][party]||0,year+' '+party+' at-large winners');
 }
});

test('Legislative party district dialogue keeps full party names and resets shared columns',()=>{
 const fs=require('node:fs');
 const ui=fs.readFileSync('history-2022.js','utf8');
 const css=fs.readFileSync('history-legislative.css','utf8');
 assert.match(ui,/history-party-vote-dialog',partyBallotDialog/);
 assert.match(ui,/partyBallotDialog\?r\.party:displayedCandidateName\(r\)/);
 assert.match(ui,/headers\]\.forEach\(cell=>\{cell\.hidden=false\}\)/);
 assert.match(ui,/popupWrap\.hidden=false/);
 assert.match(css,/history-party-vote-dialog.*history-candidate-table/s);
 assert.match(css,/min-width:175px;text-align:left;white-space:normal/);
});
