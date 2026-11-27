/* Public website update time: read the served page itself, never a third-party API. */
(()=>{'use strict';
 const target=document.getElementById('siteUpdatedAt');if(!target)return;
 const format=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 async function refresh(){const c=new AbortController(),timer=setTimeout(()=>c.abort(),5000);try{const response=await fetch(new URL('./index.html',location.href),{method:'HEAD',cache:'no-cache',signal:c.signal});if(!response.ok)throw Error('HTTP');const date=new Date(response.headers.get('Last-Modified')||'');if(!Number.isFinite(date.getTime()))throw Error('Last-Modified');const p=Object.fromEntries(format.formatToParts(date).map(x=>[x.type,x.value]));target.textContent='更新时间：'+p.year+'年'+Number(p.month)+'月'+Number(p.day)+'日 '+p.hour+':'+p.minute+'（GMT+8）';target.dateTime=date.toISOString();target.title='本站已发布页面的文件修改时间';target.dataset.source='site-header'}catch(e){target.textContent='更新时间：暂时无法获取';target.title='本站暂未返回文件修改时间'}finally{clearTimeout(timer)}}
 function idle(){if(typeof requestIdleCallback==='function')requestIdleCallback(refresh,{timeout:1500});else setTimeout(refresh,0)}
 if(document.readyState==='complete')idle();else addEventListener('load',idle,{once:true});
})();
