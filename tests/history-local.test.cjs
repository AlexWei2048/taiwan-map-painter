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
   assert.deepEqual([partial.reserved_seats,partial.reserved_district.number,partial.reserved_district.elected_name],[1,2,'楊淑媛']);
   assert.equal(archive.some(c=>c.county_name==='金门县'),false);
   assert.equal(archive.reduce((sum,c)=>sum+contestants(council,c).length,0),1807);
   assert.equal(archive.reduce((sum,c)=>sum+c.seats,0),867);
   const sourced=council.candidacies.filter(c=>c.contest_id.startsWith('1994-council-counties:')&&typeof c.incumbent_at_election==='boolean');
   const sourceArchive=require('../assets/history-local-1994-council.json');
   const sourceEntries=sourceArchive.districts.flatMap(d=>d.candidates.map(c=>d.incumbent_sources?.[String(c[0])])).filter(s=>typeof s?.value==='boolean');
   assert.ok(sourceEntries.length>=546,'verified incumbency coverage must not regress');
   assert.ok(sourceEntries.filter(s=>s.value).length>=283,'verified incumbents must not regress');
   assert.equal(sourced.length,sourceEntries.length);
   assert.equal(sourced.filter(c=>c.incumbent_at_election).length,sourceEntries.filter(s=>s.value).length);
   assert.ok(sourced.every(c=>c.incumbent_source?.source_url&&c.incumbent_source.value===c.incumbent_at_election));
   assert.equal(council.rows.filter(r=>r.type==='council'&&typeof r.incumbent==='boolean'&&sourced.some(c=>c.candidate_name===r.name&&c.ballot_number===String(r.number)&&c.votes===r.votes)).length,sourceEntries.length);
   const lienchiang=council.candidacies.filter(c=>c.contest_id.startsWith('1994-council-counties:连江县:'));
   assert.equal(lienchiang.filter(c=>c.incumbent_at_election===true).length,9);
   assert.equal(lienchiang.find(c=>c.candidate_name==='陈书建').incumbent_at_election,null);
   assert.equal(lienchiang.find(c=>c.candidate_name==='刘美官').incumbent_at_election,true);
   assert.ok(council.candidacies.some(c=>c.candidate_name==='黄宣乾'));
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

test('1994 council women-reserved seats follow the verified pre-1999 thresholds',()=>{
 const archive=require('../assets/history-local-1994-council.json');
 assert.equal(archive.districts.length,183);
 assert.equal(archive.districts.filter(d=>d.seats<=4).length,94);
 for(const d of archive.districts){
  assert.ok(Number.isInteger(d.reserved_seats),d.county+' 第'+d.number+'选区缺保障名额');
  assert.equal(d.reserved_seats,Math.floor((d.seats+5)/10),d.county+' 第'+d.number+'选区');
  assert.equal(d.candidates.reduce((s,c)=>s+c[2],0),d.valid_votes);
 }
});

