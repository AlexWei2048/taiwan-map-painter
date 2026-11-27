'use strict';
(()=>{
 const open=$('historyCopyPaint');if(!open)return;
 const dialog=document.createElement('dialog');dialog.id='copyPaintDialog';dialog.className='bulk-paint-dialog';dialog.setAttribute('aria-labelledby','copyPaintTitle');
 dialog.innerHTML='<button type="button" class="dialog-close" id="copyPaintClose" aria-label="关闭复制配色">×</button><h2 id="copyPaintTitle">复制配色到自由填色</h2><p id="copyPaintSource"></p><label class="check"><input type="checkbox" id="copyPaintOverwrite"> 覆盖对应区域的已有颜色</label><p id="copyPaintStatus" role="status"></p><p class="data-help">只复制可可靠对应的政党颜色，不复制票数、得票率或当选名单。缺档、并列及无法对应的区域不改动。已有自定义政党配色优先保留，整批可一次撤销。</p><div class="dialog-actions"><button type="button" class="button quiet" id="copyPaintCancel">取消</button><button type="button" class="button primary" id="copyPaintApply" disabled>复制并打开画布</button></div>';
 document.body.append(dialog);
 const overwrite=$('copyPaintOverwrite'),apply=$('copyPaintApply'),status=$('copyPaintStatus');let source=null;
 function plan(project){
  const entries=[],added=[],palette=project.palette.slice(),store=project.fills[source.level];
  for(const row of source.rows){
   if(store[row.id]&&!overwrite.checked)continue;
   const preset=partyMatch(row.name);
   let p=palette.find(x=>x.name===row.name||preset&&partyMatch(x.name)?.id===preset.id);
   if(!p){let id=predictionPartyKey(row.name),n=0;while(palette.some(x=>x.id===id))id=predictionPartyKey(row.name)+'-copy-'+(++n);
    p={id,name:row.name,color:row.color};added.push(p);palette.push(p)}
   if(store[row.id]!==p.id)entries.push({id:row.id,party:p.id});
  }
  return{entries,added,overflow:palette.length>64};
 }
 function update(){
  if(!source||source.reason){status.textContent=source?.reason||'当前资料尚未准备好。';apply.disabled=true;overwrite.disabled=true;return}
  const result=plan(projectStateForSave());overwrite.disabled=false;apply.disabled=result.overflow||!result.entries.length;
  status.textContent=result.overflow?'复制会超过64种颜色类别，请先整理自由填色的政党列表。':'将修改 '+result.entries.length+' 个区域，新增 '+result.added.length+' 种颜色类别；'+source.skipped+' 个源区域未能安全复制。';
 }
 open.onclick=()=>{
  source=window.History2022View?.copyPaintSource?.()||{reason:'历史资料尚未载入。'};
  $('copyPaintSource').textContent=source.reason?'当前地图暂不支持复制':source.year+'年 · '+source.office+' · '+levelLabel(source.level)+(source.county?' · '+source.county:'');
  overwrite.checked=false;dialog.showModal();update();
 };
 overwrite.onchange=update;
 apply.onclick=()=>{
  if(!source||source.reason||!window.History2022View?.active())return;
  const now=window.History2022View.copyPaintSource();
  if(JSON.stringify(now)!==JSON.stringify(source)){source=now;update();toast('历史地图已变化，请重新核对复制范围');return}
  const result=plan(projectStateForSave());if(result.overflow||!result.entries.length)return;
  const copy=source;dialog.close();
  // The top-level workspace button restores the preserved project without undo.
  $('categoryFuture').click();if(window.History2022View.active())return;
  pushHistory();
  state.workspaceMode='free';state.fillMode='solid';state.level=copy.level;state.county=copy.county||'';state.villageTown='';state.predictionScale='district';erase=false;
  state.palette.push(...result.added);
  for(const row of result.entries)state.fills[copy.level][row.id]=row.party;
  syncInputs();render();persist();toast('已复制 '+result.entries.length+' 个区域的政党颜色，可一次撤销');
 };
 $('copyPaintClose').onclick=$('copyPaintCancel').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(!dialog.open)source=null});
})();
