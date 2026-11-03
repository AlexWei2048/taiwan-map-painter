'use strict';
// One fixed-size symbol per statutory seat. Geography stays neutral.
function councilSeatMode(){if(typeof History2022View!=='undefined'&&History2022View.seatMode())return true;return state.workspaceMode==='prediction'&&state.fillMode==='prediction'&&state.predictionOffice==='council'&&state.level==='council'&&!!state.county}
function councilSeatDistrictFor(f){return typeof History2022View!=='undefined'&&History2022View.seatMode()?History2022View.districtFor(f):predictionDistrictFor(f)}
function councilSeatRows(d){
 if(typeof History2022View!=='undefined'&&History2022View.seatMode())return History2022View.seatRows(d);
 const cs=directoryCandidates(d),record=state.predictions[d.id],picked=new Set(record?.winners||[]);
 const winners=cs.filter(c=>picked.has(c.id)).sort((a,b)=>{
  const pa=predictionParty(a.party),pb=predictionParty(b.party);
  return state.palette.findIndex(p=>p.id===pa.id)-state.palette.findIndex(p=>p.id===pb.id)||pa.id.localeCompare(pb.id)||cs.indexOf(a)-cs.indexOf(b);
 });
 return Array.from({length:Number(d.seats)||0},(_,i)=>winners[i]||null);
}
function councilCountyPresentation(){return councilSeatMode()||state.workspaceMode==='free'&&state.level==='council'&&!!state.county}
const baseCouncilScene=sceneSpec;
sceneSpec=function(){return councilCountyPresentation()?{width:1600,height:1450+furnitureFooterHeight(),pad:80,font:26}:baseCouncilScene()};
const baseCouncilPanels=identityPanelLayouts;
identityPanelLayouts=function(){
 if(!councilCountyPresentation())return baseCouncilPanels();
 const ids=panelIdentities(),spec=sceneSpec(),a=contentArea(spec),gap=28;
 const split=ids.length===3&&ids[0]==='regional';
 return ids.map((identity,i)=>{
  let area;
  if(split){const cut=a.left+(a.right-a.left)*.65;area=i===0?{left:a.left,right:cut-gap,top:a.top+52,bottom:a.bottom}:{left:cut,right:a.right,top:a.top+52+(i-1)*(a.bottom-a.top+gap)/2,bottom:a.top+(i)*(a.bottom-a.top+gap)/2-gap/2}}
  else{const w=(a.right-a.left-gap*(ids.length-1))/ids.length;area={left:a.left+i*(w+gap),right:a.left+i*(w+gap)+w,top:a.top+52,bottom:a.bottom}}
  const items=currentItems().filter(f=>featureElectorate(f)===identity),geo=data.counties.filter(f=>f.name===state.county),b=bounds(geo),pad=35;
  const scale=Math.min((area.right-area.left-pad*2)/(b[2]-b[0]),(area.bottom-area.top-pad*2)/(b[3]-b[1]));
  const panel={identity,label:electorateName(identity),items,area,t:{scale,tx:(area.left+area.right)/2-(b[0]+b[2])/2*scale,ty:(area.top+area.bottom)/2-(b[1]+b[3])/2*scale,labelLeft:area.left,labelRight:area.right,area}};
  return councilSeatMode()?prepareCouncilSeatPanel(panel):panel;
 });
};
function councilSeatPlacement(f,n,t,used,items){
 const a=t.area,anchor=mapLabelAnchor(f,t)||{x:f.center[0]*t.scale+t.tx,y:f.center[1]*t.scale+t.ty},size=32,pitch=39,pad=8;
 const shapes=Array.from({length:Math.min(n,8)},(_,i)=>{const cols=i+1,rows=Math.ceil(n/cols);return{cols,rows,w:cols*pitch-pitch+size+pad*2,h:rows*pitch-pitch+size+40}}).sort((a,b)=>Math.abs(a.w/a.h-1.3)-Math.abs(b.w/b.h-1.3));
 const candidates=[];
 for(let y=Math.max(a.top+35,f.box[1]*t.scale+t.ty);y<Math.min(a.bottom-20,f.box[3]*t.scale+t.ty);y+=18)
  for(let x=Math.max(a.left+15,f.box[0]*t.scale+t.tx);x<Math.min(a.right-15,f.box[2]*t.scale+t.tx);x+=18)candidates.push({x,y});
 candidates.unshift(anchor);candidates.sort((p,q)=>Math.hypot(p.x-anchor.x,p.y-anchor.y)-Math.hypot(q.x-anchor.x,q.y-anchor.y));
 const rect=(p,s)=>[p.x-s.w/2,p.y-s.h/2,p.x+s.w/2,p.y+s.h/2];
 const clear=r=>r[0]>=a.left+6&&r[2]<=a.right-6&&r[1]>=a.top+20&&r[3]<=a.bottom-6&&!used.some(u=>leaderOverlap(r,u));
 const inside=r=>[[r[0],r[1]],[r[2],r[1]],[r[0],r[3]],[r[2],r[3]]].every(([x,y])=>regionContains(f,x,y,t))&&!councilSeatBoundaryTouchesRect(f,[(r[0]-t.tx)/t.scale,(r[1]-t.ty)/t.scale,(r[2]-t.tx)/t.scale,(r[3]-t.ty)/t.scale]);
 for(const p of candidates)for(const s of shapes){const r=rect(p,s);if(clear(r)&&inside(r)){used.push(r);return{...p,...s,rect:r,anchor,size,pitch,outside:false}}}
 // External cards must clear the complete map, not only other districts' centres.
 const external=[];
 for(let y=a.top+70;y<a.bottom-45;y+=20)for(let x=a.left+35;x<a.right-35;x+=20)external.push({x,y});
 external.sort((p,q)=>Math.hypot(p.x-anchor.x,p.y-anchor.y)-Math.hypot(q.x-anchor.x,q.y-anchor.y));
 let best=null,bestScore=Infinity;
 for(const p of external)for(const s of shapes){
  const r=rect(p,s),distance=Math.hypot(Math.max(r[0]-anchor.x,0,anchor.x-r[2]),Math.max(r[1]-anchor.y,0,anchor.y-r[3]));
  // Prefer nearby frames, while avoiding long single-column seat strips.
  const score=distance+Math.hypot(p.x-anchor.x,p.y-anchor.y)*.25+Math.max(s.w/s.h,s.h/s.w)*32;
  if(score>=bestScore||!clear(r)||councilSeatRectTouchesLand(r,items,t))continue;
  bestScore=score;best={...p,...s,rect:r,anchor,size,pitch,outside:true};
 }
 if(best){used.push(best.rect);return best}
 return null;
}
const councilSeatRings=new WeakMap();
function councilSeatRectTouchesLand(rect,items,t){
 const r=[(rect[0]-t.tx)/t.scale,(rect[1]-t.ty)/t.scale,(rect[2]-t.tx)/t.scale,(rect[3]-t.ty)/t.scale];
 for(const f of items){
  if(!leaderOverlap(r,f.box))continue;
  if([[rect[0],rect[1]],[rect[2],rect[1]],[rect[0],rect[3]],[rect[2],rect[3]]].some(([x,y])=>regionContains(f,x,y,t)))return true;
  if(councilSeatBoundaryTouchesRect(f,r))return true;
 }
 return false;
}
function councilSeatBoundaryTouchesRect(f,r){
  let rings=councilSeatRings.get(f);
  if(!rings){rings=f.d.split(/M/i).filter(Boolean).map(part=>{const v=part.match(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi)||[];return Array.from({length:Math.floor(v.length/2)},(_,i)=>[Number(v[i*2]),Number(v[i*2+1])])});councilSeatRings.set(f,rings)}
  for(const ring of rings)for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];if(leaderIn(p[0],p[1],r)||leaderCross(p[0],p[1],q[0],q[1],r))return true}
 return false;
}
const councilSeatPanelCache=new Map();
function prepareCouncilSeatPanel(panel){
 const key=[state.county,panel.identity,panel.t.scale,panel.t.tx,panel.t.ty,panel.area.bottom,panel.items.map(f=>f.id+':'+councilSeatDistrictFor(f)?.seats).join(',')].join('/');
 if(councilSeatPanelCache.has(key))return councilSeatPanelCache.get(key);
 const initial={...panel.t},cx=(panel.area.left+panel.area.right)/2,cy=(panel.area.top+panel.area.bottom)/2;
 for(let attempt=0;attempt<10;attempt++){
  const factor=Math.pow(.88,attempt);panel.t={...initial,scale:initial.scale*factor,tx:cx+(initial.tx-cx)*factor,ty:cy+(initial.ty-cy)*factor};
  const placements=new Map(),used=[];
  for(const f of [...panel.items].sort((a,b)=>(a.box[2]-a.box[0])*(a.box[3]-a.box[1])-(b.box[2]-b.box[0])*(b.box[3]-b.box[1]))){
   const q=councilSeatPlacement(f,Number(councilSeatDistrictFor(f)?.seats)||1,panel.t,used,panel.items);if(!q)break;placements.set(f.id,q);
  }
  if(placements.size===panel.items.length){panel.seatPlacements=placements;if(councilSeatPanelCache.size>60)councilSeatPanelCache.clear();councilSeatPanelCache.set(key,panel);return panel}
 }
 throw Error('席次框布局空间不足，请缩小地图范围');
}

