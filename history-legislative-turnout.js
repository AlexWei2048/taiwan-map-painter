/* Verified historical legislative turnout by ballot. Fields: registered, cast,
 * valid, invalid. Source CEC 1995/2004/2024 election summaries and historical
 * CEC compilation https://www.taiwan-database.net/LL-M11.htm.
 * CEC: https://web.cec.gov.tw/english/article/21799
 * https://web.cec.gov.tw/english/article/21805
 * https://web.cec.gov.tw/english/article/59710
 * Some older elections have only whole-election totals, which are never used
 * as the statistics of a particular ballot type.
 */
(function(root){
 'use strict';
 const NATIONAL={"1995":{"regional":[13922373,9440685,9311367,129318],"plains":[110147,58394,56874,1520],"mountain":[120900,75309,73895,1414]},"2004":{"regional":[16258979,9649868,9572532,77336],"plains":[144646,63954,63241,713],"mountain":[155629,82477,81586,891]},"2008":{"regional":[16856584,9897618,9740896,156722],"plains":[156052,66908,65522,1386],"mountain":[167020,86093,84358,1735],"party":[17288551,10076239,9780573,295666]},"2012":{"regional":[17625632,13170281,12943139,227142],"plains":[171548,100671,98131,2540],"mountain":[183398,119374,116712,2662],"party":[18090295,13445691,13162072,283619]},"2016":{"regional":[18305112,12187924,11941091,246833],"plains":[187076,96761,94607,2154],"mountain":[200029,115341,112965,2376],"party":[18786940,12447036,12190139,256897]},"2020":{"regional":[18806913,14129999,13885428,244571],"plains":[199833,124504,121880,2624],"mountain":[215115,147572,144724,2848],"party":[19312105,14456293,14160138,296155]},"2024":{"regional":[19030770,13717893,13363780,354113],"plains":[210036,122343,119063,3280],"mountain":[228164,146750,144214,2536],"party":[19566007,14044052,13776736,267316]}};
 const WHOLE_ELECTION={"1992":[13421170,9666020,9489305,176715],"1995":[14153420,9574388,9442136,132252],"1998":[14961930,10188302,10035829,152473],"2001":[15822583,10469005,10327855,141150],"2004":[16559254,9796299,9717359,78940]};
 const COUNTY={"2004":{"regional":{"新竹县":[315470,190319,188287,2032],"云林县":[551467,353313,349862,3451],"花莲县":[197038,96590,95768,822]}}};
 // CEC-sourced geographic profiles for 1995-2016, generated from the original
 // official voter/ballot records and reconciled with independently loaded votes.
 const GEO_YEARS=new Set([1995,1998,2001,2004,2008,2012,2016,2020,2024]);
 const regions=new Map(),loading=new Map();
 async function load(year,fetcher=root.fetch){
  year=Number(year);
  if(!GEO_YEARS.has(year)||typeof fetcher!=='function')return null;
  if(regions.has(year))return regions.get(year);
  if(loading.has(year))return loading.get(year);
  const promise=(async()=>{
   const response=await fetcher('assets/history-legislative-turnout-'+year+'.json?v=20261115-cec-modern-v3',{cache:'default'});
   if(!response.ok)throw Error('历史选举概况资料 HTTP '+response.status);
   const content=await response.json();
   if(content.schemaVersion!==1||content.year!==year||!content.ballots)
    throw Error('历史选举概况资料版本不正确');
   regions.set(year,content);return content;
  })();
  loading.set(year,promise);
  try{return await promise}finally{loading.delete(year)}
 }
 const SOURCES={1995:'https://web.cec.gov.tw/english/article/21799',2004:'https://web.cec.gov.tw/english/article/21805',2024:'https://web.cec.gov.tw/english/article/59710'};
 const HISTORICAL_SOURCE='https://www.taiwan-database.net/LL-M11.htm';
 function unpack(row){
  if(!Array.isArray(row)||row.length!==4)return null;
  const [registeredVoters,ballotsCast,validVotes,invalidVotes]=row;
  if(!row.every(n=>Number.isSafeInteger(n)&&n>=0)||registeredVoters<ballotsCast||
   ballotsCast===0||ballotsCast!==validVotes+invalidVotes)return null;
  return{registeredVoters,ballotsCast,validVotes,invalidVotes,turnout:ballotsCast/registeredVoters*100};
 }
 function national(year,electorate){return unpack(NATIONAL[Number(year)]?.[String(electorate)])}
 function overall(year){return unpack(WHOLE_ELECTION[Number(year)])}
 function verified(record,overview){
  const profile=unpack(record);
  // A complete, independently matched candidate-vote tally must accompany
  // voter registration and invalid-ballot figures.
  return profile&&profile.validVotes===overview.validVotes?profile:null;
 }
 function enrich(overview={},selection={}){
  const year=Number(selection.year),electorate=String(selection.electorate||'regional'),
   scope=selection.scope||'all',isNation=scope==='all'||scope==='national',
   county=String(selection.county||''),area=String(selection.area||'');
  const local=regions.get(year)?.ballots?.[electorate];
  let record=null,source=null;
  if(isNation){
   record=verified(local?.national,overview)||national(year,electorate);
   source=record&&verified(local?.national,overview)?
    (year>=2020?'https://github.com/kiang/db.cec.gov.tw':'https://github.com/MISNUK/CECDataSet'):
    SOURCES[year]||HISTORICAL_SOURCE;
  }else if(scope==='county'){
   record=verified(local?.county?.[county],overview)||
    verified(COUNTY[year]?.[electorate]?.[county],overview);
  }else if(scope==='district'){
   const number=String(selection.districtNumber||'');
   record=verified(local?.district?.[county]?.[number],overview)||
    (selection.contests===1?verified(local?.county?.[county],overview):null)||
    (selection.contests===1?verified(COUNTY[year]?.[electorate]?.[county],overview):null);
  }else if(scope==='town'){
   record=verified(local?.town?.[county]?.[area],overview);
  }
  if(!record)return{...overview,historicalOverall:isNation?overall(year):null};
  const groups=(overview.turnoutGroups||[]).map(group=>
   group.electorate===electorate?{...group,...record}:group);
  return{...overview,...record,turnoutGroups:groups,historicalOverall:null,
   turnoutSource:source||(year>=2020?'https://github.com/kiang/db.cec.gov.tw':'https://github.com/MISNUK/CECDataSet')};
 }
 const api={NATIONAL,WHOLE_ELECTION,COUNTY,national,overall,load,enrich};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLegislativeTurnout=api;
})(typeof window==='undefined'?{}:window);
