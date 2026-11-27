'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const L=require('../history-legislative.js'),Data=require('../history-legislative-data.js'),Core=require('../history-core.js');
const a=require('../assets/history-legislative-1992-local.json'),e=require('../sources/history-1992-matsu-newspaper.json');
test('Matsu original newspaper resolves the two mountain votes and preserves regional transposition evidence',()=>{
 const s=L.apply1992Local(require('../assets/history-legislative-1992.json'),a),i=Core.index(s);
 const total=(el,l)=>s.rows.filter(x=>x.electorate===el&&x.level===l&&x.county==='连江县').reduce((n,x)=>n+x.votes,0);
 assert.equal(total('mountain','county'),2);assert.equal(total('mountain','town'),2);assert.equal(total('regional','town'),2807);
 assert.equal(s.rows.find(x=>x.electorate==='mountain'&&x.level==='town'&&x.county==='连江县'&&x.town==='南竿乡'&&x.number==='02')?.votes??s.rows.find(x=>x.electorate==='mountain'&&x.level==='town'&&x.county==='连江县'&&x.town==='南竿乡'&&Number(x.number)===2)?.votes,2);
 assert.deepEqual(e.rawCandidateTotals,[1192,1615]);assert.equal(e.correction.status,'inferred_pending_independent_poll_table');
 const p=Data.localResult(i,{year:1992,electorate:'regional',scope:'town',county:'连江县',area:'北竿乡'}).overview;
 assert.deepEqual([p.registeredVoters,p.ballotsCast,p.validVotes,p.invalidVotes],[null,534,527,7]);
 assert.equal(s.voteReconciliation[0].unassignedVotes,0);
});
