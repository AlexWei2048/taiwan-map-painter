/* Forecast snapshots live separately from the editable map project.
 * They are browser-local backup records, not cryptographic proof of creation time.
 */
(function(root){
'use strict';
const KEY='island-palette-forecast-archives-v1',MAX=30;
const $=id=>document.getElementById(id);
const clone=x=>JSON.parse(JSON.stringify(x));
let archives=[],activeComparison=null,hasLoaded=false;
function text(tag,value,cls=''){
 const el=document.createElement(tag);
 el.textContent=String(value);
 if(cls)el.className=cls;
 return el;
}
function read(){
 if(hasLoaded)return archives;
 hasLoaded=true;
 try{
  const value=JSON.parse(localStorage.getItem(KEY)||'[]');
  archives=Array.isArray(value)?value.filter(x=>x&&x.kind===ForecastArchiveCore.KIND&&x.version===1).slice(0,MAX):[];
 }catch(e){archives=[];setStatus('封存资料读取失败，建议保留已有JSON备份。')}
 return archives;
}
function setStatus(s){const node=$('forecastArchiveStatus');if(node)node.textContent=s}
function store(next){
 if(next.length>MAX)throw Error('最多封存30个版本，请先导出并整理旧版本');
 const data=JSON.stringify(next);
 if(data.length>4500000)throw Error('封存占用空间过大，请先下载旧快照备份');
 localStorage.setItem(KEY,data);archives=next;
}
function triggerDownload(data,name){
 const b=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json;charset=utf-8'});
 const url=URL.createObjectURL(b),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function getArchive(id){return read().find(x=>x.id===id)}
function archiveLabel(archive){
 const parsed=new Date(archive.createdAt);
 return Number.isNaN(parsed.getTime())?archive.createdAt:parsed.toLocaleString('zh-CN',{hour12:false});
}
function create(){
 try{
  const label=$('forecastArchiveLabel').value.trim();
  const note=$('forecastArchiveNote').value.trim();
  const archive=ForecastArchiveCore.capture(state,candidateDatabase,{label:label||'我的选前预测',note});
  const stats=ForecastArchiveCore.coverage(archive,candidateDatabase);
  if(!stats.districtsRecorded&&!stats.localAreas)throw Error('当前还没有任何已保存的预测，请先完成至少一个选区');
  store([archive,...read()]);
  $('forecastArchiveLabel').value='';$('forecastArchiveNote').value='';
  activeComparison=null;
  render();
  setStatus('已封存 '+archiveLabel(archive)+' 的预测，独立于当前可编辑地图。请下载JSON做跨设备备份。');
 }catch(error){setStatus('封存未成功：'+error.message)}
}
function remove(id){
 const archive=getArchive(id);
 if(!archive||!window.confirm('删除本机封存“'+archive.label+'”？此操作不会删除当前正在编辑的预测，但无法撤销。'))return;
 try{store(read().filter(x=>x.id!==id));if(activeComparison?.archiveId===id)activeComparison=null;
  render();setStatus('本机封存已删除，当前预测不受影响。')}catch(error){setStatus(error.message)}
}
function restore(id){
 const archived=getArchive(id);
 if(!archived)return;
 try{
  const good=ForecastArchiveCore.validate(archived,candidateDatabase);
  if(!window.confirm('确定将“'+good.label+'”恢复为当前编辑中的2026预测？\n当前未导出的编辑结果会被替换，但已保存的封存版本不会更改。建议先下载当前方案备份。'))return;
  pushHistory();
  state.predictions=clone(good.predictions);
  state.localPredictions=clone(good.localPredictions);
  ensurePredictionParties();
  render();persist();
  setStatus('已恢复到当前可编辑预测，原封存仍保持不变。');
 }catch(error){setStatus('恢复失败：'+error.message)}
}
async function readOfficial(){
 const manifestResponse=await fetch('assets/history-2026-availability.json',{cache:'no-store'});
 if(!manifestResponse.ok)throw Error('正式结果发布状态尚无法核查');
 const manifest=await manifestResponse.json();
 if(manifest.status!=='published'||manifest.year!==2026||!/^[a-f0-9]{64}$/i.test(manifest.sha256||''))
  throw Error('2026年正式得票结果尚未发布，暂不能计算预测准确率');
 const response=await fetch('assets/history-2026.json?v='+manifest.sha256.slice(0,16),{cache:'no-store'});
 if(!response.ok)throw Error('2026年正式结果文件尚不可用');
 const body=await response.arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(hash.toLowerCase()!==manifest.sha256.toLowerCase())throw Error('正式结果文件摘要不匹配，不能据此复盘');
 const actual=JSON.parse(new TextDecoder().decode(body));
 if(actual.candidacies?.length!==manifest.candidateCount||actual.contests?.length!==manifest.districtCount)
  throw Error('正式结果文件候选人与选区数量不一致');
 return actual;
}
async function compare(id){
 const archived=getArchive(id);if(!archived)return;
 const button=$('forecastArchiveCompare');
 if(button)button.disabled=true;
 setStatus('正在核验2026年正式结果的来源和数据完整性…');
 try{
  const checked=ForecastArchiveCore.validate(archived,candidateDatabase);
  const official=await readOfficial();
  activeComparison=ForecastArchiveCore.compare(checked,official,
   {...candidateDatabase,towns:data?.towns||[]});
  render();setStatus('复盘完成：仅对填写完整、且官方结果能精确匹配候选人ID的选区计分。');
 }catch(error){activeComparison=null;render();setStatus('暂不能复盘：'+error.message)}
}
function downloadReviewPng(result,label='我的2026预测'){
 if(!result||result.electionYear!==2026)throw Error('尚无可导出的官方结果复盘');
 const canvas=document.createElement('canvas');canvas.width=1180;canvas.height=900;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('浏览器不支持图片导出');
 ctx.fillStyle='#f5f8f4';ctx.fillRect(0,0,1180,900);
 ctx.fillStyle='#295d4a';ctx.fillRect(0,0,1180,13);
 ctx.fillStyle='#244938';ctx.font='bold 55px system-ui,sans-serif';ctx.fillText('2026 选举预测复盘',60,113);
 ctx.fillStyle='#537261';ctx.font='27px system-ui,sans-serif';
 ctx.fillText(String(label).slice(0,29),60,158);
 ctx.fillText(result.sourceStatus==='certified'?'对比：正式公告结果':'对比：开票暂定结果',60,198);
 const p=n=>n===null?'暂无可比数据':n.toFixed(2)+'%';
 const pairs=[
  ['已评估完整选区',result.districtsEvaluated+'个'],['名单全部预测正确',result.districtsExact+'个'],
  ['选区预测准确率',p(result.districtAccuracy)],['当选席次命中率',p(result.winnerSeatAccuracy)],
  ['正确预测的当选席次',result.seatHits+' / '+result.seatsEvaluated+'席'],
  ['政党席次绝对误差',result.partySeatError+'席'],
  ['得票数平均绝对误差',result.voteMAE===null?'暂无可比数据':Math.round(result.voteMAE).toLocaleString('zh-CN')+'票'],
  ['得票率平均绝对误差',result.shareMAE===null?'暂无可比数据':result.shareMAE.toFixed(2)+'个百分点']
 ];
 for(let i=0;i<pairs.length;i++){
  const x=60+(i%2)*550,y=234+Math.floor(i/2)*129;
  ctx.fillStyle='#fff';ctx.fillRect(x,y,518,109);
  ctx.strokeStyle='#d9e5da';ctx.strokeRect(x,y,518,109);
  ctx.fillStyle='#587361';ctx.font='23px system-ui,sans-serif';ctx.fillText(pairs[i][0],x+17,y+37);
  ctx.fillStyle='#28533e';ctx.font='bold 34px system-ui,sans-serif';ctx.fillText(pairs[i][1],x+17,y+84);
 }
 ctx.fillStyle='#567062';ctx.font='22px system-ui,sans-serif';
 ctx.fillText('未填写完整的预测不计分，缺失官方资料不推算。',60,790);
 ctx.fillText('有效对比的得票预测：票数'+result.voteEstimatesCompared+'项；得票率'+result.shareEstimatesCompared+'项。',60,825);
 ctx.font='20px system-ui,sans-serif';ctx.fillStyle='#779080';
 ctx.fillText('岛屿调色盘 · 本机封存时间并非经第三方认证',60,864);
 canvas.toBlob(blob=>{
  if(!blob)return setStatus('图片生成失败，请下载JSON复盘报告');
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='2026选举预测复盘-'+result.archiveId+'.png';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 },'image/png');
}
function comparisonPanel(result){
 const node=document.createElement('section');node.className='forecast-review';
 node.append(text('h4','选后复盘 · '+(result.sourceStatus==='certified'?'已公告结果':'开票暂定结果')));
 if(!result.districtsEvaluated){
  node.append(text('p','没有可比较的完整选区预测，或官方候选人身份尚未逐项匹配。'));
  return node;
 }
 const fmt=n=>n===null?'暂无数据':n.toFixed(2)+'%';
 const list=document.createElement('div');list.className='forecast-review-grid';
 for(const [label,value] of [
  ['完整预测选区',result.districtsEvaluated+'个'],
  ['选区当选名单全中',result.districtsExact+'个'],
  ['选区胜负准确率',fmt(result.districtAccuracy)],
  ['正确预测的席位',result.seatHits+' / '+result.seatsEvaluated],
  ['席位命中率',fmt(result.winnerSeatAccuracy)],
  ['政党席次绝对误差',result.partySeatError+'席'],
  ['得票数平均绝对误差',result.voteMAE===null?'暂无数据':Math.round(result.voteMAE).toLocaleString('zh-CN')+'票（'+result.voteEstimatesCompared+'项）'],
  ['得票率平均绝对误差',result.shareMAE===null?'暂无数据':result.shareMAE.toFixed(2)+'个百分点（'+result.shareEstimatesCompared+'项）']
 ]){
  const card=text('div',label+'：'+value,'forecast-review-stat');list.append(card);
 }
 node.append(list);
 node.append(text('p','未评估：未填写 '+result.skippedNoPrediction+
  ' 区，席次未填齐 '+result.skippedIncomplete+' 区，官方记录不匹配 '+
  result.skippedUnmatchedOfficial+' 区。所有准确率仅以实际参与评估的预测为分母。','data-help'));
 if(result.local.evaluated)node.append(text('p','乡镇市区最高票预测：'+result.local.correct+' / '+result.local.evaluated+
  ' 个有完整官方逐候选人乡镇得票的地区匹配。','data-help'));
 if(result.local.skipped)node.append(text('p','另有 '+result.local.skipped+
  ' 条乡镇预测缺少可核官方乡镇票数或区名匹配，未作推算。','data-help'));
 const button=document.createElement('button');button.type='button';button.textContent='下载复盘报告 JSON';
 button.onclick=()=>triggerDownload(result,'2026预测复盘-'+result.archiveId+'.json');node.append(button);
 const pngButton=document.createElement('button');pngButton.type='button';pngButton.textContent='下载复盘图片 PNG';
 pngButton.onclick=()=>downloadReviewPng(result,getArchive(result.archiveId)?.label||'我的预测');node.append(pngButton);
 return node;
}
function render(){
 const node=$('forecastArchiveList');if(!node)return;
 node.replaceChildren();
 read();
 const summary=$('forecastArchiveTotal');if(summary)summary.textContent=archives.length+'个封存版本（仅存本机）';
 for(const item of archives){
  const card=document.createElement('article');card.className='forecast-archive-card';
  let verified;
  try{verified=ForecastArchiveCore.validate(item,candidateDatabase)}catch(error){
   card.append(text('strong',item.label||'旧版封存'));
   card.append(text('p','候选人身份或格式与当前版本不匹配，请先下载原文件留存：'+error.message,'data-help'));
  }
  if(verified){
   const stats=ForecastArchiveCore.coverage(verified,candidateDatabase);
   card.append(text('strong',verified.label));
   card.append(text('small',archiveLabel(verified)+' · 完整选区 '+
    stats.districtsComplete+' · 已填写选区 '+stats.districtsRecorded+
    ' · 乡镇记录 '+stats.localAreas,'forecast-archive-meta'));
   if(verified.note)card.append(text('p',verified.note,'forecast-archive-note'));
  }
  const actions=document.createElement('div');actions.className='forecast-archive-actions';
  function add(label,handler,disabled=false){
   const button=document.createElement('button');button.type='button';button.textContent=label;
   button.disabled=disabled;button.onclick=handler;actions.append(button);
  }
  add('下载JSON',()=>triggerDownload(item,'2026预测封存-'+item.id+'.json'));
  add('恢复编辑',()=>restore(item.id),!verified);
  add('与正式结果比较',()=>compare(item.id),!verified);
  add('删除',()=>remove(item.id));
  card.append(actions);
  if(activeComparison?.archiveId===item.id)card.append(comparisonPanel(activeComparison));
  node.append(card);
 }
 if(!archives.length)node.append(text('p','尚无封存。完成预测后点击“封存当前预测”，系统会保留一份不受后续编辑影响的快照。','data-help'));
}
async function importFile(event){
 const file=event.target.files?.[0];if(!file)return;
 try{
  if(file.size>4500000)throw Error('封存文件不能超过4.5 MB');
  const input=JSON.parse(await file.text());
  const collection=Array.isArray(input)?input:[input];
  if(!collection.length||collection.length>MAX)throw Error('封存数量不正确');
  const existing=read(),ids=new Set(existing.map(x=>x.id)),added=[];
  for(const archive of collection){
   const good=ForecastArchiveCore.validate(archive,candidateDatabase);
   if(ids.has(good.id))throw Error('发现重复封存ID，请勿重复导入同一版本');
   ids.add(good.id);added.push(good);
  }
  store([...added,...existing]);render();setStatus('已导入'+added.length+'个封存，现有可编辑预测及旧封存均未被覆盖。');
 }catch(error){setStatus('导入失败：'+error.message)}finally{event.target.value=''}
}
function init(){
 if(!$('forecastArchiveCreate')||!root.ForecastArchiveCore)return;
 $('forecastArchiveCreate').onclick=create;
 $('forecastArchiveDownloadAll').onclick=()=>{if(!read().length)return setStatus('还没有封存可以导出');triggerDownload(read(),'岛屿调色盘-2026预测封存合集.json')};
 $('forecastArchiveImport').onclick=()=>$('forecastArchiveFile').click();
 $('forecastArchiveFile').onchange=importFile;
 render();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
root.ForecastArchiveUI={render,create,read,compare,downloadReviewPng};
})(window);
