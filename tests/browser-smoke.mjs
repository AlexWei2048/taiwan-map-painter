/* Run in CI after installing playwright; these tests use isolated browser profiles. */
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import ElectionCore from '../election-core.js';
let browser;
before(async()=>{browser=await chromium.launch({headless:true})});
after(async()=>{await browser?.close()});
const base=process.env.MAP_TEST_URL||'http://127.0.0.1:8765/';
async function pageFor(t,viewport){
 const context=await browser.newContext(viewport?{viewport}:{});t.after(()=>context.close());
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 t.after(()=>assert.deepEqual(errors,[],'No application exceptions'));
 await page.goto(base);await page.locator('#regions path[data-region]').first().waitFor();assert.equal(await page.locator('#loadError').isVisible(),false);return page;
}
async function download(page,selector){const event=page.waitForEvent('download');await page.locator(selector).click();const path=await(await event).path();return readFile(path,'utf8')}
async function exportSvg(page){await page.locator('.export-menu summary').click();return download(page,'#exportSvg')}
async function selectMayor(page){await page.locator('#county').selectOption({label:'台北市'});await page.locator('#editPrediction').click();await page.getByRole('radio',{name:'预测蒋万安当选',exact:true}).check();await page.locator('#savePrediction').click()}
async function enterRates(page){
 await page.locator('#predictionDisplay').selectOption('topVote');await page.locator('#editPrediction').click();
 for(const [name,value]of [['郭玺','1'],['林志成','1'],['沈伯洋','40'],['萧文乾','1'],['蒋万安','56'],['唐新民','1']])await page.getByRole('spinbutton',{name:name+'预测得票率',exact:true}).fill(value);
 await page.locator('#savePrediction').click();
}
test('Candidate prediction and township dialogs drag freely and resize from all four corners',async t=>{
 const page=await pageFor(t,{width:1440,height:920});
 await page.locator('#county').selectOption({label:'台北市'});
 await page.locator('#editPrediction').click();
 const modal=page.locator('#predictionDialog');
 const header=modal.locator('.floating-dialog-drag');
 await header.waitFor({state:'visible'});
 assert.equal(await modal.locator('.floating-dialog-corner').count(),4);
 const before=await modal.boundingBox();
 assert.ok(before.width>=800&&before.height>=500);
 const headerBox=await header.boundingBox();
 const hx=headerBox.x+headerBox.width/2,hy=headerBox.y+headerBox.height/2;
 await page.mouse.move(hx,hy);await page.mouse.down();await page.mouse.move(hx+50,hy+29,{steps:5});await page.mouse.up();
 const moved=await modal.boundingBox();
 assert.ok(Math.abs(moved.x-before.x-50)<=3);
 assert.ok(Math.abs(moved.y-before.y-29)<=3);
 for(const corner of ['nw','ne','sw','se']){
  const target=modal.locator('[data-dialog-resize="'+corner+'"]');
  const prev=await modal.boundingBox(),b=await target.boundingBox();
  const x=b.x+b.width/2,y=b.y+b.height/2;
  const dx=corner.includes('w')?-15:15,dy=corner.includes('n')?-10:10;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:4});await page.mouse.up();
  const next=await modal.boundingBox();
  assert.ok(next.width>prev.width+9,corner+' must expand width');
  assert.ok(next.height>prev.height+5,corner+' must expand height');
  if(corner.includes('w'))assert.ok(Math.abs((prev.x+prev.width)-(next.x+next.width))<=3,'west resize anchors east edge');
  else assert.ok(Math.abs(next.x-prev.x)<=3,'east resize anchors west edge');
 }
 const older=await modal.boundingBox();
 await modal.locator('[data-dialog-resize="nw"]').focus();
 await page.keyboard.press('ArrowLeft');
 const keyboardResized=await modal.boundingBox();
 assert.ok(keyboardResized.width>older.width,'Keyboard resize is available');
 await page.getByRole('radio',{name:'预测蒋万安当选',exact:true}).check();
 await page.locator('#savePrediction').click();
 assert.equal(await modal.isVisible(),false);
 await page.locator('#predictionScale').selectOption('overlay');
 const townId=await page.locator('#regions path[data-region]').first().getAttribute('data-region');
 await page.locator('#regions path[data-region="'+townId+'"]').dispatchEvent('click');
 const local=page.locator('#localDialog');
 await local.locator('.floating-dialog-drag').waitFor({state:'visible'});
 assert.equal(await local.locator('[data-dialog-resize]').count(),4);
 const localBefore=await local.boundingBox(),bar=await local.locator('.floating-dialog-drag').boundingBox();
 const px=bar.x+bar.width/2,py=bar.y+bar.height/2;
 await page.mouse.move(px,py);await page.mouse.down();await page.mouse.move(px-36,py+20,{steps:4});await page.mouse.up();
 const localMoved=await local.boundingBox();
 assert.ok(Math.abs(localMoved.x-localBefore.x+36)<=3);
 assert.ok(Math.abs(localMoved.y-localBefore.y-20)<=3);
 const se=await local.locator('[data-dialog-resize="se"]').boundingBox();
 await page.mouse.move(se.x+se.width/2,se.y+se.height/2);
 await page.mouse.down();await page.mouse.move(se.x+se.width/2+23,se.y+se.height/2+17,{steps:4});await page.mouse.up();
 const localResized=await local.boundingBox();
 assert.ok(localResized.width>localMoved.width+12);
 assert.ok(localResized.height>localMoved.height+9);
 await page.getByRole('radio',{name:'预测蒋万安胜出',exact:true}).check();
 await page.locator('#saveLocal').click();
 assert.equal(await local.isVisible(),false);
 assert.equal(await page.evaluate(()=>state.predictionOffice),'mayor');
 assert.equal(await page.locator('#county').inputValue(),'台北市');
});
test('Floating candidate dialogs have full-width readable layout and top-right close controls',async t=>{
 const page=await pageFor(t,{width:1024,height:820});
 await page.locator('#county').selectOption({label:'台北市'});
 await page.locator('#editPrediction').click();
 const modal=page.locator('#predictionDialog');
 const layout=await page.evaluate(id=>{
  const el=document.getElementById(id),r=el.getBoundingClientRect();
  const scroll=el.querySelector('.floating-dialog-scroll');
  const bar=el.querySelector('.floating-dialog-drag');
  const close=bar.querySelector('.dialog-close');
  const table=scroll.querySelector('.prediction-table-wrap');
  const heading=scroll.querySelector('.prediction-dialog-heading');
  const actions=scroll.querySelector('.dialog-actions');
  const buttons=[...actions.querySelectorAll('button')];
  const rect=node=>{const a=node.getBoundingClientRect();return{x:a.x,y:a.y,w:a.width,h:a.height,right:a.right,bottom:a.bottom}};
  return{r:rect(el),scroll:rect(scroll),bar:rect(bar),close:rect(close),
   table:rect(table),heading:rect(heading),actions:rect(actions),
   computed:{scroll:getComputedStyle(scroll).display,margin:getComputedStyle(scroll).marginTop,
    table:getComputedStyle(table).display,actions:getComputedStyle(actions).display},
   buttons:buttons.map(rect),closeInHeader:close.parentElement===bar};
 },'predictionDialog');
 assert.equal(layout.computed.scroll,'block');
 assert.equal(layout.computed.margin,'0px');
 assert.equal(layout.computed.table,'block');
 assert.equal(layout.computed.actions,'flex');
 assert.ok(layout.heading.w>650,'Heading is full-width instead of a thin vertical strip');
 assert.ok(layout.table.w>650,'Candidate table spans usable dialog width');
 assert.ok(layout.actions.w>650,'Action buttons span dialog width');
 assert.ok(layout.buttons.every(b=>b.w>=95&&b.h<=65),'Action buttons remain readable');
 assert.equal(layout.closeInHeader,true);
 assert.ok(layout.close.right<=layout.r.right&&layout.close.right>=layout.r.right-95,
  'Close button must be in upper-right corner');
 assert.ok(layout.close.y-layout.r.y<12,'Close button must be at top');
 await page.locator('#predictionDialog .floating-dialog-drag > .dialog-close').click();
 assert.equal(await modal.isVisible(),false);
 await page.locator('#predictionScale').selectOption('overlay');
 const region=await page.locator('#regions path[data-region]').first().getAttribute('data-region');
 await page.locator('#regions path[data-region="'+region+'"]').dispatchEvent('click');
 const local=page.locator('#localDialog');
 const localLayout=await page.evaluate(()=>{
  const el=document.getElementById('localDialog'),bar=el.querySelector('.floating-dialog-drag');
  const scroll=el.querySelector('.floating-dialog-scroll');
  const close=bar.querySelector('.dialog-close');
  const table=scroll.querySelector('.prediction-table-wrap');
  const actions=scroll.querySelector('.dialog-actions');
  const r=el.getBoundingClientRect(),t=table.getBoundingClientRect(),a=actions.getBoundingClientRect(),b=close.getBoundingClientRect();
  return{scroll:getComputedStyle(scroll).display,tableWidth:t.width,actionWidth:a.width,
   buttonWidths:[...actions.querySelectorAll('button')].map(x=>x.getBoundingClientRect().width),
   closeRight:r.right-b.right,closeTop:b.top-r.top,headingWidth:scroll.querySelector('#localDialogTitle').getBoundingClientRect().width};
 });
 assert.equal(localLayout.scroll,'block');
 assert.ok(localLayout.tableWidth>600);
 assert.ok(localLayout.actionWidth>600);
 assert.ok(localLayout.buttonWidths.every(x=>x>90));
 assert.ok(localLayout.closeRight>=0&&localLayout.closeRight<=95);
 assert.ok(localLayout.closeTop<12);
 assert.ok(localLayout.headingWidth>600);
 await local.locator('.floating-dialog-drag > .dialog-close').click();
 assert.equal(await local.isVisible(),false);
});
test('Nationwide mayor map uses 22 full names, safe city leaders and framed offshore labels',async t=>{
 const page=await pageFor(t);assert.equal(await page.locator('#mapBuildVersion').count(),0,'No build/version marker should appear in the map');await page.waitForFunction(()=>document.querySelectorAll('#labels [data-label]').length===22);
 const result=await page.evaluate(()=>{
  const labels=[...document.querySelectorAll('#labels [data-label]')];
  const box=e=>e.getBoundingClientRect();
  const cityNames=['台北市','基隆市','新竹市','嘉义市'];
  const islandFrames={连江县:'马祖',金门县:'金门',澎湖县:'澎湖'};
  const insideCounty=el=>{
   const polygon=document.querySelector('#regions [data-region="'+el.dataset.label+'"]');
   const r=box(el),inv=polygon.getScreenCTM().inverse();
   return [-.3,0,.3].every(dx=>[-.3,0,.3].every(dy=>{
    const p=new DOMPoint((r.left+r.right)/2+dx*r.width,(r.top+r.bottom)/2+dy*r.height).matrixTransform(inv);
    return polygon.isPointInFill(p);
   }));
  };
  const cities=Object.fromEntries(cityNames.map(name=>{
   const el=labels.find(e=>e.textContent===name),a=box(el);
   const overlaps=[...document.querySelectorAll('#insetFrames [data-inset] > *')].some(e=>{
    const b=box(e);return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
   });
   return[name,{placement:el.dataset.placement,leader:!!document.querySelector('#labels [data-label-leader="'+el.dataset.label+'"]'),overlaps}];
  }));
  const islands=Object.fromEntries(Object.entries(islandFrames).map(([name,inset])=>{
   const el=labels.find(e=>e.textContent===name),a=box(el);
   const b=box(document.querySelector('#insetFrames [data-inset="'+inset+'"] > *'));
   return[name,{placement:el.dataset.placement,inside:a.left>=b.left&&a.right<=b.right&&a.top>=b.top&&a.bottom<=b.bottom,bottomGap:b.bottom-a.bottom}];
  }));
  return{count:labels.length,unique:new Set(labels.map(e=>e.dataset.label)).size,
   numbered:labels.some(e=>e.dataset.numberKey),names:labels.map(e=>e.textContent),
   mainlandOutside:labels.filter(e=>!cityNames.includes(e.textContent)&&!islandFrames[e.textContent]).filter(e=>!insideCounty(e)).map(e=>{
    const r=box(e),p=document.querySelector('#regions [data-region="'+e.dataset.label+'"]'),root=document.querySelector('#map');
    const center=new DOMPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
    const local=center.matrixTransform(root.getScreenCTM().inverse());
    const pf=center.matrixTransform(p.getScreenCTM().inverse());
    const f=data.counties.find(x=>x.id===e.dataset.label);
    const t=geometryLayout(currentItems(),true);
    return{name:e.textContent,w:r.width,h:r.height,centerOnPolygon:p.isPointInFill(pf),
     centerCanvas:regionContains(f,local.x,local.y,t),box:[r.left,r.top,r.right,r.bottom].map(n=>Math.round(n))};
   }),cities,islands};
 });
 assert.equal(result.count,22);assert.equal(result.unique,22);assert.equal(result.numbered,false);
 for(const name of ['台北市','基隆市','新竹市','嘉义市']){
  assert.equal(result.cities[name].placement,'outside');assert.equal(result.cities[name].leader,true);
  assert.equal(result.cities[name].overlaps,false);
 }
 for(const name of ['连江县','金门县','澎湖县']){
  assert.equal(result.islands[name].placement,'inset-bottom');assert.equal(result.islands[name].inside,true);
  assert.ok(result.islands[name].bottomGap>=1);
 }
 assert.deepEqual(result.mainlandOutside,[],'All remaining county names remain within their own polygon');
 assert.equal(await page.locator('#mapNumberKey').isVisible(),false);
 for(const name of ['台北市','基隆市','新竹市','嘉义市']){
  const id=await page.locator('#labels [data-label]').filter({hasText:name}).getAttribute('data-label');
  const line=page.locator('#labels [data-label-leader="'+id+'"]');
  assert.equal(await line.getAttribute('data-prominent-leader'),'true');
  assert.ok(await line.evaluate(el=>{const w=parseFloat(getComputedStyle(el).strokeWidth);return w>=1.4&&w<=1.7}),'City callout must be clear but not excessively thick');
  assert.equal(await page.locator('#labels [data-label-leader-halo="'+id+'"]').count(),1);
  const typography=await page.evaluate(id=>{
   const label=document.querySelector('#labels [data-label="'+id+'"]');
   const reference=[...document.querySelectorAll('#labels [data-label]')].find(el=>el.textContent==='台东县');
   const a=getComputedStyle(label),b=getComputedStyle(reference);
   return{size:a.fontSize===b.fontSize,weight:a.fontWeight===b.fontWeight,fill:a.fill===b.fill,outline:a.strokeWidth===b.strokeWidth};
  },id);
  assert.deepEqual(typography,{size:true,weight:true,fill:true,outline:true},'Callout names must match all other county names');
 }
 const svg=await exportSvg(page);
 for(const name of result.names)assert.ok(svg.includes(name),'Export includes '+name);
 assert.equal((svg.match(/data-placement="inset-bottom"/g)||[]).length,3);
});
test('Mayor township map drills from neutral counties to independent township forecasts',async t=>{
 const page=await pageFor(t);
 await selectMayor(page);
 await page.locator('#county').selectOption('');
 const countyColors=await page.locator('#regions path[data-region]').evaluateAll(els=>els.map(e=>e.getAttribute('fill')));
 assert.ok(countyColors.some(color=>color!=='#edf1e9'),'Saved county winner has its own color');
 await page.locator('#predictionScale').selectOption('overlay');
 const overview=await page.evaluate(()=>({
  active:mayorTownBoundaryOverlay(),local:localPredictionActive(),
  office:state.predictionOffice,county:state.county,
  level:state.level,scale:state.predictionScale,
  count:currentItems().length,
  fills:[...document.querySelectorAll('#regions path[data-region]')].map(e=>e.getAttribute('fill')),
  labels:[...document.querySelectorAll('#labels [data-label]')].map(e=>e.textContent),
  townBorders:document.querySelectorAll('#townBorders path').length,
  winnerTable:exportPredictionWinnerRows().length,
  options:[...document.querySelector('#predictionScale').options].map(e=>e.textContent),
  target:currentItems().find(f=>f.name==='台北市')?.id
 }));
 assert.equal(overview.active,true);assert.equal(overview.local,false);
 assert.equal(overview.office,'mayor');assert.equal(overview.level,'towns');
 assert.equal(overview.scale,'overlay');assert.equal(overview.count,22);
 assert.ok(overview.fills.every(color=>color==='#edf1e9'),'County winner colors must not be inherited');
 assert.equal(overview.labels.length,22);assert.ok(overview.townBorders>0);
 assert.equal(overview.winnerTable,0);
 assert.deepEqual(overview.options,['县市','乡镇市区']);
 assert.ok(overview.target);
 await page.locator('#regions path[data-region="'+overview.target+'"]').dispatchEvent('click');
 const county=await page.evaluate(()=>({
  scope:state.county,office:state.predictionOffice,scale:state.predictionScale,
  local:localPredictionActive(),count:currentItems().length,
  wrongCounty:currentItems().some(f=>f.county!=='台北市'),
  fills:[...document.querySelectorAll('#regions path[data-region]')].map(e=>e.getAttribute('fill'))
 }));
 assert.equal(county.scope,'台北市');assert.equal(county.office,'mayor');
 assert.equal(await page.locator('#county').inputValue(),'台北市');
 assert.equal(await page.locator('#predictionScale').inputValue(),'overlay');
 assert.equal(county.local,true);assert.ok(county.count>1);
 assert.equal(county.wrongCounty,false);
 assert.ok(county.fills.every(color=>color==='#edf1e9'));
 const firstId=await page.locator('#regions path[data-region]').first().getAttribute('data-region');
 await page.locator('#regions path[data-region="'+firstId+'"]').dispatchEvent('click');
 await page.locator('#localDialog').waitFor({state:'visible'});
 await page.getByRole('radio',{name:'预测蒋万安胜出',exact:true}).check();
 await page.locator('#saveLocal').click();
 const saved=await page.evaluate(id=>{
  const f=currentItems().find(f=>f.id===id);
  const record=f?localRecord(directoryDistrictById.get(f.parentDistrictId),f):null;
  return{
   office:state.predictionOffice,county:state.county,level:state.level,
   fill:document.querySelector('#regions path[data-region="'+id+'"]')?.getAttribute('fill'),
   winner:record?.leaderId,
   countyWinner:state.predictions['mayor:63000']?.winners||[],
   rows:exportPredictionWinnerRows().map(r=>({district:r.district,name:r.name,local:r.local,estimated:r.estimated})),
   layout:exportPredictionTableLayout(exportPredictionWinnerRows()).polished
  };
 },firstId);
 assert.equal(saved.office,'mayor');assert.equal(saved.county,'台北市');
 assert.ok(saved.winner);assert.notEqual(saved.fill,'#edf1e9');
 assert.ok(saved.countyWinner.length>0,'Countywide winner data remains untouched');
 assert.ok(saved.rows.some(r=>r.local&&r.name==='蒋万安'));
 assert.equal(saved.layout,true,'Township composition table keeps the two-up winner layout');
 const svg=await exportSvg(page);
 assert.match(svg,/data-export-table-style="two-up"/);
 assert.match(svg,/蒋万安/);
 // Returning to the nationwide map never paints counties from their saved winners.
 await page.locator('#county').selectOption('');
 assert.equal(await page.evaluate(()=>mayorTownBoundaryOverlay()),true);
 assert.ok(await page.locator('#regions path[data-region]').evaluateAll(els=>els.every(e=>e.getAttribute('fill')==='#edf1e9')));
 // The map-range dropdown offers the same navigation as clicking a county.
 await page.locator('#county').selectOption({label:'高雄市'});
 assert.equal(await page.evaluate(()=>localPredictionActive()),true);
 assert.equal(await page.locator('#county').inputValue(),'高雄市');
 assert.equal(await page.locator('#predictionScale').inputValue(),'overlay');
 assert.ok(await page.locator('#regions path[data-region]').count()>20);
 await page.locator('#county').selectOption('');
 assert.equal(await page.evaluate(()=>mayorTownBoundaryOverlay()),true);
 // County layer remains independent and retains its original prediction.
 await page.locator('#predictionScale').selectOption('district');
 assert.equal(await page.evaluate(()=>state.level),'counties');
 assert.equal(await page.evaluate(()=>state.predictionOffice),'mayor');
 assert.ok(await page.locator('#regions path[data-region]').evaluateAll(els=>els.some(e=>e.getAttribute('fill')!=='#edf1e9')));
});
test('Each mayor township county map has a visible return-to-Taiwan control that resets only map range',async t=>{
 const page=await pageFor(t);
 const back=page.locator('#returnTaiwanMap');
 assert.equal(await back.count(),1,'Map return button exists even while hidden');
 assert.equal(await back.isVisible(),false,'Hidden on county-level map');
 await page.locator('#predictionScale').selectOption('overlay');
 assert.equal(await back.isVisible(),false,'Hidden on nationwide township overview');
 await page.locator('#county').selectOption({label:'台北市'});
 assert.equal(await back.isVisible(),true,'Shown inside Taipei township detail');
 assert.equal(await page.getByRole('button',{name:'返回全台地图',exact:true}).count(),1,'Accessible button label');
 assert.equal(await back.textContent().then(s=>s.trim()),'← 返回全台地图');
 const geometry=await page.evaluate(()=>{
  const r=document.querySelector('#returnTaiwanMap').getBoundingClientRect();
  const canvas=document.querySelector('#canvas').getBoundingClientRect();
  const info=document.querySelector('.canvas-info').getBoundingClientRect();
  return{inside:r.left>=canvas.left&&r.right<=canvas.right&&r.top>=canvas.top&&r.bottom<=canvas.bottom,
   belowInfo:r.top>=info.bottom};
 });
 assert.equal(geometry.inside,true,'Back control must fit inside map canvas');
 assert.equal(geometry.belowInfo,true,'Back control must not obscure the map instruction');
 // Preserve an independently recorded township winner across navigation.
 const id=await page.locator('#regions path[data-region]').first().getAttribute('data-region');
 await page.locator('#regions path[data-region="'+id+'"]').dispatchEvent('click');
 await page.getByRole('radio',{name:'预测蒋万安胜出',exact:true}).check();
 await page.locator('#saveLocal').click();
 const before=await page.evaluate(id=>{
  const f=currentItems().find(f=>f.id===id);
  return localRecord(directoryDistrictById.get(f.parentDistrictId),f).leaderId;
 },id);
 assert.ok(before);
 await back.click();
 assert.equal(await back.isVisible(),false,'Hidden after returning to nationwide overview');
 const after=await page.evaluate(()=>({
  county:state.county,level:state.level,scale:state.predictionScale,office:state.predictionOffice,
  overlay:mayorTownBoundaryOverlay(),local:localPredictionActive(),count:currentItems().length,
  regionCount:document.querySelectorAll('#regions [data-region]').length,
  allNeutral:[...document.querySelectorAll('#regions path[data-region]')].every(e=>e.getAttribute('fill')==='#edf1e9')
 }));
 assert.equal(after.county,'');assert.equal(await page.locator('#county').inputValue(),'');
 assert.equal(after.level,'towns');assert.equal(after.scale,'overlay');assert.equal(after.office,'mayor');
 assert.equal(after.overlay,true);assert.equal(after.local,false);
 assert.equal(after.count,22);assert.equal(after.regionCount,22);assert.equal(after.allNeutral,true);
 await page.locator('#county').selectOption({label:'台北市'});
 assert.equal(await back.isVisible(),true);
 const restored=await page.evaluate(id=>{
  const f=currentItems().find(f=>f.id===id);
  return localRecord(directoryDistrictById.get(f.parentDistrictId),f).leaderId;
 },id);
 assert.equal(restored,before,'Back navigation must not alter saved township forecast data');
 await page.locator('#predictionScale').selectOption('district');
 assert.equal(await back.isVisible(),false,'Hidden for county mayor prediction layer');
 await page.locator('#predictionOffice').selectOption('council');
 assert.equal(await back.isVisible(),false,'Hidden for council elections');
});
test('Published-site update time uses the last successful Pages deployment, minute-precision Taipei time',async t=>{
 const context=await browser.newContext();t.after(()=>context.close());
 const page=await context.newPage();
 await page.route('https://api.github.com/repos/AlexWei2048/taiwan-map-painter/actions/runs?**',route=>route.fulfill({
  status:200,contentType:'application/json',body:JSON.stringify({workflow_runs:[
   {name:'Website regression checks',conclusion:'success',head_branch:'main',updated_at:'2026-11-01T09:59:10Z'},
   {name:'pages build and deployment',conclusion:'success',head_branch:'main',updated_at:'2026-11-01T09:17:33Z'}
  ]})
 }));
 await page.route('**/index.html?_site_updated=*',route=>route.fulfill({status:200,headers:{
  'Last-Modified':'Sat, 31 Oct 2026 09:00:00 GMT'
 }}));
 await page.goto(base);
 await page.waitForFunction(()=>document.querySelector('#siteUpdatedAt')?.dataset.source==='github-pages');
 const stamp=page.locator('#siteUpdatedAt');
 assert.equal(await stamp.textContent(),'更新时间：2026年11月1日 17:17（GMT+8）');
 assert.equal(await stamp.getAttribute('datetime'),'2026-11-01T09:17:33.000Z');
 assert.match(await stamp.getAttribute('title'),/成功部署/);
});
test('Independent-candidate emblem is bundled for sidebar, legend and standalone SVG',async t=>{
 const page=await pageFor(t);
 const shared=await page.evaluate(()=>({gray:PARTY_LOGOS.gray,primary:logoFor({id:'gray',name:'无党籍'}),traditional:logoFor({id:'custom',name:'無黨籍'})}));
 assert.ok(shared.gray.startsWith('data:image/png;base64,'));
 assert.equal(shared.primary,shared.gray);
 assert.equal(shared.traditional,shared.gray);
 await page.locator('#workspaceFree').click();
 const logo=page.locator('.palette-manage-row[data-party="gray"] img.party-logo');
 assert.equal(await logo.count(),1);
 assert.ok((await logo.getAttribute('src')).startsWith('data:image/png;base64,'));
 await page.locator('.palette-manage-row[data-party="gray"] button.party-brush').click();
 // The small SVG coastline is not reliably pointer-hittable at default zoom;
 // dispatch the existing click handler instead of changing map geometry.
 await page.locator('#regions path[data-region]').first().dispatchEvent('click');
 const emblem=page.locator('#legend [data-party-logo="gray"]');
 assert.equal(await emblem.count(),1);
 const svg=await exportSvg(page);
 assert.match(svg,/data-party-logo="gray"/);
 assert.ok(svg.includes('data:image/png;base64,'));
});
test('Recording votes retains chosen winners and exports a complete vote table',async t=>{
 const page=await pageFor(t);await selectMayor(page);await enterRates(page);
 const svg=await exportSvg(page);assert.match(svg,/预测得票候选人/);assert.match(svg,/预测得票率/);assert.match(svg,/data-export-party-logo/);
 assert.equal((svg.match(/data-export-winner-row=/g)||[]).length,6);
 await page.locator('#predictionDisplay').selectOption('composition');assert.match(await page.locator('#predictionCoverage').innerText(),/已选当选人 1\/1/);
 assert.match(await page.locator('#legend').textContent(),/中国国民党（1席）/);
 await page.reload();await page.locator('#regions path').first().waitFor();assert.match(await page.locator('#predictionCoverage').innerText(),/已选当选人 1\/1/);
});
test('Export winner table has two candidates per row, with name-adjacent incumbency and party logos',async t=>{
 const page=await pageFor(t);
 const result=await page.evaluate(()=>{
  const logo=logoFor({id:'blue',name:'中国国民党'});
  const rows=Array.from({length:22},(_,i)=>({
   district:i?'县市'+i:'台北市',number:String(i+1),
   name:i?'测试候选人'+i:'测试候选人',gender:i%2?'女':'男',
   party:i%3?'民主进步党':'中国国民党',
   color:i%3?'#1B9431':'#000099',logo,incumbent:i%4===0?'现任':''
  }));
  const layout=exportPredictionTableLayout(rows),root=svgEl('g');
  appendExportPredictionTable(root,rows,20);
  const card=root.querySelector('[data-export-winner-table]');
  const physicalRows=[...card.querySelectorAll('[data-export-winner-row]')];
  const entries=[...card.querySelectorAll('[data-export-winner-entry]')];
  const names=[...card.querySelectorAll('[data-export-field="name"]')];
  const incumbents=[...card.querySelectorAll('[data-export-incumbent]')];
  const headers=[...card.querySelectorAll('[data-export-winner-header]')].map(el=>el.textContent);
  const numeric=exportPredictionTableLayout([{...rows[0],estimated:true,votes:'12345',share:'45%',status:'预测当选'}]);
  const oddRows=exportPredictionTableLayout(rows.slice(0,21));
  const oddRoot=svgEl('g');appendExportPredictionTable(oddRoot,rows.slice(0,21),20);
  const firstItem=entries[0],badge=firstItem.querySelector('[data-export-incumbent]');
  const firstName=firstItem.querySelector('[data-export-field="name"]');
  const secondItem=entries[1];
  return{
   variant:card.dataset.exportTableStyle,columns:layout.columns,
   rows:physicalRows.length,entries:entries.length,
   pairCounts:physicalRows.map(r=>r.querySelectorAll('[data-export-winner-entry]').length),
   logos:card.querySelectorAll('[data-export-party-logo]').length,
   incumbents:incumbents.length,headers,firstName:firstName?.textContent,
   inlineBadge:badge?Number(badge.getAttribute('x'))>Number(firstName.getAttribute('x')):false,
   secondSlot:secondItem?.dataset.exportSlot,fonts:names.map(el=>Number(el.getAttribute('font-size'))),
   width:layout.width,tableHeight:layout.height,
   oddPairs:oddRows.pairs.length,
   oddLastEntries:oddRoot.querySelectorAll('[data-export-winner-row]:last-of-type [data-export-winner-entry]').length,
   estimatedStillLegacy:!numeric.polished
  };
 });
 assert.equal(result.variant,'two-up');assert.equal(result.columns,2);
 assert.equal(result.rows,11);assert.equal(result.entries,22);
 assert.ok(result.pairCounts.every(n=>n===2));
 assert.equal(result.logos,22);assert.equal(result.incumbents,6);
 assert.deepEqual(result.headers,['选区','姓名','政党','选区','姓名','政党']);
 assert.equal(result.firstName,'测试候选人');assert.equal(result.inlineBadge,true);
 assert.equal(result.secondSlot,'1');assert.ok(result.fonts.every(n=>n>=15));
 assert.equal(result.width,1120);assert.ok(result.tableHeight<950);
 assert.equal(result.oddPairs,11);assert.equal(result.oddLastEntries,1);
 assert.equal(result.estimatedStillLegacy,true);
});
test('2026 and 2022 district searches and CSV downloads survive mode switching',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('council');await page.locator('#county').selectOption({label:'台北市'});
 await page.waitForFunction(()=>document.querySelectorAll('#regions path[data-region]').length===8);
 await page.locator('#districtTableSearch').fill('北投');assert.equal(await page.locator('#districtTableGroups tbody tr').count(),1);
 assert.equal(ElectionCore.csv(await download(page,'#downloadDistrictTable')).length,2);
 await page.locator('#categoryHistory').click();await page.locator('#historyOffice').selectOption('council');await page.locator('#historyCounty').selectOption({label:'台北市'});await page.locator('#districtTableSearch').fill('');
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('61席'));
 const colors=await page.locator('#regions path[data-region]').evaluateAll(elements=>elements.map(e=>e.getAttribute('fill')));assert.equal(colors.length,8);assert.ok(colors.every(color=>color!=='#edf1e9'));
 const csv=await download(page,'#downloadDistrictTable');assert.equal(ElectionCore.csv(csv).length,9);assert.ok(!csv.includes('\\r\\n'));
 await page.locator('#categoryFuture').click();await page.locator('#districtTableSearch').fill('');assert.match(await page.locator('#districtReferenceTitle').textContent(),/台北市议员/);
 assert.equal(ElectionCore.csv(await download(page,'#downloadDistrictTable')).length,9);
});
test('Historical detail insets use the same party colors as their main map',async t=>{
 const page=await pageFor(t);await page.locator('#categoryHistory').click();await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('22席'));
 const svg=await exportSvg(page);
 const colors=await page.evaluate(source=>{const doc=new DOMParser().parseFromString(source,'image/svg+xml');return['基隆市','台北市','新竹市'].map((county,i)=>({main:doc.querySelector('[data-region="'+['10017','63000','10018'][i]+'"]')?.getAttribute('fill'),detail:doc.querySelector('[data-export-detail-map="'+county+'"] path')?.getAttribute('fill')}))},svg);
 assert.ok(colors.every(row=>row.main&&row.main===row.detail&&row.detail!=='#edf1e9'));
});
test('Compact export and preview are available at mobile width',async t=>{
 const page=await pageFor(t,{width:390,height:844});await page.locator('.export-menu summary').click();assert.equal(await page.locator('#exportSvg').isVisible(),true);
 await page.locator('#exportLayout').selectOption('compact');await page.locator('#previewExport').click();await page.waitForFunction(()=>document.querySelector('#exportPreviewStatus').textContent.includes('像素'));
 assert.equal(await page.locator('#exportPreviewImage').isVisible(),true);await page.locator('#closeExportPreview').click();
 const svg=await exportSvg(page);assert.ok(!svg.includes('data-export-detail-maps'));assert.ok(!svg.includes('data-number-key='),'No numbered key for nationwide county mayors');
});
test('CSV import previews changes and blank cells retain earlier choices',async t=>{
 const page=await pageFor(t);await selectMayor(page);await page.locator('.header-menu summary').first().click();
 const csv=await download(page,'.header-menu .menu-popover button:has-text("下载预测名单模板")');
 const rows=ElectionCore.csv(csv);rows[1][14]='1';
 const encoded='\uFEFF'+rows.map(row=>row.map(cell=>'"'+String(cell).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 await page.locator('#predictionCsvFile').setInputFiles({name:'test.csv',mimeType:'text/csv',buffer:Buffer.from(encoded)});
 await page.locator('#predictionImportPreview').waitFor({state:'visible'});assert.match(await page.locator('#predictionImportSummary').textContent(),/移除 0 项/);
 await page.locator('#confirmPredictionImport').click();assert.match(await page.locator('#predictionCoverage').textContent(),/已选当选人 1\/1/);
});
test('Township leaders remain stored after numeric entry',async t=>{
 const page=await pageFor(t);await page.locator('#county').selectOption({label:'台北市'});await page.locator('#predictionScale').selectOption('overlay');
 await page.locator('#editPrediction').click();await page.getByRole('radio',{name:'预测蒋万安胜出',exact:true}).check();await page.locator('#saveLocal').click();
 await page.locator('#predictionDisplay').selectOption('topVote');await page.locator('#editPrediction').click();await page.getByRole('spinbutton',{name:'蒋万安预测得票率',exact:true}).fill('56');await page.locator('#saveLocal').click();
 await page.locator('#predictionDisplay').selectOption('composition');assert.match(await page.locator('#regions path[data-region]').first().getAttribute('aria-label'),/蒋万安/);
});

test('History browsing cannot undo or overwrite the saved future scenario',async t=>{
 const page=await pageFor(t);await selectMayor(page);await page.locator('#categoryHistory').click();await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('22席'));
 assert.equal(await page.locator('#undo').isDisabled(),true);assert.equal(await page.locator('#redo').isDisabled(),true);
 await page.locator('.header-menu summary').first().click();const json=JSON.parse(await download(page,'#saveProject'));assert.equal(json.workspaceMode,'prediction');assert.equal(json.predictions['mayor:63000'].winners.length,1);
 await page.locator('#categoryFuture').click();assert.match(await page.locator('#predictionCoverage').textContent(),/已选当选人 1\/1/);
});

const counties=['台北市','新北市','桃园市','台中市','台南市','高雄市','基隆市','宜兰县','新竹县','新竹市','苗栗县','彰化县','南投县','云林县','嘉义县','嘉义市','屏东县','花莲县','台东县','澎湖县','金门县','连江县'];
async function missingLabels(page,selector='#regions [data-region]'){
 return page.evaluate(selector=>{const ids=new Set([...document.querySelectorAll('#labels [data-label]')].map(e=>e.dataset.label));return[...document.querySelectorAll(selector)].filter(p=>!ids.has(p.dataset.region)).map(e=>e.getAttribute('aria-label'))},selector);
}
test('Every council and regional legislative district is labelled in all 22 county views',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('council');
 await page.locator('#county').selectOption({label:'台北市'});await page.waitForFunction(()=>document.querySelectorAll('#regions [data-region]').length===8);
 for(const county of counties){await page.locator('#county').selectOption({label:county});assert.deepEqual(await missingLabels(page),[],county+' council')}
 await page.locator('#workspaceFree').click();await page.locator('#legislativeLevel').click();
 await page.waitForFunction(()=>document.querySelector('#regions [data-region][data-electorate="regional"]'));
 for(const county of counties){await page.locator('#county').selectOption({label:county});assert.deepEqual(await missingLabels(page,'#regions [data-region][data-electorate="regional"]'),[],county+' legislative')}
});
test('Kaohsiung county mayor townships use all 38 complete names, inside labels and callouts, without numerical key',async t=>{
 const page=await pageFor(t);
 await page.locator('#county').selectOption({label:'高雄市'});
 await page.locator('#predictionScale').selectOption('overlay');
 assert.equal(await page.locator('#regions path[data-region]').count(),38);
 assert.deepEqual(await missingLabels(page),[],'Every town needs its own full name');
 const names=await page.locator('#labels text[data-label]').evaluateAll(nodes=>nodes.map(el=>({
  id:el.dataset.label,text:el.textContent,number:el.dataset.numberKey,font:el.getAttribute('font-size'),
  placement:el.dataset.placement,rect:{x:el.getBBox().x,y:el.getBBox().y,w:el.getBBox().width,h:el.getBBox().height}
 })));
 const towns=JSON.parse(await readFile(new URL('../assets/map-base.json',import.meta.url),'utf8')).towns.filter(f=>f.county==='高雄市');
 assert.equal(names.length,38);
 assert.deepEqual(new Set(names.map(x=>x.text)),new Set(towns.map(f=>f.name)));
 assert.ok(names.every(l=>!l.number),'Full labels must not be replaced with numeric lookup keys');
 assert.ok(names.some(l=>l.placement==='inside'),'Large towns should be labelled inside the polygon');
 assert.ok(names.some(l=>l.placement==='outside'),'Small towns should use callout lines');
 const leaders=await page.locator('#labels [data-label-leader]').count();
 assert.equal(leaders,names.filter(l=>l.placement==='outside').length);
 assert.equal(await page.locator('#mapNumberKey').isVisible(),false);
 for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
  const a=names[i].rect,b=names[j].rect;
  assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),
   'Overlapping names: '+names[i].text+' / '+names[j].text);
 }
 const svg=await exportSvg(page);
 const result=await page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  return{
   labels:[...doc.querySelectorAll('text[data-label]')].map(x=>x.textContent),
   numbers:doc.querySelectorAll('[data-number-key],[data-map-number-key]').length,
   leaders:doc.querySelectorAll('[data-label-leader]').length
  };
 },svg);
 assert.equal(result.numbers,0);
 assert.deepEqual(new Set(result.labels),new Set(towns.map(f=>f.name)));
 assert.ok(result.leaders>0);
});

