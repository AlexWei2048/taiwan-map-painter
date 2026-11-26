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
