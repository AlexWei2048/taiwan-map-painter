'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const Core=require('../history-core.js');
const Turnout=require('../history-presidential-turnout.js');
const snapshot=year=>JSON.parse(fs.readFileSync('assets/history-president-'+year+'.json','utf8'));

test('verified presidential county turnout fills every county for 2012, 2016, 2020, 2024',()=>{
 assert.deepEqual(Turnout.years,[2012,2016,2020,2024]);
 for(const year of Turnout.years){
  const shard=Turnout.enrich(snapshot(year));
  assert.equal(shard.contests.length,22);
  assert.ok(shard.contests.every(c=>Number.isInteger(c.registered_voters)&&
   Number.isInteger(c.ballots_cast)&&Number.isInteger(c.invalid_votes)),String(year));
  assert.ok(shard.contests.every(c=>c.valid_votes+c.invalid_votes===c.ballots_cast),String(year));
  assert.equal(shard.contests.reduce((sum,c)=>sum+c.registered_voters,0),shard.national.registered_voters);
  const delta=year===2024?1:0;
  assert.equal(shard.contests.reduce((sum,c)=>sum+c.ballots_cast,0),
   shard.national.ballots_cast+delta,year+' preserve original nationwide figures');
  assert.ok(/^https:\/\//.test(shard.provenance.countyTurnoutSource));
 }
});

test('county presidential overview never displays national turnout statistics for one county',()=>{
 const shard=Turnout.enrich(snapshot(2024));
 const indexed=Core.index(shard);
 const taipei=shard.contests.find(c=>c.county_name==='台北市');
 assert.ok(taipei);
 const scoped=Core.filter(indexed,{year:2024,office:'president',contestId:taipei.contest_id});
 const summary=Core.overview(scoped);
 assert.equal(scoped.contests.length,1);
 assert.deepEqual([summary.registeredVoters,summary.ballotsCast,summary.invalidVotes],
  [2090062,1552592,10581]);
 assert.equal(summary.validVotes,taipei.valid_votes);
 const national=Core.overview(Core.filter(indexed,{year:2024,office:'president'}));
 assert.equal(national.registeredVoters,19548531);
 assert.equal(national.ballotsCast,14048310);
 assert.equal(national.invalidVotes,100804);
});

test('2022 individual council contest overview comes from its own original turnout record',()=>{
 const snap=JSON.parse(fs.readFileSync('assets/history-2022.json','utf8'));
 const indexed=Core.index(snap);
 const contest=snap.contests.find(c=>c.election_id==='2022-council'&&
  c.county_name==='高雄市'&&c.electorate==='regional');
 assert.ok(contest);
 const scoped=Core.filter(indexed,{year:2022,office:'council',contestId:contest.contest_id});
 const summary=Core.overview(scoped);
 assert.equal(scoped.contests.length,1);
 assert.equal(summary.registeredVoters,contest.registered_voters);
 assert.equal(summary.ballotsCast,contest.ballots_cast);
 assert.equal(summary.validVotes,contest.valid_votes);
 assert.equal(summary.invalidVotes,contest.invalid_votes);
 assert.notEqual(summary.registeredVoters,null);
});
