/* Pure calculation helpers: no network, DOM or stored personal data. */
(function(root){
 'use strict';
 const blank=v=>v===null||v===undefined||String(v).trim()==='';
 function number(v,percent=false){
  if(blank(v))return null;
  const s=String(v).trim().replace(/,/g,'').replace(percent?/%$/:/^$/,'');
  if(!/^\d+(?:\.\d+)?$/.test(s))throw Error('数值必须为非负数字');
  const n=Number(s);if(!Number.isFinite(n)||n<0||(percent&&n>100))throw Error(percent?'得票率应在 0%—100% 之间':'得票数必须为非负数字');
  if(!percent&&!Number.isSafeInteger(n))throw Error('得票数必须为安全范围内的整数');return n;
 }
 function validate(record){
  const rows=(record?.rows||[]).filter(r=>!blank(r.name)||!blank(r.votes)||!blank(r.share)).map(r=>({name:String(r.name||'').trim(),partyId:String(r.partyId||''),votes:number(r.votes),share:number(r.share,true)}));
  const total=number(record?.totalVotes);
  if(rows.some(r=>r.name.length>80))throw Error('候选人姓名不能超过80个字符');
  if(rows.length>1000)throw Error('单一区域最多录入 1000 条记录');
  if(rows.some(r=>!r.partyId))throw Error('请为每条记录选择政党或颜色类别');
  if(rows.some(r=>r.votes===null&&r.share===null))throw Error('每条记录至少填写得票数或得票率');
  const allVotes=rows.length>0&&rows.every(r=>r.votes!==null),allShares=rows.length>0&&rows.every(r=>r.share!==null);
  if(rows.length&&!allVotes&&!allShares)throw Error('请为所有记录填写同一种指标：全部得票数，或全部得票率');
  const sum=rows.reduce((n,r)=>n+(r.votes||0),0),sumShare=rows.reduce((n,r)=>n+(r.share||0),0);
  if(allVotes&&!Number.isSafeInteger(sum))throw Error('得票合计超出安全数值范围');
  if(allVotes&&total!==null&&sum>total)throw Error('已录入得票合计不能超过有效票总数');
  if(allShares&&sumShare>100.1)throw Error('各记录得票率合计不能超过 100%');
  const denominator=total===null?sum:total;
  if(allVotes&&denominator>0)for(const r of rows){const share=r.votes/denominator*100;if(r.share!==null&&Math.abs(r.share-share)>.11)throw Error('得票率与得票数不一致，请检查有效票总数，或只填写一种指标');r.share=share;}
  return {rows,totalVotes:total,allVotes,allShares:allShares||(allVotes&&denominator>0),denominator,derivedTotal:total===null&&allVotes};
 }
 function summarize(record,groupBy='candidate',metric='share'){
  let valid;try{valid=validate(record)}catch(e){return{status:'invalid',message:e.message}}
  if(!valid.rows.length)return{status:'missing',message:'尚未录入数据'};
  if(groupBy==='candidate'&&valid.rows.some(r=>!r.name))return{status:'missing',message:'候选人模式需要填写候选人姓名'};
  const groups=new Map();
  for(const r of valid.rows){const key=groupBy==='party'?r.partyId:r.name+'\u0000'+r.partyId;if(groups.has(key)&&groupBy==='candidate')return{status:'invalid',message:'同一候选人重复，请合并记录'};const a=groups.get(key)||{name:groupBy==='party'?'':r.name,partyId:r.partyId,votes:valid.allVotes?0:null,share:valid.allShares?0:null};if(valid.allVotes)a.votes+=r.votes;if(valid.allShares)a.share+=r.share;groups.set(key,a)}
  const ranked=[...groups.values()],rankKey=valid.allVotes?'votes':'share';
  ranked.sort((a,b)=>(b[rankKey]||0)-(a[rankKey]||0));const leader=ranked[0];
  if(!(leader[rankKey]>0))return{status:'missing',message:'所有记录均为零，尚无最高票者'};
  if(ranked.length>1&&Math.abs(leader[rankKey]-ranked[1][rankKey])<1e-8)return{status:'tie',message:'并列最高',leaders:ranked.filter(r=>Math.abs(r[rankKey]-leader[rankKey])<1e-8)};
  const value=leader[metric==='votes'?'votes':'share'];
  if(value===null||!Number.isFinite(value))return{status:'missing',message:metric==='votes'?'仅有得票率，缺少得票数':'无法计算得票率'};
  return{status:'winner',leader,value,derivedTotal:valid.derivedTotal,totalVotes:valid.denominator};
 }
 function shade(hex,value,min,max,lightness=.10){
  if(!/^#[\da-f]{6}$/i.test(hex))hex='#147d68';
  if(![value,min,max].every(Number.isFinite)||max<=min)throw Error('渐变上限必须大于下限');
  const ratio=Math.max(0,Math.min(1,(value-min)/(max-min)));
  // A stronger mid-range slope makes typical 30-70% vote shares visibly different.
  // Keep each party's hue: near-white at the low end, rich party color at the high end.
  const eased=ratio*ratio*ratio*(ratio*(ratio*6-15)+10);
  const amount=lightness+(1-lightness)*eased;
  const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const brightness=(channels[0]*.2126+channels[1]*.7152+channels[2]*.0722)/255;
  const darkLimit=.14+.18*Math.max(0,Math.min(1,(brightness-.55)/.45));
  return '#'+channels.map(channel=>{
   const rich=channel*(1-darkLimit*eased);
   return Math.round(255+(rich-255)*amount).toString(16).padStart(2,'0');
  }).join('');
 }
 function csv(text){
  const rows=[];let row=[],value='',quoted=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++}else if(!quoted&&value!=='')throw Error('CSV 引号位置不正确');else quoted=!quoted;}else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\r'||c==='\n')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value='';}else value+=c;}
  if(quoted)throw Error('CSV 引号未闭合');row.push(value);if(row.some(x=>x.trim()))rows.push(row);return rows;
 }
 const api={number,validate,summarize,shade,csv};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ElectionCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
