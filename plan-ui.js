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
 if(items.length>1){
  const area=document.createElement('section');area.className='plan-pair-comparison';area.append(make('h3','选区级方案差异'));
  const controls=document.createElement('div');controls.className='plan-form';const a=document.createElement('select'),b=document.createElement('select');
  for(const s of [a,b])s.replaceChildren(...items.map(({p})=>new Option(p.name,p.id)));
  a.value=bundle.activeId;b.value=items.find(({p})=>p.id!==a.value).p.id;
  for(const [name,s] of [['方案 A',a],['方案 B',b]]){const label=make('label',name);label.append(s);controls.append(label)}
  const output=document.createElement('div');output.className='observation-scroll';area.append(controls,output);
  function show(){output.replaceChildren();const project=id=>id===bundle.activeId?state:bundle.plans.find(p=>p.id===id).project;
   if(a.value===b.value){output.append(make('p','请选择两个不同的方案。'));return}
   const rows=MapPlanStore.compare(candidateDatabase,project(a.value),project(b.value),office,PredictionCore);
   const comparable=rows.filter(r=>r.different!==null),changed=comparable.filter(r=>r.different),pending=rows.length-comparable.length;
   output.append(make('p','双方已完成 '+comparable.length+' 区；预测当选名单不同 '+changed.length+' 区；尚不可比 '+pending+' 区。'));
   const t=document.createElement('table');t.className='history-candidate-table';const h=document.createElement('thead'),r=document.createElement('tr');for(const n of ['县市','选区','方案 A 当选预测','方案 B 当选预测','当选差异','最大得票率差（百分点）'])cell(r,'th',n);h.append(r);t.append(h);const body=document.createElement('tbody');
   const status=s=>s.status==='complete'?s.winners.map(c=>c.name+'（'+c.party+'）').join('、'):'未完成／待复核';
   for(const x of rows.filter(x=>x.different!==false||x.maxShareChange>0.0001).sort((a,b)=>COUNTY_ORDER.indexOf(a.county)-COUNTY_ORDER.indexOf(b.county))){const row=document.createElement('tr');for(const v of [x.county,x.district,status(x.left),status(x.right),x.different===null?'不可比':x.different?'不同':'相同',x.maxShareChange===null?'—':x.maxShareChange.toFixed(2)])cell(row,'td',v);body.append(row)}
   t.append(body);output.append(t)
  }a.onchange=b.onchange=show;show();host.append(area);
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

$('planImportAll').onclick=()=>$('planBundleFile').click();
$('planBundleFile').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>30000000)throw Error('备份文件过大');
  const imported=MapPlanStore.validate(JSON.parse(await file.text()));
  if(!$('planDialog').open)throw Error('请重新打开方案管理');
  if(!confirm('将备份中的 '+imported.plans.length+' 个方案追加至本机？原有方案保留。'))return;
  importPlanBundle(imported);$('planError').textContent='';
 }catch(error){$('planError').textContent=error.message||'无法读取备份'}finally{e.target.value=''}
};

/* The URL contains a snapshot only after explicit consent, and import is additive. */
if($('planShareLink'))$('planShareLink').onclick=async()=>{
 const output=$('planShareOutput'),link=$('planShareText');output.hidden=true;
 if(!confirm('生成的链接包含当前方案的预测、备注、填色和自定义设置。拿到链接的人可以读取这些资料；不会上传到服务器。确认生成？'))return;
 try{const hash=await MapPlanShare.encode({name:currentPlanName(),project:cleanProject(projectStateForSave())});link.value=location.origin+location.pathname+hash;output.hidden=false;link.select();try{await navigator.clipboard.writeText(link.value);toast('已复制分享链接')}catch(e){toast('已生成链接，请手动复制')}}catch(e){$('planError').textContent=e.message||'生成链接失败'}
};
window.PlanShareUI={async receive(hash){
 const p=await MapPlanShare.decode(hash),clean=cleanProject(p.project);
 if(!confirm('收到预测方案「'+p.name+'」。是否追加到本机方案列表？原有方案不变。'))return false;
 if(window.History2022View?.active())$('workspacePrediction').click();
 const id='shared-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);
 importPlanBundle({version:1,activeId:id,plans:[{id,name:p.name,project:clean}]});return true
}};
