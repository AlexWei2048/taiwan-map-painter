/* Blank CSV cells preserve saved data unless replacement was explicitly selected. */
(function(root){
 'use strict';
 function merge(previous={},incoming={},replace=false){
  if(replace)return JSON.parse(JSON.stringify(incoming));
  const out={...previous,...incoming,estimates:{...previous.estimates},note:incoming.note||previous.note||''};
  if(Object.hasOwn(incoming,'winners'))out.winners=incoming.winners.length?[...incoming.winners]:[...(previous.winners||[])];
  if(Object.hasOwn(incoming,'leaderId'))out.leaderId=incoming.leaderId||previous.leaderId||'';
  for(const [id,estimate]of Object.entries(incoming.estimates||{})){
   const old=previous.estimates?.[id]||{};
   out.estimates[id]={votes:estimate.votes??old.votes??null,share:estimate.share??old.share??null};
  }
  return out;
 }
 function removed(previous={},next={}){
  let n=(previous.winners||[]).filter(id=>!(next.winners||[]).includes(id)).length;
  if(previous.leaderId&&!next.leaderId)n++;
  for(const [id,e]of Object.entries(previous.estimates||{}))for(const key of ['votes','share'])if(e[key]!=null&&next.estimates?.[id]?.[key]==null)n++;
  return n;
 }
 const api={merge,removed};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ImportCore=api;
})(typeof window==='undefined'?{}:window);
