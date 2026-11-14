'use strict';
/* 1992–2024 legislative history map language. Reuse the site's SVG renderer,
 * county name placement and historical source-verified candidate/seat data. */
(function(){
 const currentHistory=()=>typeof History2022View!=='undefined'&&History2022View.active()&&History2022View.office()==='legislative';
 const previousLabels=renderLabels;
 function emblem(group,party,x,y,size){
  const p=predictionParty(party),logo=logoFor(p);
  group.append(svgEl('circle',{cx:x+size/2,cy:y+size/2,r:size/2,fill:logo?'#fff':p.color,stroke:'#d4e0d7','stroke-width':1.4}));
  if(logo)appendCircularPartyLogo(group,logo,x,y,size,{'data-historical-legislative-logo':party});
  else{
   const t=svgEl('text',{x:x+size/2,y:y+size/2+size*.12,'text-anchor':'middle','font-size':size*.55,'font-weight':700,fill:'#fff'});
   t.textContent=party==='无党籍'?'无':party.slice(0,1);group.append(t)
  }
 }
 function seatGroup(group,feature,layout,countyOverview=false){
  const winners=History2022View.legislativeSeatRows(feature);
  if(!winners.length)return;
  const sorted=[...winners].sort((a,b)=>a.party.localeCompare(b.party,'zh')||b.votes-a.votes);
  const composition=HistoryLegislative.composition(sorted);
  const compact=countyOverview;
  const rows=compact?composition.map(({party,seats})=>({party,seats})):sorted.map(({party})=>({party,seats:1}));
  const size=compact?19:28,pitch=compact?43:33;
  const cols=Math.min(compact?3:5,rows.length),rowCount=Math.ceil(rows.length/cols);
  const width=Math.max(compact?80:105,cols*pitch+14),height=(compact?25:31)+rowCount*(compact?27:36)+6;
  const cx=feature.center[0]*layout.scale+layout.tx;
  const cy=feature.center[1]*layout.scale+layout.ty+(compact?28:0);
  const area=layout.area||contentArea(sceneSpec());
  const left=Math.max(area.left+width/2,Math.min(area.right-width/2,cx))-width/2;
  const top=Math.max(area.top+height/2,Math.min(area.bottom-height/2,cy))-height/2;
  const card=svgEl('g',{'data-history-legislative-seats':compact?'county':'district',
   'data-county':feature.county,'data-region':feature.id,
   'data-seat-count':winners.length,role:'button',tabindex:0,
   'aria-label':feature.county+(compact?'':feature.name)+'，'+composition.map(x=>x.party+x.seats+'席').join('、')});
  card.append(svgEl('rect',{x:left,y:top,width,height,rx:10,fill:'#ffffffea',stroke:'#aac0b3','stroke-width':.9}));
  if(!compact){
   const label=svgEl('text',{x:left+width/2,y:top+19,'text-anchor':'middle','font-size':16,'font-weight':700,fill:'#294a3a'});
   label.textContent='第'+(HistoryLegislative.districtNumber(feature.number||feature.name)||'—')+'选区';
   card.append(label);
  }
  rows.forEach((row,i)=>{
   const c=i%cols,d=Math.floor(i/cols),x=left+10+c*pitch,y=top+(compact?5:27)+d*(compact?27:36);
   const mark=svgEl('g',{'data-party-seat':row.party,'data-party-seat-count':row.seats});
   emblem(mark,row.party,x,y,size);
   if(compact&&row.seats>1){
    const total=svgEl('text',{x:x+size+3,y:y+size*.78,'font-size':12,'font-weight':700,fill:'#315b46'});
    total.textContent='×'+row.seats;mark.append(total);
   }
   const title=svgEl('title');title.textContent=row.party+' · '+row.seats+'席';mark.append(title);card.append(mark);
  });
  card.style.cursor='pointer';card.style.pointerEvents='all';
  card.onclick=e=>{e.stopPropagation();History2022View.openRegion(feature)};
  card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.onclick(e)}};
  group.append(card);
 }
 renderLabels=function(){
  if(!currentHistory())return previousLabels();
  const national=History2022View.legislativeNationwide();
  const badgeMode=History2022View.legislativeBadgesMode();
  if(!national&&!badgeMode)return previousLabels();
  clearTimeout(navigationLabelTimer);navigationLabelTimer=0;mapNumberRows=[];
  const layer=$('labels');layer.replaceChildren();if(!state.labels){renderMapNumberTable();return}
  const features=currentItems(),layout=geometryLayout(features,true);
  if(national){
   const counties=History2022View.legislativeCountyFeatures();
   drawLabels(layer,counties,layout,19,true,true,true);
   if(badgeMode){
    const root=svgEl('g',{'data-national-legislative-seats':'true'});
    for(const county of counties)seatGroup(root,county,layout,true);
    layer.append(root);
   }
  }else if(badgeMode){
   const root=svgEl('g',{'data-district-legislative-seats':'true'});
   for(const feature of features)seatGroup(root,feature,layout,false);
   layer.append(root);
  }
  renderMapNumberTable();
 };
})();
