/* Run in CI after installing playwright; these tests use isolated browser profiles. */
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import ElectionCore from '../election-core.js';
let browser;
before(async()=>{browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})})});
after(async()=>{await browser?.close()});
const base=process.env.MAP_TEST_URL||'http://127.0.0.1:8765/';
async function pageFor(t,viewport){
 const context=await browser.newContext(viewport?{viewport}:{});t.after(()=>context.close());
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
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
 const semantics=await modal.evaluate(dialog=>({
  labelledBy:dialog.getAttribute('aria-labelledby'),
  titleId:document.activeElement?.id,
  dragRole:dialog.querySelector('.floating-dialog-drag').getAttribute('role'),
  dragTabIndex:dialog.querySelector('.floating-dialog-drag').tabIndex,
  moveTag:dialog.querySelector('.floating-dialog-move')?.tagName,
  resizeTags:[...dialog.querySelectorAll('.floating-dialog-corner')].map(node=>node.tagName)
 }));
 assert.deepEqual(semantics,{labelledBy:'predictionDialogTitle',titleId:'predictionDialogTitle',dragRole:null,dragTabIndex:-1,moveTag:'BUTTON',resizeTags:['BUTTON','BUTTON','BUTTON','BUTTON']});
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
 const keyboardStart=await modal.boundingBox();
 await modal.locator('.floating-dialog-move').focus();
 await page.keyboard.press('ArrowRight');
 const keyboardMoved=await modal.boundingBox();
 assert.ok(keyboardMoved.x>keyboardStart.x,'Dedicated move button supports keyboard movement');
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
 const names=await page.evaluate(()=>data.counties.map(f=>XinhuaWording.normalize(f.name)));
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
 assert.equal(await page.getByRole('button',{name:'返回全部地区地图',exact:true}).count(),1);
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
 const svg=await exportSvg(page);assert.doesNotMatch(svg,/预测得票候选人|2022 实际选举结果/);assert.match(svg,/预测得票率/);assert.match(svg,/data-export-party-logo/);
 assert.equal((svg.match(/data-export-winner-entry=/g)||[]).length,6);assert.equal((svg.match(/data-export-winner-row=/g)||[]).length,6);
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
  return {title:!!doc.querySelector('[data-export-title]'),text:table?.textContent||'',rowCount:table?.querySelectorAll('[data-export-winner-row]').length};
 },svg);
 assert.equal(info.title,true);
 assert.equal(info.rowCount,1);
 assert.match(info.text,/沈伯洋/);
 assert.match(info.text,/40%/);
 assert.match(info.text,/预测得票率/);
 assert.doesNotMatch(info.text,/蒋万安|56%|预测得票数|标记/);
});

test('Export candidate columns flow independently with name-adjacent incumbency and party logos',async t=>{
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
   rows:physicalRows.length,expectedRows:layout.columnEntries.flat().length,entries:entries.length,
   pairCounts:physicalRows.map(r=>r.querySelectorAll('[data-export-winner-entry]').length),
   logos:card.querySelectorAll('[data-export-party-logo]').length,
   incumbents:incumbents.length,headers,firstName:firstName?.textContent,
   inlineBadge:badge?Number(badge.getAttribute('x'))>Number(firstName.getAttribute('x')):false,
   secondSlot:secondItem?.dataset.exportSlot,fonts:names.map(el=>Number(el.getAttribute('font-size'))),
   width:layout.width,tableHeight:layout.height,
   oddEntries:oddRows.columnEntries.flat().length,
   oddLastEntries:oddRoot.querySelectorAll('[data-export-winner-row]:last-of-type [data-export-winner-entry]').length,
   estimatedStillLegacy:!numeric.polished
  };
 });
 assert.equal(result.variant,'two-up');assert.equal(result.columns,2);
 assert.equal(result.rows,result.expectedRows);assert.equal(result.entries,22);
 assert.equal(result.pairCounts.reduce((sum,count)=>sum+count,0),22);
 assert.ok(result.pairCounts.every(n=>n===1),'rows are independent within each column');
 assert.equal(result.logos,22);assert.equal(result.incumbents,6);
 assert.deepEqual(result.headers,['选区','姓名','政党','选区','姓名','政党']);
 assert.equal(result.firstName,'测试候选人');assert.equal(result.inlineBadge,true);
 assert.equal(result.secondSlot,'0');assert.ok(result.fonts.every(n=>n>=15));
 assert.ok(result.width>=1000&&result.width<1120,'compact table uses less width than the previous layout');assert.ok(result.tableHeight<800,'compact rows reduce total height');
 assert.equal(result.oddEntries,21);
 assert.equal(result.oddLastEntries,1);
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
 for(const county of counties){await page.locator('#county').selectOption({value:county});assert.deepEqual(await missingLabels(page),[],county+' council')}
 await page.locator('#workspaceFree').click();await page.locator('#legislativeLevel').click();
 await page.waitForFunction(()=>document.querySelector('#regions [data-region][data-electorate="regional"]'));
 for(const county of counties){await page.locator('#county').selectOption({value:county});assert.deepEqual(await missingLabels(page,'#regions [data-region][data-electorate="regional"]'),[],county+' legislative')}
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
    if(!row||!row.name.includes(window.XinhuaWording.normalize(f.name)))bad.push(f.name+' missing from key');
   }else if(el.textContent!==window.XinhuaWording.normalize(f.name))bad.push(f.name+' wrong name');
  }
  const key=document.querySelector('#mapNumberKey'),canvas=document.querySelector('#canvas');
   const k=key.getBoundingClientRect(),m=canvas.getBoundingClientRect();
   const overlap=(a,b)=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
   const obstacles=[...document.querySelectorAll('#labels [data-label],#mapFurniture [data-decoration],#legend > rect')];
   const blocked=!key.hidden&&obstacles.some(el=>overlap(k,el.getBoundingClientRect()));
   return{total:items.length,labelled:labels.length,numbers:labels.filter(el=>el.dataset.numberKey).length,
    rows:rows.length,bad,inside:key.hidden||(key.parentElement.id==='canvas'&&k.top>=m.top-1&&k.bottom<=m.bottom+1&&k.left>=m.left-1&&k.right<=m.right+1),
    unblocked:!blocked};
  });
  assert.equal(r.labelled,r.total);assert.deepEqual(r.bad,[]);assert.equal(r.rows,r.numbers);
  assert.ok(r.inside,'index must be rendered on the map canvas');
  assert.ok(r.unblocked,'index must avoid all labels, legend and map furniture');
  return r;
}
test('Dense administrative names use an on-map index without covering labels or furniture',async t=>{
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

test('Compact administrative index matches map label typography and stays within right rail',async t=>{
 const page=await pageFor(t);
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:850});
  await page.locator('#county').selectOption({value:'高雄市'});
  await page.locator('#predictionScale').selectOption('overlay');
  const result=await page.evaluate(()=>{
   const panel=document.querySelector('#mapNumberKey'),box=panel.getBoundingClientRect();
   const svg=document.querySelector('#map'),spec=sceneSpec();
   const baseScale=Math.min(svg.getBoundingClientRect().width/spec.width,svg.getBoundingClientRect().height/spec.height);
   const source=Number(panel.dataset.referenceFont)||spec.font;
   const indexFont=parseFloat(getComputedStyle(document.querySelector('#mapNumberKeyRows button')).fontSize);
   const expected=Math.max(7.5,Math.min(11,source*baseScale));
   const legend=document.querySelector('#legend>rect')?.getBoundingClientRect();
   const north=document.querySelector('#mapFurniture [data-decoration="north-arrow"]')?.getBoundingClientRect();
   const overlap=(a,b)=>!!b&&a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1;
   return {width:box.width,height:box.height,indexFont,expected,legendOverlap:overlap(box,legend),northOverlap:overlap(box,north)};
  });
  assert.ok(result.width<=135,result.width+'px: index should be compact');
  assert.ok(result.width>=60,result.width+'px: index must remain usable');
  assert.ok(result.height<=190,result.height+'px: index should be a small reference');
  assert.ok(Math.abs(result.indexFont-result.expected)<.25,'index text follows map text size');
  assert.equal(result.legendOverlap,false,'keep legend clear');
  assert.equal(result.northOverlap,false,'keep north arrow clear');
 }
});

