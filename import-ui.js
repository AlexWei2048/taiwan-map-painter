'use strict';
(()=>{
 const dialog=document.createElement('dialog');dialog.className='import-preview-dialog';dialog.id='predictionImportPreview';dialog.setAttribute('aria-labelledby','predictionImportTitle');
 dialog.innerHTML='<h2 id="predictionImportTitle">核对预测表格导入</h2><label class="label">空白单元格如何处理<select id="predictionImportPolicy"><option value="merge">保留已有数据（推荐）</option><option value="replace">替换整区记录 · 允许清空旧值</option></select></label><p id="predictionImportSummary" role="status"></p><ul id="predictionImportAreas"></ul><p class="form-error" id="predictionImportError" role="alert"></p><div class="dialog-actions"><button class="button quiet" id="cancelPredictionImport">取消</button><button class="button primary" id="confirmPredictionImport">确认导入</button></div>';
 document.body.append(dialog);let pending=null,prepared=null;
 const comparable=record=>JSON.stringify({winners:record?.winners||[],leaderId:record?.leaderId||'',estimates:record?.estimates||{}});
 function update(){
  prepared=null;$('predictionImportError').textContent='';$('predictionImportAreas').replaceChildren();$('confirmPredictionImport').disabled=true;
  if(!pending)return;const replace=$('predictionImportPolicy').value==='replace',records={};let changed=0,cleared=0;
  try{
   for(const [id,incoming]of Object.entries(pending.records)){
    const previous=pending.local?state.localPredictions[pending.districtId]?.[id]:state.predictions[id];
    let record=ImportCore.merge(previous,incoming,replace);
    const d=directoryDistrictById.get(pending.local?pending.districtId:id),cs=directoryCandidates(d);
    if(pending.local){record.totalVotes=PredictionCore.tallyVotes(cs.map(c=>record.estimates?.[c.id]?.votes)).total;const valid=TownPredictionCore.validate(cs,record,d.type==='mayor');const{completeVotes,completeShares,denominator,...stored}=valid;record=stored;}
    else{record=PredictionCore.validate(d,cs,record);if(PredictionCore.summary(d,cs,record).status==='quota')throw Error(d.county+shortDirectoryName(d)+'的当选选择未满足妇保名额');}
    if(comparable(previous)===comparable(record))continue;
    changed++;cleared+=ImportCore.removed(previous,record);records[id]=record;
    const li=document.createElement('li');li.textContent=pending.local?(data.towns.find(f=>f.id===id)?.name||id):d.county+' · '+shortDirectoryName(d);$('predictionImportAreas').append(li);
   }
   $('predictionImportSummary').textContent=`将更新 ${changed} 个${pending.local?'乡镇市区':'选区'}，移除 ${cleared} 项已有选择或得票值。`+(replace?'本次将按完整CSV记录替换这些区域。':'空白单元格保留旧值；明确填写0仍会保存为0。');
   const names=new Set(predictionPartyNamesInUse());for(const record of Object.values(records))for(const id of [...(record.winners||[]),record.leaderId,...Object.keys(record.estimates||{})].filter(Boolean)){const c=candidateById.get(id);if(c)names.add(c.party)}const missing=new Set([...names].map(predictionParty).filter(p=>!state.palette.some(existing=>existing.id===p.id)).map(p=>p.id));if(state.palette.length+missing.size>64)throw Error('颜色类别已达上限，请先合并不使用的类别');prepared=records;$('confirmPredictionImport').disabled=!changed;
  }catch(error){$('predictionImportError').textContent=error.message}
 }
 async function read(file,local){
  if(!file)return;
  try{
   if(file.size>(local?8000000:5000000))throw Error('预测CSV文件过大');
   const text=await file.text(),parsed=local?prepareLocalImport(text):{records:preparePredictionImport(text)};
   pending={...parsed,local};$('predictionImportPolicy').value='merge';update();dialog.showModal();
  }catch(error){toast(error.message)}
 }
 $('predictionCsvFile').onchange=async event=>{try{await read(event.target.files[0],false)}finally{event.target.value=''}};
 $('localCSVFile').onchange=async event=>{try{await read(event.target.files[0],true)}finally{event.target.value=''}};
 $('predictionImportPolicy').onchange=update;$('cancelPredictionImport').onclick=()=>dialog.close();
 $('confirmPredictionImport').onclick=()=>{
  if(!prepared||!pending)return;pushHistory();const count=Object.keys(prepared).length;
  for(const record of Object.values(prepared))record.updatedAt=new Date().toISOString();
  if(pending.local){state.localPredictions[pending.districtId]||={};Object.assign(state.localPredictions[pending.districtId],prepared)}else Object.assign(state.predictions,prepared);
  ensurePredictionParties();dialog.close();render();persist();toast('已导入'+count+'个'+(pending.local?'乡镇市区':'选区')+'预测，可撤销恢复');
 };
 dialog.addEventListener('close',()=>{pending=null;prepared=null});
})();
