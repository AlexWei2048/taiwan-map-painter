const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const L=require('../history-legislative.js');
const T=require('../history-legislative-turnout.js');
const read=p=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',p),'utf8'));
test('2001 exact CEC corrections preserve identity, rollups and original snapshot',async()=>{
 const snapshot=read('assets/history-legislative-2001.json');
 const audit=read('sources/history-legislative-2001-vote-reconciliation.json');
 const count=snapshot.rows.length,winners=snapshot.candidacies.filter(c=>c.elected_official).length;
 const loaded=await L.load(2001,async()=>({ok:true,json:async()=>snapshot}));
 assert.equal(loaded.rows.length,count);
 assert.equal(loaded.candidacies.filter(c=>c.elected_official).length,winners);
 for(const level of ['national','county','district','town'])assert.equal(loaded.rows.filter(r=>r.electorate==='regional'&&r.level===level).reduce((s,r)=>s+r.votes,0),level==='town'?10172558:10174005);
 for(const c of audit.corrections)for(const x of c.candidates){
  assert.equal(loaded.rows.find(r=>r.electorate==='regional'&&r.level==='town'&&r.county===c.county&&r.town===c.town&&r.number===x.number).votes,x.new_votes);
  assert.equal(loaded.rows.find(r=>r.electorate==='regional'&&r.level==='district'&&r.district===c.district&&r.number===x.number).votes,x.official_district_votes);
 }
 const before=JSON.stringify(loaded);L.apply2001Corrections(loaded);assert.equal(JSON.stringify(loaded),before);
 const turnout=await T.load(2001,async()=>({ok:true,json:async()=>read('assets/history-legislative-turnout-2001.json')}));
 for(const p of audit.profiles)assert.deepEqual(p.scope==='county'?turnout.ballots.regional.county[p.county]:turnout.ballots.regional[p.scope][p.county][p.area],p.profile);
 assert.equal(audit.official_valid-audit.corrected_town_valid,1447);
 assert.equal(audit.official_valid-audit.corrected_valid,0);
 assert.deepEqual(turnout.ballots.regional.national,audit.district3OfficialTotals.profiles.national);
 assert.deepEqual(turnout.ballots.regional.county['台北县'],audit.district3OfficialTotals.profiles.county);
 assert.deepEqual(turnout.ballots.regional.district['台北县']['3'],audit.district3OfficialTotals.profiles.district);
 assert.match(L.note(2001,'regional'),/1,447/);
});