test('Administrative index zooms and pans in map coordinates and resets with fit',async t=>{
 const page=await pageFor(t);await page.locator('#county').selectOption({value:'高雄市'});
 await page.locator('#predictionScale').selectOption('overlay');
 const measure=()=>page.evaluate(()=>{
  const el=document.querySelector('#mapNumberKey'),rect=el.getBoundingClientRect();
  const svg=document.querySelector('#map'),box=svg.getBoundingClientRect();
  return{left:rect.left,top:rect.top,width:rect.width,height:rect.height,
   view:{...view},svg:{width:box.width,height:box.height},
   style:el.style.transform};
 });
 const initial=await measure();
 assert.ok(initial.width>60,'in-map key should be readable at fit');
 assert.equal(initial.style,'none','index uses layout font sizing, never scaled bitmap text');
 await page.locator('#zoomIn').click();
 await page.waitForFunction(width=>document.querySelector('#mapNumberKey').getBoundingClientRect().width>width*1.05,initial.width);
 const enlarged=await measure();
 const ratio=initial.view.w/enlarged.view.w;
 assert.ok(Math.abs(enlarged.width/initial.width-ratio)<.025,'index width follows SVG zoom scale');
 assert.ok(Math.abs(enlarged.height/initial.height-ratio)<.085,'index height follows SVG zoom scale');
 const crisp=await page.locator('#mapNumberKeyRows .number-key-action').first().evaluate(el=>getComputedStyle(el).fontSize);
 assert.ok(parseFloat(crisp)>0,'scaled index still uses a real layout font');
 const panX=35,panY=50;
 await page.evaluate(({panX,panY})=>{view.x+=panX;view.y+=panY;flushView()}, {panX,panY});
 const shifted=await measure();
 const pxPerUnit=Math.min(shifted.svg.width/shifted.view.w,shifted.svg.height/shifted.view.h);
 assert.ok(Math.abs((shifted.left-enlarged.left)+panX*pxPerUnit)<1.5,'index pans horizontally with map');
 assert.ok(Math.abs((shifted.top-enlarged.top)+panY*pxPerUnit)<1.5,'index pans vertically with map');
 await page.locator('#fit').click();
 const restored=await measure();
 assert.ok(Math.abs(restored.width-initial.width)<1.5,'fit restores index scale');
 assert.ok(Math.abs(restored.left-initial.left)<1.5,'fit restores index placement');
 assert.ok(Math.abs(restored.top-initial.top)<1.5,'fit restores index vertical placement');
 const svg=await exportSvg(page);
 const exported=await page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  return{key:doc.querySelectorAll('[data-map-number-key]').length,side:!!doc.querySelector('[data-export-legend-below-key]')};
 },svg);
 assert.equal(exported.key,1,'export keeps exactly one index in the separate sidebar');
 assert.equal(exported.side,true);
});
test('Export sidebar moves into reserved map rail and result table fills the right margin',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('mayor');
 // Historical mayor maps and local result tables use the same export geometry.
 const data=await page.evaluate(()=>{
  const rows=Array.from({length:22},(_,i)=>({
   historical:true,estimated:true,elected:true,
   district:'示例选区'+(i+1),number:i+1,name:'测试候选人',
   party:'中国国民党',color:'#000099',gender:'男',incumbent:'',
   votes:'123,456',share:'56.78%',logo:null
  }));
  const layout=exportPredictionTableLayout(rows);
  const wide=expandExportWinnerLayout(layout,layout.width+240);
  const group=svgEl('svg',{xmlns:NS});
  appendExportPredictionTable(group,rows,0,wide);
  const rect=group.querySelector('[data-export-winner-table] > rect');
  const first=group.querySelector('[data-export-winner-entry]');
  const last=group.querySelectorAll('[data-export-winner-header]');
  return{initialWidth:layout.width,stretchedWidth:Number(rect.getAttribute('width')),
   columns:wide.columns,entries:group.querySelectorAll('[data-export-winner-entry]').length,
   lastColumnX:Number(last[last.length-1]?.getAttribute('x')),
   firstEntry:!!first};
 });
 assert.equal(data.stretchedWidth,data.initialWidth+240,'winner card uses the full available export width');
 assert.equal(data.entries,22);
 assert.ok(data.lastColumnX>data.initialWidth*.5,'header columns expand into the new width');
 const svg=await exportSvg(page);
 const shape=await page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  const root=doc.documentElement,key=doc.querySelector('[data-map-number-key] > rect'),map=doc.querySelector('svg[viewBox]');
  const legend=doc.querySelector('[data-export-legend-below-key]');
  const w=Number(root.getAttribute('width'));
  const start=Number(key?.getAttribute('x'));
  return{width:w,keyX:start,keyFont:Number(doc.querySelector('[data-map-number-key] text:nth-of-type(2)')?.getAttribute('font-size')||0),
   hasLegend:!!legend,keyInsideMapRight:start<Number(map?.getAttribute('x')||40)+Number(map?.getAttribute('width')||0),
   tailMargin:w-(start+Number(key?.getAttribute('width')||0))};
 },svg);
 assert.ok(shape.keyInsideMapRight,'index shifts left into the map reserved rail');
 assert.ok(shape.tailMargin>=30,'export retains a safe right margin');
 assert.ok(shape.keyFont>=16,'exported index uses readable vector text');
 assert.ok(shape.hasLegend,'legend remains aligned beneath index');
 const source=await page.evaluate(()=>{
  const original=History2022View.exportRows;
  try{
   History2022View.exportRows=()=>Array.from({length:22},(_,i)=>({
    historical:true,estimated:true,elected:true,
    district:'选区'+(i+1),number:i+1,name:'测试候选人',gender:'男',
    party:'中国国民党',color:'#000099',logo:null,incumbent:'',
    votes:'123,456',share:'56.78%'
   }));
   return preparedExportSvg();
  }finally{History2022View.exportRows=original}
 });
 const table=await page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  const box=doc.querySelector('[data-export-winner-table] > rect');
  return{imageRight:Number(doc.documentElement.getAttribute('width')),tableRight:Number(box.getAttribute('x'))+Number(box.getAttribute('width'))};
 },source);
 assert.ok(Math.abs(table.imageRight-table.tableRight-40)<2,'exported result card ends at the same 40px right margin');
});
test('Export index and legend descend to the scale-bar bottom',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('mayor');
 for(const scenario of ['all','county']){
  if(scenario==='county'){
   await page.locator('#historyCounty').selectOption({value:'高雄市'});
   await page.locator('#historyScale').selectOption('town');
  }
  const source=await exportSvg(page);
  const geo=await page.evaluate(source=>{
   const doc=new DOMParser().parseFromString(source,'image/svg+xml');
   const map=doc.querySelector('svg[x][y][viewBox]');
   const f=Number(map.getAttribute('width'))/Number(map.getAttribute('viewBox').split(/\s+/)[2]);
   const y0=Number(map.getAttribute('y'));
   const bars=[...doc.querySelectorAll('[data-decoration="scale-bar"] > rect')].slice(1);
   const scaleBottom=y0+Math.max(...bars.map(el=>Number(el.getAttribute('y'))+Number(el.getAttribute('height'))))*f;
   const wrapper=doc.querySelector('[data-export-legend-below-key]');
   const match=wrapper?.getAttribute('transform').match(/^translate\(([-+.\deE]+),([-+.\deE]+)\) scale\(([-+.\deE]+)\)$/);
   const rect=wrapper?.querySelector(':scope > g > rect');
   const legendTop=Number(match?.[2])+Number(rect?.getAttribute('y'))*Number(match?.[3]);
   const legendBottom=legendTop+Number(rect?.getAttribute('height'))*Number(match?.[3]);
   const key=doc.querySelector('[data-map-number-key] > rect');
   const keyTop=Number(key?.getAttribute('y'));
   const keyBottom=keyTop+Number(key?.getAttribute('height'));
   return{scaleBottom,legendTop,legendBottom,keyTop,keyBottom,mapY:y0};
  },source);
  assert.ok(Number.isFinite(geo.legendBottom)&&Number.isFinite(geo.scaleBottom),scenario+' has export geometry');
  assert.ok(Math.abs(geo.legendBottom-geo.scaleBottom)<1.5,
   scenario+' legend foot aligns to scale bar '+JSON.stringify(geo));
  assert.ok(geo.keyTop>=geo.mapY+10,scenario+' index clears the heading');
  assert.ok(geo.keyBottom+14<=geo.legendTop,scenario+' index remains above legend');
 }
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
  await page.locator('#county').selectOption({value:county});await assertAdministrativeKey(page);
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
 for(const q of await national()){assert.equal(q.official,false);assert.match(q.text,/(?:[县市]|金门|马祖)$/)}
 await page.locator('#zoomIn').click();await page.locator('#fit').click();
 for(const q of await national())assert.match(q.text,/(?:[县市]|金门|马祖)$/);
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
test('Mobile administrative keys remain on the map without overlap',async t=>{
 const page=await pageFor(t,{width:390,height:844});
 await page.locator('#county').selectOption({label:'高雄市'});await page.locator('#predictionScale').selectOption('overlay');
 const r=await assertAdministrativeKey(page);assert.ok(r.numbers>0);
 assert.ok(await page.evaluate(()=>{
  const key=document.querySelector('#mapNumberKey').getBoundingClientRect();
  return key.left>=0&&key.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth;
 }));
});

test('Map and county selector use Xinhua display names without changing source keys',async t=>{
 const page=await pageFor(t);
 for(const [key,label] of [['金门县','金门'],['连江县','马祖']]){
  await page.waitForFunction(key=>!!document.querySelector('#county option[value="'+key+'"]'),key);
  const option=page.locator('#county option').filter({hasText:label}).first();
  assert.ok(await option.count(),label+' selectable');
  const values=await page.locator('#county option').evaluateAll(nodes=>nodes.filter(n=>n.value==='金门县'||n.value==='连江县').map(n=>({value:n.value,text:n.textContent.trim()})));
  assert.deepEqual(values.find(row=>row.value===key)?.text,label);
  await page.locator('#county').selectOption(key);
  await page.waitForFunction(key=>state.county===key,key);
  const title=await page.locator('#scopeTitle').textContent();
  assert.ok(title.includes(label),title);
  assert.doesNotMatch(title,/金门县|连江县|金門縣|連江縣/);
  const mapTexts=await page.locator('#labels').textContent();
  assert.doesNotMatch(mapTexts,/金门县|连江县|金門縣|連江縣/);
 }
 const exported=await exportSvg(page);
 const parsed=await page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  return {words:doc.documentElement.textContent,hasIndex:!!doc.querySelector('[data-map-number-key]')};
 },exported);
 assert.doesNotMatch(parsed.words,/金门县|连江县|金門縣|連江縣/);
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
    const el=labels.find(el=>el.textContent===window.XinhuaWording.normalize(name)),frame=frames.find(f=>f.name===inset)?.box,b=el?.getBoundingClientRect();
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
  await page.locator('#county').selectOption({value:county});
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
  await page.locator('#county').selectOption({value:county});
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
  await page.locator('#county').selectOption({value:county});
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
    missingLeaders:[...document.querySelectorAll('#labels text[data-placement="outside"]')].filter(el=>
     !document.querySelector('#labels path[data-label-leader="'+el.dataset.label+'"]')).map(el=>el.textContent),
   numberedKey:!document.querySelector('#mapNumberKey').hidden
  }));
  assert.equal(facts.names.length,22,'National map must identify all 22 counties');
  assert.ok(facts.names.every(name=>/(?:[县市]|金门|马祖)$/.test(name)),JSON.stringify(facts.names));
  assert.equal(facts.numbers,0,'No district numbers on national map');
  assert.deepEqual(facts.missingLeaders,[],'Every external county name has its own connected leader');
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
 assert.doesNotMatch(nationalCouncilSvg,/data-placement="district-number"|data-number-key=/);
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
 assert.doesNotMatch(nationalLegislativeSvg,/data-placement="district-number"|data-number-key=/);
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
 assert.equal(await page.locator('#regions path[data-region]').evaluateAll(nodes=>{
  const counties=new Map(currentItems().map(feature=>[String(feature.id),feature.county||feature.name]));
  return nodes.every(node=>{
   const leader=History2022View.countySeatLeader(counties.get(node.dataset.region));
   const expected=leader.tied?'#aebdb4':leader.party?predictionParty(leader.party).color:'#edf1e9';
   return node.getAttribute('fill')===expected;
  });
 }),true,'nationwide council county colors reflect the most elected seats');
 const geometry=await page.evaluate(()=>({count:History2022View.features().length,seats:History2022View.features().reduce((n,f)=>n+f.seats,0),missing:History2022View.features().filter(f=>!f.d).length}));
 assert.deepEqual(geometry,{count:215,seats:910,missing:0});
 let total=0;
 for(const county of counties){
  await page.locator('#historyCounty').selectOption({value:county});
  const result=await page.evaluate(()=>({expected:currentItems().reduce((n,f)=>n+f.seats,0),elected:document.querySelectorAll('[data-seat-status="elected"]').length,empty:document.querySelectorAll('[data-seat-status="empty"]').length}));
  assert.equal(result.elected,result.expected,county);assert.equal(result.empty,0,county);total+=result.elected;
 }
 assert.equal(total,910);
 await page.locator('#historyCounty').selectOption({label:'新竹市'});
 assert.equal(await page.evaluate(()=>exportFilename()),'2022-县市议员-新竹市-当选席次');
 assert.match(await page.evaluate(()=>HistoryWorkspace.historyCsv(HistoryWorkspace.result(),HistoryWorkspace.selection())),/"县市","选区"/);
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
  ['各乡镇市区最高票候选人','得票率','得票数']);
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

