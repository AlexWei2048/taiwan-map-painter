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
async function pageFor(t,viewport,owner=true){
 const context=await browser.newContext(viewport?{viewport}:{});t.after(()=>context.close());
 const page=await context.newPage(),errors=[];
 if(owner)await page.route('**/history-access.js*',route=>route.fulfill({contentType:'application/javascript',body:'window.HistoryAccess={ready:Promise.resolve(true),canAccess:()=>true,notice:()=>{}};'}));page.on('pageerror',error=>errors.push(error.message));
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
test('Nationwide mayor map identifies all 22 counties by an interior name or its complete number key',async t=>{
 const page=await pageFor(t);await page.waitForFunction(()=>document.querySelectorAll('#labels [data-label]').length===22);
 const result=await assertAdministrativeKey(page);assert.equal(result.total,22);assert.ok(result.numbers>0);
 const invalid=await page.evaluate(()=>[...document.querySelectorAll('#labels text[data-label]:not([data-number-key]):not([data-placement="inset-bottom"])')].filter(el=>{
  const polygon=document.querySelector('#regions [data-region="'+el.dataset.label+'"]');
  const r=el.getBoundingClientRect(),inv=polygon.getScreenCTM().inverse();
  return ![-.3,0,.3].every(dx=>[-.3,0,.3].every(dy=>{
   const p=new DOMPoint((r.left+r.right)/2+dx*r.width,(r.top+r.bottom)/2+dy*r.height).matrixTransform(inv);
   return polygon.isPointInFill(p);
  }));
 }).map(el=>el.textContent));
 assert.deepEqual(invalid,[]);
 const svg=await exportSvg(page);
 const names=await page.evaluate(()=>data.counties.map(f=>f.name));
 for(const name of names)assert.ok(svg.includes(name),'Export identifies '+name);
});
test('Nationwide mayor township map colours each town from its own saved forecast, without inheriting county results',async t=>{
 const page=await pageFor(t);
 await selectMayor(page);
 await page.locator('#county').selectOption('');
 const countyWinner=await page.evaluate(()=>state.predictions['mayor:63000']?.winners?.[0]);
 assert.ok(countyWinner,'A countywide mayor prediction was saved');
 await page.locator('#predictionScale').selectOption('overlay');
 const nationwide=await page.evaluate(()=>({
  local:localPredictionActive(),office:state.predictionOffice,county:state.county,
  level:state.level,scale:state.predictionScale,
  count:currentItems().length,expected:data.towns.length,
  ids:currentItems().map(f=>f.id),fills:[...document.querySelectorAll('#regions path[data-region]')].map(e=>e.getAttribute('fill')),
  options:[...document.querySelector('#predictionScale').options].map(e=>e.textContent)
 }));
 assert.equal(nationwide.local,true);
 assert.equal(nationwide.office,'mayor');assert.equal(nationwide.county,'');
 assert.equal(nationwide.level,'towns');assert.equal(nationwide.scale,'overlay');
 assert.equal(nationwide.count,nationwide.expected);
 assert.ok(nationwide.count>300,'Every township is displayed, not only 22 county outlines');
 assert.equal(new Set(nationwide.ids).size,nationwide.count);
 assert.ok(nationwide.fills.every(color=>color==='#edf1e9'),'Countywide winner is not automatically assigned to towns');
 assert.deepEqual(nationwide.options,['县市','乡镇市区']);
 const townId=await page.evaluate(()=>data.towns.find(f=>f.county==='台北市'&&f.name==='中正区').id);
 await page.locator('#regions path[data-region="'+townId+'"]').dispatchEvent('click');
 await page.locator('#localDialog').waitFor({state:'visible'});
 await page.getByRole('radio',{name:'预测蒋万安胜出',exact:true}).check();
 await page.locator('#saveLocal').click();
 const saved=await page.evaluate(id=>{
  const f=currentItems().find(f=>f.id===id);
  const record=localRecord(directoryDistrictById.get(f.parentDistrictId),f);
  return{
   county:state.county,fill:document.querySelector('#regions path[data-region="'+id+'"]')?.getAttribute('fill'),
   winner:record.leaderId,countyWinner:state.predictions['mayor:63000']?.winners||[],
   legend:document.querySelector('#legend')?.textContent||'',
   rows:exportPredictionWinnerRows().map(r=>({district:r.district,name:r.name,local:r.local}))
  };
 },townId);
 assert.equal(saved.county,'');assert.ok(saved.winner);
 assert.notEqual(saved.fill,'#edf1e9','National map must immediately show the saved town result');
 assert.ok(saved.countyWinner.includes(countyWinner));
 assert.ok(saved.rows.some(r=>r.local&&r.district.includes('台北市')&&r.name==='蒋万安'));
 assert.match(saved.legend,/乡镇市区/);
 const svg=await exportSvg(page);
 assert.match(svg,/蒋万安/);
 await page.locator('#county').selectOption({label:'高雄市'});
 assert.equal(await page.evaluate(()=>localPredictionActive()),true);
 assert.ok(await page.locator('#regions path[data-region]').count()>20);
 await page.locator('#county').selectOption('');
 assert.equal(await page.evaluate(()=>localPredictionActive()),true);
 assert.equal(await page.locator('#regions path[data-region="'+townId+'"]').getAttribute('fill'),saved.fill);
 await page.locator('#predictionScale').selectOption('district');
 assert.equal(await page.evaluate(()=>state.level),'counties');
 assert.ok(await page.locator('#regions path[data-region]').evaluateAll(els=>els.some(e=>e.getAttribute('fill')!=='#edf1e9')),'County-level predictions remain independent');
});
test('Mayor township county return control restores the full national map with existing town colours',async t=>{
 const page=await pageFor(t),back=page.locator('#returnTaiwanMap');
 assert.equal(await back.count(),1);
 assert.equal(await back.isVisible(),false);
 await page.locator('#predictionScale').selectOption('overlay');
 assert.equal(await back.isVisible(),false);
 assert.ok(await page.locator('#regions path[data-region]').count()>300);
 await page.locator('#county').selectOption({label:'台北市'});
 assert.equal(await back.isVisible(),true);
 assert.equal(await page.getByRole('button',{name:'返回全台地图',exact:true}).count(),1);
 const geometry=await page.evaluate(()=>{
  const r=document.querySelector('#returnTaiwanMap').getBoundingClientRect();
  const canvas=document.querySelector('#canvas').getBoundingClientRect();
  const info=document.querySelector('.canvas-info').getBoundingClientRect();
  return{inside:r.left>=canvas.left&&r.right<=canvas.right&&r.top>=canvas.top&&r.bottom<=canvas.bottom,
   belowInfo:r.top>=info.bottom};
 });
 assert.equal(geometry.inside,true);assert.equal(geometry.belowInfo,true);
 const id=await page.locator('#regions path[data-region]').first().getAttribute('data-region');
 await page.locator('#regions path[data-region="'+id+'"]').dispatchEvent('click');
 await page.getByRole('radio',{name:'预测蒋万安胜出',exact:true}).check();
 await page.locator('#saveLocal').click();
 const before=await page.locator('#regions path[data-region="'+id+'"]').getAttribute('fill');
 assert.notEqual(before,'#edf1e9');
 await back.click();
 assert.equal(await back.isVisible(),false);
 const after=await page.evaluate(id=>{
  const f=currentItems().find(f=>f.id===id);
  return{county:state.county,level:state.level,scale:state.predictionScale,
   local:localPredictionActive(),count:currentItems().length,expected:data.towns.length,
   fill:document.querySelector('#regions path[data-region="'+id+'"]')?.getAttribute('fill'),
   winner:localRecord(directoryDistrictById.get(f.parentDistrictId),f).leaderId};
 },id);
 assert.equal(after.county,'');assert.equal(after.level,'towns');assert.equal(after.scale,'overlay');
 assert.equal(after.local,true);assert.equal(after.count,after.expected);
 assert.ok(after.winner);assert.equal(after.fill,before);
 await page.locator('#county').selectOption({label:'台北市'});
 assert.equal(await back.isVisible(),true);
 assert.equal(await page.locator('#regions path[data-region="'+id+'"]').getAttribute('fill'),before);
 await page.locator('#predictionScale').selectOption('district');
 assert.equal(await back.isVisible(),false);
 await page.locator('#predictionOffice').selectOption('council');
 assert.equal(await back.isVisible(),true);
 await back.click();
 assert.equal(await page.locator('#county').inputValue(),'');
 assert.equal(await back.isVisible(),false);
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
 assert.equal((svg.match(/data-export-winner-entry=/g)||[]).length,6);assert.equal((svg.match(/data-export-winner-row=/g)||[]).length,3);
 await page.locator('#predictionDisplay').selectOption('composition');assert.match(await page.locator('#predictionCoverage').innerText(),/已选当选人 1\/1/);
 assert.match(await page.locator('#legend').textContent(),/中国国民党（1席）/);
 await page.reload();await page.locator('#regions path').first().waitFor();assert.match(await page.locator('#predictionCoverage').innerText(),/已选当选人 1\/1/);
});
test('Unified forecast selectors and exclusive metric columns work in district and township dialogs',async t=>{
 const page=await pageFor(t);
 for(const office of ['mayor','council','township']){
  await page.locator('#predictionOffice').selectOption(office);
  if(office==='council'){assert.deepEqual(await page.locator('#predictionDisplay option').allTextContents(),['预测胜负']);continue}
  assert.deepEqual(await page.locator('#predictionDisplay option').allTextContents(),['预测胜负','预测得票']);
  await page.locator('#predictionDisplay').selectOption('topVote');
  assert.equal(await page.locator('#predictionCandidateScope').isVisible(),true);
  assert.deepEqual(await page.locator('#predictionCandidateScope option').allTextContents(),['所有候选人','指定候选人']);
  await page.locator('#predictionCandidateScope').selectOption('candidateVote');
  assert.equal(await page.locator('#localCandidate').isVisible(),true);
  await page.locator('#predictionCandidateScope').selectOption('topVote');
 }
 await page.locator('#predictionOffice').selectOption('mayor');
 await page.locator('#county').selectOption({label:'台北市'});
 await page.locator('#predictionDisplay').selectOption('topVote');
 await page.locator('#editPrediction').click();
 assert.equal(await page.locator('#predictionVoteMetric').isVisible(),true);
 await page.locator('#predictionVoteMetric').selectOption('votes');
 assert.equal(await page.getByRole('spinbutton',{name:'蒋万安预测得票数',exact:true}).isVisible(),true);
 assert.equal(await page.getByRole('spinbutton',{name:'蒋万安预测得票率',exact:true}).isVisible(),false);
 await page.getByRole('spinbutton',{name:'蒋万安预测得票数',exact:true}).fill('100');
 await page.locator('#predictionVoteMetric').selectOption('share');
 assert.equal(await page.getByRole('spinbutton',{name:'蒋万安预测得票数',exact:true}).isVisible(),false);
 assert.equal(await page.getByRole('spinbutton',{name:'蒋万安预测得票率',exact:true}).isVisible(),true);
 await page.getByRole('spinbutton',{name:'蒋万安预测得票率',exact:true}).fill('48');
 await page.locator('#savePrediction').click();
 const saved=await page.evaluate(()=>Object.values(state.predictions[state.predictionRegion]?.estimates||{}));
 assert.ok(saved.some(item=>item.share===48&&item.votes===null));
 assert.ok(saved.every(item=>item.votes===null));
 await page.locator('#predictionScale').selectOption('overlay');
 await page.locator('#county').selectOption({label:'台北市'});
 await page.locator('#predictionDisplay').selectOption('topVote');
 await page.locator('#editPrediction').click();
 assert.equal(await page.locator('#localVoteMetric').isVisible(),true);
 await page.locator('#localVoteMetric').selectOption('votes');
 assert.equal(await page.locator('#localRows input[aria-label$="预测得票数"]').first().isVisible(),true);
 assert.equal(await page.locator('#localRows input[aria-label$="预测得票率"]').first().isVisible(),false);
 await page.locator('#localVoteMetric').selectOption('share');
 assert.equal(await page.locator('#localRows input[aria-label$="预测得票数"]').first().isVisible(),false);
 assert.equal(await page.locator('#localRows input[aria-label$="预测得票率"]').first().isVisible(),true);
 await page.locator('#cancelLocal').click();
});

test('Specified candidate export contains only the chosen candidate and entered vote rate',async t=>{
 const page=await pageFor(t);
 await page.locator('#county').selectOption({label:'台北市'});
 await page.locator('#predictionDisplay').selectOption('topVote');
 await page.locator('#editPrediction').click();
 await page.getByRole('spinbutton',{name:'蒋万安预测得票率',exact:true}).fill('56');
 await page.locator('#savePrediction').click();
 await page.locator('#predictionCandidateScope').selectOption('candidateVote');
 const selectedId=await page.locator('#localCandidate option').evaluateAll(options=>options.find(option=>option.textContent.includes('沈伯洋'))?.value);
 assert.ok(selectedId,'Chosen candidate appears in picker');
 await page.locator('#localCandidate').selectOption(selectedId);
 await page.locator('#editPrediction').click();
 assert.equal(await page.getByRole('spinbutton',{name:'蒋万安预测得票率',exact:true}).isVisible(),false);
 await page.getByRole('spinbutton',{name:'沈伯洋预测得票率',exact:true}).fill('40');
 await page.locator('#savePrediction').click();
 assert.equal(await page.evaluate(()=>Object.values(state.predictions[state.predictionRegion]?.estimates||{}).filter(r=>r.share===56).length),1,
  'Editing one candidate keeps another candidate prediction');
 const ownRows=await page.evaluate(()=>exportPredictionWinnerRows().map(r=>({name:r.name,votes:r.votes,share:r.share,specified:r.specified})));
 assert.deepEqual(ownRows,[{name:'沈伯洋',votes:'—',share:'40%',specified:true}]);
 const svg=await exportSvg(page);
 const info=await page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  const table=doc.querySelector('[data-export-winner-table]');
  return {title:table?.textContent?.includes('指定候选人得票预测'),text:table?.textContent||'',rowCount:table?.querySelectorAll('[data-export-winner-row]').length};
 },svg);
 assert.equal(info.title,true);
 assert.equal(info.rowCount,1);
 assert.match(info.text,/沈伯洋/);
 assert.match(info.text,/40%/);
 assert.match(info.text,/预测得票率/);
 assert.doesNotMatch(info.text,/蒋万安|56%|预测得票数|标记/);
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
 assert.equal(result.estimatedStillLegacy,false);
});
test('2026 and 2022 district searches and CSV downloads survive mode switching',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('council');await page.locator('#county').selectOption({label:'台北市'});
 await page.waitForFunction(()=>document.querySelectorAll('#regions path[data-region]').length===8);
 await page.locator('#districtTableSearch').fill('北投');assert.equal(await page.locator('#districtTableGroups tbody tr').count(),1);
 assert.equal(ElectionCore.csv(await download(page,'#downloadDistrictTable')).length,2);
 await page.locator('#categoryHistory').click();await page.locator('#historyOffice').selectOption('council');await page.locator('#historyCounty').selectOption({label:'台北市'});await page.locator('#districtTableSearch').fill('');
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('61席'));
 const colors=await page.locator('#regions path[data-region]').evaluateAll(elements=>elements.map(e=>e.getAttribute('fill')));assert.equal(colors.length,8);assert.ok(colors.every(color=>color==='#f0f3ed'));assert.equal(await page.locator('[data-seat-status="elected"]').count(),61);
 const csv=await download(page,'#downloadDistrictTable');assert.equal(ElectionCore.csv(csv).length,9);assert.ok(!csv.includes('\\r\\n'));
 await page.locator('#categoryFuture').click();await page.locator('#districtTableSearch').fill('');assert.match(await page.locator('#districtReferenceTitle').textContent(),/台北市议员/);
 assert.equal(ElectionCore.csv(await download(page,'#downloadDistrictTable')).length,9);
});
test('Historical detail insets use the same party colors as their main map',async t=>{
 const page=await pageFor(t);await page.locator('#categoryHistory').click();await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('22席'));
 const svg=await exportSvg(page);
 const colors=await page.evaluate(source=>{const doc=new DOMParser().parseFromString(source,'image/svg+xml');appendExportDetailInsets(doc.documentElement,currentItems(),['10017','63000','10018'],0,1120);return['基隆市','台北市','新竹市'].map((county,i)=>({main:doc.querySelector('[data-region="'+['10017','63000','10018'][i]+'"]')?.getAttribute('fill'),detail:doc.querySelector('[data-export-detail-map="'+county+'"] path')?.getAttribute('fill')}))},svg);
 assert.ok(colors.every(row=>row.main&&row.main===row.detail&&row.detail!=='#edf1e9'));
});
test('Compact export and preview are available at mobile width',async t=>{
 const page=await pageFor(t,{width:390,height:844});await page.locator('.export-menu summary').click();assert.equal(await page.locator('#exportSvg').isVisible(),true);
 assert.equal(await page.locator('#exportLayout').count(),0);await page.locator('#previewExport').click();assert.equal(await page.locator('#previewLayout').count(),0);await page.waitForFunction(()=>document.querySelector('#exportPreviewStatus').textContent.includes('像素'));
 assert.equal(await page.locator('#exportPreviewImage').isVisible(),true);await page.locator('#closeExportPreview').click();
 await page.evaluate(()=>{state.exportSettings.layout='complete'});
 const svg=await exportSvg(page);assert.ok(!svg.includes('data-export-detail-maps'));assert.ok(svg.includes('data-map-number-key='),'Compact exports preserve every administrative number mapping');
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
async function assertAdministrativeKey(page){
 const r=await page.evaluate(()=>{
  const items=currentItems(),labels=[...document.querySelectorAll('#labels text[data-label]')];
  const rows=[...document.querySelectorAll('#mapNumberKeyRows tr')].map(tr=>({number:tr.querySelector('th').textContent,name:tr.querySelector('td').textContent}));
  const bad=[];
  for(const el of labels){
   const f=items.find(f=>String(f.id)===el.dataset.label);if(!f)continue;
   if(el.dataset.numberKey){
    const row=rows.find(row=>row.number===el.dataset.numberKey);
    if(!row||!row.name.includes(f.name))bad.push(f.name+' missing from key');
   }else if(el.textContent!==f.name)bad.push(f.name+' wrong name');
  }
  const key=document.querySelector('#mapNumberKey'),legend=document.querySelector('#legend');
  return{total:items.length,labelled:labels.length,numbers:labels.filter(el=>el.dataset.numberKey).length,
   rows:rows.length,bad,above:key.hidden||key.getBoundingClientRect().bottom<=legend.getBoundingClientRect().top+1};
 });
 assert.equal(r.labelled,r.total);assert.deepEqual(r.bad,[]);assert.equal(r.rows,r.numbers);assert.ok(r.above);
 return r;
}
test('Dense administrative names fall back to numbers with a complete key above the legend and in exports',async t=>{
 const page=await pageFor(t);await page.locator('#county').selectOption({label:'高雄市'});
 await page.locator('#predictionScale').selectOption('overlay');
 const r=await assertAdministrativeKey(page);assert.equal(r.total,38);assert.ok(r.numbers>0);
 const svg=await exportSvg(page);
 const exported=await page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  return{key:doc.querySelectorAll('[data-map-number-key]').length,
   numbers:doc.querySelectorAll('[data-number-key]').length,
   below:!!doc.querySelector('[data-export-legend-below-key]'),
   text:doc.querySelector('[data-map-number-key]')?.textContent};
 },svg);
 assert.equal(exported.key,1);assert.equal(exported.numbers,r.numbers);assert.equal(exported.below,true);
 assert.ok(exported.text.includes('行政区索引'));
});

