/* The map sidebar is the only election/scope/metric selector. */
(function(){
'use strict';
const T=window.HistoryTrends,C=window.HistoryCore,S=window.HistoryTrendSummary,$=id=>document.getElementById(id);
const offices={president:'台湾地区领导人',legislative:'立法机构民代',mayor:'县市长',council:'县市议员',township:'乡镇市区长'};
const ns='http://www.w3.org/2000/svg';
let zoomClipId=0;const hiddenTrendSeries=new Set();
let panel=null,request=0,cache=new Map(),summaryCache=new Map(),models=[],activeKey='',selection=null,renderedKey='',loading=false,closed=true,lastRows=[],lastSeries=[],lastTitle='',legislativeExport=null,voteShareExport=null,selectedYears=new Set(),knownYears=[];
const norm=v=>simplify(String(v||'')).replaceAll('臺','台').replace(/^中国台湾少数民族党$/,'中国台湾原住民党');
 const legislativeTrendCache=T.createLegislativeTrendCache({normalize:norm,buildList:(year,snapshot)=>HistoryLegislativeParty.build(year,snapshot)});
const fmt=(v,pct=false)=>Number.isFinite(v)?pct?v.toFixed(2)+'%':v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const svg=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n};
const displayParty=p=>/^(?:无党籍|無黨籍|连署|連署)(?:[（(]\s*(?:连署|連署)\s*[）)])?$/.test(String(p))?'无党籍':p;
const color=p=>displayParty(p)==='无党籍'?'#000000':p==='并列'?'#9ba69f':p==='其他政党'?'#aebbb2':predictionParty(p).color;
// Distinct chart-only fallback colors, not historical official party colors.
const listFallbackColors={'民主联盟':'#5366B7'};
const listColor=p=>{const original=color(p);return original.toLowerCase()==='#738772'?(listFallbackColors[p.replace(/[“”]/g,'')]||original):original};
// Preserve configured party colors; assign repeatable chart-only colors to unconfigured historical parties.
const seatColor=p=>{const original=listColor(p);if(original.toLowerCase()!=='#738772')return original;let hash=0;for(const c of p.replace(/[“”]/g,''))hash=(Math.imul(hash,31)+c.codePointAt(0))>>>0;const h=hash%360,s=.57,l=.43,c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h/60%2-1)),m=l-c/2,rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('')};
const yearsFor=o=>o==='president'?HistoryPresidential.YEARS:o==='legislative'?HistoryLegislative.YEARS:HistoryLocal.years(o,window.HISTORY_2026_RESULTS_AVAILABLE===true);
const label=(y,o)=>o==='council'&&[1994,1998,2002].includes(Number(y))?String(y):HistoryLocal.yearLabel(y,o);
const optionText=id=>$(id)?.selectedOptions?.[0]?.textContent||'';
function settings(){return selection||{}}
function create(){
 if(panel)return;panel=$('historyTrendsPanel');if(!panel)return;
 $('historyTrendModuleStatus')?.remove();
 const heading=node('div','trend-heading');heading.append(node('h3','','跨届选举趋势'));
 const scope=node('p','data-help');scope.id='trendScope';
 const controls=node('div','trend-year-controls');controls.id='trendYearControls';const yearTitle=node('div','trend-year-title');yearTitle.append(node('strong','','比较届次'));for(const [id,text] of [['trendSelectAll','全选'],['trendRecent3','最近三届'],['trendRecent5','最近五届'],['trendSelectNone','清空']]){const b=node('button','button quiet',text);b.type='button';b.id=id;yearTitle.append(b)}const years=node('div','trend-year-picker');years.id='trendYears';controls.append(yearTitle,years);
 const actions=node('div','trend-actions');for(const [id,title] of [['trendRetry','重新载入'],['trendCsv','导出当前趋势 CSV']]){const b=node('button','button quiet',title);b.type='button';b.id=id;actions.append(b)}
 const status=node('p','data-help');status.id='trendStatus';status.setAttribute('role','status');
 const output=node('div','trend-charts');output.id='trendCharts';
 panel.append(heading,scope,controls,actions,status,output);
 $('trendSelectAll').onclick=()=>changeYears(knownYears);
 $('trendSelectNone').onclick=()=>changeYears([]);$('trendRecent3').onclick=()=>changeYears(knownYears.slice(-3));$('trendRecent5').onclick=()=>changeYears(knownYears.slice(-5));
 $('trendRetry').onclick=()=>{cache.clear();summaryCache.clear();legislativeTrendCache.clear();activeKey='';renderedKey='';load()};
 $('trendCsv').onclick=exportCsv;
}
function readSelection(s){
 const filters=History2022View.trendFilters?.()||{};
 return {...s,...filters,normalize:norm};
}
function setYears(conf,reset){
 const ys=yearsFor(conf.office);if(reset)selectedYears=new Set(ys);else for(const y of ys)if(!knownYears.includes(y))selectedYears.add(y);knownYears=[...ys];
 const host=$('trendYears'),existing=[...host.querySelectorAll('input')];
 if(existing.length===ys.length&&existing.every((input,i)=>Number(input.value)===ys[i]&&input.nextElementSibling?.textContent===label(ys[i],conf.office))){
  for(const input of existing)input.checked=selectedYears.has(Number(input.value));
 }else{
  host.replaceChildren();
  for(const y of ys){const l=node('label','trend-year'),input=node('input');input.type='checkbox';input.value=String(y);input.checked=selectedYears.has(y);input.onchange=()=>{const next=new Set(selectedYears);if(input.checked)next.add(y);else next.delete(y);changeYears(next)};l.append(input,node('span','',label(y,conf.office)));host.append(l)}
 }
 $('trendSelectAll').disabled=ys.every(y=>selectedYears.has(y));
 $('trendSelectNone').disabled=!ys.some(y=>selectedYears.has(y));
}
function changeYears(values,notify=true){
 const next=new Set([...values].filter(y=>knownYears.includes(y)));
 if(next.size===selectedYears.size&&[...next].every(y=>selectedYears.has(y)))return false;
 selectedYears=next;setYears(settings(),false);load();
 if(notify)window.dispatchEvent(new Event('site-route-change'));
 return true;
}
async function snapshot(office,year){
 if(office==='president')return HistoryPresidential.load(year);
 if(office==='legislative')return HistoryLegislative.load(year);
 if(year===2022||year===2026)return History2022View.trendSnapshot(year);
 return HistoryLocal.loadCycle(year,office);
}
const range=conf=>yearsFor(conf.office).filter(y=>selectedYears.has(y));
const listVoteChart=conf=>conf.office==='legislative'&&['all','party'].includes(conf.electorate);
const trendDataKey=conf=>[conf.office,S.key(conf),range(conf).join(',')].join('|');
async function loadSummary(conf){
 const key=S.key(conf);if(!key)return null;
 if(!summaryCache.has(key))summaryCache.set(key,(async()=>{
  const response=await fetch('assets/history-trend-summary-v1/'+key+'.json?v='+(['president','township'].includes(conf.office)?'20261126-v102':'20261126-v101'));if(!response.ok)throw Error('summary unavailable');
  const payload=await response.json();return S.compatible(payload,conf,HistoryLocal,T,HistoryPresidential)?payload:null;
 })().catch(()=>null));
 return summaryCache.get(key);
}
async function load(){
 if(!selection||panel.hidden)return;
 const conf=settings(),ys=range(conf),key=trendDataKey(conf),token=++request;
 activeKey=key;renderedKey='';loading=true;models=[];lastRows=[];lastSeries=[];legislativeExport=null;voteShareExport=null;
 $('trendStatus').textContent='正在载入所选范围的历届正式结果…';$('trendCharts').replaceChildren();$('trendCsv').disabled=true;
 if(!ys.length){loading=false;$('trendStatus').textContent='请至少勾选一个届次。';return}
 try{
  const summary=S.summaryYears(conf.office,ys).length?await loadSummary(conf):null;if(token!==request)return;
  const result=new Array(ys.length);let next=0,finished=0;
  // A bounded work queue avoids waiting for the slowest request in each old batch.
  async function worker(){while(token===request&&next<ys.length){
   const i=next++,year=ys[i],k=conf.office+'|'+year;
   try{
    const derived=S.summaryYears(conf.office,[year]).length?summary?.years?.[year]:null;
    if(S.yearValid(derived,conf))result[i]={year,summary:derived};
    else{if(!cache.has(k)){const pending=Promise.resolve().then(()=>snapshot(conf.office,year));cache.set(k,pending);pending.catch(()=>{if(cache.get(k)===pending)cache.delete(k)})}
    result[i]={year,snapshot:await cache.get(k)}}
   }catch(e){result[i]={year,error:e.message}}
   if(token!==request)return;
   $('trendStatus').textContent='已载入 '+(++finished)+' / '+ys.length+' 届…';
  }}
  await Promise.all(Array.from({length:Math.min(4,ys.length)},worker));
  if(token!==request)return;models=result;loading=false;render()
 }catch(e){if(token===request){loading=false;$('trendStatus').textContent='趋势载入失败：'+e.message}}
}
function fullLegislature(conf){return conf.office==='legislative'&&!conf.county&&!conf.focus&&(conf.metric==='seats'||conf.metric==='party'&&['regional','all'].includes(conf.electorate))}
function description(conf){
 const selected=conf.candidateScope==='candidate'&&(conf.metric==='share'||conf.metric==='votes');
 return [offices[conf.office],conf.office==='legislative'&&conf.electorate==='all'?'全部类型（总席次；不分区票得票率）':['council','legislative'].includes(conf.office)?optionText('historyElectorate'):'',conf.county||'全部地区（含金门、马祖）',optionText('historyScale'),conf.focus,['legislative','council'].includes(conf.office)?'当选席次与得票率':optionText('historyMetric'),conf.metric==='seats'?conf.party:selected?(conf.candidate?.name||conf.candidate?.party||'未指定候选人'):''].filter(Boolean).join(' · ');
}
function exportFile(content,name,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function chartExport(graph,title,png,context={}){
 const office=context.office||offices[settings().office]||'',name=((context.prefix||'历史趋势')+'-'+office+'-'+title).replace(/[\\/:*?"<>|]/g,'_');
 const copy=graph.cloneNode(true);for(const mark of copy.querySelectorAll('[data-trend-series]')){mark.removeAttribute('opacity');for(const path of mark.querySelectorAll('path'))path.setAttribute('stroke-width','1.4')}copy.setAttribute('xmlns',ns);const full=graph.getAttribute('data-trend-export-viewbox');if(full){copy.setAttribute('viewBox',full);copy.removeAttribute('data-trend-export-viewbox')}
 const {width,height}=copy.viewBox.baseVal;copy.setAttribute('width',width);copy.setAttribute('height',height);
 // One request per distinct emblem, even when many years share the same logo.
 const logos=new Map();let url;
 try{
  await Promise.all([...copy.querySelectorAll('image[href]')].map(async image=>{
   const href=image.getAttribute('href');if(!href||href.startsWith('data:'))return;
   if(!logos.has(href))logos.set(href,(async()=>{const response=await fetch(href);if(!response.ok)throw Error('党徽读取失败');const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('党徽读取失败'));reader.readAsDataURL(blob)})})());
   image.setAttribute('href',await logos.get(href));
  }));
  const source=new XMLSerializer().serializeToString(copy);
  if(!png){exportFile(source,name+'.svg','image/svg+xml;charset=utf-8');return}
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('图表尺寸无效');
  const scale=Math.min(2,Math.floor(16000/Math.max(width,height)),Math.floor(Math.sqrt(55000000/(width*height))));
  if(scale<1)throw Error('图表过大，请使用 SVG 矢量图导出');
  url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('图表读取失败，请使用 SVG 导出'));img.src=url});
  const canvas=node('canvas');canvas.width=Math.ceil(width*scale);canvas.height=Math.ceil(height*scale);
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('设备无法创建图片画布，请使用 SVG 导出');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG生成失败，请使用 SVG 导出');
  const a=node('a');a.href=URL.createObjectURL(blob);a.download=name+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
 }catch(e){const status=context.status||$('trendStatus');if(status)status.textContent=e.message||'图表导出失败，请重试。';else if(typeof toast==='function')toast(e.message||'图表导出失败，请重试。')}finally{if(url)URL.revokeObjectURL(url)}
}
function card(title,description,graph,exportTitle=title,context={}){
 const c=node('article','trend-card'),h=node('div','trend-card-heading'),buttons=node('div','trend-card-actions');h.append(node('h4','',title),buttons);
 if(graph)for(const ext of ['SVG','PNG']){const b=node('button','button quiet',ext);b.type='button';b.onclick=async()=>{for(const button of buttons.querySelectorAll('button'))button.disabled=true;try{await chartExport(graph,exportTitle,ext==='PNG',context)}finally{for(const button of buttons.querySelectorAll('button'))button.disabled=false}};buttons.append(b)}
 if(graph?.hasAttribute('data-trend-zoom')){for(const [caption,action,label] of [['＋','in','放大纵轴'],['－','out','缩小纵轴'],['复位','reset','恢复默认纵轴']]){const button=node('button','button quiet',caption);button.type='button';button.setAttribute('aria-label',label);button.dataset.trendZoomAction=action;button.title=label;button.onclick=()=>graph.dispatchEvent(new Event('trend-zoom-'+action));buttons.prepend(button)}}
 if(graph?.hasAttribute('data-trend-line-chart')){
  const filters=node('div','trend-line-controls');filters.append(node('span','', '政党／曲线'));
  for(const [text,action] of [['全部显示','show'],['主要政党','major'],['全部隐藏','hide']]){const b=node('button','button quiet',text);b.type='button';b.dataset.trendSeriesAction=action;b.onclick=()=>graph.dispatchEvent(new Event('trend-'+action+'-all'));filters.append(b)}
  filters.append(node('span','data-help','勾选下方图例显示曲线，滚轮缩放、拖动平移，双击复位'));c.append(filters);
 }
 c.prepend(h);if(description)c.append(node('p','data-help',description));if(graph)c.append(graph);return c
}
function appendTrendCharts(out,rows,series,title,note,options,county){
 const scopes=T.trendChartScopes(rows,county);
 const layout=scopes.some(s=>s.label.startsWith('合并后'))&&scopes.some(s=>s.label.startsWith('原'))?node('div','trend-merge-layout'):out;
 // Comparable historical jurisdictions use one numerical scale, not independently rescaled axes.
 const axisMax=layout!==out?Math.max(1,...scopes.flatMap(section=>section.rows.flatMap(row=>options.stack?[series.reduce((n,s)=>n+(s.get(row)||0),0)]:series.map(s=>s.get(row))).filter(Number.isFinite))):null;
 for(const section of scopes){
  const scopedTitle=title+(section.label?' · '+section.label:''),scopedSeries=series.filter(s=>section.rows.some(r=>Number.isFinite(s.get(r))));
  const compact=layout!==out&&section.label.startsWith('原'),tall=layout!==out&&section.label.startsWith('合并后');
  const grouped=layout!==out;
  const graph=scopedSeries.length&&section.rows.some(r=>r.complete)?chart(section.rows,scopedSeries,scopedTitle,{...options,compact,tall,grouped,axisMax}):null;
  const description=graph?(grouped?'':note):'当前范围没有可绘制的完整结果。';
  const item=card(grouped?section.label:scopedTitle,description,graph,scopedTitle);
  if(section.label){item.classList.add('trend-scope-card');item.dataset.trendScope=section.label}
  layout.append(item);
 }
 if(layout!==out){const group=node('section','trend-merge-section'),heading=node('h4','trend-merge-title',title);if(note)heading.title=note;group.append(heading,layout);out.append(group)}
}
function baseSvg(title,width,height){
 const g=svg('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':title,'font-family':'Arial, "Microsoft YaHei", sans-serif','font-size':'12',fill:'#31473e'});
 g.append(svg('rect',{x:0,y:0,width,height,fill:'#fff'}),svg('title',{},title),svg('text',{x:18,y:22,'font-weight':700,'font-size':15},title));return g
}
function chart(rows,series,title,{pct=false,stack=false,rank=false,breakOld=false,integer=false,compact=false,tall=false,grouped=false,axisMax=null,seatDetail=false,onPoint=null,hiddenSeries=hiddenTrendSeries}={}){
 const zoomable=!stack;
 const width=Math.max(compact?520:tall?620:700,rows.length*(compact?72:rows.some(r=>r.scopeLabel)?79:65)+100),l=compact?52:64,r=width-20,top=48,bottom=compact?280:tall?550:seatDetail?458:270;
 const showScope=!grouped||new Set(rows.map(r=>r.scopeLabel||'')).size>1;
 const legendStart=grouped?bottom+(showScope?70:52):bottom+68,legend=[];
 let lx=20,ly=legendStart;
 for(const s of series){
  const name=s.name.length>16?s.name.slice(0,16)+'…':s.name;
  const span=Math.min(width-40,Math.max(92,(stack?30:56)+Array.from(name).reduce((n,ch)=>n+(/[^\x00-\x7f]/.test(ch)?(grouped?13:11):7),0)));
  if(lx>20&&lx+span>width-20){lx=20;ly+=25}
  legend.push({xx:lx,yy:ly,name,span});lx+=span;
 }
 const height=Math.max(tall?650:0,(legend.at(-1)?.yy||legendStart)+20),g=baseSvg(title,width,height);
 if(seatDetail)g.setAttribute('data-trend-seat-plot-height',String(bottom-top));
 if(grouped){g.setAttribute('data-trend-export-viewbox','0 0 '+width+' '+height);g.setAttribute('viewBox','0 30 '+width+' '+(height-30));}
 const vals=rows.flatMap((row,i)=>stack?[series.reduce((n,s)=>n+(s.get(row)||0),0)]:series.map(s=>s.get(row))).filter(Number.isFinite);
 const magnitude=axisMax??Math.max(1,...vals);
 const ticks=integer?T.integerTicks(magnitude):null;
 if(zoomable&&ticks&&ticks.at(-1)<=magnitude)ticks.push(ticks.at(-1)+(ticks[1]-ticks[0]));
 const max=ticks?ticks.at(-1):pct?T.percentAxisMax([magnitude]):rank?Math.max(3,magnitude):magnitude*1.08;
 const slots=rows.map((row,i)=>i&&rows[i-1].year===row.year?0.72:1.18);
 const centers=[];let offset=0;for(let i=0;i<rows.length;i++){if(i)offset+=slots[i];centers.push(offset)}
 const unit=(r-l)/Math.max(1,offset+1.18),barWidth=Math.min(58,unit*.66);
 const defaultDomain=[0,max],ceiling=pct?Math.max(100,max):max;
 let domain=[...defaultDomain];const x=i=>l+unit*(.59+centers[i]),y=v=>rank?top+(v-1)/(max-1)*(bottom-top):bottom-(v-domain[0])/(domain[1]-domain[0])*(bottom-top);
 const axis=svg('g',{'data-trend-y-axis':'true'});g.append(axis);
 function drawAxis(){
  axis.replaceChildren();
  for(const v of zoomable?(domain[0]===0&&domain[1]===max?(pct?Array.from({length:max/10+1},(_,i)=>i*10):(ticks||T.percentZoomTicks(domain))):T.percentZoomTicks(domain).filter(v=>!integer||Number.isInteger(v))):ticks||Array.from({length:5},(_,i)=>rank?1+i*(max-1)/4:i*max/4)){
   const yy=y(v);
   axis.append(svg('line',{x1:l,x2:r,y1:yy,y2:yy,stroke:'#e2eae5'}),svg('text',{x:l-9,y:yy+4,'text-anchor':'end','font-size':grouped?13:11,'data-trend-axis-tick':String(v)},integer?String(v):rank?Math.round(v):pct?(zoomable?Number(v.toFixed(2)):Math.round(v))+'%':Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(v)));
  }
  g.setAttribute('data-trend-y-min',String(domain[0]));g.setAttribute('data-trend-y-max',String(domain[1]));
 }
 drawAxis();
 const plotUpdates=[];let clipId='';
 if(zoomable){clipId='trend-vote-clip-'+(++zoomClipId);const defs=svg('defs'),clip=svg('clipPath',{id:clipId});clip.append(svg('rect',{x:l,y:top,width:r-l,height:bottom-top}));defs.append(clip);g.append(defs);g.setAttribute('data-trend-zoom',pct?'percent':'count');}

 rows.forEach((row,i)=>{
  const labelText=row.label||String(row.year);
  g.append(svg('text',{x:x(i),y:bottom+21,'text-anchor':'middle','font-size':grouped?13:11},labelText));
  if(showScope&&row.scopeLabel)g.append(svg('text',{x:x(i),y:bottom+37,'text-anchor':'middle','font-size':10},row.scopeLabel));
  if(!row.complete)g.append(svg('text',{x:x(i),y:bottom+(showScope&&row.scopeLabel?51:37),'text-anchor':'middle',fill:'#956e51','font-size':10},'缺档'));
 });
 const addPoint=(p,row,s,v)=>{
  const summary=(row.label||row.year)+' '+(row.scopeLabel?row.scopeLabel+' ':'')+s.name+'：'+fmt(v,pct)+(stack&&integer?'席':'')+(row.dates?.length?' · '+row.dates.join(' / '):'');
  const detail=s.tooltip?.(row)||'';
  const tooltip=detail?(row.label||row.year)+(row.scopeLabel?' · '+row.scopeLabel:'')+(row.dates?.length?' · '+row.dates.join(' / '):'')+'\n'+detail:summary;
  p.append(svg('title',{},tooltip));
  p.setAttribute('tabindex','0');p.setAttribute('role','button');p.setAttribute('aria-label',tooltip.replaceAll('\n','；'));
  const click=()=>onPoint?onPoint(row,summary,detail):showYear(row.year,row.county,row.label,summary,detail);p.addEventListener('click',click);p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();click()}});
  if(p.hasAttribute('data-trend-seat-label')){p.addEventListener('pointerenter',click);p.addEventListener('focus',click)}
 };
 if(stack){
  const labelColor=fill=>{const m=/^#([0-9a-f]{6})$/i.exec(fill||'');if(!m)return'#fff';const c=m[1].match(/../g).map(v=>parseInt(v,16));return(c[0]*.299+c[1]*.587+c[2]*.114)>150?'#17352b':'#fff'};
  rows.forEach((row,i)=>{
   let acc=0;const annotations=[];
   for(const s of series){
    const v=s.get(row);if(!Number.isFinite(v)||v<=0)continue;
    const h=v/max*(bottom-top),middle=y(acc+v/2),p=svg('rect',{x:x(i)-barWidth/2,y:y(acc+v),width:barWidth,height:h,fill:s.color,stroke:'#fff','stroke-width':seatDetail?.18:.5,...(seatDetail?{'data-trend-seat-segment':s.name,'data-trend-seat-count':v,'data-trend-seat-year':row.year}:{})});
    addPoint(p,row,s,v);g.append(p);
    if(integer){
     const textValue=fmt(v),inside=h>=(seatDetail?15:13)&&barWidth>=textValue.length*6+8;
     annotations.push({value:textValue,middle,inside,color:s.color,name:s.name,series:s,seats:v});
    }
    acc+=v;
   }
   const seatLabel=(a,attrs)=>{const text=svg('text',{...attrs,'pointer-events':'all',cursor:'pointer','data-trend-seat-label':a.name,'data-trend-seat-year':row.year,'data-trend-seat-position':a.inside?'inside':'outside'},a.value);addPoint(text,row,a.series,a.seats);g.append(text)};
   for(const a of annotations.filter(a=>a.inside))seatLabel(a,{x:x(i),y:a.middle+3,'text-anchor':'middle','font-size':seatDetail?11:10,'font-weight':700,fill:labelColor(a.color)});
   let last=top-4;
   for(const a of annotations.filter(a=>!a.inside).sort((a,b)=>a.middle-b.middle)){
    const baseline=Math.max(a.middle+3,last+(seatDetail?14:11),top+7);last=baseline;
    const edge=x(i)+barWidth/2;
    g.append(svg('line',{x1:edge,x2:edge+6,y1:a.middle,y2:baseline-3,stroke:a.color,'stroke-width':seatDetail?1.5:1,'pointer-events':'none'}));seatLabel(a,{x:edge+7,y:baseline,'font-size':seatDetail?10.5:9,'font-weight':700,fill:'#213b31',...(seatDetail?{'paint-order':'stroke','stroke':'#fff','stroke-width':1.6,'stroke-linejoin':'round'}:{})});
   }
   if(row.complete)g.append(svg('text',{x:x(i),y:y(acc)-6,'text-anchor':'middle','font-size':11,'font-weight':700,'data-trend-total':String(acc)},fmt(acc)));
  })
 }else for(const s of series){
  const marks=svg('g',{'data-trend-series':s.name,...(clipId?{'clip-path':'url(#'+clipId+')'}:{})});g.append(marks);
  const branches=new Map();
  rows.forEach((row,i)=>{const k=row.scopeSeries||'',state=branches.get(k)||{points:[],previous:null};const v=s.get(row);if(!Number.isFinite(v)){state.previous=null;branches.set(k,state);return}
   if(breakOld&&state.previous&&state.previous.oldPartyVote!==row.oldPartyVote)state.previous=null;
   state.points.push({i,v,move:!state.previous});state.previous=row;branches.set(k,state);
  });
  for(const {points} of branches.values()){const path=svg('path',{fill:'none',stroke:s.color,'stroke-width':zoomable?1.4:2.5,'stroke-linejoin':'round',...(s.dash?{'stroke-dasharray':'6 4'}:{})});const update=()=>path.setAttribute('d',points.map(p=>(p.move?'M':'L')+x(p.i)+' '+y(p.v)).join(' '));update();if(zoomable)plotUpdates.push(update);marks.append(path)}
  rows.forEach((row,i)=>{const v=s.get(row);if(!Number.isFinite(v))return;const p=svg('circle',{'data-trend-value':String(v),'data-trend-year':String(row.year),cx:x(i),cy:y(v),r:zoomable?2.8:4.5,fill:s.color,stroke:'#fff','stroke-width':zoomable?.6:1});addPoint(p,row,s,v);if(zoomable){const update=()=>{p.setAttribute('cy',y(v));p.setAttribute('tabindex',v>=domain[0]&&v<=domain[1]?'0':'-1')};update();plotUpdates.push(update)}marks.append(p)})

 }
 if(zoomable){
  function setDomain(next){if(Math.abs(next[0]-domain[0])<1e-8&&Math.abs(next[1]-domain[1])<1e-8)return false;domain=next;drawAxis();for(const update of plotUpdates)update();return true}
  const zoom=(scale,anchor=.5)=>setDomain(T.percentZoomRange(domain,scale,anchor,ceiling));
  g.addEventListener('wheel',e=>{
   if(!e.deltaY||e.ctrlKey||e.metaKey)return;
   const matrix=g.getScreenCTM();if(!matrix)return;const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());
   if(point.x<l||point.x>r||point.y<top||point.y>bottom)return;
   const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?240:1);
   if(zoom(Math.exp(Math.max(-1.2,Math.min(1.2,delta*.002))), (bottom-point.y)/(bottom-top)))e.preventDefault();
  },{passive:false});
  {
  // Drag the viewport vertically; preserve dates, values and zoom span.
  const plotPoint=e=>{const matrix=g.getScreenCTM();return matrix?new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()):null};
  const inside=p=>p&&p.x>=l&&p.x<=r&&p.y>=top&&p.y<=bottom;
  // A transparent hit area behind the data enables dragging empty plotting space.
  const panSurface=svg('rect',{x:l,y:top,width:r-l,height:bottom-top,fill:'transparent','pointer-events':'all','data-trend-pan-surface':'true',cursor:'grab'});
  g.insertBefore(panSurface,axis.nextSibling);
  let drag=null,suppressClick=false;
  g.addEventListener('pointerdown',e=>{
   suppressClick=false;
   const p=plotPoint(e);if(!e.isPrimary||e.button!==0||e.pointerType==='touch'||!inside(p))return;
   drag={id:e.pointerId,startY:p.y,startClientY:e.clientY,range:[...domain],moved:false};
  });
  g.addEventListener('pointermove',e=>{
   if(!drag||drag.id!==e.pointerId)return;
   if(!(e.buttons&1)){drag=null;g.style.cursor='';return}
   const p=plotPoint(e);if(!p)return;
   if(!drag.moved&&Math.abs(e.clientY-drag.startClientY)<4)return;
   if(!drag.moved){drag.moved=true;g.setPointerCapture(e.pointerId);g.style.cursor='grabbing';panSurface.setAttribute('cursor','grabbing');}
   const span=drag.range[1]-drag.range[0];setDomain(T.percentPanRange(drag.range,(p.y-drag.startY)*span/(bottom-top),ceiling));
   e.preventDefault();
  });
  const endDrag=e=>{if(!drag||drag.id!==e.pointerId)return;suppressClick=drag.moved;drag=null;g.style.cursor='';panSurface.setAttribute('cursor','grab');if(g.hasPointerCapture(e.pointerId))g.releasePointerCapture(e.pointerId)};
  g.addEventListener('pointerup',endDrag);g.addEventListener('pointercancel',endDrag);g.addEventListener('lostpointercapture',endDrag);
  g.addEventListener('pointerleave',e=>{if(drag&&!drag.moved)endDrag(e)});
  g.addEventListener('click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation()}},true);
  }
  g.addEventListener('trend-zoom-in',()=>zoom(.8));g.addEventListener('trend-zoom-out',()=>zoom(1.25));g.addEventListener('trend-zoom-reset',()=>setDomain([...defaultDomain]));
  g.addEventListener('dblclick',e=>{const matrix=g.getScreenCTM();if(!matrix)return;const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse());if(p.x>=l&&p.x<=r&&p.y>=top&&p.y<=bottom)setDomain([...defaultDomain])});
 }
 if(breakOld){const i=rows.findIndex(r=>!r.oldPartyVote);if(i>0){const xx=(x(i-1)+x(i))/2;g.append(svg('line',{x1:xx,x2:xx,y1:top,y2:bottom,stroke:'#8a938d','stroke-dasharray':'4 4'}),svg('text',{x:xx+4,y:top-7,'font-size':10},'2008制度改革'))}}
 function setVisible(name,visible){
  const scope=g.closest('[data-trend-series-scope]')||g.closest('#trendCharts')||g;
  const names=name?[name]:[...new Set([...scope.querySelectorAll('[data-trend-legend][role=checkbox]')].map(i=>i.getAttribute('data-trend-legend')))];for(const x of names)visible?hiddenSeries.delete(x):hiddenSeries.add(x);
  for(const mark of scope.querySelectorAll('[data-trend-series]'))if(!name||mark.getAttribute('data-trend-series')===name){if(visible)mark.removeAttribute('display');else mark.setAttribute('display','none')}
  for(const item of scope.querySelectorAll('[data-trend-legend][role=checkbox]'))if(!name||item.getAttribute('data-trend-legend')===name){item.setAttribute('aria-checked',String(visible));item.querySelector('[data-trend-checkbox-tick]').setAttribute('display',visible?'inline':'none');item.querySelector('[data-trend-checkbox-box]').setAttribute('fill',visible?'#287963':'#fff');item.querySelector('[data-trend-legend-label]').setAttribute('opacity',visible?'1':'.5')}
 }
 if(!stack){
  g.setAttribute('data-trend-line-chart','true');g.setAttribute('role','group');
  g.addEventListener('trend-show-all',()=>setVisible(null,true));g.addEventListener('trend-hide-all',()=>setVisible(null,false));g.addEventListener('trend-major-all',()=>{setVisible(null,false);for(const name of ['中国国民党','国民党','民主进步党','民进党','台湾民众党','民众党','无党籍'])setVisible(name,true)});
 }
 series.forEach((s,i)=>{
  const {xx,yy,name,span}=legend[i],entry=svg('g',{'data-trend-legend':s.name}),swatchX=xx+(stack?0:24);
  entry.append(s.dash?svg('line',{x1:swatchX,x2:swatchX+12,y1:yy-5,y2:yy-5,stroke:s.color,'stroke-width':2,'stroke-dasharray':'4 2'}):svg('rect',{x:swatchX,y:yy-10,width:11,height:11,rx:2,fill:s.color}),svg('text',{x:swatchX+16,y:yy,'font-size':grouped?13:11,'data-trend-legend-label':'true'},name));
  // Do not hide parts of stacked seat totals: the original total must remain visible.
  if(!stack){
   entry.setAttribute('role','checkbox');entry.setAttribute('tabindex','0');entry.setAttribute('aria-checked','true');entry.setAttribute('aria-label','显示 '+s.name+' 曲线');entry.style.cursor='pointer';
   entry.prepend(svg('rect',{x:xx-4,y:yy-19,width:span-3,height:24,rx:3,fill:'transparent','data-trend-legend-hit':'true','pointer-events':'all'}));
   entry.append(svg('rect',{x:xx,y:yy-14,width:16,height:16,rx:3,fill:'#287963',stroke:'#526f62','stroke-width':1.2,'data-trend-checkbox-box':'true'}),svg('path',{d:'M'+(xx+3)+' '+(yy-6)+' l3 3 l7 -8',fill:'none',stroke:'#fff','stroke-width':2,'stroke-linecap':'round','stroke-linejoin':'round','data-trend-checkbox-tick':'true'}),svg('title',{},'勾选显示、取消勾选隐藏 '+s.name));
   const toggle=()=>setVisible(s.name,entry.getAttribute('aria-checked')!=='true');
   entry.addEventListener('click',toggle);entry.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
  }
  if(!stack){
   const emphasize=active=>{for(const mark of (g.closest('[data-trend-series-scope]')||g.closest('.trend-merge-layout')||g).querySelectorAll('[data-trend-series]')){const selected=active&&mark.getAttribute('data-trend-series')===s.name;mark.setAttribute('opacity',!active||selected?'1':'.18');for(const path of mark.querySelectorAll('path'))path.setAttribute('stroke-width',selected?'2.4':'1.4')}};
   for(const mark of g.querySelectorAll('[data-trend-series]'))if(mark.getAttribute('data-trend-series')===s.name){mark.addEventListener('pointerenter',()=>emphasize(true));mark.addEventListener('pointerleave',()=>emphasize(false));mark.addEventListener('focusin',()=>emphasize(true));mark.addEventListener('focusout',()=>emphasize(false))}
   entry.addEventListener('pointerenter',()=>emphasize(true));entry.addEventListener('pointerleave',()=>emphasize(false));entry.addEventListener('focus',()=>emphasize(true));entry.addEventListener('blur',()=>emphasize(false));
  }
  g.append(entry);
 });
 if(!stack)for(const name of hiddenSeries){for(const mark of g.querySelectorAll('[data-trend-series]'))if(mark.getAttribute('data-trend-series')===name)mark.setAttribute('display','none');for(const item of g.querySelectorAll('[data-trend-legend][role=checkbox]'))if(item.getAttribute('data-trend-legend')===name){item.setAttribute('aria-checked','false');item.querySelector('[data-trend-checkbox-tick]').setAttribute('display','none');item.querySelector('[data-trend-checkbox-box]').setAttribute('fill','#fff');item.querySelector('[data-trend-legend-label]').setAttribute('opacity','.5')}}
 return g
}

