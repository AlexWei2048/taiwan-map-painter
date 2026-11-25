const assert=require('node:assert/strict');
const {test}=require('node:test');
const council=require('../assets/history-local-1994-council.json');
const source=require('../sources/history-1994-township.json');
const published=require('../assets/history-local-1994.json');
const officialRoster=new Set(["張宏年","林清華","李明憲","江宗杜","莊乃慧","張德榮","張雪惠","林永安","賴國華","廖述嘉","陳有江","郭晏生","藍澄雄","賴登銅","紀岳杉","陳天汶","高慧","劉清庚","林仁德","林長生","王世勛","林張久美","周賜斌","柯隆鵬","顏英男","張廖貴專","廖松柏","陳阿水","廖學澍","張國輝","劉文慶","劉水元","陳三井","曾坤炳","王素端","賴俊銘","陳武雄","賴榮園","賴天龍","劉春財","林永能","何時雄","朱蕙蘭"]);
const sourceUrl="https://www.tccc.gov.tw/wb_history02.asp?cno=152&uno=&zno=161";
test('1994 original Taichung City council incumbency matches official previous term',()=>{
 const districts=council.districts.filter(d=>d.county==='臺中市');
 assert.equal(districts.length,5);assert.equal(officialRoster.size,43);
 let yes=0,no=0,unknown=0;
 for(const d of districts)for(const c of d.candidates){
  const proof=d.incumbent_sources?.[String(c[0])];
  if(!proof){assert.equal(c[1],'張惠鵬');unknown++;continue;}
  assert.equal(proof.value,officialRoster.has(c[1]),c[1]);
  assert.equal(proof.source_url,sourceUrl);
  if(proof.value)yes++;else no++;
 }
 assert.deepEqual([yes,no,unknown],[32,56,1]);
 const audit=council.incumbency_roster_audit.find(x=>x.county==='臺中市');
 assert.deepEqual([audit.confirmed_true,audit.confirmed_false,audit.unverified],[32,56,1]);
 assert.deepEqual(audit.ambiguous,['張惠鵬']);
});
test('1994 Miaoli township candidate gender totals appear identically in source and website data',()=>{
 const get=(data,key)=>data[key].find(x=>x.county==='苗栗縣'&&x.summary_scope==='county');
 const a=get(source,'partial_counties'),b=get(published,'partialTownshipReturns');
 assert.ok(a&&b);assert.deepEqual(a.county_summary,b.county_summary);
 assert.deepEqual([a.county_summary.candidate_count,a.county_summary.male_candidates,a.county_summary.female_candidates],[44,41,3]);
 assert.deepEqual(a.profile_totals,[363697,295196,284990,10206]);
 assert.equal(a.profile_totals[1],a.profile_totals[2]+a.profile_totals[3]);
 assert.equal(a.county_summary.candidate_count,a.county_summary.male_candidates+a.county_summary.female_candidates);
});
