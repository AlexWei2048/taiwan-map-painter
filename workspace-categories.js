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
 const busyRequests=new Map();
 // Store only validated query selections, never prediction data or open dialog state.
 const remembered={history:null,analysis:null};
 function currentRoute(){
  const view=window.History2022View;
  if(!view?.active())return null;
  const route=view.routeSelection();
  if(!view.routeReady(route)||$c('historyOffice').value!==route.office||Number($c('historyYear').value)!==route.year)return null;
  const {area,detailCounty,identity,contest,...query}=route;
  return {...query,mode:'history',analysis:query.view==='trends'?(window.HistoryObservation?.tab()||'trends'):undefined};
 }
 function remember(){
  if(group==='future'||transitioning)return;
  const route=currentRoute();
  if(route)remembered[group]=route;
 }
 const baseKeys=['office','year','county','level','metric','electorate','focus','candidateScope','candidate','party'];
 function sameBase(a,b){return !!a&&!!b&&baseKeys.every(k=>String(a[k]??'')===String(b[k]??''))}
 function forGroup(route,target){return {...route,view:target==='analysis'?'trends':route.view==='trends'?'map':route.view||'map',analysis:target==='analysis'?(route.analysis||'trends'):undefined}}
 function notify(){window.dispatchEvent(new Event('site-route-change'))}

 function select(next){
  group=next;
  for(const [key,tab] of Object.entries(tabs))if(tab){tab.classList.toggle('active',key===group);tab.setAttribute('aria-selected',String(key===group));tab.tabIndex=key===group?0:-1}
  futureModes.hidden=group!=='future';
  document.body.classList.toggle('analysis-mode',group==='analysis');
  if($c('analysisViews'))$c('analysisViews').hidden=group!=='analysis';
  if($c('analysisResultSection'))$c('analysisResultSection').hidden=group!=='analysis';
  if($c('historyControlTitle'))$c('historyControlTitle').textContent=group==='analysis'?'观测范围':'历史选举数据';
  if($c('mobileMapJump'))$c('mobileMapJump').textContent=group==='analysis'?'查看分析':'查看地图';
  if($c('mobileResultsJump')){$c('mobileResultsJump').hidden=group==='analysis';$c('mobileResultsJump').textContent=group==='history'?'结果列表':'填写／填色'}
  const metricLabel=document.querySelector('label[for="historyMetric"]');if(metricLabel)metricLabel.textContent=group==='analysis'?'统计指标':'地图显示内容';
  const countyLabel=document.querySelector('label[for="historyCounty"]');if(countyLabel)countyLabel.textContent=group==='analysis'?'统计范围':'地图范围';
  const scaleLabel=document.querySelector('label[for="historyScale"]');if(scaleLabel)scaleLabel.textContent=group==='analysis'?'统计层级':'地图层级';
 }
 function selectFuture(){navigation++;transitioning=0;select('future')}
 future.addEventListener('click',()=>{
  remember();
  const wasHistory=window.History2022View?.active();
  selectFuture();
  // History already keeps a complete copy of the editable canvas state.
  // Restore it directly, without forcing prediction mode or creating undo entries.
  if(wasHistory){window.HistoryWorkspace?.deactivate?.();notify()}
 });
 // Direct prediction/free buttons also need to capture the departing query before
 // the history module's capture-phase deactivation restores the canvas.
 for(const id of ['workspacePrediction','workspaceFree'])$c(id).addEventListener('click',remember,{capture:true});
 async function openHistory(route=null,isCurrent=()=>true,target=null){
  remember();
  const request=++navigation,desired=target||(route?.view==='trends'?'analysis':'history'),tab=tabs[desired]||history;
  transitioning=request;busyRequests.set(tab,request);tab.setAttribute('aria-busy','true');
  try{
   const view=await window.HistoryLoader.load();
   if(request!==navigation||!isCurrent())return false;
   const prior=currentRoute();
   const destination=route||remembered[desired]||(prior?forGroup(prior,desired):null);
   select(desired);
   if(destination&&(route||!sameBase(prior,destination))){
    await view.restoreRoute(destination,()=>request===navigation&&isCurrent());
    if(request!==navigation||!isCurrent()||!view.routeReady(destination))return false;
   }else{
    if(!view.active())view.activate();
    window.HistoryWorkspace?.restoreRouteView?.(destination||{view:desired==='analysis'?'trends':'map'});
    if(destination?.view==='trends'&&destination.years!==undefined)window.HistoryTrendsUI?.restoreRouteYears?.(destination.years);
   }
   if(request!==navigation||!isCurrent())return false;
   if(desired==='analysis'&&window.HistoryObservation?.tab()!==(destination?.analysis||'trends'))window.HistoryObservation?.choose(destination?.analysis||'trends',false);
   notify();
   return true;
  }catch(error){if(request===navigation)toast(error.message||'历史资料载入失败，请稍后重试')}
  finally{if(transitioning===request){transitioning=0;remember()}if(busyRequests.get(tab)===request){busyRequests.delete(tab);tab.removeAttribute('aria-busy')}}
 }
 window.SiteWorkspaceCategories={openHistory,group:()=>group};
 $c('historyResetFilters')?.addEventListener('click',async()=>{
  const route=currentRoute();if(!route||transitioning)return;
  const target={mode:'history',office:route.office,year:route.year,yearLabel:route.yearLabel,county:'',metric:'party',view:route.view,analysis:route.analysis};
  if(route.office==='legislative')target.electorate='all';
  else if(route.office==='council')target.electorate='all';
  const button=$c('historyResetFilters');button.disabled=true;
  try{if(await openHistory(target,()=>true,group))toast('已重置地区与指标，保留选举类别和年份')}
  finally{button.disabled=false}
 });
 $c('historyOpenTrends')?.addEventListener('click',()=>{
  const route=currentRoute();if(!route||transitioning)return;
  openHistory({...route,view:'trends',analysis:'trends',years:undefined},()=>true,'analysis');
 });
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
