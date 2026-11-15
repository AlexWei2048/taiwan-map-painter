'use strict';
const fs=require('node:fs'),path=require('node:path');
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,'..',f),'utf8'));
const L=require('../history-legislative.js'),P=require('../history-presidential.js'),C=require('../history-core.js');
const map=read('assets/map-base.json'),snap=read('assets/history-legislative-2004.json');
const modern=P.modernCounty,base=P.baseTown,kao='高雄市';
const relevant=snap.rows.filter(x=>x.county===kao&&x.electorate==='regional');
console.log('ASSET',Object.fromEntries(Object.entries(map).map(([k,v])=>[k,Array.isArray(v)?v.length:typeof v])));
console.log('HIST_ROWS',relevant.length,'LEVELS',Object.fromEntries(['town','district','county'].map(k=>[k,relevant.filter(r=>r.level===k).length])));
const towns=map.towns||[];
console.log('MODERN',modern(kao),'TOWNS',towns.filter(f=>f.county===modern(kao)).map(f=>({town:f.name,box:f.box,center:f.center})));
const area=L.scopeGeometry({...snap,rows:snap.rows.filter(x=>x.county===kao)},map,s=>s,C.mergePaths,modern,base);
console.log('AREA_MISSING',area.missing,'AREA_COUNTY',area.counties.map(c=>({name:c.name,box:c.box})));
const legacyMap={...map,towns:area.towns,counties:area.counties};
const geo=L.districtGeometry({...snap,rows:relevant}, {...snap,rows:relevant},legacyMap,s=>s,C.mergePaths,modern,base);
console.log('DISTRICTS',geo.map(g=>({name:g.name,num:g.number,box:g.box,center:g.center,paths:g.d.length})));
const refTownNames=new Map();
for(const r of relevant.filter(r=>r.level==='town')){
 const k=L.districtNumber(r.district);if(!refTownNames.has(k))refTownNames.set(k,new Set());
 refTownNames.get(k).add(r.town);
}
console.log('DISTRICT_TOWNS',Object.fromEntries([...refTownNames].map(([k,v])=>[k,[...v]])));
console.log('SELECTED_TOWNS',area.towns.map(f=>({name:f.name,source:f.sourceId,box:f.box,center:f.center})));
for(const g of geo){
 const b=g.box,other=geo.find(x=>x!==g);
 if(other)console.log('GAP',g.number,other.number,'normalized-width',Math.max(0,other.box[0]-b[2],b[0]-other.box[2]),'normalized-height',Math.max(0,other.box[1]-b[3],b[1]-other.box[3]));
}