test('A fresh visitor can open history and loads its resources only when needed',async t=>{
 const page=await pageFor(t);
 const loaded=()=>page.evaluate(()=>[...new Set(performance.getEntriesByType('resource').filter(entry=>/\/history-(?:2022\.js|legislative\.css)$/.test(new URL(entry.name).pathname)).map(entry=>entry.name))].length);
 assert.equal(await loaded(),0);
 await page.locator('#categoryHistory').click();
 await page.waitForFunction(()=>window.History2022View?.snapshot()?.year===2022);
 assert.equal(await page.locator('#categoryHistory').getAttribute('aria-selected'),'true');
 assert.equal(await page.locator('#historyControls').isVisible(),true);
 assert.equal(await loaded(),2);
 for(const asset of ['history-2022.js','history-legislative.css'])assert.equal(await page.locator('[data-history-asset="'+asset+'"][data-loaded="true"]').count(),1);
 await page.locator('#categoryFuture').click();
 assert.equal(await page.locator('#historyControls').isVisible(),false);
 assert.match(await page.locator('.sidebar-footer').innerText(),/网页开发：Alex Wei\n测试和推广：星夜长街/);
});
test('Nationwide council prediction uses a county picker and filters multi-seat candidates',async t=>{
 const page=await pageFor(t,{width:1440,height:920});
 await page.locator('#predictionOffice').selectOption('council');
 assert.ok((await page.locator('#canvas').boundingBox()).height>=900);
 assert.equal(await page.locator('#predictionCountyPicker option').count(),22);
 assert.equal(await page.evaluate(()=>{
  const county=document.getElementById('predictionCountyPicker'),district=document.getElementById('predictionRegion');
  return [...county.options].map(option=>option.value).reduce((sum,value)=>{
   county.value=value;county.dispatchEvent(new Event('change'));return sum+district.options.length;
  },0);
 }),221);
 await page.locator('#predictionCountyPicker').selectOption({label:'台北市'});
 assert.equal(await page.locator('#county').inputValue(),'');
 assert.ok(await page.locator('#predictionRegion option').count()<30);
 const target=await page.evaluate(()=>candidateDatabase.districts.find(d=>d.county==='台北市'&&d.type==='council'&&d.seats>4).id);
 await page.locator('#predictionRegion').selectOption(target);
 const picks=page.locator('#predictionRows input[type=checkbox]');
 await picks.first().focus();
 await page.keyboard.press('Space');
 assert.equal(await page.locator('#predictionRows input:focus').count(),1);
 assert.match(await page.locator('#predictionSelectionStatus').innerText(),/已选 1/);
 await page.locator('#predictionStatusFilter').selectOption('selected');
 assert.equal(await picks.count(),1);
 await page.locator('#predictionCandidateSearch').fill('无匹配字符串');
 assert.equal(await picks.count(),0);
 assert.match(await page.locator('#predictionSelectionStatus').innerText(),/无匹配候选人/);
 await page.keyboard.press('Escape');
 assert.equal(await page.locator('#predictionDialog').isVisible(),false);
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
test('Image export candidate range switches between elected and all historical candidates',async t=>{
 const page=await pageFor(t);await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('mayor');
 await page.locator('.export-menu summary').click();
 const winners=await page.evaluate(()=>History2022View.exportRows());
 assert.ok(winners.length>0&&winners.every(r=>r.elected));
 await page.locator('#exportCandidateScope').selectOption('all');
 const all=await page.evaluate(()=>History2022View.exportRows());
 assert.ok(all.length>winners.length&&all.some(r=>!r.elected));
 const fullSvg=await page.evaluate(()=>preparedExportSvg());
 const count=await page.evaluate(s=>new DOMParser().parseFromString(s,'image/svg+xml').querySelectorAll('[data-export-winner-entry]').length,fullSvg);
 assert.equal(count,all.length);
 await page.locator('#exportCandidateScope').selectOption('winners');
 const shortSvg=await page.evaluate(()=>preparedExportSvg());
 const selectedCount=await page.evaluate(s=>new DOMParser().parseFromString(s,'image/svg+xml').querySelectorAll('[data-export-winner-entry]').length,shortSvg);
 assert.equal(selectedCount,winners.length);
 await page.locator('#exportWinnerTable').uncheck();
 assert.equal(await page.locator('#exportCandidateScope').isDisabled(),true);
 const none=await page.evaluate(()=>preparedExportSvg());
 assert.doesNotMatch(none,/data-export-winner-entry/);
});
test('Candidate export range is persisted and full forecast roster includes candidates not predicted yet',async t=>{
 const page=await pageFor(t);
 await page.locator('#county').selectOption({value:'台北市'});
 await page.locator('.export-menu summary').click();
 await page.locator('#exportCandidateScope').selectOption('all');
 const data=await page.evaluate(()=>{
  const result=exportPredictionWinnerRows();
  return {count:result.length,withElection:result.filter(r=>r.allCandidates).length};
 });
 assert.ok(data.count>1&&data.count===data.withElection);
 const full=await page.evaluate(()=>preparedExportSvg());
 assert.match(full,/data-export-winner-entry/);
 await page.reload();
 assert.equal(await page.locator('#exportCandidateScope').inputValue(),'all');
});
test('Presidential deputy and lead names stay on one line in compact SVG table, at both candidate ranges',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('president');
 await page.waitForFunction(()=>History2022View.year()===2024);
 const years=['2020','2024'];
 for(const year of years){
  await page.locator('#historyYear').selectOption(year);
  await page.waitForFunction(y=>History2022View.year()===Number(y)&&History2022View.exportRows().length>0,year);
  for(const scope of ['all','winners']){
   const data=await page.evaluate(scope=>{
    state.exportSettings.candidateScope=scope;
    const rows=History2022View.exportRows(),pre=exportPredictionTableLayout(rows);
    const svg=preparedExportSvg();
    const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
    const items=[...doc.querySelectorAll('[data-export-presidential-ticket]')];
    const ticketNames=items.map(el=>{
     const title=el.querySelector('[data-export-field="name"]');
     return{value:title?.textContent,spans:title?.querySelectorAll('tspan').length||0,
      badge:!!el.querySelector('[data-export-incumbent]')};
    });
    const full=doc.querySelector('[data-export-winner-table]>rect');
    const cols=pre.columns;
    return{count:rows.length,expected:rows.map(r=>r.name),ticketNames,
      columns:cols,compactHeight:Number(full?.getAttribute('height')),
      preHeight:pre.height,preRows:Math.max(...pre.columnEntries.map(column=>column.length)),font:pre.font,headerHeight:pre.tableHeaderHeight,
      width:Number(full?.getAttribute('width'))};
   },scope);
   assert.ok(data.count>=3,year+' '+scope+' has election candidates');
   assert.equal(data.ticketNames.length,data.count,year+' all entries are presidential tickets');
   assert.deepEqual(data.ticketNames.map(x=>x.value).sort(),data.expected.slice().sort(),year+' all names are preserved with vertical column ordering');
   assert.ok(data.ticketNames.every(x=>x.spans===1),year+' '+scope+' never splits lead and deputy names');
   assert.ok(data.ticketNames.every(x=>x.value.includes(' & ')),year+' keeps both candidates');
   assert.ok(data.headerHeight<=38&&data.font>=15,year+' table header is compact but legible');
   assert.ok(data.compactHeight<=data.preHeight,year+' final layout does not add unused height');
   assert.ok(data.compactHeight<80*data.preRows+80,year+' grouped columns remain compact without excessive padding');
  }
 }
});
test('Candidate export distinguishes constituency groups with sharper larger labels and tight columns',async t=>{
 const page=await pageFor(t);
 const layout=await page.evaluate(()=>{
  const districts=['台北市','台北市','台北市','新北市','新北市','新北市','高雄市','高雄市'];
  const rows=districts.map((district,i)=>({district,name:'候选人'+i,party:'中国国民党',
   gender:i%2?'男':'女',number:i+1,color:'#000099',incumbent:i===0?'现任':''}));
  const layout=exportPredictionTableLayout(rows),svg=svgEl('g');
  appendExportPredictionTable(svg,rows,0,layout);
  const dividers=[...svg.querySelectorAll('[data-export-district-divider]')];
  const accents=[...svg.querySelectorAll('[data-export-district-accent]')];
  const districtLabels=[...svg.querySelectorAll('[data-export-field="district"]')];
  const names=[...svg.querySelectorAll('[data-export-field="name"]')];
  const partyLabels=[...svg.querySelectorAll('[data-export-field="party"]')];
  const columnDistricts=layout.columnEntries.map(column=>column.map(entry=>entry.row.district));
  const independentHeight=layout.headingHeight+layout.tableHeaderHeight+Math.max(...layout.columnHeights)+11;
  const expectedDividers=columnDistricts.reduce((total,col)=>total+col
   .slice(1).filter((district,i)=>district!==col[i]).length,0);
  const intactConstituencies=[...new Set(districts)].every(district=>
   columnDistricts.filter(col=>col.includes(district)).length===1);
  return{gap:layout.gap,font:layout.font,dividers:dividers.length,accents:accents.length,
   expectedDividers,intactConstituencies,tableHeight:layout.height,independentHeight,
   dividerCoords:dividers.map(line=>[Number(line.getAttribute('x1')),Number(line.getAttribute('x2'))]),
   labels:districtLabels.map(el=>Number(el.getAttribute('font-size'))),
   names:names.map(el=>Number(el.getAttribute('font-size'))),
   parties:partyLabels.map(el=>Number(el.getAttribute('font-size'))),
   count:svg.querySelectorAll('[data-export-winner-entry]').length};
 });
 assert.equal(layout.count,8);
 assert.equal(layout.dividers,layout.expectedDividers,'one divider for each constituency transition in a column');
 assert.equal(layout.accents,layout.expectedDividers);
 assert.equal(layout.intactConstituencies,true,'same-district candidates stay in a single column');
 assert.equal(layout.tableHeight,layout.independentHeight,'height tracks the tallest independent column');
 assert.ok(layout.dividerCoords.every(([x1,x2])=>x2>x1+30));
 assert.ok(layout.font>=16&&layout.labels.every(v=>v>=15)&&layout.parties.every(v=>v>=15));
 assert.ok(layout.names.every(v=>v>=16));
 assert.ok(layout.gap<=5,'adjacent columns are closely spaced');
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
 assert.match(svg,/得票率/);
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
  assert.deepEqual(await page.locator('#historyOffice option').evaluateAll(nodes=>nodes.slice(0,2).map(node=>node.value)),['president','legislative']);
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

test('Mobile historical results show candidate, party, votes and election mark before expanding details',async t=>{
 const page=await pageFor(t,{width:390,height:844});
 await page.locator('#categoryHistory').click();
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('22席'));
 await page.locator('#historyCounty').selectOption({label:'台北市'});
 await page.locator('#historyViewCandidates').click();
 const list=page.locator('#historyResults table');
 assert.deepEqual(await list.locator('thead th:visible').allTextContents(),['候选人','政党','得票数','当选','详情']);
 await list.locator('tbody details summary').first().click();
 assert.match(await list.locator('tbody details[open]').innerText(),/得票率/);

 await page.locator('#regions [data-region="63000"]').press('Enter');
 const dialog=page.locator('#historyResultDialog');
 assert.match(await dialog.locator('h2').textContent(),/台北市 · 2022 市长选举结果/);
 const headers=dialog.locator('thead th:visible');
 assert.deepEqual(await headers.allTextContents(),['候选人','政党','得票数','当选','详情']);
 const row=dialog.locator('.history-elected-row');
 assert.equal(await row.locator('td:visible').first().textContent(),'蒋万安');
 const mark=row.getByRole('img',{name:'当选',exact:true});
 await mark.evaluate(el=>el.decode());
 assert.equal(await mark.isVisible(),true);
 const wrap=dialog.locator('.history-table-wrap');
 assert.ok(await wrap.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
 await row.locator('details summary').click();
 const details=row.locator('details[open]');
 assert.equal(await details.isVisible(),true);
 assert.deepEqual(await details.locator('dt').allTextContents(),['号次','性别','选举时现任','得票率']);
 assert.equal(await details.locator('dd').nth(1).textContent(),'男');
});

test('Map supports skipping and has one tab stop with directional navigation',async t=>{
 const page=await pageFor(t);
 const entry=page.locator('#regions [tabindex="0"]');
 assert.equal(await entry.count(),1);
 await entry.focus();
 const before=await entry.getAttribute('data-region');
 await page.keyboard.press('ArrowDown');
 assert.notEqual(await entry.getAttribute('data-region'),before);
 assert.equal(await entry.count(),1);
 assert.equal(await entry.evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Tab');
 assert.equal(await page.locator('#regions :focus').count(),0);
 await page.locator('#skipMap').focus();
 await page.keyboard.press('Enter');
 assert.equal(await page.locator('#afterMap').evaluate(el=>el===document.activeElement),true);
});

test('Historical result windows share prediction drag and resize controls',async t=>{
 const page=await pageFor(t,{width:1200,height:950});
 await page.locator('#categoryHistory').click();
 await page.waitForFunction(()=>document.querySelector('#historySummary').textContent.includes('22席'));
 await page.locator('#regions [data-region="63000"]').press("Enter");
 const dialog=page.locator('#historyResultDialog');
 const before=await dialog.boundingBox();
 const move=dialog.locator('.floating-dialog-move');
 await move.press('ArrowRight');
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
 assert.match(csv,/正职性别/);
 assert.match(csv,/副职性别/);
 assert.match(csv,/王清峰/);
 await page.locator('#historyCounty').selectOption('');
 await page.locator('#historyScale').selectOption('district');
 const historicalSvg=await exportSvg(page);
 assert.match(historicalSvg,/1996 台湾地区领导人选举结果/);
 assert.match(historicalSvg,/李登辉 &amp; 连战/);
 assert.doesNotMatch(historicalSvg,/2022 实际选举结果/);
 const historicalTable=await page.evaluate(source=>{
  const doc=new DOMParser().parseFromString(source,'image/svg+xml');
  const content=doc.querySelector('[data-export-winner-table]')?.textContent||'';
  return {name:content.includes('李登辉 & 连战'),sex:content.includes('男 / 男'),repeat:content.includes('2022 实际选举结果')};
 },historicalSvg);
 assert.equal(historicalTable.name,true);
 assert.equal(historicalTable.sex,true);
 assert.equal(historicalTable.repeat,false);
 await page.locator('#historyOffice').selectOption('mayor');
 await page.waitForFunction(()=>History2022View.office()==='mayor'&&History2022View.year()===2022&&
  document.querySelector('#historySummary').textContent.includes('个地区'));
 assert.deepEqual(await page.locator('#historyYear option').allTextContents(),['1993/1994','1997/1998','2001/2002','2005/2006','2009/2010','2014','2018','2022']);
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


test('2502 wording policy covers live UI, SVG image export and 2026/2022 CSV downloads',async t=>{
 const page=await pageFor(t,{width:1440,height:920});
 const source=await page.locator('.footer-data-source').textContent();
 assert.match(source,/台湾地区选举事务主管机构/);
 assert.doesNotMatch(source,/中选会/);
 await page.locator('#workspaceFree').click();
 await page.waitForFunction(()=>document.querySelector('#palette')?.textContent.includes('“时代力量”'));
 assert.equal(await page.evaluate(()=>partyMatch('“时代力量”')?.id),'npp');
 await page.waitForFunction(()=>document.querySelector('#palette')?.textContent.includes('“台湾团结联盟”'));
 assert.equal(await page.evaluate(()=>partyMatch('“台湾团结联盟”')?.id),'tsu');
 assert.equal(await page.evaluate(()=>partyMatch('“台联党”')?.id),'tsu');
 assert.equal(await page.evaluate(()=>PARTY_PRESETS.find(p=>p.id==='tsu')?.name),'台湾团结联盟');
 assert.equal(await page.evaluate(()=>PARTY_PRESETS.find(p=>p.id==='npp')?.name),'时代力量','source identity remains unchanged');
 await page.evaluate(()=>document.querySelector('#directoryDialog').showModal());
 await page.locator('#directoryOffice').selectOption('council');
 await page.locator('#directoryCounty').selectOption({label:'台北市'});
 const directory=await download(page,'#downloadCandidateData');
 assert.match(directory,/少数民族/,'directory CSV has normalized electorate scope');
 assert.doesNotMatch(directory,/原住民|中选会|总统|全国/,'directory CSV contains no unnormalized election terminology');
 await page.locator('#closeDirectory').click();
 // Validate SVG/PNG serialization path, including user-provided image captions.
 await page.evaluate(()=>{
  state.title='中选会总统选举';
  state.exportSettings.note='平地原住民、时代力量及全台 · 含离岛';
  render();
 });
 const svg=await exportSvg(page);
 const svgText=await page.evaluate(svg=>new DOMParser().parseFromString(svg,'image/svg+xml').documentElement.textContent,svg);
 assert.match(svgText,/台湾地区选举事务主管机构台湾地区领导人选举/);
 assert.match(svgText,/“时代力量”/);
 assert.doesNotMatch(svgText,/原住民|中选会|总统|全台 · 含离岛/);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('council');
 await page.waitForFunction(()=>History2022View.office()==='council'&&document.querySelector('#historySummary')?.textContent.includes('个'));
 const historical=await download(page,'#historyExportCsv');
 assert.match(historical,/"县市","选区"/);
 assert.doesNotMatch(historical,/原住民|中选会|总统|全国/,'historical CSV uses normalized labels while source remains archived');
});


test('Historical council overview switches all regions, counties and individual districts',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('council');
 await page.locator('#historyCounty').selectOption({label:'高雄市'});
 await page.locator('#historyViewOverview').click();
 const scope=page.locator('#historyOverviewScope'),county=page.locator('#historyOverviewCounty'),area=page.locator('#historyOverviewContest');
 assert.deepEqual(await scope.locator('option').allTextContents(),['全部地区（含金门、马祖）','县市','议员选区']);
 assert.equal(await scope.inputValue(),'county');
 assert.equal(await county.inputValue(),'高雄市');
 assert.equal(await area.isVisible(),false);
 let data=await page.evaluate(()=>({count:HistoryWorkspace.result().contests.length,title:document.querySelector('#historyOverviewTitle').textContent}));
 assert.ok(data.count>1);assert.match(data.title,/高雄市/);
 await scope.selectOption('district');
 assert.equal(await area.isVisible(),true);
 const first=area.locator('option').first();
 const contestId=await first.getAttribute('value'),label=await first.innerText();
 assert.ok(contestId&&label.includes('高雄市'));
 await area.selectOption(contestId);
 const scoped=await page.evaluate(()=>({
  title:document.querySelector('#historyOverviewTitle').textContent,
  detail:document.querySelector('#historyOverviewDescription').textContent,
  contests:HistoryWorkspace.result().contests,
  overview:HistoryWorkspace.overview(),
  selected:HistoryWorkspace.selectedOverviewContest(),
  metrics:[...document.querySelectorAll('#historyOverviewCards strong')].map(n=>n.textContent)
 }));
 assert.equal(scoped.selected,contestId);
 assert.equal(scoped.contests.length,1);
 assert.ok(scoped.title.includes(scoped.contests[0].district_name),scoped.title);
 assert.match(scoped.detail,/当前统计范围：高雄市/);
 assert.equal(scoped.overview.registeredVoters,scoped.contests[0].registered_voters);
 assert.equal(scoped.overview.ballotsCast,scoped.contests[0].ballots_cast);
 assert.ok(scoped.metrics.slice(0,6).every(value=>!value.includes('暂无资料')));
 await scope.selectOption('all');
 const all=await page.evaluate(()=>({
  title:document.querySelector('#historyOverviewTitle').textContent,
  counties:[...new Set(HistoryWorkspace.result().contests.map(c=>c.county_name))],
  records:HistoryWorkspace.result().contests.length
 }));
 assert.match(all.title,/全部地区（含金门、马祖）/);
 assert.ok(all.counties.includes('金门县')&&all.counties.includes('连江县'));
 assert.ok(all.records>100);
 assert.equal(await county.isVisible(),false);
 assert.equal(await area.isVisible(),false);
});
test('Council headline figures sum separate electorates but charts preserve three groups',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('council');
 await page.locator('#historyViewOverview').click();
 const numbers=await page.evaluate(()=>{
  const overview=HistoryWorkspace.overview();
  const sum=key=>overview.turnoutGroups.reduce((a,b)=>a+b[key],0);
  return{groups:overview.turnoutGroups.map(g=>g.electorate),
   registered:overview.registeredVoters,expectedRegistered:sum('registeredVoters'),
   ballots:overview.ballotsCast,expectedBallots:sum('ballotsCast'),
   valid:overview.validVotes,expectedValid:sum('validVotes'),
   invalid:overview.invalidVotes,expectedInvalid:sum('invalidVotes'),
   rate:overview.turnout,expectedRate:sum('ballotsCast')/sum('registeredVoters')*100,
   cards:[...document.querySelectorAll('#historyOverviewCards strong')].map(x=>x.textContent),
   charts:[...document.querySelectorAll('#historyOverviewCharts h4')].map(x=>x.textContent),
   note:document.querySelector('#historyOverviewNote')?.textContent};
 });
 assert.deepEqual(numbers.groups,['regional','plains','mountain']);
 for(const pair of [['registered','expectedRegistered'],['ballots','expectedBallots'],
  ['valid','expectedValid'],['invalid','expectedInvalid']])assert.equal(numbers[pair[0]],numbers[pair[1]]);
 assert.equal(numbers.rate.toFixed(6),numbers.expectedRate.toFixed(6));
 assert.ok(numbers.cards.slice(0,6).every(value=>value!=='按类别分别统计'&&value!=='暂无资料'));
 assert.deepEqual(numbers.charts,['区域议员','平地少数民族议员','山地少数民族议员','候选与当选对比']);
 assert.match(numbers.note,/选民可能被重复计入/);
});
test('2024 presidential county overview fills voter turnout from reconciled county records',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('president');
 await page.waitForFunction(()=>History2022View.year()===2024&&HistoryWorkspace.result()?.contests?.length===22);
 await page.locator('#historyCounty').selectOption({label:'台北市'});
 await page.locator('#historyViewOverview').click();
 const scoped=await page.evaluate(()=>({
  title:document.querySelector('#historyOverviewTitle').textContent,
  rows:HistoryWorkspace.result().contests.length,
  data:HistoryWorkspace.overview(),
  metrics:[...document.querySelectorAll('#historyOverviewCards strong')].map(e=>e.textContent)
 }));
 assert.match(scoped.title,/2024年.*台北市/);
 assert.equal(scoped.rows,1);
 assert.equal(scoped.data.registeredVoters,2090062);
 assert.equal(scoped.data.ballotsCast,1552592);
 assert.equal(scoped.data.invalidVotes,10581);
 assert.ok(scoped.metrics.slice(0,6).every(value=>!value.includes('暂无资料')));
});


test('Presidential, mayor and township overviews expose all/county/town levels without guessed local turnout',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 for(const office of ['president','mayor','township']){
  await page.locator('#historyOffice').selectOption(office);
  await page.waitForFunction(office=>History2022View.office()===office,office);
  if(await page.locator('#historyOverviewPanel').isHidden())await page.locator('#historyViewOverview').click();
  const scope=page.locator('#historyOverviewScope'),county=page.locator('#historyOverviewCounty'),area=page.locator('#historyOverviewContest');
  assert.deepEqual(await scope.locator('option').allTextContents(),['全部地区（含金门、马祖）','县市','乡镇市区']);
  await scope.selectOption('all');
  const all=await page.evaluate(()=>({
   counties:[...new Set(HistoryWorkspace.result().contests.map(c=>c.county_name))],
   count:HistoryWorkspace.result().contests.length}));
  assert.ok(all.count>1);
  if(office!=='township')assert.ok(all.counties.includes('金门县')&&all.counties.includes('连江县'));
  await scope.selectOption('county');
  const countyLabel=office==='township'?'金门县':'台北市';
  // UI wording may show "金门"/"马祖", but option values retain the
  // canonical election county IDs; select by value rather than visible label.
  const countyOptions=await county.locator('option').evaluateAll(nodes=>nodes.map(x=>x.value));
  assert.ok(countyOptions.includes(countyLabel),office+' missing '+countyLabel+
   ' scope values: '+JSON.stringify(countyOptions.slice(0,25)));
  await county.selectOption(countyLabel);
  assert.equal(await page.evaluate(()=>new Set(HistoryWorkspace.result().contests.map(c=>c.county_name)).size),1);
  await scope.selectOption('town');
  assert.equal(await area.isVisible(),true);
  const choicesCount=await area.locator('option').count();
  const detail=await page.evaluate(()=>({
   scope:HistoryWorkspace.selectedOverviewScope(),
   historyOffice:History2022View.office(),
   items:History2022View.allTowns?.().slice(0,2),
   countyOptions:[...document.querySelector('#historyOverviewCounty').options].map(x=>x.value).slice(0,6),
   resultCount:HistoryWorkspace.result()?.contests?.length
  }));
  assert.ok(choicesCount>0,office+' has no town options: '+JSON.stringify(detail));
  const local=await page.evaluate(()=>({
   selection:HistoryWorkspace.selectedOverviewScope(),
   data:HistoryWorkspace.overview(),
   contests:HistoryWorkspace.result().contests.length,
   title:document.querySelector('#historyOverviewTitle').textContent}));
  assert.equal(local.selection.scope,'town');
  assert.match(local.title,office==='township'?/金门(?:县)?/:/台北市/);
  assert.ok(local.contests>=1);
  if(office==='president'){
   // Newly sourced, CEC-reconciled presidential township figures are now
   // available instead of the previous deliberately unfilled placeholders.
   assert.ok(Number.isInteger(local.data.registeredVoters)&&local.data.registeredVoters>0,
    'presidential local registered voters come from validated CEC profiles');
   assert.ok(Number.isInteger(local.data.ballotsCast)&&local.data.ballotsCast>0);
   assert.ok(Number.isInteger(local.data.invalidVotes)&&local.data.invalidVotes>=0);
   assert.equal(local.data.validVotes+local.data.invalidVotes,local.data.ballotsCast);
  }else if(office==='mayor'){
   // All 366 regular 2022 mayoral wards now have official CEC elprof
   // voter/ballot totals; only the separate Chiayi rerun retains nulls.
   assert.ok(Number.isInteger(local.data.registeredVoters)&&local.data.registeredVoters>0);
   assert.ok(Number.isInteger(local.data.ballotsCast)&&local.data.ballotsCast>0);
   assert.ok(Number.isInteger(local.data.invalidVotes)&&local.data.invalidVotes>=0);
   assert.equal(local.data.validVotes+local.data.invalidVotes,local.data.ballotsCast);
   assert.ok(local.data.validVotes>0);
  }else{
   assert.ok(Number.isInteger(local.data.registeredVoters));
   assert.ok(Number.isInteger(local.data.ballotsCast));
  }
  await scope.selectOption('all');
  // Switching office preserves its loaded snapshot but resets geographic controls.
 }
});


test('Ten legislative history years expose data and real historical electoral maps',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative'&&History2022View.year()===2024&&History2022View.snapshot()?.rows?.length>0,{timeout:20000});
 assert.ok(await page.evaluate(()=>History2022View.items().length>=22),'nationwide county map renders');
 await page.locator('#historyElectorate').selectOption('party');
 await page.waitForFunction(()=>document.querySelector('#historyScale').value==='county');
 assert.ok(await page.evaluate(()=>History2022View.items().some(f=>f.county==='金门县')&&History2022View.items().some(f=>f.county==='连江县')),'outer islands are available');
 await page.locator('#historyYear').selectOption('2004');
 await page.waitForFunction(()=>History2022View.year()===2004&&History2022View.snapshot()?.year===2004,{timeout:20000});
 assert.ok((await page.locator('#historyElectorate option').allTextContents()).includes('不分区民代'));
 await page.locator('#historyElectorate').selectOption('regional');
 await page.waitForFunction(()=>History2022View.items().length>20);
 await page.locator('#historyMetric').selectOption('seats');
 assert.equal(await page.locator('#historyMetric').inputValue(),'seats','older multi-member races retain party seat maps');
 await page.locator('#historyYear').selectOption('1992');
 await page.waitForFunction(()=>History2022View.year()===1992&&History2022View.snapshot()?.year===1992,{timeout:20000});
 await page.locator('#historyElectorate').selectOption('party');
 assert.equal(await page.locator('#historyScale').inputValue(),'county','1992 derived party votes have an all-area county map');
 assert.ok(await page.evaluate(()=>History2022View.items().length>=22));
 await page.locator('#historyOffice').selectOption('mayor');
 await page.waitForFunction(()=>History2022View.office()==='mayor'&&History2022View.year()===2022);
 const officialOrder=['台北市','新北市','桃园市','台中市','台南市','高雄市','新竹县','苗栗县','彰化县','南投县','云林县','嘉义县','屏东县','宜兰县','花莲县','台东县','澎湖县','基隆市','新竹市','嘉义市','金门县','连江县'];
 assert.deepEqual(await page.locator('#historyCounty option').evaluateAll(options=>options.slice(1).map(option=>option.value)),officialOrder);
});


test('Verified historical proper names survive map UI, candidate search and CSV exports',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative'&&History2022View.year()===2024);
 await page.locator('#historyYear').selectOption('1992');
 await page.waitForFunction(()=>History2022View.year()===1992&&History2022View.snapshot()?.year===1992);
 await page.locator('#historyViewCandidates').click();
 await page.locator('#historySearch').fill('王建煊');
 assert.match(await page.locator('#historyResults').innerText(),/王建煊/);
 await page.locator('#historySearch').fill('魏耀乾');
 assert.match(await page.locator('#historyResults').innerText(),/魏耀乾/);
 assert.doesNotMatch(await page.locator('#historyResults').innerText(),/魏耀干/);
 const firstCsv=await page.evaluate(()=>HistoryWorkspace.historyCsv(HistoryWorkspace.result(),HistoryWorkspace.selection()));
 assert.match(firstCsv,/王建煊/);
 assert.match(firstCsv,/魏耀乾/);
 assert.doesNotMatch(firstCsv,/王建火宣|魏耀干/);
 await page.locator('#historyYear').selectOption('2024');
 await page.waitForFunction(()=>History2022View.year()===2024&&History2022View.snapshot()?.year===2024);
 await page.locator('#historyElectorate').selectOption('plains');
 const secondCsv=await page.evaluate(()=>HistoryWorkspace.historyCsv(HistoryWorkspace.result(),HistoryWorkspace.selection()));
 assert.match(secondCsv,/米甘幹．理佛克/);
 assert.doesNotMatch(secondCsv,/米甘干．理佛克/);
});


