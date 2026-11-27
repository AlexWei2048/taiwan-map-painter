/* Verified 2026 entry and plan file picker. */
(()=>{'use strict';const $=id=>document.getElementById(id);
 $('loadProject').addEventListener('click',()=>{if($('planDialog').open)$('planDialog').close()});
 const dialog=$('siteResultsStatusDialog'),message=$('siteResultsStatus'),retry=$('siteResultsRetry');let pending=false;
 async function check(){if(pending)return;pending=true;retry.disabled=true;message.textContent='正在核实2026年结果发布状态…';if($('siteSearchDialog').open)$('siteSearchDialog').close();if(!dialog.open)dialog.showModal();try{const view=await window.HistoryLoader.load();const available=await view.check2026Availability();if(!dialog.open)return;if(available){dialog.close();const hash='#/history/mayor/2026?view=map';if(location.hash===hash)await window.SiteWorkspaceCategories.openHistory({mode:'history',office:'mayor',year:2026,view:'map'});else location.hash=hash;return}message.textContent=view.publicationCheckStatus()==='awaiting'?'2026年正式选举结果尚未发布。可重新检查，或明确选择查看2022年结果。':'暂时无法核实2026年结果发布状态，请重试。'}catch(e){message.textContent='资料暂未载入，请重新检查。'}finally{pending=false;retry.disabled=false}}
 for(const id of ['latestElectionLink','searchLatestElection'])$(id)?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();check()},{capture:true});
 retry.onclick=check;$('siteResultsPast').onclick=()=>{dialog.close();const hash='#/history/mayor/2022?view=map';if(location.hash===hash)window.SiteWorkspaceCategories?.openHistory({mode:'history',office:'mayor',year:2022,view:'map'});else location.hash=hash};
})();