function councilSeatLeaderPoints(q,frames,existing=[]){
 const a=[q.anchor.x,q.anchor.y],r=q.rect,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 const ports=[[r[0],clamp(a[1],r[1]+12,r[3]-12)],[r[2],clamp(a[1],r[1]+12,r[3]-12)],[clamp(a[0],r[0]+12,r[2]-12),r[1]],[clamp(a[0],r[0]+12,r[2]-12),r[3]]];
 const candidates=[];
 for(const b of ports){
  candidates.push([a,[b[0],a[1]],b],[a,[a[0],b[1]],b]);
  for(const fraction of [.2,.5,.8]){const x=a[0]+(b[0]-a[0])*fraction,y=a[1]+(b[1]-a[1])*fraction;candidates.push([a,[x,a[1]],[x,b[1]],b],[a,[a[0],y],[b[0],y],b])}
 }
 let best=null,bestCost=Infinity;
 for(const points of candidates){
  const compact=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]),segments=mapLeaderSegments(compact);
  let cost=segments.reduce((sum,[[x,y],[xx,yy]])=>sum+Math.hypot(xx-x,yy-y),0)+compact.length*5;
  for(const segment of segments){const [[x,y],[xx,yy]]=segment;if(leaderCross(x,y,xx,yy,r))cost+=1e7;for(const frame of frames)if(leaderIn(x,y,frame)||leaderIn(xx,yy,frame)||leaderCross(x,y,xx,yy,frame))cost+=1e6;for(const prior of existing)if(mapLeaderSegmentConflict(segment,prior))cost+=10000}
  if(cost<bestCost){bestCost=cost;best=compact}
 }
 return best;
}
function drawCouncilSeats(group,interactive){
 group.replaceChildren();
 for(const panel of identityPanelLayouts()){
  const cached=panel.seatPlacements,routed=[];
  const layer=svgEl('g',{'data-council-seat-panel':panel.identity}),leaders=svgEl('g',{'data-seat-leaders':panel.identity,'pointer-events':'none'});layer.append(leaders);group.append(layer);
  // Place the most constrained districts first.
  for(const f of [...panel.items].sort((a,b)=>(a.box[2]-a.box[0])*(a.box[3]-a.box[1])-(b.box[2]-b.box[0])*(b.box[3]-b.box[1]))){
   const d=councilSeatDistrictFor(f);if(!d)continue;
   const seats=councilSeatRows(d),q=cached.get(f.id);
   const g=svgEl('g',{'data-seat-district':d.id,'data-seat-region':f.id,'data-seat-count':seats.length,'data-seat-placement':q.outside?'outside':'inside'});layer.append(g);
   if(q.outside){
    const points=councilSeatLeaderPoints(q,[...cached.values()].filter(other=>other!==q).map(other=>other.rect),routed),path=points.map((p,i)=>(i?'L':'M')+p[0]+','+p[1]).join('');routed.push(...mapLeaderSegments(points));
    leaders.append(svgEl('path',{d:path,fill:'none',style:'fill:none;stroke:#fff;stroke-width:2.1px;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:.94','vector-effect':'non-scaling-stroke','data-seat-leader-halo':d.id}));
    leaders.append(svgEl('path',{d:path,fill:'none',style:'fill:none;stroke:#537d6b;stroke-width:0.9px;stroke-linecap:round;stroke-linejoin:round;stroke-opacity:.78','vector-effect':'non-scaling-stroke','data-seat-leader':d.id}));
    leaders.append(svgEl('circle',{cx:q.anchor.x,cy:q.anchor.y,r:4,fill:'#537d6b',style:'stroke:#fff;stroke-width:1.4px','data-seat-anchor':d.id}));
   }
   g.append(svgEl('rect',{x:q.rect[0],y:q.rect[1],width:q.w,height:q.h,rx:9,fill:q.outside?'#ffffffed':'#ffffff55',stroke:q.outside?'#dce5df':'none','data-seat-frame':d.id}));
   const name=svgEl('text',{x:q.x,y:q.rect[1]+22,'text-anchor':'middle','font-size':24,fill:'#294a3a','paint-order':'stroke',stroke:'#fff','stroke-width':4,'data-label':f.id,'data-placement':'district-number'});name.textContent=districtMapNumber(f)||f.name;if(state.labels)g.append(name);
   seats.forEach((c,i)=>{
    const row=Math.floor(i/q.cols),col=i%q.cols,rowCount=Math.min(q.cols,seats.length-row*q.cols),x=q.x+(col-(rowCount-1)/2)*q.pitch-q.size/2,y=q.rect[1]+33+row*q.pitch;
    const p=c?predictionParty(c.party):null,emblem=p&&!['其他','其他政党'].includes(c.party)?logoFor(p):'',slot=svgEl('g',{'data-seat-slot':i,'data-seat-status':c?(c.history?'elected':'predicted'):'empty','data-seat-party':p?.id||'','data-seat-candidate':c?.id||''});
    const title=svgEl('title');title.textContent=c?candidateDisplayName(c)+' · '+c.party:'尚未预测';slot.append(title);
    slot.append(svgEl('circle',{cx:x+q.size/2,cy:y+q.size/2,r:q.size/2,fill:c&&!emblem?'#91999f':'#fff',stroke:c&&!emblem?'#91999f':'#8b9c92','stroke-width':1.8}));
    if(emblem)appendCircularPartyLogo(slot,emblem,x,y,q.size,{'data-seat-logo':p.id});g.append(slot);
   });
   if(interactive){g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',shortDirectoryName(d)+'，应选'+seats.length+'席，'+(typeof History2022View!=='undefined'&&History2022View.seatMode()?'实际当选':'已预测')+seats.filter(Boolean).length+'席');g.style.cursor='pointer';g.setAttribute('pointer-events','all');g.onpointerenter=()=>toggleLabelRegionHighlight(f,true);g.onpointerleave=()=>toggleLabelRegionHighlight(f,false);g.onfocus=()=>toggleLabelRegionHighlight(f,true);g.onblur=()=>toggleLabelRegionHighlight(f,false);g.onclick=()=>{if(typeof History2022View!=='undefined'&&History2022View.seatMode())History2022View.openRegion(f);else openPredictionDistrict(d)};g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();g.onclick()}}}
  }
 }
}
const baseCouncilSeatHighlight=toggleLabelRegionHighlight;
toggleLabelRegionHighlight=function(f,active){baseCouncilSeatHighlight(f,active);for(const group of $('labels').querySelectorAll('[data-seat-region]'))if(group.dataset.seatRegion===String(f.id))group.classList.toggle('seat-region-highlighted',active)};
const baseCouncilRenderLabels=renderLabels;
renderLabels=function(){if(!councilSeatMode())return baseCouncilRenderLabels();clearTimeout(navigationLabelTimer);navigationLabelTimer=0;mapNumberRows=[];drawCouncilSeats($('labels'),true);renderMapNumberTable()};
const baseCouncilLabels=drawIdentityPanelLabels;
drawIdentityPanelLabels=function(group,interactive=false,exportAll=false){if(councilSeatMode())drawCouncilSeats(group,interactive);else baseCouncilLabels(group,interactive,exportAll)};
const baseCouncilFill=predictionFill;
predictionFill=function(f){return councilSeatMode()?'#f0f3ed':baseCouncilFill(f)};
const baseCouncilSeatCounts=predictionPartyCounts;
predictionPartyCounts=function(){return councilSeatMode()?councilCountySeatCounts(state.county):baseCouncilSeatCounts()};
const baseCouncilCaption=predictionLegendCaption;
predictionLegendCaption=function(){return councilSeatMode()?'每圆一席；空心圆尚未预测，党徽表示预测当选，灰圆表示无可用党徽':baseCouncilCaption()};
const baseCouncilRender=render;
render=function(){document.getElementById('canvas').classList.toggle('council-seats-mode',councilCountyPresentation());baseCouncilRender()};
if(data)render();
