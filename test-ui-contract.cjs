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