test('Town label hover highlights the matching polygon and restores its prediction fill',async t=>{
 const page=await pageFor(t);
 await page.locator('#county').selectOption({label:'高雄市'});
 await page.locator('#predictionScale').selectOption('overlay');
 const labels=page.locator('#labels text[data-label]');
 const candidate=await labels.evaluateAll(nodes=>nodes.find(e=>e.dataset.placement==='inside')?.dataset.label);
 assert.ok(candidate,'Need an inside town label to test pointer hover');
 const label=page.locator('#labels text[data-label="'+candidate+'"]');
 const polygon=page.locator('#regions path[data-region="'+candidate+'"]');
 const baseline=await polygon.evaluate(e=>getComputedStyle(e).fill);
 await label.hover({force:true});
 await page.waitForFunction(({id,baseline})=>{
  const el=[...document.querySelectorAll('#regions path[data-region]')].find(x=>x.dataset.region===id);
  return el&&el.classList.contains('label-region-highlighted')&&getComputedStyle(el).fill!==baseline;
 },{id:candidate,baseline},{timeout:1500});
 const during=await polygon.evaluate(e=>({fill:getComputedStyle(e).fill,className:e.classList.contains('label-region-highlighted')}));
 assert.equal(during.className,true);
 assert.notEqual(during.fill,baseline,'Hover must visibly change the corresponding map polygon');
 const others=await page.locator('#regions path[data-region]').evaluateAll(els=>els.filter(e=>e.classList.contains('label-region-highlighted')).map(e=>e.dataset.region));
 assert.deepEqual(others,[candidate],'Hover must highlight only the name’s town');
 await page.mouse.move(2,2);
 await page.waitForFunction(({id,baseline})=>{
  const el=[...document.querySelectorAll('#regions path[data-region]')].find(x=>x.dataset.region===id);
  return el&&!el.classList.contains('label-region-highlighted')&&getComputedStyle(el).fill===baseline;
 },{id:candidate,baseline},{timeout:1500});
 assert.equal(await polygon.evaluate(e=>getComputedStyle(e).fill),baseline,'Leaving restores the exact election fill');
 await label.focus();
 assert.equal(await polygon.evaluate(e=>e.classList.contains('label-region-highlighted')),true);
 await label.blur();
 assert.equal(await polygon.evaluate(e=>e.classList.contains('label-region-highlighted')),false);
 await page.locator('#predictionOffice').selectOption('township');
 await page.locator('#county').selectOption({label:'宜兰县'});
 const next=await page.locator('#labels text[data-label]').first().getAttribute('data-label');
 const townLabel=page.locator('#labels text[data-label="'+next+'"]');
 const townShape=page.locator('#regions path[data-region="'+next+'"]');
 const initial=await townShape.evaluate(e=>getComputedStyle(e).fill);
 await townLabel.hover({force:true});
 await page.waitForFunction(({id,initial})=>{
  const el=[...document.querySelectorAll('#regions path[data-region]')].find(x=>x.dataset.region===id);
  return el&&el.classList.contains('label-region-highlighted')&&getComputedStyle(el).fill!==initial;
 },{id:next,initial},{timeout:1500});
 assert.notEqual(await townShape.evaluate(e=>getComputedStyle(e).fill),initial);
 await page.mouse.move(2,2);
 await page.waitForFunction(({id,initial})=>{
  const el=[...document.querySelectorAll('#regions path[data-region]')].find(x=>x.dataset.region===id);
  return el&&!el.classList.contains('label-region-highlighted')&&getComputedStyle(el).fill===initial;
 },{id:next,initial},{timeout:1500});
 assert.equal(await townShape.evaluate(e=>getComputedStyle(e).fill),initial);
});

