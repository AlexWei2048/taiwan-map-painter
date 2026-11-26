'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const council=require('../assets/history-local-1994-council.json');
const townSource=require('../sources/history-1994-township.json');
const local=require('../assets/history-local-1994.json');
const source=require('../sources/history-1994-taoyuan-council-profile.json');
test('1994 Taoyuan council official county totals reconcile with all 12 original constituencies',()=>{
 const districts=council.districts.filter(d=>d.county==='桃園縣');
 assert.equal(districts.length,12);
 assert.equal(districts.reduce((n,d)=>n+d.candidates.length,0),137);
 assert.equal(districts.reduce((n,d)=>n+d.valid_votes,0),source.valid_votes);
 assert.equal(districts.reduce((n,d)=>n+d.candidates.filter(c=>c[5]).length,0),source.elected_count);
 assert.equal(source.ballots_cast,source.valid_votes+source.invalid_votes);
 assert.ok(source.ballots_cast<=source.registered_voters);
 assert.equal(source.male_candidates+source.female_candidates,source.candidate_count);
 assert.equal(source.male_elected+source.female_elected,source.elected_count);
 assert.deepEqual(council.verified_county_profiles.filter(x=>x.county==='桃園縣'),[source]);
});
test('1994 township source and live snapshot preserve two independently sourced winners without invented votes',()=>{
 const sourcePart=townSource.partial_counties.find(x=>x.county==='桃園縣'&&x.supplement_type==='verified_winners_only');
 const runtimePart=local.partialTownshipReturns.find(x=>x.county==='桃園縣'&&x.supplement_type==='verified_winners_only');
 const sourceSummary=townSource.partial_counties.find(x=>x.county==='桃園縣'&&x.summary_scope==='county');
 const runtimeSummary=local.partialTownshipReturns.find(x=>x.county==='桃園縣'&&x.summary_scope==='county');
 assert.ok(sourcePart&&runtimePart);
 assert.deepEqual(runtimePart.winners,sourcePart.winners);
 assert.deepEqual(sourcePart.winners.map(x=>[x.town,x.name,x.incumbent_at_election]),[
  ['桃園市','李信宏',true],['中壢市','方力脩',false],
  ['大溪鎮','林熺達',true],['楊梅鎮','宋明雄',true],
  ['大園鄉','劉春生',false],['八德鄉','李金水',false],
  ['龍潭鄉','林忠正',null],['復興鄉','游金紱',false],
  ['新屋鄉','陳江順',false]
 ]);
 assert.ok(sourcePart.winners.every(x=>x.source_url.startsWith('https://')&&x.votes===null&&x.party_recommendation===null&&x.ballot_number===null));
 assert.equal(sourceSummary.county_summary.candidate_count,29);
 assert.deepEqual(runtimeSummary,sourceSummary);
 assert.equal(sourceSummary.winners,undefined);
 assert.equal(local.contests.some(c=>c.election_id==='1994-township'&&c.county_name==='桃園縣'),false);
});
