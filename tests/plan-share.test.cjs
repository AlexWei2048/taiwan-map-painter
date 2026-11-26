const test=require('node:test'),assert=require('node:assert/strict'),S=require('../plan-share.js');
test('Explicit shared snapshot round trips Chinese text and rejects invalid links',async()=>{
 const original={name:'方案甲',project:{version:1,title:'台湾地图',predictions:{d:{winners:['a']}}}};
 const hash=await S.encode(original);assert.ok(hash.startsWith(S.PREFIX));assert.deepEqual(await S.decode(hash),original);
 await assert.rejects(S.decode('#plan-v1=bad!'));await assert.rejects(S.encode({name:'',project:{version:1}}));
 await assert.rejects(S.encode({name:'大',project:{version:1,huge:'x'.repeat(1000001)}}),/过大/);
});