test('Legislative redesign: one national map with county names, county drilldown and no nationwide district numbers',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative'&&History2022View.snapshot()?.year===2024);
 assert.deepEqual(await page.locator('#historyScale option').evaluateAll(a=>a.map(o=>o.value)),['county','district']);
 const official=['台北市','新北市','桃园市','台中市','台南市','高雄市','新竹县','苗栗县','彰化县','南投县','云林县','嘉义县','屏东县','宜兰县','花莲县','台东县','澎湖县','基隆市','新竹市','嘉义市','金门县','连江县'];
 assert.deepEqual(await page.locator('#historyCounty option').evaluateAll(a=>a.slice(1).map(o=>o.value)),official);
 assert.equal(await page.locator('#historyCounty option').first().getAttribute('value'),'');

 assert.equal(await page.locator('#historyScale').inputValue(),'county');
 assert.ok(await page.evaluate(()=>document.querySelectorAll('#regions path[data-region]').length>=73));
 assert.ok(await page.evaluate(()=>document.querySelectorAll('#labels text[data-label]').length>=20));
 assert.equal(await page.locator('#labels [data-placement="district-number"]').count(),0);
 assert.equal(await page.locator('#labels [data-number-key]').count(),0);
 assert.equal(await page.locator('#regions > g[data-electorate]').count(),0,'no parallel nationality panels');
 await page.locator('#historyCounty').selectOption('台北市');
 await page.waitForFunction(()=>document.querySelector('#historyScale').value==='county');
 assert.equal(await page.locator('#labels [data-placement="district-number"]').count()>0,true,'county view shows district numbers');
 await page.locator('#historyScale').selectOption('district');
 assert.equal(await page.locator('#historyFocusBox').isVisible(),true);
 const choices=await page.locator('#historyFocus option').allTextContents();
 assert.ok(choices.length>=2);
 await page.locator('#historyFocus').selectOption({index:1});
 assert.equal(await page.locator('#regions path[data-region]').count(),1,'focus a single district');
});

