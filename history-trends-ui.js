/* The map sidebar is the only election/scope/metric selector. */
(function(){
'use strict';
const T=window.HistoryTrends,C=window.HistoryCore,$=id=>document.getElementById(id);
const offices={president:'台湾地区领导人',legislative:'立法机构民代',mayor:'县市长',council:'县市议员',township:'乡镇市区长'};
const ns='http://www.w3.org/2000/svg';
let panel=null,request=0,cache=new Map(),models=[],activeKey='',selection=null,renderedKey='',loading=false,closed=true,lastRows=[],lastSeries=[],lastTitle='';
const norm=v=>simplify(String(v||'')).replaceAll('臺','台');
const fmt=(v,pct=false)=>Number.isFinite(v)?pct?v.toFixed(2)+'%':v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const svg=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n};
const color=p=>p==='并列'?'#9ba69f':p==='其他政党'?'#aebbb2':predictionParty(p).color;
const yearsFor=o=>o==='president'?HistoryPresidential.YEARS:o==='legislative'?HistoryLegislative.YEARS:HistoryLocal.years(o,window.HISTORY_2026_RESULTS_AVAILABLE===true);
const label=(y,o)=>HistoryLocal.yearLabel(y,o);
const optionText=id=>$(id)?.selectedOptions?.[0]?.textContent||'';
function settings(){return selection||{}}
function create(){
 if(panel)return;panel=$('historyTrendsPanel');if(!panel)return;
 const heading=node('div','trend-heading');heading.append(node('h3','','跨届选举趋势'),node('p','','与左侧历史选举数据同步，只显示当前选中的内容。'));
 const scope=node('p','data-help');scope.id='trendScope';
 const controls=node('div','trend-controls'),l=node('label','trend-control','起始届次'),start=node('select');start.id='trendStart';l.append(start);controls.append(l);
 const end=node('p','data-help');end.id='trendEndLabel';controls.append(end);
 const actions=node('div','trend-actions');for(const [id,title] of [['trendRetry','重新载入'],['trendCsv','导出当前趋势 CSV']]){const b=node('button','button quiet',title);b.type='button';b.id=id;actions.append(b)}
 const status=node('p','data-help');status.id='trendStatus';status.setAttribute('role','status');
 const output=node('div','trend-charts');output.id='trendCharts';
 panel.append(heading,scope,controls,actions,status,output);
 start.onchange=()=>{renderedKey='';load()};
 $('trendRetry').onclick=()=>{cache.clear();activeKey='';renderedKey='';load()};
 $('trendCsv').onclick=exportCsv;
}
function readSelection(s){
 const filters=History2022View.trendFilters?.()||{};
 return {...s,...filters,normalize:norm};
}
function setYears(conf,reset){
 const ys=yearsFor(conf.office).filter(y=>y<=conf.year),start=$('trendStart'),old=Number(start.value);
 start.replaceChildren(...ys.map(y=>new Option(label(y,conf.office),y)));
 start.value=String(!reset&&ys.includes(old)?old:ys[0]||conf.year);
 $('trendEndLabel').textContent='截止届次：'+label(conf.year,conf.office)+'（随左侧选举年份）';
}
async function snapshot(office,year){
 if(office==='president')return HistoryPresidential.load(year);
 if(office==='legislative')return HistoryLegislative.load(year);
 if(year===2022||year===2026)return History2022View.trendSnapshot(year);
 return HistoryLocal.loadCycle(year,office);
}
const range=conf=>yearsFor(conf.office).filter(y=>y>=Number($('trendStart').value)&&y<=conf.year);
async function load(){
 if(!selection||panel.hidden)return;
 const conf=settings(),ys=range(conf),key=conf.office+'|'+ys.join(','),token=++request;
 activeKey=key;loading=true;models=[];lastRows=[];lastSeries=[];
 $('trendStatus').textContent='正在载入所选范围的历届正式结果…';$('trendCharts').replaceChildren();$('trendCsv').disabled=true;
 try{
  const result=[];
  for(let i=0;i<ys.length;i+=3){
   const group=await Promise.all(ys.slice(i,i+3).map(async year=>{
    const k=conf.office+'|'+year;
    try{if(!cache.has(k))cache.set(k,await snapshot(conf.office,year));return{year,snapshot:cache.get(k)}}catch(e){return{year,error:e.message}}
   }));
   if(token!==request)return;result.push(...group);
   $('trendStatus').textContent='已载入 '+result.length+' / '+ys.length+' 届…';
  }
  if(token!==request)return;models=result;loading=false;render()
 }catch(e){if(token===request){loading=false;$('trendStatus').textContent='趋势载入失败：'+e.message}}
}
function description(conf){
 const selected=conf.candidateScope==='candidate'&&(conf.metric==='share'||conf.metric==='votes');
 return [offices[conf.office],optionText('historyElectorate'),conf.county||'全部地区（含金门、马祖）',optionText('historyScale'),conf.focus,optionText('historyMetric'),conf.metric==='seats'?conf.party:selected?(conf.candidate?.name||conf.candidate?.party||'未指定候选人'):''].filter(Boolean).join(' · ');
}
function exportFile(content,name,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function chartExport(graph,title,png){
 const copy=graph.cloneNode(true);copy.setAttribute('xmlns',ns);const box=graph.viewBox.baseVal;copy.setAttribute('width',box.width);copy.setAttribute('height',box.height);
 const source=new XMLSerializer().serializeToString(copy),name='历史趋势-'+offices[settings().office]+'-'+title;
 if(!png){exportFile(source,name+'.svg','image/svg+xml;charset=utf-8');return}
 const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'})),img=new Image();
 img.onload=()=>{const canvas=node('canvas');canvas.width=box.width*2;canvas.height=box.height*2;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);canvas.toBlob(b=>{if(b){const a=node('a');a.href=URL.createObjectURL(b);a.download=name+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)}},'image/png')};img.onerror=()=>{URL.revokeObjectURL(url);$('trendStatus').textContent='PNG导出失败，可使用SVG导出。'};img.src=url
}
function card(title,description,graph){
 const c=node('article','trend-card'),h=node('div','trend-card-heading'),buttons=node('div','trend-card-actions');h.append(node('h4','',title),buttons);
 if(graph)for(const ext of ['SVG','PNG']){const b=node('button','button quiet',ext);b.type='button';b.onclick=()=>chartExport(graph,title,ext==='PNG');buttons.append(b)}
 c.append(h,node('p','data-help',description));if(graph)c.append(graph);return c
}
function baseSvg(title,width,height){
 const g=svg('svg',{viewBox:'0 0 '+width+' '+height,role:'img','aria-label':title,'font-family':'Arial, "Microsoft YaHei", sans-serif','font-size':'12',fill:'#31473e'});
 g.append(svg('rect',{x:0,y:0,width,height,fill:'#fff'}),svg('title',{},title),svg('text',{x:18,y:22,'font-weight':700,'font-size':15},title));return g
}
function chart(rows,series,title,{pct=false,stack=false,rank=false,breakOld=false}={}){
 const width=Math.max(700,rows.length*73+100),height=326+Math.ceil(series.length/4)*24,g=baseSvg(title,width,height),l=64,r=width-25,top=48,bottom=270;
 const vals=rows.flatMap((row,i)=>stack?[series.reduce((n,s)=>n+(s.get(row)||0),0)]:series.map(s=>s.get(row))).filter(Number.isFinite);
 const max=pct?100:rank?Math.max(3,...vals):Math.max(1,...vals)*1.08;
 const x=i=>l+(i+.5)*(r-l)/Math.max(1,rows.length),y=v=>rank?top+(v-1)/(max-1)*(bottom-top):bottom-v/max*(bottom-top);
 for(let i=0;i<=4;i++){
  const v=rank?1+i*(max-1)/4:i*max/4,yy=y(v);
  g.append(svg('line',{x1:l,x2:r,y1:yy,y2:yy,stroke:'#e2eae5'}),svg('text',{x:l-9,y:yy+4,'text-anchor':'end','font-size':11},rank?Math.round(v):pct?Math.round(v)+'%':Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(v)))
 }
 rows.forEach((row,i)=>{
  const labelText=row.label||String(row.year);
  g.append(svg('text',{x:x(i),y:bottom+21,'text-anchor':'middle','font-size':11},labelText));
  if(!row.complete)g.append(svg('text',{x:x(i),y:bottom+37,'text-anchor':'middle',fill:'#956e51','font-size':10},'缺档'));
 });
 const addPoint=(p,row,s,v)=>{
  p.append(svg('title',{},(row.label||row.year)+' '+s.name+'：'+fmt(v,pct)));
  p.setAttribute('tabindex','0');p.setAttribute('role','button');p.setAttribute('aria-label',(row.label||row.year)+' '+s.name+' '+fmt(v,pct));
  const click=()=>showYear(row.year);p.addEventListener('click',click);p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();click()}})
 };
 if(stack){
  rows.forEach((row,i)=>{let acc=0;for(const s of series){const v=s.get(row);if(!Number.isFinite(v))continue;const h=v/max*(bottom-top),p=svg('rect',{x:x(i)-19,y:y(acc+v),width:38,height:h,fill:s.color,stroke:'#fff','stroke-width':.5});addPoint(p,row,s,v);g.append(p);acc+=v}})
 }else for(const s of series){
  let d='',previous=null;
  rows.forEach((row,i)=>{const v=s.get(row);if(!Number.isFinite(v)){previous=null;return}
   if(breakOld&&previous&&previous.oldPartyVote!==row.oldPartyVote)previous=null;
   d+=(previous?'L':'M')+x(i)+' '+y(v)+' ';previous=row;
  });
  g.append(svg('path',{d,fill:'none',stroke:s.color,'stroke-width':2.5,'stroke-linejoin':'round',...(s.dash?{'stroke-dasharray':'6 4'}:{})}));
  rows.forEach((row,i)=>{const v=s.get(row);if(!Number.isFinite(v))return;const p=svg('circle',{cx:x(i),cy:y(v),r:4.5,fill:s.color,stroke:'#fff','stroke-width':1});addPoint(p,row,s,v);g.append(p)})
 }
 if(breakOld){const i=rows.findIndex(r=>!r.oldPartyVote);if(i>0){const xx=(x(i-1)+x(i))/2;g.append(svg('line',{x1:xx,x2:xx,y1:top,y2:bottom,stroke:'#8a938d','stroke-dasharray':'4 4'}),svg('text',{x:xx+4,y:top-7,'font-size':10},'2008制度改革'))}}
 series.forEach((s,i)=>{const xx=20+(i%4)*(width-40)/4,yy=319+Math.floor(i/4)*24;g.append(s.dash?svg('line',{x1:xx,x2:xx+12,y1:yy-5,y2:yy-5,stroke:s.color,'stroke-width':2,'stroke-dasharray':'4 2'}):svg('rect',{x:xx,y:yy-10,width:11,height:11,rx:2,fill:s.color}),svg('text',{x:xx+16,y:yy,'font-size':11},s.name.length>16?s.name.slice(0,16)+'…':s.name))});
 return g
}

