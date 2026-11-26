/* The map sidebar is the only election/scope/metric selector. */
(function(){
'use strict';
const T=window.HistoryTrends,C=window.HistoryCore,$=id=>document.getElementById(id);
const offices={president:'台湾地区领导人',legislative:'立法机构民代',mayor:'县市长',council:'县市议员',township:'乡镇市区长'};
const ns='http://www.w3.org/2000/svg';
let panel=null,request=0,cache=new Map(),models=[],activeKey='',selection=null,renderedKey='',loading=false,closed=true,lastRows=[],lastSeries=[],lastTitle='',legislativeExport=null,selectedYears=new Set(),knownYears=[];
const norm=v=>simplify(String(v||'')).replaceAll('臺','台');
const fmt=(v,pct=false)=>Number.isFinite(v)?pct?v.toFixed(2)+'%':v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n};
const svg=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n};
const displayParty=p=>/^(连署|連署)$/.test(String(p))?'无党籍（连署）':p;
const color=p=>p==='并列'?'#9ba69f':p==='其他政党'?'#aebbb2':predictionParty(p).color;
const yearsFor=o=>o==='president'?HistoryPresidential.YEARS:o==='legislative'?HistoryLegislative.YEARS:HistoryLocal.years(o,window.HISTORY_2026_RESULTS_AVAILABLE===true);
const label=(y,o)=>o==='council'&&[1994,1998,2002].includes(Number(y))?String(y):HistoryLocal.yearLabel(y,o);
const optionText=id=>$(id)?.selectedOptions?.[0]?.textContent||'';
function settings(){return selection||{}}
function create(){
 if(panel)return;panel=$('historyTrendsPanel');if(!panel)return;
 const heading=node('div','trend-heading');heading.append(node('h3','','跨届选举趋势'),node('p','','按左侧选举类别、民代类别及地图范围展示所选届次。'));
 const scope=node('p','data-help');scope.id='trendScope';
 const controls=node('div','trend-year-controls');controls.id='trendYearControls';const yearTitle=node('div','trend-year-title');yearTitle.append(node('strong','','比较届次'));for(const [id,text] of [['trendSelectAll','全选'],['trendSelectNone','清空']]){const b=node('button','button quiet',text);b.type='button';b.id=id;yearTitle.append(b)}const years=node('div','trend-year-picker');years.id='trendYears';controls.append(yearTitle,years);
 const actions=node('div','trend-actions');for(const [id,title] of [['trendRetry','重新载入'],['trendCsv','导出当前趋势 CSV']]){const b=node('button','button quiet',title);b.type='button';b.id=id;actions.append(b)}
 const status=node('p','data-help');status.id='trendStatus';status.setAttribute('role','status');
 const output=node('div','trend-charts');output.id='trendCharts';
 panel.append(heading,scope,controls,actions,status,output);
 $('trendSelectAll').onclick=()=>{selectedYears=new Set(knownYears);setYears(settings(),false);load();window.dispatchEvent(new Event('site-route-change'))};
 $('trendSelectNone').onclick=()=>{selectedYears.clear();setYears(settings(),false);load();window.dispatchEvent(new Event('site-route-change'))};
 $('trendRetry').onclick=()=>{cache.clear();activeKey='';renderedKey='';load()};
 $('trendCsv').onclick=exportCsv;
}
function readSelection(s){
 const filters=History2022View.trendFilters?.()||{};
 return {...s,...filters,normalize:norm};
}
function setYears(conf,reset){
 const ys=yearsFor(conf.office);if(reset)selectedYears=new Set(ys);else for(const y of ys)if(!knownYears.includes(y))selectedYears.add(y);knownYears=[...ys];
 const host=$('trendYears');host.replaceChildren();for(const y of ys){const l=node('label','trend-year'),input=node('input');input.type='checkbox';input.value=String(y);input.checked=selectedYears.has(y);input.onchange=()=>{if(input.checked)selectedYears.add(y);else selectedYears.delete(y);renderedKey='';load();window.dispatchEvent(new Event('site-route-change'))};l.append(input,node('span','',label(y,conf.office)));host.append(l)}
}
async function snapshot(office,year){
 if(office==='president')return HistoryPresidential.load(year);
 if(office==='legislative')return HistoryLegislative.load(year);
 if(year===2022||year===2026)return History2022View.trendSnapshot(year);
 return HistoryLocal.loadCycle(year,office);
}
const range=conf=>yearsFor(conf.office).filter(y=>selectedYears.has(y));
async function load(){
 if(!selection||panel.hidden)return;
 const conf=settings(),ys=range(conf),key=conf.office+'|'+ys.join(','),token=++request;
 activeKey=key;loading=true;models=[];lastRows=[];lastSeries=[];
 $('trendStatus').textContent='正在载入所选范围的历届正式结果…';$('trendCharts').replaceChildren();$('trendCsv').disabled=true;
 if(!ys.length){loading=false;$('trendStatus').textContent='请至少勾选一个届次。';return}
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
function fullLegislature(conf){return conf.office==='legislative'&&!conf.county&&!conf.focus&&(conf.metric==='seats'||conf.metric==='party'&&['regional','all'].includes(conf.electorate))}
function description(conf){
 const selected=conf.candidateScope==='candidate'&&(conf.metric==='share'||conf.metric==='votes');
 return [offices[conf.office],conf.office==='legislative'&&conf.electorate==='all'?'全部类型（总席次；不分区票得票率）':optionText('historyElectorate'),conf.county||'全部地区（含金门、马祖）',optionText('historyScale'),conf.focus,['legislative','council'].includes(conf.office)?'当选席次与得票率':optionText('historyMetric'),conf.metric==='seats'?conf.party:selected?(conf.candidate?.name||conf.candidate?.party||'未指定候选人'):''].filter(Boolean).join(' · ');
}
function exportFile(content,name,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function chartExport(graph,title,png){
 const copy=graph.cloneNode(true);copy.setAttribute('xmlns',ns);const box=graph.viewBox.baseVal;copy.setAttribute('width',box.width);copy.setAttribute('height',box.height);
 // Bundled emblems are already data URLs; inline any local file reference so
 // downloaded SVG and canvas-rendered PNG never depend on the site URL.
 try{await Promise.all([...copy.querySelectorAll('image[href]')].map(async image=>{const href=image.getAttribute('href');if(!href||href.startsWith('data:'))return;const response=await fetch(href);if(!response.ok)throw Error('党徽读取失败');const blob=await response.blob();const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});image.setAttribute('href',data)}))}catch(e){$('trendStatus').textContent='党徽未能读取，请重新载入后导出。';return}
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
function chart(rows,series,title,{pct=false,stack=false,rank=false,breakOld=false,integer=false}={}){
 const width=Math.max(700,rows.length*(rows.some(r=>r.scopeLabel)?79:65)+100),height=346+Math.ceil(series.length/4)*24,g=baseSvg(title,width,height),l=64,r=width-25,top=48,bottom=270;
 const vals=rows.flatMap((row,i)=>stack?[series.reduce((n,s)=>n+(s.get(row)||0),0)]:series.map(s=>s.get(row))).filter(Number.isFinite);
 const ticks=integer?T.integerTicks(Math.max(1,...vals)):null;
 const max=ticks?ticks.at(-1):pct?100:rank?Math.max(3,...vals):Math.max(1,...vals)*1.08;
 const slots=rows.map((row,i)=>i&&rows[i-1].year===row.year?0.72:1.18);
 const centers=[];let offset=0;for(let i=0;i<rows.length;i++){if(i)offset+=slots[i];centers.push(offset)}
 const unit=(r-l)/Math.max(1,offset+1.18),barWidth=Math.min(58,unit*.66);
 const x=i=>l+unit*(.59+centers[i]),y=v=>rank?top+(v-1)/(max-1)*(bottom-top):bottom-v/max*(bottom-top);
 for(const v of ticks||Array.from({length:5},(_,i)=>rank?1+i*(max-1)/4:i*max/4)){
  const yy=y(v);
  g.append(svg('line',{x1:l,x2:r,y1:yy,y2:yy,stroke:'#e2eae5'}),svg('text',{x:l-9,y:yy+4,'text-anchor':'end','font-size':11,'data-trend-axis-tick':String(v)},integer?String(v):rank?Math.round(v):pct?Math.round(v)+'%':Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(v)))
 }
 rows.forEach((row,i)=>{
  const labelText=row.label||String(row.year);
  g.append(svg('text',{x:x(i),y:bottom+21,'text-anchor':'middle','font-size':11},labelText));
  if(row.scopeLabel)g.append(svg('text',{x:x(i),y:bottom+37,'text-anchor':'middle','font-size':10},row.scopeLabel));
  if(!row.complete)g.append(svg('text',{x:x(i),y:bottom+(row.scopeLabel?51:37),'text-anchor':'middle',fill:'#956e51','font-size':10},'缺档'));
 });
 const addPoint=(p,row,s,v)=>{
  p.append(svg('title',{},(row.label||row.year)+' '+(row.scopeLabel?row.scopeLabel+' ':'')+s.name+'：'+fmt(v,pct)+(row.dates?.length?' · '+row.dates.join(' / '):'')));
  p.setAttribute('tabindex','0');p.setAttribute('role','button');p.setAttribute('aria-label',(row.label||row.year)+' '+(row.scopeLabel?row.scopeLabel+' ':'')+s.name+' '+fmt(v,pct));
  const click=()=>showYear(row.year,row.county,row.label);p.addEventListener('click',click);p.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();click()}})
 };
 if(stack){
  const labelColor=fill=>{const m=/^#([0-9a-f]{6})$/i.exec(fill||'');if(!m)return'#fff';const c=m[1].match(/../g).map(v=>parseInt(v,16));return(c[0]*.299+c[1]*.587+c[2]*.114)>150?'#17352b':'#fff'};
  rows.forEach((row,i)=>{
   let acc=0;const annotations=[];
   for(const s of series){
    const v=s.get(row);if(!Number.isFinite(v)||v<=0)continue;
    const h=v/max*(bottom-top),middle=y(acc+v/2),p=svg('rect',{x:x(i)-barWidth/2,y:y(acc+v),width:barWidth,height:h,fill:s.color,stroke:'#fff','stroke-width':.5});
    addPoint(p,row,s,v);g.append(p);
    if(integer){
     const textValue=fmt(v),inside=h>=13&&barWidth>=textValue.length*6+8;
     annotations.push({value:textValue,middle,inside,color:s.color,name:s.name});
    }
    acc+=v;
   }
   for(const a of annotations.filter(a=>a.inside))g.append(svg('text',{x:x(i),y:a.middle+3,'text-anchor':'middle','font-size':10,'font-weight':700,fill:labelColor(a.color),'pointer-events':'none','data-trend-seat-label':a.name},a.value));
   let last=top-4;
   for(const a of annotations.filter(a=>!a.inside).sort((a,b)=>a.middle-b.middle)){
    const baseline=Math.max(a.middle+3,last+11,top+7);last=baseline;
    const edge=x(i)+barWidth/2;
    g.append(svg('line',{x1:edge,x2:edge+6,y1:a.middle,y2:baseline-3,stroke:a.color,'stroke-width':1,'pointer-events':'none'}),svg('text',{x:edge+7,y:baseline,'font-size':9,'font-weight':700,fill:'#213b31','pointer-events':'none','data-trend-seat-label':a.name},a.value));
   }
   if(row.complete)g.append(svg('text',{x:x(i),y:y(acc)-6,'text-anchor':'middle','font-size':11,'font-weight':700,'data-trend-total':String(acc)},fmt(acc)));
  })
 }else for(const s of series){
  const branches=new Map();
  rows.forEach((row,i)=>{const k=row.scopeSeries||'',state=branches.get(k)||{d:'',previous:null};const v=s.get(row);if(!Number.isFinite(v)){state.previous=null;branches.set(k,state);return}
   if(breakOld&&state.previous&&state.previous.oldPartyVote!==row.oldPartyVote)state.previous=null;
   state.d+=(state.previous?'L':'M')+x(i)+' '+y(v)+' ';state.previous=row;branches.set(k,state);
  });
  for(const {d} of branches.values())g.append(svg('path',{d,fill:'none',stroke:s.color,'stroke-width':2.5,'stroke-linejoin':'round',...(s.dash?{'stroke-dasharray':'6 4'}:{})}));
  rows.forEach((row,i)=>{const v=s.get(row);if(!Number.isFinite(v))return;const p=svg('circle',{cx:x(i),cy:y(v),r:4.5,fill:s.color,stroke:'#fff','stroke-width':1});addPoint(p,row,s,v);g.append(p)})
 }
 if(breakOld){const i=rows.findIndex(r=>!r.oldPartyVote);if(i>0){const xx=(x(i-1)+x(i))/2;g.append(svg('line',{x1:xx,x2:xx,y1:top,y2:bottom,stroke:'#8a938d','stroke-dasharray':'4 4'}),svg('text',{x:xx+4,y:top-7,'font-size':10},'2008制度改革'))}}
 series.forEach((s,i)=>{const xx=20+(i%4)*(width-40)/4,yy=338+Math.floor(i/4)*24;g.append(s.dash?svg('line',{x1:xx,x2:xx+12,y1:yy-5,y2:yy-5,stroke:s.color,'stroke-width':2,'stroke-dasharray':'4 2'}):svg('rect',{x:xx,y:yy-10,width:11,height:11,rx:2,fill:s.color}),svg('text',{x:xx+16,y:yy,'font-size':11},s.name.length>16?s.name.slice(0,16)+'…':s.name))});
 return g
}

