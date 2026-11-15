'use strict';
/* Audits historical district identities and their drawing provenance.
 * Do not silently manufacture pre-2008 village-level boundaries.
 */
const fs=require('node:fs'),path=require('node:path');
const L=require('../history-legislative.js');
const P=require('../history-presidential.js');
const Core=require('../history-core.js');
const base=path.resolve(__dirname,'..');
const read=name=>JSON.parse(fs.readFileSync(path.join(base,'assets',name),'utf8'));
const norm=s=>String(s||'').replaceAll('臺','台');
const map=read('map-base.json');
const years=[1992,1995,1998,2001,2004];

function auditLegacy(){
 const result={schemaVersion:1,description:'1992—2004 regional constituency boundary provenance; modern polygons are approximations',years:[],districts:[]};
 for(const year of years){
  const shard=read('history-legislative-'+year+'.json');
  const ref=read('history-legislative-'+(year===1992?1995:year)+'.json');
  const area=L.scopeGeometry(ref,map,norm,Core.mergePaths,P.modernCounty,P.baseTown);
  const actual=L.districtGeometry(shard,ref,{...map,towns:area.towns,counties:area.counties},norm,Core.mergePaths,P.modernCounty,P.baseTown);
  const districtIDs=new Set(shard.rows.filter(x=>x.electorate==='regional'&&x.level==='district')
    .map(x=>norm(x.county)+'|'+L.districtNumber(x.district)));
  const actualIDs=new Set(actual.map(x=>x.county+'|'+x.number));
  const missing=[...districtIDs].filter(x=>!actualIDs.has(x));
  const duplicate=actual.length-actualIDs.size;
  const qualities={};
  const affected=[];
  for(const f of actual){
   const quality=f.historicalBoundaryQuality||'unclassified';
   qualities[quality]=(qualities[quality]||0)+1;
   if(!f.historicalBoundaryNote||!f.boundaryApproximate)affected.push(f.id+':unmarked approximation');
   result.districts.push({year,county:f.county,number:f.number,referenceYear:f.historicalBoundarySourceYear,
    quality,sourceTownCount:(f.historicalBoundarySourceTowns||[]).length,
    missingTowns:f.historicalBoundaryMissingTowns||[],sourceTownIds:f.sourceTownIds||[],
    caveat:f.historicalBoundaryNote||''});
  }
  result.years.push({year,referenceYear:ref.year,officialDistricts:districtIDs.size,
   displayedDistricts:actualIDs.size,missing,duplicate,quality:qualities,
   unmarkedApproximations:affected,unmappedAdministrativeUnits:area.missing});
 }
 result.issues=result.years.flatMap(y=>[
  ...y.missing.map(k=>y.year+': no district geometry '+k),
  ...(y.duplicate?[y.year+': '+y.duplicate+' duplicate district geometries']:[]),
  ...y.unmarkedApproximations.map(x=>y.year+': '+x)
 ]);
 return result;
}
function saveReport(output=path.join(base,'reports','historic-legislative-boundary-audit.json')){
 const report=auditLegacy();
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log('HISTORICAL_BOUNDARY_AUDIT',JSON.stringify(report.years.map(y=>({
  year:y.year,official:y.officialDistricts,displayed:y.displayedDistricts,reference:y.referenceYear,
  quality:y.quality,missing:y.missing.length,unmappedTowns:y.unmappedAdministrativeUnits.length
 }))));
 if(report.issues.length){console.error(report.issues.join('\n'));process.exitCode=1}
 return report;
}
module.exports={auditLegacy,saveReport};
if(require.main===module)saveReport(process.argv[2]);
