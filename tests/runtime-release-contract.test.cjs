'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const read=p=>fs.readFileSync(p,'utf8');
const loader=require('../history-loader.js');
const unique=(values,label)=>assert.equal(new Set(values).size,values.length,label);
test('Entry pages and lazy-loaded JavaScript have unique IDs, existing assets and valid classic scripts',()=>{
 const scripts=new Set([...loader.HISTORY_SCRIPTS,...loader.TREND_SCRIPTS,loader.LEGISLATIVE_CANDIDATES]);
 for(const page of ['index.html','map-v60.html']){
  const html=read(page),markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<!--[\s\S]*?-->/g,'');
  unique([...markup.matchAll(/\sid\s*=\s*["']([^"']+)["']/g)].map(m=>m[1]),page+' duplicate IDs');
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   const src=/\bsrc=["']([^"']+)["']/.exec(m[1]);
   if(src){const path=src[1].split('?')[0];if(!/^https?:/.test(path))scripts.add(path)}
   else if(!/type=["'](?:application\/json|application\/ld\+json)["']/.test(m[1])&&m[2].trim())assert.doesNotThrow(()=>new vm.Script(m[2],{filename:page+' inline script'}),page);
  }
 }
 for(const name of scripts)assert.doesNotThrow(()=>new vm.Script(read(name),{filename:name}),name);
 unique(loader.HISTORY_SCRIPTS,'duplicate history scripts');
 unique(loader.TREND_SCRIPTS,'duplicate trend scripts');
 assert.ok(loader.HISTORY_SCRIPTS.indexOf('history-query-cache.js')>=0);
 for(const name of ['history-local.js','history-presidential.js','history-legislative.js'])assert.ok(loader.HISTORY_SCRIPTS.indexOf('history-query-cache.js')<loader.HISTORY_SCRIPTS.indexOf(name),name+' requires query cache');
 for(const name of loader.HISTORY_STYLES)assert.ok(fs.existsSync(name),name);
});
test('Every named Chromium browser test belongs to exactly one CI shard',()=>{
 const workflow=read('.github/workflows/checks.yml'),line=workflow.match(/^\s+pattern:\s*\[(.*)\]\s*$/m);assert.ok(line,'browser shard matrix missing');
 const patterns=[...line[1].matchAll(/'([^']+)'/g)].map(x=>new RegExp(x[1]));assert.ok(patterns.length>0);
 const source=read('tests/browser-smoke.mjs');
 const declarations=[...source.matchAll(/^\s*test\(/gm)];
 const names=[...source.matchAll(/^\s*test\((['"`])([^\n]+?)\1\s*,/gm)].map(m=>m[2]);
 assert.equal(names.length,declarations.length,'Every test needs a statically inspectable name');assert.ok(names.length>100);
 unique(names,'duplicate browser test names');
 for(const name of names)assert.equal(patterns.filter(p=>p.test(name)).length,1,'Uncovered or duplicate browser shard: '+name);
});

test('Every static dialog has an accessible heading; help and correction guide is discoverable without JavaScript',()=>{
 for(const page of ['index.html','map-v60.html']){
  const html=read(page).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const dialogs=[...html.matchAll(/<dialog\b([^>]*)>([\s\S]*?)<\/dialog>/gi)];
  assert.ok(dialogs.length>=8,page);
  for(const [,attrs,body] of dialogs){
   const name=attrs.match(/\baria-labelledby="([^"]+)"/)?.[1];
   assert.ok(name,page+' missing accessible dialog name: '+attrs);
   assert.ok([...body.matchAll(/<h[1-6]\b[^>]*\bid="([^"]+)"[^>]*>/g)].some(m=>m[1]===name),page+' heading not inside dialog: '+name);
  }
 }
 const html=read('index.html');
 const guide=html.match(/<details\b[^>]*\bid="siteGuide"[^>]*>([\s\S]*?)<\/details>/);
 assert.ok(guide,'missing guide');
 assert.match(guide[1],/<summary\b[^>]*>[\s\S]*使用指南与纠错/);
 for(const phrase of ['岛屿画布','岛屿图鉴','岛屿观测','JSON','缺档','问题反馈','不要上传私人预测方案'])assert.ok(guide[1].includes(phrase),phrase);
 assert.match(guide[1],/href="https:\/\/github\.com\/AlexWei2048\/taiwan-map-painter\/issues"/);
 assert.match(html,/<button\b[^>]*id="siteSearchOpen"[^>]*aria-keyshortcuts="Control\+K Meta\+K"/);
});


test('Map export rejects changed scope, changed plan and unfinished historical results',async()=>{
 const app=read('app.js'),start=app.indexOf('function exportContextKey(){'),end=app.indexOf('let mapPromise',start);
 assert.ok(start>=0&&end>start);
 const source=app.slice(start,end);
 function harness(){
  let resolve;const pending=new Promise(ok=>{resolve=ok});
  const context={state:{workspaceMode:'free',level:'council',county:'台北市',electorate:{council:'regional'},exportSettings:{winnerTable:false}},
   data:{council:Array(161),councilIndigenous:Array(60)},detailRequests:{'议员选区':pending},
   ensureMapDetails(){},currentItems:()=>[{}],localPredictionActive:()=>false};
  vm.runInNewContext(source,context);
  return {context,resolve,run:()=>context.ensureExportMapReady()};
 }
 for(const mode of ['unchanged','county','plan','history-loading','history-metric','history-year','history-ballot']){
  const {context,resolve,run}=harness();
  let historicalRoute={office:'council',year:2022,county:'台北市',metric:'party',level:'district',electorate:'all'};
  if(mode.startsWith('history'))context.History2022View={active:()=>true,routeSelection:()=>historicalRoute,routeReady:()=>mode!=='history-loading'};
  const result=run();
  if(mode==='county')context.state.county='高雄市';
  if(mode==='plan')context.state={...context.state};
  if(mode==='history-metric')historicalRoute={...historicalRoute,metric:'share'};
  if(mode==='history-year')historicalRoute={...historicalRoute,year:2018};
  if(mode==='history-ballot')historicalRoute={...historicalRoute,electorate:'plains'};
  resolve(true);
  if(mode==='unchanged')await result;
  else await assert.rejects(result,mode==='history-loading'?/历史资料尚未载入完成/:/地图范围或方案已变更/);
 }
});

test('Regression workflow cancels superseded runs and waits for the performance server',()=>{
 const workflow=read('.github/workflows/checks.yml');
 assert.match(workflow,/concurrency:\s*\n\s*group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}\s*\n\s*cancel-in-progress: true/);
 const performance=workflow.slice(workflow.indexOf('  performance:'));
 assert.match(performance,/npx playwright install --with-deps chromium/);
 assert.match(performance,/curl -fsS http:\/\/127\.0\.0\.1:8765\/ >\/dev\/null\s*\n\s*MAP_PERF_REPEAT/);
});


test('2026 official fetch bounds response body reads and clears its timer on all paths',async()=>{
 const history=read('history-2022.js'),start=history.indexOf(' async function fetchOfficial2026('),end=history.indexOf(" let history2026CheckStatus=",start);
 assert.ok(start>=0&&end>start);
 const source=history.slice(start,end);
 for(const mode of ['success','http-error','body-error','timeout']){
  let timer,cleared=0,signal;
  const context={AbortController,setTimeout(fn){timer=fn;return 1},clearTimeout(id){assert.equal(id,1);cleared++},
   fetch:async(url,options)=>{signal=options.signal;assert.equal(options.cache,'no-store');return {ok:mode!=='http-error',status:503,json:async()=>{
    if(mode==='timeout'){timer();throw Error('aborted')}
    if(mode==='body-error')throw Error('bad JSON');
    return {year:2026}
   }}}};
  vm.runInNewContext(source,context);
  const request=context.fetchOfficial2026('manifest','no-store','json',15000);
  if(mode==='success')assert.equal((await request).year,2026);
  else await assert.rejects(request,mode==='timeout'?/载入超时/:mode==='http-error'?/HTTP 503/:/bad JSON/);
  assert.equal(cleared,1);assert.equal(signal.aborted,mode==='timeout');
 }
});


test('2026 publication labels reflect loaded snapshots and leave other election years unchanged',()=>{
 const C=require('../history-core.js'),W=require('../history-workspace.js');
 assert.equal(C.official2026Label(null),'');
 assert.equal(C.official2026Label({year:2026,status:'published',resultStatus:'certified'}),'');
 assert.equal(C.official2026Label({year:2022,publicationStatus:'certified'}),'');
 const provisional={year:2026,publicationStatus:'provisional'},certified={year:2026,publicationStatus:'certified'};
 assert.equal(C.official2026Label(provisional),'开票结果（尚待正式公告）');
 assert.equal(C.official2026Label(certified),'正式公告结果');
 assert.match(W.exportStem({...provisional,office:'mayor'}),/开票结果（尚待正式公告）$/);
 assert.match(W.exportStem({...certified,office:'council'}),/正式公告结果$/);
 assert.doesNotMatch(W.exportStem({year:2022,office:'mayor',publicationStatus:'certified'}),/正式公告结果/);
});


test('Generic party trend lines distinguish no participation from participation without a win',()=>{
 const T=require('../history-trends.js'),ui=read('history-trends-ui.js');
 const snapshot={year:2022,elections:[{office:'mayor',election_id:'e1',year:2022}],
  contests:[{election_id:'e1',county_name:'台北市',district_name:'台北市',election_date:'2022-11-26'}],
  rows:[
   {type:'mayor',level:'county',county:'台北市',electorate:'regional',votes:100,party:'甲党',name:'甲候选人',elected:true},
   {type:'mayor',level:'county',county:'台北市',electorate:'regional',votes:90,party:'乙党',name:'乙候选人',elected:false}
  ]};
 const row=T.mapTrend(snapshot,{office:'mayor',electorate:'all',county:'台北市',metric:'party',normalize:value=>value});
 assert.deepEqual(row.participatingParties,['乙党','甲党'].sort((a,b)=>a.localeCompare(b,'zh-CN')));
 assert.equal(T.partyParticipationValue(row,'甲党'),1,'a participating winner has one seat');
 assert.equal(T.partyParticipationValue(row,'乙党'),0,'a participating non-winner has a real zero');
 assert.equal(T.partyParticipationValue(row,'丙党'),null,'a non-participating party has no point');
 assert.equal(T.partyParticipationValue(row,'',['丙党','丁党']),null,'other parties have no point when none participated');
 assert.equal(T.partyParticipationValue(row,'',['乙党','丙党']),0,'other parties preserve zero when a member participated');
 assert.equal(T.partyParticipationValue({...row,complete:false},'乙党'),null,'incomplete records are not zero');
 assert.equal(T.partyTrendValue({complete:true,parties:{'甲党':1}},'乙党'),null,'vote-share series keep non-participating parties absent');
 assert.equal(T.partyTrendValue({complete:true,parties:{'乙党':0}},'乙党'),0,'vote-share series preserve an explicit zero');
 assert.match(ui,/needsParticipation=conf\.metric==='party'&&\['mayor','president','township'\]\.includes\(conf\.office\)/);
 assert.match(ui,/conf\.metric==='party'&&\['mayor','president','township'\]\.includes\(conf\.office\)\?'participation':'summary'/);
 assert.match(ui,/!needsParticipation&&S\.summaryYears\(conf\.office,ys\)\.length/);
 assert.match(ui,/get:r=>T\.partyParticipationValue\(r,p\)/);
 assert.match(ui,/get:r=>T\.partyParticipationValue\(r,'',rest\)/);
});


test('History asset version keys are unique and current versions are effective',()=>{
 const source=read('history-loader.js'),block=source.match(/const versions=\{([^}]+)\}/)?.[1];
 assert.ok(block);
 const keys=[...block.matchAll(/'([^']+)'\s*:/g)].map(m=>m[1]);
 assert.equal(keys.length,new Set(keys).size,'duplicate keys silently override cache-busting tags');
});

test('Party trends retain ties and normalize the participation of independent candidates',()=>{
 const T=require('../history-trends.js');
 const snapshot={year:2024,elections:[],contests:[],rows:[
  {type:'president',level:'county',county:'甲县',electorate:'regional',party:'连署',name:'甲',votes:10},
  {type:'president',level:'county',county:'甲县',electorate:'regional',party:'乙党',name:'乙',votes:10}
 ]};
 const row=T.mergePresidentialIndependents(T.mapTrend(snapshot,{office:'president',electorate:'all',metric:'party'}));
 assert.equal(T.partyParticipationValue(row,'并列'),1);
 assert.equal(T.partyParticipationValue(row,'无党籍'),0);
 assert.equal(T.partyParticipationValue(row,'乙党'),0);
 assert.equal(T.partyParticipationValue(row,'丙党'),null);
 assert.equal(T.partyParticipationValue(row,'',['并列','丙党']),1);
});
