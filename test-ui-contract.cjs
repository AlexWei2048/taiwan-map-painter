'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const app=read('app.js'),town=read('town-prediction-ui.js'),workspace=read('workspace-ui.js'),index=read('index.html');
test('Map display choices and candidate directory follow the election scope, before editing',()=>{
 const sectionStart=index.indexOf('<section class="panel" id="mapSettings">'),sectionEnd=index.indexOf('</section>',sectionStart);
 const scope=index.slice(sectionStart,sectionEnd),editor=index.slice(sectionEnd,index.indexOf('id="manualBrushTools"'));
 assert.ok(sectionStart>=0&&sectionEnd>sectionStart);
 for(const id of ['scopeDisplayTools','predictionDisplayBox','predictionDisplay','localCandidateControl','localForecastHelp','allCandidates']){
  assert.equal((index.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id+' duplicated');
  assert.ok(scope.includes('id="'+id+'"'),id+' must be in election scope');
 }
 assert.ok(scope.indexOf('id="predictionDisplayBox"')>scope.indexOf('id="county"'));
 assert.ok(scope.indexOf('id="allCandidates"')>scope.indexOf('id="predictionDisplayBox"'));
 assert.doesNotMatch(editor,/id="predictionDisplayBox"/);
 assert.match(workspace,/\$\('scopeDisplayTools'\)\.hidden=!task\|\|manual/);
 assert.match(workspace,/\$\('directoryCounty'\)\.value=state\.county\|\|''/);
 assert.match(workspace,/allCandidates\.onclick=\(\)=>openDirectory\(true\)/);
 assert.match(read('style.css'),/#scopeDisplayTools \.display-settings/);
});

test('Coastlines are excluded while all actual shared administrative borders remain',()=>{
 const start=app.indexOf('function sharedBoundaryGeometry(features,includeCoast=false){'),end=app.indexOf('\nconst EMPTY_SHARED_BORDER_FEATURES=',start);
 assert.ok(start>=0&&end>start);
 const calculate=new Function(app.slice(start,end)+';return sharedBoundaryGeometry')();
 const polygons=[
  {id:'a',county:'县甲',townId:'镇甲',d:'M0,0L1,0L1,1L0,1Z'},
  {id:'b',county:'县乙',townId:'镇乙',d:'M1,0L2,0L2,1L1,1Z'},
  {id:'c',county:'离岛',d:'M4,4L5,4L5,5L4,5Z'}
 ];
 const result=calculate(polygons);
 assert.equal(result.all,'M1,0L1,1');
 assert.equal(result.byCounty['县甲'],'M1,0L1,1');
 assert.equal(result.byCounty['县乙'],'M1,0L1,1');
 assert.equal(result.byTown['镇甲'],'M1,0L1,1');
 assert.equal(result.byTown['镇乙'],'M1,0L1,1');
 assert.match(app,/appendSharedBorders\(group,'towns','regional',state.level==='villages'\)/);
 assert.equal(result.byCounty['离岛'],undefined);
 assert.equal(calculate(polygons.slice(0,1)).all,'');
 const complete=calculate(polygons,true);
 assert.ok(complete.all.length>result.all.length);
 assert.ok(complete.byCounty['县甲'].includes('M0,0L1,0'),'selected county restores shoreline');
 assert.ok(complete.byCounty['离岛'].includes('M4,4L5,4'),'island coastline must be present when selected');
 assert.match(app,/sharedMapBorders\(level,identity,!!state\.county\)/);
 assert.match(app,/includeCoast\?'complete':'internal'/);
 assert.equal(calculate([{...polygons[0]}, {...polygons[1],id:'a'}]).all,'');
 assert.match(app,/appendSharedBorders\(districtGroup,mayorTownBoundaryOverlay\(\)\|\|councilCountyOverview\(\)\?'counties':state.level/);
 assert.match(app,/appendSharedBorders\(borderGroup,'counties'\)/);
 assert.match(app,/appendSharedBorders\(group,'towns','regional',state.level==='villages'\)/);
 assert.match(app,/\['#regions path','none',0\]/);
 assert.doesNotMatch(app,/for\(const f of countyOutlines\)/);
 assert.match(read('style.css'),/#regions path,#regions path:hover/);
 assert.match(index,/app\.js\?v=[\w-]+/);
});

test('Map coastline switches with scope for counties, towns and islands',()=>{
 const start=app.indexOf('function sharedBoundaryGeometry(features,includeCoast=false){');
 const end=app.indexOf('\nfunction render(){',start);
 const src=app.slice(start,end);
 const features=[
  {id:'a',name:'甲县',county:'甲县',d:'M0,0L1,0L1,1L0,1Z'},
  {id:'b',name:'乙县',county:'乙县',d:'M1,0L2,0L2,1L1,1Z'},
  {id:'island',name:'离岛县',county:'离岛县',d:'M4,4L5,4L5,5L4,5Z'}
 ];
 const data={counties:features,towns:features};
 const state={county:'',villageTown:''};
 const helper=new Function('data','state','featureElectorate','svgEl',src+';return {sharedMapBorders,appendSharedBorders}')(
  data,state,()=> 'regional',(tag,attrs)=>({tag,...attrs}));
 const makeGroup=()=>({children:[],append(item){this.children.push(item)}});
 let group=makeGroup();
 helper.appendSharedBorders(group,'counties');
 assert.equal(group.children.length,1);
 assert.equal(group.children[0].d,'M1,0L1,1');
 state.county='甲县';
 group=makeGroup();helper.appendSharedBorders(group,'counties');
 assert.equal(group.children.length,1);
 assert.match(group.children[0].d,/M0,0L1,0/);
 state.county='离岛县';
 group=makeGroup();helper.appendSharedBorders(group,'counties');
 assert.equal(group.children.length,1);
 assert.match(group.children[0].d,/M4,4L5,4/);
 state.county='';
 group=makeGroup();helper.appendSharedBorders(group,'towns');
 assert.equal(group.children[0].d,'M1,0L1,1');
 state.county='乙县';
 group=makeGroup();helper.appendSharedBorders(group,'towns');
 assert.match(group.children[0].d,/L2,0L2,1/);
});
test('All runtime JavaScript parses cleanly',()=>{
 for(const name of ['app.js','town-prediction-ui.js','town-prediction-core.js','workspace-ui.js','prediction-ui.js','prediction-core.js','candidate-directory.js','election-core.js','district-core.js','district-details.js','history-workspace.js'])assert.doesNotThrow(()=>new Function(read(name)),name);
});
test('Councillor national scope has single-map choices and remains stored in project',()=>{
 assert.match(index,/id="councilViewScope"/);assert.match(app,/councilViewScope:'all'/);
 assert.match(app,/out\.councilViewScope=\['all','regional','plains','mountain'\]/);
 assert.match(app,/function councilVisibleIdentity\(\)/);
 assert.match(app,/state\.councilViewScope=oldCouncilView;state\.labels=oldLabels;render\(\)/);
});
test('Town geography loads only for the corresponding election view',()=>{
 assert.doesNotMatch(index,/<script src="town-areas\.js/);
 assert.match(town,/function ensureTownPredictionAreas\(\)/);
 assert.match(town,/if\(active&&state\.predictionOffice==='council'\)ensureTownPredictionAreas\(\)/);
});
test('Avoid comparing one candidate against unrelated national districts',()=>{
 assert.match(town,/function localDisplayOptions\(\)\{return \[\['composition','预测胜负'\],\['topVote','预测得票'\]\]\}/);
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
 assert.match(app,/function sharedBoundaryGeometry\(features,includeCoast=false\)/);
 assert.match(app,/appendSharedBorders\(group,'towns','regional',state.level==='villages'\)/);
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
 assert.match(read('workspace-ui.js'),/predictionMarginMode\(\)\?\(state\.gradient\.marginManual===true\?state\.gradient\.max:''\)/);
 assert.match(read('workspace-ui.js'),/state\.gradient\.max=predictionMarginMode\(\)\|\|predictionIsVotes\(\)\?null:predictionUsesGradient\(\)\?100:null/);
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
 const partial=core.voteResult(cs,{estimates:{a:{votes:100},b:{votes:200}}});
 assert.equal(partial.candidate.id,'b');
 assert.equal(partial.partial,true);
 assert.equal(partial.recorded,2);
 assert.equal(partial.share,200/300*100);
 const onlyRate=core.voteResult(cs,{estimates:{b:{share:44.5}}});
 assert.equal(onlyRate.candidate.id,'b');
 assert.equal(onlyRate.value,44.5);
 assert.equal(onlyRate.partial,true);
 assert.equal(onlyRate.recorded,1);
 assert.equal(onlyRate.votes,null);
 assert.equal(core.voteResult(cs,{estimates:{a:{share:50},b:{share:50}}}),null,'Highest vote tie must remain unresolved');
 assert.equal(core.voteResult(cs,{estimates:{a:{share:35},b:{votes:120}}}),null,'Do not mix incomparable candidate measures');
 const t=require('./town-prediction-core.js');
 const townPartial=t.summary(cs,{estimates:{b:{share:44.5}}},'topVote','',true);
 assert.equal(townPartial.status,'winner');
 assert.equal(townPartial.candidate.id,'b');
 assert.equal(townPartial.value,0,'Without a runner-up the margin is unknown and maps use the palest color');
 assert.equal(townPartial.partial,true);
 const local=t.summary(cs,{leaderId:'a',estimates:{a:{votes:280},b:{votes:500},c:{votes:220}}},'topVote','',true);
 assert.equal(local.status,'winner');assert.equal(local.candidate.id,'b');assert.equal(local.share,50);
 const percentageOnly=t.summary(cs,{estimates:{a:{share:28},b:{share:50},c:{share:22}}},'topVote','',true);
 assert.equal(percentageOnly.status,'winner');assert.equal(percentageOnly.candidate.id,'b');
 assert.equal(percentageOnly.votes,null);
});
test('Numeric mode does not require manual predicted winners',()=>{
 assert.match(workspace,/\['topVote','预测得票'\]/);
 assert.match(town,/\['topVote','预测得票'\]/);
 assert.doesNotMatch(read('prediction-ui.js'),/r\.winners=\[\]/);
 assert.doesNotMatch(town,/draft\.leaderId=''/);
 assert.match(index,/id="localUseVoteData"/);
 assert.match(read('style.css'),/\.prediction-dialog\.numeric-entry \.prediction-table th:first-child/);
 assert.match(read('style.css'),/\.local-dialog\.numeric-entry \.local-table th:first-child/);
 assert.doesNotMatch(app,/predictionUsesVoteDisplay\(\)\|\|typeof predictionDistricts/);
 assert.match(workspace,/state\.predictionDisplay==='candidateVote'\|\|!result\.partial/);
});

test('Two-stage forecast UI keeps both scopes and exclusive entry metrics',()=>{
 const entry=read('prediction-vote-entry.js'),styles=read('style.css');
 assert.match(index,/id="predictionDisplayBox"/);
 assert.match(index,/id="predictionCandidateScopeBox"/);
 assert.match(index,/id="predictionVoteMetric"/);
 assert.match(index,/id="localVoteMetric"/);
 assert.match(app,/predictionCandidateScope:'topVote',predictionVoteMetric:'share'/);
 assert.match(workspace,/select\.value=state\.predictionDisplay==='composition'\?'composition':'topVote'/);
 assert.match(workspace,/state\.predictionCandidateScope==='candidateVote'/);
 assert.match(town,/function localDisplayOptions\(\)\{return \[\['composition','预测胜负'\],\['topVote','预测得票'\]\]\}/);
 assert.match(entry,/keepOnlyMetric\(predictionDraft\)/);
 assert.match(entry,/keepOnlyMetric\(localDraft\)/);
 assert.match(entry,/control\.disabled=state.predictionOffice==='council'\|\|!show\|\|active&&kind!=='votes'/);
 assert.match(entry,/control\.disabled=state.predictionOffice==='council'\|\|!show\|\|active&&kind!=='share'/);
 assert.match(styles,/\.prediction-dialog\.metric-share \.vote-metric-column-votes/);
 assert.match(styles,/\.local-dialog\.metric-votes \.vote-metric-column-share/);
});

test('Specified candidate shows own votes even when another candidate leads',()=>{
 const p=require('./prediction-core.js');
 const candidates=[{id:'A',party:'甲'},{id:'B',party:'乙'},{id:'C',party:'丙'}];
 const record={estimates:{A:{votes:500,share:50},B:{votes:350,share:35},C:{votes:150,share:15}}};
 const selected=p.candidateVoteResult(candidates,record,'B');
 assert.equal(selected.candidate.id,'B');assert.equal(selected.party,'乙');
 assert.equal(selected.votes,350);assert.equal(selected.share,35);assert.equal(selected.value,35);
 assert.equal(selected.partial,false);
 assert.equal(p.candidateVoteResult(candidates,record,'unknown'),null);
 assert.equal(p.candidateVoteResult(candidates,record,'C').votes,150);
 const partial=p.candidateVoteResult(candidates,{estimates:{B:{share:27.5}}},'B');
 assert.equal(partial.value,27.5);assert.equal(partial.votes,null);assert.equal(partial.partial,true);
 assert.equal(p.candidateVoteResult(candidates,{estimates:{A:{share:40}}},'B'),null);
 const fromVotes=p.candidateVoteResult(candidates,{estimates:{B:{votes:40},C:{votes:60}}},'B');
 assert.equal(fromVotes.votes,40);assert.equal(fromVotes.value,40);assert.equal(fromVotes.partial,true);
 const singleVote=p.candidateVoteResult(candidates,{estimates:{B:{votes:1234}}},'B');
 assert.equal(singleVote.votes,1234);
 assert.equal(singleVote.value,1234);
 assert.equal(singleVote.share,null,'One candidate vote count cannot imply 100 percent');
 const townCore=require('./town-prediction-core.js');
 const t=townCore.summary(candidates,{estimates:{B:{share:27.5}}},'candidateVote','B',true);
 assert.equal(t.status,'winner');assert.equal(t.candidate.id,'B');assert.equal(t.value,27.5);
 assert.equal(t.partial,true);
 const missing=townCore.summary(candidates,{estimates:{B:{share:27.5}}},'candidateVote','C',true);
 assert.equal(missing.status,'missing');
});
test('Candidate mode selection visible and survives saved projects',()=>{
 assert.match(index,/地图层级<\/label>/);
 assert.doesNotMatch(index,/地图按什么区域显示/);
 assert.match(index,/预测方式<\/label>/);
 assert.match(index,/<option value="composition">预测胜负<\/option>/);
 assert.match(index,/<option value="topVote">预测得票<\/option>/);
 assert.match(index,/id="predictionCandidateScope"/);
 assert.match(index,/<option value="candidateVote">指定候选人<\/option>/);
 assert.match(workspace,/function syncDistrictCandidatePicker\(\)/);
 assert.match(workspace,/PredictionCore\.candidateVoteResult\(cs,record,state\.localDisplayCandidate\)/);
 assert.match(workspace,/syncDistrictCandidatePicker\(\)/);
 assert.match(town,/\$\('localCandidateControl'\)\.hidden=state\.predictionDisplay!=='candidateVote'/);
 assert.match(town,/\$\('localCandidate'\)\.onchange=\(\)=>\{state\.localDisplayCandidate=/);
 assert.match(app,/\['composition','seats'.*'topVote','partyTop','candidateVote'\]/);
 assert.match(app,/\['composition','leader'.*'topVote','partyTop','candidateVote'\]/);
 assert.match(read('prediction-ui.js'),/PredictionCore\.candidateVoteResult\(directoryCandidates\(d\),r,state\.localDisplayCandidate\)/);
});
test('County mayor legend contains only candidates actually represented by the map',()=>{
 const start=workspace.indexOf('function mayorLegendUnit(){');
 const end=workspace.indexOf('\nfunction predictionCandidateLegendEntries(){',start);
 assert.ok(start>=0&&end>start,'Candidate legend builder must be defined');
 const source=workspace.slice(start,end);
 const maker=new Function('state','candidateDatabase','directoryCandidates','predictionParty',
  'candidateDisplayName','logoFor','predictionUsesVoteDisplay','predictionDisplayResult',
  'localPredictionActive','localPredictionItems','localMapResult','predictionSummary',
  source+';return countyMayorCandidateLegendEntries');
 const candidates=[
  {id:'candidate-a',name:'甲一',party:'甲'},
  {id:'candidate-b',name:'甲二',party:'甲'},
  {id:'candidate-c',name:'乙三',party:'乙'},
  {id:'candidate-d',name:'乙四',party:'乙'}
 ];
 const districts=[{id:'mayor:1',type:'mayor',county:'台北市'},{id:'mayor:2',type:'mayor',county:'新北市'}];
 const party=name=>name==='甲'?{id:'party-a',name,color:'#4466aa'}:{id:'party-b',name,color:'#33aa66'};
 const state={county:'台北市',predictionOffice:'mayor',legend:{hidden:[]},predictions:{'mayor:1':{winners:['candidate-b']}}};
 const build=(town,features=[],numeric=false,completed=true)=>maker(state,{districts},d=>d.id==='mayor:1'?candidates:[],
  party,c=>c.name,p=>'logo-'+p.id,()=>numeric,()=>({candidate:candidates[2]}),()=>town,()=>features,
  f=>({status:'winner',candidate:candidates.find(c=>c.id===f.candidateId)}),
  ()=>({status:completed?'complete':'incomplete'}));
 // District map: one winner appears; other filed candidates are not drawn or listed.
 let rows=build(false)();
 assert.deepEqual(rows.map(r=>r.name),['甲二']);
 assert.equal(rows[0].legendSuffix,'（1县市）');
 assert.equal(rows[0].color,'#4466aa');
 assert.equal(rows[0].logo,'logo-party-a');
 assert.deepEqual(build(false,[],false,false)(),[],'Unfinished winners do not paint or appear');
 // A filled rate map uses the computed highest vote candidate, not a saved winner checkbox.
 rows=build(false,[],true)();
 assert.deepEqual(rows.map(r=>r.name),['乙三']);
 assert.equal(rows[0].logo,'logo-party-b');
 // Township map: each actually shaded candidate has its own row and party emblem.
 rows=build(true,[{county:'台北市',candidateId:'candidate-a'},{county:'台北市',candidateId:'candidate-a'},
  {county:'台北市',candidateId:'candidate-b'},{county:'台北市',candidateId:'candidate-c'},
  {county:'新北市',candidateId:'candidate-d'}])();
 assert.deepEqual(rows.map(r=>r.name),['甲一','甲二','乙三']);
 assert.equal(new Set(rows.map(r=>r.id)).size,3,'Same-party candidates remain separate');
 assert.equal(rows[0].color,rows[1].color,'Same-party candidates share their color');
 assert.equal(rows[0].logo,rows[1].logo,'Same-party candidates share their emblem');
 assert.notEqual(rows[0].color,rows[2].color);
 assert.deepEqual(rows.map(r=>r.legendSuffix),['（2区）','（1区）','（1区）']);
 state.legend.hidden=['party-a'];
 assert.deepEqual(build(true,[{county:'台北市',candidateId:'candidate-a'},
  {county:'台北市',candidateId:'candidate-c'}])().map(r=>r.name),['乙三'],
  'Hidden parties remain hidden even if colored on map');
 state.legend.hidden=[];
 state.predictions={'mayor:1':{winners:[]}};
 assert.deepEqual(build(false)(),[],'No painted candidate means no candidate rows');
 state.county='新北市';
 assert.deepEqual(build(false)(),[],'Candidates from other counties are not listed');
 assert.match(workspace,/const unit=mayorLegendUnit\(\)/);
 assert.match(town,/function predictionLegendCountUnit\(\)\{if\(state\.predictionOffice==='mayor'\)return mayorLegendUnit\(\)/);
 assert.match(workspace,/return candidates\.filter\(c=>shown\.has\(c\.id\)\)\.map/);
 assert.match(workspace,/state\.predictionOffice==='mayor'&&typeof localPredictionActive==='function'&&localPredictionActive\(\)\)return countyMayorCandidateLegendEntries/);
 assert.match(app,/if\(Object\.hasOwn\(p,'logo'\)\)return p\.logo/);
 assert.match(app,/const emblem=logoFor\(row\.p\)/);
});

test('Vote-share gradient has stronger and monotonic color differences',()=>{
 const core=require('./election-core.js');
 const colors=['#3664A8','#178565','#E2BF38','#B1445D','#777777'];
 const rgb=color=>[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
 const distance=(c1,c2)=>rgb(c1).reduce((sum,v,i)=>sum+Math.abs(v-rgb(c2)[i]),0);
 for(const color of colors){
  const previous=v=>{const t=.13+.87*v/100;return '#'+rgb(color).map(c=>Math.round(255+(c-255)*t).toString(16).padStart(2,'0')).join('')};
  const values=[0,10,20,30,35,40,45,50,55,60,70,80,90,100].map(v=>core.shade(color,v,0,100));
  const luminance=c=>{const [r,g,b]=rgb(c);return .2126*r+.7152*g+.0722*b};
  for(let i=1;i<values.length;i++)assert.ok(luminance(values[i])<luminance(values[i-1]),'Value must darken monotonically: '+color);
  const contrast=distance(core.shade(color,35,0,100),core.shade(color,55,0,100));
  assert.ok(contrast>=distance(previous(35),previous(55))*1.4,'Typical vote shares must have stronger contrast: '+color);
  assert.equal(core.shade(color,-1,0,100),values[0]);
  assert.equal(core.shade(color,110,0,100),values[values.length-1]);
 }
 assert.throws(()=>core.shade('#3664A8',45,100,100),/上限/);
});
test('Gradient legend matches map shading with intermediate rate markers',()=>{
 assert.match(app,/for\(let step=0;step<=10;step\+\+\)/);
 assert.match(app,/ElectionCore\.shade\(row\.p\.color,value,domain\.min,domain\.max\)/);
 assert.match(app,/const stops=voteMetric\?\[0,\.5,1\]:\[0,\.25,\.5,\.75,1\]/);
 assert.match(app,/barHeight=m\.font\*1\.4/);
 assert.match(app,/state\.fillMode==='prediction'&&predictionUsesGradient\(\)/);
 assert.match(workspace,/ElectionCore\.shade\(p\.color,lead\.value,domain\.min,domain\.max\)/);
 assert.match(town,/ElectionCore\.shade\(p\.color,r\.value,predictionDomain\(\)\.min,predictionDomain\(\)\.max\)/);
});
test('Highest-vote gradient uses leading margin not the winner own percentage',()=>{
 const core=require('./prediction-core.js'),townCore=require('./town-prediction-core.js');
 const cs=[{id:'a',party:'甲'},{id:'b',party:'乙'},{id:'c',party:'甲'}];
 const shareRecord={estimates:{a:{share:52},b:{share:40},c:{share:8}}};
 const byCandidate=core.voteResult(cs,shareRecord);
 assert.equal(byCandidate.value,52,'The original candidate support rate is retained');
 assert.equal(byCandidate.marginShare,12,'Map color measures first minus second');
 assert.equal(byCandidate.marginVotes,null);
 assert.equal(byCandidate.runnerUp.candidate.id,'b');
 const byParty=core.voteResult(cs,shareRecord,true);
 assert.equal(byParty.party,'甲');assert.equal(byParty.share,60);assert.equal(byParty.marginShare,20);
 const countRecord={estimates:{a:{votes:520},b:{votes:400},c:{votes:80}}};
 const counted=core.voteResult(cs,countRecord);
 assert.equal(counted.marginShare,12);
 assert.equal(counted.marginVotes,120);
 assert.equal(core.voteResult(cs,countRecord,true).marginVotes,200);
 const partial=core.voteResult(cs,{estimates:{a:{share:52},b:{share:40}}});
 assert.equal(partial.partial,true);assert.equal(partial.marginShare,12);
 const one=core.voteResult(cs,{estimates:{a:{share:52}}});
 assert.equal(one.marginShare,null,'Unknown runner-up cannot produce a fabricated margin');
 assert.equal(one.marginVotes,null);
 assert.equal(one.value,52);
 assert.equal(core.voteResult(cs,{estimates:{a:{share:50},b:{share:50}}}),null,'Unresolved tie stays unresolved');
 const town=townCore.summary(cs,shareRecord,'topVote','',true);
 assert.equal(town.status,'winner');assert.equal(town.share,52);
 assert.equal(town.value,12,'Town shading uses the margin');
 assert.equal(town.marginShare,12);
 const partyTown=townCore.summary(cs,shareRecord,'partyTop','',true);
 assert.equal(partyTown.value,20,'Party map margin uses ranked party totals');
 const candidate=townCore.summary(cs,shareRecord,'candidateVote','b',true);
 assert.equal(candidate.value,40,'Specified candidate map still shows own vote share');
 assert.equal(candidate.marginShare,undefined);
 const townSingle=townCore.summary(cs,{estimates:{a:{share:52}}},'topVote','',true);
 assert.equal(townSingle.status,'winner');assert.equal(townSingle.value,0);
 assert.equal(townSingle.marginShare,null);
});
test('Mayor election legends count seats while local maps count townships',()=>{
 const start=workspace.indexOf('function predictionCandidateLegendEntries(){');
 const end=workspace.indexOf('\nfunction predictionDistrictLabel(d)',start);
 assert.ok(start>=0&&end>start);
 const source=workspace.slice(start,end);
 const state={county:'',predictionOffice:'mayor'};
 let townMode=false;
 const unit=()=>townMode?'乡镇市区':'县市';
 const maker=new Function('state','candidateDatabase','counts','predictionUsesVoteDisplay',
  'localPredictionActive','predictionLegendCountUnit','legendVisiblePalette','mayorLegendUnit',
  source+';return predictionCandidateLegendEntries');
 const rows=maker(state,{districts:[]},()=>({'blue':8,'green':4}),()=>false,()=>townMode,()=>townMode?'乡镇市区':'席',
  ()=>[{id:'blue',name:'甲党',color:'#112266'},{id:'green',name:'乙党',color:'#229955'}],unit);
 assert.deepEqual(rows().map(r=>r.legendSuffix),['（8席）','（4席）']);
 townMode=true;
 assert.deepEqual(rows().map(r=>r.legendSuffix),['（8乡镇市区）','（4乡镇市区）']);
 state.predictionOffice='council';
 assert.deepEqual(rows().map(r=>r.legendSuffix),['（8乡镇市区）','（4乡镇市区）'],
  'Existing councillor township-unit behavior should remain unchanged');
 state.county='彰化县';
 assert.deepEqual(rows().map(r=>r.legendSuffix),['（8席）','（4席）'],
  'County-scoped councillor seat mode retains its existing seat unit');
});
test('Prediction legend contains only the displayed election-district count',()=>{
 const start=app.indexOf('function legendMetrics(entries=legendEntries()){');
 const end=app.indexOf('\nfunction legendBox(spec)',start);
 assert.ok(start>=0&&end>start);
 const maker=new Function('state','isNationwide','counts','predictionUsesVoteDisplay',
  'predictionUsesGradient','predictionMarginMode','currentItems','predictionMapResult',
  'predictionDisplayResult','predictionDistrictFor','regionResult','mayorLegendUnit','identityPanelsActive',
  'const noTownshipElection=()=>false;'+app.slice(start,end)+';return legendMetrics');
 const features=Array.from({length:12},(_,i)=>({id:'region-'+i,townId:'town-'+i}));
 const state={county:'',legend:{fontSize:12,caption:'之前的冗长说明'},fillMode:'prediction',predictionOffice:'mayor'};
 const root=workspace.indexOf('function mayorLegendUnit(){');
 const stop=workspace.indexOf('\nfunction countyMayorCandidateLegendEntries(){',root);
 assert.ok(root>=0&&stop>root);
 let townMode=false;
 const mayorUnit=new Function('state','localPredictionActive',
  workspace.slice(root,stop)+';return mayorLegendUnit')(state,()=>townMode);
 const metric=maker(state,()=>false,()=>({}),()=>true,()=>true,()=>true,
  ()=>features,()=>({status:'winner'}),()=>null,()=>null,()=>({status:'winner'}),mayorUnit,()=>false);
 const legend=metric([{id:'a',name:'候选人甲',legendSuffix:'（3县市）',color:'#008000'}]);
 assert.deepEqual(legend.captionLines,['总共12县市']);
 assert.equal(legend.rows.length,1,'Candidate legend row must be preserved');
 assert.equal(legend.showGradientHint,false,'Do not show redundant leading-margin footer');
 assert.equal(legend.footerHeight,0);
 features.push({id:'other',townId:'town-0'});
 assert.deepEqual(metric([]).captionLines,['总共12县市'],'Repeated electoral unit must not inflate total');
 townMode=true;
 assert.deepEqual(metric([]).captionLines,['总共12乡镇市区'],'Nationwide township unit');
 state.county='台北市';
 assert.deepEqual(metric([]).captionLines,['总共12区'],'Municipality district unit');
 state.county='嘉义市';
 assert.deepEqual(metric([]).captionLines,['总共12区'],'Provincial city district unit');
 state.county='彰化县';
 assert.deepEqual(metric([]).captionLines,['总共12乡镇市'],'County township unit');
 townMode=false;
 assert.deepEqual(metric([]).captionLines,['总共12县市'],'County mayor map shows county units');
 state.predictionOffice='council';
 assert.deepEqual(metric([]).captionLines,['总共12个选区'],'Councillor legend remains unchanged');
 state.fillMode='gradient';
 const manual=metric([]);
 assert.deepEqual(manual.captionLines,['之前的冗长说明'],'Free-map captions must remain untouched');
 assert.equal(manual.showGradientHint,true,'Free-map gradient note must remain');
 assert.match(app,/if\(m\.showGradientHint\)\{const t=svgEl\('text'/);
 assert.match(app,/data-margin-band/,'Leading-margin color keys must remain');
});
test('Fixed reference-style margin classes use narrow competitive ranges',()=>{
 const c=require('./election-core.js');
 const ranges=[0,.9,1,1.001,5,5.001,10,10.001,15,15.001,20,20.001,25,25.001,29.99,30,30.001,60,100];
 const expected=[0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,7,7];
 assert.deepEqual(ranges.map(v=>c.marginBandIndex(v)),expected);
 assert.deepEqual(c.marginBandLabels,['≤1','5','10','15','20','25','<30','≥30']);
 const colors=['#3664A8','#178565','#E2BF38','#B1445D','#777777'];
 for(const color of colors){
  const bandColors=[0,3,8,13,18,23,27,30].map(v=>c.marginShade(color,v));
  assert.equal(new Set(bandColors).size,8,'Every margin band must be visually distinct');
  assert.equal(c.marginShade(color,30),c.marginShade(color,99));
  assert.equal(c.marginShade(color,0),c.marginShade(color,1));
  assert.equal(c.marginShade(color,3),c.marginShade(color,5));
  const lum=hex=>{const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]};
  for(let i=1;i<bandColors.length;i++)assert.ok(lum(bandColors[i])<lum(bandColors[i-1]),'More margin must produce darker color');
 }
});
test('Margin map and legend share fixed 30-point bins while candidate rates retain percentage shading',()=>{
 assert.match(workspace,/if\(predictionMarginMode\(\)\)return\{min:0,max:30\}/);
 assert.match(town,/if\(predictionMarginMode\(\)\)return\{min:0,max:30\}/);
 assert.match(workspace,/ElectionCore\.marginShade\(p\.color,lead\.marginShare\?\?0\)/);
 assert.match(town,/ElectionCore\.marginShade\(p\.color,r\.marginShare\?\?0\)/);
 assert.match(app,/ElectionCore\.marginShade\(row\.p\.color,samples\[i\]\)/);
 assert.match(app,/const samples=\[0,3,8,13,18,23,27,30\],labels=ElectionCore\.marginBandLabels/);
 assert.match(app,/data-margin-band/);
 assert.match(workspace,/predictionUsesGradient\(\)&&!predictionMarginMode\(\)/);
 assert.match(app,/const samples=\[0,3,8,13,18,23,27,30\]/);
 assert.match(workspace,/result&&predictionMarginMode\(\)\?\{\.\.\.result,value:result\.marginShare\?\?0\}:result/);
 assert.match(workspace,/predictionMarginMode\(\)\?'百分点'/);
 assert.match(app,/metricText\(n\)\{if\(state\.fillMode==='prediction'\)return predictionMarginMode\(\)/);
 assert.match(workspace,/第一名减第二名，按1、5、10、15、20、25、30以上分档/);
 assert.match(town,/按1、5、10、15、20、25、30以上分档/);
 assert.match(read('prediction-ui.js'),/predictionMarginLabel\(r\)/);
 assert.match(town,/predictionMarginLabel\(r\)/);
 assert.match(workspace,/ElectionCore\.shade\(p\.color,lead\.value,domain\.min,domain\.max\)/);
 assert.match(town,/ElectionCore\.shade\(p\.color,r\.value,predictionDomain\(\)\.min,predictionDomain\(\)\.max\)/);
});


test('SVG party emblems have identical circular clipping in legend and export',()=>{
 const start=app.indexOf('function svgEl(tag,attrs){'),end=app.indexOf('function bounds(',start);
 assert.ok(start>=0&&end>start,'SVG logo helper must be found');
 const node=tag=>({tag,attributes:{},children:[],setAttribute(k,v){this.attributes[k]=String(v)},append(...items){this.children.push(...items)}});
 const document={createElementNS:(_ns,tag)=>node(tag)};
 const logo=new Function('document','NS',app.slice(start,end)+';return appendCircularPartyLogo')(document,'http://www.w3.org/2000/svg');
 const g=node('g'),first=logo(g,'data:image/png;base64,YWJj',10,15,22,{'data-party-logo':'blue'});
 assert.equal(g.children.length,2);
 assert.equal(g.children[0].tag,'defs');
 assert.equal(g.children[0].children[0].tag,'clipPath');
 const circle=g.children[0].children[0].children[0];
 assert.equal(circle.tag,'circle');
 assert.equal(circle.attributes.cx,'21');assert.equal(circle.attributes.cy,'26');assert.equal(circle.attributes.r,'11');
 assert.equal(first.tag,'image');assert.equal(first.attributes.width,'22');assert.equal(first.attributes.height,'22');
 assert.equal(first.attributes.preserveAspectRatio,'xMidYMid slice');
 assert.equal(first.attributes['data-party-logo'],'blue');
 assert.equal(first.attributes['clip-path'],'url(#'+g.children[0].children[0].attributes.id+')');
 const second=logo(g,'data:image/png;base64,ZGVm',25,26,22,{'data-party-logo':'green'});
 assert.notEqual(first.attributes['clip-path'],second.attributes['clip-path'],'Clipping IDs must be unique');
 assert.match(app,/appendCircularPartyLogo\(g,emblem,x\+36,rowY,m\.font\*1\.6/);
 assert.match(app,/appendCircularPartyLogo\(group,row\.logo,xs\[4\]\+15,rowY\+height\/2-8,16/);
});
test('Uploaded party logos crop to a transparent circular 128px PNG',async()=>{
 const start=app.indexOf('async function readLogo(file){'),end=app.indexOf('function renderCustomLogo()',start);
 assert.ok(start>=0&&end>start,'Party-logo upload function must be found');
 const calls=[];
 const canvas={width:0,height:0,getContext:()=>({
  clearRect:(...a)=>calls.push(['clear',...a]),
  beginPath:()=>calls.push(['begin']),arc:(...a)=>calls.push(['arc',...a]),
  closePath:()=>calls.push(['close']),clip:()=>calls.push(['clip']),
  drawImage:(...a)=>calls.push(['draw',...a])
 }),toDataURL:kind=>{calls.push(['export',kind]);return'data:image/png;base64,YWJj'}};
 const document={createElement:tag=>{assert.equal(tag,'canvas');return canvas}};
 class MockImage{naturalWidth=300;naturalHeight=150;set src(value){this.source=value;this.onload()}}
 const url={createObjectURL:()=> 'blob:party-logo',revokeObjectURL:value=>calls.push(['revoke',value])};
 const reader=new Function('document','Image','URL','cleanLogo',app.slice(start,end)+';return readLogo')(
  document,MockImage,url,value=>value);
 const output=await reader({size:1000,type:'image/png'});
 assert.equal(output,'data:image/png;base64,YWJj');
 assert.equal(canvas.width,128);assert.equal(canvas.height,128);
 assert.deepEqual(calls.find(a=>a[0]==='arc'),['arc',64,64,64,0,Math.PI*2]);
 assert.ok(calls.findIndex(a=>a[0]==='clip')<calls.findIndex(a=>a[0]==='draw'));
 const paint=calls.find(a=>a[0]==='draw');
 assert.ok(paint[2]<0,'Wide images must crop off both sides instead of letterboxing');
 assert.ok(Math.abs(paint[4]-256)<.001,'Image must fill the circle diameter');
 assert.deepEqual(calls.at(-1),['revoke','blob:party-logo']);
 await assert.rejects(reader({size:3*1024*1024,type:'image/png'}),/2 MB/);
});
test('Existing party logos are displayed as circles in every HTML view',()=>{
 const css=read('style.css');
 assert.match(css,/\.party-logo\{[^}]*object-fit:cover;[^}]*border-radius:50%/);
 assert.match(css,/\.custom-logo-preview img\{[^}]*object-fit:cover;[^}]*border-radius:50%/);
 assert.match(css,/\.legend-logo-edit img\{[^}]*object-fit:cover;[^}]*border-radius:50%/);
 assert.match(css,/\.candidate-party img\{[^}]*object-fit:cover;[^}]*border-radius:50%/);
 assert.match(css,/\.party-brush-logo \.party-logo\{[^}]*border-radius:50%/);
 assert.match(index,/上传后自动裁剪为圆形/);
 assert.match(app,/p\.logo=await readLogo\(file\.files\[0\]\)/);
 assert.match(app,/customLogo=await readLogo\(e\.target\.files\[0\]\)/);
});
test('Electoral districts display their own numbers without numeric lookup entries; administrative areas use overflow numbering',()=>{
 const src=app.slice(app.indexOf('let mapNumberRows=[]'),app.indexOf('\nfunction activeInsetDefinitions(){'));
 assert.ok(src.includes('function districtMapNumber('));
 assert.match(src,/data-label-leader/);
 const state={level:'council',county:'台北市',labels:true,legend:{show:false}};
 const data={counties:[]};
 const el=(tag,attrs)=>({tag,attrs:attrs||{},style:{},children:[],setAttribute(key,v){this.attrs[key]=v},append(...items){this.children.push(...items)}});
 const $=()=>null;
 const logic=new Function('state','data','featureElectorate','shownLabel','regionContains','leaderOverlap',
  'contentArea','sceneSpec','legendBox','svgEl','paint','$','identityPanelsActive','view','leaderFrames',
  src+';return {labelLayout,drawLabels,mapNumberDisplayName,getRows:()=>mapNumberRows,resetRows:()=>{mapNumberRows=[]}}')(
  state,data,()=> 'regional',f=>f.name,()=>true,(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1],
  ()=>({left:0,right:1200,top:0,bottom:700}),()=>({height:900}),()=>({}),el,()=>{},$,()=>false,{},()=>[]);
 const fifth={id:'c5',name:'第5选区',number:5,county:'台北市',box:[0,0,100,100],center:[50,50]};
 const eighth={id:'c8',name:'第8选区',number:'第8選舉區',county:'台北市',box:[120,0,220,100],center:[170,50]};
 const g={children:[],replaceChildren(){this.children=[]},append(node){this.children.push(node)}};
 logic.drawLabels(g,[fifth,eighth],{scale:1,tx:0,ty:0,area:{left:0,right:1200,top:0,bottom:700}},14);
 const districts=Object.fromEntries(g.children.flatMap(n=>n.children.filter(child=>child.attrs?.['data-label']).map(child=>[child.attrs['data-label'],child])));
 assert.equal(districts.c5.textContent,'5');
 assert.equal(districts.c8.textContent,'8');
 assert.equal(districts.c5.attrs['data-number-key'],undefined);
 assert.equal(districts.c8.attrs['data-placement'],'district-number');
 assert.deepEqual(logic.getRows(),[]);
 state.level='legislative';
 assert.equal(logic.labelLayout([{...fifth,id:'l2',number:2,name:'第2选举区'}],{scale:1,tx:0,ty:0,area:{left:0,right:1200,top:0,bottom:700}},14)[0].text,'2');
 assert.deepEqual(logic.getRows(),[]);
 state.level='towns';logic.resetRows();
 const county={id:'county',name:'基隆市',county:'基隆市',box:[0,0,100,100],center:[50,50]};
 const narrowA={id:'tiny-a',name:'狭小区域甲',county:'台北市',box:[0,0,26,27],center:[13,13]};
 const narrowB={id:'tiny-b',name:'狭小区域乙',county:'台北市',box:[35,0,61,27],center:[48,13]};
 logic.drawLabels(g,[county,narrowA,narrowB],{scale:1,tx:0,ty:0,area:{left:0,right:1200,top:0,bottom:700}},14);
 const admins=Object.fromEntries(g.children.flatMap(n=>n.children.filter(child=>child.attrs?.['data-label']).map(child=>[child.attrs['data-label'],child])));
 assert.equal(admins.county.textContent,'基隆市');
 assert.equal(admins.county.attrs['data-number-key'],undefined);
 assert.equal(admins['tiny-a'].textContent,'1');
 assert.equal(admins['tiny-b'].textContent,'2');
 assert.deepEqual(logic.getRows().map(row=>[row.number,row.name]),[['1','狭小区域甲'],['2','狭小区域乙']]);
 assert.equal(logic.mapNumberDisplayName({name:'基隆市',group:'基隆市'},[{name:'基隆市',group:'基隆市'}]),'基隆市');
 assert.equal(logic.mapNumberDisplayName({name:'中正区',group:'台北市'},[
  {name:'中正区',group:'台北市'},{name:'中正区',group:'基隆市'}]),'台北市 · 中正区');
 state.level='counties';logic.resetRows();
 const island={id:'penghu',name:'澎湖县',county:'澎湖县',box:[20,435,110,565],center:[65,500]};
 const islandLabel=logic.labelLayout([island],{scale:1,tx:0,ty:0,area:{left:0,right:1200,top:0,bottom:700}},14)[0];
 assert.equal(islandLabel.text,'澎湖县');
 assert.equal(islandLabel.numeric,false);
 assert.ok(islandLabel.y>=island.box[1]&&islandLabel.y<=island.box[3]);
});
test('Export recovers every label omitted by collision-free main map placement, including districts',()=>{
 const src=app.slice(app.indexOf('let mapNumberRows=[]'),app.indexOf('\nfunction activeInsetDefinitions(){'));
 const state={level:'towns',county:'高雄市',labels:true,legend:{show:false}};
 const svgEl=(tag,attrs)=>({tag,attrs:attrs||{},style:{},textContent:'',children:[],setAttribute(k,v){this.attrs[k]=v},append(...x){this.children.push(...x)},replaceChildren(){this.children=[]}});
 const overlap=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
 const logic=new Function('state','data','featureElectorate','shownLabel','regionContains','leaderOverlap',
  'contentArea','sceneSpec','legendBox','svgEl','paint','$','identityPanelsActive','view','leaderFrames',src+';return {labelLayout,drawLabels}')(
   state,{counties:[]},()=> 'regional',f=>f.name,()=>true,overlap,
   ()=>({left:0,right:1200,top:0,bottom:800}),()=>({height:950}),()=>({}),svgEl,()=>{},()=>null,()=>false,{},()=>[]);
 const items=[
  {id:'named',name:'凤山区',county:'高雄市',box:[100,100,180,180],center:[140,140]},
  {id:'small',name:'前金区',county:'高雄市',box:[200,100,226,128],center:[213,114]},
  {id:'crowded',name:'苓雅区',county:'高雄市',box:[200,100,226,128],center:[213,114]},
  {id:'very-tiny',name:'盐埕区',county:'高雄市',box:[250,100,257,107],center:[253,103]}
 ];
 const labels=logic.labelLayout(items,{scale:1,tx:0,ty:0,area:{left:0,right:1200,top:0,bottom:800}},15);
 const rectangles=labels.map(l=>({
  id:l.f.id,rect:[l.x-l.font*(l.text.length*.95)/2-4.5,l.y-l.font*.825-2.5,l.x+l.font*(l.text.length*.95)/2+4.5,l.y+l.font*.825+2.5]
 }));
 for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++)
  assert.ok(!overlap(rectangles[i].rect,rectangles[j].rect),'Labels overlap');
 assert.ok(labels.find(l=>l.f.id==='very-tiny')?.leaderAnchor,'Tiny polygons use checked external numbers');
 const code=app.slice(app.indexOf('// Every administrative area or electoral district must be identified'),app.indexOf('function exportSvg(){'));
 const wrapper=new Function('state','featureElectorate','districtMapNumber','wrapExportText','svgEl','exportNumberRows',
  code+';return {exportLabelCoverage,appendExportLabelCoverage,exportLabelCoverageLayout}');
 const coverage=wrapper(state,()=> 'regional',f=>String(f.number??''),value=>[String(value)],svgEl,[]);
 const map={querySelectorAll:()=>labels.map(l=>({getAttribute:()=>l.f.id,hasAttribute:()=>l.numeric}))};
 const rows=coverage.exportLabelCoverage(items,map);
 assert.ok(rows.some(r=>r.id==='very-tiny'&&r.value==='盐埕区'));
 assert.ok(rows.some(r=>r.id==='crowded')||rows.some(r=>r.id==='small'));
 const panel=svgEl('g');
 assert.ok(coverage.appendExportLabelCoverage(panel,rows,40,80,1100)>60);
 assert.equal(panel.children[0].attrs['data-export-label-coverage'],'true');
 state.level='council';
 const districts=[{id:'d5',county:'高雄市',name:'第5选区',number:5},{id:'d6',county:'高雄市',name:'第6选区',number:6}];
 const missing=coverage.exportLabelCoverage(districts,{querySelectorAll:()=>[
  {getAttribute:()=> 'd5',hasAttribute:()=>false}
 ]});
 assert.equal(missing.length,1);
 assert.equal(missing[0].value,'第6选区');
 assert.match(app,/oldLabels=state\.labels/);
 assert.match(app,/state\.labels=true;render\(\);try\{return exportSvg\(\)\}/);
});

test('Automatic export detail maps show each possible label without overlaps and retain coverage for unplaceable areas',()=>{
 const code=app.slice(app.indexOf('// Every administrative area or electoral district must be identified'),app.indexOf('function exportSvg(){'));
 const svgEl=(tag,attrs)=>({tag,attrs:attrs||{},textContent:'',children:[],append(...items){this.children.push(...items)}}),
  state={level:'council'};
 const bounds=items=>[
  Math.min(...items.map(f=>f.box[0])),Math.min(...items.map(f=>f.box[1])),
  Math.max(...items.map(f=>f.box[2])),Math.max(...items.map(f=>f.box[3]))
 ];
 const maker=new Function('state','svgEl','bounds','transformOf','fillColor','mapAdaptiveLabel',
  'featureElectorate','districtMapNumber','wrapExportText','exportNumberRows',code+
  ';return {appendExportDetailInsets,exportLabelCoverage}');
 const supported=maker(state,svgEl,bounds,t=>'translate('+t.tx+' '+t.ty+') scale('+t.scale+')',
  ()=>'#a0c5b0',(f,t,value,font,used)=>{
   if(f.id==='no-room')return null;
   const x=(f.box[0]+f.box[2])/2*t.scale+t.tx,y=(f.box[1]+f.box[3])/2*t.scale+t.ty;
   return{x,y,font,rect:[x-12,y-12,x+12,y+12]};
  },()=>'regional',f=>String(f.number||''),value=>[String(value)],[]);
 const features=[
  {id:'a',county:'高雄市',name:'第1选区',number:1,box:[0,0,10,10],d:'M0,0H10V10H0Z'},
  {id:'no-room',county:'高雄市',name:'第2选区',number:2,box:[20,0,30,10],d:'M20,0H30V10H20Z'}
 ];
 const drawing=svgEl('g'),result=supported.appendExportDetailInsets(drawing,features,features.map(f=>f.id),100,1100);
 assert.ok(result.height>300);
 assert.ok(result.labelled.has('a'));
 assert.equal(result.labelled.has('no-room'),false);
 assert.equal(drawing.children[0].attrs['data-export-detail-maps'],'true');
 const lookup=supported.exportLabelCoverage(features,{querySelectorAll:()=>[]},result.labelled);
 assert.deepEqual(lookup.map(r=>r.id),['no-room']);
 assert.doesNotMatch(app,/appendExportDetailInsets\(root,originalItems,zoomTargets,detailY,contentWidth\)/);
 assert.match(app,/layout:'compact'/);
 assert.match(app,/exportLabelCoverage\(originalItems,map,details\.labelled\)/);
});

test('Export images keep table titles and all data, without subtitles, counts or notes',()=>{
 const section=(start,end)=>{
  const first=app.indexOf(start),last=app.indexOf(end,first);
  assert.ok(first>=0&&last>first,start+' must exist');
  return app.slice(first,last);
 };
 const twoUp=section('function appendExportPolishedWinnerTable(', 'function appendExportPredictionTable(');
 const standard=section('function appendExportPredictionTable(', 'function numberTableExportMetrics(');
 const numberKey=section('function appendNumberTableExport(', '// Every administrative area');
 const coverage=section('function appendExportLabelCoverage(', 'function exportSvg(){');
 assert.match(twoUp,/heading\.textContent=layout\.specified/);
 assert.match(twoUp,/data-export-winner-row/);
 assert.doesNotMatch(twoUp,/已预测|选区 · 候选人 · 政党及党徽/);
 assert.match(standard,/预测得票候选人/);
 assert.match(standard,/layout\.headers\.forEach/);
 assert.doesNotMatch(standard,/第一高票不等于|已预测/);
 assert.match(numberKey,/行政区索引/);
 assert.doesNotMatch(numberKey,/count\.textContent|项';panel\.append/);
 assert.match(coverage,/密集区域完整标注/);
 assert.doesNotMatch(coverage,/count\.textContent|note\.textContent|主地图空间不足/);
 assert.match(app,/const headingHeight=62,tableHeaderHeight=44/);
 assert.match(app,/let rowY=y\+49/);
});

test('Township winner table export uses the full township-district title',()=>{
 const twoUp=app.slice(app.indexOf('function appendExportPolishedWinnerTable('),app.indexOf('function appendExportPredictionTable('));
 const standard=app.slice(app.indexOf('function appendExportPredictionTable('),app.indexOf('function numberTableExportMetrics('));
 for(const renderer of [twoUp,standard]){
  assert.match(renderer,/乡镇市区预测胜出候选人/);
  assert.doesNotMatch(renderer,/['"]乡镇预测胜出候选人['"]/);
 }
});

test('Specified-candidate export selects one ID and only includes entered vote metrics',()=>{
 const collector=app.slice(app.indexOf('function exportPredictionWinnerRows(){'),app.indexOf('function exportTextWidth('));
 assert.match(collector,/candidateMode=state\.predictionDisplay==='candidateVote'/);
 assert.match(collector,/c\.id!==selectedCandidateId/);
 assert.match(collector,/if\(c\.id!==selectedCandidateId\|\|\(!hasVotes&&!hasShare\)\)continue/);
 assert.match(collector,/share:candidateMode\?\(hasShare\?/);
 const layout=app.slice(app.indexOf('function exportPredictionTableLayout('),app.indexOf('function appendExportPolishedWinnerTable('));
 assert.match(layout,/metricFields=estimated\?\(specified\?/);
 assert.match(layout,/\['votes','share'\]\.filter/);
 assert.match(layout,/headers\.push\(\.\.\.metricFields\.map/);
 assert.match(app,/heading\.textContent=layout\.specified\?'指定候选人得票预测'/);
});

test('Administrative lookup is outside canvas and exports every entry',()=>{
 assert.match(index,/id="mapWithKey"/);
 assert.match(index,/id="mapNumberKey"/);
 assert.match(index,/id="mapNumberKeyRows"/);
 assert.match(index,/app\.js\?v=[\w-]+/);
 assert.match(index,/style\.css\?v=[\w-]+/);
 const canvasStart=index.indexOf('<div class="canvas" id="canvas">');
 const key=index.indexOf('<aside class="map-number-key"',canvasStart);
 const end=index.indexOf('</aside></div></div>',key);
 assert.ok(canvasStart>=0&&key>canvasStart&&end>key,
  'Map index is inside the canvas in reserved empty space');
 const css=read('style.css');
 assert.match(css,/#mapWithKey>\.canvas>\.map-number-key\{/);
 assert.match(app,/const anchorX=Math\.max\(railStartX,endX-baseWidth\/baseScale\)/);
 assert.match(app,/panel\.style\.setProperty\('--index-font-size',textSize\.toFixed\(2\)\+'px'\)/);
 assert.match(app,/panel\.style\.transform='none'/);
 assert.match(app,/const ratio=zoomScale\/baseScale/);
 assert.match(app,/world=view\|\|fittedView\(\)/);
 assert.match(app,/function mapNumberDisplayName\(/);
 const table=app.slice(app.indexOf('function renderMapNumberTable(){'),app.indexOf('\nfunction mapLabelCandidatePoints('));
 assert.doesNotMatch(table,/number-key-group|th\.colSpan/);
 assert.ok(table.includes("state.labels?mapNumberSorted(mapNumberRows):[]"));
 assert.match(app,/appendNumberTableExport\(root,keyRows,lx,ly,keyColumns\)/);
 assert.match(app,/data-export-legend-below-key/);
 assert.match(app,/actualWidth=coreWidth/);
 assert.match(app,/appendExportPredictionTable\(root,winnerRows,tableY\)/);
 assert.match(app,/if\(state\.labels&&view\)/);
 assert.match(read('workspace-ui.js'),/The main renderer now synchronizes region numbers and their adjacent table/);
});


test('Map fetch retries bypass corrupt caches and report persistent network errors',async()=>{
 const start=app.indexOf('async function fetchMapJson(url,label,attempts=3){');
 const end=app.indexOf('// Load only the map layers',start);
 assert.ok(start>=0&&end>start);
 const calls=[],paused=[];
 const responses=[
  ()=>Promise.reject(Error('connection lost')),
  ()=>Promise.resolve({ok:true,json:()=>Promise.reject(Error('bad JSON'))}),
  ()=>Promise.resolve({ok:true,json:()=>Promise.resolve({counties:[1,2,3]})})
 ];
 const fetch=(url,options)=>{calls.push({url,cache:options.cache});return responses[calls.length-1]()};
 const loader=new Function('fetch','setTimeout','console',app.slice(start,end)+';return fetchMapJson')(
  fetch,callback=>{paused.push(true);callback()},{warn(){}});
 assert.deepEqual(await loader('assets/map-base.json?v=1','基础地图'),{counties:[1,2,3]});
 assert.equal(calls.length,3);
 assert.equal(calls[0].cache,'default');
 assert.equal(calls[1].cache,'reload');
 assert.match(calls[1].url,/&retry=/);
 assert.match(calls[2].url,/&retry=/);
 assert.equal(paused.length,2);
 let attempts=0;
 const fail=new Function('fetch','setTimeout','console',app.slice(start,end)+';return fetchMapJson')(
  async()=>{attempts++;return{ok:false,status:503}},callback=>callback(),{warn(){}});
 await assert.rejects(fail('assets/map-base.json?v=1','基础地图'),/基础地图载入失败（已重试3次）：HTTP 503/);
 assert.equal(attempts,3);
});
test('Map recovery retries without reloading the page or clearing user prediction state',async()=>{
 assert.match(index,/id="retryMapLoad"/);
 assert.match(index,/id="loadErrorMessage"/);
 assert.doesNotMatch(index,/onclick="location\.reload\(\)"/);
 const start=app.indexOf('let mapPromise,mapLoadSequence=0;');
 const end=app.indexOf('\nfor(const p of PARTY_PRESETS)',start);
 assert.ok(start>=0&&end>start);
 const nodes=Object.fromEntries(['loadError','loadErrorMessage','progress','retryMapLoad','county'].map(k=>[k,{
  hidden:true,textContent:'',children:[],append(child){this.children.push(child)}
 }]));
 const lookup=id=>nodes[id]||null;
 const valid=()=>({counties:Array.from({length:22},(_,i)=>({name:'县市'+i})),towns:[],legislative:[]});
 let downloads=0,renders=0;
 const state={county:'',fillMode:'solid'};
 const boot=new Function('$','fetchMapJson','document','state','data','COUNTY_ORDER','syncInputs','render','console',
  app.slice(start,end)+';return {retry:()=>$("retryMapLoad").onclick(),value:()=>data,promise:()=>mapPromise}')(
  lookup,async()=>{downloads++;return valid()},{createElement:()=>({})},state,null,[],()=>{},()=>{renders++},{error(){}});
 await boot.promise();await Promise.resolve();
 assert.equal(nodes.loadError.hidden,true);
 assert.equal(renders,1);
 assert.equal(boot.value().counties.length,22);
 boot.retry();
 assert.equal(renders,2);
 assert.equal(downloads,1);
 assert.equal(state.county,'');
 assert.match(app,/地图渲染出现问题/);
 assert.match(app,/地图资料载入失败/);
});
test('Missing election results never crash gradient map legends',()=>{
 const mapStart=town.indexOf('function predictionMapResult(f){');
 const mapEnd=town.indexOf('\nfunction localDisplayOptions()',mapStart);
 assert.ok(mapStart>=0&&mapEnd>mapStart);
 const makeResult=(isLocal,localResult,displayResult)=>new Function('localPredictionActive','localMapResult','predictionDisplayResult','predictionDistrictFor',
  town.slice(mapStart,mapEnd)+';return predictionMapResult')(()=>isLocal,()=>localResult,()=>displayResult,()=>null);
 const region={id:'not-yet-predicted'};
 assert.equal(makeResult(false,null,null)(region).status,'missing');
 assert.equal(makeResult(true,null,null)(region).status,'missing');
 assert.equal(makeResult(false,null,{status:'winner'})(region).status,'winner');
 const start=app.indexOf('function legendMetrics('),end=app.indexOf('\nfunction legendBox(',start);
 assert.ok(start>=0&&end>start);
 const legendCode='const noTownshipElection=()=>false;'+app.slice(start,end)+';return legendMetrics';
 const legend=new Function('state','isNationwide','currentItems','predictionUsesGradient','predictionMapResult',
  'legendEntries','predictionUsesVoteDisplay','predictionLegendCountUnit','counts','mayorLegendUnit','identityPanelsActive',legendCode)(
   {fillMode:'prediction',predictionOffice:'mayor',predictionDisplay:'topVote',legendTitle:'图例',gradient:{metric:'share'},legend:{fontSize:12,caption:''}},
   ()=>true,()=>[{id:'county-with-no-votes'}],()=>true,()=>null,()=>[],()=>true,()=> '区',()=>({}),()=> '区',()=>false);
 const metrics=legend();
 assert.equal(metrics.gradient,true);
 assert.equal(metrics.missing,true);
 assert.equal(metrics.tie,false);
 assert.ok(metrics.height>0);
});
test('Lazy geometry and council township script retry without clearing saved predictions',()=>{
 assert.match(app,/detailRequests\[name\]=fetchMapJson\(url,name\)/);
 assert.match(app,/fetchMapJson\('assets\/map-villages-'\+n/);
 assert.match(town,/for\(let attempt=0;attempt<3;attempt\+\+\)/);
 assert.match(town,/script\.src='town-areas\.js[^;]+retry=/);
 assert.match(town,/script\.onerror=\(\)=>\{script\.remove\(\)/);
 assert.match(read('style.css'),/#loadError\{position:absolute;left:50%;top:50%/);
});
function isolatedExportGuard(env){
 const start=app.indexOf('async function ensureExportMapReady(){');
 const end=app.indexOf('let mapPromise,mapLoadSequence=0;',start);
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
test('2022 history opens directly from its tab without a redundant sub-button',()=>{
 const categories=read('workspace-categories.js'),history=read('history-2022.js');
 for(const page of ['index.html','map-v60.html'])assert.doesNotMatch(read(page),/id="workspaceHistory"|id="historyModes"|2022 九合一<\/button>/);
 assert.match(categories,/history\.addEventListener\('click',[^\n]*History2022View\?\.activate\?\.\(\)/);
 assert.doesNotMatch(categories,/workspaceHistory|historyModes/);
 assert.doesNotMatch(history,/workspaceHistory/);
 assert.doesNotMatch(read('history-access.js'),/workspaceHistory/);
});

test('2022 history remains isolated from saved 2026 state',()=>{
 assert.doesNotMatch(index,/id="workspaceHistory"|id="historyModes"/);
 assert.match(history,/savedMapScope=clone\(state\)/);
 assert.match(history,/state=clone\(savedMapScope\)/);
 assert.match(history,/capture:true/);
 assert.match(history,/if\(!recordsInView\(\)\.length\)throw Error/);
});
test('Historical maps build independent 2022 geography and seat records',()=>{
 assert.match(history,/HistoryCore\.mergePaths/);
 assert.match(history,/history-hsinchu-geography-2022/);
 assert.match(history,/historicalFeatures=\s*districtMetadata\.map/);
 assert.doesNotMatch(history,/每个党徽代表一席实际当选席次/);
 assert.match(read('council-seats.js'),/data-history-seat-count':1/);
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


test('County and township map callouts use one readable font and never share a leader segment',()=>{
 const src=app.slice(app.indexOf('function leaderFrames('),app.indexOf('// Highlight the exact corresponding polygon'));
 const state={level:'towns',county:'测试县',workspaceMode:'prediction',fillMode:'prediction',predictionOffice:'township',predictionScale:'district',legend:{show:false}};
 const area={left:20,right:1180,top:20,bottom:860},t={scale:1,tx:0,ty:0,area};
 const regionContains=(f,x,y)=>x>=f.box[0]&&x<=f.box[2]&&y>=f.box[1]&&y<=f.box[3];
 const layout=new Function('state','data','activeInsetDefinitions','contentArea','sceneSpec','shownLabel',
  'regionContains','legendBox','featureElectorate','insetDefinitions',src+
  ';return {townNameLabelLayout,mapLeaderClear,countyMayorLabelLayout}')(
  state,{counties:[]},()=>[],()=>area,()=>({width:1200,height:900}),
  f=>f.name,regionContains,()=>null,()=> 'regional',()=>[]);
 const items=Array.from({length:12},(_,i)=>{
  const x=440+(i%3)*24,y=60+i*48;
  return{id:'t'+i,name:'乡镇测试'+i,box:[x,y,x+12,y+16],center:[x+6,y+8]};
 });
 const labels=layout.townNameLabelLayout(items,t,15,area,null);
 assert.equal(labels.length,items.length,'well-spaced tiny towns should all retain their names');
 assert.deepEqual([...new Set(labels.map(q=>q.font))],[15],'inside and outside names share one font');
 const leaders=labels.filter(q=>q.leaderPoints);
 for(const q of leaders){
  assert.match(q.leaderPath,/^M[-\d.,]+(?:H|V)/);
  assert.equal(q.leaderAnchor.x,(q.f.box[0]+q.f.box[2])/2);
  assert.equal(q.leaderAnchor.y,(q.f.box[1]+q.f.box[3])/2);
 }
 for(let i=0;i<leaders.length;i++)for(let j=0;j<i;j++)
  assert.ok(layout.mapLeaderClear(leaders[i].leaderPoints,[leaders[j].leaderPoints],[]),
   'callouts must not cross or share perimeter segments');
 assert.match(app,/const size=font;/,'offshore and mainland names use one font');
 assert.match(app,/const mapLeaderLayer=svgEl\('g',\{'data-map-leader-layer':'true'\}\)/);
 assert.match(app,/label.style.textAnchor='middle';/);
});

test('Both historical entry pages include the controls wired by history JavaScript',()=>{
 const ids=['historyParty','historySearch','historyPrev','historyNext','historyPage',
  'historyPager','historyCompare','historyCompareStatus','historyCompareRows','historyFromPrediction'];
 for(const name of ['index.html','map-v60.html']){
  const html=read(name);
  for(const id of ids)assert.equal(html.split('id="'+id+'"').length-1,1,name+': '+id);
 }
});

test('Unified historical workspace keeps the map and has two toggleable result detail views',()=>{
 const ids=['historyYear','historyOffice','historyElectorate','historyCounty','historyScale','historyMetric',
  'historyCandidate','historyParty','historyViewCandidates','historyViewOverview',
  'historyMapPanel','historyCandidatesPanel','historyOverviewPanel','historyLoadStatus','historyRetry','historyCoverage'];
 for(const id of ids)assert.equal(index.split('id="'+id+'"').length-1,1,id+' must be unique');
 for(const label of ['候选人结果','选举概况','县市议员','平地少数民族议员','山地少数民族议员'])assert.match(index,new RegExp(label));
 assert.doesNotMatch(index,/id="historyViewMap"|>结果地图<\/button>/);
 assert.match(index,/id="historyViewCandidates" aria-pressed="false"/);
 assert.match(index,/id="historyViewOverview" aria-pressed="false"/);
 assert.doesNotMatch(read('history-2022.js'),/回看2022选举结果|选一类选举，点击地图查看实际得票与当选结果|已载入 2022 年县市长/);
 assert.match(read('style.css'),/body\.history-mode \.intro > h1,body\.history-mode \.intro > p/);
 assert.match(read('history-workspace.js'),/setView\(state\.view===view\?'map':view\)/);
 assert.match(index,/history-workspace\.js\?v=[\w-]+/);
 const controls=index.slice(index.indexOf('id="historyControls"'),index.indexOf('id="mapSettings"'));
 assert.doesNotMatch(controls,/>议员<\/option>/);
 assert.doesNotMatch(index,/historyVoteUnitBox|id="historyVoteUnit"|得票显示单位/);
 assert.doesNotMatch(read('map-v60.html'),/historyVoteUnitBox|id="historyVoteUnit"|得票显示单位/);
 assert.doesNotMatch(read('history-workspace.js'),/historyVoteUnit/);
});

test('Historical detail tables omit visible provenance and 2022 district explanation without deleting data',()=>{
 for(const page of ['index.html','map-v60.html']){
  const markup=read(page);
  for(const id of ['districtReferenceNote','districtReferenceSource','districtTableGroups'])assert.equal(markup.split('id="'+id+'"').length-1,1,id+' needed for future map controls');
 }
 const history=read('history-2022.js');
 for(const phrase of ['此表使用2022年独立选区资料','中选务字第1113150255号公告及2022年选举结果','查看中选会2022选区划分公告'])assert.equal(history.includes(phrase),false,phrase);
 assert.match(history,/renderHistoryDistrictReference\(\)/);
 assert.doesNotMatch(read('history-workspace.js'),/资料来源：台湾地区选举事务主管机构公开资料。/);
 assert.match(read('history-workspace.js'),/条候选人记录。/);
 assert.match(read('style.css'),/body\.history-mode #districtReferenceNote,body\.history-mode #districtReferenceSource\{display:none!important\}/);
});

test('Historical actual-result dashboard exposes revised KPI labels, chart panels and responsive styling',()=>{
 const workspaceHistory=read('history-workspace.js'),css=read('style.css');
 const labels=['选举人数','投票人数','投票率','有效票','无效票','有效率','候选人数','当选人数'];
 for(const label of labels)assert.match(workspaceHistory,new RegExp("label:'"+label+"'"));
 for(const legacy of ["label:'候选人'","label:'官方当选'"])assert.doesNotMatch(workspaceHistory,new RegExp(legacy));
 for(const id of ['historyOverviewCharts','historyOverviewNote'])assert.equal(index.split('id="'+id+'"').length-1,1);
 assert.match(workspaceHistory,/function overviewCharts\(/);
 assert.match(workspaceHistory,/function renderOverviewCharts\(/);
 assert.match(css,/history-overview-charts--grouped/);
 assert.match(css,/@media\(max-width:720px\)/);
});

test('Historical exports use normalized metadata without entering saved prediction state',()=>{
 const historyWorkspace=read('history-workspace.js'),historyView=read('history-2022.js'),access=read('history-access.js');
 assert.match(app,/HistoryWorkspace\.exportStem\(HistoryWorkspace\.selection\(\)\)/);
 assert.match(historyWorkspace,/id='historyExportCsv'/);
 assert.match(historyWorkspace,/县市规范名称/);assert.match(historyWorkspace,/县市官方名称/);
 assert.match(historyWorkspace,/候选人规范姓名/);assert.match(historyWorkspace,/候选人官方姓名/);
 assert.match(historyView,/projectStateForSave=function\(\)\{return active&&savedMapScope\?savedMapScope:defaultSaveState\(\)\}/);
 assert.doesNotMatch(historyWorkspace,/localStorage\.setItem\([^,]+JSON\.stringify\(state/);
 assert.match(access,/开发中，敬请期待/);assert.match(access,/event\.preventDefault\(\);event\.stopImmediatePropagation\(\)/);
});

test('Historical councillor identity state stays aligned between the adapter and overview',()=>{
 const workspaceHistory=read('history-workspace.js');
 assert.match(workspaceHistory,/if\(state\.office==='council'\)\{/);
 assert.match(workspaceHistory,/else electorate\.value='regional'/);
 assert.match(workspaceHistory,/node\.dispatchEvent\(new Event\('change',\{bubbles:true\}\)\)/);
 assert.match(read('history-2022.js'),/el\('historyElectorate'\)\.onchange=\(\)=>\{electorate=el\('historyElectorate'\)\.value/);
});

test('Historical snapshot cache and exports carry schema and provenance metadata',()=>{
 const historyView=read('history-2022.js');
 assert.match(historyView,/assets\/history-2022\.json\?v=20261110-cec-complete-v1/);
 assert.match(historyView,/obj\.schemaVersion!==2/);
 assert.doesNotMatch(historyView,/officialWinnerCorrections/);
 assert.match(historyView,/exportMetadata/);assert.match(historyView,/行政区边界版本/);
 assert.doesNotMatch(app,/data-export-history-metadata|appendHistoryExportMetadata|History2022View\.exportMetadata/);
 assert.doesNotMatch(app,/if\(metadata\.length\)height\+=/);
});

test('Historical map legend has no subtitle and export images omit provenance panel',()=>{
 const history=read('history-2022.js'),app=read('app.js');
 assert.doesNotMatch(history,/caption\.textContent=voteMetric\(\)/);
 assert.doesNotMatch(history,/root\.append\(caption\)/);
 assert.match(history,/let rowY=y\+52/);
 assert.match(history,/y1:y\+43.*y2:y\+43/);
 assert.match(history,/return 71\+/);
 assert.doesNotMatch(app,/data-export-history-metadata/);
 assert.doesNotMatch(app,/appendHistoryExportMetadata/);
 for(const file of ['index.html','map-v60.html']){
  const html=read(file);
  assert.match(html,/history-2022\.js\?v=[\w-]+/);
  assert.match(html,file==='index.html'?/app\.js\?v=20261112-crisp-export-v1/:/app\.js\?v=20261112-crisp-export-v1/);
 }
});

test('2022 history has separate vote-share and vote-count gradients with full width',()=>{
 const history=read('history-2022.js'),workspace=read('history-workspace.js');
 assert.match(history,/ElectionCore\.shade\(color,value,range\.min,range\.max\)/);
 assert.match(history,/const bx=x\+18,bw=width-36/);
 assert.match(history,/for\(let step=0;step<=10;step\+\+\)/);
 assert.match(history,/'data-history-gradient-bar':party/);
 assert.match(history,/const stops=metric==='votes'\|\|metric==='seats'\?\[0,\.5,1\]:\[0,\.25,\.5,\.75,1\]/);
 assert.match(history,/'data-history-vote-tick'/);
 assert.match(history,/'data-history-rate-tick'/);
 assert.match(history,/metric==='votes'\?r\.top\?\.votes\|\|0:r\.share/);
 assert.match(history,/metric==='votes'\?region\.top\?\.votes\|\|0:region\.share/);
 assert.doesNotMatch(history,/referenceVotes|referenceExact|中位数换算|historyVoteUnit/);
 assert.match(history,/metrics\.push\(\['share','得票率'\],\['votes','得票数'\]\)/);
 assert.match(workspace,/new Set\(\['party','share','votes'\]\)/);
 assert.doesNotMatch(history,/const strength=\.28\+\.72/);
 assert.doesNotMatch(history,/i<40;i\+\+/);
 for(const page of ['index.html','map-v60.html']){
  const html=read(page);
  assert.match(html,/<option value="share">得票率<\/option><option value="votes">得票数<\/option>/);
 }
});

test('Historical data tools are removed and footer credits use separate lines',()=>{
 for(const name of ['index.html','map-v60.html']){
  const html=read(name);
  assert.doesNotMatch(html,/id="history(?:Browse|Load|Import|CsvExport|Files|Status)"/);
  assert.match(html,/数据来源：台湾地区选举事务主管机构公开选举资料、政治大学历届公职人员选举资料、Taiwan Votes（张进逸先生开发制作）。/);
  assert.ok(html.indexOf('class="footer-data-source"')<html.indexOf('class="footer-credits"'),'Data source precedes author credits');
  assert.match(html,/class="footer-credits">网页开发：Alex Wei<br>测试和推广：星夜长街/);
 }
});
