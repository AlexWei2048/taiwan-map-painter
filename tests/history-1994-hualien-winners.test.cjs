'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const Local=require('../history-local.js');
const source=require('../sources/history-1994-township.json');
const runtime=require('../assets/history-local-1994.json');
test('1994 Hualien three verified mayor winners remain partial returns with individual provenance',()=>{
 const partial=source.partial_counties.find(x=>x.county==='花蓮縣'&&x.supplement_type==='verified_winners_only');
 const live=runtime.partialTownshipReturns.find(x=>x.county==='花蓮縣'&&x.supplement_type==='verified_winners_only');
 assert.deepEqual(live,partial);
 assert.ok(partial);
 assert.deepEqual(partial.winners.map(w=>[w.town,w.name,w.gender,w.incumbent_at_election]),[
  ['花蓮市','陳清水','男',null],['吉安鄉','徐松海',null,false],['富里鄉','蘇孝信','男',null]]);
 assert.ok(partial.winners.every(w=>w.source_url.startsWith('https://')&&w.source_locator&&w.method&&w.evidence_notes));
 assert.ok(partial.winners.every(w=>w.votes===null&&w.ballot_number===null&&w.party_recommendation===null));
 assert.equal(partial.profile_scope,'winners_only_not_complete_candidates');
 const c=source.partial_counties.find(x=>x.county==='花蓮縣'&&x.profiles?.length===13);
 assert.ok(c);
 assert.equal(c.profiles.find(x=>x.town==='吉安鄉').candidate_count,3);
 assert.deepEqual(['registered_voters','ballots_cast','valid_votes','invalid_votes']
  .map(k=>c.profiles.find(x=>x.town==='吉安鄉')[k]),[43470,27153,26168,985]);
 assert.equal(c.winners.some(w=>w.town==='光復鄉'&&w.votes===6791),true);
});
test('1994 Hualien newly verified winners are displayed as partial sources, not falsely added to complete candidate returns',async()=>{
 const fetcher=async file=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',file.split('?')[0]),'utf8'))});
 const data=await Local.loadCycle(1994,'township',fetcher);
 const partial=data.partialTownshipReturns.find(x=>x.county==='花蓮縣'&&x.supplement_type==='verified_winners_only');
 assert.equal(partial.winners.length,3);
 assert.equal(data.contests.filter(x=>x.county_name==='花莲县').length,1);
 assert.equal(data.contests.filter(x=>x.county_name==='花莲县'&&x.district_name==='光复乡').length,1);
 for(const n of ['花莲市','吉安乡','富里乡'])assert.equal(data.contests.some(c=>c.county_name==='花莲县'&&c.district_name===n),false);
});
