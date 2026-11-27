/* Year-specific local election results and period-appropriate map geography. */
(function(root){
 'use strict';
 const YEARS={
  mayor:[1993,1994,1997,1998,2001,2002,2005,2006,2009,2010,2014,2018,2022],
  council:[1994,1998,2002,2005,2006,2009,2010,2014,2018,2022],
  township:[1994,1998,2002,2005,2009,2014,2018,2022]
 };
 const CYCLES={1994:1993,1998:1997,2002:2001,2006:2005,2010:2009};
 const groupedOffice=office=>office==='mayor'||office==='council';
 function cycleYear(year,office){
  if(!groupedOffice(office))return year;
  return Number(Object.keys(CYCLES).find(end=>CYCLES[end]===year))||year;
 }
 function yearLabel(year,office,separator='/'){
  const splitYear=groupedOffice(office)&&CYCLES[year]&&!(office==='council'&&Number(year)<=2002);
  return splitYear?CYCLES[year]+separator+year:String(year);
 }
 const localUrl=year=>'assets/history-local-'+year+'.json?v=20261126-municipal-roster-v'+(year===1994?'42':year===2018?'7':year===2002?'6':'5');
 const legacyCouncilUrl='assets/history-local-1994-council.json?v=39',legacyProfileUrl='sources/history-1994-changhua-council-profile.json?v=1',supplementUrl='assets/history-local-council-supplement.json?v=20261126-statutory-quota-v6';
 const trendSummarySourceVersion=()=>JSON.stringify([...new Set([...YEARS.mayor,...YEARS.council])].filter(y=>y<2022).sort((a,b)=>a-b).map(localUrl).concat([legacyCouncilUrl,legacyProfileUrl,supplementUrl]));
 const pending=(root.HistoryQueryCache||(typeof module!=='undefined'&&module.exports?require('./history-query-cache.js'):null)).createCache(8),supplementYears=new Set([1994,1998,2002,2005,2006,2009,2010,2014,2018]);
 let supplementRequest;
 let legacyCouncilRequest;
 function enrichLegacyGender(archive,references){
  // Never infer sex from a name or party from a later election. Require
  // unique exact candidate, county, district and electorate matches in
  // both independent 1998 and 2002 election snapshots.
  if(references.length!==2||references.some(s=>!s))return archive;
  const convert=(root.OpenCC||(typeof module!=='undefined'&&module.exports?require('./assets/opencc.js'):null)).Converter({from:'t',to:'cn'});
  const norm=s=>convert(String(s||'')).replaceAll('臺','台').trim();
  const key=(county,number,electorate,name)=>JSON.stringify([norm(county),String(number),electorate,norm(name)]);
  const maps=references.map(s=>{
   const ids=new Set(s.elections.filter(e=>e.office==='council').map(e=>e.election_id));
   const contests=new Map(s.contests.filter(c=>ids.has(c.election_id)).map(c=>[c.contest_id,c]));
   const map=new Map();
   for(const c of s.candidacies){
    const d=contests.get(c.contest_id);if(!d)continue;
    const number=d.district_number??String(d.district_name).match(/\d+/)?.[0];
    if(number==null)continue;
    const k=key(d.county_name,Number(number),d.electorate,c.candidate_name_official||c.candidate_name);
    const arr=map.get(k)||[];arr.push(c);map.set(k,arr);
   }
   return map;
  });
  return {...archive,districts:archive.districts.map(d=>{
   const gender_sources={...(d.gender_sources||{})};
   const candidates=d.candidates.map(c=>{
    if(c[4])return c;
    const k=key(d.county,d.number,d.electorate,c[1]),matches=maps.map(m=>m.get(k)||[]);
    if(matches.some(m=>m.length!==1))return c;
    const [a,b]=matches.map(m=>m[0]);
    if(!['男','女'].includes(a.gender)||a.gender!==b.gender)return c;
    gender_sources[String(c[0])]={method:'cross-election exact match',years:references.map(s=>s.year),candidacy_ids:[a.candidacy_id,b.candidacy_id]};
    return c.map((v,i)=>i===4?a.gender:v);
   });
   return {...d,candidates,gender_sources};
  })};
 }
 function loadLegacyCouncil(fetcher){
  if(!legacyCouncilRequest)legacyCouncilRequest=(async()=>{
   const response=await fetcher(legacyCouncilUrl);
   if(!response.ok)throw Error('1994县市议员补充资料 HTTP '+response.status);
   const archive=await response.json();
   if(archive.version!==1||!archive.districts?.length)throw Error('1994县市议员补充资料不完整');
   const changhuaResponse=await fetcher(legacyProfileUrl);
   if(!changhuaResponse.ok)throw Error('1994彰化县议员县级统计 HTTP '+changhuaResponse.status);
   const changhua=await changhuaResponse.json();
   const districts=archive.districts.filter(d=>d.county==='彰化縣');
   if(changhua.county!=='彰化縣'||districts.length!==8||
      districts.reduce((n,d)=>n+d.valid_votes,0)!==changhua.valid_votes||
      districts.reduce((n,d)=>n+d.candidates.length,0)!==changhua.candidate_count||
      districts.reduce((n,d)=>n+d.candidates.filter(c=>c[5]).length,0)!==changhua.elected_count||
      changhua.ballots_cast!==changhua.valid_votes+changhua.invalid_votes){
    throw Error('1994彰化县议员县级统计与选区资料不符');
   }
   archive.verified_county_profiles=[...(archive.verified_county_profiles||[]),changhua];
   const refs=await Promise.allSettled([load(1998,fetcher),load(2002,fetcher)]);
   return enrichLegacyGender(archive,refs.map(r=>r.status==='fulfilled'?r.value:null));
  })().catch(error=>{legacyCouncilRequest=null;throw error});
  return legacyCouncilRequest;
 }
 function addLegacyCouncil(shard,archive){
  const convert=(root.OpenCC||(typeof module!=='undefined'&&module.exports?require('./assets/opencc.js'):null)).Converter({from:'t',to:'cn'});
  const normalize=value=>convert(String(value||'')).replaceAll('臺','台');
  const electionId='1994-council-counties';
  const contests=[],candidacies=[],rows=[];
  for(const item of archive.districts){
   const county=normalize(item.county),district='第'+item.number+'选举区';
   const id=electionId+':'+county+':'+item.electorate+':'+district;
   const {seats,reserved_seats,registered_voters,ballots_cast,valid_votes,invalid_votes,electorate,source_url}=item;
   const scope_names=item.scope_names.map(normalize);
   contests.push({
    contest_id:id,election_id:electionId,county_id:county,county_name:county,county_name_official:item.county,
    district_id:id,district_name:district,district_name_official:'第'+item.number+'選舉區',
    district_number:item.number,election_date:'1994-01-29',source_url,scope_names,scope_label:normalize(item.scope).replaceAll('山胞','少数民族'),
    electorate,seats,reserved_seats,registered_voters,ballots_cast,valid_votes,invalid_votes
   });
   for(const [ballot,originalName,votes,originalParty,gender,elected] of item.candidates){
    const number=String(ballot),name=originalName.split('乾').map(normalize).join('乾');
    const party=normalize(originalParty)||'政党资料缺失';
    const incumbentSource=item.incumbent_sources?.[number],incumbent=typeof incumbentSource?.value==='boolean'?incumbentSource.value:null;
    candidacies.push({
     candidacy_id:id+':'+number,contest_id:id,ballot_number:number,candidate_name:name,candidate_name_official:originalName,
     party_name:party,party_name_official:originalParty,gender,gender_source:item.gender_sources?.[number]||null,incumbent_at_election:incumbent,incumbent_source:incumbentSource||null,votes,
     vote_share:valid_votes?100*votes/valid_votes:0,elected_official:elected
    });
    rows.push({type:'council',level:'district',county,district,electorate,number,name,party,gender,votes,elected,incumbent,town:''});
   }
  }
  const election={election_id:electionId,year:1994,office:'council',source_url:archive.source_url,source_name:'地方选务档案转录'};
  return {...shard,elections:[...shard.elections,election],contests:[...shard.contests,...contests],
   candidacies:[...shard.candidacies,...candidacies],rows:[...shard.rows,...rows]};
 }
 async function loadSupplement(fetcher){
  if(!supplementRequest){
   supplementRequest=(async()=>{
    const response=await fetcher(supplementUrl+'&provenance=20261127-v7');
    if(!response.ok)throw Error('历史议员补充资料 HTTP '+response.status);
    const supplement=await response.json();
    if(supplement.version!==1||!Array.isArray(supplement.paths)||!supplement.years)throw Error('历史议员补充资料不完整');
    return supplement;
   })().catch(error=>{supplementRequest=null;throw error});
  }
  return supplementRequest;
 }
 // 1999-01-25 local-government rules, Article 33: a regional council
 // constituency has one reserved women's seat per four allocated seats.
 // Do not infer earlier-era quotas or indigenous identity-wide allocations.
 const QUOTA_RULE_SOURCE='https://web.cec.gov.tw/api/file/e516071d-517a-4dcf-bbac-9a1e4137fd3f.pdf';
 const PRE1999_QUOTA_SOURCE='https://scups.ppo.scu.edu.tw/upload/f20220531154448sytdj1.pdf';
 function fillRegionalCouncilQuotas(shard){
  const councilIds=new Set(shard.elections.filter(e=>e.office==='council').map(e=>e.election_id));
  const pre1999=shard.year<1999;
  return {...shard,contests:shard.contests.map(c=>councilIds.has(c.election_id)&&c.electorate==='regional'&&
   c.reserved_seats==null&&Number.isInteger(c.seats)&&c.seats>0?
   {...c,reserved_seats:pre1999?Math.floor((c.seats+5)/10):Math.floor(c.seats/4),
    reserved_seats_source:pre1999?PRE1999_QUOTA_SOURCE:QUOTA_RULE_SOURCE,reserved_seats_method:'statutory'}:c)};
 }
 function applyCouncilSupplement(shard,supplement){
  const addition=supplement?.years[shard.year];
  if(!addition)return shard;
  const quotas=addition.quotas||{},shared=new Map();
  for(const group of addition.sharedQuotaGroups||[]){
   if(!Number.isInteger(group.reserved)||group.reserved<0||!Array.isArray(group.contestIds)||group.contestIds.length<2||!group.source)throw Error('历史共享妇保名额资料错误');
   const members=group.contestIds.map(id=>shard.contests.find(c=>c.contest_id===id));
   if(members.some(c=>!c||c.county_name!==group.county||c.electorate!==group.electorate)||group.reserved>members.reduce((n,c)=>n+c.seats,0))throw Error('历史共享妇保选区对应错误：'+group.id);
   for(const id of group.contestIds){if(shared.has(id))throw Error('重复共享妇保选区：'+id);shared.set(id,group)}
  }
  return {...shard,contests:shard.contests.map(contest=>{
   const group=shared.get(contest.contest_id);
   if(group)return {...contest,reserved_seats:group.reserved===0?0:null,reserved_seats_group:group,reserved_seats_source:group.source,reserved_seats_method:group.method==='statutory'?'statutory_shared_group':'official_shared_group'};
   const source=addition.quotaSources?.[contest.contest_id];
   return Object.hasOwn(quotas,contest.contest_id)?{...contest,reserved_seats:quotas[contest.contest_id],...(source?{reserved_seats_source:source,reserved_seats_method:'statutory'}:{})}:contest;
  }),councilDistrictGeometry:Object.fromEntries(
   Object.entries(addition.districts||{}).map(([id,entry])=>[id,{...supplement.paths[entry.path],villages:entry.villages,
    boundaryNote:entry.boundaryNote,source:entry.source}]))};
 }
 function years(office,include2026=false){
  const list=groupedOffice(office)?[...Object.keys(CYCLES).map(Number),2014,2018,2022]:YEARS[office]||[2022];
  return include2026?[...list,2026]:list;
 }
 async function loadCycle(year,office,fetcher=root.fetch){
  year=cycleYear(year,office);
  const earlier=groupedOffice(office)&&CYCLES[year];
  if(!earlier)return load(year,fetcher);
  const [first,second,legacy]=await Promise.all([load(earlier,fetcher),load(year,fetcher),
   year===1994&&office==='council'?loadLegacyCouncil(fetcher):null]);
  const shards=[first,legacy?addLegacyCouncil(second,legacy):second];
  const elections=shards.flatMap(shard=>shard.elections.filter(item=>groupedOffice(item.office)));
  const electionIds=new Set(elections.map(item=>item.election_id));
  const contests=shards.flatMap(shard=>shard.contests.filter(item=>electionIds.has(item.election_id)));
  const contestIds=new Set(contests.map(item=>item.contest_id));
  return {
   schemaVersion:2,year,cycleYears:[earlier,year],elections,contests,
   partialCouncilReturns:legacy?.partial_returns||[],
   verifiedCouncilCountyProfiles:legacy?.verified_county_profiles||[],
   candidacies:shards.flatMap(shard=>shard.candidacies.filter(item=>contestIds.has(item.contest_id))),
   rows:shards.flatMap(shard=>shard.rows.filter(item=>groupedOffice(item.type))),
   townProfiles:shards.flatMap(shard=>(shard.townProfiles||[]).filter(item=>groupedOffice(item.office))),
   councilDistrictGeometry:Object.assign({},...shards.map(shard=>shard.councilDistrictGeometry))
  };
 }
 // Verified 2002 metadata only; vote totals and candidate IDs are unchanged.
 const verified2002Incumbency=[{"id":"2002-council:桃园县:regional:第7选举区:21","name":"黄仁杼","votes":5532,"office":"council","county":"桃园县","district":"第7选举区","number":21,"source":"https://www.ly.gov.tw/Pages/List.aspx?nodeid=1682","corroboration":"https://votetw.com/data/candidate/%E9%BB%83%E4%BB%81%E6%9D%BC","note":"官方履历列第12、13、15、16届议员，缺第14届；当届候选人明细明确列非现任。"},{"id":"2002-council:台中县:regional:第2选举区:3","name":"王加佳","votes":6358,"office":"council","county":"台中县","district":"第2选举区","number":3,"source":"https://news.tvbs.com.tw/politics/332172","corroboration":"https://votetw.com/data/candidate/%E7%8E%8B%E5%8A%A0%E4%BD%B3","note":"同期后续报道证实第一次参选即当选；当届为2002年。"},{"id":"2002-township:金门县:regional:金宁乡:2","name":"翁自然","votes":1081,"office":"township","county":"金门县","district":"金宁乡","number":2,"source":"https://www.kmdn.gov.tw/1117/1271/1272/108008/?cprint=pt","corroboration":"https://votetw.com/data/candidate/%E6%9D%8E%E6%96%87%E4%BF%8A","note":"2002年交接报道确认原任乡长吴怡跑连任两届，新任李文俊；候选人翁自然非现任。"},{"id":"2002-council:台南县:regional:第1选举区:6","name":"杨振基","votes":505,"office":"council","county":"台南县","district":"第1选举区","number":6,"source":"https://votetw.com/data/candidate/%E9%BB%83%E9%87%91%E9%8F%9E","corroboration":"https://whoareyou.readr.tw/election?area=%E8%87%BA%E5%8D%97%E7%B8%A3&type=%E7%B8%A3%E5%B8%82%E8%AD%B0%E5%93%A1&year=1998","original_source":"https://vote.nccu.edu.tw/cec/vote3.asp?pass1=O%3A88%3A8%3E%3A99888888iii%28%28","original_incumbency_code":"M","method":"secondary_crosscheck_prior_election","note":"2002年候选人表号次6、1937年出生、505票一致；政大现任代码M异常，votetw显示否；READr前届完整参选表无此人。按交叉资料补非现任，非投票日原件直接确认。"},{"id":"2002-council:花莲县:regional:第4选举区:8","name":"郭远华","votes":511,"office":"council","county":"花莲县","district":"第4选举区","number":8,"source":"https://votetw.com/data/candidate/%E9%99%B3%E6%A6%AE%E8%B2%A1","corroboration":"https://zh.wikipedia.org/wiki/%E8%8A%B1%E8%93%AE%E7%B8%A3%E8%AD%B0%E6%9C%83%E7%AC%AC%E5%8D%81%E5%9B%9B%E5%B1%86%E8%AD%B0%E5%93%A1%E5%88%97%E8%A1%A8","method":"secondary_crosscheck_prior_election","note":"同一资料页列2002年8号1956年出生511票且非现任，1998年同区完整候选人及当选人名单均无此人；前届名单交叉验证，非投票日原件直接确认。"}];
 function enrich2002Incumbency(shard){
  if(shard.year!==2002)return shard;
  const fixes=new Map(verified2002Incumbency.map(x=>[x.id,x]));
  const norm=v=>String(v??'').replaceAll('臺','台').replaceAll('縣','县').replaceAll('選','选').replaceAll('區','区').replaceAll('鄉','乡').replaceAll('黃','黄').replaceAll('寧','宁');
  const matches=new Map();
  const candidacies=shard.candidacies.map(c=>{
   const fix=fixes.get(c.candidacy_id);
   if(!fix)return c;
   if(norm(c.candidate_name)!==fix.name||Number(c.ballot_number)!==fix.number||c.votes!==fix.votes||c.incumbent_at_election===true)throw Error('2002年候选人现任资料核验不符：'+fix.id);
   matches.set(fix.id,fix);
   return {...c,incumbent_at_election:false,incumbent_source:{method:fix.method||'contemporaneous_or_official_roster_crosscheck',source_url:fix.source,corroboration_url:fix.corroboration,original_source:fix.original_source||null,original_incumbency_code:fix.original_incumbency_code||null,note:fix.note}};
  });
  if(matches.size!==fixes.size)throw Error('2002年候选人补充资料对应不完整');
  const rows=shard.rows.map(row=>{
   const fix=[...matches.values()].find(x=>row.type===x.office&&norm(row.county)===x.county&&norm(row.name)===x.name&&Number(row.number)===x.number&&(x.office==='township'?norm(row.town)===x.district: norm(row.district)===x.district||norm(row.district).replace('选举区','选区')===x.district.replace('选举区','选区')));
   return fix?{...row,incumbent:false}:row;
  });
  return {...shard,candidacies,rows};
 }
 async function load(year,fetcher=root.fetch){
  if(!Object.values(YEARS).some(list=>list.includes(year))||year===2022)throw Error('不支持的地方选举年份');
  return pending.get(year,async()=>{
   const [response,supplement]=await Promise.all([
    year===1994?fetcher(localUrl(year),{cache:'no-cache'}):fetcher(localUrl(year)),
    supplementYears.has(year)?loadSupplement(fetcher):null
   ]);
   if(!response.ok)throw Error('历史数据 HTTP '+response.status);
   const shard=await response.json();
   if(shard.schemaVersion!==2||shard.year!==year||!shard.rows?.length||!shard.candidacies?.length||
      !shard.contests?.length||!shard.elections?.length)throw Error('历史选举数据不完整');
   return enrich2002Incumbency(fillRegionalCouncilQuotas(applyCouncilSupplement(shard,supplement)));
  });
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
 // Truncated names in the official 2002 and 2005 area tables, plus 1994 names
 // that differ from the geometry's earlier mayoral data labels.
 const councilTownAliases={'嘉义县|里山乡':'阿里山乡','屏东县|地门乡':'三地门乡','台东县|麻里乡':'太麻里乡'};
 const archiveTownAliases={
  '桃园县|八德乡':'八德市','苗栗县|头份镇':'头份市','台中县|太平乡':'太平市','彰化县|员林镇':'员林市'
 };
 function councilTownName(contest,town){
  const key=contest.county_name+'|'+town;
  return (contest.election_id==='1994-council-counties'&&archiveTownAliases[key])||councilTownAliases[key]||town;
 }
 function councilMap(shard,geography,mergePaths){
  const councilElections=new Set(shard.elections.filter(item=>item.office==='council').map(item=>item.election_id));
  const groups=shard.contests.filter(contest=>councilElections.has(contest.election_id));
  const owners=new Map();
  for(const contest of groups.filter(c=>c.electorate==='regional')){
   for(const town of contest.scope_names||[]){
    const key=contest.county_name+'|'+councilTownName(contest,town);
    owners.set(key,(owners.get(key)||0)+1);
   }
  }
  const features=[],districts=[];
  const lookup=new Map(geography.towns.map(town=>[town.county+'|'+town.name,town]));
  for(const contest of groups){
   const county=contest.county_name,number=contest.district_number;
   const scopeTowns=(contest.scope_names||[]).map(name=>councilTownName(contest,name));
   const split=shard.councilDistrictGeometry?.[contest.contest_id];
   const mergedTainan=county==='台南市'&&shard.year<=2002&&scopeTowns.length===2&&scopeTowns.includes('中区')&&scopeTowns.includes('西区');
   const towns=mergedTainan?[lookup.get(county+'|中西区')].filter(Boolean):
    scopeTowns.map(name=>lookup.get(county+'|'+name)).filter(Boolean);
   const shared=scopeTowns.some(name=>owners.get(county+'|'+name)>1);
   const complete=Boolean(split?.d)||towns.length>0&&(mergedTainan||towns.length===scopeTowns.length&&(!shared||contest.electorate!=='regional'));
   const district={
    id:contest.contest_id,county,name:contest.district_name,number,electorate:contest.electorate,
    scope:contest.scope_label||scopeTowns.join('、'),scopeTowns,scopeVillages:split?.villages||[],scopeSource:split?.source,seats:contest.seats,
    womenReserved:contest.reserved_seats,womenReservedGroup:contest.reserved_seats_group,womenReservedMethod:contest.reserved_seats_method,mapAvailable:complete
   };
   districts.push(district);
   if(!complete)continue;
   const shape=split?.d?{d:split.d,box:split.box,center:split.center,historicalBoundaryNote:split.boundaryNote||'按当届里别归属，以现行或沿革对应的里界近似绘制'}:
    {...areaShape(towns,mergePaths),...(mergedTainan?{historicalBoundaryNote:'旧中区、西区同属这个选区，以合并后的中西区轮廓近似绘制'}:{})};
   features.push({...shape,...district,id:'history-'+district.id,historyId:district.id});
  }
  return {features,districts};
 }
 // The 2022 Chiayi City rerun applied only to the mayor election.
 // Source: https://web.cec.gov.tw/api/file/72529fa8-25c6-4260-bcbc-7de268017766.pdf
 function correctElectionDates(shard){
  if(shard.year!==2022)return shard;
  const offices=new Map(shard.elections.map(e=>[e.election_id,e.office]));
  return {...shard,contests:shard.contests.map(c=>{
   if(!['嘉义市','嘉義市'].includes(c.county_name))return c;
   const office=offices.get(c.election_id);
   if(!['mayor','council'].includes(office))return c;
   return {...c,election_date:office==='mayor'?'2022-12-18':'2022-11-26'};
  })};
 }
 // Synchronize the legacy 2022 entity snapshot with its existing official district index.
 // Keep every candidate/contest ID and vote unchanged; the scope is the source's town-level coverage,
 // not a claim that split-town legal boundaries equal the whole town.
 function reconcile2022Council(shard,metadata,normalize){
  if(shard.year!==2022)return shard;
  const identity=e=>({plainsIndigenous:'plains',mountainIndigenous:'mountain'}[e]||e);
  const number=v=>Number(String(v).match(/第\s*0*(\d+)/)?.[1]);
  const key=(c,e,n)=>[normalize(c).replaceAll('臺','台'),identity(e),n].join('|');
  const index=new Map(metadata.rows.map(d=>[key(d.county,d.electorate,d.number),d]));
  const councilIds=new Set(shard.elections.filter(e=>e.office==='council').map(e=>e.election_id));
  const counts=new Map();
  for(const c of shard.candidacies)if(c.elected_official===true)counts.set(c.contest_id,(counts.get(c.contest_id)||0)+1);
  if(metadata.year!==2022||index.size!==215||metadata.rows.length!==215)throw Error('2022议员选区索引异常');
  const matched=new Set();let seats=0;
  const contests=shard.contests.map(d=>{
   if(!councilIds.has(d.election_id))return d;
   const k=key(d.county_name,d.electorate,d.district_number||number(d.district_name)),m=index.get(k);
   if(!m||matched.has(k)||!Number.isInteger(m.seats)||m.seats<1||!Number.isInteger(m.womenReserved)||!Array.isArray(m.scopeTowns)||!m.scopeTowns.length||counts.get(d.contest_id)!==m.seats)throw Error('2022议员选区核验失败：'+k);
   matched.add(k);seats+=m.seats;
   return {...d,seats:m.seats,reserved_seats:m.womenReserved,scope_names:m.scopeTowns.map(normalize)};
  });
  if(matched.size!==215||seats!==910)throw Error('2022议员名额总数核验失败');
  return {...shard,contests};
 }
 const api={trendSummarySourceVersion,reconcile2022Council,YEARS,years,yearLabel,cycleYear,load,loadCycle,geometry,councilMap,applyCouncilSupplement,fillRegionalCouncilQuotas,correctElectionDates,enrichLegacyGender,enrich2002Incumbency};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLocal=api;
})(typeof window==='undefined'?{}:window);
