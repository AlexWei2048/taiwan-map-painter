'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const path=require('node:path');
const Leg=require('../history-legislative.js'),Pre=require('../history-presidential.js'),Core=require('../history-core.js');
const json=p=>JSON.parse(fs.readFileSync(path.join(__dirname,'..','assets',p),'utf8'));
const base=json('map-base.json'),modern=json('map-legislative.json');
const shard=year=>json('history-legislative-'+year+'.json');
const norm=s=>String(s||'').replaceAll('臺','台');
function scope(j){return Leg.scopeGeometry(j,base,norm,Core.mergePaths,Pre.modernCounty,Pre.baseTown)}
function geometry(j,area){return Leg.periodSingleMemberGeometry(j,modern,{...base,towns:area.towns,counties:area.counties},norm,Core.mergePaths,Pre.modernCounty,Pre.baseTown)}
test('Historical local geography includes the offshore Kinmen Wuqiu islands for elections with returns',()=>{
 const source=base.towns.find(f=>f.county==='金门县'&&f.name==='乌坵乡');
 assert.ok(source&&source.d&&source.box,'Wuqiu is a real base-map polygon');
 for(const year of [1995,2004,2008,2012,2016,2020,2024]){
  const j=shard(year),area=scope(j),wu=area.towns.filter(f=>f.county==='金门县'&&f.name==='乌坵乡');
  assert.equal(wu.length,1,year+' Wuqiu must be retained');
  assert.equal(wu[0].d,source.d,year+' Wuqiu outline is the authentic base shape');
  assert.ok(area.counties.find(c=>c.name==='金门县').d.includes(source.d),year+' Kinmen region includes Wuqiu');
 }
 const j=shard(1995),area=scope(j),old=Leg.districtGeometry(shard(1992),j,{...base,towns:area.towns,counties:area.counties},norm,Core.mergePaths,Pre.modernCounty,Pre.baseTown);
 assert.ok(old.some(f=>f.county==='金门县'&&f.d.includes(source.d)),'1992 Kinmen approximated using 1995 town geography includes Wuqiu');
});
test('Every post-2008 single-member district has one elected-result geometry from the correct geographic period',()=>{
 for(const year of [2008,2012,2016,2020,2024]){
  const j=shard(year),area=scope(j),polys=geometry(j,area);
  assert.equal(polys.length,73,year+' districts');
  assert.equal(new Set(polys.map(f=>f.county+'|'+f.number)).size,73,year+' unique district ids');
  assert.ok(polys.every(f=>f.d&&f.box&&f.box.every(Number.isFinite)),year+' complete shapes');
  if(year<2020){
   const pingtung=polys.filter(f=>f.county==='屏东县');
   assert.equal(pingtung.length,3,year+' includes the original third Pingtung district');
   const kaohsiung=polys.filter(f=>f.county==='高雄市');
   if(year>=2012)assert.equal(kaohsiung.length,9,year+' preserves pre-2020 Kaohsiung district 9');
   assert.ok(pingtung.some(f=>f.number===3&&f.geometryPeriod==='2008–2016'));
   assert.ok(polys.some(f=>f.county==='嘉义市'&&f.d),'2012 city shape not left blank');
  }else{
   assert.equal(polys.filter(f=>f.county==='屏东县').length,2,year+' current Pingtung seat allocation');
  }
 }
});
