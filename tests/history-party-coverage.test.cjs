const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const audit=require('../sources/history-1994-party-audit.json'),archive=require('../assets/history-local-1994-council.json');
test('1994 party corrections preserve candidate names, votes and recorded evidence; unresolved records are explicit',()=>{
 const rows=archive.districts.flatMap(d=>d.candidates.map(c=>({county:d.county,district:d.number,electorate:d.electorate,number:c[0],name:c[1],votes:c[2],party:c[3],elected:c[5]})));
 for(const e of audit.updated){const r=rows.find(r=>r.county===e.county&&r.district===e.district&&r.number===e.number);assert.equal(r.name,e.name);assert.equal(r.votes,e.votes);assert.equal(r.party,e.party);assert.match(e.source,/^https:/)}
 assert.deepEqual(rows.filter(r=>!r.party).map(({party,...r})=>r),audit.unresolved);
 for(const d of archive.districts){assert.equal(d.candidates.reduce((n,c)=>n+c[2],0),d.valid_votes);assert.equal(d.candidates.filter(c=>c[5]).length,d.seats)}
});
test('Inventory missing party values across all historical snapshot files',()=>{
 const dir=path.join(__dirname,'../assets'),unknown=p=>!String(p??'').trim()||/资料缺失|資料缺失|不詳|不详|未知/.test(String(p));
 const summary=[];
 for(const file of fs.readdirSync(dir).filter(f=>/^history-(?:2022|local-\d{4}|president-\d{4}|legislative-\d{4})\.json$/.test(f))){
  const s=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8')),missing=(s.candidacies||[]).filter(c=>unknown(c.party_name)),rows=(s.rows||[]).filter(r=>unknown(r.party));
  if(missing.length||rows.length)summary.push({file,candidates:missing.map(c=>[c.contest_id,c.candidate_name,c.ballot_number,c.party_name]),rowCount:rows.length});
 }
 console.log('PARTY_COVERAGE_AUDIT '+JSON.stringify(summary));assert.ok(Array.isArray(summary));
});
 test('Kinmen 1994 winner votes and membership match the separately documented partial return',()=>{const k=archive.partial_returns[0];assert.deepEqual(k,require('../sources/history-1994-kinmen-partial.json'));const winners=k.districts.flatMap(d=>d.winners);assert.equal(winners.length,16);assert.ok(winners.every(w=>Number.isInteger(w[2])&&w[2]>0&&w[3]==='中國國民黨'));assert.equal(winners.reduce((n,w)=>n+w[2],0),9991);assert.equal(k.valid_votes,null);assert.match(k.winner_detail_source_url,/^https:/);});

 test('Gender backfill needs two unique, consistent same-district matches and never fills party',()=>{const Local=require('../history-local.js');const a={districts:[{county:'臺南市',number:1,electorate:'regional',candidates:[[1,'測試甲',100,'',null,true],[2,'測試乙',50,'',null,false]]}]};const ref=(year,g)=>({year,elections:[{office:'council',election_id:'e'}],contests:[{election_id:'e',contest_id:'d',county_name:'台南市',district_number:1,electorate:'regional'}],candidacies:[{contest_id:'d',candidacy_id:'a'+year,candidate_name:'測試甲',gender:g}]});const result=Local.enrichLegacyGender(a,[ref(1998,'女'),ref(2002,'女')]);assert.equal(result.districts[0].candidates[0][4],'女');assert.equal(result.districts[0].candidates[0][3],'');assert.equal(result.districts[0].candidates[1][4],null);assert.equal(a.districts[0].candidates[0][4],null);assert.equal(Local.enrichLegacyGender(a,[ref(1998,'女'),ref(2002,'男')]).districts[0].candidates[0][4],null);});
 test('Report gender recovery from historical official snapshots',()=>{const Local=require('../history-local.js');const result=Local.enrichLegacyGender(archive,[require('../assets/history-local-1998.json'),require('../assets/history-local-2002.json')]);const recovered=result.districts.reduce((n,d)=>n+Object.keys(d.gender_sources||{}).length,0);console.log('1994_GENDER_RECOVERED '+recovered);assert.equal(result.districts.length,archive.districts.length);for(let i=0;i<archive.districts.length;i++){const original=archive.districts[i],updated=result.districts[i];assert.deepEqual(updated.candidates.map(c=>[c[0],c[1],c[2],c[3],c[5]]),original.candidates.map(c=>[c[0],c[1],c[2],c[3],c[5]]));}});
