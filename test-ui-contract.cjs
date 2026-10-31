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
 assert.match(town,/options\.filter\(\(\[mode\]\)=>mode!=='candidateVote'\)/);
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
 assert.match(workspace,/const used=counts\(\)/);
 assert.match(workspace,/legendVisiblePalette\(\)\.filter\(p=>used\[p\.id\]\)/);
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

test('Blank candidate inputs display zero without saving artificial forecast data',()=>{
 assert.match(read('prediction-ui.js'),/input\.value=predictionDraft\.estimates\[c\.id\]\?\.\[key\]\?\?'0'/);
 assert.match(read('town-prediction-ui.js'),/input\.value=localDraft\.estimates\?\.\[c\.id\]\?\.\[key\]\?\?'0'/);
 assert.match(app,/input\.value=r\[key\]\?\?\(\['votes','share'\]\.includes\(key\)\?'0':'\'\)/);
 assert.match(read('prediction-ui.js'),/if\(key==='share'\)input\.max='100'/);
 assert.match(read('town-prediction-ui.js'),/if\(key==='share'\)input\.max='100'/);
 assert.match(app,/if\(key==='share'\)input\.max='100'/);
});
test('Rate gradient fields show 100 percent as default maximum',()=>{
 assert.match(read('workspace-ui.js'),/predictionRangeMax'\)\.value=state\.gradient\.max\?\?\(predictionIsVotes\(\)\?'':100\)/);
 assert.match(read('workspace-ui.js'),/state\.gradient\.max=predictionUsesGradient\(\)\?100:null/);
 assert.match(app,/gradientMax'\)\.value=state\.gradient\.max===null\?\(state\.gradient\.metric==='share'\?100:''\)/);
 assert.match(app,/state\.gradient\.max=state\.gradient\.metric==='share'\?100:null/);
});
test('Township forecast labels omit local filler words while accepting earlier CSV headers',()=>{
 for(const p of ['index.html','town-prediction-core.js'])assert.doesNotMatch(read(p),/本地|当地/);
 assert.match(read('town-prediction-ui.js'),/ix\('预测胜出'\)>=0\?ix\('预测胜出'\):ix\('当地胜出'\)/);
 assert.match(index,/预测胜出/);
});

test('Vote totals auto-sum only explicitly entered candidate votes',()=>{
 const core=require('./prediction-core.js');
 assert.deepEqual(core.tallyVotes([null,'','']),{total:null,count:0,complete:false});
 assert.deepEqual(core.tallyVotes(['0',null,'']),{total:0,count:1,complete:false});
 assert.deepEqual(core.tallyVotes(['123','77','0']),{total:200,count:3,complete:true});
 assert.throws(()=>core.tallyVotes(['1.5']),/整数/);
 const model=require('./town-prediction-core.js');
 const cs=[{id:'a',party:'甲'},{id:'b',party:'乙'}];
 const voteOnly=model.validate(cs,{estimates:{a:{votes:80},b:{votes:20}},totalVotes:100},true);
 assert.equal(voteOnly.completeVotes,true);
 const rateOnly=model.validate(cs,{estimates:{a:{share:70},b:{share:30}},totalVotes:null},true);
 assert.equal(rateOnly.completeShares,true);
 assert.equal(rateOnly.totalVotes,null);
 assert.equal(model.summary(cs,{estimates:{a:{votes:80}},totalVotes:80},'candidateShare','a',true).status,'missing');
});
test('Both election editors compute read-only totals, no manual total required',()=>{
 assert.match(index,/id="localTotalVotes"[^>]*readonly/);
 assert.match(index,/id="validVoteTotal"[^>]*readonly/);
 assert.match(index,/id="predictionAutoTotalValue"/);
 assert.match(town,/PredictionCore\.tallyVotes\(cs\.map/);
 assert.match(app,/PredictionCore\.tallyVotes\(voteDraft\.map/);
 assert.match(read('prediction-ui.js'),/PredictionCore\.tallyVotes\(candidates\.map/);
});

test('Merged vote display calculates highest candidate from votes or shares',()=>{
 const core=require('./prediction-core.js');
 const cs=[{id:'a',party:'甲'},{id:'b',party:'乙'},{id:'c',party:'甲'}];
 const votes=core.voteResult(cs,{winners:[],estimates:{a:{votes:280},b:{votes:500},c:{votes:220}}});
 const shares=core.voteResult(cs,{winners:[],estimates:{a:{share:28},b:{share:50},c:{share:22}}});
 assert.equal(votes.candidate.id,'b');assert.equal(shares.candidate.id,'b');
 assert.equal(votes.votes,500);assert.equal(votes.share,50);assert.equal(shares.votes,null);
 assert.equal(shares.share,50);
 const group=core.voteResult(cs,{estimates:{a:{share:28},b:{share:50},c:{share:22}}},true);
 assert.equal(group,null,'Equal highest party shares must not silently choose a winner');
 assert.equal(core.voteResult(cs,{estimates:{a:{votes:100},b:{votes:200}}}),null,'Partial entries cannot establish highest candidate');
 const t=require('./town-prediction-core.js');
 const local=t.summary(cs,{leaderId:'a',estimates:{a:{votes:280},b:{votes:500},c:{votes:220}}},'topVote','',true);
 assert.equal(local.status,'winner');assert.equal(local.candidate.id,'b');assert.equal(local.share,50);
 const percentageOnly=t.summary(cs,{estimates:{a:{share:28},b:{share:50},c:{share:22}}},'topVote','',true);
 assert.equal(percentageOnly.status,'winner');assert.equal(percentageOnly.candidate.id,'b');
 assert.equal(percentageOnly.votes,null);
});
test('Numeric mode does not require manual predicted winners',()=>{
 assert.match(workspace,/\['topVote','最高票者得票（票数／得票率）'\]/);
 assert.match(town,/\['topVote','最高票者得票（票数／得票率）'\]/);
 assert.match(read('prediction-ui.js'),/if\(predictionUsesVoteDisplay\(\)\)\{r\.winners=\[\]/);
 assert.match(town,/if\(state\.predictionDisplay!=='composition'\)draft\.leaderId=''/);
 assert.match(index,/id="localUseVoteData"/);
 assert.match(read('style.css'),/\.prediction-dialog\.numeric-entry \.prediction-table th:first-child/);
 assert.match(read('style.css'),/\.local-dialog\.numeric-entry \.local-table th:first-child/);
 assert.match(app,/predictionUsesVoteDisplay\(\)\|\|typeof predictionDistricts/);
 assert.match(workspace,/complete=d=>predictionUsesVoteDisplay\(\)\?!!predictionDisplayResult\(d\)/);
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
 assert.match(history,/unmatchedDistricts\.add\(norm\(h\.county\)/);
 assert.match(history,/__2022_unmatched__/);
 assert.match(history,/已暂不着色/);
 assert.match(history,/多席次选区按各党实际当选人数统计/);
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
