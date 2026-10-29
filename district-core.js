/* Shared, deterministic district filtering. Nationwide indigenous districts are never duplicated per county. */
(function(root){
 'use strict';
 const identity=d=>({plainsIndigenous:'plains',mountainIndigenous:'mountain'}[d.electorate]||d.electorate||'regional');
 const identityName=d=>({regional:'区域',plains:'平地原住民',mountain:'山地原住民'}[identity(d)]||'区域');
 function filter(rows,county='',query='') {const q=query.trim().replace(/\s/g,'');return rows.filter(d=>(!county||d.county===county||d.county==='全国')&&(!q||(d.county+d.name+d.scope+identityName(d)).replace(/\s/g,'').includes(q)));}
 function groups(rows,order){const names=[...order,'全国'].filter(c=>rows.some(d=>d.county===c));return names.map(county=>({county,districts:rows.filter(d=>d.county===county).sort((a,b)=>(a.number||0)-(b.number||0)||a.id.localeCompare(b.id))}));}
 const api={identity,identityName,filter,groups};if(typeof module!=='undefined')module.exports=api;else root.DistrictCore=api;
})(typeof window==='undefined'?{}:window);
