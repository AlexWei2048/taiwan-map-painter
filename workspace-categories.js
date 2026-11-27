'use strict';
(()=>{
 const $c=id=>document.getElementById(id);
 const future=$c('categoryFuture'),history=$c('categoryHistory'),analysis=$c('categoryAnalysis'),futureModes=$c('futureModes');
 if(!future||!history||!futureModes)return;
 const tabs={future,history,analysis};
 const tabList=Object.values(tabs).filter(Boolean);
 // Arrow keys move focus; Enter/Space activate the focused workspace.
 tabList.forEach((tab,i)=>tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(i+1)%tabList.length;else if(event.key==='ArrowLeft')next=(i+tabList.length-1)%tabList.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabList.length-1;else return;event.preventDefault();tabList[next].focus()}));
 let group='future',navigation=0,transitioning=0;
 function select(next){
  group=next;
  for(const [key,tab] of Object.entries(tabs))if(tab){tab.classList.toggle('active',key===group);tab.setAttribute('aria-selected',String(key===group));tab.tabIndex=key===group?0:-1}
  futureModes.hidden=group!=='future';
  document.body.classList.toggle('analysis-mode',group==='analysis');
  if($c('analysisViews'))$c('analysisViews').hidden=group!=='analysis';
  if($c('analysisResultSection'))$c('analysisResultSection').hidden=group!=='analysis';
  if($c('historyControlTitle'))$c('historyControlTitle').textContent=group==='analysis'?'观测范围':'历史选举数据';
  if($c('mobileMapJump'))$c('mobileMapJump').textContent=group==='analysis'?'查看分析':'查看地图';
  const metricLabel=document.querySelector('label[for="historyMetric"]');if(metricLabel)metricLabel.textContent=group==='analysis'?'统计指标':'地图显示内容';
  const countyLabel=document.querySelector('label[for="historyCounty"]');if(countyLabel)countyLabel.textContent=group==='analysis'?'统计范围':'地图范围';
  const scaleLabel=document.querySelector('label[for="historyScale"]');if(scaleLabel)scaleLabel.textContent=group==='analysis'?'统计层级':'地图层级';
 }
 function selectFuture(){navigation++;transitioning=0;select('future')}
 future.addEventListener('click',()=>$c('workspacePrediction').click());
 async function openHistory(route=null,isCurrent=()=>true,target=null){
  const request=++navigation,desired=target||(route?.view==='trends'?'analysis':'history'),tab=tabs[desired]||history;
  transitioning=request;tab.setAttribute('aria-busy','true');
  try{
   const view=await window.HistoryLoader.load();
   if(request!==navigation||!isCurrent())return false;
   select(desired);
   if(route){await view.restoreRoute(route,()=>request===navigation&&isCurrent());if(request===navigation&&isCurrent()&&route.view==='trends')window.HistoryObservation?.choose(route.analysis||'trends',false);return request===navigation&&isCurrent()&&view.routeReady(route)}
   view.activate();
   window.HistoryWorkspace?.restoreRouteView?.({view:desired==='analysis'?'trends':'map'});
   return true;
  }catch(error){if(request===navigation)toast(error.message||'历史资料载入失败，请稍后重试')}
  finally{if(transitioning===request)transitioning=0;tab.removeAttribute('aria-busy')}
 }
 window.SiteWorkspaceCategories={openHistory,group:()=>group};
 history.addEventListener('click',()=>openHistory());
 analysis?.addEventListener('click',()=>openHistory(null,()=>true,'analysis'));
 window.addEventListener('historyselectionchange',event=>{
  if(transitioning||group==='future'||!window.History2022View?.active())return;
  if(event.detail?.view==='trends')select('analysis');
  else if(group==='analysis')select('history');
 });
 $c('workspacePrediction').addEventListener('click',selectFuture);
 $c('workspaceFree').addEventListener('click',selectFuture);
 select(document.body.classList.contains('history-mode')?'history':'future');
})();