test('All 22 mayoral township views keep every name or its matching number',async t=>{
 const page=await pageFor(t);await page.locator('#predictionScale').selectOption('overlay');
 for(const county of counties){
  await page.locator('#county').selectOption({label:county});await assertAdministrativeKey(page);
 }
});
test('Township-chief maps use the same name-or-number rule in every eligible county',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('township');
 const eligible=await page.locator('#county option').evaluateAll(opts=>opts.filter(o=>o.value).map(o=>o.value));
 for(const value of eligible){await page.locator('#county').selectOption(value);await assertAdministrativeKey(page)}
});
test('National council overview labels counties while county views retain all official district labels',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('council');
 await page.waitForFunction(()=>document.querySelectorAll('#regions [data-region]').length===22);
 assert.equal(await page.locator('#insetFrames [data-electorate]').count(),0);
 const national=()=>page.locator('#labels text[data-label]').evaluateAll(els=>els.map(e=>({text:e.textContent,official:e.dataset.placement==='district-number'})));
 for(const q of await national()){assert.equal(q.official,false);assert.match(q.text,/[县市]$/)}
 await page.locator('#zoomIn').click();await page.locator('#fit').click();
 for(const q of await national())assert.match(q.text,/[县市]$/);
 const saved=await page.evaluate(()=>JSON.stringify(state.predictions));
 await page.locator('#regions path[aria-label^="高雄市"]').click({force:true});
 assert.equal(await page.locator('#county').inputValue(),'高雄市');
 assert.equal(await page.locator('#predictionDialog').isVisible(),false);
 assert.deepEqual(await missingLabels(page),[]);
 assert.equal(await page.locator('#returnTaiwanMap').isVisible(),true);
 await page.locator('#returnTaiwanMap').click();
 assert.equal(await page.locator('#county').inputValue(),'');
 assert.equal(await page.locator('#regions path[data-region]').count(),22);
 assert.equal(await page.evaluate(()=>JSON.stringify(state.predictions)),saved);
});
test('Mobile administrative keys stay inside the screen above the legend',async t=>{
 const page=await pageFor(t,{width:390,height:844});
 await page.locator('#county').selectOption({label:'高雄市'});await page.locator('#predictionScale').selectOption('overlay');
 const r=await assertAdministrativeKey(page);assert.ok(r.numbers>0);
 assert.ok(await page.evaluate(()=>{
  const key=document.querySelector('#mapNumberKey').getBoundingClientRect();
  return key.left>=0&&key.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;
 }));
});

test('Nationwide administrative labels keep mainland references outside island frames and centre offshore county titles at frame bottoms',async t=>{
 const page=await pageFor(t);
 const r=await page.evaluate(()=>{
  const frames=[...document.querySelectorAll('#insetFrames [data-inset]')].map(el=>({name:el.dataset.inset,box:el.getBoundingClientRect()}));
  const overlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const labels=[...document.querySelectorAll('#labels text[data-label]')];
  const hsinchu=labels.find(el=>el.dataset.label==='10018');
  return{hsinchu:!!hsinchu,clear:!!hsinchu&&frames.every(f=>!overlap(hsinchu.getBoundingClientRect(),f.box)),
   offshore:[['金门县','金门'],['连江县','马祖'],['澎湖县','澎湖']].map(([name,inset])=>{
    const el=labels.find(el=>el.textContent===name),frame=frames.find(f=>f.name===inset)?.box,b=el?.getBoundingClientRect();
    return{name,number:el?.dataset.numberKey||'',placement:el?.dataset.placement,
     inside:!!b&&b.left>=frame.left&&b.right<=frame.right&&b.top>=frame.top&&b.bottom<=frame.bottom,
     centred:!!b&&Math.abs((b.left+b.right-frame.left-frame.right)/2)<2};
   })};
 });
 assert.equal(r.hsinchu,true);assert.equal(r.clear,true);
 for(const f of r.offshore){assert.equal(f.number,'');assert.equal(f.placement,'inset-bottom');assert.ok(f.inside&&f.centred,f.name)}
 const svg=await exportSvg(page);assert.equal((svg.match(/data-placement="inset-bottom"/g)||[]).length,3);
});
test('Offshore township maps omit inset frames and identify all townships with interior or nearby labels',async t=>{
 const page=await pageFor(t);await page.locator('#predictionScale').selectOption('overlay');
 for(const county of ['金门县','连江县','澎湖县']){
  await page.locator('#county').selectOption({label:county});
  await assertAdministrativeKey(page);
  assert.equal(await page.locator('#insetFrames [data-inset]').count(),0,county+' must not have island frames');
  const near=await page.locator('#labels text[data-callout-lane="island-near"]').count();assert.ok(near>0,county+' uses nearby island names');
  const svg=await exportSvg(page);assert.equal((svg.match(/data-inset=/g)||[]).length,0);
 }
});

test('Administrative index supports bidirectional hover, keyboard focus and the same edit action as the map',async t=>{
 const page=await pageFor(t);await page.locator('#county').selectOption({label:'高雄市'});
 await page.locator('#predictionScale').selectOption('overlay');
 const row=page.locator('#mapNumberKeyRows tr').first(),id=await row.getAttribute('data-region');
 const polygon=page.locator('#regions path[data-region="'+id+'"]');
 await row.hover();assert.equal(await polygon.evaluate(el=>el.classList.contains('label-region-highlighted')),true);
 await page.mouse.move(1,1);assert.equal(await polygon.evaluate(el=>el.classList.contains('label-region-highlighted')),false);
 await polygon.hover({force:true});assert.equal(await row.evaluate(el=>el.classList.contains('number-key-highlighted')),true);
 await page.mouse.move(1,1);const button=row.locator('button');await button.focus();
 assert.equal(await polygon.evaluate(el=>el.classList.contains('label-region-highlighted')),true);
 await button.press('Enter');await page.locator('#localDialog').waitFor({state:'visible'});
});
test('Taitung and Pingtung island townships have centred full-name captions below the island in screen and export',async t=>{
 const page=await pageFor(t);await page.locator('#predictionScale').selectOption('overlay');
 for(const [county,names]of [['台东县',['绿岛乡','兰屿乡']],['屏东县',['琉球乡']]]){
  await page.locator('#county').selectOption({label:county});
  const metrics=await page.evaluate(names=>{
   const items=currentItems(),t=geometryLayout(items,true);
   return names.map(name=>{
    const f=items.find(f=>f.name===name),el=document.querySelector('#labels text[data-label="'+f.id+'"]');
    const b=el.getBBox();return{name,text:el.textContent,number:el.dataset.numberKey||'',placement:el.dataset.placement,
     centred:Math.abs(Number(el.getAttribute('x'))-((f.box[0]+f.box[2])/2*t.scale+t.tx))<.1,
     below:b.y>f.box[3]*t.scale+t.ty};
   });
  },names);
  for(const q of metrics){assert.equal(q.text,q.name);assert.equal(q.number,'');assert.equal(q.placement,'island-town-bottom');assert.ok(q.centred&&q.below)}
  const svg=await exportSvg(page);assert.equal((svg.match(/data-placement="island-town-bottom"/g)||[]).length,names.length);
 }
});

test('Township-chief maps show white for ineligible areas while retaining eligible municipal district elections and exports',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('township');
 const result=await page.evaluate(()=>{
  const get=(county,name)=>{
   const f=data.towns.find(f=>f.county===county&&f.name===name);
   return {id:f.id,fill:document.querySelector('#regions path[data-region="'+f.id+'"]')?.getAttribute('fill')};
  };
  return{excluded:get('台北市','中正区'),urban:get('桃园市','桃园区'),included:get('桃园市','复兴区'),
   legend:document.querySelector('[data-no-township-election-legend]')?.textContent};
 });
 assert.equal(result.excluded.fill,'#ffffff');assert.equal(result.urban.fill,'#ffffff');
 assert.equal(result.included.fill,'#edf1e9');assert.equal(result.legend,'无乡镇市区长选举');
 const source=await exportSvg(page);
 const exported=await page.evaluate(({source,id})=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  return {fill:doc.querySelector('[data-region="'+id+'"]')?.getAttribute('fill'),legend:!!doc.querySelector('[data-no-township-election-legend]')};
 },{source,id:result.excluded.id});
 assert.equal(exported.fill,'#ffffff');assert.equal(exported.legend,true);
 await page.locator('#solidMode').click();
 assert.equal(await page.locator('#regions path[data-region="'+result.excluded.id+'"]').getAttribute('fill'),'#ffffff');
 await page.locator('#workspaceFree').click();
 await page.locator('#county').selectOption({label:'台北市'});
 assert.notEqual(await page.locator('#regions path[data-region="'+result.excluded.id+'"]').getAttribute('fill'),'#ffffff');
});

test('Township national map drills into a county without opening predictions and returns without changing data',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('township');
 const before=await page.evaluate(()=>JSON.stringify({predictions:state.predictions,fills:state.fills}));
 const id=await page.evaluate(()=>data.towns.find(f=>f.county==='宜兰县'&&f.name==='大同乡').id);
 await page.locator('#regions path[data-region="'+id+'"]').click({force:true});
 assert.equal(await page.locator('#county').inputValue(),'宜兰县');
 assert.equal(await page.locator('#predictionDialog').isVisible(),false);
 assert.equal(await page.locator('#returnTaiwanMap').isVisible(),true);
 await page.locator('#returnTaiwanMap').click();assert.equal(await page.locator('#county').inputValue(),'');
 assert.equal(await page.locator('#returnTaiwanMap').isVisible(),false);
 assert.equal(await page.evaluate(()=>JSON.stringify({predictions:state.predictions,fills:state.fills})),before);
 // A county without any eligible township-chief election is still a valid map scope.
 await page.locator('#county').selectOption({label:'台北市'});
 assert.equal(await page.locator('#returnTaiwanMap').isVisible(),true);
 assert.ok(await page.locator('#regions path[data-region]').count()>0);
 assert.ok((await page.locator('#regions path[data-region]').evaluateAll(els=>els.map(el=>el.getAttribute('fill')))).every(fill=>fill==='#ffffff'));
 await page.locator('#returnTaiwanMap').click();assert.equal(await page.locator('#county').inputValue(),'');
});


test('Council forecasts only offer winners and county overview uses saved party seat leaders',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('council');
 assert.deepEqual(await page.locator('#predictionDisplay option').evaluateAll(els=>els.map(e=>e.value)),['composition']);
 assert.equal(await page.locator('#predictionScaleBox').isVisible(),false);
 await page.locator('#county').selectOption({label:'台北市'});
 await page.locator('#editPrediction').click();
 assert.equal(await page.locator('#predictionVoteMetricBox').isVisible(),false);
 assert.equal(await page.locator('#predictionAutoTotal').isVisible(),false);
 assert.equal(await page.locator('#predictionRows input[type=number]:enabled').count(),0);
 await page.locator('#cancelPrediction').click();
 // Seed a valid partial choice through the same candidate and record schema used by the form.
 const expected=await page.evaluate(()=>{
  const d=predictionDistricts()[0],c=directoryCandidates(d)[0];
  state.predictions[d.id]={winners:[c.id],estimates:{},method:'manual'};
  ensurePredictionParties();render();persist();
  return{color:predictionParty(c.party).color,party:predictionParty(c.party).id};
 });
 await page.locator('#returnTaiwanMap').click();
 assert.equal(await page.locator('#regions path[aria-label^="台北市"]').getAttribute('fill'),expected.color);
 assert.match(await page.locator('#regions path[aria-label^="台北市"]').getAttribute('aria-label'),/1席/);
 const count=await page.evaluate(id=>predictionPartyCounts()[id],expected.party);assert.equal(count,1);
 await page.reload();
 assert.equal(await page.locator('#regions path[aria-label^="台北市"]').getAttribute('fill'),expected.color);
});


