'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const a=require('../assets/history-local-1994-council.json');
const ev=require('../sources/history-1994-incumbency-disambiguation-20261127.json');
test('1994 incumbent disambiguation retains candidate identity and evidence',()=>{
 for(const r of ev.records){const ds=a.districts.filter(d=>d.county===r.county);assert.equal(ds.flatMap(d=>d.candidates).filter(c=>c[1]===r.name).length,1);const d=ds.find(d=>d.number===r.district);const c=d.candidates.find(c=>c[0]===r.ballot_number);assert.deepEqual([c[1],c[2]],[r.name,r.votes]);const s=d.incumbent_sources[String(c[0])];assert.equal(s.value,r.value);assert.equal(s.source_url,r.source_url);}
});
