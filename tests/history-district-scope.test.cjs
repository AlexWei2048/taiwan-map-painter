const {test}=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../history-core.js');
const Local=require('../history-local.js');
const meta=require('../assets/history-council-districts-2022.json');
test('Council scope distinguishes a full township from a shared district and preserves verified village lists',()=>{
 const yilan=meta.rows.find(d=>d.county==='宜蘭縣'&&d.number===4);
 assert.equal(Core.councilScope(yilan,meta.rows),'員山鄉');
 const hsinchu=meta.rows.find(d=>d.county==='新竹市'&&d.number===1);
 const villages=require('../assets/history-hsinchu-geography-2022.json').features.find(d=>d.number===1).scopeVillages;
 assert.match(Core.councilScope(hsinchu,meta.rows,villages),/東區（部分里：東門里/);
 assert.match(Core.councilScope(hsinchu,meta.rows),/部分里；具体里别待核/);
 assert.equal(Core.councilScope({scope:'舊東區，東區東門里等33里',scopeTowns:[]}), '舊東區，東區東門里等33里');
});
test('Legislative geographic scope uses each election-year town record and marks only shared townships',()=>{
 const data=require('../assets/history-legislative-2024.json');
 const idx=Core.legislativeScopeIndex(data.rows);
 const scope=Core.legislativeScope(idx,'台北市',1);
 assert.match(scope,/北投区/);assert.match(scope,/士林区（部分里）/);
 assert.doesNotMatch(scope,/北投区（部分里）/);
});
test('Missing regional council quotas use their historically applicable statutory thresholds',()=>{
 const shard={year:2002,elections:[{election_id:'c',office:'council'}],contests:[
 {election_id:'c',electorate:'regional',seats:10,reserved_seats:null},
 {election_id:'c',electorate:'regional',seats:3,reserved_seats:null},
 {election_id:'c',electorate:'regional',seats:10,reserved_seats:1},
 {election_id:'c',electorate:'mountain',seats:4,reserved_seats:null}]};
 const result=Local.fillRegionalCouncilQuotas(shard);
 assert.deepEqual(result.contests.map(c=>c.reserved_seats),[2,0,1,null]);
 assert.equal(result.contests[0].reserved_seats_method,'statutory');
 assert.equal(shard.contests[0].reserved_seats,null);
 assert.deepEqual(Local.fillRegionalCouncilQuotas({...shard,year:1998}).contests.map(c=>c.reserved_seats),[1,0,1,null]);
});
