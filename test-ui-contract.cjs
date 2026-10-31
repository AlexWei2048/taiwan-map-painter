'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const app=read('app.js'),town=read('town-prediction-ui.js'),workspace=read('workspace-ui.js'),index=read('index.html');
test('All runtime JavaScript parses cleanly',()=>{
 for(const name of ['app.js','town-prediction-ui.js','town-prediction-core.js','workspace-ui.js','prediction-ui.js','prediction-core.js','candidate-directory.js','election-core.js','district-core.js','district-details.js'])assert.doesNotThrow(()=>new Function(read(name)),name);
});
test('Councillor national scope has single-map choices and remains stored in project',()=>{
 assert.match(index,/id="councilViewScope"/);assert.match(app,/councilViewScope:'all'/);
 assert.match(app,/out\.councilViewScope=\['all','regional','plains','mountain'\]/);
 assert.match(app,/function councilVisibleIdentity\(\)/);
 assert.match(app,/state\.councilViewScope=oldCouncilView;render\(\)/);
});
test('Town geography loads only for the corresponding election view',()=>{
 assert.doesNotMatch(index,/<script src="town-areas\.js/);
 assert.match(town,/function ensureTownPredictionAreas\(\)/);
 assert.match(town,/if\(active&&state\.predictionOffice==='council'\)ensureTownPredictionAreas\(\)/);
});
test('Avoid comparing one candidate against unrelated national districts',()=>{
 assert.match(town,/options\.filter\(\(\[mode\]\)=>!mode\.startsWith\('candidate'\)\)/);
 assert.match(town,/function localDistrictItems\(/);
});
test('Autobackup and export preserve existing behavior',()=>{
 assert.match(app,/window\.addEventListener\('pagehide'/);
 assert.match(index,/下载备份方案 JSON/);
 assert.match(app,/55000000\/\(width\*height\)/);
 assert.match(app,/16[0]{3}\/Math\.max\(width,height\)/);
 assert.match(index,/id="exportSvg"/);
});
test('Progress and nationwide party-only legends are retained',()=>{
 assert.match(index,/id="predictionProgressBar"/);
 assert.match(workspace,/predictionProgressBar'\)\.value/);
 assert.match(workspace,/if\(!state\.county\)\{const used=counts\(\)/);
});
test('Confirmed incumbents retain their visible label without marking others',()=>{
 assert.match(read('candidate-directory.js'),/incumbent===true\)inc\.append\(dirText\('span','现任'/);
 assert.match(read('prediction-ui.js'),/incumbent===true\?'现任':'',r\?\.winners/);
});

test('The map uses lazy electoral and village geometry',()=>{
 assert.match(app,/assets\/map-base\.json/);
 assert.match(app,/function ensureMapDetails\(\)/);
 assert.match(app,/assets\/map-council\.json/);
 assert.match(app,/assets\/map-legislative\.json/);
 assert.match(app,/assets\/map-district-borders\.json/);
 assert.match(app,/assets\/map-town-borders\.json/);
 assert.match(app,/map-villages-/);
});

test('Map export waits for all relevant lazy layers',()=>{
 assert.match(app,/async function ensureExportMapReady\(\)/);
 assert.match(app,/await ensureExportMapReady\(\);download\(new Blob/);
 assert.match(app,/await ensureExportMapReady\(\);const source=preparedExportSvg/);
 assert.match(app,/data\.villages\.length!==data\.villageMetadata\.count/);
 assert.match(app,/delete detailRequests\[name\]/);
 assert.match(app,/delete detailRequests\.villages/);
});

function isolatedExportGuard(env){
 const start=app.indexOf('async function ensureExportMapReady(){');
 const end=app.indexOf('const mapPromise=',start);
 assert.ok(start>=0&&end>start);
 const code=app.slice(start,end)+';return ensureExportMapReady;';
 return new Function('data','mapPromise','state','detailRequests','ensureMapDetails','localPredictionActive','ensureTownPredictionAreas','currentItems',code)(
  env.data,Promise.resolve(env.data),env.state,env.detailRequests||{},env.ensureMapDetails||(()=>{}),env.localPredictionActive||(()=>false),env.ensureTownPredictionAreas||(()=>Promise.resolve(true)),env.currentItems||(()=>[{}])
 );
}
test('Export guard pauses for geometry promises, then succeeds after completion',async()=>{
 let finish,done=false;
 const pending=new Promise(resolve=>finish=resolve);
 const env={data:{council:Array(161),councilIndigenous:Array(60),districtBorders:{council:[{}]},townBorders:{all:Array(22)}},state:{level:'council'},detailRequests:{'议员选区':pending,'选区边界':Promise.resolve(true),'乡镇边界':Promise.resolve(true)}};
 const guard=isolatedExportGuard(env);
 const task=guard().then(()=>{done=true});
 await Promise.resolve();
 assert.equal(done,false,'Must not export before geometry finishes');
 finish(true);
 await task;
 assert.equal(done,true);
});
test('Export guard refuses missing or failed map geometry',async()=>{
 const data={council:Array(161),councilIndigenous:Array(60),districtBorders:{council:[{}]},townBorders:{all:Array(22)}};
 const env={data,state:{level:'council'},detailRequests:{'议员选区':Promise.resolve(false),'选区边界':Promise.resolve(true),'乡镇边界':Promise.resolve(true)}};
 await assert.rejects(isolatedExportGuard(env)(),/载入失败/);
 env.detailRequests['议员选区']=Promise.resolve(true);env.data={...data,council:[]};
 await assert.rejects(isolatedExportGuard(env)(),/尚未完整载入/);
});
test('Export guard validates village map before exporting',async()=>{
 const env={data:{villages:[{}],villageMetadata:{count:7731},townBorders:{all:Array(22)}},state:{level:'villages'},detailRequests:{villages:Promise.resolve(true),'乡镇边界':Promise.resolve(true)}};
 await assert.rejects(isolatedExportGuard(env)(),/村里地图资料尚未完整载入/);
});
test('Township or mayor maps export without unrelated council dependencies',async()=>{
 const env={data:{towns:[{}]},state:{level:'towns'},detailRequests:{}};
 await assert.doesNotReject(isolatedExportGuard(env)());
});
