'use strict';
(function(root,factory){
 const api=factory();
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLoader=api.createHistoryLoader({
  loadStyle:api.domStyleLoader(document),
  loadScript:api.domScriptLoader(document),
  getView:()=>root.History2022View
 });
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const HISTORY_STYLES=['history-legislative.css'];
 const HISTORY_SCRIPTS=[
  'assets/party-logos-archive.js','history-core.js','history-presidential-turnout.js',
  'history-presidential.js','assets/history-legislative-candidates.js','history-legislative.js','history-legislative-party.js',
  'history-legislative-turnout.js','history-legislative-data.js','history-local.js',
  'history-workspace.js','history-2022.js','history-trends.js','history-trends-ui.js'
 ];
 const tagged=path=>path+(path.includes('?')?'&':'?')+'v=20261126-hualien-winners-v76';
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
 function createHistoryLoader({loadStyle,loadScript,getView}){
  let pending=null;
  function load(){
   if(!pending)pending=(async()=>{
    await Promise.all(HISTORY_STYLES.map(loadStyle));
    for(const src of HISTORY_SCRIPTS)await loadScript(src);
    if(!getView()?.activate)throw Error('历史数据功能未能初始化');
    return getView()
   })().catch(error=>{pending=null;throw error});
   return pending
  }
  async function activate(){const view=await load();view.activate()}
  return{load,activate}
 }
 return{HISTORY_STYLES,HISTORY_SCRIPTS,createHistoryLoader,domStyleLoader,domScriptLoader}
});
