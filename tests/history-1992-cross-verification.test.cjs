const test=require('node:test');
const assert=require('node:assert/strict');
const archive=require('../assets/history-legislative-1992-local.json');
test('1992 mountain official national and archived local results reconcile with explicitly unassigned residual',()=>{
 const b=archive.ballots.mountain,r=b.nationalReconciliation;
 const totals=Array(9).fill(0);
 for(const county of Object.values(b.counties))for(const [,votes] of county.towns)votes.forEach((v,i)=>totals[i]+=v);
 assert.equal(r.candidateVotes.reduce((a,b)=>a+b,0),63831);
 assert.equal(totals.reduce((a,b)=>a+b,0),63829);
 assert.deepEqual(r.candidateVotes.map((v,i)=>v-totals[i]),[0,2,0,0,0,0,0,0,0]);
 assert.equal(r.sources.length,2);
});
