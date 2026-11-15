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

function rings(d){return d.split(/M/i).filter(Boolean).map(part=>{const nums=part.match(/-?(?:[0-9]*[.])?[0-9]+(?:e[+-]?[0-9]+)?/gi)?\\d+(?:e[+-]?\\d+)?/gi)||[];return Array.from({length:Math.floor(nums.length/2)},(_,i)=>[+nums[2*i],+nums[2*i+1]])}).filter(v=>v.length>=3)}
function contains(rs,x,y){let inside=false;for(const poly of rs){for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside}}return inside}
for(const g of geo){
 const names=[...(refTownNames.get(g.number)||[])];
 const original=area.towns.filter(t=>names.includes(t.name));
 console.log('GEOMETRY_AUDIT',g.number,
  'sources',original.map(t=>({name:t.name,length:t.d.length,rings:rings(t.d).length})),
  'mergedRings',rings(g.d).length,'mergedLength',g.d.length);
 const raw=original.map(t=>rings(t.d)),merged=rings(g.d);
 let sourceCount=0,mergedCount=0,missing=0;
 for(let i=0;i<65;i++)for(let j=0;j<65;j++){
  const x=g.box[0]+(j+.5)*(g.box[2]-g.box[0])/65;
  const y=g.box[1]+(i+.5)*(g.box[3]-g.box[1])/65;
  const originalInside=raw.some(rs=>contains(rs,x,y));
  const mergedInside=contains(merged,x,y);
  if(originalInside){sourceCount++;if(!mergedInside)missing++}
  if(mergedInside)mergedCount++;
 }
 console.log('COVERAGE_AUDIT',g.number,{sourceCount,mergedCount,missing,percentMissing:Math.round(100*missing/Math.max(1,sourceCount))});
}
