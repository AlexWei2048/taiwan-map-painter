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
 const api={identity,districtNumber,compareResultRows,key,sameScope,councilScope,legislativeScopeIndex,legislativeScope,csv,index,filter,contestSummary,overview,councilBadges,mergePaths};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryCore=api;
})(typeof window==='undefined'?{}:window);