test('1998 council legal women quotas use the pre-1999 five-seat threshold, without overwriting published quotas',()=>{
 const contests=[1,2,3,4,5,9,14,15,19,24].map((seats,i)=>({
  contest_id:'r'+i,election_id:'c',electorate:'regional',seats,reserved_seats:null
 }));
 contests.push({contest_id:'already',election_id:'c',electorate:'regional',seats:5,reserved_seats:2});
 contests.push({contest_id:'indigenous',election_id:'c',electorate:'mountain',seats:3,reserved_seats:null});
 contests.push({contest_id:'mayor',election_id:'m',electorate:'regional',seats:1,reserved_seats:null});
 const result=Local.fillRegionalCouncilQuotas({
  year:1998,elections:[{election_id:'c',office:'council'},{election_id:'m',office:'mayor'}],contests
 });
 for(const contest of result.contests.slice(0,10)){
  assert.equal(contest.reserved_seats,Math.floor((contest.seats+5)/10));
  assert.equal(contest.reserved_seats_method,'statutory');
  assert.match(contest.reserved_seats_source,/^https:\/\//);
 }
 assert.equal(result.contests[10].reserved_seats,2);
 assert.equal(result.contests[11].reserved_seats,null);
 assert.equal(result.contests[12].reserved_seats,null);
 assert.equal(contests[0].reserved_seats,null,'original snapshots remain immutable');
});

test('The partial 1994 township archive reconciles all 89 contests across eight counties',()=>{
 const shard=data(1994);
 const election=shard.elections.find(e=>e.office==='township');
 assert.equal(election.coverage,'partial');
 assert.deepEqual(election.counties,['台北县','高雄县','新竹县','连江县','台东县','云林县','宜兰县','花莲县']);
 assert.equal(shard.contests.filter(c=>c.election_id===election.election_id).length,89);
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
 for(const [county,town,name,profile] of [
  ['台东县','海端乡','余梦蝶',[2979,1471,1426,45]],
  ['云林县','褒忠乡','柯清雄',[11627,7360,6719,641]],
 ]){
  const contest=shard.contests.find(c=>c.election_id===election.election_id&&c.county_name===county&&c.district_name===town);
  assert.deepEqual(['registered_voters','ballots_cast','valid_votes','invalid_votes'].map(key=>contest[key]),profile);
  const [only]=contestants(shard,contest);
  assert.deepEqual([only.candidate_name,only.votes,only.elected_official,only.party_name_official],[name,profile[2],true,null]);
 }
 const yilan=shard.contests.filter(c=>c.election_id===election.election_id&&c.county_name==='宜兰县');
 assert.equal(yilan.length,12);
 assert.equal(yilan.reduce((sum,c)=>sum+c.valid_votes,0),210947);
 assert.equal(yilan.flatMap(c=>contestants(shard,c)).length,25);
 const luodong=yilan.find(c=>c.district_name==='罗东镇');
 assert.deepEqual(['registered_voters','ballots_cast','valid_votes','invalid_votes'].map(key=>luodong[key]),
  [41426,27905,27289,616]);
 assert.match(luodong.profile_source,/lotong\.gov\.tw/);
 const jiaoxi=yilan.find(c=>c.district_name==='礁溪乡');
 assert.deepEqual(['registered_voters','ballots_cast','valid_votes','invalid_votes'].map(key=>jiaoxi[key]),
  [25184,19931,19673,258]);
 assert.match(jiaoxi.profile_source,/nccur\.lib\.nccu\.edu\.tw/);
 assert.ok(contestants(shard,jiaoxi).every(c=>c.incumbent_at_election===false&&c.incumbent_source.name==='陳德治'));
 const north=shard.contests.find(c=>c.election_id===election.election_id&&c.district_name==='北竿乡');
 assert.deepEqual([north.registered_voters,north.ballots_cast,north.valid_votes,north.invalid_votes],[null,584,478,106]);
 const [northCandidate]=contestants(shard,north);
 assert.deepEqual([northCandidate.candidate_name,northCandidate.gender,northCandidate.incumbent_at_election],['王诗乾','男',true]);
 assert.equal(candidate.incumbent_at_election,false);
 assert.equal(candidate.incumbent_source.name,'陳端才');
 const xinFeng=shard.contests.find(c=>c.election_id===election.election_id&&c.district_name==='新丰乡');
 assert.ok(contestants(shard,xinFeng).every(c=>c.incumbent_at_election===false&&c.incumbent_source.name==='林保明'));
 const lanyu=shard.contests.find(c=>c.election_id===election.election_id&&c.county_name==='台东县'&&c.district_name==='兰屿乡');
 assert.deepEqual(['registered_voters','ballots_cast','valid_votes','invalid_votes'].map(key=>lanyu[key]),[1796,1245,1183,62]);
 assert.deepEqual(contestants(shard,lanyu).map(c=>[c.candidate_name,c.votes,c.elected_official,c.party_name_official]),
  [['谢朱明',507,false,null],['廖班佳',676,true,null]]);
 assert.match(lanyu.source_url,/catalog\.digitalarchives\.tw/);
 const [kinmen,hualien]=shard.partialTownshipReturns;
 assert.equal(kinmen.county,'金門縣');
 assert.deepEqual(kinmen.winners.map(w=>w.votes),[5116,3135,2857,2018,1152,25]);
 assert.deepEqual([kinmen.county_summary.candidate_count,kinmen.county_summary.elected_count,
  kinmen.county_summary.registered_voters,kinmen.county_summary.ballots_cast,kinmen.county_summary.turnout_pct],
  [12,6,27385,22174,80.97]);
 assert.ok(!shard.contests.some(c=>c.election_id===election.election_id&&c.county_name==='金门县'));
 assert.equal(hualien.profiles.length,13);
 assert.deepEqual(['registered_voters','ballots_cast','valid_votes','invalid_votes']
  .map(k=>hualien.profiles.reduce((sum,r)=>sum+r[k],0)),[235236,150149,144607,5542]);
 assert.equal(hualien.profiles.reduce((n,row)=>n+row.candidate_count,0),34);
 const guangfu=shard.contests.filter(c=>c.election_id===election.election_id&&c.county_name==='花莲县');
 assert.deepEqual(guangfu.map(c=>c.district_name),['光复乡']);
 const [chen]=contestants(shard,guangfu[0]);
 assert.deepEqual([chen.candidate_name,chen.votes,chen.vote_share,chen.incumbent_at_election,chen.party_name_official],
  ['陈文光',6791,100,true,null]);
 assert.ok(geometry.towns.some(t=>t.county==='花莲县'&&t.name==='光复乡'));
 const extra=shard.partialTownshipReturns.slice(2);
 assert.deepEqual(extra.filter(r=>r.summary_scope==='county').map(r=>r.county),['桃園縣','臺中縣','苗栗縣','彰化縣','臺南縣']);
 assert.deepEqual(extra.flatMap(r=>(r.profiles||[]).map(p=>p.winner_name).filter(Boolean)),
  ['邱一郎','李仁生','鍾明祥','蘇青山','陳振恭','蘇金煌','簡錦全','林中禮','許裕欽']);
 const yunlin=extra.filter(r=>r.county==='雲林縣'&&r.profiles?.length).slice(1);
 assert.deepEqual(yunlin.map(r=>[r.profiles[0].town,...r.profile_totals]),[
  ['莿桐鄉',20793,16257,15947,310],['四湖鄉',23307,14907,14467,440],
  ['斗南鎮',30951,24399,23904,495],['西螺鎮',33754,26078,25737,341],
  ['水林鄉',25077,18426,18180,246],
 ]);
 assert.deepEqual(extra.find(r=>r.winners).winners,[{town:'清水鎮',name:'吳金生'}]);
 const kouhu=extra.flatMap(r=>r.profiles||[]).find(p=>p.town==='口湖鄉');
 assert.equal(kouhu.candidate_count,4);
 assert.deepEqual(kouhu.candidate_names,['蘇青山','王文祥','王茂三','李印緞']);
 assert.ok(extra.some(r=>r.winners?.some(w=>w.town==='池上鄉'&&w.name==='林慶堂')));
 assert.deepEqual(extra.find(r=>r.county==='澎湖縣').county_party_shares.map(([,share])=>share),[64.17,11.06,0,24.77]);
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
   assert.equal(enriched.length,{2009:124,2010:69,2014:197,2018:193}[year]);
   assert.ok(enriched.every(row=>row.womenReserved>=0&&row.womenReserved<=row.seats));
  }
 }
});

