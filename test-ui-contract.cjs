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
 assert.match(app,/appendSharedBorders\(districtGroup,state.level/);
 assert.match(app,/appendSharedBorders\(borderGroup,'counties'\)/);
 assert.match(app,/appendSharedBorders\(group,'towns','regional',state.level==='villages'\)/);
 assert.match(app,/\['#regions path','none',0\]/);
 assert.doesNotMatch(app,/for\(const f of countyOutlines\)/);
 assert.match(read('style.css'),/#regions path,#regions path:hover/);
 assert.match(index,/app\.js\?v=20261031-scope-coastline-v49/);
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
 assert.match(town,/return options/);
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
 assert.match(read('workspace-ui.js'),/state\.gradient\.max=predictionMarginMode\(\)\?null:predictionUsesGradient\(\)\?100:null/);
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
 assert.match(workspace,/\['topVote','最高票者（得票数\/得票率）'\]/);
 assert.match(town,/\['topVote','最高票者（得票数\/得票率）'\]/);
 assert.match(read('prediction-ui.js'),/if\(predictionUsesVoteDisplay\(\)\)\{r\.winners=\[\]/);
 assert.match(town,/if\(state\.predictionDisplay!=='composition'\)draft\.leaderId=''/);
 assert.match(index,/id="localUseVoteData"/);
 assert.match(read('style.css'),/\.prediction-dialog\.numeric-entry \.prediction-table th:first-child/);
 assert.match(read('style.css'),/\.local-dialog\.numeric-entry \.local-table th:first-child/);
 assert.match(app,/predictionUsesVoteDisplay\(\)\|\|typeof predictionDistricts/);
 assert.match(workspace,/state\.predictionDisplay==='candidateVote'\|\|!result\.partial/);
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
 assert.match(index,/指定候选人（得票数\/得票率）/);
 assert.match(index,/最高票者（得票数\/得票率）/);
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
 assert.match(workspace,/if\(state\.county&&state\.predictionOffice==='mayor'\)return countyMayorCandidateLegendEntries\(\)/);
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
test('Nationwide mayor party legend counts use county or township units, not seats',()=>{
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
 assert.deepEqual(rows().map(r=>r.legendSuffix),['（8县市）','（4县市）']);
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
  'predictionDisplayResult','predictionDistrictFor','regionResult','mayorLegendUnit',
  app.slice(start,end)+';return legendMetrics');
 const features=Array.from({length:12},(_,i)=>({id:'region-'+i,townId:'town-'+i}));
 const state={county:'',legend:{fontSize:12,caption:'之前的冗长说明'},fillMode:'prediction',predictionOffice:'mayor'};
 const root=workspace.indexOf('function mayorLegendUnit(){');
 const stop=workspace.indexOf('\nfunction countyMayorCandidateLegendEntries(){',root);
 assert.ok(root>=0&&stop>root);
 let townMode=false;
 const mayorUnit=new Function('state','localPredictionActive',
  workspace.slice(root,stop)+';return mayorLegendUnit')(state,()=>townMode);
 const metric=maker(state,()=>false,()=>({}),()=>true,()=>true,()=>true,
  ()=>features,()=>({status:'winner'}),()=>null,()=>null,()=>({status:'winner'}),mayorUnit);
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
test('All region and district names use the same font and geographic center without leaders',()=>{
 const a=app.indexOf('const MAP_LABEL_FONT_SIZE=12;');
 const b=app.indexOf('\nfunction drawIdentityPanelLabels(',a);
 assert.ok(a>=0&&b>a);
 const source=app.slice(a,b);
 const features=[{id:'x',name:'短名称',box:[0,0,20,20],center:[10,10],labelAnchor:[5,5]},
  {id:'y',name:'更长的区域名称',box:[0,0,10,20],center:[5,10],labelAnchor:[2,3]}];
 const data={counties:features};
 const state={level:'counties',county:''};
 const el=(tag,attrs)=>({tag,attrs:attrs||{},children:[],style:{},append(...nodes){this.children.push(...nodes)}});
 const renderer=new Function('state','data','shownLabel','regionContains','svgEl','paint',source+';return {labelLayout,drawLabels}')(
  state,data,f=>f.name,(f,x,y)=>x>=f.box[0]&&x<=f.box[2]&&y>=f.box[1]&&y<=f.box[3],el,()=>{});
 const t={scale:1,tx:0,ty:0};
 const placements=renderer.labelLayout(features,t,99);
 assert.deepEqual(placements.map(p=>[p.x,p.y]),[[10,10],[5,10]]);
 assert.deepEqual(placements.map(p=>p.font),[99,99]);
 const group={children:[],replaceChildren(){this.children=[]},append(x){this.children.push(x)}};
 renderer.drawLabels(group,features,t,22,true);
 const labels=group.children.map(g=>g.children[0]);
 assert.deepEqual(labels.map(x=>x.attrs['font-size']),[12,12]);
 assert.deepEqual(labels.map(x=>[x.attrs.x,x.attrs.y]),[[10,10],[5,10]]);
 assert.deepEqual(labels.map(x=>x.attrs['data-placement']),['inside','inside']);
 assert.deepEqual(group.children.map(g=>g.children.map(x=>x.tag)),[['text'],['text']]);
 assert.equal(labels[1].children.length,2,'long text may wrap but never changes font');
 state.level='towns';renderer.drawLabels(group,[],t,30,false);
 assert.deepEqual(group.children.map(g=>g.children[0].attrs['font-size']),[12,12]);
 assert.deepEqual(group.children.map(g=>g.children[0].attrs.x),[10,5]);
 assert.doesNotMatch(source,/outside\.push|forcedOutside|Math\.min\(minFont|for\(let size=font/);
 assert.match(app,/drawLabels\(g,currentItems\(\),geometryLayout\(currentItems\(\),true\),sceneSpec\(\)\.font,false\)/);
});
test('Irregular regions fall back to their interior label anchor near the center',()=>{
 const start=app.indexOf('const MAP_LABEL_FONT_SIZE=12;');
 const end=app.indexOf('\nfunction drawIdentityPanelLabels(',start);
 const helpers=new Function('shownLabel','regionContains',app.slice(start,end)+';return {regionLabelCenter,labelLayout}')(
  f=>f.name,(f,x,y)=>x>=20&&x<=35&&y>=20&&y<=35);
 const f={id:'inlet',name:'不规则区',center:[15,15],labelAnchor:[28,28],box:[10,10,40,40]};
 assert.deepEqual(helpers.regionLabelCenter(f,{scale:1,tx:0,ty:0}),{x:28,y:28});
 assert.deepEqual(helpers.labelLayout([f],{scale:1,tx:0,ty:0}).map(x=>[x.x,x.y,x.font]),[[28,28,12]]);
});
test('Village labels also use the fixed font and geographic centers',()=>{
 const start=app.indexOf('function drawVillageLabels(group,items,t,v,interactive=false){');
 const end=app.indexOf('\nfunction moveParty(',start);
 assert.ok(start>=0&&end>start);
 const source=app.slice(start,end);
 assert.match(source,/const font=MAP_LABEL_FONT_SIZE/);
 assert.match(source,/const center=regionLabelCenter\(f,t\)/);
 assert.doesNotMatch(source,/v\.w\/pixelWidth\*\d+/);
 assert.match(source,/'font-size':font/);
 assert.match(index,/app\.js\?v=20261031-labels-centered-v52/);
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
 const legendCode=app.slice(start,end)+';return legendMetrics';
 const legend=new Function('state','isNationwide','currentItems','predictionUsesGradient','predictionMapResult',
  'legendEntries','predictionUsesVoteDisplay','predictionLegendCountUnit','counts','mayorLegendUnit',legendCode)(
   {fillMode:'prediction',predictionOffice:'mayor',predictionDisplay:'topVote',legendTitle:'图例',gradient:{metric:'share'},legend:{fontSize:12,caption:''}},
   ()=>true,()=>[{id:'county-with-no-votes'}],()=>true,()=>null,()=>[],()=>true,()=> '区',()=>({}),()=> '区');
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
