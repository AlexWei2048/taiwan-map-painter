'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../history-core.js');
const W=require('../history-workspace.js');
const Turnout=require('../history-presidential-turnout.js');

const local=Core.index(JSON.parse(fs.readFileSync('assets/history-2022.json','utf8')));
const president=Core.index(Turnout.enrich(JSON.parse(fs.readFileSync('assets/history-president-2024.json','utf8'))));

test('all-region council overview includes Kinmen and Matsu and sums identity records',()=>{
 const summary=W.overviewRegionData(local,{year:2022,office:'council',scope:'all'});
 const counties=new Set(summary.result.contests.map(c=>c.county_name));
 assert.ok(counties.has('金门县')&&counties.has('连江县'));
 const groups=summary.overview.turnoutGroups;
 assert.deepEqual(groups.map(g=>g.electorate),['regional','plains','mountain']);
 const sum=field=>groups.reduce((n,row)=>n+row[field],0);
 for(const field of ['registeredVoters','ballotsCast','validVotes','invalidVotes']){
  assert.equal(summary.overview[field],sum(field),'summed '+field);
 }
 assert.equal(summary.overview.turnout,
  summary.overview.ballotsCast/summary.overview.registeredVoters*100);
 assert.equal(W.overviewCharts(summary.overview,{office:'council'}).filter(x=>x.type==='electorate').length,3);
});
test('council county and district scopes use all identities then exactly one selected constituency',()=>{
 const {counties,areas}=W.overviewRegionChoices(local,{year:2022,office:'council',county:'高雄市'});
 assert.ok(counties.includes('金门县')&&counties.includes('连江县'));
 assert.ok(areas.length>=10);
 const county=W.overviewRegionData(local,{year:2022,office:'council',scope:'county',county:'高雄市'});
 assert.ok(county.result.contests.length>10);
 assert.equal(new Set(county.result.contests.map(c=>c.county_name)).size,1);
 assert.ok(new Set(county.result.contests.map(c=>c.electorate)).size>1);
 const area=areas[0];
 const district=W.overviewRegionData(local,{year:2022,office:'council',scope:'district',county:'高雄市',area:area.value});
 assert.equal(district.result.contests.length,1);
 assert.equal(district.result.contests[0].contest_id,area.value);
 assert.equal(district.overview.registeredVoters,district.result.contests[0].registered_voters);
});
test('2022 mayor and township offices cover all/county/town scopes without inventing voter rolls',()=>{
 for(const office of ['mayor','township']){
  const all=W.overviewRegionData(local,{year:2022,office,scope:'all'});
  const county='金门县';
  assert.ok(new Set(all.result.contests.map(c=>c.county_name)).has('连江县'));
  const choices=W.overviewRegionChoices(local,{year:2022,office,county});
  assert.ok(choices.areas.length>0,office+' no town choices');
  const region=W.overviewRegionData(local,{year:2022,office,scope:'county',county});
  assert.ok(region.result.contests.length>=1);
  const town=W.overviewRegionData(local,{year:2022,office,scope:'town',county,area:choices.areas[0].value});
  assert.ok(town);
  if(office==='mayor'){
   assert.equal(town.townVotesVerified,true);
   const profile=local.snapshot.townProfiles.find(row=>row.county===county&&row.town===choices.areas[0].value);
   assert.ok(profile,'CEC official township profile should be present');
   assert.equal(town.overview.registeredVoters,profile.registered_voters);
   assert.equal(town.overview.ballotsCast,profile.ballots_cast);
   assert.equal(town.overview.invalidVotes,profile.invalid_votes);
   assert.equal(town.overview.validVotes,profile.valid_votes);
   assert.equal(town.overview.turnout,100*profile.ballots_cast/profile.registered_voters);
  }else{
   assert.equal(town.result.contests.length,1);
   assert.ok(Number.isInteger(town.overview.registeredVoters));
  }
 }
});
test('presidential overview shows verified CEC county and town turnout, never fabricated counts',()=>{
 const full=W.overviewRegionData(president,{year:2024,office:'president',scope:'all'});
 assert.equal(full.result.contests.length,22);
 assert.equal(full.overview.registeredVoters,19548531);
 const county=W.overviewRegionData(president,{year:2024,office:'president',scope:'county',county:'台北市'});
 assert.equal(county.result.contests.length,1);
 assert.equal(county.overview.registeredVoters,2090062);
 const choices=W.overviewRegionChoices(president,{year:2024,office:'president',county:'台北市'});
 const town=W.overviewRegionData(president,{year:2024,office:'president',scope:'town',county:'台北市',area:choices.areas[0].value});
 assert.equal(town.townVotesVerified,true);
 assert.ok(town.overview.validVotes>0);
 assert.ok(Number.isSafeInteger(town.overview.registeredVoters)&&town.overview.registeredVoters>0);
 assert.ok(Number.isSafeInteger(town.overview.ballotsCast)&&town.overview.ballotsCast>0);
 assert.ok(Number.isSafeInteger(town.overview.invalidVotes)&&town.overview.invalidVotes>=0);
 assert.equal(town.overview.ballotsCast,town.overview.validVotes+town.overview.invalidVotes);
 assert.ok(town.overview.ballotsCast<=town.overview.registeredVoters);
 assert.equal(town.overview.turnout,
  town.overview.ballotsCast/town.overview.registeredVoters*100);
});