test('Council seat maps show one same-size symbol per seat across all counties, with grouped party emblems and grey fallback',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('council');
 for(const county of counties){
  await page.locator('#county').selectOption({label:county});
  const r=await page.evaluate(()=>{
   const expected=predictionDistricts().map(d=>({id:d.id,seats:Number(d.seats)}));
   const groups=[...document.querySelectorAll('#labels [data-seat-district]')];
   const wrong=expected.filter(d=>groups.find(g=>g.dataset.seatDistrict===d.id)?.querySelectorAll('[data-seat-slot]').length!==d.seats);
   const area=sceneSpec();
   const clipped=groups.filter(g=>{const b=g.getBBox();return b.y+b.height>area.height-furnitureFooterHeight()||b.x<0||b.x+b.width>area.width}).map(g=>g.dataset.seatDistrict);
   const crossing=[];
   for(const panel of identityPanelLayouts())for(const f of panel.items){const g=groups.find(g=>g.dataset.seatRegion===f.id),frame=g?.querySelector('[data-seat-frame]');if(!frame)continue;const r=[Number(frame.getAttribute('x')),Number(frame.getAttribute('y')),Number(frame.getAttribute('x'))+Number(frame.getAttribute('width')),Number(frame.getAttribute('y'))+Number(frame.getAttribute('height'))];if(g.dataset.seatPlacement==='outside'){if(councilSeatRectTouchesLand(r,panel.items,panel.t))crossing.push(f.id);const d=predictionDistrictFor(f),dot=document.querySelector('[data-seat-anchor="'+d.id+'"]'),line=document.querySelector('[data-seat-leader="'+d.id+'"]');if(!dot||!line||!regionContains(f,Number(dot.getAttribute('cx')),Number(dot.getAttribute('cy')),panel.t))crossing.push(f.id+' missing interior anchor');if(dot&&!line?.getAttribute('d').startsWith('M'+dot.getAttribute('cx')+','+dot.getAttribute('cy')))crossing.push(f.id+' disconnected leader')}else{for(let y=r[1];y<=r[3];y+=6)for(let x=r[0];x<=r[2];x+=6)if(!regionContains(f,x,y,panel.t))crossing.push(f.id)}}
   return{wrong,clipped,crossing,count:groups.length,expected:expected.length};
  });
  assert.deepEqual(r.wrong,[],county);assert.deepEqual(r.crossing,[],county+' frames remain in own district or fully outside land');assert.deepEqual(r.clipped,[],county+' symbols fit canvas');assert.equal(r.count,r.expected);
 }
 await page.locator('#county').selectOption({label:'台北市'});
 const seeded=await page.evaluate(()=>{
  const d=predictionDistricts()[0],cs=directoryCandidates(d),major=cs.filter(c=>predictionParty(c.party).id==='blue').slice(0,2),other=cs.find(c=>c.party==='无党籍');
  state.predictions[d.id]={winners:[major[0].id,other.id,major[1].id],estimates:{}};render();
  const group=document.querySelector('[data-seat-district="'+d.id+'"]');
  const slots=[...group.querySelectorAll('[data-seat-status="predicted"]')];
  return{ids:slots.map(g=>g.dataset.seatParty),logos:group.querySelectorAll('[data-seat-logo]').length,grey:group.querySelectorAll('circle[fill="#91999f"]').length,empty:group.querySelectorAll('[data-seat-status="empty"]').length,seats:d.seats};
 });
 assert.deepEqual(seeded.ids,['blue','blue','gray']);assert.equal(seeded.logos,3);assert.equal(seeded.grey,0);assert.equal(seeded.empty,seeded.seats-3);
 await page.locator('#labels [data-seat-district]').first().click({force:true});assert.equal(await page.locator('#predictionDialog').isVisible(),true);await page.locator('#cancelPrediction').click();
 const svg=await exportSvg(page);assert.match(svg,/data-seat-slot/);assert.match(svg,/data-seat-logo/);
});


test('Hovering and keyboard-focusing a seat frame highlights only its matching map district',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('council');await page.locator('#county').selectOption({label:'台北市'});
 const group=page.locator('#labels [data-seat-district]').first(),id=await group.getAttribute('data-seat-region');
 const polygon=page.locator('#regions path[data-region="'+id+'"]');
 const before=await polygon.evaluate(e=>getComputedStyle(e).fill);
 await group.locator('[data-seat-frame]').hover();
 await page.waitForFunction(({id,before})=>{const p=document.querySelector('#regions path[data-region="'+id+'"]');return p.classList.contains('label-region-highlighted')&&getComputedStyle(p).fill!==before},{id,before});
 assert.equal(await polygon.evaluate(e=>e.classList.contains('label-region-highlighted')),true);
 assert.notEqual(await polygon.evaluate(e=>getComputedStyle(e).fill),before);
 assert.equal(await page.locator('#regions .label-region-highlighted').count(),1);
 assert.equal(await group.evaluate(e=>e.classList.contains('seat-region-highlighted')),true);
 await page.mouse.move(2,2);
 await page.waitForFunction(({id,before})=>getComputedStyle(document.querySelector('#regions path[data-region="'+id+'"]')).fill===before,{id,before});
 assert.equal(await polygon.evaluate(e=>getComputedStyle(e).fill),before);
 await group.focus();assert.equal(await polygon.evaluate(e=>e.classList.contains('label-region-highlighted')),true);
 await group.blur();await page.waitForFunction(({id,before})=>getComputedStyle(document.querySelector('#regions path[data-region="'+id+'"]')).fill===before,{id,before});assert.equal(await polygon.evaluate(e=>getComputedStyle(e).fill),before);
});


