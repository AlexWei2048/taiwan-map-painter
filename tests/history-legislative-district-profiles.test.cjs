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

test('1992 source-backed constituency turnout is verified against actual candidate ballots', () => {
 const election=read('history-legislative-1992.json');
 const snapshot=read('history-legislative-turnout-1992.json');
 const audited=snapshot.audit.regional.verified_constituencies;
 assert.equal(audited.length,6);
 assert.equal(snapshot.audit.regional.field_count,18);
 assert.deepEqual(snapshot.ballots.regional.national,{});
 assert.equal(Object.keys(snapshot.ballots.regional.county).length,5);
 for(const item of audited) {
  const {county,district,record,source_url}=item;
  const contest=election.contests.find(c=>c.electorate==='regional'&&c.county_name===county&&c.district_name===district);
  assert.ok(contest,county+' '+district);
  assert.deepEqual([contest.registered_voters,contest.ballots_cast,contest.valid_votes,contest.invalid_votes],record);
  assert.equal(contest.turnout_source_url,source_url);
  assert.equal(record[1],record[2]+record[3]);
  assert.ok(record[0]>=record[1]);
  assert.equal(election.rows.filter(r=>r.electorate==='regional'&&r.level==='district'&&r.county===county&&r.district===district).reduce((n,r)=>n+r.votes,0),record[2]);
  if(county==='台北市')assert.deepEqual(snapshot.ballots.regional.district.台北市['1'],record);
  else assert.deepEqual(snapshot.ballots.regional.county[county],record);
 }
 const unknown=election.contests.filter(c=>c.electorate==='regional'&&!audited.some(a=>a.county===c.county_name&&a.district===c.district_name));
 assert.equal(unknown.length,21);
 assert.ok(unknown.every(c=>c.registered_voters==null&&c.ballots_cast==null&&c.invalid_votes==null));
});
