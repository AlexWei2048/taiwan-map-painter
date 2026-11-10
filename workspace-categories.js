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
 future.addEventListener('click',()=>{select('future');$c('workspacePrediction').click()});
 history.addEventListener('click',()=>{if(!window.HistoryAccess?.canAccess()){window.HistoryAccess?.notice();return}select('history');window.History2022View?.activate?.()});
 $c('workspacePrediction').addEventListener('click',()=>select('future'));
 $c('workspaceFree').addEventListener('click',()=>select('future'));
 select(document.body.classList.contains('history-mode')?'history':'future');
})();