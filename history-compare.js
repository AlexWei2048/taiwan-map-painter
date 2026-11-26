/* Read-only two-election comparison. One ballot and one geographic grain at a time. */
(function(root){
'use strict';
const Core=typeof module!=='undefined'&&module.exports?require('./history-core.js'):root.HistoryCore;
const number=v=>Number.isSafeInteger(v)&&v>=0;
const norm=v=>String(v??'').trim().replaceAll('臺','台').replaceAll('縣','县').replaceAll('無黨籍','无党籍');
const groupParty=v=>{const p=norm(v);return /^无党籍|^连署$/.test(p)?'无党籍（连署）':p||'政党资料缺失'};
const blank=reason=>({complete:false,reason,valid:null,parties:{},leader:null,seats:null});
function summarize(snapshot,office,ballot,normalize=norm){
 const n=v=>normalize(norm(v)),countyMap=new Map(),byContest=new Map();
 const ids=new Set((snapshot.elections||[]).filter(e=>e.office===office).map(e=>e.election_id));
 const accepts=e=>ballot==='all'||Core.identity(e)===ballot;
 const contests=(snapshot.contests||[]).filter(c=>ids.has(c.election_id)&&accepts(c.electorate));
 for(const c of snapshot.candidacies||[]){if(!byContest.has(c.contest_id))byContest.set(c.contest_id,[]);byContest.get(c.contest_id).push(c)}
 const geographic=office==='legislative'&&ballot==='party';
 const seatAllowed=office!=='president'&&!geographic;
 const entries=new Map(),add=(county,record)=>{if(!county)return;if(!entries.has(county))entries.set(county,[]);entries.get(county).push(record)};
 if(geographic){
  for(const row of snapshot.rows||[])if(row.type===office&&row.level==='county'&&accepts(row.electorate)&&row.county&&!/全部地区|台闽地区|全台|全国/.test(row.county))add(n(row.county),{votes:row.votes,party:row.party,elected:false});
 }else{
  for(const c of contests){const county=n(c.county_name),cs=byContest.get(c.contest_id)||[];
   if(!county)continue;
   if(!countyMap.has(county))countyMap.set(county,[]);
   countyMap.get(county).push({contest:c,cs});
   for(const r of cs)add(county,{votes:r.votes,party:r.party_name,elected:r.elected_official});
  }
 }
 function aggregate(rows,checks,county=''){
  if(!rows.length)return blank('没有可核实的得票记录');
  if(rows.some(r=>!number(r.votes)))return blank('候选人得票缺失');
  if(checks.some(({contest:c,cs})=>!cs.length||number(c.valid_votes)&&cs.reduce((a,r)=>a+r.votes,0)!==c.valid_votes))return blank('候选人得票与有效票未对账');
  if(office==='township'&&(snapshot.elections||[]).some(e=>ids.has(e.election_id)&&e.coverage==='partial'))return blank('当届乡镇市区长档案尚不完整');
  if(office==='council'&&snapshot.year===1994&&(!county||county==='金门县'))return blank('1994年议员档案存在已知缺口');
  const valid=rows.reduce((s,r)=>s+r.votes,0);if(!number(valid)||!valid)return blank('有效票缺失或为零');
  const parties=Object.create(null);
  const seatComplete=seatAllowed&&checks.length>0&&checks.every(({contest:c,cs})=>number(c.seats)&&cs.every(r=>typeof r.elected_official==='boolean')&&cs.filter(r=>r.elected_official).length===c.seats);
  for(const r of rows){const party=groupParty(n(r.party)),p=parties[party]||(parties[party]={votes:0,share:0,seats:seatComplete?0:null});p.votes+=r.votes;if(seatComplete&&r.elected)p.seats++}
  for(const p of Object.values(parties))p.share=p.votes/valid*100;
  const metric=seatComplete?'seats':'votes',ranked=Object.entries(parties).sort((a,b)=>b[1][metric]-a[1][metric]);
  const leader=seatAllowed&&!seatComplete?null:ranked.length&&ranked[0][1][metric]>0?ranked.filter(x=>x[1][metric]===ranked[0][1][metric]).map(x=>x[0]):null;
  return {complete:true,reason:'',valid,parties,leader,seats:seatComplete?rows.filter(r=>r.elected).length:null};
 }
 const counties=new Map();
 for(const county of new Set([...countyMap.keys(),...entries.keys()]))counties.set(county,aggregate(entries.get(county)||[],countyMap.get(county)||[],county));
 const all=aggregate([...entries.values()].flat(),[...countyMap.values()].flat());
 if(office==='president'&&all.complete&&number(snapshot.national?.valid_votes)&&all.valid!==snapshot.national.valid_votes)Object.assign(all,blank('全台候选人得票与官方有效票不一致'));
 return {year:snapshot.year,office,ballot,all,counties};
}
function delta(a,b,party){
 const p=a?.complete?a.parties[party]:null,q=b?.complete?b.parties[party]:null;
 return {share:p&&q?q.share-p.share:null,seats:a?.complete&&b?.complete&&a.seats!==null&&b.seats!==null?(q?.seats||0)-(p?.seats||0):null};
}
const changedFamilies=new Set(['台中市','台南市','高雄市']);
function comparableCounty(county,a,b){
 if(!a||!b)return false;
 // 2010/2009 batch already uses the merged cities, not the previous city boundary.
 if(changedFamilies.has(county)&&((a.year<2010)!==(b.year<2010)))return false;
 return true;
}
function turnover(a,b){
 if(!a?.complete||!b?.complete||a.seats!==1||b.seats!==1||a.leader?.length!==1||b.leader?.length!==1)return null;
 const from=a.leader[0],to=b.leader[0];
 if([from,to].includes('政党资料缺失'))return null;
 return {from,to,changed:from!==to};
}
function countyChange(a,b,county,party,mode){
 if(!comparableCounty(county,a,b)||!a.counties.has(county)||!b.counties.has(county))return null;
 const x=a.counties.get(county),y=b.counties.get(county);
 if(mode==='turnover')return a.office==='mayor'&&b.office==='mayor'?turnover(x,y):null;
 if(!party)return null;
 const d=delta(x,y,party);return mode==='seats'?d.seats:mode==='share'?d.share:null;
}
function csvCell(value){
 let text=String(value??'');
 // Protect text cells from spreadsheet formula execution. Preserve signed numeric values.
 if(typeof value!=='number'&&/^[\s]*[=+\-@\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
function comparisonCSV(a,b,scope=''){
 const counties=scope?[scope]:[...new Set([...a.counties.keys(),...b.counties.keys()])].sort((x,y)=>x.localeCompare(y,'zh-CN'));
 const header=['选举类别','票种','左届','右届','县市','政党','左届得票数','右届得票数','左届得票率(%)','右届得票率(%)','得票率变化(百分点)','左届席次','右届席次','席次变化','左届当选政党','右届当选政党','比较说明'];
 const rows=[header];
 for(const county of ['',...counties]){
  const x=county?a.counties.get(county):a.all,y=county?b.counties.get(county):b.all;
  const same=!county||comparableCounty(county,a,b)&&!!x&&!!y;
  const parties=[...new Set([...Object.keys(x?.parties||{}),...Object.keys(y?.parties||{})])].sort((p,q)=>p.localeCompare(q,'zh-CN'));
  const reason=!same?'当届行政区范围不同或资料不存在':[x?.complete?'':x?.reason||'左届无资料',y?.complete?'':y?.reason||'右届无资料'].filter(Boolean).join('；');
  const t=county&&same&&a.office==='mayor'?turnover(x,y):null;
  for(const p of parties.length?parties:['']){
   const l=x?.complete?x.parties[p]:null,r=y?.complete?y.parties[p]:null,d=same?delta(x,y,p):{};
   rows.push([a.office,a.ballot,a.year,b.year,county||'全部地区',p,l?.votes,r?.votes,l?.share,r?.share,d.share,x?.complete&&x.seats!==null?(l?.seats||0):null,y?.complete&&y.seats!==null?(r?.seats||0):null,d.seats,t?.from,t?.to,reason]);
  }
 }
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
const api={summarize,delta,comparableCounty,turnover,countyChange,comparisonCSV};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
root.HistoryCompare=api;
const doc=root.document,$=id=>doc.getElementById(id),open=$('historyCompareOpen');if(!open)return;
const dialog=$('historyCompareDialog'),office=$('compareOffice'),ballot=$('compareBallot'),left=$('compareYearA'),right=$('compareYearB'),party=$('compareParty'),status=$('compareStatus'),county=$('compareCounty');
const node=(tag,t)=>{const e=doc.createElement(tag);if(t!==undefined)e.textContent=t;return e};
const svg=(tag,attrs={})=>{const e=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e};
const normalize=v=>typeof simplify==='function'?simplify(String(v||'')):norm(v);
let token=0,models=null,baseBox=null,zoom=1,offsetX=0,offsetY=0,chosen='';
const cache=new Map();
const mode=$('compareMode');
const seatAllowed=summary=>summary.office!=='president'&&summary.ballot!=='party';
const label=(year,o)=>root.HistoryLocal.yearLabel(year,o);
const years=o=>o==='president'?root.HistoryPresidential.YEARS:o==='legislative'?root.HistoryLegislative.YEARS:root.HistoryLocal.years(o,root.HISTORY_2026_RESULTS_AVAILABLE===true);
function setYears(preferred){
 const ys=years(office.value).filter(y=>!(office.value==='legislative'&&ballot.value==='party'&&y<2008));
 for(const s of [left,right])s.replaceChildren(...ys.map(y=>new Option(label(y,office.value),String(y))));
 const last=ys.includes(preferred)?preferred:ys.at(-1);right.value=String(last);left.value=String(ys.filter(y=>y<last).at(-1)||ys.find(y=>y!==last)||last);
}
function setBallots(){
 const o=office.value,choices=o==='council'?[['regional','区域议员'],['plains','平地少数民族议员'],['mountain','山地少数民族议员']]:o==='legislative'?[['regional','区域民代'],['party','不分区政党票（2008年起）']]:[['all','全部类型']];
 ballot.replaceChildren(...choices.map(([v,l])=>new Option(l,v)));$('compareBallotBox').hidden=choices.length===1;
}
async function snapshot(o,y){
 if(o==='president')return root.HistoryPresidential.load(y);
 if(o==='legislative')return root.HistoryLegislative.load(y);
 return [2022,2026].includes(y)?root.History2022View.trendSnapshot(y):root.HistoryLocal.loadCycle(y,o);
}
async function model(o,y,b){
 const key=[o,y,b].join('|');
 if(!cache.has(key)){
  const p=(async()=>{
   const shard=await snapshot(o,y);
   if(!data?.counties)throw Error('地图尚未载入');
   const reference=y<=2010?await root.HistoryPresidential.load(2008):null;
   const geometry=o==='president'?root.HistoryPresidential.geometry(shard,data,normalize,Core.mergePaths):
    root.HistoryLocal.geometry(shard,data,reference,normalize,Core.mergePaths,root.HistoryPresidential.modernCounty,root.HistoryPresidential.baseTown);
   return {summary:summarize(shard,o,b,normalize),shapes:geometry.counties};
  })();cache.set(key,p);p.catch(()=>{if(cache.get(key)===p)cache.delete(key)});
  if(cache.size>8)cache.delete(cache.keys().next().value);
 }
 return cache.get(key);
}
function setBox(){
 if(!baseBox)return;
 const [x,y,w,h]=baseBox,box=[x+w*(1-1/zoom)/2+offsetX,y+h*(1-1/zoom)/2+offsetY,w/zoom,h/zoom].join(' ');
 for(const id of ['compareMapA','compareMapB'])$(id).setAttribute('viewBox',box);
}
function color(p){if(!p)return '#edf1e9';return (typeof partyMatch==='function'?partyMatch(p)?.color:null)||'#87988e'}
const rate=v=>Number.isFinite(v)?v.toFixed(2)+'%':'—',signed=(v,d=2)=>Number.isFinite(v)?(v>0?'+':'')+v.toFixed(d):'—';
function drawMap(model,id,index){
 const graph=$(id);graph.replaceChildren();const defs=svg('defs');graph.append(defs);
 for(const f of model.shapes){
  const name=normalize(f.name||f.county),entry=model.summary.counties.get(name),selected=party.value,share=entry?.complete?entry.parties[selected]?.share:null;
  let fill='#edf1e9';const leaders=entry?.leader||[];
  if(selected&&Number.isFinite(share))fill=typeof ElectionCore!=='undefined'?ElectionCore.shade(color(selected),share,0,100):color(selected);
  else if(!selected&&leaders.length===1)fill=color(leaders[0]);
  else if(!selected&&leaders.length>1){const pid='compare-tie-'+index+'-'+defs.childElementCount,g=svg('linearGradient',{id:pid,x1:'0%',y1:'0%',x2:'100%',y2:'100%'});leaders.forEach((p,i)=>{g.append(svg('stop',{offset:(i/leaders.length*100)+'%','stop-color':color(p)}),svg('stop',{offset:((i+1)/leaders.length*100)+'%','stop-color':color(p)}))});defs.append(g);fill='url(#'+pid+')'}
  const changeMode=index===1&&mode.value!=='results'&&(mode.value==='turnover'||selected);
  let change=null,changeLabel='';
  if(changeMode){
   change=countyChange(models[0].summary,model.summary,name,selected,mode.value);
   if(mode.value==='turnover'){
    fill=change?change.changed?'#b56c30':'#dcebe1':'#d9dfdc';
    changeLabel=change?change.from+' → '+change.to+(change.changed?'（易手）':'（党籍未变）'):'不可比较';
   }else{
    const max=mode.value==='seats'?seatChangeMax():30;
    fill=Number.isFinite(change)?Math.abs(change)<.005?'#f1f0ec':ElectionCore.shade(change>0?'#26744e':'#a94b35',Math.min(max,Math.abs(change)),0,max):'#d9dfdc';
    changeLabel=Number.isFinite(change)?signed(change,mode.value==='seats'?0:2)+(mode.value==='seats'?' 席':' 个百分点'):'不可比较';
   }
  }
  const path=svg('path',{d:f.d,fill,stroke:name===chosen?'#182d26':'#546f62','stroke-width':name===chosen?2.5:.8,'vector-effect':'non-scaling-stroke','fill-rule':f.fillRule||'evenodd',tabindex:'0',role:'button','aria-label':name+' '+(changeMode?changeLabel:entry?.complete?(selected?rate(share):leaders.join('、')||'席次待核'):'缺档或不适用')});
  const title=svg('title');title.textContent=path.getAttribute('aria-label');path.append(title);path.onclick=()=>{chosen=name;county.value=name;render()};path.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chosen=name;county.value=name;render()}};graph.append(path);
 }
}
function seatChangeMax(){if(!models||!party.value)return 1;const [a,b]=models.map(x=>x.summary);return Math.max(1,...[...b.counties.keys()].map(c=>Math.abs(countyChange(a,b,c,party.value,'seats')??0)))}
function render(){
 if(!models)return;
 const [a,b]=models,as=a.summary,bs=b.summary;
 const allowed=seatAllowed(as);
 for(const option of mode.options)option.disabled=option.value==='share'&&!party.value||option.value==='seats'&&(!party.value||!allowed)||option.value==='turnover'&&as.office!=='mayor';
 if(mode.selectedOptions[0]?.disabled)mode.value='results';
 if(mode.value==='turnover'&&party.value)party.value='';
 const suffix={results:'',share:' · 得票率变化',seats:' · 席次变化',turnover:' · 执政权变化'}[mode.value];
 $('compareMapTitleA').textContent=label(as.year,as.office);$('compareMapTitleB').textContent=label(bs.year,bs.office)+suffix;
 drawMap(a,'compareMapA',0);drawMap(b,'compareMapB',1);setBox();
 const available=chosen?comparableCounty(chosen,as,bs)&&as.counties.has(chosen)&&bs.counties.has(chosen):true;
 const x=chosen?as.counties.get(chosen):as.all,y=chosen?bs.counties.get(chosen):bs.all,host=$('compareTable');host.replaceChildren();
 const heading=node('h3',chosen||'全部地区');host.append(heading);
 if(!available)host.append(node('p','当届行政区范围不同或资料不存在，不计算该地区变化值。'));
 if(x&&!x.complete)host.append(node('p',label(as.year,as.office)+'：'+x.reason));if(y&&!y.complete)host.append(node('p',label(bs.year,bs.office)+'：'+y.reason));
 if(chosen&&available&&as.office==='mayor'){
  const t=turnover(x,y);if(t)host.append(node('p','当选政党：'+t.from+' → '+t.to+(t.changed?'（易手）':'（党籍未变，不代表同一人）')));
 }
 if(!chosen&&mode.value==='turnover'){
  const states=[...new Set([...as.counties.keys(),...bs.counties.keys()])].map(c=>countyChange(as,bs,c,'','turnover'));
  host.append(node('p','可比县市：'+states.filter(Boolean).length+'；党籍易手：'+states.filter(t=>t?.changed).length+'；党籍未变：'+states.filter(t=>t&&!t.changed).length+'；不可比：'+states.filter(t=>!t).length+'。'));
 }
 const table=node('table');table.className='history-candidate-table compare-data-table';const head=node('thead'),hr=node('tr');
 for(const t of ['政党',label(as.year,as.office)+' 得票率',label(bs.year,bs.office)+' 得票率','变化（百分点）',label(as.year,as.office)+' 席次',label(bs.year,bs.office)+' 席次','席次增减'])hr.append(node('th',t));head.append(hr);table.append(head);
 const body=node('tbody'),parties=[...new Set([...Object.keys(x?.parties||{}),...Object.keys(y?.parties||{})])].sort((p,q)=>(y?.parties[q]?.votes||0)-(y?.parties[p]?.votes||0)||p.localeCompare(q,'zh-CN'));
 for(const p of parties){const tr=node('tr'),l=x?.parties[p],r=y?.parties[p],d=available?delta(x,y,p):{};for(const v of [p,rate(l?.share),rate(r?.share),signed(d.share),x?.complete&&x.seats!==null?(l?.seats||0):'—',y?.complete&&y.seats!==null?(r?.seats||0):'—',signed(d.seats,0)])tr.append(node('td',v));body.append(tr)}
 table.append(body);host.append(table);
 $('compareLegend').textContent=mode.value==='turnover'?'左图为左届当选政党；右图橙色为党籍易手、浅绿色为党籍未变、灰色不可比。无党籍归为同一类别，不代表同一候选人。':mode.value==='seats'?'左图为所选政党左届得票率；右图为右届减左届席次（绿增、红减，最大绝对变化 '+seatChangeMax()+' 席；灰色不可比）。':mode.value==='share'?'左图为原届得票率；右图为右届减左届的百分点变化（绿增、红减，绝对值≥30百分点同为最深色，灰色不可比）。':party.value?'同一政党得票率：0%—100%；未参选或缺档为灰色。':as.office==='president'||as.ballot==='party'?'颜色表示最高票政党；并列使用多色。':'颜色表示当选席次最多政党；并列使用多色。';
 for(const id of ['compareExportSvg','compareExportCsv','compareExportPng'])$(id).disabled=false;
}
async function refresh(){
 const my=++token,o=office.value,b=ballot.value,y1=Number(left.value),y2=Number(right.value);models=null;
 $('compareMapA').replaceChildren();$('compareMapB').replaceChildren();$('compareTable').replaceChildren();$('compareLegend').textContent='';for(const id of ['compareExportSvg','compareExportCsv','compareExportPng'])$(id).disabled=true;
 if(y1===y2){status.textContent='请选择不同届次';return}
 status.textContent='正在载入两届正式历史资料…';
 try{
  const values=await Promise.all([model(o,y1,b),model(o,y2,b)]);if(my!==token)return;
  models=values;zoom=1;offsetX=offsetY=0;const shapes=values.flatMap(x=>x.shapes),bounds=shapes.reduce((a,f)=>[Math.min(a[0],f.box[0]),Math.min(a[1],f.box[1]),Math.max(a[2],f.box[2]),Math.max(a[3],f.box[3])],[Infinity,Infinity,-Infinity,-Infinity]);const w=bounds[2]-bounds[0],h=bounds[3]-bounds[1];if(!Number.isFinite(w+h)||w<=0||h<=0)throw Error('县市地图范围无效');baseBox=[bounds[0]-w*.06,bounds[1]-h*.06,w*1.12,h*1.12];
  const names=[...new Set(values.flatMap(v=>v.shapes.map(f=>normalize(f.name||f.county))))].sort((a,b)=>Core.compareResultRows({county:a},{county:b},o));
  const oldCounty=chosen;county.replaceChildren(new Option('全部地区',''),...names.map(n=>new Option(n,n)));chosen=names.includes(oldCounty)?oldCounty:'';county.value=chosen;
  const oldParty=party.value,ps=[...new Set(values.flatMap(v=>[...v.summary.counties.values()].flatMap(r=>Object.keys(r.parties))))].sort((a,b)=>a.localeCompare(b,'zh-CN'));party.replaceChildren(new Option('当选／领先政党',''),...ps.map(p=>new Option(p,p)));party.value=ps.includes(oldParty)?oldParty:'';
  status.textContent='已载入；灰色表示无适用或可核实结果，并非零票。';render();
 }catch(e){if(my===token){models=null;status.textContent='载入失败：'+e.message}}
}
open.onclick=()=>{office.value=root.History2022View?.office()||'mayor';chosen='';mode.value='results';setBallots();setYears(root.History2022View?.year());dialog.showModal();refresh()};
office.onchange=()=>{chosen='';setBallots();setYears();refresh()};ballot.onchange=()=>{setYears();refresh()};left.onchange=right.onchange=refresh;party.onchange=()=>{if(mode.value==='turnover')mode.value='results';render()};mode.onchange=render;county.onchange=()=>{chosen=county.value;render()};
$('compareZoomIn').onclick=()=>{zoom=Math.min(5,zoom*1.25);setBox()};$('compareZoomOut').onclick=()=>{zoom=Math.max(1,zoom/1.25);if(baseBox){const mx=baseBox[2]*(1-1/zoom)/2,my=baseBox[3]*(1-1/zoom)/2;offsetX=Math.max(-mx,Math.min(mx,offsetX));offsetY=Math.max(-my,Math.min(my,offsetY))}setBox()};$('compareFit').onclick=()=>{zoom=1;offsetX=offsetY=0;setBox()};$('compareRetry').onclick=refresh;
// Pan either map, preserving the same viewBox on the other. Do not turn a drag into a county selection.
for(const id of ['compareMapA','compareMapB']){
 const graph=$(id);let drag=null,suppress=false;
 graph.addEventListener('pointerdown',e=>{if(!baseBox||zoom<=1||e.button!==0)return;drag={x:e.clientX,y:e.clientY,ox:offsetX,oy:offsetY,id:e.pointerId,moved:false};suppress=false});
 graph.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!drag.moved&&Math.hypot(dx,dy)<5)return;
  if(!drag.moved){drag.moved=true;graph.setPointerCapture?.(e.pointerId)}
  const rect=graph.getBoundingClientRect(),scale=Math.min(rect.width/(baseBox[2]/zoom),rect.height/(baseBox[3]/zoom));
  if(!(scale>0))return;
  const maxX=baseBox[2]*(1-1/zoom)/2,maxY=baseBox[3]*(1-1/zoom)/2;
  offsetX=Math.max(-maxX,Math.min(maxX,drag.ox-dx/scale));offsetY=Math.max(-maxY,Math.min(maxY,drag.oy-dy/scale));setBox();
 });
 const end=()=>{suppress=!!drag?.moved;drag=null};
 graph.addEventListener('pointerup',end);graph.addEventListener('pointercancel',end);
 graph.addEventListener('click',e=>{if(suppress){e.preventDefault();e.stopImmediatePropagation();suppress=false}},true);
}
dialog.addEventListener('close',()=>{token++;models=null});
})(typeof window==='undefined'?globalThis:window);