test('2002 Taipei plains district 11 follows the reconciled 29-town NCCU returns',()=>{
 const contest=data(2002).contests.find(c=>c.contest_id==='2002-council:台北县:plains:第11选举区');
 assert.deepEqual(['registered_voters','ballots_cast','valid_votes','invalid_votes'].map(k=>contest[k]),[13722,5707,5585,122]);
 assert.equal(contest.profile_method,'29_township_returns_nccu');
});

test('Official shared indigenous reserved seats are represented once per group, never assigned to every member district',()=>{
 const supplement=require('../assets/history-local-council-supplement.json');
 for(const [year,expected] of [[2009,23],[2014,32],[2018,35]]){
  const snapshot=Local.applyCouncilSupplement(data(year),supplement);
  const groups=supplement.years[year].sharedQuotaGroups;
  const members=snapshot.contests.filter(c=>c.reserved_seats_group);
  assert.equal(members.length,expected);
  for(const group of groups){
   const districts=members.filter(c=>c.reserved_seats_group.id===group.id);
   assert.equal(districts.length,group.contestIds.length);
   assert.equal(group.reserved<=districts.reduce((n,c)=>n+c.seats,0),true);
   assert.ok(districts.every(c=>c.reserved_seats===(group.reserved===0?0:null)));
   assert.match(group.source,/^https:\/\/web\.cec\.gov\.tw\//);
  }
 }
});


test('Early indigenous council statutory quotas resolve 137 missing records without allocating shared seats twice',()=>{
 const supplement=require('../assets/history-local-council-supplement.json');
 for(const [year,expected] of [[1994,2],[1998,38],[2002,48],[2005,47],[2006,2]]){
  const raw=data(year),snapshot=Local.applyCouncilSupplement(raw,supplement),addition=supplement.years[year];
  const members=snapshot.contests.filter(c=>c.reserved_seats_method==='statutory_shared_group'||(c.reserved_seats_method==='statutory'&&addition.quotaSources?.[c.contest_id]));
  assert.equal(members.length,expected);
  for(const c of members){
   assert.equal(raw.contests.find(r=>r.contest_id===c.contest_id).reserved_seats,null);
   assert.match(c.reserved_seats_source,/^https:\/\//);
   const group=c.reserved_seats_group;
   if(group){
    const seats=group.contestIds.reduce((n,id)=>n+raw.contests.find(r=>r.contest_id===id).seats,0);
    assert.equal(group.reserved,Math.floor(seats/4));
    assert.equal(c.reserved_seats,group.reserved===0?0:null);
   }else assert.equal(c.reserved_seats,0);
  }
 }
});
