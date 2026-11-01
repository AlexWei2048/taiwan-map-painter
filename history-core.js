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
 const api={identity,districtNumber,key,sameScope,csv};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HistoryCore=api;
})(typeof window==='undefined'?{}:window);
