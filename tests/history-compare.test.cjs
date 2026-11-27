const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../history-compare.js');
test('Actual 2024 presidential county results reconcile with official valid votes',()=>{
 const snapshot=require('../assets/history-president-2024.json'),r=C.summarize(snapshot,'president','all');
 assert.equal(r.counties.size,22);assert.equal(r.all.complete,true);assert.equal(r.all.valid,13947506);assert.equal(r.all.seats,null);
 assert.equal(r.all.parties['民主进步党'].votes,5586019);
});
test('Known partial township archive is not presented as a full result',()=>{
 const r=C.summarize(require('../assets/history-local-1994.json'),'township','all');
 assert.equal(r.all.complete,false);assert.equal(r.all.valid,null);
});
test('Vote deltas do not turn nonparticipation into zero, and merged counties are not compared',()=>{
 const a={complete:true,parties:{A:{share:40,seats:1}},seats:1},b={complete:true,parties:{B:{share:100,seats:1}},seats:1};
 assert.deepEqual(C.delta(a,b,'A'),{share:null,votes:null,seats:-1});
 assert.deepEqual(C.delta(a,{complete:false},'A'),{share:null,votes:null,seats:null});
 assert.equal(C.comparableCounty('台中市',{year:2009},{year:2014}),false);
 assert.equal(C.comparableCounty('台北市',{year:2009},{year:2014}),true);
});
test('Council ballot scope is not combined with other identities',()=>{
 const snapshot={year:2022,elections:[{office:'council',election_id:'c'}],contests:[{election_id:'c',contest_id:'a',county_name:'甲县',electorate:'regional',seats:1,valid_votes:100},{election_id:'c',contest_id:'b',county_name:'甲县',electorate:'plains',seats:1,valid_votes:100}],candidacies:[{contest_id:'a',party_name:'甲党',votes:100,elected_official:true},{contest_id:'b',party_name:'乙党',votes:100,elected_official:true}]};
 const r=C.summarize(snapshot,'council','regional');assert.equal(r.all.valid,100);assert.equal(r.all.parties['乙党'],undefined);assert.equal(r.all.seats,1);
});


test('Seat and mayor party changes exclude incomparable geography and unknown winners',()=>{
 const row=(party,share,seats)=>({complete:true,seats,leader:[party],parties:{[party]:{votes:share*10,share,seats}}});
 const a={year:2009,office:'mayor',ballot:'all',counties:new Map([['台北市',row('甲党',50,1)],['台中市',row('甲党',50,1)],['花莲县',row('无党籍（连署）',60,1)]]),all:row('甲党',50,1)};
 const b={year:2014,office:'mayor',ballot:'all',counties:new Map([['台北市',row('乙党',60,1)],['台中市',row('乙党',60,1)],['花莲县',row('无党籍（连署）',55,1)]]),all:row('乙党',60,1)};
 assert.equal(C.countyChange(a,b,'台北市','甲党','seats'),-1);
 assert.equal(C.countyChange(a,b,'台北市','乙党','seats'),1);
 assert.equal(C.countyChange(a,b,'台北市','甲党','share'),null);
 assert.equal(C.countyChange(a,b,'台中市','甲党','seats'),null);
 assert.equal(C.countyChange(a,b,'台中市','','turnover'),null);
 assert.deepEqual(C.countyChange(a,b,'台北市','','turnover'),{from:'甲党',to:'乙党',changed:true});
 assert.deepEqual(C.countyChange(a,b,'花莲县','','turnover'),{from:'无党籍（连署）',to:'无党籍（连署）',changed:false});
 assert.equal(C.turnover(row('政党资料缺失',50,1),row('乙党',60,1)),null);
 assert.equal(C.turnover(row('甲党',50,2),row('乙党',60,1)),null);
 const csv=C.comparisonCSV(a,b);
 assert.match(csv,/^\ufeff"选举类别"/);
 assert.ok(csv.includes('"台中市","甲党","500","","50","","","","1","0","","","","当届行政区范围不同或资料不存在"'));
 assert.ok(csv.includes('"台北市","甲党","500","","50","","","","1","0","-1","甲党","乙党",""'));
 assert.ok(csv.includes('"县市长","全部","2009","2014"'));
});

