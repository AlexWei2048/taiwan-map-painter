'use strict';
/* 2022 election history. Source: CEC open data, assembled by taiwanvotes.tw. */
(()=>{
 const el=id=>document.getElementById(id), db={mayor:[],council:[],township:[]},titles={mayor:'县市长',council:'议员',township:'乡镇市区长'};
 let active=false,kind='mayor',county='',metric='party',scale='district',candidateScope='top',selectedCandidate='',historicalFeatures=[],hsinchuGeometry=null,loaded=false,loading=null,lastResult=[],savedMapScope=null,unmatchedDistricts=new Set(),districtMetadata=[],currentResult=null;
 const norm=x=>simplify(String(x||'')).trim();
 const normalizeParty=name=>{let s=norm(name||'无党籍');if(s.includes('无党籍及未经政党推荐')||s==='无党籍及未经政党推薦')s='无党籍';return s};
 const partyColor=p=>predictionParty(p).color;
 const tone=(color,share,range)=>{
  if(metric==='party')return color;
  // Preserve the party's exact base color at the high end. Only mix with white for lower shares.
  const hex=/^#[0-9a-f]{6}$/i.test(color)?color:'#8a9892';
  const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const t=Math.max(0,Math.min(1,(share-range.min)/Math.max(1,range.max-range.min)));
  const strength=.28+.72*Math.pow(t,.8);
  return '#'+rgb.map(channel=>Math.round(255+(channel-255)*strength).toString(16).padStart(2,'0')).join('');
 };
 const electionKey=r=>[r.type,r.electorate,r.level,r.county,r.town,r.village,r.district,r.number,r.name].join('|');
 const dbIds=new Set();
 const officialWinnerCorrections=new Set(['臺南市|regional|臺南市第01選舉區|沈家鳳','新竹縣|regional|新竹縣第02選舉區|吳菊花','苗栗縣|regional|苗栗縣第05選舉區|蕭詠萱','金門縣|regional|金門縣第01選舉區|唐麗輝']);
 const addRows=rows=>{let added=0;for(const src of rows){
  if(!['mayor','council','township'].includes(src.type))continue;
  const r={type:src.type,electorate:HistoryCore.identity(src.electorate),level:src.level||'raw',county:norm(src.county),town:norm(src.town),village:norm(src.village),district:norm(src.district),number:String(src.number||''),name:norm(src.name),gender:norm(src.gender),party:normalizeParty(src.party),votes:Number(src.votes),elected:src.elected===true||src.elected==='true'||officialWinnerCorrections.has([src.county,src.electorate||'regional',src.district,src.name].join('|'))};
  if(!r.county||!r.name||!Number.isFinite(r.votes)||r.votes<0)continue;
  const key=electionKey(r);if(dbIds.has(key))continue;dbIds.add(key);db[r.type].push(r);added++;
 }return added};
 async function snapshot(){
  if(loaded)return true;
  if(loading)return loading;
  loading=(async()=>{
   try{
    const [resp,metaResp,geoResp]=await Promise.all([fetch('assets/history-2022.json?v=20261031-national-2022-v1',{cache:'default'}),fetch('assets/history-council-districts-2022.json?v=20261031-districts-v2',{cache:'default'}),fetch('assets/history-hsinchu-geography-2022.json?v=20261103-history-v103')]);
    if(!resp.ok)throw Error('历史投票数据 HTTP '+resp.status);if(!metaResp.ok)throw Error('2022议员选区资料 HTTP '+metaResp.status);
    const obj=await resp.json(),meta=await metaResp.json();
    if(meta.year!==2022||meta.districtCount!==215||!Array.isArray(meta.rows)||meta.rows.reduce((n,x)=>n+x.seats,0)!==910)throw Error('2022议员选区资料未通过完整性核验');
    districtMetadata=meta.rows.map(d=>({...d,county:norm(d.county),name:norm(d.name),scope:norm(d.scope),scopeTowns:d.scopeTowns.map(norm),electorate:HistoryCore.identity(d.electorate)}));if(!geoResp.ok)throw Error('2022新竹市地图载入失败');hsinchuGeometry=await geoResp.json();if(hsinchuGeometry.year!==2022||hsinchuGeometry.features?.length!==5)throw Error('2022新竹市选区范围不完整');
    if(obj.year!==2022||!Array.isArray(obj.rows)||obj.rows.length<8000)throw Error('历史快照内容不完整');
    const count=addRows(obj.rows);loaded=true;ensureHistoryGeometry();
    const genderRows=obj.rows.filter(x=>x.gender).length;el('historyStatus').textContent='已载入2022历史选举数据：'+obj.files+'份来源CSV，'+count.toLocaleString('zh-CN')+'条得票记录；议员选区215个、应选910席。'+(genderRows?'候选人性别字段已载入。':'当前历史快照未收录性别字段，候选人表格以“—”表示。');
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
  const records=rows.map(row=>({type,electorate,level:'raw',county:field(row,['縣市','县市']),town:field(row,['鄉鎮市區','乡镇市区']),village:field(row,['村里']),district:field(row,['選區','选区']),number:field(row,['號次','号次']),name:field(row,['候選人','候选人']),gender:field(row,['性別','性别']),party:field(row,['政黨','政党']),votes:Number(String(field(row,['得票數','得票数'])).replace(/,/g,'')),elected:/[＊*]/.test(field(row,['當選註記','当选注记']))}));
  const n=addRows(records);
  if(!n)throw Error('未识别到新的候选人得票记录');
  return n
 }
 function recordsInView(){
  const all=db[kind].filter(r=>!county||r.county===county);
  const level=kind==='mayor'?(mayorTownView()?'town':'county'):kind==='council'?'district':'town';
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
 const areaKey=r=>kind==='mayor'?(mayorTownView()?r.county+'|'+r.town:r.county):kind==='township'?r.county+'|'+r.town:r.county+'|'+r.electorate+'|'+districtNumber(r.district);
 function districtNumber(s){return HistoryCore.districtNumber(s)}
 function analyze(){
  unmatchedDistricts=new Set();
  ensureHistoryGeometry();
  const rows=recordsInView(),groups=new Map(),partySeats=new Map(),regions=new Map();
  for(const r of rows){const key=areaKey(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  for(const [key,entries] of groups){
   const total=entries.reduce((n,r)=>n+r.votes,0),ranked=[...entries].sort((a,b)=>b.votes-a.votes),winners=ranked.filter(r=>r.elected);
   const leading=ranked[0]||null;
   const chosen=mayorTownView()?[leading].filter(Boolean):winners;
   const winnerParties=new Map();
   for(const winner of chosen){winnerParties.set(winner.party,(winnerParties.get(winner.party)||0)+1);partySeats.set(winner.party,(partySeats.get(winner.party)||0)+1)}
   const dominant=[...winnerParties].sort((a,b)=>b[1]-a[1]);
   const party=dominant.length&&(!dominant[1]||dominant[0][1]>dominant[1][1])?dominant[0][0]:null;
   const displayed=candidateScope==='candidate'&&metric!=='party'?entries.find(r=>candidateKey(r)===selectedCandidate):leading;
   const winnerVotes=displayed?.votes||0;
   regions.set(key,{party:metric!=='party'?(displayed?.party||null):party,leaders:chosen,top:displayed,share:total?winnerVotes/total*100:0,votes:total,seatCount:winners.length,tie:dominant.length>1&&dominant[0][1]===dominant[1][1]});
   for(const r of entries)r._share=total?r.votes/total*100:0;
  }
  const values=[...regions.values()].filter(r=>r.party&&!r.tie).map(r=>metric==='votes'?r.top?.votes||0:r.share).sort((a,b)=>a-b);
  const percentile=q=>values.length?values[Math.min(values.length-1,Math.floor(q*(values.length-1)))]:0;
  let min=Math.floor(percentile(.05)/5)*5,max=Math.ceil(percentile(.95)/5)*5;
  if(metric==='votes'){min=0;max=Math.max(1,...values)}else if(max-min<15){const mid=(min+max)/2;min=Math.max(0,Math.floor((mid-10)/5)*5);max=Math.min(100,Math.ceil((mid+10)/5)*5)}
  lastResult=rows;
  const countySeats=new Map();if(kind==='council')for(const r of rows.filter(r=>r.elected)){if(!countySeats.has(r.county))countySeats.set(r.county,new Map());const counts=countySeats.get(r.county);counts.set(r.party,(counts.get(r.party)||0)+1)}
  return{rows,regions,partySeats,countySeats,areas:groups.size,range:{min,max}}
 }
 function featureKey(feature){
  if(kind==='mayor')return mayorTownView()?feature.county+'|'+feature.name:feature.county;
  if(kind==='township')return feature.county+'|'+feature.name;
  const identity=featureElectorate(feature),number=districtNumber(feature.number||feature.name);if(unmatchedDistricts.has(norm(feature.county)+'|'+identity+'|'+number))return '__2022_unmatched__';
  return feature.county+'|'+identity+'|'+number;
 }
 function drawLegend(result){
  const root=el('legend');if(!root)return;root.replaceChildren();
  const entries=[...result.partySeats].sort((a,b)=>b[1]-a[1]);if(!entries.length&&kind!=='township')return;
  const spec=sceneSpec(),font=state.legend.fontSize*(isNationwide()?1.4:1)*(identityPanelsActive()?2:1),rowH=font*2.05,width=identityPanelsActive()?560:isNationwide()?350:300;
  const gradient=metric!=='party',height=(gradient?162:86)+(entries.length+(kind==='township'?1:0))*rowH,x=spec.width-width-25,y=spec.height-furnitureFooterHeight()+20;
  const svg=(tag,attrs)=>{const node=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs||{}))node.setAttribute(k,v);return node};
  root.append(svg('rect',{x,y,width,height,rx:12,fill:'#fff',stroke:'#dce5df','stroke-width':1}));
  const heading=svg('text',{x:x+18,y:y+27,'font-size':font+1,'font-weight':600,fill:'#294a3a'});
  heading.textContent='2022实际结果 · '+[...result.partySeats.values()].reduce((a,b)=>a+b,0)+(mayorTownView()?'个领先地区':'席');root.append(heading);
  const caption=svg('text',{x:x+18,y:y+47,'font-size':font*.78,fill:'#728477'});
  caption.textContent=kind==='council'?'每个党徽代表一席实际当选席次':mayorTownView()?'显示乡镇市区得票领先政党':'按实际当选人统计';root.append(caption);
  root.append(svg('line',{x1:x+18,y1:y+58,x2:x+width-18,y2:y+58,stroke:'#e5ece6'}));
  if(gradient){
   const bx=x+18,by=y+78,bw=width-36;
   for(let i=0;i<40;i++){const v=result.range.min+(result.range.max-result.range.min)*(i+.5)/40;root.append(svg('rect',{x:bx+i*bw/40,y:by,width:bw/40+1,height:13,fill:tone('#177d68',v,result.range)}))}
   for(const [offset,label]of [[0,result.range.min+(metric==='votes'?'票':'%')],[.5,((result.range.min+result.range.max)/2).toFixed(0)+(metric==='votes'?'票':'%')],[1,result.range.max+(metric==='votes'?'票':'%')]]){const t=svg('text',{x:bx+offset*bw,y:by+29,'text-anchor':offset===0?'start':offset===.5?'middle':'end','font-size':font*.75,fill:'#526c60'});t.textContent=label;root.append(t)}
  }
  let rowY=y+(gradient?130:67);
  for(const [party,count]of entries){
   const p=predictionParty(party),logo=logoFor(p);
   root.append(svg('rect',{x:x+18,y:rowY+3,width:font,height:font,rx:3,fill:partyColor(party)}));
   if(logo)appendCircularPartyLogo(root,logo,x+38,rowY,font*1.55);
   const label=svg('text',{x:x+font+48,y:rowY+font+1,'font-size':font,fill:'#426052'});label.textContent=party+'（'+count+(mayorTownView()?'个地区':'席')+'）';root.append(label);rowY+=rowH;
  }
  if(kind==='township'){root.append(svg('rect',{x:x+18,y:rowY+3,width:font,height:font,fill:'#fff',stroke:'#9eaaa2'}));const t=svg('text',{x:x+font+48,y:rowY+font+1,'font-size':font,fill:'#426052','data-no-township-election-legend':'true'});t.textContent='无乡镇市区长选举';root.append(t)}
 }
 function paintHistory(result){
  if(!active||!data)return;
  const features=currentItems(),byId=new Map(features.map(f=>[f.id,f]));
  for(const path of document.querySelectorAll('#regions path[data-region]')){
   const f=byId.get(path.dataset.region);if(!f)continue;
   path.setAttribute('fill',fillColor(f));path.setAttribute('aria-label',f.county+f.name+'，'+regionDetail(f));
  }
  el('scopeTitle').textContent=(county||'全台')+' · 2022 '+titles[kind]+(kind==='council'?'实际当选席次':'实际选举结果');
  drawLegend(result);
 }
 function showRows(result){
  const rows=[...result.rows].sort((a,b)=>a.county.localeCompare(b.county,'zh')||areaKey(a).localeCompare(areaKey(b),'zh')||b.votes-a.votes);
  const root=el('historyResults');root.replaceChildren();
  const seats=[...result.partySeats.values()].reduce((a,b)=>a+b,0);
  el('historySummary').textContent=result.areas+'个地区 / 选区 · '+rows.length+'条候选人记录 · '+seats+(mayorTownView()?'个地区领先':'席当选')+' · '+(metric==='share'?'得票率渐变':metric==='votes'?'得票数渐变':'实际当选结果')+(unmatchedDistricts.size?' · '+unmatchedDistricts.size+'个历史选区范围与当前地图不一致，已暂不着色':'');
  if(!rows.length){root.textContent='此范围没有已载入的历史结果。';return}
  const wrap=document.createElement('div');wrap.className='history-table-wrap';
  const table=document.createElement('table');table.className='history-candidate-table';
  const head=document.createElement('thead'),hr=document.createElement('tr');
  for(const label of ['县市','选区／乡镇市区','号次','候选人','性别','政党','得票数','得票率','结果']){const th=document.createElement('th');th.textContent=label;hr.append(th)}
  head.append(hr);table.append(head);const body=document.createElement('tbody');
  for(const r of rows.slice(0,550)){
   const tr=document.createElement('tr');
   const values=[r.county,mayorTownView()?r.town:kind==='council'?r.district:kind==='township'?r.town:(r.district||''),r.number||'—',r.name,r.gender||'—'];
   for(const value of values){const td=document.createElement('td');td.textContent=value||'—';tr.append(td)}
   const partyCell=document.createElement('td');partyCell.className='history-party-cell';
   const party=predictionParty(r.party),logo=logoFor(party);
   if(logo){const img=document.createElement('img');img.src=logo;img.alt='';img.loading='lazy';partyCell.append(img)}
   const partyName=document.createElement('span');partyName.textContent=r.party;partyCell.append(partyName);tr.append(partyCell);
   const votes=document.createElement('td');votes.className='history-number';votes.textContent=r.votes.toLocaleString('zh-CN');tr.append(votes);
   const rate=document.createElement('td');rate.className='history-number';rate.textContent=(r._share||0).toFixed(2)+'%';tr.append(rate);
   const status=document.createElement('td');status.textContent=r.elected?'当选':'未当选';status.className=r.elected?'history-winner':'history-loser';tr.append(status);
   body.append(tr)
  }
  table.append(body);wrap.append(table);root.append(wrap);
  if(rows.length>550){const last=document.createElement('p');last.className='data-help';last.textContent='列表仅显示前550条，下载当前结果CSV可查看全部记录。';root.append(last)}
 }
 function renderHistoryDistrictReference(){
  const section=el('districtReference');if(!section)return;
  const visible=active&&kind==='council'&&districtMetadata.length>0;
  section.hidden=!visible;if(!visible)return;
  const search=norm(el('districtTableSearch')?.value||'');
  const rows=districtMetadata.filter(d=>(!county||norm(d.county)===county)&&(!search||norm(d.name+d.scope+DistrictCore.identityName(d)).includes(search)));
  const seats=rows.reduce((n,d)=>n+d.seats,0);
  el('districtReferenceTitle').textContent=(county||'全台')+'2022议员选区范围与名额';
  el('districtReferenceSummary').textContent=rows.length+'个历史选区 · '+seats+'个应选席次'+(county?'':' · 全台215个选区、910席');
  el('districtReferenceNote').textContent='此表使用2022年独立选区资料，不沿用2026年席次。范围依据2022年乡镇市区层级得票记录整理，作为选区范围核对辅助；法定范围以中选会2022年公告为准。地图按2022年选区范围组合行政区边界，新竹市分里选区按2022年公告重建；席次及当选人均采用2022年资料。妇女保障名额按2022年各选区应选名额列示。';
  const root=el('districtTableGroups');root.replaceChildren();
  const groups=new Map();for(const d of rows){if(!groups.has(d.county))groups.set(d.county,[]);groups.get(d.county).push(d)}
  for(const [name,list]of groups){
   const details=document.createElement('details');details.className='county-district-group';details.open=!!county||name===rows[0]?.county;
   const summary=document.createElement('summary');summary.textContent=norm(name)+' · '+list.length+'个选区 · '+list.reduce((n,d)=>n+d.seats,0)+'席';details.append(summary);
   const wrap=document.createElement('div');wrap.className='reference-table-wrap';const table=document.createElement('table');table.className='reference-table';
   const caption=document.createElement('caption');caption.textContent=norm(name)+'（2022年）议员选区范围与名额';table.append(caption);
   const thead=document.createElement('thead'),trh=document.createElement('tr');
   for(const label of ['选区','类别','选区范围','应选名额','妇保名额','地图边界']){const th=document.createElement('th');th.scope='col';th.textContent=label;trh.append(th)}
   thead.append(trh);table.append(thead);const tbody=document.createElement('tbody');
   for(const d of list.sort((a,b)=>a.number-b.number)){
    const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=d.name;tr.append(th);
    const cat=document.createElement('td');cat.textContent=DistrictCore.identityName(d);tr.append(cat);
    const scope=document.createElement('td');scope.className='reference-scope';scope.textContent=mainlandTerms(norm(d.scope))||'无乡镇市区得票记录';tr.append(scope);
    const seat=document.createElement('td');seat.className='reference-number';seat.textContent=d.seats+'席';tr.append(seat);
    const women=document.createElement('td');women.className='reference-number';women.textContent=d.womenReserved+'席';tr.append(women);
    const map=document.createElement('td');const matchKey=HistoryCore.key(d.county,d.electorate,d.number,norm);map.textContent='2022年选区范围';map.className=unmatchedDistricts.has(matchKey)?'history-map-mismatch':'history-map-match';tr.append(map);
    tbody.append(tr)
   }
   table.append(tbody);wrap.append(table);details.append(wrap);root.append(details)
  }
  const source=el('districtReferenceSource');source.replaceChildren(document.createTextNode('资料来源：中选会111年8月18日中选务字第1113150255号公告及2022年选举结果。'));const officialLink=document.createElement('a');officialLink.href='https://web.cec.gov.tw/api/file/72529fa8-25c6-4260-bcbc-7de268017766.pdf';officialLink.target='_blank';officialLink.rel='noopener';officialLink.textContent='查看中选会2022选区划分公告';source.append(officialLink);
 }
 function update(){if(!active||!data)return;syncHistoryControls();const result=analyze();currentResult=result;showRows(result);paintHistory(result);renderHistoryDistrictReference();el('predictionScopeLabel').textContent='2022 历史选举结果';el('brushName').textContent=historyOverview()?'点击县市查看2022实际结果':'2022实际结果 · 点击区域查看候选人与得票';el('returnTaiwanMap').hidden=!county;el('historyResultSection').hidden=false;el('headerExportPredictions').hidden=true;el('undo').disabled=true;el('redo').disabled=true}
 function switchMode(){
  state.workspaceMode='history';state.fillMode='solid';state.level=kind==='mayor'?(scale==='town'&&county?'towns':'counties'):kind==='council'?'council':'towns';state.county=county;
  if(kind==='council'){state.councilViewScope='all';metric='party'}el('historyMetric').value=metric;currentResult=loaded?analyze():null;
 }
 function activate(){
  if(!window.HistoryAccess?.canAccess()){window.HistoryAccess?.notice();return}
  if(!active)savedMapScope=clone(state);
  active=true;document.body.classList.add('history-mode');document.querySelector('.intro h1').textContent='回看2022选举结果';document.querySelector('.intro > p').textContent='选一类选举，点击地图查看实际得票与当选结果。';
  el('historyControls').hidden=false;el('mapSettings').hidden=true;
  el('workspaceHistory').classList.add('active');el('workspaceHistory').setAttribute('aria-pressed','true');
  el('workspacePrediction').classList.remove('active');el('workspaceFree').classList.remove('active');
  switchMode();render();update();snapshot().then(success=>{if(active&&success){render();update()}})
 }
 function deactivate(){
  active=false;document.body.classList.remove('history-mode');document.querySelector('.intro h1').textContent='画出你的选举预测';document.querySelector('.intro > p').textContent='选一场选举，点选区，开始预测。';
  if(savedMapScope){state=clone(savedMapScope);savedMapScope=null;}currentResult=null;districtTableKey='';el('headerExportPredictions').hidden=false;
  el('historyControls').hidden=true;el('historyResultSection').hidden=true;el('mapSettings').hidden=false;
  el('workspaceHistory').classList.remove('active');el('workspaceHistory').setAttribute('aria-pressed','false');if(data){syncInputs();render()}
 }
 function downloadCSV(){
  const rows=analyze().rows,heads=['县市','乡镇市区','选区','类别','号次','候选人','政党','得票数','得票率','是否当选'];
  const safe=csvCell;
  const dataRows=[heads,...rows.map(r=>[r.county,r.town,r.district,r.electorate,r.number,r.name,r.party,r.votes,(r._share||0).toFixed(3),r.elected?'是':''])];
  const blob=new Blob(['\uFEFF'+dataRows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='2022_'+titles[kind]+'_'+(county||'全台')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
 }

 function mayorTownView(){return kind==='mayor'&&scale==='town'&&!!county}
 function historyOverview(){return active&&!county&&(kind!=='mayor'||scale==='town')}
 function historyCouncilSeats(){return active&&kind==='council'&&!!county}
 function candidateKey(r){return[r.county,r.number,r.name].join('|')}
 function ensureHistoryGeometry(){
  if(historicalFeatures.length||!data?.towns?.length||!districtMetadata.length||!hsinchuGeometry)return;
  historicalFeatures=districtMetadata.map(h=>{
   const split=h.county==='新竹市'&&h.electorate==='regional'?hsinchuGeometry.features.find(f=>f.number===h.number):null;
   const towns=data.towns.filter(t=>t.county===h.county&&h.scopeTowns.includes(t.name));
   if(!towns.length)throw Error('2022选区缺少地图范围：'+h.id);
   const box=split?.box||bounds(towns),center=split?.center||[(box[0]+box[2])/2,(box[1]+box[3])/2];
   return{id:'history-'+h.id,historyId:h.id,county:h.county,name:h.name,number:h.number,electorate:h.electorate,scope:h.scope,seats:h.seats,d:split?.d||HistoryCore.mergePaths(towns.map(t=>t.d)),box,center};
  });
 }
 function historyItems(){
  if(!active)return null;
  if(historyOverview())return kind==='township'?data.towns:data.counties;
  if(kind==='council'){ensureHistoryGeometry();return historicalFeatures.filter(f=>!county||f.county===county)}
  const items=kind==='mayor'&&!mayorTownView()?data.counties:data.towns;
  return items.filter(f=>!county||f.county===county);
 }
 function noElection(f){return f.name!==f.county&&active&&kind==='township'&&loaded&&!db.township.some(r=>r.county===f.county&&r.town===f.name)}
 function historicalDistrictFor(f){return districtMetadata.find(d=>d.id===f.historyId)}
 function historicalSeatRows(d){
  const cs=db.council.filter(r=>r.level==='district'&&HistoryCore.key(r.county,r.electorate,r.district,norm)===HistoryCore.key(d.county,d.electorate,d.number,norm)&&r.elected).map(r=>({...r,id:'2022|'+candidateKey(r),history:true}));
  cs.sort((a,b)=>state.palette.findIndex(p=>p.id===predictionParty(a.party).id)-state.palette.findIndex(p=>p.id===predictionParty(b.party).id)||a.party.localeCompare(b.party)||b.votes-a.votes);
  return Array.from({length:d.seats},(_,i)=>cs[i]||null);
 }
 function syncHistoryControls(){
  el('historyCounty').value=county;el('historyScaleBox').hidden=kind!=='mayor';el('historyScale').value=scale;
  const metrics=kind==='council'?[['party','实际当选席次']]:[['party',mayorTownView()?'地区领先政党':'实际当选结果'],['share','得票率'],['votes','得票数']];
  const select=el('historyMetric');select.replaceChildren(...metrics.map(([v,l])=>new Option(l,v)));select.value=metric;
  el('historyCandidateScopeBox').hidden=kind==='council'||metric==='party';el('historyCandidateScope').value=candidateScope;
  el('historyCandidateBox').hidden=kind==='council'||metric==='party'||candidateScope!=='candidate';
  const choices=new Map();for(const r of db[kind].filter(r=>!county||r.county===county))choices.set(candidateKey(r),r);
  if(!choices.has(selectedCandidate))selectedCandidate=choices.keys().next().value||'';
  el('historyCandidate').replaceChildren(...[...choices].map(([id,r])=>new Option(r.county+' · '+r.name+' · '+r.party,id)));el('historyCandidate').value=selectedCandidate;
 }
 function openHistoryRegion(f){
  const key=featureKey(f),rows=currentResult?.rows.filter(r=>areaKey(r)===key)||[];
  el('historyDialogTitle').textContent=(f.county===f.name?f.name:f.county+' · '+f.name)+' · 2022实际结果';
  const body=el('historyDialogRows');body.replaceChildren();
  for(const r of [...rows].sort((a,b)=>b.votes-a.votes)){const tr=document.createElement('tr');for(const text of [r.number||'—',r.name,r.gender||'—',r.party,r.votes.toLocaleString('zh-CN'),(r._share||0).toFixed(2)+'%',r.elected?'当选':'未当选']){const td=document.createElement('td');td.textContent=text;tr.append(td)}body.append(tr)}
  el('historyDialogMessage').textContent=rows.length?'2022年实际得票与当选结果，仅供查看。':noElection(f)?'2022年本区域不举行乡镇市区长选举。':'此范围尚未载入历史数据。';
  el('historyResultDialog').showModal();
 }
 window.History2022View={active:()=>active,kind:()=>kind,overview:historyOverview,seatMode:historyCouncilSeats,items:historyItems,noElection,districtFor:historicalDistrictFor,seatRows:historicalSeatRows,openRegion:openHistoryRegion,features:()=>historicalFeatures};
 const resultSection=document.createElement('section');resultSection.id='historyResultSection';resultSection.hidden=true;resultSection.className='history-result-section';const resultHeading=document.createElement('h3');resultHeading.textContent='2022 实际选举结果';resultSection.append(resultHeading,el('historySummary'),el('historyResults'));el('districtReference').before(resultSection);
 el('closeHistoryResult').onclick=()=>el('historyResultDialog').close();
 el('workspaceHistory').onclick=activate;
 for(const id of ['workspacePrediction','workspaceFree'])el(id).addEventListener('click',()=>{if(active)deactivate()},{capture:true});
 el('historyOffice').onchange=()=>{kind=el('historyOffice').value;candidateScope='top';selectedCandidate='';switchMode();render();update()};
 el('historyCounty').onchange=()=>{county=el('historyCounty').value;switchMode();render();update()};
 el('historyMetric').onchange=()=>{metric=kind==='council'?'party':el('historyMetric').value;render();update()};
 el('historyScale').onchange=()=>{scale=el('historyScale').value;switchMode();render();update()};
 el('historyCandidateScope').onchange=()=>{candidateScope=el('historyCandidateScope').value;render();update()};
 el('historyCandidate').onchange=()=>{selectedCandidate=el('historyCandidate').value;render();update()};
 for(const n of COUNTY_ORDER)el('historyCounty').add(new Option(n,n));
 el('historyCsvExport').onclick=downloadCSV;
 const defaultDistrictSearch=el('districtTableSearch').oninput;
 el('districtTableSearch').oninput=event=>{if(active&&kind==='council')renderHistoryDistrictReference();else defaultDistrictSearch?.(event)};
 const defaultDistrictDownload=el('downloadDistrictTable').onclick;
 el('downloadDistrictTable').onclick=event=>{if(!active||kind!=='council')return defaultDistrictDownload?.(event);const lines=[['县市','选区','类别','选区范围','应选名额','妇保名额','地图匹配'],...districtMetadata.filter(d=>(!county||norm(d.county)===county)).map(d=>[norm(d.county),d.name,DistrictCore.identityName(d),norm(d.scope),d.seats,d.womenReserved,unmatchedDistricts.has(norm(d.county)+'|'+d.electorate+'|'+d.number)?'未匹配':'已匹配'])];const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const blob=new Blob([HistoryCore.csv(lines)],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='2022议员选区范围与名额.csv';a.click();URL.revokeObjectURL(url)};
 el('historyImport').onclick=()=>el('historyFiles').click();
 el('historyFiles').onchange=async()=>{
  let count=0;const errors=[];
  for(const file of el('historyFiles').files)try{count+=importCsv(await file.text(),file.name)}catch(error){errors.push(file.name+': '+error.message)}
  el('historyStatus').textContent='已导入'+count+'条新记录。'+errors.join('；');update();el('historyFiles').value=''
 };
 const formerReturn=el('returnTaiwanMap').onclick;el('returnTaiwanMap').onclick=()=>{if(!active)return formerReturn();county='';el('historyCounty').value='';switchMode();render();update()};
 el('historyLoad').onclick=async()=>{el('historyStatus').textContent='正在载入全台2022选举结果…';await snapshot();update()};
 const defaultColor=fillColor;fillColor=function(feature){
  if(!active)return defaultColor(feature);
  if(historyOverview()&&kind==='council'){const counts=currentResult?.countySeats.get(feature.county);if(!counts?.size)return '#edf1e9';const ranked=[...counts].sort((a,b)=>b[1]-a[1]);return ranked[1]?.[1]===ranked[0][1]?'#aebdb4':partyColor(ranked[0][0])}
  if(historyCouncilSeats())return '#f0f3ed';
  if(noElection(feature))return '#ffffff';
  const region=currentResult?.regions.get(featureKey(feature));
  return !region?'#edf1e9':region.tie?'#aebdb4':region.party?tone(partyColor(region.party),metric==='votes'?region.top?.votes||0:region.share,currentResult.range):'#edf1e9';
 };
 const defaultDetail=regionDetail;regionDetail=function(feature){if(!active)return defaultDetail(feature);if(historyOverview())return '点击查看'+feature.county+'2022年结果';if(noElection(feature))return '2022年本区域不举行乡镇市区长选举';const region=currentResult?.regions.get(featureKey(feature));return !region?'历史数据未匹配':region.tie?'各党当选席次并列':region.party+' · '+region.seatCount+'席'};
 const defaultPushHistory=pushHistory;pushHistory=function(){if(!active)return defaultPushHistory()};
 const defaultPaint=paint;paint=function(feature){if(!active)return defaultPaint(feature);if(historyOverview()){county=feature.county||feature.name;el('historyCounty').value=county;switchMode();render();update()}else openHistoryRegion(feature)};
 const defaultSaveState=projectStateForSave;projectStateForSave=function(){return active&&savedMapScope?savedMapScope:defaultSaveState()};
 const defaultRender=render;render=function(){defaultRender();if(active){update();for(const id of ['workspacePrediction','workspaceFree']){el(id).classList.remove('active');el(id).setAttribute('aria-pressed','false')}}};
 const defaultFooter=furnitureFooterHeight;furnitureFooterHeight=function(){
  if(!active)return defaultFooter();
  const number=Math.min(30,new Set(recordsInView().filter(r=>r.elected).map(r=>r.party)).size);
  const font=state.legend.fontSize*(isNationwide()?1.4:1)*(identityPanelsActive()?2:1);return Math.max(defaultFooter(),(metric!=='party'?162:86)+(number+(kind==='township'?1:0))*font*2.05+50)
 };
 const defaultPreparedExport=preparedExportSvg;preparedExportSvg=function(){
  if(!active)return defaultPreparedExport();
  if(!recordsInView().length)throw Error('当前范围尚未载入2022历史得票数据，无法导出地图');
  const oldTitle=state.title;state.title='2022 '+titles[kind]+'实际选举结果 · '+(county||'全台');
  try{return defaultPreparedExport()}finally{state.title=oldTitle}
 };
})();
