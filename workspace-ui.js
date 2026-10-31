'use strict';
function normalizeStaticUiTerms(root=typeof document==='undefined'?null:document.body){if(!root||typeof document==='undefined')return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);for(let node=walker.nextNode();node;node=walker.nextNode()){const value=mainlandTerms(node.nodeValue);if(value!==node.nodeValue)node.nodeValue=value}}
normalizeStaticUiTerms();
// Task context is independent from the chosen map display. Candidate estimates remain the single prediction data source.
function predictionUsesVoteDisplay(){return !['composition','seats'].includes(state.predictionDisplay)}
function predictionUsesGradient(){return ['topVote','partyTop','share','votes','partyShare','partyVotes','winnerShare','winnerVotes'].includes(state.predictionDisplay)}
function predictionIsVotes(){return ['votes','partyVotes','winnerVotes'].includes(state.predictionDisplay)}
function predictionDisplayResult(d){
 if(!d)return null;
 try{return PredictionCore.voteResult(directoryCandidates(d),state.predictions[d.id],state.predictionDisplay==='partyTop')}
 catch(e){return null}
}
function predictionDomain(){const min=Number(state.gradient.min)||0,auto=predictionIsVotes()?Math.max(1,...currentItems().map(f=>predictionDisplayResult(predictionDistrictFor(f))?.value||0)):100;return{min,max:state.gradient.max===null?Math.max(min+1,auto):state.gradient.max}}
// The county list includes all three identities; only the geographic layer is filtered by identity.
predictionDistricts=function(){return orderedDistricts().filter(d=>d.type===state.predictionOffice&&(!state.county||d.county===state.county))};
predictionFill=function(f){const d=predictionDistrictFor(f);if(!d)return'#edf1e9';if(predictionUsesVoteDisplay()){const lead=predictionDisplayResult(d);if(!lead)return'#edf1e9';const p=predictionParty(lead.party),domain=predictionDomain();return predictionUsesGradient()?ElectionCore.shade(p.color,lead.value,domain.min,domain.max):p.color}const result=predictionSummary(d);if(result.status!=='complete')return'#edf1e9';if(state.predictionDisplay==='seats')return result.leadingParties.length===1?predictionParty(result.leadingParties[0].name).color:'#aebdb4';return result.parties.length===1?predictionParty(result.parties[0].name).color:`url(#${predictionPatternId(d)})`};
predictionPartyCounts=function(){const result={},seen=new Set();for(const f of currentItems()){const d=predictionDistrictFor(f);if(!d||seen.has(d.id))continue;seen.add(d.id);if(predictionUsesVoteDisplay()){const lead=predictionDisplayResult(d);if(lead){const p=predictionParty(lead.party);result[p.id]=(result[p.id]||0)+1}continue}const s=predictionSummary(d);if(s.status==='complete')for(const row of s.parties){const p=predictionParty(row.name);result[p.id]=(result[p.id]||0)+row.seats}}return result};
function displayOptions(){return state.predictionOffice==='council'
 ?[['composition','预测席次分布'],['seats','席次最多的政党'],['topVote','最高票者得票（票数／得票率）'],['partyTop','最高票政党合计得票']]
 :[['composition','预测胜选政党'],['topVote','最高票者得票（票数／得票率）']]}
