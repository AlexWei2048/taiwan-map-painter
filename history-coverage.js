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
 const formerCounties=['原台中县','原台南县','原高雄县'];
 const renamedPairs=[['台北县','新北市','新北市／台北县',2010],['桃园县','桃园市','桃园市／桃园县',2014]];
 // Same order as the site's COUNTY_ORDER, with former jurisdictions adjacent.
 const COUNTY_ORDER=['台北市','新北市／台北县','桃园市／桃园县','台中市','原台中市','原台中县','台南市','原台南市','原台南县','高雄市','原高雄市','原高雄县','新竹县','苗栗县','彰化县','南投县','云林县','嘉义县','屏东县','宜兰县','花莲县','台东县','澎湖县','基隆市','新竹市','嘉义市','金门县','连江县'];
 const order=new Map(COUNTY_ORDER.map((name,i)=>[name,i]));
 const rowKey=name=>{
  const pair=renamedPairs.find(([oldName,newName,label])=>[oldName,newName,label].includes(name));
  if(pair)return pair[2];
  if(['台中县','台南县','高雄县'].includes(name))return '原'+name;
  return name;
 };
 const countyKey=(name,year)=>mergedCities.includes(name)&&year<2010?'原'+name:rowKey(name);
 const countyLabel=(name,year)=>{
  const pair=renamedPairs.find(p=>p[2]===name);
  return pair?(year<pair[3]?pair[0]:pair[1]):name;
 };
 const aggregateName=name=>/^(?:全部地区(?:（含金门、马祖）)?|全国|全台|台闽地区|台湾地区|台湾省|福建省|不分区|全国不分区)$/.test(name);
 function countyRows(results){
  const names=new Set(COUNTY_ORDER);
  for(const r of results)for(const c of r?.counties||[])if(c.county&&!aggregateName(c.county))names.add(c.county);
  return [...names].sort((a,b)=>(order.get(a)??Infinity)-(order.get(b)??Infinity)||a.localeCompare(b,'zh-CN'));
 }
 function applicability(name,year,office){
  name=rowKey(name);year=Number(year);
  if(!order.has(name)||!Number.isInteger(year))return null;
  if((formerCounties.includes(name)||name.startsWith('原')&&mergedCities.includes(name.slice(1)))&&year>=2010)return {status:'na',reason:'当届已完成县市合并。'};
  if(mergedCities.includes(name)&&year<2010)return {status:'na',reason:'当届尚未合并，原县、市分别列示。'};
  if(office==='township'){
   const always=['台北市','基隆市','新竹市','嘉义市','原台中市','原台南市','原高雄市','台南市'];
   const restructured=['新北市／台北县','台中市','高雄市'];
   if(always.includes(name)||restructured.includes(name)&&year>=2010&&year<2014)return {status:'na',reason:'当届该地区未举行乡镇市区长选举。'};
  }
  return null;
 }
 function matrixEntry(result,county,year,office){
  if(result?.error)return {status:'error'};
  if(county==='全部地区')return result?.all||{status:'unknown'};
  county=rowKey(county);
  const existing=result?.counties?.find(x=>x.county===county);
  if(existing&&existing.status!=='unknown')return existing;
  return applicability(county,year,office)||existing||{status:'unknown'};
 }
 function analyze(snapshot,office,normalize=defaultNorm,options={}){
  const norm=v=>normalize(defaultNorm(v)),buckets=new Map(),ids=new Set((snapshot.elections||[]).filter(e=>e.office===office).map(e=>e.election_id));
  const create=county=>({county,contests:0,candidates:0,countyRows:0,townRows:0,towns:0,missingVotes:0,missingWinners:0,missingNumber:0,missingGender:0,missingParty:0,missingIncumbent:0,unreconciled:0,missingFields:Object.fromEntries(Object.keys(fields).map(f=>[f,0])),partialArchives:0,townProfileGaps:0,coverageNotes:[],declared:false,notApplicable:false});
  const all=create('全部地区'),get=county=>{county=countyKey(norm(county),Number(snapshot.year));if(!county||aggregateName(county))return null;if(!buckets.has(county))buckets.set(county,create(county));return buckets.get(county)};
  const contestById=new Map(),members=new Map(),townSets=new Map(),electionById=new Map((snapshot.elections||[]).map(e=>[e.election_id,e]));
  for(const c of snapshot.contests||[]){if(!ids.has(c.election_id)){if(office==='township')get(c.county_name);continue}contestById.set(c.contest_id,c);get(c.county_name)}
  for(const e of snapshot.elections||[])if(ids.has(e.election_id)){
   for(const county of Array.isArray(e.counties)?e.counties:[]){const b=get(county);if(b)b.declared=true}
   for(const county of Array.isArray(e.noElectionCounties)?e.noElectionCounties:[]){const b=get(county);if(b)b.notApplicable=true}
  }
  for(const c of snapshot.candidacies||[]){if(!contestById.has(c.contest_id))continue;const rows=members.get(c.contest_id)||[];rows.push(c);members.set(c.contest_id,rows)}
  // Legislative turnout is published as a separate, independently reconciled
  // ballot-level asset. Do not mistake a missing field in the candidate-results
  // snapshot for an absent ballot statistic. Never allocate a county total to
  // one district when the county has multiple constituencies.
  const legislative=office==='legislative',turnout=options.turnout||null;
  const regionalCount=new Map();
  if(legislative)for(const c of contestById.values())if(c.electorate==='regional')
   regionalCount.set(c.county_name,(regionalCount.get(c.county_name)||0)+1);
  const districtNumber=s=>{
   const a=String(s||'').match(/第\s*(\d+)\s*选/);if(a)return String(Number(a[1]));
   const b=String(s||'').match(/第([一二三四五六七八九十]+)选/);if(!b)return'';
   const m={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10},v=b[1];
   return String(v==='十'?10:v.startsWith('十')?10+(m[v[1]]||0):v.endsWith('十')?(m[v[0]]||0)*10:m[v]||'');
  };
  const completeProfile=(p,v)=>Array.isArray(p)&&p.length===4&&p.every(valid)&&
   p[0]>=p[1]&&p[1]===p[2]+p[3]&&valid(v)&&p[2]===v;
  const legislativeProfile=c=>{
   if(!legislative)return null;
   const electorate=c.electorate||electionById.get(c.election_id)?.electorate;
   if(electorate==='party'&&Number(snapshot.year)<2008)return null;
   const original=Object.keys(fields).map(k=>c[k]);
   if(completeProfile(original,c.valid_votes))return original;
   const candidates=turnout?.ballots?.[electorate];
   let profile=null;
   if(electorate==='regional'){
    const count=regionalCount.get(c.county_name)||0,number=districtNumber(c.district_name);
    profile=count>1?candidates?.district?.[c.county_name]?.[number]:
     candidates?.county?.[c.county_name];
   }else profile=candidates?.national;
   if(completeProfile(profile,c.valid_votes))return profile;
   if(electorate==='plains'&&Number(snapshot.year)===1992){
    const county=snapshot.geographicProfiles?.plains?.county||{};
    const rows=Object.values(county);
    if(rows.length){
     const totals=[0,1,2,3].map(i=>rows.reduce((sum,row)=>sum+row[i],0));
     if(completeProfile(totals,c.valid_votes))return totals;
    }
   }
   return null;
  };
  for(const [id,c] of contestById){
   const rows=members.get(id)||[],b=get(c.county_name),partyBallot=office==='legislative'&&(c.electorate||electionById.get(c.election_id)?.electorate)==='party';
   const profile=legislativeProfile(c);
   for(const x of [all,b].filter(Boolean)){
    x.contests++;x.candidates+=rows.length;
    for(const [f] of Object.entries(fields))if(!valid(c[f])&&!profile&&
     !(partyBallot&&Number(snapshot.year)<2008))x.missingFields[f]++;
    if(!rows.length||rows.some(r=>!valid(r.votes)))x.missingVotes++;
    if((['mayor','council','township'].includes(office)||legislative&&!partyBallot)&&
     (!rows.length||rows.some(r=>typeof r.elected_official!=='boolean')||
     valid(c.seats)&&rows.filter(r=>r.elected_official===true).length!==c.seats))x.missingWinners++;
    if(valid(c.valid_votes)&&rows.length&&rows.every(r=>valid(r.votes))&&rows.reduce((n,r)=>n+r.votes,0)!==c.valid_votes)x.unreconciled++;
    for(const r of rows){if(!partyBallot&&!String(r.ballot_number??'').trim())x.missingNumber++;if(!partyBallot&&!['男','女','男性','女性'].includes(r.gender))x.missingGender++;if(!String(r.party_name??'').trim()||/缺失|未知|待核/.test(r.party_name))x.missingParty++;if(!partyBallot&&typeof r.incumbent_at_election!=='boolean')x.missingIncumbent++}
   }
  }
  for(const r of snapshot.rows||[]){if((r.type!==office&&!(legislative&&r.electorate))||!['county','town'].includes(r.level))continue;const b=get(r.county);if(!b)continue;
   for(const x of [all,b]){if(r.level==='county')x.countyRows++;else{x.townRows++;if(r.town){if(!townSets.has(x))townSets.set(x,new Set());townSets.get(x).add(norm(r.county)+'|'+norm(r.town))}}}
  }
  const fragments=office==='township'?snapshot.partialTownshipReturns:office==='council'?snapshot.partialCouncilReturns:[];
  for(const p of Array.isArray(fragments)?fragments:[]){const b=get(p.county||p.county_name);if(!b)continue;b.partialArchives++;all.partialArchives++}
  if(legislative&&Number(snapshot.year)===1992){
   for(const [ballot,g] of Object.entries(snapshot.geographicProfiles||{}))for(const [county,areas] of Object.entries(g.town||{}))for(const [town,p] of Object.entries(areas))if(!Array.isArray(p)||p.some(v=>!valid(v))){const b=get(county);if(b)b.townProfileGaps++;all.townProfileGaps++}
   for(const county of snapshot.regionalTownCoverage?.withoutTownReturns||[]){const b=get(county),note='区域民代乡镇市区得票尚缺原始票表；县级结果完整。';if(b){b.partialArchives++;b.coverageNotes.push(note)}all.partialArchives++;all.coverageNotes.push(county+'：'+note)}
   const hs=get('高雄市');if(hs)hs.coverageNotes.push('11区已收录选举人数及候选人得票；投票人数、无效票待原档。');
   const ms=get('连江县');if(ms)ms.coverageNotes.push('四乡已收录区域与山地得票；分票种选举人数尚缺，区域一处票数对调待独立原表复核。');
   all.coverageNotes.push('区域27个选区、25个县市投票概况已对账。平地与山地候选人有效票均已闭合；地方投票统计尚有未定位差额。');
  }
  const declaredPartial=(snapshot.elections||[]).some(e=>ids.has(e.election_id)&&e.coverage==='partial');
  for(const x of [all,...buckets.values()]){
   x.towns=townSets.get(x)?.size||0;
   const has=x.contests>0||x.countyRows>0||x.townRows>0;
   // Gender and election-day incumbency enrich the archive, but their
   // unavailability does not make a certified candidate-vote result incomplete.
   // They remain separately visible in the detail table.
   const gaps=x.missingVotes||x.missingWinners||x.unreconciled||x.missingNumber||
    (legislative?0:x.missingGender)||(legislative?0:x.missingIncumbent)||
    x.missingParty||Object.values(x.missingFields).some(Boolean);
   const na=x===all?null:applicability(x.county,snapshot.year,office);
   x.status=x.partialArchives||has&&(gaps||x.townProfileGaps||x===all&&declaredPartial)?'partial':has?'recorded':x.notApplicable||na?'na':x.declared?'missing':'unknown';
   if(!has&&na)x.reason=na.reason;
  }
  // An explicitly missing county must also be reflected in the whole archive.
  if([...buckets.values()].some(b=>['partial','missing'].includes(b.status))||(legislative&&(snapshot.voteReconciliation?.some(x=>x.unassignedVotes>0)||snapshot.regionalTownCoverage?.withoutTownReturns?.length>0)))all.status='partial';
  return {year:snapshot.year,office,all,counties:[...buckets.values()]};
 }
 const api={analyze,labels,countyKey,countyLabel,countyRows,applicability,matrixEntry};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
 root.HistoryCoverage=api;
 const doc=root.document,$=id=>doc.getElementById(id);
 const button=$('historyCoverageOpen');if(!button)return;
 const dialog=$('historyCoverageDialog'),select=$('historyCoverageOffice'),host=$('historyCoverageMatrix'),detail=$('historyCoverageDetail'),status=$('historyCoverageStatus');
 const element=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
 const cache=new Map();let request=0,lastMatrix=null;
 const emblemDetails=$('historyEmblemCoverage'),emblemBody=$('historyEmblemCoverageBody');
 let emblemAudit=null,emblemLoading=false;
 async function showEmblems(){
  if(!emblemDetails?.open||emblemLoading)return;
  emblemLoading=true;emblemBody.replaceChildren(element('p','正在读取党徽审计…','data-help'));
  try{
   if(!emblemAudit){const response=await fetch('reports/coverage-audit.json',{cache:'no-cache'});if(!response.ok)throw Error('读取失败');emblemAudit=await response.json()}
   const records=emblemAudit.priority_party_inventory;if(!Array.isArray(records))throw Error('审计清单尚未更新');
   const rows=records.map(r=>{let logo='';try{logo=logoFor(predictionParty(r.name))||''}catch(e){}return {...r,logo}}),missing=rows.filter(r=>!r.logo);
   const title=element('p','本站已收录的曾当选或曾参选县市长的历史党名：'+rows.length+'；已匹配图档 '+(rows.length-missing.length)+'；待补齐 '+missing.length+'。','data-help');
   const filter=element('label','仅显示待补齐 '),check=element('input');check.type='checkbox';check.checked=true;filter.prepend(check);
   const table=element('table',undefined,'history-candidate-table'),thead=element('thead'),tr=element('tr'),tbody=element('tbody');
   for(const label of ['政党','当选记录','县市长参选记录','图档状态'])tr.append(element('th',label));thead.append(tr);table.append(thead,tbody);
   function draw(){tbody.replaceChildren();for(const r of check.checked?missing:rows){const tr=element('tr'),td=element('td',undefined,'history-party-inline');if(r.logo){const img=element('img');img.src=r.logo;img.alt='';img.width=20;img.height=20;td.append(img)}td.append(element('span',root.NewsWording?.normalize(r.name)||r.name));tr.append(td,element('td',String(r.elected??'—')),element('td',String(r.mayor_candidates??'—')),element('td',r.logo?'已匹配':'待核实'));tbody.append(tr)}if(!tbody.children.length){const tr=element('tr'),td=element('td','没有待补齐记录');td.colSpan=4;tr.append(td);tbody.append(tr)}}
   check.onchange=draw;const wrap=element('div',undefined,'discovery-table-wrap');wrap.append(table);const source=element('a','查看完整党徽来源记录');source.href='https://github.com/AlexWei2048/taiwan-map-painter/blob/main/reports/official-party-logos-import.json';source.target='_blank';source.rel='noopener noreferrer';
   emblemBody.replaceChildren(title,filter,wrap,element('p','当选及参选次数仅代表已收录档案；同一政党的历史名称可能分别列出。缺徽不使用他党图样。','data-help'),source);draw()
  }catch(e){const retry=element('button','重新读取','button quiet');retry.type='button';retry.onclick=()=>{emblemAudit=null;showEmblems()};emblemBody.replaceChildren(element('p','党徽审计暂不可读：'+e.message,'data-help'),retry)}
  finally{emblemLoading=false}
 }
 emblemDetails?.addEventListener('toggle',showEmblems);
 const yearFilter=$('coverageYearFilter'),statusFilter=$('coverageStatusFilter'),countyFilter=$('coverageCountyFilter');
 const matchStatus=(s,v)=>!v||v==='gaps'?(!v||['partial','missing','unknown','error'].includes(s)):s===v;
 function filteredDraw(){if(!lastMatrix)return;const {office,ys,results}=lastMatrix;const indexes=ys.map((y,i)=>i).filter(i=>!yearFilter.value||String(ys[i])===yearFilter.value);draw(office,indexes.map(i=>ys[i]),indexes.map(i=>results[i]));}
 const years=office=>office==='president'?root.HistoryPresidential.YEARS:office==='legislative'?root.HistoryLegislative.YEARS:root.HistoryLocal.years(office,root.HISTORY_2026_RESULTS_AVAILABLE===true);
 async function load(office,year){
  const key=office+'|'+year;
  if(!cache.has(key)){
   const p=(async()=>{
    const [shard,turnout]=office==='legislative'?
     await Promise.all([root.HistoryLegislative.load(year),root.HistoryLegislativeTurnout.load(year)]):
     [office==='president'?await root.HistoryPresidential.load(year):
      [2022,2026].includes(year)?await root.History2022View.trendSnapshot(year):
       await root.HistoryLocal.loadCycle(year,office),null];
    return analyze(shard,office,typeof simplify==='function'?simplify:defaultNorm,{turnout});
   })();
   cache.set(key,p);p.catch(()=>{if(cache.get(key)===p)cache.delete(key)});
  }
  return cache.get(key);
 }
 function showDetail(entry,year,county,office){
  detail.replaceChildren(element('h4',root.HistoryLocal.yearLabel(year,office)+' · '+countyLabel(county,year)+' · '+labels[entry.status]));
  if(entry.status==='unknown'||entry.status==='error'||entry.status==='na'||entry.status==='missing'){
   detail.append(element('p',entry.status==='unknown'?'该届行政区划下尚无对应记录或明确覆盖声明，需要核实档案。':entry.status==='error'?'资料读取失败，不作为缺档统计。':entry.status==='na'?(entry.reason||'档案明确标记未举行此类选举。'):'档案声明覆盖该地区，但未发现结果记录。'));return;
  }
  detail.append(element('p','已收录：'+entry.contests+'个选区或票种 / '+entry.candidates+'条候选人、政党记录；县市得票明细 '+entry.countyRows+'条，乡镇市区得票明细 '+entry.townRows+'条（'+entry.towns+'个地区）。'));
  if(office==='legislative')detail.append(element('p','立法机构民代的投票人数等统计另外核对同届、同票种的原始投票概况；旧制不分区计算票不作为独立投票。性别、现任等附加字段仍可待核，但不等于候选人得票、当选结果缺失。','data-help'));
  const summary=element('div',undefined,'observation-toolbar');for(const [label,ok] of [['候选人得票',!entry.missingVotes&&!entry.unreconciled],['当选结果',!entry.missingWinners],['选区投票概况',!Object.values(entry.missingFields).some(Boolean)],['身份资料',!entry.missingGender&&!entry.missingIncumbent]]){const n=element('span',label+'：'+(ok?'已收录':'待补齐'),'coverage-summary-item');n.dataset.complete=String(ok);summary.append(n)}if(entry.townProfileGaps||entry.partialArchives){const n=element('span','细项档案：部分缺失','coverage-summary-item');n.dataset.complete='false';summary.append(n)}detail.append(summary);
  const table=element('table',undefined,'history-candidate-table'),body=element('tbody');
  for(const [label,value] of [...Object.entries(fields).map(([key,name])=>[name+'缺失选区',entry.missingFields[key]]),['候选人得票缺失选区',entry.missingVotes],['当选标记或席次待核选区',entry.missingWinners],['有效票对账异常选区',entry.unreconciled],['号次缺失记录',entry.missingNumber],['性别缺失记录',entry.missingGender],['政党缺失记录',entry.missingParty],['现任缺失记录',entry.missingIncumbent],['部分档案条目（非完整候选人结果）',entry.partialArchives],['乡镇分票种投票概况缺项',entry.townProfileGaps||0]]){const tr=element('tr');tr.append(element('th',label),element('td',String(value)));body.append(tr)}
  table.append(body);detail.append(table);for(const note of entry.coverageNotes||[])detail.append(element('p',note,'data-help'));detail.append(element('p','以上仅检查本站已收录字段，不证明全部历史选区、候选人或乡镇明细已齐全。','data-help'));
 }
 function draw(office,ys,results){
  const q=defaultNorm(countyFilter.value).replaceAll('金门县','金门').replaceAll('连江县','马祖');
  const names=['全部地区',...countyRows(results)].filter(county=>(!q||defaultNorm(county).replaceAll('金门县','金门').replaceAll('连江县','马祖').includes(q))&&ys.some((y,i)=>matchStatus(matrixEntry(results[i],county,y,office).status,statusFilter.value)));
  const table=element('table',undefined,'coverage-matrix'),head=element('thead'),row=element('tr');row.append(element('th','当届县市'));
  for(const y of ys)row.append(element('th',root.HistoryLocal.yearLabel(y,office)));head.append(row);table.append(head);
  const body=element('tbody');
  for(const county of names){
   const tr=element('tr');tr.append(element('th',county));
   ys.forEach((y,i)=>{const cell=matrixEntry(results[i],county,y,office),td=element('td'),b=element('button',labels[cell.status]);b.type='button';b.dataset.coverageStatus=cell.status;b.setAttribute('aria-label',countyLabel(county,y)+' '+root.HistoryLocal.yearLabel(y,office)+' '+labels[cell.status]);b.onclick=()=>showDetail(cell,y,county,office);td.append(b);tr.append(td)});
   body.append(tr);
  }
  table.append(body);host.replaceChildren(table);if(!names.length)host.append(element('p','没有符合筛选条件的记录。'));
 }
 async function refresh(){
  const token=++request,office=select.value,ys=[...years(office)],results=new Array(ys.length);
  lastMatrix=null;host.replaceChildren();detail.replaceChildren();status.textContent='正在检查 '+officeNames[office]+' 历届档案…';
  let next=0,finished=0;
  async function worker(){while(token===request&&next<ys.length){const i=next++;try{results[i]=await load(office,ys[i])}catch(e){results[i]={error:e.message}}if(token!==request)return;status.textContent='已检查 '+(++finished)+' / '+ys.length+' 届'}}
  await Promise.all(Array.from({length:Math.min(2,ys.length)},worker));
  if(token!==request)return;lastMatrix={office,ys,results};const prior=yearFilter.value;yearFilter.replaceChildren(new Option('全部年份',''),...ys.map(y=>new Option(root.HistoryLocal.yearLabel(y,office),String(y))));yearFilter.value=ys.some(y=>String(y)===prior)?prior:'';filteredDraw();status.textContent='已检查 '+ys.length+' 届'+(results.some(r=>r?.error)?'，部分档案读取失败，可重新检查。':'。');
 }
 button.onclick=()=>{select.value=root.History2022View?.office()||'mayor';dialog.showModal();refresh()};
 select.onchange=refresh;$('historyCoverageRetry').onclick=refresh;yearFilter.onchange=statusFilter.onchange=filteredDraw;countyFilter.oninput=filteredDraw;
 dialog.addEventListener('close',()=>{request++});
})(typeof window==='undefined'?globalThis:window);
