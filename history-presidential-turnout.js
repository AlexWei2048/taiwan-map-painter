'use strict';
// County-level registered voters and ballots cast for historic presidential elections.
// 2012 / 2016 / 2020: election overview turnout tables transcribed from votetw.com,
// and reconciled exactly against the original nationwide CEC-derived election snapshots.
// 2024: official CEC-commissioned research report, table 1-6 (p. 11).
// Reported 2024 county ballots sum to one more than the prior national snapshot;
// no adjustment is made to either source.
(function(root){
 const tables={"2012":[["台北市",2102664,1614399],["新北市",3074849,2333708],["台中市",2018158,1529053],["台南市",1485047,1101662],["高雄市",2192005,1664032],["宜兰县",358059,259741],["桃园县",1506311,1124996],["新竹县",384261,292313],["苗栗县",436219,325561],["彰化县",1005714,738807],["南投县",411482,292671],["云林县",563034,388042],["嘉义县",431588,312825],["屏东县",684517,497426],["台东县",178938,110572],["花莲县",263888,170589],["澎湖县",77817,45921],["基隆市",302139,217803],["新竹市",312118,236204],["嘉义市",205711,151261],["金门县",83949,39175],["连江县",7987,5255]],"2016":[["连江县",10240,4553],["金门县",111386,37404],["宜兰县",369211,236490],["新竹县",412731,271939],["苗栗县",448520,290680],["彰化县",1022962,681581],["南投县",415122,264225],["云林县",566207,350122],["嘉义县",430885,284102],["屏东县",689170,454951],["台东县",179547,98871],["花莲县",267862,157185],["澎湖县",84222,43266],["基隆市",306548,196146],["新竹市",328580,224493],["嘉义市",210758,140383],["台北市",2175986,1480218],["高雄市",2254324,1524873],["新北市",3204367,2154229],["台中市",2138519,1461896],["台南市",1528246,1005693],["桃园市",1627598,1085002]],"2020":[["连江县",10939,6272],["金门县",120721,48463],["宜兰县",375608,277435],["新竹县",438049,329009],["苗栗县",447422,330179],["彰化县",1035507,773508],["南投县",413485,302707],["云林县",565269,404991],["嘉义县",428640,311038],["屏东县",688793,516042],["台东县",179536,116787],["花莲县",269558,187293],["澎湖县",88432,51548],["基隆市",311801,228662],["新竹市",345345,264525],["嘉义市",215055,163402],["台北市",2167264,1653834],["高雄市",2299558,1780832],["新北市",3321459,2494228],["台中市",2251064,1719020],["台南市",1556845,1179589],["桃园市",1780755,1325207]],"2024":[["台北市",2090062,1552592],["新北市",3402064,2476077],["桃园市",1882592,1359689],["台中市",2328896,1719917],["台南市",1567432,1128215],["高雄市",2312303,1647466],["宜兰县",379026,269054],["新竹县",466558,342752],["苗栗县",447767,320991],["彰化县",1032636,747757],["南投县",407149,289514],["云林县",560296,384037],["嘉义县",423199,294998],["屏东县",681631,479379],["台东县",178728,110836],["花莲县",267824,176018],["澎湖县",92642,49750],["连江县",12083,6201],["金门县",126422,45981],["基隆市",312207,220365],["新竹市",359465,268127],["嘉义市",217549,158595]]};
 const sources={"2012":"https://votetw.com/data/election/20120101P1A1","2016":"https://votetw.com/data/election/20160101P1A1","2020":"https://votetw.com/data/election/20200101P1A1","2024":"https://web.cec.gov.tw/api/file/ce228705-c738-450c-9be9-761e3cdd94ca.pdf"};
 function enrich(shard){
  const year=Number(shard?.year),rows=tables[year];
  if(!rows||!Array.isArray(shard.contests))return shard;
  const stats=new Map(rows.map(([county,registered_voters,ballots_cast])=>
   [county,{registered_voters,ballots_cast}]));
  const seen=new Set();
  for(const contest of shard.contests){
   const values=stats.get(contest.county_name);
   if(!values||!Number.isInteger(contest.valid_votes)||values.ballots_cast<contest.valid_votes)
    throw Error(year+'年县市投票统计与已核验候选人得票不一致：'+contest.county_name);
   seen.add(contest.county_name);
  }
  if(seen.size!==stats.size||shard.contests.length!==stats.size)
   throw Error(year+'年县市投票统计覆盖范围不完整');
  const registered=[...stats.values()].reduce((sum,row)=>sum+row.registered_voters,0);
  const ballots=[...stats.values()].reduce((sum,row)=>sum+row.ballots_cast,0);
  const national=shard.national;
  if(registered!==national?.registered_voters||
   (ballots!==national?.ballots_cast&&!(year===2024&&ballots===national?.ballots_cast+1)))
   throw Error(year+'年县市选举统计无法与全台原始结果核对');
  const actualValid=shard.contests.reduce((sum,contest)=>sum+contest.valid_votes,0);
  if(actualValid!==national.valid_votes)throw Error(year+'年有效票数校验未通过');
  for(const contest of shard.contests){
   const values=stats.get(contest.county_name);
   contest.registered_voters=values.registered_voters;
   contest.ballots_cast=values.ballots_cast;
   contest.invalid_votes=values.ballots_cast-contest.valid_votes;
  }
  shard.provenance={...shard.provenance,countyTurnoutSource:sources[year],
   countyTurnoutNote:year===2024?
    '2024年中选会委托研究报告表1-6；无效票按投票数减已核验有效票。县市合计投票数较全台原有统计多1票，分别保留原始数据。':
    year+'年县市选举人数与投票数据选举统计汇整资料，已与原始全台统计及各县市候选人有效票核对。'};
  return shard;
 }
 const api={enrich,sources,years:Object.keys(tables).map(Number),counties:22};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryPresidentialTurnout=api;
})(typeof window==='undefined'?{}:window);