function normalizeVoteDisplay(mode,local=false){
 if(['winnerShare','winnerVotes','leader','share','votes'].includes(mode))return'topVote';
 if(['partyShare','partyVotes'].includes(mode))return'partyTop';
 if(local&&['candidateShare','candidateVotes'].includes(mode))return'candidateVote';
 return mode;
}
function predictionMetricLabel(record){
 if(!record)return'';
 const rate=record.share==null?'':Number(Number(record.share).toFixed(2))+'%';
 return record.votes!==null&&record.votes!==undefined?record.votes.toLocaleString('zh-CN')+' 票'+(rate?' · '+rate:''):rate;
}
predictionLegendCaption=function(){const names=Object.fromEntries(displayOptions());return(state.predictionDisplay==='composition'?(state.predictionOffice==='council'?'色块宽度表示预测席次占比':'使用者选择的当选人所属政党'):names[state.predictionDisplay]||'第一高票所属政党')+(predictionUsesGradient()?'；深浅表示数值，非当选概率':'')};
function predictionCandidateLegendEntries(){
 if(!candidateDatabase)return null;
 // All county-scoped legends summarize by political party, not individual candidate.
 const used=counts();
 const unit=predictionUsesVoteDisplay()?(typeof localPredictionActive==='function'&&localPredictionActive()&&typeof predictionLegendCountUnit==='function'?predictionLegendCountUnit():'区'):(typeof predictionLegendCountUnit==='function'?predictionLegendCountUnit():'席');
 return legendVisiblePalette().filter(p=>used[p.id]).map(p=>({...p,legendSuffix:'（'+used[p.id]+(predictionUsesVoteDisplay()?unit:state.county?'席':unit)+'）'}));
}
function predictionDistrictLabel(d){return (d.county===d.name?d.county:shortDirectoryName(d))+(d.type==='council'?' · '+DistrictCore.identityName(d):'')}
let syncingWorkspace=false;
syncPredictionControls=function(){
 const active=state.fillMode==='prediction',task=state.workspaceMode==='prediction';
 $('predictionMode').classList.toggle('active',active);$('predictionMode').setAttribute('aria-pressed',active);$('predictionControls').hidden=!active;$('predictionOffice').value=state.predictionOffice;
 const options=displayOptions(),select=$('predictionDisplay');state.predictionDisplay=normalizeVoteDisplay(state.predictionDisplay,typeof localPredictionActive==='function'&&localPredictionActive());if(!options.some(([v])=>v===state.predictionDisplay))state.predictionDisplay=options[0][0];
 if(select.dataset.office!==state.predictionOffice){select.replaceChildren(...options.map(([v,l])=>new Option(l,v)));select.dataset.office=state.predictionOffice}select.value=state.predictionDisplay;
 if(!active||!candidateDatabase||!data)return;
 const ds=predictionDistricts(),picker=$('predictionRegion'),old=state.predictionRegion||picker.value,complete=d=>{if(predictionUsesVoteDisplay()){const result=predictionDisplayResult(d);return !!result&&!result.partial}return predictionSummary(d).status==='complete'},visible=$('onlyIncomplete').checked?ds.filter(d=>!complete(d)):ds;picker.replaceChildren();
 for(const county of COUNTY_ORDER){const local=visible.filter(d=>d.county===county);if(!local.length)continue;const group=document.createElement('optgroup');group.label=county;for(const d of local)group.append(new Option(predictionDistrictLabel(d),d.id));picker.append(group)}
 if(visible.some(d=>d.id===old))picker.value=old;$('editPrediction').disabled=!visible.length;$('nextPrediction').disabled=!ds.length;
 const done=ds.filter(complete),seats=predictionUsesVoteDisplay()?0:done.reduce((n,d)=>n+predictionSummary(d).winners.length,0);
 const numeric=ds.filter(d=>directoryCandidates(d).some(c=>{const e=state.predictions[d.id]?.estimates?.[c.id];return e&&(e.votes!==null&&e.votes!==undefined||e.share!==null&&e.share!==undefined)})).length;
 const marks=ds.filter(d=>state.fills[{mayor:'counties',council:'council',township:'towns'}[d.type]][d.mapRegionId]).length;
 $('predictionCoverage').textContent=predictionUsesVoteDisplay()?`得票数据完整 ${done.length}/${ds.length} 区 · 已录入 ${numeric} 区`:`已选当选人 ${done.length}/${ds.length} 区 · 已预测 ${seats} 席 · 已填得票 ${numeric} 区 · 手动标色 ${marks} 区`;
 $('predictionProgressBar').value=ds.length?Math.round(100*done.length/ds.length):0;$('predictionProgressText').textContent=`当前范围已完成 ${done.length}/${ds.length} 个选区（${$('predictionProgressBar').value}%）`;
 const summary=$('predictionSeatSummary');summary.replaceChildren();const counts={};for(const d of done)for(const row of predictionSummary(d).parties)counts[row.name]=(counts[row.name]||0)+row.seats;
 for(const [name,n]of Object.entries(counts)){if(predictionUsesVoteDisplay())continue;const item=dirText('span',name+' '+n+'席');item.style.borderLeft='4px solid '+predictionParty(name).color;summary.append(item)}
 if(task&&!syncingWorkspace)syncWorkspace();
};
const oldEnterPrediction=enterPrediction;
enterPrediction=function(office=state.predictionOffice){const preserveLocal=office===state.predictionOffice&&state.predictionScale==='town'&&['mayor','council'].includes(office);pushHistory();state.workspaceMode='prediction';state.predictionOffice=office;if(!preserveLocal)state.level={mayor:'counties',council:'council',township:'towns'}[office];state.villageTown='';state.fillMode='prediction';erase=false;$('inspectElection').checked=false;try{ensurePredictionParties()}catch(e){toast(e.message)}syncInputs();if(data)render();persist()};
const oldOpenPrediction=openPredictionDistrict;
openPredictionDistrict=function(d){if(!d)return;if($('directoryDialog').open)$('directoryDialog').close();state.workspaceMode='prediction';state.predictionRegion=d.id;erase=false;oldOpenPrediction(d);$('predictionScope').textContent='选区范围：'+d.scope;applyEstimateVisibility();syncDirectoryToDistrict(d)};
const oldPredictionLevelChanged=predictionLevelChanged;
predictionLevelChanged=function(level){oldPredictionLevelChanged(level);if(!electionTypeForLevel[level])state.workspaceMode='free'};
const oldRenderPredictionRows=renderPredictionRows;
renderPredictionRows=function(){oldRenderPredictionRows();applyEstimateVisibility()};
function applyEstimateVisibility(){
 const numeric=predictionUsesVoteDisplay();
 $('showPredictionEstimates').checked=numeric;
 $('predictionDialog').classList.toggle('show-estimates',numeric);
 $('predictionDialog').classList.toggle('numeric-entry',numeric);
 $('predictionMethod').hidden=true
}
const oldUpdatePredictionPreview=updatePredictionPreview;
updatePredictionPreview=function(){oldUpdatePredictionPreview();const d=directoryDistrictById.get(predictionEditId);if(!d)return;if(predictionUsesVoteDisplay()){
 const partyMode=state.predictionDisplay==='partyTop';let result=null,error='';
 try{result=PredictionCore.voteResult(directoryCandidates(d),predictionDraft,partyMode)}catch(e){error=e.message}
 $('predictionPreview').prepend(dirText('p',error|| (result?(partyMode?'最高票政党：'+result.party:'最高票者：'+candidateDisplayName(result.candidate))+' · '+predictionMetricLabel(result)+(result.partial?'（仅按已填写候选人计算）':''):'填写候选人的得票数或得票率，即可显示当前最高票者'),'seat-counter'));return
 }
 const picked=directoryCandidates(d).filter(c=>predictionDraft.winners.includes(c.id));$('predictionPreview').prepend(dirText('p',`已选 ${picked.length} / 应选 ${d.seats} 席 · 已选女性 ${picked.filter(c=>c.gender==='女').length} 人 · 公告妇保 ${d.womenReservedLabel}`,'seat-counter'))};
