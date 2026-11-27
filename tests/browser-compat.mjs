/* Small cross-engine release smoke; the full suite remains Chromium. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';
import {readFile} from 'node:fs/promises';
const engine=process.env.BROWSER_ENGINE||'firefox';
const driver={chromium,firefox,webkit}[engine];
assert.ok(driver,'Unknown browser engine');
const base=process.env.MAP_TEST_URL||'http://127.0.0.1:8765/';
test(engine+' desktop and mobile core workflows', {timeout:180000},async t=>{
 const browser=await driver.launch({headless:true});t.after(()=>browser.close());
 for(const viewport of [{width:1440,height:950},{width:390,height:844}]){
  const context=await browser.newContext({viewport,acceptDownloads:true});
  try{
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);await page.locator('#regions path[data-region]').first().waitFor({timeout:60000});
   assert.equal(await page.locator('#loadError').isVisible(),false);
   await page.locator('#workspaceFree').click();await page.locator('#countyLevel').click();
   await page.locator('#county').selectOption('');await page.waitForFunction(()=>state.level==='counties'&&state.workspaceMode==='free');
   const shape=page.locator('#regions path[data-region]').first(),id=await shape.getAttribute('data-region');
   const before=await page.evaluate(id=>state.fills.counties[id]??null,id);
   await shape.dispatchEvent('click');await page.waitForFunction(({id,before})=>(state.fills.counties[id]??null)!==before,{id,before});
   await page.locator('#undo').click();assert.equal(await page.evaluate(id=>state.fills.counties[id]??null,id),before);
   await page.locator('#categoryHistory').click();await page.waitForFunction(()=>window.History2022View?.snapshot()?.year===2022&&document.querySelector('#historyLoadStatus')?.hidden,{},{timeout:90000});
   await page.locator('#historyViewCandidates').click();await page.locator('#historyResults tbody tr').first().waitFor();
   await page.locator('#categoryAnalysis').click();await page.locator('#historyCompareOpen').click();
   await page.waitForFunction(()=>!document.getElementById('compareExportSvg').disabled,{},{timeout:90000});
   const dialog=page.locator('#historyCompareDialog'),box=await dialog.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=viewport.width+1,'dialog must fit viewport');
   const event=page.waitForEvent('download');await page.locator('#compareExportSvg').click();const file=await event;
   assert.match(file.suggestedFilename(),/\.svg$/);const svg=await readFile(await file.path(),'utf8');assert.match(svg,/<svg\b/);assert.match(svg,/历届选举对比/);
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   assert.deepEqual(errors,[],engine+' '+viewport.width+' page exceptions');
  }finally{await context.close()}
 }
});
