/* Movable, four-corner-resizable 2026 candidate prediction dialogs. */
(function(){
 'use strict';
 const PADDING=12;
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const viewport=()=>({w:Math.max(280,window.innerWidth),h:Math.max(240,window.innerHeight)});
 function init(id,idealWidth){
  const dialog=document.getElementById(id);
  if(!dialog||dialog.classList.contains('floating-prediction-dialog'))return;
  dialog.classList.add('floating-prediction-dialog');
  const scroll=document.createElement('div');
  scroll.className='floating-dialog-scroll';
  while(dialog.firstChild)scroll.append(dialog.firstChild);
  const bar=document.createElement('div');
  bar.className='floating-dialog-drag';
  bar.tabIndex=0;
  bar.setAttribute('role','button');
  bar.setAttribute('aria-label','拖动移动预测窗口，方向键也可移动');
  bar.innerHTML='<span class="floating-dialog-grip" aria-hidden="true">⠿</span><span>按住此处移动窗口</span>';
  // The close button belongs in the fixed header, never in the scrolling form.
  // Moving the existing DOM node retains its application close handler.
  const close=scroll.querySelector(':scope > .dialog-close');
  if(close)bar.append(close);
  dialog.append(bar,scroll);
  const handles={};
  for(const corner of ['nw','ne','sw','se']){
   const el=document.createElement('span');
   el.className='floating-dialog-corner';
   el.dataset.dialogResize=corner;
   el.setAttribute('role','button');
   el.tabIndex=0;
   const names={nw:'左上角',ne:'右上角',sw:'左下角',se:'右下角'};
   el.setAttribute('aria-label',names[corner]+'：拖动调整窗口大小，方向键微调');
   dialog.append(el);
   handles[corner]=el;
  }
  let frame=null;
  let pending=null;
  function minSize(){
   const v=viewport();
   return{w:Math.min(420,v.w-2*PADDING),h:Math.min(280,v.h-2*PADDING)};
  }
  function constrain(next){
   const v=viewport(),min=minSize(),maxW=v.w-2*PADDING,maxH=v.h-2*PADDING;
   const w=clamp(next.w,min.w,maxW),h=clamp(next.h,min.h,maxH);
   return{x:clamp(next.x,PADDING,v.w-PADDING-w),y:clamp(next.y,PADDING,v.h-PADDING-h),w,h};
  }
  function paint(next){
   frame=constrain(next);
   dialog.style.left=frame.x+'px';
   dialog.style.top=frame.y+'px';
   dialog.style.width=frame.w+'px';
   dialog.style.height=frame.h+'px';
  }
  function initial(){
   const v=viewport(),w=Math.min(idealWidth,v.w-2*PADDING),h=Math.min(740,v.h-2*PADDING);
   return{x:(v.w-w)/2,y:(v.h-h)/2,w,h};
  }
  paint(initial());
  // Each corner controls its two adjacent edges. The opposite corner stays put.
  function resized(start,corner,dx,dy){
   const min=minSize(),v=viewport();
   let x=start.x,y=start.y,right=start.x+start.w,bottom=start.y+start.h;
   if(corner.includes('w'))x=clamp(start.x+dx,PADDING,right-min.w);
   if(corner.includes('e'))right=clamp(right+dx,x+min.w,v.w-PADDING);
   if(corner.includes('n'))y=clamp(start.y+dy,PADDING,bottom-min.h);
   if(corner.includes('s'))bottom=clamp(bottom+dy,y+min.h,v.h-PADDING);
   return{x,y,w:right-x,h:bottom-y};
  }
  function stop(){
   if(!pending)return;
   const {target,pointerId,move,end}=pending;
   target.removeEventListener('pointermove',move);
   target.removeEventListener('pointerup',end);
   target.removeEventListener('pointercancel',end);
   target.removeEventListener('lostpointercapture',end);
   if(target.hasPointerCapture(pointerId))target.releasePointerCapture(pointerId);
   pending=null;
  }
  function pointerStart(event,mode,corner){
   if(pending||(event.pointerType==='mouse'&&event.button!==0))return;
   if(!dialog.open)return;
   // Clicking the close control must not start a drag or cancel its click.
   if(event.target.closest('button, a, input, select, textarea'))return;
   event.preventDefault();
   const target=event.currentTarget,pointerId=event.pointerId;
   const origin={...frame},x=event.clientX,y=event.clientY;
   const move=e=>{
    if(e.pointerId!==pointerId)return;
    const dx=e.clientX-x,dy=e.clientY-y;
    if(mode==='drag')paint({...origin,x:origin.x+dx,y:origin.y+dy});
    else paint(resized(origin,corner,dx,dy));
   };
   const end=e=>{if(e.pointerId===pointerId)stop()};
   pending={target,pointerId,move,end};
   target.addEventListener('pointermove',move);
   target.addEventListener('pointerup',end);
   target.addEventListener('pointercancel',end);
   target.addEventListener('lostpointercapture',end);
   target.setPointerCapture(pointerId);
  }
  bar.addEventListener('pointerdown',e=>pointerStart(e,'drag'));
  for(const [corner,handle]of Object.entries(handles)){
   handle.addEventListener('pointerdown',e=>pointerStart(e,'resize',corner));
   handle.addEventListener('keydown',e=>{
    const keys={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if(!keys[e.key])return;
    e.preventDefault();
    const step=e.shiftKey?30:10,[dx,dy]=keys[e.key];
    paint(resized(frame,corner,dx*step,dy*step));
   });
  }
  bar.addEventListener('keydown',e=>{
   if(e.target!==bar)return;
   const keys={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
   if(!keys[e.key])return;
   e.preventDefault();
   const step=e.shiftKey?30:10,[dx,dy]=keys[e.key];
   paint({...frame,x:frame.x+dx*step,y:frame.y+dy*step});
  });
  bar.addEventListener('dblclick',e=>{if(!e.target.closest('button'))paint(initial())});
  window.addEventListener('resize',()=>paint(frame||initial()));
  dialog.addEventListener('close',stop);
 }
 init('predictionDialog',920);
 init('localDialog',850);
})();
