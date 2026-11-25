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
   if(Local.years(office).includes(year))assert.equal(Workspace.normalizeSelection({office,year}).year,year);
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

test('Historical county mayors and councils use five shared election cycles without losing original dates',async()=>{
 const batches=[[1993,1994,25],[1997,1998,25],[2001,2002,25],[2005,2006,25],[2009,2010,22]];
 assert.deepEqual(Local.years('mayor'),[1994,1998,2002,2006,2010,2014,2018,2022]);
 assert.deepEqual(Local.years('council'),Local.years('mayor'));
 assert.deepEqual(Local.years('township'),[1994,1998,2002,2005,2009,2014,2018,2022]);
 const supplement=require('../assets/history-local-council-supplement.json');
 const fetcher=async url=>({ok:true,json:async()=>url.includes('supplement')?supplement:
  url.includes('1994-council')?require('../assets/history-local-1994-council.json'):data(Number(url.match(/local-(\d{4})/)[1]))});
 for(const [first,last,expected] of batches){
  assert.equal(Local.yearLabel(last,'mayor'),first+'/'+last);
  assert.equal(Workspace.normalizeSelection({year:first,office:'mayor'}).year,last);
  const shard=await Local.loadCycle(last,'mayor',fetcher),indexed=Core.index(shard);
  const mayors=Core.filter(indexed,{year:last,office:'mayor'});
  assert.equal(mayors.contests.length,expected);
  assert.equal(new Set(mayors.contests.map(c=>c.county_id)).size,expected);
  assert.deepEqual([...new Set(mayors.contests.map(c=>Number(c.election_date.slice(0,4))))].sort(),[first,last]);
  const csv=Workspace.historyCsv(mayors,{office:'mayor',year:last});
  assert.match(csv,new RegExp('"'+first+'","县市长",'));
  assert.match(csv,new RegExp('"'+last+'","县市长",'));
  assert.match(Workspace.exportStem({year:last,office:'mayor'}),new RegExp('^'+first+'_'+last));
  const council=await Local.loadCycle(last,'council',fetcher);
  const councilRows=Core.filter(Core.index(council),{year:last,office:'council',electorate:'all'}).contests;
  if(last!==1994)assert.equal(new Set(councilRows.map(c=>c.county_id)).size,expected);
  else {
   assert.equal(new Set(councilRows.map(c=>c.county_id)).size,24);
   assert.equal(councilRows.length,197);
   assert.equal(councilRows.reduce((sum,c)=>sum+c.seats,0),963);
   const archive=councilRows.filter(c=>c.election_id==='1994-council-counties');
   assert.equal(archive.length,183);
   const partial=council.partialCouncilReturns[0];
   assert.equal(partial.districts.length,5);
   assert.equal(partial.districts.flatMap(d=>d.winners).length,16);
   assert.equal(partial.registered_voters,27458);
   assert.equal(partial.ballots_cast,22227);
   assert.equal(partial.valid_votes,null);
   assert.equal(archive.some(c=>c.county_name==='金门县'),false);
   assert.equal(archive.reduce((sum,c)=>sum+contestants(council,c).length,0),1807);
   assert.equal(archive.reduce((sum,c)=>sum+c.seats,0),867);
   const taipei=councilRows.filter(c=>c.county_name==='台北县');
   assert.equal(taipei.length,12);
   assert.equal(taipei.reduce((sum,c)=>sum+c.valid_votes,0),1217977);
   const kaohsiung=archive.filter(c=>c.county_name==='高雄县');
   assert.equal(kaohsiung.reduce((sum,c)=>sum+c.valid_votes,0),588353);
   assert.equal(councilRows.some(c=>c.county_name==='金门县'),false);
   for(const contest of councilRows){
    const rows=contestants(council,contest);
    assert.equal(rows.reduce((n,c)=>n+c.votes,0),contest.valid_votes);
    assert.equal(rows.filter(c=>c.elected_official).length,contest.seats);
   }
  }
  const geography=Local.geometry(council,map,reference,String,Core.mergePaths,Presidential.modernCounty,Presidential.baseTown);
  const districts=Local.councilMap(council,geography,Core.mergePaths).districts;
  assert.equal(districts.length,councilRows.length);
  if(last===1994)assert.deepEqual(districts.filter(c=>!c.mapAvailable&&c.electorate==='regional').map(c=>c.county),
   ['新竹市','新竹市','新竹市','新竹市']);
  assert.equal(geography.counties.some(c=>c.name==='台中县'),last<2010);
 }
});