function showYear(year,county,actualLabel){
 const readout=$('trendPointReadout');if(!readout)return;
 readout.replaceChildren(node('strong','',(actualLabel||label(year,settings().office))+' · '+(county||settings().county||'全部地区')+' '));
 const b=node('button','button quiet','查看该届结果');b.type='button';
 b.onclick=()=>{
  const y=$('historyYear'),office=settings().office;
  if(![...y.options].some(o=>Number(o.value)===year))return;
  const apply=event=>{
   if(event.detail.snapshot?.year!==year||History2022View.office()!==office)return;
   window.removeEventListener('historysnapshotready',apply);
   const c=$('historyCounty');if(county&&[...c.options].some(o=>o.value===county)){c.value=county;c.dispatchEvent(new Event('change',{bubbles:true}))}
  };
  window.addEventListener('historysnapshotready',apply);setTimeout(()=>window.removeEventListener('historysnapshotready',apply),15000);
  if(y.value===String(year))apply({detail:{snapshot:History2022View.snapshot()}});
  else{y.value=String(year);y.dispatchEvent(new Event('change',{bubbles:true}))}
  if($('historyViewTrends').getAttribute('aria-pressed')==='true')$('historyViewTrends').click()
 };
 readout.append(b)
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
   const fill=conf.metric==='seats'&&party!==norm(conf.party)?'#cbd4ce':color(party);
   for(let i=0;i<count;i++){const p=points[index++];group.append(svg('circle',{cx:cx+p.x*r,cy:cy+p.y*r,r:dot,fill,'data-seat-dot':'1'}))}
   g.append(group);
  }
  g.append(svg('text',{x:cx,y:cy-12,'text-anchor':'middle','font-size':25,'font-weight':700,'data-seat-total':total},total+'席'));
  if(conf.metric==='seats')g.append(svg('text',{x:cx,y:cy+5,'text-anchor':'middle','font-size':11},conf.party+' '+(row.parties?.[norm(conf.party)]||0)+'席'));
  parties.forEach(([p,n],i)=>{
   const x=16+(i%2)*202,y=263+Math.floor(i/2)*23,fill=conf.metric==='seats'&&p!==norm(conf.party)?'#cbd4ce':color(p);
   g.append(svg('rect',{x,y:y-12,width:8,height:12,rx:2,fill}));
   const logo=logoFor(predictionParty(p));
   if(logo)appendCircularPartyLogo(g,logo,x+12,y-15,17,{'data-seat-logo':p});
   g.append(svg('text',{x:x+34,y,'font-size':11},p+' '+n+'席'));
  });

 return g;
}
function renderParliaments(out,rows,conf,totalLeg){
 const section=node('section','trend-parliament-section');
 section.append(node('h4','','历届席次分布'),node('p','data-help','每个圆点代表一席；民进党居左、国民党居右，明确的传统亲绿或亲蓝政党邻近排列，其余政党和无党籍居中。标线为过半门槛。合并前原县与原市并排展示，分别计算。'));
 const grid=node('div','trend-parliament-grid');section.append(grid);
 const groups=new Map();for(const row of rows){if(!groups.has(row.year))groups.set(row.year,[]);groups.get(row.year).push(row)}
 if([...groups.values()].some(list=>list.length>1))grid.classList.add('trend-parliament-paired-grid');
 for(const [year,list] of groups){
  const title=list.map(r=>r.label+(r.scopeLabel?' · '+r.scopeLabel:'')).join(' / ')+' · 席次分布';
  const graphs=list.map(row=>parliamentSvg(row,conf,totalLeg));
  if(!graphs.some(Boolean)){grid.append(card(title,list.map(r=>r.reason||'无完整席次资料').join('；'),null));continue}
  let graph=graphs[0];
  if(list.length>1){
   const W=840,H=Math.max(...graphs.map(g=>g?Number(g.getAttribute('viewBox').split(' ')[3]):280));
   graph=svg('svg',{viewBox:'0 0 '+W+' '+H,role:'img','aria-label':title,'font-family':'Arial, "Microsoft YaHei", sans-serif','font-size':'12',fill:'#31473e','data-seat-pair':year});
   graph.append(svg('rect',{x:0,y:0,width:W,height:H,fill:'#fff'}),svg('title',{},title));
   graphs.forEach((g,i)=>{if(g){const group=svg('g',{transform:'translate('+(i*420)+' 0)'});for(const child of [...g.children])group.append(child);graph.append(group)}else{graph.append(svg('text',{x:i*420+20,y:30,'font-weight':700},list[i].label+' · '+list[i].scopeLabel),svg('text',{x:i*420+20,y:60},list[i].reason||'无完整资料'))}});
   graph.append(svg('line',{x1:420,x2:420,y1:15,y2:H-12,stroke:'#dce8e0','stroke-width':1}));
  }
  const item=card(title,'',graph);item.classList.add('trend-parliament-card');if(list.length>1)item.classList.add('trend-parliament-pair');grid.append(item);
 }
 out.append(section);
}
function renderLegislative(conf,anchor,out){
 const ballot=conf.electorate,national=!conf.county,isLeg=conf.office==='legislative';
 const seatBallot=national||ballot==='all'||ballot==='regional';
 const effective=T.trendEffectiveSelection(conf),allSeats=isLeg&&ballot==='all'&&national;
 const seatRows=seatBallot?models.flatMap(item=>{
  if(!item.snapshot)return[{year:item.year,label:String(item.year),complete:false,reason:item.error,parties:{},values:{}}];
  const officialBallot=isLeg&&national&&['plains','mountain','party'].includes(ballot);
  const result=!isLeg?T.councilBallotRows(item.snapshot,{...conf,electorate:ballot==='all'&&conf.county?'regional':ballot}).map(r=>({...r,parties:r.seats})):allSeats?[T.allLegislativeSeats(item.snapshot,HistoryLegislativeParty.build(item.year,item.snapshot),norm)]:officialBallot?[T.aggregate(item.snapshot,{office:'legislative',electorate:ballot,normalize:norm,partySeats:ballot==='party'?HistoryLegislativeParty.build(item.year,item.snapshot):null})].map(r=>({...r,year:item.year,label:String(item.year),parties:Object.fromEntries(Object.entries(r.parties).map(([p,v])=>[p,v.seats||0]))})):T.historicalScopeRows(item.snapshot,{...effective,electorate:ballot==='all'?'regional':ballot,metric:'party'},anchor);
  return result.map(r=>{if(allSeats||officialBallot)r.dates=T.electionDates(item.snapshot,'legislative','',norm);return r});
 }):[];
 const voteRows=models.flatMap(item=>item.snapshot?isLeg?T.legislativeVoteShares(item.snapshot,conf,anchor):T.councilBallotRows(item.snapshot,conf):[{year:item.year,label:String(item.year),complete:false,reason:item.error,parties:{},votes:{},valid:null}]);
 const allRows=[...seatRows,...voteRows],missing=allRows.filter(r=>!r.complete);
 $('trendStatus').textContent=models.length+' 届 · '+(allRows.length-missing.length)+' 条完整指标结果'+(missing.length?' · '+missing.map(r=>r.label+(r.scopeLabel?' '+r.scopeLabel:'')+'：'+r.reason).join('；'):'');
 if(T.historicalCountyFamily(conf.county).length>1)out.append(node('p','data-help','升格前的原县、原市分别统计；合并后显示新的直辖市，跨边界不连线。'));
 const seriesFor=rows=>{
  const totals=new Map();for(const r of rows)for(const [p,v] of Object.entries(r.parties||{}))totals.set(p,(totals.get(p)||0)+v);
  const sorted=[...totals].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh')).map(x=>x[0]),top=sorted.slice(0,7),rest=sorted.slice(7);
  const series=top.map(p=>({name:displayParty(p),color:color(p),get:r=>r.complete?r.parties[p]||0:null,party:p}));
  if(rest.length)series.push({name:'其他政党',color:color('其他政党'),get:r=>r.complete?rest.reduce((n,p)=>n+(r.parties[p]||0),0):null,parties:rest});
  return series;
 };
 let seatSeries=[];
 if(seatBallot){
  seatSeries=seriesFor(seatRows);
  const seatType=allSeats?'全部民代':ballot==='all'?(national?'全部议员':isLeg?'区域民代':'区域议员'):({regional:isLeg?'区域民代':'区域议员',plains:'平地少数民族',mountain:'山地少数民族',party:'不分区',indigenous:'原住民'}[ballot]||ballot);
  const title=(isLeg?'立法机构':'县市议员')+' · '+seatType+' · 政党当选席次趋势';
  const note=allSeats?'区域、平地与山地少数民族、不分区及旧制侨选的正式当选席次合计。':national?'仅计所选民代类别在全部地区正式当选的席次。':isLeg?'仅计该范围区域民代的正式当选席次；其余类型不分摊到县市。':'仅计该范围可归属的议员席次。';
  out.append(card(title,note,seatRows.some(r=>r.complete)?chart(seatRows,seatSeries,title,{stack:true,integer:true}):null));
  if(seatRows.some(r=>r.complete))renderParliaments(out,seatRows,{...effective,metric:'party'},allSeats);
 }
 const voteSeries=seriesFor(voteRows),voteType=ballot==='all'?(isLeg?'不分区':'全部议员'):({regional:'区域',plains:'平地少数民族',mountain:'山地少数民族',party:'不分区',indigenous:'原住民'}[ballot]||ballot);
 const voteTitle=voteType+(isLeg?'民代':'')+' · 政党得票率趋势';
 const voteNote=isLeg&&(ballot==='all'||ballot==='party')?'2008年前为各党推荐的区域与少数民族候选人票汇总，用于分配名单席次；2008年起为独立政党票。两种票源分别绘制，不跨制度连线。':!isLeg&&ballot==='all'?'区域和少数民族选票分别统计后汇总党派候选人票，分母为这些票数之和；选民可能投不同类别选票，不代表单一选民支持率。':'每个政党的候选人得票之和除以当前票种、当前范围的有效票；各党占比合计为100%。';
 out.append(card(voteTitle,voteNote,voteRows.some(r=>r.complete)?chart(voteRows,voteSeries,voteTitle,{pct:true,breakOld:isLeg&&(ballot==='all'||ballot==='party')}):null));
 const valuesTable=(rows,series,pct,title)=>{
  const wrap=node('div','history-table-wrap'),table=node('table','history-candidate-table'),head=node('thead'),tr=node('tr');
  for(const heading of ['届次','当届地区','投票日期',...series.map(s=>s.name),'合计'])tr.append(node('th','',heading));head.append(tr);table.append(head);
  const body=node('tbody');for(const r of rows){const item=node('tr');item.append(node('td','',r.label),node('td','',r.county||'全部地区'),node('td','',r.dates?.join(' / ')||'—'));
   for(const s of series)item.append(node('td','',fmt(s.get(r),pct)));
   item.append(node('td','',r.complete?fmt(Object.values(r.parties).reduce((n,v)=>n+v,0),pct):'—'));body.append(item)}
  table.append(body);wrap.append(node('h4','',title),table);out.append(wrap);
 };
 if(seatBallot)valuesTable(seatRows,seatSeries,false,'当选席次逐届明细');
 valuesTable(voteRows,voteSeries,true,'政党得票率逐届明细');
 const readout=node('div','trend-point-readout','点击图中的数据点查看对应届次。');readout.id='trendPointReadout';out.prepend(readout);
 legislativeExport={seatRows,seatSeries,voteRows,voteSeries,ballot,seatBallot};
 lastRows=allRows;lastTitle='民代席次与得票率趋势';$('trendCsv').disabled=!allRows.length;
 renderedKey=JSON.stringify([conf.office,conf.year,conf.electorate,conf.county,conf.level,conf.focus,conf.metric,conf.party,conf.candidateScope,conf.candidate,range(conf).join(',')]);
}
function render(){
 if(!panel||panel.hidden||loading||!models.length||!selection)return;
 const conf=settings(),effective=T.trendEffectiveSelection(conf),anchor=History2022View.snapshot?.();
 if(['legislative','council'].includes(conf.office)){const out=$('trendCharts');out.replaceChildren();renderLegislative(conf,anchor,out);return}
 legislativeExport=null;
 const totalLeg=fullLegislature(conf);
 const rows=models.flatMap(item=>{
  if(!item.snapshot)return{year:item.year,label:label(item.year,conf.office),complete:false,reason:item.error,parties:{},values:{}};
  const result=totalLeg?[T.allLegislativeSeats(item.snapshot,HistoryLegislativeParty.build(item.year,item.snapshot),norm)]:T.historicalScopeRows(item.snapshot,effective,anchor);
  return result.map(r=>{if(totalLeg){r.dates=T.electionDates(item.snapshot,conf.office,'',norm);if(conf.metric==='seats'&&r.complete)r.values.value=r.parties[norm(conf.party)]||0;}
   if(!conf.county&&!r.dates?.length)r.label=label(r.year,conf.office);return r})
 });
 const out=$('trendCharts');out.replaceChildren();
 const missing=rows.filter(r=>!r.complete);
 $('trendStatus').textContent=models.length+' 届 · '+(rows.length-missing.length)+' 条完整地区/届次结果'+(missing.length?' · '+missing.map(r=>r.label+(r.scopeLabel?' '+r.scopeLabel:'')+'：'+r.reason).join('；'):'');
 if(T.historicalCountyFamily(conf.county).length>1)out.append(node('p','data-help','升格前使用当届县名；合并前原县、原市分列，合并后使用直辖市结果。不同辖区不合计、不跨合并边界连线。'));
 const voteMetric=conf.metric==='share'||conf.metric==='votes',pct=conf.metric==='share';
 const leading=!totalLeg&&(effective.office==='president'||effective.office==='legislative'&&effective.electorate!=='regional'||effective.office==='mayor'&&effective.level==='town');
 const selected=conf.candidateScope==='candidate'&&voteMetric;
 const name=selected?(conf.office==='legislative'&&conf.electorate==='party'?conf.candidate?.party:conf.candidate?.name)||'指定候选人':voteMetric?'各地区最高票候选人':conf.metric==='seats'?conf.party:'';
 const metricTitle=voteMetric?(pct?'得票率':'得票数'):conf.metric==='seats'?'当选席次':leading?'领先地区数':'当选席次';
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
 if(series.length&&rows.some(r=>r.complete))out.append(card(title,note,chart(rows,series,title,{pct,stack:!voteMetric&&conf.metric!=='seats',breakOld:oldParty,integer:!pct})));
 else out.append(card(title,'当前所选范围没有可绘制的完整结果。',null));
 if(!voteMetric&&!leading&&['legislative','council'].includes(conf.office))renderParliaments(out,rows,effective,totalLeg);
 // A compact exact-value table is limited to the same metric as the chart.
 const wrap=node('div','history-table-wrap'),table=node('table','history-candidate-table'),thead=node('thead'),header=node('tr');
 const showTotal=!voteMetric&&conf.metric==='party';
 const showCounty=rows.some(r=>r.scopeLabel);
 for(const v of ['届次',...(showCounty?['当届县市']:[]),'投票日期',...series.map(s=>s.name),...(showTotal?['合计']:[])])header.append(node('th','',v));thead.append(header);table.append(thead);
 const body=node('tbody');for(const r of rows){const tr=node('tr');tr.append(node('td','',r.label));if(showCounty)tr.append(node('td','',r.county||conf.county));tr.append(node('td','',r.dates?.join(' / ')||'—'));for(const s of series)tr.append(node('td','',fmt(s.get(r),pct)));if(showTotal)tr.append(node('td','',r.complete?fmt(Object.values(r.parties).reduce((n,v)=>n+v,0)):'—'));body.append(tr)}table.append(body);wrap.append(table);out.append(wrap);
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
   const entries=r.complete?Object.entries(r.parties):[['',null]];
   for(const [party,value] of entries)out.push([offices[conf.office],metric==='正式当选席次'?(ballot==='all'&&!conf.county?'全部民代类型':ballot==='all'&&conf.county?(conf.office==='legislative'?'区域民代':'区域议员'):ballot):(conf.office==='legislative'&&(ballot==='all'||ballot==='party')?(r.year<2008?'旧制席次计算票':'不分区政党票'):ballot),r.county||'全部地区',metric==='正式当选席次'&&conf.county?'选举区（按县市汇总）':conf.level,r.label,r.dates?.join(' / ')||'',metric,displayParty(party),Number.isFinite(value)?Math.round(value*100)/100:'',r.complete?'完整结果':r.reason]);
  }
  exportFile(C.csv(out),'历史趋势-'+offices[conf.office]+'-席次与得票率.csv','text/csv;charset=utf-8');return;
 }
 for(const r of lastRows){
  const items=single?[[lastSeries[0]?.name||lastTitle,r.values?.value]]:Object.entries(r.parties);
  for(const [p,v] of items.length?items:[['',null]])out.push([offices[conf.office],fullLegislature(conf)?'全部民代类型':effective.electorate,[r.county||conf.county||'全部地区',conf.focus].filter(Boolean).join(' · '),effective.office==='legislative'&&effective.electorate==='regional'?'选举区（按县市汇总）':conf.level,r.label,r.dates?.join(' / ')||'',conf.office==='legislative'&&conf.electorate==='all'&&conf.county?'区域民代当选席次':optionText('historyMetric'),displayParty(p),Number.isFinite(v)?Math.round(v*100)/100:'',r.complete?'完整结果':r.reason]);
 }
 exportFile(C.csv(out),'历史趋势-'+offices[conf.office]+'-'+lastTitle+'.csv','text/csv;charset=utf-8')
}
window.HistoryTrendsUI={routeYears:()=>knownYears.filter(y=>selectedYears.has(y)).join(',')||'none',restoreRouteYears(value){if(!selection)return;selectedYears=new Set(String(value).split(',').map(Number).filter(y=>knownYears.includes(y)));setYears(settings(),false);load()},open(s){
 create();if(!panel)return;
 const conf=readSelection(s),prior=selection;selection=conf;
 const reset=!prior||prior.office!==conf.office;
 if(reset||yearsFor(conf.office).join(',')!==knownYears.join(','))setYears(conf,reset);
 $('trendScope').textContent='当前范围：'+description(conf);
 const snap=History2022View.snapshot?.();
 if(!snap||snap.year!==conf.year||!snap.elections?.some(e=>e.office===conf.office)){
  request++;loading=false;activeKey='';renderedKey='';models=[];lastRows=[];$('trendCharts').replaceChildren();$('trendCsv').disabled=true;$('trendStatus').textContent='正在等待左侧选举数据载入…';return
 }
 const dataKey=conf.office+'|'+range(conf).join(','),key=JSON.stringify([conf.office,conf.year,conf.electorate,conf.county,conf.level,conf.focus,conf.metric,conf.party,conf.candidateScope,conf.candidate,range(conf).join(',')]);
 if(dataKey!==activeKey||range(conf).length&&!models.length&&!loading)load();else if(!loading&&(closed||key!==renderedKey))render();
 closed=false;
},close(){closed=true},render,exportCsv};
})();
