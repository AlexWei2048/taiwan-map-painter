/* Pixel-level regression of real map and SVG export, across desktop/mobile.
 * Compare current checkout against the previous main revision; save all diff
 * images and per-scene metrics. No hand-generated or stale golden screenshots.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {chromium} from 'playwright';
import {PNG} from 'pngjs';
import pixelmatch from 'pixelmatch';

const curr=process.env.VISUAL_CURRENT_URL||'http://127.0.0.1:8765/';
const prev=process.env.VISUAL_BASE_URL||'http://127.0.0.1:8766/';
const output=process.env.VISUAL_OUTPUT||'reports/visual-regression';
const desktop={width:1440,height:900},mobile={width:390,height:844};
const scenarios=[
 {id:'mayor-all-desktop',viewport:desktop,kind:'mayor'},
 {id:'mayor-all-mobile',viewport:mobile,kind:'mayor'},
 {id:'council-taipei-desktop',viewport:desktop,kind:'council',county:'台北市'},
 {id:'town-kaohsiung-mobile',viewport:mobile,kind:'township',county:'高雄市'},
 {id:'free-town-mobile',viewport:mobile,kind:'free'},
 {id:'history-2004-taipei-desktop',viewport:desktop,kind:'history',year:2004,county:'台北市'},
 {id:'history-2024-national-mobile',viewport:mobile,kind:'history',year:2024},
 {id:'mayor-export-svg-desktop',viewport:desktop,kind:'mayor',export:true},
 {id:'history-2004-export-desktop',viewport:desktop,kind:'history',year:2004,county:'台北市',export:true}
];
const browser=await chromium.launch({headless:true});
const results=[];
await fs.mkdir(output,{recursive:true});

async function capture(base,scenario,suffix){
 const context=await browser.newContext({viewport:scenario.viewport,deviceScaleFactor:1,
  locale:'zh-CN',timezoneId:'Asia/Taipei',reducedMotion:'reduce',colorScheme:'light'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/history-access.js*',route=>route.fulfill({contentType:'application/javascript',
  body:'window.HistoryAccess={ready:Promise.resolve(true),canAccess:()=>true,notice:()=>{}};'}));
 try{
  const response=await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  if(response?.status()!==200)throw new Error('HTML status '+response?.status());
  await page.locator('#regions path[data-region]').first().waitFor({timeout:60000});
  if(scenario.kind==='council'||scenario.kind==='township'){
   await page.locator('#predictionOffice').selectOption(scenario.kind);
   if(scenario.county)await page.locator('#county').selectOption(scenario.county);
  }else if(scenario.kind==='free'){
   await page.locator('#workspaceFree').click();
   await page.locator('#townLevel').click();
  }else if(scenario.kind==='history'){
   await page.locator('#categoryHistory').click();
   await page.locator('#historyOffice').selectOption('legislative');
   await page.locator('#historyYear').selectOption(String(scenario.year));
   await page.waitForFunction(year=>typeof History2022View!=='undefined'&&
    History2022View.office()==='legislative'&&History2022View.snapshot()?.year===year,
    scenario.year,{timeout:60000});
   if(scenario.county)await page.locator('#historyCounty').selectOption(scenario.county);
  }
  await page.waitForFunction(()=>document.querySelectorAll('#regions path[data-region]').length>0
    &&document.querySelector('#mapLoadingStatus')?.hidden!==false,{timeout:60000});
  await page.evaluate(()=>document.fonts.ready);
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});
  await page.locator('#canvas').scrollIntoViewIfNeeded();
  const layout=await page.evaluate(()=>({
   regions:document.querySelectorAll('#regions path[data-region]').length,
   labels:document.querySelectorAll('#labels [data-label]').length,
   outside:document.querySelectorAll('#labels [data-placement="outside"]').length,
   mapReady:document.querySelector('#loadError')?.hidden===true,
   width:document.querySelector('#canvas')?.getBoundingClientRect().width,
   height:document.querySelector('#canvas')?.getBoundingClientRect().height,
   nonfinite:[...document.querySelectorAll('#labels text')].filter(t=>{
    const r=t.getBoundingClientRect();
    return ![r.x,r.y,r.width,r.height].every(Number.isFinite)
   }).length
  }));
  if(!layout.mapReady||!layout.regions||layout.nonfinite)throw Error('Map missing or invalid SVG geometry '+JSON.stringify(layout));
  let png;
  if(scenario.export){
   const svg=await page.evaluate(async()=>{await ensureExportMapReady();return preparedExportSvg()});
   const check=svg.match(/<svg[^>]*width="([0-9.]+)"[^>]*height="([0-9.]+)"/);
   if(!check||Number(check[1])<400||Number(check[2])<400)throw Error('Export dimensions invalid');
   const imageData=Buffer.from(svg).toString('base64');
   const preview=await context.newPage();
   await preview.setContent('<!DOCTYPE html><html><body style="padding:0;margin:0;background:white"><img alt="export-preview" style="display:block;width:900px;height:1100px;object-fit:contain" src="data:image/svg+xml;base64,'+imageData+'"></body></html>');
   await preview.locator('img').evaluate(el=>el.decode());
   png=await preview.locator('img').screenshot({animations:'disabled'});
   await preview.close();
   layout.exportDimensions=[Number(check[1]),Number(check[2])];
  }else{
   png=await page.locator('#canvas').screenshot({animations:'disabled',caret:'hide'});
  }
  if(errors.length)throw Error('Uncaught JavaScript error: '+errors.join('; '));
  const name=scenario.id+'-'+suffix+'.png';
  await fs.writeFile(path.join(output,name),png);
  return {png,layout,name};
 }finally{await context.close()}
}
function diffImages(before,after){
 const a=PNG.sync.read(before),b=PNG.sync.read(after);
 if(a.width!==b.width||a.height!==b.height)return{fraction:1,reason:'dimensions differ',
  before:[a.width,a.height],after:[b.width,b.height]};
 const pixels=a.width*a.height,delta=new PNG({width:a.width,height:a.height});
 const changed=pixelmatch(a.data,b.data,delta.data,a.width,a.height,{threshold:0.16,includeAA:false});
 return{fraction:changed/pixels,pixels,changed,diff:PNG.sync.write(delta),
  before:[a.width,a.height],after:[b.width,b.height]};
}
try{
 for(const scenario of scenarios){
  const item={id:scenario.id};
  try{
   const baseline=await capture(prev,scenario,'before'),current=await capture(curr,scenario,'after');
   const compare=diffImages(baseline.png,current.png);
   if(compare.diff)await fs.writeFile(path.join(output,scenario.id+'-diff.png'),compare.diff);
   item.changedFraction=+compare.fraction.toFixed(5);
   item.before=baseline.layout;item.after=current.layout;
   item.status=item.changedFraction>0.08?'significant-change':
    item.changedFraction>0.015?'review-change':'consistent';
   item.reason=compare.reason||'';
   // A missing region or broken export is always a regression even if visuals change intentionally.
   if(current.layout.regions<baseline.layout.regions*.85)item.status='geometry-regression';
  }catch(error){item.status='capture-error';item.error=String(error?.stack||error).slice(0,700)}
  results.push(item);
  console.log('VISUAL_CHECK',JSON.stringify(item));
 }
}finally{await browser.close()}
await fs.writeFile(path.join(output,'summary.json'),JSON.stringify({
 comparedAgainst:'previous git main revision, not a self-comparison',scenes:results,
 interpretation:'Visual changes need review; missing geometry and capture errors fail CI.'
},null,2));
const severe=results.filter(x=>x.status==='capture-error'||x.status==='geometry-regression');
if(severe.length){console.error('Visual regression failures:',severe.map(x=>x.id));process.exitCode=1}
const changed=results.filter(x=>x.status==='significant-change'||x.status==='review-change');
if(changed.length)console.warn('Visual change review required:',changed.map(x=>x.id));
