'use strict';
/* Plan management UI; storage and project lifecycle remain owned by app.js. */
function renderPlanComparison(bundle=planBundle||MapPlanStore.initial(state)){
 const host=$('planComparison');if(!host)return;host.replaceChildren();
 if(typeof candidateDatabase==='undefined'||!candidateDatabase||typeof PredictionCore==='undefined')return;
 const office=$('planComparisonOffice').value,metric=$('planCompletionMetric').value;
 const items=bundle.plans.map(p=>({p,summary:MapPlanStore.progress(candidateDatabase,p.id===bundle.activeId?state:p.project,office,PredictionCore)}));
 const make=(tag,value)=>{const node=document.createElement(tag);node.textContent=String(value);return node};
 const cell=(row,tag,value)=>{const el=make(tag,value);row.append(el);return el};
 const table=document.createElement('table');table.className='history-candidate-table plan-comparison-table';
 const head=document.createElement('thead'),hr=document.createElement('tr');
 for(const name of ['方案','胜负完成','得票完成','已完成席次','待复核选区'])cell(hr,'th',name);head.append(hr);table.append(head);
 const body=document.createElement('tbody');
 for(const {p,summary:{all}} of items){const row=document.createElement('tr');cell(row,'th',p.name);cell(row,'td',all.winners+'/'+all.total);cell(row,'td',all.votes+'/'+all.total);cell(row,'td',all.seats);cell(row,'td',all.invalid);body.append(row)}
 table.append(body);host.append(make('h3','方案对比'),table);
 const parties=[...new Set(items.flatMap(({summary})=>Object.keys(summary.all.parties)))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
 if(parties.length){
  const t=document.createElement('table');t.className='history-candidate-table plan-comparison-table';const h=document.createElement('thead'),r=document.createElement('tr');cell(r,'th','政党');for(const {p} of items)cell(r,'th',p.name);h.append(r);t.append(h);
  const b=document.createElement('tbody');for(const party of parties){const row=document.createElement('tr');cell(row,'th',party);for(const {summary} of items)cell(row,'td',summary.all.parties[party]||0);b.append(row)}t.append(b);host.append(make('h4','各方案已完成选区席次'),t)
 }
 const current=items.find(({p})=>p.id===bundle.activeId)?.summary;
 if(!current)return;host.append(make('h3','当前方案 · 各县市进度'));
 const counties=document.createElement('table');counties.className='history-candidate-table plan-comparison-table';const h=document.createElement('thead'),r=document.createElement('tr');for(const n of ['县市','胜负完成','得票完成','操作'])cell(r,'th',n);h.append(r);counties.append(h);const b=document.createElement('tbody');
 const byId=new Map(candidateDatabase.districts.map(d=>[d.id,d]));
 for(const county of [...current.counties.keys()].sort((a,b)=>COUNTY_ORDER.indexOf(a)-COUNTY_ORDER.indexOf(b))){
  const row=document.createElement('tr'),x=current.counties.get(county);cell(row,'th',county);cell(row,'td',x.winners+'/'+x.total);cell(row,'td',x.votes+'/'+x.total);
  const td=cell(row,'td',''),button=make('button','补填选区');button.type='button';button.className='button quiet';
  const ids=metric==='votes'?x.incompleteVotes:x.incomplete;button.disabled=!ids.length;
  button.onclick=()=>{const d=byId.get(ids[0]);if(!d)return;$('planDialog').close();state.workspaceMode='prediction';state.county=d.county;state.predictionOffice=d.type;state.predictionScale='district';state.level={mayor:'counties',council:'council',township:'towns'}[d.type];state.fillMode='prediction';openPredictionDistrict(d);persist()};td.append(button);b.append(row)
 }
 counties.append(b);host.append(counties);
 const note=make('p','仅统计当前名册及有效输入；胜负完成沿用选区校验，得票完成须填齐同一指标且票数合计大于0或得票率合计约100%。未完成选区不计入政党席次；跨区妇保仍需另行复核。');note.className='data-help';host.append(note);
}
function refreshPlanManager(){
 const list=$('planList');if(!list)return;
 const bundle=planBundle||MapPlanStore.initial(state);
 const select=$('activePlanSelect');select.replaceChildren(...bundle.plans.map(p=>new Option(p.name,p.id)));select.value=bundle.activeId;
 $('planNameInput').value=currentPlanName();$('planDelete').disabled=bundle.plans.length===1;
 $('planCreate').disabled=$('planCopy').disabled=bundle.plans.length>=MapPlanStore.MAX;
 $('planCurrentName').textContent=currentPlanName();
 $('planRawBackup').hidden=!(planStorageBlocked||legacyStorageBlocked);
 $('planBackupAll').disabled=planStorageBlocked||(!planBundle&&legacyStorageBlocked);
 list.replaceChildren();
 for(const p of bundle.plans){
  const row=document.createElement('div');row.className='plan-list-row';
  const title=document.createElement('strong');title.textContent=p.name+(p.id===bundle.activeId?'（当前）':'');row.append(title);
  const project=p.id===bundle.activeId?state:p.project;
  const counts=document.createElement('span');counts.textContent=Object.keys(project.predictions||{}).length+' 个选区已录入';row.append(counts);
  const save=document.createElement('button');save.type='button';save.className='button quiet';save.textContent='下载 JSON';save.onclick=()=>download(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),p.name.replace(/[\\/:*?"<>|]/g,'_')+'.json');row.append(save);list.append(row);
 }
 if(typeof renderPlanComparison==='function')renderPlanComparison(bundle);
}
function handlePlan(action){try{applyPlanAction(action);$('planError').textContent=''}catch(e){$('planError').textContent=e.message||'方案操作失败';$('activePlanSelect').value=planBundle?.activeId||'original'}}
$('planComparisonOffice').onchange=()=>renderPlanComparison();$('planCompletionMetric').onchange=()=>renderPlanComparison();
$('managePlans').onclick=()=>{if(window.History2022View?.active()){toast('请先返回岛屿画布');return}$('planError').textContent='';$('planComparisonOffice').value=state.predictionOffice;refreshPlanManager();$('planDialog').showModal()};
$('activePlanSelect').onchange=()=>handlePlan({type:'switch',id:$('activePlanSelect').value});
$('planRename').onclick=()=>handlePlan({type:'rename',name:$('planNameInput').value});
$('planCreate').onclick=()=>handlePlan({type:'create',id:'plan-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name:$('planNameInput').value,project:defaults()});
$('planCopy').onclick=()=>handlePlan({type:'copy',id:'plan-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),name:$('planNameInput').value.trim().slice(0,36)+'（副本）'});
$('planDelete').onclick=()=>{if(confirm('删除当前方案「'+currentPlanName()+'」？其他方案不会被删除。'))handlePlan({type:'delete',id:planBundle?.activeId||'original'})};
$('planCurrentName').textContent=currentPlanName();

// Backup does not alter stored plans. The active in-memory edits are included.
$('planBackupAll').onclick=()=>{
 try{
  const bundle=MapPlanStore.capture(planBundle||MapPlanStore.initial(state),projectStateForSave());
  download(new Blob([JSON.stringify(bundle,null,2)],{type:'application/json'}),'岛屿调色盘-全部方案.json');
 }catch(e){$('planError').textContent=e.message}
};
$('planRawBackup').onclick=()=>{
 const raw={version:1,legacy:legacyRaw,plans:planRaw};
 try{raw.legacy=localStorage.getItem(KEY);raw.plans=localStorage.getItem(MapPlanStore.KEY)}catch(e){/* preserve last readable values */}
 download(new Blob([JSON.stringify(raw,null,2)],{type:'application/json'}),'岛屿调色盘-原始存储备份.json');
};
