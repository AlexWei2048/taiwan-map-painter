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

test('Future reset offers a visible-scope clear and a full initial-state reset',()=>{
 assert.match(index,/id="resetChoiceDialog"/);
 assert.match(index,/id="chooseCurrentReset"/);
 assert.match(index,/id="chooseAllReset"/);
 assert.match(index,/清空当前界面地图数据/);
 assert.match(index,/清空所有地图数据（恢复初始状态）/);
 assert.match(app,/function clearCurrentMapData\(\)/);
 assert.match(app,/const items=currentItems\(\)/);
 assert.match(app,/localPredictionActive\(\)/);
 assert.match(app,/predictionDistrictFor\(f\)/);
 assert.match(app,/state\.localPredictions\?\.\[districtId\]/);
 assert.match(app,/state=defaults\(\);undo\.length=0;redo\.length=0/);
 assert.match(app,/网站内置候选人名单、2022历史选举结果和地图底图不会被删除/);
});
test('Current reset is scoped to visible features and full reset restores the defaults',()=>{
 const clear=app.slice(app.indexOf('function clearCurrentMapData()'),app.indexOf('function currentResetScopeLabel()'));
 assert.match(clear,/currentItems\(\)/);
 assert.match(clear,/predictionDistrictFor\(f\)/);
 assert.match(clear,/state\.localPredictions/);
 assert.match(clear,/state\.fills\?\.\[level\]/);
 assert.match(clear,/state\.elections\?\.\[level\]/);
 assert.match(clear,/state\.legislativeTownFills/);
 assert.match(clear,/pushHistory\(\)/);
 assert.match(clear,/pruneUnusedAutoPredictionPalette\(state\)/);
 assert.match(app,/undo\.length=0;redo\.length=0/);
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

const history=read('history-2022.js');
test('2022 history remains isolated from saved 2026 state',()=>{
 assert.match(index,/id="workspaceHistory"/);
 assert.match(history,/savedMapScope=clone\(state\)/);
 assert.match(history,/state=clone\(savedMapScope\)/);
 assert.match(history,/capture:true/);
 assert.match(history,/if\(!recordsInView\(\)\.length\)throw Error/);
});
test('Historical district mismatch is not silently colored',()=>{
 assert.match(history,/unmatchedDistricts\.add\(key\)/);
 assert.match(history,/__2022_unmatched__/);
 assert.match(history,/已暂不着色/);
 assert.match(history,/多席次选区：主色表示席次最多政党/);
});
test('Main UI language avoids restricted expression',()=>{
 for(const file of ['index.html','app.js','workspace-ui.js','history-2022.js','candidate-directory.js'])assert.equal(read(file).includes('\u5168\u56fd'),false,file);
});

test('2022 council districts use independent historical boundaries and reconcile to 910 seats',()=>{
 const d=JSON.parse(read('assets/history-council-districts-2022.json'));
 assert.equal(d.year,2022);assert.equal(d.districtCount,215);assert.equal(d.rows.length,215);
 assert.equal(d.rows.reduce((n,x)=>n+x.seats,0),910);
 assert.equal(d.winnerCorrections.length,4);assert.equal(d.correctedElectedTotal,910);
 assert.ok(d.rows.every(x=>x.scopeTowns.length>0&&x.seats>0));
});
