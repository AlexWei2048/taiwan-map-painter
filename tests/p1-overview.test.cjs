const test=require('node:test');
const assert=require('node:assert/strict');
const W=require('../history-workspace.js');

test('zero denominators are not missing turnout data',()=>{
 const cards=W.overviewCards({registeredVoters:0,ballotsCast:0,validVotes:0,invalidVotes:0,turnout:null});
 assert.equal(cards.find(c=>c.label==='选举人数').value,'0');
 assert.equal(cards.find(c=>c.label==='投票率').value,'不适用');
 assert.equal(cards.find(c=>c.label==='有效率').value,'不适用');
 const charts=W.overviewCharts({registeredVoters:0,ballotsCast:0,validVotes:0,invalidVotes:0});
 assert.equal(charts[0].bars[0].notApplicable,true);
 assert.equal(charts[1].bars[0].notApplicable,true);
});
test('missing statistics are distinct from zero and verified percentages',()=>{
 const missing=W.overviewCards({registeredVoters:null,ballotsCast:null,validVotes:null,invalidVotes:null,turnout:null});
 assert.equal(missing.find(c=>c.label==='选举人数').value,'暂无资料');
 assert.equal(missing.find(c=>c.label==='投票率').value,'暂无资料');
 const charts=W.overviewCharts({registeredVoters:100,ballotsCast:0,validVotes:0,invalidVotes:0});
 assert.equal(charts[0].bars[0].percent,0);
 assert.equal(charts[0].bars[0].notApplicable,false);
 assert.equal(charts[1].bars[0].notApplicable,true);
});
