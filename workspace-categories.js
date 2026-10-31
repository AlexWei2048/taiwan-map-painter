'use strict';
(()=>{
 const $c=id=>document.getElementById(id);
 const future=$c('categoryFuture'),history=$c('categoryHistory'),futureModes=$c('futureModes'),historyModes=$c('historyModes');
 if(!future||!history||!futureModes||!historyModes)return;
 function select(group){
  const isHistory=group==='history';
  future.classList.toggle('active',!isHistory);history.classList.toggle('active',isHistory);
  future.setAttribute('aria-selected',String(!isHistory));history.setAttribute('aria-selected',String(isHistory));
  futureModes.hidden=isHistory;historyModes.hidden=!isHistory;
 }
 future.addEventListener('click',()=>{select('future');$c('workspacePrediction').click()});
 history.addEventListener('click',()=>{select('history');$c('workspaceHistory').click()});
 $c('workspacePrediction').addEventListener('click',()=>select('future'));
 $c('workspaceFree').addEventListener('click',()=>select('future'));
 $c('workspaceHistory').addEventListener('click',()=>select('history'));
 select(document.body.classList.contains('history-mode')?'history':'future');
})();