test('All 2026 township candidates have complete, source-traced ballot numbers without changing mayor or council totals',async t=>{
 const page=await pageFor(t);
 const status=await page.evaluate(()=>{
  const db=window.ELECTION_2026_DATA,byId=new Map(db.candidates.map(c=>[c.id,c]));
  const township=db.candidates.filter(c=>c.type==='township');
  const failures=db.districts.filter(d=>d.type==='township').flatMap(d=>{
   const numbers=d.candidateIds.map(id=>byId.get(id)?.number).sort((a,b)=>a-b);
   return numbers.length!==d.candidateIds.length||numbers.some((x,i)=>x!==i+1)?[d.name]:[];
  });
  const sample=Object.fromEntries([
   'township:64000:64000370:001',
   'township:64000:64000370:002',
   'township:64000:64000370:003',
   'township:64000:64000370:004',
   'township:10005:10005130:001',
   'township:10005:10005130:003',
   'township:10013:10013180:001'
  ].map(id=>[id,{number:byId.get(id)?.number,source:byId.get(id)?.numberSource}]));
  return {asOf:db.asOf,summary:db.summary,updates:db.ballotNumberAudit?.updates.length,
   pending:db.ballotNumberAudit?.pendingAfter,unresolved:db.ballotNumberAudit?.unresolved.length,
   townshipCount:township.length,stillPending:township.filter(c=>c.number==='待补').length,
   recentSourceCount:township.filter(c=>c.numberCheckedAt==='2026-11-08'&&c.numberSource).length,
   failures,sample};
 });
 assert.equal(status.asOf,'2026-11-08');
 assert.equal(status.summary.township.numbered,478);
 assert.equal(status.summary.mayor.numbered,81);
 assert.equal(status.summary.council.numbered,1492);
 assert.equal(status.townshipCount,478);
 assert.equal(status.stillPending,0);
 assert.equal(status.pending,0);
 assert.equal(status.unresolved,0);
 assert.equal(status.updates,64);
 assert.equal(status.recentSourceCount,64);
 assert.deepEqual(status.failures,[],'Every township district has a complete unique 1..N ballot sequence');
 assert.deepEqual([
  status.sample['township:64000:64000370:001'].number,
  status.sample['township:64000:64000370:002'].number,
  status.sample['township:64000:64000370:003'].number,
  status.sample['township:64000:64000370:004'].number
 ],[1,4,2,3],'Taoyuan indigenous-district name and candidate IDs retain correct ballot number mapping');
 assert.equal(status.sample['township:10005:10005130:001'].number,2);
 assert.equal(status.sample['township:10005:10005130:003'].number,3);
 assert.equal(status.sample['township:10013:10013180:001'].number,4);
 assert.ok(Object.values(status.sample).every(x=>x.source));
 assert.match(await page.locator('#ballotAuditStatus').textContent(),/本轮补齐 64 名/);
 assert.match(await page.locator('#downloadBallotAudit').textContent(),/核查记录/);
});
test('Free-paint nationwide township map displays the same township edges as the 2026 map',async t=>{
 const page=await pageFor(t);
 await page.locator('#workspaceFree').click();
 await page.locator('#townLevel').click();
 const baseline=await page.evaluate(()=>({
  overview:freeCountyOverview(),
  regions:document.querySelectorAll('#regions path[data-region]').length,
  township:document.querySelector('#districtBorders path[data-shared-boundary="towns"]')?.getAttribute('d'),
  county:document.querySelector('#borders path[data-shared-boundary="counties"]')?.getAttribute('d'),
  innerStroke:document.querySelector('#districtBorders path[data-shared-boundary="towns"]')?.getAttribute('stroke'),
  outerStroke:document.querySelector('#borders path[data-shared-boundary="counties"]')?.getAttribute('stroke'),
  requestedInner:state.townBorderColor,requestedOuter:state.countyBorderColor
 }));
 assert.equal(baseline.overview,true);
 assert.equal(baseline.regions,22,'Keep the existing county-colour navigation overview');
 assert.ok(baseline.township?.length>1000,'Render full internal township borders on the nationwide map');
 assert.ok(baseline.county?.length>100,'Keep the complete inter-county border overlay');
 assert.notEqual(baseline.township,baseline.county);
 assert.equal(baseline.innerStroke,baseline.requestedInner);
 assert.equal(baseline.outerStroke,baseline.requestedOuter);
 // Township outlines must remain present after a real free-paint edit and return.
 await page.locator('#regions path[aria-label^="台北市"]').dispatchEvent('click');
 assert.equal(await page.locator('#county').inputValue(),'台北市');
 const id=await page.locator('#regions path[data-region]').first().getAttribute('data-region');
 await page.locator('#regions path[data-region="'+id+'"]').dispatchEvent('click');
 const painted=await page.evaluate(id=>state.fills.towns[id],id);
 assert.ok(painted);
 await page.locator('#returnTaiwanMap').click();
 assert.equal(await page.locator('#county').inputValue(),'');
 assert.equal(await page.locator('#regions path[data-region]').count(),22);
 assert.equal(await page.locator('#districtBorders path[data-shared-boundary="towns"]').getAttribute('d'),baseline.township);
 assert.equal(await page.evaluate(id=>state.fills.towns[id],id),painted);
 const svg=await exportSvg(page);
 assert.match(svg,/data-shared-boundary="towns"/);
 assert.match(svg,/data-shared-boundary="counties"/);
 // Both views must use exactly the same geometry, not a simplified county subdivision.
 await page.locator('#workspacePrediction').click();
 await page.locator('#predictionScale').selectOption('overlay');
 await page.waitForFunction(()=>document.querySelectorAll('#regions path[data-region]').length>300);
 assert.equal(await page.locator('#districtBorders path[data-shared-boundary="towns"]').getAttribute('d'),baseline.township);
});
test('Free nationwide council is regional-only with county labels and drills into all identities; legislators retain independent districts',async t=>{
 const page=await pageFor(t);await page.locator('#workspaceFree').click();
 assert.equal(await page.locator('#freeLayerPicker button').count(),4);
 await page.locator('#townLevel').click();
 assert.equal(await page.locator('#regions path[data-region]').count(),22);
 await page.locator('#regions path[aria-label^="台北市"]').dispatchEvent('click');
 assert.equal(await page.locator('#county').inputValue(),'台北市');
 const town=await page.locator('#regions path[data-region]').first().getAttribute('data-region');
 await page.locator('#regions path[data-region="'+town+'"]').dispatchEvent('click');
 const townParty=await page.evaluate(id=>state.fills.towns[id],town);
 assert.ok(townParty);
 await page.locator('#returnTaiwanMap').click();
 assert.equal(await page.locator('#county').inputValue(),'');
 const countyOnlyLabels=async()=>{
  const facts=await page.evaluate(()=>({
   names:[...document.querySelectorAll('#labels text[data-label]')].map(el=>el.textContent.trim()),
   numbers:document.querySelectorAll('#labels [data-number-key],#labels [data-placement="district-number"]').length,
   leaders:document.querySelectorAll('#labels path[data-label-leader],#labels path[data-prominent-leader]').length,
   numberedKey:!document.querySelector('#mapNumberKey').hidden
  }));
  assert.ok(facts.names.length>=18,'National map must label the counties');
  assert.ok(facts.names.every(name=>/[县市]$/.test(name)),JSON.stringify(facts.names));
  assert.equal(facts.numbers,0,'No district numbers on national map');
  assert.equal(facts.leaders,0,'No national label leader lines');
  assert.equal(facts.numberedKey,false,'No numeric district key on national map');
 };
 await page.locator('#councilLevel').click();
 await page.waitForFunction(()=>data.council.length===161&&data.councilIndigenous.length===60&&document.querySelectorAll('#regions path[data-region]').length===161);
 assert.equal(await page.locator('#county').inputValue(),'');
 assert.equal(await page.locator('#regions g[data-electorate]').count(),0,'National council is one regional district layer, not three panels');
 assert.equal(await page.locator('#regions path[data-electorate="plains"],#regions path[data-electorate="mountain"]').count(),0);
 assert.equal(await page.evaluate(()=>districtTableRows().length),161,'National council reference table matches the visible regional scope');
 await countyOnlyLabels();
 const council=await page.evaluate(()=>data.council.filter(f=>f.county==='台北市').slice(0,2).map(f=>f.id));
 assert.equal(council.length,2);
 const councilBefore=await page.evaluate(id=>state.fills.council[id],council[0]);
 await page.locator('#regions path[data-region="'+council[0]+'"]').hover({force:true});
 assert.match(await page.locator('#tooltip').textContent(),/台北市/);
 assert.match(await page.locator('#tooltip').textContent(),/第1选区/);
 const nationalCouncilSvg=await exportSvg(page);
 assert.match(nationalCouncilSvg,/data-region="63000-01"/);
 assert.doesNotMatch(nationalCouncilSvg,/data-placement="district-number"|data-label-leader=|data-number-key=/);
 await page.locator('#regions path[data-region="'+council[0]+'"]').dispatchEvent('click');
 assert.equal(await page.locator('#county').inputValue(),'台北市','National council click opens the county, not a paint action');
 assert.equal(await page.evaluate(id=>state.fills.council[id],council[0]),councilBefore);
 const countyCouncil=await page.evaluate(()=>({
  count:currentItems().length,
  identities:[...new Set(currentItems().map(f=>featureElectorate(f)))].sort(),
  tables:districtTableRows().length
 }));
 assert.ok(countyCouncil.count>=8,'County view includes indigenous council districts');
 assert.deepEqual(countyCouncil.identities,['mountain','plains','regional']);
 assert.equal(await page.locator('#regions g[data-electorate]').count(),3);
 assert.ok(countyCouncil.tables>=8);
 await page.locator('.party-brush').nth(0).click();
 await page.locator('#regions path[data-region="'+council[0]+'"]').dispatchEvent('click');
 await page.locator('.party-brush').nth(1).click();
 await page.locator('#regions path[data-region="'+council[1]+'"]').dispatchEvent('click');
 const councilFills=await page.evaluate(ids=>ids.map(id=>({
  stored:state.fills.council[id],
  expected:paletteById(state.fills.council[id])?.color,
  color:document.querySelector('#regions path[data-region="'+id+'"]')?.getAttribute('fill')
 })),council);
 assert.ok(councilFills.every(x=>x.stored&&x.color===x.expected));
 assert.notEqual(councilFills[0].color,councilFills[1].color);
 await page.locator('#returnTaiwanMap').click();
 assert.equal(await page.locator('#regions path[data-region]').count(),161);
 assert.equal(await page.locator('#regions path[data-region="'+council[0]+'"]').getAttribute('fill'),councilFills[0].color);
 assert.equal(await page.locator('#regions path[data-region="'+council[1]+'"]').getAttribute('fill'),councilFills[1].color);
 await countyOnlyLabels();

 await page.locator('#legislativeLevel').click();
 await page.waitForFunction(()=>data.legislative.length===73&&document.querySelectorAll('#regions path[data-region]').length===73);
 assert.equal(await page.locator('#regions g[data-electorate]').count(),0);
 await countyOnlyLabels();
 const legislative=await page.evaluate(()=>data.legislative.filter(f=>f.county==='台北市').slice(0,2).map(f=>f.id));
 assert.equal(legislative.length,2);
 await page.locator('#regions path[data-region="'+legislative[0]+'"]').hover({force:true});
 assert.match(await page.locator('#tooltip').textContent(),/台北市/);
 assert.match(await page.locator('#tooltip').textContent(),/第1选区/);
 const beforeLegislative=await page.evaluate(ids=>ids.map(id=>state.fills.legislative[id]||null),legislative);
 await page.locator('.party-brush').nth(0).click();
 await page.locator('#regions path[data-region="'+legislative[0]+'"]').dispatchEvent('click');
 assert.equal(await page.locator('#county').inputValue(),'台北市','Nationwide regional legislator map must open the county');
 assert.deepEqual(await page.evaluate(ids=>ids.map(id=>state.fills.legislative[id]||null),legislative),beforeLegislative,
  'Drilling into county must not paint any district');
 assert.equal(await page.locator('#regions path[data-region]').count(),8);
 assert.ok(await page.locator('#labels [data-placement="district-number"]').count()>0,'County map retains district numbers');
 await page.locator('#regions path[data-region="'+legislative[0]+'"]').dispatchEvent('click');
 await page.locator('.party-brush').nth(1).click();
 await page.locator('#regions path[data-region="'+legislative[1]+'"]').dispatchEvent('click');
 const legislativeFills=await page.evaluate(ids=>ids.map(id=>({
  stored:state.fills.legislative[id],
  expected:paletteById(state.fills.legislative[id])?.color,
  color:document.querySelector('#regions path[data-region="'+id+'"]')?.getAttribute('fill')
 })),legislative);
 assert.ok(legislativeFills.every(x=>x.stored&&x.color===x.expected));
 assert.notEqual(legislativeFills[0].color,legislativeFills[1].color);
 await page.locator('#returnTaiwanMap').click();
 assert.equal(await page.locator('#county').inputValue(),'');
 assert.equal(await page.locator('#regions path[data-region="'+legislative[0]+'"]').getAttribute('fill'),legislativeFills[0].color);
 assert.equal(await page.locator('#regions path[data-region="'+legislative[1]+'"]').getAttribute('fill'),legislativeFills[1].color);
 const nationalLegislativeSvg=await exportSvg(page);
 assert.match(nationalLegislativeSvg,/data-region="63000-01"/);
 assert.doesNotMatch(nationalLegislativeSvg,/data-placement="district-number"|data-label-leader=|data-number-key=/);
 await page.locator('#regions path[data-region="'+legislative[1]+'"]').dispatchEvent('click');
 assert.equal(await page.locator('#county').inputValue(),'台北市','Clicking a second national district opens the county again');
 assert.equal(await page.locator('#regions path[data-region="'+legislative[1]+'"]').getAttribute('fill'),legislativeFills[1].color,
  'Reentering county must preserve its district fill');
 await page.locator('#returnTaiwanMap').click();
 await countyOnlyLabels();
 await page.locator('#countyLevel').click();
 await page.locator('#regions path[aria-label^="台北市"]').dispatchEvent('click');
 assert.ok(await page.evaluate(()=>Object.keys(state.fills.counties).length));
 assert.equal(await page.evaluate(id=>state.fills.towns[id],town),townParty);
});
test('Free regional legislators use a single unframed regional-only map and show district totals in the legend',async t=>{
 const page=await pageFor(t);await page.locator('#workspaceFree').click();
 assert.deepEqual(await page.locator('#freeLayerPicker button').allTextContents(),['县市','乡镇市区','议员','立法机构区域民代']);
 await page.locator('#legislativeLevel').click();
 await page.waitForFunction(()=>document.querySelector('#legend').textContent.includes('共 73 个选区'));
 await page.locator('#county').selectOption({label:'台北市'});
 assert.equal(await page.locator('#regions path[data-region]').count(),8);
 assert.equal(await page.locator('#regions path[data-electorate="plains"],#regions path[data-electorate="mountain"],#regions path[data-electorate="party"]').count(),0);
 assert.equal(await page.locator('#insetFrames rect,#insetFrames text').count(),0);
 assert.match(await page.locator('#legend').textContent(),/共 8 个选区/);
 assert.equal(await page.evaluate(()=>districtTableRows().every(d=>DistrictCore.identity(d)==='regional')),true);
 const svg=await exportSvg(page);assert.match(svg,/共 8 个选区/);assert.doesNotMatch(svg,/data-electorate="(?:plains|mountain|party)"/);
});


