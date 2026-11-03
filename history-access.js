'use strict';
/* Temporary entry gate for the static site; this is not server-side authorization. */
(()=>{
 const digest='b5c0ff4c4bd3105bea560c9b8f548699168ca271a3dc9cd227715ca6ba644329',key='taiwan-history-owner-access-v1';
 let allowed=false;
 function notice(){
  let dialog=document.getElementById('historyDevelopmentNotice');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='historyDevelopmentNotice';dialog.className='history-development-notice';dialog.innerHTML='<h2>开发中，敬请期待</h2><p>历史数据功能正在完善，暂未开放。</p><form method="dialog"><button class="button primary">知道了</button></form>';document.body.append(dialog)}
  if(!dialog.open)dialog.showModal();
 }
 const ready=(async()=>{
  try{
   const params=new URLSearchParams(location.hash.slice(1)),incoming=params.get('history-access');
   if(incoming){params.delete('history-access');history.replaceState(null,'',location.pathname+location.search+(params.size?'#'+params:''))}
   const token=incoming||localStorage.getItem(key);if(!token)return false;
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
   allowed=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')===digest;
   if(allowed)localStorage.setItem(key,token);else localStorage.removeItem(key);
  }catch{}return allowed;
 })();
 window.HistoryAccess={ready,canAccess:()=>allowed,notice};
 document.addEventListener('click',event=>{
  const target=event.target.closest('#categoryHistory,#workspaceHistory');if(!target||allowed)return;
  event.preventDefault();event.stopImmediatePropagation();ready.then(ok=>ok?target.click():notice());
 },true);
})();
