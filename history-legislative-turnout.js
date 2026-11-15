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
 function enrich(overview={},selection={}){
  const year=Number(selection.year),electorate=String(selection.electorate||'regional'),
   scope=selection.scope||'all',isNation=scope==='all'||scope==='national';
  const record=isNation?national(year,electorate):
   (scope==='county'||scope==='district'&&selection.contests===1)?
    unpack(COUNTY[year]?.[electorate]?.[selection.county]):null;
  if(!record)return{...overview,historicalOverall:isNation?overall(year):null};
  if(!isNation&&overview.validVotes!==record.validVotes)return{...overview,historicalOverall:null};
  const groups=(overview.turnoutGroups||[]).map(group=>group.electorate===electorate?{...group,...record}:group);
  return{...overview,...record,turnoutGroups:groups,historicalOverall:null,
   turnoutSource:isNation?SOURCES[year]||HISTORICAL_SOURCE:'https://db.cec.gov.tw/ElecTable/'};
 }
 const api={NATIONAL,WHOLE_ELECTION,COUNTY,national,overall,enrich};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryLegislativeTurnout=api;
})(typeof window==='undefined'?{}:window);
