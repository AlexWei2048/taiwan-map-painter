'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

function directoryStatus(){
 const source=fs.readFileSync('candidate-directory.js','utf8');
 const start=source.indexOf('function candidateDirectoryStatus('),end=source.indexOf('\nfunction ',start+10);
 assert.ok(start>=0&&end>start,'candidateDirectoryStatus must remain independently testable');
 return new Function(source.slice(start,end)+';return candidateDirectoryStatus')();
}
function luminance(hex){
 const rgb=hex.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
 return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
}

test('candidate directory summary reports coverage without a stale verification date',()=>{
 const status=directoryStatus()({districts:Array(447),candidates:Array(2051),asOf:'2026-11-08',ballotNumberAudit:{pendingAfter:3}});
 assert.equal(status,'447 个选区 · 2,051 名候选人 · 号次待核 3 人');
 assert.doesNotMatch(status,/资料核对至|2026-11-08/);
});

test('small helper text token meets WCAG AA contrast on white',()=>{
 const css=fs.readFileSync('style.css','utf8');
 const match=css.match(/--small-text-readable:\s*(#[0-9a-f]{6})/i);
 assert.ok(match,'readable small-text token must be defined');
 const ratio=(1.05)/(luminance(match[1])+.05);
 assert.ok(ratio>=4.5,`contrast ${ratio.toFixed(2)} must be at least 4.5:1`);
 assert.match(css,/\.candidate-gender[^}]*font-size:\s*12px/);
 assert.match(css,/\.sidebar \.data-help[^}]*font-size:\s*12px/);
});
