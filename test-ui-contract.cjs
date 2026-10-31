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
 const start=workspace.indexOf('function countyMayorCandidateLegendEntries(){');
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
 assert.equal(rows[0].legendSuffix,'（预测胜出）');
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
 assert.deepEqual(rows.map(r=>r.legendSuffix),['（2乡镇市区）','（1乡镇市区）','（1乡镇市区）']);
 state.legend.hidden=['party-a'];
 assert.deepEqual(build(true,[{county:'台北市',candidateId:'candidate-a'},
  {county:'台北市',candidateId:'candidate-c'}])().map(r=>r.name),['乙三'],
  'Hidden parties remain hidden even if colored on map');
 state.legend.hidden=[];
 state.predictions={'mayor:1':{winners:[]}};
 assert.deepEqual(build(false)(),[],'No painted candidate means no candidate rows');
 state.county='新北市';
 assert.deepEqual(build(false)(),[],'Candidates from other counties are not listed');
 assert.match(workspace,/const unit=townView\?'乡镇市区':''/);
 assert.match(town,/function predictionLegendCountUnit\(\)\{if\(localPredictionActive\(\)\)return'乡镇市区'/);
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
test('Prediction legend contains only the displayed election-district count',()=>{
 const start=app.indexOf('function legendMetrics(entries=legendEntries()){');
 const end=app.indexOf('\nfunction legendBox(spec)',start);
 assert.ok(start>=0&&end>start);
 const maker=new Function('state','isNationwide','counts','predictionUsesVoteDisplay',
  'predictionUsesGradient','predictionMarginMode','currentItems','predictionMapResult',
  'predictionDisplayResult','predictionDistrictFor','regionResult',
  app.slice(start,end)+';return legendMetrics');
 const features=Array.from({length:12},(_,i)=>({id:'region-'+i,townId:'town-'+i}));
 const state={legend:{fontSize:12,caption:'之前的冗长说明'},fillMode:'prediction',predictionOffice:'mayor'};
 const metric=maker(state,()=>false,()=>({}),()=>true,()=>true,()=>true,
  ()=>features,()=>({status:'winner'}),()=>null,()=>null,()=>null);
 const legend=metric([{id:'a',name:'候选人甲',legendSuffix:'（3乡镇市区）',color:'#008000'}]);
 assert.deepEqual(legend.captionLines,['总共12个选区']);
 assert.equal(legend.rows.length,1,'Candidate legend row must be preserved');
 assert.equal(legend.showGradientHint,false,'Do not show redundant leading-margin footer');
 assert.equal(legend.footerHeight,0);
 features.push({id:'other',townId:'town-0'});
 assert.deepEqual(metric([]).captionLines,['总共12个选区'],'Repeated election area must not inflate total');
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
 assert.match(app,/>=30 统一深色|≥30 统一深色/);
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
