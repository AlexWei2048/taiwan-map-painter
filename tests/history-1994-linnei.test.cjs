'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const source=require('../sources/history-1994-township.json');
const runtime=require('../assets/history-local-1994.json');
test('1994 Linnei sole candidate returns reconcile without inventing party or ballot number',()=>{
 const d=source.counties.find(x=>x.county==='雲林縣').districts.find(x=>x.town==='林內鄉');
 assert.deepEqual(d.profile,[14220,10640,9868,772]);
 assert.deepEqual(d.candidates,[[null,'鄭文煌',null,'男',9868,true]]);
 const c=runtime.contests.find(x=>x.contest_id==='1994-township:云林县:regional:林内乡');
 assert.equal(c.ballots_cast,c.valid_votes+c.invalid_votes);
 const candidates=runtime.candidacies.filter(x=>x.contest_id===c.contest_id);
 assert.equal(candidates.length,1);assert.equal(candidates[0].votes,c.valid_votes);assert.equal(candidates[0].party_name_official,null);assert.equal(candidates[0].ballot_number,'');
 assert.deepEqual(runtime.partialTownshipReturns,source.partial_counties);
});
