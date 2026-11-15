'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../history-legislative.js'),A=require('../scripts/audit_legacy_legislative_boundaries.cjs');
test('Old district geometry records cross-year provenance and does not pretend it is exact',()=>{
 const target={year:1992,rows:[{electorate:'regional',level:'district',county:'台北市',district:'第1选举区'}]};
 const reference={year:1995,rows:[{electorate:'regional',level:'town',county:'台北市',district:'第1选举区',town:'士林区'}]};
 const map={towns:[{id:'x',county:'台北市',name:'士林区',d:'M0,0L1,1Z',box:[0,0,1,1]}]};
 const f=L.districtGeometry(target,reference,map)[0];
 assert.equal(f.historicalBoundarySourceYear,1995);
 assert.equal(f.historicalBoundaryQuality,'cross-year');
 assert.equal(f.boundaryApproximate,true);
 assert.match(f.historicalBoundaryNote,/1992年实际划分不同/);
});
test('Old district geometry explicitly flags county fallbacks and unmatched towns',()=>{
 const target={year:2004,rows:[{electorate:'regional',level:'district',county:'台北市',district:'第1选举区'}]};
 const ref={year:2004,rows:[{electorate:'regional',level:'town',county:'台北市',district:'第1选举区',town:'不存在区'}]};
 const map={towns:[],counties:[{id:'c',county:'台北市',name:'台北市',d:'M0,0L2,2Z',box:[0,0,2,2]}]};
 const f=L.districtGeometry(target,ref,map)[0];
 assert.equal(f.historicalBoundaryQuality,'county-fallback');
 assert.deepEqual(f.historicalBoundaryMissingTowns,['不存在区']);
 assert.match(f.historicalBoundaryNote,/整县轮廓仅作位置示意/);
});
test('1992–2004 boundary audit preserves election-year county identity, records source and never labels contemporary outlines exact',()=>{
 const result=A.auditLegacy();
 assert.deepEqual(result.years.map(x=>x.year),[1992,1995,1998,2001,2004]);
 assert.equal(result.years[0].referenceYear,1995);
 assert.equal(result.districts.length,result.years.reduce((n,y)=>n+y.displayedDistricts,0));
 assert.ok(result.districts.every(d=>d.quality!=='exact'&&d.referenceYear));
 assert.deepEqual(result.issues,[],'Missing early-period districts need investigation, not silent substitution');
});