test('Absolute vote change requires both verified vote counts',()=>{const a={complete:true,parties:{A:{votes:100,share:40,seats:1}},seats:1},b={complete:true,parties:{A:{votes:125,share:50,seats:1}},seats:1};assert.equal(C.delta(a,b,'A').votes,25);assert.equal(C.delta(a,b,'B').votes,null);assert.equal(C.delta(a,{complete:false},'A').votes,null)});

test('Turnout statistics only use complete reconciled profiles; missing and incompatible regions are not zero',()=>{const profile=C.verifiedProfile([{contest:{registered_voters:200,ballots_cast:120,valid_votes:118,invalid_votes:2}}],118);assert.equal(profile.turnout,60);assert.equal(C.verifiedProfile([{contest:{registered_voters:200,ballots_cast:120,valid_votes:118,invalid_votes:3}}],118),null);assert.equal(C.profileChange({complete:true,profile},{complete:true,profile:{...profile,registered:210,turnout:65}},'turnout'),5);assert.equal(C.profileChange({complete:true,profile},null,'registered'),null)});

test('Town comparison requires full candidate-by-candidate county reconciliation, never attributes seats to towns',()=>{const s={year:2022,elections:[{office:'mayor',election_id:'m'}],contests:[{election_id:'m',contest_id:'a',county_name:'台北市',seats:1,valid_votes:100}],candidacies:[{contest_id:'a',party_name:'甲党',votes:60,elected_official:true},{contest_id:'a',party_name:'乙党',votes:40,elected_official:false}],rows:[],townProfiles:[{office:'mayor',county:'台北市',town:'甲区',registered_voters:120,ballots_cast:101,valid_votes:100,invalid_votes:1}]};for(const level of ['county','town'])for(const [name,number,party,votes] of [['甲',1,'甲党',60],['乙',2,'乙党',40]])s.rows.push({type:'mayor',electorate:'regional',level,county:'台北市',town:level==='town'?'甲区':'',name,number,party,votes});const a=C.summarizeTowns(s,'mayor','all');assert.equal(a.counties.get('台北市|甲区').parties['甲党'].share,60);assert.equal(a.counties.get('台北市|甲区').seats,null);assert.equal(a.counties.get('台北市|甲区').profile.cast,101);s.rows.at(-1).votes--;assert.equal(C.summarizeTowns(s,'mayor','all').counties.get('台北市|甲区').complete,false);assert.equal(C.comparableCounty('台北市|甲区',a,{...a,year:2010}),false)});

test('Independent party-list town comparisons reconcile every party and attach only same-ballot verified statistics',()=>{const s={year:2024,elections:[{office:'legislative',election_id:'p'}],contests:[],candidacies:[],rows:[]};for(const level of ['county','town'])for(const [party,votes] of [['甲党',60],['乙党',40]])s.rows.push({type:'legislative',electorate:'party',level,county:'台北市',town:level==='town'?'甲区':'',name:party,party,votes});const a=C.summarizeTowns(s,'legislative','party'),x=a.counties.get('台北市|甲区');assert.equal(x.parties.甲党.share,60);assert.equal(x.seats,null);C.legislativeProfiles(a,{enrich(v,sel){assert.equal(sel.electorate,'party');return {...v,registeredVoters:200,ballotsCast:102,invalidVotes:2}}});assert.equal(x.profile.turnout,51);C.legislativeProfiles(a,{enrich(v){return {...v,registeredVoters:201,ballotsCast:102,invalidVotes:2}}});assert.equal(x.profile,null);s.rows.at(-1).votes--;assert.equal(C.summarizeTowns(s,'legislative','party').counties.get('台北市|甲区').complete,false);});

