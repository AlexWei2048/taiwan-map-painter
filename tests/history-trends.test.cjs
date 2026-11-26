const {test}=require('node:test'),assert=require('node:assert/strict'),T=require('../history-trends.js');
const snapshot={year:2022,elections:[{election_id:'c',office:'council'}],contests:[
 {contest_id:'a',election_id:'c',county_name:'台中市',electorate:'regional',registered_voters:120,ballots_cast:100,invalid_votes:0},
 {contest_id:'b',election_id:'c',county_name:'台中县',electorate:'regional',registered_voters:120,ballots_cast:100,invalid_votes:0}],
 candidacies:[{contest_id:'a',party_name:'甲',votes:60,elected_official:true,gender:'女',incumbent_at_election:true},{contest_id:'a',party_name:'乙',votes:40,elected_official:false,gender:null,incumbent_at_election:null},
 {contest_id:'b',party_name:'乙',votes:55,elected_official:true,gender:'男',incumbent_at_election:false},{contest_id:'b',party_name:'甲',votes:45,elected_official:false,gender:'男',incumbent_at_election:false}],
 rows:[{type:'council',level:'town',county:'台中市',town:'中区',votes:100,party:'甲'}]};
test('Trend aggregates unique contest votes and combines historical counties without counting town rows twice',()=>{
 const r=T.aggregate(snapshot,{office:'council',county:'台中市'});
 assert.equal(r.valid,200);assert.equal(r.seats,2);assert.equal(T.value(r,'甲','votes'),105);assert.equal(T.value(r,'甲','share'),52.5);assert.equal(T.value(r,'乙','rank'),1);assert.equal(r.seatLeader,'并列');assert.equal(r.genderCoverage,75);assert.equal(r.incumbentCoverage,75);assert.equal(r.reelectionRate,100);
 assert.equal(T.aggregate(snapshot,{office:'council',county:'台中市',unified:false}).valid,100);
});
test('Incomplete historical coverage is null, not zero; complete absent party is zero',()=>{
 const r=T.aggregate({...snapshot,year:1994},{office:'council'});
 assert.equal(r.complete,false);assert.equal(T.value(r,'甲','share'),null);
 const complete=T.aggregate(snapshot,{office:'council'});
 assert.equal(T.value(complete,'丙','votes'),0);assert.equal(T.difference(r,complete,'甲','share'),null);
});
test('National presidential candidate counts are deduplicated and never turn local votes into seats',()=>{
 const s={...snapshot,elections:[{election_id:'c',office:'president'}],candidacies:snapshot.candidacies.map(c=>({...c,candidate_name:c.party_name,ballot_number:c.party_name}))};
 const r=T.aggregate(s,{office:'president'});assert.equal(r.candidateCount,2);assert.equal(r.seats,null);assert.equal(T.value(r,'甲','seats'),null);
});
test('List allocation seats require verified allocation and never imply geographic seats',()=>{
 const s={...snapshot,elections:[{election_id:'c',office:'legislative'}],contests:snapshot.contests.map(c=>({...c,electorate:'party'}))};
 const r=T.aggregate(s,{office:'legislative',electorate:'party'});assert.equal(r.seats,null);
 const v=T.aggregate(s,{office:'legislative',electorate:'party',partySeats:{matchesOfficial:true,totalAssigned:3,parties:[{party:'甲',seats:2},{party:'乙',seats:1}]}});
 assert.equal(v.seats,3);assert.equal(T.value(v,'甲','seats'),2);
});
test('Real presidential national vote totals agree with the original national profile',()=>{
 const s=require('../assets/history-president-2024.json');
 const r=T.aggregate(s,{office:'president'});
 assert.equal(r.complete,true);
 assert.equal(r.valid,s.national.valid_votes);
 assert.equal(r.registered,s.national.registered_voters);
 assert.equal(r.candidateCount,s.national.candidate_totals.length);
 for(const p of s.national.candidate_totals)assert.equal(T.value(r,p.party,'votes'),p.votes);
});
test('Real 2022 council counts reconcile to the 910 official seats',()=>{
 const s=require('../assets/history-2022.json'),norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const r=T.aggregate(s,{office:'council',electorate:'all',normalize:norm});
 assert.equal(r.complete,true);assert.equal(r.seats,910);
 assert.equal(Object.values(r.parties).reduce((n,p)=>n+p.seats,0),910);
 const regions=T.aggregate(s,{office:'council',electorate:'all',county:'台北市',normalize:norm});
 assert.equal(regions.seats,61);
});
test('Map trends follow county and metric; top individual votes are not party totals',()=>{
 const s={year:2022,rows:[
 {type:'council',electorate:'regional',level:'district',county:'甲县',district:'第1选举区',name:'甲',party:'A',votes:45,elected:true},
 {type:'council',electorate:'regional',level:'district',county:'甲县',district:'第1选举区',name:'乙',party:'A',votes:20,elected:true},
 {type:'council',electorate:'regional',level:'district',county:'甲县',district:'第1选举区',name:'丙',party:'B',votes:35,elected:false},
 {type:'council',electorate:'regional',level:'district',county:'乙县',district:'第1选举区',name:'丁',party:'B',votes:100,elected:true}]};
 const conf={office:'council',county:'甲县',electorate:'regional',level:'district'};
 assert.equal(T.mapTrend(s,{...conf,metric:'share'}).values.value,45);
 assert.equal(T.mapTrend(s,{...conf,metric:'votes'}).values.value,45);
 assert.equal(T.mapTrend(s,{...conf,metric:'seats',party:'A'}).values.value,2);
 assert.deepEqual(T.mapTrend(s,{...conf,metric:'party'}).parties,{A:2});
 assert.equal(T.mapTrend(s,{...conf,metric:'votes',candidateScope:'candidate',candidate:{name:'乙',party:'A',county:'甲县',district:'第1选举区'}}).values.value,20);
 assert.equal(T.mapTrend(s,{...conf,metric:'share',candidateScope:'candidate',candidate:{name:'未参选',party:'A'}}).complete,false);
});

