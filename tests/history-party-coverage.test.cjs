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