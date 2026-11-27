/* Shared historical analysis export utilities. No prediction state. */
(function(root){
'use strict';
const FONT='Microsoft YaHei, PingFang SC, Arial, sans-serif';
const SOURCE='资料来源：岛屿调色盘历史档案（详见网站数据来源）';
const NS='http://www.w3.org/2000/svg';
function pngScale(w,h){return Number.isFinite(w)&&Number.isFinite(h)&&w>0&&h>0?Math.max(0,Math.min(3,Math.floor(16000/Math.max(w,h)),Math.floor(Math.sqrt(55000000/(w*h))))):0}
function filename(v){return String(v||'历史选举资料').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,180)||'历史选举资料'}
function wrap(value,limit){const a=[];let line='',width=0;for(const ch of String(value)){const n=/[^\x00-\x7f]/.test(ch)?2:1;if(width+n>limit&&line){a.push(line);line='';width=0}line+=ch;width+=n}if(line)a.push(line);return a}
function decorate(graph,opts={}){
 const copy=graph.cloneNode(true),doc=graph.ownerDocument;
 const raw=copy.getAttribute('data-trend-export-viewbox')||copy.getAttribute('viewBox')||'';
 const [x,y,w,h]=raw.trim().split(/[ ,]+/).map(Number);
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)throw Error('图表尺寸无效');
 const svg=(tag,attrs,text)=>{const n=doc.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=root.XinhuaWording?.normalize(text)||text;return n};
 const width=Math.max(700,Math.ceil(w)),padding=20,plotWidth=width-padding*2,plotHeight=Math.ceil(h*plotWidth/w);
 const titles=opts.title?wrap(opts.title,Math.floor(plotWidth/10)):[];
 const head=titles.length?titles.length*23+16:12;
 const legends=opts.legend||[],items=[];let lx=padding,ly=head+plotHeight+24;
 for(const entry of legends){const name=String(entry.label||''),lines=wrap(name,Math.floor((plotWidth-26)/7));for(const [idx,line] of lines.entries()){const size=Math.min(plotWidth,Math.max(90,Array.from(line).reduce((sum,ch)=>sum+(/[^\x00-\x7f]/.test(ch)?13:7),26)));if(lx+size>width-padding){lx=padding;ly+=23}items.push({x:lx,y:ly,color:idx===0?entry.color:null,text:line});lx+=size;if(idx<lines.length-1){lx=padding;ly+=23}}}
 const footerY=legends.length?ly+26:head+plotHeight+20;
 const notes=[SOURCE,...(opts.notes||[])].flatMap(v=>wrap(v,Math.floor(plotWidth/6)));
 const height=footerY+notes.length*16+18;
 const out=svg('svg',{xmlns:NS,viewBox:'0 0 '+width+' '+height,width,height,'font-family':FONT});
 out.append(svg('rect',{width,height,fill:'#fff'}));titles.forEach((line,i)=>out.append(svg('text',{x:padding,y:24+i*23,'font-size':18,'font-weight':700,fill:'#233d39'},line)));
 copy.removeAttribute('id');copy.removeAttribute('data-trend-export-viewbox');copy.setAttribute('viewBox',[x,y,w,h].join(' '));copy.setAttribute('x',padding);copy.setAttribute('y',head);copy.setAttribute('width',plotWidth);copy.setAttribute('height',plotHeight);
 copy.setAttribute('font-family',FONT);for(const n of copy.querySelectorAll('[tabindex]'))n.removeAttribute('tabindex');
 out.append(copy);
 for(const item of items){if(item.color)out.append(svg('rect',{x:item.x,y:item.y-11,width:11,height:11,rx:2,fill:item.color,stroke:'#b9c9bf','stroke-width':.5}));out.append(svg('text',{x:item.x+(item.color?16:0),y:item.y,'font-size':12,fill:'#233d39'},item.text))}
 notes.forEach((line,i)=>out.append(svg('text',{x:padding,y:footerY+i*16,'font-size':12,fill:'#567365'},line)));
 root.XinhuaWording?.fixNode?.(out);return {out,width,height};
}
async function pngBlob(source,w,h){const scale=pngScale(w,h);if(!scale)throw Error('图片尺寸过大，请使用 SVG 导出');let url;try{url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}));const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('图片读取失败，请使用 SVG 导出'));img.src=url});const canvas=document.createElement('canvas');canvas.width=Math.ceil(w*scale);canvas.height=Math.ceil(h*scale);const ctx=canvas.getContext('2d');if(!ctx)throw Error('当前设备无法创建画布，请使用 SVG');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG 生成失败，请使用 SVG');return blob}finally{if(url)URL.revokeObjectURL(url)}}
const api={FONT,SOURCE,pngScale,filename,wrap,decorate,pngBlob};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryExport=api;
})(typeof window==='undefined'?globalThis:window);
