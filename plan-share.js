/* Explicit, local-only sharing; bounded compressed URL fragments. */
(function(root){
'use strict';
const PREFIX='#plan-v1=',MAX_LINK=18000,MAX_BYTES=1000000;
const bytesTo64=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')};
const from64=s=>{if(!/^[A-Za-z0-9_-]+$/.test(s)||s.length>MAX_LINK)throw Error('分享链接格式或长度无效');const b=atob(s.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-s.length%4)%4));return Uint8Array.from(b,c=>c.charCodeAt(0))};
async function transform(bytes,kind,limit){
 const Stream=kind==='compress'?root.CompressionStream:root.DecompressionStream;
 if(!Stream)throw Error('此浏览器不支持压缩分享，请下载 JSON 方案');
 const reader=new Blob([bytes]).stream().pipeThrough(new Stream('gzip')).getReader();const chunks=[];let count=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>limit)throw Error('方案过大，请使用 JSON 文件');chunks.push(value)}}finally{await reader.cancel().catch(()=>{})}
 const result=new Uint8Array(count);let i=0;for(const c of chunks){result.set(c,i);i+=c.length}return result
}
async function encode(plan){
 if(!plan||typeof plan.name!=='string'||!plan.name.trim()||plan.name.length>40||plan.project?.version!==1)throw Error('方案格式不正确');
 const bytes=new TextEncoder().encode(JSON.stringify({version:1,name:plan.name,project:plan.project}));
 if(bytes.length>MAX_BYTES)throw Error('方案过大，请使用 JSON 文件');
 const hash=PREFIX+bytesTo64(await transform(bytes,'compress',MAX_LINK));if(hash.length>MAX_LINK)throw Error('分享链接过长，请使用 JSON 文件');return hash
}
async function decode(hash){
 if(typeof hash!=='string'||!hash.startsWith(PREFIX)||hash.length>MAX_LINK)throw Error('分享链接格式或长度无效');
 const raw=await transform(from64(hash.slice(PREFIX.length)),'decompress',MAX_BYTES),p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 if(p?.version!==1||typeof p.name!=='string'||!p.name.trim()||p.name.length>40||p.project?.version!==1)throw Error('分享方案无效');
 return {name:p.name,project:p.project}
}
const api={PREFIX,encode,decode};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MapPlanShare=api;
})(typeof globalThis==='undefined'?window:globalThis);
