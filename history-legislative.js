(function(root){
 'use strict';
 const YEARS=[1992,1995,1998,2001,2004,2008,2012,2016,2020,2024];
 const YEAR_SET=new Set(YEARS),loads=new Map();let mapLoad=null;
 const LABELS={regional:'区域民代',plains:'平地少数民族民代',mountain:'山地少数民族民代'};
 function ballots(year){
  const items=Object.entries(LABELS).map(([value,label])=>({value,label}));
  items.push({value:'party',label:'不分区民代'});
  return items;
 }
 // "全部地区" is a map-range choice, not an administrative hierarchy.
 function levels(year,electorate){
  if(electorate==='regional')return [['county','县市'],['district','选举区'],...(Number(year)===1992?[['town','乡镇市区']]:[])];
  if(Number(year)===1992&&electorate==='party')return [['county','县市']];
  return [['county','县市'],['town','乡镇市区']];
 }
 // Source: CEC 2008 (7th) district announcement and 2012 (8th) election record.
 // Existing map village polygons are used to reconstruct split district boundaries.
 const QIANZHEN_NORTH8=['复国','竹中','竹北','兴东','竹西','竹东','竹内','竹南'];
 const SANMIN_WEST41=['川东','德西','裕民','力行','丰裕','千秋','千北','立德','千岁','凤南','兴德','凤北','德北','十全','十美','安邦','安宜','安泰','民享','精华','德行','德东','立诚','立业','安生','安和','安东','达明','达德','达仁','达勇','德智','德仁','同德','建东','港西','长明','港东','港新','博爱','博惠'];
 const SPLIT_REGIONS=['前镇区','三民区'];
 const HISTORICAL_KAOHSIUNG_YEARS=new Set([2008,2012,2016]);
 let kaohsiungVillagesLoad=null;
 async function loadKaohsiungVillages(year,fetcher=root.fetch){
  if(!HISTORICAL_KAOHSIUNG_YEARS.has(Number(year)))return[];
  if(!kaohsiungVillagesLoad){
   // The validated shard inventory contains Qianzhen in #3 and Sanmin in #5.
   // Loading only these two avoids ~3 MB of unrelated village geometry.
   kaohsiungVillagesLoad=Promise.all([3,5].map(async i=>{
    const response=await fetcher('assets/map-villages-'+i+'.json?v=20261031-split-v25',{cache:'default'});
    if(!response.ok)throw Error('历史高雄市里界资料缺失：地图第'+i+'部分');
    const rows=await response.json();if(!Array.isArray(rows))throw Error('历史里界格式错误：第'+i+'部分');
    return rows.filter(v=>v.county==='高雄市'&&SPLIT_REGIONS.includes(v.town));
   })).then(parts=>{
    const list=parts.flat(),front=list.filter(v=>v.town==='前镇区'),sanmin=list.filter(v=>v.town==='三民区');
    const names=new Set(front.map(f=>f.name));
    const missing=QIANZHEN_NORTH8.filter(n=>!names.has(n+'里'));
    if(missing.length||sanmin.length<75)throw Error('历史高雄市选区的村里边界不完整：'+missing.join('、'));
    return list;
   }).catch(err=>{kaohsiungVillagesLoad=null;throw err});
  }
  return kaohsiungVillagesLoad;
 }
 function kaohsiungSplitFragment(year,county,district,towns,villages){
  if(!HISTORICAL_KAOHSIUNG_YEARS.has(Number(year))||county!=='高雄市'||!Array.isArray(villages)||!villages.length)return null;
  const old=Number(year)===2008;
  const splits=[
   {town:'前镇区',north:old?4:7,south:old?5:9,names:QIANZHEN_NORTH8},
   {town:'三民区',north:old?2:5,south:old?3:6,names:SANMIN_WEST41}
  ];
  const matches=splits.filter(s=>s.north===district||s.south===district);
  if(!matches.length)return null;
  return matches.map(s=>{
   const source=towns.find(f=>f.county===county&&f.name===s.town);
   if(!source)throw Error(year+' 高雄市 '+s.town+'底图缺失');
   const local=villages.filter(v=>v.townId===(source.sourceId||source.id)||v.county===county&&v.town===s.town);
   const names=new Set(s.names.map(n=>n+'里'));
   const chosen=local.filter(v=>names.has(v.name));
   const missing=[...names].filter(n=>!chosen.some(v=>v.name===n));
   // 2008's 港北里 merged into 博爱里 in 2010: use the post-merger
   // 博爱 polygon; its election-district membership did not change.
   if(missing.length)throw Error(year+' 高雄市'+s.town+'历史村里缺少图形：'+missing.join('、'));
   const north=s.north===district,paths=north?chosen.map(v=>v.d):[source.d,...chosen.map(v=>v.d)];
   const boxes=north?chosen.map(v=>v.box):[source.box];
   const box=boxes.reduce((b,v)=>[Math.min(b[0],v[0]),Math.min(b[1],v[1]),Math.max(b[2],v[2]),Math.max(b[3],v[3])],[Infinity,Infinity,-Infinity,-Infinity]);
   return{town:s.town,source,box,d:paths.join(' '),fillRule:north?'nonzero':'evenodd',
    note:year+'年高雄市'+s.town+'依中选会公告的村里归属还原；底图采用现存里界轮廓'};
  });
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
  if(Number(year)===2001&&(electorate==='regional'||electorate==='party'))return '2001年新店与汐止按政大逐候选人明细补齐1,447票，乡镇、选区、县市及全区合计均为10,174,005张区域民代有效票。'+(electorate==='party'?' 2008年前无独立不分区政党票。':'');
  if(electorate==='party'&&Number(year)<2008)return '2008年前无独立不分区政党票；政党席次以政党推荐的区域及少数民族候选人得票按旧制计算，详见下方席次与名单。';
  if(Number(year)===1992&&electorate==='regional')return '1992年区域民代乡镇票数与选区归属来自政大选举研究中心；少数地名采用档案所列后期称谓。金门、马祖可查县级结果。';
  if(Number(year)===1992&&electorate==='mountain')return '政大地方明细合计63,829票；全区名单合计63,831票。差额为华加志2票，原档未注明其地方归属。';
  if(Number(year)===1992&&electorate==='plains')return '政大县市与乡镇市区逐级核对至全区49,333票。';
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
   // Membership names were already reduced by baseTown(). Never strip a
   // second suffix: 新市 becomes 新, 左镇 becomes 左, 平镇 becomes 平.
   const key=norm(county)+'|'+norm(name);
   const exact=townIndex.get(key)||townIndex.get(norm(county)+'|'+norm(baseTown(name)));
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
  const actualMembership=new Set();
  if(target.year!==reference?.year){
   for(const row of target.rows||[]){
    if(row.electorate!=='regional'||row.level!=='town')continue;
    const key=norm(row.county)+'|'+districtNumber(row.district);
    if(!actualMembership.has(key)){membership.set(key,new Set());actualMembership.add(key)}
    membership.get(key).add(norm(baseTown(row.town)));
   }
  }
  const seen=new Set(),features=[];
  for(const row of target?.rows||[]){
   if(row.electorate!=='regional'||row.level!=='district')continue;
   const key=norm(row.county)+'|'+districtNumber(row.district);if(seen.has(key))continue;seen.add(key);
   const townNames=membership.get(key)||new Set();
   const splits=kaohsiungSplitFragment(target.year,norm(row.county),districtNumber(row.district),map?.towns||[],map?.villages||[])||[];
   const splitNames=new Set(splits.map(s=>s.town));
   const resolved=[...townNames].map(name=>({name,feature:findTown(row.county,name)}));
   const missingTowns=resolved.filter(item=>!item.feature).map(item=>item.name);
   const sources=resolved.map(item=>item.feature).filter(Boolean).filter(t=>!splitNames.has(t.name));
   let usedCountyFallback=false;
   if(!sources.length&&!splits.length){
    const countyFeature=(map?.counties||[]).find(f=>(norm(f.name||f.county)===norm(row.county)||norm(f.name||f.county)===norm(modernCounty(row.county))));
    if(countyFeature){sources.push(countyFeature);usedCountyFallback=true}
   }
   if(!sources.length&&!splits.length)continue;
   // Village-split constituencies can share a township in historical returns.
   // Township data alone cannot recreate the precise old village boundary.
   const approximate=[...townNames].some(town=>[...membership].some(([other,names])=>
    other!==key&&other.startsWith(norm(row.county)+'|')&&names.has(town)));
   const parts=[...sources.map(f=>({d:f.d,box:f.box})),...splits];
   const box=parts.reduce((b,f)=>[Math.min(b[0],f.box[0]),Math.min(b[1],f.box[1]),Math.max(b[2],f.box[2]),Math.max(b[3],f.box[3])],[Infinity,Infinity,-Infinity,-Infinity]);
   // Even-odd holes remove the other constituency's village polygons from
   // the full township, so two districts are disjoint and cover the township.
   // All other areas are kept as separate non-overlapping polygon rings.
   const fillRule=splits.some(s=>s.fillRule==='evenodd')?'evenodd':'nonzero';
   const sourceTownIds=[...sources,...splits.map(s=>s.source)].map(f=>f.sourceId||f.id).filter(Boolean);
   const referenceYear=actualMembership.has(key)?target.year:Number(reference?.year)||Number(target.year);
   const notes=['选区归属依据'+referenceYear+'年统计资料，轮廓使用现行行政区图形近似展示，并非当届原始测绘界线'];
   if(referenceYear!==Number(target.year))notes.push('当届缺少乡镇归属明细，借用'+referenceYear+'年选区归属，可能与'+target.year+'年实际划分不同');
   if(approximate)notes.push('同一乡镇市区跨越多个选区，缺少当年村里界线，存在边界重叠风险');
   if(missingTowns.length)notes.push('缺少可匹配地理图形：'+missingTowns.join('、'));
   if(usedCountyFallback)notes.push('无法还原选区局部范围，整县轮廓仅作位置示意，不代表选区边界');
   if(splits.length)notes.push(...splits.map(s=>s.note));
   const boundaryQuality=usedCountyFallback?'county-fallback':missingTowns.length?'incomplete':referenceYear!==Number(target.year)?'cross-year':approximate?'town-split':'modern-outline';
   features.push({id:'legislative-'+target.year+'-'+key,county:norm(row.county),name:norm(row.district),number:districtNumber(row.district),electorate:'regional',
    sourceTownIds,d:mergePaths(parts.map(f=>f.d)),box,center:[(box[0]+box[2])/2,(box[1]+box[3])/2],fillRule,
    historicalBoundarySourceYear:referenceYear,historicalBoundaryQuality:boundaryQuality,historicalBoundaryMissingTowns:missingTowns,
    historicalBoundarySourceTowns:[...townNames],historicalBoundaryNote:notes.join('；'),boundaryApproximate:true,
    ...(splits.length?{historicalVillageSplit:true}:{})});
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
    boundaryApproximate:true,historicalBoundaryQuality:'modern-outline',
    historicalBoundaryNote:alias!==town?'当届行政区界采用现行合并后轮廓近似展示':'已匹配当届行政区名称与归属，图形轮廓采用现行底图近似展示'});
  }
  const names=[...new Set((snapshot?.rows||[]).filter(row=>row.level==='county'&&row.electorate==='regional'&&row.county)
   .map(row=>norm(row.county)).filter(name=>!name.includes('全部地区')&&!name.includes('台闽地区')))];
  const counties=[];
  for(const name of names){
   const members=towns.filter(t=>t.county===name);
   if(members.length){
    const box=members.reduce((b,f)=>[Math.min(b[0],f.box[0]),Math.min(b[1],f.box[1]),Math.max(b[2],f.box[2]),Math.max(b[3],f.box[3])],[Infinity,Infinity,-Infinity,-Infinity]);
    counties.push({id:'legislative-county:'+snapshot.year+':'+name,county:name,name,d:mergePaths([...new Map(members.map(f=>[f.sourceId,f])).values()].map(f=>f.d)),box,
     center:[(box[0]+box[2])/2,(box[1]+box[3])/2],historical:true,historicalYear:snapshot.year,
     boundaryApproximate:true,historicalBoundaryQuality:'modern-outline',
     historicalBoundaryNote:'县市范围按当届乡镇归属组合，地理轮廓仍使用现行行政区图形'});
   }else{
    const source=(map?.counties||[]).find(f=>norm(f.name||f.county)===norm(modernCounty(name)));
    if(source)counties.push({...source,id:'legislative-county:'+snapshot.year+':'+name,county:name,name,historical:true,
     historicalYear:snapshot.year,boundaryApproximate:true,historicalBoundaryQuality:'county-fallback',
     historicalBoundaryNote:'缺少可核对的历史乡镇边界，采用现行县市范围示意，不能视作当届精确边界'});
   }
  }
  return{towns,counties,missing};
 }

 // Validate exact 2008+ party-ballot geography against CEC-derived totals.
 // A township polygon is only usable if its historic town identity maps
 // uniquely to one modern base polygon; no county average is ever applied.
 function auditPartyTownVotes(snapshot,geometry){
  const year=Number(snapshot?.year),errors=[];
  if(!Number.isFinite(year)||year<2008)return{valid:false,errors:['仅支持2008年及以后独立政党票']};
  const source=(snapshot?.rows||[]).filter(r=>r.electorate==='party'),parties=new Set();
  const national=new Map(),county=new Map(),town=new Map(),townKeys=new Set(),countyKeys=new Set();
  const add=(map,key,v)=>map.set(key,(map.get(key)||0)+v);
  for(const row of source){
   const n=Number(row.votes),p=String(row.party||row.name||'');
   if(!p||!Number.isSafeInteger(n)||n<0){errors.push('非法政党得票记录');continue}
   parties.add(p);
   if(row.level==='national')add(national,p,n);
   if(row.level==='county'){
    countyKeys.add(row.county);add(county,row.county+'|'+p,n);
   }
   if(row.level==='town'){
    townKeys.add(row.county+'|'+row.town);add(town,row.county+'|'+row.town+'|'+p,n);
   }
  }
  if(townKeys.size!==368)errors.push('乡镇市区记录数应为368，实际 '+townKeys.size);
  if(countyKeys.size!==(year===2008?25:22))errors.push('历史县市记录数不正确：'+countyKeys.size);
  const townshipToCounty=new Map();
  for(const [key,v] of town){
   const sep=key.lastIndexOf('|'),party=key.slice(sep+1),townKey=key.slice(0,sep);
   const countyName=townKey.slice(0,townKey.indexOf('|'));
   add(townshipToCounty,countyName+'|'+party,v);
  }
  for(const [key,v] of county)if((townshipToCounty.get(key)||0)!==v)
   errors.push(key+' 县市与乡镇市区政党票不一致');
  const countiesToNational=new Map();
  for(const [key,v] of county)add(countiesToNational,key.slice(key.indexOf('|')+1),v);
  for(const [p,v] of national)if((countiesToNational.get(p)||0)!==v)
   errors.push(p+' 全区与县市政党票不一致');
  if(national.size!==parties.size)errors.push('全区政党数与乡镇政党数不符');
  const features=geometry?.towns||[],covered=new Set(),polygonIds=new Set();
  for(const feature of features){
   const key=feature.county+'|'+feature.name;
   if(covered.has(key))errors.push('乡镇图形重复 '+key);
   covered.add(key);
   if(!townKeys.has(key))errors.push('乡镇图形没有真实得票 '+key);
   const polygon=String(feature.sourceId||feature.id||'');
   if(polygonIds.has(polygon))errors.push('同一现行乡镇图形错误地用于多个历史行政区 '+polygon);
   polygonIds.add(polygon);
  }
  for(const key of townKeys)if(!covered.has(key))errors.push('缺少乡镇图形 '+key);
  if(geometry?.missing?.length)errors.push('未匹配历史乡镇图形 '+geometry.missing.length);
  if(features.length!==368||polygonIds.size!==368)
   errors.push('乡镇地图图形必须一一对应368个历史乡镇市区');
  return{valid:errors.length===0,year,areas:townKeys.size,politicalParties:parties.size,
   counties:countyKeys.size,votes:[...national.values()].reduce((a,b)=>a+b,0),errors};
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
  return selected;
 }
 // Exact, versioned CEC evidence: sources/history-legislative-2001-vote-reconciliation.json
 const VOTE_CORRECTIONS_2001=[{"county":"台北县","town":"三重市","district":"台北县第2选区","raw_key":"03,001,02,006","district_key":"03,001,02,000","missing_poll":637,"method":"official district candidate totals minus all other town totals","old_total":179888,"new_total":180537,"candidates":[{"number":"1","name":"罗恩敏","party":"无党籍","old_votes":342,"new_votes":342,"official_district_votes":1238,"other_town_votes":896},{"number":"2","name":"郑余镇","party":"民主进步党","old_votes":10721,"new_votes":10775,"official_district_votes":67710,"other_town_votes":56935},{"number":"3","name":"蔡家福","party":"中国国民党","old_votes":3030,"new_votes":3040,"official_district_votes":37656,"other_town_votes":34616},{"number":"4","name":"郭金龙","party":"无党籍","old_votes":207,"new_votes":209,"official_district_votes":863,"other_town_votes":654},{"number":"5","name":"郭素春","party":"中国国民党","old_votes":5991,"new_votes":6008,"official_district_votes":32155,"other_town_votes":26147},{"number":"6","name":"陈景峻","party":"民主进步党","old_votes":28297,"new_votes":28405,"official_district_votes":41999,"other_town_votes":13594},{"number":"7","name":"仉桂美","party":"新党","old_votes":2087,"new_votes":2097,"official_district_votes":7584,"other_town_votes":5487},{"number":"8","name":"王政雄","party":"无党籍","old_votes":104,"new_votes":104,"official_district_votes":326,"other_town_votes":222},{"number":"9","name":"李日煌","party":"台湾团结联盟","old_votes":3450,"new_votes":3462,"official_district_votes":8107,"other_town_votes":4645},{"number":"10","name":"李先仁","party":"中国国民党","old_votes":8421,"new_votes":8445,"official_district_votes":22262,"other_town_votes":13817},{"number":"11","name":"周慧瑛","party":"民主进步党","old_votes":11793,"new_votes":11823,"official_district_votes":42754,"other_town_votes":30931},{"number":"12","name":"李鸿钧","party":"亲民党","old_votes":13492,"new_votes":13547,"official_district_votes":60624,"other_town_votes":47077},{"number":"13","name":"柯淑敏","party":"亲民党","old_votes":13166,"new_votes":13217,"official_district_votes":38799,"other_town_votes":25582},{"number":"14","name":"李显荣","party":"中国国民党","old_votes":5630,"new_votes":5659,"official_district_votes":36816,"other_town_votes":31157},{"number":"15","name":"陈宏昌","party":"中国国民党","old_votes":14292,"new_votes":14326,"official_district_votes":36611,"other_town_votes":22285},{"number":"16","name":"林志嘉","party":"无党籍","old_votes":11480,"new_votes":11521,"official_district_votes":31470,"other_town_votes":19949},{"number":"17","name":"吕钧鸿","party":"亲民党","old_votes":3555,"new_votes":3565,"official_district_votes":17363,"other_town_votes":13798},{"number":"18","name":"陈茂男","party":"民主进步党","old_votes":31827,"new_votes":31956,"official_district_votes":76101,"other_town_votes":44145},{"number":"19","name":"许登宫","party":"台湾团结联盟","old_votes":12003,"new_votes":12036,"official_district_votes":40521,"other_town_votes":28485}]},{"county":"高雄市","town":"旗津区","district":"高雄市第1选区","raw_key":"02,000,01,006","district_key":"02,000,01,000","missing_poll":null,"method":"sum official polling-station candidate votes and verify each polling-station profile","old_total":14258,"new_total":14267,"candidates":[{"number":"1","name":"林进兴","party":"民主进步党","old_votes":2525,"new_votes":2525,"official_district_votes":58019,"other_town_votes":55494},{"number":"2","name":"苏盈贵","party":"台湾团结联盟","old_votes":1252,"new_votes":1252,"official_district_votes":44415,"other_town_votes":43163},{"number":"3","name":"谢启大","party":"新党","old_votes":204,"new_votes":204,"official_district_votes":15172,"other_town_votes":14968},{"number":"4","name":"林锦煌","party":"无党籍","old_votes":175,"new_votes":184,"official_district_votes":4168,"other_town_votes":3984},{"number":"5","name":"曾长发","party":"中国国民党","old_votes":937,"new_votes":937,"official_district_votes":23507,"other_town_votes":22570},{"number":"6","name":"赵念渭","party":"无党籍","old_votes":37,"new_votes":37,"official_district_votes":971,"other_town_votes":934},{"number":"7","name":"江绮雯","party":"中国国民党","old_votes":714,"new_votes":714,"official_district_votes":31108,"other_town_votes":30394},{"number":"8","name":"陈其迈","party":"民主进步党","old_votes":2159,"new_votes":2159,"official_district_votes":56550,"other_town_votes":54391},{"number":"9","name":"杨色玉","party":"亲民党","old_votes":499,"new_votes":499,"official_district_votes":26887,"other_town_votes":26388},{"number":"10","name":"罗世雄","party":"中国国民党","old_votes":3192,"new_votes":3192,"official_district_votes":33517,"other_town_votes":30325},{"number":"11","name":"林寿山","party":"亲民党","old_votes":797,"new_votes":797,"official_district_votes":25906,"other_town_votes":25109},{"number":"12","name":"刘明松","party":"建国党","old_votes":16,"new_votes":16,"official_district_votes":398,"other_town_votes":382},{"number":"13","name":"朱星羽","party":"民主进步党","old_votes":830,"new_votes":830,"official_district_votes":29198,"other_town_votes":28368},{"number":"14","name":"叶耀鹏","party":"无党籍","old_votes":389,"new_votes":389,"official_district_votes":9569,"other_town_votes":9180},{"number":"15","name":"王天竞","party":"无党籍","old_votes":165,"new_votes":165,"official_district_votes":7827,"other_town_votes":7662},{"number":"16","name":"黄万闳","party":"无党籍","old_votes":180,"new_votes":180,"official_district_votes":5029,"other_town_votes":4849},{"number":"17","name":"梅再兴","party":"亲民党","old_votes":187,"new_votes":187,"official_district_votes":17949,"other_town_votes":17762}]}];
 function apply2001Corrections(shard,corrections){
 if(shard.year!==2001)return shard;
 const assert=(ok,msg)=>{if(!ok)throw Error('2001年选举资料核验：'+msg)};
 const total=arr=>arr.reduce((s,x)=>s+x.votes,0);
 const national=()=>total(shard.rows.filter(r=>r.electorate==='regional'&&r.level==='national'));
 const unique=(arr,label)=>{assert(arr.length===1,label);return arr[0]};
 let states=[];
 for(const c of corrections)for(const x of c.candidates){
  const r=unique(shard.rows.filter(y=>y.electorate==='regional'&&y.level==='town'&&y.county===c.county&&y.town===c.town&&y.district===c.district&&y.number===x.number&&y.name===x.name),'乡镇候选人身份');
  assert(r.party===x.party,'政党身份');
  if(x.old_votes!==x.new_votes){assert(r.votes===x.old_votes||r.votes===x.new_votes,'来源票数变化');states.push(r.votes===x.new_votes)}
  else assert(r.votes===x.old_votes,'未变化票数');
 }
 assert(states.every(Boolean)||states.every(s=>!s),'部分修正状态混合');
 if(states.every(Boolean)){assert(national()>=10172558,'已修正全区总票数');return shard}
 assert(national()===10171900,'原始总票数变化');
 const ids=new Set(['legislative:2001:party:national']);
 for(const c of corrections){
  const id='legislative:2001:regional:'+c.county+':'+c.district;ids.add(id);
  for(const x of c.candidates){
   const delta=x.new_votes-x.old_votes;if(!delta)continue;
   for(const level of ['national','county','district','town']){
    const r=unique(shard.rows.filter(y=>y.electorate==='regional'&&y.level===level&&y.district===c.district&&y.number===x.number&&y.name===x.name&&(level!=='town'||y.town===c.town)),level+'候选人');
    r.votes+=delta;
    if(level==='district')assert(r.votes===x.official_district_votes,'选区官方得票');
   }
   for(const level of ['national','county','town']){
    const r=unique(shard.rows.filter(y=>y.electorate==='party'&&y.level===level&&y.party===x.party&&(level==='national'||y.county===c.county)&&(level!=='town'||y.town===c.town)),level+'旧制计算票');r.votes+=delta;
   }
   unique(shard.candidacies.filter(y=>y.contest_id===id&&y.ballot_number===x.number&&y.candidate_name===x.name),'选区候选人记录').votes+=delta;
   unique(shard.candidacies.filter(y=>y.contest_id==='legislative:2001:party:national'&&y.party_name===x.party),'旧制政党记录').votes+=delta;
  }
 }
 for(const contest of shard.contests.filter(x=>ids.has(x.contest_id))){
  const rows=shard.candidacies.filter(x=>x.contest_id===contest.contest_id);
  contest.valid_votes=total(rows);
  for(const row of rows)row.vote_share=Math.round(row.votes/contest.valid_votes*1e10)/1e8;
 }
 for(const level of ['national','county','district','town'])assert(total(shard.rows.filter(x=>x.electorate==='regional'&&x.level===level))===10172558,level+'合计');
 assert(total(shard.rows.filter(x=>x.electorate==='party'&&x.level==='national'))===10326408,'旧制计算票合计');
 return shard;
}
 // The official district summary closes the aggregate gap without distributing
 // the two missing polling-station returns between Xindian and Xizhi.
 const CEC_2001_DISTRICT_3=[["1","雷倩","新党",32583,32665],["2","周荃","无党籍",7102,7117],["3","洪秀柱","中国国民党",38807,38884],["4","陈鹏宇","无党籍",435,436],["6","杨悟空","台湾团结联盟",1599,1600],["7","周雅淑","民主进步党",48100,48274],["8","赵永清","无党籍",36766,36774],["9","傅台安","无党籍",156,157],["10","吕学图","中国国民党",33011,33024],["11","刘盛良","中国国民党",31113,31173],["13","罗明才","中国国民党",34533,34845],["14","李庆华","亲民党",61011,61112],["15","陈朝龙","民主进步党",54096,54213],["17","赖劲麟","民主进步党",42318,42398],["19","张正修","台湾团结联盟",18605,18648],["20","郑三元","亲民党",50241,50400],["22","杜震华","新党",6360,6362],["23","吴梅寿","亲民党",10194,10291],["24","林德福","亲民党",44754,44773],["25","廖学广","无党籍",11943,12022],["27","周武荣","无党籍",947,953]];
 function complete2001Aggregates(shard){
  const district='台北县第3选区',county='台北县';
  const regionId='legislative:2001:regional:'+county+':'+district,partyId='legislative:2001:party:national';
  const aggregateLevels=['district','county','national'];
  const sum=list=>list.reduce((total,row)=>total+row.votes,0);
  const aggregateVotes=level=>sum(shard.rows.filter(row=>row.electorate==='regional'&&row.level===level));
  if(aggregateVotes('national')===10174005)return shard;
  if(aggregateLevels.some(level=>aggregateVotes(level)!==10172558))throw Error('2001年区域民代汇总票数与来源不符');
  const unique=(rows,message)=>{
   if(rows.length!==1)throw Error('2001年第3选区：'+message);
   return rows[0];
  };
  for(const [number,name,party,prior,official] of CEC_2001_DISTRICT_3){
   const candidate=unique(shard.candidacies.filter(row=>row.contest_id===regionId&&
    row.ballot_number===number&&row.candidate_name===name&&row.party_name===party),'候选人身份');
   if(candidate.votes!==prior)throw Error('2001年第3选区候选人原记录票数不符');
   const targets=aggregateLevels.map(level=>unique(shard.rows.filter(row=>row.electorate==='regional'&&
    row.level===level&&row.district===district&&row.number===number&&row.name===name&&row.party===party),'各级候选人身份'));
   if(targets.some(row=>row.votes!==prior))throw Error('2001年第3选区候选人各级原票数不符');
   const partyRows=['national','county'].map(level=>unique(shard.rows.filter(row=>row.electorate==='party'&&
    row.level===level&&row.party===party&&(level==='national'||row.county===county)),'旧制计算票政党身份'));
   const partyRecord=unique(shard.candidacies.filter(row=>row.contest_id===partyId&&row.party_name===party),'旧制政党记录');
   candidate.votes=official;
   for(const row of targets)row.votes=official;
   for(const row of [...partyRows,partyRecord])row.votes+=official-prior;
  }
  for(const id of [regionId,partyId]){
   const contest=unique(shard.contests.filter(row=>row.contest_id===id),'统计范围');
   const candidates=shard.candidacies.filter(row=>row.contest_id===id);
   contest.valid_votes=sum(candidates);
   for(const row of candidates)row.vote_share=Math.round(row.votes/contest.valid_votes*1e10)/1e8;
  }
  if(aggregateLevels.some(level=>aggregateVotes(level)!==10174005)||aggregateVotes('town')!==10172558)
   throw Error('2001年区域民代汇总范围对账失败');
  return shard;
 }
 function verified2001(shard){
  return shard.year===2001?complete2001Aggregates(apply2001Corrections(shard,VOTE_CORRECTIONS_2001)):shard;
 }
 function apply2001TownReturns(shard,archive){
  if(shard.year!==2001||archive.version!==1||archive.year!==2001||archive.towns.length!==2)
   throw Error('2001年补充乡镇票数格式错误');
  const {county,district}=archive;
  const districtRows=shard.rows.filter(r=>r.electorate==='regional'&&r.district===district&&r.county===county);
  for(const town of archive.towns){
   const current=districtRows.filter(r=>r.level==='town'&&r.town===town.town);
   if(current.length!==27||town.candidates.length!==27||new Set(town.candidates.map(r=>r[0])).size!==27||
    current.reduce((sum,r)=>sum+r.votes,0)!==town.previousValid||
    town.candidates.reduce((sum,r)=>sum+r[2],0)!==town.profile[2])throw Error('2001年乡镇补充票数未能核对');
   for(const [number,name,votes] of town.candidates){
    const row=current.find(r=>r.number===number&&r.name===name);
    const partyRow=shard.rows.find(r=>r.electorate==='party'&&r.level==='town'&&r.county===county&&r.town===town.town&&r.party===row?.party);
    if(!row||!partyRow||votes<row.votes)throw Error('2001年乡镇候选人原始票数或身份不符');
    partyRow.votes+=votes-row.votes;
    row.votes=votes;
   }
  }
  for(const row of districtRows.filter(r=>r.level==='district')){
   if(districtRows.filter(r=>r.level==='town'&&r.number===row.number).reduce((sum,r)=>sum+r.votes,0)!==row.votes)
    throw Error('2001年乡镇票数无法逐候选人对账至选区');
  }
  return shard;
 }
 function enrichCandidates(shard){
  const metadata=(typeof module!=='undefined'&&module.exports?
   require('./assets/history-legislative-candidates.js'):root.HistoryLegislativeCandidates)?.[shard.year];
  if(!metadata)return shard;
  const contests=new Map(shard.contests.map(contest=>[contest.contest_id,contest]));
  const key=(electorate,district,name,number)=>JSON.stringify([electorate,district,name,Number(number)]);
  const profiles=new Map();
  for(const candidate of shard.candidacies){
   const details=metadata.candidates[candidate.candidacy_id];
   if(!details)continue;
   const [gender,incumbent]=details;
   candidate.gender=candidate.gender??gender;
   candidate.incumbent_at_election=candidate.incumbent_at_election??incumbent;
   const contest=contests.get(candidate.contest_id);
   const identity=key(contest.electorate,contest.district_name,candidate.candidate_name,candidate.ballot_number);
   profiles.set(identity,profiles.has(identity)?null:candidate);
  }
  for(const row of shard.rows){
   if(row.electorate==='party')continue;
   const candidate=profiles.get(key(row.electorate,row.district,row.name,row.number));
   if(!candidate)continue;
   row.gender=row.gender??candidate.gender;
   row.incumbent=row.incumbent??candidate.incumbent_at_election;
  }
  return shard;
 }
 function apply1992Regional(shard,archive){
  const {candidateCorrection:fix,districts,withoutTownReturns}=archive;
  const corrected=(row,name,number)=>name===fix.name&&Number(number)===fix.ballot&&(row.level==='national'||row.county===fix.county)&&row.district===fix.district;
  const regionalRows=shard.rows.filter(r=>r.electorate==='regional'&&r.level==='district');
  const original=regionalRows.find(r=>corrected(r,r.name,r.number));
  if(!original||original.votes!==fix.previousVotes||!fix.officialSource)throw Error('1992年高雄县原始候选人票数不符');
  const delta=fix.certifiedVotes-fix.previousVotes;
  const countyParty=r=>r.electorate==='party'&&r.party===original.party&&
   (r.level==='national'||r.level==='county'&&r.county===fix.county);
  const rows=shard.rows.map(r=>r.electorate==='regional'&&corrected(r,r.name,r.number)||countyParty(r)?
   {...r,votes:r.votes+delta}:r);
  const regionalId='legislative:1992:regional:'+fix.county+':'+fix.district;
  const partyId='legislative:1992:party:national';
  const contests=shard.contests.map(c=>[regionalId,partyId].includes(c.contest_id)?
   {...c,valid_votes:c.valid_votes+delta}:c);
  const totals=new Map(contests.filter(c=>[regionalId,partyId].includes(c.contest_id)).map(c=>[c.contest_id,c.valid_votes]));
  const candidacies=shard.candidacies.map(c=>{
   const total=totals.get(c.contest_id);
   if(!total)return c;
   const match=c.contest_id===regionalId?c.candidate_name===fix.name&&Number(c.ballot_number)===fix.ballot:c.party_name===original.party;
   const votes=c.votes+(match?delta:0);
   return {...c,votes,vote_share:Math.round(votes/total*1e10)/1e8};
  });
  const profile={town:{}},seen=new Set();
  for(const batch of districts){
   const {county,district,towns,source}=batch;
   const candidates=rows.filter(r=>r.electorate==='regional'&&r.level==='district'&&r.county===county&&r.district===district)
    .sort((a,b)=>Number(a.number)-Number(b.number));
   if(!candidates.length||!source||!towns.length)throw Error('1992年区域选区资料不全：'+district);
   const subtotal=candidates.map(()=>0);
   const countyProfile=profile.town[county]??={};
   for(const [town,votes,p] of towns){
    const key=county+'|'+town;
    const valid=votes.reduce((sum,n)=>sum+n,0);
    if(!town||seen.has(key)||votes.length!==candidates.length||votes.some(n=>!Number.isSafeInteger(n)||n<0)||
     !Array.isArray(p)||p.length!==4||p[2]!==valid||!Number.isSafeInteger(p[0])||p[0]<valid||
     (p[1]===null?p[3]!==null:!Number.isSafeInteger(p[1])||!Number.isSafeInteger(p[3])||p[3]<0||p[0]<p[1]||p[1]!==valid+p[3]))
     throw Error('1992年区域乡镇票数与统计不符：'+key);
    seen.add(key);
    countyProfile[town]=p;
    candidates.forEach((r,i)=>{
     subtotal[i]+=votes[i];
     rows.push({...r,level:'town',town,votes:votes[i],elected:false});
    });
   }
   if(candidates.some((r,i)=>r.votes!==subtotal[i]))throw Error('1992年区域乡镇票未能逐候选人对账：'+district);
  }
  const coverage={districtCount:districts.length,townCount:seen.size,withoutTownReturns};
  if(coverage.districtCount!==25||coverage.townCount!==359)throw Error('1992年区域乡镇资料覆盖不符');
  return {...shard,contests,candidacies,rows,regionalTownCoverage:coverage,
   geographicProfiles:{...shard.geographicProfiles,regional:profile}};
 }
 function apply1992Local(shard,archive){
  if(shard.year!==1992||archive.version!==1||archive.year!==1992)throw Error('1992年地方票数资料格式错误');
  const rows=[],profiles={};
  const validProfile=(profile,valid)=>Array.isArray(profile)&&profile.length===4&&
   profile.every(n=>Number.isSafeInteger(n)&&n>=0)&&profile[0]>=profile[1]&&profile[1]===profile[2]+profile[3]&&profile[2]===valid;
  for(const electorate of ['plains','mountain']){
   const ballot=archive.ballots[electorate];
   const originals=shard.rows.filter(r=>r.level==='national'&&r.electorate===electorate).sort((a,b)=>Number(a.number)-Number(b.number));
   if(originals.length!==9||Object.keys(ballot.counties).length!==23)throw Error('1992年地方票数资料不全');
   const national=originals.map(()=>0);
   const local=profiles[electorate]={county:{},town:{}};
   let townCount=0;
   for(const [county,record] of Object.entries(ballot.counties)){
    const subtotal=originals.map(()=>0),areas=new Set();
    local.town[county]={};
    for(const [town,votes,profile] of record.towns){
     if(areas.has(town)||votes.length!==originals.length||!votes.every(n=>Number.isSafeInteger(n)&&n>=0)||
      (profile&&!validProfile(profile,votes.reduce((a,b)=>a+b,0))))throw Error('1992年乡镇得票或统计不一致：'+county+town);
     areas.add(town);townCount++;
     if(profile)local.town[county][town]=profile;
     originals.forEach((row,i)=>{subtotal[i]+=votes[i];rows.push({...row,level:'town',county,town,votes:votes[i],elected:false})});
    }
    if(!validProfile(record.profile,subtotal.reduce((a,b)=>a+b,0)))throw Error('1992年县市得票或统计不一致：'+county);
    local.county[county]=record.profile;
    originals.forEach((row,i)=>{national[i]+=subtotal[i];rows.push({...row,level:'county',county,votes:subtotal[i],elected:false})});
   }
   if(townCount!==359||originals.some((row,i)=>row.votes-national[i]!==((electorate==='mountain'&&Number(row.number)===2)?2:0))){
    throw Error('1992年地方得票与全区票数的已知差额不符');
   }
  }
  const fields=['registered_voters','ballots_cast','valid_votes','invalid_votes'];
  const plain=Object.values(profiles.plains.county);
  const contests=shard.contests.map(c=>c.electorate==='plains'?
   {...c,...Object.fromEntries(fields.map((field,i)=>[field,plain.reduce((sum,row)=>sum+row[i],0)]))}:c);
  const originalRows=shard.rows.filter(r=>r.level!=='county'||r.county!=='台闽地区'||!Object.hasOwn(profiles,r.electorate));
  const local={...shard,rows:[...originalRows,...rows],contests,geographicProfiles:profiles};
  return archive.ballots.regional?apply1992Regional(local,archive.ballots.regional):local;
 }
 async function load(year,fetcher=root.fetch){
  year=Number(year);if(!YEAR_SET.has(year))throw Error('不支持的立法机构民代选举年份：'+year);
  if(loads.has(year))return loads.get(year);
  const promise=(async()=>{
   const [response,local]=await Promise.all([
    fetcher('assets/history-legislative-'+year+'.json?v=20261124-vote-reconciliation-v4',{cache:'default'}),
    [1992,2001].includes(year)?fetcher('assets/history-legislative-'+year+'-local.json?v='+(year===1992?'3':'1')).then(response=>{
     if(!response.ok)throw Error(year+'年地方得票资料 HTTP '+response.status);
     return response.json();
    }):null
   ]);
   if(!response.ok)throw Error(year+'年立法机构民代历史数据 HTTP '+response.status);
   const shard=await response.json();
   if(shard.schemaVersion!==2||shard.year!==year||shard.office!=='legislative'||!Array.isArray(shard.rows)||!shard.rows.length)throw Error(year+'年立法机构民代历史数据校验未通过');
   return enrichCandidates(year===1992?apply1992Local(shard,local):
    year===2001?apply2001TownReturns(verified2001(shard),local):shard);
  })();
  loads.set(year,promise);
  try{return await promise}catch(error){loads.delete(year);throw error}
 }
 async function loadMap(fetcher=root.fetch){
  if(!mapLoad)mapLoad=(async()=>{const response=await fetcher('assets/map-legislative.json?v=20261031-split-v25',{cache:'default'});if(!response.ok)throw Error('立法机构民代选区地图 HTTP '+response.status);const map=await response.json();if(!Array.isArray(map.legislative)||map.legislative.length!==73)throw Error('立法机构民代选区地图校验未通过');return map})().catch(error=>{mapLoad=null;throw error});
  return mapLoad;
 }
 const api={apply1992Local,apply2001Corrections:verified2001,YEARS,ballots,levels,multiMember,countyLabelsOnly,seatBadgeComposition,districtKey,winners,composition,renderMode,rows,note,districtNumber,districtGeometry,scopeGeometry,auditPartyTownVotes,singleMemberGeometry,periodSingleMemberGeometry,load,loadMap,loadKaohsiungVillages,kaohsiungSplitFragment};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLegislative=api;
})(typeof window==='undefined'?{}:window);
