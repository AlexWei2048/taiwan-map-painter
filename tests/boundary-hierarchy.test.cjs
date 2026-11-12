'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const presetStart=app.indexOf('const BOUNDARY_PRESET=Object.freeze(');
const presetEnd=app.indexOf('\nconst defaults=()=>',presetStart);
assert.ok(presetStart>=0&&presetEnd>presetStart);
const styleFns=new Function('source',app.slice(presetStart,presetEnd)+
 ';const out={};migrateBoundaryStyle(out,source);return {preset:BOUNDARY_PRESET,previous:PREVIOUS_BOUNDARY_PRESET,out}') ;
const tierStart=app.indexOf('function primaryBoundaryTier(){');
const tierEnd=app.indexOf('\nfunction syncBorderControls(){',tierStart);
assert.ok(tierStart>=0&&tierEnd>tierStart);
const tierFns=new Function('state','councilCountyOverview','mayorTownBoundaryOverlay',
 app.slice(tierStart,tierEnd)+';return {tier:primaryBoundaryTier(),keys:primaryBoundaryKeys(),key:borderControlKey}');
const readTier=(level,overview=false)=>{
 const state={level};
 return tierFns(state,()=>overview,()=>false);
};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

test('county > electoral > township boundaries use a balanced color and thickness hierarchy',()=>{
 const {preset}=styleFns({});
 assert.deepEqual(preset,{
  borderColor:'#738B82',borderWidth:0.8,
  countyBorderColor:'#3C5D53',countyBorderWidth:1.4,
  townBorderColor:'#B1C3B9',townBorderWidth:0.5
 });
 assert.ok(preset.countyBorderWidth>preset.borderWidth&&preset.borderWidth>preset.townBorderWidth);
 for(const [field,input]of [
  ['borderColor','boundaryColor'],['countyBorderColor','countyBoundaryColor'],['townBorderColor','townBoundaryColor']
 ]){
  assert.ok(html.includes('id="'+input+'" type="color" value="'+preset[field]+'"'),input+' should have consistent HTML fallback');
 }
 assert.match(html,/app\.js\?v=20261112-crisp-export-v1/);
});

test('legacy saved default styles adopt the new initial appearance without changing custom colors',()=>{
 const {preset,previous,out}=styleFns({
  ...styleFns({}).previous,showTownBoundaries:false,
 });
 assert.ok(same({...out,boundaryStyleRevision:undefined},{...preset,boundaryStyleRevision:undefined}));
 assert.equal(out.boundaryStyleRevision,2);
 const changed=styleFns({
  ...previous,borderColor:'#445566',countyBorderWidth:2.7,townBorderColor:'#112233'
 }).out;
 assert.equal(changed.borderColor,'#445566');
 assert.equal(changed.countyBorderWidth,2.7);
 assert.equal(changed.townBorderColor,'#112233');
 assert.equal(changed.countyBorderColor,preset.countyBorderColor);
 assert.equal(changed.townBorderWidth,preset.townBorderWidth);
 const alreadySaved=styleFns({...previous,boundaryStyleRevision:2}).out;
 assert.equal(alreadySaved.borderWidth,previous.borderWidth,'intentional user old values stay as-is after migration');
 assert.equal(alreadySaved.countyBorderColor,previous.countyBorderColor);
 const invalid=styleFns({borderColor:'oops',townBorderWidth:25,countyBorderWidth:-4}).out;
 assert.equal(invalid.borderColor,preset.borderColor);
 assert.equal(invalid.townBorderWidth,3);
 assert.equal(invalid.countyBorderWidth,0);
});

test('primary boundary UI controls and SVG tier follow the selected map layer',()=>{
 for(const level of ['counties']){
  const ui=readTier(level);
  assert.equal(ui.tier,'county');
  assert.deepEqual(ui.keys,{color:'countyBorderColor',width:'countyBorderWidth'});
  assert.equal(ui.key('boundaryWidth','borderWidth'),'countyBorderWidth');
 }
 for(const level of ['towns','villages']){
  const ui=readTier(level);
  assert.equal(ui.tier,'town');
  assert.deepEqual(ui.keys,{color:'townBorderColor',width:'townBorderWidth'});
  assert.equal(ui.key('boundaryColor','borderColor'),'townBorderColor');
 }
 for(const level of ['council','legislative']){
  const ui=readTier(level);
  assert.equal(ui.tier,'district');
  assert.deepEqual(ui.keys,{color:'borderColor',width:'borderWidth'});
  assert.equal(ui.key('countyBoundaryWidth','countyBorderWidth'),'countyBorderWidth');
 }
 assert.equal(readTier('council',true).tier,'county','county overview uses county rather than electorate style');
 assert.ok(app.includes("['#districtBorders path',state[primary.color],state[primary.width]]"));
 assert.ok(app.includes("['#borders path',state.countyBorderColor,state.countyBorderWidth]"));
 assert.ok(app.includes("['#townBorders path',state.townBorderColor,state.townBorderWidth]"));
 assert.ok(app.includes('state[borderControlKey(id,key)]='));
 assert.ok(app.includes("const historicCounty=p.hasAttribute('data-historical-county-outline')"));
});