test('Historical regional districts at all-area scope stay nationwide and respect single/multiple seats',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative'&&History2022View.year()===2024&&History2022View.snapshot()?.year===2024);
 await page.locator('#historyScale').selectOption('district');
 const nationwide=await page.evaluate(()=>{
  const features=History2022View.legislativeFeatures(),paths=new Map([...document.querySelectorAll('#regions path[data-region]')].map(p=>[p.dataset.region,p]));
  const colored=features.filter(f=>{
   const winner=History2022View.legislativeSeatRows(f)[0];
   return winner&&paths.get(f.id)?.getAttribute('fill')===predictionParty(winner.party).color;
  }).length;
  return {county:document.querySelector('#historyCounty').value,scale:History2022View.legislativeScale(),
   mapCount:currentItems().length,total:features.length,colored};
 });
 assert.equal(nationwide.county,'','selecting district level must not jump to Taipei');
 assert.equal(nationwide.scale,'district');
 assert.equal(nationwide.mapCount,nationwide.total,'map shows every regional constituency');
 assert.equal(nationwide.total,73,'2024 has 73 regional districts');
 assert.equal(nationwide.colored,73,'every district uses its own winner party color');
 await page.locator('#historyCounty').selectOption('台北市');
 await page.locator('#historyScale').selectOption('district');
 await page.locator('#historyCounty').selectOption('');
 assert.equal(await page.locator('#historyScale').inputValue(),'district','clearing county keeps district layer');
 assert.equal(await page.locator('#regions path[data-region]').count(),73);
 await page.locator('#historyYear').selectOption('2004');
 await page.waitForFunction(()=>History2022View.year()===2004&&History2022View.snapshot()?.year===2004);
 assert.equal(await page.locator('#historyCounty').inputValue(),'');
 assert.equal(await page.locator('#historyScale').inputValue(),'district');
 const old=await page.evaluate(()=>({districts:currentItems().length,expected:History2022View.legislativeFeatures().length,
  badged:document.querySelectorAll('#labels [data-history-seat-district]').length,
  partyLogos:document.querySelectorAll('#labels [data-historical-party-logo]').length}));
 assert.equal(old.districts,old.expected,'old regional districts are all present on all-area map');
 assert.ok(old.badged>0&&old.partyLogos>0,'old multi-member all-area district map shows elected emblems');
});
test('Removed forecast archive/review no longer loads UI or scripts',async t=>{
 const page=await pageFor(t);
 assert.equal(await page.locator('#forecastArchive').count(),0);
 assert.equal(await page.evaluate(()=>typeof window.ForecastArchiveUI),'undefined');
 assert.equal(await page.evaluate(()=>typeof window.ForecastArchiveCore),'undefined');
});

test('Legislative redraw: pre-2008 winners use emblems instead of colored party regions',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.locator('#historyYear').selectOption('2004');
 await page.waitForFunction(()=>History2022View.snapshot()?.year===2004);
 assert.equal(await page.locator('#historyScale').inputValue(),'county');
 assert.equal(await page.locator('#labels [data-placement="district-number"]').count(),0);
 assert.equal(await page.locator('#labels [data-history-seat-district]').count(),0,'2004 nationwide map must show county names only, without party emblems');
 await page.locator('#historyCounty').selectOption('台北市');
 assert.ok(await page.locator('#labels [data-history-seat-district]').count()>=2,'county detail should display each actual winning party emblem');
 assert.ok(await page.locator('#labels [data-history-seat-card] [data-historical-seat-frame]').count()>=2,
  'multi-member constituency emblems are grouped in translucent frames');
 assert.equal(await page.locator('#labels [data-history-seat-number]').first().getAttribute('font-size'),'24',
  'historical constituency numbers match council seat cards');
 assert.ok(await page.locator('#labels [data-seat-grid-rows]').evaluateAll(cards=>
  cards.some(card=>Number(card.getAttribute('data-seat-grid-rows'))>1)),
  'winning party logos wrap into several rows');
 assert.equal(await page.locator('#labels [data-history-legislative-seat-layer]').getAttribute('data-seat-style'),'council',
  'regional legislative seats reuse council visual language');
 assert.ok(await page.locator('#labels [data-history-seat-card] [data-seat-slot][data-seat-status="elected"]').count()>5,
  'one council-style circular badge is drawn for each elected person');
 assert.ok(await page.locator('#labels [data-historical-seat-frame]').evaluateAll(frames=>
  frames.every(frame=>frame.getAttribute('rx')==='9')),
  'historical frames have the same corner radius as council frames');
 assert.ok(await page.locator('#labels [data-history-seat-card] [data-seat-slot] circle').evaluateAll(circles=>
  circles.every(circle=>Number(circle.getAttribute('r'))===16)),
  'legislative emblems share the council 32px circular seat size');
 assert.equal(await page.locator('#labels [data-history-seat-card] rect[fill="#ffffff55"]').count()+
                    await page.locator('#labels [data-history-seat-card] rect[fill="#ffffffed"]').count(),
              await page.locator('#labels [data-history-seat-card]').count(),
              'each seat frame uses exactly the council inside/outside translucency');

 await page.locator('#historyViewCandidates').click();
 assert.ok(await page.locator('#historyLegislativeSummary').innerText().then(t=>t.includes('当选党派席次')));
 assert.equal(await page.locator('#historyResults table[data-ballot="regional"]').count(),1);
 assert.ok(await page.locator('#historyResults tr.history-elected-row').count()>0);
});

test('2008–2024 party votes map all 368 actual townships, support party-specific shares and town drilldown',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.locator('#historyElectorate').selectOption('party');
 for(const year of [2008,2012,2016,2020,2024]){
  await page.locator('#historyYear').selectOption(String(year));
  await page.waitForFunction(y=>History2022View.snapshot()?.year===y&&History2022View.year()===y,year);
  await page.locator('#historyScale').selectOption('town');
  assert.equal(await page.locator('#historyCounty').inputValue(),'',year+' nationwide town layer must not force a county');
  assert.equal(await page.locator('#historyScale').inputValue(),'town');
  const map=await page.evaluate(()=>{
   const items=History2022View.items(),rows=History2022View.snapshot().rows.filter(r=>r.electorate==='party');
   return{features:items.length,counties:new Set(items.map(x=>x.county)).size,
    votes:rows.filter(x=>x.level==='town').reduce((a,b)=>a+b.votes,0),
    national:rows.filter(x=>x.level==='national').reduce((a,b)=>a+b.votes,0),
    townNames:items.filter(x=>x.county==='台北市').map(x=>x.name)};
  });
  assert.equal(map.features,368,year+' displays all real town polygons');
  assert.equal(map.votes,map.national,year+' reconciles real town vote records with national total');
  assert.ok(map.townNames.includes('北投区'));
  assert.equal(await page.locator('#regions path[data-region]').count(),368,'one county polygon must not replace town map');
 }
 await page.locator('#historyMetric').selectOption('share');
 await page.locator('#historyCandidateScope').selectOption('candidate');
 assert.equal(await page.locator('label[for="historyCandidate"]').innerText(),'政党');
 assert.equal(await page.locator('#historyCandidate option').count(),16,'party selector contains each party exactly once');
 await page.locator('#historyCandidate').selectOption({label:'民主进步党'});
 const crossTown=await page.evaluate(()=>{
  const rows=History2022View.snapshot().rows.filter(r=>r.electorate==='party'&&r.level==='town'&&r.party==='民主进步党');
  return{townCount:new Set(rows.map(r=>r.county+'|'+r.town)).size,
   mapCount:History2022View.items().length,
   chosen:document.querySelector('#historyCandidate').selectedOptions[0]?.textContent};
 });
 assert.deepEqual(crossTown,{townCount:368,mapCount:368,chosen:'民主进步党'});
 await page.locator('#historyCounty').selectOption('台北市');
 assert.equal(await page.locator('#historyScale').inputValue(),'town','choosing a county keeps the fine geographic level');
 assert.equal(await page.evaluate(()=>History2022View.items().length),12);
 await page.locator('#returnTaiwanMap').click();
 assert.equal(await page.locator('#historyScale').inputValue(),'town','return restores nationwide township granularity');
 assert.equal(await page.evaluate(()=>History2022View.items().length),368);
 await page.locator('#regions path[data-region="legislative-area:2024:台北市|北投区"]').click({force:true});
 assert.equal(await page.locator('#historyCounty').inputValue(),'台北市');
 assert.equal(await page.locator('#historyScale').inputValue(),'town');
 assert.ok(await page.locator('#historyResultDialog').isVisible(),'clicking a township opens its own party tally');
 const expected=await page.evaluate(()=>History2022View.snapshot().rows.find(r=>
  r.electorate==='party'&&r.level==='town'&&r.county==='台北市'&&r.town==='北投区'&&r.party==='民主进步党')?.votes);
 assert.ok(await page.locator('#historyDialogRows').innerText().then(t=>t.includes(expected.toLocaleString('zh-CN'))));
});

test('Legislative indigenous and party ballots have geography-appropriate levels and non-candidate result tables',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.locator('#historyElectorate').selectOption('party');
 assert.deepEqual(await page.locator('#historyScale option').evaluateAll(a=>a.map(o=>o.value)),['county','town']);
 assert.equal(await page.locator('#labels [data-placement="district-number"]').count(),0);
 await page.locator('#historyViewCandidates').click();
 assert.equal(await page.locator('#historyResults table[data-ballot="party"] thead th').count(),4);
 await page.locator('#historyCounty').selectOption('金门县');
 await page.locator('#historyScale').selectOption('town');
 assert.ok(await page.locator('#regions path[data-region]').count()>0);
 await page.locator('#historyElectorate').selectOption('mountain');
 assert.equal(await page.locator('#historyScale').inputValue(),'county');
 await page.locator('#historyYear').selectOption('1992');
 await page.waitForFunction(()=>History2022View.snapshot()?.year===1992);
 assert.deepEqual(await page.locator('#historyScale option').evaluateAll(a=>a.map(o=>o.value)),['county']);
 assert.match(await page.locator('#historyLegislativeMapHint').innerText(),/不推算地方票数/);
});


test('2004 Kaohsiung districts preserve their former city boundaries',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.locator('#historyYear').selectOption('2004');
 await page.waitForFunction(()=>History2022View.snapshot()?.year===2004);
 await page.locator('#historyCounty').selectOption('高雄市');
 const result=await page.evaluate(()=>{
  const districts=currentItems().filter(f=>f.county==='高雄市');
  return districts.map(f=>({number:f.number,box:f.box,partySeats:History2022View.legislativeSeatRows(f).length,
   frame:!!document.querySelector('#labels [data-history-seat-district="'+CSS.escape(f.id)+'"]')}));
 });
 assert.equal(result.length,2);
 const first=result.find(x=>x.number===1),second=result.find(x=>x.number===2);
 assert.ok(first&&second);
 assert.ok(first.box[1]>440,'former Kaohsiung County Sanmin township must never enter urban constituency 1');
 assert.ok(first.box[2]<190);
 assert.deepEqual([first.partySeats,second.partySeats],[6,5]);
 assert.equal(first.frame,true);assert.equal(second.frame,true);
});
test('Historic legislative nationwide maps label counties instead of constituency numbers',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative'&&History2022View.year()===2024&&History2022View.snapshot()?.rows?.length>0);
 assert.deepEqual(await page.locator('#historyScale option').allTextContents(),['县市','选举区']);
 await page.waitForFunction(()=>[...document.querySelectorAll('#labels [data-label]')].some(node=>node.textContent.includes('台北')),{timeout:10000});
 const labels=await page.locator('#labels [data-label]').allTextContents();
 assert.ok(labels.some(name=>name.includes('台北')),'nationwide regional map has county labels');
 assert.equal(await page.locator('#labels [data-placement="district-number"]').count(),0,'no constituency numbers in nationwide view');
 await page.locator('#historyYear').selectOption('2004');
 await page.waitForFunction(()=>History2022View.year()===2004&&History2022View.snapshot()?.year===2004);
 assert.equal(await page.locator('#labels [data-placement="district-number"]').count(),0);
 assert.equal(await page.locator('#labels [data-history-seat-district]').count(),0,'old multi-seat nationwide map never draws emblems');
 await page.locator('#historyCounty').selectOption('台北市');
 assert.equal(await page.locator('#historyScale').inputValue(),'county');
 assert.ok(await page.locator('#labels [data-label]').count()>0);
 assert.ok(await page.locator('#labels [data-history-seat-district]').count()>0,'old multi-seat county map draws party emblems');
 await page.locator('#historyElectorate').selectOption('party');
 assert.deepEqual(await page.locator('#historyScale option').allTextContents(),['县市','乡镇市区']);
 await page.locator('#historyElectorate').selectOption('mountain');
 assert.deepEqual(await page.locator('#historyScale option').allTextContents(),['县市','乡镇市区']);
});