test('Township executive archives use official single-seat contests, not county-wide votes or inferred winners',()=>{const s={year:2022,elections:[{office:'township',election_id:'t'}],contests:[{election_id:'t',contest_id:'a',county_name:'甲县',district_name:'乙镇',seats:1,valid_votes:100,registered_voters:200,ballots_cast:102,invalid_votes:2}],candidacies:[{contest_id:'a',party_name:'甲党',votes:60,elected_official:true},{contest_id:'a',party_name:'乙党',votes:40,elected_official:false}],rows:[]};const x=C.summarizeTowns(s,'township','all').counties.get('甲县|乙镇');assert.deepEqual(x.leader,['甲党']);assert.equal(x.seats,1);assert.equal(x.profile.turnout,51);assert.equal(x.parties.乙党.share,40);s.candidacies[0].elected_official=null;assert.equal(C.summarizeTowns(s,'township','all').counties.get('甲县|乙镇').complete,false)});

test('Regional legislative towns reconcile each district independently, combine split-town fragments and never allocate seats',()=>{
 const s={year:2024,elections:[{office:'legislative',election_id:'r'}],contests:[],candidacies:[],rows:[]};
 for(const [id,party,other,votes] of [['1','甲党','乙党',[30,20]],['2','乙党','甲党',[40,10]]]){
 const district='第'+id+'选举区';s.contests.push({contest_id:id,election_id:'r',county_name:'台北市',district_name:district,seats:1,valid_votes:50,electorate:'regional'});
 for(const [j,p] of [party,other].entries()){const name='候选'+id+j,number=j+1,v=votes[j];s.candidacies.push({contest_id:id,candidate_name:name,ballot_number:number,party_name:p,votes:v,elected_official:j===0});s.rows.push({type:'legislative',level:'town',electorate:'regional',county:'台北市',town:'甲区',district,name,number,party:p,votes:v})}}
 const result=C.summarizeTowns(s,'legislative','regional'),x=result.counties.get('台北市|甲区');assert.equal(x.valid,100);assert.equal(x.parties.甲党.votes,40);assert.equal(x.parties.乙党.votes,60);assert.equal(x.seats,null);assert.deepEqual(x.leader,['乙党']);s.rows[0].votes--;assert.equal(C.summarizeTowns(s,'legislative','regional').counties.get('台北市|甲区').complete,false);
});
test('Township executive turnover uses actual single-seat winners and missing is not zero',()=>{const key='甲县|乙镇',a={year:2018,level:'town',office:'township',counties:new Map([[key,{complete:true,seats:1,leader:['甲党'],parties:{甲党:{seats:1}}}]])},b={...a,year:2022,counties:new Map([[key,{complete:true,seats:1,leader:['乙党'],parties:{乙党:{seats:1}}}]])};assert.deepEqual(C.countyChange(a,b,key,'','turnover'),{from:'甲党',to:'乙党',changed:true});assert.equal(C.metricState(undefined,'甲党'),'无该地区记录');assert.equal(C.metricState(a.counties.get(key),'乙党'),'未见参选记录');assert.equal(C.metricState({complete:false},'乙党'),'资料待核实')});

test('Archived 2024 regional legislative town data reconciles against formal district totals',()=>{const fs=require('node:fs'),s=JSON.parse(fs.readFileSync('assets/history-legislative-2024.json','utf8')),a=C.summarizeTowns(s,'legislative','regional'),rows=[...a.counties].filter(([,x])=>x.complete);assert.ok(rows.length>0,'at least one real county passes district reconciliation');for(const [key,x] of rows){const [county,town]=key.split('|');const actual=s.rows.filter(r=>r.type==='legislative'&&r.electorate==='regional'&&r.level==='town'&&String(r.county).replaceAll('臺','台').replaceAll('縣','县')===county&&String(r.town).replaceAll('臺','台').replaceAll('縣','县')===town);assert.equal(x.valid,actual.reduce((sum,r)=>sum+r.votes,0));assert.equal(x.seats,null)}});
