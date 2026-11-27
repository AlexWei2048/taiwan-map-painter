/* Stable history/map joins. Display names never serve as electoral identifiers. */
(function(root){
 'use strict';
  // Apply publication wording at CSV serialization time only; archive data and IDs remain unchanged.
  const exportedWording=value=>{const text=String(value??'');return (typeof module!=='undefined'&&module.exports?require('./news-wording.js'):root.XinhuaWording)?.normalize(text)||text};
 const identity=value=>({plainsIndigenous:'plains',mountainIndigenous:'mountain'}[value]||value||'regional');
 function districtNumber(value){
  const direct=String(value??'').trim();
  if(/^\d+$/.test(direct))return String(Number(direct));
  const match=direct.match(/第\s*0*(\d+)\s*(?:选|選)(?:举|舉)?(?:区|區)/);
  if(match)return String(Number(match[1]));
  const chinese=direct.match(/第([一二三四五六七八九十]+)(?:选(?:举)?区|選(?:舉)?區)/);
  if(!chinese)return '';
  const digit={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10},v=chinese[1];
  if(v==='十')return '10';
  if(v.startsWith('十'))return String(10+(digit[v[1]]||0));
  if(v.endsWith('十'))return String((digit[v[0]]||0)*10);
  return String(digit[v]||'');
 }
 const COUNTY_ORDER=['台北市','新北市','台北县','桃园市','桃园县','台中市','台中县','台南市','台南县','高雄市','高雄县','新竹县','苗栗县','彰化县','南投县','云林县','嘉义县','屏东县','宜兰县','花莲县','台东县','澎湖县','基隆市','新竹市','嘉义市','金门县','连江县'];
 const ELECTORATE_ORDER=['regional','plains','mountain','indigenous'];
 const naturalCompare=(a,b)=>String(a||'').localeCompare(String(b||''),'zh',{numeric:true});
 function compareResultRows(a,b,office='council'){
  const county=row=>String(row.county??row.county_name??'');
  const district=row=>String(row.district??row.district_name??row.contest_name??'');
  const ca=county(a),cb=county(b),ia=COUNTY_ORDER.indexOf(ca),ib=COUNTY_ORDER.indexOf(cb);
  const countyDiff=(ia<0?COUNTY_ORDER.length:ia)-(ib<0?COUNTY_ORDER.length:ib)||naturalCompare(ca,cb);
  if(countyDiff)return countyDiff;
  if(office==='council'){
   const ea=ELECTORATE_ORDER.indexOf(identity(a.electorate)),eb=ELECTORATE_ORDER.indexOf(identity(b.electorate));
   const electorDiff=(ea<0?ELECTORATE_ORDER.length:ea)-(eb<0?ELECTORATE_ORDER.length:eb);
   if(electorDiff)return electorDiff;
   const da=district(a),db=district(b),na=Number(districtNumber(da)),nb=Number(districtNumber(db));
   const districtDiff=(na||Number.MAX_SAFE_INTEGER)-(nb||Number.MAX_SAFE_INTEGER)||naturalCompare(da,db);
   if(districtDiff)return districtDiff;
  }else if(office==='township'||office==='mayor'){
   const town=row=>String(row.town??(office==='township'?district(row):''));
   const townDiff=naturalCompare(town(a),town(b));
   if(townDiff)return townDiff;
  }
  return Number(b.votes||0)-Number(a.votes||0)||
   naturalCompare(a.ballot_number??a.number,b.ballot_number??b.number)||
   naturalCompare(a.candidate_name??a.name,b.candidate_name??b.name);
 }
 function key(county,electorate,number,normalize=String){return[normalize(county).trim(),identity(electorate),districtNumber(number)].join('|')}
 function sameScope(historical,current,feature,towns,normalize=String){
  if(!current||identity(historical.electorate)!==identity(current.electorate))return false;
  const clean=value=>normalize(String(value||'')).replace(/\s/g,'');
  const old=[...new Set((historical.scopeTowns||[]).map(clean))].sort();
  let present=[];
  if(identity(current.electorate)!=='regional'&&feature?.townIds?.length){
   const byId=new Map(towns.map(t=>[t.id,t]));
   if(feature.townIds.some(id=>!byId.has(id)))return false;
   present=feature.townIds.map(id=>clean(byId.get(id).name));
  }else present=String(current.scope||'').split(/[、,，]/).map(clean).filter(Boolean);
  present=[...new Set(present)].sort();
  return old.length>0&&old.length===present.length&&old.every((name,i)=>name===present[i]);
 }
 // Geographic membership is separate from geometry: an old polygon can be
 // approximate even when its election-year town or village roster is known.
 const uniqueNames=values=>[...new Set((values||[]).filter(Boolean))];
 function councilScope(district,peers=[],villages=[]){
  if(!district)return '';
  const towns=uniqueNames(district.scopeTowns),label=String(district.scope||'').trim();
  const shared=new Set(towns.filter(t=>peers.some(other=>other!==district&&
   other.county===district.county&&identity(other.electorate)===identity(district.electorate)&&
   String(other.number)!==String(district.number)&&(other.scopeTowns||[]).includes(t))));
  // Preserve archive text for districts with a written scope but no structured roster.
  if(!towns.length)return label||'当届乡镇市区范围尚待核实';
  const details=uniqueNames(villages);
  const parts=towns.map(t=>{
   if(!shared.has(t))return t;
   return t+'（部分里'+(towns.length===1&&details.length?'：'+details.join('、'):'；具体里别待核')+'）';
  });
  // If a source already supplied explicit historical village/partial text, retain it.
  const explicit=label&&/部分|等\s*\d+\s*里|(?:旧|舊).+区/.test(label)&&label!==towns.join('、');
  return parts.join('、')+(explicit&&!details.length?'；原资料：'+label:'');
 }
 function legislativeScopeIndex(rows,normalize=String){
  const districts=new Map(),owners=new Map();
  for(const row of rows||[]){
   if(row.level!=='town'||identity(row.electorate)!=='regional'||!row.county||!row.town)continue;
   const county=normalize(row.county),town=normalize(row.town),n=districtNumber(row.district)||'0',id=county+'|'+n,tk=county+'|'+town;
   if(!districts.has(id))districts.set(id,new Set());
   districts.get(id).add(town);
   if(!owners.has(tk))owners.set(tk,new Set());
   owners.get(tk).add(id);
  }
  return {districts,owners};
 }
 function legislativeScope(index,county,number){
  const id=county+'|'+(districtNumber(number)||'0'),towns=[...(index?.districts.get(id)||[])];
  return towns.map(town=>town+((index.owners.get(county+'|'+town)?.size||0)>1?'（部分里）':'')).join('、');
 }
 function csv(rows){
  const cell=value=>{let text=exportedWording(value);if(/^[=+@\t\r-]/.test(text))text="'"+text;return'"'+text.replace(/"/g,'""')+'"'};
  return'\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
 }

 const queryIndexes=new WeakMap();
 function index(snapshot){
  if(!snapshot||snapshot.schemaVersion!==2)throw Error('Unsupported history snapshot');
  const electionsById=new Map(snapshot.elections.map(item=>[item.election_id,item]));
  const contestsById=new Map(snapshot.contests.map(item=>[item.contest_id,item]));
  const candidaciesByContest=new Map();
  for(const item of snapshot.candidacies){
   if(!contestsById.has(item.contest_id))throw Error('Unknown history contest '+item.contest_id);
   if(!candidaciesByContest.has(item.contest_id))candidaciesByContest.set(item.contest_id,[]);
   candidaciesByContest.get(item.contest_id).push(item);
  }
  const indexed={snapshot,electionsById,contestsById,candidaciesByContest};
  queryIndexes.set(indexed,{electionsByOffice:new Map(),contestsByElection:new Map(),summaries:new Map()});
  const queries=queryIndexes.get(indexed);
  for(const item of electionsById.values()){if(!queries.electionsByOffice.has(item.office))queries.electionsByOffice.set(item.office,[]);queries.electionsByOffice.get(item.office).push(item)}
  for(const contest of contestsById.values()){if(!queries.contestsByElection.has(contest.election_id))queries.contestsByElection.set(contest.election_id,[]);queries.contestsByElection.get(contest.election_id).push(contest)}
  return indexed;
 }

 function contestSummary(contest,candidacies){
  const ranked=[...(candidacies||[])].sort((a,b)=>b.votes-a.votes||
   String(a.ballot_number||'').localeCompare(String(b.ballot_number||''),'zh'));
  const winners=ranked.filter(item=>item.elected_official===true);
  const leader=ranked[0]||null,runnerUp=ranked[1]||null;
  const validVotes=Number.isInteger(contest.valid_votes)?contest.valid_votes:ranked.reduce((sum,item)=>sum+(Number(item.votes)||0),0);
  const share=item=>{
   if(!item)return 0;
   if(Number.isFinite(item.vote_share))return Number(item.vote_share);
   return validVotes?item.votes/validVotes*100:0;
  };
  const partySeats=new Map();
  for(const item of winners)partySeats.set(item.party_name,(partySeats.get(item.party_name)||0)+1);
  const turnout=Number.isInteger(contest.registered_voters)&&contest.registered_voters>0&&Number.isInteger(contest.ballots_cast)?
   contest.ballots_cast/contest.registered_voters*100:null;
  return{
   contest,candidacies:ranked,winners,leader,runnerUp,
   margin:leader&&runnerUp?share(leader)-share(runnerUp):leader?share(leader):null,
   validVotes,turnout,partySeats
  };
 }

 function filter(indexed,selection={}){
  const year=Number(selection.year||2022),office=selection.office||'mayor';
  const electorate=identity(selection.electorate||'regional');
  const years=indexed.snapshot.year===year&&Array.isArray(indexed.snapshot.cycleYears)?indexed.snapshot.cycleYears:[year];
  const queries=queryIndexes.get(indexed);
  const elections=queries?queries.electionsByOffice.get(office)||[]:[...indexed.electionsById.values()];
  const electionIds=new Set(elections.filter(item=>years.includes(Number(item.year))&&item.office===office).map(item=>item.election_id));
  // Keep snapshot order for multi-year batches; direct lookups avoid a full scan for one contest.
  const selectedContest=selection.contestId?indexed.contestsById.get(selection.contestId):null;
  const candidates=selection.contestId?(selectedContest?[selectedContest]:[]):queries&&electionIds.size===1?(queries.contestsByElection.get(electionIds.values().next().value)||[]):[...indexed.contestsById.values()];
  const contests=candidates.filter(item=>
   electionIds.has(item.election_id)&&
   (!selection.countyId||item.county_id===selection.countyId)&&
   (selection.electorate==='all'||electorate==='all'||identity(item.electorate)===electorate)
  );
  const summaries=contests.map(contest=>{
   if(!queries)return contestSummary(contest,indexed.candidaciesByContest.get(contest.contest_id)||[]);
   if(!queries.summaries.has(contest.contest_id))queries.summaries.set(contest.contest_id,contestSummary(contest,indexed.candidaciesByContest.get(contest.contest_id)||[]));
   const summary=queries.summaries.get(contest.contest_id);
   // Return independent arrays/maps as before; consumers may sort or annotate them.
   return {...summary,candidacies:[...summary.candidacies],winners:[...summary.winners],partySeats:new Map(summary.partySeats)};
  });
  return{index:indexed,selection:{...selection,year,office,electorate:selection.electorate||'regional'},contests,summaries,
   candidacies:summaries.flatMap(item=>item.candidacies)};
 }

 function aggregateBallots(summaries){
  if(!summaries.length)return{registeredVoters:null,ballotsCast:null,validVotes:null,invalidVotes:null,turnout:null};
  const contests=summaries.map(item=>item.contest);
  const sum=key=>contests.every(item=>Number.isInteger(item[key]))?
   contests.reduce((total,item)=>total+item[key],0):null;
  const registeredVoters=sum('registered_voters'),ballotsCast=sum('ballots_cast');
  return{
   registeredVoters,ballotsCast,validVotes:summaries.reduce((total,item)=>total+item.validVotes,0),
   invalidVotes:sum('invalid_votes'),
   turnout:registeredVoters&&ballotsCast!==null?ballotsCast/registeredVoters*100:null
  };
 }

 function overview(result){
  if(result.selection?.office==='president'){
    // A single selected county/contest uses its own verified turnout record,
    // never the national roll. This also supports drilling directly into a
    // constituency from the historical results dialog.
    const scoped=result.contests?.length===1?result.contests[0]:null;
    const national=!scoped&&!result.selection.countyId&&!result.selection.contestId?
     result.index?.snapshot?.national:null;
    const summaries=result.summaries||[];
    const validVotes=summaries.reduce((n,item)=>n+item.validVotes,0);
    const uniq=new Map();
    for(const candidate of result.candidacies||[]){
      const key=String(candidate.ballot_number||'')+'|'+String(candidate.candidate_name||'');
      if(!uniq.has(key))uniq.set(key,candidate);
    }
    const candidates=[...uniq.values()];
    const count=field=>Number.isInteger(scoped?.[field])?scoped[field]:
     Number.isInteger(national?.[field])?national[field]:null;
    const registeredVoters=count('registered_voters');
    const ballotsCast=count('ballots_cast');
    const invalidVotes=count('invalid_votes');
    const group={electorate:'regional',registeredVoters,ballotsCast,validVotes,invalidVotes,
      turnout:registeredVoters&&ballotsCast!==null?ballotsCast/registeredVoters*100:null};
    return{...group,turnoutGroups:[group],candidateCount:candidates.length,
      electedCount:candidates.filter(c=>c.elected_official===true).length,
      gender:{},electedGender:{},incumbentCount:null};
  }
  const groups=new Map();
  for(const summary of result.summaries){
   const electorate=identity(summary.contest.electorate);
   if(!groups.has(electorate))groups.set(electorate,[]);
   groups.get(electorate).push(summary);
  }
  const turnoutGroups=[...groups].map(([electorate,summaries])=>({electorate,...aggregateBallots(summaries)}));
  // Totals deliberately sum all applicable electoral rolls, including distinct
  // indigenous electorates. They are counts of registration/ballot records,
  // not distinct people; grouped charts retain the separate electorate totals.
  const combined=aggregateBallots(result.summaries);
  const elected=result.candidacies.filter(item=>item.elected_official===true);
  const gender={};
  for(const item of result.candidacies)gender[item.gender||'未提供']=(gender[item.gender||'未提供']||0)+1;
  const electedGender={};
  for(const item of elected)electedGender[item.gender||'未提供']=(electedGender[item.gender||'未提供']||0)+1;
  return{
   registeredVoters:combined.registeredVoters,ballotsCast:combined.ballotsCast,
   validVotes:combined.validVotes,invalidVotes:combined.invalidVotes,
   turnout:combined.turnout,turnoutGroups,
   candidateCount:result.candidacies.length,electedCount:elected.length,
   gender,electedGender,
   incumbentCount:result.candidacies.some(item=>typeof item.incumbent_at_election==='boolean')?
    result.candidacies.filter(item=>item.incumbent_at_election===true).length:null
  };
 }

 function councilBadges(summary){
  return[...summary.partySeats].map(([party,seats])=>({party,seats}))
   .sort((a,b)=>b.seats-a.seats||a.party.localeCompare(b.party,'zh'));
 }

 // Merge shared township/village edges into district boundary rings.
 function mergePaths(paths){
  const edges=new Map(),points=new Map();
  const add=(a,b)=>{const ka=a.join(','),kb=b.join(',');if(ka===kb)return;points.set(ka,a);points.set(kb,b);const k=ka<kb?ka+'|'+kb:kb+'|'+ka;if(edges.has(k))edges.delete(k);else edges.set(k,[ka,kb])};
  for(const d of paths)for(const part of d.split(/M/i).filter(Boolean)){
   const numbers=part.match(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi)||[],ring=[];
   for(let i=0;i+1<numbers.length;i+=2)ring.push([Number(numbers[i]),Number(numbers[i+1])]);
   for(let i=0;i<ring.length;i++)add(ring[i],ring[(i+1)%ring.length]);
  }
  const adjacency=new Map();for(const [k,[a,b]]of edges){for(const v of [a,b]){if(!adjacency.has(v))adjacency.set(v,new Set());adjacency.get(v).add(k)}}
  const rings=[];
  while(edges.size){const [key,[start,next]]=edges.entries().next().value;let cursor=start,edge=key,ring=[];
   while(edge){const pair=edges.get(edge);if(!pair)break;ring.push(cursor);const end=pair[0]===cursor?pair[1]:pair[0];edges.delete(edge);adjacency.get(pair[0]).delete(edge);adjacency.get(pair[1]).delete(edge);cursor=end;if(cursor===start)break;edge=adjacency.get(cursor)?.values().next().value}
   if(ring.length>=3)rings.push('M'+ring.join('L')+'Z');
  }
  return rings.join('');
 }
 // A publication checksum detects stale/corrupt data; it is not a source signature.
 // Label the actual verified snapshot, never the newest manifest alone.
 function official2026Label(snapshot){
  if(snapshot?.year!==2026)return '';
  return snapshot.publicationStatus==='certified'?'正式公告结果':snapshot.publicationStatus==='provisional'?'开票结果（尚待正式公告）':'';
 }
 function official2026Manifest(manifest,directory){
  return manifest?.schemaVersion===1&&manifest.year===2026&&manifest.status==='published'&&
   manifest.file==='assets/history-2026.json'&&['provisional','certified'].includes(manifest.resultStatus)&&
   /^[0-9a-f]{64}$/i.test(manifest.sha256||'')&&Array.isArray(directory?.candidates)&&Array.isArray(directory?.districts)&&
   manifest.candidateCount===directory.candidates.length&&manifest.districtCount===directory.districts.length;
 }
 function validateOfficial2026(shard,manifest,directory){
  const fail=message=>{throw Error('2026结果校验失败：'+message)};
  if(!official2026Manifest(manifest,directory))fail('发布清单无效');
  if(shard?.schemaVersion!==2||shard.year!==2026||shard.completeness!=='full'||shard.publicationStatus!==manifest.resultStatus||
   !Array.isArray(shard.contests)||shard.contests.length!==manifest.districtCount||
   !Array.isArray(shard.candidacies)||shard.candidacies.length!==manifest.candidateCount||!Array.isArray(shard.rows)||
   !Array.isArray(shard.elections)||!['mayor','council','township'].every(office=>shard.elections.some(e=>e.office===office&&e.election_id==='2026-'+office&&e.year===2026)))fail('资料格式或数量不符');
  const districts=new Map(directory.districts.map(d=>[d.id,d])),candidates=new Map(directory.candidates.map(c=>[c.id,c]));
  if(districts.size!==directory.districts.length||candidates.size!==directory.candidates.length)fail('名册稳定ID重复');
  const text=v=>String(v??''),name=c=>text(c.nameSimplified||c.name||c.nameOriginal),party=c=>text(c.party||'无党籍');
  const shortTown=d=>text(d.town||(text(d.name||d.county).startsWith(text(d.county))?text(d.name||d.county).slice(text(d.county).length):d.name||d.county));
  const contests=new Map(),results=new Map(),totals=new Map(),winners=new Map(),ballots=new Map();
  for(const c of shard.contests){
   const d=districts.get(c.contest_id);
   if(!d||contests.has(c.contest_id)||c.election_id!=='2026-'+d.type||c.seats!==(Number(d.seats)||1)||text(c.county_name)!==text(d.county)||identity(c.electorate)!==identity(d.electorate)||text(c.district_name)!==(d.type==='township'?shortTown(d):text(d.name||d.county)))fail('选区、县市或票种不符或重复');
   contests.set(c.contest_id,c);
  }
  for(const c of shard.candidacies){
   const ref=candidates.get(c.candidate_id),did=c.contest_id;
   if(!ref||results.has(c.candidate_id)||ref.districtId!==did||!contests.has(did)||String(ref.number)!==String(c.ballot_number)||!Number.isSafeInteger(Number(c.ballot_number))||Number(c.ballot_number)<=0||text(c.candidate_name)!==name(ref)||text(c.party_name)!==party(ref)||
    !Number.isSafeInteger(c.votes)||c.votes<0||typeof c.elected_official!=='boolean')fail('候选人身份、号次、得票或当选标记不符');
   const ballot=did+'|'+c.ballot_number;if(ballots.has(ballot))fail('重复号次');ballots.set(ballot,true);
   results.set(c.candidate_id,c);totals.set(did,(totals.get(did)||0)+c.votes);winners.set(did,(winners.get(did)||0)+Number(c.elected_official));
  }
  for(const [id,c] of contests){
   const total=totals.get(id);
   if(!Number.isSafeInteger(total)||winners.get(id)!==c.seats||c.valid_votes!==null&&c.valid_votes!==undefined&&c.valid_votes!==total)fail('选区票数或席次不一致');
   for(const value of [c.registered_voters,c.ballots_cast,c.invalid_votes])if(value!=null&&(!Number.isSafeInteger(value)||value<0))fail('投票统计无效');
   if(c.ballots_cast!=null&&(c.ballots_cast<total||c.registered_voters!=null&&c.ballots_cast>c.registered_voters||c.invalid_votes!=null&&c.ballots_cast!==total+c.invalid_votes))fail('投票统计未对账');
   if(c.registered_voters!=null&&total>c.registered_voters)fail('有效票超过选举人数');
  }
  const primary=new Set(),towns=new Map();
  for(const row of shard.rows){
   const ref=candidates.get(row.candidateId),c=results.get(row.candidateId);
   if(!ref||!c||row.type!==ref.type||String(row.number)!==String(c.ballot_number)||row.elected!==c.elected_official||!Number.isSafeInteger(row.votes)||row.votes<0)fail('地图记录与候选人结果不一致');
   const district=districts.get(ref.districtId);
   if(text(row.county)!==text(district.county)||text(row.name)!==name(ref)||text(row.party)!==party(ref)||identity(row.electorate)!==identity(district.electorate)||ref.type==='council'&&text(row.district)!==text(district.name||district.county)||ref.type==='township'&&text(row.town)!==shortTown(district))fail('地图地区、姓名、政党或票种与名册不一致');
   const level={mayor:'county',council:'district',township:'town'}[ref.type];
   if(row.level===level){if(primary.has(row.candidateId)||row.votes!==c.votes)fail('选区地图记录重复或票数不同');primary.add(row.candidateId)}
   else if(row.level==='town'&&ref.type!=='township'&&row.town){
    const group=towns.get(row.candidateId)||new Map();if(group.has(row.town))fail('重复乡镇得票');group.set(row.town,row.votes);towns.set(row.candidateId,group);
   }else fail('地图层级无效');
  }
  if(primary.size!==results.size)fail('缺少选区地图记录');
  for(const [id,group] of towns){if([...group.values()].reduce((a,b)=>a+b,0)!==results.get(id).votes)fail('乡镇得票与选区总票不符')}
  for(const d of districts.values()){
   const members=d.candidateIds||[],provided=members.filter(id=>towns.has(id));
   if(provided.length&&provided.length!==members.length)fail('乡镇得票覆盖不完整');
   if(provided.length){const first=towns.get(provided[0]);if(provided.some(id=>towns.get(id).size!==first.size||[...first.keys()].some(t=>!towns.get(id).has(t))))fail('候选人乡镇范围不一致')}
  }
  const profiles=new Set();
  if(shard.townProfiles!==undefined&&!Array.isArray(shard.townProfiles))fail('乡镇投票统计格式错误');
  for(const p of shard.townProfiles||[]){
   const key=text(p.county)+'|'+text(p.town),d=[...districts.values()].find(d=>d.type==='mayor'&&text(d.county).replaceAll('臺','台')===text(p.county).replaceAll('臺','台'));
   if(!d||!p.town||p.office!=='mayor'||profiles.has(key))fail('乡镇投票统计范围错误或重复');
   profiles.add(key);
   const values=[p.registered_voters,p.ballots_cast,p.valid_votes,p.invalid_votes];
   if(values.some(v=>!Number.isSafeInteger(v)||v<0)||p.ballots_cast>p.registered_voters||p.valid_votes+p.invalid_votes!==p.ballots_cast)fail('乡镇投票统计未对账');
   const votes=d.candidateIds.map(id=>towns.get(id)?.get(p.town));
   if(!votes.length||votes.some(v=>v===undefined)||votes.reduce((a,b)=>a+b,0)!==p.valid_votes)fail('乡镇有效票与候选人明细不一致');
  }
  return shard;
 }
 async function decodeOfficial2026(bytes,manifest,directory,cryptoApi){
  if(!official2026Manifest(manifest,directory))throw Error('2026发布清单无效');
  if(!cryptoApi?.subtle)throw Error('当前浏览器无法验证正式结果校验值，请使用 HTTPS');
  const hash=await cryptoApi.subtle.digest('SHA-256',bytes);
  const hex=Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
  if(hex!==manifest.sha256.toLowerCase())throw Error('2026正式结果文件校验值不一致，请重新载入');
  return validateOfficial2026(JSON.parse(new TextDecoder().decode(bytes)),manifest,directory);
 }
 const api={official2026Label,official2026Manifest,validateOfficial2026,decodeOfficial2026,identity,districtNumber,compareResultRows,key,sameScope,councilScope,legislativeScopeIndex,legislativeScope,csv,index,filter,contestSummary,overview,councilBadges,mergePaths};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryCore=api;
})(typeof window==='undefined'?{}:window);
