/* Cross-election history: aggregate one electoral grain at a time. */
(function(root){
'use strict';
const Core=typeof module!=='undefined'&&module.exports?require('./history-core.js'):root.HistoryCore;
const MERGED={'台北县':'新北市','桃园县':'桃园市','台中县':'台中市','台南县':'台南市','高雄县':'高雄市'};
const modern=n=>MERGED[n]||n;
const sum=(rows,key)=>rows.length&&rows.every(r=>Number.isFinite(r[key]))?rows.reduce((s,r)=>s+r[key],0):null;
const percent=(n,d)=>Number.isFinite(n)&&d>0?n/d*100:null;
const knownBool=x=>typeof x==='boolean';
const genderKnown=x=>['男','女','男性','女性'].includes(x);
const female=x=>x==='女'||x==='女性';
const keyParty=p=>String(p||'政党资料缺失').replaceAll('臺','台').replace(/^無黨籍.*$/,'无党籍').replace(/^无党籍.*$/,'无党籍');
const electionIds=(s,office)=>new Set((s.elections||[]).filter(e=>e.office===office).map(e=>e.election_id));
function aggregate(snapshot,{office,electorate='regional',county='',town='',unified=true,normalize=String,partySeats=null,turnoutEnrich=null}={}){
 const s=snapshot,year=s.year,ids=electionIds(s,office),cn=n=>normalize(String(n||'')),area=n=>unified?modern(cn(n)):cn(n);
 const identity=Core.identity;
 const accepts=e=>electorate==='all'||identity(e)===electorate;
 const sameCounty=n=>!county||area(n)===county;
 const isLeg=office==='legislative',isPres=office==='president',isList=isLeg&&electorate==='party';
 const geographicVotes=!!town||isLeg&&electorate!=='regional'&&!!county;
 const contests=(s.contests||[]).filter(c=>ids.has(c.election_id)&&accepts(c.electorate)&&sameCounty(c.county_name));
 const csIds=new Set(contests.map(c=>c.contest_id));
 const candidacies=(s.candidacies||[]).filter(c=>csIds.has(c.contest_id));
 let records=candidacies.map(c=>({party:keyParty(cn(c.party_name)),votes:c.votes,elected:c.elected_official===true,gender:c.gender,incumbent:c.incumbent_at_election,name:c.candidate_name,number:c.ballot_number}));
 if(geographicVotes){
  const level=town?'town':'county';
  records=(s.rows||[]).filter(r=>r.type===office&&r.level===level&&accepts(r.electorate)&&sameCounty(r.county)&&(!town||cn(r.town)===town))
   .map(r=>({party:keyParty(cn(r.party)),votes:r.votes,elected:false,gender:r.gender,incumbent:r.incumbent,name:r.name,number:r.number}));
  // Township chiefs are elected in the township itself, not a vote breakdown.
  if(office==='township'&&town){
   const selected=contests.filter(c=>cn(c.district_name)===town),chosen=new Set(selected.map(c=>c.contest_id));
   records=candidacies.filter(c=>chosen.has(c.contest_id)).map(c=>({party:keyParty(cn(c.party_name)),votes:c.votes,elected:c.elected_official===true,gender:c.gender,incumbent:c.incumbent_at_election,name:c.candidate_name,number:c.ballot_number}));
   contests.splice(0,contests.length,...selected);
  }
 }
 const localSeat=office==='township'&&!!town,seatAllowed=!isPres&&(!geographicVotes||localSeat)&&(!isList||!county);
 const partial=(office==='council'&&year===1994&&(!county||county==='金门县'))||
  (office==='mayor'&&year===2018&&town&&county==='台北市');
 const grainTotal=records.reduce((n,r)=>n+(Number(r.votes)||0),0);
 const expected=isPres&&!county&&!town?s.national?.valid_votes:!geographicVotes?sum(contests,'valid_votes'):null;
 const reconciled=!Number.isFinite(expected)||expected===grainTotal;
 const complete=records.length>0&&!partial&&reconciled&&records.every(r=>Number.isFinite(r.votes)&&r.votes>=0);
 const valid=complete?records.reduce((n,r)=>n+r.votes,0):null;
 const parties=Object.create(null);
 if(complete)for(const r of records){
  const p=parties[r.party]||(parties[r.party]={votes:0,seats:seatAllowed?0:null});
  p.votes+=r.votes;if(seatAllowed&&r.elected)p.seats++;
 }
 let seats=seatAllowed&&complete?records.filter(r=>r.elected).length:null;
 if(isList){
  seats=null;
  if(complete&&seatAllowed&&partySeats?.matchesOfficial){
   seats=partySeats.totalAssigned;
   for(const p of Object.values(parties))p.seats=0;
   for(const p of partySeats.parties){const k=keyParty(cn(p.party));if(parties[k])parties[k].seats=p.seats;else parties[k]={votes:0,seats:p.seats}}
  }else for(const p of Object.values(parties))p.seats=null;
 }
 // National presidential candidate records repeat by county; count each ticket once.
 const people=isPres?[...new Map(records.map(r=>[String(r.number)+'|'+r.name,r])).values()]:records;
 const peopleAllowed=complete&&!isList&&(!geographicVotes||localSeat);
 const electedPeople=people.filter(r=>r.elected);
 const sexKnown=people.filter(r=>genderKnown(r.gender)),sexElected=electedPeople.filter(r=>genderKnown(r.gender));
 const incumbents=people.filter(r=>r.incumbent===true),incKnown=people.filter(r=>knownBool(r.incumbent));
 let registered=null,cast=null,invalid=null;
 if(complete&&(!geographicVotes||localSeat)){
  const profile=isPres&&!county?s.national:null;
  registered=profile?.registered_voters??sum(contests,'registered_voters');
  cast=profile?.ballots_cast??sum(contests,'ballots_cast');
  invalid=profile?.invalid_votes??sum(contests,'invalid_votes');
 }
 if(complete&&isLeg&&turnoutEnrich&&!(isList&&year<2008)){
  const p=turnoutEnrich({validVotes:valid,turnoutGroups:[]},{year,electorate,scope:town?'town':county?'county':'all',county,area:town});
  registered=p.registeredVoters??registered;cast=p.ballotsCast??cast;invalid=p.invalidVotes??invalid;
 }
 if(complete&&town&&!localSeat){
  const profiles=(s.townProfiles||[]).filter(p=>p.office===office&&sameCounty(p.county||p.county_name)&&cn(p.town||p.town_name)===town);
  if(profiles.length&&sum(profiles,'valid_votes')===valid){registered=sum(profiles,'registered_voters');cast=sum(profiles,'ballots_cast');invalid=sum(profiles,'invalid_votes')}
 }
 if(!Number.isFinite(cast)||!Number.isFinite(registered)||cast>registered||cast<valid){registered=null;cast=null;invalid=null}
 if(!Number.isFinite(invalid)||valid+invalid!==cast)invalid=null;
 const actualNames=geographicVotes&&!localSeat?[...new Set((s.rows||[]).filter(r=>r.type===office&&r.level===(town?'town':'county')&&accepts(r.electorate)&&sameCounty(r.county)&&(!town||cn(r.town)===town)).map(r=>cn(r.county)).filter(Boolean))]:[...new Set(contests.map(c=>cn(c.county_name)))];
 const dates=[...new Set(contests.map(c=>c.election_date?.slice(0,4)).filter(Boolean))].sort();
 const partyLeader=metric=>{if(!complete)return null;const a=Object.entries(parties).filter(([,p])=>Number.isFinite(p[metric])).sort((a,b)=>b[1][metric]-a[1][metric]);if(!a.length||!a[0][1][metric])return null;return a.length>1&&a[0][1][metric]===a[1][1][metric]?'并列':a[0][0]};
 return {year,label:county&&dates.length?dates.join('/'):String(year),complete,reason:partial?'当届记录缺失，未将部分数据当作完整结果':!reconciled?'候选人票数与已核验有效票不一致':records.length?'':'本范围没有可核实的当届结果',
  valid,seats,parties,registered,cast,invalid,turnout:percent(cast,registered),validRate:percent(valid,cast),
  candidateCount:peopleAllowed?people.length:null,electedCount:peopleAllowed?electedPeople.length:null,
  femaleCandidate:peopleAllowed?percent(people.filter(r=>female(r.gender)).length,sexKnown.length):null,
  femaleElected:peopleAllowed?percent(electedPeople.filter(r=>female(r.gender)).length,sexElected.length):null,
  genderCoverage:peopleAllowed?percent(sexKnown.length,people.length):null,
  electedGenderCoverage:peopleAllowed?percent(sexElected.length,electedPeople.length):null,
  incumbentRate:peopleAllowed?percent(incumbents.length,incKnown.length):null,
  reelectionRate:peopleAllowed?percent(incumbents.filter(r=>r.elected).length,incumbents.length):null,
  incumbentCoverage:peopleAllowed?percent(incKnown.length,people.length):null,
  seatLeader:partyLeader('seats'),voteLeader:partyLeader('votes'),contests:contests.length,
  actualCounties:actualNames,oldPartyVote:isList&&year<2008};
}
function value(row,party,metric){
 if(!row?.complete)return null;
 const p=row.parties?.[party];
 if(metric==='votes')return p?.votes??0;
 if(metric==='share')return percent(p?.votes??0,row.valid);
 if(metric==='seats')return Number.isFinite(row.seats)?p?.seats??0:null;
 if(metric==='seatShare')return Number.isFinite(row.seats)?percent(p?.seats??0,row.seats):null;
 if(metric==='rank'){
  if(!Number.isFinite(row.seats)||!p?.seats)return null;
  return 1+Object.values(row.parties).filter(x=>x.seats>p.seats).length;
 }
 return null;
}
function difference(a,b,party,metric){const x=value(a,party,metric),y=value(b,party,metric);return Number.isFinite(x)&&Number.isFinite(y)?y-x:null}
// Match the map grain and filter exactly. A trend over leading candidates
// uses each region's top individual, NOT the aggregate of all party nominees.
// Resolve names from the original election records, never from a modern map.
const RENAME_FAMILIES=[['台北县','新北市'],['桃园县','桃园市']];
const MERGE_FAMILIES=[['台中县','台中市'],['台南县','台南市'],['高雄县','高雄市']];
function historicalCountyFamily(county){
 return [...RENAME_FAMILIES,...MERGE_FAMILIES].find(group=>group.includes(county))||[county];
}
function historicalCountyScopes(snapshot,selection){
 const {county='',office,normalize=String}=selection;
 if(!county)return [''];
 const family=historicalCountyFamily(county);
 if(family.length===1)return [county];
 const norm=v=>normalize(String(v||''));
 const ids=electionIds(snapshot,office);
 // County membership is based on this office, not another election in the
 // same two-year batch. Prefer original contests; vote-only records can also
 // establish a geographic name (e.g. party-list or indigenous local tallies).
 const present=new Set([
  ...(snapshot.contests||[]).filter(c=>ids.has(c.election_id)).map(c=>norm(c.county_name)),
  ...(snapshot.rows||[]).filter(r=>r.type===office).map(r=>norm(r.county))
 ]);
 const available=family.filter(n=>present.has(n));
 return available.length?available:[county];
}
// Dates must be derived from this office's original contests, not the
// shared local-election cycle (which also contains a different office).
function electionDates(snapshot,office,county='',normalize=String){
 const ids=electionIds(snapshot,office);
 return [...new Set((snapshot.contests||[]).filter(c=>ids.has(c.election_id)&&(!county||normalize(String(c.county_name||''))===county)).map(c=>c.election_date).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')))].sort();
}
function historicalScopeRows(snapshot,selection,anchor){
 const {county='',office,normalize=String}=selection;
 const family=historicalCountyFamily(county),merged=MERGE_FAMILIES.some(g=>g.includes(county));
 const scopes=historicalCountyScopes(snapshot,selection);
 return scopes.map(actualCounty=>{
  const result=mapTrend(snapshot,{...selection,county:actualCounty,anchorCounty:county},anchor);
  const actualDates=electionDates(snapshot,office,actualCounty,normalize),dates=[...new Set(actualDates.map(d=>d.slice(0,4)))];
  if(dates.length)result.label=dates.join('/');
  result.dates=actualDates;result.cycle=snapshot.year;
  result.county=actualCounty;
  // Different pre-merger county and city are separate comparison units.
  // Do not join vote trends across their merger as if the boundaries stayed fixed.
  const oldPair=merged&&(scopes.length>1||actualCounty===family[0]||Number(dates[0]||snapshot.year)<2010);
  result.scopeSeries=merged?(oldPair?'旧'+actualCounty:'合并后'+actualCounty):family[0];
  result.scopeLabel=family.length>1?actualCounty:'';
  return result;
 });
}
function mapTrend(snapshot,selection,anchor){
 const {office,electorate='regional',county='',anchorCounty=county,level='county',focus='',metric='party',candidateScope='top',candidate=null,party='',normalize=String}=selection;
 const norm=v=>normalize(String(v||''));
 const partyName=v=>keyParty(norm(v||'政党资料缺失'));
 const isLeg=office==='legislative',isList=isLeg&&electorate==='party';
 const grain=office==='council'||isLeg&&electorate==='regional'?'district':office==='township'||level==='town'?'town':'county';
 const candidateMetric=metric==='share'||metric==='votes';
 const leading=office==='president'||isLeg&&electorate!=='regional'||office==='mayor'&&grain==='town';
 const identity=Core.identity;
 const year=snapshot.year;
 const dates=(snapshot.elections||[]).filter(e=>e.office===office).map(e=>String(e.year||year));
 const ids=electionIds(snapshot,office);
 const localDates=(snapshot.contests||[]).filter(c=>ids.has(c.election_id)&&norm(c.county_name)===county&&(identity(c.electorate)===electorate||electorate==='all')).map(c=>c.election_date?.slice(0,4)).filter(Boolean);
 const displayYear=county&&localDates.length?[...new Set(localDates)].sort().join('/'):String(year);
 const empty=reason=>({year,label:displayYear,complete:false,reason,parties:{},values:{},valid:null,areas:0});
 if(office==='council'&&year===1994&&(!county||county==='金门县'))return empty('当届议员完整得票资料缺档');
 if(office==='mayor'&&grain==='town'&&year===2018&&(!county||county==='台北市'))return empty('台北市重计后的区级得票缺档');
 if(focus&&grain==='district'&&anchor&&(year!==anchor.year||county!==anchorCounty)){
  // District number alone is never a cross-year geographic identifier.
  const getSignature=(s,area)=>{
   const idx=Core.legislativeScopeIndex(s.rows,norm),id=area+'|'+(Core.districtNumber(focus)||'0'),towns=[...(idx.districts.get(id)||[])].sort();
   if(!towns.length||towns.some(t=>(idx.owners.get(area+'|'+t)?.size||0)>1))return null;
   return towns.join('|');
  };
  const a=getSignature(anchor,anchorCounty),b=getSignature(snapshot,county);
  if(!a||!b||a!==b)return empty('选区历届范围不能确认一致');
 }
 const candidateCountyMatches=r=>!candidate?.county||office==='president'||norm(r.county)===norm(candidate.county)||RENAME_FAMILIES.some(g=>g.includes(norm(r.county))&&g.includes(norm(candidate.county)));
 let rows=(snapshot.rows||[]).filter(r=>r.type===office&&r.level===grain&&(electorate==='all'||identity(r.electorate)===electorate)&&(!county||norm(r.county)===county)&&(!focus||(grain==='town'?norm(r.town)===focus:grain==='district'?Core.districtNumber(r.district)===Core.districtNumber(focus):true)));
 // 1992 has national-only indigenous returns. Use the actual national
 // electoral district only for an all-area selection, never invent local votes.
 if(!rows.length&&isLeg&&year===1992&&!county&&!focus&&['plains','mountain'].includes(electorate)&&grain==='county')
  rows=(snapshot.rows||[]).filter(r=>r.type===office&&identity(r.electorate)===electorate&&r.level==='national');
 if(!rows.length)return empty('所选范围无可核实的当届记录');
 if(rows.some(r=>!Number.isFinite(r.votes)||r.votes<0))return empty('得票资料不完整');
 const groups=new Map();
 for(const r of rows){
  const id=[norm(r.county),identity(r.electorate),grain==='district'?Core.districtNumber(r.district)||norm(r.district):grain==='town'?norm(r.town):''].join('|');
  if(!groups.has(id))groups.set(id,[]);groups.get(id).push(r);
 }
 const selected={};const add=(key,n)=>{if(!Object.hasOwn(selected,key))Object.defineProperty(selected,key,{value:0,writable:true,enumerable:true});selected[key]+=n};
 let valid=0,selectedVotes=0,selectedFound=false;
 for(const list of groups.values()){
  const total=list.reduce((n,r)=>n+r.votes,0);valid+=total;
  const ranked=[...list].sort((a,b)=>b.votes-a.votes);
  if(candidateMetric){
   if(candidateScope==='candidate'){
    const found=ranked.filter(r=>candidate&&(isList?partyName(r.party)===partyName(candidate.party):norm(r.name)===norm(candidate.name)&&partyName(r.party)===partyName(candidate.party)&&candidateCountyMatches(r)&&(!['council','legislative'].includes(office)||!candidate.district||Core.districtNumber(r.district)===Core.districtNumber(candidate.district))&&(!(office==='township')||!candidate.town||norm(r.town)===norm(candidate.town))));
    if(found.length===1){selectedVotes+=found[0].votes;selectedFound=true}
   }else if(ranked.length){selectedVotes+=ranked[0].votes;selectedFound=true}
  }else if(leading&&metric==='party'){
   if(ranked.length){const first=ranked[0],tie=ranked[1]?.votes===first.votes;add(tie?'并列':partyName(first.party),1)}
  }else for(const r of ranked.filter(r=>r.elected===true||r.elected==='true'))add(partyName(r.party),1);
 }
 // Whole-scope candidate share is weighted by the valid vote of the selected
 // geographic grain, not the mean of percentages in unequal-sized areas.
 if(candidateMetric&&candidateScope==='candidate'&&candidate&&!isList){
  // A named candidate may be absent from some areas or an entire election.
  // For regional candidates, use only the contest(s) where the candidate is
  // recorded, rather than unrelated districts' votes in the denominator.
  let candidateValid=0;
  for(const list of groups.values())if(list.some(r=>norm(r.name)===norm(candidate.name)&&partyName(r.party)===partyName(candidate.party)&&candidateCountyMatches(r)&&(!['council','legislative'].includes(office)||!candidate.district||Core.districtNumber(r.district)===Core.districtNumber(candidate.district))&&(office!=='township'||!candidate.town||norm(r.town)===norm(candidate.town))))candidateValid+=list.reduce((n,r)=>n+r.votes,0);
  valid=candidateValid;
 }
 if(candidateMetric){
  const v=selectedFound?(metric==='share'?percent(selectedVotes,valid):selectedVotes):null;
  return {year,label:displayYear,complete:Number.isFinite(v),reason:Number.isFinite(v)?'':'本届无匹配的指定候选人或政党',parties:{},values:{value:v},valid,areas:groups.size};
 }
 if(metric==='seats')return {year,label:displayYear,complete:true,reason:'',parties:selected,values:{value:selected[partyName(party)]||0},valid,areas:groups.size};
 return {year,label:displayYear,complete:true,reason:'',parties:selected,values:{},valid,areas:groups.size};
}
// Compare original elected seats, not later replacements or party switches.
// Full legislative totals: https://www.ly.gov.tw/EngPages/List.aspx?nodeid=338
const LEGISLATIVE_TOTALS={1992:161,1995:164,1998:225,2001:225,2004:225,2008:113,2012:113,2016:113,2020:113,2024:113};
function allLegislativeSeats(snapshot,listModel,normalize=String){
 const year=snapshot.year,expected=LEGISLATIVE_TOTALS[year],ids=electionIds(snapshot,'legislative');
 const contests=new Set((snapshot.contests||[]).filter(c=>ids.has(c.election_id)&&['regional','plains','mountain','indigenous'].includes(Core.identity(c.electorate))).map(c=>c.contest_id));
 const parties=Object.create(null),add=(party,n)=>{const k=keyParty(normalize(String(party||'无党籍')));parties[k]=(parties[k]||0)+n};
 const seen=new Set();
 for(const c of snapshot.candidacies||[]){if(!contests.has(c.contest_id)||c.elected_official!==true)continue;const k=c.candidacy_id||[c.contest_id,c.ballot_number,c.candidate_name].join('|');if(seen.has(k))continue;seen.add(k);add(c.party_name,1)}
 if(!listModel?.matchesOfficial||!expected)return{year,label:String(year),complete:false,reason:'不分区及侨选席次尚未通过核对',parties:{},values:{},total:null};
 for(const p of listModel.parties||[])if(Number.isInteger(p.seats)&&p.seats>0)add(p.party,p.seats);
 const total=Object.values(parties).reduce((n,v)=>n+v,0);
 if(total!==expected)return{year,label:String(year),complete:false,reason:'已核验席次 '+total+' / 法定总席次 '+expected+'，暂不绘制不完整构成',parties:{},values:{},total:null};
 return{year,label:String(year),complete:true,reason:'',parties,values:{},total};
}
function integerTicks(max){
 const target=Math.max(1,Math.ceil(max/4)),magnitude=10**Math.floor(Math.log10(target));
 const step=Math.max(1,([1,2,5,10].find(n=>n*magnitude>=target)||10)*magnitude);
 const end=Math.max(step,Math.ceil(max/step)*step);
 return Array.from({length:end/step+1},(_,i)=>i*step);
}
// Evenly spaced concentric semicircular rows; exactly one mark per seat.
// Positions are sorted left-to-right by polar angle so parties form wedges.
function parliamentPoints(total){
 if(!Number.isSafeInteger(total)||total<=0)return [];
 const rows=Math.max(1,Math.ceil(Math.sqrt(total/5))),inner=rows===1?1:0.36,step=(1-inner)/Math.max(1,rows-1);
 const radii=Array.from({length:rows},(_,i)=>inner+i*step);
 const weights=radii.map(r=>Math.PI*r),sum=weights.reduce((a,b)=>a+b,0);
 const ideal=weights.map(w=>w/sum*total),counts=ideal.map(Math.floor);
 let remainder=total-counts.reduce((a,b)=>a+b,0);
 for(const i of ideal.map((v,i)=>i).sort((a,b)=>(ideal[b]-counts[b])-(ideal[a]-counts[a])))if(remainder-->0)counts[i]++;
 const pts=[];
 for(let i=0;i<rows;i++)for(let j=0;j<counts[i];j++){
  const angle=counts[i]===1?Math.PI/2:Math.PI-(j+.5)/counts[i]*Math.PI,r=radii[i];
  pts.push({x:r*Math.cos(angle),y:-r*Math.sin(angle),angle,r,row:i});
 }
 return pts.sort((a,b)=>b.angle-a.angle||a.r-b.r);
}
// Display order only: not a claim about legislative voting alliances.
// Use conservative historical party-family grouping; ambiguous parties and
// independents remain in the middle rather than assigning a current ideology.
function parliamentOrder(parties){
 const normalize=p=>String(p).replace(/[“”「」『』]/g,'').replaceAll('臺','台').replaceAll('灣','湾').replaceAll('國','国').replaceAll('黨','党').replaceAll('團','团').replaceAll('聯','联').replaceAll('親','亲').replaceAll('進','进').replaceAll('無','无').replaceAll('基進','基进');
 const green=new Set(['台湾团结联盟','台湾基进','基进党']);
 const blue=new Set(['亲民党','新党']);
 const rank=p=>{const n=normalize(p);return n==='民主进步党'?0:green.has(n)?1:blue.has(n)?3:n==='中国国民党'?4:2};
 return [...parties].sort((a,b)=>rank(a[0])-rank(b[0])||b[1]-a[1]||a[0].localeCompare(b[0],'zh'));
}
// Mark the boundary after the minimum majority of seats counted from left.
// Equal angular positions can occur on different concentric rows.
function majorityBoundary(points){
 const total=points.length;if(!total)return null;
 const seats=Math.floor(total/2)+1;
 const angle=seats===total?0:(points[seats-1].angle+points[seats].angle)/2;
 return {seats,angle};
}
const api={aggregate,value,difference,modern,percent,mapTrend,allLegislativeSeats,integerTicks,parliamentPoints,parliamentOrder,majorityBoundary,historicalCountyFamily,historicalCountyScopes,historicalScopeRows,electionDates,LEGISLATIVE_TOTALS};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
root.HistoryTrends=api;
})(typeof window==='undefined'?{}:window);