test('2022 council uses all historical district geometries and actual elected seat symbols',async t=>{
 const page=await pageFor(t);await page.locator('#categoryHistory').click();await page.locator('#historyOffice').selectOption('council');
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('910席'));
 await page.locator('#historyViewOverview').click();await page.waitForFunction(()=>document.querySelectorAll('.history-overview-card').length===8);
 assert.deepEqual(await page.locator('#historyOverviewCards .history-overview-card > span').allTextContents(),
  ['选举人数','投票人数','投票率','有效票','无效票','有效率','候选人数','当选人数']);
 assert.equal(await page.locator('#historyOverviewCharts .history-chart-card').count(),4);
 assert.deepEqual(await page.locator('#historyOverviewCharts .history-chart-card h4').allTextContents(),
  ['区域议员','平地少数民族议员','山地少数民族议员','候选与当选对比']);
 assert.equal(await page.locator('#historyOverviewCharts .history-chart-track').count(),6);
 assert.equal(await page.locator('#historyOverviewNote').isVisible(),true);
 assert.match(await page.locator('#historyOverviewPanel').textContent(),/分别统计，不合并/);
 await page.locator('#historyViewCandidates').click();assert.equal(await page.locator('#historyCandidatesPanel').isVisible(),true);assert.equal(await page.locator('#historyResultParty').count(),1);
 await page.locator('#historyViewCandidates').click();
 assert.equal(await page.locator('#historyMapPanel').isVisible(),true);
 assert.equal(await page.locator('#districtReferenceNote').isVisible(),false);
 assert.equal(await page.locator('#districtReferenceSource').isVisible(),false);
 assert.doesNotMatch(await page.locator('#historyCoverage').textContent(),/资料来源：/);
 assert.equal(await page.locator('#regions path[data-region]').count(),22);
 assert.equal(await page.locator('#regions path[data-region]').evaluateAll(nodes=>nodes.every(node=>node.getAttribute('fill')==='#f0f3ed')),true);
 const geometry=await page.evaluate(()=>({count:History2022View.features().length,seats:History2022View.features().reduce((n,f)=>n+f.seats,0),missing:History2022View.features().filter(f=>!f.d).length}));
 assert.deepEqual(geometry,{count:215,seats:910,missing:0});
 let total=0;
 for(const county of counties){
  await page.locator('#historyCounty').selectOption({label:county});
  const result=await page.evaluate(()=>({expected:currentItems().reduce((n,f)=>n+f.seats,0),elected:document.querySelectorAll('[data-seat-status="elected"]').length,empty:document.querySelectorAll('[data-seat-status="empty"]').length}));
  assert.equal(result.elected,result.expected,county);assert.equal(result.empty,0,county);total+=result.elected;
 }
 assert.equal(total,910);
 await page.locator('#historyCounty').selectOption({label:'新竹市'});
 assert.equal(await page.evaluate(()=>exportFilename()),'2022-县市议员-新竹市-当选席次');
 assert.match(await page.evaluate(()=>HistoryWorkspace.historyCsv(HistoryWorkspace.result(),HistoryWorkspace.selection())),/县市官方名称/);
 assert.equal(await page.locator('#regions path[data-region]').count(),6);assert.equal(await page.locator('[data-seat-status="elected"]').count(),34);
 assert.equal(await page.locator('#historySeatBadges').count(),1);assert.equal(await page.locator('#historySeatBadgeLeaders').count(),1);
 assert.ok(await page.locator('[data-history-seat-badge]').count()>0);assert.equal(await page.locator('[data-history-seat-count]').evaluateAll(nodes=>nodes.every(node=>Number(node.dataset.historySeatCount)>0)),true);
 assert.equal(await page.locator('[data-seat-district]').evaluateAll(nodes=>nodes.every(node=>/席/.test(node.getAttribute('aria-label')||''))),true);
 assert.equal(await page.locator('#historyMetric option').count(),4);
  assert.equal(await page.locator('[data-history-seat-badge]').count(),34);
  assert.equal(await page.locator('[data-history-seat-count]').evaluateAll(nodes=>nodes.every(node=>node.dataset.historySeatCount==='1')),true);
 await page.locator('[data-seat-district]').first().click();await page.locator('#historyResultDialog').waitFor({state:'visible'});
 assert.ok(await page.locator('#historyDialogRows tr').count()>0);assert.equal(await page.locator('#predictionDialog').isVisible(),false);
 await page.locator('#closeHistoryResult').click();
 const svg=await exportSvg(page);assert.match(svg,/data-seat-status="elected"/);assert.match(svg,/id="historySeatBadges"/);assert.match(svg,/data-history-seat-count/);assert.match(svg,/2022/);
 await page.locator('.export-menu summary').click();await page.locator('#returnTaiwanMap').click();assert.equal(await page.locator('#regions path[data-region]').count(),22);
});
test('2022 township and mayor maps navigate by county with actual numeric results',async t=>{
 const page=await pageFor(t);await page.locator('#categoryHistory').click();await page.locator('#historyOffice').selectOption('township');
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('204席'));
 assert.equal(await page.locator('#regions path[data-region]').count(),368);
 assert.equal(await page.locator('#regions [data-region="63000010"]').getAttribute('fill'),'#ffffff');
 await page.locator('#historyCounty').selectOption({label:'屏东县'});assert.ok(await page.locator('#regions path[data-region]').count()>1);
 await page.locator('#returnTaiwanMap').click();assert.equal(await page.locator('#historyCounty').inputValue(),'');
 await page.locator('#historyOffice').selectOption('mayor');await page.locator('#historyScale').selectOption('district');
 await page.locator('#regions path[data-region]').first().dispatchEvent('click');await page.locator('#historyResultDialog').waitFor({state:'visible'});assert.equal(await page.locator('#historyDialogDrilldown').isVisible(),true);
 await page.locator('#historyDialogDrilldown').click();assert.equal(await page.locator('#historyScale').inputValue(),'town');assert.notEqual(await page.locator('#historyCounty').inputValue(),'');
 await page.locator('#returnTaiwanMap').click();await page.locator('#historyScale').selectOption('town');
 assert.equal(await page.locator('#regions path[data-region]').count(),368);
 assert.notEqual(await page.locator('#regions [data-region="63000010"]').getAttribute('fill'),'#edf1e9');
 await page.locator('#historyCounty').selectOption({label:'台北市'});
 assert.equal(await page.locator('#regions path[data-region]').count(),12);
 await page.locator('#historyMetric').selectOption('share');assert.equal(await page.locator('#historyCandidateScope').isVisible(),true);
  assert.equal(await page.locator('#historyVoteUnit').count(),0);
 const gradients=page.locator('#legend [data-history-gradient-party]');
 assert.deepEqual((await gradients.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-history-gradient-party')))).sort(),['中国国民党','民主进步党']);
 const gradientAudit=await page.evaluate(()=>{
  const frame=Number(document.querySelector('#legend > rect').getAttribute('width'));
  return [...document.querySelectorAll('#legend [data-history-gradient-party]')].map(group=>{
   const party=group.getAttribute('data-history-gradient-party'),bar=group.querySelector('[data-history-gradient-bar]');
   const stops=[...group.querySelectorAll('stop')].map(node=>node.getAttribute('stop-color'));
   const palette=predictionParty(party).color;
   return{party,width:Number(bar?.getAttribute('width')),frame,stops,
    low:ElectionCore.shade(palette,0,0,100),high:ElectionCore.shade(palette,100,0,100),
    rates:[...group.querySelectorAll('[data-history-rate-tick]')].map(node=>node.textContent),
    votes:[...group.querySelectorAll('[data-history-vote-tick]')].map(node=>node.textContent)};
  });
 });
 for(const row of gradientAudit){
  assert.ok(row.width/row.frame>.85,'2022 legend uses a nearly full-width color bar: '+row.party);
  assert.equal(row.stops.length,11,'11 nonlinear color stops: '+row.party);
  assert.equal(row.stops[0],row.low,'Low-end color equals 2026 gradient: '+row.party);
  assert.equal(row.stops.at(-1),row.high,'High-end color equals 2026 gradient: '+row.party);
  assert.equal(new Set(row.stops).size,11,'Gradient has distinguishable shade steps: '+row.party);
  assert.equal(row.rates.length,5,'Five share labels for percentage mode: '+row.party);
  assert.equal(row.votes.length,0,'Do not mix vote-count labels into percentage mode: '+row.party);
  assert.ok(row.rates.every(t=>t.endsWith('%')),'Rate labels include percent units');
  assert.ok(row.rates.every(t=>t.endsWith('%')),'Rate labels include percent units');
 }

 const compactLegend=await page.locator('#legend').textContent();
 assert.match(compactLegend,/乡镇市区最高票候选人.*领先地区数/);
 assert.doesNotMatch(compactLegend,/按得票率着色|按得票数着色|按实际当选人统计/);
 assert.match(await exportSvg(page),/data-history-gradient-party="中国国民党"/);
 await page.locator('#historyCandidateScope').selectOption('candidate');assert.equal(await page.locator('#historyCandidate').isVisible(),true);
 await page.locator('#labels [data-label]').first().click();await page.locator('#historyResultDialog').waitFor({state:'visible'});
 assert.match(await page.locator('#historyDialogRows').textContent(),/蒋万安/);
});


test('2022 vote percentage and absolute-count maps have distinct color ranges and export labels',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('mayor');
 await page.locator('#historyCounty').selectOption({label:'台北市'});
 await page.locator('#historyScale').selectOption('town');
 assert.deepEqual(await page.locator('#historyMetric option').allTextContents(),
  ['当地最高票','得票率','得票数']);
 await page.locator('#historyMetric').selectOption('share');
 const share=await page.evaluate(()=>{
  const group=document.querySelector('#legend [data-history-gradient-party]');
  const rates=[...group.querySelectorAll('[data-history-rate-tick]')].map(x=>x.textContent);
  const votes=[...group.querySelectorAll('[data-history-vote-tick]')].map(x=>x.textContent);
  return{rates,votes,fill:document.querySelector('#regions [data-region="63000010"]')?.getAttribute('fill'),
   summary:document.querySelector('#historySummary').textContent,
   legend:document.querySelector('#legend').textContent,
   exportName:exportFilename(),
   range:document.querySelector('[data-history-rate-tick="1"]')?.textContent,
   stops:[...group.querySelectorAll('stop')].map(node=>node.getAttribute('stop-color'))};
 });
 assert.equal(share.rates.length,5);
 assert.equal(share.votes.length,0);
 assert.ok(share.rates.every(t=>/%$/.test(t)));
 assert.match(share.summary,/得票率渐变/);
 assert.doesNotMatch(share.legend,/按得票率着色|按得票数着色/);
 assert.doesNotMatch(share.legend,/参考|中位数换算/);
 assert.match(share.exportName,/得票率/);
 assert.notEqual(share.fill,'#edf1e9');
 assert.equal(share.stops.length,11);
 const shareExport=await exportSvg(page);
 assert.match(shareExport,/得票率/);
 assert.doesNotMatch(shareExport,/data-export-history-metadata|资料来源：|行政区边界版本：|历史数据架构版本：|按得票率着色/);
 await page.locator('#historyMetric').selectOption('votes');
 const votes=await page.evaluate(()=>{
  const group=document.querySelector('#legend [data-history-gradient-party]');
  const rates=[...group.querySelectorAll('[data-history-rate-tick]')].map(x=>x.textContent);
  const voteTicks=[...group.querySelectorAll('[data-history-vote-tick]')].map(x=>x.textContent);
  return{rates,voteTicks,fill:document.querySelector('#regions [data-region="63000010"]')?.getAttribute('fill'),
   summary:document.querySelector('#historySummary').textContent,legend:document.querySelector('#legend').textContent,
   exportName:exportFilename(),stops:[...group.querySelectorAll('stop')].map(node=>node.getAttribute('stop-color'))};
 });
 assert.equal(votes.rates.length,0,'Vote-count map must not show a percentage axis');
 assert.equal(votes.voteTicks.length,3,'Vote-count legend uses absolute vote ticks');
 assert.ok(votes.voteTicks.every(t=>/票$/.test(t)));
 assert.ok(votes.voteTicks.some(t=>Number(t.replaceAll(',','').replace('票',''))>1000));
 assert.match(votes.summary,/得票数渐变/);
 assert.doesNotMatch(votes.legend,/按得票率着色|按得票数着色/);
 assert.doesNotMatch(votes.legend,/%|参考|中位数换算/);
 assert.match(votes.exportName,/得票数/);
 assert.equal(votes.stops.length,11);
 assert.notEqual(votes.fill,'#edf1e9');
 assert.notEqual(share.fill,votes.fill,'Different vote bases must shade the same region differently');
 assert.notEqual(share.range,votes.voteTicks.at(-1));
 const voteExport=await exportSvg(page);
 assert.match(voteExport,/得票数/);
 assert.doesNotMatch(voteExport,/data-export-history-metadata|资料来源：|行政区边界版本：|历史数据架构版本：|按得票数着色/);
 assert.match(voteExport,/data-history-vote-tick/);
 assert.doesNotMatch(voteExport,/data-history-rate-tick/);
 assert.equal(await page.locator('#historyVoteUnit').count(),0);
});

