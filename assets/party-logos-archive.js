/* Bundled historical identification flag, not a separately registered party emblem.
 * Party: 中华社会民主党 (1991–1994); user-supplied rectangular flag center-cropped to square and masked into a circular 128px PNG
 * Reference: https://commons.wikimedia.org/wiki/File:中華社會民主黨黨旗.svg
 * Image source: geometric flag, public domain; never hotlinked.
 */
if(typeof SOURCED_PARTY_LOGOS_BY_ID!=='undefined'){
 SOURCED_PARTY_LOGOS_BY_ID.csdp='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAElElEQVR42u2cvXEbMRSEBQwSJQzdAEOpAbWhXjTj1DFrkdpwA0rZBBOHcCCPR6J4dzj8A/u9GSfU+LjA7tv3cABo/OvD3eThE/+/mXlyHERHP9cggDkJj/1+gwDmJz0Um0EAOsSv4TUIQIf0IV3BQby2KziI1xaCg3htIVjI104AB/HabmAhX9sNHMRru4GFfG03sJCvLQIH8dolwUK+thtYyNcWgYV8bRFYyNcWgYV8bRFYyNcWgYV8bRFY5k87LNmv7QIW8rVFYCFfWwT0APQAZL+yC1jI1xYBJYASQPYru4CFfG0RUAIoAWS/sgvgADgA2a/sAtIOcHk5311eztLKMAu/EuZnJ/46DqejBN84wA5RsAogJAVA8yfUDOIA4mG893LZfzne3/z8cP4jw/uYDvD2+PEPfJM5wL9Jy9mJf1nWPb/HO0BJbFe4WjjAZwH4UcneO/FL37319xrYKorC1BFAQ8JHjsPpWFoMhQXw9gjpfYuhjACW6iuRSQz5VipfBOAhXlIIJl0AGa3+24bMHtu7Wn7lLj89YstQGhIEkEh86a43tyMVe0mUoUlOwBYpgEjyK3S2RZvPnvFHYosQwE6AVSat4sqj5/FEYNspgB2Aqk5U5WVnz2Pbic3Y3OQfTsePmtThBP3HtlJLQ04GXV7Odd/5P7+XwuaNv9oMiG2qqmdFAragvYAAUTXbPcyIzYZ+4Szk78q6jYxr9u4jAFuoCwQJYE1tLckvXqtDJrpVbGAL7RlsSvY3J78Gti0RtNz/z4BtswdYs7nWJ2hiscWcCJpxHsJ7gKUM6zRKYJt1vPFHwjqt+8WwTTreeAH0fjZvhGd2gI1j4eKxKYCl+tLzaZ8S2EYcb0hvkOQArQ+BrK6DM2Jb7bIbN4ep49wWwFaD0XgdXBzb1jM6fQ8Sis0mZ1rtjZGa2DbeuTfN/kzYsm0Ghbx0aGmDn7GFvAiaabxZeoCQB16O903cICu2t8d+yS+AjQMhsWVnkgMhHAnrmfzujoQlLj9q3X8rtTwtbvsJJ4QjsaXdC0id6JKCGOJYeKZ7k/WPhRe23eBLGDeauiolIHS9XeOySrOLIQ2bMPXI2IeY/LeDEcIoDSjXw0WJryQAxNBlc9xGAIW639jmLWT7tAm2uhtL3wRQVwQrHXOWW8crE7r7UGhFbDXJ70sAFYPfCRz1dwKJ7OEenn5dK2N6F/i98PnVXEyf/TgAcVMAhmnRyH4cgNAUwNOPn0GfKQvAKIlAhPybnDpl+1PN+tASQDM4efbTBBKbAsAFJs5+HIAIEgAuMGn273EARDAh+ZQAYpcAcIHJsj/GARDBRORTAogoAeACk2R/igMgggnITy0BiGBw8ukBiGQB4AIDZ38uB0AEg5KfswQgggHJz90DIILByC/RBCKCgcgvtQpABIOQX3IZiAgGmVNXAbCHu36TyY4+AMjvXwCIoOM5cw0GREnoKFns7AOE/H4cADfoMCms6sAhv60D4AadiN91OCEe4jUFMLsQuix3bpAJ85CuJ4CRXWGY5tYNnFEe0vUEsDbhHsK1BBBKiIfo5fgL+FJpIffyVbwAAAAASUVORK5CYII=';
}


// Existing rectangular historical flags are embedded as 128px PNGs with a
// transparent "contain" margin. Remove that margin and crop the source
// rectangle's actual CENTER to a circle before displaying or exporting it.
(function(){
 if(typeof document==='undefined'||typeof Image==='undefined')return;
 const sources=[
  [typeof SOURCED_PARTY_LOGOS_BY_ID==='undefined'?null:SOURCED_PARTY_LOGOS_BY_ID,'ycp'],
  [typeof SOURCED_PARTY_LOGOS_BY_NAME==='undefined'?null:SOURCED_PARTY_LOGOS_BY_NAME,'台湾工党']
 ];
 let remaining=sources.length,changed=false;
 function finish(){
  if(--remaining===0&&changed&&typeof render==='function'&&typeof data!=='undefined'&&data)render();
 }
 for(const [library,key] of sources){
  const uri=library?.[key];
  if(!uri?.startsWith('data:image/png;base64,')){finish();continue}
  const image=new Image();
  image.onload=()=>{
   try{
    const w=image.naturalWidth,h=image.naturalHeight;
    if(!w||!h||Math.max(w,h)>512)throw Error('Unexpected flag dimensions');
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw Error('Canvas unavailable');
    ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,w,h).data;
    let left=w,top=h,right=-1,bottom=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(pixels[(y*w+x)*4+3]>5){
     left=Math.min(left,x);top=Math.min(top,y);
     right=Math.max(right,x);bottom=Math.max(bottom,y);
    }
    if(right<left)throw Error('Flag image empty');
    const size=Math.min(right-left+1,bottom-top+1);
    const cx=(left+right)/2,cy=(top+bottom)/2;
    const output=document.createElement('canvas');output.width=output.height=128;
    const brush=output.getContext('2d');
    brush.beginPath();brush.arc(64,64,64,0,2*Math.PI);brush.clip();
    brush.drawImage(image,cx-size/2,cy-size/2,size,size,0,0,128,128);
    library[key]=output.toDataURL('image/png');changed=true;
   }catch(error){console.warn('保留原党旗图档：',key,error)}
   finish();
  };
  image.onerror=finish;
  image.src=uri;
 }
})();
