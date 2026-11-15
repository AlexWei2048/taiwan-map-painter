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
 assert.deepEqual(Legislative.levels(1992,'mountain').map(([value])=>value),['county']);
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
 assert.match(method,/if\(!nationwide\)appendHistoricalLegislativeBadges\(group,transform,false,interactive\)/);
 const councilSeats=fs.readFileSync(path.join(__dirname,'../council-seats.js'),'utf8');
 assert.match(councilSeats,/data-history-legislative-seat-layer/);
 assert.match(councilSeats,/councilSeatPlacement\(f,seats.length,t,used,all\)/);
 assert.match(councilSeats,/data-seat-style':'council/);
 assert.match(app,/drawHistoricalLegislativeSeats\(layer,transform,interactive\)/);
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

test('geographic legislative profiles enforce exact accepted-vote reconciliation',()=>{
 const turnout=require('../history-legislative-turnout.js');
 const base={validVotes:100,turnoutGroups:[{electorate:'regional',validVotes:100}]};
 const unmatched=turnout.enrich(base,{year:1998,electorate:'regional',scope:'county',county:'台北县'});
 assert.equal(unmatched.registeredVoters,undefined);
 assert.equal(unmatched.historicalOverall,null);
 assert.equal(turnout.national(2024,'regional').validVotes,13363780);
});


test('all five separate party-ballot elections have 368 individually audited township maps',()=>{
 const Historical=require('../history-presidential.js');
 const base=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/map-base.json'),'utf8'));
 const norm=x=>String(x||'').trim().replaceAll('臺','台').replaceAll('縣','县')
  .replaceAll('鄉','乡').replaceAll('鎮','镇').replaceAll('區','区');
 const baseTown=x=>norm(x).replace(/[乡镇市区]$/u,'');
 const expected={2008:[25,12,9780573],2012:[22,11,13162072],2016:[22,18,12190139],
  2020:[22,19,14160138],2024:[22,16,13776736]};
 for(const [year,expectedValues] of Object.entries(expected)){
  const s=shard(Number(year));
  const geometry=Legislative.scopeGeometry(s,base,norm,Core.mergePaths,Historical.modernCounty,baseTown);
  const audit=Legislative.auditPartyTownVotes(s,geometry);
  assert.equal(audit.valid,true,year+' '+audit.errors.join('；'));
  assert.equal(audit.areas,368,year+' real townships');
  assert.deepEqual([audit.counties,audit.politicalParties,audit.votes],expectedValues);
  assert.equal(geometry.towns.length,368,year+' polygon coverage');
  const found=new Set(geometry.towns.map(t=>t.county+'|'+t.name));
  assert.ok(found.has('台北市|北投区'));
  assert.ok(found.has('金门县|金城镇'));
  assert.ok(found.has('连江县|南竿乡'));
  const district=s.rows.filter(r=>r.electorate==='party'&&r.level==='town'&&
    r.county==='台北市'&&r.town==='北投区');
  assert.equal(district.length,expectedValues[1],year+' North Taipei party count');
  const all=district.reduce((n,r)=>n+r.votes,0);
  const indexed=Core.index(s);
  const detail=Data.localResult(indexed,{year:Number(year),electorate:'party',
   scope:'town',county:'台北市',area:'北投区'});
  assert.equal(detail.overview.validVotes,all,year+' authentic local votes');
  assert.equal(detail.result.candidacies.reduce((n,r)=>n+r.votes,0),all);
 }
});

test('party township audit rejects fabricated totals or a dropped historic polygon',()=>{
 const s=shard(2024),Historical=require('../history-presidential.js');
 const norm=x=>String(x||'').trim().replaceAll('臺','台').replaceAll('縣','县')
  .replaceAll('鄉','乡').replaceAll('鎮','镇').replaceAll('區','区');
 const base=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/map-base.json'),'utf8'));
 const geometry=Legislative.scopeGeometry(s,base,norm,Core.mergePaths,Historical.modernCounty,
  x=>norm(x).replace(/[乡镇市区]$/u,''));
 const corrupt={...s,rows:s.rows.map(r=>r.electorate==='party'&&r.level==='town'&&
  r.county==='台北市'&&r.town==='北投区'&&r.party==='民主进步党'?{...r,votes:r.votes+1}:r)};
 const invalid=Legislative.auditPartyTownVotes(corrupt,geometry);
 assert.equal(invalid.valid,false);
 assert.ok(invalid.errors.some(e=>e.includes('县市与乡镇市区政党票不一致')));
 const missing=Legislative.auditPartyTownVotes(s,{...geometry,towns:geometry.towns.slice(1)});
 assert.equal(missing.valid,false);
 assert.ok(missing.errors.some(e=>e.includes('缺少乡镇图形')));
});
