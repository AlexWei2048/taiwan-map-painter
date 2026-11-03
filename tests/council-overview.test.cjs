const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync('town-prediction-ui.js','utf8').split('function councilCountySeatCounts(county){')[1];
function setup(){
 const parties={blue:{id:'blue',name:'蓝党',color:'#0000ff'},green:{id:'green',name:'绿党',color:'#00ff00'}};
 const districts=[{type:'council',county:'甲县',id:'regional'},{type:'council',county:'甲县',id:'plains'},{type:'council',county:'甲县',id:'mountain'},{type:'council',county:'乙县',id:'other'},{type:'mayor',county:'甲县',id:'mayor'}];
 const results={regional:{status:'complete',parties:[{name:'blue',seats:3},{name:'green',seats:2}]},plains:{status:'complete',parties:[{name:'green',seats:1}]},mountain:{status:'partial',parties:[{name:'green',seats:1}]},other:{status:'invalid',parties:[{name:'blue',seats:99}]},mayor:{status:'complete',parties:[{name:'blue',seats:99}]}};
 const api=new Function('candidateDatabase','predictionSummary','predictionParty','paletteById','function councilCountySeatCounts(county){'+src+';return {councilCountySeatCounts,councilCountyFill,councilCountyDetail}')({districts},d=>results[d.id],name=>parties[name],id=>parties[id]);
 return{...api,results};
}
test('Council county colours aggregate all identities, keep partial selected seats, and distinguish ties and blanks',()=>{
 const api=setup();assert.deepEqual(api.councilCountySeatCounts('甲县'),{blue:3,green:4});
 assert.equal(api.councilCountyFill('甲县'),'#00ff00');
 assert.deepEqual(api.councilCountySeatCounts(''),{blue:3,green:4});
 assert.equal(api.councilCountyFill('乙县'),'#edf1e9');
 api.results.mountain={status:'missing',parties:[]};assert.equal(api.councilCountyFill('甲县'),'#aebdb4');
 assert.match(api.councilCountyDetail('甲县'),/蓝党 3席/);
});
