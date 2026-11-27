'use strict';
(()=>{
 const selector='#regions path[data-map-link],#districtTableGroups tr[data-map-link],#historyResults tr[data-map-link],#legend [data-party-link]';
 let pointer=null,focus=null,marked=[],partyMarked=[];
 const target=e=>e?.closest?.(selector)||null;
 const keys=node=>{try{return JSON.parse(node?.dataset.partyKeys||'[]')}catch{return []}};
 const matches=(nodes,key)=>nodes.filter(node=>keys(node).includes(key));
 function draw(){
  for(const node of marked)node.classList.remove('map-linked-highlight');marked=[];
  for(const node of partyMarked)node.classList.remove('party-linked-highlight');partyMarked=[];
  const source=focus?.isConnected?focus:pointer?.isConnected?pointer:null;if(!source)return;
  const party=source.dataset.partyLink,key=source.dataset.mapLink;
  if(party){
   const paths=[...document.querySelectorAll('#regions path[data-party-keys]')],rows=[...document.querySelectorAll('#historyResults tr[data-party-keys]')];
   marked=[...matches(paths,party),...matches(rows,party)];
   partyMarked=[...document.querySelectorAll('#legend [data-party-link]')].filter(node=>node.dataset.partyLink===party);
  }else if(key){
   const exact='[data-map-link="'+CSS.escape(key)+'"]',paths=[...document.querySelectorAll('#regions path'+exact)];
   if(!paths.length)return;
   marked=[...paths,...document.querySelectorAll('#districtTableGroups tr'+exact+',#historyResults tr'+exact)];
   const parties=new Set(keys(source).length?keys(source):paths.flatMap(keys));
   partyMarked=[...document.querySelectorAll('#legend [data-party-link]')].filter(node=>parties.has(node.dataset.partyLink));
  }
  for(const node of marked)node.classList.add('map-linked-highlight');
  for(const node of partyMarked)node.classList.add('party-linked-highlight');
 }
 document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const node=target(e.target);if(node===pointer)return;pointer=node;draw()});
 document.addEventListener('pointerout',e=>{if(e.pointerType==='touch')return;const node=target(e.relatedTarget);if(pointer===node)return;pointer=node;draw()});
 document.addEventListener('focusin',e=>{focus=target(e.target);pointer=null;draw()});
 document.addEventListener('focusout',e=>{focus=target(e.relatedTarget);pointer=null;draw()});
 function prepareRows(){
  const visibleKeys=new Set([...document.querySelectorAll('#regions path[data-map-link]')].map(p=>p.dataset.mapLink));
  for(const root of [$('historyResults'),$('districtTableGroups')]){
   if(!root)continue;
   const seen=new Set();
   for(const row of root.querySelectorAll('tr[data-map-link]')){
    const key=row.dataset.mapLink,first=visibleKeys.has(key)&&!seen.has(key);
    if(first){row.tabIndex=0;seen.add(key)}else row.removeAttribute('tabindex');
   }
  }
  draw();
 }
 let queued=false;
 function queue(){if(queued)return;queued=true;queueMicrotask(()=>{queued=false;prepareRows()})}
 for(const id of ['regions','historyResults','districtTableGroups','legend']){
  const root=$(id);if(root)new MutationObserver(queue).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-map-link','data-party-keys','data-party-link']});
 }
 prepareRows();
})();
