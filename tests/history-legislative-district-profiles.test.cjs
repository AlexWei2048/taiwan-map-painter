const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', 'assets');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));

for (const year of [2008, 2012, 2016]) {
  test(`${year} regional district turnout matches candidates and county totals`, () => {
    const election = read(`history-legislative-${year}.json`);
    const profiles = read(`history-legislative-turnout-${year}.json`).ballots.regional;
    const candidateVotes = new Map();
    for (const row of election.rows) {
      if (row.electorate !== 'regional' || row.level !== 'district') continue;
      const district = String(Number(row.district.match(/第\s*(\d+)\s*选区/)[1]));
      const key = `${row.county}|${district}`;
      candidateVotes.set(key, (candidateVotes.get(key) || 0) + row.votes);
    }
    assert.equal(candidateVotes.size, 73);
    let checked = 0;
    for (const [county, districts] of Object.entries(profiles.district)) {
      const sums = [0, 0, 0, 0];
      for (const [district, record] of Object.entries(districts)) {
        assert.equal(record[2], candidateVotes.get(`${county}|${district}`));
        assert.ok(record[0] >= record[1]);
        assert.equal(record[1], record[2] + record[3]);
        record.forEach((value, index) => { sums[index] += value; });
        checked++;
      }
      assert.deepEqual(sums, profiles.county[county], county);
    }
    assert.equal(checked, 73);
  });
}

for (const [year, expected] of [[1995, 2], [1998, 4], [2001, 3], [2004, 5]]) {
  test(`${year} added multi-seat profiles match historical town and candidate totals`, () => {
    const election = read(`history-legislative-${year}.json`);
    const snapshot = read(`history-legislative-turnout-${year}.json`);
    const profiles = snapshot.ballots.regional;
    const records = snapshot.audit.regional.legacyMultiSeatDistrictReconciliation.details;
    assert.equal(records.length, expected);
    for (const {county, number, record, towns} of records) {
      assert.deepEqual(profiles.district[county][number], record);
      assert.equal(new Set(towns).size, towns.length);
      const contest = election.contests.find(c => c.electorate === 'regional' &&
        c.county_name === county && String(Number(c.district_name.match(/第\s*(\d+)/)?.[1])) === number);
      assert.ok(contest);
      const rows = election.rows.filter(r => r.electorate === 'regional' &&
        r.county === county && r.district === contest.district_name && r.level === 'town');
      assert.deepEqual(new Set(rows.map(r => r.town)), new Set(towns));
      const sums = [0, 0, 0, 0];
      for (const town of towns) {
        const p = profiles.town[county][town];
        assert.equal(p[2], rows.filter(r => r.town === town).reduce((n,r) => n+r.votes, 0));
        assert.ok(p[0] >= p[1]);
        assert.equal(p[1], p[2] + p[3]);
        p.forEach((value, i) => { sums[i] += value; });
      }
      assert.deepEqual(sums, record);
      assert.equal(record[2], contest.valid_votes);
      // The verified 2001 Taipei County 2nd/3rd constituency records are now
      // stored in the canonical turnout asset. Do not append them a second time.
      const districts = Object.values(profiles.district[county]);
      assert.deepEqual([0,1,2,3].map(i=>districts.reduce((n,p)=>n+p[i],0)), profiles.county[county]);
    }
  });
}


