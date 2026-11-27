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
  ['黄宏成台湾阿成世界伟人财神总统','黄宏成台湾阿成世界伟人财神总统'],
  ['黃宏成台灣阿成世界偉人財神總統','黃宏成台灣阿成世界偉人財神總統'],
  ['黃宏成臺灣阿成世界偉人財神總統','黃宏成臺灣阿成世界偉人財神總統'],
  ['黄宏成台湾阿成世界伟人财神总统 · 总统选举','黄宏成台湾阿成世界伟人财神总统 · 台湾地区领导人选举'],
  ['黄宏成台湾阿成世界伟人财神台湾地区领导人','黄宏成台湾阿成世界伟人财神总统'],
  ['台湾地区总统选举','台湾地区领导人选举'],
  ['总统府','台湾当局领导人办公场所'],
  ['副总统','副领导人'],
  ['中华民国总统','台湾地区领导人'],
  ['中选会选举资料库','台湾地区选举事务主管机构选举资料库'],
  ['中央选举委员会','台湾地区选举事务主管机构'],
  ['台湾政府','台湾当局'],
  ['台湾立法院','台湾地区立法机构'],
  ['立法委员','台湾地区民意代表'],
  ['平地原住民','平地少数民族'],
  ['山地原住民族','山地少数民族'],
  ['原住民','少数民族'],
  ['全国选举区','全部地区选举区'],
  ['全台选区','全部地区选区'],
  ['时代力量','“时代力量”'],
  ['台湾基进','“台湾基进”'],
  ['台灣基進','“台湾基进”'],
  ['臺灣基進','“台湾基进”'],
  ['“台湾基进”','“台湾基进”'],
  ['台湾基进与时代力量','“台湾基进”与“时代力量”'],
  ['台湾民众党','台湾民众党'],
  ['台湾团结联盟','“台湾团结联盟”'],
  ['台灣團結聯盟','“台湾团结联盟”'],
  ['臺灣團結聯盟','“台湾团结联盟”'],
  ['“台湾团结联盟”','“台湾团结联盟”'],
  ['台湾团结联盟（台联党）','“台湾团结联盟（台联党）”'],
  ['台灣團結聯盟（臺聯黨）','“台湾团结联盟（台联党）”'],
  ['“台湾团结联盟（台联党）”','“台湾团结联盟（台联党）”'],
  ['一边一国行动党','“一边一国行动党”'],
  ['一邊一國行動黨','“一边一国行动党”'],
  ['自由台湾党','“自由台湾党”'],
  ['建国党','“建国党”'],
  ['台澎国际法法理建国党','“台澎国际法法理建国党”'],
  ['喜乐岛联盟','“喜乐岛联盟”'],
  ['新国家连线','“新国家连线”'],
  ['新國家連線','“新国家连线”'],
  ['台澎党','“台澎党”'],
  ['全国民主非政党联盟','“全国民主非政党联盟”'],
  ['全國民主非政黨聯盟','“全国民主非政党联盟”'],
  ['全部地区民主非政党联盟','“全国民主非政党联盟”'],
  ['“全国民主非政党联盟”','“全国民主非政党联盟”'],
  ['全国民主非政党联盟与全国选举区','“全国民主非政党联盟”与全部地区选举区'],
  ['民主进步党','民主进步党'],
  ['社会民主党','社会民主党'],
  ['台湾第一民族党','台湾第一民族党'],
  ['台联','“台联党”'],
  ['臺聯','“台联党”'],
  ['台联党','“台联党”'],
  ['臺聯黨','“台联党”'],
  ['“台联党”','“台联党”'],
  ['台湾独立党','“台湾独立党”'],
  ['大爱宪改','“大爱宪改”'],
  ['台独','“台独”'],
  ['小三通','“小三通”'],
  ['台语','台湾闽南语'],
  ['全台 · 含离岛','全部地区（含金门、马祖）'],
  ['台湾金门县','金门'],
  ['台湾连江县','马祖'],
  ['台湾离岛','福建外岛'],
  ['金门县','金门'],
  ['连江县','马祖'],
  ['金門縣','金门'],
  ['連江縣','马祖'],
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
 for(const name of ['中国台湾原住民党','台湾原住民党','中华台湾原住民团结党','中华民国台湾基本法连线','中华民国机车党','中华民国国政监督联盟','中国全民福利党','全民生活政策党','台湾第一民族党','公民党','民国党','中华统一促进党','台湾民众党','金门','马祖','张国立']){
  assert.equal(W.normalize(name),name,'preserve registered names and personal names: '+name);
 }
});

