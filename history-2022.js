'use strict';
/* 2022 election history. Source: CEC open data, assembled by taiwanvotes.tw. */
(()=>{
 const el=id=>document.getElementById(id), db={mayor:[],council:[],township:[]},titles={mayor:'县市长',council:'县市议员',township:'乡镇市区长'};
 let selectedParty='', active=false,kind='mayor',electorate='all',county='',metric='party',scale='district',candidateScope='top',selectedCandidate='',historicalFeatures=[],hsinchuGeometry=null,loaded=false,loading=null,lastResult=[],savedMapScope=null,unmatchedDistricts=new Set(),districtMetadata=[],currentResult=null,snapshotData=null,lastOpenedFeature=null;
 let presidentialMode=false,presidentialYear=2024,presidentialGeometry=null;
 let history2022Snapshot=null,originalMayorRows=null,loadingPresidentialId=0;
 const yearLabel=()=>String(presidentialMode?presidentialYear:2022);
 const officeTitle=()=>presidentialMode?'台湾地区领导人':titles[kind];
 const areaLeading=()=>presidentialMode||mayorTownView();
 const norm=x=>simplify(String(x||'')).trim();
 const normalizeParty=name=>{let s=norm(name||'无党籍');if(s.includes('无党籍及未经政党推荐')||s==='无党籍及未经政党推薦')s='无党籍';return s};
 const partyColor=p=>predictionParty(p).color;
 // Use the exact high-contrast nonlinear palette of the 2026 election view.
 const tone=(color,value,range)=>metric==='party'?color:ElectionCore.shade(color,value,range.min,range.max);
 const electionKey=r=>[r.type,r.electorate,r.level,r.county,r.town,r.village,r.district,r.number,r.name].join('|');
 const dbIds=new Set();
 const addRows=rows=>{let added=0;for(const src of rows){
  if(!['mayor','council','township'].includes(src.type))continue;
  const r={type:src.type,electorate:HistoryCore.identity(src.electorate),level:src.level||'raw',county:norm(src.county),town:norm(src.town),village:norm(src.village),district:norm(src.district),number:String(src.number||''),name:norm(src.name),gender:norm(src.gender),deputyName:norm(src.deputy_name),deputyGender:norm(src.deputy_gender),incumbent:src.incumbent,party:normalizeParty(src.party),votes:Number(src.votes),elected:src.elected===true||src.elected==='true'};
  if(!r.county||!r.name||!Number.isFinite(r.votes)||r.votes<0)continue;
  const key=electionKey(r);if(dbIds.has(key))continue;dbIds.add(key);db[r.type].push(r);added++;
 }return added};
 async function snapshot(){
  if(loaded)return true;
  if(loading)return loading;
  loading=(async()=>{
   if(el('historyLoadStatus')){el('historyLoadStatus').hidden=false;el('historyLoadStatus').textContent='正在载入 2022 年历史选举数据…'};if(el('historyRetry'))el('historyRetry').hidden=true;
   try{
    const [resp,metaResp,geoResp]=await Promise.all([fetch('assets/history-2022.json?v=20261110-cec-complete-v1',{cache:'default'}),fetch('assets/history-council-districts-2022.json?v=20261031-districts-v2',{cache:'default'}),fetch('assets/history-hsinchu-geography-2022.json?v=20261103-history-v103')]);
    if(!resp.ok)throw Error('历史投票数据 HTTP '+resp.status);if(!metaResp.ok)throw Error('2022议员选区资料 HTTP '+metaResp.status);
    const obj=await resp.json(),meta=await metaResp.json();
    if(meta.year!==2022||meta.districtCount!==215||!Array.isArray(meta.rows)||meta.rows.reduce((n,x)=>n+x.seats,0)!==910)throw Error('2022议员选区资料未通过完整性核验');
    districtMetadata=meta.rows.map(d=>({...d,county:norm(d.county),name:norm(d.name),scope:norm(d.scope),scopeTowns:d.scopeTowns.map(norm),electorate:HistoryCore.identity(d.electorate)}));if(!geoResp.ok)throw Error('2022新竹市地图载入失败');hsinchuGeometry=await geoResp.json();if(hsinchuGeometry.year!==2022||hsinchuGeometry.features?.length!==5)throw Error('2022新竹市选区范围不完整');
    if(obj.schemaVersion!==2||obj.year!==2022||!Array.isArray(obj.rows)||obj.rows.length<8000)throw Error('历史快照内容不完整或版本不兼容');
    history2022Snapshot=obj;addRows(obj.rows);originalMayorRows=db.mayor.slice();if(!presidentialMode)snapshotData=obj;ensureHistoryGeometry();loaded=true;window.dispatchEvent(new CustomEvent('historysnapshotready',{detail:{snapshot:obj}}));
    if(el('historyLoadStatus')){el('historyLoadStatus').textContent='';el('historyLoadStatus').hidden=true}return true
   }catch(error){
    if(el('historyLoadStatus')){el('historyLoadStatus').hidden=false;el('historyLoadStatus').textContent='历史数据暂时未能载入：'+error.message};if(el('historyRetry'))el('historyRetry').hidden=false;toast('2022 历史数据载入失败：'+error.message);return false
   }finally{loading=null}
  })();
  return loading
 }

 function updateYearOptions(office=el('historyOffice').value){
  const years=office==='president'?HistoryPresidential.YEARS:[2022],select=el('historyYear');
  const requested=Number(select.value),chosen=years.includes(requested)?requested:(office==='president'?2024:2022);
  if(select.options.length!==years.length||years.some((year,i)=>Number(select.options[i]?.value)!==year)){
   select.replaceChildren(...years.map(year=>new Option(String(year),String(year))));
  }
  select.value=String(chosen);
  return chosen;
 }
 function updateHistoricCounties(counties){
  const list=el('historyCounty'),previous=county;
  list.replaceChildren(new Option('全部地区（含金门、马祖）',''),...counties.map(c=>new Option(c,c)));
  county=counties.includes(previous)?previous:'';
  list.value=county;
 }
 function restoreStandardElection(office){
  loadingPresidentialId+=1;
  const wasPresidential=presidentialMode;
  presidentialMode=false;presidentialGeometry=null;
  if(wasPresidential&&originalMayorRows){
   db.mayor.length=0;db.mayor.push(...originalMayorRows);
  }
  snapshotData=history2022Snapshot||snapshotData;
  kind=office;updateHistoricCounties(COUNTY_ORDER);updateYearOptions(office);
  candidateScope='top';selectedCandidate='';resultPage=0;
  el('historyOffice').value=office;
  if(wasPresidential&&history2022Snapshot){
   window.dispatchEvent(new CustomEvent('historysnapshotready',{detail:{snapshot:history2022Snapshot}}));
  }
  switchMode();render();
 }
 async function activatePresidential(year){
  year=Number(year);
  if(!HistoryPresidential.YEARS.includes(year))year=2024;
  const requestId=++loadingPresidentialId;
  const indicator=el('historyLoadStatus');
  indicator.hidden=false;indicator.textContent='正在载入 '+year+' 年台湾地区领导人选举结果…';
  el('historyRetry').hidden=true;
  try{
   const [shard,ready]=await Promise.all([HistoryPresidential.load(year),snapshot()]);
   if(!ready)throw Error('2022历史工作台暂时不可用');
   if(!data||!Array.isArray(data.towns))throw Error('地图几何尚未载入');
   const geometry=HistoryPresidential.geometry(shard,data,norm,HistoryCore.mergePaths);
   if(requestId!==loadingPresidentialId||!active||el('historyOffice').value!=='president')return;
   db.mayor.length=0;dbIds.clear();
   addRows(shard.rows.map(row=>({...row,type:'mayor'})));
   presidentialMode=true;presidentialYear=year;presidentialGeometry=geometry;
   kind='mayor';snapshotData=shard;
   updateHistoricCounties(geometry.countyNames);
   el('historyYear').value=String(year);
   metric=['party','share','votes'].includes(metric)?metric:'party';
   candidateScope='top';selectedCandidate='';resultPage=0;
   indicator.hidden=true;indicator.textContent='';
   window.dispatchEvent(new CustomEvent('historysnapshotready',{detail:{snapshot:shard}}));
   switchMode();render();
  }catch(error){
   if(requestId!==loadingPresidentialId)return;
   indicator.hidden=false;indicator.textContent=year+' 年历史结果载入失败：'+error.message;
   el('historyRetry').hidden=false;
   el('historyOffice').value=presidentialMode?'president':'mayor';
   updateYearOptions(presidentialMode?'president':'mayor');
   if(presidentialMode)el('historyYear').value=String(presidentialYear);
   toast(year+' 年历史结果载入失败：'+error.message);
  }
 }
 function recordsInView(){
  const all=db[kind].filter(r=>!county||r.county===county);
  const level=kind==='mayor'?(mayorTownView()?'town':'county'):kind==='council'?'district':'town';
  const rows=all.filter(r=>r.level===level&&(kind!=='council'||electorate==='all'||r.electorate===electorate));
  if(!presidentialMode||presidentialYear>2000||level!=='town')return rows;
  const combined=new Map(),ordinary=[];
  for(const r of rows){
   if(r.county!=='台南市'||!['中区','西区'].includes(r.town)){ordinary.push(r);continue}
   const key=[r.number,r.name,r.party].join('|');
   if(!combined.has(key))combined.set(key,{...r,town:'中区、西区（合并）',votes:0,historicalMerge:true});
   combined.get(key).votes+=r.votes;
  }
  return ordinary.concat([...combined.values()]);
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
   const chosen=areaLeading()?[leading].filter(Boolean):winners;
   const winnerParties=new Map();
   for(const winner of chosen){winnerParties.set(winner.party,(winnerParties.get(winner.party)||0)+1);partySeats.set(winner.party,(partySeats.get(winner.party)||0)+1)}
   const dominant=[...winnerParties].sort((a,b)=>b[1]-a[1]);
   const party=dominant.length&&(!dominant[1]||dominant[0][1]>dominant[1][1])?dominant[0][0]:null;
   const displayed=candidateScope==='candidate'&&voteMetric()?entries.find(r=>candidateKey(r)===selectedCandidate):leading;
   const winnerVotes=displayed?.votes||0;
   regions.set(key,{party:voteMetric()?(displayed?.party||null):party,partyCounts:winnerParties,leaders:chosen,top:displayed,share:total?winnerVotes/total*100:0,votes:total,seatCount:winners.length,tie:dominant.length>1&&dominant[0][1]===dominant[1][1]});
   for(const r of entries)r._share=total?r.votes/total*100:0;
  }
  const values=[...regions.values()].filter(r=>r.party).map(r=>metric==='votes'?r.top?.votes||0:r.share).sort((a,b)=>a-b);
  const percentile=q=>values.length?values[Math.min(values.length-1,Math.floor(q*(values.length-1)))]:0;
  let min=Math.floor(percentile(.05)/5)*5,max=Math.ceil(percentile(.95)/5)*5;
  if(metric==='votes'){min=0;max=Math.max(1,...values)}else if(max-min<15){const mid=(min+max)/2;min=Math.max(0,Math.floor((mid-10)/5)*5);max=Math.min(100,Math.ceil((mid+10)/5)*5)}
  lastResult=rows;
  const countySeats=new Map();if(kind==='council')for(const r of rows.filter(r=>r.elected)){if(!countySeats.has(r.county))countySeats.set(r.county,new Map());const counts=countySeats.get(r.county);counts.set(r.party,(counts.get(r.party)||0)+1)}
  const result={rows,regions,partySeats,countySeats,areas:groups.size,range:{min,max}};
  if(metric==='seats')result.seatRange=seatRange(result);
  return result
 }
 function featureKey(feature){
  if(kind==='mayor')return mayorTownView()?feature.county+'|'+feature.name:feature.county;
  if(kind==='township')return feature.county+'|'+feature.name;
  const identity=featureElectorate(feature),number=districtNumber(feature.number||feature.name);if(unmatchedDistricts.has(norm(feature.county)+'|'+identity+'|'+number))return '__2022_unmatched__';
  return feature.county+'|'+identity+'|'+number;
 }
 // Presidential tickets need separate legend entries even when their
 // candidates share a nomination label (1996 and 2000 independents).
 // County mayor legends include names only when one county is selected.
 const detailedLegend=()=>presidentialMode||(kind==='mayor'&&!!county);
 const legendCandidateName=name=>presidentialMode?HistoryPresidential.ticketName(presidentialYear,name):name;
 const displayedCandidateName=row=>presidentialMode?legendCandidateName(row.name):row.name;
 const displayedGender=row=>presidentialMode?[row.gender,row.deputyGender].map(s=>s||'—').join(' / '):(row.gender||'—');
 function legendLabel(entry){return entry.name?entry.party+'｜'+legendCandidateName(entry.name):entry.party}
 function legendEntries(result){
  if(!detailedLegend())return [...result.partySeats].map(([party,count])=>({party,name:'',count}));
  const entries=new Map();
  for(const region of result.regions.values()){
   if(!region.party)continue;
   const candidate=voteMetric()?region.top:region.leaders[0]||region.top;
   if(!candidate?.name)continue;
   const key=[region.party,candidate.number,candidate.name].join('|');
   if(!entries.has(key))entries.set(key,{party:region.party,name:candidate.name,number:candidate.number,count:0});
   entries.get(key).count++;
  }
  return [...entries.values()];
 }
 function gradientParties(result){
  if(metric==='seats')return selectedParty?[{party:selectedParty,name:''}]:[];
  if(!voteMetric())return [];
  if(detailedLegend())return legendEntries(result);
  return [...new Set([...result.regions.values()].map(r=>r.top?.party).filter(Boolean))].map(party=>({party,name:''}));
 }
 const historyLegendFont=()=>state.legend.fontSize*(isNationwide()?1.4:1)*(identityPanelsActive()?2:1);
 function legendHeight(result){
  const font=historyLegendFont(),gradients=gradientParties(result),entries=legendEntries(result);
  return 71+(entries.length+(kind==='township'?1:0))*font*2.05+
   (gradients.length?gradients.length*font*4.3+font*2.3:0);
 }
 function drawLegend(result){
  const root=el('legend');if(!root)return;root.replaceChildren();delete root.dataset.historyBox;if(!state.legend.show)return;
  const entries=legendEntries(result).sort((a,b)=>b.count-a.count);if(!entries.length&&kind!=='township')return;
  const spec=sceneSpec(),font=historyLegendFont(),rowH=font*2.05,width=identityPanelsActive()?560:detailedLegend()?480:isNationwide()?350:300;
  const gradients=gradientParties(result),height=legendHeight(result),x=spec.width-width-25,y=spec.height-furnitureFooterHeight()+20;
  const svg=(tag,attrs)=>{const node=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs||{}))node.setAttribute(k,v);return node};
  root.dataset.historyBox=[x,y,width,height].join(',');
  root.append(svg('rect',{x,y,width,height,rx:12,fill:'#fff',stroke:'#dce5df','stroke-width':1}));
  const heading=svg('text',{x:x+18,y:y+27,'font-size':font+1,'font-weight':600,fill:'#294a3a'});
  const localLeaders=areaLeading()&&(!voteMetric()||candidateScope==='top');
  const count=entries.reduce((sum,entry)=>sum+entry.count,0);
  heading.textContent=presidentialMode?yearLabel()+' 台湾地区领导人选举 · '+(localLeaders?'各地区最高票候选人':'候选人得票'):mayorTownView()?'2022 县市长选举 · '+(localLeaders?'乡镇市区最高票候选人':'乡镇市区得票'):'2022 '+titles[kind]+'选举结果';
  root.append(heading);
  const unit=metric==='seats'?'席':metric==='votes'?'票':'%';
  root.append(svg('line',{x1:x+18,y1:y+43,x2:x+width-18,y2:y+43,stroke:'#e5ece6'}));
  let rowY=y+52;
  if(gradients.length){
   const bx=x+18,bw=width-36,range=metric==='seats'?result.seatRange:result.range;
   const stops=metric==='votes'||metric==='seats'?[0,.5,1]:[0,.25,.5,.75,1];
   for(const [index,entry] of gradients.entries()){
    const party=entry.party;
    const group=svg('g',{'data-history-gradient-party':party,'data-history-gradient-candidate':entry.name||''});
    group.append(svg('rect',{x:bx,y:rowY+3,width:font,height:font,rx:3,fill:partyColor(party)}));
    const label=svg('text',{x:bx+font*1.35,y:rowY+font,'font-size':font*.88,'font-weight':600,fill:'#426052'});
    label.textContent=legendLabel(entry);group.append(label);
    const gy=rowY+font*1.35,barHeight=font*1.4;
    const id='history-gradient-'+index,defs=svg('defs'),gradient=svg('linearGradient',{id,x1:'0%',x2:'100%',y1:'0%',y2:'0%'});
    // Sample the metric-specific range used to shade map regions.
    for(let step=0;step<=10;step++){
     const fraction=step/10,value=range.min+(range.max-range.min)*fraction;
     gradient.append(svg('stop',{offset:(fraction*100)+'%','stop-color':tone(partyColor(party),value,range)}));
    }
    defs.append(gradient);group.append(defs);
    group.append(svg('rect',{x:bx,y:gy,width:bw,height:barHeight,rx:4,fill:'url(#'+id+')',stroke:'#b0bcb1','stroke-width':.55,'data-history-gradient-bar':party}));
    for(const fraction of stops){
     const value=range.min+(range.max-range.min)*fraction,tx=bx+bw*fraction;
     if(fraction>0&&fraction<1)group.append(svg('line',{x1:tx,x2:tx,y1:gy+1,y2:gy+barHeight-1,stroke:'#526355','stroke-width':1,opacity:.36}));
     const tick=svg('text',{x:tx,y:rowY+font*3.55,'text-anchor':fraction===0?'start':fraction===1?'end':'middle','font-size':font*.7,fill:'#526c60'});
     tick.textContent=value.toLocaleString('zh-CN',{maximumFractionDigits:metric==='votes'||metric==='seats'?0:1})+unit;
     tick.setAttribute(metric==='votes'?'data-history-vote-tick':metric==='share'?'data-history-rate-tick':'data-history-seat-tick',String(fraction));
     group.append(tick);
    }
    root.append(group);rowY+=font*4.3;
   }
   const summary=svg('text',{x:x+18,y:rowY+font,'font-size':font*.88,'font-weight':600,fill:'#294a3a'});
   summary.textContent=areaLeading()?'领先地区数（共 '+count+' 个）':'当选席次（共 '+count+' 席）';
   root.append(summary);rowY+=font*2;
  }
  for(const entry of entries){
   const {party,count}=entry,p=predictionParty(party),logo=logoFor(p);
   root.append(svg('rect',{x:x+18,y:rowY+3,width:font,height:font,rx:3,fill:partyColor(party)}));
   if(logo)appendCircularPartyLogo(root,logo,x+38,rowY,font*1.55);
   const label=svg('text',{x:x+font+48,y:rowY+font+1,'font-size':font,fill:'#426052','data-history-legend-candidate':entry.name||''});label.textContent=legendLabel(entry)+'（'+count+(areaLeading()?'个地区':'席')+'）';root.append(label);rowY+=rowH;
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
  el('scopeTitle').textContent=(county||'全台')+' · '+yearLabel()+' '+officeTitle()+' · '+metricLabel();
  drawLegend(result);
  positionMapNumberTable();
 }
 function showRows(result){
  const search=norm(el('historySearch').value);
  const partySelect=el('historyResultParty'),parties=[...new Set(result.rows.map(r=>r.party))].sort((a,b)=>a.localeCompare(b,'zh')),priorParty=partySelect?.value||'';
  if(partySelect){partySelect.replaceChildren(new Option('全部政党',''),...parties.map(p=>new Option(p,p)));partySelect.value=parties.includes(priorParty)?priorParty:''}
  const partyFilter=partySelect?.value||'',rows=result.rows.filter(r=>(!partyFilter||r.party===partyFilter)&&(!search||[r.county,r.town,r.district,r.name,r.party].some(v=>v.includes(search)))).sort((a,b)=>HistoryCore.compareResultRows(a,b,kind));
  const root=el('historyResults');root.replaceChildren();
  resultPage=Math.min(resultPage,Math.max(0,Math.ceil(rows.length/100)-1));
  el('historyPage').textContent='';el('historyPrev').disabled=true;el('historyNext').disabled=true;
  const seats=[...result.partySeats.values()].reduce((a,b)=>a+b,0);
  el('historySummary').textContent=result.areas+'个地区 / 选区 · '+rows.length+'条候选人记录 · '+seats+(areaLeading()?'个地区领先':'席当选')+' · '+(metric==='share'?'得票率渐变':metric==='votes'?'得票数渐变':'当选结果')+(unmatchedDistricts.size?' · '+unmatchedDistricts.size+'个历史选区范围与当前地图不一致，已暂不着色':'');
  if(!rows.length){root.textContent='此范围没有已载入的历史结果。';return}
  const wrap=document.createElement('div');wrap.className='history-table-wrap';
  const table=document.createElement('table');table.className='history-candidate-table';
  const head=document.createElement('thead'),hr=document.createElement('tr');
  for(const label of ['县市','选区／乡镇市区','号次','候选人',presidentialMode?'性别（正/副）':'性别','选举时现任','政党','得票数','得票率','当选']){const th=document.createElement('th');th.textContent=label;hr.append(th)}
  head.append(hr);table.append(head);const body=document.createElement('tbody');
  let previousArea='';
  for(const r of rows.slice(resultPage*100,(resultPage+1)*100)){
   const area=areaKey(r);
   if(area!==previousArea){
    const divider=document.createElement('tr'),heading=document.createElement('th');divider.className='history-district-divider';heading.scope='rowgroup';heading.colSpan=10;
    heading.textContent=kind==='mayor'?(presidentialMode?(scale==='town'?r.county+' · '+r.town:r.county+' · '+yearLabel()+'年领导人选举'):(mayorTownView()?r.county+' · '+r.town:r.county+' · 县市长选举')):kind==='council'?r.county+' · '+r.district+' · '+(r.electorate==='plains'?'平地少数民族议员':r.electorate==='mountain'?'山地少数民族议员':'区域议员'):r.county+' · '+r.town;
    divider.append(heading);body.append(divider);previousArea=area;
   }
   const tr=document.createElement('tr');
   const values=[r.county,mayorTownView()?r.town:kind==='council'?r.district:kind==='township'?r.town:(r.district||''),r.number||'—',displayedCandidateName(r),displayedGender(r),incumbentLabel(r)];
   for(const value of values){const td=document.createElement('td');td.textContent=value||'—';tr.append(td)}
   const partyCell=document.createElement('td');partyCell.className='history-party-cell';
   const party=predictionParty(r.party),logo=logoFor(party);
   if(logo){const img=document.createElement('img');img.src=logo;img.alt='';img.loading='lazy';partyCell.append(img)}
   const partyName=document.createElement('span');partyName.textContent=r.party;partyCell.append(partyName);tr.append(partyCell);
   const votes=document.createElement('td');votes.className='history-number';votes.textContent=r.votes.toLocaleString('zh-CN');tr.append(votes);
   const rate=document.createElement('td');rate.className='history-number';rate.textContent=(r._share||0).toFixed(2)+'%';tr.append(rate);
   const status=document.createElement('td');appendResultMark(status,r);tr.append(status);
   body.append(tr)
  }
  table.append(body);wrap.append(table);root.append(wrap);
  el('historyPage').textContent=(resultPage+1)+' / '+Math.max(1,Math.ceil(rows.length/100));
  el('historyPrev').disabled=resultPage===0;el('historyNext').disabled=(resultPage+1)*100>=rows.length;
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
 }
 function update(){if(!active||!data)return;const result=currentResult;showRows(result);showComparison(result);paintHistory(result);renderHistoryDistrictReference();el('predictionScopeLabel').textContent=yearLabel()+' 历史选举结果';el('brushName').textContent=historyOverview()?'点击县市查看'+yearLabel()+'年结果':yearLabel()+'选举结果 · 点击区域查看候选人与得票';el('returnTaiwanMap').hidden=!county;el('historyResultSection').hidden=false;el('headerExportPredictions').hidden=true;el('undo').disabled=true;el('redo').disabled=true;window.HistoryWorkspace?.render()}
 function switchMode(){
  state.workspaceMode='history';state.fillMode='solid';state.level=kind==='mayor'?(scale==='town'?'towns':'counties'):kind==='council'?'council':'towns';state.county=county;state.villageTown='';
  if(kind==='council')state.councilViewScope='all';
  if(kind!=='council'&&metric==='seats')metric='party';el('historyMetric').value=metric;currentResult=loaded?analyze():null;
 }
 function activate(){
  if(!window.HistoryAccess?.canAccess()){window.HistoryAccess?.notice();return}
  if(!active)savedMapScope=clone(state);
  active=true;document.body.classList.add('history-mode');
  el('historyControls').hidden=false;el('mapSettings').hidden=true;
  
  el('workspacePrediction').classList.remove('active');el('workspaceFree').classList.remove('active');
  switchMode();render();snapshot().then(success=>{if(active&&success){render()}})
 }
 function deactivate(){
  active=false;document.body.classList.remove('history-mode');
  if(savedMapScope){state=clone(savedMapScope);savedMapScope=null;}currentResult=null;districtTableKey='';el('headerExportPredictions').hidden=false;
  el('historyControls').hidden=true;el('historyResultSection').hidden=true;el('mapSettings').hidden=false;
  if(data){syncInputs();render()}
 }
 function mayorTownView(){return kind==='mayor'&&scale==='town'}
 function historyOverview(){return active&&!county&&kind!=='mayor'}
 function historyCouncilSeats(){return active&&kind==='council'&&!!county&&metric==='party'}
 function voteMetric(){return metric==='share'||metric==='votes'}
 function metricLabel(){return metric==='seats'?selectedParty+'当选席次':metric==='share'?'得票率':metric==='votes'?'得票数':kind==='council'?'当选席次':presidentialMode?(scale==='town'?'各乡镇市区最高票候选人':'各县市最高票候选人'):mayorTownView()?'各乡镇市区最高票候选人':'当选结果'}
 function seatRange(result){const counts=county?[...result.regions.values()].map(r=>r.partyCounts):[...result.countySeats.values()];return{min:0,max:Math.max(1,...counts.map(c=>c.get(selectedParty)||0))}}
 function isOfficialWinner(r){
  if(presidentialMode)return r.elected===true;
  if(!mayorTownView())return r.elected===true;
  return db.mayor.some(item=>item.level==='county'&&item.elected===true&&item.county===r.county&&item.name===r.name&&item.party===r.party);
 }
 function appendResultMark(cell,r){
  if(!isOfficialWinner(r))return;
  const mark=document.createElement('img');
  mark.src='assets/elected-mark.png';mark.alt='当选';mark.width=18;mark.height=18;
  cell.append(mark);
 }

 function incumbentLabel(r){return r.incumbent===true?'现任':r.incumbent===false?'非现任':'—'}
 let resultPage=0;
 function candidateKey(r){return presidentialMode?['president',presidentialYear,r.number,r.name].join('|'):[r.county,r.electorate,r.district,kind==='township'?r.town:'',r.number,r.name].join('|')}
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
  if(presidentialMode&&presidentialGeometry)return(scale==='town'?presidentialGeometry.towns:presidentialGeometry.counties).filter(f=>!county||f.county===county);
  if(historyOverview())return kind==='township'?data.towns:data.counties;
  if(kind==='council'){ensureHistoryGeometry();return historicalFeatures.filter(f=>(!county||f.county===county)&&(electorate==='all'||f.electorate===electorate))}
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
  const titleEyebrow=el('historyResultSection')?.querySelector('.eyebrow');
  if(titleEyebrow)titleEyebrow.textContent=yearLabel()+' 历史数据';
  if(el('historyWorkspaceTitle'))el('historyWorkspaceTitle').textContent=yearLabel()+' '+officeTitle()+'选举结果';
  if(el('historyBoundaryNote'))el('historyBoundaryNote').hidden=!presidentialMode;
  el('historyCounty').value=county;el('historyScaleBox').hidden=kind!=='mayor';el('historyScale').value=scale;
  if(el('historyElectorateBox'))el('historyElectorateBox').hidden=kind!=='council';if(el('historyElectorate'))el('historyElectorate').value=electorate;
  const metrics=[['party',kind==='council'?'当选席次':presidentialMode?(scale==='town'?'各乡镇市区最高票候选人所属政党':'各县市最高票候选人所属政党'):mayorTownView()?'各乡镇市区最高票候选人':'当选结果']];
  if(kind==='council')metrics.push(['seats','指定政党席次']);
  if(kind!=='council'||county)metrics.push(['share','得票率'],['votes','得票数']);
  if(!metrics.some(([id])=>id===metric))metric='party';
  const parties=[...new Set(db.council.filter(r=>r.level==='district'&&r.elected).map(r=>r.party))].sort();
  if(!parties.includes(selectedParty))selectedParty=parties[0]||'';
  el('historyPartyBox').hidden=metric!=='seats';
  el('historyParty').replaceChildren(...parties.map(p=>new Option(p,p)));el('historyParty').value=selectedParty;
  const select=el('historyMetric');select.replaceChildren(...metrics.map(([v,l])=>new Option(l,v)));select.value=metric;
   el('historyCandidateScopeBox').hidden=!voteMetric();el('historyCandidateScope').value=candidateScope;
  el('historyCandidateBox').hidden=!voteMetric()||candidateScope!=='candidate';
  if(!voteMetric()||candidateScope!=='candidate')return;
  const choices=new Map();for(const r of recordsInView())choices.set(candidateKey(r),r);
  if(!choices.has(selectedCandidate))selectedCandidate=choices.keys().next().value||'';
  el('historyCandidate').replaceChildren(...[...choices].map(([id,r])=>new Option((presidentialMode?'':r.county+' · ')+displayedCandidateName(r)+' · '+r.party,id)));el('historyCandidate').value=selectedCandidate;
 }
 function openHistoryRegion(f){
  lastOpenedFeature=f;
  const key=featureKey(f),rows=currentResult?.rows.filter(r=>areaKey(r)===key)||[];
  el('historyDialogTitle').textContent=(f.county===f.name?f.name:f.county+' · '+f.name)+' · '+yearLabel()+' '+(presidentialMode?'台湾地区领导人':kind==='mayor'&&f.county.endsWith('市')?'市长':titles[kind])+'选举结果';
  const body=el('historyDialogRows'),table=body.closest('table'),wrap=table.parentElement;
  const hiddenColumns=new Set();
  // Display both offices' verified genders for presidential tickets.
  if(table.tHead.rows[0]?.cells[2])table.tHead.rows[0].cells[2].textContent=presidentialMode?'性别（正/副）':'性别';
  // Show both columns, including on narrow screens; retain dash fallback if needed.
  [...table.tHead.rows[0].cells].forEach((cell,i)=>{cell.hidden=hiddenColumns.has(i)});
  wrap.hidden=!rows.length;
  const missing=el('historyDialogMissing');
  missing.hidden=!rows.length||!hiddenColumns.size;
  missing.textContent='本选区历史资料缺少'+[...hiddenColumns].map(i=>table.tHead.rows[0].cells[i].textContent).join('、')+'字段。';
  body.replaceChildren();
  for(const r of [...rows].sort((a,b)=>b.votes-a.votes)){
   const tr=document.createElement('tr');
   if(isOfficialWinner(r))tr.className='history-elected-row';
   for(const [i,value] of [r.number||'—',displayedCandidateName(r),displayedGender(r),incumbentLabel(r),r.party,r.votes.toLocaleString('zh-CN'),(r._share||0).toFixed(2)+'%',''].entries()){
    if(hiddenColumns.has(i))continue;
    const td=document.createElement('td');
    const logo=i===4?logoFor(predictionParty(r.party)):'';
    if(logo){const img=document.createElement('img');img.src=logo;img.alt='';const party=document.createElement('span');party.className='history-party-cell';party.append(img,value);td.append(party)}
    if(i===7)appendResultMark(td,r);else if(!logo)td.append(value);tr.append(td);
   }
   body.append(tr);
  }
  const district=historicalDistrictFor(f);
  el('historyDialogMessage').textContent=!rows.length?(noElection(f)?'2022年本区域不举行乡镇市区长选举。':'暂无该层级的历史数据。'):district?
   '应选 '+district.seats+' 席 · 妇保 '+district.womenReserved+' 席 · 有效票 '+rows.reduce((n,r)=>n+r.votes,0).toLocaleString('zh-CN'):
   (mayorTownView()?'本地区得票':presidentialMode?'当地候选人得票与全台当选标记':'2022年得票与当选结果');
  if(rows.length)el('historyDialogMessage').append(' · '+rows.length+' 位候选人 · 按得票数排序');
  if(f.historicalBoundaryNote)el('historyDialogMessage').append(' · '+f.historicalBoundaryNote);
  if(kind==='mayor'&&f.county==='嘉义市')el('historyDialogMessage').append(' · 2022年12月18日重行投票');
  const dialog=el('historyResultDialog'),hint=el('historyDialogScroll');
  const overviewButton=el('historyDialogOverview');
  if(overviewButton){
   overviewButton.hidden=!window.HistoryWorkspace?.openFeatureOverview;
   overviewButton.textContent=kind==='council'?'查看本议员选区概况':
    f.county===f.name?'查看本县市概况':'查看本乡镇市区概况';
   overviewButton.onclick=()=>{dialog.close();window.HistoryWorkspace?.openFeatureOverview?.(f)};
  }
  hint.hidden=true;dialog.showModal();
  wrap.scrollLeft=0;wrap.scrollTop=0;
  hint.hidden=wrap.scrollWidth<=wrap.clientWidth;
  el('historyDialogDrilldown').hidden=!(kind==='mayor'&&scale==='district');el('historyDialogBack').hidden=!county;
 }
 function openContestById(contestId,summary){
  if(!summary)return;lastOpenedFeature=null;const contest=summary.contest,rows=summary.candidacies,body=el('historyDialogRows');el('historyDialogTitle').textContent=contest.county_name+' · '+contest.district_name+' · '+yearLabel()+' '+officeTitle()+'选举结果';el('historyDialogMessage').textContent='有效票 '+summary.validVotes.toLocaleString('zh-CN')+' · '+rows.length+' 位候选人 · 按得票数排序';body.replaceChildren();
  for(const r of rows){const tr=document.createElement('tr');if(r.elected_official)tr.className='history-elected-row';for(const [i,value] of [r.ballot_number||'—',r.candidate_name,r.gender||'—',r.incumbent_at_election===true?'现任':r.incumbent_at_election===false?'非现任':'—',r.party_name,r.votes.toLocaleString('zh-CN'),Number(r.vote_share||0).toFixed(2)+'%',''].entries()){const td=document.createElement('td');if(i===7&&r.elected_official){const mark=document.createElement('img');mark.src='assets/elected-mark.png';mark.alt='当选';mark.width=18;mark.height=18;td.append(mark)}else td.textContent=value;tr.append(td)}body.append(tr)}
  const overviewButton=el('historyDialogOverview');
  if(overviewButton){overviewButton.hidden=false;overviewButton.textContent='查看本选区概况';
   overviewButton.onclick=()=>{el('historyResultDialog').close();window.HistoryWorkspace?.openContestOverview?.(contestId)};}
  el('historyDialogDrilldown').hidden=true;el('historyDialogBack').hidden=!county;el('historyResultDialog').showModal();
 }
 function exportRows(){
  const result=currentResult;
  if(!state.exportSettings.winnerTable||!result||(metric==='seats'&&state.exportSettings.candidateScope!=='all')||(historyOverview()&&kind==='mayor'))return [];
  const showAll=state.exportSettings.candidateScope==='all';
  // A town-level mayor map shows local vote distributions; the office is
  // elected county-wide. Use the county-wide result for elected-only tables
  // instead of misleadingly showing one township's tally as the winner total.
  const countyWinner=kind==='mayor'&&!presidentialMode&&mayorTownView()&&!showAll;
  const records=(countyWinner?db.mayor.filter(r=>r.level==='county'&&(!county||r.county===county)):recordsInView())
   .filter(r=>!exportPanelFilter||kind!=='council'||r.electorate===exportPanelFilter);
  const totals=new Map();
  if(countyWinner)for(const row of records)totals.set(row.county,(totals.get(row.county)||0)+row.votes);
  const ordered=(showAll?records:records.filter(isOfficialWinner));
  ordered.sort((a,b)=>HistoryCore.compareResultRows(a,b,kind));
  return ordered.map(r=>{
   const party=predictionParty(r.party);
   const scope=[r.county,r.town||r.district].filter(Boolean).filter((name,i,items)=>items.indexOf(name)===i).join(' · ');
   const share=countyWinner?(totals.get(r.county)?r.votes/totals.get(r.county)*100:0):(r._share||0);
   return {historical:true,presidentialTicket:presidentialMode,estimated:true,district:scope,
    number:r.number,name:displayedCandidateName(r),gender:displayedGender(r),incumbent:r.incumbent===true?'现任':'',party:r.party,color:party.color,logo:logoFor(party),
    votes:r.votes.toLocaleString('zh-CN'),share:share.toFixed(2)+'%',elected:isOfficialWinner(r),allCandidates:showAll};
  });
 }
 function featurePresentation(feature){
  const region=kind==='council'&&historyOverview()?{partyCounts:currentResult?.countySeats.get(feature.county)||new Map()}:currentResult?.regions.get(featureKey(feature));
  if(window.HistoryWorkspace?.featurePresentation)return window.HistoryWorkspace.featurePresentation({office:presidentialMode?'president':kind,level:mayorTownView()?'town':kind==='council'?'district':kind==='township'?'town':'county',metric,region,partyColor});
  return{fill:kind==='council'?'#f0f3ed':'#edf1e9',badgeItems:[],tooltip:'暂无该层级数据',ariaLabel:'暂无该层级数据'};
 }
 function exportMetadata(){const election=snapshotData?.elections?.find(item=>item.office===(presidentialMode?'president':kind))||snapshotData?.elections?.[0];return['资料来源：'+mainlandTerms(election?.source_name||'台湾地区选举事务主管机构公开资料')+'（经 taiwanvotes.tw 整理）','行政区边界版本：'+(election?.boundary_version||'2022'),'历史数据架构版本：'+(snapshotData?.schemaVersion||2)]}
 window.History2022View={metricLabel,exportRows,exportMetadata,featurePresentation,active:()=>active,activate,deactivate,kind:()=>kind,office:()=>presidentialMode?'president':kind,year:()=>presidentialMode?presidentialYear:2022,overview:historyOverview,seatMode:historyCouncilSeats,items:historyItems,noElection,districtFor:historicalDistrictFor,seatRows:historicalSeatRows,historicTownFeatures:()=>presidentialMode?presidentialGeometry?.towns||[]:null,openRegion:openHistoryRegion,openContest:openContestById,features:()=>historicalFeatures,snapshot:()=>snapshotData};
 const resultSection=el('historyResultSection')||(()=>{const section=document.createElement('section');section.id='historyResultSection';section.hidden=true;section.className='history-result-section';const heading=document.createElement('h3');heading.textContent='2022 选举结果';section.append(heading,el('historySummary'),el('historySearchTools'),el('historyResults'),el('historyPager'),el('historyCompare'));el('districtReference').before(section);return section})();
 if(!el('historyResultParty')){const partyLabel=document.createElement('label');partyLabel.className='label';partyLabel.htmlFor='historyResultParty';partyLabel.textContent='筛选政党';const partySelect=document.createElement('select');partySelect.id='historyResultParty';partySelect.append(new Option('全部政党',''));el('historySearchTools').append(partyLabel,partySelect)}
 const dialogNav=document.createElement('div');dialogNav.className='history-dialog-navigation';const dialogBack=document.createElement('button');dialogBack.type='button';dialogBack.id='historyDialogBack';dialogBack.className='button quiet';dialogBack.textContent='返回上一级';const dialogDrilldown=document.createElement('button');dialogDrilldown.type='button';dialogDrilldown.id='historyDialogDrilldown';dialogDrilldown.className='button primary';dialogDrilldown.textContent='查看乡镇市区得票分布';dialogNav.append(dialogBack,dialogDrilldown);el('historyResultDialog').append(dialogNav);
 dialogDrilldown.onclick=()=>{if(!lastOpenedFeature||kind!=='mayor')return;county=lastOpenedFeature.county;scale='town';el('historyCounty').value=county;el('historyScale').value=scale;el('historyResultDialog').close();switchMode();render()};
 dialogBack.onclick=()=>{county='';if(kind==='mayor')scale='district';el('historyCounty').value='';el('historyScale').value=scale;el('historyResultDialog').close();switchMode();render()};
 const historyTableWrap=el('historyDialogRows').closest('.history-table-wrap');
 new ResizeObserver(()=>{
  el('historyDialogScroll').hidden=historyTableWrap.scrollWidth<=historyTableWrap.clientWidth;
 }).observe(historyTableWrap);
 el('closeHistoryResult').onclick=()=>el('historyResultDialog').close();
 for(const id of ['workspacePrediction','workspaceFree'])el(id).addEventListener('click',()=>{if(active)deactivate()},{capture:true});
 el('historyOffice').onchange=()=>{
  const selected=el('historyOffice').value;
  const year=updateYearOptions(selected);
  if(selected==='president'){activatePresidential(year);return}
  restoreStandardElection(selected);
 };
 el('historyYear').onchange=()=>{
  if(el('historyOffice').value==='president')activatePresidential(Number(el('historyYear').value));
 };
 if(el('historyElectorate'))el('historyElectorate').onchange=()=>{electorate=el('historyElectorate').value;resultPage=0;switchMode();render()};
 el('historyCounty').onchange=()=>{county=el('historyCounty').value;resultPage=0;switchMode();render()};
 el('historyMetric').onchange=()=>{metric=el('historyMetric').value;render()};
 el('historyParty').onchange=()=>{selectedParty=el('historyParty').value;render()};
 el('historySearch').oninput=()=>{resultPage=0;if(currentResult)showRows(currentResult)};
 if(el('historyResultParty'))el('historyResultParty').onchange=()=>{resultPage=0;if(currentResult)showRows(currentResult)};
 el('historyPrev').onclick=()=>{resultPage--;showRows(currentResult)};
 el('historyNext').onclick=()=>{resultPage++;showRows(currentResult)};
 if(el('historyRetry'))el('historyRetry').onclick=()=>{if(el('historyOffice').value==='president'){activatePresidential(Number(el('historyYear').value));return}loaded=false;snapshot().then(success=>{if(active&&success)render()})};
 el('historyFromPrediction').onclick=()=>{
  if(!window.HistoryAccess?.canAccess()){window.HistoryAccess?.notice();return}
  if(presidentialMode)restoreStandardElection(state.predictionOffice);
  kind=state.predictionOffice;county=state.county;scale=kind==='mayor'&&state.predictionScale!=='district'?'town':'district';
  metric='party';candidateScope='top';selectedCandidate='';resultPage=0;el('historyOffice').value=kind;
  el('categoryHistory').click();
 };
 el('historyScale').onchange=()=>{scale=el('historyScale').value;switchMode();render()};
 el('historyCandidateScope').onchange=()=>{candidateScope=el('historyCandidateScope').value;render()};
 el('historyCandidate').onchange=()=>{selectedCandidate=el('historyCandidate').value;render()};
 for(const n of COUNTY_ORDER)el('historyCounty').add(new Option(n,n));
 const defaultDistrictSearch=el('districtTableSearch').oninput;
 el('districtTableSearch').oninput=event=>{if(active&&kind==='council')renderHistoryDistrictReference();else defaultDistrictSearch?.(event)};
 const defaultDistrictDownload=el('downloadDistrictTable').onclick;
 el('downloadDistrictTable').onclick=event=>{if(!active||kind!=='council')return defaultDistrictDownload?.(event);const lines=[['县市','选区','类别','选区范围','应选名额','妇保名额','地图匹配'],...districtMetadata.filter(d=>(!county||norm(d.county)===county)).map(d=>[norm(d.county),d.name,DistrictCore.identityName(d),mainlandTerms(norm(d.scope)),d.seats,d.womenReserved,unmatchedDistricts.has(norm(d.county)+'|'+d.electorate+'|'+d.number)?'未匹配':'已匹配'])];const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='2022议员选区范围与名额.csv';a.click();URL.revokeObjectURL(url)};
 const formerReturn=el('returnTaiwanMap').onclick;el('returnTaiwanMap').onclick=()=>{if(!active)return formerReturn();county='';el('historyCounty').value='';switchMode();render()};
 const defaultColor=fillColor;fillColor=function(feature){
  if(!active)return defaultColor(feature);
  if(metric==='seats'&&currentResult){
   const counts=county?currentResult.regions.get(featureKey(feature))?.partyCounts:currentResult.countySeats.get(feature.county);
   if(!counts)return '#edf1e9';
   const seats=counts.get(selectedParty)||0;return seats?tone(partyColor(selectedParty),seats,currentResult.seatRange):'#fff';
  }
  if(kind==='council'&&metric==='party')return featurePresentation(feature).fill;
  if(noElection(feature))return '#ffffff';
  const region=currentResult?.regions.get(featureKey(feature));
  return !region?'#edf1e9':!voteMetric()&&region.tie?'#aebdb4':region.party?tone(partyColor(region.party),metric==='votes'?region.top?.votes||0:region.share,currentResult.range):'#edf1e9';
 };
 const defaultDetail=regionDetail;regionDetail=function(feature){if(!active)return defaultDetail(feature);if(metric==='seats'){const counts=county?currentResult?.regions.get(featureKey(feature))?.partyCounts:currentResult?.countySeats.get(feature.county);return counts?selectedParty+' · '+(counts.get(selectedParty)||0)+'席':'暂无该层级数据'}if(kind==='council'&&metric==='party')return featurePresentation(feature).tooltip;if(historyOverview()){return '点击查看'+feature.county+'2022年结果'}if(noElection(feature))return '2022年本区域不举行乡镇市区长选举';const region=currentResult?.regions.get(featureKey(feature));if(voteMetric())return region?.top?region.top.name+' · '+(metric==='votes'?region.top.votes.toLocaleString('zh-CN')+'票 · '+region.share.toFixed(2)+'%':region.share.toFixed(2)+'% · '+region.top.votes.toLocaleString('zh-CN')+'票'):'暂无该候选人得票数据';if(areaLeading())return region?.top?region.top.name+' · 得票领先 · '+region.top.votes.toLocaleString('zh-CN')+'票 · '+region.share.toFixed(2)+'%'+(feature.historicalBoundaryNote?' · '+feature.historicalBoundaryNote:''):'暂无本地区得票资料';return !region?'历史数据未匹配':region.tie?'各党当选席次并列':region.party+' · '+region.seatCount+'席'};
 const defaultPushHistory=pushHistory;pushHistory=function(){if(!active)return defaultPushHistory()};
 const defaultPaint=paint;paint=function(feature){if(!active)return defaultPaint(feature);if(historyOverview()){county=feature.county||feature.name;el('historyCounty').value=county;switchMode();render()}else openHistoryRegion(feature)};
 const defaultSaveState=projectStateForSave;projectStateForSave=function(){return active&&savedMapScope?savedMapScope:defaultSaveState()};
 const defaultRender=render;render=function(){if(active&&data){delete el('legend').dataset.historyBox;syncHistoryControls();currentResult=analyze()}defaultRender();if(active){update();for(const id of ['workspacePrediction','workspaceFree']){el(id).classList.remove('active');el(id).setAttribute('aria-pressed','false')}}};
 function showComparison(result){
  const root=el('historyCompare');
  root.hidden=presidentialMode||mayorTownView()||historyOverview()&&kind==='mayor';
  if(root.hidden)return;
  const parties=new Map(),districts=[...directoryDistrictById.values()].filter(d=>d.type===kind&&(!county||d.county===county));
  let completed=0;
  for(const d of districts){
   const winners=savedMapScope?.predictions[d.id]?.winners||[];
   const selected=directoryCandidates(d).filter(c=>winners.includes(c.id));
   if(selected.length===d.seats)completed++;
   for(const c of selected){const p=normalizeParty(c.party);parties.set(p,(parties.get(p)||0)+1)}
  }
  el('historyCompareStatus').textContent='2026 已选齐 '+completed+' / '+districts.length+' 个选区。'+(kind==='council'?'两个年份按当前县市范围汇总，选区范围和席次数可能有变动。':'两个年份按当前地图范围汇总。');
  const body=el('historyCompareRows');body.replaceChildren();
  for(const party of new Set([...result.partySeats.keys(),...parties.keys()])){
   const tr=document.createElement('tr');
   for(const value of [party,result.partySeats.get(party)||0,parties.size?(parties.get(party)||0):'—']){
    const td=document.createElement('td');td.textContent=value;tr.append(td);
   }
   body.append(tr);
  }
 }
 const defaultLegendBox=legendBox;legendBox=function(spec){
  const historyBox=active&&el('legend')?.dataset.historyBox;
  if(historyBox&&state.legend.show){const [x,y,width,height]=historyBox.split(',').map(Number);return{x,y,width,height}}
  return defaultLegendBox(spec);
 };
 const defaultFooter=furnitureFooterHeight;furnitureFooterHeight=function(){
  if(!active||!currentResult||!state.legend.show)return defaultFooter();
  return Math.max(defaultFooter(),legendHeight(currentResult)+50);
 };
 const defaultPreparedExport=preparedExportSvg;preparedExportSvg=function(){
  if(!active)return defaultPreparedExport();
  if(!recordsInView().length)throw Error('当前范围尚未载入'+yearLabel()+'历史得票数据，无法导出地图');
  const oldTitle=state.title;state.title=yearLabel()+' '+officeTitle()+'选举结果 · '+(county||'全台');
  try{return defaultPreparedExport()}finally{state.title=oldTitle}
 };
})();
