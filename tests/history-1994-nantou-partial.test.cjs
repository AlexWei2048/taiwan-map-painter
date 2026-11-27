'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const source=require('../sources/history-1994-township.json');
const published=require('../assets/history-local-1994.json');
test('1994 Nantou six additional term-roster winners preserve raw-vote uncertainty',()=>{
 assert.deepEqual(source.partial_counties,published.partialTownshipReturns);
 const batch=source.partial_counties.filter(x=>x.county==='南投縣'&&x.supplement_type==='historical_term_roster_winners_only');
 assert.equal(batch.length,1);
 const expect=new Map([['南投市','林俊梧'],['草屯鎮','賴忠政'],['埔里鎮','張鴻銘'],['竹山鎮','許文欽'],['鹿谷鄉','林民政'],['仁愛鄉','沈明德']]);
 assert.equal(batch[0].winners.length,expect.size);
 for(const w of batch[0].winners){
  assert.equal(w.name,expect.get(w.town),w.town);
  assert.ok(w.source_url.startsWith('https://'));
  for(const field of ['votes','ballot_number','gender','party_recommendation'])assert.equal(w[field],null,w.town+' '+field);
  assert.ok([true,false,null].includes(w.incumbent_at_election));
 }
 assert.equal(new Set(batch[0].winners.map(w=>w.town)).size,expect.size);
 assert.equal(published.contests.filter(x=>x.election_id==='1994-township').length,89);
 assert.ok(source.partial_counties.some(x=>x.county==='南投縣'&&x.winners?.some(w=>w.town==='集集鎮'&&w.name==='林明溱')));
});

test('1994 Taichung Longjing incumbent and Qingshui incumbent have original gazette evidence',()=>{
 const counties=source.partial_counties.filter(x=>x.county==='臺中縣');
 const longjing=counties.flatMap(x=>x.winners||[]).find(x=>x.town==='龍井鄉');
 const qingshui=counties.flatMap(x=>x.winners||[]).find(x=>x.town==='清水鎮');
 assert.equal(longjing.name,'劉瑞龍');
 assert.equal(longjing.incumbent_at_election,true);
 assert.ok(source.partial_counties.some(x=>x.source_url?.includes('taichung.gov.tw/media/267771/')&&x.winners?.some(w=>w.town==='龍井鄉')));
 for(const k of ['gender','votes','ballot_number','party_recommendation'])assert.equal(longjing[k],null);
 assert.equal(qingshui.name,'吳金生');
 assert.equal(qingshui.incumbent_at_election,true);
 assert.ok(qingshui.incumbent_source_url.includes('taichung.gov.tw'));
 assert.deepEqual(source.partial_counties,published.partialTownshipReturns);
});