test('All legislative seats reconcile to official full house totals for every election',()=>{
 const P=require('../history-legislative-party.js'),norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 for(const [year,expected] of Object.entries(T.LEGISLATIVE_TOTALS)){
  const s=require('../assets/history-legislative-'+year+'.json'),r=T.allLegislativeSeats(s,P.build(Number(year),s),norm);
  assert.equal(r.complete,true,year+' '+r.reason);assert.equal(r.total,expected);
  assert.equal(Object.values(r.parties).reduce((n,v)=>n+v,0),expected);
 }
 const s=require('../assets/history-legislative-2024.json'),r=T.allLegislativeSeats(s,P.build(2024,s),norm);
 assert.equal(r.parties['中国国民党'],52);assert.equal(r.parties['民主进步党'],51);assert.equal(r.parties['台湾民众党'],8);assert.equal(r.parties['无党籍'],2);
});
test('combined legislative county trend counts actual regional seats, never four ballot categories',()=>{
 const years={1992:[['高雄县',6],['高雄市',12]],2008:[['高雄县',4],['高雄市',5]],2012:[['高雄市',9]],2024:[['高雄市',8]]};
 const selected={office:'legislative',electorate:'all',county:'高雄市',level:'county',metric:'party'};
 const effective=T.trendEffectiveSelection(selected);
 assert.equal(effective.electorate,'regional');
 for(const [year,expected] of Object.entries(years)){
  const snapshot=require('../assets/history-legislative-'+year+'.json');
  const rows=T.historicalScopeRows(snapshot,effective);
  assert.deepEqual(rows.map(r=>[r.county,Object.values(r.parties).reduce((n,v)=>n+v,0)]),expected,year);
  assert.ok(rows.every(r=>r.complete));
  assert.equal(T.mapTrend(snapshot,selected).complete,false,'ambiguous all-ballot count must be rejected');
 }
 const local=require('../assets/history-2022.json');
 assert.equal(T.trendEffectiveSelection({office:'council',electorate:'all',county:'高雄市'}).electorate,'all');
 assert.equal(T.mapTrend(local,{office:'council',electorate:'all',county:'高雄市',metric:'party'}).complete,true);
});
test('Legislative vote-share trends use a single ballot at each geographic scope',()=>{
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 for(const year of [1992,2008,2024]){
  const snapshot=require('../assets/history-legislative-'+year+'.json');
  const results={};
  for(const electorate of ['all','regional','plains','mountain','party']){
   const national=T.legislativeVoteShares(snapshot,{office:'legislative',electorate,normalize:norm})[0];
   assert.equal(national.complete,true,year+' '+electorate+' '+national.reason);
   assert.ok(Math.abs(Object.values(national.parties).reduce((a,b)=>a+b,0)-100)<1e-8);
   assert.equal(Object.values(national.votes).reduce((a,b)=>a+b,0),national.valid);
   assert.equal(national.oldPartyVote,(electorate==='all'||electorate==='party')&&year<2008);
   results[electorate]=national;
  }
  assert.equal(results.all.valid,results.party.valid);
  assert.notEqual(results.regional.valid,results.party.valid);
  const regional=T.historicalScopeRows(snapshot,{office:'legislative',electorate:'regional',county:'高雄市',metric:'party',normalize:norm});
  assert.deepEqual(regional.map(r=>Object.values(r.parties).reduce((a,b)=>a+b,0)),year===1992?[6,12]:year===2008?[4,5]:[8]);
  const county=T.legislativeVoteShares(snapshot,{office:'legislative',electorate:'regional',county:'高雄市',normalize:norm});
  assert.deepEqual(county.map(r=>r.county),regional.map(r=>r.county));
  assert.ok(county.every(r=>r.complete&&Math.abs(Object.values(r.parties).reduce((a,b)=>a+b,0)-100)<1e-8));
  for(const electorate of ['plains','mountain','party']){
   const local=T.legislativeVoteShares(snapshot,{office:'legislative',electorate,county:'高雄市',normalize:norm});
   assert.equal(local.length,regional.length);
   assert.ok(local.every(r=>!r.complete||Math.abs(Object.values(r.parties).reduce((a,b)=>a+b,0)-100)<1e-8));
  }
 }
});
test('National minority and list seats use official winner counts, while county trends use regional seats',()=>{
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'}),P=require('../history-legislative-party.js');
 for(const [year,expected] of [[1992,[3,3,36]],[2008,[3,3,34]],[2024,[3,3,34]]]){
  const s=require('../assets/history-legislative-'+year+'.json');
  for(const [i,ballot] of ['plains','mountain','party'].entries()){
   const result=T.aggregate(s,{office:'legislative',electorate:ballot,normalize:norm,partySeats:ballot==='party'?P.build(year,s):null});
   assert.equal(result.complete,true,year+' '+ballot+' '+result.reason);
   assert.equal(result.seats,expected[i]);
   assert.equal(Object.values(result.parties).reduce((sum,p)=>sum+(p.seats||0),0),expected[i]);
   assert.equal(T.legislativeVoteShares(s,{office:'legislative',electorate:ballot,normalize:norm})[0].complete,true);
  }
 }
});
test('Council ballot trends keep elected seats and candidate vote shares separate',()=>{
 const s=require('../assets/history-2022.json'),norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 for(const electorate of ['all','regional','plains','mountain']){
  const national=T.councilBallotRows(s,{office:'council',electorate,normalize:norm})[0];
  assert.equal(national.complete,true,electorate+' '+national.reason);
  assert.equal(Object.values(national.seats).reduce((a,b)=>a+b,0),T.aggregate(s,{office:'council',electorate,normalize:norm}).seats);
  assert.ok(Math.abs(Object.values(national.parties).reduce((a,b)=>a+b,0)-100)<1e-8);
  const county=T.councilBallotRows(s,{office:'council',electorate,county:'高雄市',normalize:norm})[0];
  assert.equal(county.complete,true,electorate+' '+county.reason);
  assert.ok(Math.abs(Object.values(county.parties).reduce((a,b)=>a+b,0)-100)<1e-8);
 }
 const old={...s,year:1994};
 assert.equal(T.councilBallotRows(old,{office:'council',electorate:'all',normalize:norm})[0].complete,false);
});
test('Presidential, mayoral and township party vote-share trends use one geographic grain',()=>{
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const cases=[
  [require('../assets/history-president-2024.json'),{office:'president',level:'county'},13947506],
  [require('../assets/history-president-2024.json'),{office:'president',level:'town',county:'台北市'},1542011],
  [require('../assets/history-2022.json'),{office:'mayor',level:'county'},11490975],
  [require('../assets/history-2022.json'),{office:'mayor',level:'town',county:'台北市'},1360951],
  [require('../assets/history-2022.json'),{office:'township',level:'county'},3131910]
 ];
 for(const [snapshot,selection,valid] of cases){
  const r=T.localPartyVoteShares(snapshot,{...selection,normalize:norm})[0];
  assert.equal(r.complete,true,selection.office+' '+selection.level+' '+r.reason);
  assert.equal(r.valid,valid);
  assert.equal(Object.values(r.votes).reduce((a,b)=>a+b,0),valid);
  assert.ok(Math.abs(Object.values(r.parties).reduce((a,b)=>a+b,0)-100)<1e-8);
 }
 const old=T.localPartyVoteShares(require('../assets/history-local-2018.json'),{office:'mayor',level:'town',normalize:norm})[0];
 assert.equal(old.complete,true);
});
test('Party trend points skip elections without a nominee, while recorded zero remains visible',()=>{
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const old=T.localPartyVoteShares(require('../assets/history-president-1996.json'),{office:'president',level:'county',normalize:norm})[0];
 const current=T.localPartyVoteShares(require('../assets/history-president-2024.json'),{office:'president',level:'county',normalize:norm})[0];
 assert.equal(T.partyTrendValue(old,'台湾民众党'),null);
 assert.ok(T.partyTrendValue(current,'台湾民众党')>0);
 assert.equal(T.partyTrendValue({complete:true,parties:{甲:0}},'甲'),0);
 assert.equal(T.partyTrendValue({complete:true,parties:{甲:0}},'乙'),null);
 assert.equal(T.partyTrendValue({complete:true,parties:{甲:0}},'', ['乙','丙']),null);
 assert.equal(T.partyTrendValue({complete:true,parties:{甲:0}},'', ['甲','乙']),0);
 assert.equal(T.partyTrendValue({complete:false,parties:{甲:0}},'甲'),null);
});
test('Independent presidential tickets share one party series and hover lists each candidate without repeating the total',()=>{
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 for(const [year,names] of [[1996,['林洋港','陈履安']],[2000,['宋楚瑜','许信良']]]){
  const snapshot=require('../assets/history-president-'+year+'.json');
  const row=T.localPartyVoteShares(snapshot,{office:'president',level:'county',normalize:norm})[0];
  assert.deepEqual(row.candidateDetails['无党籍'].map(r=>r.name).sort(),names.sort());
  assert.equal(row.partyMeta['无党籍'].label,'无党籍');
  assert.equal(row.candidateDetails['无党籍'].reduce((sum,r)=>sum+r.votes,0),row.votes['无党籍']);
  const tip=T.candidateTrendTooltip(row,'无党籍');
  for(const name of names)assert.match(tip,new RegExp(name+' · 无党籍 · \\d+\\.\\d{2}%'));
  assert.match(tip,/合计 · \d+\.\d{2}%/);
  assert.ok(Math.abs(Object.values(row.parties).reduce((a,b)=>a+b,0)-100)<1e-8);
 }
 const row=T.localPartyVoteShares(require('../assets/history-president-2024.json'),{office:'president',level:'county',normalize:norm})[0];
 assert.match(T.candidateTrendTooltip(row,'民主进步党'),/^赖清德 · 民主进步党 · \d+\.\d{2}%$/);
});
test('2018 Taipei district mayor returns reconcile to NCCU election-day party totals',()=>{
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'}),s=require('../assets/history-local-2018.json');
 const district=T.localPartyVoteShares(s,{office:'mayor',level:'town',county:'台北市',normalize:norm})[0];
 assert.equal(district.complete,true);assert.equal(district.valid,1414816);
 assert.equal(district.votes['中国国民党'],577566);
 assert.equal(district.votes['民主进步党'],244641);
 assert.equal(district.votes['无党籍'],592609);
 const songshan=T.localPartyVoteShares(s,{office:'mayor',level:'town',county:'台北市',focus:'松山区',normalize:norm})[0];
 assert.equal(songshan.valid,106972);
 assert.equal(songshan.votes['中国国民党'],46381);
 assert.equal(songshan.votes['民主进步党'],17387);
 assert.equal(songshan.votes['无党籍'],43204);
 const city=T.localPartyVoteShares(s,{office:'mayor',level:'county',county:'台北市',normalize:norm})[0];
 assert.equal(city.valid,1413870,'the separately certified recount remains citywide');
 assert.equal(T.mapTrend(s,{office:'mayor',level:'town',county:'台北市',normalize:norm,metric:'party'}).areas,12);
 const all=T.localPartyVoteShares(s,{office:'mayor',level:'town',normalize:norm})[0];
 assert.equal(all.complete,true);
});
test('Pre-merger county and city form separate mayor and council trend branches',()=>{
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'}),first=require('../assets/history-local-2005.json'),second=require('../assets/history-local-2006.json');
 const merged={year:2006,elections:[...first.elections,...second.elections],contests:[...first.contests,...second.contests],candidacies:[...first.candidacies,...second.candidacies],rows:[...first.rows,...second.rows]};
 const after=require('../assets/history-local-2010.json');
 for(const office of ['mayor','council']){
  const selection={office,county:'高雄市',normalize:norm};
  const old=office==='mayor'?T.localPartyVoteShares(merged,{...selection,level:'county'}):T.councilBallotRows(merged,{...selection,electorate:'all'});
  const newer=office==='mayor'?T.localPartyVoteShares(after,{...selection,level:'county'}):T.councilBallotRows(after,{...selection,electorate:'all'});
  assert.deepEqual(old.map(r=>[r.county,r.label,r.scopeSeries]),[['高雄县','2005','旧高雄县'],['高雄市','2006','旧高雄市']]);
  assert.equal(newer[0].scopeSeries,'合并后高雄市');
  assert.ok(old.every(r=>r.complete));assert.equal(newer[0].complete,true);
  const sections=T.trendChartScopes([...old,...newer],'高雄市');
  assert.deepEqual(sections.map(s=>s.label),['原高雄市','原高雄县','合并后高雄市']);
  assert.deepEqual(sections.map(s=>s.rows.map(r=>r.label)),[['2006'],['2005'],['2010']]);
 }
 assert.equal(T.trendChartScopes([{year:2022,scopeSeries:'台北县'}],'新北市').length,1);
});
test('Integer tick marks and parliament dot counts are exact for small and large assemblies',()=>{
 for(const max of [0,1,2,3,22,113,161,164,225,910]){const ticks=T.integerTicks(max);assert.ok(ticks.every(Number.isInteger));assert.ok(ticks.at(-1)>=max)}
 for(const total of [1,2,3,6,22,113,161,164,225,910]){const pts=T.parliamentPoints(total);assert.equal(pts.length,total);assert.ok(pts.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.y<=0));assert.equal(new Set(pts.map(p=>p.x+'|'+p.y)).size,total)}
});
test('Parliament layout groups major parties at opposite ends and preserves neutral parties in the middle',()=>{
 const entries=[['中国国民党',52],['无党籍',2],['民主进步党',51],['亲民党',3],['新党',1],['“台湾团结联盟”',4],['台湾民众党',8]];
 const names=T.parliamentOrder(entries).map(p=>p[0]);
 assert.equal(names[0],'民主进步党');assert.equal(names.at(-1),'中国国民党');
 assert.ok(names.indexOf('“台湾团结联盟”')<names.indexOf('台湾民众党'));
 assert.ok(names.indexOf('无党籍')<names.indexOf('亲民党'));
 assert.ok(names.indexOf('台湾民众党')<names.indexOf('新党'));
 for(const [total,expected] of [[1,1],[2,2],[113,57],[161,81],[225,113],[910,456]]){
  const m=T.majorityBoundary(T.parliamentPoints(total));assert.equal(m.seats,expected);assert.ok(m.angle>=0&&m.angle<=Math.PI)
 }
});

