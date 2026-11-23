const assert=require('node:assert/strict');
const {test}=require('node:test');
const Local=require('../history-local.js');
const Core=require('../history-core.js');
const Presidential=require('../history-presidential.js');
const Workspace=require('../history-workspace.js');
const map=require('../assets/map-base.json');
const reference=require('../assets/history-president-2008.json');
const data=year=>require('../assets/history-local-'+year+'.json');
const exactDistrict=(s,county,name)=>s.contests.find(c=>c.county_name===county&&c.district_name===name);
const contestants=(s,contest)=>s.candidacies.filter(c=>c.contest_id===contest.contest_id);

test('Local history follows actual election years and balances candidate votes for every available contest',()=>{
 for(const [office,years] of Object.entries(Local.YEARS)){
  for(const year of years.filter(y=>y!==2022)){
   const s=data(year);
   assert.equal(Workspace.normalizeSelection({office,year}).year,year);
   const contests=Core.filter(Core.index(s),{year,office,electorate:'all'}).contests;
   assert.ok(contests.length>0);
   for(const contest of contests){
    const candidates=contestants(s,contest);
    assert.equal(candidates.reduce((sum,c)=>sum+c.votes,0),contest.valid_votes,contest.contest_id);
    assert.equal(new Set(candidates.map(c=>c.ballot_number)).size,candidates.length);
    if(contest.registered_voters!==null){
     assert.equal(contest.valid_votes+contest.invalid_votes,contest.ballots_cast);
     assert.ok(contest.registered_voters>=contest.ballots_cast);
    }
   }
  }
 }
 assert.ok(!Local.years('township').includes(2010));
 assert.ok(!Local.years('mayor').includes(2026));
 assert.ok(Local.years('mayor',true).includes(2026));
 assert.deepEqual(data(2009).contests.filter(c=>c.election_id==='2009-mayor').length,17);
 assert.deepEqual(data(2010).contests.filter(c=>c.election_id==='2010-mayor').length,5);
});

test('Corrections use the corroborated town tally or certified recount at its actual geographic level',()=>{
 const s=data(2005),district=exactDistrict(s,'云林县','第3选举区');
 const byName=new Map(contestants(s,district).map(c=>[c.candidate_name,c.votes]));
 assert.equal(byName.get('谢宜津'),884);
 assert.equal(byName.get('黄进一'),8676);
 const recounted=data(2018),city=exactDistrict(recounted,'台北市','台北市');
 assert.equal(contestants(recounted,city).find(c=>c.candidate_name==='柯文哲').votes,580663);
 assert.equal(recounted.rows.some(r=>r.type==='mayor'&&r.county==='台北市'&&r.level==='town'),false);
 const earliest=data(1993);
 assert.equal(earliest.contests.length,23);
 assert.equal(earliest.candidacies.length,77);
 assert.ok(earliest.townProfiles.length>=345);
 assert.equal(new Set(earliest.townProfiles.map(p=>p.county)).size,23);
 const taichung=exactDistrict(data(2002),'台中市','第6选举区');
 assert.equal(taichung.seats,10);
 const kinmen=exactDistrict(data(2002),'金门县','第1选举区');
 assert.equal(kinmen.seats,17);
 assert.equal(kinmen.reserved_seats,4);
 assert.equal(s.candidacies.find(c=>c.candidate_name==='叶正森').elected_official,true);
 const older=data(1997),county=exactDistrict(older,'台中县','台中县');
 assert.ok(older.rows.some(r=>r.county==='台中县'&&r.town==='神冈乡'));
 for(const candidate of contestants(older,county)){
  const rows=older.rows.filter(r=>r.level==='town'&&r.county==='台中县'&&r.number===candidate.ballot_number);
  assert.equal(rows.reduce((sum,r)=>sum+r.votes,0),candidate.votes);
 }
});

