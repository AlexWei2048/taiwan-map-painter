'use strict';
(()=>{
 const menu=document.querySelector('.export-menu .menu-popover');
 const previewButton=document.createElement('button');previewButton.id='previewExport';previewButton.textContent='预览与设置';menu.insertBefore(previewButton,$('exportPng'));
 const dialog=document.createElement('dialog');dialog.className='export-preview-dialog';dialog.id='exportPreviewDialog';dialog.setAttribute('aria-labelledby','exportPreviewTitle');
 dialog.innerHTML='<button class="dialog-close" id="closeExportPreview" aria-label="关闭导出预览">×</button><h2 id="exportPreviewTitle">导出预览</h2><div class="export-preview-options"><label><input id="previewWinnerTable" type="checkbox"> 添加候选人表格</label><label>候选人范围<select id="previewCandidateScope"><option value="winners">仅显示当选人</option><option value="all">显示全部候选人</option></select></label><label id="previewCouncilScopeBox" hidden>议员地图范围<select id="previewCouncilScope"><option value="all">区域、平地、山地三个图</option><option value="regional">仅区域</option><option value="plains">仅平地少数民族</option><option value="mountain">仅山地少数民族</option></select></label><label class="preview-note">图片注释（可选）<textarea id="previewNote" maxlength="500" rows="2" placeholder="添加说明后更新预览"></textarea></label></div><p id="exportPreviewStatus" role="status"></p><div class="export-preview-image"><img id="exportPreviewImage" alt="当前地图导出预览"></div><p class="data-help">导出包含主图、完整编号索引、图例及必要的区域标注。PNG适合直接发布，SVG适合继续编辑。</p><div class="dialog-actions"><button class="button quiet" id="refreshExportPreview">更新预览</button><button class="button quiet" id="previewExportSvg">下载 SVG</button><button class="button primary" id="previewExportPng">下载 PNG</button></div>';
 document.body.append(dialog);let url='',revision=0,dirty=false;
 const image=$('exportPreviewImage'),status=$('exportPreviewStatus'),png=$('previewExportPng'),svg=$('previewExportSvg');
 function release(){image.hidden=true;image.removeAttribute('src');if(url){URL.revokeObjectURL(url);url=''}}
 function setReady(pngReady=false,svgReady=false){png.disabled=!pngReady;svg.disabled=!svgReady}
 function sync(){const s=state.exportSettings;$('previewWinnerTable').checked=s.winnerTable;$('previewCandidateScope').value=s.candidateScope||'winners';$('previewCandidateScope').disabled=!s.winnerTable;$('previewCouncilScopeBox').hidden=$('councilExportScopeBox').hidden;$('previewCouncilScope').value=s.councilScope||'all';$('previewNote').value=s.note||''}
 function change(id,value,event='change'){const target=$(id);if(target.type==='checkbox')target.checked=value;else target.value=value;target.dispatchEvent(new Event(event,{bubbles:true}))}
 function applyNote(){if(dirty){change('exportNote',$('previewNote').value,'input');dirty=false}}
 async function preview(){
  applyNote();if(!dialog.open){sync();dialog.showModal()}else{$('previewCandidateScope').disabled=!$('previewWinnerTable').checked}
  const token=++revision;setReady();status.textContent='正在准备当前地图与完整标注…';release();
  try{
   await ensureExportMapReady();if(token!==revision||!dialog.open)return;
   const source=preparedExportSvg(),doc=new DOMParser().parseFromString(source,'image/svg+xml');
   const width=Number(doc.documentElement.getAttribute('width')),height=Number(doc.documentElement.getAttribute('height'));
   if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('图片尺寸无效');
   const scale=Math.min(3,Math.floor(16000/Math.max(width,height)),Math.floor(Math.sqrt(55000000/(width*height))));
   release();url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));image.src=url;image.hidden=false;
   status.textContent=scale<1?`SVG：${Math.round(width)} × ${Math.round(height)}。当前图片超过 PNG 尺寸上限，请下载完整 SVG，或取消候选人表格。`:`PNG：${Math.floor(width*scale)} × ${Math.floor(height*scale)} 像素（${scale}倍清晰度）；SVG 可继续编辑。`;
   setReady(scale>=1,true);
  }catch(error){if(token===revision&&dialog.open){release();status.textContent=error.message||'预览失败，请重试';setReady()}}
 }
 $('previewWinnerTable').onchange=()=>{change('exportWinnerTable',$('previewWinnerTable').checked);preview()};
 $('previewCandidateScope').onchange=()=>{change('exportCandidateScope',$('previewCandidateScope').value);preview()};
 $('previewCouncilScope').onchange=()=>{change('councilExportScope',$('previewCouncilScope').value);preview()};
 $('previewNote').oninput=()=>{dirty=true;revision++;release();setReady();status.textContent='注释已修改，请更新预览后下载。'};
 previewButton.onclick=preview;$('refreshExportPreview').onclick=preview;
 $('closeExportPreview').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(!dialog.open){revision++;dirty=false;release();setReady()}});
 svg.onclick=()=>{if(!svg.disabled)$('exportSvg').click()};png.onclick=()=>{if(!png.disabled)$('exportPng').click()};
})();
