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
  const id=source.party_id,blob=(id?context.ids[id]:null)||context.names[source.name];
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

test('Historical incumbency uses the same visible badge as prediction, not a yes flag',()=>{
 const hist=fs.readFileSync(path.join(root,'history-2022.js'),'utf8');
 const csv=fs.readFileSync(path.join(root,'history-workspace.js'),'utf8');
 assert.match(hist,/function incumbentLabel\(r\)\{return r\.incumbent===true\?'现任':''\}/);
 assert.match(hist,/function appendIncumbentTag\(cell,value\)/);
 assert.doesNotMatch(hist,/incumbent(?:_at_election)?===true\?'是'/);
 assert.doesNotMatch(csv,/incumbent(?:_at_election)?===true\?'是'/);
});

// Audit the current roster against the actual shared logo resolver, not just source URLs.
test('2026 participating parties including Taiwan Mahjong have installed round-badge sources',()=>{
 const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
 const start=app.indexOf('function logoFor(p){'),end=app.indexOf('async function readLogo',start);
 assert.ok(start>=0&&end>start);
 const original=vm.runInNewContext(fs.readFileSync(path.join(root,'assets/party-logos.js'),'utf8')+'\nPARTY_LOGOS');
 const sandbox={PARTY_PRESETS:presets,PARTY_LOGOS:original,SOURCED_PARTY_LOGOS_BY_ID:context.ids,SOURCED_PARTY_LOGOS_BY_NAME:context.names,simplify:s=>s.replaceAll('臺','台').replaceAll('灣','湾').replaceAll('將','将').replaceAll('黨','党'),partyMatch:s=>presets.find(p=>[p.name,...p.aliases].includes(s))};
 const resolve=vm.runInNewContext(app.slice(start,end)+'\nlogoFor',sandbox);
 const current=['中国国民党','民主进步党','台湾民众党','时代力量','亲民党','劳动党','小民参政欧巴桑联盟','台联党','司法改革党','台湾基进','新党','台湾绿党','台湾SoR无法党','台湾麻将最大党','司法正义党','台湾工党','社会民主党','左翼联盟','爱民党','正神名党','三势团结促进联盟','永久和平自然法','台湾进步党','更生党'];
 for(const name of current)assert.match(resolve({id:'prediction-test',name}),/^data:image\//,name);
 assert.equal(resolve({id:'prediction-mahjong',name:'台灣麻將最大黨'}),context.names['台湾麻将最大党']);
 assert.match(fs.readFileSync(path.join(root,'style.css'),'utf8'),/\.candidate-party img\{[^}]*border-radius:50%/);
});
