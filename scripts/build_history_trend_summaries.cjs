/* Reuse the browser's aggregation; never invent missing results. */
'use strict';
async function build({Local,Trends,Summary,OpenCC,read,Presidential,PresidentialTurnout,offices=['council','mayor']}){
 const convert=OpenCC.Converter({from:'t',to:'cn'}),names=new Map();
 const normalize=value=>{const raw=String(value||'');if(!names.has(raw))names.set(raw,convert(raw).replaceAll('臺','台'));return names.get(raw)};
 const inputs=new Map();
 const fetcher=async url=>{const path=url.split('?')[0];let entry=inputs.get(path);if(!entry){entry=Promise.resolve(read(path));inputs.set(path,entry)}const source=await entry;return{ok:true,json:async()=>JSON.parse(source.content)}};
 const files=new Map(),yearsByOffice={};
 for(const office of offices){
  const source=office==='president'?Presidential:Local;
  const years=Summary.summaryYears(office,office==='president'?Presidential.YEARS:Local.years(office));yearsByOffice[office]=years;
  const outputs=Summary.counties.map((county,index)=>({path:'assets/history-trend-summary-v1/'+office+'-'+index+'.json',payload:{schemaVersion:1,office,county,algorithmVersion:Trends.summaryAlgorithmVersion,sourceVersion:source.trendSummarySourceVersion(),years:{}}}));
  for(const year of years){
   const snapshot=office==='president'?PresidentialTurnout.enrich(await Presidential.load(year,fetcher)):await Local.loadCycle(year,office,fetcher);
   for(const {payload} of outputs){
    const base={office,county:payload.county,normalize};let result;
    if(office==='council')result=Object.fromEntries(Summary.ballots.map(electorate=>[electorate,Trends.councilBallotRows(snapshot,{...base,electorate})]));
    else{
     result={};
     for(const level of ['county','town']){
      const selection={...base,level,electorate:'regional',candidateScope:'top'};
      result[level]=Object.fromEntries(['party','share','votes'].map(metric=>[metric,Trends.historicalScopeRows(snapshot,{...selection,metric},null)]));
      result[level].voteRows=Trends.localPartyVoteShares(snapshot,selection);
     }
    }
    if(!Summary.yearValid(result,{office}))throw Error('Invalid summary '+office+' '+payload.county+' '+year);
    payload.years[year]=result;
   }
  }
  for(const {path,payload} of outputs)files.set(path,JSON.stringify(payload)+'\n');
 }
 // The loader memoizes validated years across calls. Still record each required
 // input explicitly, even when a preceding build populated its in-memory cache.
 if(offices.length===1&&offices[0]==='township'){
  for(const year of yearsByOffice.township)await fetcher('assets/history-local-'+year+'.json');
  await fetcher('assets/history-local-council-supplement.json');
 }
 if(offices.length===1&&offices[0]==='president')for(const year of yearsByOffice.president)await fetcher('assets/history-president-'+year+'.json');
 const sources={};for(const path of [...inputs.keys()].sort())sources[path]=(await inputs.get(path)).sha;
 const manifestName=offices.join(',')==='council,mayor'?'manifest':'manifest-'+offices.join('-');
 files.set('assets/history-trend-summary-v1/'+manifestName+'.json',JSON.stringify({schemaVersion:1,yearsByOffice,sourceVersion:(offices.length===1&&offices[0]==='president'?Presidential:Local).trendSummarySourceVersion(),algorithmVersion:Trends.summaryAlgorithmVersion,sources},null,2)+'\n');
 return files;
}
module.exports={build};
if(require.main===module)(async()=>{
 const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),root=path.resolve(__dirname,'..');
 const read=async relative=>{const bytes=await fs.readFile(path.join(root,relative));return{content:bytes.toString('utf8'),sha:crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')}};
 const config={Local:require('../history-local.js'),Trends:require('../history-trends.js'),Summary:require('../history-trend-summary.js'),OpenCC:require('../assets/opencc.js'),Presidential:require('../history-presidential.js'),PresidentialTurnout:require('../history-presidential-turnout.js'),read};
 const files=new Map();for(const offices of [['council','mayor'],['president'],['township']])for(const [key,value] of await build({...config,offices}))files.set(key,value);
 for(const [relative,content] of files){
  const target=path.join(root,relative);
  if(process.argv.includes('--check')){if(await fs.readFile(target,'utf8')!==content)throw Error('Outdated summary: '+relative)}
  else{await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,content)}
 }
 console.log('Verified '+files.size+' local trend summary files');
})().catch(error=>{console.error(error);process.exitCode=1});
