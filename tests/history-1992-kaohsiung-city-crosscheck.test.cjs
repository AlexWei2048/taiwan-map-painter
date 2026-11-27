'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const data=require('../assets/history-legislative-turnout-1992.json');
test('1992 Kaohsiung regional districts independently match city government totals',()=>{
 const x=data.audit.regional.kaohsiung_city_official_crosscheck,d=data.ballots.regional.district['高雄市'];
 const sum=[0,1,2,3].map(i=>Object.values(d).reduce((n,p)=>n+p[i],0));
 assert.deepEqual(sum,x.district_sum);
 assert.equal(sum[0],x.source_fields.registered_voters);
 assert.equal(sum[1],x.source_fields.ballots_cast);
 assert.equal(sum[1],sum[2]+sum[3]);
});
