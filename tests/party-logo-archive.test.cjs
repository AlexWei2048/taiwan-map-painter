'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
test('The historic Chinese Social Democratic Party flag is embedded, usable and attributable',()=>{
 const script=fs.readFileSync('assets/party-logos-archive.js','utf8');
 const result=vm.runInNewContext('const SOURCED_PARTY_LOGOS_BY_ID={};\n'+script+'\nSOURCED_PARTY_LOGOS_BY_ID.csdp');
 assert.ok(result.startsWith('data:image/png;base64,'));
 const image=Buffer.from(result.split(',')[1],'base64');
 assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(crypto.createHash('sha256').update(image).digest('hex'),'d5de5227d44ea41608d59fd33954c870b80c687217e72cdebfddaf237e435545');
 const html=fs.readFileSync('index.html','utf8');
 assert.ok(html.includes('assets/party-logos-archive.js?v='));
 assert.ok(html.indexOf('party-logos-sourced.js')<html.indexOf('party-logos-archive.js'));
 assert.ok(html.indexOf('party-logos-archive.js')<html.indexOf('app.js'));
});

test('Existing verified historical flags are cropped from the center without stretching',()=>{ const js=fs.readFileSync('assets/party-logos-archive.js','utf8'); assert.match(js,/Math\.min\(right-left\+1,bottom-top\+1\)/); assert.match(js,/brush\.arc\(64,64,64,0,2\*Math\.PI\)/); assert.ok(js.includes("'ycp'")); assert.ok(js.includes("'台湾工党'")); });
