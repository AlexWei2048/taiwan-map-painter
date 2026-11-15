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
  const national=['national','全部地区（含金门、马祖）'];
  if(electorate==='regional')return [['national','全台总览'],['county','县市'],['district','选举区']];
  if(Number(year)===1992&&['plains','mountain'].includes(electorate))return [national];
  if(Number(year)===1992)return [national,['county','县市']];
  return [national,['county','县市'],['town','乡镇市区']];
 }
 const multiMember=(year,electorate)=>electorate==='regional'&&Number(year)<2008;
 const countyLabelsOnly=(scale,ballot)=>scale==='national'&&ballot==='regional';
 function districtKey(row){return String(row.county||'')+'|'+districtNumber(row.district||row.number||row.name)}
 function winners(snapshot,{county='',district='',electorate='regional'}={}){
  return(snapshot?.rows||[]).filter(row=>row.electorate===electorate&&row.level==='district'&&row.elected===true&&
   (!county||row.county===county)&&(!district||districtKey(row)===districtKey({county:row.county,district})));
 }
 function composition(records){
  const counts=new Map();
  for(const row of records)counts.set(row.party,(counts.get(row.party)||0)+1);
  return [...counts].map(([party,seats])=>({party,seats})).sort((a,b)=>b.seats-a.seats||a.party.localeCompare(b.party,'zh'));
 }
 function seatBadgeComposition(records){return composition(records).map(item=>({...item,winners:records.filter(row=>row.party===item.party)}))}
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
  // Map features already carry the county that existed in the election year.
  // Preserve that county identity: the old 高雄市三民区 and 高雄县三民乡
  // both normalize to today's 高雄市 + 三民, but were very far apart.
  // Normalizing the county BEFORE matching silently sends urban 三民区 to
  // today's 那玛夏区 (formerly 高雄县三民乡).
  const townIndex=new Map(),modernTownIndex=new Map(),historicCounties=new Set();
  for(const town of map?.towns||[]){
   const county=norm(town.county),name=norm(baseTown(town.name)),
    historicKey=county+'|'+name,modernKey=norm(modernCounty(county))+'|'+name;
   historicCounties.add(county);
   if(!townIndex.has(historicKey))townIndex.set(historicKey,town);
   // A normalized key is usable only when uniquely assigned.
   if(modernTownIndex.has(modernKey))modernTownIndex.set(modernKey,null);
   else modernTownIndex.set(modernKey,town);
  }
  const findTown=(county,name)=>{
   const key=norm(county)+'|'+norm(baseTown(name)),exact=townIndex.get(key);
   if(exact)return exact;
   // Only compatibility mode for maps WITHOUT historic-county labels.
   if(historicCounties.has(norm(county)))return null;
   return modernTownIndex.get(norm(modernCounty(county))+'|'+norm(baseTown(name)))||null;
  };
  const membership=new Map();
  for(const row of reference?.rows||[]){
   if(row.electorate!=='regional'||row.level!=='town')continue;
   const key=norm(row.county)+'|'+districtNumber(row.district),town=norm(baseTown(row.town));
   if(!membership.has(key))membership.set(key,new Set());membership.get(key).add(town);
  }
  // Official 2008–2016 whole-town constituencies omitted by some township
  // vote rows. Restore *only* membership verified against period boundaries.
  const verifiedMissing={
   '桃园县|平镇':5,'桃园市|平镇':5,
   '台南县|新市':2,'台南县|左镇':2,
   '台南市|新市':2,'台南市|左镇':2
  };
  if(Number(target?.year)>=2008&&Number(target?.year)<=2016){
   for(const town of map?.towns||[]){
    const county=norm(town.county),base=norm(baseTown(town.name));
    const district=verifiedMissing[county+'|'+base];
    if(!district)continue;
    const key=county+'|'+district;
    if(!membership.has(key))membership.set(key,new Set());
    membership.get(key).add(base);
   }
  }
  const seen=new Set(),features=[];
  for(const row of target?.rows||[]){
   if(row.electorate!=='regional'||row.level!=='district')continue;
   const key=norm(row.county)+'|'+districtNumber(row.district);if(seen.has(key))continue;seen.add(key);
   const townNames=membership.get(key)||new Set(),sources=[...townNames].map(t=>findTown(row.county,t)).filter(Boolean);
   if(!sources.length){
    const countyFeature=(map?.counties||[]).find(f=>(norm(f.name||f.county)===norm(row.county)||norm(f.name||f.county)===norm(modernCounty(row.county))));
    if(countyFeature)sources.push(countyFeature);
   }
   if(!sources.length)continue;
   // Village-split constituencies can share a township in historical returns.
   // Township data alone cannot recreate the precise old village boundary.
   const approximate=[...townNames].some(town=>[...membership].some(([other,names])=>
    other!==key&&other.startsWith(norm(row.county)+'|')&&names.has(town)));
   const box=sources.reduce((b,f)=>[Math.min(b[0],f.box[0]),Math.min(b[1],f.box[1]),Math.max(b[2],f.box[2]),Math.max(b[3],f.box[3])],[Infinity,Infinity,-Infinity,-Infinity]);
   features.push({id:'legislative-'+target.year+'-'+key,county:norm(row.county),name:norm(row.district),number:districtNumber(row.district),electorate:'regional',sourceTownIds:sources.map(f=>f.sourceId||f.id).filter(Boolean),d:mergePaths(sources.map(f=>f.d)),box,center:[(box[0]+box[2])/2,(box[1]+box[3])/2],...(approximate?{historicalBoundaryNote:'本届选区涉及乡镇市区内部村里分割；现有底图按乡镇市区近似，不代表精确村里界线',boundaryApproximate:true}:{})});
  }
  // Kaohsiung's Qianzhen township was split among constituencies at
  // village level, not a whole-town district. Preserve its shape as a neutral
  // explicitly unresolved polygon instead of either a white hole or a falsely
  // coloured winner. A village-accurate reconstruction can replace this.
  if(Number(target?.year)>=2008&&Number(target?.year)<=2016){
   for(const town of map?.towns||[]){
    if(norm(town.county)!=='高雄市'||norm(baseTown(town.name))!=='前镇')continue;
    features.push({id:'legislative-unresolved-'+target.year+'-qianzhen',
     county:'高雄市',name:'前镇区（历史选区分割待核对）',
     number:0,electorate:'regional',d:town.d,box:town.box,
     center:town.center||[(town.box[0]+town.box[2])/2,(town.box[1]+town.box[3])/2],
     sourceTownIds:[town.sourceId||town.id].filter(Boolean),
     unresolvedHistorical:true,boundaryApproximate:true,
     historicalBoundaryNote:'前镇区在本届由两个选区按村里分割，目前以中性底色示意，未将任何候选人得票错误归属'});
    break;
   }
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
 // The 2020 redistricting altered five counties; never assign their 2024
 // polygons to 2008–2016 constituency numbers.
 const REDISTRICTED_2020_COUNTIES=new Set(['台中市','台南市','高雄市','新竹县','屏东县']);
 function periodSingleMemberGeometry(snapshot,modernMap,historicalMap,
  normalize=s=>s,mergePaths=parts=>parts.join(' '),modernCounty=s=>s,baseTown=s=>s){
  const norm=v=>normalize(String(v||''));
  const modern=singleMemberGeometry(snapshot,modernMap,normalize,modernCounty);
  if(snapshot.year>=2020)return modern;
  const historical=districtGeometry(snapshot,snapshot,historicalMap,normalize,mergePaths,modernCounty,baseTown);
  const a=new Map(modern.map(f=>[norm(f.county)+'|'+f.number,f]));
  const b=new Map(historical.map(f=>[norm(f.county)+'|'+f.number,f]));
  const expected=new Map();
  for(const row of snapshot.rows||[]){
   if(row.level!=='district'||row.electorate!=='regional')continue;
   const key=norm(row.county)+'|'+districtNumber(row.district);
   expected.set(key,norm(row.county));
  }
  const missing=[],selected=[];
  for(const [key,county]of expected){
   const changed=REDISTRICTED_2020_COUNTIES.has(norm(modernCounty(county)));
   const feature=changed?b.get(key):a.get(key)||b.get(key);
   if(!feature){missing.push(key);continue}
   selected.push({...feature,geometryPeriod:'2008–2016',
    ...(changed?{historicalBoundaryNote:feature.historicalBoundaryNote||
      '依当年乡镇市区投票归属重建；缺少村里级历史界线时为近似轮廓'}:{})});
  }
  if(missing.length)throw Error(snapshot.year+'年区域选区地图缺少：'+missing.join('、'));
  // Carry the village-split city fallback into 2008–2016 national maps.
  selected.push(...historical.filter(f=>f.unresolvedHistorical));
  return selected;
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
 const api={YEARS,ballots,levels,multiMember,countyLabelsOnly,seatBadgeComposition,districtKey,winners,composition,renderMode,rows,note,districtNumber,districtGeometry,scopeGeometry,singleMemberGeometry,periodSingleMemberGeometry,load,loadMap};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLegislative=api;
})(typeof window==='undefined'?{}:window);
