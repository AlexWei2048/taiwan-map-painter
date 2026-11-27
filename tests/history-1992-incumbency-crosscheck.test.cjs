'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const source=require('../assets/history-legislative-candidates.js');
test('1992 Gao Wenliang incumbent crosscheck preserves raw source code and evidence grade',()=>{
 const id="legislative:1992:regional:台北县:台北县:07:高文良";
 assert.deepEqual(source[1992].candidates[id],['男',false]);
 const e=source[1992].sources.regional.incumbency_supplement.find(x=>x.candidacy_id===id);
 assert.equal(e.original_incumbency_code,'0');assert.equal(e.votes,30345);assert.equal(e.method,'prior_term_roster_crosscheck');assert.ok(e.corroboration_urls.length>=2);
});
