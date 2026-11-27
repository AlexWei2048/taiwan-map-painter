'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const archive=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/history-local-1994-council.json'),'utf8'));
const sourcePaths=[
 'sources/history-1994-hualien-council-profile.json',
 'sources/history-1994-tainan-county-council-profile.json'
];

for(const sourcePath of sourcePaths){
 test('1994 official county council aggregate reconciles with every constituency: '+sourcePath,()=>{
  const p=JSON.parse(fs.readFileSync(path.join(ROOT,sourcePath),'utf8'));
  const districts=archive.districts.filter(d=>d.county===p.county);
  assert.equal(districts.length,10);
  const candidates=districts.flatMap(d=>d.candidates);
  const sum=field=>districts.reduce((value,d)=>value+d[field],0);
  for(const field of ['registered_voters','ballots_cast','valid_votes','invalid_votes']){
   assert.equal(sum(field),p[field],field);
  }
  assert.equal(p.ballots_cast,p.valid_votes+p.invalid_votes);
  const counts={
   candidate_count:candidates.length,
   male_candidates:candidates.filter(c=>c[4]==='男').length,
   female_candidates:candidates.filter(c=>c[4]==='女').length,
   elected_count:candidates.filter(c=>c[5]).length,
   male_elected:candidates.filter(c=>c[5]&&c[4]==='男').length,
   female_elected:candidates.filter(c=>c[5]&&c[4]==='女').length
  };
  for(const [field,count] of Object.entries(counts))assert.equal(count,p[field],field);
  assert.deepEqual(archive.verified_county_profiles.find(item=>item.county===p.county),p);
  assert.match(p.source_url,/^https:\/\//);
 });
}

test('1994 Keelung county summary mixes electorates and must not become a regional-only turnout card',()=>{
 const keelung=archive.districts.filter(d=>d.county==='基隆市');
 assert.equal(keelung.length,8);
 assert.deepEqual([...new Set(keelung.map(d=>d.electorate))].sort(),['plains','regional']);
 const code=fs.readFileSync(path.join(ROOT,'history-workspace.js'),'utf8');
 assert.match(code,/result\\.contests\\.every\\(c=>c\\.electorate==='regional'\\)/);
});
