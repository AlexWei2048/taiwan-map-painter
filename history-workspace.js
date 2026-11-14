(function(root){
 'use strict';
  // Apply publication wording at CSV serialization time only; archive data and IDs remain unchanged.
  const csvSimplify=root.OpenCC?.Converter?root.OpenCC.Converter({from:'t',to:'cn'}):text=>String(text);
  const exportedWording=value=>{const text=csvSimplify(String(value??''));return (typeof module!=='undefined'&&module.exports?require('./news-wording.js'):root.XinhuaWording)?.normalize(text)||text};
  const csvPercent=value=>{if(value===null||value===undefined||String(value).trim()==='')return '';const number=Number(String(value).trim().replace(/%$/,''));return Number.isFinite(number)?(Math.round((number+1e-9)*100)/100).toFixed(2)+'%':''};
  const csvCell=value=>{let text=exportedWording(value);if(/^[=+@\t\r-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};
 const OFFICES=new Set(['mayor','council','township','president']);
 const PRESIDENT_YEARS=[1996,2000,2004,2008,2012,2016,2020,2024];
 const yearsForOffice=office=>office==='president'?PRESIDENT_YEARS:[2022];
 const Core=typeof module!=='undefined'&&module.exports?require('./history-core.js'):root.HistoryCore;
 const VIEWS=new Set(['map','candidates','overview']);
 const ELECTORATES=new Set(['all','regional','plains','mountain']);
 const METRICS={mayor:new Set(['party','share','votes']),president:new Set(['party','share','votes']),council:new Set(['party','seats','share','votes']),township:new Set(['party','share','votes'])};
 const labels={regional:'区域议员',plains:'平地少数民族议员',mountain:'山地少数民族议员'};
 const rate=(valid,cast,invalid)=>Number.isFinite(valid)&&Number.isFinite(cast)&&cast>0?valid/cast*100:Number.isFinite(valid)&&Number.isFinite(invalid)&&valid+invalid>0?valid/(valid+invalid)*100:null;
 const levelOptions=office=>office==='mayor'||office==='president'?[['county','县市'],['town','乡镇市区']]:office==='council'?[['district','选举区']]:[['town','乡镇市区']];
 const electorateOptions=office=>office==='council'?[['all','全部类型（分别统计）'],['regional','区域议员'],['plains','平地少数民族议员'],['mountain','山地少数民族议员']]:[['regional','区域选举']];
 function normalizeSelection(input={},years=null){
  const office=OFFICES.has(input.office)?input.office:'mayor';
  const available=(years||yearsForOffice(office)).map(Number).filter(Number.isFinite),requested=Number(input.year);
  const year=available.includes(requested)?requested:(office==='president'?2024:2022);
  const allowedLevels=levelOptions(office).map(item=>item[0]);
  const defaultLevel=allowedLevels[0];
  const level=allowedLevels.includes(input.level)?input.level:defaultLevel;
  const electorate=office==='council'&&ELECTORATES.has(input.electorate)?input.electorate:'regional';
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
   title:selection.office==='council'?(labels[group.electorate]||'其他议员'):
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
    if(contest.election_id==='2022-township'&&contest.county_name===county&&contest.district_name)
     towns.add(contest.district_name);
   }
   areas=[...towns].sort((a,b)=>a.localeCompare(b,'zh',{numeric:true}))
    .map(town=>({value:town,label:town}));
  }
  return{counties,areas};
 }
 function overviewRegionData(indexed,selection={}){
  if(!indexed||Number(indexed.snapshot?.year)!==Number(selection.year))return null;
  const year=Number(selection.year||2022),office=selection.office||'mayor';
  const scope=['all','county','district','town'].includes(selection.scope)?selection.scope:'all';
  const county=String(selection.county||''),area=String(selection.area||'');
  const all=Core.filter(indexed,{year,office,electorate:'all'});
  const countyContest=all.contests.find(c=>c.county_name===county)||
   (office==='township'?[...indexed.contestsById.values()].find(c=>
    c.county_name===county&&c.election_id==='2022-mayor'):null);
  let query={year,office,electorate:'all'};
  if(scope!=='all'){
   if(!countyContest)return null;
   query.countyId=countyContest.county_id;
  }
  if(scope==='district'||scope==='town'&&office==='township'){
   if(!all.contests.some(c=>c.contest_id===area&&c.county_name===county))return null;
   query.contestId=area;
  }
  const result=Core.filter(indexed,query);
  let overview=Core.overview(result),townVotesVerified=false;
  if(scope==='town'&&(office==='mayor'||office==='president')){
   const rows=(indexed.snapshot.rows||[]).filter(row=>
    row.type===office&&row.level==='town'&&row.county===county&&row.town===area);
   const expected=new Set(result.candidacies.map(c=>String(c.ballot_number||'')));
   const present=new Set(rows.map(row=>String(row.number||'')));
   townVotesVerified=expected.size>0&&rows.length===expected.size&&
    present.size===expected.size&&[...expected].every(key=>present.has(key))&&
    rows.every(row=>Number.isSafeInteger(row.votes)&&row.votes>=0);
   const validVotes=townVotesVerified?rows.reduce((sum,row)=>sum+row.votes,0):null;
   // These are county-wide offices; winner status refers to the county result.
   const group={electorate:'regional',registeredVoters:null,ballotsCast:null,
    validVotes,invalidVotes:null,turnout:null};
   overview={...overview,registeredVoters:null,ballotsCast:null,validVotes,
    invalidVotes:null,turnout:null,turnoutGroups:[group]};
  }
  return{result,overview,scope,county,area,townVotesVerified};
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
  const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人'},metrics={party:selection.office==='council'?'当选席次':selection.office==='president'||selection.level==='town'?(selection.level==='town'?'各乡镇市区最高票候选人':'各县市最高票候选人'):'当选政党',seats:'指定政党席次',vote:'得票率',share:'得票率',votes:'得票数'};
  return[selection.year||2022,offices[selection.office]||'历史选举',selection.office==='president'?(selection.level==='town'?'乡镇市区':'县市'):null,selection.county||'全台',metrics[selection.metric]||selection.metric||'结果'].filter(Boolean).join('-').replace(/[\\/:*?"<>|]/g,'_');
 }
 function historyCsv(result={contests:[],candidacies:[]},selection={}){
  const presidential=selection.office==='president',council=selection.office==='council';
  const extra=presidential?['副领导人候选人','正职性别','副职性别','选举时现任']:[];
  const headers=['年份','选举类别','县市','选区',...(council?['选区类型']:[]),presidential?'正领导人候选人':'候选人',...extra,'政党','号次','得票数','得票率','当选'];
  const contests=new Map((result.contests||[]).map(item=>[item.contest_id,item]));
  const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人'};
  const identities={regional:'区域',plains:'平地少数民族',mountain:'山地少数民族'};
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
   rows.push([selection.year||2022,offices[selection.office]||selection.office,county,district===county?'':district,
    ...(council?[identities[contest.electorate]||'区域']:[]),item.candidate_name||item.candidate_name_official||'',
    ...(presidential?[item.deputy_name||'',item.gender||'',item.deputy_gender||'',item.incumbent_at_election===true?'是':'']:[]),
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
    r.incumbent===true?'是':'',r.party,r.number,r.votes,total?csvPercent(r.votes/total*100):'',r.elected?'是':'']);
  }
  return '\uFEFF'+output.map(row=>row.map(csvCell).join(',')).join('\r\n');
 }
 const api={normalizeSelection,yearsForOffice,levelOptions,electorateOptions,turnoutCards,overviewRegionChoices,overviewRegionData,featurePresentation,badgeFallback,candidateRows,overviewCards,overviewCharts,drilldownSelection,exportStem,historyCsv,presidentialTownCsv};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return}

 const doc=root.document;
 if(!doc){root.HistoryWorkspace=api;return}
 const el=id=>doc.getElementById(id);
 let state=normalizeSelection();
 let active=false;
 let indexed=null,currentResult=null,currentOverview=null,overviewContestId='';
 let overviewScope='all',overviewCounty='',overviewArea='',overviewInitialized=false,overviewContext='',overviewMapCounty='';

 function overviewContextKey(){return state.office+'|'+state.year}
 function chooseOverviewOnMapChange(){
  const key=overviewContextKey();
  if(!overviewInitialized||overviewContext!==key){
   overviewInitialized=true;overviewContext=key;overviewMapCounty=state.county;
   overviewCounty=state.county||'';overviewScope=state.county?'county':'all';
   overviewArea='';overviewContestId='';
  }
 }
 function syncOverviewControls(){
  const level=state.office==='council'?'district':'town';
  if(!['all','county',level].includes(overviewScope))overviewScope='all';
  const {counties}=overviewRegionChoices(indexed,{year:state.year,office:state.office});
  if(overviewScope!=='all'&&!counties.includes(overviewCounty))
   overviewCounty=counties.includes(state.county)?state.county:counties[0]||'';
  const towns=root.History2022View?.allTowns?.()||[];
  const choices=overviewRegionChoices(indexed,{year:state.year,office:state.office,county:overviewCounty,towns});
  const scopeSelect=el('historyOverviewScope');
  if(scopeSelect){
   const opts=[['all','全部地区（含金门、马祖）'],['county','县市'],[level,level==='district'?'议员选区':'乡镇市区']];
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
   areaBox.hidden=overviewScope!==level;
   const firstText=areaBox.firstChild;
   if(firstText?.nodeType===3)firstText.textContent=level==='district'?'议员选区':'乡镇市区';
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
 function renderOverviewScope(scoped){
  const title=el('historyOverviewTitle'),description=el('historyOverviewDescription');
  if(!title)return;
  const name={mayor:'县市长',council:'议员',township:'乡镇市区长',president:'台湾地区领导人'}[state.office]||'选举';
  const all=overviewScope==='all',county=overviewCounty;
  const district=overviewScope==='district'||overviewScope==='town'?
   state.office==='council'||state.office==='township'?
    scoped?.result?.contests?.[0]?.district_name||overviewArea:
    overviewArea:'';
  const identity=scoped?.result?.contests?.length===1&&state.office==='council'?
   labels[scoped.result.contests[0].electorate]||'议员':name;
  title.textContent=[state.year+'年',all?'全部地区（含金门、马祖）':county,district,
   identity].filter(Boolean).join(' · ')+'选举概况';
  if(description){
   const fullArea=all?'全部地区（含金门、马祖）':
    [county,district].filter(Boolean).join(' · ');
   const groups=scoped?.overview?.turnoutGroups||[];
   description.textContent='当前统计范围：'+fullArea+
    (groups.length>1?' · 关键指标为各选举类别合计，图表保留分类统计':'')+
    (overviewScope==='town'&&['president','mayor'].includes(state.office)?
     ' · 该层级仅有候选人有效票，缺乏已核实的选举人数和投票人数':'');
  }
 }
 function openContestOverview(contestId){
  if(!indexed||!Core)return false;
  const all=Core.filter(indexed,{year:state.year,office:state.office,electorate:'all'});
  const contest=all.contests.find(c=>c.contest_id===contestId);
  if(!contest)return false;
  overviewInitialized=true;overviewContext=overviewContextKey();
  overviewCounty=contest.county_name;overviewMapCounty=state.county;
  overviewScope=state.office==='council'?'district':
   state.office==='township'?'town':'county';
  overviewArea=overviewScope==='county'?'':contestId;
  overviewContestId=overviewScope==='county'?'':contestId;
  state=normalizeSelection({...readSelection(),view:'overview'});
  render();return true;
 }
 function openFeatureOverview(feature){
  if(!feature||!indexed)return false;
  const county=feature.county||feature.name;
  const level=state.office==='council'?'district':'town';
  const choices=overviewRegionChoices(indexed,{year:state.year,office:state.office,county,
   towns:root.History2022View?.allTowns?.()||[]});
  if(!choices.counties.includes(county))return false;
  overviewInitialized=true;overviewContext=overviewContextKey();
  overviewCounty=county;overviewMapCounty=state.county;
  overviewScope='county';overviewArea='';overviewContestId='';
  if(feature.name!==county){
   const wanted=state.office==='council'?
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
  render();return true;
 }
 function contestForFeature(feature){
  if(!feature)return null;
  const base=resultForSelection();if(!base?.contests?.length)return null;
  const county=feature.county||feature.name;
  const office=state.office;
  return base.contests.find(contest=>{
   if(contest.county_name!==county)return false;
   if(office==='council')return Core.identity(contest.electorate)===Core.identity(feature.electorate)&&
    Core.districtNumber(contest.district_name)===String(feature.number);
   if(office==='township')return contest.district_name===feature.name;
   return feature.name===county; // Township presidential/mayor views have no township-specific turnout contest.
  })?.contest_id||null;
 }
 function refreshYearOptions(){
  const select=el('historyYear');if(!select)return;
  const office=el('historyOffice')?.value||state.office,years=yearsForOffice(office);
  const current=Number(select.value),preferred=years.includes(current)?current:(office==='president'?2024:2022);
  if(select.options.length!==years.length||years.some((y,i)=>Number(select.options[i]?.value)!==y)){
   select.replaceChildren(...years.map(y=>new Option(String(y),String(y))));
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
   level:office==='mayor'||office==='president'?(scale==='town'?'town':'county'):office==='council'?'district':'town',
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
  renderOverviewCharts();
  const note=el('historyOverviewNote');
  if(note)note.hidden=!(currentOverview.turnoutGroups?.length>1);
 }
 function render(){
  state=readSelection();
  chooseOverviewOnMapChange();
  syncOverviewControls();
  const fullResult=resultForSelection();
  const scoped=state.view==='overview'?overviewRegionData(indexed,{
   year:state.year,office:state.office,scope:overviewScope,county:overviewCounty,area:overviewArea}):null;
  currentResult=scoped?.result||fullResult;
  currentOverview=scoped?.overview||(currentResult&&root.HistoryCore?root.HistoryCore.overview(currentResult):null);
  renderOverviewScope(scoped);
   const electorateBox=el('historyElectorateBox');if(electorateBox)electorateBox.hidden=state.office!=='council';
  const electorate=el('historyElectorate');if(electorate){
   if(state.office==='council'){
    const options=electorateOptions(state.office);
    if(electorate.options.length!==options.length)electorate.replaceChildren(...options.map(([value,label])=>new Option(label,value)));
    electorate.value=state.electorate;
   }else electorate.value='regional';
  }
  const panels={map:'historyMapPanel',candidates:'historyCandidatesPanel',overview:'historyOverviewPanel'};
  for(const [view,id] of Object.entries(panels)){const node=el(id);if(node)node.hidden=state.view!==view}
  for(const view of VIEWS){const button=el('historyView'+view[0].toUpperCase()+view.slice(1));if(button){const selected=state.view===view;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))}}
  renderTurnoutCards();if(el('historyCoverage')&&currentResult)el('historyCoverage').textContent='当前范围：'+currentResult.contests.length+'个选举区 · '+currentResult.candidacies.length+'条候选人记录。';emit();return{...state};
 }
 function setView(view){const before=state.view;state=normalizeSelection({...readSelection(),view});
  if(view==='overview'&&before!=='overview'&&overviewMapCounty!==state.county)overviewInitialized=false;
  render()}
 function activate(initialSelection={}){
  const target=normalizeSelection({...state,...initialSelection});state=target;active=true;
  root.History2022View?.activate?.();
  if(el('historyYear'))el('historyYear').value=String(target.year);
  const controls=[['historyOffice',target.office],['historyElectorate',target.electorate],['historyCounty',target.county],['historyScale',target.level==='town'?'town':'district'],['historyMetric',target.metric]];
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
  if(!currentResult)return;
  const content=state.office==='president'&&state.level==='town'?presidentialTownCsv(indexed?.snapshot||{},state):historyCsv(currentResult,state);
  const blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download=exportStem(state)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 for(const id of ['historyYear','historyOffice','historyElectorate','historyScale','historyMetric'])el(id)?.addEventListener('change',render);
 el('historyCounty')?.addEventListener('change',()=>{overviewInitialized=false;render()});
 el('historyOverviewScope')?.addEventListener('change',event=>{overviewScope=event.target.value;overviewArea='';render()});
 el('historyOverviewCounty')?.addEventListener('change',event=>{overviewCounty=event.target.value||'';overviewArea='';render()});
 el('historyOverviewContest')?.addEventListener('change',event=>{overviewArea=event.target.value||'';render()});
 for(const [view,id] of [['candidates','historyViewCandidates'],['overview','historyViewOverview']])el(id)?.addEventListener('click',()=>setView(state.view===view?'map':view));
 for(const id of ['workspacePrediction','workspaceFree'])el(id)?.addEventListener('click',()=>{active=false});
 function setSnapshot(snapshot){try{indexed=root.HistoryCore.index(snapshot);render();return true}catch(error){if(el('historyLoadStatus')){el('historyLoadStatus').hidden=false;el('historyLoadStatus').textContent='历史数据版本不兼容，请重新载入。'};if(el('historyRetry'))el('historyRetry').hidden=false;return false}}
 root.addEventListener('historysnapshotready',event=>setSnapshot(event.detail.snapshot));
 const existing=root.History2022View?.snapshot?.();if(existing)setSnapshot(existing);
 const heading=el('historyResultSection')?.querySelector('.history-result-heading');if(heading&&!el('historyExportCsv')){const button=doc.createElement('button');button.type='button';button.id='historyExportCsv';button.className='button quiet';button.textContent='导出当前结果 CSV';button.onclick=exportCsv;heading.append(button)}
 root.HistoryWorkspace={...api,activate,deactivate,selection:()=>({...state}),render,openContest,
  openContestOverview,openFeatureOverview,contestForFeature,selectedOverviewContest:()=>overviewContestId,
  selectedOverviewScope:()=>({scope:overviewScope,county:overviewCounty,area:overviewArea}),
  setSnapshot,exportCsv,result:()=>currentResult,overview:()=>currentOverview,active:()=>active};
})(typeof window==='undefined'?{}:window);
