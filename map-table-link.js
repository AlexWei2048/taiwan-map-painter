'use strict';
(()=>{
 // Delegate once: result pages, map paths and district rows are replaced on
 // navigation. Only the visible map and current rendered table page participate.
 const selector='#regions path[data-map-link],#districtTableGroups tr[data-map-link],#historyResults tr[data-map-link]';
 let pointer=null,focus=null,marked=[];
 const target=e=>e?.closest?.(selector)||null;
 function draw(){
  for(const node of marked)node.classList.remove('map-linked-highlight');marked=[];
  const source=focus?.isConnected?focus:pointer?.isConnected?pointer:null;
  const key=source?.dataset.mapLink;if(!key)return;
  const exact='[data-map-link="'+CSS.escape(key)+'"]';
  const paths=[...document.querySelectorAll('#regions path'+exact)];
  if(!paths.length)return;
  marked=[...paths,...document.querySelectorAll('#districtTableGroups tr'+exact+',#historyResults tr'+exact)];
  for(const node of marked)node.classList.add('map-linked-highlight');
 }
 document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const node=target(e.target);if(node===pointer)return;pointer=node;draw()});
 document.addEventListener('pointerout',e=>{if(e.pointerType==='touch')return;const node=target(e.relatedTarget);if(pointer===node)return;pointer=node;draw()});
 document.addEventListener('focusin',e=>{focus=target(e.target);draw()});
 document.addEventListener('focusout',e=>{focus=target(e.relatedTarget);draw()});
 // Keyboard users can focus a group of result rows without activating a map
 // edit. Existing buttons and native map keyboard controls remain unchanged.
 function prepareRows(){
  const keys=new Set([...document.querySelectorAll('#regions path[data-map-link]')].map(p=>p.dataset.mapLink));
  for(const root of [$('historyResults'),$('districtTableGroups')]){
   if(!root)continue;
   const seen=new Set();
   for(const row of root.querySelectorAll('tr[data-map-link]')){
    const key=row.dataset.mapLink,first=keys.has(key)&&!seen.has(key);
    if(first){row.tabIndex=0;seen.add(key)}else row.removeAttribute('tabindex');
   }
  }
  draw();
 }
 let queued=false;
 function queue(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;prepareRows()})}
 for(const id of ['regions','historyResults','districtTableGroups']){
  const root=$(id);if(root)new MutationObserver(queue).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-map-link']});
 }
 prepareRows();
})();