test('Historic county trends retain actual county names and separate pre-merger municipalities',async()=>{
 const L=require('../history-local.js');
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const fetcher=async url=>({ok:true,json:async()=>url.includes('history-1994-changhua-council-profile')?require('../sources/history-1994-changhua-council-profile.json'):url.includes('supplement')?require('../assets/history-local-council-supplement.json'):url.includes('1994-council')?require('../assets/history-local-1994-council.json'):require('../assets/history-local-'+url.match(/local-(\d{4})/)[1]+'.json')});
 const conf={office:'council',electorate:'all',metric:'party',normalize:norm};
 for(const year of [1994,1998,2002,2006,2010,2014,2018,2022]){
  const s=year===2022?require('../assets/history-2022.json'):await L.loadCycle(year,'council',fetcher);
  const get=county=>T.historicalScopeRows(s,{...conf,county});
  const taipei=get('新北市');assert.equal(taipei.length,1);assert.equal(taipei[0].county,year<2010?'台北县':'新北市');assert.equal(taipei[0].complete,true,year+' '+taipei[0].reason);
  const taoyuan=get('桃园市');assert.equal(taoyuan[0].county,year<2014?'桃园县':'桃园市');assert.equal(taoyuan[0].complete,true);
  for(const city of ['台中','台南','高雄']){
   const rows=get(city+'市');
   assert.deepEqual(rows.map(r=>r.county),year<2010?[city+'县',city+'市']:[city+'市'],city+' '+year);
   for(const r of rows){
    assert.equal(r.complete,true,city+' '+year+' '+r.reason);
    const ids=new Set(s.elections.filter(e=>e.office==='council').map(e=>e.election_id));
    const contests=s.contests.filter(c=>ids.has(c.election_id)&&norm(c.county_name)===r.county),contestIds=new Set(contests.map(c=>c.contest_id));
    // 2022 raw contest seat metadata omits some indigenous allocations; the
    // separately verified 2022 district metadata and official winner flags agree.
    const expected=year===2022?require('../assets/history-council-districts-2022.json').rows.filter(d=>norm(d.county)===r.county).reduce((n,d)=>n+d.seats,0):s.candidacies.filter(c=>contestIds.has(c.contest_id)&&c.elected_official===true).length;
    assert.equal(Object.values(r.parties).reduce((n,v)=>n+v,0),expected,city+' '+year+' '+r.county);
   }
  }
 }
 const s=await L.loadCycle(2002,'council',fetcher);
 const kaohsiung=T.historicalScopeRows(s,{...conf,county:'高雄市'});
 assert.ok(kaohsiung.every(r=>/^2002$/.test(r.label)));
});