test('Overview statistical region controls change the corresponding historical map geography',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('council');
 await page.locator('#historyViewOverview').click();
 const scope=page.locator('#historyOverviewScope'),county=page.locator('#historyOverviewCounty'),area=page.locator('#historyOverviewContest');
 assert.equal(await page.locator('#historyCounty').inputValue(),'');
 assert.equal(await page.locator('#regions path[data-region]').count(),22,'national council overview uses 22 county polygons');
 await scope.selectOption('county');
 await county.selectOption('高雄市');
 assert.equal(await page.locator('#historyCounty').inputValue(),'高雄市');
 assert.ok(await page.locator('#regions path[data-region]').count()>2,'county seat view displays district polygons');
 await scope.selectOption('district');
 await area.selectOption({index:0});
 assert.equal(await page.locator('#regions .history-overview-focused-region').count(),1,
  'selected council district is highlighted on the geographic map');
 await scope.selectOption('all');
 assert.equal(await page.locator('#historyCounty').inputValue(),'');
 assert.equal(await page.locator('#regions path[data-region]').count(),22);
 await page.locator('#historyOffice').selectOption('legislative');
 await page.locator('#historyYear').selectOption('2004');
 await page.waitForFunction(()=>History2022View.snapshot()?.year===2004);
 if(await page.locator('#historyOverviewPanel').isHidden())await page.locator('#historyViewOverview').click();
 await page.locator('#historyOverviewScope').selectOption('county');
 await page.locator('#historyOverviewCounty').selectOption('高雄市');
 assert.equal(await page.locator('#historyScale').inputValue(),'county');
 assert.equal(await page.locator('#regions path[data-region]').count(),2);
 await page.locator('#historyOverviewScope').selectOption('district');
 assert.equal(await page.locator('#historyScale').inputValue(),'district');
 assert.equal(await page.locator('#regions path[data-region]').count(),1);
 await page.locator('#historyOverviewScope').selectOption('all');
 assert.equal(await page.locator('#historyScale').inputValue(),'county');
 assert.ok(await page.locator('#regions path[data-region]').count()>=22);
});
test('Council and historic multi-member legislative nationwide maps use plurality of actual county seats',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('council');
 await page.waitForFunction(()=>History2022View.snapshot()?.year===2022&&History2022View.countySeatLeader('台北市').seats>0);
 const check=await page.evaluate(()=>{
  const f=currentItems().find(f=>f.name==='台北市'),counts=History2022View.countySeatLeader('台北市'),
  el=document.querySelector('#regions path[data-region="'+f.id+'"]');
  return{leader:counts,fill:el.getAttribute('fill'),districts:currentItems().length};
 });
 assert.equal(check.districts,22);
 assert.ok(check.leader.party&&check.leader.seats>0);
 assert.equal(check.fill,await page.evaluate(party=>predictionParty(party).color,check.leader.party));
 await page.locator('#historyOffice').selectOption('legislative');
 await page.locator('#historyYear').selectOption('2004');
 await page.waitForFunction(()=>History2022View.snapshot()?.year===2004);
 const historical=await page.evaluate(()=>{
  const counties=currentItems(),f=counties.find(f=>f.county==='高雄市'),dominant=History2022View.countySeatLeader('高雄市'),
  el=[...document.querySelectorAll('#regions path[data-region]')].find(p=>p.dataset.region===f?.id);
  return{count:counties.length,isCounty:counties.every(f=>f.name===f.county),seat:dominant,
   fill:el?.getAttribute('fill'),expected:dominant.party?predictionParty(dominant.party).color:dominant.tied?'#aebdb4':'#edf1e9',
   logos:document.querySelectorAll('#labels [data-history-seat-card]').length};
 });
 assert.ok(historical.count>=22);
 assert.equal(historical.isCounty,true);
 assert.equal(historical.fill,historical.expected);
 assert.equal(historical.logos,0);
});

test('2020/2024 legislative overviews show CEC-verified constituency and township turnout',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 for(const year of ['2020','2024']){
  await page.locator('#historyYear').selectOption(year);
  await page.waitForFunction(year=>History2022View.snapshot()?.year===Number(year),year);
  await page.locator('#historyViewOverview').click();
  if(await page.locator('#historyOverviewPanel').isHidden())await page.locator('#historyViewOverview').click();
  await page.locator('#historyOverviewScope').selectOption('district');
  await page.locator('#historyOverviewCounty').selectOption('台北市');
  const regional=await page.evaluate(()=>HistoryWorkspace.overview());
  assert.ok(Number.isInteger(regional.registeredVoters)&&regional.registeredVoters>0,year+' regional constituency registered electors');
  assert.ok(Number.isInteger(regional.invalidVotes)&&regional.invalidVotes>=0,year+' regional constituency invalid ballots');
  assert.equal(regional.validVotes+regional.invalidVotes,regional.ballotsCast);
  await page.locator('#historyElectorate').selectOption('party');
  await page.locator('#historyViewOverview').click();
  if(await page.locator('#historyOverviewPanel').isHidden())await page.locator('#historyViewOverview').click();
  await page.locator('#historyOverviewScope').selectOption('town');
  await page.locator('#historyOverviewCounty').selectOption('台北市');
  const partyTown=await page.evaluate(()=>HistoryWorkspace.overview());
  assert.ok(Number.isInteger(partyTown.registeredVoters)&&partyTown.registeredVoters>0,year+' party township registered electors');
  assert.ok(Number.isInteger(partyTown.invalidVotes),year+' party township invalid ballots');
  assert.equal(partyTown.validVotes+partyTown.invalidVotes,partyTown.ballotsCast);
  await page.locator('#historyElectorate').selectOption('regional');
 }
});


test('History sidebar office, year, electorate, county and selected focus update the overview without undoing reverse map sync',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('council');
 await page.locator('#historyViewOverview').click();
 const scope=page.locator('#historyOverviewScope'),county=page.locator('#historyOverviewCounty');
 assert.equal(await scope.inputValue(),'all');
 await page.locator('#historyCounty').selectOption('台北市');
 assert.equal(await scope.inputValue(),'county');
 assert.equal(await county.inputValue(),'台北市');
 assert.match(await page.locator('#historyOverviewTitle').textContent(),/台北市/);
 await page.locator('#historyElectorate').selectOption('regional');
 assert.equal(await scope.inputValue(),'county');
 assert.equal(await county.inputValue(),'台北市');
 assert.match(await page.locator('#historyOverviewTitle').textContent(),/台北市/);
 await page.locator('#historyCounty').selectOption('');
 assert.equal(await scope.inputValue(),'all');

 await page.locator('#historyOffice').selectOption('legislative');
 await page.locator('#historyYear').selectOption('2004');
 await page.waitForFunction(()=>History2022View.year()===2004&&HistoryWorkspace.result()?.contests?.length>0);
 assert.equal(await scope.inputValue(),'all');
 await page.locator('#historyCounty').selectOption('高雄市');
 assert.equal(await scope.inputValue(),'county');
 assert.equal(await county.inputValue(),'高雄市');
 const focus=page.locator('#historyFocus');
 await page.locator('#historyScale').selectOption('district');
 const options=await focus.locator('option').evaluateAll(items=>items.filter(x=>x.value).map(x=>({value:x.value,label:x.textContent})));
 assert.ok(options.length>=2,'historical city has two constituency focus choices');
 await focus.selectOption(options[1].value);
 await page.waitForFunction(()=>HistoryWorkspace.selectedOverviewScope().scope==='district');
 const selected=await page.evaluate(()=>({
  overview:HistoryWorkspace.selectedOverviewScope(),result:HistoryWorkspace.result(),
  title:document.querySelector('#historyOverviewTitle').textContent,
  mapFocus:document.querySelector('#historyFocus').value
 }));
 assert.equal(selected.overview.county,'高雄市');
 assert.equal(selected.result.contests.length,1);
 assert.equal(selected.mapFocus,options[1].value);
 assert.match(selected.title,/选区/);

 await scope.selectOption('all');
 assert.equal(await scope.inputValue(),'all');
 assert.equal(await page.locator('#historyCounty').inputValue(),'');
 assert.equal(await page.locator('#historyScale').inputValue(),'county');
 await scope.selectOption('county');
 await county.selectOption('台北市');
 assert.equal(await scope.inputValue(),'county');
 assert.equal(await page.locator('#historyCounty').inputValue(),'台北市');
 assert.equal(await county.inputValue(),'台北市');
});


test('Newly sourced historic political party logos are correctly linked to their party identity',async t=>{
 const page=await pageFor(t);
 const data=await page.evaluate(()=>{
  const list=['中华统一促进党','安定力量','台澎国际法法理建国党','台湾动物保护党','喜乐岛联盟','台澎党'];
  return list.map(name=>{
   const p=predictionParty(name),logo=logoFor(p),known=partyMatch(name)?.id||null;
   return{name,known,id:p.id,loaded:logo.startsWith('data:image/png;base64,'),length:logo.length}
  })
 });
 assert.ok(data.every(x=>x.loaded&&x.length>300),
  'every added official/Commons party emblem is available in PNG exports: '+JSON.stringify(data));
 assert.equal(data.find(x=>x.name==='台澎国际法法理建国党').known,'ssfpp');
 assert.equal(data.find(x=>x.name==='台湾动物保护党').known,'tapp');
 const none=await page.evaluate(()=>logoFor(predictionParty('从未登记的未知党')));
 assert.equal(none,'','unknown parties are never assigned fake logos');
});

test('Historic candidate results use exactly one vertical scrollbar and quote Taiwan Statebuilding Party only in visible/export text',async t=>{
 const page=await pageFor(t,{width:1290,height:880});
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative'&&History2022View.year()===2024);
 await page.locator('#historyElectorate').selectOption('party');
 await page.locator('#historyCounty').selectOption('台北市');
 await page.locator('#historyViewCandidates').click();
 await page.waitForFunction(()=>document.querySelector('#historyResults .history-table-wrap')&&
  document.querySelector('#historyResults')?.textContent.includes('“台湾基进”'));
 const result=await page.evaluate(()=>{
  const outer=document.querySelector('#historyResults'),inner=outer.querySelector('.history-table-wrap');
  const outerStyle=getComputedStyle(outer),innerStyle=getComputedStyle(inner);
  return{
   outerOverflow:outerStyle.overflowY,innerOverflow:innerStyle.overflowY,
   outerHeight:outer.clientHeight,innerHeight:inner.clientHeight,innerScrollHeight:inner.scrollHeight,
   partyText:outer.textContent,partyMatch:partyMatch('“台湾基进”')?.id,
   rawParty:PARTY_PRESETS.find(p=>p.id==='tsp')?.name,
   frozenHeader:getComputedStyle(inner.querySelector('thead th')).position
  }
 });
 assert.equal(result.outerOverflow,'visible','remove the redundant outer result-list scrollbar');
 assert.equal(result.innerOverflow,'auto','retain the sole table scrollbar');
 assert.ok(result.innerScrollHeight>result.innerHeight,'table remains vertically scrollable');
 assert.equal(result.frozenHeader,'sticky','table header remains sticky');
 assert.match(result.partyText,/“台湾基进”/);
 assert.equal(result.partyMatch,'tsp');
 assert.equal(result.rawParty,'台湾基进','display changes do not modify the party data');
 const csv=await download(page,'#historyExportCsv');
 assert.match(csv,/“台湾基进”/,'CSV has consistent presentation quoting');
 assert.doesNotMatch(csv,/““台湾基进””/,'no duplicate quotation marks');
 await page.locator('#historyOffice').selectOption('council');
 await page.locator('#historyViewCandidates').click();
 if(await page.locator('#historyCandidatesPanel').isHidden())await page.locator('#historyViewCandidates').click();
 assert.equal(await page.locator('#historyResults').evaluate(el=>getComputedStyle(el).overflowY),'visible',
  'council result lists also have only one scroll viewport');
});

