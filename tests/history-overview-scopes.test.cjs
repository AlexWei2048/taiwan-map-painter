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
   assert.equal(town.overview.registeredVoters,null);
   assert.equal(town.overview.ballotsCast,null);
   if(town.townVotesVerified)assert.ok(town.overview.validVotes>=0);
  }else{
   assert.equal(town.result.contests.length,1);
   assert.ok(Number.isInteger(town.overview.registeredVoters));
  }
 }
});
test('presidential overview shows real county turnout and town candidate votes without fabricated turnout',()=>{
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
 assert.equal(town.overview.registeredVoters,null);
 assert.equal(town.overview.ballotsCast,null);
 assert.equal(town.overview.invalidVotes,null);
 assert.equal(town.overview.turnout,null);
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
