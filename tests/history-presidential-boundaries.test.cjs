'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const begin=app.indexOf('function sharedBoundaryGeometry(features,includeCoast=false){');
const end=app.indexOf('\nconst EMPTY_SHARED_BORDER_FEATURES=',begin);
assert.ok(begin>=0&&end>begin,'extract unchanged boundary algorithm');
const calculate=new Function(app.slice(begin,end)+';return sharedBoundaryGeometry')();

test('historic county boundaries include the old city/county dividing line, without inner town lines',()=>{
 const towns=[
  {id:'old-city-d1',county:'旧市',d:'M0,0L1,0L1,1L0,1Z'},
  {id:'old-county-d1',county:'旧县',d:'M1,0L2,0L2,1L1,1Z'},
  {id:'old-county-d2',county:'旧县',d:'M2,0L3,0L3,1L2,1Z'},
 ];
 const nationalCounties=calculate(towns,false,true);
 assert.equal(nationalCounties.all,'M1,0L1,1','only historic city/county division is shown nationwide');
 const selectedCounties=calculate(towns,true,true);
 assert.ok(selectedCounties.byCounty['旧市'].includes('0,0'));
 assert.ok(!selectedCounties.byCounty['旧市'].includes('3,0'),'old city cannot show old county outskirts');
 assert.ok(selectedCounties.byCounty['旧县'].includes('3,0'),'old county outer shoreline stays');
 assert.doesNotMatch(selectedCounties.all,/M2,0L2,1|M2,1L2,0/,'within-old-county town line is not a county line');
 const townLines=calculate(towns,false,false);
 assert.match(townLines.all,/M2,0L2,1|M2,1L2,0/,'town subdivision still visible at town layer');
 assert.match(app,/historicalPresidential\?\[\]:/,'historic layout cannot include merged modern county extent');
 assert.match(app,/const historicTowns=.*History2022View\.historicTownFeatures/,'old administrative mesh comes from historic features');
});

test('all geographical borders are keyed by the historical county, not the modern merged county',()=>{
 const oldCity={id:'taichung-city',county:'台中市',d:'M0,0L1,0L1,1L0,1Z'};
 const oldCounty={id:'taichung-county',county:'台中县',d:'M1,0L2,0L2,1L1,1Z'};
 const countyBorders=calculate([oldCity,oldCounty],true,true);
 assert.ok(countyBorders.byCounty['台中市']);
 assert.ok(countyBorders.byCounty['台中县']);
 assert.notEqual(countyBorders.byCounty['台中市'],countyBorders.byCounty['台中县']);
 assert.equal(countyBorders.byCounty['台中市'].includes('2,0'),false);
 assert.equal(countyBorders.byCounty['台中县'].includes('0,0'),false);
});
