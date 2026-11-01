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
test('Nationwide mayor map uses 22 full names, safe city leaders and framed offshore labels',async t=>{
 const page=await pageFor(t);await page.waitForFunction(()=>document.querySelectorAll('#labels [data-label]').length===22);
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
  assert.ok(await line.evaluate(el=>parseFloat(getComputedStyle(el).strokeWidth)>=2),'City callout must be visibly thicker');
  assert.equal(await page.locator('#labels [data-label-leader-halo="'+id+'"]').count(),1);
  assert.ok(await page.locator('#labels [data-label="'+id+'"]').evaluate(el=>Number.parseInt(getComputedStyle(el).fontWeight,10)>=600),'Full city name must be bold');
 }
 const svg=await exportSvg(page);
 for(const name of result.names)assert.ok(svg.includes(name),'Export includes '+name);
 assert.equal((svg.match(/data-placement="inset-bottom"/g)||[]).length,3);
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
 assert.equal(await stamp.textContent(),'更新时间：2026年11月1日 17:17（台北时间）');
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
 const logo=page.locator('.palette-row[data-party="gray"] img.party-logo');
 assert.equal(await logo.count(),1);
 assert.ok((await logo.getAttribute('src')).startsWith('data:image/png;base64,'));
 await page.locator('.palette-row[data-party="gray"] button.swatch').click();
 await page.locator('#regions path[data-region]').first().click();
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
 const page=await pageFor(t);await page.locator('#county').selectOption({label:'台北市'});await page.locator('#predictionScale').selectOption('town');
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
test('Kaohsiung township labels have geographical numbers, equal fonts and a nonoverlapping key in screen and export',async t=>{
 const page=await pageFor(t);await page.locator('#county').selectOption({label:'高雄市'});await page.locator('#predictionScale').selectOption('town');
 assert.equal(await page.locator('#labels [data-label]').count(),38);assert.deepEqual(await missingLabels(page),[]);
 const labels=await page.locator('#labels [data-label]').evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.label,number:e.dataset.numberKey,font:e.getAttribute('font-size'),rect:{x:e.getBBox().x,y:e.getBBox().y,w:e.getBBox().width,h:e.getBBox().height}})));
 assert.equal(new Set(labels.map(e=>e.font)).size,1);
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].rect,b=labels[j].rect;assert.ok(!(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y),'Label overlap')}
 const towns=JSON.parse(await readFile(new URL('../assets/map-base.json',import.meta.url),'utf8')).towns;
 const numbered=labels.filter(e=>e.number).sort((a,b)=>Number(a.number)-Number(b.number));
 for(let i=1;i<numbered.length;i++)assert.ok(towns.find(f=>f.id===numbered[i].id).center[1]>=towns.find(f=>f.id===numbered[i-1].id).center[1]);
 assert.ok(await page.evaluate(()=>document.querySelector('#mapNumberKey').getBoundingClientRect().top>=document.querySelector('#map').getBoundingClientRect().bottom));
 const svg=await exportSvg(page);
 const result=await page.evaluate(source=>{const doc=new DOMParser().parseFromString(source,'image/svg+xml'),map=doc.querySelector('svg svg'),key=doc.querySelector('[data-map-number-key] rect');return{below:Number(key.getAttribute('y'))>=Number(map.getAttribute('y'))+Number(map.getAttribute('height')),numbers:[...map.querySelectorAll('[data-number-key]')].map(e=>[e.dataset.label,e.dataset.numberKey])}},svg);
 assert.ok(result.below);assert.deepEqual(result.numbers.sort(),numbered.map(e=>[e.id,e.number]).sort());
});
test('Zooming the national council overview recalculates and restores all 221 official numbers',async t=>{
 const page=await pageFor(t);await page.locator('#predictionOffice').selectOption('council');await page.waitForFunction(()=>document.querySelectorAll('#regions [data-region]').length===221);
 await page.locator('#zoomIn').click();await page.locator('#zoomIn').click();assert.deepEqual(await missingLabels(page),[]);
 await page.locator('#fit').click();await page.locator('#county').selectOption({label:'高雄市'});assert.deepEqual(await missingLabels(page),[]);
});
test('Mobile township number key sits below the drawing and preserves all labels',async t=>{
 const page=await pageFor(t,{width:390,height:844});await page.locator('#county').selectOption({label:'高雄市'});await page.locator('#predictionScale').selectOption('town');
 assert.deepEqual(await missingLabels(page),[]);
 assert.ok(await page.evaluate(()=>document.querySelector('#mapNumberKey').getBoundingClientRect().top>=document.querySelector('#map').getBoundingClientRect().bottom));
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
});
