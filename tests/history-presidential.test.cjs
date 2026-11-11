'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../history-presidential.js');

test('historic county identities stay distinct before 2010',()=>{
 assert.deepEqual(P.YEARS,[1996,2000,2004,2008,2012,2016,2020,2024]);
 assert.equal(P.modernCounty('臺中縣'),'台中市');
 assert.equal(P.modernCounty('臺中市'),'台中市');
 assert.equal(P.modernCounty('臺北縣'),'新北市');
 assert.equal(P.baseTown('板橋市'),'板橋');
 assert.equal(P.baseTown('板橋區'),'板橋');
});

test('city and old county do not merge as one historical county',()=>{
 const map={
  counties:[{id:'modern-taichung',name:'台中市'}],
  towns:[
   {id:'modern-center',name:'中区',county:'台中市',d:'M0,0Z',box:[0,0,1,1]},
   {id:'modern-dajia',name:'大甲区',county:'台中市',d:'M2,0Z',box:[2,0,3,1]},
  ]};
 const shard={
  year:2008,
  contests:[{county_name:'台中市'},{county_name:'台中县'}],
  rows:[
   {level:'town',county:'台中市',town:'中区'},
   {level:'town',county:'台中县',town:'大甲镇'},
  ]};
 const geom=P.geometry(shard,map,x=>x,p=>p.join(' '));
 assert.equal(geom.counties.length,2);
 assert.deepEqual(geom.counties.map(c=>c.name),['台中市','台中县']);
 assert.equal(geom.counties[0].d,'M0,0Z');
 assert.equal(geom.counties[1].d,'M2,0Z');
 assert.notEqual(geom.towns[0].county,geom.towns[1].county);
});

test('unrecognized geography is rejected instead of silently drawing another county',()=>{
 const map={counties:[{name:'台北市'}],towns:[{id:'a',name:'中正区',county:'台北市',d:'M0Z',box:[0,0,1,1]}]};
 const shard={year:2024,contests:[{county_name:'台北市'}],rows:[{level:'town',county:'台北市',town:'不存在乡'}]};
 assert.throws(()=>P.geometry(shard,map),/无法对应/);
});

test('failed shard load is retryable; successful load is cached by year',async()=>{
 const empty={ok:true,json:async()=>({schemaVersion:2,year:2024,office:'president',contests:Array.from({length:22},()=>({valid_votes:600000})),rows:Array.from({length:700},()=>({})),national:{valid_votes:13200000}})};
 let attempts=0;
 await assert.rejects(()=>P.load(2024,async()=>{attempts++;return{ok:false,status:503}}),/503/);
 await P.load(2024,async()=>{attempts++;return empty});
 await P.load(2024,async()=>{attempts++;throw Error('should be cached')});
 assert.equal(attempts,2);
});

test('all eight election shards have a verified vice-presidential candidate for each ticket',()=>{
 const fs=require('node:fs'),path=require('node:path');
 for(const year of P.YEARS){
  const data=JSON.parse(fs.readFileSync(path.join(__dirname,'..','assets','history-president-'+year+'.json'),'utf8'));
  const known=P.RUNNING_MATES[year];
  assert.equal(Object.keys(known).length,data.national.candidate_totals.length,year+' complete ticket directory');
  for(const row of data.national.candidate_totals){
   assert.ok(known[row.name],year+' missing deputy for '+row.name);
   assert.equal(P.ticketName(year,row.name),row.name+' & '+known[row.name]);
  }
 }
 assert.equal(P.ticketName(1996,'李登辉'),'李登辉 & 连战');
 assert.equal(P.ticketName(2000,'宋楚瑜'),'宋楚瑜 & 张昭雄');
 assert.notEqual(P.ticketName(1996,'林洋港'),P.ticketName(1996,'陈履安'));
 assert.equal(P.ticketName(2024,'尚未确认候选人'),'尚未确认候选人','no invented running mates');
});
