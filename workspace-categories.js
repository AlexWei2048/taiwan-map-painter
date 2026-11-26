'use strict';
(()=>{
 const $c=id=>document.getElementById(id);
 const future=$c('categoryFuture'),history=$c('categoryHistory'),futureModes=$c('futureModes');
 if(!future||!history||!futureModes)return;
 function select(group){
  const isHistory=group==='history';
  future.classList.toggle('active',!isHistory);history.classList.toggle('active',isHistory);
  future.setAttribute('aria-selected',String(!isHistory));history.setAttribute('aria-selected',String(isHistory));
  futureModes.hidden=isHistory;
 }
 let navigation=0,loadingRequest=0;
 const historyLabel=history.textContent;
 function selectFuture(){navigation++;select('future')}
 future.addEventListener('click',()=>$c('workspacePrediction').click());
 async function openHistory(route=null,isCurrent=()=>true){
  const request=++navigation;
  loadingRequest=request;
  history.setAttribute('aria-busy','true');history.textContent='加载档案…';
  try{
   const view=await window.HistoryLoader.load();
   if(request!==navigation||!isCurrent())return false;
   select('history');
   if(route){await view.restoreRoute(route,()=>request===navigation&&isCurrent());return request===navigation&&isCurrent()&&view.routeReady(route)}
   view.activate();return true;
  }catch(error){if(request===navigation)toast(error.message||'选举档案载入失败，请稍后重试')}
  finally{if(request===loadingRequest){history.removeAttribute('aria-busy');history.textContent=historyLabel}}
 }
 window.SiteWorkspaceCategories={openHistory};
 history.addEventListener('click',()=>openHistory());
 $c('workspacePrediction').addEventListener('click',selectFuture);
 $c('workspaceFree').addEventListener('click',selectFuture);
 select(document.body.classList.contains('history-mode')?'history':'future');
})();
