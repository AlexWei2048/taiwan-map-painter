'use strict';
// CEC-commissioned 2024 election report, table 1-6 (p. 11):
// registered voters and ballots cast by county. Names normalized to this app.
// https://web.cec.gov.tw/api/file/ce228705-c738-450c-9be9-761e3cdd94ca.pdf
// The published nationwide row differs by one ballot from the preexisting
// national snapshot. Preserve its official national total independently;
// county figures are reported exactly as in the table, not adjusted to match.
(function(root){
 const table=[["台北市",2090062,1552592],["新北市",3402064,2476077],["桃园市",1882592,1359689],["台中市",2328896,1719917],["台南市",1567432,1128215],["高雄市",2312303,1647466],["宜兰县",379026,269054],["新竹县",466558,342752],["苗栗县",447767,320991],["彰化县",1032636,747757],["南投县",407149,289514],["云林县",560296,384037],["嘉义县",423199,294998],["屏东县",681631,479379],["台东县",178728,110836],["花莲县",267824,176018],["澎湖县",92642,49750],["连江县",12083,6201],["金门县",126422,45981],["基隆市",312207,220365],["新竹市",359465,268127],["嘉义市",217549,158595]];
 const stats=new Map(table.map(([county,registered_voters,ballots_cast])=>
  [county,{registered_voters,ballots_cast}]));
 const source='https://web.cec.gov.tw/api/file/ce228705-c738-450c-9be9-761e3cdd94ca.pdf';
 function enrich(shard){
  if(Number(shard?.year)!==2024||!Array.isArray(shard.contests))return shard;
  const counties=new Set();
  for(const contest of shard.contests){
   const values=stats.get(contest.county_name);
   if(!values||!Number.isInteger(contest.valid_votes)||values.ballots_cast<contest.valid_votes)
    throw Error('2024县市投票统计与已核验候选人得票不一致：'+contest.county_name);
   counties.add(contest.county_name);
  }
  if(counties.size!==stats.size||shard.contests.length!==stats.size)
   throw Error('2024县市投票统计覆盖范围不完整');
  const registered=[...stats.values()].reduce((sum,row)=>sum+row.registered_voters,0);
  if(registered!==shard.national?.registered_voters)
   throw Error('2024县市选举人数无法与官方总数核对');
  for(const contest of shard.contests){
   const values=stats.get(contest.county_name);
   contest.registered_voters=values.registered_voters;
   contest.ballots_cast=values.ballots_cast;
   contest.invalid_votes=values.ballots_cast-contest.valid_votes;
  }
  shard.provenance={...shard.provenance,
   countyTurnoutSource:source,
   countyTurnoutNote:'2024年中选会委托研究报告表1-6；无效票为公布的投票数减去已核验有效票。县市合计的投票数较原有全台汇总多1票，分别保留原始数据。'};
  return shard;
 }
 const api={enrich,source,counties:table.length};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.HistoryPresidentialTurnout=api;
})(typeof window==='undefined'?{}:window);
