'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const a=require('../assets/history-local-1994-council.json');
const e=require('../sources/history-1994-lienchiang-incumbency-20261128.json');
test('1994 Lienchiang interim council roster crosscheck preserves ambiguous identity',()=>{const ds=a.districts.filter(d=>d.county===e.county);assert.equal(e.roster.length,12);assert.equal(new Set(e.roster).size,12);assert.equal(e.records.length,5);for(const r of e.records){const d=ds.find(d=>d.number===r.district);const c=d.candidates.find(c=>c[0]===r.ballot_number);assert.deepEqual([c[1],c[2]],[r.name,r.votes]);assert.equal(e.roster.includes(r.name),false);assert.equal(d.incumbent_sources[r.ballot_number].value,false);assert.equal(d.incumbent_sources[r.ballot_number].source_url,e.source_url);}assert.equal(ds.find(d=>d.number===1).incumbent_sources[6],undefined);assert.equal(ds.reduce((n,d)=>n+d.candidates.length,0),15);});