test('Council and mayor dates use their own original contests in every old election cycle',async()=>{
 const L=require('../history-local.js'),norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const fetcher=async url=>({ok:true,json:async()=>url.includes('history-1994-changhua-council-profile')?require('../sources/history-1994-changhua-council-profile.json'):url.includes('supplement')?require('../assets/history-local-council-supplement.json'):url.includes('1994-council')?require('../assets/history-local-1994-council.json'):require('../assets/history-local-'+url.match(/local-(\d{4})/)[1]+'.json')});
 const checks={1994:['1994-01-29','1994-12-03'],1998:['1998-01-24','1998-12-05'],2002:['2002-01-26','2002-12-07'],2006:['2005-12-03','2006-12-09']};
 for(const [year,dates] of Object.entries(checks)){
  const s=await L.loadCycle(Number(year),'council',fetcher);
  assert.deepEqual(T.electionDates(s,'council','高雄县',norm),[dates[0]]);
  assert.deepEqual(T.electionDates(s,'council','高雄市',norm),[dates[1]]);
  const all=T.historicalScopeRows(s,{office:'council',electorate:'all',metric:'party',normalize:norm})[0];
  assert.deepEqual(all.label,[...new Set(dates.map(d=>d.slice(0,4)))].join('/'));
  for(const county of ['台北县','桃园县','台中县','台中市','台南县','台南市','高雄县'])assert.deepEqual(T.electionDates(s,'council',county,norm),[dates[0]],county+' '+year);
  for(const county of ['台北市','高雄市'])assert.deepEqual(T.electionDates(s,'council',county,norm),[dates[1]],county+' '+year);
  const mayor=T.electionDates(s,'mayor','高雄县',norm);
  assert.ok(mayor.every(d=>d.startsWith(String(Number(year)-1))),year+' '+mayor);
 }
});

