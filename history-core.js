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
 const api={identity,districtNumber,key,sameScope,csv,index,filter,contestSummary,overview,councilBadges,mergePaths};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryCore=api;
})(typeof window==='undefined'?{}:window);
