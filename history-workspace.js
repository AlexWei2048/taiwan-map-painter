(function(root){
 'use strict';
  // Apply publication wording at CSV serialization time only; archive data and IDs remain unchanged.
  const csvSimplify=root.OpenCC?.Converter?root.OpenCC.Converter({from:'t',to:'cn'}):text=>String(text);
  const protectedHistoricalNames=new Set(['魏耀乾','李乾龙','陈民乾','米甘幹．理佛克']);
  const exportedWording=value=>{const raw=String(value??'');const text=protectedHistoricalNames.has(raw)?raw:csvSimplify(raw);return (typeof module!=='undefined'&&module.exports?require('./news-wording.js'):root.XinhuaWording)?.normalize(text)||text};
  const csvPercent=value=>{if(value===null||value===undefined||String(value).trim()==='')return '';const number=Number(String(value).trim().replace(/%$/,''));return Number.isFinite(number)?(Math.round((number+1e-9)*100)/100).toFixed(2)+'%':''};
  const csvCell=value=>{let text=exportedWording(value);if(/^[=+@\t\r-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};
 const OFFICES=new Set(['mayor','council','township','president','legislative']);
 const PRESIDENT_YEARS=[1996,2000,2004,2008,2012,2016,2020,2024];
 const Local=typeof module!=='undefined'&&module.exports?require('./history-local.js'):null;
 const displayYear=(year,office,separator)=> (root.HistoryLocal||Local)?.yearLabel(year,office,separator)||String(year);
 const yearsForOffice=office=>office==='president'?PRESIDENT_YEARS:office==='legislative'?(root.HistoryLegislative?.YEARS||[1992,1995,1998,2001,2004,2008,2012,2016,2020,2024]):(root.HistoryLocal||Local)?.years(office,root.HISTORY_2026_RESULTS_AVAILABLE===true)||[2022];
 const Core=typeof module!=='undefined'&&module.exports?require('./history-core.js'):root.HistoryCore;
 const VIEWS=new Set(['map','candidates','overview','trends']);
 const ELECTORATES=new Set(['all','regional','plains','mountain','indigenous']);
 const METRICS={mayor:new Set(['party','share','votes']),president:new Set(['party','share','votes']),legislative:new Set(['party','seats','share','votes']),council:new Set(['party','seats','share','votes']),township:new Set(['party','share','votes'])};
 const labels={regional:'区域议员',plains:'平地少数民族议员',mountain:'山地少数民族议员',indigenous:'历史合并选区（未分平地／山地）'};
 const legislativeBallotLabel=(year,electorate)=>{
  const key=String(electorate||'').replace(/^legislative:\d{4}:/,'');
  return root.HistoryLegislative?.ballots(Number(year)).find(item=>item.value===key)?.label||
   ({regional:'区域民代',plains:'平地少数民族民代',mountain:'山地少数民族民代',party:'不分区民代'}[key]||'立法机构民代');
 };
 const readableElectionName=(value,year=2024)=>{
  const raw=String(value||''),match=/^legislative:(\d{4}):(regional|plains|mountain|party)$/.exec(raw);
  return match?match[1]+'年立法机构民代选举 · '+legislativeBallotLabel(Number(match[1]),match[2]):raw;
 };
 const rate=(valid,cast,invalid)=>Number.isFinite(valid)&&Number.isFinite(cast)&&cast>0?valid/cast*100:Number.isFinite(valid)&&Number.isFinite(invalid)&&valid+invalid>0?valid/(valid+invalid)*100:null;
 const levelOptions=(office,year=2024,electorate='regional')=>office==='legislative'?(root.HistoryLegislative?.levels(year,electorate)||[['district','选举区']]):office==='mayor'||office==='president'?[['county','县市'],['town','乡镇市区']]:office==='council'?[['district','选举区']]:[['town','乡镇市区']];
 const electorateOptions=(office,year=2024)=>office==='legislative'?(root.HistoryLegislative?.ballots(year)||[]).map(item=>[item.value,item.label]):office==='council'?[['all','全部类型（分别统计）'],['regional','区域议员'],['plains','平地少数民族议员'],['mountain','山地少数民族议员']]:[['regional','区域选举']];
 function normalizeSelection(input={},years=null){
  const office=OFFICES.has(input.office)?input.office:'mayor';
  const available=(years||yearsForOffice(office)).map(Number).filter(Number.isFinite);
  const requested=(root.HistoryLocal||Local).cycleYear(Number(input.year),office);
  const year=available.includes(requested)?requested:(office==='president'||office==='legislative'?2024:2022);
  const requestedElectorate=['all','regional','plains','mountain','party'].includes(input.electorate)?input.electorate:office==='legislative'?'all':'regional';
  const allowedLevels=levelOptions(office,year,requestedElectorate).map(item=>item[0]);
  const defaultLevel=allowedLevels[0];
  const level=allowedLevels.includes(input.level)?input.level:defaultLevel;
  const electorate=office==='legislative'?requestedElectorate:office==='council'&&ELECTORATES.has(input.electorate)?input.electorate:'regional';
  const requestedMetric=input.metric==='vote'?'share':input.metric;
  const metric=METRICS[office].has(requestedMetric)?requestedMetric:'party';
  const view=VIEWS.has(input.view)?input.view:'map';
  return{year,office,electorate,county:String(input.county||''),level,metric,candidate:String(input.candidate||''),party:String(input.party||''),view};
 }
 function turnoutCards(overview={},selection={}){
  const groups=Array.isArray(overview.turnoutGroups)?overview.turnoutGroups:[];
  const visible=groups;
  return visible.map(group=>({
   electorate:group.electorate,
   title:selection.office==='legislative'?legislativeBallotLabel(selection.year,group.electorate):
    selection.office==='council'?(labels[group.electorate]||'其他议员'):
    selection.office==='township'?(group.electorate==='mountain'?'山地少数民族区长':group.electorate==='plains'?'平地少数民族乡镇市长':'区域乡镇市长'):'区域选举',
   registeredVoters:group.registeredVoters??null,
   ballotsCast:group.ballotsCast??null,
   validVotes:group.validVotes??null,
   invalidVotes:group.invalidVotes??null,
   turnout:group.turnout??null,
   validRate:rate(group.validVotes,group.ballotsCast,group.invalidVotes)
  }));
 }

 // Source-backed geographic scope. Town-level mayor/presidential files have
 // candidate vote totals only; do not manufacture registration or turnout.
 function overviewRegionChoices(indexed,selection={}){
  if(selection.office==='legislative')return root.HistoryLegislativeData?.regionChoices(indexed,selection)||{counties:[],areas:[]};
  const year=Number(selection.year||2022),office=selection.office||'mayor';
  if(!indexed||Number(indexed.snapshot?.year)!==year)return{counties:[],areas:[]};
  const source=Core.filter(indexed,{year,office,electorate:'all'});
  const counties=[...new Set((office==='township'?
   [...source.contests,...Core.filter(indexed,{year,office:'mayor',electorate:'all'}).contests]:source.contests)
   .map(c=>c.county_name))].sort((a,b)=>
   Core.compareResultRows({county_name:a},{county_name:b},office));
  const county=selection.county||'';
  let areas=[];
  if(office==='council'||office==='township'){
   areas=source.contests.filter(c=>c.county_name===county).sort((a,b)=>Core.compareResultRows(a,b,office))
    .map(c=>({value:c.contest_id,label:office==='council'?
     [c.district_name,labels[c.electorate]||'区域议员'].filter(Boolean).join(' · '):
     [c.district_name,c.electorate==='mountain'?'山地少数民族区长':''].filter(Boolean).join(' · ')}));
  }else{
   const snapshot=indexed.snapshot;
   const towns=new Set((snapshot.rows||[]).filter(row=>
    row.level==='town'&&row.county===county&&row.town&&
    (row.type===office||(office==='mayor'&&row.type==='council')))
    .map(row=>row.town));
   // Official candidate sources use traditional spelling; normalize
   // mayoral ward choices through the canonical bilingual name registry.
   if(office==='mayor')for(const alias of snapshot.mayorTownNames||[]){
    if(alias.county===county)towns.add(alias.town);
   }
   // The map geometry supplies all valid township/ward names, including
   // city districts without township-head elections. It is used only for
   // geographic choice labels, never to infer unrecorded votes.
   for(const item of selection.towns||[]){
    if(item.county===county&&item.name)towns.add(item.name);
   }
   // Some 2022 mayor source files provide only county-wide totals. Preserve
   // township choices from the same election's official township contests;
   // do not attribute those votes to the mayoral race.
   if(office==='mayor')for(const contest of snapshot.contests||[]){
    if(contest.election_id===year+'-township'&&contest.county_name===county&&contest.district_name)
     towns.add(contest.district_name);
   }
   areas=[...towns].sort((a,b)=>a.localeCompare(b,'zh',{numeric:true}))
    .map(town=>({value:town,label:town}));
  }
  return{counties,areas};
 }
 function overviewRegionData(indexed,selection={}){
  if(selection.office==='legislative')return root.HistoryLegislativeData?.localResult(indexed,selection)||null;
  if(!indexed||Number(indexed.snapshot?.year)!==Number(selection.year))return null;
  const year=Number(selection.year||2022),office=selection.office||'mayor';
  const scope=['all','county','district','town'].includes(selection.scope)?selection.scope:'all';
  const county=String(selection.county||''),area=String(selection.area||'');
  const all=Core.filter(indexed,{year,office,electorate:'all'});
  const countyContest=all.contests.find(c=>c.county_name===county)||
   (office==='township'?[...indexed.contestsById.values()].find(c=>
    c.county_name===county&&c.election_id===year+'-mayor'):null);
  let query={year,office,electorate:'all'};
  if(scope!=='all'){
   if(!countyContest)return null;
   query.countyId=countyContest.county_id;
  }
  let noElection=false;
  if(scope==='district'||scope==='town'&&office==='township'){
   if(!all.contests.some(c=>c.contest_id===area&&c.county_name===county)){
    if(office!=='township'||area)return null;
    // A county without a township-head election is a real geographic choice,
    // but it must never inherit results from the previous map selection.
    noElection=true;query.contestId='__no_local_election__';
   }else query.contestId=area;
  }
  const result=Core.filter(indexed,query);
  let overview=Core.overview(result),townVotesVerified=false,tallyBasis='';
  if(year===1994&&office==='council'&&scope==='county'){
   const profile=(indexed.snapshot.verifiedCouncilCountyProfiles||[]).find(p=>
    p.county===county||p.county===countyContest?.county_name_official);
   if(profile&&result.contests.length===8&&overview.validVotes===profile.valid_votes&&
      result.candidacies.length===profile.candidate_count&&
      result.candidacies.filter(c=>c.elected_official).length===profile.elected_count&&
      Number.isSafeInteger(profile.registered_voters)&&
      profile.ballots_cast<=profile.registered_voters&&
      profile.ballots_cast===profile.valid_votes+profile.invalid_votes){
    const group={electorate:'regional',registeredVoters:profile.registered_voters,
     ballotsCast:profile.ballots_cast,validVotes:profile.valid_votes,
     invalidVotes:profile.invalid_votes,
     turnout:profile.ballots_cast/profile.registered_voters*100};
    overview={...overview,registeredVoters:group.registeredVoters,
     ballotsCast:group.ballotsCast,validVotes:group.validVotes,
     invalidVotes:group.invalidVotes,turnout:group.turnout,
     turnoutGroups:[group],turnoutSource:profile.source_url};
   }
  }
  if(scope==='town'&&(office==='mayor'||office==='president')){
   // TaiwanVotes preserves traditional source names in rows, but the map
   // uses simplified locality labels. Join through the source-verified
   // bilingual ward keys; never compare traditional and simplified labels raw.
   const sourceWard=office==='mayor'?
    (indexed.snapshot.mayorTownNames||[]).find(item=>item.county===county&&item.town===area):null;
   const rows=(indexed.snapshot.rows||[]).filter(row=>
    row.type===office&&row.level==='town'&&
    (sourceWard?
     row.county===sourceWard.county_official&&row.town===sourceWard.town_official:
     csvSimplify(row.county)===county&&csvSimplify(row.town)===area));
   const expected=new Set(result.candidacies.map(c=>String(c.ballot_number||'')));
   const present=new Set(rows.map(row=>String(row.number||'')));
   townVotesVerified=expected.size>0&&rows.length===expected.size&&
    present.size===expected.size&&[...expected].every(key=>present.has(key))&&
    rows.every(row=>Number.isSafeInteger(row.votes)&&row.votes>=0);
   const candidateVotes=townVotesVerified?rows.reduce((sum,row)=>sum+row.votes,0):null;
   // Match same-version ballot profiles to candidate sums, including the
   // independently verified 2018 Taipei district recount totals.
   const profile=['mayor','president'].includes(office)&&townVotesVerified?
    (indexed.snapshot.townProfiles||[]).find(p=>p.office===office&&p.county===county&&p.town===area):null;
   const recountProfile=year===2018&&office==='mayor'&&county==='台北市'&&
    profile?.tally_basis==='certified_recount'&&rows.every(row=>row.tally_basis==='certified_recount');
   const verifiedProfile=profile&&Number.isSafeInteger(profile.registered_voters)&&
    Number.isSafeInteger(profile.ballots_cast)&&Number.isSafeInteger(profile.invalid_votes)&&
    Number.isSafeInteger(profile.valid_votes)&&profile.valid_votes===candidateVotes&&
    profile.valid_votes+profile.invalid_votes===profile.ballots_cast&&
    profile.ballots_cast<=profile.registered_voters?profile:null;
   const registeredVoters=verifiedProfile?.registered_voters??null;
   const ballotsCast=verifiedProfile?.ballots_cast??null;
   const invalidVotes=verifiedProfile?.invalid_votes??null;
   const validVotes=verifiedProfile?.valid_votes??candidateVotes;
   if(recountProfile&&verifiedProfile)tallyBasis='certified_recount';
   const turnout=registeredVoters&&ballotsCast!==null?ballotsCast/registeredVoters*100:null;
   // Countywide winner status is unaffected by local vote totals or turnout.
   const group={electorate:'regional',registeredVoters,ballotsCast,
    validVotes,invalidVotes,turnout};
   overview={...overview,registeredVoters,ballotsCast,validVotes,
    invalidVotes,turnout,turnoutGroups:[group]};
  }
  return{result,overview,scope,county,area,townVotesVerified,noElection,tallyBasis};
 }
 function featurePresentation({office='mayor',level='county',metric='party',region=null,partyColor=()=> '#edf1e9'}={}){
  if(office==='council'){
   const badgeItems=region?.partyCounts instanceof Map?[...region.partyCounts].map(([party,seats])=>({party,seats})).sort((a,b)=>b.seats-a.seats||a.party.localeCompare(b.party,'zh')):[];
   const composition=badgeItems.map(item=>item.party+' '+item.seats+'席').join('、');
   return{fill:'#f0f3ed',badgeItems,tooltip:composition||'暂无当选席次资料',ariaLabel:composition||'暂无当选席次资料'};
  }
  const top=region?.top;
  if(!top)return{fill:'#edf1e9',badgeItems:[],tooltip:'暂无该层级数据',ariaLabel:'暂无该层级数据'};
  const leading=level==='town'||office==='president';
  const description=top.name+' · '+top.party+' · '+(leading?'本区最高票':'当选')+' · '+Number(top.votes||0).toLocaleString('zh-CN')+'票'+(Number.isFinite(region.share)?' · '+region.share.toFixed(2)+'%':'');
  return{fill:metric==='party'?partyColor(top.party):region.fill||partyColor(top.party),badgeItems:[],tooltip:description,ariaLabel:description};
 }
 function badgeFallback({districtNumber='',partyCount=0,inside=true}={}){
  if(inside&&partyCount<=4)return{mode:'badges',label:String(districtNumber),leader:false,keyboardLabel:'第'+districtNumber+'选举区，'+partyCount+'个政党当选'};
  return{mode:'indexed',label:String(districtNumber),leader:true,keyboardLabel:'第'+districtNumber+'选举区，'+partyCount+'个政党当选'};
 }
 function candidateRows(rows=[],filters={}){
  const search=String(filters.search||'').trim().toLocaleLowerCase('zh-CN'),party=String(filters.party||'');
  return rows.filter(row=>(!party||row.party_name===party)&&(!search||[row.candidate_name,row.party_name,row.contest_name].some(value=>String(value||'').toLocaleLowerCase('zh-CN').includes(search))))
   .sort((a,b)=>Core.compareResultRows(a,b,filters.office||'council'));
 }
 function overviewCards(overview={}){
  const value=n=>Number.isFinite(n)?Number(n).toLocaleString('zh-CN'):'暂无资料';
  const percent=n=>Number.isFinite(n)?n.toFixed(2)+'%':'暂无资料';
  // The key metrics show the sum of election records across identities.
  // Separate charts keep their own denominators; this sum is not a distinct-voter count.
  return[
   {label:'选举人数',value:value(overview.registeredVoters),group:'participation',detail:'登记选民（涉及不同类别时为各类别加总）'},
   {label:'投票人数',value:value(overview.ballotsCast),group:'participation',detail:'投票记录数（涉及不同类别时为各类别加总）'},
   {label:'投票率',value:percent(overview.turnout),group:'participation',detail:'各类别加总投票数／各类别加总选举人数'},
   {label:'有效票',value:value(overview.validVotes),group:'ballots',detail:'各类别候选人有效票合计'},
   {label:'无效票',value:value(overview.invalidVotes),group:'ballots',detail:'各类别无效票合计'},
   {label:'有效率',value:percent(rate(overview.validVotes,overview.ballotsCast,overview.invalidVotes)),group:'ballots',detail:'各类别合计有效票／合计投票人数'},
   {label:'候选人数',value:value(overview.candidateCount),group:'people',detail:'本范围候选人'},
   {label:'当选人数',value:value(overview.electedCount),group:'people',detail:'当选人数'}
  ];
 }
 const summaryFormat=n=>Number.isFinite(n)?Number(n).toLocaleString('zh-CN'):'暂无资料';
 function portion(part,total){
  if(!Number.isFinite(part)||!Number.isFinite(total)||total<=0||part<0||part>total)return null;
  return Math.min(100,Math.max(0,part/total*100));
 }
 function overviewCharts(overview={},selection={}){
  const groups=turnoutCards(overview,selection);
  const separated=groups.length>1;
  const breakdown=(title,part,other,total,firstLabel,secondLabel)=>{
   const valid=Number.isFinite(part)&&Number.isFinite(other)&&Number.isFinite(total)&&
    total>0&&part>=0&&other>=0&&part+other===total;
   return{title,firstLabel,secondLabel,first:valid?part:null,second:valid?other:null,
    percent:valid?portion(part,total):null};
  };
  const result=[];
  if(separated){
   for(const group of groups){
    result.push({type:'electorate',title:group.title,eyebrow:'分组选举统计',
     subtitle:'选举人数 '+summaryFormat(group.registeredVoters),
     bars:[
      breakdown('投票率',group.ballotsCast,
       Number.isFinite(group.registeredVoters)&&Number.isFinite(group.ballotsCast)?group.registeredVoters-group.ballotsCast:null,
       group.registeredVoters,'已投票','未投票'),
      breakdown('有效率',group.validVotes,group.invalidVotes,group.ballotsCast,'有效票','无效票')
     ]});
   }
  }else{
   const group=groups[0]||overview;
   result.push({type:'participation',title:'投票参与',eyebrow:'投票情况',
    subtitle:'选举人数 '+summaryFormat(group.registeredVoters),
    bars:[breakdown('投票率',group.ballotsCast,
     Number.isFinite(group.registeredVoters)&&Number.isFinite(group.ballotsCast)?group.registeredVoters-group.ballotsCast:null,
     group.registeredVoters,'已投票','未投票')]});
   result.push({type:'ballots',title:'选票有效情况',eyebrow:'选票结构',
    subtitle:'投票人数 '+summaryFormat(group.ballotsCast),
    bars:[breakdown('有效率',group.validVotes,group.invalidVotes,group.ballotsCast,'有效票','无效票')]});
  }
  const candidates=Number.isFinite(overview.candidateCount)?overview.candidateCount:null;
  const elected=Number.isFinite(overview.electedCount)?overview.electedCount:null;
  result.push({type:'candidates',title:'候选与当选对比',eyebrow:'参选结果',
   candidates,elected,percent:portion(elected,candidates)});
  return result;
 }
 function drilldownSelection(selection={},county){
  if(selection.office!=='mayor'||!county)return null;
  return{...selection,county,level:'town'};
 }
 function exportStem(selection={}){
  const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人',legislative:'立法机构民代'},metrics={party:selection.office==='legislative'?((selection.electorate||'regional')==='regional'?'当选席次':'领先政党'):selection.office==='council'?'当选席次':selection.office==='president'||selection.level==='town'?(selection.level==='town'?'各乡镇市区最高票候选人':'各县市最高票候选人'):'当选政党',seats:'指定政党席次',vote:'得票率',share:'得票率',votes:'得票数'};
  return[displayYear(selection.year||2022,selection.office,'_'),offices[selection.office]||'历史选举',selection.office==='president'?(selection.level==='town'?'乡镇市区':'县市'):null,selection.county||'全台',metrics[selection.metric]||selection.metric||'结果'].filter(Boolean).join('-').replace(/[\\/:*?"<>|]/g,'_');
 }
 function historyCsv(result={contests:[],candidacies:[]},selection={}){
  const presidential=selection.office==='president',council=['council','legislative'].includes(selection.office);
  const extra=presidential?['副领导人候选人','正职性别','副职性别','选举时现任']:[];
  const headers=['年份','选举类别','县市','选区',...(council?['选区类型']:[]),presidential?'正领导人候选人':'候选人',...extra,'政党','号次','得票数','得票率','当选'];
  const contests=new Map((result.contests||[]).map(item=>[item.contest_id,item]));
  const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人',legislative:'立法机构民代'};
  const identities={regional:'区域',plains:'平地少数民族',mountain:'山地少数民族',indigenous:'历史合并选区'};
  const ordered=[...(result.candidacies||[])].sort((a,b)=>{
   const ca=contests.get(a.contest_id)||{},cb=contests.get(b.contest_id)||{};
   return Core.compareResultRows({...a,county_name:ca.county_name,district_name:ca.district_name,electorate:ca.electorate},
    {...b,county_name:cb.county_name,district_name:cb.district_name,electorate:cb.electorate},selection.office);
  });
  const rows=[headers];
  for(const item of ordered){
   const contest=contests.get(item.contest_id)||{};
   const county=contest.county_name||contest.county_name_official||'';
   const district=contest.district_name||contest.district_name_official||'';
   const actualYear=result.index?.snapshot?.cycleYears?contest.election_date?.slice(0,4):null;
   rows.push([actualYear||selection.year||2022,offices[selection.office]||selection.office,county,district===county?'':district,
    ...(council?[identities[contest.electorate]||'区域']:[]),item.candidate_name||item.candidate_name_official||'',
    ...(presidential?[item.deputy_name||'',item.gender||'',item.deputy_gender||'',item.incumbent_at_election===true?'现任':'']:[]),
    item.party_name||item.party_name_official||'',item.ballot_number,item.votes,csvPercent(item.vote_share),item.elected_official?'是':'']);
  }
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
 }
 function presidentialTownCsv(snapshot={},selection={}){
  const rows=(snapshot.rows||[]).filter(r=>r.level==='town'&&r.type==='president'&&(!selection.county||r.county===selection.county));
  const totals=new Map();
  for(const r of rows){const k=r.county+'|'+r.town;totals.set(k,(totals.get(k)||0)+r.votes)}
  const output=[['年份','选举类别','县市','乡镇市区','正领导人候选人','副领导人候选人','正职性别','副职性别','选举时现任','政党','号次','得票数','得票率','当选']];
  rows.sort((a,b)=>a.county.localeCompare(b.county,'zh')||a.town.localeCompare(b.town,'zh')||b.votes-a.votes);
  for(const r of rows){
   const total=totals.get(r.county+'|'+r.town)||0;
   output.push([selection.year,'台湾地区领导人',r.county,r.town,r.name,r.deputy_name||'',r.gender||'',r.deputy_gender||'',
    r.incumbent===true?'现任':'',r.party,r.number,r.votes,total?csvPercent(r.votes/total*100):'',r.elected?'是':'']);
  }
  return '\uFEFF'+output.map(row=>row.map(csvCell).join(',')).join('\r\n');
 }
 function mayorTownCsv(snapshot,selection={}){
  const rows=snapshot.rows.filter(row=>row.type==='mayor'&&row.level==='town'&&
   (!selection.county||row.county===selection.county)&&(!selection.area||row.town===selection.area));
  const totals=new Map();
  for(const row of rows){
   const key=row.county+'|'+row.town;
   totals.set(key,(totals.get(key)||0)+row.votes);
  }
  rows.sort((a,b)=>Core.compareResultRows(a,b,'mayor'));
  const output=[['年份','选举类别','县市','乡镇市区','候选人','政党','号次','得票数','得票率','县市当选','计票版本']];
  for(const row of rows){
   const total=totals.get(row.county+'|'+row.town);
   output.push([selection.year,'县市长',row.county,row.town,row.name,row.party,row.number,row.votes,
    total?csvPercent(row.votes/total*100):'',row.elected?'是':'',row.tally_basis==='original_opening'?'投票日原始开票':row.tally_basis==='certified_recount'?'重计票结果':'选委会公布']);
  }
  return '\uFEFF'+output.map(row=>row.map(csvCell).join(',')).join('\r\n');
 }
 const api={normalizeSelection,yearsForOffice,levelOptions,electorateOptions,legislativeBallotLabel,readableElectionName,turnoutCards,overviewRegionChoices,overviewRegionData,featurePresentation,badgeFallback,candidateRows,overviewCards,overviewCharts,drilldownSelection,exportStem,historyCsv,presidentialTownCsv,mayorTownCsv};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return}

 const doc=root.document;
 if(!doc){root.HistoryWorkspace=api;return}
 const el=id=>doc.getElementById(id);
 let state=normalizeSelection();
 let active=false;
 let indexed=null,currentResult=null,currentOverview=null,overviewContestId='';
 let overviewScope='all',overviewCounty='',overviewArea='',overviewInitialized=false,overviewContext='',overviewMapCounty='';
 let overviewSidebarKey='',overviewSyncingFromStatistics=false;

 function overviewContextKey(){
  return state.office+'|'+state.year+
   (['legislative','council'].includes(state.office)?'|'+state.electorate:'');
 }
 // The left-hand controls are the primary selection. The overview may also
 // drive the map; guard that reverse flow so its own district/town choice is
 // not wiped by the ensuing sidebar/map render.
 function sidebarScopeKey(){
  return[overviewContextKey(),state.county||'',
   el('historyScale')?.value||'',el('historyFocus')?.value||''].join('|');
 }
 function sidebarOverviewTarget(){
  const county=state.county||'',scale=el('historyScale')?.value||'',
   focus=el('historyFocus')?.value||'';
  if(!county||scale==='national')return{scope:'all',county:'',area:''};
  const level=state.office==='council'||state.office==='legislative'&&state.electorate==='regional'&&scale!=='town'?
   'district':'town';
  // A map showing all wards/districts of one county represents the county
  // aggregate. Choose an individual constituency only when the sidebar
  // explicitly selected its focus; never silently pick the first one.
  if(state.office==='legislative'&&focus&&
     (scale==='district'&&level==='district'||scale==='town'&&level==='town')){
   const choices=overviewRegionChoices(indexed,{
    year:state.year,office:state.office,electorate:state.electorate,county,scope:level}).areas;
   let chosen=null;
   if(level==='district'){
    const number=Core.districtNumber(focus);
    chosen=choices.find(item=>Core.districtNumber(item.label)===number);
   }else chosen=choices.find(item=>item.value===focus||item.label===focus);
   if(chosen)return{scope:level,county,area:chosen.value};
  }
  return{scope:'county',county,area:''};
 }
 function chooseOverviewOnMapChange(){
  const key=overviewContextKey(),sidebarKey=sidebarScopeKey();
  if(overviewSyncingFromStatistics){
   overviewSidebarKey=sidebarKey;
   return;
  }
  if(overviewInitialized&&overviewContext===key&&overviewSidebarKey===sidebarKey)return;
  // During an asynchronous year/office change, avoid setting the default
  // selection from the previous election's candidate and county index.
  if(indexed&&Number(indexed.snapshot?.year)!==state.year)return;
  const target=sidebarOverviewTarget();
  overviewInitialized=true;overviewContext=key;overviewSidebarKey=sidebarKey;
  overviewMapCounty=state.county;
  overviewCounty=target.county;overviewScope=target.scope;
  overviewArea=target.area;overviewContestId='';
 }
 function syncOverviewControls(){
  const legislative=state.office==='legislative';
  const level=state.office==='council'||legislative&&state.electorate==='regional'&&overviewScope!=='town'?'district':'town';
  const available=legislative?(Number(state.year)===1992&&['plains','mountain'].includes(state.electorate)?
    ['all']:['all',...(root.HistoryLegislative?.levels(state.year,state.electorate)||[]).map(([id])=>id)]):['all','county',level];
  if(!available.includes(overviewScope))overviewScope='all';
  const {counties}=overviewRegionChoices(indexed,{year:state.year,office:state.office,electorate:state.electorate});
  if(overviewScope!=='all'&&!counties.includes(overviewCounty))
   overviewCounty=counties.includes(state.county)?state.county:counties[0]||'';
  const towns=root.History2022View?.allTowns?.()||[];
  const choices=overviewRegionChoices(indexed,{year:state.year,office:state.office,electorate:state.electorate,county:overviewCounty,towns,scope:overviewScope});
  const scopeSelect=el('historyOverviewScope');
  if(scopeSelect){
   const opts=[['all','全部地区（含金门、马祖）'],['county','县市'],['district',legislative?'选举区':'议员选区'],['town','乡镇市区']]
    .filter(([value])=>available.includes(value));
   scopeSelect.replaceChildren(...opts.map(([value,text])=>new Option(text,value)));
   scopeSelect.value=overviewScope;
  }
  const countySelect=el('historyOverviewCounty');
  if(countySelect){
   countySelect.replaceChildren(...counties.map(county=>new Option(county,county)));
   countySelect.value=overviewCounty;
  }
  const countyBox=el('historyOverviewCountyBox');
  if(countyBox)countyBox.hidden=overviewScope==='all';
  const areaBox=el('historyOverviewContestBox'),areaSelect=el('historyOverviewContest');
  if(areaBox){
   areaBox.hidden=overviewScope!==level||!choices.areas.length;
   const firstText=areaBox.firstChild;
   if(firstText?.nodeType===3)firstText.textContent=level==='district'?(legislative?'选举区':'议员选区'):'乡镇市区';
  }
  if(!choices.areas.some(area=>area.value===overviewArea))
   overviewArea=choices.areas[0]?.value||'';
  overviewContestId=overviewScope===level&&['council','township'].includes(state.office)?
   overviewArea:'';
  if(areaSelect){
   areaSelect.replaceChildren(...choices.areas.map(area=>
    new Option([overviewCounty,area.label].filter(Boolean).join(' · '),area.value)));
   areaSelect.value=overviewArea;
  }
 }
 function syncOverviewMap(){
  if(state.view!=='overview')return false;
  syncOverviewControls();
  overviewInitialized=true;overviewContext=overviewContextKey();
  overviewMapCounty=overviewScope==='all'?'':overviewCounty;
  const contest=indexed?.contestsById?.get(overviewArea);
  const districtName=contest?.district_name||
   (overviewScope==='district'&&state.office==='legislative'?
    overviewRegionChoices(indexed,{year:state.year,office:state.office,electorate:state.electorate,
     county:overviewCounty}).areas.find(item=>item.value===overviewArea)?.label:'')||'';
  overviewSyncingFromStatistics=true;
  try{
   return root.History2022View?.syncOverviewMap?.({
    scope:overviewScope,county:overviewCounty,area:overviewArea,districtName})===true;
  }finally{
   overviewSyncingFromStatistics=false;
   overviewSidebarKey=sidebarScopeKey();
  }
 }
 function changeOverviewMap(){
  if(!syncOverviewMap())render();
 }
 function renderOverviewScope(scoped){
  const title=el('historyOverviewTitle'),description=el('historyOverviewDescription');
  if(!title)return;
  const name=state.office==='legislative'?(root.HistoryLegislative?.ballots(state.year).find(x=>x.value===state.electorate)?.label||'立法机构民代'):{mayor:'县市长',council:'议员',township:'乡镇市区长',president:'台湾地区领导人'}[state.office]||'选举';
  const all=overviewScope==='all',county=overviewCounty;
  // overviewArea is often a stable contest id, never human-facing text.
  const geographicArea=overviewArea&&indexed?.contestsById?.get(overviewArea)?.district_name||
   (overviewScope==='town'?overviewArea:'');
  const district=['district','town'].includes(overviewScope)?
   scoped?.result?.contests?.[0]?.district_name||geographicArea||'':'';
  const identity=scoped?.result?.contests?.length===1&&state.office==='council'?
   labels[scoped.result.contests[0].electorate]||'议员':name;
  title.textContent=[displayYear(state.year,state.office)+'年',all?'全部地区（含金门、马祖）':county,district,
   identity].filter(Boolean).join(' · ')+'选举概况';
  if(description){
   const fullArea=all?'全部地区（含金门、马祖）':
    [county,district].filter(Boolean).join(' · ');
   const groups=scoped?.overview?.turnoutGroups||[];
   description.textContent='当前统计范围：'+fullArea+
    (scoped?.noElection?' · 该县市没有举行此类乡镇市区长选举':'')+
    (groups.length>1?' · 关键指标为各选举类别合计，图表保留分类统计':'')+
    (scoped?.overview?.turnoutSource?' · 投票统计来自已核验的选举概况':'')+
    (scoped?.tallyBasis==='certified_recount'?' · 本区投票统计和候选人分区得票均采用重计后数据。':
    overviewScope==='town'&&['president','mayor'].includes(state.office)?
     (Number.isInteger(scoped?.overview?.registeredVoters)?
      ' · 本区投票人数与选举人数来自中选会原始选举统计':
      ' · 该层级没有完整且可核实的投票统计时保留缺值，不推算选举人数和投票人数'):'');
  }
 }
 function openContestOverview(contestId){
  if(!indexed||!Core)return false;
  const all=Core.filter(indexed,{year:state.year,office:state.office,electorate:'all'});
  const contest=all.contests.find(c=>c.contest_id===contestId);
  if(!contest)return false;
  overviewInitialized=true;overviewContext=overviewContextKey();
  overviewCounty=contest.county_name;overviewMapCounty=state.county;
  overviewScope=state.office==='council'||state.office==='legislative'&&state.electorate==='regional'?'district':
   state.office==='township'?'town':'county';
  overviewArea=overviewScope==='county'?'':contestId;
  overviewContestId=overviewScope==='county'?'':contestId;
  state=normalizeSelection({...readSelection(),view:'overview'});
  changeOverviewMap();return true;
 }
 function openFeatureOverview(feature){
  if(!feature||!indexed)return false;
  const county=feature.county||feature.name;
  const level=state.office==='council'||state.office==='legislative'&&state.electorate==='regional'&&state.level!=='town'?'district':'town';
  const choices=overviewRegionChoices(indexed,{year:state.year,office:state.office,electorate:state.electorate,county,
   towns:root.History2022View?.allTowns?.()||[],scope:level});
  if(!choices.counties.includes(county))return false;
  overviewInitialized=true;overviewContext=overviewContextKey();
  overviewCounty=county;overviewMapCounty=state.county;
  overviewScope='county';overviewArea='';overviewContestId='';
  if(feature.name!==county){
   const wanted=level==='district'?
    choices.areas.find(area=>area.value===contestForFeature(feature)):
    state.office==='township'?
     choices.areas.find(area=>area.value===contestForFeature(feature)):
     choices.areas.find(area=>area.value===feature.name);
   if(wanted){overviewScope=level;overviewArea=wanted.value}
  }else if(state.office==='council'){
   const wanted=choices.areas.find(area=>area.value===contestForFeature(feature));
   if(wanted){overviewScope='district';overviewArea=wanted.value}
  }
  state=normalizeSelection({...readSelection(),view:'overview'});
  changeOverviewMap();return true;
 }
 function contestForFeature(feature){
  if(!feature)return null;
  const base=resultForSelection();if(!base?.contests?.length)return null;
  const county=feature.county||feature.name;
  const office=state.office;
  return base.contests.find(contest=>{
   if(contest.county_name!==county)return false;
   if(office==='council'||office==='legislative')return Core.identity(contest.electorate)===Core.identity(feature.electorate||state.electorate)&&
    Core.districtNumber(contest.district_name)===Core.districtNumber(feature.name||feature.number);
   if(office==='township')return contest.district_name===feature.name;
   return feature.name===county; // Township presidential/mayor views have no township-specific turnout contest.
  })?.contest_id||null;
 }
 function refreshYearOptions(){
  const select=el('historyYear');if(!select)return;
  const office=el('historyOffice')?.value||state.office,years=yearsForOffice(office);
  const current=root.HistoryLocal.cycleYear(Number(select.value),office),preferred=years.includes(current)?current:(office==='president'||office==='legislative'?2024:2022);
  if(select.options.length!==years.length||years.some((y,i)=>Number(select.options[i]?.value)!==y)){
   select.replaceChildren(...years.map(y=>new Option(displayYear(y,office),String(y))));
  }
  for(const option of select.options){
   const label=displayYear(Number(option.value),office);
   if(option.textContent!==label)option.textContent=label;
  }
  select.value=String(preferred);
 }
 function readSelection(){
  refreshYearOptions();
  const scale=el('historyScale')?.value;
  const office=el('historyOffice')?.value||state.office;
  return normalizeSelection({
   ...state,year:el('historyYear')?.value,office,
   electorate:el('historyElectorate')?.value,county:el('historyCounty')?.value,
   level:office==='legislative'?(scale||'county'):office==='mayor'||office==='president'?(scale==='town'?'town':'county'):office==='council'?'district':'town',
   metric:el('historyMetric')?.value
  });
 }
 function emit(){
  root.dispatchEvent(new CustomEvent('historyselectionchange',{detail:{...state}}));
 }
 function resultForSelection(){
  if(!indexed||!root.HistoryCore||Number(indexed.snapshot?.year)!==state.year||
     !indexed.snapshot?.elections?.some(e=>e.office===state.office))return null;
  const contests=[...indexed.contestsById.values()],countyId=state.county?contests.find(contest=>contest.county_name===state.county)?.county_id:'';
  if(state.office==='legislative')return root.HistoryLegislativeData?.localResult(indexed,{year:state.year,electorate:state.electorate,scope:state.county?'county':'all',county:state.county})?.result||null;
   return root.HistoryCore.filter(indexed,{year:state.year,office:state.office,electorate:state.electorate,countyId});
 }
 function renderOverviewCharts(){
  const rootNode=el('historyOverviewCharts');if(!rootNode)return;
  rootNode.replaceChildren();
  if(!currentOverview)return;
  const models=overviewCharts(currentOverview,{...state,electorate:'all'});
  rootNode.classList.toggle('history-overview-charts--grouped',models.some(model=>model.type==='electorate'));
  const fmt=n=>summaryFormat(n);
  const make=(tag,className,text)=>{
   const node=doc.createElement(tag);if(className)node.className=className;
   if(text!==undefined)node.textContent=text;
   return node;
  };
  function appendBar(container,bar){
   const block=make('div','history-chart-stat');
   block.dataset.kind=bar.title==='有效率'?'valid':'turnout';
   const heading=make('div','history-chart-stat-head');
   heading.append(make('span','history-chart-stat-label',bar.title),
    make('strong','history-chart-stat-value',bar.percent===null?'暂无资料':bar.percent.toFixed(2)+'%'));
   block.append(heading);
   if(bar.percent!==null){
    const track=make('div','history-chart-track');
    track.setAttribute('role','img');
    track.setAttribute('aria-label',bar.firstLabel+' '+fmt(bar.first)+'，'+bar.secondLabel+' '+fmt(bar.second));
    const a=make('span','history-chart-segment history-chart-segment--primary');
    const b=make('span','history-chart-segment history-chart-segment--secondary');
    a.style.width=bar.percent+'%';b.style.width=(100-bar.percent)+'%';
    track.append(a,b);block.append(track);
    const caption=make('div','history-chart-legend');
    for(const [label,value,type] of [[bar.firstLabel,bar.first,'primary'],[bar.secondLabel,bar.second,'secondary']]){
     const item=make('span','history-chart-legend-item'),dot=make('i','history-chart-dot history-chart-dot--'+type);
     dot.setAttribute('aria-hidden','true');
     item.append(dot,make('span','',label+' '+fmt(value)));caption.append(item);
    }
    block.append(caption);
   }else{
    block.append(make('p','history-chart-empty','当前范围缺少可核实的投票数据'));
   }
   container.append(block);
  }
  for(const model of models){
   const card=make('article','history-chart-card history-chart-card--'+model.type);
   const head=make('div','history-chart-heading');
   head.append(make('span','history-chart-eyebrow',model.eyebrow),
    make('h4','',model.title));
   card.append(head);
   if(model.type==='candidates'){
    const candidates=model.candidates,elected=model.elected;
    const known=Number.isFinite(candidates)&&candidates>0&&Number.isFinite(elected)&&elected>=0&&elected<=candidates;
    if(known){
     for(const [label,count,width,kind] of [['候选人数',candidates,100,'all'],['当选人数',elected,model.percent,'elected']]){
      const row=make('div','history-chart-compare');
      const labelRow=make('div','history-chart-compare-label');
      labelRow.append(make('span','',label),make('strong','',fmt(count)));
      const track=make('div','history-chart-compare-track'),fill=make('div','history-chart-compare-fill history-chart-compare-fill--'+kind);
      track.setAttribute('role','img');
      track.setAttribute('aria-label',label+' '+fmt(count));
      fill.style.width=width+'%';track.append(fill);row.append(labelRow,track);card.append(row);
     }
     card.append(make('p','history-chart-footnote','当选人数占候选人数 '+model.percent.toFixed(2)+'%'));
    }else card.append(make('p','history-chart-empty','暂无可用候选人统计'));
   }else{
    card.append(make('p','history-chart-subtitle',model.subtitle));
    for(const bar of model.bars)appendBar(card,bar);
   }
   rootNode.append(card);
  }
 }
 function renderTurnoutCards(){
  const rootNode=el('historyOverviewCards');if(!rootNode)return;
  rootNode.replaceChildren();
  if(!currentOverview){
   const note=doc.createElement('p');note.className='history-overview-placeholder';
   note.textContent='概况数据正在载入。';rootNode.append(note);
   el('historyOverviewCharts')?.replaceChildren();return;
  }
  for(const card of overviewCards(currentOverview)){
   const article=doc.createElement('article');article.className='history-overview-card';
   article.dataset.group=card.group;
   const label=doc.createElement('span'),strong=doc.createElement('strong'),detail=doc.createElement('small');
   label.textContent=card.label;strong.textContent=card.value;detail.textContent=card.detail;
   article.append(label,strong,detail);rootNode.append(article);
  }
  if(currentOverview.historicalOverall){
   const total=currentOverview.historicalOverall,fmt=n=>n.toLocaleString('zh-CN');
   for(const entry of [
    ['整届合计 · 选举人数',fmt(total.registeredVoters),'投票人数 '+fmt(total.ballotsCast)],
    ['整届合计 · 投票率',total.turnout.toFixed(2)+'%',
     '有效票 '+fmt(total.validVotes)+' · 无效票 '+fmt(total.invalidVotes)]
   ]){
    const article=doc.createElement('article');article.className='history-overview-card';
    article.dataset.group='whole-election';
    for(const [tag,text] of [['span',entry[0]],['strong',entry[1]],['small',entry[2]]]){
     const node=doc.createElement(tag);node.textContent=text;article.append(node);
    }
    rootNode.append(article);
   }
   const note=doc.createElement('p');note.className='history-overview-placeholder';
   note.textContent='整届合计含区域与少数民族选举，不代表当前票种的投票数据。';
   rootNode.append(note);
  }
  renderOverviewCharts();
  const note=el('historyOverviewNote');
  if(note)note.hidden=!(currentOverview.turnoutGroups?.length>1);
 }
 let trendLoading=null;
 function syncTrends(){
  if(state.view!=='trends'){root.HistoryTrendsUI?.close();return}
  if(root.HistoryTrendsUI){el('historyTrendModuleStatus')?.remove();root.HistoryTrendsUI.open(state);return}
  if(trendLoading)return;
  const panel=el('historyTrendsPanel');if(!panel)return;
  const status=document.createElement('div');status.id='historyTrendModuleStatus';status.className='data-help';status.setAttribute('role','status');status.textContent='正在载入历史趋势模块…';panel.replaceChildren(status);
  trendLoading=root.HistoryLoader.loadTrends().then(()=>{
   status.remove();if(state.view==='trends'&&root.History2022View?.active()){root.HistoryTrendsUI.open(state);root.dispatchEvent(new Event('site-route-change'))}
  }).catch(error=>{status.textContent='历史趋势模块载入失败：'+error.message+' ';const retry=document.createElement('button');retry.type='button';retry.className='button quiet';retry.textContent='重试';retry.onclick=()=>syncTrends();status.append(retry)}).finally(()=>{trendLoading=null});
 }
 function render(){
  state=readSelection();
  chooseOverviewOnMapChange();
  syncOverviewControls();
  const fullResult=resultForSelection();
  const scoped=state.view==='overview'?overviewRegionData(indexed,{
   year:state.year,office:state.office,electorate:state.electorate,scope:overviewScope,county:overviewCounty,area:overviewArea}):null;
  currentResult=scoped?.result||fullResult;
  currentOverview=scoped?.overview||(state.office==='legislative'&&state.electorate==='all'&&indexed?root.HistoryLegislativeData?.localResult(indexed,{year:state.year,electorate:'all',scope:state.county?'county':'all',county:state.county})?.overview:null)||(currentResult&&root.HistoryCore?root.HistoryCore.overview(currentResult):null);
  renderOverviewScope(scoped);
   const electorateBox=el('historyElectorateBox');if(electorateBox)electorateBox.hidden=!['council','legislative'].includes(state.office);
  const electorate=el('historyElectorate');if(electorate){
   if(state.office==='council'||state.office==='legislative'){
    const options=electorateOptions(state.office,state.year);
    if(state.office==='legislative'&&electorate.options.length!==options.length)electorate.replaceChildren(...options.map(([value,label])=>new Option(label,value)));
    electorate.value=state.electorate;
   }else electorate.value='regional';
  }
  const panels={map:'historyMapPanel',candidates:'historyCandidatesPanel',overview:'historyOverviewPanel',trends:'historyTrendsPanel'};
  for(const [view,id] of Object.entries(panels)){const node=el(id);if(node)node.hidden=state.view!==view}
  for(const view of VIEWS){const button=el('historyView'+view[0].toUpperCase()+view.slice(1));if(button){const selected=state.view===view;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))}}
  syncTrends();
  if(el('historyExportCsv'))el('historyExportCsv').textContent=state.view==='trends'?'导出历史趋势 CSV':'导出当前结果 CSV';
  renderTurnoutCards();if(el('historyCoverage')&&currentResult)el('historyCoverage').textContent=state.office==='legislative'?'当前票种：'+(root.HistoryLegislative?.ballots(state.year).find(x=>x.value===state.electorate)?.label||'立法机构民代')+' · '+currentResult.contests.length+'个统计区域 · '+currentResult.candidacies.length+'条结果。':'当前范围：'+currentResult.contests.length+'个选举区 · '+currentResult.candidacies.length+'条候选人记录。';emit();return{...state};
 }
 function restoreRouteView(route){
  const v=VIEWS.has(route.view)?route.view:'map';
  state=normalizeSelection({...readSelection(),view:v});
  if(v==='overview'&&['all','county','district','town'].includes(route.scope)){
   overviewInitialized=true;overviewContext=overviewContextKey();overviewSidebarKey=sidebarScopeKey();
   overviewScope=route.scope;overviewCounty=route.overviewCounty||state.county;overviewMapCounty=state.county;overviewArea=route.overviewArea||'';
   changeOverviewMap();
  }else render();
 }
 function setView(view){state=normalizeSelection({...readSelection(),view});
  render()}
 function activate(initialSelection={}){
  const target=normalizeSelection({...state,...initialSelection});state=target;active=true;
  root.History2022View?.activate?.();
  if(el('historyYear'))el('historyYear').value=String(target.year);
  const controls=[['historyOffice',target.office],['historyElectorate',target.electorate],['historyCounty',target.county],['historyScale',target.office==='legislative'?target.level:target.level==='town'?'town':'district'],['historyMetric',target.metric]];
  for(const [id,value] of controls){const node=el(id);if(node&&node.value!==value){node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}))}}
  render();return{...state};
 }
 function deactivate(){active=false;root.History2022View?.deactivate?.()}
 function openContest(contestId){
  if(!indexed||!root.HistoryCore)return;
  const result=root.HistoryCore.filter(indexed,{year:state.year,office:state.office,contestId}),summary=result.summaries[0];if(!summary)return;
  root.History2022View?.openContest?.(contestId,summary);
 }
 function exportCsv(){
  if(state.view==='trends')return root.HistoryTrendsUI?.exportCsv();
  if(!currentResult)return;
  const mayorDistricts=state.office==='mayor'&&state.year===2018&&
   (state.view==='overview'?overviewScope==='town':state.view==='map'&&state.level==='town');
  const content=mayorDistricts?mayorTownCsv(indexed.snapshot,state.view==='overview'?
   {...state,county:overviewCounty,area:overviewArea}:state):
   state.office==='legislative'?root.HistoryLegislativeData?.exportCsv(indexed?.snapshot||{},{...state,focus:el('historyFocus')?.value||''}):
   state.office==='president'&&state.level==='town'?presidentialTownCsv(indexed?.snapshot||{},state):historyCsv(currentResult,state);
  const stem=mayorDistricts?exportStem({...state,county:state.view==='overview'?overviewCounty:state.county})+'-乡镇市区':exportStem(state);
  const blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download=stem+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 for(const id of ['historyYear','historyOffice','historyElectorate','historyScale','historyMetric'])el(id)?.addEventListener('change',render);
 el('historyCounty')?.addEventListener('change',render);
 el('historyOverviewScope')?.addEventListener('change',event=>{overviewScope=event.target.value;overviewArea='';changeOverviewMap()});
 el('historyOverviewCounty')?.addEventListener('change',event=>{overviewCounty=event.target.value||'';overviewArea='';changeOverviewMap()});
 el('historyOverviewContest')?.addEventListener('change',event=>{overviewArea=event.target.value||'';changeOverviewMap()});
 for(const [view,id] of [['candidates','historyViewCandidates'],['overview','historyViewOverview'],['trends','historyViewTrends']])el(id)?.addEventListener('click',()=>setView(state.view===view?'map':view));
 for(const id of ['workspacePrediction','workspaceFree'])el(id)?.addEventListener('click',()=>{active=false});
 function setSnapshot(snapshot){try{indexed=root.HistoryCore.index(snapshot);render();return true}catch(error){if(el('historyLoadStatus')){el('historyLoadStatus').hidden=false;el('historyLoadStatus').textContent='历史数据版本不兼容，请重新载入。'};if(el('historyRetry'))el('historyRetry').hidden=false;return false}}
 root.addEventListener('historysnapshotready',event=>setSnapshot(event.detail.snapshot));
 const existing=root.History2022View?.snapshot?.();if(existing)setSnapshot(existing);
 const heading=el('historyResultSection')?.querySelector('.history-result-heading');if(heading&&!el('historyExportCsv')){const button=doc.createElement('button');button.type='button';button.id='historyExportCsv';button.className='button quiet';button.textContent='导出当前结果 CSV';button.onclick=exportCsv;heading.append(button)}
 root.HistoryWorkspace={...api,activate,deactivate,restoreRouteView,selection:()=>({...state}),render,openContest,
  openContestOverview,openFeatureOverview,contestForFeature,selectedOverviewContest:()=>overviewContestId,
  selectedOverviewScope:()=>({scope:overviewScope,county:overviewCounty,area:overviewArea}),
  setSnapshot,exportCsv,result:()=>currentResult,overview:()=>currentOverview,active:()=>active};
})(typeof window==='undefined'?{}:window);
