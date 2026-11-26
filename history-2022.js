'use strict';
/* 2022 election history. Source: CEC open data, assembled by taiwanvotes.tw. */
(()=>{
 const el=id=>document.getElementById(id), db={mayor:[],council:[],township:[],legislative:[]},titles={mayor:'县市长',council:'县市议员',township:'乡镇市区长',legislative:'立法机构民代'};
 let selectedParty='', active=false,kind='mayor',electorate='all',county='',metric='party',scale='district',candidateScope='top',selectedCandidate='',historicalFeatures=[],hsinchuGeometry=null,loaded=false,loading=null,lastResult=[],savedMapScope=null,unmatchedDistricts=new Set(),districtMetadata=[],currentResult=null,snapshotData=null,lastOpenedFeature=null;
 let routeDetail=null;
 let presidentialMode=false,presidentialYear=2024,presidentialGeometry=null;
 let legislativeMode=false,legislativeYear=2024,legislativeBallot='regional',legislativeGeometry=[],legislativeAreaGeometry=null,legislativeFocus='';
 let history2022Snapshot=null,loadingPresidentialId=0,localGeometry=null;
 let localYear=2022,history2026Manifest=null,history2026Snapshot=null,original2022DistrictMetadata=[];
 const yearLabel=()=>presidentialMode?String(presidentialYear):legislativeMode?String(legislativeYear):HistoryLocal.yearLabel(localYear,kind);
 // Use the source contest's actual polling year for a local result, not its display cycle.
 function contestYear(contest){
  return contest?.election_date?.match(/^\d{4}/)?.[0]||
   String(snapshotData?.elections?.find(e=>e.election_id===contest?.election_id)?.year||'')||yearLabel();
 }
 function localContest(f,district){
  if(!snapshotData?.cycleYears&&!partialTownship())return null;
  const contests=snapshotData.contests;
  if(district)return contests.find(c=>c.contest_id===district.id);
  const ids=new Set(snapshotData.elections.filter(e=>e.office===kind).map(e=>e.election_id));
  return contests.find(c=>ids.has(c.election_id)&&c.county_name===f.county&&
   (kind==='mayor'||kind==='township'&&c.district_name===f.name||
    kind==='council'&&HistoryCore.identity(c.electorate)===HistoryCore.identity(f.electorate)&&
    HistoryCore.districtNumber(c.district_name)===HistoryCore.districtNumber(f.name)));
 }
 function localResultYear(f,district){return contestYear(localContest(f,district))}
 const archivedCouncil=()=>!legislativeMode&&!presidentialMode&&kind==='council'&&localYear===1994;
 const partialTownship=()=>!legislativeMode&&!presidentialMode&&kind==='township'&&
  snapshotData?.elections?.some(e=>e.office==='township'&&e.coverage==='partial');
 const officeTitle=()=>presidentialMode?'台湾地区领导人':titles[kind];
 function appendContestSource(contest){
  if(!contest?.source_url)return;
  const source=document.createElement('a');
  source.href=contest.source_url;source.target='_blank';source.rel='noopener';
  source.textContent='资料来源 ↗';el('historyDialogMessage').append(' · ',source);
  if(contest.profile_source){
   const profile=source.cloneNode();
   profile.href=contest.profile_source;profile.textContent='投开票统计 ↗';
   el('historyDialogMessage').append(' · ',profile);
  }
 }
 const regionalLegislativeTownView=()=>legislativeMode&&legislativeBallot==='regional'&&scale==='town';
 const areaLeading=()=>presidentialMode||legislativeMode&&(legislativeBallot!=='regional'||regionalLegislativeTownView())||mayorTownView();
 const norm=x=>simplify(String(x||'')).trim();
 const protectedCandidateNames=new Set(['魏耀乾','李乾龙','陈民乾','米甘幹．理佛克']);
 const normCandidate=x=>{
  const name=String(x||'').trim();
  return protectedCandidateNames.has(name)?name:name.split('乾').map(simplify).join('乾');
 };
 const normalizeParty=name=>{let s=norm(name||'无党籍');if(s.includes('无党籍及未经政党推荐')||s==='无党籍及未经政党推薦')s='无党籍';return s};
 const partyColor=p=>predictionParty(p).color;
 // Different presidential candidate tickets share the “连署” nomination
 // label in 1996/2000; use distinct visualization-only colors for them.
 const independentTicketColors={
  1996:{'林洋港':'#815F9D','陈履安':'#577B91'},
  2000:{'宋楚瑜':'#815F9D','许信良':'#B46A52'}
 };
 const ticketMapColor=(party,candidate='')=>presidentialMode&&party==='连署'?
  independentTicketColors[presidentialYear]?.[candidate]||partyColor(party):partyColor(party);
 // Use the exact high-contrast nonlinear palette of the 2026 election view.
 const tone=(color,value,range)=>metric==='party'?color:ElectionCore.shade(color,value,range.min,range.max);
 const electionKey=r=>[r.type,r.electorate,r.level,r.county,r.town,r.village,r.district,r.number,r.name].join('|');
 const dbIds=new Set();
 const addRows=rows=>{let added=0;for(const src of rows){
  if(!['mayor','council','township','legislative'].includes(src.type))continue;
  const r={type:src.type,electorate:HistoryCore.identity(src.electorate),level:src.level||'raw',county:norm(src.county),town:norm(src.town),village:norm(src.village),district:norm(src.district),number:String(src.number||''),name:normCandidate(src.name),gender:norm(src.gender),deputyName:norm(src.deputy_name),deputyGender:norm(src.deputy_gender),incumbent:src.incumbent,party:normalizeParty(src.party),votes:Number(src.votes),elected:src.elected===true||src.elected==='true'};
  if(!r.county||!r.name||!Number.isFinite(r.votes)||r.votes<0)continue;
  const key=electionKey(r);if(dbIds.has(key))continue;dbIds.add(key);db[r.type].push(r);added++;
 }return added};
 async function snapshot(){
  if(loaded)return true;
  if(loading)return loading;
  loading=(async()=>{
   if(el('historyLoadStatus')){el('historyLoadStatus').hidden=false;el('historyLoadStatus').textContent='正在载入 2022 年历史选举数据…'};if(el('historyRetry'))el('historyRetry').hidden=true;
   try{
    const [resp,metaResp,geoResp]=await Promise.all([fetch('assets/history-2022.json?v=20261115-chiayi-rerun-v3',{cache:'default'}),fetch('assets/history-council-districts-2022.json?v=20261031-districts-v2',{cache:'default'}),fetch('assets/history-hsinchu-geography-2022.json?v=20261103-history-v103')]);
    if(!resp.ok)throw Error('历史投票数据 HTTP '+resp.status);if(!metaResp.ok)throw Error('2022议员选区资料 HTTP '+metaResp.status);
    const raw=await resp.json(),meta=await metaResp.json();
    if(meta.year!==2022||meta.districtCount!==215||!Array.isArray(meta.rows)||meta.rows.reduce((n,x)=>n+x.seats,0)!==910)throw Error('2022议员选区资料未通过完整性核验');
    const obj=HistoryLocal.correctElectionDates(HistoryLocal.reconcile2022Council(raw,meta,norm));
    districtMetadata=meta.rows.map(d=>({...d,county:norm(d.county),name:norm(d.name),scope:norm(d.scope),scopeTowns:d.scopeTowns.map(norm),electorate:HistoryCore.identity(d.electorate)}));original2022DistrictMetadata=districtMetadata.slice();if(!geoResp.ok)throw Error('2022新竹市地图载入失败');hsinchuGeometry=await geoResp.json();if(hsinchuGeometry.year!==2022||hsinchuGeometry.features?.length!==5)throw Error('2022新竹市选区范围不完整');
    if(obj.schemaVersion!==2||obj.year!==2022||!Array.isArray(obj.rows)||obj.rows.length<8000)throw Error('历史快照内容不完整或版本不兼容');
    history2022Snapshot=obj;
    if(!snapshotData){addRows(obj.rows);snapshotData=obj;window.dispatchEvent(new CustomEvent('historysnapshotready',{detail:{snapshot:obj}}))}
    loaded=true;
    if(el('historyLoadStatus')){el('historyLoadStatus').textContent='';el('historyLoadStatus').hidden=true}return true
   }catch(error){
    if(el('historyLoadStatus')){el('historyLoadStatus').hidden=false;el('historyLoadStatus').textContent='历史数据暂时未能载入：'+error.message};if(el('historyRetry'))el('historyRetry').hidden=false;toast('2022 历史数据载入失败：'+error.message);return false
   }finally{loading=null}
  })();
  return loading
 }

 function updateYearOptions(office=el('historyOffice').value){
  const years=office==='president'?HistoryPresidential.YEARS:office==='legislative'?HistoryLegislative.YEARS:HistoryLocal.years(office,history2026Manifest?.status==='published'),select=el('historyYear');
  const requested=HistoryLocal.cycleYear(Number(select.value),office);
  const chosen=years.includes(requested)?requested:(office==='president'||office==='legislative'?2024:years.includes(localYear)?localYear:2022);
  if(select.options.length!==years.length||years.some((year,i)=>Number(select.options[i]?.value)!==year)){
   select.replaceChildren(...years.map(year=>new Option(HistoryLocal.yearLabel(year,office),String(year))));
  }
  for(const option of select.options){
   const label=HistoryLocal.yearLabel(Number(option.value),office);
   if(option.textContent!==label)option.textContent=label;
  }
  select.value=String(chosen);
  return chosen;
 }

 function year2026DistrictMetadata(){
  return (candidateDatabase?.districts||[]).filter(d=>d.type==='council').map(d=>({
   ...d,county:norm(d.county),name:norm(d.name),scope:norm(d.scope),
   scopeTowns:[],number:Number(d.number||HistoryCore.districtNumber(d.name)||d.id.split(':').at(-1)),
   electorate:HistoryCore.identity(d.electorate)
  }));
 }
 async function check2026Availability(){
  try{
   const response=await fetch('assets/history-2026-availability.json?v=20261116-polling-gate',{cache:'no-store'});
   if(!response.ok)return;
   const manifest=await response.json();
   if(manifest.schemaVersion!==1||manifest.year!==2026||manifest.status!=='published')return;
   if(!/^[0-9a-f]{64}$/i.test(manifest.sha256||'')||manifest.candidateCount!==candidateDatabase?.candidates.length||manifest.districtCount!==candidateDatabase?.districts.length)return;
   history2026Manifest=manifest;
   window.HISTORY_2026_RESULTS_AVAILABLE=true;
   if(!['president','legislative'].includes(el('historyOffice').value))updateYearOptions();
   window.HistoryWorkspace?.render?.();
  }catch(error){console.warn('2026结果发布状态暂不可用',error.message)}
 }
 function showLocalSnapshot(shard,office,geometry=null){
  presidentialMode=false;presidentialGeometry=null;legislativeMode=false;
  legislativeAreaGeometry=null;legislativeFocus='';
  localYear=shard.year;localGeometry=geometry;kind=office;
  if(!['district','town'].includes(scale))scale='district';
  for(const type of ['mayor','council','township'])db[type].length=0;
  dbIds.clear();addRows(shard.rows);
  snapshotData=shard;
  const districts=geometry?HistoryLocal.councilMap(shard,geometry,HistoryCore.mergePaths):null;
  districtMetadata=districts?.districts||(localYear===2026?year2026DistrictMetadata():original2022DistrictMetadata.slice());
  historicalFeatures=districts?.features||[];
  const electionIds=new Set(shard.elections.filter(item=>item.office===office).map(item=>item.election_id));
  const counties=geometry?shard.contests.filter(c=>electionIds.has(c.election_id)).map(c=>c.county_name):COUNTY_ORDER;
  updateHistoricCounties(counties);
  candidateScope='top';selectedCandidate='';resultPage=0;
  el('historyYear').value=String(localYear);
  switchMode();window.dispatchEvent(new CustomEvent('historysnapshotready',{detail:{snapshot:shard}}));render();
 }
 async function activateLocalYear(year,office=el('historyOffice').value){
  if(!active)return;
  const token=++loadingPresidentialId,indicator=el('historyLoadStatus');
  if(year!==2026){
   const label=HistoryLocal.yearLabel(year,office);
   indicator.hidden=false;indicator.textContent='正在载入 '+label+' 年地方选举结果…';el('historyRetry').hidden=true;
   try{
    if(year===2022){
     if(!await snapshot())throw Error('2022 年资料暂时不可用');
     if(token!==loadingPresidentialId||!active)return;
     showLocalSnapshot(history2022Snapshot,office);
    }else{
     const [shard,reference]=await Promise.all([HistoryLocal.loadCycle(year,office),year<=2010?HistoryPresidential.load(2008):null]);
     if(token!==loadingPresidentialId||!active)return;
     const geometry=HistoryLocal.geometry(shard,data,reference,norm,HistoryCore.mergePaths,HistoryPresidential.modernCounty,HistoryPresidential.baseTown);
     if(!shard.elections.some(e=>e.office===office))throw Error('当年没有这类选举');
     showLocalSnapshot(shard,office,geometry);
    }
    indicator.hidden=true;indicator.textContent='';
   }catch(error){
    if(token!==loadingPresidentialId)return;
    indicator.hidden=false;indicator.textContent=label+' 年地方选举结果载入失败：'+error.message;
    el('historyRetry').hidden=false;
   }
   return;
  }
  if(history2026Manifest?.status!=='published'){
   el('historyYear').value=String(localYear);
   toast('2026年正式得票尚未发布');return;
  }
  indicator.hidden=false;indicator.textContent='正在核对2026年正式结果数据…';
  try{
   await snapshot();
   if(!history2026Snapshot){
    const response=await fetch('assets/history-2026.json?v='+history2026Manifest.sha256.slice(0,14));
    if(!response.ok)throw Error('2026官方结果 HTTP '+response.status);
    const shard=await response.json();
    if(shard.schemaVersion!==2||shard.year!==2026||shard.completeness!=='full'||
       shard.contests?.length!==history2026Manifest.districtCount||shard.candidacies?.length!==history2026Manifest.candidateCount||
       !Array.isArray(shard.rows)||shard.rows.length<history2026Manifest.candidateCount||
       !['provisional','certified'].includes(shard.publicationStatus))
       throw Error('2026选举结果缺少完整的官方选区、候选人或得票明细');
    history2026Snapshot=shard;
   }
   if(token!==loadingPresidentialId||!active||['president','legislative'].includes(el('historyOffice').value))return;
   showLocalSnapshot(history2026Snapshot,office);
   indicator.hidden=true;indicator.textContent='';
  }catch(error){
   if(token!==loadingPresidentialId)return;
   indicator.hidden=false;indicator.textContent='2026年官方结果载入失败：'+error.message;
   el('historyRetry').hidden=false;el('historyYear').value=String(localYear);
  }
 }
 check2026Availability();

 function updateHistoricCounties(counties){
  const list=el('historyCounty'),previous=county;
  const ordered=[...new Set(counties)].sort((a,b)=>
   HistoryCore.compareResultRows({county_name:a},{county_name:b},'mayor'));
  list.replaceChildren(new Option('全部地区（含金门、马祖）',''),...ordered.map(c=>new Option(c,c)));
  county=ordered.includes(previous)?previous:'';
  list.value=county;
 }

 async function activateLegislative(year){
  year=Number(year);if(!HistoryLegislative.YEARS.includes(year))year=2024;
  const requestId=++loadingPresidentialId,indicator=el('historyLoadStatus');
  indicator.hidden=false;indicator.textContent='正在载入 '+year+' 年立法机构民代选举结果…';el('historyRetry').hidden=true;
  try{
   const [shard,ready,geometryReference,regionalMap,kaohsiungVillages]=await Promise.all([
    HistoryLegislative.load(year),snapshot(),
    year===1992?HistoryLegislative.load(1995):Promise.resolve(null),
    year>=2008?HistoryLegislative.loadMap():Promise.resolve(null),
    HistoryLegislative.loadKaohsiungVillages(year),
    // Profile failures must not prevent browsing valid election results.
    HistoryLegislativeTurnout.load(year).catch(error=>{console.warn('历史投票统计暂未载入',error.message);return null})
   ]);
   if(!ready)throw Error('历史工作台暂时不可用');
   if(requestId!==loadingPresidentialId||!active||el('historyOffice').value!=='legislative')return;
   db.legislative.length=0;dbIds.clear();addRows(shard.rows);
   const wasLegislative=legislativeMode;
    legislativeMode=true;presidentialMode=false;legislativeYear=year;kind='legislative';snapshotData=shard;
    if(!wasLegislative||!['county','district','town'].includes(scale))scale='county';legislativeFocus='';
    legislativeAreaGeometry=HistoryLegislative.scopeGeometry(shard,data,norm,HistoryCore.mergePaths,HistoryPresidential.modernCounty,HistoryPresidential.baseTown);
    if(year>=2008){const audit=HistoryLegislative.auditPartyTownVotes(shard,legislativeAreaGeometry);if(!audit.valid)throw Error('不分区政党票乡镇数据与底图未能逐项核对：'+audit.errors.slice(0,4).join('；'))}
    const legacyMap={...data,towns:legislativeAreaGeometry.towns,counties:legislativeAreaGeometry.counties,villages:kaohsiungVillages};
   if(year<2008)legislativeGeometry=HistoryLegislative.districtGeometry(shard,geometryReference||shard,legacyMap,norm,HistoryCore.mergePaths,HistoryPresidential.modernCounty,HistoryPresidential.baseTown);
   else{
    legislativeGeometry=HistoryLegislative.periodSingleMemberGeometry(shard,regionalMap,legacyMap,norm,HistoryCore.mergePaths,HistoryPresidential.modernCounty,HistoryPresidential.baseTown);
   }
   legislativeBallot=['all','regional','plains','mountain','party'].includes(electorate)?electorate:'all';electorate=legislativeBallot;
   const available=HistoryLegislative.levels(year,legislativeBallot).map(item=>item[0]);
   scale=available.includes(scale)?scale:available[0];
    // No nationwide map tier: all-area geography is controlled by map range.
   updateHistoricCounties([...new Set(shard.rows.filter(row=>row.level==='county'&&row.electorate==='regional').map(row=>row.county).filter(Boolean))]);
   el('historyYear').value=String(year);candidateScope='top';selectedCandidate='';resultPage=0;
   indicator.hidden=true;indicator.textContent='';window.dispatchEvent(new CustomEvent('historysnapshotready',{detail:{snapshot:shard}}));
   switchMode();render();
  }catch(error){if(requestId!==loadingPresidentialId)return;indicator.hidden=false;indicator.textContent=year+' 年立法机构民代结果载入失败：'+error.message;el('historyRetry').hidden=false;toast(indicator.textContent)}
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
   if(!presidentialMode||!['district','town'].includes(scale))scale='district';
    db.mayor.length=0;dbIds.clear();
   addRows(shard.rows.map(row=>({...row,type:'mayor'})));
   // Fully exit the previously selected legislative office. Without this,
    // historical map items are presidential counties but record keys and
    // state.level still resolve through legislative regions, leaving the
    // whole presidential map uncolored after an office switch.
    legislativeMode=false;
    legislativeGeometry=[];
    legislativeAreaGeometry=null;
    legislativeFocus='';
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
 const allLegislative=()=>legislativeMode&&legislativeBallot==='all';
 const allCouncil=()=>kind==='council'&&electorate==='all';
 const combinedMap=()=>active&&(allLegislative()||allCouncil());
 const combinedIdentities=()=>allLegislative()?['regional','party','plains','mountain']:['regional',...(['plains','mountain'].some(id=>db.council.some(r=>r.electorate===id))?['plains','mountain']:db.council.some(r=>r.electorate==='indigenous')?[]:['plains','mountain']),...(db.council.some(r=>r.electorate==='indigenous')?['indigenous']:[])];
 const localLegislativeLevel=id=>id==='regional'?'district':county&&db.legislative.some(r=>r.electorate===id&&r.county===county&&r.level==='town')?'town':'county';
 const combinedLegislativeRows=()=>{const levels=Object.fromEntries(combinedIdentities().map(id=>[id,localLegislativeLevel(id)]));return db.legislative.filter(r=>(!county||r.county===county)&&r.level===levels[r.electorate])};
 function legislativeNationalRows(){
  if(!legislativeMode)return [];
  return(snapshotData?.rows||[]).filter(r=>r.electorate===legislativeBallot&&r.level==='national').map(src=>({
   type:'legislative',electorate:src.electorate,level:'national',county:'全部地区（含金门、马祖）',town:'',
   district:src.district||'',number:String(src.number||''),name:normCandidate(src.name),
   party:normalizeParty(src.party),votes:Number(src.votes)||0,elected:src.elected===true,
   gender:norm(src.gender),incumbent:src.incumbent
  }));
 }
 function legislativeDisplayRows(){
  if(legislativeMode&&legislativeYear===1992&&!county&&scale==='county'&&
   ['plains','mountain'].includes(legislativeBallot)){
   // The all-area table retains the official nationwide totals.
   const national=legislativeNationalRows();if(national.length)return national;
  }
  return recordsInView();
 }
 const legislativePartyTownView=()=>legislativeMode&&legislativeYear>=2008&&legislativeBallot==='party'&&scale==='town';
 function legislativeCurrentLevel(){
  if(legislativeBallot==='regional'&&!regionalLegislativeTownView())return 'district';
  return scale==='town'?'town':'county';
 }
 function recordsInView(){
  if(legislativeMode){
   if(allLegislative())return combinedLegislativeRows();
   const level=legislativeCurrentLevel();
   return db.legislative.filter(r=>r.electorate===legislativeBallot&&r.level===level&&(!county||r.county===county)&&
    !(level==='town'&&legislativeFocus&&r.town!==legislativeFocus)&&
    !(level==='district'&&legislativeBallot==='regional'&&scale==='district'&&legislativeFocus&&
      HistoryLegislative.districtKey(r)!==HistoryLegislative.districtKey({county:r.county,district:legislativeFocus})));
  }
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
 const areaKey=r=>allLegislative()?(r.electorate+'|'+(r.level==='district'?r.county+'|'+districtNumber(r.district):r.level==='town'?r.county+'|'+r.town:r.county)):legislativeMode?(r.level==='district'?r.county+'|'+r.electorate+'|'+districtNumber(r.district):r.level==='town'?r.county+'|'+r.town:r.county):kind==='mayor'?(mayorTownView()?r.county+'|'+r.town:r.county):kind==='township'?r.county+'|'+r.town:r.county+'|'+r.electorate+'|'+districtNumber(r.district);
 function districtNumber(s){return /^(?:原住民|少数民族)选(?:举)?区$/.test(String(s))?'0':HistoryCore.districtNumber(s)}
 function analyze(){
  unmatchedDistricts=new Set();
  ensureHistoryGeometry();
  const rows=recordsInView(),groups=new Map(),partySeats=new Map(),regions=new Map();
  for(const r of rows){const key=areaKey(r);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)}
  for(const [key,entries] of groups){
   const total=entries.reduce((n,r)=>n+r.votes,0),ranked=[...entries].sort((a,b)=>b.votes-a.votes),winners=ranked.filter(r=>r.elected);
   const leading=ranked[0]||null;
   const chosen=(allLegislative()?entries[0].electorate!=='regional':areaLeading())?[leading].filter(Boolean):winners;
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
  const countySeats=new Map();if(kind==='council'||legislativeMode&&legislativeBallot==='regional')for(const r of rows.filter(r=>r.elected)){if(!countySeats.has(r.county))countySeats.set(r.county,new Map());const counts=countySeats.get(r.county);counts.set(r.party,(counts.get(r.party)||0)+1)}
  const panelSeats=new Map();
  if(allCouncil()&&!county)for(const r of rows.filter(r=>r.elected)){const key=r.electorate+'|'+r.county;if(!panelSeats.has(key))panelSeats.set(key,new Map());const counts=panelSeats.get(key);counts.set(r.party,(counts.get(r.party)||0)+1)}
  const result={rows,regions,partySeats,countySeats,panelSeats,areas:groups.size,range:{min,max}};
  if(metric==='seats')result.seatRange=seatRange(result);
  return result
 }
 function featureKey(feature){
  if(allLegislative())return feature.electorate+'|'+(feature.electorate==='regional'?feature.county+'|'+districtNumber(feature.number??feature.name):feature.combinedLevel==='town'?feature.county+'|'+feature.name:feature.county);
  if(legislativeMode){
   if(legislativeBallot==='regional'&&!regionalLegislativeTownView())return feature.county+'|regional|'+districtNumber(feature.number??feature.name);
   return scale==='town'?feature.county+'|'+feature.name:feature.county;
  }
  if(kind==='mayor')return mayorTownView()?feature.county+'|'+feature.name:feature.county;
  if(kind==='township')return feature.county+'|'+feature.name;
  const identity=featureElectorate(feature),number=districtNumber(feature.number??feature.name);if(unmatchedDistricts.has(norm(feature.county)+'|'+identity+'|'+number))return '__2022_unmatched__';
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
  if(legislativeMode&&legislativeBallot==='party'&&voteMetric()&&candidateScope==='candidate'){
   const locals=[...result.regions.values()].filter(r=>r.top?.party),party=locals[0]?.top.party;
   return party?[{party,name:'',count:locals.length}]:[];
  }
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
  heading.textContent=presidentialMode?yearLabel()+' 台湾地区领导人选举 · '+(localLeaders?'各地区最高票候选人':'候选人得票'):mayorTownView()?yearLabel()+' 县市长选举 · '+(localLeaders?'乡镇市区最高票候选人':'乡镇市区得票'):yearLabel()+' '+officeTitle()+'选举结果';
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
    group.append(svg('rect',{x:bx,y:rowY+3,width:font,height:font,rx:3,fill:ticketMapColor(party,entry.name)}));
    const label=svg('text',{x:bx+font*1.35,y:rowY+font,'font-size':font*.88,'font-weight':600,fill:'#426052'});
    label.textContent=legendLabel(entry);group.append(label);
    const gy=rowY+font*1.35,barHeight=font*1.4;
    const id='history-gradient-'+index,defs=svg('defs'),gradient=svg('linearGradient',{id,x1:'0%',x2:'100%',y1:'0%',y2:'0%'});
    // Sample the metric-specific range used to shade map regions.
    for(let step=0;step<=10;step++){
     const fraction=step/10,value=range.min+(range.max-range.min)*fraction;
     gradient.append(svg('stop',{offset:(fraction*100)+'%','stop-color':tone(ticketMapColor(party,entry.name),value,range)}));
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
   summary.textContent=legislativeMode&&legislativeBallot==='party'&&candidateScope==='candidate'?'当前政党统计地区数（共 '+count+' 个）':areaLeading()?'领先地区数（共 '+count+' 个）':'当选席次（共 '+count+' 席）';
   root.append(summary);rowY+=font*2;
  }
  for(const entry of entries){
   const {party,count}=entry,p=predictionParty(party),logo=logoFor(p);
   root.append(svg('rect',{x:x+18,y:rowY+3,width:font,height:font,rx:3,fill:ticketMapColor(party,entry.name)}));
   if(logo)appendCircularPartyLogo(root,logo,x+38,rowY,font*1.55);
   const label=svg('text',{x:x+font+48,y:rowY+font+1,'font-size':font,fill:'#426052','data-history-legend-candidate':entry.name||''});label.textContent=allLegislative()?legendLabel(entry):legendLabel(entry)+'（'+count+(areaLeading()?'个地区':'席')+'）';root.append(label);rowY+=rowH;
  }
  if(kind==='township'){root.append(svg('rect',{x:x+18,y:rowY+3,width:font,height:font,fill:partialTownship()?'#edf1e9':'#fff',stroke:'#9eaaa2'}));const t=svg('text',{x:x+font+48,y:rowY+font+1,'font-size':font,fill:'#426052','data-no-township-election-legend':'true'});t.textContent=partialTownship()?'暂无已核实档案':'无乡镇市区长选举';root.append(t)}
 }
 function paintHistory(result){
  if(!active||!data)return;
  const features=currentItems(),byId=new Map(features.map(f=>[f.id,f]));
  for(const path of document.querySelectorAll('#regions path[data-region]')){
   const f=byId.get(path.dataset.region);if(!f)continue;
   path.setAttribute('fill',fillColor(f));path.setAttribute('aria-label',f.county+(f.name===f.county?'':' · '+f.name)+'，'+regionDetail(f));
  }
  el('scopeTitle').textContent=(county||'全台')+' · '+yearLabel()+' '+officeTitle()+' · '+metricLabel();
  drawLegend(result);
  syncOverviewFocus();
  positionMapNumberTable();
 }
 function legislativeRowArea(r){
  if(allLegislative())return electorateName(r.electorate)+' · '+r.county+(r.level==='district'?' · '+r.district:r.level==='town'?' · '+r.town:'');
  if(r.level==='national')return '全部地区（含金门、马祖）';
  if(legislativeBallot==='regional'&&r.level!=='town')return r.county+' · '+r.district;
  return r.county+(r.level==='town'?' · '+r.town:'');
 }
 function legislativeResultRows(){
  const rows=legislativeDisplayRows();
  const totals=new Map();
  for(const r of rows){const key=legislativeRowArea(r);totals.set(key,(totals.get(key)||0)+r.votes)}
  return rows.map(r=>({...r,_share:totals.get(legislativeRowArea(r))?r.votes/totals.get(legislativeRowArea(r))*100:0}));
 }
 function createHistoryElement(tag,className='',text=''){
  const node=document.createElement(tag);if(className)node.className=className;
  if(text!==undefined)node.textContent=text;return node;
 }
 function appendHistoryParty(cell,party){
  const p=predictionParty(party),logo=logoFor(p);
  const isTableCell=cell.tagName==='TD'||cell.tagName==='TH';
  const content=isTableCell?createHistoryElement('span','history-party-cell history-party-inline'):cell;
  if(isTableCell){cell.classList.add('history-party-td');cell.append(content)}
  else content.classList.add('history-party-cell');
  if(logo){const img=document.createElement('img');img.src=logo;img.alt='';img.loading='lazy';content.append(img)}
  content.append(createHistoryElement('span','',party));
 }
 function renderLegislativeSummary(){
  const root=el('historyLegislativeSummary');if(!root)return;
  root.hidden=!legislativeMode;root.replaceChildren();if(!legislativeMode)return;
  if(allLegislative()){const records=combinedLegislativeRows();for(const id of combinedIdentities()){const rows=records.filter(r=>r.electorate===id),head=createHistoryElement('div','history-legislative-head');head.append(createHistoryElement('strong','',electorateName(id)),createHistoryElement('span','',rows.length?(id==='party'&&legislativeYear<2008?'席次计算票 ':'有效票 ')+rows.reduce((s,r)=>s+r.votes,0).toLocaleString('zh-CN'):'暂无该层级资料'));root.append(head)}return}
  if(legislativeBallot==='party'&&window.HistoryLegislativeParty){
   window.HistoryLegislativeParty.render(root,{year:legislativeYear,snapshot:snapshotData,makeParty:appendHistoryParty});
   return;
  }
  const records=legislativeResultRows(),votes=records.reduce((sum,r)=>sum+r.votes,0),ballotName=HistoryLegislative.ballots(legislativeYear).find(x=>x.value===legislativeBallot)?.label||'选举';
  const districtRecords=db.legislative.filter(r=>r.electorate===legislativeBallot&&r.level==='district'&&r.elected&&(!county||r.county===county));
  const wins=legislativeBallot==='party'?[]:legislativeBallot==='regional'?records.filter(r=>r.elected):districtRecords;
  const overallSeats=wins.length;
  const head=createHistoryElement('div','history-legislative-head');
  head.append(createHistoryElement('strong','',yearLabel()+' · '+ballotName),
   createHistoryElement('span','',!county?'全部地区（含金门、马祖）':county+(legislativeFocus?' · '+legislativeFocus:'')));
  root.append(head);
  const tiles=createHistoryElement('div','history-legislative-stats');
  const ranked=[...records].sort((a,b)=>b.votes-a.votes),first=ranked[0];
  const cards=legislativeBallot==='regional'&&!regionalLegislativeTownView()?
   [['当选席次',overallSeats+' 席'],['涵盖选区',new Set(records.map(legislativeRowArea)).size+' 个'],['候选人',records.length+' 人']]:
   [[regionalLegislativeTownView()?'乡镇市区':'候选人/政党',(regionalLegislativeTownView()?new Set(records.map(legislativeRowArea)).size:records.length)+' 个'],['当前范围得票',votes.toLocaleString('zh-CN')+' 票'],
    [legislativeBallot==='party'?'领先政党':'最高票候选人',first?first.name:'暂无资料']];
  for(const [label,value] of cards){
   const tile=createHistoryElement('div','history-legislative-stat');
   tile.append(createHistoryElement('span','',label),createHistoryElement('strong','',value));tiles.append(tile);
  }
  root.append(tiles);
  if(legislativeBallot==='regional'&&!regionalLegislativeTownView()){
   const partySeats=HistoryLegislative.composition(wins),list=createHistoryElement('div','history-legislative-seat-list');
   list.append(createHistoryElement('h3','',legislativeYear<2008?'多席选区 · 当选党派席次':'单席选区 · 当选党派席次'));
   const chips=createHistoryElement('div','history-legislative-seat-chips');
   for(const item of partySeats){
    const chip=createHistoryElement('div','history-legislative-seat-chip');
    appendHistoryParty(chip,item.party);
    chip.append(createHistoryElement('strong','',item.seats+'席'));chips.append(chip);
   }
   list.append(chips);root.append(list);
   if(legislativeYear<2008&&county){
    const winners=createHistoryElement('div','history-legislative-winners');
    winners.append(createHistoryElement('h3','','当选名单'));
    for(const entry of wins.slice().sort((a,b)=>a.district.localeCompare(b.district,'zh',{numeric:true})||b.votes-a.votes)){
     const chip=createHistoryElement('span','history-legislative-winner',entry.name+' · '+entry.party);
     winners.append(chip);
    }
    root.append(winners);
   }
  }else{
   const note=createHistoryElement('p','history-legislative-source-note',
    legislativeBallot==='party'?(legislativeYear<2008?'本届为依据候选人票汇总的席次计算票，不是独立政党票；无可靠席次资料时不推算席次。':
     '政党票按当前地图范围统计；未收录的法定席次分配不从得票数推算。'):
    legislativeYear===1992?HistoryLegislative.note(1992,legislativeBallot):
    '各县市及乡镇市区按本地最高票候选人着色；当选标记表示全区法定当选，并非该乡镇选出。');
   root.append(note);
  }
 }
 function showLegislativeRows(){
  renderLegislativeSummary();
  const root=el('historyResults');root.replaceChildren();
  const search=normCandidate(el('historySearch').value),partySelect=el('historyResultParty');
  const all=legislativeResultRows(),parties=[...new Set(all.map(r=>r.party))].sort((a,b)=>a.localeCompare(b,'zh'));
  const previous=partySelect?.value||'';
  if(partySelect){partySelect.replaceChildren(new Option('全部政党',''),...parties.map(p=>new Option(p,p)));partySelect.value=parties.includes(previous)?previous:''}
  const partyFilter=partySelect?.value||'';
  const rows=all.filter(r=>(!partyFilter||r.party===partyFilter)&&(!search||[r.county,r.town,r.district,r.name,r.party].some(v=>String(v||'').includes(search))))
   .sort((a,b)=>(allLegislative()?combinedIdentities().indexOf(a.electorate)-combinedIdentities().indexOf(b.electorate):0)||HistoryCore.compareResultRows(a,b,legislativeBallot==='regional'?'council':'mayor')||
    legislativeRowArea(a).localeCompare(legislativeRowArea(b),'zh',{numeric:true})||b.votes-a.votes);
  const national=legislativeYear===1992&&!county&&scale==='county'&&['plains','mountain'].includes(legislativeBallot);
  const actualTowns=legislativePartyTownView()?new Set(all.map(r=>r.county+'|'+r.town)).size:0;
  el('historySummary').textContent=(county||'全部地区（含金门、马祖）')+' · '+HistoryLegislative.ballots(legislativeYear).find(x=>x.value===legislativeBallot)?.label+(legislativePartyTownView()?' · '+actualTowns+'个乡镇市区':'')+' · '+rows.length+'条结果'+(national?' · 全区总票':'');
  if(!rows.length){
   root.append(createHistoryElement('p','history-legislative-empty','该范围没有可核实的选举结果。'));el('historyPage').textContent='';el('historyPrev').disabled=true;el('historyNext').disabled=true;return
  }
  resultPage=Math.min(resultPage,Math.max(0,Math.ceil(rows.length/100)-1));
  const wrap=createHistoryElement('div','history-table-wrap'),table=createHistoryElement('table','history-candidate-table history-legislative-table');
  table.dataset.ballot=legislativeBallot;
  const partyBallot=legislativeBallot==='party';
  const headers=partyBallot?['地区','政党','得票数','得票率']:['县市','选区 / 地区','号次','候选人','选举时现任','政党','得票数','得票率','当选'];
  const columns=partyBallot?['area','party','votes','share']:['county','area','number','name','incumbent','party','votes','share','elected'];
  const colgroup=document.createElement('colgroup');
  for(const key of columns){const col=document.createElement('col');col.className='legislative-col-'+key;colgroup.append(col)}
  table.append(colgroup);
  const thead=document.createElement('thead'),heading=document.createElement('tr');
  for(const name of headers){const th=document.createElement('th');th.textContent=name;heading.append(th)}thead.append(heading);table.append(thead);
  const body=document.createElement('tbody');let previousArea='';
  for(const r of rows.slice(resultPage*100,(resultPage+1)*100)){
   const area=legislativeRowArea(r);
   if(area!==previousArea){
    const divider=createHistoryElement('tr','history-district-divider'),th=createHistoryElement('th','',area);
    th.scope='rowgroup';th.colSpan=headers.length;divider.append(th);body.append(divider);previousArea=area;
   }
   const tr=document.createElement('tr');
   if(r.elected&&!partyBallot&&(!allLegislative()||r.electorate==='regional'))tr.className='history-elected-row';
   const textFields=partyBallot?[area]:[r.level==='national'?'全区':r.county,allLegislative()?electorateName(r.electorate)+' · '+(r.town||r.district||r.county):r.level==='national'?'全区选举':r.level==='town'?r.town:(r.district||r.town||'—'),r.number||'—',displayedCandidateName(r)];
   for(const value of textFields)tr.append(createHistoryElement('td','',value));
   if(!partyBallot){
    const current=createHistoryElement('td','history-incumbent');appendIncumbentTag(current,incumbentLabel(r));
    if(r.incumbent==null)current.title='现任资料缺失';
    tr.append(current);
   }
   const party=document.createElement('td');appendHistoryParty(party,r.party);tr.append(party);
   tr.append(createHistoryElement('td','history-number',r.votes.toLocaleString('zh-CN')));
   tr.append(createHistoryElement('td','history-number',r._share.toFixed(2)+'%'));
   if(!partyBallot){const mark=document.createElement('td');if(!allLegislative()||r.electorate==='regional')appendResultMark(mark,r);tr.append(mark)}
   body.append(tr);
  }
  table.append(body);wrap.append(table);root.append(wrap);
  el('historyPage').textContent=(resultPage+1)+' / '+Math.ceil(rows.length/100);
  el('historyPrev').disabled=resultPage===0;el('historyNext').disabled=(resultPage+1)*100>=rows.length;
 }
 function appendMobileCandidateDetails(row,items){
  const details=document.createElement('details'),summary=document.createElement('summary');
  summary.textContent='详情';
  details.append(summary);
  const list=document.createElement('dl');
  for(const [label,value] of items){
   const key=document.createElement('dt'),text=document.createElement('dd');
   key.textContent=label;if(label==='选举时现任')appendIncumbentTag(text,value);else text.textContent=value||'—';list.append(key,text);
  }
  details.append(list);
  const cell=document.createElement('td');cell.className='history-mobile-details';cell.append(details);row.append(cell);
 }
 function showRows(result){
  if(legislativeMode){showLegislativeRows();return}
  const search=normCandidate(el('historySearch').value);
  const partySelect=el('historyResultParty'),parties=[...new Set(result.rows.map(r=>r.party))].sort((a,b)=>a.localeCompare(b,'zh')),priorParty=partySelect?.value||'';
  if(partySelect){partySelect.replaceChildren(new Option('全部政党',''),...parties.map(p=>new Option(p,p)));partySelect.value=parties.includes(priorParty)?priorParty:''}
  const partyFilter=partySelect?.value||'',rows=result.rows.filter(r=>(!partyFilter||r.party===partyFilter)&&(!search||[r.county,r.town,r.district,r.name,r.party].some(v=>v.includes(search)))).sort((a,b)=>HistoryCore.compareResultRows(a,b,kind));
  const root=el('historyResults');root.replaceChildren();
  resultPage=Math.min(resultPage,Math.max(0,Math.ceil(rows.length/100)-1));
  el('historyPage').textContent='';el('historyPrev').disabled=true;el('historyNext').disabled=true;
  const seats=[...result.partySeats.values()].reduce((a,b)=>a+b,0);
  const incomplete=archivedCouncil()&&!county?' · 金门县完整明细待补':'';
  el('historySummary').textContent=result.areas+'个地区 / 选区 · '+rows.length+'条候选人记录 · '+seats+(areaLeading()?'个地区领先':'席当选')+' · '+(metric==='share'?'得票率渐变':metric==='votes'?'得票数渐变':'当选结果')+incomplete+(unmatchedDistricts.size?' · '+unmatchedDistricts.size+'个历史选区范围与当前地图不一致，已暂不着色':'');
  if(!rows.length){root.textContent='此范围没有已载入的历史结果。';return}
  const wrap=document.createElement('div');wrap.className='history-table-wrap';
  const table=document.createElement('table');table.className='history-candidate-table history-mobile-list';
  const head=document.createElement('thead'),hr=document.createElement('tr');
  for(const label of ['县市','选区／乡镇市区','号次','候选人',presidentialMode?'性别（正/副）':'性别','选举时现任','政党','得票数','得票率','当选']){const th=document.createElement('th');th.textContent=label;hr.append(th)}
  const mobileHeading=document.createElement('th');mobileHeading.className='history-mobile-details';mobileHeading.textContent='详情';hr.append(mobileHeading);
  head.append(hr);table.append(head);const body=document.createElement('tbody');
  let previousArea='';
  for(const r of rows.slice(resultPage*100,(resultPage+1)*100)){
   const area=areaKey(r);
   if(area!==previousArea){
    const divider=document.createElement('tr'),heading=document.createElement('th');divider.className='history-district-divider';heading.scope='rowgroup';heading.colSpan=11;
    heading.textContent=kind==='mayor'?(presidentialMode?(scale==='town'?r.county+' · '+r.town:r.county+' · '+yearLabel()+'年领导人选举'):(mayorTownView()?r.county+' · '+r.town:r.county+' · 县市长选举')):kind==='council'?r.county+' · '+r.district+' · '+(r.electorate==='plains'?'平地少数民族议员':r.electorate==='mountain'?'山地少数民族议员':'区域议员'):r.county+' · '+r.town;
    if(r.tally_basis==='original_opening')heading.append(' · 投票日原始开票');
    else if(r.tally_basis==='certified_recount')heading.append(' · 重计票结果');
    if(snapshotData?.cycleYears){const y=localResultYear({county:r.county,name:kind==='council'?r.district:r.town||r.county,electorate:r.electorate});heading.append(' · '+y+'年')}
    divider.append(heading);body.append(divider);previousArea=area;
   }
   const tr=document.createElement('tr');
   const values=[r.county,mayorTownView()?r.town:kind==='council'?r.district:kind==='township'?r.town:(r.district||''),r.number||'—',displayedCandidateName(r),displayedGender(r),incumbentLabel(r)];
   for(const [i,value] of values.entries()){const td=document.createElement('td');if(i===5)appendIncumbentTag(td,value);else td.textContent=value||'—';if(i===5&&r.incumbent==null)td.title='现任资料缺失';tr.append(td)}
   const partyCell=document.createElement('td');partyCell.className='history-party-cell';
   const party=predictionParty(r.party),logo=logoFor(party);
   if(logo){const img=document.createElement('img');img.src=logo;img.alt='';img.loading='lazy';partyCell.append(img)}
   const partyName=document.createElement('span');partyName.textContent=r.party;partyCell.append(partyName);tr.append(partyCell);
   const votes=document.createElement('td');votes.className='history-number';votes.textContent=r.votes.toLocaleString('zh-CN');tr.append(votes);
   const rate=document.createElement('td');rate.className='history-number';rate.textContent=(r._share||0).toFixed(2)+'%';tr.append(rate);
   const status=document.createElement('td');appendResultMark(status,r);tr.append(status);
   appendMobileCandidateDetails(tr,[['号次',values[2]],['性别',values[4]],['选举时现任',values[5]],['得票率',rate.textContent]]);
   body.append(tr)
  }
  table.append(body);wrap.append(table);root.append(wrap);
  el('historyPage').textContent=(resultPage+1)+' / '+Math.max(1,Math.ceil(rows.length/100));
  el('historyPrev').disabled=resultPage===0;el('historyNext').disabled=(resultPage+1)*100>=rows.length;
 }
 function sharedWomenText(group){
  if(!group||!Array.isArray(group.districts)||!Number.isInteger(group.reserved))return '';
  if(group.reserved===0)return '0席';
  return '第'+group.districts[0]+'—'+group.districts[group.districts.length-1]+'选区共享'+group.reserved+'席'+(group.verification_status==='pending_original_notice'?'（按旧制推算，待核）':'');
 }
 function renderHistoryDistrictReference(){
  const section=el('districtReference');if(!section)return;
  const visible=active&&kind==='council'&&districtMetadata.length>0;
  section.hidden=!visible;if(!visible)return;
  const search=norm(el('districtTableSearch')?.value||'');
  const rows=districtMetadata.filter(d=>(!county||norm(d.county)===county)&&(!search||norm(d.name+d.scope+DistrictCore.identityName(d)).includes(search)));
  const seats=rows.reduce((n,d)=>n+d.seats,0);
  el('districtReferenceTitle').textContent=(county||'全台')+yearLabel()+'议员选区范围与名额';
  el('districtReferenceSummary').textContent=rows.length+'个历史选区 · '+seats+'个应选席次'+(localYear===2022&&!county?' · 全台215个选区、910席':'');
  const root=el('districtTableGroups');root.replaceChildren();
  const groups=new Map();for(const d of rows){if(!groups.has(d.county))groups.set(d.county,[]);groups.get(d.county).push(d)}
  for(const [name,list]of groups){
   const details=document.createElement('details');details.className='county-district-group';details.open=!!county||name===rows[0]?.county;
   const summary=document.createElement('summary');summary.textContent=norm(name)+' · '+list.length+'个选区 · '+list.reduce((n,d)=>n+d.seats,0)+'席';details.append(summary);
   const wrap=document.createElement('div');wrap.className='reference-table-wrap';const table=document.createElement('table');table.className='reference-table';
   const caption=document.createElement('caption');caption.textContent=norm(name)+'（'+yearLabel()+'年）议员选区范围与名额';table.append(caption);
   const thead=document.createElement('thead'),trh=document.createElement('tr');
   for(const label of ['选区','类别','选区范围','应选名额','妇保名额','地图边界']){const th=document.createElement('th');th.scope='col';th.textContent=label;trh.append(th)}
   thead.append(trh);table.append(thead);const tbody=document.createElement('tbody');
   for(const d of list.sort((a,b)=>a.number-b.number)){
    const tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.textContent=d.name;tr.append(th);
    const cat=document.createElement('td');cat.textContent=DistrictCore.identityName(d);tr.append(cat);
    const scope=document.createElement('td');scope.className='reference-scope';scope.textContent=mainlandTerms(councilScopeText(d))||'当届乡镇市区范围尚待核实';tr.append(scope);
    const seat=document.createElement('td');seat.className='reference-number';seat.textContent=d.seats+'席';tr.append(seat);
    const women=document.createElement('td');women.className='reference-number';women.textContent=sharedWomenText(d.womenReservedGroup)||(d.womenReserved==null?'—':d.womenReserved+'席');if(d.womenReservedGroup)women.title=(d.womenReservedGroup.method==='statutory'?'依据当届适用规定及应选席次计算：':'当届官方公告：')+'保障名额按同类选区合计，不是各选区分别享有'+(d.womenReservedGroup.verification_note?'；'+d.womenReservedGroup.verification_note:'');if(d.womenReservedMethod==='statutory')women.title='依据当届适用规定及应选席次计算';tr.append(women);
    const map=document.createElement('td');const matchKey=HistoryCore.key(d.county,d.electorate,d.number,norm);map.textContent=d.mapAvailable===false?'查看候选人结果':yearLabel()+'年选区范围';map.className=d.mapAvailable===false||unmatchedDistricts.has(matchKey)?'history-map-mismatch':'history-map-match';tr.append(map);
    tbody.append(tr)
   }
   table.append(tbody);wrap.append(table);details.append(wrap);root.append(details)
  }
 }
 function update(){if(!active||!data)return;const result=currentResult;showRows(result);showComparison(result);paintHistory(result);renderHistoryDistrictReference();el('predictionScopeLabel').textContent=yearLabel()+' 历史选举结果';el('brushName').textContent=historyOverview()&&kind==='council'&&metric==='party'?
  '各县市按最多当选席次政党填色 · 点击县市查看议员选区':
  historyOverview()?'点击县市查看'+yearLabel()+'年结果':
  yearLabel()+'选举结果 · 点击区域查看候选人与得票';el('returnTaiwanMap').hidden=!county;el('historyResultSection').hidden=false;el('headerExportPredictions').hidden=true;el('undo').disabled=true;el('redo').disabled=true;window.HistoryWorkspace?.render()}
 function switchMode(){
  state.workspaceMode='history';state.fillMode='solid';state.level=legislativeMode?(allLegislative()||legislativeBallot==='regional'&&!regionalLegislativeTownView()?'legislative':scale==='town'?'towns':'counties'):kind==='mayor'?(scale==='town'?'towns':'counties'):kind==='council'?'council':'towns';state.county=county;state.villageTown='';
  if(kind==='council')state.councilViewScope='all';
  if(kind!=='council'&&!(legislativeMode&&legislativeBallot==='regional'&&legislativeYear<2008)&&metric==='seats')metric='party';el('historyMetric').value=metric;currentResult=loaded?analyze():null;
 }
 function activate(){
  if(!active)savedMapScope=clone(state);
  active=true;document.body.classList.add('history-mode');
  el('historyControls').hidden=false;el('mapSettings').hidden=true;
  
  el('workspacePrediction').classList.remove('active');el('workspaceFree').classList.remove('active');
  switchMode();render();
  if(!snapshotData)snapshot().then(success=>{if(active&&success)render()})
 }
 function deactivate(){
  if(el('historyResultDialog').open)el('historyResultDialog').close();routeDetail=null;
  loadingPresidentialId++;active=false;document.body.classList.remove('history-mode');
  if(savedMapScope){state=clone(savedMapScope);savedMapScope=null;}currentResult=null;districtTableKey='';el('headerExportPredictions').hidden=false;
  el('historyControls').hidden=true;el('historyResultSection').hidden=true;el('mapSettings').hidden=false;
  if(data){syncInputs();render()}
 }
 function mayorTownView(){return kind==='mayor'&&scale==='town'}
 function historyOverview(){return active&&!county&&kind!=='mayor'&&!legislativeMode}
 function legislativeNationalView(){return active&&legislativeMode&&!county}
 function nationwideHistoricalSeatColors(){return active&&metric==='party'&&
  (kind==='council'&&!county||legislativeMode&&legislativeBallot==='regional'&&legislativeYear<2008&&!county&&scale==='county')}
 function countySeatLeader(countyName){
  const counts=currentResult?.countySeats?.get(countyName);
  if(!counts?.size)return{party:null,seats:0,tied:false,counts:null};
  const ranked=[...counts].filter(([,seats])=>seats>0)
   .sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh'));
  if(!ranked.length)return{party:null,seats:0,tied:false,counts};
  const tied=ranked.length>1&&ranked[0][1]===ranked[1][1];
  return{party:tied?null:ranked[0][0],seats:ranked[0][1],tied,counts};
 }
 function countySeatFill(countyName){
  const leader=countySeatLeader(countyName);
  return leader.tied?seatTiePatternFill(seatTieLeaderColors(leader.counts,partyColor)):leader.party?partyColor(leader.party):'#edf1e9';
 }
 function legislativeMultiView(){return active&&legislativeMode&&(allLegislative()||legislativeBallot==='regional')&&legislativeYear<2008&&!regionalLegislativeTownView()&&metric==='party'}
 function historyCouncilSeats(){return active&&kind==='council'&&!!county&&metric==='party'}
 function voteMetric(){return metric==='share'||metric==='votes'}
 const selectedPartyVoteLabel=()=>legislativeMode&&legislativeBallot==='party'&&candidateScope==='candidate'&&selectedCandidate?selectedCandidate.split('|').at(-1)+' · ':'';
 function metricLabel(){if(allLegislative())return '全部类型（分别统计）';return metric==='seats'?selectedParty+'当选席次':metric==='share'?selectedPartyVoteLabel()+'得票率':metric==='votes'?selectedPartyVoteLabel()+'得票数':kind==='council'||legislativeMode&&legislativeBallot==='regional'&&legislativeYear<2008&&!regionalLegislativeTownView()?'当选席次':presidentialMode?(scale==='town'?'各乡镇市区最高票候选人':'各县市最高票候选人'):legislativeMode?(legislativeBallot==='party'?'各地区领先政党':'各地区最高票候选人'):mayorTownView()?'各乡镇市区最高票候选人':'当选结果'}
 function seatRange(result){const counts=allCouncil()&&!county?[...result.panelSeats.values()]:county?[...result.regions.values()].map(r=>r.partyCounts):[...result.countySeats.values()];return{min:0,max:Math.max(1,...counts.map(c=>c.get(selectedParty)||0))}}
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

 function incumbentLabel(r){return r.incumbent===true?'现任':''}
 function appendIncumbentTag(cell,value){if(value==='现任')cell.append(createHistoryElement('span','incumbent-tag','现任'));}
 let resultPage=0;
 function candidateKey(r){return presidentialMode?['president',presidentialYear,r.number,r.name].join('|'):legislativeMode?(r.electorate==='party'?['legislative',legislativeYear,'party',r.party].join('|'):['legislative',legislativeYear,r.electorate,r.county,r.district,r.number,r.name].join('|')):[r.county,r.electorate,r.district,kind==='township'?r.town:'',r.number,r.name].join('|')}
 function ensureHistoryGeometry(){
  if(localGeometry&&!presidentialMode&&!legislativeMode)return;
  if(localYear===2026&&!presidentialMode&&!legislativeMode){
   if(historicalFeatures.length||!data?.council?.length||!data?.councilIndigenous?.length)return;
   const meta=new Map(districtMetadata.map(d=>[[norm(d.county),d.electorate,String(d.number)].join('|'),d]));
   historicalFeatures=[...data.council,...data.councilIndigenous].map(f=>{
    const id=[norm(f.county),HistoryCore.identity(f.electorate),districtNumber(f.number??f.name)].join('|');
    const district=meta.get(id);
    return {...f,historyId:district?.id||'',seats:district?.seats||f.seats||0};
   });return;
  }
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
  if(legislativeMode){
   if(allLegislative())return combinedIdentities().flatMap(id=>{const level=localLegislativeLevel(id),source=id==='regional'?legislativeGeometry:level==='town'?(legislativeAreaGeometry?.towns||[]):(legislativeAreaGeometry?.counties||data.counties);return source.filter(f=>!county||f.county===county).map(f=>({...f,id:id+':'+f.id,electorate:id,combinedLevel:level,legislativeTown:id!=='regional',fillRule:f.fillRule||(id==='regional'?'nonzero':'evenodd')}))});
   if(legislativeBallot==='regional'&&!regionalLegislativeTownView()){
    // 1992–2004 nationwide is a county seat-plurality map, not a pile of
    // constituency fills/badges. The county geometry also allows true county
    // interaction and matches the labels shown on the map.
    if(legislativeYear<2008&&!county&&scale==='county')
     return legislativeAreaGeometry?.counties||data.counties;
    return legislativeGeometry.filter(f=>(!county||f.county===county)&&!(scale==='district'&&legislativeFocus&&HistoryLegislative.districtNumber(f.number??f.name)!==HistoryLegislative.districtNumber(legislativeFocus)));
   }
   const areas=scale==='town'?(legislativeAreaGeometry?.towns||data.towns):(legislativeAreaGeometry?.counties||data.counties);
   const verifiedTowns=regionalLegislativeTownView()?snapshotData?.geographicProfiles?.regional?.town:null;
   return areas.filter(f=>(!county||f.county===county)&&!(scale==='town'&&legislativeFocus&&f.name!==legislativeFocus)&&
    (!verifiedTowns||Object.hasOwn(verifiedTowns[f.county]||{},f.name)));
  }
  if(allCouncil()&&!county){const source=localGeometry?.counties||data.counties;return combinedIdentities().flatMap(id=>source.map(f=>({...f,id:id+':'+f.id,electorate:id,combinedLevel:'county'})))}
  if(localGeometry){
   if(historyOverview()&&kind==='council')return localGeometry.counties;
   if(kind==='council')return historicalFeatures.filter(f=>f.county===county&&(electorate==='all'||f.electorate===electorate));
   const items=kind==='mayor'&&!mayorTownView()?localGeometry.counties:localGeometry.towns;
   return items.filter(f=>!county||f.county===county);
  }
  if(historyOverview())return kind==='township'?data.towns:data.counties;
  if(kind==='council'){ensureHistoryGeometry();return historicalFeatures.filter(f=>(!county||f.county===county)&&(electorate==='all'||f.electorate===electorate))}
  const items=kind==='mayor'&&!mayorTownView()?data.counties:data.towns;
  return items.filter(f=>!county||f.county===county);
 }
 function noElection(f){return f.name!==f.county&&active&&kind==='township'&&!partialTownship()&&(loaded||localGeometry)&&!db.township.some(r=>r.county===f.county&&r.town===f.name)}
 function councilScopeText(d){
  if(!d)return '';
  const split=localYear===2022&&d.county==='新竹市'&&d.electorate==='regional'?
   hsinchuGeometry?.features?.find(f=>Number(f.number)===Number(d.number)):null;
  return HistoryCore.councilScope(d,districtMetadata,(d.scopeVillages?.length?d.scopeVillages:split?.scopeVillages||[]).map(norm));
 }
 let scopeIndexSnapshot=null,scopeIndex=null;
 function legislativeScopeText(f){
  if(legislativeBallot==='party')return '';
  if(legislativeBallot!=='regional')return '全部地区的'+(legislativeBallot==='plains'?'平地':'山地')+'少数民族选区；县市或乡镇市区仅为本地得票统计范围，并非独立选区。';
  if(!f||!f.county)return '';
  if(regionalLegislativeTownView())return recordsInView().find(r=>r.county===f.county&&r.town===f.name)?.district||'';
  if(f.name===f.county&&scale==='county')return '本县市汇总，包含本县市各区域民代选区。';
  if(scopeIndexSnapshot!==snapshotData){scopeIndexSnapshot=snapshotData;scopeIndex=HistoryCore.legislativeScopeIndex(snapshotData?.rows,norm)}
  const actual=HistoryCore.legislativeScope(scopeIndex,norm(f.county),f.number||f.name);
  if(actual)return actual+(actual.includes('部分里')?'；具体里别以当届选区公告为准':'');
  // Offshore constituencies can still lack election-year town detail.
  if(f.historicalBoundarySourceTowns?.length&&f.historicalBoundarySourceYear!==legislativeYear){
   const names=f.historicalBoundarySourceTowns.map(n=>legislativeAreaGeometry?.towns.find(t=>t.county===f.county&&HistoryPresidential.baseTown(t.name)===n)?.name||n);
   return '当届乡镇划分尚待核实；'+f.historicalBoundarySourceYear+'年参考范围：'+names.join('、')+'（非当届确认范围）';
  }
  return '当届乡镇市区范围尚待核实';
 }
 function renderDialogScope(f,d){
  let node=el('historyDialogScope');
  if(!node){node=document.createElement('p');node.id='historyDialogScope';node.className='data-help';el('historyDialogMessage').after(node)}
  const value=legislativeMode?legislativeScopeText(f):kind==='council'?councilScopeText(d):'';
  node.replaceChildren();node.hidden=!value;if(!value)return;
  const label=document.createElement('strong');label.textContent='选区范围：';node.append(label,mainlandTerms(value));
  if(d?.scopeSource){
   const link=document.createElement('a');link.href=d.scopeSource;link.target='_blank';link.rel='noopener';
   link.textContent='当届里别资料';node.append(' · ',link);
  }
  if(legislativeMode&&legislativeYear===2024&&legislativeBallot==='regional'&&value.includes('部分里')){
   const link=document.createElement('a');link.href='https://2024.cec.gov.tw/data/file/03636e7bc6dc417f8f2293d27b690b25.pdf';link.target='_blank';link.rel='noopener';link.textContent='当届完整里别公告';node.append(' · ',link)
  }
 }
 function historicalDistrictFor(f){if(legislativeMode||kind!=='council')return null;return districtMetadata.find(d=>d.id===f.historyId)||
  (localYear===2026?districtMetadata.find(d=>d.county===norm(f.county)&&d.electorate===HistoryCore.identity(f.electorate)&&String(d.number)===districtNumber(f.number??f.name)):null)}
 function historicalSeatRows(d){
  const cs=db.council.filter(r=>r.level==='district'&&r.county===norm(d.county)&&r.electorate===d.electorate&&districtNumber(r.district)===String(d.number)&&r.elected).map(r=>({...r,id:yearLabel()+'|'+candidateKey(r),history:true}));
  cs.sort((a,b)=>state.palette.findIndex(p=>p.id===predictionParty(a.party).id)-state.palette.findIndex(p=>p.id===predictionParty(b.party).id)||a.party.localeCompare(b.party)||b.votes-a.votes);
  return Array.from({length:d.seats},(_,i)=>cs[i]||null);
 }
 // A partial archive must never enter the full-vote or
 // party-seat aggregation: missing candidates and party endorsements stay unknown.
 function renderPartialCouncilReturns(){
  const note=el('historyBoundaryNote');if(!note)return;
  let details=el('historyPartialCouncilReturns');
  const records=archivedCouncil()?(snapshotData?.partialCouncilReturns||[]):[];
  if(!records.length){if(details)details.hidden=true;return}
  if(!details){details=document.createElement('details');details.id='historyPartialCouncilReturns';details.className='data-help';note.after(details)}
  details.hidden=false;
  if(details.dataset.loaded==='true')return;
  details.dataset.loaded='true';
  const summary=document.createElement('summary');summary.textContent='金门1994年议员选举档案（部分资料）';details.append(summary);
  for(const archive of records){
   const otherCandidates=archive.other_candidates||[];
   const intro=document.createElement('p');
   intro.textContent=archive.election_date+' 投票 · '+archive.candidate_count+' 人参选 · '+archive.elected_count+' 人当选 · 选举人数 '+archive.registered_voters.toLocaleString('zh-CN')+' · 投票人数 '+archive.ballots_cast.toLocaleString('zh-CN')+' · 投票率 '+archive.turnout_pct.toFixed(2)+'%。已核实 '+archive.elected_count+' 名当选人及 '+otherCandidates.length+' 名未当选人；另有 '+(archive.candidate_count-archive.elected_count-otherCandidates.length)+' 名参选人待核。号次、选区有效票和推荐政党仍待补。';
   if(archive.reserved_district){
    const {number,elected_name}=archive.reserved_district;
    intro.append(' 全县预设妇女保障名额'+archive.reserved_seats+'席；县志明确记载第'+number+'选举区的'+normCandidate(elected_name)+'凭妇女保障名额当选。');
   }
   details.append(intro);
   const wrap=document.createElement('div');wrap.className='history-table-wrap';
   const table=document.createElement('table');table.className='history-candidate-table';
   const thead=document.createElement('thead'),hr=document.createElement('tr');
   for(const label of ['选区','号次','候选人','性别','选举时现任','当时党籍','得票数','得票率','当选']){
    const th=document.createElement('th');th.textContent=label;hr.append(th)
   }
   thead.append(hr);table.append(thead);
   const body=document.createElement('tbody');
   function addGroup(label){
    const divider=document.createElement('tr'),heading=document.createElement('th');
    divider.className='history-district-divider';heading.scope='rowgroup';heading.colSpan=9;
    heading.textContent=label;divider.append(heading);body.append(divider);
   }
   function addCandidate({district_number,ballot_number,name,gender,membership,votes,elected}){
    const row=document.createElement('tr');
    if(elected)row.className='history-elected-row';
    const districtLabel=district_number?'第'+district_number+'选举区':'';
    for(const value of [districtLabel,ballot_number??'',normCandidate(name),gender||'','',norm(membership||''),Number.isFinite(votes)?votes.toLocaleString('zh-CN'):'','']){
     const cell=document.createElement('td');cell.textContent=value;row.append(cell);
    }
    const result=document.createElement('td');
    if(elected){const mark=document.createElement('img');mark.src='assets/elected-mark.png';mark.alt='当选';mark.width=18;mark.height=18;result.append(mark)}
    row.append(result);body.append(row);
   }
   for(const district of archive.districts){
    addGroup('1994年 · 第'+district.number+'选举区（'+norm(district.scope)+'） · 应选'+district.seats+'席 · 妇保'+district.reserved_seats+'席');
    for(const [name,gender,votes,membership] of district.winners){
     addCandidate({district_number:district.number,name,gender,votes,membership,elected:true});
    }
    otherCandidates.filter(candidate=>candidate.district_number===district.number).forEach(addCandidate);
   }
   const unplaced=otherCandidates.filter(candidate=>candidate.district_number==null);
   if(unplaced.length){
    addGroup('1994年 · 选区待核');
    unplaced.forEach(addCandidate);
   }
   table.append(body);wrap.append(table);details.append(wrap);
   const sources=document.createElement('p');
   for(const [label,url] of [['当选名单：金门县志',archive.source_url],['应选及妇女保障名额：金门县志',archive.reserved_seats_source],['保障当选情况：金门县议会',archive.reserved_elected_source],['投票统计：金门县统计年报表3-9',archive.statistics_source_url],['当选人得票与党籍：续修金门县志第281页',archive.winner_detail_source_url],['其他参选人：金门日报',archive.other_candidate_sources?.reported_returns],['陈沧江党籍：人物专访',archive.other_candidate_sources?.chen_membership],['翁明志选区：本人回忆',archive.other_candidate_sources?.weng_district],['黄积军得票：金门日报',archive.other_candidate_sources?.huang_returns]]){
    if(!url)continue;
    const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent=label;sources.append(link,'　')
   }details.append(sources);
  }
 }
 function renderLegacyCouncilCountyProfile(){
  const note=el('historyBoundaryNote');if(!note)return;
  let details=el('historyLegacyCouncilCountyProfile');
  const profiles=archivedCouncil()?(snapshotData?.verifiedCouncilCountyProfiles||[]).filter(x=>!county||norm(x.county)===county):[];
  if(!profiles.length){if(details)details.hidden=true;return}
  if(!details){details=document.createElement('details');details.id='historyLegacyCouncilCountyProfile';details.className='data-help';note.after(details)}
  details.hidden=false;details.replaceChildren();
  const summary=document.createElement('summary');summary.textContent='1994年县市议员官方县市级投票统计（选区分项待补）';details.append(summary);
  for(const p of profiles){
   const paragraph=document.createElement('p');
   paragraph.textContent=norm(p.county)+' · '+p.election_date+'：选举人数 '+p.registered_voters.toLocaleString('zh-CN')+'，投票数 '+p.ballots_cast.toLocaleString('zh-CN')+'，有效票 '+p.valid_votes.toLocaleString('zh-CN')+'，无效票 '+p.invalid_votes.toLocaleString('zh-CN')+'；'+p.candidate_count+' 人参选（男'+p.male_candidates+'、女'+p.female_candidates+'），'+p.elected_count+' 人当选（男'+p.male_elected+'、女'+p.female_elected+'）。仅为全县市合计，不用于推算各选区投票人数，也不推定缺失候选人的性别。';
   details.append(paragraph);
   const source=document.createElement('a');source.href=p.source_url;source.target='_blank';source.rel='noopener';source.textContent='查看官方统计年报：'+p.source_locator;details.append(source);
  }
 }
 function renderPartialTownshipReturns(){
  const note=el('historyBoundaryNote');if(!note)return;
  let details=el('historyPartialTownshipReturns');
  const records=partialTownship()?(snapshotData.partialTownshipReturns||[]).filter(r=>!county||norm(r.county)===county):[];
  if(!records.length){if(details)details.hidden=true;return}
  if(!details){details=document.createElement('details');details.id='historyPartialTownshipReturns';details.className='data-help';note.after(details)}
  details.hidden=false;
  details.replaceChildren();
  const summary=document.createElement('summary');
  summary.textContent='1994年乡镇市长补充档案';
  details.append(summary);
  for(const record of records){
   const intro=document.createElement('p');
   if(record.winners){
    intro.textContent=norm(record.county)+' · '+record.election_date+' 投票 · 当选人资料。其他候选人和选区总票数待核。';
    if(record.county_summary){
     const stats=record.county_summary;
     intro.append(' 全县 '+stats.candidate_count+' 人参选、'+stats.elected_count+' 人当选，选举人数 '+stats.registered_voters.toLocaleString('zh-CN')+'，投票人数 '+stats.ballots_cast.toLocaleString('zh-CN')+'，投票率 '+stats.turnout_pct.toFixed(2)+'%。');
    }
    const list=document.createElement('ul');
    for(const winner of record.winners){
     const item=document.createElement('li');
     const facts=[norm(winner.town),normCandidate(winner.name)];
     if(winner.party_membership)facts.push(norm(winner.party_membership));
     if(Number.isFinite(winner.votes))facts.push(winner.votes.toLocaleString('zh-CN')+'票');
     item.textContent=facts.join(' · ');
     list.append(item);
    }
    details.append(intro,list);
   }else if(record.county_party_shares){
    intro.textContent=norm(record.county)+' · '+record.election_date+' 投票 · 全县乡市长选举政党得票率。逐候选人票数待核。';
    const list=document.createElement('ul');
    for(const [party,share] of record.county_party_shares){
     const item=document.createElement('li');
     item.textContent=norm(party)+' · '+share.toFixed(2)+'%';
     list.append(item);
    }
    details.append(intro,list);
   }else{
    const countywide=record.summary_scope==='county';
    const hasWinners=record.profiles.some(profile=>profile.winner_name);
    const hasCandidateCounts=record.profiles.some(profile=>Number.isFinite(profile.candidate_count));
    const hasCandidateNames=record.profiles.some(profile=>profile.candidate_names?.length);
    const hasGenderCounts=record.profiles.some(p=>Number.isInteger(p.male_candidates)&&Number.isInteger(p.female_candidates));
    const hasPreviousWinner=record.profiles.some(p=>p.previous_election_winner);
    intro.textContent=norm(record.county)+' · '+record.election_date+' 投票 · '+(countywide?'全县投票统计。':'乡镇市投票统计。')+'部分候选人得票待核。';
    if(record.profile_candidate_total)intro.append(' 全县 '+record.profile_candidate_total+' 人参选。');
    const wrap=document.createElement('div');wrap.className='history-table-wrap';
    const table=document.createElement('table');table.className='history-candidate-table';
    const head=table.createTHead().insertRow();
    const labels=[countywide?'统计范围':'乡镇市','选举人数','投票数','有效票','无效票','投票率'];
    if(hasCandidateCounts)labels.push('参选人数');
    if(hasGenderCounts)labels.push('男性候选人','女性候选人');
    if(hasPreviousWinner)labels.push('上届当选人');
    if(hasWinners)labels.push('当选人');
    if(hasCandidateNames)labels.push('候选人名单');
    for(const label of labels){
     const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);
    }
    const body=table.createTBody();
    for(const {town,registered_voters,ballots_cast,valid_votes,invalid_votes,candidate_count,winner_name,candidate_names,male_candidates,female_candidates,previous_election_winner} of record.profiles){
     const row=body.insertRow();
     const values=[norm(town),registered_voters,ballots_cast,valid_votes,invalid_votes,(100*ballots_cast/registered_voters).toFixed(2)+'%'];
     if(hasCandidateCounts)values.push(candidate_count??'');
     if(hasGenderCounts)values.push(male_candidates??'',female_candidates??'');
     if(hasPreviousWinner)values.push(previous_election_winner?normCandidate(previous_election_winner):'');
     if(hasWinners)values.push(winner_name?normCandidate(winner_name):'');
     if(hasCandidateNames)values.push(candidate_names?.map(normCandidate).join('、')||'');
     for(const value of values){
      row.insertCell().textContent=typeof value==='number'?value.toLocaleString('zh-CN'):value;
     }
    }
    wrap.append(table);details.append(intro,wrap);
   }
   const citation=document.createElement('p');
   for(const evidence of [record,record.county_summary,record.candidate_roster_source,record.profile_detail_source,...(record.winners||[])].filter(Boolean)){
    const url=evidence.source_url||evidence.candidate_counts_source_url;
    const locator=evidence.source_locator||evidence.candidate_counts_source_locator;
    if(!url||!locator)continue;
    const source=document.createElement('a');
    source.href=url;source.target='_blank';source.rel='noopener';
    source.textContent=norm(locator)+' ↗';
    citation.append(source,'　');
   }
   details.append(citation);
  }
 }
 function syncHistoryControls(){
  const titleEyebrow=el('historyResultSection')?.querySelector('.eyebrow');
  if(titleEyebrow)titleEyebrow.textContent=yearLabel()+' 历史数据';
  if(el('historyWorkspaceTitle'))el('historyWorkspaceTitle').textContent=yearLabel()+' '+officeTitle()+'选举结果';
  if(el('historyBoundaryNote')){
  el('historyBoundaryNote').hidden=!presidentialMode&&!legislativeMode&&localYear===2022;
  if(legislativeMode)el('historyBoundaryNote').textContent=legislativePartyTownView()?'政党票票数均为当届乡镇市区的实际统计值，完整对账至县市与全区；2008及2012年的行政区名称遵循当届，轮廓采用对应现行乡镇市区图形，并不保证还原每一处历史边界。':legislativeYear===1992?(legislativeBallot==='regional'?'1992年区域选区主要按政大当届乡镇归属显示，轮廓采用现行底图近似。金门和马祖选区仍使用参考范围。':'1992年少数民族民代地方票数来自政大逐乡镇档案。行政区名称沿用资料库，部分名称为后来升格后的用法。'):legislativeYear<2008?'1995—2004年区域选区按当届选区归属重建，使用现行乡镇市区轮廓近似绘制；县市内部分界或旧村里界线可能不精确，点选选区可查看具体说明。':legislativeYear>=2008&&legislativeYear<2020?
   '2008—2016年立法机构区域选区依当届归属显示；2020年调整的台中、台南、高雄、新竹县、屏东按当届乡镇市区选区资料重建。村里内部划分缺少可核历史界线时仅近似展示。':
   '历史选区按当届县市、乡镇市区归属重建；底图几何使用现行行政区近似，无法精确还原的旧里界不作推算。';
  else if(localYear===2026)el('historyBoundaryNote').textContent='2026年正式结果仅在中选会或地方选委会资料逐项核对、选区得票与席次校验通过后发布；预测与官方结果分开保存。未核实的乡镇得票不推算。';
  else if(!presidentialMode&&localGeometry){
   const cycle=snapshotData?.cycleYears&&yearLabel().includes('/')?'按选举批次合并显示，各地实际投票日期见选区结果。':'按实际投票年显示。';
   const scope=partialTownship()?snapshotData.elections.find(e=>e.office==='township'):null;
   const coverage=archivedCouncil()?' 1994年1月的县市议员资料采用地方选务档案转录，经选区有效票和当选席次对账。金门县可查已核实的部分候选人资料，合计采用已收录的完整结果。':
    scope?' 已收录'+scope.counties.join('、')+'共'+snapshotData.contests.filter(c=>c.election_id===scope.election_id).length+'个选区的候选人结果。部分选区的政党或投票统计仍缺资料。':'';
   el('historyBoundaryNote').textContent=cycle+coverage+' 历史边界采用可对应的现行轮廓，缺少可靠边界的选区仍可查看候选人结果。'+
    (localYear===2018&&kind==='mayor'&&(!county||county==='台北市')?' 台北市全市及12区均采用法院重计后的得票及投票统计。':'');
  }
  else if(presidentialMode)el('historyBoundaryNote').textContent='县市和乡镇市区按当届归属显示，边界采用现行底图近似；'+
   (presidentialYear<=2000?'不同“连署”候选人使用不同图示色，不代表政党。':'颜色表示各地区最高票候选人所属政党。');
 }
  renderPartialCouncilReturns();
  renderLegacyCouncilCountyProfile();
  renderPartialTownshipReturns();
  el('historyCounty').value=county;el('historyScaleBox').hidden=allLegislative()||kind!=='mayor'&&!legislativeMode;
  if(legislativeMode){
   const ballot=el('historyElectorate');ballot.replaceChildren(...HistoryLegislative.ballots(legislativeYear).map(item=>new Option(item.label,item.value)));ballot.value=legislativeBallot;
   const levels=HistoryLegislative.levels(legislativeYear,legislativeBallot),scaleSelect=el('historyScale');scaleSelect.replaceChildren(...levels.map(([value,label])=>new Option(legislativeYear>=2008&&legislativeBallot==='party'&&value==='town'&&!county?'乡镇市区（全台368个）':label,value)));if(!levels.some(([value])=>value===scale))scale=levels[0][0];scaleSelect.value=scale;
   const focusBox=el('historyFocusBox'),focusSelect=el('historyFocus'),focusLabel=el('historyFocusLabel');
   if(focusBox&&focusSelect){
    const eligible=!allLegislative()&&!!county&&['district','town'].includes(scale);
    focusBox.hidden=!eligible;
    const candidates=scale==='district'?legislativeGeometry.filter(f=>f.county===county)
     :regionalLegislativeTownView()?Object.keys(snapshotData?.geographicProfiles?.regional?.town?.[county]||{}).map(name=>({name})):
      legislativeAreaGeometry?.towns.filter(f=>f.county===county)||[];
    const seen=new Set(),options=[];
    for(const f of candidates){const name=f.name;if(seen.has(name))continue;seen.add(name);options.push(name)}
    options.sort((a,b)=>scale==='district'?HistoryLegislative.districtNumber(a)-HistoryLegislative.districtNumber(b):a.localeCompare(b,'zh',{numeric:true}));
    if(!options.includes(legislativeFocus))legislativeFocus='';
    focusLabel.textContent=scale==='district'?'选举区':'乡镇市区';
    focusSelect.replaceChildren(new Option(scale==='district'?'全部选举区':'全部乡镇市区',''),...options.map(name=>new Option(name,name)));
    focusSelect.value=legislativeFocus;
   }
   if(el('historyLegislativeMapHint')){el('historyLegislativeMapHint').hidden=false;el('historyLegislativeMapHint').textContent=
    legislativePartyTownView()?(county?'各乡镇市区以当届实际政党票分别上色；可切换领先政党或指定政党的得票数、得票率，点击乡镇查看各党完整结果。':'全台368个乡镇市区直接按各地真实政党票上色，点击任一乡镇即可查看当地各党得票。2008年按当年行政区统计，不按现行县市比例推算。'):
    regionalLegislativeTownView()?'按各乡镇市区最高票候选人所属政党着色，点击地区查看逐候选人得票。':legislativeBallot==='regional'?(!county?(scale==='district'?(legislativeYear<2008?'全部地区的选举区地图按当届选区范围显示逐席当选党徽，点击选区可查看详细结果。':'全部地区的单席选举区按各区当选政党分别填色，点击选区查看详细结果。'):(legislativeYear<2008?'全台按各县市区域民代当选席次最多的政党填色；并列最多使用多党斜纹。点击县市进入后，各多席选区逐席显示党徽。':'全台单席选区按当选政党填色，点击选区进入县市查看完整结果。')):scale==='county'?(legislativeYear<2008?'县市图在各多席选区显示当选党徽，点击选区可查看候选人、得票率与当选结果。':'县市图显示当届选区和选区号；点击选区查看完整候选人、得票率与当选结果。'):'选举区图聚焦本区候选人及法定当选席次。'):
    !county?'':scale==='county'?'县市得票分布；选择乡镇市区层级可继续下钻。':'点击乡镇市区查看得票分布。';el('historyLegislativeMapHint').hidden=allLegislative()||!el('historyLegislativeMapHint').textContent;}

  }else{if(el('historyFocusBox'))el('historyFocusBox').hidden=true;if(el('historyLegislativeMapHint'))el('historyLegislativeMapHint').hidden=true;el('historyScale').replaceChildren(new Option('县市','district'),new Option('乡镇市区','town'));el('historyScale').value=scale;if(kind==='council'){
   const options=[['all','全部类型（分别统计）'],['regional','区域议员'],['plains','平地少数民族议员'],['mountain','山地少数民族议员'],['indigenous','少数民族议员']];
   const available=localGeometry?options.filter(([id])=>id==='all'||db.council.some(row=>row.electorate===id)):options.slice(0,4);
   if(!available.some(([id])=>id===electorate))electorate='all';
   el('historyElectorate').replaceChildren(...available.map(([id,label])=>new Option(label,id)));
  }}
  if(el('historyElectorateBox'))el('historyElectorateBox').hidden=kind!=='council'&&!legislativeMode;if(el('historyElectorate'))el('historyElectorate').value=electorate;
  if(el('historyLegislativeNote')){el('historyLegislativeNote').hidden=!legislativeMode;el('historyLegislativeNote').textContent=allLegislative()?(legislativeYear<2008?'2008年前无独立政党票；不分区小图仅使用档案已有的席次计算票资料。':'区域显示选区当选结果，其余三图显示各地区最高票政党或候选人。'):HistoryLegislative.note(legislativeYear,legislativeBallot)||(legislativeYear>=2008&&legislativeBallot==='party'?'可按县市及全台368个乡镇市区查看原始政党票得票。得票数字精准对应当届行政区；历史地图边界采用可匹配的现有轮廓。':'2008年起不分区采用独立政党票；区域选举为单一选区一席。')}
  const legislativeBadges=legislativeMode&&legislativeBallot==='regional'&&legislativeYear<2008&&!regionalLegislativeTownView();
  const metrics=[['party',allLegislative()?'各类型选举结果（分别统计）':kind==='council'||legislativeBadges?'当选席次':presidentialMode?(scale==='town'?'各乡镇市区最高票候选人所属政党':'各县市最高票候选人所属政党'):legislativeMode?(legislativeBallot==='party'?'各地区领先政党':'各地区最高票候选人所属政党'):mayorTownView()?'各乡镇市区最高票候选人':'当选结果']];
  if(kind==='council'||legislativeBadges)metrics.push(['seats','指定政党席次']);
  if(!allLegislative()&&(kind!=='council'||county||legislativeMode))metrics.push(['share','得票率'],['votes','得票数']);
  if(!metrics.some(([id])=>id===metric))metric='party';
  const parties=[...new Set((legislativeMode?db.legislative.filter(r=>legislativeBallot==='party'||r.elected):db.council.filter(r=>r.elected)).map(r=>r.party))].sort();
  if(!parties.includes(selectedParty))selectedParty=parties[0]||'';
  el('historyPartyBox').hidden=metric!=='seats';
  el('historyParty').replaceChildren(...parties.map(p=>new Option(p,p)));el('historyParty').value=selectedParty;
  const select=el('historyMetric');select.replaceChildren(...metrics.map(([v,l])=>new Option(l,v)));select.value=metric;
   el('historyCandidateScopeBox').hidden=!voteMetric();el('historyCandidateScope').value=candidateScope;
  const isPartyVote=legislativeMode&&legislativeBallot==='party';
  el('historyCandidateScope').querySelector('option[value="top"]').textContent=isPartyVote?'各地区领先政党':'最高票候选人';
  el('historyCandidateScope').querySelector('option[value="candidate"]').textContent=isPartyVote?'指定政党':'指定候选人';
  const candidateLabel=document.querySelector('label[for="historyCandidate"]');if(candidateLabel)candidateLabel.textContent=isPartyVote?'政党':'候选人';
  el('historyCandidateBox').hidden=!voteMetric()||candidateScope!=='candidate';
  if(!voteMetric()||candidateScope!=='candidate')return;
  const choices=new Map();for(const r of recordsInView())choices.set(candidateKey(r),r);
  if(!choices.has(selectedCandidate))selectedCandidate=choices.keys().next().value||'';
  el('historyCandidate').replaceChildren(...[...choices].map(([id,r])=>new Option(isPartyVote?r.party:(presidentialMode?'':r.county+' · ')+displayedCandidateName(r)+' · '+r.party,id)));el('historyCandidate').value=selectedCandidate;
 }
 function openHistoryRegion(f){
  lastOpenedFeature=f;routeDetail={area:f.name,detailCounty:f.county,identity:f.electorate||''};
  const key=featureKey(f),rows=currentResult?.rows.filter(r=>areaKey(r)===key)||[];
  const district=historicalDistrictFor(f),contest=localContest(f,district),actualYear=contestYear(contest);
  el('historyDialogTitle').textContent=(f.county===f.name?f.name:f.county+' · '+f.name)+' · '+actualYear+'年 '+(presidentialMode?'台湾地区领导人':legislativeMode?(HistoryLegislative.ballots(legislativeYear).find(item=>item.value===(allLegislative()?f.electorate:legislativeBallot))?.label||'立法机构民代'):kind==='mayor'&&f.county.endsWith('市')?'市长':titles[kind])+'选举结果';
  const body=el('historyDialogRows'),table=body.closest('table'),wrap=table.parentElement;
  const partyBallotDialog=legislativeMode&&(legislativeBallot==='party'||allLegislative()&&f.electorate==='party');
  const hiddenColumns=new Set(partyBallotDialog?[0,2,3,4,7,8]:[]);
  el('historyResultDialog').classList.toggle('history-party-vote-dialog',partyBallotDialog);
  if(table.tHead.rows[0]?.cells[1])table.tHead.rows[0].cells[1].textContent=partyBallotDialog?'政党':'候选人';
  // Display both offices' verified genders for presidential tickets.
  if(table.tHead.rows[0]?.cells[2])table.tHead.rows[0].cells[2].textContent=presidentialMode?'性别（正/副）':'性别';
  // Show both columns, including on narrow screens; retain dash fallback if needed.
  [...table.tHead.rows[0].cells].forEach((cell,i)=>{cell.hidden=hiddenColumns.has(i)});
  wrap.hidden=!rows.length;
  const missing=el('historyDialogMissing');
  missing.hidden=partyBallotDialog||!rows.length||!hiddenColumns.size;
  missing.textContent='本选区历史资料缺少'+[...hiddenColumns].map(i=>table.tHead.rows[0].cells[i].textContent).join('、')+'字段。';
  body.replaceChildren();
  for(const r of [...rows].sort((a,b)=>b.votes-a.votes)){
   const tr=document.createElement('tr');
   if(isOfficialWinner(r))tr.className='history-elected-row';
   for(const [i,value] of [r.number||'—',partyBallotDialog?r.party:displayedCandidateName(r),displayedGender(r),incumbentLabel(r),r.party,r.votes.toLocaleString('zh-CN'),(r._share||0).toFixed(2)+'%',''].entries()){
    if(hiddenColumns.has(i))continue;
    const td=document.createElement('td');
    if(i===3&&r.incumbent==null)td.title='现任资料缺失';
    const logo=i===4||partyBallotDialog&&i===1?logoFor(predictionParty(r.party)):'';
    if(logo){const img=document.createElement('img');img.src=logo;img.alt='';const party=document.createElement('span');party.className='history-party-cell';party.append(img,value);td.append(party)}
    if(i===7){if(!allLegislative()||f.electorate==='regional')appendResultMark(td,r)}else if(i===3)appendIncumbentTag(td,value);else if(!logo)td.append(value);tr.append(td);
   }
   if(!partyBallotDialog)appendMobileCandidateDetails(tr,[['号次',r.number],['性别',displayedGender(r)],['选举时现任',incumbentLabel(r)],['得票率',(r._share||0).toFixed(2)+'%']]);
   body.append(tr);
  }
  el('historyDialogMessage').textContent=!rows.length?(noElection(f)?yearLabel()+'年本区域不举行乡镇市区长选举。':'暂无该层级的历史数据。'):district?
   '应选 '+district.seats+' 席 · 妇保 '+(sharedWomenText(district.womenReservedGroup)||(district.womenReserved==null?'暂无资料':district.womenReserved+' 席'))+' · 有效票 '+rows.reduce((n,r)=>n+r.votes,0).toLocaleString('zh-CN'):
   (legislativeMode?(partyBallotDialog?'本地区政党得票与得票率':legislativeBallot==='regional'&&legislativeYear<2008&&!regionalLegislativeTownView()?'本届多席选区的当选者与得票':'本地区候选人得票及选举结果'):mayorTownView()?'本地区得票':presidentialMode?'当地候选人得票与全台当选标记':actualYear+'年得票与当选结果');
  if(rows.length)el('historyDialogMessage').append(' · '+rows.length+(partyBallotDialog?' 个政党':' 位候选人')+' · 按得票数排序');
  if(snapshotData?.cycleYears||partialTownship()){
   if(contest?.election_date)el('historyDialogMessage').append(' · 投票日期 '+contest.election_date);
   if(contest?.source_url)appendContestSource(contest);
  }
  renderDialogScope(f,district);
  if(district?.womenReservedMethod==='statutory')el('historyDialogMessage').append(' · 妇保按当届规定计算');
  if(f.historicalBoundaryNote)el('historyDialogMessage').append(' · '+f.historicalBoundaryNote);
  if(rows.some(r=>r.tally_basis==='original_opening'))el('historyDialogMessage').append(' · 投票日原始开票；当选标记依据全市正式结果');
  else if(rows.some(r=>r.tally_basis==='certified_recount'))el('historyDialogMessage').append(' · 重计票结果；当选标记依据全市正式结果');
  if(kind==='mayor'&&localYear===2022&&f.county==='嘉义市')el('historyDialogMessage').append(' · 2022年12月18日重行投票');
  const dialog=el('historyResultDialog'),hint=el('historyDialogScroll');
  const overviewButton=el('historyDialogOverview');
  if(overviewButton){
   overviewButton.hidden=!window.HistoryWorkspace?.openFeatureOverview;
   overviewButton.textContent=kind==='council'?'查看本议员选区概况':legislativeMode&&legislativeBallot==='regional'&&!regionalLegislativeTownView()&&f.name!==f.county?'查看本选区概况':
    f.county===f.name?'查看本县市概况':'查看本乡镇市区概况';
   overviewButton.onclick=()=>{dialog.close();window.HistoryWorkspace?.openFeatureOverview?.(f)};
  }
  hint.hidden=true;if(!dialog.open)dialog.showModal();window.dispatchEvent(new Event('site-route-change'));
  wrap.scrollLeft=0;wrap.scrollTop=0;
  hint.hidden=wrap.scrollWidth<=wrap.clientWidth;
  el('historyDialogDrilldown').hidden=!(kind==='mayor'&&scale==='district');el('historyDialogBack').hidden=!county;
 }
 function openContestById(contestId,summary){
  if(!summary)return;
  routeDetail={contest:contestId};
  el('historyResultDialog').classList.remove('history-party-vote-dialog');
  const headers=el('historyDialogRows').closest('table').tHead.rows[0].cells;
  [...headers].forEach(cell=>{cell.hidden=false});
  if(headers[1])headers[1].textContent='候选人';
  if(headers[2])headers[2].textContent='性别';
  const popupWrap=el('historyDialogRows').closest('.history-table-wrap');
  if(popupWrap){popupWrap.hidden=false;popupWrap.scrollLeft=0;popupWrap.scrollTop=0;}
  if(el('historyDialogMissing'))el('historyDialogMissing').hidden=true;
  if(el('historyDialogScroll'))el('historyDialogScroll').hidden=true;
  lastOpenedFeature=null;const contest=summary.contest,rows=summary.candidacies,body=el('historyDialogRows');el('historyDialogTitle').textContent=(contest.county_name===contest.district_name?contest.county_name:contest.county_name+' · '+contest.district_name)+' · '+contestYear(contest)+'年 '+officeTitle()+'选举结果';el('historyDialogMessage').textContent=(contest.seats!=null?'应选 '+contest.seats+' 席 · 妇保 '+(sharedWomenText(contest.reserved_seats_group)||(contest.reserved_seats==null?'暂无资料':contest.reserved_seats+' 席'))+' · ':'')+'有效票 '+summary.validVotes.toLocaleString('zh-CN')+' · '+rows.length+' 位候选人 · 按得票数排序';body.replaceChildren();
  if(contest.election_date)el('historyDialogMessage').append(' · 投票日期 '+contest.election_date);
  const detailDistrict=kind==='council'?districtMetadata.find(d=>d.id===contestId||d.county===norm(contest.county_name)&&d.electorate===HistoryCore.identity(contest.electorate)&&String(d.number)===districtNumber(contest.district_name)):null;
  const detailFeature=legislativeMode?legislativeGeometry.find(f=>f.county===norm(contest.county_name)&&String(f.number)===String(HistoryLegislative.districtNumber(contest.district_name)))||{county:norm(contest.county_name),name:norm(contest.district_name)}:null;
  renderDialogScope(detailFeature,detailDistrict);
  if(contest.reserved_seats_method==='statutory')el('historyDialogMessage').append(' · 妇保按当届规定计算');
  if(contest.source_url)appendContestSource(contest);
  for(const r of [...rows].sort((a,b)=>b.votes-a.votes)){const tr=document.createElement('tr');if(r.elected_official)tr.className='history-elected-row';for(const [i,value] of [r.ballot_number||'—',r.candidate_name,r.gender||'—',r.incumbent_at_election===true?'现任':'',r.party_name,r.votes.toLocaleString('zh-CN'),Number(r.vote_share||0).toFixed(2)+'%',''].entries()){const td=document.createElement('td');if(i===7&&r.elected_official){const mark=document.createElement('img');mark.src='assets/elected-mark.png';mark.alt='当选';mark.width=18;mark.height=18;td.append(mark)}else if(i===4){const logo=logoFor(predictionParty(value));if(logo){const img=document.createElement('img');img.src=logo;img.alt='';const party=document.createElement('span');party.className='history-party-cell';party.append(img,value);td.append(party)}else td.textContent=value}else if(i===3)appendIncumbentTag(td,value);else td.textContent=value;if(i===3&&r.incumbent_at_election==null)td.title='现任资料缺失';tr.append(td)}
   appendMobileCandidateDetails(tr,[['号次',r.ballot_number],['性别',r.gender],['选举时现任',tr.cells[3].textContent],['得票率',tr.cells[6].textContent]]);
   body.append(tr)
  }
  const overviewButton=el('historyDialogOverview');
  if(overviewButton){overviewButton.hidden=false;overviewButton.textContent='查看本选区概况';
   overviewButton.onclick=()=>{el('historyResultDialog').close();window.HistoryWorkspace?.openContestOverview?.(contestId)};}
  el('historyDialogDrilldown').hidden=true;el('historyDialogBack').hidden=!county;if(!el('historyResultDialog').open)el('historyResultDialog').showModal();window.dispatchEvent(new Event('site-route-change'));
 }
 function exportRows(){
  const result=currentResult;
  if(!state.exportSettings.winnerTable||!result||(metric==='seats'&&state.exportSettings.candidateScope!=='all')||(historyOverview()&&kind==='mayor'))return [];
  const showAll=state.exportSettings.candidateScope==='all';
  // A town-level mayor map shows local vote distributions; the office is
  // elected county-wide. Use the county-wide result for elected-only tables
  // instead of misleadingly showing one township's tally as the winner total.
  const countyWinner=kind==='mayor'&&!presidentialMode&&mayorTownView()&&!showAll;
  const records=(countyWinner?db.mayor.filter(r=>r.level==='county'&&(!county||r.county===county)):legislativeMode&&(legislativeBallot!=='regional'||regionalLegislativeTownView())?legislativeResultRows():recordsInView())
   .filter(r=>!exportPanelFilter||kind!=='council'||r.electorate===exportPanelFilter);
  const totals=new Map();
  if(countyWinner)for(const row of records)totals.set(row.county,(totals.get(row.county)||0)+row.votes);
  const ordered=showAll||legislativeMode&&legislativeBallot==='party'?records:records.filter(r=>isOfficialWinner(r)&&(!allLegislative()||r.electorate==='regional'));
  ordered.sort((a,b)=>HistoryCore.compareResultRows(a,b,kind));
  return ordered.map(r=>{
   const party=predictionParty(r.party);
   const scope=[allLegislative()?electorateName(r.electorate):'',r.county,r.town||r.district].filter(Boolean).filter((name,i,items)=>items.indexOf(name)===i).join(' · ');
   const share=countyWinner?(totals.get(r.county)?r.votes/totals.get(r.county)*100:0):(r._share||0);
   return {historical:true,presidentialTicket:presidentialMode,estimated:false,district:scope,
    number:r.number,name:displayedCandidateName(r),gender:displayedGender(r),incumbent:r.incumbent===true?'现任':'',party:r.party,color:party.color,logo:logoFor(party),
    votes:r.votes.toLocaleString('zh-CN'),share:share.toFixed(2)+'%',elected:isOfficialWinner(r),allCandidates:showAll};
  });
 }
 function featurePresentation(feature){
  const region=kind==='council'&&historyOverview()?{partyCounts:currentResult?.countySeats.get(feature.county)||new Map()}:currentResult?.regions.get(featureKey(feature));
  if(window.HistoryWorkspace?.featurePresentation){const badgeMode=legislativeMode&&legislativeBallot==='regional'&&legislativeYear<2008&&!regionalLegislativeTownView();return window.HistoryWorkspace.featurePresentation({office:badgeMode?'council':legislativeMode?'mayor':presidentialMode?'president':kind,level:legislativeMode?scale:mayorTownView()?'town':kind==='council'?'district':kind==='township'?'town':'county',metric,region,partyColor})}
  return{fill:kind==='council'?'#f0f3ed':'#edf1e9',badgeItems:[],tooltip:'暂无该层级数据',ariaLabel:'暂无该层级数据'};
 }
 function exportMetadata(){
  const office=presidentialMode?'president':kind;
  const election=snapshotData?.elections?.find(item=>item.office===office&&(!legislativeMode||item.electorate===legislativeBallot))||snapshotData?.elections?.[0];
  const source=partialTownship()?'地方选举委员会原始清册、地方志、统计年报及同期报纸':
   archivedCouncil()?'选举事务主管机构公开资料、地方选务档案转录':
   mainlandTerms(election?.source_name||'台湾地区选举事务主管机构公开资料')+(legislativeMode&&legislativeYear===1992?'（政治大学选举研究数据库）':'（经 taiwanvotes.tw 整理）');
  const metadata=['资料来源：'+source,'行政区边界版本：'+(snapshotData?.cycleYears?yearLabel():election?.boundary_version||yearLabel()),'历史数据架构版本：'+(snapshotData?.schemaVersion||2)];
  if(!presidentialMode&&!legislativeMode&&localYear===2018&&kind==='mayor'&&(!county||county==='台北市')){
   metadata[0]='资料来源：中央选举委员会、政大选举研究中心';
   metadata.push(mayorTownView()?'台北市全市及12区计票版本：法院重计结果。':'台北市全市计票版本：法院重计结果。');
  }
  return metadata;
 }
 function syncOverviewMap({scope='all',county:selectedCounty='',area='',districtName=''}={}){
  if(!active||!loaded)return false;
  const nextCounty=scope==='all'?'':selectedCounty;
  if(nextCounty&&!Array.from(el('historyCounty').options).some(opt=>opt.value===nextCounty))return false;
  county=nextCounty;legislativeFocus='';
  if(legislativeMode){
   scale=scope==='all'?'county':scope==='district'?'district':scope==='town'?'town':'county';
   if(scope==='district')legislativeFocus=districtName||
    snapshotData?.contests?.find(c=>c.contest_id===area)?.district_name||'';
   if(scope==='town')legislativeFocus=area;
  }else{
   scale=scope==='town'?'town':'district';
  }
  el('historyCounty').value=county;
  resultPage=0;switchMode();render();
  return true;
 }
 function syncOverviewFocus(){
  const selected=window.HistoryWorkspace?.selectedOverviewScope?.(),
   workspace=window.HistoryWorkspace?.selection?.();
  const focused=workspace?.view==='overview'&&
   ['district','town'].includes(selected?.scope)&&selected?.county===county;
  const selectedContest=focused&&snapshotData?.contests?.find(c=>c.contest_id===selected.area);
  let target=null;
  if(focused){
   target=currentItems().find(feature=>{
    if(feature.county!==county)return false;
    if(kind==='council')return selectedContest&&
     HistoryCore.identity(selectedContest.electorate)===feature.electorate&&
     districtNumber(selectedContest.district_name)===String(feature.number);
    if(legislativeMode&&legislativeBallot==='regional'&&selected.scope==='district')
     return districtNumber(feature.number??feature.name)===districtNumber(selectedContest?.district_name||'');
    if(kind==='township')return feature.name===selectedContest?.district_name;
    return feature.name===selected.area;
   });
  }
  const targetId=target?.id||'';
  for(const path of el('regions').querySelectorAll('path[data-region]'))
   path.classList.toggle('history-overview-focused-region',!!targetId&&path.dataset.region===targetId);
  for(const card of el('labels').querySelectorAll('[data-seat-region]'))
   card.classList.toggle('seat-region-highlighted',!!targetId&&card.dataset.seatRegion===targetId);
 }

 function routeSelection(){
  const office=presidentialMode?'president':legislativeMode?'legislative':kind;
  const year=presidentialMode?presidentialYear:legislativeMode?legislativeYear:localYear;
  const workspace=window.HistoryWorkspace?.selection?.(),v=workspace?.view||'map';
  const overview=v==='overview'?window.HistoryWorkspace?.selectedOverviewScope?.():null;
  const result={office,year,yearLabel:yearLabel(),county,level:legislativeMode?scale:kind==='mayor'?(scale==='town'?'town':'county'):kind==='council'?'district':'town',metric,
   electorate:legislativeMode?legislativeBallot:kind==='council'?electorate:undefined,focus:legislativeMode?legislativeFocus:undefined,view:v,
   candidateScope:voteMetric()?candidateScope:undefined,candidate:voteMetric()&&candidateScope==='candidate'?selectedCandidate:undefined,party:metric==='seats'?selectedParty:undefined,
   scope:overview?.scope,overviewCounty:overview?.scope!=='all'?overview?.county:undefined,overviewArea:['district','town'].includes(overview?.scope)?overview?.area:undefined,
   years:v==='trends'?window.HistoryTrendsUI?.routeYears?.():undefined};
  if(el('historyResultDialog').open&&routeDetail)Object.assign(result,routeDetail);
  return result;
 }
 function routeReady(route){
  const current=routeSelection(),target=HistoryLocal.cycleYear(Number(route.year),route.office);
  const years=route.office==='president'?HistoryPresidential.YEARS:route.office==='legislative'?HistoryLegislative.YEARS:HistoryLocal.years(route.office,history2026Manifest?.status==='published');
  const expected=years.includes(target)?target:['president','legislative'].includes(route.office)?2024:2022;
  return active&&current.office===route.office&&current.year===expected&&snapshotData?.year===expected&&snapshotData?.elections?.some(e=>e.office===route.office)&&el('historyLoadStatus').hidden;
 }
 async function restoreRoute(route,isCurrent=()=>true){
  if(!active)activate();
  // A previous dialog is not part of the requested view.
  if(el('historyResultDialog').open)el('historyResultDialog').close();routeDetail=null;
  if(!await snapshot()||!isCurrent())return false;
  if(Number(route.year)===2026)await check2026Availability();
  if(!isCurrent())return false;
  const office=route.office;
  el('historyOffice').value=office;
  updateYearOptions(office);
  const available=Array.from(el('historyYear').options,o=>Number(o.value));
  const target=HistoryLocal.cycleYear(Number(route.year),office);
  const year=available.includes(target)?target:['president','legislative'].includes(office)?2024:2022;
  el('historyYear').value=String(year);
  const previous=routeSelection();
  if(previous.office!==office||previous.year!==year||snapshotData?.year!==year||!snapshotData?.elections?.some(e=>e.office===office)){
   if(office==='president')await activatePresidential(year);
   else if(office==='legislative')await activateLegislative(year);
   else await activateLocalYear(year,office);
  }
  if(!isCurrent()||!routeReady(route))return false;
  county=Array.from(el('historyCounty').options).some(o=>o.value===route.county)?route.county:'';
  if(legislativeMode){
   const ballots=HistoryLegislative.ballots(year).map(b=>b.value);
   legislativeBallot=ballots.includes(route.electorate)?route.electorate:'all';electorate=legislativeBallot;
   const levels=HistoryLegislative.levels(year,legislativeBallot).map(x=>x[0]);
   scale=levels.includes(route.level)?route.level:levels[0];legislativeFocus=route.focus||'';
  }else{
   scale=kind==='mayor'&&route.level==='town'?'town':'district';
   if(kind==='council')electorate=['all','regional','plains','mountain','indigenous'].includes(route.electorate)?route.electorate:'all';
  }
  metric=['party','seats','share','votes'].includes(route.metric)?route.metric:'party';
  candidateScope=route.candidateScope==='candidate'?'candidate':'top';selectedCandidate=route.candidate||'';selectedParty=route.party||'';
  resultPage=0;switchMode();render();
  window.HistoryWorkspace?.restoreRouteView?.(route);
  if(route.view==='trends'&&route.years!==undefined)window.HistoryTrendsUI?.restoreRouteYears?.(route.years);
  if(!isCurrent())return false;
  if(route.contest)window.HistoryWorkspace?.openContest?.(route.contest);
  else if(route.area){
   const f=currentItems().find(f=>f.name===route.area&&f.county===(route.detailCounty||county)&&(!route.identity||f.electorate===route.identity));
   if(f)openHistoryRegion(f);
  }
  return true;
 }
 el('historyResultDialog').addEventListener('close',()=>{if(!el('historyResultDialog').open){routeDetail=null;window.dispatchEvent(new Event('site-route-change'))}});

 window.History2022View={routeSelection,restoreRoute,routeReady,yearLabel,metricLabel,exportRows,exportMetadata,featurePresentation,active:()=>active,activate,deactivate,syncOverviewMap,
  combinedMap,combinedIdentities,allLegislative,allCouncil,countySeatLeader,kind:()=>kind,office:()=>presidentialMode?'president':legislativeMode?'legislative':kind,year:()=>presidentialMode?presidentialYear:legislativeMode?legislativeYear:localYear,overview:historyOverview,seatMode:historyCouncilSeats,items:historyItems,noElection,districtFor:historicalDistrictFor,seatRows:historicalSeatRows,historicTownFeatures:()=>presidentialMode?presidentialGeometry?.towns||[]:legislativeMode?legislativeAreaGeometry?.towns||[]:localGeometry?.towns||null,allTowns:()=>presidentialMode?presidentialGeometry?.towns||[]:legislativeMode?legislativeAreaGeometry?.towns||[]:localGeometry?.towns||data?.towns||[],openRegion:openHistoryRegion,openContest:openContestById,features:()=>historicalFeatures,legislativeFeatures:()=>legislativeMode?legislativeGeometry:[],legislativeNationwide:legislativeNationalView,legislativeBadgesMode:legislativeMultiView,legislativeCountyFeatures:()=>legislativeMode?legislativeAreaGeometry?.counties||[]:[],historicalCountyFeatures:()=>legislativeMode?legislativeAreaGeometry?.counties||[]:localGeometry?.counties||data.counties,legislativeSeatRows:f=>legislativeMode&&(!allLegislative()||f.electorate==='regional')?HistoryLegislative.winners(snapshotData,{county:f.county,district:f.electorate==='regional'?f.name:''}):[],legislativeBallot:()=>legislativeBallot,legislativeScale:()=>scale,snapshot:()=>snapshotData,trendFilters:()=>({focus:legislativeMode?legislativeFocus:'',candidateScope,party:selectedParty,candidate:candidateScope==='candidate'&&voteMetric()?(()=>{const r=recordsInView().find(r=>candidateKey(r)===selectedCandidate);return r?{name:r.name,party:r.party,county:r.county,district:r.district,town:r.town}:null})():null}),trendCounties:()=>data?.counties||[],trendSnapshot:async year=>{if(year===2022){if(!await snapshot())throw Error('2022年资料未载入');return history2022Snapshot}if(year!==2026||history2026Manifest?.status!=='published')throw Error('该届正式资料尚未发布');if(history2026Snapshot)return history2026Snapshot;const response=await fetch('assets/history-2026.json?v='+history2026Manifest.sha256.slice(0,14));if(!response.ok)throw Error('2026年资料载入失败');const shard=await response.json();if(shard.schemaVersion!==2||shard.year!==2026||shard.completeness!=='full'||shard.contests?.length!==history2026Manifest.districtCount||shard.candidacies?.length!==history2026Manifest.candidateCount||!['provisional','certified'].includes(shard.publicationStatus))throw Error('2026年正式结果校验未通过');return shard}};
 const resultSection=el('historyResultSection')||(()=>{const section=document.createElement('section');section.id='historyResultSection';section.hidden=true;section.className='history-result-section';const heading=document.createElement('h3');heading.textContent='2022 选举结果';section.append(heading,el('historySummary'),el('historySearchTools'),el('historyResults'),el('historyPager'),el('historyCompare'));el('districtReference').before(section);return section})();
 if(!el('historyResultParty')){const partyLabel=document.createElement('label');partyLabel.className='label';partyLabel.htmlFor='historyResultParty';partyLabel.textContent='筛选政党';const partySelect=document.createElement('select');partySelect.id='historyResultParty';partySelect.append(new Option('全部政党',''));el('historySearchTools').append(partyLabel,partySelect)}
 const dialogNav=document.createElement('div');dialogNav.className='history-dialog-navigation';const dialogBack=document.createElement('button');dialogBack.type='button';dialogBack.id='historyDialogBack';dialogBack.className='button quiet';dialogBack.textContent='返回上一级';const dialogDrilldown=document.createElement('button');dialogDrilldown.type='button';dialogDrilldown.id='historyDialogDrilldown';dialogDrilldown.className='button primary';dialogDrilldown.textContent='查看乡镇市区得票分布';dialogNav.append(dialogBack,dialogDrilldown);const resultDialog=el('historyResultDialog');(resultDialog.querySelector('.floating-dialog-scroll')||resultDialog).append(dialogNav);
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
  if(selected==='legislative'){activateLegislative(year);return}
  activateLocalYear(year,selected);
 };
 el('historyYear').onchange=()=>{
  if(el('historyOffice').value==='president')activatePresidential(Number(el('historyYear').value));
  if(el('historyOffice').value==='legislative')activateLegislative(Number(el('historyYear').value));
  if(!['president','legislative'].includes(el('historyOffice').value))activateLocalYear(Number(el('historyYear').value));
 };
 if(el('historyElectorate'))el('historyElectorate').onchange=()=>{electorate=el('historyElectorate').value;if(legislativeMode){legislativeBallot=electorate;scale='county';legislativeFocus='';if(allLegislative())metric='party'}resultPage=0;switchMode();render()};
 el('historyCounty').onchange=()=>{county=el('historyCounty').value;legislativeFocus='';if(legislativeMode&&!legislativePartyTownView()&&!regionalLegislativeTownView()&&county)scale='county';resultPage=0;switchMode();render()};
 el('historyMetric').onchange=()=>{metric=el('historyMetric').value;render()};
 el('historyParty').onchange=()=>{selectedParty=el('historyParty').value;render()};
 el('historySearch').oninput=()=>{resultPage=0;if(currentResult)showRows(currentResult)};
 if(el('historyResultParty'))el('historyResultParty').onchange=()=>{resultPage=0;if(currentResult)showRows(currentResult)};
 el('historyPrev').onclick=()=>{resultPage--;showRows(currentResult)};
 el('historyNext').onclick=()=>{resultPage++;showRows(currentResult)};
 if(el('historyRetry'))el('historyRetry').onclick=()=>{if(el('historyOffice').value==='president'){activatePresidential(Number(el('historyYear').value));return}if(el('historyOffice').value==='legislative'){activateLegislative(Number(el('historyYear').value));return}activateLocalYear(Number(el('historyYear').value))};
 el('historyScale').onchange=()=>{scale=el('historyScale').value;if(legislativeMode){legislativeFocus='';el('historyCounty').value=county}switchMode();render()};
 if(el('historyFocus'))el('historyFocus').onchange=()=>{legislativeFocus=el('historyFocus').value;resultPage=0;switchMode();render()};
 el('historyCandidateScope').onchange=()=>{candidateScope=el('historyCandidateScope').value;render()};
 el('historyCandidate').onchange=()=>{selectedCandidate=el('historyCandidate').value;render()};
 for(const n of COUNTY_ORDER)el('historyCounty').add(new Option(n,n));
 const defaultDistrictSearch=el('districtTableSearch').oninput;
 el('districtTableSearch').oninput=event=>{if(active&&kind==='council')renderHistoryDistrictReference();else defaultDistrictSearch?.(event)};
 const defaultDistrictDownload=el('downloadDistrictTable').onclick;
 el('downloadDistrictTable').onclick=event=>{if(!active||kind!=='council')return defaultDistrictDownload?.(event);const lines=[['县市','选区','类别','选区范围','应选名额','妇保名额','地图匹配'],...districtMetadata.filter(d=>(!county||norm(d.county)===county)).map(d=>[norm(d.county),d.name,DistrictCore.identityName(d),mainlandTerms(councilScopeText(d)),d.seats,sharedWomenText(d.womenReservedGroup)||d.womenReserved,d.mapAvailable===false||unmatchedDistricts.has(norm(d.county)+'|'+d.electorate+'|'+d.number)?'未匹配':'已匹配'])];const blob=new Blob(['\uFEFF'+lines.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=yearLabel().replaceAll('/','_')+'议员选区范围与名额.csv';a.click();URL.revokeObjectURL(url)};
 const formerReturn=el('returnTaiwanMap').onclick;el('returnTaiwanMap').onclick=()=>{if(!active)return formerReturn();const keepTownView=legislativePartyTownView()||regionalLegislativeTownView();county='';legislativeFocus='';if(legislativeMode)scale=keepTownView?'town':'county';el('historyCounty').value='';switchMode();render()};
 const defaultColor=fillColor;fillColor=function(feature){
  if(!active)return defaultColor(feature);
  if(allLegislative()){if(feature.unresolvedHistorical)return '#cbd3ce';const region=currentResult?.regions.get(featureKey(feature));if(feature.electorate==='regional'&&legislativeYear<2008)return '#f0f3ed';return region?.party?partyColor(region.party):'#edf1e9'}
  if(allCouncil()&&!county&&metric==='party'){const counts=currentResult?.panelSeats.get(feature.electorate+'|'+feature.county);const leaders=counts?seatTieLeaderColors(counts,partyColor):[];return leaders.length>1?seatTiePatternFill(leaders):leaders[0]?.color||'#edf1e9'}
  // Qianzhen was divided at village level in 2008–2016. Never attribute
  // its unresolved whole-town geometry to either constituency's winner.
  if(feature.unresolvedHistorical)return '#cbd3ce';
  if(metric==='seats'&&currentResult){
   const counts=allCouncil()&&!county?currentResult.panelSeats.get(feature.electorate+'|'+feature.county):county?currentResult.regions.get(featureKey(feature))?.partyCounts:currentResult.countySeats.get(feature.county);
   if(!counts)return '#edf1e9';
   const seats=counts.get(selectedParty)||0;return seats?tone(partyColor(selectedParty),seats,currentResult.seatRange):'#fff';
  }
  if(nationwideHistoricalSeatColors())return countySeatFill(feature.county||feature.name);
  if(presidentialMode){
   const result=currentResult?.regions.get(featureKey(feature));
   if(!result?.top)return '#edf1e9';
   const color=ticketMapColor(result.party,result.top.name);
   return metric==='party'?color:tone(color,metric==='votes'?result.top.votes||0:result.share,currentResult.range);
  }
  if(kind==='council'&&metric==='party')return featurePresentation(feature).fill;
  if(legislativeMultiView())return featurePresentation(feature).fill;
  if(legislativeMode&&metric==='party'){
   const local=currentResult?.regions.get(featureKey(feature));
   return local?.party?partyColor(local.party):'#edf1e9';
  }
  if(noElection(feature))return '#ffffff';
  const region=currentResult?.regions.get(featureKey(feature));
  return !region?'#edf1e9':!voteMetric()&&region.tie?seatTiePatternFill(seatTieLeaderColors(region.partyCounts,partyColor)):region.party?tone(partyColor(region.party),metric==='votes'?region.top?.votes||0:region.share,currentResult.range):'#edf1e9';
 };
 const defaultDetail=regionDetail;regionDetail=function(feature){if(!active)return defaultDetail(feature);if(allLegislative()){const region=currentResult?.regions.get(featureKey(feature));return region?.top?(feature.electorate==='regional'?'当选结果 · '+[...region.partyCounts].map(([p,n])=>p+' '+n+'席').join('、'):region.top.name+' · '+region.top.votes.toLocaleString('zh-CN')+'票 · '+region.share.toFixed(2)+'%'):'暂无该地区已核实数据'}if(allCouncil()&&!county){const counts=currentResult?.panelSeats.get(feature.electorate+'|'+feature.county);return counts?.size?[...counts].map(([p,n])=>p+' '+n+'席').join('、'):'暂无该类别当选席次'}if(metric==='seats'){const counts=county?currentResult?.regions.get(featureKey(feature))?.partyCounts:currentResult?.countySeats.get(feature.county);return counts?selectedParty+' · '+(counts.get(selectedParty)||0)+'席':'暂无该层级数据'}if(nationwideHistoricalSeatColors()){
   const leader=countySeatLeader(feature.county||feature.name);
   if(!leader.counts)return '本县市无可核实的当选席次';
   const detail=[...leader.counts].sort((a,b)=>b[1]-a[1]).map(([party,seats])=>party+' '+seats+'席').join('、');
   return(leader.tied?'当选席次并列最多':leader.party+'当选席次最多')+' · '+detail;
  }
  if(kind==='council'&&metric==='party')return featurePresentation(feature).tooltip;if(legislativeMultiView())return featurePresentation(feature).tooltip;if(historyOverview()&&kind!=='township'){return '点击查看'+feature.county+yearLabel()+'年结果'}if(noElection(feature))return yearLabel()+'年本区域不举行乡镇市区长选举';const region=currentResult?.regions.get(featureKey(feature));if(voteMetric())return region?.top?region.top.name+' · '+(metric==='votes'?region.top.votes.toLocaleString('zh-CN')+'票 · '+region.share.toFixed(2)+'%':region.share.toFixed(2)+'% · '+region.top.votes.toLocaleString('zh-CN')+'票'):'暂无该候选人得票数据';if(areaLeading())return region?.top?region.top.name+' · 得票领先 · '+region.top.votes.toLocaleString('zh-CN')+'票 · '+region.share.toFixed(2)+'%'+(feature.historicalBoundaryNote?' · '+feature.historicalBoundaryNote:''):'暂无本地区得票资料';return !region?'历史数据未匹配':region.tie?'各党当选席次并列':region.party+' · '+region.seatCount+'席'};
 const defaultPushHistory=pushHistory;pushHistory=function(){if(!active)return defaultPushHistory()};
 const defaultPaint=paint;paint=function(feature){if(!active)return defaultPaint(feature);if(allLegislative()){if(!county){county=feature.county;el('historyCounty').value=county;switchMode();render();return}openHistoryRegion(feature);return}if(legislativeMode){
   if((legislativePartyTownView()||regionalLegislativeTownView())&&!county){county=feature.county;legislativeFocus='';el('historyCounty').value=county;switchMode();render();openHistoryRegion(feature);return}
   if(!county){county=feature.county;scale='county';legislativeFocus='';el('historyCounty').value=county;switchMode();render();return}
   if(legislativeBallot==='regional'&&scale==='county'){scale='district';legislativeFocus=feature.name;switchMode();render();openHistoryRegion(feature);return}
   if(legislativeBallot!=='regional'&&scale==='county'){scale='town';legislativeFocus='';switchMode();render();return}
   openHistoryRegion(feature);return
  }if(historyOverview()){
   const nextCounty=feature.county||feature.name;
   if(archivedCouncil()&&nextCounty==='金门县')return toast('金门县议员选举的完整候选人得票明细待补');
   county=nextCounty;el('historyCounty').value=county;switchMode();render()
  }else openHistoryRegion(feature)};
 const defaultSaveState=projectStateForSave;projectStateForSave=function(){return active&&savedMapScope?savedMapScope:defaultSaveState()};
 const defaultRender=render;render=function(){if(active&&data){delete el('legend').dataset.historyBox;syncHistoryControls();currentResult=analyze()}defaultRender();if(active){update();for(const id of ['workspacePrediction','workspaceFree']){el(id).classList.remove('active');el(id).setAttribute('aria-pressed','false')}}};
 function showComparison(result){
  const root=el('historyCompare');
  root.hidden=localYear!==2022||presidentialMode||legislativeMode||mayorTownView()||historyOverview()&&kind==='mayor';
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
