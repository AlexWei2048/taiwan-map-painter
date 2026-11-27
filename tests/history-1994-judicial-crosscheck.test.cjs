'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const a=require('../assets/history-local-1994-council.json'),p=require('../sources/history-1994-judicial-and-roster-crosscheck-20261127.json');
test('Yunlin 1994 sixth constituency matches official judicial record',()=>{const r=p.verified_records[0],d=a.districts.find(d=>d.county===r.county&&d.number===r.district_number);assert.equal(d.seats,r.seats);assert.equal(d.candidates.length,r.candidate_count);for(const x of r.candidates){const c=d.candidates.find(c=>c[0]===x.ballot_number);assert.deepEqual([c[1],c[2],c[5]],[x.name,x.votes,x.elected]);}});
