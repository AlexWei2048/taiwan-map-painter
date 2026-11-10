'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');

const Workspace=require('../history-workspace.js');

test('history selection normalizes incompatible office, level, electorate and metric combinations',()=>{
 assert.deepEqual(Workspace.normalizeSelection({year:1996,office:'mayor',level:'district',electorate:'all',metric:'seats',view:'bad'},[2022]),{
  year:2022,office:'mayor',electorate:'regional',county:'',level:'county',metric:'party',candidate:'',party:'',view:'map'
 });
 assert.deepEqual(Workspace.normalizeSelection({year:2022,office:'council',level:'town',electorate:'mountain',metric:'seats',view:'overview'},[2022]),{
  year:2022,office:'council',electorate:'mountain',county:'',level:'district',metric:'seats',candidate:'',party:'',view:'overview'
 });
 assert.equal(Workspace.normalizeSelection({office:'township',level:'county',electorate:'plains'},[2022]).level,'town');
});

test('workspace offers the correct geography levels and electorate choices',()=>{
 assert.deepEqual(Workspace.levelOptions('mayor'),[['county','县市'],['town','乡镇市区']]);
 assert.deepEqual(Workspace.levelOptions('council'),[['district','选举区']]);
 assert.deepEqual(Workspace.levelOptions('township'),[['town','乡镇市区']]);
 assert.deepEqual(Workspace.electorateOptions('council').map(item=>item[0]),['all','regional','plains','mountain']);
 assert.deepEqual(Workspace.electorateOptions('mayor'),[['regional','区域选举']]);
});

test('all councillor identities keep separate turnout cards and never create a combined turnout',()=>{
 const overview={turnout:null,turnoutGroups:[
  {electorate:'regional',registeredVoters:100,ballotsCast:70,validVotes:68,invalidVotes:2,turnout:70},
  {electorate:'plains',registeredVoters:40,ballotsCast:30,validVotes:29,invalidVotes:1,turnout:75},
  {electorate:'mountain',registeredVoters:20,ballotsCast:18,validVotes:18,invalidVotes:0,turnout:90}
 ]};
 const cards=Workspace.turnoutCards(overview,{office:'council',electorate:'all'});
 assert.deepEqual(cards.map(card=>card.electorate),['regional','plains','mountain']);
 assert.deepEqual(cards.map(card=>card.title),['区域议员','平地少数民族议员','山地少数民族议员']);
 assert.equal(cards.some(card=>card.electorate==='all'),false);
 assert.equal(cards.length,3);
 assert.deepEqual(cards.map(card=>card.validVotes),[68,29,18]);
});

test('single-electorate overview produces one explicit card even when turnout is unavailable',()=>{
 const cards=Workspace.turnoutCards({turnout:null,turnoutGroups:[{electorate:'regional',registeredVoters:null,ballotsCast:null,turnout:null}]},{office:'mayor',electorate:'regional'});
 assert.deepEqual(cards,[{electorate:'regional',title:'区域选举',registeredVoters:null,ballotsCast:null,validVotes:null,invalidVotes:null,turnout:null}]);
});

test('historical feature presentation keeps councillor geography neutral and every party visible',()=>{
 const view=Workspace.featurePresentation({office:'council',metric:'party',region:{party:'甲党',partyCounts:new Map([['甲党',3],['乙党',3],['无党籍',1]])}});
 assert.equal(view.fill,'#f0f3ed');
 assert.deepEqual(view.badgeItems,[{party:'甲党',seats:3},{party:'乙党',seats:3},{party:'无党籍',seats:1}]);
 assert.match(view.tooltip,/甲党 3席/);assert.match(view.tooltip,/乙党 3席/);assert.match(view.tooltip,/无党籍 1席/);
});

test('township distribution describes the vote leader without implying election',()=>{
 const view=Workspace.featurePresentation({office:'mayor',level:'town',metric:'party',region:{top:{name:'候选人甲',party:'甲党',votes:1200},share:55.5}});
 assert.match(view.ariaLabel,/得票领先/);
 assert.doesNotMatch(view.ariaLabel,/当选/);
 assert.deepEqual(view.badgeItems,[]);
});

test('councillor badge layout falls back to an indexed external card when space is tight',()=>{
 const layout=Workspace.badgeFallback({districtNumber:'7',partyCount:6,inside:false});
 assert.deepEqual(layout,{mode:'indexed',label:'7',leader:true,keyboardLabel:'第7选举区，6个政党当选'});
 assert.equal(Workspace.badgeFallback({districtNumber:'2',partyCount:2,inside:true}).mode,'badges');
});

test('candidate result rows search and filter by stable candidacy data without inferring winners',()=>{
 const rows=[
  {candidacy_id:'b',candidate_name:'王乙',party_name:'乙党',ballot_number:'2',votes:90,elected_official:false,elected_mark:''},
  {candidacy_id:'a',candidate_name:'张甲',party_name:'甲党',ballot_number:'1',votes:100,elected_official:true,elected_mark:'*'},
  {candidacy_id:'c',candidate_name:'赵丙',party_name:'甲党',ballot_number:'3',votes:80,elected_official:false,elected_mark:'?'}
 ];
 assert.deepEqual(Workspace.candidateRows(rows,{party:'甲党'}).map(row=>row.candidacy_id),['a','c']);
 assert.deepEqual(Workspace.candidateRows(rows,{search:'王'}).map(row=>row.candidacy_id),['b']);
 assert.equal(Workspace.candidateRows(rows,{party:'甲党'})[1].elected_official,false);
});

test('overview cards expose available totals and keep unavailable ballot fields explicit',()=>{
 const cards=Workspace.overviewCards({candidateCount:12,electedCount:3,validVotes:1234,invalidVotes:null,incumbentCount:2});
 assert.deepEqual(cards.map(card=>card.value),['12','3','1,234','暂无资料','2','暂无资料','暂无资料']);
});

test('county mayor drill-down changes only the map level and county scope',()=>{
 assert.deepEqual(Workspace.drilldownSelection({year:2022,office:'mayor',county:'',level:'county'},'台北市'),{year:2022,office:'mayor',county:'台北市',level:'town'});
 assert.equal(Workspace.drilldownSelection({office:'council',level:'district'},'台北市'),null);
});

test('historical export stem includes year, normalized office, scope and metric',()=>{
 assert.equal(Workspace.exportStem({year:2022,office:'council',county:'台北市',metric:'party'}),'2022-县市议员-台北市-当选席次');
 assert.equal(Workspace.exportStem({year:2022,office:'mayor',county:'',level:'town',metric:'votes'}),'2022-县市长-全台-得票数');
});

test('historical CSV keeps normalized and original official labels and protects formulas',()=>{
 const result={contests:[{contest_id:'x',county_name:'台北市',county_name_official:'臺北市',district_name:'台北市',district_name_official:'臺北市'}],candidacies:[{contest_id:'x',candidate_name:'张甲',candidate_name_official:'張甲',party_name:'=危险',party_name_official:'＝危險',ballot_number:'1',votes:10,vote_share:50,elected_official:true}]};
 const csv=Workspace.historyCsv(result,{year:2022,office:'mayor'});
 assert.match(csv,/县市规范名称/);assert.match(csv,/县市官方名称/);assert.match(csv,/张甲/);assert.match(csv,/張甲/);assert.match(csv,/"'=危险"/);assert.match(csv,/"是"/);
});
