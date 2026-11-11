'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const P=require('../history-presidential.js');
const Core=require('../history-core.js');
const root=path.join(__dirname,'..');
const data=JSON.parse(fs.readFileSync(path.join(root,'assets/map-base.json'),'utf8'));
const shards=year=>JSON.parse(fs.readFileSync(path.join(root,'assets','history-president-'+year+'.json'),'utf8'));

test('all eight shards preserve historical boundaries and reconcile vote totals',()=>{
 const countyCounts={1996:25,2000:25,2004:25,2008:25,2012:22,2016:22,2020:22,2024:22};
 for(const year of P.YEARS){
  const shard=shards(year);
  assert.equal(shard.contests.length,countyCounts[year],year+' expected county list');
  assert.equal(shard.national.valid_votes,shard.contests.reduce((sum,c)=>sum+c.valid_votes,0));
  const joined=P.geometry(shard,data,x=>x,Core.mergePaths);
  assert.equal(joined.counties.length,countyCounts[year],year+' historical county shapes');
  assert.equal(joined.towns.length,shard.geography.town_count-joined.missing.length-joined.merges.length,year+' township coverage');
  assert.equal(joined.merges.length,year<=2000?1:0,year+' documented historical Tainan boundary merges');
  assert.ok(joined.missing.every(m=>m.exception),year+' unexpected missing township: '+JSON.stringify(joined.missing));
  assert.equal(new Set(joined.towns.map(t=>t.id)).size,joined.towns.length,'historical town IDs must be unique');
  assert.ok(joined.counties.every(c=>c.d&&c.memberCount>0),'all old county geometries built from towns');
 }
});

test('2008 historical Taichung, Tainan and Kaohsiung county and city remain separate',()=>{
 const shard=shards(2008),joined=P.geometry(shard,data,x=>x,Core.mergePaths);
 for(const city of ['台中','台南','高雄']){
  const county=joined.counties.find(c=>c.name===city+'县');
  const districtCity=joined.counties.find(c=>c.name===city+'市');
  assert.ok(county,city+' old county');
  assert.ok(districtCity,city+' old city');
  assert.notEqual(county.id,districtCity.id);
  assert.notEqual(county.d,districtCity.d);
 }
});


test('every historical county is an exact union of its own nonoverlapping towns',()=>{
 const modern=new Map(data.towns.map(t=>[t.id,t]));
 for(const year of P.YEARS){
  const geom=P.geometry(shards(year),data,x=>x,Core.mergePaths);
  const used=new Set();
  for(const f of geom.towns){
   assert.ok(modern.has(f.sourceId),year+': unrecognized modern source town '+f.county+' '+f.town);
   assert.equal(f.d,modern.get(f.sourceId).d,year+': historical polygon differs from source');
   assert.equal(P.modernCounty(f.county),f.modernCounty,year+': historic county assigned to wrong modern municipality');
   assert.ok(!used.has(f.sourceId),year+': same polygon drawn in two historic administrative areas: '+f.sourceId);
   used.add(f.sourceId);
  }
  for(const county of geom.counties){
   const own=geom.towns.filter(t=>t.county===county.name);
   assert.equal(own.length,county.memberCount,year+': county member count incorrect: '+county.name);
   assert.equal(county.d,Core.mergePaths(own.map(t=>t.d)),year+': county outline includes extraneous town '+county.name);
   const boxes=own.map(t=>t.box);
   const exact=[Math.min(...boxes.map(x=>x[0])),Math.min(...boxes.map(x=>x[1])),
                Math.max(...boxes.map(x=>x[2])),Math.max(...boxes.map(x=>x[3]))];
   assert.deepEqual(county.box,exact,year+': bounds include another county: '+county.name);
  }
 }
});

test('pre-merger Taichung/Tainan/Kaohsiung city and county never share polygon sources',()=>{
 const counts={
   '台中市':8,'台中县':21,
   '台南市':6,'台南县':31,
   '高雄市':11,'高雄县':27,
 };
 for(const year of [2004,2008]){
  const geom=P.geometry(shards(year),data,x=>x,Core.mergePaths);
  for(const [county,count] of Object.entries(counts)){
   assert.equal(geom.towns.filter(t=>t.county===county).length,count,year+' '+county+' count');
  }
  for(const city of ['台中','台南','高雄']){
   const oldCity=new Set(geom.towns.filter(t=>t.county===city+'市').map(t=>t.sourceId));
   const oldCounty=new Set(geom.towns.filter(t=>t.county===city+'县').map(t=>t.sourceId));
   assert.ok([...oldCounty].every(id=>!oldCity.has(id)),year+' '+city+' includes neighboring county');
   const currentCounty=data.towns.filter(t=>P.modernCounty(city+'县')===t.county);
   assert.equal(oldCity.size+oldCounty.size,currentCounty.length,year+' '+city+' current shape does not partition into old city/county');
  }
 }
});
