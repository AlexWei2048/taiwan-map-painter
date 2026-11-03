const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const app=fs.readFileSync('app.js','utf8'),seats=fs.readFileSync('council-seats.js','utf8');
const helpers=app.slice(app.indexOf('function leaderIn('),app.indexOf('/* A shared orthogonal callout router'))+app.slice(app.indexOf('function mapLeaderSegments('),app.indexOf('function mapLeaderRectIsClear('));
const source=seats.slice(seats.indexOf('function councilSeatLeaderPoints('),seats.indexOf('function drawCouncilSeats('));
const {route,cross,inside}=new Function(helpers+source+';return {route:councilSeatLeaderPoints,cross:leaderCross,inside:leaderIn}')();
test('Seat leaders start at the district anchor, use orthogonal segments and end at the card edge',()=>{
 const q={anchor:{x:20,y:30},rect:[180,80,260,170]};
 const points=route(q,[]);assert.deepEqual(points[0],[20,30]);
 for(let i=1;i<points.length;i++)assert.ok(points[i][0]===points[i-1][0]||points[i][1]===points[i-1][1]);
 const [x,y]=points.at(-1),r=q.rect;assert.ok(x===r[0]||x===r[2]||y===r[1]||y===r[3]);assert.ok(inside(x,y,r));
});
test('Seat leaders choose a clear route around another seat frame when one is available',()=>{
 const block=[60,-20,120,40],points=route({anchor:{x:0,y:0},rect:[180,50,250,100]},[block]);
 for(let i=1;i<points.length;i++)assert.equal(cross(...points[i-1],...points[i],block),false);
});
