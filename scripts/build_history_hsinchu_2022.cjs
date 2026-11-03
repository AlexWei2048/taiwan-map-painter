/* 2022 CEC 1113150255 pp.13–15; village-level splits must not be inferred from 2026. */
const fs=require('node:fs'),H=require('../history-core.js'),O=require('../assets/opencc.js'),norm=O.Converter({from:'t',to:'cn'});
const scopes={
1:'東門里 榮光里 成功里 育賢里 中正里 親仁里 文華里 復中里 三民里 公園里 東園里 東山里 東勢里 光復里 前溪里 水源里 千甲里 綠水里 埔頂里 仙宮里 龍山里 新莊里 關新里 仙水里 金山里 建功里 光明里 立功里 軍功里 武功里 豐功里 科園里 關東里 建華里 錦華里 復興里',
2:'南門里 關帝里 南市里 福德里 振興里 新興里 竹蓮里 南大里 寺前里 下竹里 頂竹里 光鎮里 高峰里 柴橋里 新光里 湖濱里 明湖里',
3:'客雅里 中雅里 育英里 曲溪里 西雅里 南勢里 大鵬里 西門里 仁德里 潛園里 中央里 崇禮里 石坊里 興南里 台溪里',
4:'北門里 中興里 大同里 中山里 長和里 新民里 民富里 水田里 文雅里 光田里 士林里 福林里 古賢里 湳雅里 舊社里 武陵里 南寮里 舊港里 康樂里 港北里 中寮里 海濱里 磐石里 新雅里 光華里 金華里 境福里 金竹里 湳中里 金雅里',
5:'頂埔里 中埔里 埔前里 牛埔里 樹下里 浸水里 虎林里 虎山里 港南里 大庄里 美山里 朝山里 東香里 香山里 香村里 海山里 鹽水里 內湖里 南港里 中隘里 南隘里 大湖里 茄苳里 頂福里'};
const villages=Array.from({length:5},(_,i)=>JSON.parse(fs.readFileSync('assets/map-villages-'+(i+1)+'.json'))).flat().filter(v=>v.county==='新竹市');
const used=new Set(),features=[];
for(const [number,text]of Object.entries(scopes)){
 const names=text.split(' ').map(norm),chosen=names.map(name=>{const v=villages.find(v=>v.name===name);if(!v||used.has(v.id))throw Error('Missing/duplicate village '+name);used.add(v.id);return v});
 const b=[Math.min(...chosen.map(f=>f.box[0])),Math.min(...chosen.map(f=>f.box[1])),Math.max(...chosen.map(f=>f.box[2])),Math.max(...chosen.map(f=>f.box[3]))];
 features.push({number:Number(number),scopeVillages:text.split(' '),villageIds:chosen.map(v=>v.id),d:H.mergePaths(chosen.map(v=>v.d)),box:b,center:[(b[0]+b[2])/2,(b[1]+b[3])/2]});
}
if(used.size!==villages.length)throw Error('Incomplete Hsinchu geography '+used.size+'/'+villages.length);
fs.writeFileSync('assets/history-hsinchu-geography-2022.json',JSON.stringify({year:2022,source:'https://web.cec.gov.tw/api/file/72529fa8-25c6-4260-bcbc-7de268017766.pdf',features}));
console.log('Built 5 Hsinchu districts from '+used.size+' villages');
