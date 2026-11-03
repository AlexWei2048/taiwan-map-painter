'use strict';
// One fixed-size symbol per statutory seat. Geography stays neutral.
function councilSeatMode(){return state.workspaceMode==='prediction'&&state.fillMode==='prediction'&&state.predictionOffice==='council'&&state.level==='council'&&!!state.county}
function councilSeatRows(d){
 const cs=directoryCandidates(d),record=state.predictions[d.id],picked=new Set(record?.winners||[]);
 const winners=cs.filter(c=>picked.has(c.id)).sort((a,b)=>{
  const pa=predictionParty(a.party),pb=predictionParty(b.party);
  return state.palette.findIndex(p=>p.id===pa.id)-state.palette.findIndex(p=>p.id===pb.id)||pa.id.localeCompare(pb.id)||cs.indexOf(a)-cs.indexOf(b);
 });
 return Array.from({length:Number(d.seats)||0},(_,i)=>winners[i]||null);
}
const baseCouncilScene=sceneSpec;
sceneSpec=function(){return councilSeatMode()?{width:1600,height:1450+furnitureFooterHeight(),pad:80,font:26}:baseCouncilScene()};
const baseCouncilPanels=identityPanelLayouts;
identityPanelLayouts=function(){
 if(!councilSeatMode())return baseCouncilPanels();
 const ids=panelIdentities(),spec=sceneSpec(),a=contentArea(spec),gap=28;
 const split=ids.length===3&&ids[0]==='regional';
 return ids.map((identity,i)=>{
  let area;
  if(split){const cut=a.left+(a.right-a.left)*.65;area=i===0?{left:a.left,right:cut-gap,top:a.top+52,bottom:a.bottom}:{left:cut,right:a.right,top:a.top+52+(i-1)*(a.bottom-a.top+gap)/2,bottom:a.top+(i)*(a.bottom-a.top+gap)/2-gap/2}}
  else{const w=(a.right-a.left-gap*(ids.length-1))/ids.length;area={left:a.left+i*(w+gap),right:a.left+i*(w+gap)+w,top:a.top+52,bottom:a.bottom}}
  const items=currentItems().filter(f=>featureElectorate(f)===identity),geo=data.counties.filter(f=>f.name===state.county),b=bounds(geo),pad=35;
  const scale=Math.min((area.right-area.left-pad*2)/(b[2]-b[0]),(area.bottom-area.top-pad*2)/(b[3]-b[1]));
  return{identity,label:electorateName(identity),items,area,t:{scale,tx:(area.left+area.right)/2-(b[0]+b[2])/2*scale,ty:(area.top+area.bottom)/2-(b[1]+b[3])/2*scale,labelLeft:area.left,labelRight:area.right,area}};
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
 const inside=r=>{if(![[r[0],r[1]],[r[2],r[1]],[r[0],r[3]],[r[2],r[3]]].every(([x,y])=>regionContains(f,x,y,t)))return false;for(let y=r[1];y<=r[3];y+=8)for(let x=r[0];x<=r[2];x+=8)if(!regionContains(f,x,y,t))return false;return true};
 for(const p of candidates)for(const s of shapes){const r=rect(p,s);if(clear(r)&&inside(r)){used.push(r);return{...p,...s,rect:r,anchor,size,pitch,outside:false}}}
 // Small islands and narrow urban districts get a nearby labelled seat group.
 const external=[];
 for(let y=a.top+70;y<a.bottom-45;y+=20)for(let x=a.left+35;x<a.right-35;x+=20)external.push({x,y});
 external.sort((p,q)=>Math.hypot(p.x-anchor.x,p.y-anchor.y)-Math.hypot(q.x-anchor.x,q.y-anchor.y));
 for(const p of external)for(const s of shapes){const r=rect(p,s);if(!clear(r))continue;let overlaps=false;for(const other of items)if(other!==f&&regionContains(other,p.x,p.y,t)){overlaps=true;break}if(overlaps)continue;used.push(r);return{...p,...s,rect:r,anchor,size,pitch,outside:true}}
 // Last-resort overflow row retains every statutory seat.
 const s=shapes[0],p={x:a.right-s.w/2-8,y:Math.max(a.top+70,...used.map(r=>r[3]+s.h/2+12))},r=rect(p,s);used.push(r);return{...p,...s,rect:r,anchor,size,pitch,outside:true};
}
const councilSeatPlacementCache=new Map();
function drawCouncilSeats(group,interactive){
 group.replaceChildren();
 for(const panel of identityPanelLayouts()){
  const used=[],cacheKey=[state.county,panel.identity,panel.t.scale,panel.t.tx,panel.t.ty,panel.area.bottom,panel.items.map(f=>f.id+':'+predictionDistrictFor(f)?.seats).join(',')].join('/');
  let cached=councilSeatPlacementCache.get(cacheKey);if(!cached){cached=new Map();if(councilSeatPlacementCache.size>60)councilSeatPlacementCache.clear();councilSeatPlacementCache.set(cacheKey,cached)}
  const layer=svgEl('g',{'data-council-seat-panel':panel.identity});group.append(layer);
  // Place the most constrained districts first.
  for(const f of [...panel.items].sort((a,b)=>(a.box[2]-a.box[0])*(a.box[3]-a.box[1])-(b.box[2]-b.box[0])*(b.box[3]-b.box[1]))){
   const d=predictionDistrictFor(f);if(!d)continue;
   const seats=councilSeatRows(d),q=cached.get(f.id)||councilSeatPlacement(f,seats.length,panel.t,used,panel.items);
   if(cached.has(f.id))used.push(q.rect);else cached.set(f.id,q);
   const g=svgEl('g',{'data-seat-district':d.id,'data-seat-count':seats.length,'data-seat-placement':q.outside?'outside':'inside'});layer.append(g);
   if(q.outside){g.append(svgEl('path',{d:`M${q.anchor.x},${q.anchor.y}L${q.x},${q.y}`,fill:'none',stroke:'#80978d','stroke-width':1.5,'pointer-events':'none'}));g.append(svgEl('rect',{x:q.rect[0],y:q.rect[1],width:q.w,height:q.h,rx:9,fill:'#ffffffed',stroke:'#dce5df'}))}
   const name=svgEl('text',{x:q.x,y:q.rect[1]+22,'text-anchor':'middle','font-size':24,fill:'#294a3a','paint-order':'stroke',stroke:'#fff','stroke-width':4,'data-label':f.id,'data-placement':'district-number'});name.textContent=districtMapNumber(f)||f.name;if(state.labels)g.append(name);
   seats.forEach((c,i)=>{
    const row=Math.floor(i/q.cols),col=i%q.cols,rowCount=Math.min(q.cols,seats.length-row*q.cols),x=q.x+(col-(rowCount-1)/2)*q.pitch-q.size/2,y=q.rect[1]+33+row*q.pitch;
    const p=c?predictionParty(c.party):null,emblem=p&&!['无党籍','其他','其他政党'].includes(c.party)?logoFor(p):'',slot=svgEl('g',{'data-seat-slot':i,'data-seat-status':c?'predicted':'empty','data-seat-party':p?.id||'','data-seat-candidate':c?.id||''});
    const title=svgEl('title');title.textContent=c?candidateDisplayName(c)+' · '+c.party:'尚未预测';slot.append(title);
    slot.append(svgEl('circle',{cx:x+q.size/2,cy:y+q.size/2,r:q.size/2,fill:c&&!emblem?'#91999f':'#fff',stroke:c&&!emblem?'#91999f':'#8b9c92','stroke-width':1.8}));
    if(emblem)appendCircularPartyLogo(slot,emblem,x,y,q.size,{'data-seat-logo':p.id});g.append(slot);
   });
   if(interactive){g.setAttribute('role','button');g.setAttribute('tabindex','0');g.setAttribute('aria-label',shortDirectoryName(d)+'，应选'+seats.length+'席，已预测'+seats.filter(Boolean).length+'席');g.style.cursor='pointer';g.onpointerenter=()=>toggleLabelRegionHighlight(f,true);g.onpointerleave=()=>toggleLabelRegionHighlight(f,false);g.onfocus=()=>toggleLabelRegionHighlight(f,true);g.onblur=()=>toggleLabelRegionHighlight(f,false);g.onclick=()=>openPredictionDistrict(d);g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPredictionDistrict(d)}}}
  }
 }
}
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
render=function(){document.getElementById('canvas').classList.toggle('council-seats-mode',councilSeatMode());baseCouncilRender()};
if(data)render();
