'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const archive=require('../assets/history-local-1994-council.json');
const source=require('../sources/history-1994-miaoli-prior-council.json');
const Local=require('../history-local.js');
const fs=require('node:fs');
const path=require('node:path');
test('Miaoli 1994 previous-term council incumbency reconciles to 38 official roster names and 84 unique candidates',()=>{
 const districts=archive.districts.filter(d=>d.county==='苗栗縣');
 const candidates=districts.flatMap(d=>d.candidates.map(c=>({d,c,proof:d.incumbent_sources?.[String(c[0])]})));
 assert.equal(source.roster_count,38);
 assert.equal(new Set(source.official_roster_names).size,38);
 assert.equal(districts.length,8);
 assert.equal(districts.reduce((n,d)=>n+d.seats,0),38);
 assert.equal(candidates.length,84);
 assert.equal(candidates.filter(x=>x.proof?.value===true).length,25);
 assert.equal(candidates.filter(x=>x.proof?.value===false).length,59);
 assert.equal(candidates.filter(x=>!x.proof).length,0);
 assert.ok(candidates.every(x=>x.proof?.source_url===source.source_url));
 for(const x of candidates){
  assert.equal(source.official_roster_names.includes(x.c[1]),x.proof.value);
  assert.equal(x.proof.election_date,'1994-01-29');
 }
 assert.equal(source.newly_classified_candidates.length,59);
 for(const entry of source.newly_classified_candidates){
  const hit=candidates.find(x=>x.d.number===entry.district_number&&x.c[0]===entry.ballot_number);
  assert.ok(hit,entry.name);
  assert.equal(hit.c[1],entry.name);
  assert.equal(hit.c[2],entry.votes);
  assert.equal(hit.c[3],entry.party);
  assert.equal(hit.c[4],entry.gender);
  assert.equal(hit.proof.method,entry.method);
  assert.equal(hit.proof.value,false);
 }
 const audit=archive.incumbency_roster_audit.find(x=>x.county==='苗栗縣');
 assert.deepEqual([audit.complete,audit.roster,audit.confirmed_true,audit.confirmed_false,audit.unverified],[true,38,25,59,0]);
});
test('Miaoli backfill flows into merged county-council historical snapshot without rewriting votes',async()=>{
 const fetcher=async filename=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',filename.split('?')[0]),'utf8'))});
 const actual=await Local.loadCycle(1994,'council',fetcher);
 const records=actual.candidacies.filter(c=>c.contest_id.startsWith('1994-council-counties:苗栗县:'));
 const sourceDistricts=archive.districts.filter(d=>d.county==='苗栗縣');
 assert.equal(records.length,84);
 assert.equal(records.filter(c=>c.incumbent_at_election===true).length,25);
 assert.equal(records.filter(c=>c.incumbent_at_election===false).length,59);
 for(const d of sourceDistricts)for(const c of d.candidates){
  const result=records.find(r=>r.contest_id.endsWith(':第'+d.number+'选举区')&&r.ballot_number===String(c[0]));
  assert.ok(result, 'missing: '+d.number+'/'+c[0]+'/'+c[1]);
  assert.equal(result.votes,c[2]);
  assert.equal(result.incumbent_at_election,d.incumbent_sources[String(c[0])].value);
 }
});
