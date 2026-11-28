const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../sources/history-1994-township.json');
const a = require('../assets/history-local-1994.json');
test('1994 partial winner gender biographies sync without fabricated votes', () => {
 assert.deepEqual(a.partialTownshipReturns,s.partial_counties);
 for(const [county,town,name] of [['桃園縣','八德鄉','李金水'],['澎湖縣','馬公市','楊國夫']]) {
 const rows=s.partial_counties.filter(c=>c.county===county).flatMap(c=>c.winners||[]).filter(w=>w.town===town&&w.name===name);
 assert.equal(rows.length,1); const w=rows[0]; assert.equal(w.gender,'男');assert.ok(w.gender_source_url);assert.ok(w.gender_corroboration_url);assert.equal(w.votes,null);assert.equal(w.ballot_number,null);assert.equal(w.party_recommendation,null);
 }
});
