'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8'),source=app.slice(app.indexOf('const seatTiePatternIds='),app.indexOf('function bounds(items){'));
function node(tag,attrs={}){return{tag,attrs,children:[],append(...xs){this.children.push(...xs)},replaceChildren(){this.children=[]}}}
function setup(){
 const svg=node('svg'),registry=new Map();svg.prepend=c=>{svg.children.unshift(c);registry.set(c.attrs.id,c)};
 const api=new Function('document','svgEl','$',source+';return {seatTiePatternFill,seatTieLeaderColors,resetSeatTiePatterns}')(
 {getElementById:id=>registry.get(id)||null},node,id=>id==='map'?svg:null);
 return{api,svg,registry};
}
test('two and three co-leading parties produce diagonal alternating stripes',()=>{
 const {api,registry}=setup();
 const colors={blue:'#000099',green:'#1b9431',aqua:'#28c8c8'};
 const leaders=api.seatTieLeaderColors({green:3,blue:3,aqua:3,other:1},id=>colors[id]||'#777777');
 const fill=api.seatTiePatternFill(leaders);
 assert.ok(fill.startsWith('url(#seat-tie-'));
 const p=registry.get('seatTiePatterns').children[0];
 assert.equal(p.attrs.patternTransform,'rotate(45)');
 assert.equal(Number(p.attrs['data-seat-tie-count']),3);
 assert.deepEqual(p.children.map(x=>x.attrs.fill),['#28c8c8','#000099','#1b9431']);
 assert.equal(api.seatTiePatternFill([...leaders].reverse()),fill);
 api.resetSeatTiePatterns();assert.equal(registry.get('seatTiePatterns').children.length,0);
 assert.ok(api.seatTiePatternFill(leaders.slice(0,2)).startsWith('url(#seat-tie-'));
});
test('sole largest party retains single color and no seats remain neutral',()=>{
 const {api,registry}=setup();
 assert.equal(api.seatTiePatternFill([{id:'blue',color:'#000099'}]),'#000099');
 assert.equal(api.seatTiePatternFill([]),'#edf1e9');
 assert.equal(registry.size,0);
});
test('SVG export carries co-leader pattern definitions',()=>{
 assert.ok(app.includes("['seatTiePatterns','predictionPatterns','insetFrames'"));
 assert.ok(fs.readFileSync('history-2022.js','utf8').includes('seatTieLeaderColors(leader.counts,partyColor)'));
 assert.ok(fs.readFileSync('prediction-ui.js','utf8').includes('seatTiePatternFill(s.leadingParties.map('));
 assert.ok(fs.readFileSync('town-prediction-ui.js','utf8').includes('seatTiePatternFill(leaders.map('));
});
