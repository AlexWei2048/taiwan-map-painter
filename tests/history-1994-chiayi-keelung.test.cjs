'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const Local=require('../history-local.js');
const Core=require('../history-core.js');
const Workspace=require('../history-workspace.js');
const council=require('../assets/history-local-1994-council.json');
const chiayi=require('../sources/history-1994-chiayi-prior-council.json');
const keelung=require('../sources/history-1994-keelung-council-profile.json');
const taoyuan=require('../sources/history-1994-taoyuan-council-profile.json');
const changhua=require('../sources/history-1994-changhua-council-profile.json');
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
 assert.deepEqual([audit.confirmed_true,audit.inferred_true,audit.inferred_false,audit.unverified],[2,19,42,2]);
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
 const profiles=council.verified_county_profiles;
 assert.equal(new Set(profiles.map(p=>p.county)).size,profiles.length);
 for(const expected of [keelung,taoyuan])assert.deepEqual(profiles.find(p=>p.county===expected.county),expected);
 for(const p of profiles){
  assert.equal(p.ballots_cast,p.valid_votes+p.invalid_votes,p.county);
  assert.ok(p.registered_voters>=p.ballots_cast,p.county);
  const rows=council.districts.filter(d=>d.county===p.county);
  assert.equal(rows.reduce((n,d)=>n+d.valid_votes,0),p.valid_votes,p.county);
 }
});
test('1994 Changhua official county profile reconciles with eight published constituencies',()=>{
 const districts=council.districts.filter(d=>d.county==='彰化縣');
 assert.equal(districts.length,8);
 assert.equal(districts.reduce((n,d)=>n+d.candidates.length,0),changhua.candidate_count);
 assert.equal(districts.reduce((n,d)=>n+d.valid_votes,0),changhua.valid_votes);
 assert.equal(districts.reduce((n,d)=>n+d.candidates.filter(c=>c[5]).length,0),changhua.elected_count);
 assert.equal(changhua.ballots_cast,changhua.valid_votes+changhua.invalid_votes);
 assert.equal(changhua.candidate_count,changhua.male_candidates+changhua.female_candidates);
 assert.ok(districts.every(d=>d.registered_voters===null&&d.ballots_cast===null));
});
test('1994 local council snapshot exposes county-level summary without merging unverified district turnout',async()=>{
 const fetcher=async filename=>({
  ok:true,
  json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',filename.split('?')[0]),'utf8'))
 });
 const data=await Local.loadCycle(1994,'council',fetcher);
 assert.equal(new Set(data.verifiedCouncilCountyProfiles.map(p=>p.county)).size,data.verifiedCouncilCountyProfiles.length);
 assert.deepEqual(data.verifiedCouncilCountyProfiles.find(p=>p.county===changhua.county),changhua);
 const indexed=Core.index(data);
 const countyOverview=Workspace.overviewRegionData(indexed,{year:1994,office:'council',scope:'county',county:'彰化县'});
 assert.equal(countyOverview.overview.registeredVoters,changhua.registered_voters);
 assert.equal(countyOverview.overview.ballotsCast,changhua.ballots_cast);
 assert.equal(countyOverview.overview.invalidVotes,changhua.invalid_votes);
 assert.equal(countyOverview.overview.validVotes,changhua.valid_votes);
 const districtOverview=Workspace.overviewRegionData(indexed,{year:1994,office:'council',scope:'district',county:'彰化县',area:countyOverview.result.contests[0].contest_id});
 assert.equal(districtOverview.overview.registeredVoters,null);
 assert.deepEqual(data.verifiedCouncilCountyProfiles.find(p=>p.county===keelung.county),keelung);
 const keels=data.contests.filter(c=>c.county_name==='基隆市'&&c.election_id==='1994-council-counties');
 assert.equal(keels.length,8);
 assert.ok(keels.every(c=>c.ballots_cast===null&&c.registered_voters===null));
 const chiayis=data.candidacies.filter(c=>c.contest_id.startsWith('1994-council-counties:嘉义县:'));
 assert.equal(chiayis.length,65);
 assert.equal(chiayis.filter(c=>c.incumbent_at_election===true).length,21);
 assert.equal(chiayis.filter(c=>c.incumbent_at_election===false).length,42);
 assert.equal(chiayis.filter(c=>c.incumbent_at_election===null).length,2);
});

test('Chiayi roster nonmatches remain explicitly inferred; possible name variants stay unknown',()=>{
 const p=require('../sources/history-1994-chiayi-incumbency-followup-20261127.json');
 const ds=council.districts.filter(d=>d.county==='嘉義縣');
 assert.equal(p.records.length,42);assert.equal(p.ambiguous.length,2);
 for(const r of p.records){const d=ds.find(d=>d.number===r.district_number&&d.electorate===r.electorate);const c=d.candidates.find(c=>c[0]===r.ballot_number);assert.deepEqual([c[1],c[2]],[r.name,r.votes]);assert.ok(!p.roster_names.includes(r.name));const v=d.incumbent_sources[String(r.ballot_number)];assert.equal(v.value,false);assert.equal(v.confidence,'inferred_from_official_roster');assert.equal(v.source_url,p.source_url);}
 for(const r of p.ambiguous){const d=ds.find(d=>d.candidates.some(c=>c[1]===r.name));const c=d.candidates.find(c=>c[1]===r.name);assert.equal(d.incumbent_sources?.[String(c[0])],undefined);}
});