test('2024 presidential township overview shows CEC-verified electors, ballots and invalid votes',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('president');
 await page.waitForFunction(()=>History2022View.office()==='president'&&History2022View.year()===2024);
 await page.locator('#historyCounty').selectOption('台北市');
 await page.locator('#historyScale').selectOption('town');
 await page.locator('#historyViewOverview').click();
 if(await page.locator('#historyOverviewPanel').isHidden())await page.locator('#historyViewOverview').click();
 await page.locator('#historyOverviewScope').selectOption('town');
 await page.locator('#historyOverviewCounty').selectOption('台北市');
 const overview=await page.evaluate(()=>{
  const o=HistoryWorkspace.overview();
  return{registered:o?.registeredVoters,cast:o?.ballotsCast,valid:o?.validVotes,invalid:o?.invalidVotes,
   area:HistoryWorkspace.selectedOverviewScope().area};
 });
 assert.ok(overview.area);
 assert.ok(Number.isInteger(overview.registered)&&overview.registered>0);
 assert.ok(Number.isInteger(overview.invalid)&&overview.invalid>=0);
 assert.equal(overview.cast,overview.valid+overview.invalid);
 assert.ok(overview.cast<=overview.registered);
});


test('Historical presidential maps show county-local winning tickets and keep their actual year boundaries',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative'&&History2022View.snapshot()?.year===2024);
 await page.locator('#historyOffice').selectOption('president');
 await page.waitForFunction(()=>History2022View.office()==='president'&&History2022View.snapshot()?.year===2024);
 assert.equal(await page.locator('#historyScale').inputValue(),'district');
 for(const year of ['1996','2000','2004','2008','2012','2016','2020','2024']){
  await page.locator('#historyYear').selectOption(year);
  await page.waitForFunction(y=>History2022View.year()===Number(y)&&History2022View.snapshot()?.year===Number(y),year);
  const result=await page.evaluate(()=>{
   const f=History2022View.items(),paths=[...document.querySelectorAll('#regions path[data-region]')],records=History2022View.snapshot().rows;
   const colors={1996:{林洋港:'#815F9D',陈履安:'#577B91'},2000:{宋楚瑜:'#815F9D',许信良:'#B46A52'}};
   const expected=(name,party)=>party==='连署'?colors[History2022View.year()]?.[name]||predictionParty(party).color:predictionParty(party).color;
   const wrong=f.filter(feature=>{
    const best=records.filter(r=>r.level==='county'&&r.county===feature.county).sort((a,b)=>b.votes-a.votes)[0];
    const p=paths.find(node=>node.dataset.region===feature.id);
    return !best||!p||p.getAttribute('fill')!==expected(best.name,best.party);
   }).map(x=>x.name);
   const border=document.querySelector('#districtBorders path[data-shared-boundary="counties"]');
   const sample=f.slice(0,4).map(feature=>{
    const best=records.filter(r=>r.level==='county'&&r.county===feature.county).sort((a,b)=>b.votes-a.votes)[0];
    const path=paths.find(p=>p.dataset.region===feature.id);
    return{county:feature.county,best:best?.name,party:best?.party,expected:best?expected(best.name,best.party):null,
     actual:path?.getAttribute('fill')};
   });
   return{count:f.length,paths:paths.length,wrong,sample,outline:border?.getAttribute('d')?.length||0,
    stroke:border?.getAttribute('stroke'),level:document.querySelector('#historyScale').value};
  });
  assert.equal(result.count,Number(year)<=2008?25:22,year+' historical counties');
  assert.equal(result.paths,result.count,year+' regions');
  assert.deepEqual(result.wrong,[],year+' local winner color: '+JSON.stringify(result.sample));
  assert.ok(result.outline>100&&result.stroke!=='none',year+' full historical county border');
  assert.equal(result.level,'district',year+' county scale');
 }
 await page.locator('#historyYear').selectOption('2000');
 await page.waitForFunction(()=>History2022View.year()===2000);
 assert.match(await exportSvg(page),/data-shared-boundary="counties"/);
});
test('Historic legislative national maps render complete administrative boundaries and include them in exports',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative');
 for(const year of ['1992','2004','2008','2012','2024']){
  await page.locator('#historyYear').selectOption(year);
  await page.waitForFunction(y=>History2022View.year()===Number(y)&&History2022View.snapshot()?.year===Number(y),year);
  const result=await page.evaluate(()=>{
   const shapes=History2022View.items(),paths=[...document.querySelectorAll('#regions path[data-region]')];
   const border=document.querySelector('#districtBorders path[data-shared-boundary]');
   const older=History2022View.year()<2008;
   const complete=older?border?.hasAttribute('data-historical-plurality-outline'):
    border?.getAttribute('d')===sharedBoundaryGeometry(History2022View.legislativeFeatures(),true).all;
   return{count:shapes.length,paths:paths.length,outline:border?.getAttribute('d')?.length||0,
    stroke:border?.getAttribute('stroke'),complete:!!complete};
  });
  assert.equal(result.count,result.paths,year+' constituency coverage');
  assert.ok(result.outline>100&&result.stroke!=='none',year+' visible administrative outlines');
  assert.equal(result.complete,true,year+' complete outer perimeters including coasts');
  assert.match(await exportSvg(page),/data-shared-boundary=/,year+' SVG export retains boundaries');
 }
});

test('Election-period legislative maps have no missing winners, all county names and Wuqiu town geometry',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative'&&History2022View.year()===2024);
 for(const year of ['2008','2012','2016','2020','2024']){
  await page.locator('#historyYear').selectOption(year);
  await page.waitForFunction(y=>History2022View.year()===Number(y)&&History2022View.snapshot()?.year===Number(y),year);
  const r=await page.evaluate(()=>{
   const features=History2022View.items(),county=History2022View.legislativeCountyFeatures(),regions=[...document.querySelectorAll('#regions path[data-region]')],
    labels=[...document.querySelectorAll('#labels text[data-label]')],layer=document.querySelector('#labels');
   const neutral=regions.filter(x=>['','#edf1e9','none','#ffffff','#fff'].includes((x.getAttribute('fill')||'').toLowerCase())).map(x=>x.getAttribute('aria-label')?.slice(0,60));
   const missing=county.filter(x=>!labels.some(y=>y.dataset.label===x.id)).map(x=>x.name);
   const outside=labels.filter(x=>x.dataset.placement==='outside');
   const withoutLead=outside.filter(x=>!layer.querySelector('path[data-label-leader="'+x.dataset.label+'"]')).map(x=>x.textContent);
   return{n:features.length,regions:regions.length,labels:labels.length,missing,neutral,withoutLead,sourceCountyCount:county.length,periods:features.filter(f=>f.geometryPeriod==='2008–2016').length};
  });
  assert.equal(r.n,73,year+' full constituency count');
  if(Number(year)<2020)assert.equal(r.periods,73,year+' must draw 2008–2016-period districts, not 2024 geometry');
  assert.equal(r.regions,73,year+' all constituency polygons');
  assert.deepEqual(r.neutral,[],year+' should never leave a valid constituency blank');
  assert.deepEqual(r.missing,[],year+' all historical counties labelled');
  assert.deepEqual(r.withoutLead,[],year+' all outside names connected with visible leader lines');
 }
 await page.locator('#historyYear').selectOption('2012');
 await page.waitForFunction(()=>History2022View.year()===2012);
 await page.locator('#historyElectorate').selectOption('party');
 await page.locator('#historyCounty').selectOption('金门县');
 await page.locator('#historyScale').selectOption('town');
 const wu=await page.evaluate(()=>{
  const item=History2022View.items().find(f=>f.name==='乌坵乡');
  const path=item&&document.querySelector('#regions path[data-region="'+item.id+'"]');
  const label=item&&document.querySelector('#labels text[data-label="'+item.id+'"]');
  return{hasTown:!!item,region:!!path,visibleLabel:!!label,hasGeometry:!!item?.d};
 });
 assert.equal(wu.hasTown,true,'historic Kinmen has Wuqiu township');
 assert.equal(wu.region,true,'Wuqiu appears as a map polygon');
 assert.equal(wu.hasGeometry,true,'Wuqiu has nonempty geometry');
 assert.equal(wu.visibleLabel,true,'Wuqiu township receives a visible label');
});


test('Official Kaohsiung 2008–2016 village splits fill exactly one historic constituency and town outlines toggle',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('legislative');
 await page.waitForFunction(()=>History2022View.office()==='legislative'&&History2022View.year()===2024);
 for(const year of [2008,2012,2016]){
  await page.locator('#historyYear').selectOption(String(year));
  await page.waitForFunction(y=>History2022View.year()===y&&History2022View.legislativeFeatures().length===73,year);
  const result=await page.evaluate(async y=>{
   const villages=await HistoryLegislative.loadKaohsiungVillages(y);
   const north8=new Set(['复国里','竹中里','竹北里','兴东里','竹西里','竹东里','竹内里','竹南里']);
   const west41=new Set(['川东里','德西里','裕民里','力行里','丰裕里','千秋里','千北里','立德里','千岁里','凤南里','兴德里','凤北里','德北里','十全里','十美里','安邦里','安宜里','安泰里','民享里','精华里','德行里','德东里','立诚里','立业里','安生里','安和里','安东里','达明里','达德里','达仁里','达勇里','德智里','德仁里','同德里','建东里','港西里','长明里','港东里','港新里','博爱里','博惠里']);
   const numbers=y===2008?{前镇区:[4,5],三民区:[2,3]}:{前镇区:[7,9],三民区:[5,6]};
   const misses=[];
   for(const v of villages){
    if(!['前镇区','三民区'].includes(v.town))continue;
    const n=numbers[v.town],paths=n.map(num=>document.querySelector('#regions path[data-region="legislative-'+y+'-高雄市|'+num+'"]'));
    if(paths.some(p=>!p)){misses.push(v.name+':missing district');continue}
    const anchor=v.labelAnchor||v.center||[(v.box[0]+v.box[2])/2,(v.box[1]+v.box[3])/2];
    const point=new DOMPoint(anchor[0],anchor[1]),inside=paths.map(p=>p.isPointInFill(point));
    const selected=(v.town==='前镇区'?north8:west41).has(v.name)?0:1;
    if(!inside[selected]||inside[1-selected])misses.push(v.town+v.name+':'+JSON.stringify(inside));
   }
   const town=document.querySelector('#townBorders path[data-shared-boundary="towns"]');
   const start={exists:!!town,length:town?.getAttribute('d')?.length||0,visible:document.querySelector('#townBorders').style.display!=='none',stroke:town?.getAttribute('stroke')};
   const check=document.getElementById('historyTownBoundaries');
   const available=!!check&&document.getElementById('historyTownBoundaryBox')?.hidden===false;
   const before=check?.checked;
   if(!before){check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));}
   const shown=document.querySelector('#townBorders').style.display!=='none';
   check.checked=false;check.dispatchEvent(new Event('change',{bubbles:true}));
   const hidden=document.querySelector('#townBorders').style.display==='none';
   check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}));
   return{year:y,misses,scanned:villages.length,town:start,toggleVisible:available,shown,hidden,restored:document.querySelector('#townBorders').style.display!=='none'};
  },year);
  assert.deepEqual(result.misses,[],year+' official Kaohsiung village-split fills must be disjoint and exhaustive');
  assert.ok(result.scanned>120,year+' village polygons are loaded');
  assert.ok(result.town.exists&&result.town.length>1000,year+' historical township boundary paths exist');
  assert.equal(result.toggleVisible,true,year+' historical township overlay toggle is visible in sidebar');
  assert.equal(result.shown,true,year+' township overlay visible when enabled');
  assert.equal(result.hidden,true,year+' township overlay hides when disabled');
  assert.equal(result.restored,true,year+' township overlay restores without reloading');
 }
});


test('Candidate directory pending ballot-number filters and counts agree',async t=>{
 const page=await pageFor(t);
 const result=await page.evaluate(()=>{
  const district=candidateDatabase.districts.find(d=>d.type==='mayor'&&d.candidateIds.length>=3);
  if(!district)throw Error('Missing multi-candidate mayor district fixture');
  district.candidateIds.forEach((id,i)=>{const candidate=candidateById.get(id);candidate.number=i===0?'':i===1?'待补':String(i+1)});
  document.getElementById('directoryOffice').value='mayor';
  document.getElementById('directoryCounty').value=district.county;
  populateDirectoryDistricts();
  document.getElementById('directoryDistrict').value=district.id;
  document.getElementById('onlyPendingNumbers').checked=true;
  renderCandidateDirectory();
  const card=document.querySelector('#directoryResults .district-card');
  const filtered={stat:card?.querySelector('.district-stats')?.textContent,
   count:card?.querySelectorAll('.candidate-table tbody tr').length,
   pending:card?.querySelectorAll('.candidate-table .pending-number').length,
   total:document.getElementById('directoryCount').textContent};
  document.getElementById('onlyPendingNumbers').checked=false;
  renderCandidateDirectory();
  return{filtered,all:document.querySelector('#directoryResults .district-card .district-stats')?.textContent,
   fullCount:document.querySelectorAll('#directoryResults .district-card .candidate-table tbody tr').length,
   expected:district.candidateIds.length};
 });
 assert.match(result.filtered.stat,/待核号次人数2/);
 assert.equal(result.filtered.count,2);
 assert.equal(result.filtered.pending,2);
 assert.match(result.filtered.total,/2 名候选人/);
 assert.match(result.all,/候选人数/);
 assert.equal(result.fullCount,result.expected);
});

