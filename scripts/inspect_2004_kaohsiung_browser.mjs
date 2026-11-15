import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1200,height:900}});
await page.route('**/history-access.js*',r=>r.fulfill({contentType:'application/javascript',body:'window.HistoryAccess={ready:Promise.resolve(true),canAccess:()=>true,notice:()=>{}};'}));
page.on('pageerror',e=>console.error('PAGE_ERROR',e.stack||e.message));
await page.goto('http://127.0.0.1:8765/');
await page.locator('#regions path[data-region]').first().waitFor();
await page.locator('#categoryHistory').click();
await page.locator('#historyOffice').selectOption('legislative');
await page.locator('#historyYear').selectOption('2004');
await page.waitForFunction(()=>History2022View.snapshot()?.year===2004);
await page.locator('#historyCounty').selectOption('高雄市');
await page.waitForFunction(()=>state.county==='高雄市'&&document.querySelectorAll('#regions path[data-region]').length===2);
const result=await page.evaluate(()=>{
 const geo=currentItems(),t=geometryLayout(geo,true),getrect=r=>({x:r.x,y:r.y,w:r.width,h:r.height});
 const region=geo.map(f=>{
  const el=[...document.querySelectorAll('#regions path[data-region]')].find(x=>x.getAttribute('data-region')===f.id);
  const box=el.getBBox(),rect=el.getBoundingClientRect(),
   expected={x:f.center[0]*t.scale+t.tx,y:f.center[1]*t.scale+t.ty},
   sampleTowns=(History2022View.snapshot().rows||[]).filter(x=>x.level==='town'&&x.county==='高雄市'&&x.electorate==='regional'&&HistoryLegislative.districtNumber(x.district)===f.number).map(x=>x.town);
  return{id:f.id,name:f.name,sourceBox:f.box,svgBBox:getrect(box),screenBBox:getrect(rect),
   expected,fill:el.getAttribute('fill'),pathLength:f.d.length,sampleTowns}
 });
 const frames=[...document.querySelectorAll('#labels [data-history-seat-card]')].map(c=>({
  id:c.getAttribute('data-seat-region'),rect:getrect(c.getBoundingClientRect()),
  placement:c.getAttribute('data-seat-placement'),inside:c.getAttribute('data-seat-placement')==='inside'
 }));
 const svg=document.querySelector('#map');
 return{geo:region,frames,transform:t,
 svgViewBox:svg.getAttribute('viewBox'),regionTransform:document.querySelector('#regions').getAttribute('transform'),
 mapBoundingRect:getrect(svg.getBoundingClientRect()),
 canvasBoundingRect:getrect(document.querySelector('#canvas').getBoundingClientRect()),
 legendBoundingRect:getrect(document.querySelector('#legend').getBoundingClientRect()),
 itemCount:geo.length};
});
console.log('KAO_BROWSER_DIAGNOSTIC',JSON.stringify(result));
const screenshot=await page.screenshot({type:'png'});
console.log('SCREENSHOT_PNG_BYTES',screenshot.length);
await browser.close();
