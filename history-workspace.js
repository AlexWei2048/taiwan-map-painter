(function(root){
 'use strict';
  // Apply publication wording at CSV serialization time only; archive data and IDs remain unchanged.
  const exportedWording=value=>{const text=String(value??'');return (typeof module!=='undefined'&&module.exports?require('./news-wording.js'):root.XinhuaWording)?.normalize(text)||text};
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
  const leading=level==='town'||office==='president';
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
  const value=n=>Number.isFinite(n)?Number(n).toLocaleString('zh-CN'):'暂无资料';
  const percent=n=>Number.isFinite(n)?n.toFixed(2)+'%':'暂无资料';
  // Overlapping council electorates must never be added into one electorate total.
  const separated=Array.isArray(overview.turnoutGroups)&&overview.turnoutGroups.length>1;
  const ballots=n=>separated?'按类别分别统计':value(n);
  const rateValue=n=>separated?'按类别分别统计':percent(n);
  return[
   {label:'选举人数',value:ballots(overview.registeredVoters),group:'participation',detail:'登记选民'},
   {label:'投票人数',value:ballots(overview.ballotsCast),group:'participation',detail:'实际投票'},
   {label:'投票率',value:rateValue(overview.turnout),group:'participation',detail:'投票人数占选举人数'},
   {label:'有效票',value:ballots(overview.validVotes),group:'ballots',detail:'计入候选人得票'},
   {label:'无效票',value:ballots(overview.invalidVotes),group:'ballots',detail:'未计入有效得票'},
   {label:'有效率',value:rateValue(rate(overview.validVotes,overview.ballotsCast,overview.invalidVotes)),group:'ballots',detail:'有效票占投票人数'},
   {label:'候选人数',value:value(overview.candidateCount),group:'people',detail:'本范围候选人'},
   {label:'当选人数',value:value(overview.electedCount),group:'people',detail:'实际当选人数'}
  ];
 }
 const summaryFormat=n=>Number.isFinite(n)?Number(n).toLocaleString('zh-CN'):'暂无资料';
 function portion(part,total){
  if(!Number.isFinite(part)||!Number.isFinite(total)||total<=0||part<0||part>total)return null;
  return Math.min(100,Math.max(0,part/total*100));
 }
 function overviewCharts(overview={},selection={}){
  const groups=turnoutCards(overview,selection);
  const separated=selection.office==='council'&&selection.electorate==='all'&&groups.length>1;
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
  const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人'},metrics={party:selection.office==='council'?'当选席次':selection.office==='president'||selection.level==='town'?'得票领先':'当选政党',seats:'指定政党席次',vote:'得票率',share:'得票率',votes:'得票数'};
  return[selection.year||2022,offices[selection.office]||'历史选举',selection.office==='president'?(selection.level==='town'?'乡镇市区':'县市'):null,selection.county||'全台',metrics[selection.metric]||selection.metric||'结果'].filter(Boolean).join('-').replace(/[\\/:*?"<>|]/g,'_');
 }
 function historyCsv(result={contests:[],candidacies:[]},selection={}){
  const contests=new Map((result.contests||[]).map(item=>[item.contest_id,item])),rows=[['年份','选举类别','县市规范名称','县市官方名称','选区规范名称','选区官方名称','候选人规范姓名','候选人官方姓名','政党规范名称','政党官方名称','号次','得票数','得票率','官方当选']];
  const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人'};
  const ordered=[...(result.candidacies||[])].sort((a,b)=>{const ca=contests.get(a.contest_id)||{},cb=contests.get(b.contest_id)||{};return Core.compareResultRows({...a,county_name:ca.county_name,district_name:ca.district_name,electorate:ca.electorate},{...b,county_name:cb.county_name,district_name:cb.district_name,electorate:cb.electorate},selection.office)});
  for(const item of ordered){const contest=contests.get(item.contest_id)||{};rows.push([selection.year||2022,offices[selection.office]||selection.office,contest.county_name,contest.county_name_official,contest.district_name,contest.district_name_official,item.candidate_name,item.candidate_name_official,item.party_name,item.party_name_official,item.ballot_number,item.votes,item.vote_share,item.elected_official?'是':''])}
  const cell=value=>{let text=exportedWording(value);if(/^[=+@\t\r-]/.test(text))text="'"+text;return'"'+text.replace(/"/g,'""')+'"'};
  return'\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
 }

 function presidentialTownCsv(snapshot={},selection={}){
  const rows=(snapshot.rows||[]).filter(r=>r.level==='town'&&r.type==='president'&&(!selection.county||r.county===selection.county));
  const totals=new Map();
  for(const r of rows){const k=r.county+'|'+r.town;totals.set(k,(totals.get(k)||0)+r.votes)}
  const output=[['年份','选举类别','县市规范名称','县市官方名称','乡镇市区规范名称','乡镇市区官方名称','候选人规范姓名','候选人官方姓名','政党规范名称','政党官方名称','号次','得票数','得票率','官方当选']];
  rows.sort((a,b)=>a.county.localeCompare(b.county,'zh')||a.town.localeCompare(b.town,'zh')||b.votes-a.votes);
  for(const r of rows){
   const total=totals.get(r.county+'|'+r.town)||0;
   output.push([selection.year,'台湾地区领导人',r.county,r.county_official,r.town,r.town_official,
     r.name,r.name_official,r.party,r.party_official,r.number,r.votes,
     total?Number((r.votes/total*100).toFixed(8)):0,r.elected?'是':'']);
  }
  const cell=v=>{let text=exportedWording(v);if(/^[=+@\t\r-]/.test(text))text="'"+text;return'"'+text.replace(/"/g,'""')+'"'};
  return'\uFEFF'+output.map(row=>row.map(cell).join(',')).join('\r\n');
 }
 const api={normalizeSelection,yearsForOffice,levelOptions,electorateOptions,turnoutCards,featurePresentation,badgeFallback,candidateRows,overviewCards,overviewCharts,drilldownSelection,exportStem,historyCsv};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return}

 const doc=root.document;
 if(!doc){root.HistoryWorkspace=api;return}
 const el=id=>doc.getElementById(id);
 let state=normalizeSelection();
 let active=false;
 let indexed=null,currentResult=null,currentOverview=null;
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
  const models=overviewCharts(currentOverview,state);
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
   if(card.value==='按类别分别统计')article.classList.add('history-overview-card--separated');
   article.append(label,strong,detail);rootNode.append(article);
  }
  renderOverviewCharts();
  const note=el('historyOverviewNote');
  if(note)note.hidden=!(state.office==='council'&&state.electorate==='all'&&currentOverview.turnoutGroups?.length>1);
 }
 function render(){
  state=readSelection();
  currentResult=resultForSelection();currentOverview=currentResult&&root.HistoryCore?root.HistoryCore.overview(currentResult):null;
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
 function setView(view){state=normalizeSelection({...readSelection(),view});render()}
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
 for(const id of ['historyYear','historyOffice','historyElectorate','historyCounty','historyScale','historyMetric'])el(id)?.addEventListener('change',render);
 for(const [view,id] of [['candidates','historyViewCandidates'],['overview','historyViewOverview']])el(id)?.addEventListener('click',()=>setView(state.view===view?'map':view));
 for(const id of ['workspacePrediction','workspaceFree'])el(id)?.addEventListener('click',()=>{active=false});
 function setSnapshot(snapshot){try{indexed=root.HistoryCore.index(snapshot);render();return true}catch(error){if(el('historyLoadStatus')){el('historyLoadStatus').hidden=false;el('historyLoadStatus').textContent='历史数据版本不兼容，请重新载入。'};if(el('historyRetry'))el('historyRetry').hidden=false;return false}}
 root.addEventListener('historysnapshotready',event=>setSnapshot(event.detail.snapshot));
 const existing=root.History2022View?.snapshot?.();if(existing)setSnapshot(existing);
 const heading=el('historyResultSection')?.querySelector('.history-result-heading');if(heading&&!el('historyExportCsv')){const button=doc.createElement('button');button.type='button';button.id='historyExportCsv';button.className='button quiet';button.textContent='导出当前结果 CSV';button.onclick=exportCsv;heading.append(button)}
 root.HistoryWorkspace={...api,activate,deactivate,selection:()=>({...state}),render,openContest,setSnapshot,exportCsv,result:()=>currentResult,overview:()=>currentOverview,active:()=>active};
})(typeof window==='undefined'?{}:window);