test('Local 2026 results remain hidden until an official fully reconciled data release is published',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('mayor');
 assert.equal(await page.locator('#historyYear option[value="2026"]').count(),0);
 assert.equal(await page.locator('#historyYear').inputValue(),'2022');
 assert.equal(await page.evaluate(()=>window.HISTORY_2026_RESULTS_AVAILABLE===true),false);
 const manifest=await page.evaluate(async()=>await (await fetch('assets/history-2026-availability.json')).json());
 assert.equal(manifest.status,'awaiting_results');
});


test('Published-only 2026 results can load in history, switch offices and return to 2022 without entering predictions',async t=>{
 const context=await browser.newContext({viewport:{width:1200,height:850}});
 t.after(()=>context.close());
 const page=await context.newPage(),errors=[];
 page.on('pageerror',err=>errors.push(err.message));
 await page.route('**/assets/history-2026-availability.json*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({
  schemaVersion:1,year:2026,status:'published',candidateCount:2051,districtCount:447,sha256:'a'.repeat(64)
 })}));
 await page.goto(base);
 await page.locator('#regions path[data-region]').first().waitFor();
 await page.locator('#categoryHistory').click();
 await page.waitForFunction(()=>window.HISTORY_2026_RESULTS_AVAILABLE===true);
 const fake=await page.evaluate(()=>{
  const ds=candidateDatabase.districts,cs=candidateDatabase.candidates,byDistrict=new Map(ds.map(d=>[d.id,d]));
  const elections=['mayor','council','township'].map(office=>({
   election_id:'2026-'+office,year:2026,office,source_url:'https://web.cec.gov.tw/central',
   source_name:'TEST FIXTURE ONLY',boundary_version:'2026'
  }));
  const contests=ds.map(d=>({
   contest_id:d.id,election_id:'2026-'+d.type,county_id:d.county,county_name:d.county,
   district_name:d.type==='township'?d.name.replace(d.county,''):d.name,
   electorate:HistoryCore.identity(d.electorate),seats:d.seats||1,reserved_seats:d.womenReserved||0,
   registered_voters:null,ballots_cast:null,valid_votes:250000,invalid_votes:null
  }));
  const candidacies=cs.map(c=>{
   const d=byDistrict.get(c.districtId);return{
    candidacy_id:c.id,candidate_id:c.id,contest_id:d.id,ballot_number:String(c.number),
    candidate_name:c.nameSimplified||c.name,party_name:c.party||'无党籍',
    votes:1000+Number(c.number||0),elected_official:d.candidateIds.slice(0,d.seats||1).includes(c.id)
   }
  });
  const rows=cs.map(c=>{
   const d=byDistrict.get(c.districtId);
   return{type:c.type,level:c.type==='mayor'?'county':c.type==='council'?'district':'town',
    electorate:HistoryCore.identity(d.electorate),county:c.county,
    district:c.type==='council'?d.name:'',town:c.type==='township'?d.name.replace(c.county,''):'',
    name:c.nameSimplified||c.name,party:c.party,number:String(c.number),gender:c.gender,
    votes:1000+Number(c.number||0),elected:d.candidateIds.slice(0,d.seats||1).includes(c.id)}
  });
  return{schemaVersion:2,year:2026,completeness:'full',publicationStatus:'provisional',
   elections,contests,candidacies,rows};
 });
 assert.equal(fake.contests.length,447);
 assert.equal(fake.candidacies.length,2051);
 await page.route('**/assets/history-2026.json*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(fake)}));
 await page.locator('#categoryHistory').click();
 await page.waitForFunction(()=>document.querySelector('#historyYear option[value="2026"]'));
 await page.locator('#historyYear').selectOption('2026');
 await page.waitForFunction(()=>History2022View.year()===2026&&History2022View.snapshot()?.year===2026);
 assert.ok(await page.locator('#regions path[data-region]').count()>0);
 assert.equal(await page.locator('#historyYear').inputValue(),'2026');
 await page.locator('#historyOffice').selectOption('council');
 assert.equal(await page.locator('#historyYear').inputValue(),'2026');
 await page.locator('#historyCounty').selectOption('台北市');
 await page.waitForFunction(()=>HistoryWorkspace?.result()?.contests?.length>0);
 const filtered=await page.evaluate(()=>({
  year:HistoryWorkspace.result().index.snapshot.year,
  counties:[...new Set(HistoryWorkspace.result().contests.map(x=>x.county_name))],
  rows:HistoryWorkspace.result().candidacies.length,
  mapRegions:document.querySelectorAll('#regions path[data-region]').length
 }));
 assert.equal(filtered.year,2026);
 assert.deepEqual(filtered.counties,['台北市']);
 assert.ok(filtered.rows>0&&filtered.mapRegions>0,'Published 2026 council results display on scoped map');
 await page.locator('#historyYear').selectOption('2022');
 await page.waitForFunction(()=>History2022View.year()===2022&&History2022View.snapshot()?.year===2022);
 assert.deepEqual(errors,[],'Switching historic snapshots raises no JS exceptions');
});



test('Historical national township maps colour every elected township, including Wuqiu, and drill down by county',async t=>{
 const page=await pageFor(t,{width:1440,height:960});
 await page.locator('#categoryHistory').click();
 await page.waitForFunction(()=>window.History2022View?.snapshot()?.year===2022);
 await page.locator('#historyOffice').selectOption('township');
 for(const year of [1998,2002,2005,2009,2014,2018,2022]){
  await page.locator('#historyYear').selectOption(String(year));
  await page.waitForFunction(y=>History2022View.office()==='township'&&History2022View.year()===y,year);
  const result=await page.evaluate(()=>{
   const results=History2022View.snapshot().rows.filter(r=>r.type==='township'&&r.level==='town'&&r.elected);
   const items=new Map(History2022View.items().map(f=>[f.county+'|'+f.name,f]));
   const paths=new Map([...document.querySelectorAll('#regions path[data-region]')].map(p=>[p.dataset.region,p.getAttribute('fill')]));
   return {
    winners:results.length,
    missing:results.filter(r=>{
     const id=items.get(simplify(r.county)+'|'+simplify(r.town))?.id;
     const party=simplify(r.party);
     return !id||paths.get(id)!==predictionParty(party.startsWith('无党籍')?'无党籍':party).color;
    }).map(r=>[r.county,r.town]),
    taipei:paths.get([...items.values()].find(f=>f.county==='台北市'&&f.name==='松山区').id)
   };
  });
  assert.ok(result.winners>=200);
  assert.deepEqual(result.missing,[],String(year));
  assert.equal(result.taipei,'#ffffff',String(year));
 }
 const kinmen=page.locator('#regions path[data-region="09020010"]');
 await kinmen.focus();
 await kinmen.press('Enter');
 assert.equal(await page.locator('#historyCounty').inputValue(),'金门县');
 await page.locator('#returnTaiwanMap').click();
 assert.equal(await page.locator('#historyCounty').inputValue(),'');
 assert.notEqual(await kinmen.getAttribute('fill'),'#edf1e9');
});

test('Recovered historical Hsinchu council districts show official results and seat quotas',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('council');
 for(const year of [2002,2006,2010,2014,2018]){
  await page.locator('#historyYear').selectOption(String(year));
  await page.waitForFunction(y=>History2022View.office()==='council'&&History2022View.snapshot()?.year===y,year);
  await page.locator('#historyCounty').selectOption('新竹市');
  const recovered=await page.evaluate(()=>{
   const paths=new Set([...document.querySelectorAll('#regions path[data-region]')].map(p=>p.dataset.region));
   return currentItems().filter(f=>f.electorate==='regional').map(f=>({
    number:f.number,map:paths.has(f.id),winners:History2022View.seatRows(f).filter(Boolean).length,seats:f.seats
   }));
  });
  assert.deepEqual(recovered.map(r=>r.number).sort(),[1,2,3,4,5]);
  assert.ok(recovered.every(r=>r.map&&r.winners===r.seats),String(year));
 }
 await page.locator('#regions [data-region="history-2018-council:新竹市:regional:第1选举区"]').press('Enter');
 const message=await page.locator('#historyDialogMessage').textContent();
 assert.match(message,/妇保 3 席/);
 assert.match(message,/里界近似绘制/);
});

test('The earliest local cycle shows dated council returns and preserves actual mayoral years in CSV',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.locator('#historyOffice').selectOption('mayor');
 await page.locator('#historyYear').selectOption({label:'1993/1994'});
 await page.waitForFunction(()=>History2022View.year()===1994&&HistoryWorkspace.result()?.contests.length===25);
 const mayorCsv=await download(page,'#historyExportCsv');
 assert.match(mayorCsv,/"1993","县市长","台北县"/);
 assert.match(mayorCsv,/"1994","县市长","台北市"/);
 for(const [name,actualYear] of [['台北县',1993],['台北市',1994]]){
  await page.evaluate(name=>History2022View.openRegion(History2022View.items().find(f=>f.name===name)),name);
  assert.match(await page.locator('#historyDialogTitle').textContent(),new RegExp(actualYear+'年'));
  assert.doesNotMatch(await page.locator('#historyDialogTitle').textContent(),/1993\/1994/);
  assert.ok((await page.locator('#historyDialogRows tr td:nth-child(4)').allTextContents()).every(value=>value===''||value==='是'));
  await page.locator('#closeHistoryResult').click();
 }

 await page.locator('#historyOffice').selectOption('council');
 await page.waitForFunction(()=>History2022View.office()==='council'&&History2022View.snapshot()?.contests.some(c=>c.election_id==='1994-council-counties'));
 assert.match(await page.locator('#historyBoundaryNote').textContent(),/金门(?:县)?完整候选人得票明细待补/);
 await page.locator('#historyCounty').selectOption('台北县');
 await page.locator('#returnTaiwanMap').waitFor({state:'visible'});
 assert.match(await page.locator('#scopeTitle').textContent(),/^台北县 · 1993\/1994/);
 assert.ok(await page.locator('#historySeatBadges [data-history-seat-badge]').count()>0);
 await page.locator('#regions [data-region="history-1994-council-counties:台北县:regional:第8选举区"]').press('Enter');
 assert.match(await page.locator('#historyDialogTitle').textContent(),/1994年 县市议员选举结果/);
 assert.doesNotMatch(await page.locator('#historyDialogTitle').textContent(),/1993\/1994/);
 assert.match(await page.locator('#historyDialogMessage').textContent(),/1994-01-29/);
 assert.ok((await page.locator('#historyDialogRows tr td:nth-child(4)').allTextContents()).every(value=>value===''||value==='是'));
 assert.equal(await page.locator('#historyDialogMessage a').getAttribute('href'),'https://web.cec.gov.tw/tpcec/article/list/1271');
 assert.match(await page.locator('#historyDialogRows').textContent(),/周雅淑/);
 await page.locator('#closeHistoryResult').click();
 await page.locator('#historyMetric').selectOption('votes');
 const projections=await page.locator('#regions > g[transform]').evaluateAll(groups=>groups.map(g=>g.getAttribute('transform')));
 assert.ok(projections.length>0);
 assert.ok(projections.every(transform=>!/(?:NaN|Infinity)/.test(transform)));
 await page.locator('#returnTaiwanMap').click();
 assert.equal(await page.locator('#historyCounty').inputValue(),'');
});

test('All archived mayor and council national maps use official winners and seat pluralities',async t=>{
 const page=await pageFor(t);
 await page.locator('#categoryHistory').click();
 await page.waitForFunction(()=>window.History2022View?.snapshot()?.year===2022);
 for(const office of ['mayor','council']){
  await page.locator('#historyOffice').selectOption(office);
  for(const year of await page.locator('#historyYear option').evaluateAll(options=>options.map(option=>Number(option.value)))){
   await page.locator('#historyYear').selectOption(String(year));
   await page.waitForFunction(({office,year})=>History2022View.office()===office&&History2022View.snapshot()?.year===year,{office,year});
   const failures=await page.evaluate(office=>{
    const winners=new Map();
    for(const row of History2022View.snapshot().rows){
     if(row.type!==office||!row.elected||row.level!==(office==='mayor'?'county':'district'))continue;
     const county=simplify(row.county),raw=simplify(row.party),party=raw.startsWith('无党籍')?'无党籍':raw;
     if(!winners.has(county))winners.set(county,new Map());
     const tally=winners.get(county);
     tally.set(party,(tally.get(party)||0)+1);
    }
    const items=new Map(History2022View.items().map(f=>[f.county,f.id]));
    const paths=new Map([...document.querySelectorAll('#regions path[data-region]')].map(p=>[p.dataset.region,p.getAttribute('fill')]));
    return [...winners].flatMap(([county,tally])=>{
     const leading=[...tally].sort((a,b)=>b[1]-a[1]);
     const colors=[...new Set(leading.filter(([,seats])=>seats===leading[0][1]).map(([party])=>predictionParty(party).color))];
     const fill=paths.get(items.get(county));
     if(colors.length===1)return fill===colors[0]?[]:[{county,fill,expected:colors[0]}];
     const id=fill?.match(/^url\(#(.+)\)$/)?.[1],pattern=id&&document.getElementById(id);
     const shown=new Set([...pattern?.children||[]].map(child=>child.getAttribute('fill')));
     return colors.every(color=>shown.has(color))?[]:[{county,fill,expected:colors}];
    });
   },office);
   assert.deepEqual(failures,[],office+' '+year);
  }
 }
});
