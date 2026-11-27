'use strict';
(()=>{
 const open=$('bulkPaintOpen');if(!open)return;
 const dialog=document.createElement('dialog');dialog.id='bulkPaintDialog';dialog.className='bulk-paint-dialog';dialog.setAttribute('aria-labelledby','bulkPaintTitle');
 dialog.innerHTML='<button type="button" class="dialog-close" id="bulkPaintClose" aria-label="关闭批量填色">×</button><h2 id="bulkPaintTitle">批量填色</h2><p id="bulkPaintLayer" class="data-help"></p><label for="bulkPaintCounty">地区范围</label><select id="bulkPaintCounty"></select><label for="bulkPaintParty">填色方式</label><select id="bulkPaintParty"></select><label class="check"><input type="checkbox" id="bulkPaintOverwrite"> 覆盖已有颜色</label><p id="bulkPaintStatus" role="status"></p><p class="data-help">只修改当前图层的手动颜色，不改变候选人、预测或其他图层。整批操作可一次撤销。</p><div class="dialog-actions"><button type="button" class="button quiet" id="bulkPaintCancel">取消</button><button type="button" class="button primary" id="bulkPaintApply" disabled>应用填色</button></div>';
 document.body.append(dialog);
 const county=$('bulkPaintCounty'),party=$('bulkPaintParty'),overwrite=$('bulkPaintOverwrite'),status=$('bulkPaintStatus'),apply=$('bulkPaintApply');
 let context=null;
 const valid=()=>data&&state.workspaceMode==='free'&&state.fillMode==='solid'&&['counties','towns','council','legislative'].includes(state.level);
 function targets(){
  if(!valid()||!context||context.level!==state.level||context.county!==state.county||!county.value)return [];
  const area=county.value==='*'?'':county.value,store=state.fills[state.level];
  // At nationwide scope, use actual underlying features, not county summary polygons.
  const source=state.level==='legislative'?(data.legislative||[]).filter(f=>featureElectorate(f)==='regional'):allLayerItems(state.level);
  const unique=new Map();
  for(const f of source){
   // County-scoped actions may never paint a statewide shared constituency.
   if(area&&(f.statewide||(f.county||f.name)!==area))continue;
   if(f.id!==undefined&&f.id!==null)unique.set(String(f.id),f);
  }
  const id=party.value==='__clear__'?null:party.value;
  if(id&&!paletteById(id))return [];
  return [...unique.keys()].filter(key=>id?(overwrite.checked||!store[key])&&store[key]!==id:!!store[key]);
 }
 function update(){
  const clear=party.value==='__clear__';overwrite.disabled=clear;
  const keys=targets();apply.disabled=!keys.length;
  apply.textContent=clear?'清除颜色':'应用填色';
  status.textContent=!county.value?'请选择地区范围。':keys.length?'将'+(clear?'清除':'修改')+' '+keys.length+' 个区域的颜色。':'当前条件下没有需要修改的区域。';
  if(county.value==='*'&&keys.length)status.textContent+=' 此操作涉及全部地区。';
 }
 open.onclick=()=>{
  if(!valid())return;
  if(!data[state.level]?.length){toast('请先等待当前地图图层载入完成');return}
  context={level:state.level,county:state.county};
  $('bulkPaintLayer').textContent='当前图层：'+levelLabel(state.level)+(state.county?' · '+state.county:'');
  county.replaceChildren(new Option('请选择县市',''),...COUNTY_ORDER.filter(name=>data.counties.some(f=>f.name===name)).map(name=>new Option(mainlandTerms(name),name)),new Option('全部地区（含金门、马祖）','*'));
  county.value=state.county||'';county.disabled=!!state.county;
  party.replaceChildren(...state.palette.map(p=>new Option(mainlandTerms(p.name),p.id)),new Option('清除已有颜色','__clear__'));
  party.value=erase?'__clear__':state.selected;overwrite.checked=false;
  dialog.showModal();update();
 };
 county.onchange=party.onchange=overwrite.onchange=update;
 apply.onclick=()=>{
  const keys=targets();if(!keys.length){update();return}
  const id=party.value==='__clear__'?null:party.value,store=state.fills[state.level];
  pushHistory();for(const key of keys){if(id)store[key]=id;else delete store[key]}
  dialog.close();render();persist();toast('已'+(id?'填色':'清除')+' '+keys.length+' 个区域，可一次撤销');
 };
 $('bulkPaintClose').onclick=$('bulkPaintCancel').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{if(!dialog.open)context=null});
})();
