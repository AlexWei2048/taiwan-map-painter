/* Read-only history search and regional archive; no prediction writes. */
(function(root){
'use strict';
const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人',legislative:'立法机构民代'};
const counties=['台北市','台北县','新北市','桃园县','桃园市','台中县','台中市','台南县','台南市','高雄县','高雄市','新竹县','新竹市','苗栗县','彰化县','南投县','云林县','嘉义县','嘉义市','屏东县','宜兰县','花莲县','台东县','澎湖县','基隆市','金门县','连江县'];
const normalized=(v,n=String)=>n(String(v??'').trim().split('乾').join('\uE000')).replaceAll('\uE000','乾').replaceAll('臺','台').replaceAll('縣','县').replaceAll('黨','党').replaceAll('馬祖','连江县').replaceAll('马祖','连江县').replaceAll('連江縣','连江县').replaceAll('金門','金门').replace(/\s+/g,'').toLowerCase();
const family=new Set(['台中市','台南市','高雄市']);
function countyMatches(county,year){if(['新北市','桃园市'].includes(county)&&year<(county==='新北市'?2010:2014))return false;if(['台北县','桃园县'].includes(county)&&year>=(county==='台北县'?2010:2014))return false;if(['台中县','台南县','高雄县'].includes(county)&&year>=2010)return false;return true}
function partition(county,year){return family.has(county)&&year<2010?'合并前市':family.has(county)?'合并后市':['台中县','台南县','高雄县'].includes(county)?'合并前县':''}
function parseQuery(raw,n=String){let q=normalized(raw,n);const m=q.match(/(?:19|20)\d{2}/),year=m?Number(m[0]):null;if(m)q=q.replace(m[0],'').replace(/^年/,'');const original=q;let office='';for(const [o,aliases] of Object.entries({mayor:['县市长','市长','县长'],council:['县市议员','市议员','县议员','议员'],township:['乡镇市区长','乡镇市长','乡长','镇长','区长'],president:['台湾地区领导人','领导人'],legislative:['立法机构民代','区域民代','民代']})){const a=aliases.find(a=>q.includes(a));if(a){office=o;q=q.replace(a,'');break}}
const hits=counties.filter(c=>original.includes(normalized(c,n))).sort((a,b)=>b.length-a.length),county=hits[0]|| (q==='金门'?'金门县':'');
return {year,office,county,keyword:q}}
function matchRecord(r,q,kind,n=String,aliases=[]){const key=normalized(q,n);if(!key)return false;const name=normalized(r.name,n),party=normalized(r.party,n);return (kind!=='party'&&name.includes(key))||(kind!=='candidate'&&(party.includes(key)||aliases.some(a=>normalized(a,n)===key&&party===normalized(aliases[0],n))))}
function searchRows(records,q,kind,n=String,aliases=[]){return records.filter(r=>matchRecord(r,q,kind,n,aliases)).sort((a,b)=>Number(normalized(b.name,n)===normalized(q,n))-Number(normalized(a.name,n)===normalized(q,n))||b.year-a.year||String(a.name).localeCompare(String(b.name),'zh-CN'))}
const ballotText=b=>({regional:'区域',party:'不分区政党票',plains:'平地少数民族',mountain:'山地少数民族',all:'全部类型'}[b]||b||'全部类型');
const chartMetrics={share:'政党得票率',votes:'政党得票数',seats:'政党当选席次',turnout:'投票率',registered:'选举人数'};
const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const publicParty=p=>/^(?:无党籍|無黨籍|连署|連署)(?:[（(]\s*(?:连署|連署)\s*[）)])?$/.test(p)?'无党籍':p;
function archiveTrendRows(records,county,metric){
 const result=[];
 for(const rec of records){const x=rec.entry,parties=Object.create(null);
  if(x?.complete){
   if(['share','votes','seats'].includes(metric)){for(const [p,v] of Object.entries(x.parties||{})){
    if(!p||/政党资料缺失|待核|未知/.test(p)||!finite(v[metric])||metric==='seats'&&!finite(x.seats))continue;
    const key=publicParty(p);parties[key]=(parties[key]||0)+v[metric]
   }}else if(finite(x.profile?.[metric]))parties[chartMetrics[metric]]=x.profile[metric];
  }
  result.push({year:rec.y,label:rec.label||String(rec.y),county,scopeLabel:partition(county,rec.y),scopeSeries:partition(county,rec.y),complete:Object.keys(parties).length>0,parties,source:rec})
 }
 return result.sort((a,b)=>a.year-b.year)
}
function archiveSections(rows){const m=new Map();for(const row of rows){const k=row.scopeSeries||'';if(!m.has(k))m.set(k,[]);m.get(k).push(row)}return [...m].map(([label,rows])=>({label,rows}))}
function archiveCSV(records,county,town=''){
 const rows=[['选举类别','票种','届次','县市','乡镇市区','行政区口径','政党','得票数','得票率(%)','正式当选席次','有效票','选举人数','投票人数','无效票','投票率(%)','资料状态']];
 for(const r of [...records].sort((a,b)=>a.office.localeCompare(b.office)||a.y-b.y)){
  const e=r.entry,ps=e?.complete?Object.entries(e.parties||{}):[];for(const [p,v] of ps.length?ps:[['',null]])rows.push([offices[r.office],ballotText(r.ballot),r.label||r.y,county,town,partition(county,r.y)||'当届县市',publicParty(p),v?.votes??'',v?.share??'',v?.seats??'',e?.complete?e.valid??'':'',e?.profile?.registered??'',e?.profile?.cast??'',e?.profile?.invalid??'',e?.profile?.turnout??'',e?.complete?'已核实':e?.reason||'缺档或未核实'])
 }
 return rows
}
// Exact historical party labels, not inferred affiliations or successor parties.
function partyArchiveRecord(model,name,n=String){
 const key=normalized(name,n),matches=(model?.parties||[]).filter(p=>normalized(publicParty(p.party),n)===key);
 const known=finite(model?.votes)&&model.votes>0,seatKnown=finite(model?.seats);
 const incomplete=!known&&!seatKnown||model?.parties?.some(p=>!p.party||/政党资料缺失|待核|未知/.test(p.party));
 if(incomplete)return {status:'未核实',votes:null,share:null,seats:null,seatShare:null};
 if(!matches.length)return {status:incomplete?'未核实':'未见参选记录',votes:null,share:null,seats:null,seatShare:null};
 const votes=known&&matches.every(p=>finite(p.votes))?matches.reduce((a,p)=>a+p.votes,0):null;
 const seats=seatKnown&&matches.every(p=>finite(p.seats))?matches.reduce((a,p)=>a+p.seats,0):null;
 return {status:votes===null&&seats===null?'待核实':'已收录',votes,share:finite(votes)&&known?votes/model.votes*100:null,seats,seatShare:finite(seats)&&model.seats>0?seats/model.seats*100:null}
}
function partyArchiveCSV(rows,name,county){
 return [['政党','选举类别','票种','届次','统计范围','当届行政区口径','得票数','得票率(%)','当选席次','席次率(%)','资料状态'],...rows.map(r=>[name,offices[r.office],ballotText(r.ballot),r.label||r.y,county||'已收录地区汇总',partition(county,r.y)||'当届范围',r.votes??'',r.share??'',r.seats??'',r.seatShare??'',r.status])];
}
const api={offices,counties,normalized,parseQuery,countyMatches,partition,searchRows,archiveTrendRows,archiveSections,archiveCSV,partyArchiveRecord,partyArchiveCSV};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
root.HistoryDiscovery=api;
const $=id=>document.getElementById(id),sd=$('siteSearchDialog'),rd=$('regionArchiveDialog'),pd=$('partyArchiveDialog');if(!sd||!rd)return;
const norm=v=>typeof simplify==='function'?simplify(String(v)):String(v),nk=v=>normalized(v,norm);
const el=(tag,t,cls)=>{const e=document.createElement(tag);if(t!==undefined)e.textContent=t;if(cls)e.className=cls;return e};
function saveCSV(rows,name){const blob=new Blob([root.HistoryCore.csv(rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
function archiveRoute(r,county,town){return hash(r.office,r.y,county,{view:'map',...(town?{level:'town',area:town}:{}),...(['legislative','council'].includes(r.office)?{electorate:r.ballot||'regional'}:{})})}
function archiveLink(r,county,town,text='查看当届结果'){const a=el('a',text,'button quiet');a.href=archiveRoute(r,county,town);a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;rd.close();if(root.location.hash===a.hash){e.preventDefault();root.SiteWorkspaceCategories.openHistory(root.SiteRouting.parse(a.hash)).then(()=>root.dispatchEvent(new Event('site-route-change')))}};return a}
function archiveCharts(parent,rows,county,town,active){
 const disclosure=el('details',undefined,'region-trend-disclosure');disclosure.append(el('summary','查看历届趋势图'));const tools=el('div',undefined,'observation-toolbar'),out=el('div',undefined,'region-trend-output'),readout=el('div',undefined,'observation-detail'),status=el('p','','data-help');status.setAttribute('role','status');
 const metric=el('select'),range=el('select'),makeLabel=(caption,control)=>{const l=el('label',undefined,'observation-filter');l.append(el('span',caption),control);return l};const available=Object.entries(chartMetrics).filter(([k])=>archiveTrendRows(rows,county,k).some(r=>r.complete));
 if(!available.length)return;metric.replaceChildren(...available.map(([v,t])=>new Option(t,v)));range.replaceChildren(new Option('全部届次','all'),new Option('最近五届','5'),new Option('最近三届','3'));tools.append(makeLabel('指标',metric),makeLabel('届次',range));disclosure.append(tools,status,out,readout);parent.append(disclosure);out.dataset.trendSeriesScope='region';const hiddenSeries=new Set();let version=0;
 async function render(){const token=++version;if(!active()||!disclosure.open)return;out.replaceChildren();readout.replaceChildren();status.textContent='正在载入图表…';try{
  await root.HistoryLoader.loadTrends();if(token!==version||!active()||!disclosure.open)return;const engine=root.HistoryTrendCharts;if(!engine)throw Error('图表组件尚未载入');
  const kind=metric.value,sorted=archiveTrendRows(rows,county,kind),selected=range.value==='all'?sorted:sorted.slice(-Number(range.value));const sections=archiveSections(selected),names=[...new Set(selected.flatMap(r=>Object.keys(r.parties)))];
  const stack=kind==='seats',pct=kind==='share'||kind==='turnout',single=kind==='turnout'||kind==='registered',max=Math.max(1,...selected.flatMap(r=>stack?[Object.values(r.parties).reduce((a,b)=>a+b,0)]:Object.values(r.parties)));
  const series=names.map(name=>({name,color:single?'#147d68':stack?engine.seatColor(name):engine.color(name),get:r=>r.parties[name]??null}));
  const title=[displayCounty(county),town,offices[rows[0].office]+(['legislative','council'].includes(rows[0].office)?'（'+ballotText(rows[0].ballot)+'）':''),chartMetrics[kind]].filter(Boolean).join(' · ');
  status.textContent=sections.length>1?'合并前后分别绘制，共用纵轴尺度；未参选、缺档不填零。':'未参选、缺档不填零；同一类别、同一票种按当届口径统计。';
  for(const section of sections){const sr=series.filter(s=>section.rows.some(r=>finite(s.get(r))));if(!sr.length){out.append(el('p',(section.label||'当前届次')+'：没有可绘制的核实数据。','data-help'));continue}
   const name=title+(section.label?' · '+section.label:''),graph=engine.chart(section.rows,sr,name,{pct,stack,integer:!pct,axisMax:max,hiddenSeries,onPoint:(row,summary)=>{readout.replaceChildren(el('strong',summary),archiveLink(row.source,county,town))}});
   out.append(engine.card(name,'',graph,name,{prefix:'地区档案',office:offices[rows[0].office],status}))
  }
 }catch(e){if(token===version&&active())status.textContent='图表载入失败：'+e.message}}
 disclosure.addEventListener('toggle',()=>{if(disclosure.open)render();else version++});metric.onchange=()=>{hiddenSeries.clear();render()};range.onchange=render;
}
const cache=new Map();let searchRun=0,regionRun=0,partyRun=0;
const years=o=>o==='president'?root.HistoryPresidential.YEARS:o==='legislative'?root.HistoryLegislative.YEARS:root.HistoryLocal.years(o,root.HISTORY_2026_RESULTS_AVAILABLE===true);
const label=(y,o)=>root.HistoryLocal.yearLabel(y,o),fmt=v=>Number.isFinite(v)?v.toLocaleString('zh-CN'):'—',pct=v=>Number.isFinite(v)?v.toFixed(2)+'%':'—';
function load(o,y){const key=o+'|'+y;if(!cache.has(key)){const p=Promise.resolve().then(()=>o==='president'?root.HistoryPresidential.load(y):o==='legislative'?root.HistoryLegislative.load(y):[2022,2026].includes(y)?root.History2022View.trendSnapshot(y):root.HistoryLocal.loadCycle(y,o));cache.set(key,p);p.catch(()=>{if(cache.get(key)===p)cache.delete(key)})}return cache.get(key)}
async function pool(tasks,active,work,progress){let next=0,done=0;const out=[],fail=[];async function worker(){while(active()&&next<tasks.length){const task=tasks[next++];try{out.push(await work(task))}catch(e){fail.push(task)}if(active())progress(++done,tasks.length)}}await Promise.all(Array.from({length:Math.min(4,tasks.length)},worker));return {out,fail}}
const hash=(o,y,county='',extra={})=>root.SiteRouting.format({mode:'history',office:o,year:y,county,view:'map',...extra});
function link(title,sub,route){const a=el('a',undefined,'discovery-link');a.href=route;a.append(el('strong',title),el('small',sub));a.onclick=e=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;sd.close();rd.close();if(root.location.hash===route){e.preventDefault();root.SiteWorkspaceCategories.openHistory(root.SiteRouting.parse(route)).then(()=>root.dispatchEvent(new Event('site-route-change')))}};return a}
function heading(parent,t){parent.append(el('h3',t,'discovery-section'))}
function statusText(fail){return fail.length?'；未能读取 '+fail.map(([o,y])=>offices[o]+' '+label(y,o)).join('、'):''}
function openSearch(){if(!sd.open)sd.showModal();$('siteSearchQuery').focus()}
$('siteSearchOpen').onclick=openSearch;document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!document.querySelector('dialog[open]')){e.preventDefault();openSearch()}});sd.addEventListener('close',()=>searchRun++);
const displayCounty=c=>c==='金门县'?'金门':c==='连江县'?'马祖':c;
function fillRegions(selected){const s=$('regionArchiveCounty');s.replaceChildren(new Option('请选择县市',''),...counties.map(c=>new Option(displayCounty(c)+(family.has(c)?'（合并前后分列）':''),c)));const match=counties.find(c=>nk(c)===nk(selected));if(match)s.value=match;fillTowns()}
function fillTowns(){const c=$('regionArchiveCounty').value,t=$('regionArchiveTown'),old=t.value;let list=[];try{list=[...new Set((data?.towns||[]).filter(f=>nk(f.county)===nk(c)).map(f=>f.name||f.town).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'))}catch(e){}t.replaceChildren(new Option('县市整体',''),...list.map(v=>new Option(v,v)));if(list.includes(old))t.value=old;t.disabled=!list.length}
function openRegion(county='',context={}){regionRun++;if(sd.open)sd.close();if(!rd.open)rd.showModal();fillRegions(county||root.History2022View?.routeSelection?.().county||'');if(context.office&&Object.hasOwn(offices,context.office))$('regionArchiveOffice').value=context.office;if(context.ballot&&['regional','party'].includes(context.ballot))regionBallot.value=context.ballot;else if(context.office==='legislative')regionBallot.value='regional';syncRegionBallot();const town=$('regionArchiveTown'),match=[...town.options].find(o=>context.town&&nk(o.value)===nk(context.town));if(context.town)town.value=match?.value||'';else if(county)town.value='';if(town.value&&(context.office==='council'||context.office==='legislative'&&regionBallot.value!=='party'))town.value='';$('regionArchiveResults').replaceChildren();$('regionArchiveStatus').textContent=context.town&&!match?'当届乡镇名称无法匹配现行查询范围，已选择县市。':'选择地区后查询历届资料。';root.dispatchEvent(new Event('observationdialogchange'));if($('regionArchiveCounty').value)$('regionArchiveForm').requestSubmit()}
root.HistoryDiscovery.openRegion=openRegion;
for(const id of ['regionArchiveOpen','observationRegionOpen'])$(id).onclick=()=>openRegion();$('regionArchiveCounty').onchange=fillTowns;const regionBallot=$('regionArchiveBallot');function syncRegionBallot(){$('regionArchiveBallotBox').hidden=$('regionArchiveOffice').value!=='legislative'}$('regionArchiveOffice').onchange=syncRegionBallot;syncRegionBallot();rd.addEventListener('close',()=>{regionRun++;root.dispatchEvent(new Event('observationdialogchange'))});
$('siteSearchForm').onsubmit=async e=>{e.preventDefault();const run=++searchRun,active=()=>run===searchRun&&sd.open,host=$('siteSearchResults'),status=$('siteSearchStatus'),raw=$('siteSearchQuery').value.trim(),kind=$('siteSearchType').value,selected=$('siteSearchOffice').value;host.replaceChildren();if(!raw)return;status.textContent='正在载入历史搜索…';try{await root.HistoryLoader.load();if(!active())return;const q=parseQuery(raw,norm),office=selected!=='all'?selected:q.office||'',os=office?[office]:Object.keys(offices);
if((kind==='all'||kind==='region')&&(q.county||q.year||q.office)){heading(host,'地区与届次');const wrap=el('div',undefined,'discovery-results');if(q.county){const b=el('button','查看 '+displayCounty(q.county)+' 地区档案','discovery-link');b.type='button';b.onclick=()=>openRegion(q.county);wrap.append(b)}for(const o of os){const ys=years(o),matches=q.year?ys.filter(y=>y===q.year||root.HistoryLocal.cycleYear(q.year,o)===y):ys.slice(-1);for(const y of matches){if(q.county&&!countyMatches(q.county,y))continue;wrap.append(link(label(y,o)+' '+offices[o]+(q.county?' · '+displayCounty(q.county):''),'查看历史结果',hash(o,y,q.county)))}}host.append(wrap);if(kind==='region'||q.county||q.year&&(!q.keyword||q.keyword==='年')||q.office&&!q.keyword){status.textContent='已显示匹配的历史查询入口。';return}}
if(kind==='region'){status.textContent='未识别地区或年份，请输入完整县市名称或四位年份。';return}
const keyword=q.year?q.keyword:raw;
if(pd&&(kind==='party'||kind==='all')){let matched;try{matched=PARTY_PRESETS.find(p=>[p.name,...(p.aliases||[])].some(v=>nk(v)===nk(keyword)))}catch(e){}
 if(matched||kind==='party'){const b=el('button','查看政党档案：'+(matched?.name||keyword),'discovery-link');b.type='button';b.onclick=()=>openParty(matched?.name||keyword,{office});host.append(b)}}
const tasks=os.flatMap(o=>years(o).filter(y=>!q.year||y===q.year||root.HistoryLocal.cycleYear(q.year,o)===y).map(y=>[o,y]));let aliases=[];try{const p=PARTY_PRESETS.find(p=>[p.name,...(p.aliases||[])].some(v=>nk(v)===nk(keyword)));if(p)aliases=[p.name,...(p.aliases||[])]}catch(e){}
const {out,fail}=await pool(tasks,active,async ([o,y])=>{const s=await load(o,y);const C=root.HistoryObservationCore,records=C.candidateRecords(s,o),blocks=C.select(s,o),keys=blocks.flatMap(({contest:c,rows})=>rows.map(()=>({contest:c.contest_id,ballot:c.electorate||'regional'})));return searchRows(records.map((r,i)=>({...r,...keys[i],routeYear:y})).filter(r=>kind!=='candidate'||r.ballot!=='party'),keyword,kind,norm,aliases)},(d,total)=>status.textContent='已搜索 '+d+' / '+total+' 份档案…');if(!active())return;
const rows=out.flat().sort((a,b)=>Number(nk(b.name)===nk(keyword))-Number(nk(a.name)===nk(keyword))||b.year-a.year||String(a.name||'').localeCompare(String(b.name||''),'zh-CN'));status.textContent='找到 '+rows.length+' 条历史记录'+statusText(fail)+'。';if(!rows.length){host.append(el('p','没有匹配记录，请调整关键词或类别。'));return}heading(host,'历史参选及政党记录');const wrap=el('div',undefined,'discovery-results');let shown=0;const more=el('button','显示更多','button quiet');more.type='button';function page(){for(const r of rows.slice(shown,shown+60)){const aggregate=/全部地区|台闽地区|全国|全台/.test(r.county||''),county=aggregate?'':r.county||'';wrap.append(link(r.name+' · '+(r.party||'政党待核'),label(r.routeYear,r.office)+' '+offices[r.office]+' · '+displayCounty(r.county||'')+' '+(r.district||'')+' · '+fmt(r.votes)+'票 · '+(r.ballot==='party'?'政党票／席次计算票':r.elected===true?'当选':r.elected===false?'未当选':'当选待核'),hash(r.office,r.routeYear,county,{view:'candidates',...(r.office==='legislative'||r.office==='council'?{electorate:r.ballot}:{}),...(r.contest&&r.ballot!=='party'?{contest:r.contest}:{})})))}shown+=60;more.hidden=shown>=rows.length}host.append(wrap,more);more.onclick=page;page();
}catch(e){if(active())status.textContent='查询失败：'+e.message}};
$('regionArchiveForm').onsubmit=async e=>{e.preventDefault();const run=++regionRun,active=()=>run===regionRun&&rd.open,host=$('regionArchiveResults'),status=$('regionArchiveStatus'),county=$('regionArchiveCounty').value,town=$('regionArchiveTown').value,o=$('regionArchiveOffice').value;host.replaceChildren();if(!county)return;status.textContent='正在载入地区档案…';try{await root.HistoryLoader.load();if(!active())return;const selectedBallot=o==='legislative'?regionBallot.value:'regional';const os=(o==='all'?Object.keys(offices):[o]).filter(x=>!town||['mayor','president','township'].includes(x)||x==='legislative'&&o==='legislative'&&selectedBallot==='party'),tasks=os.flatMap(x=>years(x).filter(y=>countyMatches(county,y)&&(!town||y>=2014)&&(x!=='legislative'||selectedBallot!=='party'||y>=2008)).map(y=>[x,y]));if(!tasks.length){status.textContent='乡镇查询支持2014年起县市长、乡镇市区长、台湾地区领导人和不分区政党票。查询不分区政党票请选择民代类别及对应票种。';return}
const {out,fail}=await pool(tasks,active,async ([office,y])=>{const s=await load(office,y),ballot=office==='legislative'?selectedBallot:office==='council'?'regional':'all',C=root.HistoryCompare;if(office==='legislative')await root.HistoryLegislativeTurnout.load(y).catch(()=>null);const summary=C.legislativeProfiles(town?C.summarizeTowns(s,office,ballot,norm):C.summarize(s,office,ballot,norm),root.HistoryLegislativeTurnout);const key=town?county+'|'+town:county;const entry=summary.counties.get(key)||[...summary.counties].find(([k])=>nk(k)===nk(key))?.[1];if(!entry)return {office,y,ballot,label:label(y,office),entry:null};const elected=(!town&&office==='mayor'||town&&office==='township')?root.HistoryObservationCore.candidateRecords(s,office).filter(r=>nk(r.county)===nk(county)&&(!town||nk(r.district)===nk(town))&&r.elected===true).map(r=>r.name+'（'+r.party+'）').join('、'):'';return {office,y,ballot,label:label(y,office),entry,elected}},(d,total)=>status.textContent='已查询 '+d+' / '+total+' 届资料…');if(!active())return;
status.textContent=displayCounty(county)+(town?' · '+town:'')+'：'+out.filter(r=>r.entry?.complete).length+' 届有可核实结果'+statusText(fail)+'。'+(town?' 乡镇仅比较2014年起可核实的同类票种。':' 议员默认区域票种；民代按所选票种，合并前后分开。');
const download=el('button','导出地区档案 CSV','button quiet');download.type='button';download.onclick=()=>saveCSV(archiveCSV(out,county,town),[displayCounty(county),town,'地区选举档案'].filter(Boolean).join('-'));host.append(download);
for(const office of os){const rows=out.filter(r=>r.office===office).sort((a,b)=>b.y-a.y);if(!rows.length)continue;heading(host,offices[office]+(office==='council'||office==='legislative'?'（'+ballotText(rows[0].ballot)+'）':''));const wrap=el('div',undefined,'discovery-table-wrap'),t=el('table',undefined,'history-candidate-table'),h=el('thead'),tr=el('tr');for(const v of ['届次','行政区口径','当选／领先政党','有效票','投票率','查看'])tr.append(el('th',v));h.append(tr);t.append(h);const body=el('tbody');for(const r of rows){const x=r.entry,tr=el('tr'),lead=x?.leader?.join('、')||'—';for(const v of [label(r.y,office),partition(county,r.y)||'当届县市',x?.complete?r.elected||lead:'缺档或未核实',fmt(x?.valid),pct(x?.profile?.turnout)])tr.append(el('td',v));const td=el('td'),a=el('a','查看结果');a.href=hash(office,r.y,county,{view:'map',...(town?{level:'town',area:town}:{}),...(office==='legislative'||office==='council'?{electorate:r.ballot}:{})});a.onclick=e=>{rd.close();if(root.location.hash===a.hash){e.preventDefault();root.SiteWorkspaceCategories.openHistory(root.SiteRouting.parse(a.hash)).then(()=>root.dispatchEvent(new Event('site-route-change')))}};td.append(a);tr.append(td);body.append(tr)}t.append(body);wrap.append(t);host.append(wrap);archiveCharts(host,rows,county,town,active)}
}catch(e){if(active())status.textContent='查询失败：'+e.message}};

const pa=$('partyArchiveName'),po=$('partyArchiveOffice'),pb=$('partyArchiveBallot'),pc=$('partyArchiveCounty'),pr=$('partyArchiveResults'),ps=$('partyArchiveStatus');
let partyNamesPromise=null;
function updateBallot(){
 const list=po.value==='legislative'?[['regional','区域'],['party','不分区政党票（2008年起）'],['plains','平地少数民族'],['mountain','山地少数民族']]:po.value==='council'?[['regional','区域'],['plains','平地少数民族'],['mountain','山地少数民族']]:[['all','全部类型']];
 const prior=pb.value;pb.replaceChildren(...list.map(([v,t])=>new Option(t,v)));if(list.some(([v])=>v===prior))pb.value=prior;pb.parentElement.hidden=list.length===1;
 for(const option of pc.options)option.disabled=po.value==='legislative'&&['plains','mountain'].includes(pb.value)&&!!option.value;
 if(pc.selectedOptions[0]?.disabled)pc.value='';
}
async function partyChoices(){
 if(!partyNamesPromise)partyNamesPromise=(async()=>{
  const names=new Set(PARTY_PRESETS.filter(p=>!['gray','red'].includes(p.id)).map(p=>p.name));
  try{const res=await fetch('reports/coverage-audit.json',{cache:'no-cache'});if(!res.ok)throw Error('audit');const a=await res.json();for(const r of [...(a.top_archive_parties||[]),...(a.priority_party_inventory||[])])if(r.name&&!/^(无党籍|连署|其他政党|政党资料缺失)/.test(r.name))names.add(r.name)}catch(e){}
  return [...names].sort((a,b)=>a.localeCompare(b,'zh-CN'))
 })();
 const names=await partyNamesPromise,options=$('partyArchiveNames');options.replaceChildren(...names.map(name=>new Option(name,name)));return names
}
function openParty(name='',context={}){
 if(!pd)return;if(sd.open)sd.close();if(rd.open)rd.close();
 if(!pd.open)pd.showModal();partyRun++;pr.replaceChildren();ps.textContent='选择政党、选举类别和统计范围后查询。';if(name)pa.value=name;
 if(!pc.options.length)pc.replaceChildren(new Option('已收录地区汇总',''),...counties.map(c=>new Option(displayCounty(c),c)));
 if(context.office&&Object.hasOwn(offices,context.office))po.value=context.office;
 if(context.county!==undefined)pc.value=counties.includes(context.county)?context.county:'';
 updateBallot();if(context.ballot&&[...pb.options].some(x=>x.value===context.ballot)){pb.value=context.ballot;updateBallot()}
 root.dispatchEvent(new Event('observationdialogchange'));partyChoices().catch(()=>{});if(name)$('partyArchiveForm').requestSubmit();else pa.focus()
}
root.HistoryDiscovery.openParty=openParty;
if(pd){
 $('observationPartyOpen').onclick=()=>openParty();po.onchange=pb.onchange=updateBallot;pd.addEventListener('close',()=>{partyRun++;root.dispatchEvent(new Event('observationdialogchange'))});
 $('partyArchiveForm').onsubmit=async e=>{
 e.preventDefault();const run=++partyRun,active=()=>run===partyRun&&pd.open,office=po.value,ballot=pb.value,county=pc.value;let name=pa.value.trim();pr.replaceChildren();if(!name)return;ps.textContent='正在读取历史档案…';
 try{
  const names=await partyChoices();if(!active())return;const exact=names.find(p=>nk(p)===nk(name));const preset=PARTY_PRESETS.find(p=>[p.name,...(p.aliases||[])].some(v=>nk(v)===nk(name)));name=exact||preset?.name||name;pa.value=name;
  await root.HistoryLoader.load();if(!active())return;
  const C=root.HistoryObservationCore,H=root.HistoryCompare,ys=[...years(office)].filter(y=>(!county||countyMatches(county,y))&&(ballot!=='party'||y>=2008)).sort((a,b)=>a-b);
  const tasks=ys.map(y=>[office,y]),{out,fail}=await pool(tasks,active,async ([o,y])=>{
   const s=await load(o,y);let m;
   if(o==='legislative'&&ballot==='party'&&!county)m=C.listModel(root.HistoryLegislativeParty.build(y,s));
   else if(o==='legislative'&&ballot==='party'&&county){
    // County party ballots never carry seats. Validate the sum of county party votes against the verified official all-area list first.
    const summary=H.summarize(s,o,ballot,norm),official=C.listModel(root.HistoryLegislativeParty.build(y,s)),x=summary.counties.get(county);
    const totals=new Map();for(const entry of summary.counties.values())if(entry.complete)for(const [p,v] of Object.entries(entry.parties))totals.set(p,(totals.get(p)||0)+v.votes);
    const verified=summary.all.complete&&finite(official.votes)&&summary.all.valid===official.votes&&official.parties.every(p=>totals.get(p.party)===p.votes)&&totals.size===official.parties.length;
    m=verified&&x?.complete?{votes:x.valid,seats:null,parties:Object.entries(x.parties).map(([party,v])=>({party,...v}))}:{votes:null,seats:null,parties:[]}
   }else m=C.model(s,o,ballot,county,norm);
   if(o==='president'&&!county&&finite(s.national?.valid_votes)&&s.national.valid_votes!==m.votes)m={votes:null,seats:null,parties:m.parties};
   return {office:o,ballot,y,label:label(y,o),...partyArchiveRecord(m,name,norm)}
  },(done,total)=>ps.textContent='已查询 '+done+' / '+total+' 届…');if(!active())return;
  const rows=[...out,...fail.map(([o,y])=>({office:o,ballot,y,label:label(y,o),status:'读取失败',votes:null,share:null,seats:null,seatShare:null}))].sort((a,b)=>a.y-b.y);
  ps.textContent=name+' · '+offices[office]+' · '+(county?displayCounty(county):'已收录地区汇总')+'：'+rows.filter(r=>r.status==='已收录').length+' 届有可用指标。';
  const note=el('p','按当届党名查询；未见参选记录、缺档及不适用指标均留空。汇总仅指已收录档案，不保证早期缺档地区已齐全。县市合并前后分开呈现。','data-help');pr.append(note);
  const dl=el('button','导出 CSV','button quiet');dl.type='button';dl.onclick=()=>saveCSV(partyArchiveCSV(rows,name,county),name+'-'+offices[office]+'-政党档案');pr.append(dl);
  const wrap=el('div',undefined,'discovery-table-wrap'),table=el('table',undefined,'history-candidate-table'),head=el('thead'),hr=el('tr'),body=el('tbody');
  for(const v of ['届次','行政区口径','得票数','得票率','当选席次','席次率','资料状态','查看'])hr.append(el('th',v));head.append(hr);table.append(head,body);
  function route(row){const route=hash(office,row.y,county,{view:'map',...(['legislative','council'].includes(office)?{electorate:ballot}:{})});const a=el('a','查看结果');a.href=route;a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;pd.close();if(root.location.hash===a.hash){e.preventDefault();root.SiteWorkspaceCategories.openHistory(root.SiteRouting.parse(a.hash)).then(()=>root.dispatchEvent(new Event('site-route-change')))}};return a}
  for(const row of [...rows].reverse()){const tr=el('tr');for(const v of [row.label,partition(county,row.y)||'当届范围',fmt(row.votes),pct(row.share),fmt(row.seats),pct(row.seatShare),row.status])tr.append(el('td',v));const td=el('td');td.append(route(row));tr.append(td);body.append(tr)}wrap.append(table);pr.append(wrap);
  const metric=el('select'),controls=el('div',undefined,'observation-toolbar'),chartHost=el('div',undefined,'region-trend-output'),readout=el('div',undefined,'observation-detail');chartHost.dataset.trendSeriesScope='party-archive';
  const metrics=[['share','得票率'],['votes','得票数'],['seats','当选席次'],['seatShare','席次率']].filter(([k])=>rows.some(row=>finite(row[k])));
  if(!metrics.length)return;metric.replaceChildren(...metrics.map(([k,v])=>new Option(v,k)));const ml=el('label',undefined,'observation-filter');ml.append(el('span','趋势指标'),metric);controls.append(ml);pr.append(controls,chartHost,readout);await root.HistoryLoader.loadTrends();if(!active())return;
  const engine=root.HistoryTrendCharts;function draw(){if(!active())return;chartHost.replaceChildren();readout.replaceChildren();const kind=metric.value,isPct=kind==='share'||kind==='seatShare',max=Math.max(1,...rows.map(r=>r[kind]).filter(finite));const split=archiveSections(rows.map(r=>({...r,year:r.y,complete:r.status==='已收录'||r.status==='未见参选记录',scopeSeries:partition(county,r.y),scopeLabel:partition(county,r.y)})));
   for(const section of split){if(!section.rows.some(r=>finite(r[kind])))continue;const title=[name,offices[office],ballotText(ballot),county?displayCounty(county):'已收录地区汇总',metrics.find(x=>x[0]===kind)[1],section.label].filter(Boolean).join(' · ');
    const graph=engine.chart(section.rows,[{name,color:engine.color(name),get:r=>r[kind]}],title,{pct:isPct,integer:!isPct,axisMax:max,hiddenSeries:new Set(),onPoint:(row,summary)=>{readout.replaceChildren(el('strong',summary),route(row))}});
    chartHost.append(engine.card(title,'',graph,title,{prefix:'政党档案',office:offices[office],status:ps}))
   }
  }metric.onchange=draw;draw();
 }catch(e){if(active())ps.textContent='查询失败：'+e.message}
 };
}

})(typeof window==='undefined'?globalThis:window);
