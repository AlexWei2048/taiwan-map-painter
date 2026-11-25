'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const snapshot=require('../assets/history-local-1994.json');
const proof=require('../sources/history-1994-municipal-incumbency.json');
test('1989 city council roster supplements only 34 uniquely identified 1994 incumbency records',()=>{
 assert.equal(proof.updates.length,34);
 assert.equal(new Set(proof.updates.map(r=>r.candidacy_id)).size,34);
 const candidates=new Map(snapshot.candidacies.map(c=>[c.candidacy_id,c]));
 const stats={台北市:0,高雄市:0};
 for(const item of proof.updates){
  const source=proof.sources.find(x=>x.county===item.county);
  assert.ok(source.roster_names.includes(item.name_official),item.candidacy_id);
  assert.equal(item.source_url,source.url);
  const c=candidates.get(item.candidacy_id);assert.ok(c,item.candidacy_id);
  assert.equal(c.candidate_name_official,item.name_official);
  assert.equal(c.ballot_number,item.ballot_number);
  assert.equal(c.votes,item.votes);
  assert.equal(c.incumbent_at_election,true);
  assert.equal(c.incumbent_source,item.source_url);
  assert.equal(c.incumbent_source_method,item.method);
  const district=c.contest_id.split(':')[3];
  const rows=snapshot.rows.filter(r=>r.type==='council'&&r.county===item.county&&r.district===district&&r.number===c.ballot_number&&r.name===c.candidate_name);
  assert.equal(rows.length,1,item.candidacy_id);
  assert.equal(rows[0].votes,c.votes);
  assert.equal(rows[0].incumbent,true);
  stats[item.county]++;
 }
 assert.deepEqual(stats,{台北市:22,高雄市:12});
 const council=snapshot.candidacies.filter(c=>c.contest_id.startsWith('1994-council:台北市:')||c.contest_id.startsWith('1994-council:高雄市:'));
 assert.equal(council.filter(c=>c.contest_id.startsWith('1994-council:台北市:')&&c.incumbent_at_election).length,39);
 assert.equal(council.filter(c=>c.contest_id.startsWith('1994-council:高雄市:')&&c.incumbent_at_election).length,34);
});
