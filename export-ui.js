'use strict';
(()=>{
 const menu=document.querySelector('.export-menu .menu-popover');
 const layout=document.createElement('label');layout.className='export-select';layout.append(document.createTextNode('导出版式'));
 const select=document.createElement('select');select.id='exportLayout';select.setAttribute('aria-label','导出版式');
 select.add(new Option('完整标注版 · 附密集区域放大图','complete'));select.add(new Option('紧凑分享版 · 保留编号与完整对照表','compact'));layout.append(select);menu.prepend(layout);
 select.onchange=()=>{state.exportSettings.layout=select.value;persist()};
 const previewButton=document.createElement('button');previewButton.id='previewExport';previewButton.textContent='预览图片与尺寸';menu.insertBefore(previewButton,$('exportPng'));
 const dialog=document.createElement('dialog');dialog.className='export-preview-dialog';dialog.id='exportPreviewDialog';dialog.setAttribute('aria-labelledby','exportPreviewTitle');
 dialog.innerHTML='<button class="dialog-close" id="closeExportPreview" aria-label="关闭导出预览">×</button><h2 id="exportPreviewTitle">导出预览</h2><div class="export-preview-options"><label>版式<select id="previewLayout"><option value="complete">完整标注版</option><option value="compact">紧凑分享版</option></select></label><label><input id="previewWinnerTable" type="checkbox"> 添加候选人表格</label></div><p id="exportPreviewStatus" role="status"></p><div class="export-preview-image"><img id="exportPreviewImage" alt="当前地图导出预览"></div><p class="data-help">完整标注版附局部放大图；紧凑版保留主图、编号对照及必要的完整标注。候选人表格和图片注释沿用导出菜单设置。</p><div class="dialog-actions"><button class="button quiet" id="refreshExportPreview">更新预览</button><button class="button quiet" id="previewExportSvg">下载 SVG</button><button class="button primary" id="previewExportPng">下载 PNG</button></div>';
 document.body.append(dialog);let url='';
 function release(){if(url){URL.revokeObjectURL(url);url=''}}
 async function preview(){
  select.value=state.exportSettings.layout||'complete';$('previewLayout').value=select.value;$('previewWinnerTable').checked=state.exportSettings.winnerTable;if(!dialog.open)dialog.showModal();
  $('exportPreviewStatus').textContent='正在准备当前地图与完整标注…';$('exportPreviewImage').hidden=true;$('previewExportPng').disabled=true;
  try{
   await ensureExportMapReady();const source=preparedExportSvg(),doc=new DOMParser().parseFromString(source,'image/svg+xml');
   const width=Number(doc.documentElement.getAttribute('width')),height=Number(doc.documentElement.getAttribute('height'));
   const scale=Math.min(3,Math.floor(16000/Math.max(width,height)),Math.floor(Math.sqrt(55000000/(width*height))));
   release();url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));$('exportPreviewImage').src=url;$('exportPreviewImage').hidden=false;
   $('exportPreviewStatus').textContent=scale<1?`SVG：${Math.round(width)} × ${Math.round(height)}。当前图片超过 PNG 尺寸上限，请下载完整 SVG，或选择紧凑版/取消大表格。`:`PNG：${Math.floor(width*scale)} × ${Math.floor(height*scale)} 像素（${scale}倍清晰度）；SVG 可继续编辑。`;
   $('previewExportPng').disabled=scale<1;
  }catch(error){$('exportPreviewStatus').textContent=error.message||'预览失败，请重试'}
 }
 $('previewLayout').onchange=()=>{state.exportSettings.layout=$('previewLayout').value;persist();preview()};$('previewWinnerTable').onchange=()=>{state.exportSettings.winnerTable=$('previewWinnerTable').checked;$('exportWinnerTable').checked=state.exportSettings.winnerTable;persist();preview()};
 previewButton.onclick=preview;$('refreshExportPreview').onclick=preview;
 $('closeExportPreview').onclick=()=>dialog.close();dialog.addEventListener('close',release);
 $('previewExportSvg').onclick=()=>$('exportSvg').click();$('previewExportPng').onclick=()=>$('exportPng').click();
 const sync=syncInputs;syncInputs=function(){sync();select.value=state.exportSettings.layout||'complete'};select.value=state.exportSettings.layout||'complete';
})();
