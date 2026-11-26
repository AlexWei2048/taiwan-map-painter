const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../plan-store.js'),C=require('../prediction-core.js');
const project=()=>({version:1,predictions:{d:{winners:['a'],estimates:{a:{votes:60},b:{votes:40}}}},localPredictions:{d:{a:1}},fills:{a:1}});
test('Named plans retain unsaved edits and isolate copies, empty plans and deletion',()=>{
 const original=project(),draft=project();draft.predictions.d.winners=['b'];
 let bundle=P.change(P.initial(original),draft,{type:'copy',id:'b',name:'副本'});
 assert.equal(bundle.plans[0].project.predictions.d.winners[0],'b');
 assert.notEqual(bundle.plans[0].project.localPredictions,bundle.plans[1].project.localPredictions);
 bundle=P.change(bundle,{...draft,predictions:{}},{type:'switch',id:'original'});
 assert.equal(bundle.plans[0].project.predictions.d.winners[0],'b');
 assert.deepEqual(bundle.plans[1].project.predictions,{});
 bundle=P.change(bundle,draft,{type:'create',id:'c',name:'空白',project:{version:1,predictions:{}}});
 assert.deepEqual(bundle.plans[2].project.predictions,{});
 bundle=P.change(bundle,bundle.plans[2].project,{type:'delete',id:'c'});
 assert.equal(bundle.activeId,'original');assert.equal(bundle.plans.length,2);
 assert.throws(()=>P.change(P.initial(original),original,{type:'delete',id:'original'}),/至少保留/);
});
test('Storage errors and conflicting tabs do not overwrite saved plans',()=>{
 const bundle=P.initial(project());let value=null;
 const storage={getItem:()=>value,setItem:(key,raw)=>{value=raw}};
 const raw=P.commit(storage,null,bundle);
 assert.throws(()=>P.commit(storage,null,bundle),/另一标签页/);assert.equal(value,raw);
 storage.setItem=()=>{throw Error('quota')};assert.throws(()=>P.commit(storage,raw,bundle),/quota/);assert.equal(value,raw);
});
test('Prediction completion distinguishes votes, winners, blank and incomplete districts',()=>{
 const directory={districts:[{id:'d',type:'mayor',county:'甲县',candidateIds:['a','b'],seats:1}],candidates:[{id:'a',party:'甲党'},{id:'b',party:'乙党'}]};
 const s=P.progress(directory,project(),'mayor',C).all;
 assert.equal(s.winners,1);assert.equal(s.votes,1);assert.equal(s.parties['甲党'],1);
 const empty=P.progress(directory,{predictions:{}},'mayor',C).all;
 assert.equal(empty.winners,0);assert.equal(empty.votes,0);assert.deepEqual(empty.incomplete,['d']);assert.deepEqual(empty.incompleteVotes,['d']);
 const partial=P.progress(directory,{predictions:{d:{winners:['a'],estimates:{a:{share:60}}}}},'mayor',C).all;
 assert.equal(partial.winners,1);assert.equal(partial.votes,0);
});