test('Public history entry stays in the current workspace and displays the development notice',async t=>{
 const page=await pageFor(t,undefined,false);let historyRequests=0;page.on('request',r=>{if(r.url().includes('assets/history-'))historyRequests++});
 await page.locator('#categoryHistory').click();await page.locator('#historyDevelopmentNotice').waitFor({state:'visible'});
 assert.match(await page.locator('#historyDevelopmentNotice').textContent(),/开发中，敬请期待/);
 assert.equal(await page.locator('#categoryFuture').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#historyControls').isVisible(),false);assert.equal(historyRequests,0);
 await page.getByRole('button',{name:'知道了',exact:true}).click();
 assert.match(await page.locator('.sidebar-footer').innerText(),/网页开发：Alex Wei\n测试和推广：星夜长街/);
});
test('All exported image titles and filenames preserve the office even with a custom title',async t=>{
 const page=await pageFor(t);
 const result=await page.evaluate(()=>{
  const results=[];state.title='我的判断';
  for(const office of ['mayor','council','township']){state.workspaceMode='prediction';state.predictionOffice=office;results.push({office,title:exportMapTitle(),file:exportFilename()})}
  for(const level of ['council','legislative','towns']){state.workspaceMode='free';state.level=level;results.push({level,title:exportMapTitle(),file:exportFilename()})}
  return results;
 });
 for(const row of result){const type={mayor:'县市长',council:'议员',township:'乡镇市区长',legislative:'立法机构区域民代',towns:'乡镇市区'}[row.office||row.level];assert.ok(row.title.includes(type));assert.ok(row.file.includes(type));assert.ok(row.title.includes('我的判断'))}
});
test('Council and township winner tables use the mayor design without losing long lists or numeric data',async t=>{
 const page=await pageFor(t);
 const result=await page.evaluate(()=>{
  const rows=Array.from({length:910},(_,i)=>({district:'第'+(i+1)+'选区',name:'测试候选人',party:'中国国民党',number:String(i+1),gender:i%2?'女':'男',color:'#000099',logo:logoFor(predictionParty('中国国民党')),incumbent:i%2?'现任':''}));
  return [rows.slice(0,65),rows.slice(0,204),rows,rows.slice(0,32).map(r=>({...r,local:true,estimated:true,votes:'12345',share:'45%',status:'预测领先'}))].map(rs=>{
   const root=svgEl('g'),layout=exportPredictionTableLayout(rs);appendExportPredictionTable(root,rs,0);
   return{rows:rs.length,polished:layout.polished,entries:root.querySelectorAll('[data-export-winner-entry]').length,height:layout.height,meta:root.querySelectorAll('[data-export-field="candidate-meta"]').length,headers:layout.headers,metrics:root.querySelectorAll('[data-export-field="votes"]').length};
  });
 });
 for(const r of result){assert.equal(r.polished,true);assert.equal(r.entries,r.rows);assert.equal(r.meta,r.rows);assert.ok(r.height<14000)}
 assert.ok(result[3].headers.includes('预测得票率'));assert.equal(result[3].metrics,32);
});

test('2022 council result filters, regional search and historical export',async t=>{
 const page=await pageFor(t);
 await page.locator('#historyFromPrediction').click();
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('22席'));
 await page.locator('#historyOffice').selectOption('council');
 await page.locator('#historyCounty').selectOption({label:'台北市'});
 await page.locator('#historyMetric').selectOption('seats');
 assert.equal(await page.locator('#historyParty').isVisible(),true);
 await page.locator('#historyMetric').selectOption('share');
 await page.locator('#historyCandidateScope').selectOption('candidate');
 assert.ok(await page.locator('#historyCandidate option').count()>1);
 await page.locator('#historyViewCandidates').click();
 await page.locator('#historySearch').fill('王世坚');
 assert.equal(await page.locator('#historyResults tbody tr').count(),2);
  assert.equal(await page.locator('#historyResults tr.history-district-divider').count(),1);
 await page.locator('#historyMetric').selectOption('party');
 const svg=await exportSvg(page);
 assert.match(svg,/实际得票率/);
 assert.match(svg,/王世坚/);
 assert.equal((svg.match(/data-export-elected-mark="true"/g)||[]).length,61);
 const rows=await page.evaluate(()=>History2022View.exportRows().map(row=>({
  district:Number(row.district.match(/第(\d+)选举区/)[1]),votes:Number(row.votes.replaceAll(',',''))
 })));
 assert.equal(rows.length,61);
 assert.deepEqual([...new Set(rows.map(r=>r.district))],[1,2,3,4,5,6,7,8]);
 for(let i=1;i<rows.length;i++){
  const previous=rows[i-1],current=rows[i];
  assert.ok(previous.district<current.district||(previous.district===current.district&&previous.votes>=current.votes));
 }

});

test('2022 council constituency lists and CSV use 1, 2, 3 numeric ordering',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('council');
 await page.locator('#historyCounty').selectOption({label:'台北市'});
 await page.locator('#historyElectorate').selectOption('regional');
 await page.locator('#historyViewCandidates').click();
 const groups=await page.locator('#historyResults tr.history-district-divider th').allTextContents();
 const ids=groups.map(title=>Number((title.match(/第\s*0*(\d+)\s*选(?:举)?区/)||[])[1]));
 assert.ok(ids.length>2,'more than two constituency sections');
 assert.ok(ids.every(Number.isFinite),'all group headings have numbered constituencies');
 assert.equal(ids[0],1);
 assert.deepEqual(ids,[...ids].sort((a,b)=>a-b),'numeric order on candidate result table');
 const csvData=await page.evaluate(()=>HistoryWorkspace.historyCsv(HistoryWorkspace.result(),HistoryWorkspace.selection()));
 const csvDistricts=csvData.split('\r\n').slice(1).map(line=>Number((line.match(/"第\s*0*(\d+)\s*选(?:举)?区"/)||[])[1])).filter(Number.isFinite);
 assert.ok(csvDistricts.length>10);
 assert.equal(csvDistricts[0],1);
 assert.deepEqual(csvDistricts,[...csvDistricts].sort((a,b)=>a-b),'numeric order in CSV');
});

test('Historical office comes before year, and town-level mayor results mark the county-wide winner',async t=>{
  const page=await pageFor(t);await page.locator('#categoryHistory').click();
  assert.deepEqual(await page.locator('#historyOffice option').evaluateAll(nodes=>nodes.slice(0,2).map(node=>node.value)),['president','mayor']);
  assert.equal(await page.locator('#historyOffice').inputValue(),'mayor','ordering should not silently change the selected 2022 default');
  await page.locator('#historyOffice').selectOption('mayor');
  await page.waitForFunction(()=>History2022View.office()==='mayor'&&History2022View.year()===2022);
  const controls=await page.locator('#historyControls').evaluate(el=>[...el.querySelectorAll('select')].map(item=>item.id));
  assert.ok(controls.indexOf('historyOffice')<controls.indexOf('historyYear'));
  await page.locator('#historyCounty').selectOption({label:'台北市'});
  await page.locator('#historyScale').selectOption('town');
  await page.locator('#historyViewCandidates').click();
  await page.locator('#historySearch').fill('蒋万安');
  assert.ok(await page.locator('#historyResults img[alt="当选"]').count()>1);
  await page.locator('#historySearch').fill('');
  assert.ok(await page.locator('#historyResults tr.history-district-divider').count()>1);
  await page.locator('#historyViewOverview').click();
  const labels=await page.locator('#historyOverviewCards .history-overview-card span').allTextContents();
  for(const label of ['选举人数','投票率','有效率'])assert.ok(labels.includes(label),label);
  for(const label of ['选举时现任','女性候选人','女性当选人'])assert.equal(labels.includes(label),false,label);
});

test('2022 actual result overview has responsive metrics and turnout visualizations',async t=>{
 const page=await pageFor(t,{width:390,height:844});
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('mayor');
 await page.waitForFunction(()=>History2022View.office()==='mayor'&&History2022View.year()===2022);
 await page.locator('#historyCounty').selectOption({label:'台北市'});
 await page.locator('#historyViewOverview').click();
 await page.waitForFunction(()=>document.querySelectorAll('#historyOverviewCards .history-overview-card').length===8);
 const labels=await page.locator('#historyOverviewCards .history-overview-card > span').allTextContents();
 assert.deepEqual(labels,['选举人数','投票人数','投票率','有效票','无效票','有效率','候选人数','当选人数']);
 assert.equal(await page.locator('#historyOverviewCharts .history-chart-card').count(),3);
 assert.deepEqual(await page.locator('#historyOverviewCharts .history-chart-card h4').allTextContents(),
  ['投票参与','选票有效情况','候选与当选对比']);
 assert.equal(await page.locator('#historyOverviewCharts .history-chart-track').count(),2);
 assert.equal(await page.locator('#historyOverviewNote').isVisible(),false);
 const summary=await page.locator('#historyOverviewCards .history-overview-card > strong').allTextContents();
 assert.notEqual(summary[0],'暂无资料');
 assert.notEqual(summary[1],'暂无资料');
 assert.match(summary[2],/\d+\.\d{2}%/);
 const layout=await page.evaluate(()=>{
  const visuals=document.querySelector('#historyOverviewCharts');
  const cards=[...visuals.querySelectorAll('.history-chart-card')];
  const r=visuals.getBoundingClientRect();
  return {width:r.width,childWidths:cards.map(c=>c.getBoundingClientRect().width),overflow:visuals.scrollWidth-visuals.clientWidth,
   cardsOnOneColumn:cards.every(c=>Math.abs(c.getBoundingClientRect().width-r.width)<2)};
 });
 assert.ok(layout.cardsOnOneColumn,'charts should stack on a narrow screen');
 assert.ok(layout.overflow<=2,'chart grid should not overflow horizontally');
});

test('Mobile historical result keeps ballot numbers and candidate names visible',async t=>{
 const page=await pageFor(t,{width:390,height:844});
 await page.locator('#categoryHistory').click();
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('22席'));
 await page.locator('#historyCounty').selectOption({label:'台北市'});
 await page.locator('#regions [data-region="63000"]').click();
 const dialog=page.locator('#historyResultDialog');
 assert.match(await dialog.locator('h2').textContent(),/台北市 · 2022 市长选举结果/);
 const header=dialog.locator('.history-candidate-table thead th');
 assert.equal((await header.nth(2).textContent()).trim(),'性别');
 assert.equal((await header.nth(3).textContent()).trim(),'选举时现任');
 assert.equal(await header.nth(2).evaluate(node=>node.hidden),false);
 assert.equal(await header.nth(3).evaluate(node=>node.hidden),false);
 assert.equal(await dialog.locator('tbody tr').first().locator('td').nth(2).textContent(),'男');
 const name=dialog.locator('.history-elected-row td').nth(1);
 assert.equal(await name.textContent(),'蒋万安');
 const mark=dialog.getByRole('img',{name:'当选',exact:true});
 assert.equal(await mark.count(),1);
 await mark.evaluate(el=>el.decode());
 assert.equal(await dialog.locator('tbody tr').nth(1).locator('td').last().innerHTML(),'');
 const wrap=dialog.locator('.history-table-wrap');
 assert.equal(await wrap.evaluate(el=>el.scrollLeft),0);
 const bounds=await wrap.boundingBox(),initial=await name.boundingBox();
 assert.ok(initial.x>=bounds.x&&initial.x+initial.width<=bounds.x+bounds.width);
 // Force overflow independently of the system's CJK font metrics.
 await wrap.evaluate(el=>{el.style.maxWidth='220px'});
 const before=await name.boundingBox();
 await wrap.evaluate(el=>{el.scrollLeft=el.scrollWidth});
 assert.ok(await wrap.evaluate(el=>el.scrollLeft)>0);
 assert.ok(Math.abs((await name.boundingBox()).x-before.x)<2);
});


test('Historical result windows share prediction drag and resize controls',async t=>{
 const page=await pageFor(t,{width:1200,height:950});
 await page.locator('#categoryHistory').click();
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('22席'));
 await page.locator('#regions [data-region="63000"]').press("Enter");
 const dialog=page.locator('#historyResultDialog');
 const before=await dialog.boundingBox();
 const bar=dialog.locator('.floating-dialog-drag');
 await bar.press('ArrowRight');
 assert.equal((await dialog.boundingBox()).x,before.x+10);
 assert.equal(await dialog.locator('[data-dialog-resize]').count(),4);
 await dialog.locator('[data-dialog-resize="se"]').press('ArrowRight');
 assert.equal((await dialog.boundingBox()).width,before.width+10);
 await dialog.getByRole('button',{name:'关闭历史结果'}).click();
 assert.equal(await dialog.isVisible(),false);
});


test('Presidential history loads real 2024 and 1996 shards, navigates historical county geometry and restores 2022',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('president');
 await page.waitForFunction(()=>window.History2022View?.office()==='president'&&
  window.History2022View?.year()===2024&&
  document.querySelector('#historySummary').textContent.includes('22个'),{timeout:30000});
 assert.equal(await page.locator('#historyYear option').count(),8);
 assert.equal(await page.locator('#historyYear').inputValue(),'2024');
 assert.equal(await page.locator('#historyCounty option').count(),23);
 assert.equal(await page.locator('#regions path[data-region]').count(),22);
 await page.locator('#historyMetric').selectOption('share');
 await page.locator('#historyCandidateScope').selectOption('candidate');
 assert.equal(await page.locator('#historyCandidate option').count(),3,'One presidential ticket per candidate, not one per county');
 await page.locator('#historyYear').selectOption('1996');
 await page.waitForFunction(()=>window.History2022View?.office()==='president'&&window.History2022View?.year()===1996&&
  document.querySelector('#historySummary').textContent.includes('25个'),{timeout:30000});
 assert.equal(await page.locator('#historyCounty option').count(),26);
 await page.locator('#historyScale').selectOption('town');
 await page.locator('#historyCounty').selectOption({label:'台南市'});
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('个地区'));
 assert.ok((await page.evaluate(()=>History2022View.items().map(f=>f.name))).includes('中区、西区（合并）'));
 await page.locator('#historyMetric').selectOption('share');
 const normalized=await page.evaluate(()=>HistoryWorkspace.selection());
 assert.equal(normalized.year,1996);
 assert.equal(normalized.office,'president');
 assert.equal(normalized.level,'town');
 assert.equal(normalized.metric,'share');
 const csv=await download(page,'#historyExportCsv');
 assert.match(csv,/中区/);assert.match(csv,/西区/);
 assert.match(csv,/台湾地区领导人/);
 await page.locator('#historyOffice').selectOption('mayor');
 await page.waitForFunction(()=>History2022View.office()==='mayor'&&History2022View.year()===2022&&
  document.querySelector('#historySummary').textContent.includes('个地区'));
 assert.equal(await page.locator('#historyYear option').count(),1);
 assert.equal(await page.locator('#historyYear').inputValue(),'2022');
});


