/* Read-only historical archive coverage. No election values are inferred. */
(function(root){
 'use strict';
 const fields={registered_voters:'选举人数',ballots_cast:'投票人数',valid_votes:'有效票',invalid_votes:'无效票'};
 const officeNames={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人',legislative:'立法机构民代'};
 const labels={recorded:'已收录',partial:'部分缺失',missing:'缺档',unknown:'待核实',na:'不适用',error:'读取失败'};
 const valid=v=>Number.isSafeInteger(v)&&v>=0;
 const defaultNorm=v=>String(v||'').trim().replaceAll('臺','台').replaceAll('縣','县').replaceAll('蓮','莲').replaceAll('東','东').replaceAll('門','门').replaceAll('雲','云').replaceAll('連','连').replaceAll('園','园');
 // Administrative existence is not a vote result. Preserve each merger's old city/county.
 const mergedCities=['台中市','台南市','高雄市'];
 const oldCounties=['台北县','台中县','台南县','高雄县'];
 const renamedPairs=[['台北县','新北市',2010],['桃园县','桃园市',2014]];
 const knownCounties=new Set(['台北市','新北市','桃园市','台中市','台南市','高雄市','基隆市','新竹市','嘉义市','新竹县','苗栗县','彰化县','南投县','云林县','嘉义县','屏东县','宜兰县','花莲县','台东县','澎湖县','金门县','连江县',...oldCounties,'桃园县',...mergedCities.map(c=>'原'+c)]);
 const countyKey=(name,year)=>mergedCities.includes(name)&&year<2010?'原'+name:name;
 function applicability(name,year,office){
  year=Number(year);
  if(!knownCounties.has(name)||!Number.isInteger(year))return null;
  for(const [oldName,newName,start] of renamedPairs){
   if(name===oldName&&year>=start)return {status:'na',reason:'当届已改为'+newName+'，请查看对应地区。'};
   if(name===newName&&year<start)return {status:'na',reason:'当届仍为'+oldName+'，请查看对应地区。'};
  }
  if(oldCounties.includes(name)&&name!=='台北县'&&year>=2010)return {status:'na',reason:'当届已完成县市合并。'};
  if(name.startsWith('原')&&mergedCities.includes(name.slice(1))&&year>=2010)return {status:'na',reason:'当届已完成县市合并。'};
  if(mergedCities.includes(name)&&year<2010)return {status:'na',reason:'当届尚未合并，原县、市分别列示。'};
  if(office==='township'){
   const always=['台北市','基隆市','新竹市','嘉义市','原台中市','原台南市','原高雄市','台南市'];
   const restructured=['新北市','台中市','高雄市'];
   if(always.includes(name)||restructured.includes(name)&&year<2014)return {status:'na',reason:'当届该地区未举行乡镇市区长选举。'};
  }
  return null;
 }
 function matrixEntry(result,county,year,office){
  if(result?.error)return {status:'error'};
  if(county==='全部地区')return result?.all||{status:'unknown'};
  const existing=result?.counties?.find(x=>x.county===county);
  if(existing&&existing.status!=='unknown')return existing;
  return applicability(county,year,office)||existing||{status:'unknown'};
 }
 function analyze(snapshot,office,normalize=defaultNorm){
  const norm=v=>normalize(defaultNorm(v)),buckets=new Map(),ids=new Set((snapshot.elections||[]).filter(e=>e.office===office).map(e=>e.election_id));
  const create=county=>({county,contests:0,candidates:0,countyRows:0,townRows:0,towns:0,missingVotes:0,missingWinners:0,missingNumber:0,missingGender:0,missingParty:0,missingIncumbent:0,unreconciled:0,missingFields:Object.fromEntries(Object.keys(fields).map(f=>[f,0])),partialArchives:0,declared:false,notApplicable:false});
  const all=create('全部地区'),get=county=>{county=countyKey(norm(county),Number(snapshot.year));if(!county)return null;if(!buckets.has(county))buckets.set(county,create(county));return buckets.get(county)};
  const contestById=new Map(),members=new Map(),townSets=new Map();
  for(const c of snapshot.contests||[]){if(!ids.has(c.election_id)){if(office==='township')get(c.county_name);continue}contestById.set(c.contest_id,c);get(c.county_name)}
  for(const e of snapshot.elections||[])if(ids.has(e.election_id)){
   for(const county of Array.isArray(e.counties)?e.counties:[]){const b=get(county);if(b)b.declared=true}
   for(const county of Array.isArray(e.noElectionCounties)?e.noElectionCounties:[]){const b=get(county);if(b)b.notApplicable=true}
  }
  for(const c of snapshot.candidacies||[]){if(!contestById.has(c.contest_id))continue;const rows=members.get(c.contest_id)||[];rows.push(c);members.set(c.contest_id,rows)}
  for(const [id,c] of contestById){
   const rows=members.get(id)||[],b=get(c.county_name);
   for(const x of [all,b].filter(Boolean)){
    x.contests++;x.candidates+=rows.length;
    for(const [f] of Object.entries(fields))if(!valid(c[f]))x.missingFields[f]++;
    if(!rows.length||rows.some(r=>!valid(r.votes)))x.missingVotes++;
    if(['mayor','council','township'].includes(office)&&(!rows.length||rows.some(r=>typeof r.elected_official!=='boolean')||valid(c.seats)&&rows.filter(r=>r.elected_official===true).length!==c.seats))x.missingWinners++;
    if(valid(c.valid_votes)&&rows.length&&rows.every(r=>valid(r.votes))&&rows.reduce((n,r)=>n+r.votes,0)!==c.valid_votes)x.unreconciled++;
    for(const r of rows){if(!String(r.ballot_number??'').trim())x.missingNumber++;if(!['男','女','男性','女性'].includes(r.gender))x.missingGender++;if(!String(r.party_name??'').trim()||/缺失|未知|待核/.test(r.party_name))x.missingParty++;if(typeof r.incumbent_at_election!=='boolean')x.missingIncumbent++}
   }
  }
  for(const r of snapshot.rows||[]){if(r.type!==office||!['county','town'].includes(r.level))continue;const b=get(r.county);if(!b)continue;
   for(const x of [all,b]){if(r.level==='county')x.countyRows++;else{x.townRows++;if(r.town){if(!townSets.has(x))townSets.set(x,new Set());townSets.get(x).add(norm(r.county)+'|'+norm(r.town))}}}
  }
  const fragments=office==='township'?snapshot.partialTownshipReturns:office==='council'?snapshot.partialCouncilReturns:[];
  for(const p of Array.isArray(fragments)?fragments:[]){const b=get(p.county||p.county_name);if(!b)continue;b.partialArchives++;all.partialArchives++}
  const declaredPartial=(snapshot.elections||[]).some(e=>ids.has(e.election_id)&&e.coverage==='partial');
  for(const x of [all,...buckets.values()]){
   x.towns=townSets.get(x)?.size||0;
   const has=x.contests>0||x.countyRows>0||x.townRows>0;
   const gaps=x.missingVotes||x.missingWinners||x.unreconciled||x.missingNumber||x.missingGender||x.missingParty||x.missingIncumbent||Object.values(x.missingFields).some(Boolean);
   const na=x===all?null:applicability(x.county,snapshot.year,office);
   x.status=x.partialArchives||has&&(gaps||x===all&&declaredPartial)?'partial':has?'recorded':x.notApplicable||na?'na':x.declared?'missing':'unknown';
   if(!has&&na)x.reason=na.reason;
  }
  // An explicitly missing county must also be reflected in the whole archive.
  if([...buckets.values()].some(b=>['partial','missing'].includes(b.status)))all.status='partial';
  return {year:snapshot.year,office,all,counties:[...buckets.values()]};
 }
 const api={analyze,labels,countyKey,applicability,matrixEntry};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
 root.HistoryCoverage=api;
 const doc=root.document,$=id=>doc.getElementById(id);
 const button=$('historyCoverageOpen');if(!button)return;
 const dialog=$('historyCoverageDialog'),select=$('historyCoverageOffice'),host=$('historyCoverageMatrix'),detail=$('historyCoverageDetail'),status=$('historyCoverageStatus');
 const element=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const cache=new Map();let request=0;
 const years=office=>office==='president'?root.HistoryPresidential.YEARS:office==='legislative'?root.HistoryLegislative.YEARS:root.HistoryLocal.years(office,root.HISTORY_2026_RESULTS_AVAILABLE===true);
 async function load(office,year){
  const key=office+'|'+year;
  if(!cache.has(key)){
   const p=(async()=>{
    const shard=office==='president'?await root.HistoryPresidential.load(year):office==='legislative'?await root.HistoryLegislative.load(year):[2022,2026].includes(year)?await root.History2022View.trendSnapshot(year):await root.HistoryLocal.loadCycle(year,office);
    return analyze(shard,office,typeof simplify==='function'?simplify:defaultNorm);
   })();
   cache.set(key,p);p.catch(()=>{if(cache.get(key)===p)cache.delete(key)});
  }
  return cache.get(key);
 }
 function showDetail(entry,year,county,office){
  detail.replaceChildren(element('h4',root.HistoryLocal.yearLabel(year,office)+' · '+county+' · '+labels[entry.status]));
  if(entry.status==='unknown'||entry.status==='error'||entry.status==='na'||entry.status==='missing'){
   detail.append(element('p',entry.status==='unknown'?'该届行政区划下尚无对应记录或明确覆盖声明，需要核实档案。':entry.status==='error'?'资料读取失败，不作为缺档统计。':entry.status==='na'?(entry.reason||'档案明确标记未举行此类选举。'):'档案声明覆盖该地区，但未发现结果记录。'));return;
  }
  detail.append(element('p','已收录：'+entry.contests+'个选区 / '+entry.candidates+'条候选人记录；县市得票明细 '+entry.countyRows+'条，乡镇市区得票明细 '+entry.townRows+'条（'+entry.towns+'个地区）。'));
  const table=element('table',undefined,'history-candidate-table'),body=element('tbody');
  for(const [label,value] of [...Object.entries(fields).map(([key,name])=>[name+'缺失选区',entry.missingFields[key]]),['候选人得票缺失选区',entry.missingVotes],['当选标记或席次待核选区',entry.missingWinners],['有效票对账异常选区',entry.unreconciled],['号次缺失记录',entry.missingNumber],['性别缺失记录',entry.missingGender],['政党缺失记录',entry.missingParty],['现任缺失记录',entry.missingIncumbent],['部分档案条目（非完整候选人结果）',entry.partialArchives]]){const tr=element('tr');tr.append(element('th',label),element('td',String(value)));body.append(tr)}
  table.append(body);detail.append(table,element('p','以上仅检查本站已收录字段，不证明全部历史选区、候选人或乡镇明细已齐全。','data-help'));
 }
 function draw(office,ys,results){
  const names=[...new Set(results.flatMap(r=>r?.counties?.map(c=>c.county)||[]))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  const table=element('table',undefined,'coverage-matrix'),head=element('thead'),row=element('tr');row.append(element('th','当届县市'));
  for(const y of ys)row.append(element('th',root.HistoryLocal.yearLabel(y,office)));head.append(row);table.append(head);
  const body=element('tbody');
  for(const county of ['全部地区',...names]){
   const tr=element('tr');tr.append(element('th',county));
   ys.forEach((y,i)=>{const cell=matrixEntry(results[i],county,y,office),td=element('td'),b=element('button',labels[cell.status]);b.type='button';b.dataset.coverageStatus=cell.status;b.setAttribute('aria-label',county+' '+root.HistoryLocal.yearLabel(y,office)+' '+labels[cell.status]);b.onclick=()=>showDetail(cell,y,county,office);td.append(b);tr.append(td)});
   body.append(tr);
  }
  table.append(body);host.replaceChildren(table);
 }
 async function refresh(){
  const token=++request,office=select.value,ys=[...years(office)],results=new Array(ys.length);
  host.replaceChildren();detail.replaceChildren();status.textContent='正在检查 '+officeNames[office]+' 历届档案…';
  let next=0,finished=0;
  async function worker(){while(token===request&&next<ys.length){const i=next++;try{results[i]=await load(office,ys[i])}catch(e){results[i]={error:e.message}}if(token!==request)return;status.textContent='已检查 '+(++finished)+' / '+ys.length+' 届'}}
  await Promise.all(Array.from({length:Math.min(2,ys.length)},worker));
  if(token!==request)return;draw(office,ys,results);status.textContent='已检查 '+ys.length+' 届'+(results.some(r=>r?.error)?'，部分档案读取失败，可重新检查。':'。');
 }
 button.onclick=()=>{select.value=root.History2022View?.office()||'mayor';dialog.showModal();refresh()};
 select.onchange=refresh;$('historyCoverageRetry').onclick=refresh;
 dialog.addEventListener('close',()=>{request++});
})(typeof window==='undefined'?globalThis:window);