test('Chiayi City 2022 mayor rerun does not change the date of council election',()=>{
 const L=require('../history-local.js'),s=L.correctElectionDates(require('../assets/history-2022.json'));
 assert.deepEqual(T.electionDates(s,'mayor','嘉义市'),['2022-12-18']);
 assert.deepEqual(T.electionDates(s,'council','嘉义市'),['2022-11-26']);
});

test('legislative trend cache reuses scopes and list allocation without merging ballots',()=>{
 const s=require('../assets/history-legislative-2024.json'),P=require('../history-legislative-party.js');
 let builds=0;const cache=T.createLegislativeTrendCache({buildList:(y,d)=>{builds++;return P.build(y,d)},maxScopes:2});
 const all={office:'legislative',electorate:'all',county:'',level:'county'};
 const first=cache.read(s,all);
 assert.equal(first.seats[0].total,113);
 assert.deepEqual(first.votes,T.legislativeVoteShares(s,all));
 assert.strictEqual(cache.read(s,{...all,metric:'votes'}),first);
 assert.equal(builds,1);
 assert.deepEqual(cache.read(s,{...all,electorate:'party'}).votes,first.votes);
 const local={...all,county:'高雄市',electorate:'regional'};
 const scoped=cache.read(s,local);
 assert.deepEqual(scoped.seats,T.historicalScopeRows(s,{...local,metric:'party'}));
 assert.deepEqual(scoped.votes,T.legislativeVoteShares(s,local));
 assert.notStrictEqual(cache.read(s,all),first);
 assert.equal(builds,1);
 cache.clear();assert.deepEqual(cache.read(s,all),first);assert.equal(builds,2);
});
test('focused legislative trend rechecks boundaries against its active anchor',()=>{
 const s=require('../assets/history-legislative-2024.json'),P=require('../history-legislative-party.js');
 const conf={office:'legislative',electorate:'regional',county:'高雄市',level:'district',focus:'第1选举区'};
 const cache=T.createLegislativeTrendCache({buildList:P.build});
 const other={...s,year:2020,rows:[]};
 const a=cache.read(s,conf,s),b=cache.read(s,conf,other);
 assert.notStrictEqual(a,b);
 assert.deepEqual(a.seats,T.historicalScopeRows(s,{...conf,metric:'party'},s));
 assert.deepEqual(b.votes,T.legislativeVoteShares(s,conf,other));
});

