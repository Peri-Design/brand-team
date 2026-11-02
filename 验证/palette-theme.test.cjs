'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const frontend=path.join(__dirname,'../public'),palette=require(path.join(frontend,'palette'));
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
const hue=hex=>{const [r,g,b]=rgb(hex).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;if(!d)return 0;return ((max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60)%360;};
const hueDistance=(a,b)=>Math.min(Math.abs(a-b),360-Math.abs(a-b));
function scene(base,rects=[]){const width=160,height=100,data=new Uint8ClampedArray(width*height*4);function fill(x,y,w,h,color,alpha=255){const c=rgb(color);for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=(yy*width+xx)*4;data.set([...c,alpha],i);}}fill(0,0,width,height,base);for(const r of rects)fill(...r);return {data,width,height};}
const match=s=>palette.fromPixels(s.data,s.width,s.height);
const luma=c=>c.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
test('warm paper edge remains the fill while large pink regions drive decorative planes',()=>{
 const s=scene('#F8EFEA',[[60,0,100,100,'#EE285F'],[90,20,30,60,'#DDA484'],[125,65,25,35,'#303034']]);const p=match(s);
 assert.equal(p.background,'#F8EFEA');assert.ok(hueDistance(hue(p.layers[0][0]),hue('#EE285F'))<16,JSON.stringify(p));
 assert.ok(rgb(p.layers[0][0])[2]>rgb(p.layers[0][0])[1],'pink theme must not collapse into orange/brown');
 assert.deepEqual(match(s),p);
});
test('blue, green and orange themes are selected from the image rather than a fixed pink preset',()=>{
 for(const color of ['#245FD2','#16855C','#E16927']){
  const p=match(scene('#F8EFEA',[[40,0,120,100,color],[110,20,25,50,'#DDA484']]));assert.equal(p.background,'#F8EFEA');
  assert.ok(hueDistance(hue(p.layers[0][0]),hue(color))<16,JSON.stringify(p));
 }
});
test('isolated vivid accents cannot replace a broad image theme or tint a neutral design',()=>{
 let p=match(scene('#22549A',[[130,40,10,10,'#FF0033']]));assert.ok(hueDistance(hue(p.layers[0][0]),hue('#22549A'))<16);
 p=match(scene('#F8EFEA',[[130,40,10,10,'#FF0033']]));for(const layer of p.layers)for(const color of layer){const [r,g,b]=rgb(color);assert.equal(r,g);assert.equal(g,b);}
});
test('red themes spanning the hue boundary stay red and transparent colors are ignored',()=>{
 const p=match(scene('#F8EFEA',[[40,0,60,100,'#D82342'],[100,0,60,100,'#D83823']]));assert.ok(hueDistance(hue(p.layers[0][0]),0)<18);
 const transparent=scene('#22549A',[[0,0,20,100,'#FF0033',0]]);assert.equal(match(transparent).background,'#22549A');assert.ok(hueDistance(hue(match(transparent).layers[0][0]),hue('#22549A'))<16);
});
test('default-opacity gradient stops retain contrast and distinct tonal levels for white and black copy',()=>{
 for(const color of ['#EE285F','#245FD2','#16855C','#E16927','#707070','#F8EFEA'])for(const text of ['#FFFFFF','#000000']){
  const s=scene(color),p=palette.fromPixels(s.data,s.width,s.height,text),under=text==='#FFFFFF'?255:0,tl=luma(rgb(text));
  for(const layer of p.layers){assert.equal(new Set(layer).size,3,JSON.stringify(p));for(const stop of layer){const bg=luma(rgb(stop).map(v=>.8*v+.2*under)),ratio=(Math.max(tl,bg)+.05)/(Math.min(tl,bg)+.05);assert.ok(ratio>=4.5,`${color} ${text} ${stop} contrast ${ratio}`);}}
 }
});
test('both editors ship the same palette rules',()=>{
 assert.deepEqual(fs.readFileSync(path.join(frontend,'palette.js')),fs.readFileSync(path.join(frontend,'materials/vendor/palette.js')));
});
