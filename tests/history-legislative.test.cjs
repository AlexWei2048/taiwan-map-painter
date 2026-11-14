const test=require('node:test');
const assert=require('node:assert/strict');
const Legislative=require('../history-legislative.js');

test('offers all ten regular legislative election years',()=>{
 assert.deepEqual(Legislative.YEARS,[1992,1995,1998,2001,2004,2008,2012,2016,2020,2024]);
});

test('uses era-correct ballot labels',()=>{
 assert.equal(Legislative.ballots(2004).find(x=>x.value==='party').label,'不分区席次计算票');
 assert.equal(Legislative.ballots(2008).find(x=>x.value==='party').label,'不分区政党票');
});

test('1992 degrades to district level while later list votes offer three levels',()=>{
 assert.deepEqual(Legislative.levels(1992,'regional'),[['district','选举区']]);
 assert.deepEqual(Legislative.levels(2024,'party'),[['county','县市'],['town','乡镇市区']]);
});

test('single-seat regional races use fills and old multi-seat races use badges',()=>{
 assert.equal(Legislative.renderMode(2004,'regional'),'badges');
 assert.equal(Legislative.renderMode(2008,'regional'),'fill');
 assert.equal(Legislative.renderMode(2024,'plains'),'leader-fill');
});

test('filters compact rows by ballot, level and county',()=>{
 const snapshot={rows:[
  {electorate:'party',level:'town',county:'金门县',town:'金城镇',name:'甲'},
  {electorate:'party',level:'town',county:'连江县',town:'南竿乡',name:'乙'},
  {electorate:'regional',level:'district',county:'金门县',name:'丙'}
 ]};
 assert.equal(Legislative.rows(snapshot,{electorate:'party',level:'town'}).length,2);
 assert.equal(Legislative.rows(snapshot,{electorate:'party',level:'town',county:'金门县'}).length,1);
});

test('builds old multi-member constituencies from their township membership',()=>{
 const target={year:1992,rows:[
  {electorate:'regional',level:'district',county:'台北市',district:'台北市第一选区'},
  {electorate:'regional',level:'district',county:'台北市',district:'台北市第二选区'}
 ]};
 const reference={rows:[
  {electorate:'regional',level:'town',county:'台北市',district:'台北市第1选区',town:'松山区'},
  {electorate:'regional',level:'town',county:'台北市',district:'台北市第2选区',town:'中正区'}
 ]};
 const map={towns:[
  {county:'台北市',name:'松山区',d:'M1',box:[0,0,1,1]},
  {county:'台北市',name:'中正区',d:'M2',box:[1,0,2,1]}
 ]};
 const features=Legislative.districtGeometry(target,reference,map,s=>s,paths=>paths.join(' '),s=>s,s=>s);
 assert.equal(features.length,2);
 assert.equal(features[0].county,'台北市');
 assert.equal(features[0].name,'台北市第一选区');
 assert.equal(features[0].d,'M1');
 assert.equal(features[1].d,'M2');
});

test('maps single-member districts onto modern county names without losing historical keys',()=>{
 const snapshot={year:2008,rows:[{electorate:'regional',level:'district',county:'台北县',district:'台北县第01选区'}]};
 const map={legislative:[{county:'新北市',name:'第1选区',number:1,d:'M',box:[0,0,1,1],center:[.5,.5]}]};
 const features=Legislative.singleMemberGeometry(snapshot,map,s=>s,s=>s==='台北县'?'新北市':s);
 assert.equal(features.length,1);
 assert.equal(features[0].county,'台北县');
 assert.equal(features[0].name,'台北县第01选区');
 assert.equal(features[0].d,'M');
});


test('recognizes official long and Chinese-numeral constituency names without collapsing districts',()=>{
 const Core=require('../history-core.js');
 assert.equal(Core.districtNumber('台北市第一选区'),'1');
 assert.equal(Core.districtNumber('台北市第02選舉區'),'2');
 assert.equal(Legislative.districtNumber('台北市第01選舉區'),1);
 assert.equal(Legislative.districtNumber('台北市第二选区'),2);
 const target={year:2004,rows:[
  {electorate:'regional',level:'district',county:'台北市',district:'台北市第1选举区'},
  {electorate:'regional',level:'district',county:'台北市',district:'台北市第2选举区'}
 ]};
 const reference={rows:[
  {electorate:'regional',level:'town',county:'台北市',district:'台北市第1选举区',town:'士林区'},
  {electorate:'regional',level:'town',county:'台北市',district:'台北市第2选举区',town:'中正区'}
 ]};
 const map={towns:[{county:'台北市',name:'士林区',d:'M1',box:[0,0,1,1]},{county:'台北市',name:'中正区',d:'M2',box:[1,0,2,1]}]};
 const features=Legislative.districtGeometry(target,reference,map);
 assert.equal(features.length,2);
 assert.deepEqual(features.map(x=>x.d),['M1','M2']);
});

test('separates former county and city into distinct historical geometry',()=>{
 const snapshot={year:2004,rows:[
  {electorate:'regional',level:'county',county:'台中县'},
  {electorate:'regional',level:'county',county:'台中市'},
  {electorate:'regional',level:'town',county:'台中县',town:'大雅乡'},
  {electorate:'regional',level:'town',county:'台中市',town:'西区'}
 ]};
 const map={towns:[
  {id:'t1',county:'台中市',name:'大雅区',d:'M1',box:[0,0,1,1]},
  {id:'t2',county:'台中市',name:'西区',d:'M2',box:[1,0,2,1]}
 ]};
 const geo=Legislative.scopeGeometry(snapshot,map,s=>s,paths=>paths.join(' '),s=>s==='台中县'?'台中市':s,s=>s.replace(/[乡区]$/,''));
 assert.equal(geo.counties.length,2);
 assert.deepEqual(geo.counties.map(c=>c.d),['M1','M2']);
 assert.equal(geo.towns[0].county,'台中县');
});
