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
