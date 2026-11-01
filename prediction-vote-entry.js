'use strict';
// Two-step forecast UI: one candidate scope per vote map and one exclusive input metric.
(function(){
 const byId=id=>document.getElementById(id);
 const numeric=()=>typeof predictionUsesVoteDisplay==='function'&&predictionUsesVoteDisplay();
 const valid=value=>value!==null&&value!==undefined&&String(value).trim()!=='';
 const metric=()=>state.predictionVoteMetric==='votes'?'votes':'share';
 const selectedOnly=()=>numeric()&&state.predictionDisplay==='candidateVote'&&!!state.localDisplayCandidate;
 function previousMetric(record){
  const rows=selectedOnly()?[record?.estimates?.[state.localDisplayCandidate]].filter(Boolean):Object.values(record?.estimates||{});
  const hasVotes=rows.some(row=>valid(row?.votes));
  const hasShare=rows.some(row=>valid(row?.share));
  if(hasVotes&&!hasShare)return'votes';
  if(hasShare&&!hasVotes)return'share';
  return metric();
 }
 function keepOnlyMetric(draft){
  if(!numeric()||!draft?.estimates)return;
  const remove=metric()==='votes'?'share':'votes';
  for(const [id,row]of Object.entries(draft.estimates)){
   if(!row||selectedOnly()&&id!==state.localDisplayCandidate)continue;
   row[remove]=null;
   if(!valid(row.votes)&&!valid(row.share))delete draft.estimates[id];
  }
  if(Object.hasOwn(draft,'totalVotes')&&metric()==='share'&&!selectedOnly())draft.totalVotes=null;
 }
 function decorate(dialogId,selectId,boxId,tableSelector,totalSelector){
  const dialog=byId(dialogId),box=byId(boxId),selector=byId(selectId);
  if(!dialog||!box||!selector)return;
  const active=numeric(),kind=metric();
  box.hidden=!active;
  selector.value=kind;
  dialog.classList.toggle('metric-votes',active&&kind==='votes');
  dialog.classList.toggle('metric-share',active&&kind==='share');
  const table=dialog.querySelector(tableSelector);
  if(table){
   const th=[...table.querySelectorAll('thead th')];
   if(th[3])th[3].classList.add('vote-metric-column-votes');
   if(th[4])th[4].classList.add('vote-metric-column-share');
   const district=dialogId==='predictionDialog'?directoryDistrictById.get(predictionEditId):localEditDistrict;
   const candidates=district?directoryCandidates(district):[];
   table.querySelectorAll('tbody tr').forEach((tr,index)=>{
    const show=!active||!selectedOnly()||candidates[index]?.id===state.localDisplayCandidate;
    tr.hidden=!show;
    const cells=tr.children;
    if(cells[3]){
     cells[3].classList.add('vote-metric-column-votes');
     const control=cells[3].querySelector('input');
     if(control)control.disabled=!show||active&&kind!=='votes';
    }
    if(cells[4]){
     cells[4].classList.add('vote-metric-column-share');
     const control=cells[4].querySelector('input');
     if(control)control.disabled=!show||active&&kind!=='share';
    }
   });
  }
  if(totalSelector){
   const el=dialog.querySelector(totalSelector);
   if(el)el.hidden=active&&kind!=='votes';
  }
 }
 function decorateDistrict(){decorate('predictionDialog','predictionVoteMetric','predictionVoteMetricBox','.prediction-table','#predictionAutoTotal')}
 function decorateTown(){decorate('localDialog','localVoteMetric','localVoteMetricBox','.local-table','.local-total');const status=byId('localTotalStatus');if(status)status.hidden=numeric()&&metric()==='share'}
 const drawDistrict=renderPredictionRows;
 renderPredictionRows=function(){drawDistrict();decorateDistrict()};
 const drawTown=renderLocalRows;
 renderLocalRows=function(){drawTown();decorateTown()};
 const openDistrict=openPredictionDistrict;
 openPredictionDistrict=function(d){
  openDistrict(d);
  if(!d||!byId('predictionDialog').open)return;
  if(numeric()){
   state.predictionVoteMetric=previousMetric(predictionDraft);
   keepOnlyMetric(predictionDraft);
   renderPredictionRows();
  }else decorateDistrict();
 };
 const openTown=openLocalForecast;
 openLocalForecast=function(f){
  openTown(f);
  if(!f||!byId('localDialog').open)return;
  if(numeric()){
   state.predictionVoteMetric=previousMetric(localDraft);
   keepOnlyMetric(localDraft);
   renderLocalRows();
  }else decorateTown();
 };
 byId('predictionVoteMetric').onchange=()=>{
  state.predictionVoteMetric=byId('predictionVoteMetric').value;
  keepOnlyMetric(predictionDraft);
  renderPredictionRows();persist();
 };
 byId('localVoteMetric').onchange=()=>{
  state.predictionVoteMetric=byId('localVoteMetric').value;
  keepOnlyMetric(localDraft);
  renderLocalRows();persist();
 };
 // The hidden legacy edit toggles may still be used by older flows; keep views in sync.
 const formerDistrictToggle=byId('showPredictionEstimates').onchange;
 byId('showPredictionEstimates').onchange=function(){formerDistrictToggle?.call(this);decorateDistrict()};
 const formerTownToggle=byId('localUseVoteData').onchange;
 byId('localUseVoteData').onchange=function(){formerTownToggle?.call(this);decorateTown()};
})();
