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
const api={aggregate,value,difference,modern,percent};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
root.HistoryTrends=api;
})(typeof window==='undefined'?{}:window);
