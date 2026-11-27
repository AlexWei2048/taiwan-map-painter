'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const a=require('../assets/history-local-1994-council.json');
const p=require('../sources/history-1994-hsinchu-city-council-profile.json');
const ev=require('../sources/history-1994-hsinchu-tainan-incumbency-20261127.json');
test('Hsinchu 1994 official municipal statistics reconcile with five constituencies',()=>{
 const ds=a.districts.filter(d=>d.county===p.county);
 assert.equal(ds.length,5);
 for(const field of ['registered_voters','ballots_cast','valid_votes','invalid_votes']) assert.equal(ds.reduce((n,d)=>n+d[field],0),p[field]);
 assert.equal(p.ballots_cast,p.valid_votes+p.invalid_votes);
 assert.equal(ds.flatMap(d=>d.candidates).filter(c=>c[5]).length,26);
 assert.deepEqual(a.verified_county_profiles.find(d=>d.county===p.county),p);
});
test('1994 documented incumbent biographies match unique candidate identity and unchanged votes',()=>{
 for(const r of ev.records){
 const ds=a.districts.filter(d=>d.county===r.county);
 assert.equal(ds.flatMap(d=>d.candidates).filter(c=>c[1]===r.name).length,1);
 const d=ds.find(d=>d.number===r.number);
 const c=d.candidates.find(c=>c[0]===r.ballot);
 assert.deepEqual([c[1],c[2]],[r.name,r.votes]);
 assert.equal(d.incumbent_sources[String(r.ballot)].value,true);
 assert.equal(d.incumbent_sources[String(r.ballot)].source_url,r.source_url);
 }
});
