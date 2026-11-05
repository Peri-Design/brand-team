'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Path2D,createCanvas,loadImage}=require('/Users/katherine/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@napi-rs/canvas');
const dist=path.resolve(__dirname,fs.existsSync(path.resolve(__dirname,'../public'))?'../public':'../dist');
const assets=path.join(dist,'assets/corner-badge');
const {layoutText,composeSvg}=require(path.join(dist,'corner-badge'));
const measure=d=>{const [x,y,r,b]=new Path2D(d).computeTightBounds();return{x,y,width:r-x,height:b-y};};
let hb,font,face,blob;
test.before(async()=>{hb=require(path.join(assets,'hbjs'))(await require(path.join(assets,'hb'))({wasmBinary:fs.readFileSync(path.join(assets,'hb.wasm'))}));blob=hb.createBlob(fs.readFileSync(path.join(assets,'Montserrat-ExtraBold.ttf')));face=hb.createFace(blob,0);font=hb.createFont(face);font.setScale(face.upem,face.upem);});
test.after(()=>{font?.destroy();face?.destroy();blob?.destroy();});
const layout=text=>layoutText(hb,font,face.upem,measure,text);
// Native Figma 24:2648 / 24:3103, audited 2026-11-05.
// Shapers differ by under .002px in chosen font size; outline width and bar
// dimensions must match, rather than hardcoding a renderer-specific font size.
const cases=[
 ['GPT-6 ASTRA',35.05086278915405,44],['V5.5',36,45],
 ['IMAGE TO VIDEO',27.436177253723145,38],['x-days-free/50% Off',24,38],
 ['Seedance2.5 UNLIMITED',19.860140651464462,33],
 ['Seedance3.0 0.29$/Day',20.710299253463745,34],
 ['NanoBanana2.5 UNLIMITED',17.743513822555542,32]
];
for(const [text,figmaSize,height] of cases)test(`Figma layout parity: ${text}`,()=>{
 const a=layout(text);assert.equal(a.error,undefined);assert.equal(a.height,height);assert.ok(Math.abs(a.size-figmaSize)<.005);
 assert.ok(a.size>=17.5&&a.size<=36);assert.ok(a.tracking>=-.6&&a.tracking<=0);
 if(text==='V5.5'){assert.equal(a.size,36);assert.ok(a.inkWidth<244);}else assert.ok(Math.abs(a.inkWidth-244)<.00001);
 const xs=a.glyphs.flatMap(g=>[g.x+g.box.x*a.scale+a.offsetX,g.x+(g.box.x+g.box.width)*a.scale+a.offsetX]);
 const ys=a.glyphs.flatMap(g=>[g.y-(g.box.y+g.box.height)*a.scale+a.offsetY,g.y-g.box.y*a.scale+a.offsetY]);
 assert.ok(Math.abs((Math.min(...xs)+Math.max(...xs))/2-140)<.00001);
 assert.ok(Math.abs((Math.min(...ys)+Math.max(...ys))/2-(49.8226+8+height/2))<.00001);
});
test('unsupported, empty and unbounded copy cannot silently export clipped badges',()=>{
 assert.equal(layout('   ').error,'empty');assert.equal(layout('你好').error,'unsupported');
 assert.equal(layout('W'.repeat(120)).error,'overflow');assert.equal(layout('V5.5').text,'V5.5');
 assert.equal(layout('  GPT-6 ASTRA  ').text,'GPT-6 ASTRA');
});
test('serialized SVG keeps 18px outline edges and all black/light PNGs remain transparent',async()=>{
 for(const [text,,height] of cases)for(const ink of ['white','black']){
  const a=layout(text),wordmark=fs.readFileSync(path.join(assets,`wordmark-${ink}.svg`),'utf8'),svg=composeSvg(a,wordmark);
  assert.ok(svg.includes(wordmark));assert.ok(!svg.includes('<text'));
  assert.ok(svg.includes(`width="280" height="${49.8226+8+height}"`));
  const textPaths=svg.slice(svg.lastIndexOf('<g fill="#FFFFFF">'));
  const boxes=[...textPaths.matchAll(/<path d="([^"]+)" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) ([-\d.]+)\)"/g)].map(m=>{
   const p=new Path2D(m[1]);p.transform({a:+m[4],b:0,c:0,d:+m[5],e:+m[2],f:+m[3]});return p.computeTightBounds();
  });
  assert.equal(boxes.length,a.glyphs.length);
  const l=Math.min(...boxes.map(b=>b[0])),r=Math.max(...boxes.map(b=>b[2]));
  if(text!=='V5.5'){assert.ok(Math.abs(l-18)<.001);assert.ok(Math.abs(r-262)<.001);}
  const image=await loadImage(Buffer.from(svg)),h=49.8226+8+height,canvas=createCanvas(1120,Math.ceil(h*4)),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,1120,h*4);
  const png=canvas.toBuffer('image/png');assert.equal(png.readUInt32BE(16),1120);assert.equal(png.readUInt32BE(20),Math.ceil(h*4));
  assert.equal(ctx.getImageData(0,0,1,1).data[3],0);
  assert.equal(ctx.getImageData(560,Math.floor((49.8226+8+height-2)*4),1,1).data[3],255);
 }
});
