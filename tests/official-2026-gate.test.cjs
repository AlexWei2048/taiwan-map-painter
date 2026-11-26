const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash,webcrypto}=require('node:crypto');
const Core=require('../history-core.js');
function fixture(){
 const offices=['mayor','council','township'];
 const directory={districts:offices.map(type=>({id:type,type,seats:1,candidateIds:[type+'1',type+'2']})),candidates:offices.flatMap(type=>[1,2].map(number=>({id:type+number,districtId:type,type,number})))};
 const snapshot={schemaVersion:2,year:2026,completeness:'full',publicationStatus:'provisional',elections:directory.districts.map(d=>({office:d.type,year:2026,election_id:'2026-'+d.type})),contests:directory.districts.map(d=>({contest_id:d.id,election_id:'2026-'+d.type,seats:1,valid_votes:100,registered_voters:150,ballots_cast:105,invalid_votes:5})),candidacies:directory.candidates.map(c=>({candidate_id:c.id,contest_id:c.districtId,ballot_number:String(c.number),votes:c.number===1?60:40,elected_official:c.number===1})),rows:directory.candidates.map(c=>({candidateId:c.id,type:c.type,level:{mayor:'county',council:'district',township:'town'}[c.type],number:String(c.number),votes:c.number===1?60:40,elected:c.number===1}))};
 const bytes=Buffer.from(JSON.stringify(snapshot));
 const manifest={schemaVersion:1,year:2026,status:'published',resultStatus:'provisional',file:'assets/history-2026.json',candidateCount:6,districtCount:3,sha256:createHash('sha256').update(bytes).digest('hex')};
 return {directory,snapshot,bytes,manifest};
}
test('2026 publication requires exact checksum and full reconciled result',async()=>{
 const {directory,snapshot,bytes,manifest}=fixture();
 assert.deepEqual(await Core.decodeOfficial2026(bytes,manifest,directory,webcrypto),snapshot);
 await assert.rejects(Core.decodeOfficial2026(Buffer.concat([bytes,Buffer.from(' ')]),manifest,directory,webcrypto),/校验值不一致/);
 await assert.rejects(Core.decodeOfficial2026(bytes,manifest,directory,null),/HTTPS/);
 assert.equal(Core.official2026Manifest({...manifest,status:'awaiting_results'},directory),false);
 assert.equal(Core.official2026Manifest({...manifest,file:'assets/other.json'},directory),false);
});
test('2026 result gate rejects inconsistent district, candidate, vote and town rows',()=>{
 const mutations=[s=>s.candidacies[0].votes++,s=>s.candidacies[0].elected_official=false,s=>s.candidacies[0].candidate_id=s.candidacies[1].candidate_id,s=>s.candidacies[0].ballot_number='3',s=>s.rows[0].votes++,s=>s.rows.pop(),s=>s.contests[0].valid_votes++,s=>s.contests[0].ballots_cast=99,s=>s.contests[0].seats=2,s=>s.publicationStatus='certified',s=>s.rows.push({...s.rows[0],level:'town',town:'甲',votes:60}),s=>s.rows.push({...s.rows[0]})];
 for(const mutate of mutations){const {snapshot,manifest,directory}=fixture();mutate(snapshot);assert.throws(()=>Core.validateOfficial2026(snapshot,manifest,directory),/校验失败/)}
});
