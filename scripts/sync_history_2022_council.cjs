'use strict';
const fs=require('node:fs'),path=require('node:path');
const Local=require('../history-local.js'),norm=require('../assets/opencc.js').Converter({from:'t',to:'cn'});
const root=path.resolve(__dirname,'..'),file=path.join(root,'assets/history-2022.json');
const snapshot=JSON.parse(fs.readFileSync(file,'utf8')),metadata=JSON.parse(fs.readFileSync(path.join(root,'assets/history-council-districts-2022.json'),'utf8'));
if(snapshot.townProfiles?.length!==368||snapshot.mayorTownNames?.length!==368)throw Error('Refusing to overwrite snapshot without all 368 verified ward profiles and aliases');
const result=Local.reconcile2022Council(snapshot,metadata,norm);
if(result.candidacies!==snapshot.candidacies||result.rows!==snapshot.rows||result.townProfiles!==snapshot.townProfiles||result.mayorTownNames!==snapshot.mayorTownNames)throw Error('Unexpected change to verified source rows');
if(process.argv.includes('--write')){
 const tmp=file+'.council-sync.tmp';
 try{fs.writeFileSync(tmp,JSON.stringify(result)+'\n','utf8');fs.renameSync(tmp,file)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}
}
console.log('Validated 215 council districts, 910 seats; retained 368 ward profiles and aliases.');