test('Historical county selectors exclude every neighboring district and draw only pre-merger county borders',async t=>{
 const page=await pageFor(t,{width:1440,height:920});
 const officeOptions=await page.locator('#historyOffice option').allTextContents();
 assert.equal(officeOptions[0],'台湾地区领导人','presidential office goes first');
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('president');
 await page.locator('#historyYear').selectOption('2008');
 await page.waitForFunction(()=>History2022View.office()==='president'&&History2022View.year()===2008&&History2022View.items()?.length===25);
 assert.equal(await page.locator('#historyCounty option').count(),26);
 const expectedCounts={'台中市':8,'台中县':21,'台南市':6,'台南县':31,'高雄市':11,'高雄县':27};
 const seen={};
 for(const [name,count] of Object.entries(expectedCounts)){
  await page.locator('#historyCounty').selectOption({label:name});
  const countyMap=await page.evaluate(()=>{
   const items=History2022View.items(),scope=document.querySelector('#historyCounty').value;
   const paths=[...document.querySelectorAll('#regions path[data-region]')];
   const borders=[...document.querySelectorAll('#districtBorders path[data-shared-boundary="counties"]')];
   const mesh=sharedBoundaryGeometry(History2022View.historicTownFeatures(),true,true);
   const expected=mesh.byCounty[scope];
   const own=History2022View.historicTownFeatures().filter(f=>f.county===scope);
   const sourceIds=own.map(f=>f.sourceId);
   return{county:scope,shapes:items.length,pathIds:paths.map(p=>p.getAttribute('data-region')),
    itemIds:items.map(f=>f.id),memberCount:items[0]?.memberCount,
    sources:sourceIds,uniqueSources:new Set(sourceIds).size,
    actualBorder:borders.length===1?borders[0].getAttribute('d'):null,expectedBorder:expected||null};
  });
  assert.equal(countyMap.county,name);
  assert.equal(countyMap.shapes,1,'one historical county polygon should appear: '+name);
  assert.deepEqual(countyMap.pathIds,countyMap.itemIds,'no modern county or neighbor polygon is present');
  assert.equal(countyMap.memberCount,count,name+' historical district count');
  assert.equal(countyMap.sources.length,count,name+' source district count');
  assert.equal(countyMap.uniqueSources,count,name+' each district used once');
  assert.ok(countyMap.actualBorder?.length>100,name+' has visible boundary outline');
  assert.equal(countyMap.actualBorder,countyMap.expectedBorder,name+' border must be derived from historical county, not modern merged county');
  seen[name]=new Set(countyMap.sources);
  await page.locator('#historyScale').selectOption('town');
  const townMap=await page.evaluate(()=>{
   const scope=document.querySelector('#historyCounty').value;
   const items=History2022View.items();
   const ids=[...document.querySelectorAll('#regions path[data-region]')].map(p=>p.dataset.region);
   const border=document.querySelector('#borders path[data-shared-boundary="counties"]')?.getAttribute('d');
   return{count:items.length,foreign:items.filter(f=>f.county!==scope).map(f=>f.name),
    ids,expectedIds:items.map(f=>f.id),boundary:border,
    expectedBoundary:sharedBoundaryGeometry(History2022View.historicTownFeatures(),true,true).byCounty[scope]};
  });
  assert.equal(townMap.count,count,'only '+name+' townships should be visible');
  assert.deepEqual(townMap.foreign,[],'no outside district is in '+name+' map');
  assert.deepEqual(townMap.ids,townMap.expectedIds,'DOM shows exactly the selected county towns');
  assert.equal(townMap.boundary,townMap.expectedBoundary,'township map county outline matches historical county');
  await page.locator('#historyScale').selectOption('district');
 }
 for(const name of ['台中','台南','高雄']){
  const city=seen[name+'市'],county=seen[name+'县'];
  assert.ok([...city].every(id=>!county.has(id)),name+' old city must exclude every old county township');
 }
 await page.locator('#historyCounty').selectOption({label:'台中市'});
 await page.locator('#historyScale').selectOption('town');
 const extent=await page.evaluate(()=>{
  const historic=geometryLayout(History2022View.items(),true).scale;
  const merged=geometryLayout(data.counties.filter(f=>f.name==='台中市'),true).scale;
  return{historic,merged};
 });
 assert.ok(extent.historic>extent.merged*2,'old city map must fit to old city extent, not large modern Taichung');
});

test('Presidential map legends identify president and running mate in screen and exported SVG',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('president');
 await page.waitForFunction(()=>History2022View.office()==='president'&&History2022View.year()===2024&&document.querySelector('#legend').textContent.includes('赖清德 & 萧美琴'));
 let legend=await page.locator('#legend').textContent();
 assert.match(legend,/民主进步党｜赖清德 & 萧美琴/);
 assert.match(legend,/中国国民党｜侯友宜 & 赵少康/);
 const svg=await exportSvg(page);
 assert.match(svg,/民主进步党｜赖清德 &amp; 萧美琴/);
 await page.locator('#historyYear').selectOption('1996');
 await page.waitForFunction(()=>History2022View.year()===1996&&document.querySelector('#legend').textContent.includes('李登辉 & 连战'));
 legend=await page.locator('#legend').textContent();
 assert.match(legend,/中国国民党｜李登辉 & 连战/);
 await page.locator('#historyMetric').selectOption('share');
 const gradient=page.locator('#legend [data-history-gradient-party]');
 assert.ok(await gradient.count()>0);
 assert.ok((await gradient.allTextContents()).some(text=>text.includes(' & ')),'vote-gradient legend also uses presidential ticket names');
 const votesSvg=await exportSvg(page);
 assert.match(votesSvg,/李登辉 &amp; 连战/);
});

test('2022 mayor legend shows candidate name only in a specific county and stays in SVG exports',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('mayor');
 assert.doesNotMatch(await page.locator('#legend').textContent(),/蒋万安/,'nationwide county mayor party map remains party-only');
 await page.locator('#historyCounty').selectOption({label:'台北市'});
 let legend=await page.locator('#legend').textContent();
 assert.match(legend,/中国国民党｜蒋万安（1席）/);
 assert.match(await exportSvg(page),/中国国民党｜蒋万安/);
 await page.locator('#historyMetric').selectOption('share');
 legend=await page.locator('#legend').textContent();
 assert.match(legend,/中国国民党｜蒋万安/);
 assert.match(await exportSvg(page),/中国国民党｜蒋万安/);
 await page.locator('#historyScale').selectOption('town');
 assert.ok((await page.locator('#legend').textContent()).includes('｜'),'township-leading candidate names are shown when county selected');
 await page.locator('#historyCounty').selectOption({label:'新北市'});
 assert.ok((await page.locator('#legend').textContent()).includes('｜'),'name remains after selecting a different county');
 await page.locator('#historyCounty').selectOption('');
 await page.locator('#historyScale').selectOption('district');
 assert.doesNotMatch(await page.locator('#legend').textContent(),/｜/,'nationwide county mayor legend returns to party only');
});


test('County, township and constituency boundaries maintain visual hierarchy across map modules and export',async t=>{
 const page=await pageFor(t,{width:1440,height:920});
 const inspect=async selector=>page.locator(selector).first().evaluate(path=>({
  color:path.getAttribute('stroke'),width:Number(path.getAttribute('stroke-width'))
 }));
 const expected={
  county:{color:'#3C5D53',width:1.4},
  district:{color:'#738B82',width:0.8},
  town:{color:'#B1C3B9',width:0.5}
 };
 // County-only maps show the bold county tier, including coastlines in one-county mode.
 assert.equal(await page.evaluate(()=>state.level),'counties');
 assert.deepEqual(await inspect('#districtBorders path'),expected.county);
 assert.equal(await page.locator('#boundaryColor').inputValue(),expected.county.color.toLowerCase());
 assert.equal(await page.locator('#boundaryWidth').inputValue(),'1.4');
 await page.locator('#county').selectOption({label:'台北市'});
 assert.deepEqual(await inspect('#districtBorders path'),expected.county);
 // Township maps use finer internal outlines and retain a stronger parent county line.
 await page.locator('#predictionScale').selectOption('overlay');
 assert.equal(await page.evaluate(()=>state.level),'towns');
 assert.deepEqual(await inspect('#districtBorders path'),expected.town);
 assert.deepEqual(await inspect('#borders path'),expected.county);
 assert.equal(await page.locator('#boundaryColor').inputValue(),expected.town.color.toLowerCase());
 assert.equal(await page.locator('#boundaryWidth').inputValue(),'0.5');
 const source=await exportSvg(page);
 const exported=await page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  const line=selector=>{
   const path=doc.querySelector(selector);
   return path?{color:path.getAttribute('stroke'),width:Number(path.getAttribute('stroke-width'))}:null;
  };
  return{town:line('[data-shared-boundary="towns"]'),county:line('[data-shared-boundary="counties"]')};
 },source);
 assert.deepEqual(exported,{town:expected.town,county:expected.county},'exported vector must retain screen stroke colors and widths');
 // Electorate maps use the intermediate tier; their county boundaries remain prominent.
 await page.locator('#predictionOffice').selectOption('council');
 await page.locator('#county').selectOption({label:'台北市'});
 assert.equal(await page.evaluate(()=>state.level),'council');
 assert.deepEqual(await inspect('#districtBorders path'),expected.district);
 assert.deepEqual(await inspect('#borders path'),expected.county);
 assert.equal(await page.locator('#boundaryWidth').inputValue(),'0.8');
 // A manually changed township style never changes the county tier.
 await page.locator('#predictionOffice').selectOption('mayor');
 await page.locator('#predictionScale').selectOption('overlay');
 await page.locator('#boundaryColor').evaluate(input=>{
  input.value='#849f91';input.dispatchEvent(new Event('input',{bubbles:true}));
 });
 assert.equal(await page.evaluate(()=>state.townBorderColor),'#849f91');
 assert.equal(await page.evaluate(()=>state.countyBorderColor),expected.county.color);
 assert.equal((await inspect('#districtBorders path')).color,'#849f91');
 // The free-coloring workspace uses the same outline settings.
 await page.locator('#workspaceFree').click();
 await page.locator('#townLevel').click();
 await page.locator('#county').selectOption({label:'台北市'});
 assert.deepEqual(await inspect('#borders path'),expected.county);
 assert.equal((await inspect('#districtBorders path')).color,'#849f91');
 // Historical county-only maps reuse the county line, including pre-2010 boundaries.
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('president');
 await page.locator('#historyYear').selectOption('2008');
 await page.waitForFunction(()=>History2022View.office()==='president'&&History2022View.year()===2008&&History2022View.items()?.length===25);
 await page.locator('#historyCounty').selectOption({label:'台中县'});
 assert.deepEqual(await inspect('#districtBorders path[data-historical-county-outline="true"]'),expected.county);
 await page.locator('#historyScale').selectOption('town');
 assert.equal((await inspect('#districtBorders path')).color,'#849f91');
 assert.deepEqual(await inspect('#borders path'),expected.county);
});
