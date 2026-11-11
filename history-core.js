/* Stable history/map joins. Display names never serve as electoral identifiers. */
(function(root){
 'use strict';
 const identity=value=>({plainsIndigenous:'plains',mountainIndigenous:'mountain'}[value]||value||'regional');
 function districtNumber(value){
  const direct=String(value??'').trim();
  if(/^\d+$/.test(direct))return String(Number(direct));
  const match=direct.match(/第\s*0*(\d+)\s*(?:选|選)(?:举|舉)?(?:区|區)/);
  return match?String(Number(match[1])):'';
 }
 const COUNTY_ORDER=['台北市','新北市','桃园市','台中市','台南市','高雄市','基隆市','宜兰县','新竹县','新竹市','苗栗县','彰化县','南投县','云林县','嘉义县','嘉义市','屏东县','花莲县','台东县','澎湖县','金门县','连江县'];
 const ELECTORATE_ORDER=['regional','plains','mountain'];
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
 function csv(rows){
  const cell=value=>{let text=String(value??'');if(/^[=+@\t\r-]/.test(text))text="'"+text;return'"'+text.replace(/"/g,'""')+'"'};
  return'\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
 }

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
  return{snapshot,electionsById,contestsById,candidaciesByContest};
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
  const electionIds=new Set([...indexed.electionsById.values()]
   .filter(item=>Number(item.year)===year&&item.office===office).map(item=>item.election_id));
  const contests=[...indexed.contestsById.values()].filter(item=>
   electionIds.has(item.election_id)&&
   (!selection.countyId||item.county_id===selection.countyId)&&
   (selection.electorate==='all'||electorate==='all'||identity(item.electorate)===electorate)&&
   (!selection.contestId||item.contest_id===selection.contestId)
  );
  const summaries=contests.map(contest=>contestSummary(contest,indexed.candidaciesByContest.get(contest.contest_id)||[]));
  return{index:indexed,selection:{...selection,year,office,electorate:selection.electorate||'regional'},contests,summaries,
   candidacies:summaries.flatMap(item=>item.candidacies)};
 }

 function aggregateBallots(summaries){
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
    const national=!result.selection.countyId?result.index?.snapshot?.national:null;
    const summaries=result.summaries||[];
    const validVotes=summaries.reduce((n,item)=>n+item.validVotes,0);
    const uniq=new Map();
    for(const candidate of result.candidacies||[]){
      const key=String(candidate.ballot_number||'')+'|'+String(candidate.candidate_name||'');
      if(!uniq.has(key))uniq.set(key,candidate);
    }
    const candidates=[...uniq.values()];
    const registeredVoters=Number.isInteger(national?.registered_voters)?national.registered_voters:null;
    const ballotsCast=Number.isInteger(national?.ballots_cast)?national.ballots_cast:null;
    const invalidVotes=Number.isInteger(national?.invalid_votes)?national.invalid_votes:null;
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
  const combined=turnoutGroups.length===1?turnoutGroups[0]:null;
  const elected=result.candidacies.filter(item=>item.elected_official===true);
  const gender={};
  for(const item of result.candidacies)gender[item.gender||'未提供']=(gender[item.gender||'未提供']||0)+1;
  const electedGender={};
  for(const item of elected)electedGender[item.gender||'未提供']=(electedGender[item.gender||'未提供']||0)+1;
  return{
   registeredVoters:combined?.registeredVoters??null,ballotsCast:combined?.ballotsCast??null,
   validVotes:combined?.validVotes??null,invalidVotes:combined?.invalidVotes??null,
   turnout:combined?.turnout??null,turnoutGroups,
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
 const api={identity,districtNumber,compareResultRows,key,sameScope,csv,index,filter,contestSummary,overview,councilBadges,mergePaths};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryCore=api;
})(typeof window==='undefined'?{}:window);
