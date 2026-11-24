'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

function pickerModel(){
 const source=fs.readFileSync('workspace-ui.js','utf8');
 const start=source.indexOf('function councilPredictionPickerModel('),end=source.indexOf('\nfunction ',start+10);
 assert.ok(start>=0&&end>start,'councilPredictionPickerModel must remain independently testable');
 return new Function(source.slice(start,end)+';return councilPredictionPickerModel')();
}

test('nationwide council picker exposes counties first and only one county of districts at a time',()=>{
 const districts=[
  {id:'a1',county:'甲县'},{id:'a2',county:'甲县'},
  {id:'b1',county:'乙县'},{id:'b2',county:'乙县'},{id:'b3',county:'乙县'}
 ];
 const model=pickerModel()(districts,['乙县','甲县'],'乙县','a1');
 assert.deepEqual(model.counties,['乙县','甲县']);
 assert.equal(model.county,'乙县');
 assert.deepEqual(model.districts.map(row=>row.id),['b1','b2','b3']);
 assert.equal(model.districts.some(row=>row.county!==model.county),false);
});

test('nationwide council map has a dedicated larger responsive canvas',()=>{
 const app=fs.readFileSync('app.js','utf8'),css=fs.readFileSync('style.css','utf8');
 assert.match(app,/classList\.toggle\('council-overview-mode',councilCountyOverview\(\)\)/);
 assert.match(css,/\.canvas\.council-overview-mode:not\(\.atlas-mode\)\{height:clamp\(780px,calc\(88vw - 190px\),1080px\);min-height:720px\}/);
 assert.match(css,/@media\(max-width:700px\)[^\n]+\.council-overview-mode[^\n]+height:76dvh;min-height:650px/);
});