test('All 22 scoped mayoral township maps display complete township names without number keys',async t=>{
 const page=await pageFor(t);
 await page.locator('#predictionScale').selectOption('overlay');
 for(const county of counties){
  await page.locator('#county').selectOption({label:county});
  const result=await page.evaluate(()=>({
   total:currentItems().length,
   labelled:new Set([...document.querySelectorAll('#labels text[data-label]')].map(e=>e.dataset.label)).size,
   numbers:document.querySelectorAll('#labels [data-number-key]').length,
   visibleKey:!document.querySelector('#mapNumberKey').hidden
  }));
  assert.ok(result.total>0,county+' has no town geometries');
  assert.equal(result.labelled,result.total,county+' township names missing');
  assert.equal(result.numbers,0,county+' uses numbered labels');
  assert.equal(result.visibleKey,false,county+' still shows a number key');
 }
});

test('Township chief maps use complete names and a non-numeric legend for each township',async t=>{
 const page=await pageFor(t);
 await page.locator('#predictionOffice').selectOption('township');
 for(const county of ['宜兰县','苗栗县','彰化县','南投县','屏东县']){
  await page.locator('#county').selectOption({label:county});
  const r=await page.evaluate(()=>({
   count:currentItems().length,
   names:[...document.querySelectorAll('#labels text[data-label]')].map(e=>e.textContent),
   numbers:document.querySelectorAll('#labels [data-number-key]').length,
   keyHidden:document.querySelector('#mapNumberKey').hidden,
   leaders:document.querySelectorAll('#labels [data-label-leader]').length
  }));
  assert.ok(r.count>0,county+' should have townships');
  assert.equal(r.names.length,r.count,county+' names must cover all towns');
  assert.equal(r.numbers,0,county+' must not display numeric town labels');
  assert.equal(r.keyHidden,true,county+' should have no numeric lookup');
  assert.ok(r.names.some(n=>/[乡镇市区]$/.test(n)));
 }
});
test('Zooming the national council overview recalculates and restores all 221 official numbers',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('council');await page.waitForFunction(()=>document.querySelectorAll('#regions [data-region]').length===221);
 await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();assert.deepEqual(await missingLabels(page),[]);
 await page.locator('#fit').click();await page.locator('#county').selectOption({label:'高雄市'});assert.deepEqual(await missingLabels(page),[]);
});
test('Mobile township maps retain full names and do not show numeric lookup tables',async t=>{
 const page=await pageFor(t,{width:390,height:844});
 await page.locator('#county').selectOption({label:'高雄市'});
 await page.locator('#predictionScale').selectOption('overlay');
 assert.deepEqual(await missingLabels(page),[]);
 assert.equal(await page.locator('#labels [data-number-key]').count(),0);
 assert.equal(await page.locator('#mapNumberKey').isVisible(),false);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
});