test('Party-list trends use the specified ten parties and exclude independents from other',()=>{
 const row={complete:true,parties:{'中国国民党':40,'民主进步党':30,'无党籍':10,'时代力量':.3,'台湾基进':.4,'绿党':4,'其他甲党':15.3}};
 const g=T.partyListTrendGroups([row]);
 assert.deepEqual(g.individual,['中国国民党','民主进步党','时代力量','台湾基进']);
 assert.deepEqual(new Set(g.other),new Set(['绿党','其他甲党']));
 assert.equal(T.partyTrendValue(row,'',g.other),19.3);
 assert.equal(T.partyTrendValue(row,'新党'),null);
 assert.equal(T.partyListTrendKey('基進黨'),'台湾基进');
 assert.equal(T.partyListTrendKey('臺灣基進'),'台湾基进');
 assert.equal(T.partyListTrendKey('台联党'),'台湾团结联盟');
 assert.ok(T.partyListTrendExcluded('無黨籍（連署）'));
 assert.ok(T.partyListTrendExcluded('连署'));
 assert.ok(!T.partyListTrendExcluded('无党团结联盟'));
 assert.notEqual(T.partyListTrendKey('绿党社会民主党联盟'),T.partyListTrendKey('台湾绿党'));
 const snapshot={year:2020,rows:[{type:'legislative',electorate:'party',level:'national',party:'基進黨',votes:3},{type:'legislative',electorate:'party',level:'national',party:'台灣基進',votes:7},{type:'legislative',electorate:'party',level:'national',party:'甲',votes:90}]};
 const r=T.legislativeVoteShares(snapshot,{office:'legislative',electorate:'party'})[0];
 assert.equal(r.votes['台湾基进'],10);assert.equal(r.valid,100);assert.equal(r.parties['台湾基进'],10);
});
test('All ten archived party-list elections preserve original rates and omit independents only from presentation',()=>{
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const years=[1992,1995,1998,2001,2004,2008,2012,2016,2020,2024];
 const rows=years.map(year=>T.legislativeVoteShares(require('../assets/history-legislative-'+year+'.json'),{office:'legislative',electorate:'party',normalize:norm})[0]);
 assert.ok(rows.every(r=>r.complete));
 const groups=T.partyListTrendGroups(rows);
 assert.deepEqual(groups.individual,['中国国民党','民主进步党','亲民党','新党','台湾团结联盟','台湾民众党','时代力量','台湾基进','无党团结联盟','民主联盟']);
 assert.ok(groups.other.includes('中华社会民主党'));
 assert.ok(groups.other.includes('绿党'));
 assert.ok(!groups.other.some(T.partyListTrendExcluded));
 for(const r of rows){
  const total=[...groups.individual.map(p=>T.partyTrendValue(r,p)),T.partyTrendValue(r,'',groups.other)].reduce((s,v)=>s+(v??0),0);
  const excluded=Object.entries(r.parties).filter(([p])=>T.partyListTrendExcluded(p)).reduce((s,[,v])=>s+v,0);
  assert.ok(Math.abs(total+excluded-100)<1e-8,r.year);
 }
 assert.equal(T.partyTrendValue(rows[0],'时代力量'),null);
 assert.ok(rows[0].parties['无党籍']>0,'source record remains intact');
});

