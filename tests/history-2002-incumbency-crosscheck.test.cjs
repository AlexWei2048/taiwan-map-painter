'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const L=require('../history-local.js'),source=require('../sources/history-2002-incumbency-crosscheck-20261127.json');
test('three 2002 candidate incumbency gaps resolved without changing votes',async()=>{
 const raw=JSON.parse(await fs.readFile('assets/history-local-2002.json','utf8')),fixed=L.enrich2002Incumbency(raw);
 for(const item of source.records){const before=raw.candidacies.find(c=>c.candidacy_id===item.id),after=fixed.candidacies.find(c=>c.candidacy_id===item.id);assert.equal(before.votes,after.votes);assert.equal(after.incumbent_at_election,false);assert.equal(after.incumbent_source.source_url,item.source);const rows=fixed.rows.filter(r=>r.type===item.office&&r.county===item.county&&r.name===item.name&&Number(r.number)===item.number);assert.ok(rows.length);assert.ok(rows.every(r=>r.incumbent===false));}
 assert.equal(raw.candidacies.length,fixed.candidacies.length);assert.equal(raw.rows.length,fixed.rows.length);
});
