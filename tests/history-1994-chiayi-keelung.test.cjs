'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const Local=require('../history-local.js');
const council=require('../assets/history-local-1994-council.json');
const chiayi=require('../sources/history-1994-chiayi-prior-council.json');
const keelung=require('../sources/history-1994-keelung-council-profile.json');
test('1994 Chiayi previous-term council roster adds 19 sourced positives without overwriting previous evidence',()=>{
 const districts=council.districts.filter(d=>d.county==='嘉義縣');
 assert.equal(districts.length,7);
 assert.equal(chiayi.roster_names.length,37);
 assert.equal(new Set(chiayi.roster_names).size,37);
 assert.equal(chiayi.newly_verified_candidates.length,19);
 assert.equal(new Set(chiayi.newly_verified_candidates.map(x=>x.name)).size,19);
 const known=new Map(districts.flatMap(d=>d.candidates.map(c=>[d.number+':'+c[0],{district:d,c}])));
 for(const row of chiayi.newly_verified_candidates){
  const item=known.get(row.district_number+':'+row.ballot_number);
  assert.ok(item);
  assert.equal(row.name,item.c[1]);
  assert.equal(row.votes,item.c[2]);
  assert.equal(row.party,item.c[3]);
  assert.ok(chiayi.roster_names.includes(row.name));
  const proof=item.district.incumbent_sources[String(row.ballot_number)];
  assert.equal(proof.value,true);
  assert.equal(proof.source_url,chiayi.source_url);
  assert.equal(proof.roster_name,row.name);
 }
 const hits=districts.flatMap(d=>d.candidates.filter(c=>chiayi.roster_names.includes(c[1])));
 assert.equal(hits.length,21);
 for(const name of chiayi.already_verified_names)assert.equal(hits.some(c=>c[1]===name),true);
 const audit=council.incumbency_roster_audit.find(a=>a.county==='嘉義縣');
 assert.deepEqual([audit.confirmed_true,audit.inferred_true,audit.unverified],[2,19,44]);
});
test('1994 Keelung city official council totals reconcile without filling district turnout from county totals',()=>{
 const districts=council.districts.filter(d=>d.county==='基隆市');
 assert.equal(districts.length,8);
 assert.equal(districts.reduce((n,d)=>n+d.candidates.length,0),keelung.candidate_count);
 assert.equal(districts.reduce((n,d)=>n+d.candidates.filter(c=>c[5]).length,0),keelung.elected_count);
 assert.equal(districts.reduce((n,d)=>n+d.valid_votes,0),keelung.valid_votes);
 for(const d of districts){
  assert.equal(d.candidates.reduce((n,c)=>n+c[2],0),d.valid_votes);
  assert.equal(d.registered_voters,null);
  assert.equal(d.ballots_cast,null);
  assert.equal(d.invalid_votes,null);
 }
 assert.equal(keelung.ballots_cast,keelung.valid_votes+keelung.invalid_votes);
 assert.equal(keelung.candidate_count,keelung.male_candidates+keelung.female_candidates);
 assert.equal(keelung.elected_count,keelung.male_elected+keelung.female_elected);
 assert.deepEqual(council.verified_county_profiles,[keelung]);
});
test('1994 local council snapshot exposes county-level summary without merging unverified district turnout',async()=>{
 const fetcher=async filename=>({
  ok:true,
  json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',filename.split('?')[0]),'utf8'))
 });
 const data=await Local.loadCycle(1994,'council',fetcher);
 assert.equal(data.verifiedCouncilCountyProfiles.length,1);
 assert.equal(data.verifiedCouncilCountyProfiles[0].county,'基隆市');
 const keels=data.contests.filter(c=>c.county_name==='基隆市'&&c.election_id==='1994-council-counties');
 assert.equal(keels.length,8);
 assert.ok(keels.every(c=>c.ballots_cast===null&&c.registered_voters===null));
 const chiayis=data.candidacies.filter(c=>c.contest_id.startsWith('1994-council-counties:嘉义县:'));
 assert.equal(chiayis.length,65);
 assert.equal(chiayis.filter(c=>c.incumbent_at_election===true).length,21);
});