test('Legislative seat series includes all seat-winning parties, not an aggregate other category',()=>{
 const P=require('../history-legislative-party.js'),norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const rows=Object.keys(T.LEGISLATIVE_TOTALS).map(y=>{const s=require('../assets/history-legislative-'+y+'.json');return T.allLegislativeSeats(s,P.build(Number(y),s),norm)});
 assert.ok(rows.every(r=>r.complete));
 const names=T.legislativeSeatTrendParties(rows);
 assert.ok(names.length>7);assert.ok(names.includes('时代力量'));assert.ok(names.includes('无党籍'));assert.ok(!names.includes('其他政党'));
 for(const r of rows){assert.equal(names.reduce((n,p)=>n+(T.partyTrendValue(r,p)??0),0),r.total);for(const [p,v] of Object.entries(r.parties))if(v>0)assert.ok(names.includes(p),p)}
 const fake=[{complete:true,parties:{甲:2,乙:0,丙:1}},{complete:false,parties:{丁:100}}];
 assert.deepEqual(T.legislativeSeatTrendParties(fake),['甲','丙']);
 console.log('All legislative seat-winning party series:',JSON.stringify(names));
});

test('Party-list percent zoom uses a bounded pointer-anchored domain and readable ticks',()=>{
 assert.deepEqual(T.percentZoomTicks([0,60]),[0,10,20,30,40,50,60]);
 assert.deepEqual(T.percentZoomRange([0,60],.5,.5),[15,45]);
 assert.deepEqual(T.percentZoomRange([0,60],.5,0),[0,30]);
 assert.deepEqual(T.percentZoomRange([0,60],.5,1),[30,60]);
 assert.deepEqual(T.percentZoomRange([0,60],10,.5),[0,100]);
 assert.deepEqual(T.percentZoomRange([20,30],.001,.5),[24,26]);
 assert.ok(T.percentZoomTicks([24,26]).every(x=>x>=24&&x<=26));
});