test('counties without township-head elections do not inherit statewide figures',()=>{
 const county='台北市';
 const choices=W.overviewRegionChoices(local,{year:2022,office:'township',county});
 assert.ok(choices.counties.includes(county),'all counties remain selectable');
 assert.equal(choices.areas.length,0,'Taipei has no township head constituencies');
 const scoped=W.overviewRegionData(local,{year:2022,office:'township',scope:'town',county,area:''});
 assert.equal(scoped.noElection,true);
 assert.equal(scoped.result.contests.length,0);
 assert.equal(scoped.overview.registeredVoters,null);
 assert.equal(scoped.overview.ballotsCast,null);
 assert.equal(scoped.overview.validVotes,null);
});

test('2022 Chiayi City rerun keeps verified local vote and turnout totals',()=>{
 for(const [ward,total,registered,cast,invalid] of [['东区',42637,96706,42798,161],['西区',51176,117424,51390,214]]){
  const result=W.overviewRegionData(local,{year:2022,office:'mayor',scope:'town',county:'嘉义市',area:ward});
  assert.ok(result);
  assert.equal(result.townVotesVerified,true);
  assert.equal(result.overview.validVotes,total);
  assert.equal(result.overview.registeredVoters,registered);
  assert.equal(result.overview.ballotsCast,cast);
  assert.equal(result.overview.invalidVotes,invalid);
  assert.equal(result.overview.turnout,cast/registered*100);
 }
 assert.equal(local.snapshot.townProfiles.filter(profile=>profile.office==='mayor'&&profile.county==='嘉义市').length,2);
});

test('2022 delayed Chiayi mayoral rerun has official and candidate-verified Eastern/Western turnout',()=>{
 const snapshot=local.snapshot;
 const city=local.snapshot.contests.find(c=>c.election_id==='2022-mayor'&&c.county_name==='嘉义市');
 assert.ok(city,'delayed December rerun city exists');
 const wards=[['东区',96706,42798,42637,161],['西区',117424,51390,51176,214]];
 for(const [town,registered,cast,valid,invalid] of wards){
  const selected=W.overviewRegionData(local,{year:2022,office:'mayor',scope:'town',county:'嘉义市',area:town});
  assert.ok(selected.townVotesVerified,'CEC local candidate votes verified '+town);
  assert.equal(selected.overview.registeredVoters,registered);
  assert.equal(selected.overview.ballotsCast,cast);
  assert.equal(selected.overview.validVotes,valid);
  assert.equal(selected.overview.invalidVotes,invalid);
 }
});
