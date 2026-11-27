/* Historical legislative results: separate national constituencies from local
 * vote geography. Every local tally comes from source rows, never allocation. */
(function(root){
 'use strict';
 const Core=typeof module!=='undefined'&&module.exports?require('./history-core.js'):root.HistoryCore;
 const Turnout=typeof module!=='undefined'&&module.exports?require('./history-legislative-turnout.js'):root.HistoryLegislativeTurnout;
 const BALLOT_LABELS={regional:'区域民代',plains:'平地少数民族民代',mountain:'山地少数民族民代',party:'不分区政党票'};
 const compare=(a,b)=>Core.compareResultRows(a,b,'council');
 const minorityDistrict=r=>r.electorate==='plains'?'平地少数民族选区':r.electorate==='mountain'?'山地少数民族选区':'';
 const displayDistrict=r=>minorityDistrict(r)?minorityDistrict(r)+(r.town?' · '+r.town:''):(r.town||r.district||'');
 function regionChoices(indexed,selection={}){
  if(indexed?.snapshot?.office!=='legislative')return{counties:[],areas:[]};
  const s=indexed.snapshot,electorate=selection.electorate||'regional';
  const valid=new Set(s.rows.filter(r=>r.electorate==='regional'&&r.level==='county').map(r=>r.county));
  const counties=[...new Set(s.rows.filter(r=>(electorate==='all'||r.electorate===electorate)&&r.level==='county'&&valid.has(r.county)).map(r=>r.county))]
   .sort((a,b)=>compare({county_name:a},{county_name:b}));
  const county=selection.county||'';
  const areas=electorate==='regional'&&selection.scope!=='town'?s.contests.filter(c=>c.electorate==='regional'&&c.county_name===county)
   .map(c=>({value:c.contest_id,label:c.district_name})):
   [...new Set(s.rows.filter(r=>r.electorate===electorate&&r.level==='town'&&r.county===county).map(r=>r.town))]
    .map(town=>({value:town,label:town}));
  areas.sort((a,b)=>a.label.localeCompare(b.label,'zh',{numeric:true}));
  return{counties,areas};
 }
 function localResult(indexed,selection={}){
  if(indexed?.snapshot?.office!=='legislative')return null;
  const s=indexed.snapshot,year=Number(selection.year||s.year),electorate=selection.electorate||'regional',
   scope=selection.scope||'all',county=String(selection.county||''),area=String(selection.area||'');
  if(electorate==='all'){
   const ids=['regional','party','plains','mountain'],parts=ids.map(id=>localResult(indexed,{...selection,electorate:id,scope:county?'county':'all',area:''})).filter(Boolean);
   if(!parts.length)return null;
   const result={index:indexed,selection:{year,office:'legislative',electorate:'all',countyId:county||''},contests:parts.flatMap(p=>p.result.contests),candidacies:parts.flatMap(p=>p.result.candidacies),summaries:parts.flatMap(p=>p.result.summaries)};
   const groups=parts.flatMap(p=>p.overview.turnoutGroups||[]),overview={...Core.overview(result),registeredVoters:null,ballotsCast:null,validVotes:null,invalidVotes:null,turnout:null,turnoutGroups:groups,electedCount:county?parts.find(p=>p.result.selection.electorate==='regional')?.overview.electedCount??null:parts.filter(p=>p.result.selection.electorate!=='party').reduce((n,p)=>n+(p.overview.electedCount||0),0)};
   return{result,overview,scope:county?'county':'all',county,area:''};
  }
  if(scope==='all'||scope==='national'){
   const result=Core.filter(indexed,{year,office:'legislative',electorate});
   const overview=Turnout.enrich(Core.overview(result),{year,electorate,scope:'all'});if(electorate==='party')overview.electedCount=null;
   return{result,overview,scope:'all',county:'',area:''};
  }
  if(!county)return null;
  if(electorate==='regional'&&scope!=='town'){
   const selected=s.contests.filter(c=>c.electorate==='regional'&&c.county_name===county);
   if(!selected.length)return null;
   const query={year,office:'legislative',electorate,countyId:selected[0].county_id};
   if(scope==='district'){
    const contest=selected.find(c=>c.contest_id===area);if(!contest)return null;
    query.contestId=contest.contest_id;
   }
   const result=Core.filter(indexed,query);
   const districtNumber=scope==='district'&&result.contests.length===1?
    String(root.HistoryLegislative?.districtNumber(result.contests[0].district_name)||
      Core.districtNumber(result.contests[0].district_name)||''):'';
   return{result,overview:Turnout.enrich(Core.overview(result),{
    year,electorate,scope,county,area,districtNumber,contests:result.contests.length}),scope,county,area};
  }
  const level=scope==='town'?'town':'county';
  const rows=s.rows.filter(r=>r.electorate===electorate&&r.level===level&&r.county===county&&
   (level!=='town'||!area||r.town===area));
  if(!rows.length)return null;
  const groups=new Map();
  for(const r of rows){
   const key=level==='town'?r.town:county;
   if(!groups.has(key))groups.set(key,[]);
   groups.get(key).push(r);
  }
  const contests=[],candidacies=[],summaries=[];
  for(const [key,part] of groups){
   const contest_id='legislative:'+year+':'+electorate+':local:'+county+':'+key;
   const valid_votes=part.reduce((n,r)=>n+Number(r.votes||0),0);
   const contest={contest_id,election_id:'legislative:'+year+':'+electorate,
    county_id:'historical:'+year+':'+county,county_name:county,district_name:key,
    electorate,valid_votes,registered_voters:null,ballots_cast:null,invalid_votes:null};
   const profiles=s.geographicProfiles?.[electorate];
   const profile=level==='town'?profiles?.town?.[county]?.[key]:profiles?.county?.[county];
   if(profile?.[2]===valid_votes){
    [contest.registered_voters,contest.ballots_cast,,contest.invalid_votes]=profile;
   }
   const rows=part.map((r,i)=>({
    candidacy_id:contest_id+':'+i,contest_id,candidate_name:r.name,party_name:r.party,
    ballot_number:r.number||null,gender:r.gender??null,incumbent_at_election:r.incumbent??null,
    votes:r.votes,vote_share:valid_votes?r.votes/valid_votes*100:0,
    elected_official:false
   }));
   rows.sort((a,b)=>b.votes-a.votes);
   contests.push(contest);candidacies.push(...rows);
   summaries.push({contest,candidacies:rows,leader:rows[0]||null,winners:[],validVotes:valid_votes,partySeats:new Map()});
  }
  const result={index:indexed,selection:{year,office:'legislative',electorate,countyId:county},
   contests,candidacies,summaries};
  return{result,overview:{...Turnout.enrich(Core.overview(result),{year,electorate,scope,county,area}),electedCount:null,incumbentCount:null},
   scope,county,area,geographicVoteOnly:true};
 }
 function exportCsv(snapshot,selection={}){
  if(snapshot?.office!=='legislative')return Core.csv([['无立法机构民代资料']]);
  const year=Number(selection.year||snapshot.year),electorate=selection.electorate||'regional',
   level=electorate==='regional'&&selection.level!=='town'?'district':year===1992&&!selection.county&&selection.level!=='town'&&['plains','mountain'].includes(electorate)?'national':selection.level==='national'?'national':
    selection.level==='town'?'town':'county',county=selection.county||'';
  if(electorate==='all'){
   const ids=['regional','party','plains','mountain'],levels=Object.fromEntries(ids.map(id=>[id,id==='regional'?'district':county&&snapshot.rows.some(s=>s.electorate===id&&s.county===county&&s.level==='town')?'town':'county']));
   const records=snapshot.rows.filter(r=>ids.includes(r.electorate)&&(!county||r.county===county)&&r.level===levels[r.electorate]);
   const key=r=>[r.electorate,r.county,r.level==='district'?r.district:r.level==='town'?r.town:''].join('|'),totals=new Map();
   for(const r of records)totals.set(key(r),(totals.get(key(r))||0)+Number(r.votes||0));
   records.sort((a,b)=>['regional','party','plains','mountain'].indexOf(a.electorate)-['regional','party','plains','mountain'].indexOf(b.electorate)||key(a).localeCompare(key(b),'zh',{numeric:true})||b.votes-a.votes);
   return Core.csv([['年份','票种','县市','选区 / 乡镇市区','候选人 / 政党','号次','性别','选举时现任','所属政党','得票数','得票率','当选'],...records.map(r=>[year,BALLOT_LABELS[r.electorate],r.county,displayDistrict(r),r.name,r.electorate==='party'?'':r.number||'',r.electorate==='party'?'':r.gender||'',r.electorate!=='party'&&r.incumbent===true?'现任':'',r.party,r.votes,(totals.get(key(r))?r.votes/totals.get(key(r))*100:0).toFixed(2)+'%',r.electorate!=='party'&&r.elected?'是':''])]);
  }
  const focus=String(selection.focus||'');
  const records=snapshot.rows.filter(r=>r.electorate===electorate&&r.level===level&&(!county||r.county===county)&&
   (!focus||level==='district'&&root.HistoryLegislative?.districtNumber(r.district)===root.HistoryLegislative?.districtNumber(focus)||
    level==='town'&&r.town===focus));
  const area=r=>level==='national'?'全区':level==='town'?r.county+'|'+r.town:
   electorate==='regional'?r.county+'|'+r.district:r.county;
  const totals=new Map();
  for(const r of records)totals.set(area(r),(totals.get(area(r))||0)+Number(r.votes||0));
  records.sort((a,b)=>compare(a,b)||area(a).localeCompare(area(b),'zh',{numeric:true})||b.votes-a.votes);
  const party=electorate==='party',label=root.HistoryLegislative?.ballots(year).find(x=>x.value===electorate)?.label||BALLOT_LABELS[electorate];
  const result=[['年份','票种','县市','选区 / 乡镇市区',party?'政党':'候选人',...(party?[]:['号次','性别','选举时现任']),
   '所属政党','得票数','得票率',...(party?[]:['当选'])]];
  for(const r of records){
   const total=totals.get(area(r))||0;
   result.push([year,label,level==='national'?'全部地区（含金门、马祖）':r.county,
    displayDistrict(r)||(level==='national'?'全区':''),r.name,...(party?[]:[r.number||'',r.gender||'',r.incumbent===true?'现任':'']),r.party,
    r.votes,(total?r.votes/total*100:0).toFixed(2)+'%',...(party?[]:[r.elected?'是':''])]);
  }
  return Core.csv(result);
 }
 const api={regionChoices,localResult,exportCsv};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLegislativeData=api;
})(typeof window==='undefined'?{}:window);
