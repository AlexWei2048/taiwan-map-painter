/* Read-only two-election comparison. One ballot and one geographic grain at a time. */
(function(root){
'use strict';
const Core=typeof module!=='undefined'&&module.exports?require('./history-core.js'):root.HistoryCore;
const number=v=>Number.isSafeInteger(v)&&v>=0;
const norm=v=>String(v??'').trim().replaceAll('臺','台').replaceAll('縣','县').replaceAll('無黨籍','无党籍');
const groupParty=v=>{const p=norm(v);return /^无党籍|^连署$/.test(p)?'无党籍（连署）':p||'政党资料缺失'};
const blank=reason=>({complete:false,reason,valid:null,parties:{},leader:null,seats:null});
function verifiedProfile(checks,valid){
 if(!checks.length||!number(valid))return null;
 const p={registered:0,cast:0,valid:0,invalid:0};
 for(const {contest:c} of checks){
  if(![c.registered_voters,c.ballots_cast,c.valid_votes,c.invalid_votes].every(number)||c.ballots_cast>c.registered_voters||c.valid_votes+c.invalid_votes!==c.ballots_cast)return null;
  p.registered+=c.registered_voters;p.cast+=c.ballots_cast;p.valid+=c.valid_votes;p.invalid+=c.invalid_votes;
 }
 if(p.valid!==valid||!p.registered)return null;
 return {...p,turnout:p.cast/p.registered*100};
}
function profileChange(a,b,metric){const x=a?.complete?a.profile?.[metric]:null,y=b?.complete?b.profile?.[metric]:null;return Number.isFinite(x)&&Number.isFinite(y)?y-x:null}
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
  return {complete:true,reason:'',valid,parties,leader,seats:seatComplete?rows.filter(r=>r.elected).length:null,profile:geographic?null:verifiedProfile(checks,valid)};
 }
 const counties=new Map();
 for(const county of new Set([...countyMap.keys(),...entries.keys()]))counties.set(county,aggregate(entries.get(county)||[],countyMap.get(county)||[],county));
 const all=aggregate([...entries.values()].flat(),[...countyMap.values()].flat());
 if(office==='president'&&all.complete&&number(snapshot.national?.valid_votes)&&all.valid!==snapshot.national.valid_votes)Object.assign(all,blank('全台候选人得票与官方有效票不一致'));
 return {year:snapshot.year,office,ballot,all,counties};
}
function delta(a,b,party){
 const p=a?.complete?a.parties[party]:null,q=b?.complete?b.parties[party]:null;
 return {share:p&&q?q.share-p.share:null,votes:p&&q&&number(p.votes)&&number(q.votes)?q.votes-p.votes:null,seats:a?.complete&&b?.complete&&a.seats!==null&&b.seats!==null?(q?.seats||0)-(p?.seats||0):null};
}
// Compare town returns only after independent county/candidate reconciliation.
function summarizeTowns(snapshot,office,ballot,normalize=norm){
 const n=v=>normalize(norm(v)),base=summarize(snapshot,office,ballot,normalize),counties=new Map(),all={...base.all,seats:null,leader:null};
 const result={year:snapshot.year,office,ballot,level:'town',all,counties};
 const partyList=office==='legislative'&&ballot==='party';
 if(snapshot.year<2014)return result;
 if(office==='township'){
  const ids=new Set((snapshot.elections||[]).filter(e=>e.office===office).map(e=>e.election_id)),members=new Map(),seen=new Set();
  for(const r of snapshot.candidacies||[]){if(!members.has(r.contest_id))members.set(r.contest_id,[]);members.get(r.contest_id).push(r)}
  for(const contest of snapshot.contests||[]){
   if(!ids.has(contest.election_id)||!contest.county_name||!contest.district_name)continue;
   const key=n(contest.county_name)+'|'+n(contest.district_name),rs=members.get(contest.contest_id)||[];
   if(seen.has(key)){counties.set(key,blank('同名乡镇选举区无法唯一匹配'));continue}seen.add(key);
   if(contest.seats!==1||!number(contest.valid_votes)||!contest.valid_votes||!rs.length||rs.some(r=>!number(r.votes)||!r.party_name||/缺失|待核|未知/.test(r.party_name)||typeof r.elected_official!=='boolean')||rs.reduce((a,r)=>a+r.votes,0)!==contest.valid_votes||rs.filter(r=>r.elected_official).length!==1){counties.set(key,blank('乡镇市区长候选人或当选结果未能核实'));continue}
   const parties=Object.create(null),valid=contest.valid_votes;
   for(const r of rs){const p=groupParty(n(r.party_name)),v=parties[p]||(parties[p]={votes:0,share:0,seats:0});v.votes+=r.votes;if(r.elected_official)v.seats++}
   for(const p of Object.values(parties))p.share=p.votes/valid*100;
   counties.set(key,{complete:true,reason:'',valid,parties,seats:1,leader:Object.keys(parties).filter(p=>parties[p].seats===1),profile:verifiedProfile([{contest}],valid)});
  }
  return result;
 }
 if(!(['president','mayor'].includes(office)||partyList))return result;
 const byCounty=new Map(),profiles=new Map(),identity=r=>partyList?n(r.party||r.name):[n(r.name),String(Number(r.number))].join('|');
 for(const p of snapshot.townProfiles||[])if(p.office===office)profiles.set(n(p.county)+'|'+n(p.town),p);
 for(const r of snapshot.rows||[]){
  if(r.type!==office||!(ballot==='all'||Core.identity(r.electorate)===ballot)||!['county','town'].includes(r.level)||!r.county||/全部地区|台闽地区|全台|全国/.test(r.county))continue;
  const county=n(r.county),b=byCounty.get(county)||{county:[],town:[]};byCounty.set(county,b);
  if(r.level==='county')b.county.push(r);else if(r.town)b.town.push(r);
 }
 for(const [county,b] of byCounty){
  const expected=new Map(),actual=new Map(),perTown=new Map();
  for(const r of b.county){const k=identity(r);if(!number(r.votes)||expected.has(k)){expected.clear();break}expected.set(k,r)}
  for(const r of b.town){const town=n(r.town),rs=perTown.get(town)||[];perTown.set(town,rs);rs.push(r);const k=identity(r);actual.set(k,(actual.get(k)??0)+(number(r.votes)?r.votes:NaN))}
  const countyResult=base.counties.get(county);
  const complete=countyResult?.complete&&expected.size>0&&actual.size===expected.size&&[...expected].every(([k,r])=>actual.get(k)===r.votes)&&[...expected.values()].reduce((a,r)=>a+r.votes,0)===countyResult.valid;
  for(const [town,rs] of perTown){
   const key=county+'|'+town,ids=rs.map(identity),verified=complete&&ids.length===expected.size&&new Set(ids).size===ids.length&&rs.every(r=>expected.has(identity(r))&&number(r.votes)&&groupParty(n(r.party))===groupParty(n(expected.get(identity(r)).party)));
   if(!verified){counties.set(key,blank('乡镇逐候选人得票尚未与县级结果对账'));continue}
   const valid=rs.reduce((a,r)=>a+r.votes,0);if(!valid){counties.set(key,blank('有效票缺失或为零'));continue}
   const parties=Object.create(null);for(const r of rs){const p=groupParty(n(r.party)),v=parties[p]||(parties[p]={votes:0,share:0,seats:null});v.votes+=r.votes}
   for(const p of Object.values(parties))p.share=p.votes/valid*100;
   const max=Math.max(...Object.values(parties).map(p=>p.votes)),leader=Object.keys(parties).filter(p=>parties[p].votes===max);
   const p=profiles.get(key);counties.set(key,{complete:true,reason:'',valid,parties,leader,seats:null,profile:p?verifiedProfile([{contest:p}],valid):null});
  }
 }
 return result;
}
// Attach only independently verified, same-ballot statistics to comparable results.
function legislativeProfiles(summary,turnout){
 if(summary.office!=='legislative'||!['regional','party'].includes(summary.ballot)||!turnout?.enrich||summary.ballot==='party'&&summary.year<2008)return summary;
 function attach(entry,scope,county='',area=''){
  if(!entry?.complete||!number(entry.valid))return;
  const v=turnout.enrich({validVotes:entry.valid},{year:summary.year,electorate:summary.ballot,scope,county,area});
  const p=verifiedProfile([{contest:{registered_voters:v.registeredVoters,ballots_cast:v.ballotsCast,valid_votes:v.validVotes,invalid_votes:v.invalidVotes}}],entry.valid);
  if(p&&entry.profile&&['registered','cast','valid','invalid'].some(k=>entry.profile[k]!==p[k]))entry.profile=null;
  else if(p)entry.profile=p;
 }
 attach(summary.all,'all');
 for(const [key,entry] of summary.counties){const [county,area]=key.split('|');attach(entry,summary.level==='town'?'town':'county',county,area||'')}
 return summary;
}
const changedFamilies=new Set(['台中市','台南市','高雄市']);
function comparableCounty(county,a,b){
 if(!a||!b)return false;
 if(a.level==='town'||b.level==='town')return a.level===b.level&&a.year>=2014&&b.year>=2014&&county.includes('|');
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
 if(['turnout','registered'].includes(mode))return profileChange(x,y,mode);
 if(!party)return null;
 const d=delta(x,y,party);return mode==='seats'?d.seats:mode==='share'?d.share:mode==='votes'?d.votes:null;
}
function csvCell(value){
 let text=String(value??'');
 // Protect text cells from spreadsheet formula execution. Preserve signed numeric values.
 if(typeof value!=='number'&&/^[\s]*[=+\-@\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}
function profileCSV(a,b){const rows=[['地区','左届','右届','左届选举人数','右届选举人数','选举人数变化','左届投票率(%)','右届投票率(%)','投票率变化(百分点)']];for(const k of ['',...new Set([...a.counties.keys(),...b.counties.keys()])]){const x=k?a.counties.get(k):a.all,y=k?b.counties.get(k):b.all,ok=!k||comparableCounty(k,a,b);rows.push([k?k.replace('|',' · '):'全部地区',a.year,b.year,x?.profile?.registered,y?.profile?.registered,ok?profileChange(x,y,'registered'):null,x?.profile?.turnout,y?.profile?.turnout,ok?profileChange(x,y,'turnout'):null])}return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')}
function comparisonCSV(a,b,scope=''){
 const counties=scope?[scope]:[...new Set([...a.counties.keys(),...b.counties.keys()])].sort((x,y)=>x.localeCompare(y,'zh-CN'));
 const officeLabel={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人',legislative:'立法机构民代'}[a.office]||a.office,ballotLabel={all:'全部',regional:'区域',plains:'平地少数民族',mountain:'山地少数民族',party:'不分区政党票'}[a.ballot]||a.ballot;
 const header=['选举类别','票种','左届','右届',a.level==='town'?'县市及乡镇市区':'县市','政党','左届得票数','右届得票数','左届得票率(%)','右届得票率(%)','得票率变化(百分点)','得票数变化','左届席次','右届席次','席次变化','左届当选政党','右届当选政党','比较说明'];
 const rows=[header];
 for(const county of ['',...counties]){
  const x=county?a.counties.get(county):a.all,y=county?b.counties.get(county):b.all;
  const same=!county||comparableCounty(county,a,b)&&!!x&&!!y;
  const parties=[...new Set([...Object.keys(x?.parties||{}),...Object.keys(y?.parties||{})])].sort((p,q)=>p.localeCompare(q,'zh-CN'));
  const reason=!same?'当届行政区范围不同或资料不存在':[x?.complete?'':x?.reason||'左届无资料',y?.complete?'':y?.reason||'右届无资料'].filter(Boolean).join('；');
  const t=county&&same&&a.office==='mayor'?turnover(x,y):null;
  for(const p of parties.length?parties:['']){
   const l=x?.complete?x.parties[p]:null,r=y?.complete?y.parties[p]:null,d=same?delta(x,y,p):{};
   rows.push([officeLabel,ballotLabel,a.year,b.year,county?county.replace('|',' · '):'全部地区',p,l?.votes,r?.votes,l?.share,r?.share,d.share,d.votes,x?.complete&&x.seats!==null?(l?.seats||0):null,y?.complete&&y.seats!==null?(r?.seats||0):null,d.seats,t?.from,t?.to,reason]);
  }
 }
 return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
const api={summarize,summarizeTowns,legislativeProfiles,delta,comparableCounty,turnover,countyChange,comparisonCSV,profileCSV,verifiedProfile,profileChange};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
root.HistoryCompare=api;
const doc=root.document,$=id=>doc.getElementById(id),open=$('historyCompareOpen');if(!open)return;
const dialog=$('historyCompareDialog'),office=$('compareOffice'),ballot=$('compareBallot'),left=$('compareYearA'),right=$('compareYearB'),party=$('compareParty'),status=$('compareStatus'),county=$('compareCounty');
const node=(tag,t)=>{const e=doc.createElement(tag);if(t!==undefined)e.textContent=t;return e};
const svg=(tag,attrs={})=>{const e=doc.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e};
const normalize=v=>typeof simplify==='function'?simplify(String(v||'')):norm(v);
let token=0,models=null,baseBox=null,zoom=1,offsetX=0,offsetY=0,chosen='',savedCompare=null;
const cache=new Map();
const mode=$('compareMode'),level=$('compareLevel');
const shapeKey=f=>level.value==='town'?normalize(f.county)+'|'+normalize(f.name||f.town):normalize(f.name||f.county);
const areaLabel=k=>String(k).replace('|',' · ');
function syncLevel(){const enabled=(['mayor','president'].includes(office.value)||office.value==='legislative'&&ballot.value==='party')&&Number(left.value)>=2014&&Number(right.value)>=2014;level.options[1].disabled=!enabled;if(!enabled)level.value='county';}
const seatAllowed=summary=>summary.level!=='town'&&summary.office!=='president'&&summary.ballot!=='party';
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
async function model(o,y,b,grain){
 const key=[o,y,b,grain].join('|');
 if(!cache.has(key)){
  const p=(async()=>{
   const shard=await snapshot(o,y);
   if(o==='legislative')await root.HistoryLegislativeTurnout.load(y).catch(()=>null);
   if(!data?.counties)throw Error('地图尚未载入');
   const reference=y<=2010?await root.HistoryPresidential.load(2008):null;
   const geometry=o==='president'?root.HistoryPresidential.geometry(shard,data,normalize,Core.mergePaths):
    root.HistoryLocal.geometry(shard,data,reference,normalize,Core.mergePaths,root.HistoryPresidential.modernCounty,root.HistoryPresidential.baseTown);
   const summary=grain==='town'?summarizeTowns(shard,o,b,normalize):summarize(shard,o,b,normalize);return {summary:legislativeProfiles(summary,root.HistoryLegislativeTurnout),shapes:grain==='town'?geometry.towns:geometry.counties};
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
function seatBaseMax(){return Math.max(1,...(models?[...models[0].summary.counties.values()].map(r=>r.seats??0):[]))}
function drawMap(model,id,index){
 const graph=$(id);graph.replaceChildren();const defs=svg('defs');graph.append(defs);
 const seatMax=mode.value==='seats'?seatBaseMax():1,voteMax=mode.value==='votes'?voteBaseMax():1,profileMax=['turnout','registered'].includes(mode.value)?profileBaseMax(mode.value):1,changeMax=mode.value==='seats'?seatChangeMax():mode.value==='votes'?voteChangeMax():['turnout','registered'].includes(mode.value)?profileDeltaMax(mode.value):30;
 for(const f of model.shapes){
  const name=shapeKey(f),entry=model.summary.counties.get(name),selected=party.value,share=entry?.complete?entry.parties[selected]?.share:null;
  let fill='#edf1e9';const leaders=entry?.leader||[];
  if(selected&&Number.isFinite(share))fill=typeof ElectionCore!=='undefined'?ElectionCore.shade(color(selected),share,0,100):color(selected);
  else if(!selected&&leaders.length===1)fill=color(leaders[0]);
  else if(!selected&&leaders.length>1){const pid='compare-tie-'+index+'-'+defs.childElementCount,g=svg('linearGradient',{id:pid,x1:'0%',y1:'0%',x2:'100%',y2:'100%'});leaders.forEach((p,i)=>{g.append(svg('stop',{offset:(i/leaders.length*100)+'%','stop-color':color(p)}),svg('stop',{offset:((i+1)/leaders.length*100)+'%','stop-color':color(p)}))});defs.append(g);fill='url(#'+pid+')'}
  const profileMode=['turnout','registered'].includes(mode.value),baseProfile=profileMode&&index===0&&entry?.complete?entry.profile?.[mode.value]:null;
  if(profileMode&&index===0)fill=Number.isFinite(baseProfile)?ElectionCore.shade('#287963',baseProfile,0,profileMax):'#d9dfdc';
  const baseVotes=index===0&&mode.value==='votes'&&selected,baseVote=baseVotes&&entry?.complete?entry.parties[selected]?.votes:null;
  if(baseVotes)fill=Number.isFinite(baseVote)?ElectionCore.shade(color(selected),baseVote,0,voteMax):'#d9dfdc';
  const baseSeats=index===0&&mode.value==='seats'&&selected;
  const seats=baseSeats&&entry?.complete&&entry.seats!==null?(entry.parties[selected]?.seats||0):null;
  if(baseSeats)fill=Number.isFinite(seats)?ElectionCore.shade(color(selected),seats,0,seatMax):'#d9dfdc';
  const changeMode=index===1&&mode.value!=='results'&&(mode.value==='turnover'||profileMode||selected);
  let change=null,changeLabel='';
  if(changeMode){
   change=countyChange(models[0].summary,model.summary,name,selected,mode.value);
   if(mode.value==='turnover'){
    fill=change?change.changed?'#b56c30':'#dcebe1':'#d9dfdc';
    changeLabel=change?change.from+' → '+change.to+(change.changed?'（易手）':'（党籍未变）'):'不可比较';
   }else{
    const max=changeMax;
    fill=Number.isFinite(change)?Math.abs(change)<.005?'#f1f0ec':ElectionCore.shade(change>0?'#26744e':'#a94b35',Math.min(max,Math.abs(change)),0,max):'#d9dfdc';
    changeLabel=Number.isFinite(change)?signed(change,['seats','votes','registered'].includes(mode.value)?0:2)+(mode.value==='seats'?' 席':mode.value==='votes'?' 票':mode.value==='registered'?' 人':' 个百分点'):'不可比较';
   }
  }
  const path=svg('path',{d:f.d,fill,stroke:name===chosen?'#182d26':'#546f62','stroke-width':name===chosen?2.5:.8,'vector-effect':'non-scaling-stroke','fill-rule':f.fillRule||'evenodd',tabindex:'0',role:'button','aria-label':areaLabel(name)+' '+(changeMode?changeLabel:profileMode?(Number.isFinite(baseProfile)?(mode.value==='turnout'?rate(baseProfile):baseProfile.toLocaleString('zh-CN')+' 人'):'统计待核'):baseVotes?(Number.isFinite(baseVote)?baseVote+' 票':'缺档或未参选'):baseSeats?(Number.isFinite(seats)?seats+' 席':'席次待核'):entry?.complete?(selected?rate(share):leaders.join('、')||'席次待核'):'缺档或不适用')});
  const title=svg('title');title.textContent=path.getAttribute('aria-label');path.append(title);path.onclick=()=>{chosen=name;county.value=name;render()};path.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();chosen=name;county.value=name;render()}};graph.append(path);
 }
}
function seatChangeMax(){if(!models||!party.value)return 1;const [a,b]=models.map(x=>x.summary);return Math.max(1,...[...b.counties.keys()].map(c=>Math.abs(countyChange(a,b,c,party.value,'seats')??0)))}
function voteBaseMax(){return Math.max(1,...(models?[...models[0].summary.counties.values()].map(r=>r.complete?r.parties[party.value]?.votes??0:0):[]))}
function voteChangeMax(){if(!models||!party.value)return 1;const [a,b]=models.map(x=>x.summary);return Math.max(1,...[...b.counties.keys()].map(c=>Math.abs(countyChange(a,b,c,party.value,'votes')??0)))}
function profileBaseMax(metric){return metric==='turnout'?100:Math.max(1,...(models?[...models[0].summary.counties.values()].map(r=>r.profile?.[metric]??0):[]))}
function profileDeltaMax(metric){if(!models)return 1;const [a,b]=models.map(m=>m.summary);return Math.max(1,...[...b.counties.keys()].map(k=>Math.abs(countyChange(a,b,k,'',metric)??0)))}
function render(){
 if(!models)return;
 const [a,b]=models,as=a.summary,bs=b.summary;
 const allowed=seatAllowed(as);
 for(const option of mode.options)option.disabled=['share','votes'].includes(option.value)&&!party.value||option.value==='seats'&&(!party.value||!allowed)||option.value==='turnover'&&(as.office!=='mayor'||as.level==='town')||['turnout','registered'].includes(option.value)&&!models.every(m=>[...m.summary.counties.values()].some(r=>r.profile));
 if(mode.selectedOptions[0]?.disabled)mode.value='results';
 if(mode.value==='turnover'&&party.value)party.value='';
 const suffix={results:'',share:' · 得票率变化',votes:' · 得票数变化',turnout:' · 投票率变化',registered:' · 选举人数变化',seats:' · 席次变化',turnover:' · 执政权变化'}[mode.value];
 $('compareMapTitleA').textContent=label(as.year,as.office);$('compareMapTitleB').textContent=label(bs.year,bs.office)+suffix;
 drawMap(a,'compareMapA',0);drawMap(b,'compareMapB',1);setBox();
 const available=chosen?comparableCounty(chosen,as,bs)&&as.counties.has(chosen)&&bs.counties.has(chosen):true;
 const x=chosen?as.counties.get(chosen):as.all,y=chosen?bs.counties.get(chosen):bs.all,host=$('compareTable');host.replaceChildren();
 const heading=node('h3',chosen?areaLabel(chosen):as.level==='town'?'全部地区（县级汇总）':'全部地区');host.append(heading);
 if(chosen&&root.HistoryDiscovery?.openRegion){const action=node('button','查看地区档案');action.type='button';action.className='button quiet';action.onclick=()=>{const [county,town]=chosen.split('|');dialog.close();root.HistoryDiscovery.openRegion(county,{office:as.office,ballot:as.ballot,town:town||''})};host.append(action)}
 if(x?.profile||y?.profile){const stats=node('p');stats.textContent='选举人数：'+(x?.profile?.registered?.toLocaleString('zh-CN')??'—')+' → '+(y?.profile?.registered?.toLocaleString('zh-CN')??'—')+'（'+signed(available?profileChange(x,y,'registered'):null,0)+'人）；投票率：'+rate(x?.profile?.turnout)+' → '+rate(y?.profile?.turnout)+'（'+signed(available?profileChange(x,y,'turnout'):null)+'个百分点）';host.append(stats)}
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
 for(const t of ['政党',label(as.year,as.office)+' 得票率',label(bs.year,bs.office)+' 得票率','变化（百分点）',label(as.year,as.office)+' 席次',label(bs.year,bs.office)+' 席次','席次增减','左届得票数','右届得票数','得票数变化'])hr.append(node('th',t));head.append(hr);table.append(head);
 const body=node('tbody'),parties=[...new Set([...Object.keys(x?.parties||{}),...Object.keys(y?.parties||{})])].sort((p,q)=>(y?.parties[q]?.votes||0)-(y?.parties[p]?.votes||0)||p.localeCompare(q,'zh-CN'));
 for(const p of parties){const tr=node('tr'),l=x?.parties[p],r=y?.parties[p],d=available?delta(x,y,p):{};for(const v of [p,rate(l?.share),rate(r?.share),signed(d.share),x?.complete&&x.seats!==null?(l?.seats||0):'—',y?.complete&&y.seats!==null?(r?.seats||0):'—',signed(d.seats,0),Number.isFinite(l?.votes)?l.votes.toLocaleString('zh-CN'):'—',Number.isFinite(r?.votes)?r.votes.toLocaleString('zh-CN'):'—',signed(d.votes,0)])tr.append(node('td',v));body.append(tr)}
 table.append(body);host.append(table);
 $('compareLegend').textContent=mode.value==='turnover'?'左图为左届当选政党；右图橙色为党籍易手、浅绿色为党籍未变、灰色不可比。无党籍归为同一类别，不代表同一候选人。':mode.value==='seats'?'左图为所选政党左届席次（0—'+seatBaseMax()+' 席）；右图为右届减左届席次（绿增、红减，最大绝对变化 '+seatChangeMax()+' 席；灰色不可比）。':['turnout','registered'].includes(mode.value)?'左图为原届已核实统计；右图为右届减左届（绿增、红减；灰色不可比或缺档）。不同身份选票分开计算。':mode.value==='votes'?'左图为原届得票数（0—'+voteBaseMax().toLocaleString('zh-CN')+'票）；右图为右届减左届票数（绿增、红减；灰色不可比）。':mode.value==='share'?'左图为原届得票率；右图为右届减左届的百分点变化（绿增、红减，绝对值≥30百分点同为最深色，灰色不可比）。':party.value?'同一政党得票率：0%—100%；未参选或缺档为灰色。':as.level==='town'||as.office==='president'||as.ballot==='party'?'颜色表示最高票政党；并列使用多色。':'颜色表示当选席次最多政党；并列使用多色。';
 if(as.level==='town')$('compareLegend').textContent+=' 乡镇市区采用当届名称及现行近似轮廓；仅比较2014年起同名地区且逐候选人县乡对账的资料。';
 for(const id of ['compareExportSvg','compareExportCsv','compareExportPng'])$(id).disabled=exporting;
}
async function refresh(){
 syncLevel();const my=++token,o=office.value,b=ballot.value,y1=Number(left.value),y2=Number(right.value),grain=level.value;models=null;
 $('compareMapA').replaceChildren();$('compareMapB').replaceChildren();$('compareTable').replaceChildren();$('compareLegend').textContent='';for(const id of ['compareExportSvg','compareExportCsv','compareExportPng'])$(id).disabled=true;
 if(y1===y2){status.textContent='请选择不同届次';return}
 status.textContent='正在载入两届正式历史资料…';
 try{
  const values=await Promise.all([model(o,y1,b,grain),model(o,y2,b,grain)]);if(my!==token)return;
  models=values;zoom=1;offsetX=offsetY=0;const shapes=values.flatMap(x=>x.shapes),bounds=shapes.reduce((a,f)=>[Math.min(a[0],f.box[0]),Math.min(a[1],f.box[1]),Math.max(a[2],f.box[2]),Math.max(a[3],f.box[3])],[Infinity,Infinity,-Infinity,-Infinity]);const w=bounds[2]-bounds[0],h=bounds[3]-bounds[1];if(!Number.isFinite(w+h)||w<=0||h<=0)throw Error('县市地图范围无效');baseBox=[bounds[0]-w*.06,bounds[1]-h*.06,w*1.12,h*1.12];
  const names=[...new Set(values.flatMap(v=>v.shapes.map(shapeKey)))].sort((a,b)=>Core.compareResultRows({county:a},{county:b},o));
  const oldCounty=chosen;county.replaceChildren(new Option('全部地区',''),...names.map(n=>new Option(areaLabel(n),n)));chosen=names.includes(oldCounty)?oldCounty:'';county.value=chosen;
  const oldParty=party.value,ps=[...new Set(values.flatMap(v=>[...v.summary.counties.values()].flatMap(r=>Object.keys(r.parties))))].sort((a,b)=>a.localeCompare(b,'zh-CN'));party.replaceChildren(new Option(grain==='town'?'最高票政党':'当选／领先政党',''),...ps.map(p=>new Option(p,p)));party.value=ps.includes(oldParty)?oldParty:'';
  status.textContent='已载入；灰色表示无适用或可核实结果，并非零票。';render();
 }catch(e){if(my===token){models=null;status.textContent='载入失败：'+e.message}}
}
open.onclick=()=>{if(!savedCompare){office.value=root.History2022View?.office()||'mayor';chosen='';mode.value='results';setBallots();setYears(root.History2022View?.year())}dialog.showModal();root.dispatchEvent(new Event('observationdialogchange'));refresh()};
office.onchange=()=>{chosen='';setBallots();setYears();refresh()};ballot.onchange=()=>{setYears();refresh()};left.onchange=right.onchange=refresh;level.onchange=()=>{chosen='';refresh()};party.onchange=()=>{if(mode.value==='turnover')mode.value='results';render()};mode.onchange=render;county.onchange=()=>{chosen=county.value;render()};
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
// Export is independent of the page stylesheet and does not change the live maps.
function comparisonFilename(){
 const [a,b]=models.map(x=>x.summary);
 return ('历届选举对比-'+office.selectedOptions[0].textContent+'-'+label(a.year,a.office)+'-'+label(b.year,b.office)+'-'+mode.selectedOptions[0].textContent+(a.level==='town'?'-乡镇市区':'')+(party.value?'-'+party.value:'')).replace(/[\\/:*?"<>|]/g,'_');
}
function exportGraph(){
 const W=1440,H=940,pad=36,gap=24,panel=(W-pad*2-gap)/2,mapY=160,mapH=640;
 const root=svg('svg',{xmlns:'http://www.w3.org/2000/svg',width:W,height:H,viewBox:'0 0 '+W+' '+H,'font-family':'Microsoft YaHei, PingFang SC, sans-serif'});
 root.append(svg('rect',{width:W,height:H,fill:'#fff'}));
 const text=(str,x,y,size=22,attrs={})=>{const t=svg('text',{x,y,'font-size':size,fill:'#233d39',...attrs});t.textContent=str;root.append(t)};
 const [a,b]=models.map(x=>x.summary);
 text('历届选举对比 · '+office.selectedOptions[0].textContent+(a.level==='town'?' · 乡镇市区':''),W/2,50,32,{'font-weight':700,'text-anchor':'middle'});
 text([label(a.year,a.office)+' → '+label(b.year,b.office),ballot.options.length>1?ballot.selectedOptions[0].textContent:'',mode.selectedOptions[0].textContent,party.value].filter(Boolean).join('  |  '),W/2,88,20,{'text-anchor':'middle'});
 for(const [index,id] of ['compareMapA','compareMapB'].entries()){
  const x=pad+index*(panel+gap);
  root.append(svg('rect',{x,y:110,width:panel,height:mapH+50,rx:12,fill:'#f9fbfa',stroke:'#dce5df'}));
  text($(index?'compareMapTitleB':'compareMapTitleA').textContent,x+panel/2,142,24,{'text-anchor':'middle','font-weight':650});
  const graph=$(id).cloneNode(true);graph.removeAttribute('id');graph.removeAttribute('class');graph.removeAttribute('role');graph.removeAttribute('aria-label');
  for(const p of graph.querySelectorAll('[tabindex]')){p.removeAttribute('tabindex');p.removeAttribute('role')}
  graph.setAttribute('x',x+8);graph.setAttribute('y',mapY);graph.setAttribute('width',panel-16);graph.setAttribute('height',mapH-8);graph.setAttribute('viewBox',baseBox.join(' '));for(const path of graph.querySelectorAll('path[stroke-width]')){path.setAttribute('stroke','#546f62');path.setAttribute('stroke-width','.8')}root.append(graph);
 }
 let entries=[];
 if(mode.value==='turnover')entries=[['#b56c30','党籍易手'],['#dcebe1','党籍未变'],['#d9dfdc','不可比']];
 else if(['turnout','registered'].includes(mode.value))entries=[['#287963','左图：原届统计'],['#26744e','增加'],['#f1f0ec','无变化'],['#a94b35','减少'],['#d9dfdc','不可比']];
 else if(['share','seats','votes'].includes(mode.value))entries=[[color(party.value),'左图：'+party.value],['#26744e','增加'],['#f1f0ec','无变化'],['#a94b35','减少'],['#d9dfdc','不可比']];
 else if(party.value)entries=[[color(party.value),party.value],['#d9dfdc','未参选或缺档']];
 else entries=[...new Set(models.flatMap(m=>[...m.summary.counties.values()].flatMap(r=>r.leader||[])))].map(p=>[color(p),p]).concat([['#edf1e9','无适用或可核实结果']]);
 // Include both the left-map party colors and the right-map change legend in turnover mode.
 if(mode.value==='turnover')entries=[...new Set([...a.counties.values()].flatMap(r=>r.leader||[]))].map(p=>[color(p),p]).concat(entries);
 let lx=pad,ly=826;
 for(const [c,name] of entries){
  const width=40+[...name].length*17;
  if(lx+width>W-pad){lx=pad;ly+=27}
  root.append(svg('rect',{x:lx,y:ly-16,width:18,height:18,rx:3,fill:c,stroke:'#c8d5cd'}));text(name,lx+25,ly,16);lx+=width;
 }
 const note=$('compareLegend').textContent,lines=[];let line='';
 for(const c of note){line+=c;if([...line].length>=65){lines.push(line);line=''}}
 if(line)lines.push(line);
 let fy=ly+34;for(const l of lines){text(l,pad,fy,17);fy+=24}
 text(window.HistoryExport.SOURCE+'｜历史边界近似展示，离岛为移位示意。',pad,fy+10,16);
 text('岛屿调色盘',W-pad,fy+38,18,{'text-anchor':'end','font-weight':650});
 const height=Math.max(H,fy+60);root.setAttribute('height',height);root.setAttribute('viewBox','0 0 '+W+' '+height);root.firstChild.setAttribute('height',height);
 return {source:new XMLSerializer().serializeToString(root),width:W,height};
}
function saveFile(blob,name){const a=node('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;doc.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)}
let exporting=false;
async function exportComparison(format){
 if(!models||exporting)return;
 const name=comparisonFilename(),buttons=['compareExportSvg','compareExportCsv','compareExportPng'];exporting=true;buttons.forEach(id=>$(id).disabled=true);
 let url;
 try{
  if(format==='csv'){const [a,b]=models.map(m=>m.summary);const content=['turnout','registered'].includes(mode.value)?profileCSV(a,b):comparisonCSV(a,b);saveFile(new Blob([content],{type:'text/csv;charset=utf-8'}),name+'.csv');return}
  const graph=exportGraph(),blob=new Blob([graph.source],{type:'image/svg+xml;charset=utf-8'});
  if(format==='svg'){saveFile(blob,name+'.svg');return}
  saveFile(await root.HistoryExport.pngBlob(graph.source,graph.width,graph.height),name+'.png');
 }catch(e){status.textContent=e.message||'导出失败'}finally{if(url)URL.revokeObjectURL(url);exporting=false;buttons.forEach(id=>$(id).disabled=!models)}
}
$('compareExportSvg').onclick=()=>exportComparison('svg');$('compareExportCsv').onclick=()=>exportComparison('csv');$('compareExportPng').onclick=()=>exportComparison('png');
dialog.addEventListener('close',()=>{savedCompare=true;token++;models=null;root.dispatchEvent(new Event('observationdialogchange'))});
$('compareSwap')?.addEventListener('click',()=>{const a=left.value;left.value=right.value;right.value=a;refresh()});
})(typeof window==='undefined'?globalThis:window);
