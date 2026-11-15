const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const L=require('../history-legislative.js'),P=require('../history-presidential.js'),C=require('../history-core.js');
const map=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/map-base.json'),'utf8'));
const villages=[1,2,3,4,5].flatMap(i=>JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/map-villages-'+i+'.json'),'utf8'))).filter(v=>v.county==='高雄市'&&['三民区','前镇区'].includes(v.town));
for(const year of [2008,2012,2016]){
 test('historical regional geometric town coverage '+year,()=>{
  const snap=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/history-legislative-'+year+'.json'),'utf8'));
  const area=L.scopeGeometry(snap,map,s=>s,C.mergePaths,P.modernCounty,P.baseTown);
  const geo=L.districtGeometry(snap,snap,{...map,towns:area.towns,counties:area.counties,villages},s=>s,C.mergePaths,P.modernCounty,P.baseTown);
  assert.equal(geo.length,73,'73 elected district polygons, never an extra neutral polygon');
  for(const district of [year===2008?2:5,year===2008?3:6,year===2008?4:7,year===2008?5:9]){
   const item=geo.find(f=>f.county==='高雄市'&&f.number===district);
   assert.ok(item?.historicalVillageSplit,'Kaohsiung district '+district+' must use the official village split');
  }
  const byCounty=new Map();
  for(const f of geo){const k=f.county;if(!byCounty.has(k))byCounty.set(k,new Set());for(const id of f.sourceTownIds||[])byCounty.get(k).add(String(id))}
  const missing=area.towns.filter(f=>!byCounty.get(f.county)?.has(String(f.sourceId||f.id)));
  console.log('REGIONAL_GEOMETRY_COVERAGE',year,'historic town polygons',area.towns.length,'district polygons',geo.length,'unassigned',JSON.stringify(missing.map(f=>f.county+' '+f.name)));
  assert.equal(missing.length,0,'Missing constituency assignment for '+missing.map(f=>f.county+' '+f.name).join(', '));
 });
}
