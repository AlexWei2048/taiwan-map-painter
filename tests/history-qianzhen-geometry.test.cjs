const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
test('Qianzhen village shape inventory for 2008–2016 reconstruction',()=>{
 const map=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/map.json'),'utf8'));
 const town=(map.towns||[]).find(f=>/高雄市/.test(f.county)&&/前镇|前鎮/.test(f.name));
 const villages=(map.villages||[]).filter(f=>f.townId===town?.id||/前镇|前鎮/.test(f.town||''));
 console.log('QIANZHEN_VILLAGE_INVENTORY',JSON.stringify({town:town&&{id:town.id,name:town.name,county:town.county},size:villages.length,sample:villages.slice(0,4).map(f=>({id:f.id,name:f.name,county:f.county,town:f.town,townId:f.townId,d:f.d?.slice(0,40)})),names:villages.map(f=>f.name)}));
});