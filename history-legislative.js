(function(root){
 'use strict';
 const YEARS=[1992,1995,1998,2001,2004,2008,2012,2016,2020,2024];
 const YEAR_SET=new Set(YEARS),loads=new Map();let mapLoad=null;
 const LABELS={regional:'区域民代',plains:'平地少数民族民代',mountain:'山地少数民族民代'};
 function ballots(year){
  const items=Object.entries(LABELS).map(([value,label])=>({value,label}));
  items.push({value:'party',label:Number(year)>=2008?'不分区政党票':'不分区席次计算票'});
  return items;
 }
 function levels(year,electorate){
  if(Number(year)===1992)return electorate==='party'?[['county','县市']]:[['district','选举区']];
  if(electorate==='regional')return [['district','选举区']];
  return [['county','县市'],['town','乡镇市区']];
 }
 function renderMode(year,electorate){
  if(electorate==='regional')return Number(year)>=2008?'fill':'badges';
  return 'leader-fill';
 }
 function rows(snapshot,selection={}){
  return (snapshot?.rows||[]).filter(row=>
   (!selection.electorate||row.electorate===selection.electorate)&&
   (!selection.level||row.level===selection.level)&&
   (!selection.county||row.county===selection.county));
 }
 function note(year,electorate){
  if(electorate==='party'&&Number(year)<2008)return '本项并非独立政党票，而是依各党区域及原住民候选人票汇总的席次计算票。';
  if(Number(year)===1992)return '1992年公开机器资料只到选区层，本页不推算乡镇市区票数。';
  return '';
 }
 function districtNumber(value){
  const text=String(value||'');
  const arabic=text.match(/(?:第\s*)?(\d+)\s*(?:选(?:举)?区|選(?:舉)?區)?$/);if(arabic)return Number(arabic[1]);
  const chars={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
  const chinese=text.match(/第([一二三四五六七八九十]+)(?:选(?:举)?区|選(?:舉)?區)$/);if(!chinese)return 0;
  const valueText=chinese[1];if(valueText==='十')return 10;if(valueText.startsWith('十'))return 10+(chars[valueText[1]]||0);if(valueText.endsWith('十'))return (chars[valueText[0]]||0)*10;
  return chars[valueText]||0;
 }
 function districtGeometry(target,reference,map,normalize=s=>s,mergePaths=paths=>paths.join(' '),modernCounty=s=>s,baseTown=s=>s){
  const norm=value=>normalize(String(value||''));
  const townIndex=new Map((map?.towns||[]).map(t=>[norm(modernCounty(t.county))+'|'+norm(baseTown(t.name)),t]));
  const membership=new Map();
  for(const row of reference?.rows||[]){
   if(row.electorate!=='regional'||row.level!=='town')continue;
   const key=norm(row.county)+'|'+districtNumber(row.district),town=norm(baseTown(row.town));
   if(!membership.has(key))membership.set(key,new Set());membership.get(key).add(town);
  }
  const seen=new Set(),features=[];
  for(const row of target?.rows||[]){
   if(row.electorate!=='regional'||row.level!=='district')continue;
   const key=norm(row.county)+'|'+districtNumber(row.district);if(seen.has(key))continue;seen.add(key);
   const townNames=membership.get(key)||new Set(),sources=[...townNames].map(t=>townIndex.get(norm(modernCounty(row.county))+'|'+t)).filter(Boolean);
   if(!sources.length){
    const countyFeature=(map?.counties||[]).find(f=>(norm(f.name||f.county)===norm(row.county)||norm(f.name||f.county)===norm(modernCounty(row.county))));
    if(countyFeature)sources.push(countyFeature);
   }
   if(!sources.length)continue;
   const box=sources.reduce((b,f)=>[Math.min(b[0],f.box[0]),Math.min(b[1],f.box[1]),Math.max(b[2],f.box[2]),Math.max(b[3],f.box[3])],[Infinity,Infinity,-Infinity,-Infinity]);
   features.push({id:'legislative-'+target.year+'-'+key,county:norm(row.county),name:norm(row.district),number:districtNumber(row.district),electorate:'regional',d:mergePaths(sources.map(f=>f.d)),box,center:[(box[0]+box[2])/2,(box[1]+box[3])/2]});
  }
  return features;
 }

 function scopeGeometry(snapshot,map,normalize=s=>s,mergePaths=paths=>paths.join(' '),modernCounty=s=>s,baseTown=s=>s){
  const norm=value=>normalize(String(value||''));
  const byTown=new Map((map?.towns||[]).map(item=>[norm(item.county)+'|'+norm(baseTown(item.name)),item]));
  const seen=new Set(),towns=[],missing=[];
  for(const row of snapshot?.rows||[]){
   if(row.level!=='town'||!row.county||!row.town)continue;
   const county=norm(row.county),town=norm(row.town),key=county+'|'+town;
   if(seen.has(key))continue;seen.add(key);
   if(/乌[坵丘]/.test(town))continue;
   let alias=town;
   if(snapshot.year<=2001&&county==='台南市'&&['中区','西区'].includes(town))alias='中西区';
   if(county==='高雄县'&&norm(baseTown(town))==='三民')alias='那玛夏区';
   const source=byTown.get(norm(modernCounty(county))+'|'+norm(baseTown(alias)));
   if(!source){missing.push({county,town});continue}
   towns.push({...source,id:'legislative-area:'+snapshot.year+':'+key,sourceId:source.id,
    county,name:town,town,modernCounty:source.county,historical:true,historicalYear:snapshot.year,
    historicalBoundaryNote:alias!==town?'当届行政区边界按现有底图合并近似展示':null});
  }
  const names=[...new Set((snapshot?.rows||[]).filter(row=>row.level==='county'&&row.electorate==='regional'&&row.county)
   .map(row=>norm(row.county)).filter(name=>!name.includes('全部地区')&&!name.includes('台闽地区')))];
  const counties=[];
  for(const name of names){
   const members=towns.filter(t=>t.county===name);
   if(members.length){
    const box=members.reduce((b,f)=>[Math.min(b[0],f.box[0]),Math.min(b[1],f.box[1]),Math.max(b[2],f.box[2]),Math.max(b[3],f.box[3])],[Infinity,Infinity,-Infinity,-Infinity]);
    counties.push({id:'legislative-county:'+snapshot.year+':'+name,county:name,name,d:mergePaths([...new Map(members.map(f=>[f.sourceId,f])).values()].map(f=>f.d)),box,
     center:[(box[0]+box[2])/2,(box[1]+box[3])/2],historical:true,historicalYear:snapshot.year});
   }else{
    const source=(map?.counties||[]).find(f=>norm(f.name||f.county)===norm(modernCounty(name)));
    if(source)counties.push({...source,id:'legislative-county:'+snapshot.year+':'+name,county:name,name,historical:true,
     historicalYear:snapshot.year,historicalBoundaryNote:'历史县市缺少可核对的乡镇边界，使用现行县市底图近似展示'});
   }
  }
  return{towns,counties,missing};
 }
 function singleMemberGeometry(snapshot,map,normalize=s=>s,modernCounty=s=>s){
  const norm=value=>normalize(String(value||'')),seen=new Set(),features=[];
  for(const row of snapshot?.rows||[]){
   if(row.electorate!=='regional'||row.level!=='district')continue;
   const number=districtNumber(row.district),key=norm(row.county)+'|'+number;if(seen.has(key))continue;seen.add(key);
   const source=(map?.legislative||[]).find(f=>norm(f.county)===norm(modernCounty(row.county))&&districtNumber(f.number||f.name)===number);
   if(source)features.push({...source,id:'legislative-'+snapshot.year+'-'+key,county:norm(row.county),name:norm(row.district),number,electorate:'regional'});
  }
  return features;
 }
 async function load(year,fetcher=root.fetch){
  year=Number(year);if(!YEAR_SET.has(year))throw Error('不支持的立法机构民代选举年份：'+year);
  if(loads.has(year))return loads.get(year);
  const promise=(async()=>{
   const response=await fetcher('assets/history-legislative-'+year+'.json?v=20261114-name-audit-v3',{cache:'default'});
   if(!response.ok)throw Error(year+'年立法机构民代历史数据 HTTP '+response.status);
   const shard=await response.json();
   if(shard.schemaVersion!==2||shard.year!==year||shard.office!=='legislative'||!Array.isArray(shard.rows)||!shard.rows.length)throw Error(year+'年立法机构民代历史数据校验未通过');
   return shard;
  })();
  loads.set(year,promise);
  try{return await promise}catch(error){loads.delete(year);throw error}
 }
 async function loadMap(fetcher=root.fetch){
  if(!mapLoad)mapLoad=(async()=>{const response=await fetcher('assets/map-legislative.json?v=20261031-split-v25',{cache:'default'});if(!response.ok)throw Error('立法机构民代选区地图 HTTP '+response.status);const map=await response.json();if(!Array.isArray(map.legislative)||map.legislative.length!==73)throw Error('立法机构民代选区地图校验未通过');return map})().catch(error=>{mapLoad=null;throw error});
  return mapLoad;
 }
 const api={YEARS,ballots,levels,renderMode,rows,note,districtNumber,districtGeometry,scopeGeometry,singleMemberGeometry,load,loadMap};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLegislative=api;
})(typeof window==='undefined'?{}:window);
