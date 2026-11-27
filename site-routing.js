/* Shareable, static-host-safe routes. Never serialize project data. */
(function(root){
 'use strict';
 const offices=['president','legislative','mayor','council','township'];
 const futureOffices=['mayor','council','township'];
 const layers=['county','town','council','legislative'];
 const historyKeys=['level','metric','electorate','candidateScope','candidate','party','focus','view','scope','overviewCounty','overviewArea','area','detailCounty','identity','contest','years','analysis'];
 const predictionKeys=['level','display','metric','electorate','candidate','district','scope','fill'];
 const freeKeys=['electorate'];
 const choose=(v,allowed,fallback)=>allowed.includes(v)?v:fallback;
 const part=v=>encodeURIComponent(String(v));
 const queryKeys=mode=>mode==='history'?historyKeys:mode==='prediction'?predictionKeys:freeKeys;
 function parse(hash){
  try{
   if(typeof hash!=='string'||!hash.startsWith('#/')||hash.length>12000)return null;
   const raw=hash.slice(2),q=raw.indexOf('?'),path=q<0?raw:raw.slice(0,q),query=q<0?'':raw.slice(q+1);
   const parts=path.split('/').map(decodeURIComponent);
   if(parts.some(p=>p.length>240)||parts.length>5)return null;
   const mode=parts[0];let r;
   if(mode==='history'){
    if(!offices.includes(parts[1])||!/^\d{4}(?:-\d{4})?$/.test(parts[2]||''))return null;
    r={mode,office:parts[1],year:Number(parts[2].split('-').at(-1)),county:parts[3]||''};
    if(parts[4])r.area=parts[4];
   }else if(mode==='prediction'){
    if(parts[1]!=='2026'||!futureOffices.includes(parts[2])||parts.length>4)return null;
    r={mode,year:2026,office:parts[2],county:parts[3]||''};
   }else if(mode==='free'){
    if(!layers.includes(parts[1])||parts.length>3)return null;
    r={mode,level:parts[1],county:parts[2]||''};
   }else return null;
   const params=new URLSearchParams(query);
   for(const k of queryKeys(mode)){const v=params.get(k);if(v!==null&&v.length<=1024)r[k]=v}
   return r;
  }catch(e){return null}
 }
 function format(r){
  if(!r)return '';
  let path;
  if(r.mode==='history'&&offices.includes(r.office)&&Number.isInteger(Number(r.year))){
   const y=String(r.yearLabel||r.year).replace('/','-');
   path=['history',r.office,y];if(r.county)path.push(r.county);
   if(r.county&&r.area&&(!r.detailCounty||r.detailCounty===r.county))path.push(r.area);
  }else if(r.mode==='prediction'&&futureOffices.includes(r.office)){
   path=['prediction','2026',r.office];if(r.county)path.push(r.county);
  }else if(r.mode==='free'&&layers.includes(r.level)){
   path=['free',r.level];if(r.county)path.push(r.county);
  }else return '';
  const q=new URLSearchParams();
  for(const k of queryKeys(r.mode)){
   if(k==='area'&&r.county&&r.area&&(!r.detailCounty||r.detailCounty===r.county))continue;
   if(r[k]!==undefined&&r[k]!==null&&r[k]!=='')q.set(k,String(r[k]));
  }
  return '#/'+path.map(part).join('/')+(q.size?'?'+q.toString():'');
 }
 const api={parse,format};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return}
 root.SiteRouting=api;
 const $=id=>document.getElementById(id);
 let started=false,restoring=false,sequence=0,timer=0,lastHash=null;
 const futureLevel={counties:'county',towns:'town',council:'council',legislative:'legislative'};
 const mapLevel={county:'counties',town:'towns',council:'council',legislative:'legislative'};
 const textValue=id=>$(id)?.value||'';
 function read(){
  if(root.History2022View?.active()){
   const r=root.History2022View.routeSelection();
   return {...r,mode:'history',analysis:r.view==='trends'&&root.HistoryObservation?.tab()!=='trends'?root.HistoryObservation?.tab():undefined};
  }
  if(state.workspaceMode==='free')return{mode:'free',level:futureLevel[state.level]||'county',county:state.county,electorate:state.level==='council'?state.electorate.council:undefined};
  if(state.workspaceMode!=='prediction')return null;
  const vote=state.predictionDisplay==='candidateVote';
  return{mode:'prediction',office:state.predictionOffice,county:state.county,
   level:state.predictionOffice==='mayor'&&state.predictionScale==='overlay'?'town':state.predictionScale||'district',
   display:state.predictionDisplay,metric:vote?state.predictionVoteMetric:undefined,
   candidate:vote?state.localDisplayCandidate:undefined,
   district:vote?state.predictionRegion:undefined,scope:state.predictionOffice==='council'?state.councilViewScope:undefined,
   fill:state.fillMode==='solid'?'solid':undefined};
 }
 function write(replace=false){
  if(!started||restoring)return;
  const r=read();
  if(!r)return;
  if(r.mode==='history'){
   const snap=root.History2022View.snapshot();
   if(!snap||snap.year!==r.year||!snap.elections?.some(e=>e.office===r.office))return;
   if($('historyOffice')?.value!==r.office||Number($('historyYear')?.value)!==r.year)return;
   if($('historyLoadStatus')&&!$('historyLoadStatus').hidden)return;
  }
  const hash=format(r);
  if(!hash)return;
  // Compare against the browser's encoded canonical fragment, not decoded text.
  if(root.location.hash!==hash){
   root.history[replace?'replaceState':'pushState'](null,'',root.location.pathname+root.location.search+hash);
  }
  lastHash=root.location.hash;
 }
 function schedule(){
  if(!started||restoring)return;
  clearTimeout(timer);timer=setTimeout(()=>write(false),80);
 }
 function applyFuture(r){
  const county=data?.counties.some(f=>f.name===r.county)?r.county:'';
  if(r.mode==='free'){
   $('workspaceFree').click();
   state.level=mapLevel[r.level]||'counties';state.county=county;
   if(state.level==='council')state.electorate.council=choose(r.electorate,['regional','plains','mountain'],'regional');
  }else{
   $('workspacePrediction').click();
   enterPrediction(r.office);
   state.county=county;
   state.predictionScale=r.office==='mayor'&&r.level==='town'?'overlay':'district';
   state.level=state.predictionScale==='overlay'?'towns':({mayor:'counties',council:'council',township:'towns'}[r.office]);
   state.predictionDisplay=choose(r.display,r.office==='council'?['composition']:['composition','topVote','candidateVote'],'composition');
   state.predictionCandidateScope=state.predictionDisplay==='candidateVote'?'candidateVote':'topVote';
   state.predictionVoteMetric=choose(r.metric,['share','votes'],'share');
   if(r.district&&candidateDatabase?.districts.some(d=>d.id===r.district&&d.type===r.office&&(!county||d.county===county)))state.predictionRegion=r.district;
   if(r.candidate&&candidateById.has(r.candidate))state.localDisplayCandidate=r.candidate;
   if(r.office==='council')state.councilViewScope=choose(r.scope,['all','regional','plains','mountain'],'all');
   if(r.fill==='solid')state.fillMode='solid';
  }
  state.villageTown='';erase=false;syncInputs();render();persist();
 }
 async function apply(hash,initial=false){
  clearTimeout(timer);
  const token=++sequence;restoring=true;
  const r=parse(hash);
  const valid=()=>token===sequence;
  try{
   if(!data){await mapPromise;if(!data)throw Error('基础地图尚未载入')}
   if(!valid())return;
   if(typeof hash==='string'&&hash.startsWith('#plan-v1=')){if(!root.PlanShareUI)throw Error('分享模块尚未载入');await root.PlanShareUI.receive(hash);return}
   if(r?.mode==='history'){
    const ok=await root.SiteWorkspaceCategories.openHistory(r,valid);
    if(valid()&&!ok)throw Error('所选历史资料暂时无法载入');
   }else if(r)applyFuture(r);
   else if(!initial)applyFuture({mode:'prediction',office:'mayor'});
  }catch(error){
   if(valid()){toast(error.message||'无法恢复链接中的查询条件');if(r?.mode==='history')return}
  }finally{
   if(valid()){
    restoring=false;lastHash=root.location.hash;
    if(!r||r.mode!=='history'||root.History2022View?.routeReady?.(r))write(true);
   }
  }
 }
 function navigation(){
  if(!started||root.location.hash===lastHash)return;
  lastHash=root.location.hash;apply(lastHash);
 }
 // Future map actions persist only the local project; the route stores its view.
 const originalPersist=persist;persist=function(){originalPersist();schedule()};
 root.addEventListener('historyselectionchange',schedule);
 root.addEventListener('site-route-change',schedule);
 root.addEventListener('popstate',navigation);
 root.addEventListener('hashchange',navigation);
 document.addEventListener('change',schedule);
 document.addEventListener('click',event=>{
  // Commit the explicit return-to-overview route before a fast reload can read
  // the previous county fragment. All other routine changes remain debounced.
  if(event.target.closest?.('#returnTaiwanMap')){clearTimeout(timer);write(false);return}
  if(event.target.closest?.('#categoryFuture,#categoryHistory,#categoryAnalysis,#workspacePrediction,#workspaceFree,#historyViewCandidates,#historyViewOverview,#historyViewTrends,#trendSelectAll,#trendSelectNone'))schedule();
 });
 function start(){
  if(started)return;started=true;
  if(root.location.hash){lastHash=root.location.hash;apply(lastHash,true)}
  else if(data)write(true);
  else mapPromise.then(()=>{if(!restoring&&!root.location.hash)write(true)}).catch(()=>{});
 }
 if(document.readyState==='loading'||(document.currentScript?.defer&&document.readyState!=='complete'))document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(typeof window==='undefined'?globalThis:window);
