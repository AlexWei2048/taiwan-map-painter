'use strict';
/* 2022 election history. Source: CEC open data, assembled by taiwanvotes.tw. */
(()=>{
 const el=id=>document.getElementById(id), db={mayor:[],council:[],township:[]},titles={mayor:'县市长',council:'议员',township:'乡镇市区长'};
 let active=false,kind='mayor',county='',metric='party',loaded=false,loading=null,lastResult=[],savedMapScope=null,unmatchedDistricts=new Set();
 const norm=x=>simplify(String(x||'')).trim();
 const normalizeParty=name=>{let s=norm(name||'无党籍');if(s.includes('无党籍及未经政党推荐')||s==='无党籍及未经政党推薦')s='无党籍';return s};
 const partyColor=p=>partyMatch(p)?.color||'#8a9892';
 const tone=(color,share,range)=>{if(metric!=='share')return color;const t=Math.max(0,Math.min(1,(share-range.min)/Math.max(1,range.max-range.min)));const rgb=color.match(/[a-f\\d]{2}/gi)?.map(x=>parseInt(x,16))||[100,120,105];const mix=(from,to,p)=>Math.round(from+(to-from)*p);const light=rgb.map(c=>mix(255,c,.20)),dark=rgb.map(c=>mix(c,0,.25));return 'rgb('+light.map((v,i)=>mix(v,dark[i],Math.pow(t,.85))).join(',')+')'};
 const electionKey=r=>[r.type,r.electorate,r.level,r.county,r.town,r.village,r.district,r.number,r.name].join('|');
 const dbIds=new Set();
 const addRows=rows=>{let added=0;for(const src of rows){
  if(!['mayor','council','township'].includes(src.type))continue;
  const r={type:src.type,electorate:src.electorate||'regional',level:src.level||'raw',county:norm(src.county),town:norm(src.town),village:norm(src.village),district:norm(src.district),number:String(src.number||''),name:norm(src.name),party:normalizeParty(src.party),votes:Number(src.votes),elected:src.elected===true||src.elected==='true'};
  if(!r.county||!r.name||!Number.isFinite(r.votes)||r.votes<0)continue;
  const key=electionKey(r);if(dbIds.has(key))continue;dbIds.add(key);db[r.type].push(r);added++;
 }return added};
 async function snapshot(){
  if(loaded)return true;
  if(loading)return loading;
  loading=(async()=>{
   try{
    const resp=await fetch('assets/history-2022.json?v=20261031-national-2022-v1',{cache:'default'});
    if(!resp.ok)throw Error('HTTP '+resp.status);
    const obj=await resp.json();
    if(obj.year!==2022||!Array.isArray(obj.rows)||obj.rows.length<8000)throw Error('历史快照内容不完整');
    const count=addRows(obj.rows);loaded=true;
    el('historyStatus').textContent='已载入全台2022历史选举数据：'+obj.files+'份官方来源CSV，'+count.toLocaleString('zh-CN')+'条汇总记录。';
    return true
   }catch(error){
    el('historyStatus').textContent='历史数据自动载入失败（'+error.message+'）。可从资料来源页面下载CSV后手动导入。';return false
   }finally{loading=null}
  })();
  return loading
 }
 function parseCSV(text){
  const rows=[],row=[];let value='',quote=false;
  for(let i=0;i<text.length;i++){const c=text[i];
   if(c==='"'){if(quote&&text[i+1]==='"'){value+='"';i++}else quote=!quote}
   else if(c===','&&!quote){row.push(value);value=''}
   else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(Boolean))rows.push([...row]);row.length=0;value=''}
   else value+=c;
  }
  row.push(value);if(row.some(Boolean))rows.push(row);
  if(!rows.length)return[];
  const cols=rows.shift().map(x=>x.replace(/^\uFEFF/,'').trim());
  return rows.map(r=>Object.fromEntries(cols.map((key,i)=>[key,(r[i]||'').trim()])));
 }
 const field=(r,keys)=>keys.map(k=>r[k]).find(v=>v!==undefined)||'';
 function importCsv(text,filename){
  const rows=parseCSV(text);
  if(!rows.length)throw Error('文件不包含CSV记录');
  const type=/議員|议员/.test(filename)?'council':/鄉鎮市長|原住民區長|乡镇市长|少数民族区长/.test(filename)?'township':/縣市長|县市长/.test(filename)?'mayor':kind;
  const electorate=/平地原住民|平地少数民族/.test(filename)?'plains':/山地原住民|山地少数民族/.test(filename)?'mountain':'regional';
  const records=rows.map(row=>({type,electorate,level:'raw',county:field(row,['縣市','县市']),town:field(row,['鄉鎮市區','乡镇市区']),village:field(row,['村里']),district:field(row,['選區','选区']),number:field(row,['號次','号次']),name:field(row,['候選人','候选人']),party:field(row,['政黨','政党']),votes:Number(String(field(row,['得票數','得票数'])).replace(/,/g,'')),elected:/[＊*]/.test(field(row,['當選註記','当选注记']))}));
  const n=addRows(records);
  if(!n)throw Error('未识别到新的候选人得票记录');
  return n
 }
 function recordsInView(){
  const all=db[kind].filter(r=>!county||r.county===county);
  const level=kind==='mayor'?(county?'town':'county'):kind==='council'?'district':'town';
  const built=all.filter(r=>r.level===level);
  if(built.length)return built;
  // Imported raw village votes must be added within each candidate/territory, not counted as distinct winners.
  const raw=all.filter(r=>r.level==='raw'),totals=new Map();
  for(const r of raw){
   const scope=level==='county'?'':level==='district'?r.district:r.town;
   const key=[r.type,r.electorate,r.county,scope,r.number,r.name].join('|');
   if(!totals.has(key))totals.set(key,{...r,level,town:level==='town'?r.town:'',district:level==='county'?'':r.district,votes:0});
   const item=totals.get(key);item.votes+=r.votes;item.elected||=r.elected;
  }
  return [...totals.values()]
 }
 const areaKey=r=>kind==='mayor'?(county?r.county+'|'+r.town:r.county):kind==='township'?r.county+'|'+r.town:r.county+'|'+r.electorate+'|'+districtNumber(r.district);
 function districtNumber(s){const match=String(s||'').match(/第\s*0*(\d+)\s*(?:选举区|選舉區)/);return match?String(Number(match[1])):''}
 function analyze(){
  unmatchedDistricts=new Set();
  if(kind==='council'&&data){
   const features=currentItems(),identities=new Map();
   for(const f of features){const key=f.county+'|'+featureElectorate(f),number=districtNumber(f.name);if(!identities.has(key))identities.set(key,new Set());if(number)identities.get(key).add(number)}
   for(const [key,expected] of identities){const [region,identity]=key.split('|'),actual=new Set(recordsInView().filter(r=>r.county===region&&r.electorate===identity).map(r=>districtNumber(r.district)).filter(Boolean));if(expected.size!==actual.size||[...expected].some(n=>!actual.has(n)))unmatchedDistricts.add(key)}
  }
  const rows=recordsInView(),groups=new Map(),partySeats=new Map(),regions=new Map();
  for(const r of rows){const key=areaKey(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  for(const [key,entries] of groups){
   const total=entries.reduce((n,r)=>n+r.votes,0),ranked=[...entries].sort((a,b)=>b.votes-a.votes),winners=ranked.filter(r=>r.elected);
   const leading=ranked[0]||null;
   const chosen=kind==='mayor'&&county?[leading].filter(Boolean):winners;
   const winnerParties=new Map();
   for(const winner of chosen){winnerParties.set(winner.party,(winnerParties.get(winner.party)||0)+1);partySeats.set(winner.party,(partySeats.get(winner.party)||0)+1)}
   const dominant=[...winnerParties].sort((a,b)=>b[1]-a[1]);
   const party=dominant.length&&(!dominant[1]||dominant[0][1]>dominant[1][1])?dominant[0][0]:null;
   const winnerVotes=leading?.votes||0;
   regions.set(key,{party,leaders:chosen,top:leading,share:total?winnerVotes/total*100:0,votes:total,seatCount:winners.length,tie:dominant.length>1&&dominant[0][1]===dominant[1][1]});
   for(const r of entries)r._share=total?r.votes/total*100:0;
  }
  const values=[...regions.values()].filter(r=>r.party&&!r.tie).map(r=>r.share).sort((a,b)=>a-b);
  const percentile=q=>values.length?values[Math.min(values.length-1,Math.floor(q*(values.length-1)))]:0;
  let min=Math.floor(percentile(.05)/5)*5,max=Math.ceil(percentile(.95)/5)*5;
  if(max-min<15){const mid=(min+max)/2;min=Math.max(0,Math.floor((mid-10)/5)*5);max=Math.min(100,Math.ceil((mid+10)/5)*5)}
  lastResult=rows;
  return{rows,regions,partySeats,areas:groups.size,range:{min,max}}
 }
 function featureKey(feature){
  if(kind==='mayor')return county?feature.county+'|'+feature.name:feature.county;
  if(kind==='township')return feature.county+'|'+feature.name;
  const identity=featureElectorate(feature);if(unmatchedDistricts.has(feature.county+'|'+identity))return '__2022_unmatched__';
  return feature.county+'|'+identity+'|'+districtNumber(feature.name);
 }
 function drawLegend(result){
  const root=el('legend');if(!root)return;
  root.replaceChildren();
  const entries=[...result.partySeats].sort((a,b)=>b[1]-a[1]);
  if(!entries.length)return;
  const spec=sceneSpec(),wide=spec.width>1700,font=wide?16:13,rowH=font*2,width=wide?360:320,height=(metric==='share'?168:90)+entries.length*rowH;
  const x=spec.width-width-25,y=spec.height-furnitureFooterHeight()+20;
  const svg=(tag,attrs)=>{const node=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs||{}))node.setAttribute(k,v);return node};
  root.append(svg('rect',{x,y,width,height,rx:10,fill:'#fff',stroke:'#dce5df'}));
  const heading=svg('text',{x:x+16,y:y+28,'font-size':font+1,'font-weight':600,fill:'#294a3a'});
  heading.textContent='2022实际结果 · '+[...result.partySeats.values()].reduce((a,b)=>a+b,0)+(kind==='mayor'&&county?'个领先地区':'席');root.append(heading);
  const subtitle=svg('text',{x:x+16,y:y+48,'font-size':font*.78,fill:'#63756a'});subtitle.textContent=kind==='council'?'多席次选区：主色表示席次最多政党':kind==='mayor'&&county?'仅代表当地得票领先，不代表当选':'按实际当选人统计';root.append(subtitle);
  if(metric==='share'){
   const yBar=y+68,barWidth=width-38;
   const title=svg('text',{x:x+16,y:yBar-7,'font-size':font*.82,fill:'#526c60'});title.textContent='得票率色阶 · '+result.range.min+'%—'+result.range.max+'%（超出范围按端点显示）';root.append(title);
   for(let i=0;i<40;i++){const v=result.range.min+(result.range.max-result.range.min)*(i+.5)/40;root.append(svg('rect',{x:x+18+i*barWidth/40,y:yBar,width:barWidth/40+1,height:13,fill:tone('#177d68',v,result.range)}))}
   for(const [offset,text] of [[0,result.range.min+'%'],[.5,((result.range.min+result.range.max)/2).toFixed(0)+'%'],[1,result.range.max+'%']]){const tick=svg('text',{x:x+18+offset*barWidth,y:yBar+31,'text-anchor':offset===0?'start':offset===1?'middle':'end','font-size':font*.78,fill:'#526c60'});tick.textContent=text;root.append(tick)}
   const note=svg('text',{x:x+16,y:yBar+50,'font-size':font*.76,fill:'#63756a'});note.textContent='各党保留本色相，浅色得票率低，深色得票率高';root.append(note);
  }
  for(const [i,[party,count]]of entries.entries()){
   const py=y+(metric==='share'?153:73)+i*rowH;
   root.append(svg('rect',{x:x+16,y:py-10,width:font,height:font,rx:3,fill:metric==='share'?tone(partyColor(party),(result.range.min+result.range.max)/2,result.range):partyColor(party)}));
   const label=svg('text',{x:x+font+26,y:py+2,'font-size':font,fill:'#426052'});label.textContent=party+'（'+count+(kind==='mayor'&&county?'个地区':'席')+'）';root.append(label);
  }
 }
 function paint(result){
  if(!active||!data)return;
  const features=currentItems(),byId=new Map(features.map(f=>[f.id,f]));
  for(const path of document.querySelectorAll('#regions path[data-region]')){
   const f=byId.get(path.dataset.region);if(!f)continue;
   const region=result.regions.get(featureKey(f));
   path.setAttribute('fill',!region?'#edf1e9':region.tie?'#aebdb4':region.party?tone(partyColor(region.party),region.share,result.range):'#edf1e9');
   path.style.pointerEvents='none';
  }
  el('scopeTitle').textContent='2022 '+titles[kind]+'实际投票结果 · '+(county||'全台');
  drawLegend(result);
 }
 function showRows(result){
  const rows=[...result.rows].sort((a,b)=>a.county.localeCompare(b.county,'zh')||areaKey(a).localeCompare(areaKey(b),'zh')||b.votes-a.votes);
  const root=el('historyResults');root.replaceChildren();
  const seats=[...result.partySeats.values()].reduce((a,b)=>a+b,0);
  el('historySummary').textContent=result.areas+'个地区 / 选区 · '+rows.length+'条候选人得票 · '+seats+(kind==='mayor'&&county?'个地区领先':'席当选')+' · '+(metric==='share'?'得票率渐变':'政党着色')+(unmatchedDistricts.size?' · '+unmatchedDistricts.size+'组历史选区与当前地图不一致，已暂不着色':'');
  if(!rows.length){root.textContent='此范围没有已载入的历史结果。';return}
  for(const r of rows.slice(0,550)){
   const item=document.createElement('div');item.className='history-entry';
   const dot=document.createElement('span');dot.className='history-party';dot.style.background=partyColor(r.party);
   const description=document.createElement('span');
   description.textContent=[r.county,kind==='mayor'&&county?r.town:kind==='council'?r.district:kind==='township'?r.town:'',r.name+'（'+r.party+'）'].filter(Boolean).join(' · ')+(r.elected?' ✓':'');
   const value=document.createElement('strong');value.textContent=r.votes.toLocaleString('zh-CN')+'票 / '+(r._share||0).toFixed(1)+'%';
   item.append(dot,description,value);root.append(item)
  }
  if(rows.length>550){const last=document.createElement('p');last.className='data-help';last.textContent='列表仅显示前550条，下载CSV可查看全部记录。';root.append(last)}
 }
 function update(){if(!active||!data)return;const result=analyze();showRows(result);paint(result)}
 function switchMode(){
  state.workspaceMode='history';state.fillMode='solid';state.level=kind==='mayor'?(county?'towns':'counties'):kind==='council'?'council':'towns';state.county=county;
  if(kind==='council')state.councilViewScope='all';
 }
 function activate(){
  if(!active)savedMapScope=clone(state);
  active=true;document.body.classList.add('history-mode');
  el('historyControls').hidden=false;el('mapSettings').hidden=true;
  el('workspaceHistory').classList.add('active');el('workspaceHistory').setAttribute('aria-pressed','true');
  el('workspacePrediction').classList.remove('active');el('workspaceFree').classList.remove('active');
  switchMode();render();update();snapshot().then(success=>{if(active&&success){render();update()}})
 }
 function deactivate(){
  active=false;document.body.classList.remove('history-mode');
  if(savedMapScope){state=clone(savedMapScope);savedMapScope=null;}
  el('historyControls').hidden=true;el('mapSettings').hidden=false;
  el('workspaceHistory').classList.remove('active');el('workspaceHistory').setAttribute('aria-pressed','false');if(data){syncInputs();render()}
 }
 function downloadCSV(){
  const rows=analyze().rows,heads=['县市','乡镇市区','选区','类别','号次','候选人','政党','得票数','得票率','是否当选'];
  const safe=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const dataRows=[heads,...rows.map(r=>[r.county,r.town,r.district,r.electorate,r.number,r.name,r.party,r.votes,(r._share||0).toFixed(3),r.elected?'是':''])];
  const blob=new Blob(['\uFEFF'+dataRows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='2022_'+titles[kind]+'_'+(county||'全台')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }
 el('workspaceHistory').onclick=activate;
 for(const id of ['workspacePrediction','workspaceFree'])el(id).addEventListener('click',()=>{if(active)deactivate()},{capture:true});
 el('historyOffice').onchange=()=>{kind=el('historyOffice').value;switchMode();render();update()};
 el('historyCounty').onchange=()=>{county=el('historyCounty').value;switchMode();render();update()};
 el('historyMetric').onchange=()=>{metric=el('historyMetric').value;update()};
 for(const n of COUNTY_ORDER)el('historyCounty').add(new Option(n,n));
 el('historyCsvExport').onclick=downloadCSV;
 el('historyImport').onclick=()=>el('historyFiles').click();
 el('historyFiles').onchange=async()=>{
  let count=0;const errors=[];
  for(const file of el('historyFiles').files)try{count+=importCsv(await file.text(),file.name)}catch(error){errors.push(file.name+': '+error.message)}
  el('historyStatus').textContent='已导入'+count+'条新记录。'+errors.join('；');update();el('historyFiles').value=''
 };
 el('historyLoad').onclick=async()=>{el('historyStatus').textContent='正在载入全台2022选举结果…';await snapshot();update()};
 const defaultRender=render;render=function(){defaultRender();if(active){update();for(const id of ['workspacePrediction','workspaceFree']){el(id).classList.remove('active');el(id).setAttribute('aria-pressed','false')}}};
 const defaultFooter=furnitureFooterHeight;furnitureFooterHeight=function(){
  if(!active)return defaultFooter();
  const number=Math.min(30,new Set(recordsInView().filter(r=>r.elected).map(r=>r.party)).size);
  return Math.max(defaultFooter(),metric==='share'?355:270,(metric==='share'?200:120)+number*33)
 };
 const defaultPreparedExport=preparedExportSvg;preparedExportSvg=function(){
  if(!active)return defaultPreparedExport();
  if(!recordsInView().length)throw Error('当前范围尚未载入2022历史得票数据，无法导出地图');
  const oldTitle=state.title;state.title='2022 '+titles[kind]+'实际选举结果 · '+(county||'全台');
  try{return defaultPreparedExport()}finally{state.title=oldTitle}
 };
})();
