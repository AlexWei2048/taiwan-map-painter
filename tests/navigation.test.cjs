const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
function harness(level){
 const frames=new Map(),timers=new Map();let serial=0,writes=0,layouts=0;
 const state={level,labels:true};
 const source=app.slice(app.indexOf('let viewFrame=0'),app.indexOf('\nfunction geometryLayout'));
 const api=new Function('state','$','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','renderLabels','fittedView',
  'let view={x:0,y:0,w:1200,h:900},baseView={...view};'+source+';return {applyView,fit,flushView,scheduleNavigationLabels}')(
  state,()=>({setAttribute:()=>writes++}),fn=>{frames.set(++serial,fn);return serial},id=>frames.delete(id),
  fn=>{timers.set(++serial,fn);return serial},id=>timers.delete(id),()=>layouts++,()=>({x:0,y:0,w:1200,h:900}));
 return {api,frames,timers,get writes(){return writes},get layouts(){return layouts},
  frame(){const queue=[...frames.values()];frames.clear();queue.forEach(fn=>fn())},
  settle(){const queue=[...timers.values()];timers.clear();queue.forEach(fn=>fn())}};
}
test('Navigation batches view writes and defers village collision layout until settling',()=>{
 const h=harness('villages');for(let i=0;i<100;i++)h.api.applyView();
 assert.equal(h.writes,0);assert.equal(h.layouts,0);assert.equal(h.frames.size,1);assert.equal(h.timers.size,1);
 h.frame();assert.equal(h.writes,1);assert.equal(h.layouts,0);
 h.settle();assert.equal(h.layouts,1);
});
test('Town navigation reuses labels; district navigation coalesces layout requests',()=>{
 const h=harness('towns');for(let i=0;i<100;i++)h.api.applyView();
 h.frame();h.settle();assert.equal(h.writes,1);assert.equal(h.layouts,0);
 for(let i=0;i<100;i++)h.api.scheduleNavigationLabels();
 assert.equal(h.timers.size,1);h.settle();assert.equal(h.layouts,1);
});
test('Flush cancels a stale frame before wheel coordinate conversion and fit draws immediately',()=>{
 const h=harness('counties');h.api.applyView();h.api.flushView();
 assert.equal(h.frames.size,0);assert.equal(h.writes,1);
 h.api.fit();assert.equal(h.writes,2);assert.equal(h.layouts,1);
});
test('Workspace does not reintroduce a per-frame label layout wrapper',()=>{
 const workspace=fs.readFileSync('workspace-ui.js','utf8');
 assert.doesNotMatch(workspace,/applyView\s*=\s*function/);
 assert.doesNotMatch(workspace,/requestAnimationFrame\(renderLabels\)/);
});
