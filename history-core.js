/* Stable history/map joins. Display names never serve as electoral identifiers. */
(function(root){
 'use strict';
 const identity=value=>({plainsIndigenous:'plains',mountainIndigenous:'mountain'}[value]||value||'regional');
 function districtNumber(value){
  const direct=String(value??'').trim();
  if(/^\d+$/.test(direct))return String(Number(direct));
  const match=direct.match(/第\s*0*(\d+)\s*(?:选|選)(?:举|舉)?(?:区|區)/);
  return match?String(Number(match[1])):'';
 }
 function key(county,electorate,number,normalize=String){return[normalize(county).trim(),identity(electorate),districtNumber(number)].join('|')}
 function sameScope(historical,current,feature,towns,normalize=String){
  if(!current||identity(historical.electorate)!==identity(current.electorate))return false;
  const clean=value=>normalize(String(value||'')).replace(/\s/g,'');
  const old=[...new Set((historical.scopeTowns||[]).map(clean))].sort();
  let present=[];
  if(identity(current.electorate)!=='regional'&&feature?.townIds?.length){
   const byId=new Map(towns.map(t=>[t.id,t]));
   if(feature.townIds.some(id=>!byId.has(id)))return false;
   present=feature.townIds.map(id=>clean(byId.get(id).name));
  }else present=String(current.scope||'').split(/[、,，]/).map(clean).filter(Boolean);
  present=[...new Set(present)].sort();
  return old.length>0&&old.length===present.length&&old.every((name,i)=>name===present[i]);
 }
 function csv(rows){
  const cell=value=>{let text=String(value??'');if(/^[=+@\t\r-]/.test(text))text="'"+text;return'"'+text.replace(/"/g,'""')+'"'};
  return'\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
 }

 // Merge shared township/village edges into district boundary rings.
 function mergePaths(paths){
  const edges=new Map(),points=new Map();
  const add=(a,b)=>{const ka=a.join(','),kb=b.join(',');if(ka===kb)return;points.set(ka,a);points.set(kb,b);const k=ka<kb?ka+'|'+kb:kb+'|'+ka;if(edges.has(k))edges.delete(k);else edges.set(k,[ka,kb])};
  for(const d of paths)for(const part of d.split(/M/i).filter(Boolean)){
   const numbers=part.match(/-?(?:\d*\.)?\d+(?:e[+-]?\d+)?/gi)||[],ring=[];
   for(let i=0;i+1<numbers.length;i+=2)ring.push([Number(numbers[i]),Number(numbers[i+1])]);
   for(let i=0;i<ring.length;i++)add(ring[i],ring[(i+1)%ring.length]);
  }
  const adjacency=new Map();for(const [k,[a,b]]of edges){for(const v of [a,b]){if(!adjacency.has(v))adjacency.set(v,new Set());adjacency.get(v).add(k)}}
  const rings=[];
  while(edges.size){const [key,[start,next]]=edges.entries().next().value;let cursor=start,edge=key,ring=[];
   while(edge){const pair=edges.get(edge);if(!pair)break;ring.push(cursor);const end=pair[0]===cursor?pair[1]:pair[0];edges.delete(edge);adjacency.get(pair[0]).delete(edge);adjacency.get(pair[1]).delete(edge);cursor=end;if(cursor===start)break;edge=adjacency.get(cursor)?.values().next().value}
   if(ring.length>=3)rings.push('M'+ring.join('L')+'Z');
  }
  return rings.join('');
 }
 const api={identity,districtNumber,key,sameScope,csv,mergePaths};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryCore=api;
})(typeof window==='undefined'?{}:window);
