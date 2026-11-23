/* Year-specific local election results and period-appropriate map geography. */
(function(root){
 'use strict';
 const YEARS={
  mayor:[1993,1994,1997,1998,2001,2002,2005,2006,2009,2010,2014,2018,2022],
  council:[1994,1998,2002,2005,2006,2009,2010,2014,2018,2022],
  township:[1998,2002,2005,2009,2014,2018,2022]
 };
 const pending=new Map(),supplementYears=new Set([2002,2005,2009,2010,2014,2018]);
 let supplementRequest;
 async function loadSupplement(fetcher){
  if(!supplementRequest){
   supplementRequest=(async()=>{
    const response=await fetcher('assets/history-local-council-supplement.json?v=20261124-history-review-v1');
    if(!response.ok)throw Error('历史议员补充资料 HTTP '+response.status);
    const supplement=await response.json();
    if(supplement.version!==1||!Array.isArray(supplement.paths)||!supplement.years)throw Error('历史议员补充资料不完整');
    return supplement;
   })().catch(error=>{supplementRequest=null;throw error});
  }
  return supplementRequest;
 }
 function applyCouncilSupplement(shard,supplement){
  const addition=supplement?.years[shard.year];
  if(!addition)return shard;
  const quotas=addition.quotas||{};
  return {...shard,contests:shard.contests.map(contest=>Object.hasOwn(quotas,contest.contest_id)?
   {...contest,reserved_seats:quotas[contest.contest_id]}:contest),councilDistrictGeometry:Object.fromEntries(
   Object.entries(addition.districts||{}).map(([id,entry])=>[id,{...supplement.paths[entry.path],villages:entry.villages}]))};
 }
 function years(office,include2026=false){
  const list=YEARS[office]||[2022];
  return include2026?[...list,2026]:list;
 }
 async function load(year,fetcher=root.fetch){
  if(!Object.values(YEARS).some(list=>list.includes(year))||year===2022)throw Error('不支持的地方选举年份');
  if(pending.has(year))return pending.get(year);
  const request=(async()=>{
   const [response,supplement]=await Promise.all([
    fetcher('assets/history-local-'+year+'.json?v=20261124-local-results-v1'),
    supplementYears.has(year)?loadSupplement(fetcher):null
   ]);
   if(!response.ok)throw Error('历史数据 HTTP '+response.status);
   const shard=await response.json();
   if(shard.schemaVersion!==2||shard.year!==year||!shard.rows?.length||!shard.candidacies?.length||
      !shard.contests?.length||!shard.elections?.length)throw Error('历史选举数据不完整');
   return applyCouncilSupplement(shard,supplement);
  })();
  pending.set(year,request);
  try{return await request}catch(error){pending.delete(year);throw error}
 }
 function geometry(shard,map,reference,normalize,mergePaths,modernCounty,baseTown){
  const year=shard.year,modern=reference===null;
  const lookup=(county,town)=>{
   const base=baseTown(town);
   const name=county==='金门县'&&base==='乌丘'?'乌坵':county==='高雄县'&&base==='三民'?'那玛夏':base;
   return modernCounty(county)+'|'+name;
  };
  const historicPair=(county,town)=>county+'|'+lookup(county,town);
  const base=new Map(map.towns.map(town=>[lookup(normalize(town.county),normalize(town.name)),town]));
  const aliases=new Map();
  for(const row of shard.rows){
   if(row.level==='town'&&row.town)aliases.set(historicPair(row.county,row.town),row.town);
  }
  for(const contest of shard.contests){
   for(const town of contest.scope_names||[]){
    const key=historicPair(contest.county_name,town);
    if(!aliases.has(key))aliases.set(key,town);
   }
  }

  const shapesByCounty=new Map();
  if(modern){
   for(const county of map.counties)shapesByCounty.set(county.name,map.towns.filter(town=>town.county===county.name));
  }else{
   // 2008 gives the pre-merger membership of both former counties and cities.
   // A county's constituent town polygons can be reused without merging votes.
   const historic=new Map();
   for(const row of reference.rows){
    if(row.level!=='town'||!row.town)continue;
    const county=normalize(row.county),town=normalize(row.town),shape=base.get(lookup(county,town));
    if(!shape)continue;
    if(!historic.has(county))historic.set(county,new Map());
    historic.get(county).set(shape.id,{...shape,name:town});
   }
   for(const [county,towns] of historic){
    const upgraded=['台北县','台中县','台南县','高雄县'].includes(county);
    if(year>=2010&&upgraded)continue;
    const restructured=year>=2010&&['台中市','台南市','高雄市'].includes(county);
    if(!restructured)shapesByCounty.set(year>=2010&&county==='台北县'?'新北市':county,[...towns.values()]);
   }
   if(year>=2010)for(const county of ['新北市','台中市','台南市','高雄市']){
    shapesByCounty.set(county,map.towns.filter(town=>town.county===county));
   }
  }
  const towns=[],counties=[];
  for(const [county,shapes] of shapesByCounty){
   if(!shapes.length)continue;
   const members=shapes.map(shape=>{
    const label=aliases.get(historicPair(county,normalize(shape.name)))||normalize(shape.name);
    return {...shape,id:'local:'+year+':'+county+':'+shape.id,sourceId:shape.id,county,name:label};
   });
   towns.push(...members);
   const original=map.counties.find(shape=>shape.name===county);
   if(original&&modern){counties.push(original);continue}
   counties.push({...areaShape(members,mergePaths),id:'local:'+year+':'+county,county,name:county});
  }
  return {towns,counties};
 }
 function areaShape(towns,mergePaths){
  const box=[Math.min(...towns.map(t=>t.box[0])),Math.min(...towns.map(t=>t.box[1])),
   Math.max(...towns.map(t=>t.box[2])),Math.max(...towns.map(t=>t.box[3]))];
  return {d:mergePaths(towns.map(t=>t.d)),box,center:[(box[0]+box[2])/2,(box[1]+box[3])/2]};
 }
 // Truncated names in the 2002 and 2005 official area tables.
 const councilTownAliases={'嘉义县|里山乡':'阿里山乡','屏东县|地门乡':'三地门乡','台东县|麻里乡':'太麻里乡'};
 function councilTownName(county,town){
  return councilTownAliases[county+'|'+town]||town;
 }
 function councilMap(shard,geography,mergePaths){
  const groups=shard.contests.filter(contest=>contest.election_id===shard.year+'-council');
  const owners=new Map();
  for(const contest of groups.filter(c=>c.electorate==='regional')){
   for(const town of contest.scope_names||[]){
    const key=contest.county_name+'|'+councilTownName(contest.county_name,town);
    owners.set(key,(owners.get(key)||0)+1);
   }
  }
  const features=[],districts=[];
  const lookup=new Map(geography.towns.map(town=>[town.county+'|'+town.name,town]));
  for(const contest of groups){
   const county=contest.county_name,number=contest.district_number;
   const scopeTowns=(contest.scope_names||[]).map(name=>councilTownName(county,name));
   const split=shard.councilDistrictGeometry?.[contest.contest_id];
   const mergedTainan=county==='台南市'&&shard.year<=2002&&scopeTowns.length===2&&scopeTowns.includes('中区')&&scopeTowns.includes('西区');
   const towns=mergedTainan?[lookup.get(county+'|中西区')].filter(Boolean):
    scopeTowns.map(name=>lookup.get(county+'|'+name)).filter(Boolean);
   const shared=scopeTowns.some(name=>owners.get(county+'|'+name)>1);
   const complete=Boolean(split?.d)||towns.length>0&&(mergedTainan||towns.length===scopeTowns.length&&(!shared||contest.electorate!=='regional'));
   const district={
    id:contest.contest_id,county,name:contest.district_name,number,electorate:contest.electorate,
    scope:(split?.villages||scopeTowns).join('、'),scopeTowns,seats:contest.seats,
    womenReserved:contest.reserved_seats,mapAvailable:complete
   };
   districts.push(district);
   if(!complete)continue;
   const shape=split?.d?{d:split.d,box:split.box,center:split.center,historicalBoundaryNote:'按当届里别归属，以现行或沿革对应的里界近似绘制'}:
    {...areaShape(towns,mergePaths),...(mergedTainan?{historicalBoundaryNote:'旧中区、西区同属这个选区，以合并后的中西区轮廓近似绘制'}:{})};
   features.push({...shape,...district,id:'history-'+district.id,historyId:district.id});
  }
  return {features,districts};
 }
 const api={YEARS,years,load,geometry,councilMap,applyCouncilSupplement};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLocal=api;
})(typeof window==='undefined'?{}:window);
