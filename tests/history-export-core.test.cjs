const test=require('node:test'),assert=require('node:assert/strict'),E=require('../history-export-core.js');
test('Historical export sizes stay within pixel and dimension bounds',()=>{assert.equal(E.pngScale(700,400),3);assert.equal(E.pngScale(18000,400),0);assert.equal(E.pngScale(0,400),0);assert.equal(E.pngScale(8000,8000),0);for(const [w,h] of [[1440,940],[2200,6500],[500,16000]]){const n=E.pngScale(w,h);assert.ok(n*w<=16000&&n*h<=16000&&n*n*w*h<=55000000)}});
test('Historical export filenames and Chinese wrapping are safe',()=>{assert.equal(E.filename('历史/图:2022'),'历史_图_2022');assert.deepEqual(E.wrap('历史数据',4),['历史','数据']);assert.equal(E.wrap('A台B',3).join(''),'A台B')});

test('Historical PNG export releases image, object URL and pixel buffer on success and failure',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const code=fs.readFileSync(require.resolve('../history-export-core.js'),'utf8');
 for(const mode of ['ok','image-error','context-error','blob-error']){
  const released=[],images=[],canvases=[],output={type:'image/png'};
  class ImageMock{
   constructor(){images.push(this)}
   set src(value){this.value=value;if(mode==='image-error')this.onerror();else this.onload()}
   removeAttribute(name){assert.equal(name,'src');this.value=''}
  }
  const context={module:{exports:{}},Image:ImageMock,Blob:class{},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL:value=>released.push(value)},
   document:{createElement(tag){assert.equal(tag,'canvas');const canvas={width:0,height:0,getContext:()=>mode==='context-error'?null:{fillRect(){},drawImage(){}},toBlob(cb){cb(mode==='blob-error'?null:output)}};canvases.push(canvas);return canvas}}};
  vm.runInNewContext(code,context);
  const pending=context.module.exports.pngBlob('<svg/>',700,400);
  if(mode==='ok')assert.equal(await pending,output);else await assert.rejects(pending);
  assert.deepEqual(released,['blob:test']);assert.equal(images.length,1);assert.equal(images[0].value,'');
  assert.equal(images[0].onload,null);assert.equal(images[0].onerror,null);
  for(const canvas of canvases){assert.equal(canvas.width,0);assert.equal(canvas.height,0)}
 }
});
