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
  assert.equal(joined.towns.length,shard.geography.town_count-joined.missing.length,year+' township coverage');
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
