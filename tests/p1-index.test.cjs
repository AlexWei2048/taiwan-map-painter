const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../history-core.js');
function fixture(){
 const elections=[{election_id:'m1',year:2009,office:'mayor'},{election_id:'m2',year:2010,office:'mayor'},{election_id:'c1',year:2009,office:'council'},{election_id:'c2',year:2010,office:'council'}];
 const contests=Array.from({length:40},(_,i)=>({contest_id:'q'+i,election_id:elections[i%4].election_id,county_id:'p'+i%5,county_name:'地区'+i%5,electorate:i%3===0?'plains':'regional',valid_votes:100,registered_voters:150,ballots_cast:110,invalid_votes:10}));
 const candidacies=contests.flatMap((c,i)=>[0,1,2].map(j=>({contest_id:c.contest_id,ballot_number:String(j+1),candidate_name:'人'+j,party_name:'党'+j,votes:[40,40,20][j],elected_official:j===i%3,gender:''})));
 return {schemaVersion:2,year:2010,cycleYears:[2009,2010],elections,contests,candidacies};
}
const plain=r=>({contests:r.contests,candidacies:r.candidacies,summaries:r.summaries});
test('Indexed filter matches uncached fallback in 324 queries',()=>{
 const indexed=Core.index(fixture()),fallback={...indexed};let count=0;
 for(const year of [2009,2010,2011])for(const office of ['mayor','council','township'])for(const electorate of ['all','regional','plains'])for(const countyId of ['','p0','p2','none'])for(const contestId of ['','q3','none']){
  const selection={year,office,electorate,countyId,contestId};
  const actual=Core.filter(indexed,selection),expected=Core.filter(fallback,selection);
  assert.deepEqual(plain(actual),plain(expected));assert.deepEqual(Core.overview(actual),Core.overview(expected));count++;
 }
 assert.equal(count,324);
});
test('Cached contest summaries isolate returned arrays and maps',()=>{
 const indexed=Core.index(fixture()),selection={year:2010,office:'mayor',electorate:'all'};
 const initial=Core.filter(indexed,selection),expected=Core.filter({...indexed},selection);
 initial.summaries[0].candidacies.pop();initial.summaries[0].winners.pop();initial.summaries[0].partySeats.clear();
 assert.deepEqual(plain(Core.filter(indexed,selection)),plain(expected));
});
