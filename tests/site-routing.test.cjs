const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../site-routing.js');
test('Shareable history routes round trip without project data',()=>{
 const route={mode:'history',office:'council',year:2022,county:'基隆市',area:'第1选举区',level:'district',metric:'share',electorate:'regional',candidate:'基隆市|区域|第1选举区|1|姓名',view:'overview',scope:'district',overviewArea:'2022:district/1',predictions:{private:1}};
 const hash=R.format(route);
 assert.match(hash,/^#\/history\/council\/2022\//);
 const out=R.parse(hash);
 for(const k of ['mode','office','year','county','area','level','metric','electorate','candidate','view','scope','overviewArea'])assert.equal(out[k],route[k]);
 assert.ok(!hash.includes('private'));assert.equal(out.predictions,undefined);
});
test('Cycle years, future and free routes',()=>{
 assert.equal(R.parse(R.format({mode:'history',office:'mayor',year:2010,yearLabel:'2009/2010'})).year,2010);
 assert.equal(R.parse('#/history/council/1994').year,1994);
 assert.deepEqual(R.parse(R.format({mode:'free',level:'town',county:'台北市'})),{mode:'free',level:'town',county:'台北市'});
 assert.equal(R.parse(R.format({mode:'prediction',office:'mayor',county:'高雄市',level:'town'})).level,'town');
});
test('Malformed routes safely rejected; unknown parameters ignored',()=>{
 for(const h of ['#oops','#/history/foo/2024','#/history/mayor/xxx','#/history/mayor/2022/%ZZ','#/free/unknown','#/prediction/2024/mayor'])assert.equal(R.parse(h),null);
 assert.equal(R.parse('#/history/mayor/2022?predictions=private').predictions,undefined);
});
