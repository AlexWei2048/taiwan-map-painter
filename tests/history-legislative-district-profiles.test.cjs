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
      const districts = Object.values(profiles.district[county]);
      let parent = profiles.county[county];
      if (year === 2001 && county === '台北县') {
        const correction = JSON.parse(fs.readFileSync(path.join(root, '..', 'sources/history-legislative-2001-vote-reconciliation.json'), 'utf8'));
        districts.push(correction.profiles.find(p=>p.scope==='district' && p.county===county && p.area==='2').profile,
          correction.district3OfficialTotals.profiles.district);
        parent = correction.district3OfficialTotals.profiles.county;
      }
      assert.deepEqual([0,1,2,3].map(i=>districts.reduce((n,p)=>n+p[i],0)), parent);
    }
  });
}


test('1992 supplementary turnout covers eight districts without changing source checksums',async()=>{
 const election=read('history-legislative-1992.json');
 const snapshot=read('history-legislative-turnout-1992.json');
 const items=snapshot.audit.regional.verified_constituencies;
 assert.equal(items.length,10);
 assert.equal(snapshot.audit.regional.field_count,30);
 assert.deepEqual(snapshot.ballots.regional.national,{});
 assert.equal(Object.keys(snapshot.ballots.regional.county).length,9);
 assert.equal(Object.keys(snapshot.ballots.regional.district.台北市).length,2);
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
  if(county==='台北市')assert.deepEqual(snapshot.ballots.regional.district.台北市[district.includes('第一')?'1':'2'],record);
  else assert.deepEqual(snapshot.ballots.regional.county[county],record);
 }
 const city=snapshot.ballots.regional.county.台北市,rows=Object.values(snapshot.ballots.regional.district.台北市);
 assert.deepEqual([0,1,2,3].map(i=>rows.reduce((n,p)=>n+p[i],0)),city);
 assert.deepEqual(city,[1790918,1211427,1192696,18731]);
 const turnout=require('../history-legislative-turnout.js');
 await turnout.load(1992,async()=>({ok:true,json:async()=>snapshot}));
 const result=turnout.enrich({validVotes:628305},{year:1992,electorate:'regional',scope:'county',county:'桃园县'});
 assert.deepEqual([result.registeredVoters,result.ballotsCast,result.invalidVotes],[869457,642643,14338]);
});

