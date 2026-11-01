const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8');
const src=app.slice(app.indexOf('let mapNumberRows=[]'),app.indexOf('\nfunction activeInsetDefinitions(){'));
const area={left:20,right:980,top:30,bottom:760},t={scale:1,tx:0,ty:0,area};
const overlap=(a,b)=>a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];
function layout(level='council',overrides={}){
 const state={level,county:'高雄市',labels:true,legend:{show:false},...overrides};
 return new Function('state','data','featureElectorate','shownLabel','regionContains','leaderOverlap','leaderIn',
  'contentArea','sceneSpec','legendBox','svgEl','paint','$','identityPanelsActive','view','leaderFrames',
  src+';return {labelLayout,mapOrderedLabelRows}')(
  state,{counties:[]},()=> 'regional',f=>f.name,
  (f,x,y)=>x>=f.box[0]&&x<=f.box[2]&&y>=f.box[1]&&y<=f.box[3],overlap,
  (x,y,b)=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3],()=>area,()=>({height:900}),()=>null,
  ()=>{},()=>{},()=>null,()=>false,{},()=>[]);
}
const tiny=(id,x,y)=>({id,county:'高雄市',name:'狭小区域'+id,center:[x,y],box:[x-3,y-3,x+3,y+3]});
test('Crowded official district numbers are complete, equally sized and keep their original values',()=>{
 const items=Array.from({length:15},(_,i)=>({...tiny('d'+(i+1),400,300+i*4),number:i+1,name:'第'+(i+1)+'选区'}));
 const before=JSON.stringify(items),labels=layout().labelLayout(items,t,15);
 assert.equal(labels.length,items.length);assert.equal(JSON.stringify(items),before);
 assert.deepEqual(labels.map(q=>Number(q.text)).sort((a,b)=>a-b),items.map(f=>f.number));
 assert.ok(labels.every(q=>q.font===15&&q.leaderAnchor&&['left','right'].includes(q.column)));
 for(const side of ['left','right']){const rows=labels.filter(q=>q.column===side);for(let i=1;i<rows.length;i++){assert.ok(rows[i].y-rows[i-1].y>=31);assert.ok(rows[i].leaderAnchor.y>=rows[i-1].leaderAnchor.y)}}
 for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert.ok(!overlap(labels[i].rect,labels[j].rect));
});
test('Administrative numbers follow geography and stay stable when source rows are reordered',()=>{
 const items=[tiny('南',400,500),tiny('东北',450,200),tiny('西北',400,200),tiny('中',420,350)];
 const run=items=>Object.fromEntries(layout('towns').labelLayout(items,t,15).map(q=>[q.f.id,q.text]));
 assert.deepEqual(run(items),{'西北':'1','东北':'2','中':'3','南':'4'});
 assert.deepEqual(run([...items].reverse()),run(items));
});
test('Dense callout rows respect both canvas edges and minimum spacing',()=>{
 const solve=layout().mapOrderedLabelRows;
 const ys=solve([100,101,102,700,701],100,700,40);
 assert.equal(ys.length,5);assert.ok(ys[0]>=100&&ys.at(-1)<=700);
 for(let i=1;i<ys.length;i++)assert.ok(ys[i]-ys[i-1]>=40);
 assert.equal(solve([1,2,3],0,20,30),null);
});
test('Council township forecast pieces use administrative references rather than inherited district numbers',()=>{
 const f={...tiny('local',400,400),name:'盐埕区',number:8,parentDistrictId:'council:64000:08'};
 const q=layout().labelLayout([f],t,15)[0];
 assert.equal(q.text,'1');assert.equal(q.numeric,true);assert.equal(q.districtNumber,undefined);
});

test('Long township callouts on the correct side are shortened without losing names',()=>{
 const begin=app.indexOf('function mapLeaderSegments('),end=app.indexOf('\nfunction mapOrthogonalLeader',begin);
 const shorten=app.slice(app.indexOf('function townShortenCrossSideCallouts('),app.indexOf('\nfunction townNameLabelLayout'));
 const solve=new Function('leaderFrames','leaderIn','leaderOverlap','leaderCross','regionContains',
  app.slice(app.indexOf('function leaderCross('),app.indexOf('\n/* A shared orthogonal'))+'\n'+app.slice(begin,end)+'\n'+shorten+';return townShortenCrossSideCallouts')(
   ()=>[],(x,y,b)=>x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3],overlap,null,
   (f,x,y)=>x>=f.box[0]&&x<=f.box[2]&&y>=f.box[1]&&y<=f.box[3]);
 const f={id:'urban',box:[390,290,410,310]},q={f,text:'城区',font:15,x:100,y:100,rect:[80,85,120,115],
  column:'left',calloutLane:'perimeter',leaderAnchor:{x:400,y:300},
  leaderPoints:[[400,300],[150,300],[150,100],[120,100]]};
 const labels=[q];solve(labels,[f],t,{left:390,right:800},area,null,15,2.4);
 assert.equal(labels.length,1);assert.equal(q.text,'城区');assert.equal(q.font,15);
 assert.equal(q.calloutLane,'local-near');
 const distance=q.leaderPoints.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-q.leaderPoints[i][0],p[1]-q.leaderPoints[i][1]),0);
 assert.ok(distance<100);assert.ok(q.rect[2]<390);
});

test('Every administrative map uses interior names or geographic reference digits, including prediction views',()=>{
 const small={id:'urban',name:'放不下的行政区',county:'高雄市',center:[410,310],box:[400,300,420,320]};
 const large={id:'rural',name:'大树区',county:'高雄市',center:[600,400],box:[530,330,670,470]};
 for(const level of ['counties','towns','villages'])for(const office of ['mayor','township']){
  const solver=layout(level,{workspaceMode:'prediction',fillMode:'prediction',predictionOffice:office,predictionScale:'overlay'});
  const labels=solver.labelLayout([small,large],t,15);
  assert.equal(labels.length,2);
  const numbered=labels.find(q=>q.f.id===small.id),named=labels.find(q=>q.f.id===large.id);
  assert.equal(numbered.numeric,true);assert.equal(numbered.text,'1');
  assert.equal(named.text,large.name);assert.equal(named.numeric,false);
  assert.ok(labels.every(q=>q.numeric||!q.leaderAnchor),'Administrative full names must never become long callouts');
 }
});

test('Green Island, Orchid Island and Liuqiu retain full names centred beneath their islands',()=>{
 for(const [county,name]of [['台东县','绿岛乡'],['台东县','兰屿乡'],['屏东县','琉球乡']]){
  const f={id:name,name,county,center:[410,310],box:[408,307,412,313]};
  const label=layout('towns',{county}).labelLayout([f],t,15)[0];
  assert.equal(label.text,name);assert.equal(label.numeric,false);assert.equal(label.islandTownBottom,true);
  assert.equal(label.x,410);assert.ok(label.rect[1]>313);assert.equal(label.leaderAnchor,undefined);
 }
});
