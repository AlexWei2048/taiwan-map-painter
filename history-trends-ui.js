/* Lazily opened cross-election explorer; no dependency on remote chart libraries. */
(function(){
'use strict';
const T=window.HistoryTrends,C=window.HistoryCore,$=id=>document.getElementById(id);
const offices={president:'台湾地区领导人',legislative:'立法机构民代',mayor:'县市长',council:'县市议员',township:'乡镇市区长'};
const metrics={share:'得票率',votes:'得票数',seats:'当选席次',seatShare:'席次占比',rank:'席次排名'};
const ballots={regional:'区域选举',plains:'平地少数民族',mountain:'山地少数民族',party:'不分区政党票'};
const ns='http://www.w3.org/2000/svg',colors=['#246b52','#7c5998','#b37b23','#487a9f'];
let panel=null,request=0,cache=new Map(),models=[],countyNames=[],activeKey='',selectedParties=new Set(),partyTouched=false,comparisonCounty='',currentSelection=null;
const norm=v=>simplify(String(v||'')).replaceAll('臺','台');
const fmt=(v,pct=false)=>Number.isFinite(v)?pct?v.toFixed(2)+'%':v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const svg=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n};
const color=p=>p==='并列'?'#9ba69f':p==='政党资料缺失'?'#adb5af':predictionParty(p).color;
const yearsFor=o=>o==='president'?HistoryPresidential.YEARS:o==='legislative'?HistoryLegislative.YEARS:HistoryLocal.years(o,window.HISTORY_2026_RESULTS_AVAILABLE===true);
const label=(y,o)=>HistoryLocal.yearLabel(y,o);
const option=(n,opts,old)=>{n.replaceChildren(...opts.map(([v,t])=>new Option(t,v)));if(opts.some(([v])=>String(v)===String(old)))n.value=old};
const control=(parent,id,title)=>{const l=node('label','trend-control',title),s=node('select');s.id=id;l.append(s);parent.append(l);return s};
function create(){
 if(panel)return;
 panel=$('historyTrendsPanel');if(!panel)return;
 const heading=node('div','trend-heading');heading.append(node('h3','','跨届选举趋势'),node('p','','选择选举类别、票种和地区，比较历届正式结果。'));
 const controls=node('div','trend-controls');
 const office=control(controls,'trendOffice','选举类别');option(office,Object.entries(offices),'mayor');
 control(controls,'trendBallot','选举类型');
 const geo=control(controls,'trendGeography','行政区口径');option(geo,[['modern','统一现行县市口径'],['historic','保留当届县市名称']],'modern');
 control(controls,'trendCounty','统计范围');
 control(controls,'trendTown','乡镇市区（可比名称）');
 control(controls,'trendStart','起始届次');control(controls,'trendEnd','结束届次');
 const metric=control(controls,'trendMetric','政党指标');option(metric,Object.entries(metrics),'share');
 const actions=node('div','trend-actions');for(const [id,title] of [['trendRetry','重新载入'],['trendCsv','导出趋势 CSV'],['trendAll','全选政党'],['trendClear','取消全选']]){
  const b=node('button','button quiet',title);b.id=id;b.type='button';actions.append(b)
 }
 const status=node('p','data-help');status.id='trendStatus';status.setAttribute('role','status');
 const legend=node('div','trend-party-picker');legend.id='trendParties';
 const output=node('div','trend-charts');output.id='trendCharts';
 panel.append(heading,controls,actions,status,legend,output);
 office.onchange=()=>{partyTouched=false;setupYears(true);load()};
 $('trendBallot').onchange=()=>{partyTouched=false;load()};
 $('trendGeography').onchange=()=>{ $('trendCounty').value='';updateCounties();render()};
 $('trendCounty').onchange=()=>{updateTowns();render()};
 $('trendTown').onchange=render;
 $('trendStart').onchange=$('trendEnd').onchange=()=>render();
 $('trendMetric').onchange=render;
 $('trendRetry').onclick=()=>{cache.delete(activeKey);load()};
 $('trendCsv').onclick=exportCsv;
 $('trendAll').onclick=()=>{partyTouched=true;selectedParties=new Set(allParties(scoped()));render()};
 $('trendClear').onclick=()=>{partyTouched=true;selectedParties.clear();render()};
}
function setupYears(reset){
 const office=$('trendOffice').value,ys=yearsFor(office),old=$('trendBallot').value;
 const opts=office==='legislative'?Object.entries(ballots):office==='council'?[['all','全部议员（仅得票及席次合计）'],...Object.entries(ballots).filter(([x])=>x!=='party')]:office==='township'?[['all','全部乡镇市区长'],['regional','区域乡镇市长'],['mountain','山地少数民族区长']]:[['regional','区域选举']];
 option($('trendBallot'),opts,reset?(office==='council'||office==='township'?'all':'regional'):old);
 const range=ys.map(y=>[y,label(y,office)]);option($('trendStart'),range,ys[0]);option($('trendEnd'),range,ys.at(-1));
 $('trendBallot').disabled=opts.length===1;
}
async function snapshot(office,year){
 if(office==='president')return HistoryPresidential.load(year);
 if(office==='legislative'){const [s]=await Promise.all([HistoryLegislative.load(year),HistoryLegislativeTurnout.load(year).catch(()=>null)]);return s}
 if(year===2022||year===2026)return History2022View.trendSnapshot(year);
 return HistoryLocal.loadCycle(year,office);
}
function settings(){return {office:$('trendOffice').value,electorate:$('trendBallot').value,county:$('trendCounty').value,town:$('trendTown').value,unified:$('trendGeography').value==='modern',normalize:norm}}
function model(s,config){
 const partySeats=config.office==='legislative'&&config.electorate==='party'?HistoryLegislativeParty.build(s.year,s):null;
 let r=T.aggregate(s,{...config,partySeats,turnoutEnrich:HistoryLegislativeTurnout.enrich});
 if(!config.county||r.label===String(s.year))r.label=label(s.year,config.office);
 return r
}
async function load(){
 const config=settings(),key=config.office+'|'+config.electorate,token=++request;
 activeKey=key;$('trendStatus').textContent='正在载入历届正式结果…';$('trendCharts').replaceChildren();$('trendCsv').disabled=true;
 const ys=yearsFor(config.office);
 try{
  let result=cache.get(key);
  if(!result){
   result=[];
   // Bound concurrent requests to avoid a burst of dozens of large JSON files.
   for(let i=0;i<ys.length;i+=3){
    const group=await Promise.all(ys.slice(i,i+3).map(async y=>{try{return{year:y,snapshot:await snapshot(config.office,y)}}catch(e){return{year:y,error:e.message}}}));
    result.push(...group);
    if(token!==request)return;
    $('trendStatus').textContent='已载入 '+result.length+' / '+ys.length+' 届…';
   }
   cache.set(key,result)
  }
  if(token!==request)return;
  models=result;updateCounties();render();
 }catch(e){if(token===request)$('trendStatus').textContent='趋势载入失败：'+e.message}
}
function updateCounties(){
 const conf=settings(),all=new Set();
 for(const item of models)if(item.snapshot){
  const ids=new Set(item.snapshot.elections.filter(e=>e.office===conf.office).map(e=>e.election_id));
  const names=item.snapshot.contests.filter(c=>ids.has(c.election_id)).map(c=>c.county_name);
  if(conf.office==='legislative')names.push(...item.snapshot.rows.filter(r=>r.level==='county'&&r.electorate==='regional').map(r=>r.county));
  for(const n of names){const v=norm(n);if(v&&!/全部地区|全区|全国/.test(v))all.add(conf.unified?T.modern(v):v)}
 }
 countyNames=[...all].sort((a,b)=>C.compareResultRows({county_name:a},{county_name:b},'mayor'));
 option($('trendCounty'),[['','全部地区（含金门、马祖）'],...countyNames.map(n=>[n,n])],conf.county);updateTowns()
}
function updateTowns(){
 const conf=settings(),towns=new Set();
 const possible=conf.county&&['president','mayor','township'].includes(conf.office)||conf.county&&conf.office==='legislative'&&conf.electorate!=='regional';
 if(possible)for(const {snapshot:s} of models)if(s)for(const r of s.rows||[]){
  if(r.type!==conf.office||r.level!=='town'||!r.town)continue;
  if((conf.unified?T.modern(norm(r.county)):norm(r.county))===conf.county)towns.add(norm(r.town))
 }
 option($('trendTown'),[['','全部乡镇市区'],...[...towns].sort((a,b)=>a.localeCompare(b,'zh')).map(t=>[t,t])],conf.town);
 $('trendTown').disabled=!possible||!towns.size;
}
const range=()=>{const a=Number($('trendStart').value),b=Number($('trendEnd').value);return models.filter(r=>r.year>=Math.min(a,b)&&r.year<=Math.max(a,b))};
function scoped(override={}){
 const conf={...settings(),...override};
 return range().map(item=>item.snapshot?model(item.snapshot,conf):{year:item.year,label:label(item.year,conf.office),complete:false,parties:{},reason:item.error})
}
function allParties(rows){
 const totals={};for(const row of rows)for(const [p,v] of Object.entries(row.parties))totals[p]=(totals[p]||0)+v.votes;
 return Object.keys(totals).sort((a,b)=>totals[b]-totals[a]||a.localeCompare(b,'zh'))
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
  const click=()=>showYear(row.year,settings().county);p.addEventListener('click',click);p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();click()}})
 };
 if(stack){
  rows.forEach((row,i)=>{let acc=0;for(const s of series){const v=s.get(row);if(!Number.isFinite(v))continue;const h=v/max*(bottom-top),p=svg('rect',{x:x(i)-19,y:y(acc+v),width:38,height:h,fill:s.color,stroke:'#fff','stroke-width':.5});addPoint(p,row,s,v);g.append(p);acc+=v}})
 }else for(const s of series){
  let d='',previous=null;
  rows.forEach((row,i)=>{const v=s.get(row);if(!Number.isFinite(v)){previous=null;return}
   if(breakOld&&previous&&previous.oldPartyVote!==row.oldPartyVote)previous=null;
   d+=(previous?'L':'M')+x(i)+' '+y(v)+' ';previous=row;
  });
  g.append(svg('path',{d,fill:'none',stroke:s.color,'stroke-width':2.5,'stroke-linejoin':'round'}));
  rows.forEach((row,i)=>{const v=s.get(row);if(!Number.isFinite(v))return;const p=svg('circle',{cx:x(i),cy:y(v),r:4.5,fill:s.color,stroke:'#fff','stroke-width':1});addPoint(p,row,s,v);g.append(p)})
 }
 if(breakOld){const i=rows.findIndex(r=>!r.oldPartyVote);if(i>0){const xx=(x(i-1)+x(i))/2;g.append(svg('line',{x1:xx,x2:xx,y1:top,y2:bottom,stroke:'#8a938d','stroke-dasharray':'4 4'}),svg('text',{x:xx+4,y:top-7,'font-size':10},'2008制度改革'))}}
 series.forEach((s,i)=>{const xx=20+(i%4)*(width-40)/4,yy=319+Math.floor(i/4)*24;g.append(svg('rect',{x:xx,y:yy-10,width:11,height:11,rx:2,fill:s.color}),svg('text',{x:xx+16,y:yy,'font-size':11},s.name.length>16?s.name.slice(0,16)+'…':s.name))});
 return g
}
function showYear(year,county){
 const conf=settings(),readout=$('trendPointReadout');
 if(readout){readout.replaceChildren(node('strong','',label(year,conf.office)+' · '+(county||'全部地区')+' '));
  const b=node('button','button quiet','打开该届结果');b.onclick=()=>{
   const o=$('historyOffice'),e=$('historyElectorate'),y=$('historyYear');
   const apply=event=>{if(event.detail.snapshot.year!==year)return;window.removeEventListener('historysnapshotready',apply);const c=$('historyCounty');if([...c.options].some(o=>o.value===county)){c.value=county;c.dispatchEvent(new Event('change',{bubbles:true}))}};
   window.addEventListener('historysnapshotready',apply);
   if(o.value!==conf.office){o.value=conf.office;o.dispatchEvent(new Event('change',{bubbles:true}))}
   if([...e.options].some(x=>x.value===conf.electorate)){e.value=conf.electorate;e.dispatchEvent(new Event('change',{bubbles:true}))}
   if([...y.options].some(x=>Number(x.value)===year)){y.value=String(year);y.dispatchEvent(new Event('change',{bubbles:true}))}
   $('historyViewTrends').click();
   if(History2022View.snapshot()?.year===year){apply({detail:{snapshot:History2022View.snapshot()}})}
  };readout.append(b)
 }
}
function matrix(rows,conf){
 const width=Math.max(720,rows.length*67+160),h=countyNames.length*27+76,g=baseSvg('历届县市选举版图',width,h);
 const grid=new Map(),cellWidth=(width-150)/Math.max(1,rows.length);
 const useSeats=!['president'].includes(conf.office)&&!(conf.office==='legislative'&&conf.electorate!=='regional');
 rows.forEach((r,i)=>g.append(svg('text',{x:132+(i+.5)*cellWidth,y:47,'text-anchor':'middle','font-size':11},label(r.year,conf.office))));
 for(const [j,county] of countyNames.entries()){
  const list=scoped({county,town:''});grid.set(county,list);
  const y=56+j*27;g.append(svg('text',{x:121,y:y+16,'text-anchor':'end'},county));
  list.forEach((r,i)=>{
   const leader=useSeats?r.seatLeader:r.voteLeader,p=svg('rect',{x:132+i*cellWidth+1,y,width:Math.max(1,cellWidth-3),height:23,rx:2,fill:leader?color(leader):'#e7ebe8',stroke:'#fff'});
   p.append(svg('title',{},county+' '+(r.label||r.year)+'：'+(leader||r.reason||'无可核实结果')));p.setAttribute('tabindex','0');p.setAttribute('role','button');p.setAttribute('aria-label',county+' '+r.year+' '+(leader||'缺档'));
   const click=()=>showYear(r.year,county);p.onclick=click;p.onkeydown=e=>{if(e.key==='Enter'){click()}};g.append(p)
  })
 }
 const parties=[...new Set([...grid.values()].flatMap(rs=>rs.map(r=>useSeats?r.seatLeader:r.voteLeader)).filter(Boolean))];
 return {g,grid,parties,useSeats}
}
function comparison(grid,rows,conf,host){
 if(rows.length<2)return;
 const box=card('两届选举变化','选择两届及政党。得票率变化以百分点计；行政区统一口径下，合并前的市县票数先加总。',null),controls=node('div','trend-controls');
 const a=control(controls,'trendCompareA','基准届次'),b=control(controls,'trendCompareB','比较届次'),p=control(controls,'trendCompareParty','指定政党'),m=control(controls,'trendCompareMetric','变化指标');
 const dates=rows.map(r=>[r.year,label(r.year,conf.office)]);option(a,dates,rows.at(-2).year);option(b,dates,rows.at(-1).year);option(p,allParties(rows).map(n=>[n,n]),[...selectedParties][0]);option(m,[['share','得票率（百分点）'],['votes','得票数'],['seats','当选席次']], 'share');
 const target=node('div');box.append(controls,target);host.append(box);
 function draw(){
  target.replaceChildren();const first=Number(a.value),last=Number(b.value),party=p.value,metric=m.value;
  const entries=[...grid].map(([county,list])=>{const x=list.find(r=>r.year===first),y=list.find(r=>r.year===last);return{county,x,y,change:T.difference(x,y,party,metric)}});
  if(conf.office==='legislative'&&conf.electorate==='party'&&(first<2008)!==(last<2008)){target.append(node('p','data-help','2008年前为席次计算票，2008年后为独立政党票，跨制度比较不计算变化幅度。'));return}
  const geometry=History2022View.trendCounties?.()||[];
  if(conf.unified&&geometry.length){
   const W=790,H=365,g=baseSvg(party+' · '+metrics[metric]+'变化',W,H),bounds=geometry.reduce((a,f)=>[Math.min(a[0],f.box[0]),Math.min(a[1],f.box[1]),Math.max(a[2],f.box[2]),Math.max(a[3],f.box[3])],[Infinity,Infinity,-Infinity,-Infinity]);
   const max=Math.max(1,...entries.map(e=>Math.abs(e.change??0))),scale=Math.min(220/(bounds[2]-bounds[0]),280/(bounds[3]-bounds[1]));
   const shade=(v,limit)=>{if(v==null)return'#dfe5e1';const ratio=Math.min(1,Math.abs(v)/limit),rgb=v<0?[168,65,53]:[24,123,83];return '#'+rgb.map(x=>Math.round(242+(x-242)*ratio).toString(16).padStart(2,'0')).join('')};
   const maxVal=Math.max(1,...entries.flatMap(e=>[T.value(e.x,party,metric),T.value(e.y,party,metric)]).filter(Number.isFinite));
   for(let i=0;i<3;i++){
    const left=14+i*260;g.append(svg('text',{x:left+120,y:45,'text-anchor':'middle','font-weight':700},i===0?label(first,conf.office):i===1?label(last,conf.office):'变化幅度'));
    const group=svg('g',{transform:'translate('+(left+120-(bounds[0]+bounds[2])*scale/2)+' '+(58-bounds[1]*scale)+') scale('+scale+')'});
    for(const f of geometry){const e=entries.find(x=>x.county===norm(f.name||f.county)),v=i===2?e?.change:T.value(i===0?e?.x:e?.y,party,metric);const path=svg('path',{d:f.d,fill:shade(v,i===2?max:maxVal),stroke:'#fff','stroke-width':.8/scale});path.append(svg('title',{},(f.name||f.county)+' '+fmt(v,metric==='share'&&i!==2)));group.append(path)}
    g.append(group)
   }
   g.append(svg('text',{x:18,y:350,'font-size':11},'红色下降 · 绿色上升 · 灰色缺档；两届原值共用色阶，变化图以零为中心。'));
   target.append(g);const exportRow=node('div','trend-actions');for(const ext of ['SVG','PNG']){const button=node('button','button quiet','导出 '+ext);button.onclick=()=>chartExport(g,'两届选举变化地图',ext==='PNG');exportRow.append(button)}target.append(exportRow)
  }else target.append(node('p','data-help','当前为历史县市口径，避免用现行边界冒充历史行政区，仅显示对照表。'));
  const wrap=node('div','history-table-wrap'),table=node('table','history-candidate-table'),head=node('thead'),hr=node('tr');for(const v of ['县市','基准值','比较值','增减'])hr.append(node('th','',v));head.append(hr);table.append(head);const body=node('tbody');
  entries.sort((x,y)=>(y.change??-Infinity)-(x.change??-Infinity));for(const e of entries){const tr=node('tr');for(const v of [e.county,fmt(T.value(e.x,party,metric),metric==='share'),fmt(T.value(e.y,party,metric),metric==='share'),e.change==null?'—':(e.change>0?'+':'')+fmt(e.change)+(metric==='share'?' 个百分点':'')])tr.append(node('td','',v));body.append(tr)}table.append(body);wrap.append(table);target.append(wrap)
 }
 for(const c of [a,b,p,m])c.onchange=draw;draw()
}
function render(){
 if(!panel||panel.hidden||!models.length)return;
 const conf=settings(),rows=scoped(),parties=allParties(rows),output=$('trendCharts');
 if(!partyTouched){selectedParties=new Set(parties.slice(0,6));partyTouched=true}
 selectedParties=new Set([...selectedParties].filter(p=>parties.includes(p)));
 const picker=$('trendParties');picker.replaceChildren();for(const p of parties){const l=node('label','trend-party'),input=node('input');input.type='checkbox';input.checked=selectedParties.has(p);input.onchange=()=>{input.checked?selectedParties.add(p):selectedParties.delete(p);partyTouched=true;render()};const dot=node('i');dot.style.background=color(p);l.append(input,dot,node('span','',p));picker.append(l)}
 output.replaceChildren();$('trendCsv').disabled=false;
 const missing=rows.filter(r=>!r.complete);$('trendStatus').textContent=rows.length+' 届 · '+(rows.length-missing.length)+' 届有完整可用结果'+(missing.length?' · 缺档：'+missing.map(r=>r.label+'（'+r.reason+'）').join('；'):'')+(conf.unified?' · 旧县市按现行县市名称归并，不等同于历届行政边界。':' · 当届县市名称口径。')+(conf.town?' 同名乡镇不保证历史里界完全一致。':'');
 const readout=node('div','trend-point-readout','点击图表数据点或县市色块，可打开对应届次。');readout.id='trendPointReadout';output.append(readout);
 const metric=$('trendMetric').value,chosen=[...selectedParties],s=chosen.map(p=>({name:p,color:color(p),get:r=>T.value(r,p,metric)}));
 const isOldParty=conf.office==='legislative'&&conf.electorate==='party';
 if(s.length){
  const g=chart(rows,s,'政党'+metrics[metric]+'趋势',{pct:['share','seatShare'].includes(metric),rank:metric==='rank',breakOld:isOldParty});
  output.append(card('政党'+metrics[metric]+'趋势','点选数据点查看该届；缺失值不连线。2008年前不分区为旧制席次计算票。',g));
  if(rows.some(r=>Number.isFinite(r.seats))){
   const all=parties.map(p=>({name:p,color:color(p),get:r=>T.value(r,p,'seats')}));
   output.append(card('当选席次构成','堆叠柱展示完整当选席次；不受政党筛选影响。',chart(rows,all,'当选席次构成',{stack:true,breakOld:isOldParty})));
   output.append(card('政党席次排名','并列使用相同名次，无席次不绘制。',chart(rows,chosen.map(p=>({name:p,color:color(p),get:r=>T.value(r,p,'rank')})),'政党席次排名',{rank:true,breakOld:isOldParty})))
  }
 }else output.append(card('政党趋势','请选择至少一个政党，或切换有完整数据的范围。',null));
 const groupAll=conf.electorate==='all'&&['council','township'].includes(conf.office);
 if(groupAll){
  output.append(card('投票参与','不同选举身份的登记选民可能重叠，请选择单一选举类型查看投票率与有效率。',null))
 }else{
  output.append(card('投票率与有效率','分母采用核验的选举人数及投票人数，不从有效票反推。',chart(rows,[{name:'投票率',color:colors[0],get:r=>r.turnout},{name:'有效率',color:colors[1],get:r=>r.validRate}],'投票参与率',{pct:true})));
  output.append(card('投票规模','登记选民、投票人数和有效票分别显示。',chart(rows,[{name:'选举人数',color:colors[0],get:r=>r.registered},{name:'投票人数',color:colors[2],get:r=>r.cast},{name:'有效票',color:colors[3],get:r=>r.valid}],'投票规模')))
 }
 if(rows.some(r=>r.candidateCount!=null)){
  output.append(card('候选人与当选人结构','领导人按候选组合计数；不分区名单、地方票分布不推算候选人数。',chart(rows,[{name:'候选人数',color:colors[0],get:r=>r.candidateCount},{name:'当选人数',color:colors[1],get:r=>r.electedCount}],'候选人与当选人')));
  output.append(card('性别及现任结构','比例仅在已知字段内计算；虚缺通过覆盖率展示。现任连任率为已确认现任参选者的当选比例。',chart(rows,[{name:'女性候选人比例',color:colors[1],get:r=>r.femaleCandidate},{name:'女性当选人比例',color:colors[3],get:r=>r.femaleElected},{name:'现任参选比例',color:colors[2],get:r=>r.incumbentRate},{name:'现任连任率',color:colors[0],get:r=>r.reelectionRate}],'性别及现任结构',{pct:true})));
  output.append(card('结构资料覆盖率','避免将未核实性别、现任信息视为否。',chart(rows,[{name:'候选人性别覆盖率',color:colors[1],get:r=>r.genderCoverage},{name:'当选人性别覆盖率',color:colors[3],get:r=>r.electedGenderCoverage},{name:'现任资料覆盖率',color:colors[0],get:r=>r.incumbentCoverage}],'资料覆盖率',{pct:true})))
 }
 if(countyNames.length&&rows.length){
  const mat=matrix(rows,conf),c=card('历届县市选举版图',mat.useSeats?'按当选席次最多政党着色；并列灰色、缺档浅灰色。':'按当地最高票政党着色，并非当地另行产生当选者。',mat.g);
  const legend=node('div','trend-party-picker');for(const p of mat.parties){const l=node('span','trend-party'),dot=node('i');dot.style.background=color(p);l.append(dot,node('span','',p));legend.append(l)}c.append(legend);output.append(c);
  comparison(mat.grid,rows,conf,output)
 }
 const last=rows.filter(r=>r.complete).at(-1);
 if(last&&Number.isFinite(last.seats)&&conf.office==='legislative'){
  const graph=chart(rows,chosen.flatMap(p=>[{name:p+' 得票率',color:color(p),get:r=>T.value(r,p,'share')},{name:p+' 席次占比',color:color(p),get:r=>T.value(r,p,'seatShare')}]),'得票与席次占比',{pct:true,breakOld:isOldParty});output.append(card('得票率与席次占比','同一票种内比较；精确数值可在CSV中核对。',graph))
 }
}
function exportCsv(){
 const conf=settings(),rows=scoped(),parties=allParties(rows),out=[['选举类别','票种','届次','实际县市口径','范围','政党','得票数','得票率(%)','席次','席次占比(%)','选举人数','投票人数','投票率(%)','有效票','无效票','有效率(%)','候选人数','当选人数','女性候选人比例(%)','女性当选人比例(%)','现任参选比例(%)','现任连任率(%)','候选人性别覆盖率(%)','当选人性别覆盖率(%)','现任资料覆盖率(%)','资料状态','票种口径']];
 for(const r of rows)for(const p of parties.length?parties:['']){
  const v=k=>T.value(r,p,k),n=x=>Number.isFinite(x)?Math.round(x*100)/100:'';
  out.push([offices[conf.office],conf.electorate,r.label,conf.unified?'统一现行县市':'当届县市',[conf.county||'全部地区',conf.town].filter(Boolean).join(' · '),p,n(v('votes')),n(v('share')),n(v('seats')),n(v('seatShare')),n(r.registered),n(r.cast),n(r.turnout),n(r.valid),n(r.invalid),n(r.validRate),n(r.candidateCount),n(r.electedCount),n(r.femaleCandidate),n(r.femaleElected),n(r.incumbentRate),n(r.reelectionRate),n(r.genderCoverage),n(r.electedGenderCoverage),n(r.incumbentCoverage),r.complete?'已收录完整结果':r.reason,r.oldPartyVote?'旧制席次计算票':'当届正式结果'])
 }
 exportFile(C.csv(out),'历史趋势-'+offices[conf.office]+'.csv','text/csv;charset=utf-8')
}
window.HistoryTrendsUI={open(selection){create();if(!panel)return;const first=!currentSelection;currentSelection=selection;
 if(first){$('trendOffice').value=selection.office;setupYears(true);if([...$('trendBallot').options].some(x=>x.value===selection.electorate))$('trendBallot').value=selection.electorate;load()}
 else if(!models.length&&request===0)load();
},close(){},render};
})();
