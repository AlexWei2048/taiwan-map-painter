/* Presidential history: 8 independent year shards and year-appropriate boundaries.
 * Source county/town labels remain those from the election year.
 * Geometry is reused from the site's municipal/township map, never reassigning
 * pre-merger Taichung/Tainan/Kaohsiung cities to their old counties.
 */
(function(root){
 'use strict';
 const YEARS=[1996,2000,2004,2008,2012,2016,2020,2024];
 const YEAR_SET=new Set(YEARS);
 const LEGACY_COUNTY={
  '台北县':'新北市','桃园县':'桃园市',
  '台中县':'台中市','台南县':'台南市','高雄县':'高雄市'
 };
 const norm=value=>String(value||'').trim().replaceAll('臺','台').replaceAll('縣','县').replaceAll('鄉','乡').replaceAll('鎮','镇').replaceAll('區','区');
 const baseTown=value=>norm(value).replace(/[乡镇市区]$/u,'').replace(/^(?:(?:台|臺)湾省)/u,'');
 const modernCounty=name=>LEGACY_COUNTY[norm(name)]||norm(name);
 const exceptions=new Set(['金门县|乌丘乡','金门县|乌坵乡']);
 const activeLoad=new Map();
 function clearPending(){for(const [year,promise] of activeLoad){if(!promise)activeLoad.delete(year)}}
 async function load(year,fetcher=root.fetch){
  year=Number(year);if(!YEAR_SET.has(year))throw Error('不支持的选举年份：'+year);
  if(activeLoad.has(year))return activeLoad.get(year);
  const promise=(async()=>{
   const resp=await fetcher('assets/history-president-'+year+'.json?v=20261111-president-v1',{cache:'default'});
   if(!resp.ok)throw Error(year+'年历史数据 HTTP '+resp.status);
   const shard=await resp.json();
   if(shard.schemaVersion!==2||shard.year!==year||shard.office!=='president'||
      !Array.isArray(shard.contests)||shard.contests.length!==(year<=2008?25:22)||
      !Array.isArray(shard.rows)||shard.rows.length<700||
      !shard.national||shard.national.valid_votes<=10000000){
    throw Error(year+'年历史数据校验未通过');
   }
   const totals=shard.contests.reduce((n,c)=>n+Number(c.valid_votes||0),0);
   if(totals!==shard.national.valid_votes)throw Error(year+'年县市与全台得票数不一致');
   return shard;
  })();
  activeLoad.set(year,promise);
  try{return await promise}catch(error){activeLoad.delete(year);throw error}
 }
 function geometry(shard,map,normalize=s=>s,mergePaths=paths=>paths.join(' ')){
  if(!map||!Array.isArray(map.towns)||!Array.isArray(map.counties))throw Error('地图尚未准备好');
  const simplify=s=>norm(normalize(s));
  const byTown=new Map();
  for(const item of map.towns){
   const key=simplify(item.county)+'|'+baseTown(simplify(item.name));
   if(byTown.has(key))throw Error('地图乡镇市区名称无法唯一对应：'+key);
   byTown.set(key,item);
  }
  const scope=new Map();
  for(const r of shard.rows){
   if(r.level!=='town'||!r.town)continue;
   const key=norm(r.county)+'|'+norm(r.town);
   scope.set(key,{county:norm(r.county),town:norm(r.town)});
  }
  const towns=[],missing=[],merges=[],usedIds=new Set(),usedMerges=new Set();
  for(const {county,town} of scope.values()){
   const historicTainan=shard.year<=2000&&norm(county)==='台南市'&&['中区','西区'].includes(norm(town));
   const mergeKey=historicTainan?'台南市|中区、西区（合并）':'';
   if(mergeKey&&usedMerges.has(mergeKey))continue;
   if(mergeKey)usedMerges.add(mergeKey);
   const alias=historicTainan?'中西区':norm(county)==='高雄县'&&baseTown(town)==='三民'?'那玛夏':town;
   const lookup=simplify(modernCounty(county))+'|'+baseTown(simplify(alias));
   const source=byTown.get(lookup);
   if(!source){
    const exception=exceptions.has(simplify(county)+'|'+simplify(town));
    missing.push({county,town,lookup,exception});
    continue;
   }
   if(usedIds.has(source.id))throw Error('历史乡镇与地图出现多对一对应：'+county+' '+town);
   usedIds.add(source.id);
   const label=historicTainan?'中区、西区（合并）':town;
   if(historicTainan)merges.push({county,formerTowns:['中区','西区'],displayTown:label,note:'旧中区与西区边界无法单独还原；两区得票合并显示'});
   towns.push({...source,id:'president:'+shard.year+':'+county+':'+label,
               county,town:label,name:label,modernCounty:source.county,
               historical:true,historicalYear:shard.year,
               historicalBoundaryNote:historicTainan?'旧中区与西区在本地图合并展示，原始选区得票仍保留':null});
  }
  const unresolved=missing.filter(item=>!item.exception);
  if(unresolved.length){
   throw Error('历史乡镇市区边界无法对应：'+unresolved.slice(0,8).map(x=>x.county+x.town).join('、')+
               (unresolved.length>8?'等'+unresolved.length+'处':''));
  }
  const historicCountyNames=shard.contests.map(c=>norm(c.county_name));
  const counties=[];
  for(const name of historicCountyNames){
   const members=towns.filter(t=>t.county===name);
   if(!members.length)throw Error('没有地图边界的历史县市：'+name);
   const minX=Math.min(...members.map(f=>f.box[0])),
         minY=Math.min(...members.map(f=>f.box[1])),
         maxX=Math.max(...members.map(f=>f.box[2])),
         maxY=Math.max(...members.map(f=>f.box[3]));
   const box=[minX,minY,maxX,maxY],center=[(minX+maxX)/2,(minY+maxY)/2];
   counties.push({id:'president:'+shard.year+':'+name,county:name,name,
      d:mergePaths(members.map(f=>f.d)),box,center,historical:true,
      historicalYear:shard.year,modernCounty:modernCounty(name),
      memberCount:members.length});
  }
  return{counties,towns,missing,merges,countyNames:historicCountyNames};
 }
 const api={YEARS,modernCounty,baseTown,load,geometry,clearPending};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryPresidential=api;
})(typeof window==='undefined'?{}:window);
