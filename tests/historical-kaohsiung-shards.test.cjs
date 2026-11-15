const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
test('inventory source fragments for historical Kaohsiung district reconstruction',()=>{
 const base=path.join(__dirname,'../assets/');
 for(let n=1;n<=5;n++){
  const j=JSON.parse(fs.readFileSync(path.join(base,'map-villages-'+n+'.json'),'utf8'));
  const found=j.filter(v=>v.county==='高雄市'&&['前镇区','三民区'].includes(v.town));
  console.log('HISTORIC_KAOHSIUNG_SHARD',n,'all',j.length,'found',found.length,
    JSON.stringify(Object.fromEntries(['三民区','前镇区'].map(t=>[t,found.filter(v=>v.town===t).map(v=>v.name)]))));
 }
});