test('1992 NCCU turnout covers 27 reconciled regional constituencies without overriding official sources',async()=>{
 const election=require('../history-legislative.js').apply1992Local(read('history-legislative-1992.json'),read('history-legislative-1992-local.json'));
 const snapshot=read('history-legislative-turnout-1992.json');
 const items=snapshot.audit.regional.verified_constituencies;
 assert.equal(items.length,27);
 assert.equal(snapshot.audit.regional.field_count,81);
 assert.deepEqual(snapshot.ballots.regional.national,[13206973,9549818,9375608,174210]);
 assert.equal(Object.keys(snapshot.ballots.regional.county).length,25);
 assert.equal(Object.keys(snapshot.ballots.regional.district.台北市).length,2);
 assert.equal(Object.keys(snapshot.ballots.regional.district.高雄市).length,2);
 assert.deepEqual(snapshot.ballots.regional.county.高雄县,[736309,543240,534430,8810]);
 assert.equal(snapshot.audit.regional.nccu_reconciliation.matched,27);
 for(const {county,district,record,source_url} of items){
  const contest=election.contests.find(c=>c.electorate==='regional'&&c.county_name===county&&c.district_name===district);
  assert.ok(contest,county+' '+district);
  assert.equal(contest.valid_votes,record[2]);
  assert.equal(contest.registered_voters,null);
  assert.equal(contest.ballots_cast,null);
  assert.equal(contest.invalid_votes,null);
  assert.ok(source_url.startsWith('https://'));
  assert.equal(record[1],record[2]+record[3]);
  assert.ok(record[0]>=record[1]);
  assert.equal(election.rows.filter(r=>r.electorate==='regional'&&r.level==='district'&&r.county===county&&r.district===district).reduce((n,r)=>n+r.votes,0),record[2]);
  if(county==='台北市'||county==='高雄市')assert.deepEqual(snapshot.ballots.regional.district[county][district.includes('第一')?'1':'2'],record);
  else assert.deepEqual(snapshot.ballots.regional.county[county],record);
 }
 const city=snapshot.ballots.regional.county.台北市,rows=Object.values(snapshot.ballots.regional.district.台北市);
 assert.deepEqual([0,1,2,3].map(i=>rows.reduce((n,p)=>n+p[i],0)),city);
 assert.deepEqual(city,[1790918,1211427,1192696,18731]);
 const kaohsiung=snapshot.ballots.regional.county.高雄市,kaohsiungDistricts=Object.values(snapshot.ballots.regional.district.高雄市);
 assert.deepEqual([0,1,2,3].map(i=>kaohsiungDistricts.reduce((n,p)=>n+p[i],0)),kaohsiung);
 const turnout=require('../history-legislative-turnout.js');
 await turnout.load(1992,async()=>({ok:true,json:async()=>snapshot}));
 const result=turnout.enrich({validVotes:628305},{year:1992,electorate:'regional',scope:'county',county:'桃园县'});
 assert.deepEqual([result.registeredVoters,result.ballotsCast,result.invalidVotes],[869457,642643,14338]);
});


for (const year of [2004,2008,2012,2016]) {
 test(`${year} recovered town profiles match candidate votes and county totals`,()=>{
  const election=read(`history-legislative-${year}.json`);
  const snapshot=read(`history-legislative-turnout-${year}.json`);
  let total=0;
  for(const [electorate,audit] of Object.entries(snapshot.audit)){
   const profiles=snapshot.ballots[electorate];
   const groups=[audit.shared_town_reconciliation,audit.cec_raw_town_reconciliation].filter(Boolean);
   for(const group of groups){
    const counties=new Set();
    for(const r of group.records){
     const expected=r.record||[r.eligible,r.cast,r.valid,r.invalid];
     assert.deepEqual(profiles.town[r.county][r.town],expected);
     assert.ok(expected[0]>=expected[1]);
     assert.equal(expected[1],expected[2]+expected[3]);
     assert.equal(election.rows.filter(v=>v.level==='town'&&v.electorate===electorate&&v.county===r.county&&v.town===r.town).reduce((n,v)=>n+v.votes,0),expected[2]);
     counties.add(r.county);total++;
    }
    for(const c of counties) assert.deepEqual(Object.values(profiles.town[c]).reduce((a,b)=>a.map((v,i)=>v+b[i]),[0,0,0,0]),profiles.county[c],c);
   }
  }
  assert.equal(total,({2004:11,2008:15,2012:12,2016:12})[year]);
 });
}
