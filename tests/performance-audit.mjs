/* Reproducible browser performance and label-overlap audit; measurements, not timing gates. */
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {join} from 'node:path';

const base=process.env.MAP_TEST_URL||'http://127.0.0.1:8765/';
const out=process.env.MAP_PERF_OUT||'artifacts/map-performance';
const repeat=Math.max(1,Math.min(5,Number(process.env.MAP_PERF_REPEAT)||2));
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
const results=[];
const round=v=>Math.round(v*10)/10;
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))}
async function measured(page,run){
 const start=performance.now();await run();await settle(page);return round(performance.now()-start);
}
async function labelAudit(page){
 return page.evaluate(()=>{
  const map=document.querySelector('#map'),bounds=map.getBoundingClientRect();
  const labels=[...document.querySelectorAll('#labels text[data-label]')].map(el=>{
   const r=el.getBoundingClientRect();return {id:el.dataset.label,text:el.textContent,placement:el.dataset.placement,x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height};
  }).filter(r=>r.w>0&&r.h>0);
  const overlap=[];
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
   const a=labels[i],b=labels[j],w=Math.min(a.right,b.right)-Math.max(a.x,b.x),h=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);
   if(w>2&&h>2&&w*h>Math.min(a.w*a.h,b.w*b.h)*.08)overlap.push({first:a.text,firstId:a.id,second:b.text,secondId:b.id,area:Math.round(w*h)});
  }
  return {labelCount:labels.length,numberKeyCount:document.querySelectorAll('#mapNumberKeyRows tr[data-region]').length,overlapCandidates:overlap,clippedCandidates:labels.filter(r=>r.x<bounds.x-2||r.right>bounds.right+2||r.y<bounds.y-2||r.bottom>bounds.bottom+2).map(r=>({id:r.id,text:r.text}))};
 });
}
async function waitHistory(page,year,office='mayor'){
 await page.waitForFunction(({year,office})=>window.History2022View?.snapshot()?.year===year&&window.History2022View?.office()===office&&document.querySelector('#historyYear')?.value===String(year)&&document.querySelector('#historyLoadStatus')?.hidden,{year,office},{timeout:60000});
}
try{
 for(const viewport of [{width:1440,height:950},{width:390,height:844}])for(let run=1;run<=repeat;run++){
  const context=await browser.newContext({viewport,acceptDownloads:true});
  const page=await context.newPage(),errors=[],metrics={viewport,run,ms:{},errors};
  results.push(metrics);page.on('pageerror',e=>errors.push(e.message));
  try{
   metrics.ms.firstMap=await measured(page,async()=>{
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.locator('#regions path[data-region]').first().waitFor({timeout:60000});
   });
   metrics.resourcesAtFirstMap=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({path:new URL(r.name).pathname,transferBytes:r.transferSize,durationMs:Math.round(r.duration)})).filter(r=>r.path.includes('/assets/')||r.path.endsWith('.js')));
   metrics.ms.denseTownMap=await measured(page,async()=>{
    await page.locator('#county').selectOption('高雄市');
    await page.locator('#predictionScale').selectOption('overlay');
    await page.waitForFunction(()=>document.querySelectorAll('#regions path[data-region]').length===38);
   });
   metrics.denseTownLabels=await labelAudit(page);
   if(run===1)await page.locator('#map').screenshot({path:join(out,'dense-town-'+viewport.width+'.png')});
   const original=await page.locator('#map').getAttribute('viewBox');
   metrics.ms.zoomViewUpdate=await measured(page,async()=>{
    await page.locator('#zoomIn').click();
    await page.waitForFunction(previous=>document.querySelector('#map').getAttribute('viewBox')!==previous,original);
   });
   await page.locator('#fit').click();
   metrics.ms.firstHistory=await measured(page,async()=>{
    await page.locator('#categoryHistory').click();
    await waitHistory(page,2022);
   });
   await page.locator('#historyCounty').selectOption('高雄市');
   metrics.ms.cold2018=await measured(page,async()=>{
    await page.locator('#historyYear').selectOption('2018');await waitHistory(page,2018);
   });
   metrics.ms.cached2022=await measured(page,async()=>{
    await page.locator('#historyYear').selectOption('2022');await waitHistory(page,2022);
   });
   metrics.ms.firstTrend=await measured(page,async()=>{
    await page.locator('#historyViewTrends').click();
    await page.locator('#trendCharts svg').first().waitFor({timeout:60000});
   });
   metrics.trendStatus=await page.locator('#trendStatus').textContent();
   if(run===1)await page.locator('#trendCharts').screenshot({path:join(out,'trend-'+viewport.width+'.png')});
  }catch(e){metrics.failure=String(e);await page.screenshot({path:join(out,'failure-'+viewport.width+'-'+run+'.png')}).catch(()=>{})}
  finally{await context.close()}
 }
}finally{
 await browser.close();
 const report={generatedAt:new Date().toISOString(),base,repeat,units:'milliseconds; overlap candidates require visual review',results};
 await writeFile(join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(results.map(({resourcesAtFirstMap,...r})=>r),null,2));
}
if(results.some(r=>r.failure||r.errors.length))process.exitCode=1;
