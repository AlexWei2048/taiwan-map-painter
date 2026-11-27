/* Shared, bounded read-only history query cache. No prediction state or persistent storage. */
(function(root){
'use strict';
function createCache(limit=12){
 limit=Math.max(1,Math.floor(Number(limit)||12));const map=new Map();
 function trim(){for(const [key,entry] of map){if(map.size<=limit)break;if(entry.done)map.delete(key)}}
 function get(key,load){if(map.has(key)){const entry=map.get(key);map.delete(key);map.set(key,entry);return entry.promise}
  const entry={done:false,promise:null};entry.promise=Promise.resolve().then(load).then(value=>{entry.done=true;trim();return value},error=>{if(map.get(key)===entry)map.delete(key);throw error});map.set(key,entry);trim();return entry.promise}
 return {get,size:()=>map.size,clear:()=>map.clear(),stats:()=>({size:map.size,settled:[...map.values()].filter(e=>e.done).length,inFlight:[...map.values()].filter(e=>!e.done).length,limit})}
}
function snapshotKey(office,year){year=Number(year);return [2022,2026].includes(year)&&['mayor','council','township'].includes(office)?'local|'+year:office+'|'+year}
function versionedKey(office,year,version=''){const key=snapshotKey(office,year);return key==='local|2026'?key+'|'+(version||'unpublished'):key}
function createQuery(load,records,limit=12,version=()=>null){
 const snapshots=createCache(limit),candidateRows=new WeakMap();
 async function snapshot(office,year){return snapshots.get(versionedKey(office,year,version()),()=>load(office,Number(year)))}
 function candidates(shard,office){let map=candidateRows.get(shard);if(!map){map=new Map();candidateRows.set(shard,map)}if(!map.has(office))map.set(office,records(shard,office));return map.get(office)}
 return {snapshot,candidates,stats:snapshots.stats}
}
const api={createCache,createQuery,snapshotKey,versionedKey};
if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
root.HistoryQueryCache=api;
root.HistoryQuery=createQuery((o,y)=>o==='president'?root.HistoryPresidential.load(y):o==='legislative'?root.HistoryLegislative.load(y):[2022,2026].includes(y)?root.History2022View.trendSnapshot(y):root.HistoryLocal.loadCycle(y,o),(s,o)=>root.HistoryObservationCore.candidateRecords(s,o),12,()=>root.HISTORY_2026_RESULT_VERSION);
})(typeof window==='undefined'?globalThis:window);
