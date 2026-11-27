'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const archive=require('../assets/history-local-1994-council.json');
const ev=require('../sources/history-1994-council-bulletin-biographies-20261127.json');
test('1994 bulletin biographies preserve exact unique identities, vote totals and source confidence',()=>{
 for(const r of ev.records){const ds=archive.districts.filter(d=>d.county===r.county);assert.equal(ds.flatMap(d=>d.candidates).filter(c=>c[1]===r.name).length,1);const d=ds.find(d=>d.number===r.district&&d.electorate===r.electorate);const c=d.candidates.find(c=>c[0]===r.ballot_number);assert.deepEqual([c[1],c[2]],[r.name,r.votes]);const s=d.incumbent_sources[String(r.ballot_number)];assert.equal(s.value,r.value);assert.equal(s.source_url,r.source_url);assert.equal(s.confidence,r.confidence);}
});
