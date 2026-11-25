'use strict';
function scan(s,year,kind,source,ctx={}){
 const issues=[],coverage=[],blank=v=>v==null||typeof v==="string"&&!v.trim(),num=v=>Number.isSafeInteger(v)&&v>=0,fields=["registered_voters","ballots_cast","valid_votes","invalid_votes"],sum=a=>a.reduce((x,y)=>x+y,0);
 const group=(a,f)=>{const m=new Map();for(const x of a){const k=f(x);if(!m.has(k))m.set(k,[]);m.get(k).push(x)}return m};
 const add=(c,status,f,note="")=>issues.push({year,office:kind,electorate:"",level:"",county:"",district:"",id:"",name:"",...c,status,fields:Array.isArray(f)?f.join(";"):f,source,note});
 const profile=(c,p,v)=>{const m=fields.filter(k=>!num(p?.[k]));if(m.length)add(c,"missing",m);if(num(p?.valid_votes)&&num(v)&&p.valid_votes!==v)add(c,"conflict","valid_votes",`统计 ${p.valid_votes}; 候选人合计 ${v}`);if(p&&fields.every(k=>num(p[k]))&&(p.ballots_cast!==p.valid_votes+p.invalid_votes||p.ballots_cast>p.registered_voters))add(c,"conflict","turnout_arithmetic")};
 const em=new Map(s.elections.map(e=>[e.election_id,e])),dm=new Map(s.contests.map(d=>[d.contest_id,d])),byD=group(s.candidacies,x=>x.contest_id),dids=new Set(),cids=new Set();
 for(const d of s.contests){const e=em.get(d.election_id),office=e?.office||kind,el=d.electorate||e?.electorate||"regional",c={office,electorate:el,level:"contest",county:d.county_name,district:d.district_name,id:d.contest_id},cs=byD.get(d.contest_id)||[],party=kind==="legislative"&&el==="party";
 if(dids.has(d.contest_id))add(c,"conflict","duplicate_contest_id");dids.add(d.contest_id);if(!e)add(c,"conflict","orphan_election");if(!cs.length)add(c,"missing","candidate_records");
 if(!party&&!num(d.seats))add(c,"missing","seats");if(office==="council"&&!num(d.reserved_seats)){const g=d.reserved_seats_group;const valid=g&&num(g.reserved)&&g.reserved>0&&g.source&&Array.isArray(g.contestIds)&&g.contestIds.includes(d.contest_id)&&g.contestIds.length>1;if(!valid)add(c,"unverified","reserved_seats","须区分未知与不适用");}if(office==="council"&&el==="regional"&&!d.scope_names?.length&&!s.councilDistrictGeometry?.[d.contest_id])add(c,"missing","district_scope");
 if(!party&&num(d.seats)&&cs.length&&cs.every(x=>typeof x.elected_official==="boolean")&&cs.filter(x=>x.elected_official).length!==d.seats)add(c,"conflict","elected_count_vs_seats",`当选 ${cs.filter(x=>x.elected_official).length}; 名额 ${d.seats}`);
 const v=cs.length&&cs.every(x=>num(x.votes))?sum(cs.map(x=>x.votes)):null;
 if(kind!=="legislative")profile(c,d,v);else if(num(d.valid_votes)&&num(v)&&v!==d.valid_votes)add(c,"conflict","valid_votes",`统计 ${d.valid_votes}; 候选人合计 ${v}`);
 const ns=new Set();for(const x of cs){const cc={...c,level:party?"party":"candidate",id:x.candidacy_id,name:x.candidate_name};if(cids.has(x.candidacy_id))add(cc,"conflict","duplicate_candidate_id");cids.add(x.candidacy_id);
 const f=[];if(blank(x.candidate_name))f.push("name");if(blank(x.party_name))f.push("party");if(!num(x.votes))f.push("votes");if(!party){if(blank(x.ballot_number))f.push("ballot_number");if(!["男","女"].includes(x.gender))f.push("gender");if(x.incumbent_at_election==null)f.push("incumbent_at_election");if(typeof x.elected_official!=="boolean")f.push("elected");if(kind==="president"){if(blank(x.deputy_name))f.push("deputy_name");if(blank(x.deputy_gender))f.push("deputy_gender")}}if(f.length)add(cc,"missing",f);
 if(!party&&!blank(x.ballot_number)){const n=String(Number(x.ballot_number));if(ns.has(n))add(cc,"conflict","duplicate_ballot_number");ns.add(n)}}
 }
 for(const x of s.candidacies)if(!dm.has(x.contest_id))add({level:"candidate",id:x.candidacy_id,name:x.candidate_name},"conflict","orphan_contest");
 for(const [k,ds] of group(s.contests,d=>[em.get(d.election_id)?.office||kind,d.electorate||"regional"].join("|"))){const [office,electorate]=k.split("|");coverage.push({year,office,electorate,contests:ds.length,candidateRecords:sum(ds.map(d=>(byD.get(d.contest_id)||[]).length)),counties:new Set(ds.map(d=>d.county_name)).size,source})}
 const norm=ctx.norm||String,rows=s.rows||[];
 if(kind!=="legislative"){
 const towns=rows.filter(r=>r.level==="town"&&(r.type==="mayor"||kind==="president")),key=r=>[r.type||r.office||kind,norm(r.county),norm(r.town)].join("|"),pm=new Map((s.townProfiles||[]).map(p=>[key(p),p]));
 for(const [k,rs] of group(towns,key)){const [office,county,district]=k.split("|");profile({office,electorate:"regional",level:"town",county,district,id:k},pm.get(k),sum(rs.map(r=>r.votes)))}
 if(year===2018&&kind==='local'){
  const local=towns.filter(r=>r.type==='mayor'&&norm(r.county)==='台北市'), city=rows.filter(r=>r.type==='mayor'&&r.level==='county'&&norm(r.county)==='台北市');
  const byWard=group(local,r=>norm(r.town)), expected=city.map(r=>String(r.number));
  const verified=local.length===60&&byWard.size===12&&city.length===5&&local.every(r=>r.tally_basis==='certified_recount')&&[...byWard.values()].every(rs=>rs.length===5&&new Set(rs.map(r=>String(r.number))).size===5&&expected.every(n=>rs.some(r=>String(r.number)===n)))&&city.every(r=>sum(local.filter(t=>String(t.number)===String(r.number)).map(t=>t.votes))===r.votes);
  if(!verified)add({office:'mayor',county:'台北市',level:'county'},'partial','recount_town_candidate_votes','全市重计结果与12区逐候选人明细尚未完整对账');
 }
 } else {
 for(const el of ["regional","plains","mountain",...(year>=2008?["party"]:[])]){
 const rr=rows.filter(r=>r.electorate===el),geo={};
 for(const level of ["national","county","district","town"]){for(const [k,a] of group(rr.filter(r=>r.level===level),r=>level==="national"?"||":level==="county"?`${r.county}||`:level==="district"?`${r.county}|${r.district}|`:`${r.county}||${r.town}`)){const [county,district,town]=k.split("|"),v=sum(a.map(r=>r.votes));geo[level]=(geo[level]||0)+1;if(county.includes("全部地区")||county.includes("台闽地区")||level==="district"&&el!=="regional")continue;
 const c={office:"legislative",electorate:el,level,county,district:town||district,id:k};let p=null,g=s.geographicProfiles?.[el];let a4=level==="county"?g?.county?.[county]:level==="town"?g?.town?.[county]?.[town]:null;if(level==="national"&&el==="plains"&&g)a4=[0,1,2,3].map(i=>sum(Object.values(g.county).map(x=>x[i])));if(a4)p=Object.fromEntries(fields.map((k,i)=>[k,a4[i]]));
 if(!p&&ctx.turnout){const b=ctx.turnout.enrich({validVotes:v},{year,electorate:el,scope:level==="national"?"all":level,county,area:town,districtNumber:ctx.districtNumber(district),contests:s.contests.filter(d=>d.electorate===el&&d.county_name===county).length});p={registered_voters:b.registeredVoters,ballots_cast:b.ballotsCast,valid_votes:v,invalid_votes:b.invalidVotes}}
 profile(c,p,v);
 }}coverage.push({year,office:kind,electorate:el,geographyGroups:geo,source})}
 if(year===1992){
  const coverage=s.regionalTownCoverage;
  if(!coverage)add({electorate:"regional",level:"year"},"missing","regional_town_returns","区域民代乡镇明细待查");
  else for(const county of coverage.withoutTownReturns)add({electorate:"regional",level:"county",county},"partial","regional_town_returns","政大有县级结果，乡镇票表未公开");
 }
 if(year<2008)add({electorate:"party",level:"year"},"not_applicable","independent_party_turnout","旧制没有独立政党票");
 if(ctx.party){const p=ctx.party.build(year,s);if(!p.matchesOfficial)add({electorate:"party",level:"national"},"conflict","party_seats");for(const q of p.parties)for(const n of q.winners||[])if(n.rank==null&&!n.disqualified)add({electorate:"party",level:"nominee",district:q.party,name:n.name},"unverified","nomination_rank")}
 }
 return {issues,coverage};
}
function scanRoster(s,source){
 const issues=[],coverage=[],add=(c,status,fields,note="")=>issues.push({year:2026,office:"local",electorate:"",level:"",county:"",district:"",id:"",name:"",...c,status,fields,source,note}),ids=new Set(),ds=new Map(s.districts.map(d=>[d.id,d])),byD=new Map();
 for(const x of s.candidates){const c={office:x.type,level:"candidate",county:x.county,district:x.district,id:x.id,name:x.name};if(ids.has(x.id))add(c,"conflict","duplicate_candidate_id");ids.add(x.id);if(!ds.has(x.districtId))add(c,"conflict","orphan_contest");const a=byD.get(x.districtId)||[];a.push(x);byD.set(x.districtId,a);const f=["name","number","gender","party"].filter(k=>x[k]==null||x[k]==="");if(f.length)add(c,"missing",f.join(";"));if(!x.officialFinalRoster?.sourceUrl)add(c,"unverified","official_roster_evidence");if(x.numberVerification!=="official")add(c,"unverified","official_ballot_evidence")}
 for(const d of s.districts){const c={office:d.type,level:"contest",county:d.county,district:d.name,id:d.id},a=byD.get(d.id)||[];if(a.length!==d.candidateIds.length||a.some(x=>!d.candidateIds.includes(x.id)))add(c,"conflict","candidate_links");if(new Set(a.map(x=>x.number)).size!==a.length)add(c,"conflict","duplicate_ballot_number");if(!d.mapRegionId)add(c,"missing","map_region_id");if(d.womenReserved==null)add(c,"unverified","reserved_seats")}
 for(const [office,n] of Object.entries({mayor:[22,81],council:[221,1493],township:[204,475]})){const d=s.districts.filter(x=>x.type===office).length,c=s.candidates.filter(x=>x.type===office).length;coverage.push({year:2026,office,contests:d,candidateRecords:c,source});if(d!==n[0]||c!==n[1])add({office,level:"year"},"conflict","roster_totals",`expected ${n}; actual ${d},${c}`)}
 return {issues,coverage};
}
function extra(archive,kinmen,availability){
 const issues=[],add=(year,office,county,district,status,fields,source,note="",level="county")=>issues.push({year,office,electorate:"",level,county,district,id:"",name:"",status,fields,source,note});
 const full=new Set(["臺北縣","高雄縣","新竹縣","連江縣","宜蘭縣"]);
 for(const county of ["臺北縣","宜蘭縣","桃園縣","新竹縣","苗栗縣","臺中縣","彰化縣","南投縣","雲林縣","嘉義縣","臺南縣","高雄縣","屏東縣","臺東縣","花蓮縣","澎湖縣","金門縣","連江縣"])if(!full.has(county))add(1994,"township",county,"","partial","candidate_results","sources/history-1994-township.json",`${archive.counties.filter(c=>c.county===county).reduce((a,c)=>a+c.contest_count,0)}区已有结果；待查当届完整行政区名录`);
 add(1994,"council","金門縣","","partial",["candidate_results","turnout",...(Number.isInteger(kinmen.reserved_seats)?[]:["reserved_seats"])].join(";"),"sources/history-1994-kinmen-partial.json",`${kinmen.candidate_count}参选；${kinmen.elected_count}当选；其他候选人部分资料${kinmen.other_candidates.length}人`);
 add(1992,"legislative","","","conflict","national_vs_local_votes","assets/history-legislative-1992-local.json","山地少数民族票差2票；华加志","national");
 for(const y of [1996,2000])add(y,"president","台南市","中区、西区","unverified","historical_boundary","history-presidential.js","采用合并后轮廓","town");
 add(1992,"legislative","","","unverified","historical_boundary","history-legislative.js","金门和马祖仍采用参考年份归属，其他选区采用政大当届乡镇归属及现行近似轮廓","map");
 add(2026,"local","","",availability.status==="awaiting_results"?"not_yet_available":"unscanned","official_results","assets/history-2026-availability.json","选举结果未发布或须另行扫描","year");
 return {issues,coverage:[]};
}
function render(reports,revision){
 const issues=reports.flatMap(r=>r.issues),coverage=reports.flatMap(r=>r.coverage),errors=reports.flatMap(r=>r.errors||[]);
 issues.sort((a,b)=>a.year-b.year||[a.office,a.electorate,a.level,a.county,a.district,a.id,a.status,a.fields].join("|").localeCompare([b.office,b.electorate,b.level,b.county,b.district,b.id,b.status,b.fields].join("|")));
 const counts={},fieldCounts={};for(const x of issues){counts[x.status]=(counts[x.status]||0)+1;if(["missing","partial","unverified","conflict"].includes(x.status))for(const f of x.fields.split(";"))fieldCounts[f]=(fieldCounts[f]||0)+1}
 const columns=["year","office","electorate","level","county","district","id","name","status","fields","source","note"],rows=issues.map(x=>columns.map(k=>x[k]??""));
 const j={schemaVersion:1,revision,counts,fieldCounts,coverage,errors,columns,issues:rows,limitations:["扫描现有记录，不等于外部原始名册全量核对。","地图边界仅列已知问题及范围缺项，未运行所有浏览器地图。","2026未公布的正式结果与旧制独立政党票不计为缺失。","候选记录按选区计数，重复参选组合不等于独立自然人数。","未重新查阅所有官方原件；未扫描错误独立记录。"]};
 const q=x=>'"'+String(x??"").replaceAll('"','""')+'"';
 const csv="\ufeff"+columns.map(q).join(",")+"\n"+rows.map(a=>a.map(q).join(",")).join("\n")+"\n";
 const md=["# 数据完整性审计","",`数据基准：\`${revision}\`。行数为任务记录数，非缺失候选人总数。`,"","## 状态","",...Object.entries(counts).map(([k,v])=>`- ${k}: ${v}`),"","## 字段","",...Object.entries(fieldCounts).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`- ${k}: ${v}`),"","## 年度覆盖","","| 年份 | 类别 | 票种 | 选区 | 候选记录 | 地理统计组 |","|---|---|---|---:|---:|---|",...coverage.map(c=>`| ${c.year} | ${c.office} | ${c.electorate||"—"} | ${c.contests??"—"} | ${c.candidateRecords??"—"} | ${JSON.stringify(c.geographyGroups||{})} |`),"","## 扫描错误",...errors.map(e=>`- ${e}`),...(errors.length?[]:["无。"]),"","## 限制",...j.limitations.map(s=>"- "+s),"","## 复现","`python scripts/audit_data_completeness.py`（需 Node.js；不修改原始数据）。",""].join("\n");
 return {json:JSON.stringify(j)+"\n",csv,md};
}
module.exports={scan,scanRoster,extra,render};
