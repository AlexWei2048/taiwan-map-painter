const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('Every browser scenario belongs to exactly one positive release shard',()=>{
 const workflow=fs.readFileSync('.github/workflows/checks.yml','utf8'),source=fs.readFileSync('tests/browser-smoke.mjs','utf8');
 const line=workflow.split('\n').find(l=>l.trim().startsWith('pattern: ['));
 assert.ok(line,'browser matrix exists');
 const patterns=[...line.matchAll(/'([^']+)'/g)].map(m=>new RegExp(m[1]));
 const names=[...source.matchAll(/\btest\(['"]([^'"]+)/g)].map(m=>m[1]);
 assert.ok(names.length>=123,'retain previous scenarios');
 assert.ok(patterns.every(p=>!p.test('tests/browser-smoke.mjs')),'parent file must not match and run every child');
 for(const name of names)assert.equal(patterns.filter(p=>p.test(name)).length,1,name);
});
