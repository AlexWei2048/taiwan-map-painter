const test=require('node:test');
const assert=require('node:assert/strict');
const Legislative=require('../history-legislative.js');

test('offers all ten regular legislative election years',()=>{
 assert.deepEqual(Legislative.YEARS,[1992,1995,1998,2001,2004,2008,2012,2016,2020,2024]);
});

test('uses the renamed party-list mode while preserving era-correct explanatory notes',()=>{
 assert.equal(Legislative.ballots(2004).find(x=>x.value==='party').label,'不分区民代');
 assert.equal(Legislative.ballots(2008).find(x=>x.value==='party').label,'不分区民代');
});

test('legislative map level has no countrywide tier; map range controls all-area coverage',()=>{
 const county=['county','县市'];
 assert.deepEqual(Legislative.levels(1992,'regional'),[county,['district','选举区'],['town','乡镇市区']]);
 assert.deepEqual(Legislative.levels(2024,'regional'),[county,['district','选举区']]);
 assert.deepEqual(Legislative.levels(2024,'party'),[county,['town','乡镇市区']]);
 assert.deepEqual(Legislative.levels(2024,'mountain'),[county,['town','乡镇市区']]);
 for(const electorate of ['regional','party','plains','mountain']){
  assert.deepEqual(Legislative.levels(1992,electorate).map(([v])=>v),
   electorate==='regional'?['county','district','town']:electorate==='party'?['county']:['county','town']);
 }
 for(const year of Legislative.YEARS)for(const electorate of ['regional','plains','mountain','party'])
  assert.equal(Legislative.levels(year,electorate).some(([v])=>v==='national'),false);
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

test('2004 Kaohsiung city constituency does not include former Kaohsiung county Sanmin township',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const Presidential=require('../history-presidential.js'),Core=require('../history-core.js');
 const map=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/map-base.json'),'utf8'));
 const snap=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/history-legislative-2004.json'),'utf8'));
 const focus={...snap,rows:snap.rows.filter(r=>['高雄市','高雄县'].includes(r.county))};
 const area=Legislative.scopeGeometry(focus,map,s=>s,Core.mergePaths,Presidential.modernCounty,Presidential.baseTown);
 const urban=area.towns.find(t=>t.county==='高雄市'&&t.name==='三民区');
 const mountain=area.towns.find(t=>t.county==='高雄县'&&t.name==='三民乡');
 assert.ok(urban,'historical city Sanmin district exists');
 assert.ok(mountain,'historical county Sanmin township exists separately');
 assert.ok(urban.box[1]>440,'urban Sanmin must be close to Kaohsiung port');
 assert.ok(mountain.box[1]<400,'former county Sanmin is in northern mountains');
 const districts=Legislative.districtGeometry(focus,focus,{...map,towns:area.towns,counties:area.counties},
  s=>s,Core.mergePaths,Presidential.modernCounty,Presidential.baseTown);
 const first=districts.find(d=>d.county==='高雄市'&&d.number===1);
 const second=districts.find(d=>d.county==='高雄市'&&d.number===2);
 assert.ok(first&&second,'both 2004 city districts must exist');
 assert.ok(first.box[1]>440,'city first district must not stretch north to the old county mountains');
 assert.ok(first.box[2]<190,'city first district must not stretch east to the old county mountains');
 assert.ok(first.box[3]>=second.box[1]&&second.box[3]>=first.box[1],
  'both urban constituencies occupy overlapping north-south ranges');
 assert.equal(Legislative.winners(snap,{county:'高雄市',district:first.name}).length,6);
 assert.equal(Legislative.winners(snap,{county:'高雄市',district:second.name}).length,5);
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

test('published legislative JSON shards are complete and match the source manifest',()=>{
 const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../sources/history-legislative-manifest.json'),'utf8'));
 for(const year of Legislative.YEARS){
  const source=fs.readFileSync(path.join(__dirname,'../assets/history-legislative-'+year+'.json'));
  const actual=crypto.createHash('sha256').update(source).digest('hex');
  assert.equal(actual,manifest.shards[String(year)],year+' shard checksum must match the reproducible official-source build');
  const snapshot=JSON.parse(source.toString('utf8'));
  assert.equal(snapshot.year,year);
  assert.ok(snapshot.rows.length>100,year+' should have candidate-level history');
 }
});


test('verified name corrections span source candidate IDs and all regional/map-level rows',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const corrections=JSON.parse(fs.readFileSync(path.join(__dirname,'../sources/history-legislative-name-corrections.json'),'utf8')).corrections;
 const shards=new Map();
 for(const entry of corrections){
  if(!shards.has(entry.year))shards.set(entry.year,JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/history-legislative-'+entry.year+'.json'),'utf8')));
  const snap=shards.get(entry.year);
  const matches=snap.candidacies.filter(row=>row.contest_id.split(':')[2]===entry.electorate
   &&row.candidate_name===entry.name&&row.votes===entry.votes&&String(row.ballot_number)===String(entry.ballot_number));
  assert.equal(matches.length,1,entry.year+' '+entry.name+' must identify exactly one candidate');
  assert.ok(matches[0].candidacy_id.endsWith(':'+entry.name));
  assert.ok(snap.rows.some(row=>row.electorate===entry.electorate&&row.name===entry.name),'aggregated map rows must include corrected name');
  assert.equal(snap.rows.some(row=>row.electorate===entry.electorate&&row.name===entry.old_name),false,'obsolete name in maps');
  assert.equal(snap.candidacies.some(row=>row.candidate_name===entry.old_name),false,'obsolete name in candidacies');
 }
});


test('Multi-member history composes party seats from actual winners, not top-vote party guesses',()=>{
 const snap={rows:[
  {electorate:'regional',level:'district',county:'台北市',district:'台北市第一选区',name:'甲',party:'中国国民党',elected:true,votes:9000},
  {electorate:'regional',level:'district',county:'台北市',district:'台北市第一选区',name:'乙',party:'民主进步党',elected:true,votes:8500},
  {electorate:'regional',level:'district',county:'台北市',district:'台北市第二选区',name:'丙',party:'民主进步党',elected:true,votes:7500},
  {electorate:'regional',level:'district',county:'台北市',district:'台北市第二选区',name:'丁',party:'无党籍',elected:false,votes:7400}
 ]};
 assert.equal(Legislative.winners(snap,{county:'台北市'}).length,3);
 assert.deepEqual(Legislative.composition(Legislative.winners(snap,{county:'台北市'})),
  [{party:'民主进步党',seats:2},{party:'中国国民党',seats:1}]);
 assert.equal(Legislative.winners(snap,{county:'台北市',district:'台北市第一选区'}).length,2);
});


test('regional legislative maps expose three navigation levels and historical party badge counts',()=>{
 assert.deepEqual(Legislative.levels(2024,'regional'),[['county','县市'],['district','选举区']]);
 assert.deepEqual(Legislative.levels(2024,'party').map(([id])=>id),['county','town']);
 assert.equal(Legislative.countyLabelsOnly('national','regional'),true);
 assert.equal(Legislative.countyLabelsOnly('county','regional'),false);
 assert.equal(Legislative.countyLabelsOnly('national','plains'),false);
 const records=[{party:'中国国民党',name:'甲'},{party:'民主进步党',name:'乙'},{party:'中国国民党',name:'丙'}];
 assert.deepEqual(Legislative.seatBadgeComposition(records).map(r=>[r.party,r.seats,r.winners.length]),[['中国国民党',2,2],['民主进步党',1,1]]);
});


test('1992 mountain Beimen profile is a proven zero rather than missing data',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const archive=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/history-legislative-1992-local.json'),'utf8'));
 const county=archive.ballots.mountain.counties['台南县'];
 const town=county.towns.find(t=>t[0]==='北门乡');
 assert.deepEqual(town[2],[0,0,0,0]);
 assert.equal(town[1].length,9);
 assert.ok(town[1].every(v=>v===0));
 assert.ok(county.towns.every(t=>Array.isArray(t[2])&&t[2].length===4));
 assert.deepEqual([0,1,2,3].map(i=>county.towns.reduce((sum,t)=>sum+t[2][i],0)),county.profile);
});
