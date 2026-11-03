const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const source=app.slice(app.indexOf("const NO_TOWNSHIP_ELECTION_COLOR="),app.indexOf('\nlet fillColor='));
const db=JSON.parse(fs.readFileSync('assets/election-2026.js','utf8').split('=').slice(1).join('=').trim().replace(/;$/,''));
const data=JSON.parse(fs.readFileSync('assets/map-base.json','utf8'));
test('Township grey mask follows actual election areas, including municipal indigenous districts',()=>{
 const state={workspaceMode:'prediction',predictionOffice:'township',level:'towns'};
 const unavailable=new Function('state','candidateDatabase',source+';return noTownshipElection')(state,db);
 const town=(county,name)=>data.towns.find(f=>f.county===county&&f.name===name);
 for(const [county,name]of [['台北市','中正区'],['台南市','安平区'],['高雄市','苓雅区'],['新竹市','东区']])assert.equal(unavailable(town(county,name)),true,county+name);
 for(const [county,name]of [['桃园市','复兴区'],['台中市','和平区'],['高雄市','桃源区'],['高雄市','茂林区'],['高雄市','那玛夏区'],['台东县','绿岛乡'],['澎湖县','马公市']])assert.equal(unavailable(town(county,name)),false,county+name);
 state.predictionOffice='mayor';assert.equal(unavailable(town('台北市','中正区')),false);
 state.predictionOffice='township';state.workspaceMode='free';assert.equal(unavailable(town('台北市','中正区')),false);
 state.workspaceMode='history';assert.equal(unavailable(town('台北市','中正区')),false);
});