test('CSV serializers apply public spelling and quotation marks while leaving the original values unchanged',()=>{
 const original=[['政党','地区'],['时代力量','全国平地原住民'],['台湾基进','台北市'],['台湾团结联盟','台北市'],['台联党','台北市']];
 const csv=HistoryCore.csv(original);
 assert.match(HistoryCore.csv([['黄宏成台湾阿成世界伟人财神总统']]),/黄宏成台湾阿成世界伟人财神总统/);
 assert.match(csv,/“时代力量”/);
 assert.match(csv,/“台湾基进”/);
 assert.match(csv,/“台湾团结联盟”/);
 assert.match(csv,/“台联党”/);
 assert.equal(original[3][0],'台湾团结联盟','original registered name remains unchanged');
 assert.equal(original[4][0],'台联党','original party alias remains unchanged');
 assert.equal(original[2][0],'台湾基进','source party name remains unmodified');
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
 assert.ok(app.includes('function csvCell(v){v=mainlandTerms(simplify('));
 assert.ok(app.includes("replace(/^[“「](.*)[”」]$/,'$1')"),'CSV import accepts published party spelling');
 assert.ok(hist.includes("mainlandTerms(election?.source_name"),'historical source labels are normalized');
 assert.ok(fs.readFileSync('news-wording.js','utf8').includes("new DOMParser().parseFromString(original,'image/svg+xml')"),
  'exported SVG text is normalized without rewriting geographic source IDs');
});

test('Independent nomination wording is uniform in visible text and CSV exports',()=>{
 for(const input of ['无党籍（连署）','無黨籍（連署）','无党籍(连署)','连署','連署','无党籍'])assert.equal(W.normalize(input),'无党籍');
 assert.equal(W.normalize('候选人 · 无党籍（连署） · 20%'),'候选人 · 无党籍 · 20%');
 assert.equal(W.normalize('连署人数'),'连署人数');
 assert.equal(W.normalize(W.normalize('无党籍（连署）')),'无党籍');
 assert.match(HistoryCore.csv([['无党籍（连署）','連署']]),/"无党籍","无党籍"/);
});

test('Party proper names are protected in mixed text, DOM labels and CSV; historical aliases remain names, not generic words',()=>{for(const [source,want] of [['中国台湾少数民族党','中国台湾原住民党'],['中國台灣原住民黨','中国台湾原住民党'],['中国台湾原住民党 · 山地原住民','中国台湾原住民党 · 山地少数民族'],['中華民國機車黨','中华民国机车党'],['中华民国台湾基本法连线 · 总统选举','中华民国台湾基本法连线 · 台湾地区领导人选举'],['中国全民福利党','中国全民福利党'],['全民生活政策党','全民生活政策党'],['台灣基進','“台湾基进”'],['台湾团结联盟（台联党）','“台湾团结联盟（台联党）”'],['台湾建国党','台湾建国党'],['绿党社会民主党联盟','绿党社会民主党联盟']]){assert.equal(W.normalize(source),want);assert.equal(W.normalize(want),want)}assert.match(HistoryCore.csv([['中国台湾原住民党','中华民国机车党']]),/中国台湾原住民党.*中华民国机车党/)});
