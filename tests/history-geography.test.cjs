const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../history-core.js');
test('Historical geography merges shared borders while preserving separate islands',()=>{
 const d=Core.mergePaths(['M0,0L1,0L1,1L0,1Z','M1,0L2,0L2,1L1,1Z','M4,0L5,0L5,1L4,1Z']);
 assert.equal((d.match(/M/g)||[]).length,2);
 const rings=d.split('M').filter(Boolean).map(x=>x.slice(0,-1).split('L').map(p=>p.split(',').map(Number)));
 const area=rings.reduce((sum,r)=>sum+Math.abs(r.reduce((a,p,i)=>a+p[0]*r[(i+1)%r.length][1]-r[(i+1)%r.length][0]*p[1],0))/2,0);
 assert.equal(area,3);
});
test('2022 district metadata and Hsinchu village reconstruction are complete',()=>{
 const raw=JSON.parse(fs.readFileSync('assets/history-council-districts-2022.json'));
 const rows=Array.isArray(raw)?raw:raw.rows;
 assert.equal(rows.length,215);assert.equal(rows.reduce((n,d)=>n+d.seats,0),910);
 const h=JSON.parse(fs.readFileSync('assets/history-hsinchu-geography-2022.json'));
 assert.equal(h.features.length,5);const ids=h.features.flatMap(f=>f.villageIds);
 assert.equal(ids.length,122);assert.equal(new Set(ids).size,122);assert.ok(h.features.every(f=>f.d&&f.box.length===4));
});
