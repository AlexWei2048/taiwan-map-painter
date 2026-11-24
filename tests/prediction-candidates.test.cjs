'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const rows=[
 {id:'1',name:'甲',party:'绿党',incumbent:true},
 {id:'2',name:'乙',party:'蓝党',incumbent:false},
 {id:'3',name:'丙',party:'绿党',incumbent:false},
 {id:'4',name:'丁',party:'绿党',incumbent:true}
];
function filter(){
 const source=fs.readFileSync('workspace-ui.js','utf8');
 const start=source.indexOf('function filterPredictionCandidates(');
 assert.ok(start>=0,'multi-seat candidate controls need a filter');
 const end=source.indexOf('\nfunction ',start+10);
 return new Function('normalizePlace','candidateDisplayName',source.slice(start,end)+';return filterPredictionCandidates')(String,c=>c.name);
}
test('multi-seat candidate filters combine and selected-first preserves ballot order within groups',()=>{
 const select=filter();
 assert.deepEqual(select(rows,['3','2'],{selectedFirst:true}).map(c=>c.id),['2','3','1','4']);
 assert.deepEqual(select(rows,['3'],{party:'绿党',status:'incumbent'}).map(c=>c.id),['1','4']);
 assert.deepEqual(select(rows,['2','3'],{status:'selected',query:'丙'}).map(c=>c.id),['3']);
 assert.deepEqual(select(rows,['2'],{party:'绿党',status:'selected'}),[]);
});
