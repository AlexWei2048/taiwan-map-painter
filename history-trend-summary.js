/* Precomputed local election summaries; incompatible queries use the original data. */
(function(root){
'use strict';
const counties=['','台北市','新北市','桃园市','台中市','台南市','高雄市','新竹县','苗栗县','彰化县','南投县','云林县','嘉义县','屏东县','宜兰县','花莲县','台东县','澎湖县','基隆市','新竹市','嘉义市','金门县','连江县'];
const ballots=['all','regional','plains','mountain','indigenous'];
function key(conf){
 const index=counties.indexOf(conf.county||'');if(index<0||conf.focus)return '';
 if(conf.office==='council'&&ballots.includes(conf.electorate))return 'council-'+index;
 if(['mayor','president','township'].includes(conf.office)&&(!conf.electorate||conf.electorate==='regional')&&['county','town'].includes(conf.level)&&['party','share','votes'].includes(conf.metric)&&conf.candidateScope!=='candidate')return conf.office+'-'+index;
 return '';
}
function compatible(payload,conf,local,trends,presidential){const source=conf.office==='president'?presidential:local;return payload?.schemaVersion===1&&payload.office===conf.office&&payload.county===(conf.county||'')&&payload.sourceVersion===source?.trendSummarySourceVersion()&&payload.algorithmVersion===trends.summaryAlgorithmVersion&&payload.years&&typeof payload.years==='object'}
function rowsValid(rows){return Array.isArray(rows)&&rows.length>0&&rows.every(r=>r&&typeof r.complete==='boolean'&&Number.isInteger(r.year)&&r.parties&&typeof r.parties==='object')}
function yearValid(data,conf){
 if(conf.office==='council')return ballots.every(b=>rowsValid(data?.[b])&&data[b].every(r=>r.seats&&typeof r.seats==='object'));
 return ['county','town'].every(level=>['party','share','votes','voteRows'].every(metric=>rowsValid(data?.[level]?.[metric])));
}
const summaryYears=(office,years)=>office==='president'?years:years.filter(y=>y<2022);
const api={counties,ballots,key,compatible,yearValid,summaryYears};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryTrendSummary=api;
})(typeof window==='undefined'?{}:window);
