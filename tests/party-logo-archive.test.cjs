'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
test('The historic Chinese Social Democratic Party flag is embedded, usable and attributable',()=>{
 const script=fs.readFileSync('assets/party-logos-archive.js','utf8');
 const result=vm.runInNewContext('const SOURCED_PARTY_LOGOS_BY_ID={};\n'+script+'\nSOURCED_PARTY_LOGOS_BY_ID.csdp');
 assert.match(result,/^data:image\\/png;base64,/);
 const image=Buffer.from(result.split(',')[1],'base64');
 assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(crypto.createHash('sha256').update(image).digest('hex'),'f97813f7bb947a32dca10ca65fa0ad33f79f3a1e7543089405191d9c0c48168c');
 const html=fs.readFileSync('index.html','utf8');
 assert.match(html,/assets\\/party-logos-archive\\.js\\?v=/);
 assert.ok(html.indexOf('party-logos-sourced.js')<html.indexOf('party-logos-archive.js'));
 assert.ok(html.indexOf('party-logos-archive.js')<html.indexOf('app.js'));
});
