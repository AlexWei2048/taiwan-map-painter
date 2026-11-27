const test=require('node:test'),assert=require('node:assert/strict'),Q=require('../history-query-cache.js');
test('Concurrent queries share requests, retry failed requests and retain recent settled entries',async()=>{const c=Q.createCache(2);let calls=0;const loader=async()=>++calls;assert.deepEqual(await Promise.all([c.get('a',loader),c.get('a',loader)]),[1,1]);await c.get('b',loader);await c.get('a',loader);await c.get('c',loader);assert.equal(c.size(),2);assert.equal(await c.get('a',loader),1);await assert.rejects(c.get('bad',()=>{throw Error('network')}));assert.equal(await c.get('bad',()=>42),42)});
test('Local snapshots share 2022 data but keep legacy office-specific supplements distinct',async()=>{let loads=0,records=0;const q=Q.createQuery(async(o,y)=>({o,y,id:++loads}),(s,o)=>[{o,id:++records}]);const a=await q.snapshot('mayor',2022),b=await q.snapshot('council',2022);assert.equal(a,b);assert.equal(q.candidates(a,'mayor'),q.candidates(b,'mayor'));assert.notEqual(q.candidates(a,'mayor'),q.candidates(b,'council'));assert.notEqual(await q.snapshot('mayor',1994),await q.snapshot('council',1994));assert.equal(Q.snapshotKey('legislative',2022),'legislative|2022')});

test('Bounded caches retain in-flight deduplication during bursts, evict settled entries and retry failed downloads',async()=>{const c=Q.createCache(2),resolvers=[];let calls=0;const load=()=>new Promise(resolve=>{calls++;resolvers.push(resolve)});const a=c.get('a',load),b=c.get('b',load),d=c.get('c',load);assert.equal(c.get('a',load),a);await Promise.resolve();assert.equal(calls,3);assert.equal(c.stats().inFlight,3);resolvers[0](1);resolvers[1](2);resolvers[2](3);await Promise.all([a,b,d]);assert.equal(c.stats().settled,2);assert.equal(c.stats().inFlight,0);await assert.rejects(c.get('failed',()=>Promise.reject(Error('retry'))));assert.equal(await c.get('failed',()=>4),4);c.clear();assert.equal(c.size(),0)});

test('2026 official release changes invalidate only current election query entries',async()=>{
 let version='first',calls=0;
 const q=Q.createQuery(async(o,y)=>({o,y,version,calls:++calls}),()=>[],12,()=>version);
 const historical=await q.snapshot('mayor',2022),first=await q.snapshot('mayor',2026);
 assert.equal(first,await q.snapshot('council',2026));
 version='second';
 const revised=await q.snapshot('township',2026);
 assert.notEqual(first,revised);assert.equal(revised.version,'second');
 assert.equal(revised,await q.snapshot('mayor',2026));
 assert.equal(historical,await q.snapshot('council',2022));
 assert.equal(calls,3);
});
