'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'assets/party-logos-sourced.js'),'utf8');
const context=vm.runInNewContext(script+'\n({ids:SOURCED_PARTY_LOGOS_BY_ID,names:SOURCED_PARTY_LOGOS_BY_NAME})');
const report=JSON.parse(fs.readFileSync(path.join(root,'reports/official-party-logos-import.json'),'utf8'));
const presets=JSON.parse(fs.readFileSync(path.join(root,'assets/parties.js'),'utf8').replace(/^const PARTY_PRESETS=/,'').replace(/;\s*$/,''));
const md=fs.readFileSync(path.join(root,'assets/LICENSE-party-logos-sourced.txt'),'utf8');
test('Registry-sourced emblems are authentic auditable PNG files, not remote placeholders',()=>{
 assert.ok(report.count_by_id>=13,'13 previously absent preset logos');
 assert.ok(report.count_by_historical_name>=36,'historical party aliases are available');
 assert.equal(report.count_by_id,Object.keys(context.ids).length);
 assert.equal(report.count_by_historical_name,Object.keys(context.names).length);
 const presetIds=new Set(presets.map(x=>x.id));
 for(const [id,data] of Object.entries(context.ids)){
  assert.ok(presetIds.has(id),'valid registered party id: '+id);
  assert.match(data,/^data:image\/png;base64,/);
 }
 for(const [name,data] of Object.entries(context.names)){
  assert.ok(name&&name.length>=2);
  assert.match(data,/^data:image\/png;base64,/);
 }
 const files=[];
 for(const source of report.official_sources){
  const id=source.party_id,blob=context.ids[id]||context.names[source.name];
  assert.ok(blob,'source has an actual installed logo: '+source.name);
  const binary=Buffer.from(blob.split(',')[1],'base64');
  assert.equal(binary.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(crypto.createHash('sha256').update(binary).digest('hex'),source.rendered_sha256,
   'source-backed file checksum: '+source.name);
  assert.ok(source.official_registry.startsWith('https://'));
  assert.ok(source.official_image.startsWith('https://'));
  assert.ok(md.includes(source.name),'attribution is published for '+source.name);
  files.push(source.name);
 }
 assert.ok(files.includes('台湾动物保护党'));
 assert.ok(files.includes('台澎国际法法理建国党'));
 assert.ok(files.includes('中华统一促进党'));
 assert.equal(context.names['台澎党'],context.ids.ssfpp,
  'official historic abbreviation shares the same verified party logo');
});

test('Historical party icons are clipped in tables and the parliamentary chart',()=>{
 const css=fs.readFileSync(path.join(root,'style.css'),'utf8');
 assert.match(css,/\.history-party-cell img,\.history-party-inline img,\.party-logo\{border-radius:50%/);
 const trends=fs.readFileSync(path.join(root,'history-trends-ui.js'),'utf8');
 assert.ok(trends.includes("appendCircularPartyLogo(g,logo,x+12,y-15,17"));
});
