'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../history-legislative-turnout.js'),L=require('../history-legislative.js');
const source=require('../assets/history-legislative-turnout-1992.json'),local=require('../assets/history-legislative-1992-local.json');
test('1992 official whole election and ballot breakdown reconcile without assigning geography',()=>{
 const a=source.audit.nationalCrosscheck;
 const sum=(rows)=>[0,1,2,3].map(i=>rows.reduce((n,r)=>n+r[i],0));
 assert.deepEqual(sum(Object.values(a.national)),[13421170,9666021,9488772,177249]);
 assert.deepEqual(a.local_residuals.plains,[7,33,0,33]);
 assert.deepEqual(a.local_residuals.mountain,[30,17,2,15]);
 const snapshot=L.apply1992Local(require('../assets/history-legislative-1992.json'),local);
 for(const k of ['plains','mountain']){const p=local.ballots[k].nationalProfile.profile,c=snapshot.contests.find(c=>c.electorate===k);assert.deepEqual([c.registered_voters,c.ballots_cast,c.valid_votes,c.invalid_votes],p);const enriched=T.enrich({validVotes:p[2]},{year:1992,electorate:k,scope:'all'});assert.deepEqual([enriched.registeredVoters,enriched.ballotsCast,enriched.validVotes,enriched.invalidVotes],p);assert.deepEqual(sum(Object.values(local.ballots[k].counties).map(c=>c.profile)),a.local_subtotals[k]);}
 assert.equal(T.overall(1992).validVotes,9488772);
 assert.equal(T.national(1992,'mountain').ballotsCast,65365);
});
