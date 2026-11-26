'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLoader=api.createHistoryLoader({
  preloadScripts:api.domScriptPreloader(document),
  loadStyle:api.domStyleLoader(document),
  loadScript:api.domScriptLoader(document),
  getView:()=>root.History2022View,
  getCandidates:()=>root.HistoryLegislativeCandidates
 });
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const HISTORY_STYLES=['history-legislative.css'];
 const HISTORY_SCRIPTS=[
  'assets/party-logos-archive.js','history-core.js','history-presidential-turnout.js',
  'history-presidential.js','history-legislative.js','history-legislative-party.js',
  'history-legislative-turnout.js','history-legislative-data.js','history-local.js',
  'history-workspace.js','history-2022.js','history-coverage.js','history-compare.js','history-observation-core.js','history-observation-ui.js'
 ];
 const LEGISLATIVE_CANDIDATES='assets/history-legislative-candidates.js';
 const TREND_SCRIPTS=['history-trends.js','history-trend-summary.js','history-trends-ui.js'];
 const versions={'history-compare.js':'20261126-p2-v119b','history-coverage.js':'20261126-v124-coverage-v2','history-observation-core.js':'20261126-v124-observation-v2','history-observation-ui.js':'20261126-v124-observation-v2','history-core.js':'20261126-p0-v120','history-legislative.css':'20261126-p1-v110','history-legislative.js':'20261126-performance-v103','history-trends-ui.js':'20261126-p1-v113','history-trends.js':'20261126-performance-v104','history-trend-summary.js':'20261126-performance-v102','history-presidential.js':'20261126-performance-v102','history-local.js':'20261126-performance-v101','history-workspace.js':'20261126-island-observe-v122','history-2022.js':'20261126-v124-boundary-control'};
 const tagged=path=>path+(path.includes('?')?'&':'?')+'v='+(versions[path]||'20261126-merged-layout-v97');
 // Preload downloads in parallel; the existing sequential loader retains execution order and retry semantics.
 function domScriptPreloader(document){return paths=>{for(const path of paths){const href=tagged(path);if(document.querySelector('link[data-history-preload="'+href+'"]')||document.querySelector('script[data-history-asset="'+path+'"]'))continue;const link=document.createElement('link');link.rel='preload';link.as='script';link.href=href;link.dataset.historyPreload=href;link.onerror=()=>link.remove();document.head.append(link)}}}
 function domStyleLoader(document){return href=>new Promise((resolve,reject)=>{
  const selector='link[data-history-asset="'+href+'"]',existing=document.querySelector(selector);
  if(existing){if(existing.dataset.loaded==='true')return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return}
  const link=document.createElement('link');link.rel='stylesheet';link.href=tagged(href);link.dataset.historyAsset=href;
  link.onload=()=>{link.dataset.loaded='true';resolve()};link.onerror=()=>{link.remove();reject(Error('历史样式载入失败：'+href))};document.head.append(link)
 })}
 function domScriptLoader(document){return src=>new Promise((resolve,reject)=>{
  const selector='script[data-history-asset="'+src+'"]',existing=document.querySelector(selector);
  if(existing){if(existing.dataset.loaded==='true')return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return}
  const script=document.createElement('script');script.src=tagged(src);script.dataset.historyAsset=src;
  script.onload=()=>{script.dataset.loaded='true';resolve()};script.onerror=()=>{script.remove();reject(Error('历史资料载入失败：'+src))};document.body.append(script)
 })}
 function createHistoryLoader({loadStyle,loadScript,getView,getCandidates=()=>null,preloadScripts=()=>{}}){
  let pending=null,trendPending=null,candidatePending=null;
  function load(){
   if(!pending)pending=(async()=>{
    preloadScripts(HISTORY_SCRIPTS);
    await Promise.all(HISTORY_STYLES.map(loadStyle));
    for(const src of HISTORY_SCRIPTS)await loadScript(src);
    if(!getView()?.activate)throw Error('历史数据功能未能初始化');
    return getView()
   })().catch(error=>{pending=null;throw error});
   return pending
  }
  async function activate(){const view=await load();view.activate()}
  function loadTrends(){
   if(!trendPending)trendPending=(async()=>{
    await load();preloadScripts(TREND_SCRIPTS);
    for(const src of TREND_SCRIPTS)await loadScript(src);
   })().catch(error=>{trendPending=null;throw error});
   return trendPending;
  }
  function loadLegislativeCandidates(){
   if(getCandidates())return Promise.resolve(getCandidates());
   if(!candidatePending)candidatePending=(async()=>{
    await loadScript(LEGISLATIVE_CANDIDATES);
    const data=getCandidates();if(!data)throw Error('民代候选人资料未能初始化');return data;
   })().catch(error=>{candidatePending=null;throw error});
   return candidatePending;
  }
  return{load,activate,loadTrends,loadLegislativeCandidates}
 }
 return{HISTORY_STYLES,HISTORY_SCRIPTS,TREND_SCRIPTS,LEGISLATIVE_CANDIDATES,createHistoryLoader,domStyleLoader,domScriptLoader,domScriptPreloader}
});