// Manual painting keeps ordering, removal and creation together in one place.
let draggedPaletteParty='';
function clearPaletteDragMarks(){for(const row of $('palette').children)row.classList.remove('dragging','drag-before','drag-after')}
function palettePartyInUse(p){return LEVELS.some(level=>Object.values(state.elections[level]||{}).some(record=>(record.rows||[]).some(row=>row.partyId===p.id)))||(typeof predictionPaletteInUse==='function'&&predictionPaletteInUse(p))}
function removePaletteParty(p){if(palettePartyInUse(p))return toast('此政党已用于得票或预测数据；请先修改关联数据，也可在图例设置中隐藏');if(state.palette.length===1)return toast('至少保留一个政党');pushHistory();state.palette=state.palette.filter(x=>x.id!==p.id);for(const level of LEVELS)for(const key in state.fills[level])if(state.fills[level][key]===p.id)delete state.fills[level][key];for(const fills of Object.values(state.legislativeTownFills||{}))for(const key in fills)if(fills[key]===p.id)delete fills[key];if(state.selected===p.id)state.selected=state.palette[0].id;state.legend.hidden=state.legend.hidden.filter(id=>id!==p.id);renderPalette();recolor();renderLegend();renderList();updateProgress();updateBrush();persist();toast('已删除'+p.name+'，可用撤销恢复')}
function reorderPaletteParty(id,targetId,after=false){if(!id||id===targetId)return;const from=state.palette.findIndex(p=>p.id===id),target=state.palette.findIndex(p=>p.id===targetId);if(from<0||target<0)return;pushHistory();const scroll=$('palette').scrollTop,[party]=state.palette.splice(from,1);let next=state.palette.findIndex(p=>p.id===targetId)+(after?1:0);state.palette.splice(next,0,party);renderPalette();renderLegend();persist();$('palette').scrollTop=scroll}
renderPalette=function(){const root=$('palette');root.replaceChildren();const c=counts();for(const p of state.palette){const row=dirText('div','','palette-manage-row');row.dataset.party=p.id;const handle=dirText('button','⠿','party-drag-handle');handle.type='button';handle.draggable=true;handle.title='拖动调整顺序；也可用上下方向键';handle.setAttribute('aria-label','拖动调整'+p.name+'顺序');handle.onkeydown=e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();moveParty(p.id,e.key==='ArrowUp'?-1:1)}};handle.ondragstart=e=>{draggedPaletteParty=p.id;row.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',p.id)};handle.ondragend=()=>{draggedPaletteParty='';clearPaletteDragMarks()};const brush=dirText('button','','brush-chip party-brush');brush.type='button';brush.classList.toggle('selected',!erase&&state.selected===p.id);brush.setAttribute('aria-label','选择'+p.name+'画笔');brush.setAttribute('aria-pressed',!erase&&state.selected===p.id);const logoSlot=dirText('span','','party-brush-logo'),emblem=logoFor(p);if(emblem){const img=dirText('img','','party-logo');img.src=emblem;img.alt=p.name+'党徽';logoSlot.append(img)}const sw=dirText('i','');sw.style.background=p.color;const name=dirText('span',p.name,'party-brush-name'),count=dirText('small',String(c[p.id]||0));brush.append(logoSlot,sw,name,count);brush.onclick=()=>setBrush(p.id);const del=dirText('button','×','party-delete');del.type='button';del.title='删除'+p.name+'（可撤销）';del.setAttribute('aria-label','删除'+p.name);del.onclick=e=>{e.stopPropagation();removePaletteParty(p)};row.ondragover=e=>{if(!draggedPaletteParty||draggedPaletteParty===p.id)return;e.preventDefault();e.dataTransfer.dropEffect='move';const before=e.clientY<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;row.classList.toggle('drag-before',before);row.classList.toggle('drag-after',!before)};row.ondragleave=e=>{if(!row.contains(e.relatedTarget))row.classList.remove('drag-before','drag-after')};row.ondrop=e=>{e.preventDefault();const before=e.clientY<row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;const id=draggedPaletteParty||e.dataTransfer.getData('text/plain');draggedPaletteParty='';clearPaletteDragMarks();reorderPaletteParty(id,p.id,!before)};row.append(handle,brush,del);root.append(row)}updateBrush()};
renderList=function(){const root=$('regionList');root.replaceChildren();const query=simplify($('search').value.trim());if(!query){root.append(dirText('p','输入名称查找；也可以直接点击地图。','data-help'));return}const items=currentItems().filter(f=>(f.county+(f.town||'')+f.name).includes(query)).sort((a,b)=>COUNTY_ORDER.indexOf(a.county)-COUNTY_ORDER.indexOf(b.county)||(a.number||0)-(b.number||0));for(const f of items.slice(0,50)){const b=dirText('button',(f.county===f.name?'':f.county+' · ')+f.name,'region-item');b.onclick=()=>{if(state.fillMode==='prediction')openPredictionRegion(f);else{const path=[...$('regions').children].find(p=>p.dataset.region===f.id);path?.focus();toast('已定位：'+f.county+f.name)}};root.append(b)}if(!items.length)root.append(dirText('p','没有匹配的区域','data-help'))};
function syncDirectoryToDistrict(d){$('onlyPendingNumbers').checked=false;$('directoryOffice').value=d?.type||state.predictionOffice;$('directoryCounty').value=d?.county||state.county;$('directorySearch').value='';populateDirectoryDistricts();if(d)$('directoryDistrict').value=d.id;directoryPage=0;renderCandidateDirectory()}
function openDirectory(all=false){$('onlyPendingNumbers').checked=false;if(all){$('directoryOffice').value=state.predictionOffice;$('directoryCounty').value='';populateDirectoryDistricts();$('directoryDistrict').value='';directoryPage=0;renderCandidateDirectory()}else syncDirectoryToDistrict(directoryDistrictById.get($('predictionRegion').value));$('directoryDialog').showModal()}
$('openElectionDirectory').onclick=()=>openDirectory();$('closeDirectory').onclick=()=>$('directoryDialog').close();
const oldLocateDirectory=locateDirectoryDistrict;
locateDirectoryDistrict=function(d){$('directoryDialog').close();oldLocateDirectory(d)};
inspectCandidateRegion=function(f){if(!$('inspectElection').checked)return false;const d=rosterForRegion(f);if(!d)return false;syncDirectoryToDistrict(d);$('directoryDialog').showModal();return true};
function syncWorkspace(){
 if(syncingWorkspace)return;syncingWorkspace=true;const task=state.workspaceMode==='prediction',manual=state.fillMode==='solid';
 $('workspacePrediction').classList.toggle('active',task);$('workspacePrediction').setAttribute('aria-pressed',task);$('workspaceFree').classList.toggle('active',!task);$('workspaceFree').setAttribute('aria-pressed',!task);
 $('predictionOffice').hidden=!task;document.querySelector('label[for="predictionOffice"]').hidden=!task;
 $('councilViewScopeBox').hidden=!(task&&state.fillMode==='prediction'&&state.predictionOffice==='council');$('councilViewScope').value=state.councilViewScope||'all';
 $('freeMapTools').open=!task;$('freeMapTools').hidden=task;$('manualBrushTools').hidden=!manual;$('predictionDisplayBox').hidden=!task||manual;
 $('predictionMode').hidden=!task;$('legacyDataTools').hidden=task;$('solidMode').textContent=task?'按政党手动上色':'直接给地图上色';
 $('predictionPanel').querySelector('h2').textContent=task?'填写预测':'地图上色';$('mapSettings').querySelector('h2').textContent=task?'选举与范围':'地图与范围';
 $('predictionScopeLabel').textContent=task?'2026 用户预测':'自由填色 · 自行录入数据';
 $('predictionGradientRange').hidden=!(task&&state.fillMode==='prediction'&&predictionUsesGradient());
 if(task&&predictionUsesGradient()){$('predictionRangeMin').value=state.gradient.min;$('predictionRangeMax').value=state.gradient.max??(predictionIsVotes()?'':100);$('predictionRangeUnit').textContent=predictionIsVotes()?'票':'%'}
 $('openElectionDirectory').textContent='查看所选区候选人';
 syncingWorkspace=false;
}
let districtTableKey='';
function districtTableRows(){return DistrictCore.filter(DISTRICT_DETAILS[state.level]||[],state.county,simplify($('districtTableSearch').value.trim()))}
function renderDistrictTable(){
 const active=['council','legislative'].includes(state.level);$('districtReference').hidden=!active;if(!active)return;
 const key=[state.level,state.county,$('districtTableSearch').value,state.fillMode].join('/');if(key===districtTableKey)return;districtTableKey=key;
 const rows=districtTableRows(),groups=DistrictCore.groups(rows,COUNTY_ORDER);$('districtReferenceTitle').textContent=(state.county||'全台')+(state.level==='council'?'议员':'立法机构民代')+'选区范围与名额';
 $('districtReferenceSummary').textContent=state.level==='council'?`${rows.length} 个选区，含区域及少数民族选区，按县市合并列示`:`${rows.filter(d=>d.county!=='\u5168\u56fd').length} 个区域选区 + ${rows.filter(d=>d.county==='\u5168\u56fd').length} 个全台少数民族选区`;
 $('districtReferenceNote').textContent=state.level==='council'?'表格包含本范围全部身份选区；地图将区域、平地少数民族、山地少数民族三类并列显示。妇保中的跨区合计按公告原文列示，不能逐区累加。':'立法机构民代范围采用第11届（2024年）资料。自由填色地图分区域、不分区政党、平地少数民族、山地少数民族四类显示并共用图例；后三类可按乡镇市区分别填色。';
 const root=$('districtTableGroups');const open=new Set([...root.querySelectorAll('details[open]')].map(d=>d.dataset.county));root.replaceChildren();
 for(const group of groups){const details=document.createElement('details');details.className='county-district-group';details.dataset.county=group.county;details.open=!!state.county||open.has(group.county)||(!open.size&&group.county===groups[0]?.county);details.append(dirText('summary',group.county+' · '+group.districts.length+'个选区'));
  const wrap=dirText('div','','reference-table-wrap'),table=document.createElement('table');table.className='reference-table';const caption=dirText('caption',group.county+'选区范围、应选名额与妇保名额');table.append(caption);const head=document.createElement('thead'),h=document.createElement('tr');for(const t of ['选区','类别','包含区域／选民范围','应选名额','妇保名额','操作']){const th=dirText('th',t);th.scope='col';h.append(th)}head.append(h);table.append(head);const body=document.createElement('tbody');
  for(const d of group.districts){const tr=document.createElement('tr');tr.dataset.districtId=d.id;const short=d.name.startsWith(d.county)&&d.name!==d.county?d.name.slice(d.county.length):d.name;const name=dirText('th',short);name.scope='row';tr.append(name,dirText('td',DistrictCore.identityName(d)),dirText('td',d.scope,'reference-scope'),dirText('td',String(d.seats),'reference-number'),dirText('td',d.womenReservedLabel??String(d.womenReserved),'reference-quota'));const actions=document.createElement('td'),locate=dirText('button','查看地图');locate.onclick=()=>focusReferenceDistrict(d);actions.append(locate);if(state.level==='council'&&state.workspaceMode==='prediction'){const predict=dirText('button','填写预测');predict.onclick=()=>openPredictionDistrict(directoryDistrictById.get(d.id));actions.append(predict)}tr.append(actions);body.append(tr)}table.append(body);wrap.append(table);details.append(wrap);root.append(details)
 }
 const source=$('districtReferenceSource');source.replaceChildren();const link=dirText('a',state.level==='council'?'资料依据：中选会2026年8月20日选区公告 ↗':'资料依据：中选会第11届立法机构民代选区范围 ↗');link.href=state.level==='council'?'https://www.cec.gov.tw/central/article/63625':'https://www.cec.gov.tw/central/article/39952';link.target='_blank';link.rel='noopener';source.append(link);
}
function focusReferenceDistrict(d){pushHistory();if(d.county!=='\u5168\u56fd')state.county=d.county;syncInputs();render();persist();$('canvas').scrollIntoView({behavior:'smooth',block:'center'});requestAnimationFrame(()=>{const path=[...$('regions').querySelectorAll('path')].find(p=>p.dataset.region===(d.mapRegionId||d.id)&&p.dataset.electorate===DistrictCore.identity(d));path?.focus({preventScroll:true})})}
const originalRender=render;
render=function(){originalRender();syncWorkspace();renderDistrictTable()};
const originalSyncElectionControls=syncElectionControls;
syncElectionControls=function(){originalSyncElectionControls();if($('predictionGradientRange'))syncWorkspace()};
$('workspacePrediction').onclick=()=>enterPrediction();$('workspaceFree').onclick=()=>{pushHistory();state.workspaceMode='free';state.fillMode='solid';erase=false;syncInputs();render();persist()};
$('predictionMode').onclick=()=>{if(state.workspaceMode==='prediction'&&state.fillMode==='prediction')return;enterPrediction()};$('solidMode').onclick=()=>{pushHistory();state.fillMode='solid';erase=false;if(state.workspaceMode==='prediction'&&state.predictionScale!=='town')state.level={mayor:'counties',council:'council',township:'towns'}[state.predictionOffice];syncInputs();render();persist()};
$('predictionOffice').onchange=()=>enterPrediction($('predictionOffice').value);
$('onlyIncomplete').onchange=()=>syncPredictionControls();$('predictionRegion').onchange=()=>{const d=directoryDistrictById.get($('predictionRegion').value);if(d)openPredictionDistrict(d)};
$('showPredictionEstimates').onchange=()=>{
 const numeric=$('showPredictionEstimates').checked;
 pushHistory();state.predictionDisplay=numeric?'topVote':'composition';state.gradient.min=0;state.gradient.max=numeric?100:null;
 applyEstimateVisibility();renderPredictionRows();render();persist()
};$('closePrediction').onclick=()=>$('predictionDialog').close();
$('headerExportPredictions').onclick=()=>exportPredictionCSV(false);$('districtTableSearch').oninput=()=>renderDistrictTable();
$('councilViewScope').onchange=()=>{state.councilViewScope=$('councilViewScope').value;render();persist()};
$('downloadDistrictTable').onclick=()=>{const rows=[['县市','选区','类别','包含区域或选民范围','应选名额','妇保名额','妇保说明'],...districtTableRows().map(d=>[d.county,d.name,DistrictCore.identityName(d),mainlandTerms(d.scope),d.seats,d.womenReservedLabel,mainlandTerms(d.womenReservedNote)])];download(new Blob(['\uFEFF'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),(state.county||'全台')+(state.level==='council'?'议员':'立法机构民代')+'选区范围与名额.csv')};
// Keep legacy standalone data available without presenting a second prediction-data store.
const range=document.createElement('div');range.id='predictionGradientRange';range.innerHTML='<p class="data-help">颜色表示政党，深浅表示数值；不代表当选概率。</p><div class="gradient-range"><label>下限<input id="predictionRangeMin" aria-label="预测着色下限" inputmode="decimal"></label><label>上限<input id="predictionRangeMax" aria-label="预测着色上限" inputmode="decimal" placeholder="票数自动"></label><span id="predictionRangeUnit">%</span></div><button id="applyPredictionRange" class="small-action">应用着色范围</button>';$('predictionDisplayBox').append(range);
$('applyPredictionRange').onclick=()=>{const min=Number($('predictionRangeMin').value||0),raw=$('predictionRangeMax').value,max=raw===''?(predictionIsVotes()?null:100):Number(raw);if(!Number.isFinite(min)||min<0||max!==null&&(!Number.isFinite(max)||max<=min)||!predictionIsVotes()&&(min>=100||max>100))return toast('请填写有效范围；得票率须在0—100%之间');pushHistory();state.gradient.min=min;state.gradient.max=max;render();persist()};
$('predictionDisplay').onchange=()=>{pushHistory();state.predictionDisplay=$('predictionDisplay').value;state.gradient.min=0;state.gradient.max=predictionUsesGradient()?100:null;render();persist()};
// Map and directory can both lead into the same candidate drawer.
const scopeLabel=dirText('span','','eyebrow');scopeLabel.id='predictionScopeLabel';document.querySelector('.map-topbar .eyebrow').replaceWith(scopeLabel);
const allCandidates=dirText('button','查看全部候选人','full-action');allCandidates.id='allCandidates';allCandidates.onclick=()=>openDirectory(true);$('predictionControls').append(allCandidates);
if(!localStorage.getItem(KEY)){state.workspaceMode='prediction';state.fillMode='prediction';state.level='counties'}
syncInputs();syncWorkspace();if(data)render();
// Keep dense edit labels readable. Exports continue to draw every enabled label.
const originalRenderLabels=renderLabels;
renderLabels=function(){if(!data||!view||!state.labels)return originalRenderLabels();if(identityPanelsActive())return originalRenderLabels();if(!state.county&&['towns','council','legislative'].includes(state.level)&&view.w>=sceneSpec().width*.72){drawLabels($('labels'),data.counties,geometryLayout(currentItems(),true),19,false);return}originalRenderLabels()};
const originalApplyView=applyView;
applyView=function(){originalApplyView();if(state.level!=='villages'&&data)requestAnimationFrame(renderLabels)};
// CSV tools stay together in the top Export/Plan menus instead of repeating beside the map.
const planMenu=document.querySelector('.header-menu .menu-popover');
const templateAction=dirText('button','下载预测名单模板');templateAction.onclick=()=>exportPredictionCSV(true);
const importAction=dirText('button','导入预测表格 CSV');importAction.onclick=()=>$('predictionCsvFile').click();planMenu.append(templateAction,importAction);
// Close toolbar menus after an action or a click anywhere outside; opening one menu closes the other.
const headerMenus=[...document.querySelectorAll('.header-menu')];
for(const menu of headerMenus)menu.addEventListener('click',e=>{if(e.target.closest('button,a'))menu.open=false});
document.addEventListener('click',e=>{for(const menu of headerMenus)if(menu.open&&!menu.contains(e.target))menu.open=false});