test('Historical geography keeps old municipalities distinct and leaves split-town districts without guessed polygons',()=>{
 const s=data(2009);
 const geometry=(shard,previous)=>Local.geometry(shard,map,previous,String,Core.mergePaths,
  Presidential.modernCounty,Presidential.baseTown);
 const older=geometry(s,reference);
 assert.ok(older.counties.some(c=>c.name==='台中县'));
 assert.ok(older.towns.some(t=>t.county==='台中县'&&t.name==='丰原市'));
 assert.ok(!older.towns.some(t=>t.county==='台中市'&&t.name==='丰原市'));
 const merged=geometry(data(2010),reference);
 assert.ok(!merged.counties.some(c=>c.name==='台中县'));
 assert.ok(merged.towns.some(t=>t.county==='台中市'&&t.name==='丰原区'));
 const countyCouncil=Local.councilMap(data(2018),geometry(data(2018),null),Core.mergePaths);
 assert.ok(countyCouncil.districts.some(d=>d.county==='新竹市'&&!d.mapAvailable));
 assert.ok(countyCouncil.features.every(d=>d.mapAvailable));
});

test('Every archived local winner matches the map candidate, ballot, votes and party',()=>{
 const toSimplified=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const norm=value=>toSimplified(value).replaceAll('臺','台');
 const number=value=>Number(value.match(/第\s*(\d+)/)?.[1]||0);
 const level={mayor:'county',council:'district',township:'town'};
 const key=(office,county,identity,area,ballot)=>[office,norm(county),identity,area,Number(ballot)].join('|');
 for(const year of new Set(Object.values(Local.YEARS).flat())){
  const snapshot=year===2022?require('../assets/history-2022.json'):data(year);
  const contests=new Map(snapshot.contests.map(c=>[c.contest_id,c]));
  const rows=snapshot.rows.filter(r=>r.elected&&r.level===level[r.type]);
  const mapWinners=new Map(rows.map(r=>[key(r.type,r.county,r.electorate,
   r.type==='council'?number(r.district):r.type==='township'?norm(r.town):'',r.number),r]));
  const winners=snapshot.candidacies.filter(candidate=>candidate.elected_official);
  assert.equal(mapWinners.size,winners.length,String(year));
  assert.equal(mapWinners.size,rows.length,String(year));
  for(const candidate of winners){
   const contest=contests.get(candidate.contest_id),office=contest.election_id.split('-')[1];
   const area=office==='council'?number(contest.district_name):office==='township'?norm(contest.district_name):'';
   const row=mapWinners.get(key(office,contest.county_name,contest.electorate,area,candidate.ballot_number));
   assert.ok(row,contest.contest_id);
   assert.deepEqual([norm(row.name),row.votes,norm(row.party)],
    [norm(candidate.candidate_name),candidate.votes,norm(candidate.party_name)],contest.contest_id);
  }
 }
});

test('All council maps include every verified district, with four unresolved 1998 Hsinchu districts',()=>{
 const supplement=require('../assets/history-local-council-supplement.json');
 for(const year of Local.YEARS.council.filter(year=>year!==2022)){
  const snapshot=Local.applyCouncilSupplement(data(year),supplement);
  const geometry=Local.geometry(snapshot,map,year<=2010?reference:null,String,Core.mergePaths,
   Presidential.modernCounty,Presidential.baseTown);
  const districts=Local.councilMap(snapshot,geometry,Core.mergePaths);
  const unavailable=districts.districts.filter(row=>!row.mapAvailable);
  assert.deepEqual(unavailable.map(row=>row.id),year===1998?[1,2,3,4].map(n=>'1998-council:新竹市:regional:第'+n+'选举区'):[]);
  const hsinchu=districts.features.filter(d=>d.county==='新竹市'&&d.electorate==='regional');
  if([2002,2005,2009,2014,2018].includes(year)){
   assert.equal(hsinchu.length,5);
   const villageIds=hsinchu.flatMap(d=>snapshot.councilDistrictGeometry[d.historyId].villageIds);
   assert.equal(villageIds.length,122,String(year));
   assert.equal(new Set(villageIds).size,122,String(year));
  }
  if([2009,2010,2014,2018].includes(year)){
   const enriched=districts.districts.filter(row=>row.womenReserved!==null);
   assert.equal(enriched.length,{2009:125,2010:69,2014:185,2018:179}[year]);
   assert.ok(enriched.every(row=>row.womenReserved>=0&&row.womenReserved<=row.seats));
  }
 }
});
