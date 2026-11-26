/* Named, local-only map plans. A single storage write commits all plan changes. */
(function(root){
 'use strict';
 const KEY='island-palette-plans-v1',MAX=12;
 const clone=x=>JSON.parse(JSON.stringify(x));
 function name(value){const n=String(value||'').trim();if(!n||n.length>40)throw Error('方案名称须为1至40个字符');return n}
 function validate(bundle){
  if(bundle?.version!==1||!Array.isArray(bundle.plans)||!bundle.plans.length||bundle.plans.length>MAX)throw Error('多方案文件格式不正确');
  const ids=new Set();
  for(const p of bundle.plans){if(typeof p.id!=='string'||!p.id||ids.has(p.id)||!p.project||p.project.version!==1)throw Error('方案编号或内容无效');name(p.name);ids.add(p.id)}
  if(!ids.has(bundle.activeId))throw Error('找不到当前方案');
  return bundle;
 }
 function initial(project){return {version:1,activeId:'original',plans:[{id:'original',name:'原有方案',project:clone(project)}]}}
 function capture(bundle,project){const next=clone(validate(bundle));next.plans.find(p=>p.id===next.activeId).project=clone(project);return next}
 function change(bundle,project,action){
  const next=capture(bundle,project),current=next.plans.find(p=>p.id===next.activeId);
  if(action.type==='create'||action.type==='copy'){
   if(next.plans.length>=MAX)throw Error('最多保存'+MAX+'个方案，请先下载备份');
   if(next.plans.some(p=>p.id===action.id))throw Error('方案编号重复');
   next.plans.push({id:action.id,name:name(action.name),project:clone(action.type==='copy'?current.project:action.project)});next.activeId=action.id;
  }else if(action.type==='switch'){
   if(!next.plans.some(p=>p.id===action.id))throw Error('方案不存在');next.activeId=action.id;
  }else if(action.type==='rename'){current.name=name(action.name)}
  else if(action.type==='delete'){
   if(next.plans.length===1)throw Error('至少保留一个方案');
   if(!next.plans.some(p=>p.id===action.id))throw Error('方案不存在');
   next.plans=next.plans.filter(p=>p.id!==action.id);if(next.activeId===action.id)next.activeId=next.plans[0].id;
  }else throw Error('未知方案操作');
  return validate(next);
 }
 function commit(storage,expected,bundle){
  if(storage.getItem(KEY)!==expected)throw Error('另一标签页已修改方案，请先下载当前备份，再刷新页面');
  const raw=JSON.stringify(validate(bundle));storage.setItem(KEY,raw);return raw;
 }
 // Completion is calculated from the current roster, not the number of saved objects.
 function progress(directory,project,office,core){
  const candidates=new Map(directory.candidates.map(c=>[c.id,c])),counties=new Map();
  const empty=()=>({total:0,winners:0,votes:0,entered:0,invalid:0,seats:0,parties:Object.create(null),incomplete:[],incompleteVotes:[]});
  const all=empty();
  for(const d of directory.districts){if(d.type!==office)continue;
   const cs=d.candidateIds.map(id=>candidates.get(id)).filter(Boolean);let record=project.predictions?.[d.id];
   if(record&&d.excludedCount){const excluded=new Set((directory.excluded||[]).filter(x=>x.districtId===d.id).map(x=>x.candidateId));record={...record,winners:(record.winners||[]).filter(id=>!excluded.has(id)),estimates:Object.fromEntries(Object.entries(record.estimates||{}).filter(([id])=>!excluded.has(id)))}}
   const summary=core.summary(d,cs,record);
   const entries=cs.map(c=>summary.record?.estimates?.[c.id]||{});
   const voteComplete=entries.length>0&&(
    entries.every(e=>Number.isSafeInteger(e.votes)&&e.votes>=0)&&entries.reduce((n,e)=>n+e.votes,0)>0||
    entries.every(e=>Number.isFinite(e.share)&&e.share>=0)&&Math.abs(entries.reduce((n,e)=>n+e.share,0)-100)<=.101);
   if(!counties.has(d.county))counties.set(d.county,empty());
   for(const x of [all,counties.get(d.county)]){
    x.total++;if(record&&(summary.winners.length||Object.keys(summary.record?.estimates||{}).length||summary.status==='invalid'))x.entered++;
    if(summary.status==='complete'){x.winners++;x.seats+=summary.winners.length;for(const p of summary.parties)x.parties[p.name]=(x.parties[p.name]||0)+p.seats}else{x.incomplete.push(d.id)}
    if(voteComplete)x.votes++;else x.incompleteVotes.push(d.id);if(['invalid','quota'].includes(summary.status))x.invalid++;
   }
  }
  return {all,counties};
 }
 // Merge a backup without overwriting an existing plan or changing the current selection.
 function merge(bundle,project,imported,clean){
  const next=capture(bundle,project),source=validate(imported);
  if(next.plans.length+source.plans.length>MAX)throw Error('合并后超过'+MAX+'个方案，请先备份并删除不需要的方案');
  const ids=new Set(next.plans.map(p=>p.id));
  for(const p of source.plans){
   let id=p.id,i=1;
   while(ids.has(id))id=p.id+'-import-'+i++;
   ids.add(id);
   next.plans.push({id,name:name(p.name),project:clone(clean(p.project))});
  }
  return validate(next);
 }
 const api={KEY,MAX,validate,initial,capture,change,commit,progress,merge};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MapPlanStore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