test('The partial 1994 township archive reconciles all 73 contests across four counties',()=>{
 const shard=data(1994);
 const election=shard.elections.find(e=>e.office==='township');
 assert.equal(election.coverage,'partial');
 assert.deepEqual(election.counties,['台北县','高雄县','新竹县','连江县']);
 assert.equal(shard.contests.filter(c=>c.election_id===election.election_id).length,73);
 const geometry=Local.geometry(shard,map,reference,String,Core.mergePaths,Presidential.modernCounty,Presidential.baseTown);
 for(const [county,count,candidates,totals] of [
  ['台北县',29,81,[1989086,1239640,1200839,38801]],
  ['高雄县',27,66,[753209,596289,582302,13987]]
 ]){
  const contests=shard.contests.filter(c=>c.election_id===election.election_id&&c.county_name===county);
  assert.equal(contests.length,count);
  assert.equal(contests.flatMap(c=>contestants(shard,c)).length,candidates);
  assert.deepEqual(['registered_voters','ballots_cast','valid_votes','invalid_votes']
   .map(key=>contests.reduce((total,c)=>total+c[key],0)),totals);
  for(const contest of contests){
   assert.ok(contest.source_url&&contest.profile_source);
   assert.ok(geometry.towns.some(t=>t.county===county&&t.name===contest.district_name),contest.district_name);
  }
 }
 for(const [county,count,candidates,votes] of [['新竹县',13,27,187454],['连江县',4,4,2513]]){
  const contests=shard.contests.filter(c=>c.election_id===election.election_id&&c.county_name===county);
  assert.equal(contests.length,count);
  assert.equal(contests.flatMap(c=>contestants(shard,c)).length,candidates);
  assert.equal(contests.reduce((sum,c)=>sum+c.valid_votes,0),votes);
  for(const contest of contests){
   const entries=contestants(shard,contest);
   assert.equal(entries.reduce((sum,c)=>sum+c.votes,0),contest.valid_votes);
   assert.equal(entries.filter(c=>c.elected_official).length,1);
   assert.equal(contest.registered_voters,null);
   assert.ok(contest.source_url&&geometry.towns.some(t=>t.county===county&&t.name===contest.district_name),contest.district_name);
  }
 }
 const east=shard.contests.find(c=>c.election_id===election.election_id&&c.district_name==='东引乡');
 assert.deepEqual([east.ballots_cast,east.valid_votes,east.invalid_votes],[311,281,30]);
 const [candidate]=contestants(shard,east);
 assert.equal(candidate.candidate_name,'林日福');
 assert.equal(candidate.ballot_number,'');
 assert.equal(candidate.party_name,'政党资料缺失');
});

test('Corrections use the corroborated town tally or certified recount at its actual geographic level',()=>{
 const s=data(2005),district=exactDistrict(s,'云林县','第3选举区');
 const byName=new Map(contestants(s,district).map(c=>[c.candidate_name,c.votes]));
 assert.equal(byName.get('谢宜津'),884);
 assert.equal(byName.get('黄进一'),8676);
 const recounted=data(2018),city=exactDistrict(recounted,'台北市','台北市');
 assert.equal(contestants(recounted,city).find(c=>c.candidate_name==='柯文哲').votes,580663);
 const opening=recounted.rows.filter(r=>r.type==='mayor'&&r.county==='台北市'&&r.level==='town');
 assert.equal(opening.length,60);
 assert.ok(opening.every(r=>r.tally_basis==='original_opening'));
 assert.deepEqual([1,2,3,4,5].map(n=>opening.filter(r=>r.number===String(n))
  .reduce((sum,r)=>sum+r.votes,0)),[5617,577566,244641,580820,6172]);
 const profiles=recounted.townProfiles.filter(r=>r.office==='mayor'&&r.county==='台北市');
 assert.equal(profiles.length,12);
 assert.ok(profiles.every(r=>r.tally_basis==='certified_recount'));
 assert.equal(profiles.reduce((sum,r)=>sum+r.valid_votes,0),1413870);
 const area={year:2018,office:'mayor',scope:'town',county:'台北市',area:'松山区'};
 const ward=Workspace.overviewRegionData(Core.index(recounted),area);
 assert.equal(ward.tallyBasis,'certified_recount');
 assert.equal(ward.overview.validVotes,106795);
 assert.equal(ward.overview.ballotsCast,107752);
 assert.equal(opening.filter(r=>r.town==='松山区').reduce((sum,r)=>sum+r.votes,0),106972);
 const csv=Workspace.mayorTownCsv(recounted,area);
 assert.equal(csv.trim().split('\r\n').length,6);
 assert.match(csv,/46381.*投票日原始开票/);
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

test('All council maps include every verified district, including 1998 Hsinchu',()=>{
 const supplement=require('../assets/history-local-council-supplement.json');
 for(const year of Local.YEARS.council.filter(year=>year!==2022)){
  const snapshot=Local.applyCouncilSupplement(data(year),supplement);
  const geometry=Local.geometry(snapshot,map,year<=2010?reference:null,String,Core.mergePaths,
   Presidential.modernCounty,Presidential.baseTown);
  const districts=Local.councilMap(snapshot,geometry,Core.mergePaths);
  const unavailable=districts.districts.filter(row=>!row.mapAvailable);
  assert.deepEqual(unavailable.map(row=>row.id),[]);
  const hsinchu=districts.features.filter(d=>d.county==='新竹市'&&d.electorate==='regional');
  if([2002,2005,2009,2014,2018].includes(year)){
   assert.equal(hsinchu.length,5);
   const villageIds=hsinchu.flatMap(d=>snapshot.councilDistrictGeometry[d.historyId].villageIds);
   assert.equal(villageIds.length,122,String(year));
   assert.equal(new Set(villageIds).size,122,String(year));
  }
  if(year===1998){
   assert.equal(hsinchu.length,5);
   assert.deepEqual(hsinchu.filter(f=>f.number<=4).sort((a,b)=>a.number-b.number).map(f=>f.scopeVillages.length),[36,15,13,28]);
  }
  if([2009,2010,2014,2018].includes(year)){
   const enriched=districts.districts.filter(row=>row.womenReserved!==null);
   assert.equal(enriched.length,{2009:125,2010:69,2014:185,2018:179}[year]);
   assert.ok(enriched.every(row=>row.womenReserved>=0&&row.womenReserved<=row.seats));
  }
 }
});

test('2002 Taipei plains district 11 follows the reconciled 29-town NCCU returns',()=>{
 const contest=data(2002).contests.find(c=>c.contest_id==='2002-council:台北县:plains:第11选举区');
 assert.deepEqual(['registered_voters','ballots_cast','valid_votes','invalid_votes'].map(k=>contest[k]),[13722,5707,5585,122]);
 assert.equal(contest.profile_method,'29_township_returns_nccu');
});
