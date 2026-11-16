/* 2026 forecasts: immutable user-created snapshots, separate from live project.
 * Archive timestamps are browser times, not externally authenticated timestamps.
 */
(function(root){
'use strict';
const KIND='island-palette-2026-forecast-archive',VERSION=1;
const clone=x=>JSON.parse(JSON.stringify(x));
const numbers=new Set(['mayor','council','township']);
const safeDate=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(x)&&!Number.isNaN(Date.parse(x));
const positive=x=>Number.isFinite(x)&&x>=0;
function validate(input,directory){
 if(!input||input.kind!==KIND||input.version!==VERSION||input.electionYear!==2026||!safeDate(input.createdAt))
  throw Error('文件不是岛屿调色盘2026预测封存档案');
 if(!/^[a-zA-Z0-9-]{8,90}$/.test(String(input.id||'')))throw Error('预测快照ID不正确');
 const list=directory?.districts||[],byDistrict=new Map(list.map(d=>[d.id,d]));
 const candidates=new Map((directory?.candidates||[]).map(c=>[c.id,c]));
 const predictions={},localPredictions={};
 if(Object.keys(input.predictions||{}).length>list.length)throw Error('预测选区数量超出范围');
 for(const [did,rec] of Object.entries(input.predictions||{})){
  const d=byDistrict.get(did);
  if(!d||!numbers.has(d.type)||!rec||!Array.isArray(rec.winners)||!rec.estimates||typeof rec.estimates!=='object'||Array.isArray(rec.estimates))
   throw Error('封存内容包含无效选区或预测资料');
  if(rec.winners.length>100||new Set(rec.winners).size!==rec.winners.length)throw Error('重复或超额当选人');
  const allowed=new Set(d.candidateIds),estimates={};
  for(const cid of rec.winners)if(!allowed.has(cid)||!candidates.has(cid))throw Error('封存当选人不属于选区：'+cid);
  for(const [cid,e]of Object.entries(rec.estimates)){
   if(!allowed.has(cid)||!e||typeof e!=='object')throw Error('封存得票引用了错误候选人');
   const votes=e.votes===null||e.votes===undefined?null:Number(e.votes),
    share=e.share===null||e.share===undefined?null:Number(e.share);
   if(votes!==null&&(!Number.isSafeInteger(votes)||votes<0))throw Error('预测票数必须是非负整数');
   if(share!==null&&(!positive(share)||share>100))throw Error('预测得票率不在0至100%');
   if(votes!==null||share!==null)estimates[cid]={votes,share};
  }
  predictions[did]={winners:[...rec.winners],estimates,note:String(rec.note||'').slice(0,300),
   method:rec.method==='ranking'?'ranking':'manual',updatedAt:safeDate(rec.updatedAt)?rec.updatedAt:''};
 }
 const entries=Object.entries(input.localPredictions||{});
 if(entries.length>list.length)throw Error('乡镇预测选区数量超出范围');
 let townCount=0;
 for(const [did,towns]of entries){
  const d=byDistrict.get(did);
  if(!d||!['mayor','council'].includes(d.type)||!towns||typeof towns!=='object'||Array.isArray(towns))
   throw Error('乡镇预测的所属选区不正确');
  localPredictions[did]={};
  for(const [townId,record]of Object.entries(towns)){
   if(++townCount>5000||!/^\d{8}$/.test(townId)||!record||typeof record!=='object')
    throw Error('乡镇预测数量或地区ID不正确');
   const allowed=new Set(d.candidateIds),leader=String(record.leaderId||'');
   if(leader&&!allowed.has(leader))throw Error('乡镇最高票候选人不在本选区');
   const estimates={};
   for(const [cid,estimate]of Object.entries(record.estimates||{})){
    if(!allowed.has(cid)||!estimate||typeof estimate!=='object')throw Error('乡镇得票候选人不匹配');
    const votes=estimate.votes===null||estimate.votes===undefined?null:Number(estimate.votes);
    const share=estimate.share===null||estimate.share===undefined?null:Number(estimate.share);
    if(votes!==null&&(!Number.isSafeInteger(votes)||votes<0))throw Error('乡镇预测票数必须是非负整数');
    if(share!==null&&(!positive(share)||share>100))throw Error('乡镇预测得票率不在0至100%');
    if(votes!==null||share!==null)estimates[cid]={votes,share};
   }
   const total=record.totalVotes===null||record.totalVotes===undefined?null:Number(record.totalVotes);
   if(total!==null&&(!Number.isSafeInteger(total)||total<0))throw Error('乡镇预测总票数无效');
   localPredictions[did][townId]={leaderId:leader,estimates,totalVotes:total,
    note:String(record.note||'').slice(0,300),updatedAt:safeDate(record.updatedAt)?record.updatedAt:''};
  }
 }
 const chosen=new Set(Object.values(predictions).flatMap(r=>r.winners));
 const candidateParties={};
 for(const [cid,party]of Object.entries(input.candidateParties||{})){
  if(!chosen.has(cid)||!candidates.has(cid)||typeof party!=='string'||party.length>80)
   throw Error('封存所用的政党资料与预测候选人不匹配');
  candidateParties[cid]=party;
 }
 return{kind:KIND,version:VERSION,id:input.id,electionYear:2026,createdAt:input.createdAt,
  label:String(input.label||'选前预测').trim().slice(0,80)||'选前预测',
  note:String(input.note||'').slice(0,500),rosterAsOf:String(input.rosterAsOf||'').slice(0,40),
  predictions,localPredictions,candidateParties};
}
function capture(state,directory,meta={}){
 const id=String(meta.id||('snapshot-'+Date.now()+'-'+Math.random().toString(36).slice(2,10)));
 return validate({kind:KIND,version:VERSION,id,electionYear:2026,
  createdAt:String(meta.createdAt||new Date().toISOString()),label:meta.label||'选前预测',
  note:meta.note||'',rosterAsOf:directory?.asOf,
  predictions:clone(state.predictions||{}),localPredictions:clone(state.localPredictions||{}),
  candidateParties:Object.fromEntries(
   [...new Set(Object.values(state.predictions||{}).flatMap(r=>r.winners||[]))]
    .map(id=>[id,directory.candidates.find(c=>c.id===id)?.party||'无党籍']))
 },directory);
}
function coverage(archive,directory){
 const byId=new Map((directory?.districts||[]).map(d=>[d.id,d]));
 const data={districtsRecorded:0,districtsComplete:0,seatsSelected:0,localAreas:0,voteForecasts:0,
  office:{mayor:0,council:0,township:0}};
 for(const [did,rec]of Object.entries(archive.predictions||{})){
  const d=byId.get(did);if(!d)continue;
  if(rec.winners.length||Object.keys(rec.estimates).length)data.districtsRecorded++;
  if(rec.winners.length===d.seats&&new Set(rec.winners).size===d.seats){
   data.districtsComplete++;data.seatsSelected+=d.seats;data.office[d.type]++;
  }
  data.voteForecasts+=Object.values(rec.estimates).filter(e=>e.votes!==null||e.share!==null).length;
 }
 for(const towns of Object.values(archive.localPredictions||{}))data.localAreas+=Object.keys(towns).length;
 return data;
}
function compare(archive,official,directory){
 if(official?.schemaVersion!==2||official.year!==2026||official.completeness!=='full'||
  !['provisional','certified'].includes(official.publicationStatus)||!Array.isArray(official.candidacies))
   throw Error('须载入完整且已正式发布的2026官方选举结果后才能复盘');
 const byDistrict=new Map((directory.districts||[]).map(d=>[d.id,d]));
 const officialByDistrict=new Map(),byId=new Map();
 for(const c of official.candidacies){
  if(!c.candidate_id||!c.contest_id)continue;
  if(!officialByDistrict.has(c.contest_id))officialByDistrict.set(c.contest_id,[]);
  officialByDistrict.get(c.contest_id).push(c);byId.set(c.candidate_id,c);
 }
 const result={archiveId:archive.id,electionYear:2026,sourceStatus:official.publicationStatus,
  districtsEvaluated:0,districtsExact:0,seatHits:0,seatsEvaluated:0,
  partySeatError:0,voteEstimatesCompared:0,voteAbsoluteErrorTotal:0,
  shareEstimatesCompared:0,shareAbsoluteErrorTotal:0,
  skippedNoPrediction:0,skippedIncomplete:0,skippedUnmatchedOfficial:0,
  offices:{mayor:{districts:0,exact:0},council:{districts:0,exact:0},township:{districts:0,exact:0}},
  districts:[]};
 for(const d of directory.districts){
  const prediction=archive.predictions[d.id],officials=officialByDistrict.get(d.id)||[];
  if(!prediction||!prediction.winners.length){result.skippedNoPrediction++;continue}
  if(prediction.winners.length!==d.seats){result.skippedIncomplete++;continue}
  const voters=new Set(officials.map(c=>c.candidate_id)),winners=officials.filter(c=>c.elected_official===true).map(c=>c.candidate_id);
  if(officials.length!==d.candidateIds.length||winners.length!==d.seats||
    d.candidateIds.some(cid=>!voters.has(cid))){result.skippedUnmatchedOfficial++;continue}
  const a=new Set(winners),p=new Set(prediction.winners);
  const exact=a.size===p.size&&[...a].every(id=>p.has(id)),hits=[...p].filter(id=>a.has(id)).length;
  const electedParty=new Map(),predParty=new Map();
  for(const cid of winners){const party=String(byId.get(cid)?.party_name||directory.candidates.find(c=>c.id===cid)?.party||'无党籍');electedParty.set(party,(electedParty.get(party)||0)+1)}
  for(const cid of p){const party=String(archive.candidateParties?.[cid]||directory.candidates.find(c=>c.id===cid)?.party||'无党籍');predParty.set(party,(predParty.get(party)||0)+1)}
  const allParties=new Set([...electedParty.keys(),...predParty.keys()]);
  const partyError=[...allParties].reduce((sum,party)=>sum+Math.abs((predParty.get(party)||0)-(electedParty.get(party)||0)),0)/2;
  const detail={districtId:d.id,county:d.county,office:d.type,seats:d.seats,exact,
   correctWinners:hits,partySeatError:partyError,percentErrors:0,voteErrors:0};
  result.districtsEvaluated++;result.seatsEvaluated+=d.seats;result.seatHits+=hits;
  result.partySeatError+=partyError;result.offices[d.type].districts++;
  if(exact){result.districtsExact++;result.offices[d.type].exact++}
  const registered=officials.reduce((sum,c)=>sum+Number(c.votes||0),0);
  for(const [cid,e]of Object.entries(prediction.estimates||{})){
   const actual=byId.get(cid);if(!actual||actual.contest_id!==d.id)continue;
   if(e.votes!==null&&Number.isSafeInteger(actual.votes)){
    result.voteEstimatesCompared++;result.voteAbsoluteErrorTotal+=Math.abs(e.votes-actual.votes);detail.voteErrors++;
   }
   const actualShare=Number.isFinite(actual.vote_share)?actual.vote_share:
    registered>0?Number(actual.votes||0)/registered*100:null;
   if(e.share!==null&&Number.isFinite(actualShare)){
    result.shareEstimatesCompared++;result.shareAbsoluteErrorTotal+=Math.abs(e.share-actualShare);detail.percentErrors++;
   }
  }
  result.districts.push(detail);
 }
 result.districtAccuracy=result.districtsEvaluated?result.districtsExact/result.districtsEvaluated*100:null;
 result.winnerSeatAccuracy=result.seatsEvaluated?result.seatHits/result.seatsEvaluated*100:null;
 result.voteMAE=result.voteEstimatesCompared?result.voteAbsoluteErrorTotal/result.voteEstimatesCompared:null;
 result.shareMAE=result.shareEstimatesCompared?result.shareAbsoluteErrorTotal/result.shareEstimatesCompared:null;
 // Per-town mayor forecasts require official per-candidate town results. Never
 // substitute county-wide elected status, and never infer missing town counts.
 result.local={evaluated:0,correct:0,skipped:0};
 const townsById=new Map((official.rows||[]).filter(r=>r.type==='mayor'&&r.level==='town'&&r.candidateId)
  .map(r=>[String(r.county).replaceAll('臺','台')+'|'+r.town+'|'+r.candidateId,r]));
 const towns=Array.isArray(directory.towns)?directory.towns:[];
 for(const [did,records]of Object.entries(archive.localPredictions||{})){
  const d=byDistrict.get(did);if(!d||d.type!=='mayor')continue;
  for(const [tid,rec]of Object.entries(records)){
   if(!rec.leaderId){result.local.skipped++;continue}
   const geography=towns.find(t=>t.id===tid);
   if(!geography){result.local.skipped++;continue}
   const source=d.candidateIds.map(cid=>townsById.get(
    d.county.replaceAll('臺','台')+'|'+geography.name+'|'+cid));
   if(source.some(x=>!x||!Number.isFinite(x.votes))){result.local.skipped++;continue}
   const highest=Math.max(...source.map(x=>x.votes));
   const leaders=source.filter(x=>x.votes===highest);
   if(leaders.length!==1){result.local.skipped++;continue}
   result.local.evaluated++;if(rec.leaderId===leaders[0].candidateId)result.local.correct++;
  }
 }
 return result;
}
const api={KIND,VERSION,validate,capture,coverage,compare};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ForecastArchiveCore=api;
})(typeof window==='undefined'?{}:window);
