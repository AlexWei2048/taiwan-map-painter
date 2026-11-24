'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('the latest history click wins after navigating away during loading',async()=>{
 const buttons=new Map();
 for(const id of ['categoryFuture','categoryHistory','futureModes','workspacePrediction','workspaceFree']){
  const listeners={},attrs={};
  buttons.set(id,{dataset:{},textContent:id,classList:{toggle(){}},
   setAttribute(name,value){attrs[name]=value},removeAttribute(name){delete attrs[name]},attrs,
   addEventListener(event,listener){listeners[event]=listener},click(){return listeners.click?.()}});
 }
 let release,opened=0;
 const loading=new Promise(resolve=>{release=resolve});
 const window={HistoryLoader:{load:()=>loading}};
 vm.runInNewContext(fs.readFileSync('workspace-categories.js','utf8'),{
  window,document:{getElementById:id=>buttons.get(id),body:{classList:{contains:()=>false}}}
 });
 const history=buttons.get('categoryHistory');
 const first=history.click();
 buttons.get('categoryFuture').click();
 const second=history.click();
 release({activate(){opened++}});
 await Promise.all([first,second]);
 assert.equal(opened,1);
 assert.equal(history.attrs['aria-selected'],'true');
 assert.equal(history.attrs['aria-busy'],undefined);
});

test('history loader loads public history assets once in dependency order and activates the view',async()=>{
 const calls=[];
 let activations=0;
 const {createHistoryLoader,HISTORY_STYLES,HISTORY_SCRIPTS}=require('../history-loader.js');
 const loader=createHistoryLoader({
  loadStyle:async href=>calls.push(['style',href]),
  loadScript:async src=>calls.push(['script',src]),
  getView:()=>({activate(){activations++}})
 });
 await Promise.all([loader.activate(),loader.activate()]);
 assert.deepEqual(calls,[
  ...HISTORY_STYLES.map(value=>['style',value]),
  ...HISTORY_SCRIPTS.map(value=>['script',value])
 ]);
 assert.equal(activations,2);
 assert.ok(HISTORY_SCRIPTS.indexOf('assets/party-logos-archive.js')<HISTORY_SCRIPTS.indexOf('history-2022.js'));
});

test('history loader resets after a failed load so the visitor can retry',async()=>{
 const {createHistoryLoader}=require('../history-loader.js');
 let attempts=0,activations=0;
 const loader=createHistoryLoader({
  loadStyle:async()=>{},
  loadScript:async()=>{if(++attempts===1)throw Error('network')},
  getView:()=>({activate(){activations++}})
 });
 await assert.rejects(loader.activate(),/network/);
 await loader.activate();
 assert.equal(activations,1);
 assert.ok(attempts>1);
});

test('initial document defers history-only resources until the history tab is opened',()=>{
 for(const path of ['index.html','map-v60.html']){
 const html=fs.readFileSync(path,'utf8');
 assert.match(html,/src="history-loader\.js\?v=/);
 assert.doesNotMatch(html,/<script[^>]+src="(?:history-(?:workspace|core|presidential|legislative|local|2022)|assets\/party-logos-archive)\.js/);
 assert.doesNotMatch(html,/<link[^>]+href="history-legislative\.css/);
 assert.doesNotMatch(html,/src="history-access\.js/);
 }
});