function showYear(year,county,actualLabel,summary='',detail=''){
 const readout=$('trendPointReadout');if(!readout)return;
 readout.replaceChildren(node('strong','',summary||((actualLabel||label(year,settings().office))+' · '+(county||settings().county||'全部地区'))));
 const b=node('button','button quiet','查看该届结果');b.type='button';
 b.onclick=async()=>{
  const view=window.History2022View,office=settings().office;
  const target=HistoryLocal.cycleYear(Number(year),office);
  if(!view?.active()||![...$('historyYear').options].some(o=>Number(o.value)===target)){toast('该届历史结果暂不可用');return}
  const current=view.routeSelection();
  // Reuse the same validated path as shared links and browser navigation.
  // An aggregate point explicitly opens all areas; it must not inherit a county.
  const route={...current,office,year:target,county:county||'',view:'map',
   focus:county&&county===current.county?current.focus:'',contest:undefined,area:undefined,detailCounty:undefined,identity:undefined,
   scope:undefined,overviewCounty:undefined,overviewArea:undefined,years:undefined};
  b.disabled=true;
  try{
   const ok=await view.restoreRoute(route,()=>view.active()&&$('historyOffice').value===office);
   if(!ok){if(view.active()&&$('historyOffice').value===office)toast('该届结果暂未能载入，请重试');return}
   if(county&&view.routeSelection().county!==county)toast('当届地区未能匹配，已显示全部地区');
   window.dispatchEvent(new Event('site-route-change'));
  }catch(error){toast(error.message||'无法打开该届结果')}finally{b.disabled=false}
 };
 readout.append(b);
 if(detail){const disclosure=node('details','trend-point-details');disclosure.append(node('summary','','候选人明细'),node('p','',detail));readout.append(disclosure)}
}
function parliamentSvg(row,conf,totalLeg){
  const parties=T.parliamentOrder(Object.entries(row.parties||{}).filter(([,n])=>Number.isSafeInteger(n)&&n>0));
  const total=parties.reduce((n,[,v])=>n+v,0),title=row.label+(row.scopeLabel?' · '+row.scopeLabel:'')+' · '+(totalLeg?'立法机构总席次':'席次分布');
  if(!row.complete||!total)return null;
  const W=420,H=269+Math.ceil(parties.length/2)*23,points=T.parliamentPoints(total),r=174,cx=W/2,cy=236;
  const g=svg('svg',{viewBox:'0 0 '+W+' '+H,role:'img','aria-label':title,'font-family':'Arial, "Microsoft YaHei", sans-serif','font-size':'12',fill:'#31473e'});
  g.append(svg('rect',{x:0,y:0,width:W,height:H,fill:'#fff'}),svg('title',{},title),svg('text',{x:17,y:23,'font-weight':700,'font-size':17,'data-seat-year':row.label},row.label+(row.scopeLabel?' · '+row.scopeLabel:'')));
  if(row.dates?.length===1)g.append(svg('text',{x:17,y:39,'font-size':11,fill:'#566c60','data-seat-date':row.dates[0]},row.dates[0]));
  const rowsN=Math.max(1,...points.map(p=>p.row+1)),dot=Math.min(12,Math.max(1.9,Math.min(r*.64/Math.max(1,rowsN-1),Math.PI*r/Math.max(1,points.filter(p=>p.row===rowsN-1).length))*.40));
  const majority=T.majorityBoundary(points),angle=majority.angle,ux=Math.cos(angle),uy=-Math.sin(angle);
  // Draw the threshold beneath dots and extend the rule outside the arc.
  // The angle corresponds to the cumulative seat boundary, not a party bloc.
  const marker=svg('g',{'data-majority-seats':majority.seats,'aria-label':'过半 '+majority.seats+'席'});
  const inner=r*.29,outer=r+13;
  marker.append(svg('line',{x1:cx+ux*inner,y1:cy+uy*inner,x2:cx+ux*outer,y2:cy+uy*outer,stroke:'#9a4938','stroke-width':1.5,'stroke-dasharray':'3 3'}));
  const lx=Math.max(65,Math.min(W-65,cx+ux*outer)),ly=Math.max(42,cy+uy*outer-6);
  marker.append(svg('text',{x:lx,y:ly,'text-anchor':'middle','font-size':12,'font-weight':700,fill:'#9a4938'},'过半 '+majority.seats+'席'));g.append(marker);
  let index=0;
  for(const [party,count] of parties){
   const group=svg('g',{'data-seat-party':party,'aria-label':party+' '+count+'席'});group.append(svg('title',{},party+' '+count+'席'));
   const fill=conf.metric==='seats'&&party!==norm(conf.party)?'#cbd4ce':(conf.office==='legislative'?seatColor:color)(party);
   for(let i=0;i<count;i++){const p=points[index++];group.append(svg('circle',{cx:cx+p.x*r,cy:cy+p.y*r,r:dot,fill,'data-seat-dot':'1'}))}
   g.append(group);
  }
  g.append(svg('text',{x:cx,y:cy-12,'text-anchor':'middle','font-size':25,'font-weight':700,'data-seat-total':total},total+'席'));
  if(conf.metric==='seats')g.append(svg('text',{x:cx,y:cy+5,'text-anchor':'middle','font-size':11},conf.party+' '+(row.parties?.[norm(conf.party)]||0)+'席'));
  [...parties].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh')).forEach(([p,n],i)=>{
   const x=16+(i%2)*202,y=263+Math.floor(i/2)*23,fill=conf.metric==='seats'&&p!==norm(conf.party)?'#cbd4ce':(conf.office==='legislative'?seatColor:color)(p);
   g.append(svg('rect',{x,y:y-12,width:8,height:12,rx:2,fill}));
   const logo=logoFor(predictionParty(p));
   if(logo)appendCircularPartyLogo(g,logo,x+12,y-15,17,{'data-seat-logo':p});
   g.append(svg('text',{x:x+34,y,'font-size':11},p+' '+n+'席'));
  });

 return g;
}
function renderParliaments(out,rows,conf,totalLeg){
 const section=node('section','trend-parliament-section');
 section.append(node('h4','','历届席次分布'),node('p','data-help','每个圆点代表一席；民进党居左、国民党居右，明确的传统亲绿或亲蓝政党邻近排列，其余政党和无党籍居中。标线为过半门槛。合并前原县与原市上下分开展示，分别计算。'));
 const grid=node('div','trend-parliament-grid');section.append(grid);
 const groups=new Map();for(const row of rows){if(!groups.has(row.year))groups.set(row.year,[]);groups.get(row.year).push(row)}
 if([...groups.values()].some(list=>list.length>1))grid.classList.add('trend-parliament-paired-grid');
 for(const list of groups.values()){
  for(const row of list){
   const title=row.label+(row.scopeLabel?' · '+row.scopeLabel:'')+' · 席次分布',graph=parliamentSvg(row,conf,totalLeg);
   const item=card(title,graph?'':row.reason||'无完整席次资料',graph);
   item.classList.add('trend-parliament-card');if(list.length>1)item.classList.add('trend-parliament-pair');grid.append(item);
  }
 }
 out.append(section);
}
function partySeries(rows,listMode=false,allLegislativeParties=false,retainDemocraticAlliance=false){
 const totals=new Map();for(const r of rows)for(const [p,v] of Object.entries(r.parties||{}))totals.set(p,(totals.get(p)||0)+v);
 const meta=new Map();for(const r of rows)for(const [p,m] of Object.entries(r.partyMeta||{}))meta.set(p,m);
 const sorted=[...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh')).map(x=>x[0]),groups=listMode?T.partyListTrendGroups(rows,retainDemocraticAlliance):null,top=allLegislativeParties?T.legislativeSeatTrendParties(rows):groups?groups.individual:sorted.slice(0,7),rest=allLegislativeParties?[]:groups?groups.other:sorted.slice(7);
 const series=top.map(p=>({name:displayParty(meta.get(p)?.label||p),color:(allLegislativeParties?seatColor:listMode?listColor:color)(meta.get(p)?.party||p),get:r=>T.partyTrendValue(r,p),tooltip:r=>r.candidateDetails?T.candidateTrendTooltip(r,p):'',party:p}));
 if(rest.length)series.push({name:'其他政党',color:color('其他政党'),get:r=>T.partyTrendValue(r,'',rest),tooltip:r=>r.candidateDetails?rest.map(p=>T.candidateTrendTooltip(r,p)).filter(Boolean).join('\n'):'',parties:rest});
 return series;
}
function renderLegislative(conf,anchor,out){
 const ballot=conf.electorate,national=!conf.county,isLeg=conf.office==='legislative';
 const seatBallot=national||ballot==='all'||ballot==='regional';
 const effective=T.trendEffectiveSelection(conf),allSeats=isLeg&&ballot==='all'&&national;
 const prepared=isLeg?new Map(models.filter(item=>item.snapshot).map(item=>[item,legislativeTrendCache.read(item.snapshot,conf,anchor)])):null;
 const seatRows=seatBallot?models.flatMap(item=>{
  if(item.summary&&!isLeg)return item.summary[ballot==='all'&&conf.county?'regional':ballot].map(r=>({...r,parties:r.seats}));
  if(!item.snapshot)return[{year:item.year,label:String(item.year),complete:false,reason:item.error,parties:{},values:{}}];
  if(isLeg)return prepared.get(item).seats;
  return T.councilBallotRows(item.snapshot,{...conf,electorate:ballot==='all'&&conf.county?'regional':ballot}).map(r=>({...r,parties:r.seats}));
 }):[];
 const voteRows=models.flatMap(item=>item.summary&&!isLeg?item.summary[ballot]:item.snapshot?isLeg?prepared.get(item).votes:T.councilBallotRows(item.snapshot,conf):[{year:item.year,label:String(item.year),complete:false,reason:item.error,parties:{},votes:{},valid:null}]);
 const allRows=[...seatRows,...voteRows],missing=allRows.filter(r=>!r.complete);
 $('trendStatus').textContent=models.length+' 届 · '+(allRows.length-missing.length)+' 条完整指标结果'+(missing.length?' · '+missing.map(r=>r.label+(r.scopeLabel?' '+r.scopeLabel:'')+'：'+r.reason).join('；'):'');
 if(T.historicalCountyFamily(conf.county).length>1)out.append(node('p','data-help','升格前的原县、原市分别统计；合并后显示新的直辖市，跨边界不连线。'));
 let seatSeries=[];
 if(seatBallot){
  seatSeries=partySeries(seatRows,false,isLeg);
  const seatType=allSeats?'全部民代':ballot==='all'?(national?'全部议员':isLeg?'区域民代':'区域议员'):({regional:isLeg?'区域民代':'区域议员',plains:'平地少数民族',mountain:'山地少数民族',party:'不分区',indigenous:'原住民'}[ballot]||ballot);
  const title=(isLeg?'立法机构':'县市议员')+' · '+seatType+' · 政党当选席次趋势';
  const note=allSeats?'区域、平地与山地少数民族、不分区及旧制侨选的正式当选席次合计。':national?'仅计所选民代类别在全部地区正式当选的席次。':isLeg?'仅计该范围区域民代的正式当选席次；其余类型不分摊到县市。':'仅计该范围可归属的议员席次。';
  appendTrendCharts(out,seatRows,seatSeries,title,note,{stack:true,integer:true,seatDetail:allSeats},conf.county);
  if(seatRows.some(r=>r.complete))renderParliaments(out,seatRows,{...effective,metric:'party'},allSeats);
 }
 const listMode=listVoteChart(conf);
 const voteSeries=partySeries(voteRows,listMode),voteType=ballot==='all'?(isLeg?'不分区':'全部议员'):({regional:'区域',plains:'平地少数民族',mountain:'山地少数民族',party:'不分区',indigenous:'原住民'}[ballot]||ballot);
 const voteSubject=ballot==='all'?(isLeg?'不分区民代':'全部议员'):voteType+(isLeg?'民代':'议员');
 const voteTitle=voteSubject+' · '+(isLeg&&(ballot==='all'||ballot==='party')?'政党票／旧制席次计算票得票率趋势':'候选人票得票率趋势（按所属政党汇总）');
 const voteNote=isLeg&&(ballot==='all'||ballot==='party')?'2008年前为各党推荐的区域与少数民族候选人票汇总，用于分配名单席次；2008年起为独立政党票。两种票源分别绘制，不跨制度连线。2008年前以扣除无党籍后的政党得票总数为分母；2008年起按实际政党票计算。':!isLeg&&ballot==='all'?'区域和少数民族选票分别统计后汇总党派候选人票，分母为这些票数之和；选民可能投不同类别选票，不代表单一选民支持率。':'每个政党的候选人得票之和除以当前票种、当前范围的有效票；各党占比合计为100%。';
 appendTrendCharts(out,voteRows,voteSeries,voteTitle,voteNote,{pct:true,breakOld:isLeg&&(ballot==='all'||ballot==='party')},conf.county);
 const valuesTable=(rows,series,pct,title,displayedOnly=false)=>{
  const wrap=node('div','history-table-wrap'),table=node('table','history-candidate-table'),head=node('thead'),tr=node('tr');
  for(const heading of ['届次','当届地区','投票日期',...series.map(s=>s.name),displayedOnly?'显示合计':'合计'])tr.append(node('th','',heading));head.append(tr);table.append(head);
  const body=node('tbody');for(const r of rows){const item=node('tr');item.append(node('td','',r.label),node('td','',r.county||'全部地区'),node('td','',r.dates?.join(' / ')||'—'));
   for(const s of series)item.append(node('td','',fmt(s.get(r),pct)));
   item.append(node('td','',r.complete?fmt(displayedOnly?series.reduce((n,s)=>n+(s.get(r)??0),0):Object.values(r.parties).reduce((n,v)=>n+v,0),pct):'—'));body.append(item)}
  table.append(body);wrap.append(node('h4','',title),table);out.append(wrap);
 };
 if(seatBallot)valuesTable(seatRows,seatSeries,false,'当选席次逐届明细');
 valuesTable(voteRows,listMode?partySeries(voteRows,true,false,true):voteSeries,true,'对应票种得票率逐届明细',listMode);
 const readout=node('div','trend-point-readout','点击图中的数据点查看对应届次。');readout.id='trendPointReadout';out.prepend(readout);
 legislativeExport={seatRows,seatSeries,voteRows,voteSeries,ballot,seatBallot};
 lastRows=allRows;lastTitle='民代席次与得票率趋势';$('trendCsv').disabled=!allRows.length;
 renderedKey=JSON.stringify([conf.office,conf.year,conf.electorate,conf.county,conf.level,conf.focus,conf.metric,conf.party,conf.candidateScope,conf.candidate,range(conf).join(',')]);
}
function render(){
 if(!panel||panel.hidden||loading||!models.length||!selection)return;
 const conf=settings(),effective=T.trendEffectiveSelection(conf),anchor=History2022View.snapshot?.();
 if(['legislative','council'].includes(conf.office)){const out=$('trendCharts');out.replaceChildren();renderLegislative(conf,anchor,out);return}
 legislativeExport=null;voteShareExport=null;
 const totalLeg=fullLegislature(conf);
 const rows=models.flatMap(item=>{
  if(!item.snapshot&&!item.summary)return{year:item.year,label:label(item.year,conf.office),complete:false,reason:item.error,parties:{},values:{}};
  const result=item.summary?item.summary[conf.level][conf.metric]:totalLeg?[T.allLegislativeSeats(item.snapshot,HistoryLegislativeParty.build(item.year,item.snapshot),norm)]:T.historicalScopeRows(item.snapshot,effective,anchor);
  return result.map(r=>{if(totalLeg){r.dates=T.electionDates(item.snapshot,conf.office,'',norm);if(conf.metric==='seats'&&r.complete)r.values.value=r.parties[norm(conf.party)]||0;}
   if(!conf.county&&!r.dates?.length)r.label=label(r.year,conf.office);return conf.office==='president'&&conf.metric==='party'?T.mergePresidentialIndependents(r):r})
 });
 const out=$('trendCharts');out.replaceChildren();
 const missing=rows.filter(r=>!r.complete);
 $('trendStatus').textContent=models.length+' 届 · '+(rows.length-missing.length)+' 条完整地区/届次结果'+(missing.length?' · '+missing.map(r=>r.label+(r.scopeLabel?' '+r.scopeLabel:'')+'：'+r.reason).join('；'):'');
 if(T.historicalCountyFamily(conf.county).length>1)out.append(node('p','data-help','升格前使用当届县名；合并前原县、原市分列，合并后使用直辖市结果。不同辖区不合计、不跨合并边界连线。'));
 const voteMetric=conf.metric==='share'||conf.metric==='votes',pct=conf.metric==='share';
 const leading=!totalLeg&&['president','mayor','township'].includes(effective.office);
 const selected=conf.candidateScope==='candidate'&&voteMetric;
 const name=selected?(conf.office==='legislative'&&conf.electorate==='party'?conf.candidate?.party:conf.candidate?.name)||'指定候选人':voteMetric?'各地区最高票候选人':conf.metric==='seats'?conf.party:'';
 const unit=conf.level==='town'||conf.office==='township'?'乡镇市区':'县市';
 const metricTitle=voteMetric?(pct?'得票率':'得票数'):conf.metric==='seats'?'当选席次':leading?'领先'+unit+'数':'当选席次';
 const combinedCounty=conf.office==='legislative'&&conf.electorate==='all'&&!!conf.county;
 const title=(totalLeg?'立法机构总席次 · ':combinedCounty?'县市区域民代 · ':'')+(name?displayParty(name)+' · '+metricTitle+'趋势':'政党'+metricTitle+'趋势');
 let series=[];
 if(voteMetric||conf.metric==='seats')series=[{name:displayParty(name||metricTitle),color:conf.candidate?.party?color(conf.candidate.party):conf.party?color(conf.party):'#287963',get:r=>r.values?.value??null}];
 else {
  const totals=new Map();for(const r of rows)for(const [p,n] of Object.entries(r.parties))totals.set(p,(totals.get(p)||0)+n);
  const parties=[...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh')).map(x=>x[0]),top=parties.slice(0,7),rest=parties.slice(7);
  series=top.map(p=>({name:displayParty(p),color:color(p),get:r=>r.complete?r.parties[p]||0:null}));
  if(rest.length)series.push({name:'其他政党',color:color('其他政党'),get:r=>r.complete?rest.reduce((n,p)=>n+(r.parties[p]||0),0):null});
 }
 const note=totalLeg?'全类型原始当选席次：区域、平地及山地少数民族、不分区，以及旧制侨选。各届合计与法定总席次核对；县市层级不分摊全区名单席次。':combinedCounty?'全部类型地图并列展示多个票种；此县市趋势仅按区域民代正式当选席次统计。不分区与少数民族民代由全区选出，不分摊到县市；切换左侧选举类型可查看各地得票领先趋势。':voteMetric?(selected?'按左侧指定对象筛选；未核实匹配的届次不连线。候选人按姓名、政党及适用的选区记录匹配，不代表已完成个人身份沿革核验。':'各地区最高票候选人的票数合计；得票率为该合计除以所选范围的有效票合计，不是各地区得票率的简单平均。'):conf.metric==='seats'?'只显示左侧指定政党的当选席次。':leading?'与地图一致，按各统计地区最高票所属政党计数，不等同于当选席次。':'按当届正式当选席次统计；其余政党合并展示，CSV保留完整政党明细。';
 if(conf.focus&&conf.level==='district')out.append(node('p','data-help','跨届选区须确认乡镇归属相同且无无法核实的部分里；否则保留缺值。'));
 if(conf.level==='town')out.append(node('p','data-help','按当届乡镇市区票数统计；不按现行行政区边界估算历史票数。'));
 const oldParty=!totalLeg&&conf.office==='legislative'&&conf.electorate==='party';
 if(oldParty){for(const r of rows)r.oldPartyVote=r.year<2008;out.append(node('p','data-help','2008年前为旧制席次计算票，2008年起为独立政党票，跨制度不连续绘制。'))}
 const readout=node('div','trend-point-readout','点击数据点查看对应届次。');readout.id='trendPointReadout';out.append(readout);
 appendTrendCharts(out,rows,series,title,note,{pct,stack:!voteMetric&&conf.metric!=='seats',breakOld:oldParty,integer:!pct},conf.county);
 if(!voteMetric&&!leading&&['legislative','council'].includes(conf.office))renderParliaments(out,rows,effective,totalLeg);
 // A compact exact-value table is limited to the same metric as the chart.
 const wrap=node('div','history-table-wrap'),table=node('table','history-candidate-table'),thead=node('thead'),header=node('tr');
 const showTotal=!voteMetric&&conf.metric==='party';
 const showCounty=rows.some(r=>r.scopeLabel);
 for(const v of ['届次',...(showCounty?['当届县市']:[]),'投票日期',...series.map(s=>s.name),...(showTotal?['合计']:[])])header.append(node('th','',v));thead.append(header);table.append(thead);
 const body=node('tbody');for(const r of rows){const tr=node('tr');tr.append(node('td','',r.label));if(showCounty)tr.append(node('td','',r.county||conf.county));tr.append(node('td','',r.dates?.join(' / ')||'—'));for(const s of series)tr.append(node('td','',fmt(s.get(r),pct)));if(showTotal)tr.append(node('td','',r.complete?fmt(Object.values(r.parties).reduce((n,v)=>n+v,0)):'—'));body.append(tr)}table.append(body);wrap.append(table);out.append(wrap);
 const voteRows=models.flatMap(item=>item.summary?item.summary[conf.level].voteRows:item.snapshot?T.localPartyVoteShares(item.snapshot,conf):[{year:item.year,label:label(item.year,conf.office),complete:false,reason:item.error,parties:{},valid:null}]).map(T.mergePresidentialIndependents);
 const voteSeries=partySeries(voteRows),voteTitle='候选人票得票率趋势（按所属政党汇总）';
 const voteNote='按当前选举类别和地图范围汇总候选人得票，再除以同范围有效票；同届多组无党籍候选人合并为同一类别，悬停可查看各候选人。'+(conf.office==='president'?'无党籍与连署统一为无党籍。':'')+(conf.office==='mayor'&&conf.level==='town'&&models.some(item=>item.year===2018)?'2018年台北市区级采用政大刊载的投票日资料，市级采用重计结果。':'');
 appendTrendCharts(out,voteRows,voteSeries,voteTitle,voteNote,{pct:true},conf.county);
 const voteWrap=node('div','history-table-wrap'),voteTable=node('table','history-candidate-table'),voteHead=node('thead'),voteHeader=node('tr');
 for(const heading of ['届次','当届县市','投票日期',...voteSeries.map(s=>s.name),'合计'])voteHeader.append(node('th','',heading));voteHead.append(voteHeader);voteTable.append(voteHead);
 const voteBody=node('tbody');for(const r of voteRows){const tr=node('tr');tr.append(node('td','',r.label),node('td','',r.county||'全部地区'),node('td','',r.dates?.join(' / ')||'—'));for(const s of voteSeries)tr.append(node('td','',fmt(s.get(r),true)));tr.append(node('td','',r.complete?'100.00%':'—'));voteBody.append(tr)}voteTable.append(voteBody);voteWrap.append(node('h4','','候选人票得票率逐届明细（按所属政党汇总）'),voteTable);out.append(voteWrap);
 voteShareExport={rows:voteRows};
 lastRows=rows;lastSeries=series;lastTitle=title;$('trendCsv').disabled=!rows.length;
 renderedKey=JSON.stringify([conf.office,conf.year,conf.electorate,conf.county,conf.level,conf.focus,conf.metric,conf.party,conf.candidateScope,conf.candidate,range(conf).join(',')]);
}
function exportCsv(){
 if(!lastRows.length||loading)return;
 const conf=settings(),effective=T.trendEffectiveSelection(conf),vote=conf.metric==='share'||conf.metric==='votes',single=vote||conf.metric==='seats';
 const out=[['选举类别','票种','范围','地图层级','届次','投票日期','指标','对象','数值','资料状态']];
 if(legislativeExport){
  const {seatRows,voteRows,ballot}=legislativeExport;
  for(const [rows,metric] of [[seatRows,'正式当选席次'],[voteRows,'得票率']])for(const r of rows){
   const entries=r.complete?Object.entries(r.parties).filter(([party])=>!(metric==='得票率'&&listVoteChart(conf)&&T.partyListTrendExcluded(party))):[['',null]];
   for(const [party,value] of entries)out.push([offices[conf.office],metric==='正式当选席次'?(ballot==='all'&&!conf.county?'全部民代类型':ballot==='all'&&conf.county?(conf.office==='legislative'?'区域民代':'区域议员'):ballot):(conf.office==='legislative'&&(ballot==='all'||ballot==='party')?(r.year<2008?'旧制席次计算票':'不分区政党票'):ballot),r.county||'全部地区',metric==='正式当选席次'&&conf.county?'选举区（按县市汇总）':conf.level,r.label,r.dates?.join(' / ')||'',metric,displayParty(party),Number.isFinite(value)?Math.round(value*100)/100:'',r.complete?'完整结果':r.reason]);
  }
  exportFile(C.csv(out),'历史趋势-'+offices[conf.office]+'-席次与得票率.csv','text/csv;charset=utf-8');return;
 }
 for(const r of lastRows){
  const items=single?[[lastSeries[0]?.name||lastTitle,r.values?.value]]:Object.entries(r.parties);
  for(const [p,v] of items.length?items:[['',null]])out.push([offices[conf.office],fullLegislature(conf)?'全部民代类型':effective.electorate,[r.county||conf.county||'全部地区',conf.focus].filter(Boolean).join(' · '),effective.office==='legislative'&&effective.electorate==='regional'?'选举区（按县市汇总）':conf.level,r.label,r.dates?.join(' / ')||'',conf.office==='legislative'&&conf.electorate==='all'&&conf.county?'区域民代当选席次':optionText('historyMetric'),displayParty(p),Number.isFinite(v)?Math.round(v*100)/100:'',r.complete?'完整结果':r.reason]);
 }
 if(voteShareExport)for(const r of voteShareExport.rows){
  for(const [p,v] of r.complete?Object.entries(r.parties):[['',null]])out.push([offices[conf.office],'候选人票',r.county||'全部地区',conf.level,r.label,r.dates?.join(' / ')||'','候选人票得票率（按所属政党汇总）',displayParty(r.partyMeta?.[p]?.label||p),Number.isFinite(v)?Math.round(v*100)/100:'',r.complete?'完整结果':r.reason]);
 }
 exportFile(C.csv(out),'历史趋势-'+offices[conf.office]+'-'+lastTitle+'.csv','text/csv;charset=utf-8')
}
window.HistoryTrendCharts={chart,card,seatColor,color,displayParty};
window.HistoryTrendsUI={routeYears:()=>knownYears.filter(y=>selectedYears.has(y)).join(',')||'none',restoreRouteYears(value){if(!selection)return;changeYears(String(value).split(',').map(Number),false)},open(s){
 create();if(!panel)return;
 const conf=readSelection(s),prior=selection;selection=conf;
 const reset=!prior||prior.office!==conf.office;
 if(reset||yearsFor(conf.office).join(',')!==knownYears.join(','))setYears(conf,reset);
 $('trendScope').textContent='当前范围：'+description(conf);
 const snap=History2022View.snapshot?.();
 if(!snap||snap.year!==conf.year||!snap.elections?.some(e=>e.office===conf.office)){
  request++;loading=false;activeKey='';renderedKey='';models=[];lastRows=[];$('trendCharts').replaceChildren();$('trendCsv').disabled=true;$('trendStatus').textContent='正在等待左侧选举数据载入…';return
 }
 const dataKey=trendDataKey(conf),key=JSON.stringify([conf.office,conf.year,conf.electorate,conf.county,conf.level,conf.focus,conf.metric,conf.party,conf.candidateScope,conf.candidate,range(conf).join(',')]);
 if(dataKey!==activeKey||range(conf).length&&!models.length&&!loading)load();else if(!loading&&(key!==renderedKey||(closed&&!$('trendCharts').childElementCount&&models.length)))render();
 closed=false;
},close(){closed=true},render,exportCsv};
})();