test('Presidential independent aliases merge cached and raw vote rows without altering the denominator',()=>{
 const norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
 const fake={complete:true,valid:100,parties:{'连署':20,'无党籍':10,'无党籍（连署）':5,'甲':65},votes:{'连署':20,'无党籍':10,'无党籍（连署）':5,'甲':65},partyMeta:{},candidateDetails:{'连署':[{name:'甲',party:'无党籍（连署）',votes:20}],'无党籍':[{name:'乙',party:'无党籍',votes:10}]}};
 const r=T.mergePresidentialIndependents(fake);assert.equal(r.parties['无党籍'],35);assert.equal(r.votes['无党籍'],35);assert.equal(r.valid,100);assert.equal(r.candidateDetails['无党籍'].length,2);assert.equal(r.partyMeta['无党籍'].label,'无党籍');assert.ok(!Object.hasOwn(r.parties,'连署'));assert.equal(fake.parties['连署'],20);assert.deepEqual(T.mergePresidentialIndependents(r),r);
 for(const year of [1996,2000,2004,2008,2012,2016,2020,2024]){const row=T.localPartyVoteShares(require('../assets/history-president-'+year+'.json'),{office:'president',level:'county',normalize:norm})[0];assert.ok(row.complete);assert.ok(Math.abs(Object.values(row.parties).reduce((n,v)=>n+v,0)-100)<1e-8);assert.ok(!Object.hasOwn(row.parties,'连署'));assert.equal(Object.values(row.votes).reduce((n,v)=>n+v,0),row.valid);if([1996,2000,2012].includes(year))assert.ok(row.votes['无党籍']>0);}
});
