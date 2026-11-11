'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const W=require('../news-wording.js');
const HistoryCore=require('../history-core.js');
const HistoryWorkspace=require('../history-workspace.js');

test('2502 clauses 49–86 normalize Taiwan-related public wording without distorting registered party identities',()=>{
 const cases=[
  ['2024总统选举','2024台湾地区领导人选举'],
  ['台湾地区总统选举','台湾地区领导人选举'],
  ['总统府','台湾当局领导人办公场所'],
  ['副总统','副领导人'],
  ['中华民国总统','台湾地区领导人'],
  ['中选会选举资料库','台湾地区选举事务主管机构选举资料库'],
  ['中央选举委员会','台湾地区选举事务主管机构'],
  ['台湾政府','台湾当局'],
  ['台湾立法院','台湾台湾地区立法机构'], // the shorthand must never appear; see separate contextual coverage
  ['立法委员','台湾地区民意代表'],
  ['平地原住民','平地少数民族'],
  ['山地原住民族','山地少数民族'],
  ['原住民','少数民族'],
  ['全国选举区','全部地区选举区'],
  ['时代力量','“时代力量”'],
  ['台联','台联党'],
  ['台联党','台联党'],
  ['台湾独立党','“台湾独立党”'],
  ['大爱宪改','“大爱宪改”'],
  ['台独','“台独”'],
  ['小三通','“小三通”'],
  ['台语','台湾闽南语'],
  ['全台 · 含离岛','全部地区（含金门、马祖）'],
  ['台湾金门县','金门县'],
  ['台湾连江县','连江县'],
  ['台湾离岛','金门、马祖等岛屿'],
  ['台湾省','台湾地区'],
  ['台湾省政府','台湾省政府'],
  ['国小、国中','小学、初中'],
  ['国父纪念馆','台北中山纪念馆']
 ];
 for(const [input,wanted] of cases){
  const result=W.normalize(input);
  assert.equal(result,wanted,input);
  assert.equal(W.normalize(result),result,'normalization is idempotent: '+input);
 }
 for(const name of ['公民党','民国党','中华统一促进党','台湾团结联盟','台联党','台湾民众党','金门县','连江县','张国立']){
  assert.equal(W.normalize(name),name,'preserve registered names and personal names: '+name);
 }
});

test('CSV serializers apply public spelling and quotation marks while leaving the original values unchanged',()=>{
 const original=[['政党','地区'],['时代力量','全国平地原住民']];
 const csv=HistoryCore.csv(original);
 assert.match(csv,/“时代力量”/);
 assert.match(csv,/全部地区平地少数民族/);
 assert.doesNotMatch(csv,/原住民|全国/);
 assert.equal(original[1][0],'时代力量');
 const summary={
  contests:[{contest_id:'x',county_name:'台北市',county_name_official:'臺北市',district_name:'全国原住民',district_name_official:'全國原住民'}],
  candidacies:[{contest_id:'x',candidate_name:'陈小明',candidate_name_official:'陳小明',party_name:'时代力量',party_name_official:'時代力量',ballot_number:'3',votes:1000,vote_share:33.33,elected_official:false}]
 };
 const csv2=HistoryWorkspace.historyCsv(summary,{year:2022,office:'council'});
 assert.match(csv2,/“时代力量”/);
 assert.match(csv2,/少数民族/);
 assert.doesNotMatch(csv2,/原住民|全國/);
 assert.equal(summary.candidacies[0].party_name,'时代力量','the raw records are not modified');
});

test('public site source wording and export call sites have the 2502 guards wired',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const app=fs.readFileSync('app.js','utf8');
 const work=fs.readFileSync('workspace-ui.js','utf8');
 const hist=fs.readFileSync('history-2022.js','utf8');
 assert.match(html,/news-wording\.js\?v=/);
 assert.doesNotMatch(html,/中选会|全台 · 含离岛/);
 assert.doesNotMatch(work,/中选会/);
 assert.doesNotMatch(hist,/全台 · 含离岛/);
 assert.ok(app.includes('function csvCell(v){v=mainlandTerms(v);'));
 assert.ok(app.includes("replace(/^[“「](.*)[”」]$/,'$1')"),'CSV import accepts published party spelling');
 assert.ok(hist.includes("mainlandTerms(election?.source_name"),'historical source labels are normalized');
});
