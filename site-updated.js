/* Last successful public website publication; never use a visitor's device clock. */
(()=>{
 'use strict';
 const target=document.getElementById('siteUpdatedAt');
 if(!target)return;
 const timezone='Asia/Taipei';
 const format=new Intl.DateTimeFormat('zh-CN',{
  timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 });
 let priority=0;
 function show(value,source,rank){
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())||rank<priority)return;
  priority=rank;
  const parts=Object.fromEntries(format.formatToParts(date).map(p=>[p.type,p.value]));
  target.textContent=`更新时间：${parts.year}年${Number(parts.month)}月${Number(parts.day)}日 ${parts.hour}:${parts.minute}（GMT+8）`;
  target.dateTime=date.toISOString();
  target.title=source;
  target.dataset.source=rank===2?'github-pages':'site-header';
 }
 async function timedFetch(url,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),4500);
  try{return await fetch(url,{...options,signal:controller.signal,cache:'no-store'})}
  finally{clearTimeout(timer)}
 }
 async function siteHeader(){
  // GitHub Pages' Last-Modified belongs to the actually served website.
  const url=new URL('./index.html',location.href);
  url.searchParams.set('_site_updated',String(Date.now()));
  const response=await timedFetch(url,{method:'HEAD'});
  if(!response.ok)throw Error('Website metadata HTTP '+response.status);
  const value=response.headers.get('Last-Modified');
  if(!value)throw Error('No Last-Modified header');
  show(value,'网站已发布文件的修改时间',1);
 }
 async function successfulDeployment(){
  // The completion time of the last successful Pages deployment is more
  // precise than a source-code commit or a browser cache timestamp.
  const url='https://api.github.com/repos/AlexWei2048/taiwan-map-painter/actions/runs?status=success&per_page=50';
  const response=await timedFetch(url,{headers:{Accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error('GitHub deployment API HTTP '+response.status);
  const payload=await response.json();
  const runs=(payload.workflow_runs||[])
   .filter(run=>run.name==='pages build and deployment'&&run.conclusion==='success'&&run.head_branch==='main')
   .sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at));
  if(!runs.length)throw Error('No successful Pages deployment');
  show(runs[0].updated_at,'GitHub Pages 最近一次成功部署的完成时间',2);
 }
 Promise.allSettled([siteHeader(),successfulDeployment()]).then(()=>{
  if(!priority){
   target.textContent='更新时间：暂时无法获取';
   target.title='网站的发布时间接口暂时不可用';
  }
 });
})();
