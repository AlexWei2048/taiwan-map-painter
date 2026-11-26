'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const archive=require('../assets/history-local-1994-council.json');
const src=require('../sources/history-1994-yilan-prior-council.json');
const Local=require('../history-local.js');
test('1994 Yilan incumbency classifications use all 33 winners in the 1990 CEC official results list',()=>{
 const ds=archive.districts.filter(d=>d.county==='宜蘭縣');
 const data=ds.flatMap(d=>d.candidates.map(c=>({d,c,source:d.incumbent_sources?.[String(c[0])]})));
 const winners=new Set(src.official_elected_winners.map(x=>x.name));
 assert.equal(ds.length,10);
 assert.equal(data.length,69);
 assert.equal(winners.size,33);
 assert.equal(data.filter(x=>x.source?.value===true).length,25);
 assert.equal(data.filter(x=>x.source?.value===false).length,42);
 assert.equal(data.filter(x=>x.source==null).length,2);
 assert.ok(data.filter(x=>x.source?.value===true).every(x=>winners.has(x.c[1])));
 assert.ok(data.filter(x=>x.source?.value===false).every(x=>!winners.has(x.c[1])));
 assert.equal(src.newly_matched_negative_candidates.length,37);
 for(const c of src.newly_matched_negative_candidates){
  const item=data.find(x=>x.d.number===c.district_number&&x.c[0]===c.ballot_number);
  assert.ok(item,c.candidate_name);
  assert.deepEqual([item.c[1],item.c[2],item.c[3],item.c[4]],[c.candidate_name,c.votes,c.party,c.gender]);
  assert.equal(item.source.method,'official_prior_election_complete_winners_nonmatch');
  assert.equal(item.source.value,false);
  assert.equal(item.source.source_url,src.source_url);
 }
 assert.deepEqual(data.filter(x=>!x.source).map(x=>x.c[1]).sort(),['林榮木','陳秀暖'].sort());
});
test('Yilan official prior-term backfill flows to runtime snapshot without changing candidate votes',async()=>{
 const fetcher=async f=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',f.split('?')[0]),'utf8'))});
 const x=await Local.loadCycle(1994,'council',fetcher);
 const rows=x.candidacies.filter(c=>c.contest_id.startsWith('1994-council-counties:宜兰县:'));
 assert.equal(rows.length,69);
 assert.equal(rows.filter(c=>c.incumbent_at_election===true).length,25);
 assert.equal(rows.filter(c=>c.incumbent_at_election===false).length,42);
 assert.equal(rows.filter(c=>c.incumbent_at_election===null).length,2);
 for(const r of rows){
  const d=archive.districts.find(x=>x.county==='宜蘭縣'&&r.contest_id.endsWith('第'+x.number+'选举区'));
  assert.ok(d);
  const c=d.candidates.find(x=>String(x[0])===r.ballot_number);
  assert.ok(c);
  assert.equal(r.votes,c[2]);
  assert.equal(r.incumbent_at_election,d.incumbent_sources?.[r.ballot_number]?.value??null);
 }
});
