'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const Local=require('../history-local.js');
const fs=require('node:fs');
const path=require('node:path');
const source=require('../sources/history-1994-township.json');
const runtime=require('../assets/history-local-1994.json');
test('1994 Zhuolan verified 4,635 winner votes are recorded only as partial returns',()=>{
 const row=source.partial_counties.find(x=>x.county==='苗栗縣'&&x.supplement_type==='verified_winner_with_votes');
 const page=runtime.partialTownshipReturns.find(x=>x.county==='苗栗縣'&&x.supplement_type==='verified_winner_with_votes');
 assert.deepEqual(page,row);
 assert.equal(row.status,'partial_candidate_returns');
 assert.equal(row.winners.length,1);
 assert.deepEqual([row.winners[0].town,row.winners[0].name,row.winners[0].votes,row.winners[0].incumbent_at_election],['卓蘭鎮','張明豐',4635,false]);
 assert.deepEqual([row.other_candidates[0].name,row.other_candidates[0].votes,row.other_candidates[0].elected],['詹豐治',null,false]);
 assert.equal(row.winners[0].party_recommendation,null);
 assert.equal(row.do_not_infer_turnout,true);
 assert.match(row.source_url,/gozhuolan\.com\.tw/);
 assert.equal(source.partial_counties.filter(x=>x.county==='苗栗縣'&&x.summary_scope==='county').length,1);
});
test('1994 Zhuolan must not be published as a complete constituency vote result',async()=>{
 const fetcher=async name=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',name.split('?')[0]),'utf8'))});
 const data=await Local.loadCycle(1994,'township',fetcher);
 assert.equal(data.contests.some(x=>x.county_name==='苗栗县'&&x.district_name==='卓兰镇'),false);
 const part=data.partialTownshipReturns.filter(x=>x.county==='苗栗縣');
 assert.ok(part.some(x=>x.summary_scope==='county'));
 assert.ok(part.some(x=>x.winners?.some(w=>w.town==='卓蘭鎮'&&w.votes===4635)));
});
