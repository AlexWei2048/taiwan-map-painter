const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Core=require('../history-core.js');
const Legislative=require('../history-legislative.js');
const Data=require('../history-legislative-data.js');

function shard(year){
 return JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/history-legislative-'+year+'.json'),'utf8'));
}

test('actual party votes have all-area, county and town map levels without fabricated contest winners',()=>{
 const s=shard(2024),indexed=Core.index(s);
 const choices=Data.regionChoices(indexed,{year:2024,electorate:'party',county:'金门县'});
 assert.ok(choices.counties.includes('金门县'));
 assert.ok(choices.counties.includes('连江县'));
 assert.ok(choices.areas.length>=2);
 const national=Data.localResult(indexed,{year:2024,electorate:'party',scope:'all'});
 const county=Data.localResult(indexed,{year:2024,electorate:'party',scope:'county',county:'金门县'});
 const town=Data.localResult(indexed,{year:2024,electorate:'party',scope:'town',county:'金门县',area:choices.areas[0].value});
 assert.ok(national.overview.validVotes>10000000);
 assert.ok(county.overview.validVotes>0);
 assert.ok(town.overview.validVotes>0);
 assert.ok(county.overview.validVotes<national.overview.validVotes);
 assert.equal(county.overview.electedCount,null);
 assert.equal(town.overview.registeredVoters,null);
 assert.ok(county.result.candidacies.every(r=>r.elected_official===false));
 const csv=Data.exportCsv(s,{year:2024,electorate:'party',level:'national'});
 assert.match(csv,/不分区政党票/);
 assert.match(csv,/得票率/);
 assert.doesNotMatch(csv,/候选人,号次/);
 assert.match(csv,/金/);
});
test('historic 1992 indigenous ballots do not manufacture local tallies',()=>{
 const s=shard(1992),indexed=Core.index(s);
 assert.deepEqual(Legislative.levels(1992,'mountain').map(([value])=>value),['national']);
 assert.equal(Data.localResult(indexed,{year:1992,electorate:'mountain',scope:'county',county:'台北市'}),null);
 assert.equal(Data.localResult(indexed,{year:1992,electorate:'plains',scope:'town',county:'台北市',area:'北投区'}),null);
 const national=Data.localResult(indexed,{year:1992,electorate:'mountain',scope:'all'});
 assert.ok(national.result.candidacies.length>0);
});
test('old multi-seat district reports actual elected counts and unique candidates',()=>{
 const s=shard(2004),indexed=Core.index(s);
 const choices=Data.regionChoices(indexed,{year:2004,electorate:'regional',county:'台北市'});
 assert.ok(choices.areas.length>=2);
 const local=Data.localResult(indexed,{year:2004,electorate:'regional',scope:'district',county:'台北市',area:choices.areas[0].value});
 assert.equal(local.result.contests.length,1);
 assert.equal(local.overview.electedCount,local.result.candidacies.filter(c=>c.elected_official).length);
 assert.ok(local.overview.electedCount>1);
});

test('historic national maps suppress multi-member logos but county maps retain them',()=>{
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const method=app.match(/function drawHistoricalLegislativeRegionalLabels\([\s\S]*?\n}\nfunction renderLabels\(/)?.[0]||'';
 assert.match(method,/if\(!nationwide\)appendHistoricalLegislativeBadges\(group,transform,false\)/);
 assert.match(app,/data-history-legislative-seat-layer/);
});

test('national legislative turnout is ballot-specific and all available figures reconcile',()=>{
 const T=require('../history-legislative-turnout.js');
 for(const [year,ballots] of Object.entries(T.NATIONAL))for(const ballot of Object.keys(ballots)){
  const stat=T.national(+year,ballot);
  assert.ok(stat,'Unverified count '+year+' '+ballot);
  assert.equal(stat.ballotsCast,stat.validVotes+stat.invalidVotes);
  assert.ok(stat.turnout>0&&stat.turnout<=100);
 }
 assert.equal(T.national(2004,'party'),null);
 assert.equal(T.overall(1992).ballotsCast,9666020);
 const regional=Data.localResult(Core.index(shard(2004)),{year:2004,electorate:'regional',scope:'all'});
 assert.equal(regional.overview.registeredVoters,16258979);
 assert.equal(regional.overview.invalidVotes,77336);
 const party=Data.localResult(Core.index(shard(2004)),{year:2004,electorate:'party',scope:'all'});
 assert.equal(party.overview.registeredVoters,null);
 assert.equal(party.overview.historicalOverall.registeredVoters,16559254);
 const early=Data.localResult(Core.index(shard(1998)),{year:1998,electorate:'regional',scope:'all'});
 assert.equal(early.overview.registeredVoters,null);
 assert.equal(early.overview.historicalOverall.ballotsCast,10188302);
 const local=Data.localResult(Core.index(shard(2004)),{year:2004,electorate:'regional',scope:'county',county:'台北市'});
 assert.equal(local.overview.registeredVoters,null);
});
