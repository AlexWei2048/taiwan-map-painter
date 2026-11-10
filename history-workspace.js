(function(root){
 'use strict';
 const OFFICES=new Set(['mayor','council','township']);
 const Core=typeof module!=='undefined'&&module.exports?require('./history-core.js'):root.HistoryCore;
 const VIEWS=new Set(['map','candidates','overview']);
 const ELECTORATES=new Set(['all','regional','plains','mountain']);
 const METRICS={mayor:new Set(['party','share','votes']),council:new Set(['party','seats','share','votes']),township:new Set(['party','share','votes'])};
 const labels={regional:'区域议员',plains:'平地少数民族议员',mountain:'山地少数民族议员'};
 const rate=(valid,cast,invalid)=>Number.isFinite(valid)&&Number.isFinite(cast)&&cast>0?valid/cast*100:Number.isFinite(valid)&&Number.isFinite(invalid)&&valid+invalid>0?valid/(valid+invalid)*100:null;
 const levelOptions=office=>office==='mayor'?[['county','县市'],['town','乡镇市区']]:office==='council'?[['district','选举区']]:[['town','乡镇市区']];
 const electorateOptions=office=>office==='council'?[['all','全部类型（分别统计）'],['regional','区域议员'],['plains','平地少数民族议员'],['mountain','山地少数民族议员']]:[['regional','区域选举']];
 function normalizeSelection(input={},years=[2022]){
  const available=years.map(Number).filter(Number.isFinite),requested=Number(input.year);
  const year=available.includes(requested)?requested:(available[0]||2022);
  const office=OFFICES.has(input.office)?input.office:'mayor';
  const allowedLevels=levelOptions(office).map(item=>item[0]);
  const defaultLevel=allowedLevels[0];
  const level=allowedLevels.includes(input.level)?input.level:defaultLevel;
  const electorate=office==='council'&&ELECTORATES.has(input.electorate)?input.electorate:'regional';
  const metric=METRICS[office].has(input.metric)?input.metric:'party';
  const view=VIEWS.has(input.view)?input.view:'map';
  return{year,office,electorate,county:String(input.county||''),level,metric,candidate:String(input.candidate||''),party:String(input.party||''),view};
 }
 function turnoutCards(overview={},selection={}){
  const groups=Array.isArray(overview.turnoutGroups)?overview.turnoutGroups:[];
  const visible=selection.office==='council'&&selection.electorate==='all'?groups:groups.slice(0,1);
  return visible.map(group=>({
   electorate:group.electorate,
   title:selection.office==='council'?(labels[group.electorate]||'其他议员'):'区域选举',
   registeredVoters:group.registeredVoters??null,
   ballotsCast:group.ballotsCast??null,
   validVotes:group.validVotes??null,
   invalidVotes:group.invalidVotes??null,
   turnout:group.turnout??null,
   validRate:rate(group.validVotes,group.ballotsCast,group.invalidVotes)
  }));
 }
 function featurePresentation({office='mayor',level='county',metric='party',region=null,partyColor=()=> '#edf1e9'}={}){
  if(office==='council'){
   const badgeItems=region?.partyCounts instanceof Map?[...region.partyCounts].map(([party,seats])=>({party,seats})).sort((a,b)=>b.seats-a.seats||a.party.localeCompare(b.party,'zh')):[];
   const composition=badgeItems.map(item=>item.party+' '+item.seats+'席').join('、');
   return{fill:'#f0f3ed',badgeItems,tooltip:composition||'暂无当选席次资料',ariaLabel:composition||'暂无当选席次资料'};
  }
  const top=region?.top;
  if(!top)return{fill:'#edf1e9',badgeItems:[],tooltip:'暂无该层级数据',ariaLabel:'暂无该层级数据'};
  const leading=level==='town';
  const description=top.name+' · '+top.party+' · '+(leading?'得票领先':'实际当选')+' · '+Number(top.votes||0).toLocaleString('zh-CN')+'票'+(Number.isFinite(region.share)?' · '+region.share.toFixed(2)+'%':'');
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
  const value=number=>Number.isFinite(number)?Number(number).toLocaleString('zh-CN'):'暂无资料';
  const percent=number=>Number.isFinite(number)?number.toFixed(2)+'%':'暂无资料';
  const separated=Array.isArray(overview.turnoutGroups)&&overview.turnoutGroups.length>1;
  return[
   {label:'候选人',value:value(overview.candidateCount)},
   {label:'官方当选',value:value(overview.electedCount)},
   {label:'选举人数',value:separated?'按选举类型分别统计':value(overview.registeredVoters)},
   {label:'投票率',value:separated?'按选举类型分别统计':percent(overview.turnout)},
   {label:'有效率',value:separated?'按选举类型分别统计':percent(rate(overview.validVotes,overview.ballotsCast,overview.invalidVotes))},
   {label:'有效票',value:separated?'按选举类型分别统计':value(overview.validVotes)},
   {label:'无效票',value:separated?'按选举类型分别统计':value(overview.invalidVotes)}
  ];
 }
 function drilldownSelection(selection={},county){
  if(selection.office!=='mayor'||!county)return null;
  return{...selection,county,level:'town'};
 }
 function exportStem(selection={}){
  const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长'},metrics={party:selection.office==='council'?'当选席次':selection.level==='town'?'得票领先':'当选政党',seats:'指定政党席次',share:'得票率',votes:'得票数'};
  return[selection.year||2022,offices[selection.office]||'历史选举',selection.county||'全台',metrics[selection.metric]||selection.metric||'结果'].join('-').replace(/[\\/:*?"<>|]/g,'_');
 }
 function historyCsv(result={contests:[],candidacies:[]},selection={}){
  const contests=new Map((result.contests||[]).map(item=>[item.contest_id,item])),rows=[['年份','选举类别','县市规范名称','县市官方名称','选区规范名称','选区官方名称','候选人规范姓名','候选人官方姓名','政党规范名称','政党官方名称','号次','得票数','得票率','官方当选']];
  const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长'};
  const ordered=[...(result.candidacies||[])].sort((a,b)=>{const ca=contests.get(a.contest_id)||{},cb=contests.get(b.contest_id)||{};return Core.compareResultRows({...a,county_name:ca.county_name,district_name:ca.district_name,electorate:ca.electorate},{...b,county_name:cb.county_name,district_name:cb.district_name,electorate:cb.electorate},selection.office)});
  for(const item of ordered){const contest=contests.get(item.contest_id)||{};rows.push([selection.year||2022,offices[selection.office]||selection.office,contest.county_name,contest.county_name_official,contest.district_name,contest.district_name_official,item.candidate_name,item.candidate_name_official,item.party_name,item.party_name_official,item.ballot_number,item.votes,item.vote_share,item.elected_official?'是':''])}
  const cell=value=>{let text=String(value??'');if(/^[=+@\t\r-]/.test(text))text="'"+text;return'"'+text.replace(/"/g,'""')+'"'};
  return'\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
 }

 const api={normalizeSelection,levelOptions,electorateOptions,turnoutCards,featurePresentation,badgeFallback,candidateRows,overviewCards,drilldownSelection,exportStem,historyCsv};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return}

 const doc=root.document;
 if(!doc){root.HistoryWorkspace=api;return}
 const el=id=>doc.getElementById(id);
 let state=normalizeSelection();
 let active=false;
 let indexed=null,currentResult=null,currentOverview=null;
 function readSelection(){
  const scale=el('historyScale')?.value;
  const office=el('historyOffice')?.value||state.office;
  return normalizeSelection({
   ...state,year:el('historyYear')?.value,office,
   electorate:el('historyElectorate')?.value,county:el('historyCounty')?.value,
   level:office==='mayor'?(scale==='town'?'town':'county'):office==='council'?'district':'town',
   metric:el('historyMetric')?.value==='vote'?(el('historyVoteUnit')?.value||'share'):el('historyMetric')?.value
  },[2022]);
 }
 function emit(){
  root.dispatchEvent(new CustomEvent('historyselectionchange',{detail:{...state}}));
 }
 function resultForSelection(){
  if(!indexed||!root.HistoryCore)return null;
  const contests=[...indexed.contestsById.values()],countyId=state.county?contests.find(contest=>contest.county_name===state.county)?.county_id:'';
  return root.HistoryCore.filter(indexed,{year:state.year,office:state.office,electorate:state.electorate,countyId});
 }
 function renderTurnoutCards(){
  const rootNode=el('historyOverviewCards');if(!rootNode)return;
  rootNode.replaceChildren();
  if(!currentOverview){const note=doc.createElement('p');note.className='history-overview-placeholder';note.textContent='概况数据正在载入。';rootNode.append(note);return}
  for(const card of overviewCards(currentOverview)){const article=doc.createElement('article');article.className='history-overview-card';const label=doc.createElement('span'),strong=doc.createElement('strong');label.textContent=card.label;strong.textContent=card.value;article.append(label,strong);rootNode.append(article)}
  if(state.office==='council'&&state.electorate==='all')for(const card of turnoutCards(currentOverview,state)){const article=doc.createElement('article');article.className='history-overview-card history-turnout-card';const label=doc.createElement('span'),strong=doc.createElement('strong'),detail=doc.createElement('small');label.textContent=card.title;strong.textContent='选举人数 '+(card.registeredVoters===null?'暂无资料':card.registeredVoters.toLocaleString('zh-CN'));const turnout='投票率 '+(card.turnout===null?'暂无资料':card.turnout.toFixed(2)+'%'),valid='有效率 '+(card.validRate===null?'暂无资料':card.validRate.toFixed(2)+'%');const ballots='有效票 '+(card.validVotes===null?'暂无资料':card.validVotes.toLocaleString('zh-CN'))+' · 无效票 '+(card.invalidVotes===null?'暂无资料':card.invalidVotes.toLocaleString('zh-CN'));detail.textContent=turnout+' · '+valid+'；'+ballots;article.append(label,strong,detail);rootNode.append(article)}
  if(state.office==='council'&&state.electorate==='all'){const note=doc.createElement('p');note.className='history-overview-placeholder';note.textContent='区域、平地少数民族、山地少数民族分别统计，不合并可能重叠的选民。';rootNode.append(note)}
 }
 function render(){
  state=readSelection();
  currentResult=resultForSelection();currentOverview=currentResult&&root.HistoryCore?root.HistoryCore.overview(currentResult):null;
  const voteUnitBox=el('historyVoteUnitBox');if(voteUnitBox)voteUnitBox.hidden=!['share','votes'].includes(state.metric);
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
  for(const view of VIEWS){const button=el('historyView'+view[0].toUpperCase()+view.slice(1));if(button){const selected=state.view===view;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected))}}
  renderTurnoutCards();if(el('historyCoverage')&&currentResult)el('historyCoverage').textContent='当前范围：'+currentResult.contests.length+'个选举区 · '+currentResult.candidacies.length+'条候选人记录。资料来源：台湾地区选举事务主管机构公开资料。';emit();return{...state};
 }
 function setView(view){state=normalizeSelection({...readSelection(),view},[2022]);render()}
 function activate(initialSelection={}){
  const target=normalizeSelection({...state,...initialSelection},[2022]);state=target;active=true;
  root.History2022View?.activate?.();
  if(el('historyYear'))el('historyYear').value=String(target.year);
  const controls=[['historyOffice',target.office],['historyElectorate',target.electorate],['historyCounty',target.county],['historyScale',target.level==='town'?'town':'district'],['historyMetric',['share','votes'].includes(target.metric)?'vote':target.metric],['historyVoteUnit',target.metric==='votes'?'votes':'share']];
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
  const blob=new Blob([historyCsv(currentResult,state)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=doc.createElement('a');link.href=url;link.download=exportStem(state)+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 for(const id of ['historyYear','historyOffice','historyElectorate','historyCounty','historyScale','historyMetric','historyVoteUnit'])el(id)?.addEventListener('change',render);
 for(const [view,id] of [['map','historyViewMap'],['candidates','historyViewCandidates'],['overview','historyViewOverview']])el(id)?.addEventListener('click',()=>setView(view));
 el('workspaceHistory')?.addEventListener('click',()=>{active=true;render()});
 for(const id of ['workspacePrediction','workspaceFree'])el(id)?.addEventListener('click',()=>{active=false});
 function setSnapshot(snapshot){try{indexed=root.HistoryCore.index(snapshot);render();return true}catch(error){indexed=null;currentResult=null;currentOverview=null;if(el('historyLoadStatus'))el('historyLoadStatus').textContent='历史数据版本不兼容，请重新载入。';if(el('historyRetry'))el('historyRetry').hidden=false;return false}}
 root.addEventListener('historysnapshotready',event=>setSnapshot(event.detail.snapshot));
 const existing=root.History2022View?.snapshot?.();if(existing)setSnapshot(existing);
 const heading=el('historyResultSection')?.querySelector('.history-result-heading');if(heading&&!el('historyExportCsv')){const button=doc.createElement('button');button.type='button';button.id='historyExportCsv';button.className='button quiet';button.textContent='导出当前结果 CSV';button.onclick=exportCsv;heading.append(button)}
 root.HistoryWorkspace={...api,activate,deactivate,selection:()=>({...state}),render,openContest,setSnapshot,exportCsv,result:()=>currentResult,overview:()=>currentOverview,active:()=>active};
})(typeof window==='undefined'?{}:window);
