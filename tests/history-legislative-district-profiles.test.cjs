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
