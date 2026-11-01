'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const H=require('../history-core.js'),I=require('../import-core.js'),P=require('../prediction-core.js'),E=require('../election-core.js');
const O=require('../assets/opencc.js'),normalize=O.Converter({from:'t',to:'cn'});
const read=name=>JSON.parse(fs.readFileSync(name,'utf8'));
test('Historical and displayed district numbers share one key',()=>{
 for(const text of ['第07選舉區','第7选区','台北市第7选举区',7])assert.equal(H.districtNumber(text),'7');
 assert.equal(H.key('臺北市','plainsIndigenous','第07選舉區',normalize),H.key('台北市','plains',7,normalize));
});
test('All eight Taipei history districts match current geography by scope, with separate identities',()=>{
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('district-details.js','utf8'),ctx);
 const meta=read('assets/history-council-districts-2022.json').rows.filter(d=>normalize(d.county)==='台北市');
 const map=read('assets/map-council.json'),towns=read('assets/map-base.json').towns;
 const rows=read('assets/history-2022.json').rows.filter(r=>r.type==='council'&&r.level==='district');
 for(const h of meta){
  const identity=H.identity(h.electorate),matches=d=>normalize(d.county)==='台北市'&&H.identity(d.electorate)===identity&&Number(d.number)===h.number;
  const current=ctx.window.DISTRICT_DETAILS.council.find(matches),feature=[...map.council,...map.councilIndigenous].find(matches);
  assert.ok(H.sameScope(h,current,feature,towns,normalize),h.id);
  assert.ok(rows.some(r=>H.key(r.county,r.electorate,r.district,normalize)===H.key(h.county,h.electorate,h.number,normalize)),h.id);
 }
 assert.equal(meta.length,8);
});
test('Changed and partial district scopes remain unmatched',()=>{
 const h={electorate:'regional',scopeTowns:['甲镇','乙乡']};
 assert.equal(H.sameScope(h,{electorate:'regional',scope:'甲镇'},null,[]),false);
 assert.equal(H.sameScope(h,{electorate:'regional',scope:'甲镇、乙乡部分'},null,[]),false);
 assert.equal(H.sameScope(h,{electorate:'plains',scope:'甲镇、乙乡'},null,[]),false);
});
test('Downloaded historical CSV contains BOM, real newlines and quoted data',()=>{
 const csv=H.csv([['县市','备注'],['台北市','引号"及\n换行'],['高雄市','=1+1']]);
 assert.equal(csv.charCodeAt(0),0xfeff);assert.equal(csv.includes('\\r\\n'),false);
 assert.deepEqual(E.csv(csv),[['县市','备注'],['台北市','引号"及\n换行'],['高雄市',"'=1+1"]]);
});
test('Blank imports retain hand-picked winners and previously entered values',()=>{
 const before={winners:['a'],estimates:{a:{votes:100,share:70},b:{votes:50,share:30}},note:'旧备注'};
 const after=I.merge(before,{winners:[],estimates:{a:{votes:null,share:72}},note:''});
 assert.deepEqual(after.winners,['a']);assert.equal(after.estimates.a.votes,100);assert.equal(after.estimates.a.share,72);
 assert.equal(after.note,'旧备注');assert.equal(I.removed(before,after),0);assert.equal(before.estimates.a.share,70);
});
test('Explicit zero is saved; replacement identifies removed records',()=>{
 const before={winners:['a'],estimates:{a:{votes:100,share:70}},leaderId:'a'};
 assert.equal(I.merge(before,{estimates:{a:{votes:0,share:null}}}).estimates.a.votes,0);
 const after=I.merge(before,{winners:[],leaderId:'',estimates:{}},true);
 assert.equal(I.removed(before,after),4);assert.deepEqual(after.estimates,{});
});
test('Township merge preserves manual leader independently from vote data',()=>{
 const record=I.merge({leaderId:'a',estimates:{}},{leaderId:'',estimates:{b:{votes:25,share:null}}});
 assert.equal(record.leaderId,'a');assert.equal(record.estimates.b.votes,25);
});
test('Voting edge cases retain quota and tie protections',()=>{
 const cs=[{id:'a',gender:'男',party:'甲'},{id:'b',gender:'女',party:'乙'},{id:'c',gender:'男',party:'甲'}];
 assert.throws(()=>P.number(-1));assert.throws(()=>P.number('1.5'));
 assert.throws(()=>P.validate({seats:1},cs,{estimates:{a:{share:80},b:{share:30}}}));
 assert.equal(P.voteResult(cs,{estimates:{a:{votes:10},b:{votes:10}}}),null);
 assert.equal(P.summary({seats:2,womenReserved:1},cs,{winners:['a','c']}).status,'quota');
});
