/* Independent read-only analysis. Unknown is not zero. */
(function(root){
'use strict';
const valid=v=>Number.isSafeInteger(v)&&v>=0;
const norm=v=>String(v??'').trim().replaceAll('臺','台').replaceAll('縣','县').replaceAll('黨','党').replaceAll('無','无').replaceAll('連','连');
const party=v=>/^(无党籍|连署)/.test(norm(v))?'无党籍（连署）':norm(v)||'政党资料缺失';
const offices={mayor:'县市长',council:'县市议员',township:'乡镇市区长',president:'台湾地区领导人',legislative:'立法机构民代'};
function group(items,key){const m=new Map();for(const x of items){const k=key(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x)}return m}
function select(s,o,ballot='all',county='',n=norm){
 const ids=new Set(s.elections.filter(e=>e.office===o).map(e=>e.election_id)),members=group(s.candidacies,r=>r.contest_id);
 return s.contests.filter(c=>ids.has(c.election_id)&&(!county||n(c.county_name)===n(county))&&(ballot==='all'||(c.electorate||'regional')===ballot)).map(c=>({contest:c,rows:members.get(c.contest_id)||[]}));
}
const completeParty=r=>String(r.party_name??'').trim()&&!/缺失|未知|待核/.test(r.party_name);
function model(s,o,ballot='all',county='',n=norm){
 const blocks=select(s,o,ballot,county,n),p=new Map(),partial=s.elections.some(e=>e.office===o&&e.coverage==='partial')||o==='council'&&s.year===1994&&(!county||n(county)==='金门县');
 const vOK=!partial&&blocks.length>0&&blocks.every(({contest:c,rows})=>rows.length&&rows.every(r=>valid(r.votes)&&completeParty(r))&&(!valid(c.valid_votes)||rows.reduce((a,r)=>a+r.votes,0)===c.valid_votes));
 const sOK=!partial&&o!=='president'&&blocks.length>0&&blocks.every(({contest:c,rows})=>valid(c.seats)&&rows.length&&rows.every(r=>typeof r.elected_official==='boolean'&&completeParty(r))&&rows.filter(r=>r.elected_official).length===c.seats);
 const votes=vOK?blocks.reduce((a,b)=>a+b.rows.reduce((n,r)=>n+r.votes,0),0):null,seats=sOK?blocks.reduce((a,b)=>a+b.contest.seats,0):null;
 for(const {rows} of blocks)for(const r of rows){const name=party(n(r.party_name));if(!p.has(name))p.set(name,{party:name,votes:vOK?0:null,seats:sOK?0:null});const x=p.get(name);if(vOK)x.votes+=r.votes;if(sOK&&r.elected_official)x.seats++}
 return {votes,seats,parties:[...p.values()].map(x=>({...x,voteShare:votes>0?x.votes/votes*100:null,seatShare:seats>0?x.seats/seats*100:null})).sort((a,b)=>(b.seats??0)-(a.seats??0)||(b.votes??0)-(a.votes??0)),reason:partial?'当届档案存在已知缺口，不能计算完整总体比例。':!blocks.length?'当前范围无可核实选区。':!vOK||!sOK?'部分指标不适用或未核实，保留空值。':''};
}
function listModel(m){return !m?.matchesOfficial||!valid(m.total)||!m.total||!valid(m.totalAssigned)||!m.totalAssigned?{votes:null,seats:null,parties:[],reason:'不分区席次未通过官方核对。'}:{votes:m.total,seats:m.totalAssigned,parties:m.parties.map(p=>({party:party(p.party),votes:p.votes,seats:p.seats,voteShare:p.votes/m.total*100,seatShare:p.seats/m.totalAssigned*100})),reason:m.old?'旧制席次计算票，并非独立政党票。':''}}
function combine(ms){if(!ms.length||ms.some(m=>!valid(m.seats)))return {votes:null,seats:null,parties:[],reason:'至少一个票种的正式席次不完整。'};const seats=ms.reduce((a,m)=>a+m.seats,0),p=new Map();for(const m of ms)for(const x of m.parties)p.set(x.party,(p.get(x.party)||0)+x.seats);return{votes:null,seats,parties:[...p].map(([party,s])=>({party,votes:null,seats:s,voteShare:null,seatShare:seats?s/seats*100:null})).sort((a,b)=>b.seats-a.seats),reason:'全部票种只汇总正式席次；不同票种得票率不能合并。'}}
function margin(rows,official=null,expected=null){if(rows.length<2||rows.some(r=>!valid(r.votes))||expected!==null&&expected!==rows.length)return null;const total=rows.reduce((a,r)=>a+r.votes,0);if(!total||valid(official)&&total!==official)return null;const [a,b]=[...rows].sort((x,y)=>y.votes-x.votes);return {name:a.candidate_name||a.name,runner:b.candidate_name||b.name,party:party(a.party_name||a.party),runnerParty:party(b.party_name||b.party),margin:(a.votes-b.votes)/total*100,firstShare:a.votes/total*100,secondShare:b.votes/total*100,tied:a.votes===b.votes}}
function margins(s,o,n=norm){const out=new Map();
 if(o==='president'){const expected=new Set(select(s,o).flatMap(x=>x.rows).map(r=>String(r.ballot_number??r.candidate_name))).size;if(expected<2)return out;for(const [county,rs] of group((s.rows||[]).filter(r=>r.type===o&&r.level==='county'&&r.county),r=>n(r.county))){if(new Set(rs.map(r=>String(r.number??r.name))).size!==expected)continue;const m=margin(rs,null,expected);if(m)out.set(county,{...m,county,label:county})}}
 else if(['mayor','township','legislative'].includes(o))for(const {contest:c,rows} of select(s,o,o==='legislative'?'regional':'all')){if(c.seats!==1)continue;const m=margin(rows,c.valid_votes);if(!m)continue;const county=n(c.county_name),district=n(c.district_name),key=o==='mayor'?county:county+'|'+district;if(out.has(key))out.set(key,null);else out.set(key,{...m,county,district,label:o==='mayor'?county:county+' '+district})}
 return out}
function matching(s,o,name,n=norm){const q=n(name);if(!q)return [];return select(s,o).flatMap(({contest:c,rows})=>rows.filter(r=>n(r.candidate_name)===q).map(r=>({year:Number(String(c.election_date||'').slice(0,4))||s.year,office:o,county:c.county_name,district:c.district_name,name:r.candidate_name,party:r.party_name,number:r.ballot_number,votes:valid(r.votes)?r.votes:null,share:valid(r.votes)&&valid(c.valid_votes)&&c.valid_votes>0?r.votes/c.valid_votes*100:null,elected:typeof r.elected_official==='boolean'?r.elected_official:null,incumbent:typeof r.incumbent_at_election==='boolean'?r.incumbent_at_election:null,evidence:r.incumbent_evidence||r.incumbent_source||null,evidenceMethod:r.incumbent_source_method||null})))}
function dots(seats){if(!valid(seats)||seats<1)return [];const rings=Math.min(10,Math.max(1,Math.ceil(Math.sqrt(seats/6)))),weights=Array.from({length:rings},(_,i)=>i+2),sum=weights.reduce((a,b)=>a+b,0),counts=weights.map(w=>Math.floor(seats*w/sum));let left=seats-counts.reduce((a,b)=>a+b,0);for(let i=rings-1;left>0;i=(i+rings-1)%rings){counts[i]++;left--}const points=[];counts.forEach((n,i)=>{const r=62+i*112/Math.max(1,rings-1);for(let j=0;j<n;j++){const a=Math.PI-(j+.5)/n*Math.PI;points.push({a,x:200+Math.cos(a)*r,y:191-Math.sin(a)*r,r:Math.min(8,Math.max(1.6,Math.min(51/rings,r*Math.PI/n*.39)))})}});return points.sort((a,b)=>b.a-a.a||a.x-b.x)}
const api={valid,party,offices,select,model,listModel,combine,margin,margins,matching,dots};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryObservationCore=api;
})(typeof window==='undefined'?globalThis:window);