function showYear(year){
 const readout=$('trendPointReadout');if(!readout)return;
 readout.replaceChildren(node('strong','',label(year,settings().office)+' · '));
 const b=node('button','button quiet','查看该届结果');b.type='button';
 b.onclick=()=>{const y=$('historyYear');if([...y.options].some(o=>Number(o.value)===year)){y.value=String(year);y.dispatchEvent(new Event('change',{bubbles:true}));$('historyViewTrends').click()}};
 readout.append(b)
}
function render(){
 if(!panel||panel.hidden||loading||!models.length||!selection)return;
 const conf=settings(),anchor=models.find(r=>r.year===conf.year)?.snapshot;
 const rows=models.map(item=>{
  if(!item.snapshot)return{year:item.year,label:label(item.year,conf.office),complete:false,reason:item.error,parties:{},values:{}};
  const r=T.mapTrend(item.snapshot,conf,anchor);
  if(!conf.county||r.label===String(r.year))r.label=label(r.year,conf.office);return r
 });
 const out=$('trendCharts');out.replaceChildren();
 const missing=rows.filter(r=>!r.complete);
 $('trendStatus').textContent=rows.length+' 届 · '+(rows.length-missing.length)+' 届有完整可用结果'+(missing.length?' · '+missing.map(r=>r.label+'：'+r.reason).join('；'):'');
 const voteMetric=conf.metric==='share'||conf.metric==='votes',pct=conf.metric==='share';
 const leading=conf.office==='president'||conf.office==='legislative'&&conf.electorate!=='regional'||conf.office==='mayor'&&conf.level==='town';
 const selected=conf.candidateScope==='candidate'&&voteMetric;
 const name=selected?(conf.office==='legislative'&&conf.electorate==='party'?conf.candidate?.party:conf.candidate?.name)||'指定候选人':voteMetric?'各地区最高票候选人':conf.metric==='seats'?conf.party:'';
 const metricTitle=voteMetric?(pct?'得票率':'得票数'):conf.metric==='seats'?'当选席次':leading?'领先地区数':'当选席次';
 const title=name?name+' · '+metricTitle+'趋势':'政党'+metricTitle+'趋势';
 let series=[];
 if(voteMetric||conf.metric==='seats')series=[{name:name||metricTitle,color:conf.candidate?.party?color(conf.candidate.party):conf.party?color(conf.party):'#287963',get:r=>r.values?.value??null}];
 else {
  const totals=new Map();for(const r of rows)for(const [p,n] of Object.entries(r.parties))totals.set(p,(totals.get(p)||0)+n);
  const parties=[...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh')).map(x=>x[0]),top=parties.slice(0,7),rest=parties.slice(7);
  series=top.map(p=>({name:p,color:color(p),get:r=>r.complete?r.parties[p]||0:null}));
  if(rest.length)series.push({name:'其他政党',color:color('其他政党'),get:r=>r.complete?rest.reduce((n,p)=>n+(r.parties[p]||0),0):null});
 }
 const note=voteMetric?(selected?'按左侧指定对象筛选；未核实匹配的届次不连线。候选人按姓名、政党及适用的选区记录匹配，不代表已完成个人身份沿革核验。':'各地区最高票候选人的票数合计；得票率为该合计除以所选范围的有效票合计，不是各地区得票率的简单平均。'):conf.metric==='seats'?'只显示左侧指定政党的当选席次。':leading?'与地图一致，按各统计地区最高票所属政党计数，不等同于当选席次。':'按当届正式当选席次统计；其余政党合并展示，CSV保留完整政党明细。';
 if(conf.focus&&conf.level==='district')out.append(node('p','data-help','跨届选区须确认乡镇归属相同且无无法核实的部分里；否则保留缺值。'));
 if(conf.level==='town')out.append(node('p','data-help','按当届乡镇市区票数统计；不按现行行政区边界估算历史票数。'));
 const oldParty=conf.office==='legislative'&&conf.electorate==='party';
 if(oldParty){for(const r of rows)r.oldPartyVote=r.year<2008;out.append(node('p','data-help','2008年前为旧制席次计算票，2008年起为独立政党票，跨制度不连续绘制。'))}
 const readout=node('div','trend-point-readout','点击数据点查看对应届次。');readout.id='trendPointReadout';out.append(readout);
 if(series.length&&rows.some(r=>r.complete))out.append(card(title,note,chart(rows,series,title,{pct,stack:!voteMetric&&conf.metric!=='seats',breakOld:oldParty})));
 else out.append(card(title,'当前所选范围没有可绘制的完整结果。',null));
 // A compact exact-value table is limited to the same metric as the chart.
 const wrap=node('div','history-table-wrap'),table=node('table','history-candidate-table'),thead=node('thead'),header=node('tr');
 for(const v of ['届次',...series.map(s=>s.name)])header.append(node('th','',v));thead.append(header);table.append(thead);
 const body=node('tbody');for(const r of rows){const tr=node('tr');tr.append(node('td','',r.label));for(const s of series)tr.append(node('td','',fmt(s.get(r),pct)));body.append(tr)}table.append(body);wrap.append(table);out.append(wrap);
 lastRows=rows;lastSeries=series;lastTitle=title;$('trendCsv').disabled=!rows.length;
 renderedKey=JSON.stringify([conf.office,conf.year,conf.electorate,conf.county,conf.level,conf.focus,conf.metric,conf.party,conf.candidateScope,conf.candidate,$('trendStart').value]);
}
function exportCsv(){
 if(!lastRows.length||loading)return;
 const conf=settings(),vote=conf.metric==='share'||conf.metric==='votes',single=vote||conf.metric==='seats';
 const out=[['选举类别','票种','范围','地图层级','届次','指标','对象','数值','资料状态']];
 for(const r of lastRows){
  const items=single?[[lastSeries[0]?.name||lastTitle,r.values?.value]]:Object.entries(r.parties);
  for(const [p,v] of items.length?items:[['',null]])out.push([offices[conf.office],conf.electorate,[conf.county||'全部地区',conf.focus].filter(Boolean).join(' · '),conf.level,r.label,optionText('historyMetric'),p,Number.isFinite(v)?Math.round(v*100)/100:'',r.complete?'完整结果':r.reason]);
 }
 exportFile(C.csv(out),'历史趋势-'+offices[conf.office]+'-'+lastTitle+'.csv','text/csv;charset=utf-8')
}
window.HistoryTrendsUI={open(s){
 create();if(!panel)return;
 const conf=readSelection(s),prior=selection;selection=conf;
 const reset=!prior||prior.office!==conf.office;
 if(reset||prior.year!==conf.year)setYears(conf,reset);
 $('trendScope').textContent='当前范围：'+description(conf);
 const snap=History2022View.snapshot?.();
 if(!snap||snap.year!==conf.year||!snap.elections?.some(e=>e.office===conf.office)){
  request++;loading=false;activeKey='';renderedKey='';models=[];lastRows=[];$('trendCharts').replaceChildren();$('trendCsv').disabled=true;$('trendStatus').textContent='正在等待左侧选举数据载入…';return
 }
 const dataKey=conf.office+'|'+range(conf).join(','),key=JSON.stringify([conf.office,conf.year,conf.electorate,conf.county,conf.level,conf.focus,conf.metric,conf.party,conf.candidateScope,conf.candidate,$('trendStart').value]);
 if(dataKey!==activeKey||!models.length&&!loading)load();else if(!loading&&(closed||key!==renderedKey))render();
 closed=false;
},close(){closed=true},render,exportCsv};
})();
