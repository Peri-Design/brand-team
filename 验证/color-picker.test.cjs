'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hexToHSV,hsvToHex}=require('../public/color-picker.js');
test('连续色板支持基本色、边界和大小写色值',()=>{
 for(const color of ['#000000','#FFFFFF','#FF0000','#00FF00','#0000FF','#FFFF00','#00FFFF','#FF00FF','#A855F7','#3629CA','#12aBcD']){
  const {h,s,v}=hexToHSV(color);assert.equal(hsvToHex(h,s,v),color.toUpperCase());
 }
 assert.equal(hsvToHex(360,100,100),'#FF0000');assert.equal(hsvToHex(-120,100,100),'#0000FF');
 assert.equal(hsvToHex(0,-10,120),'#FFFFFF');
});
test('4096 组 RGB 色值往返 HSV 不产生色差',()=>{
 for(let r=0;r<=255;r+=17)for(let g=0;g<=255;g+=17)for(let b=0;b<=255;b+=17){
  const color='#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
  const {h,s,v}=hexToHSV(color);assert.equal(hsvToHex(h,s,v),color);
 }
});
test('调到黑白灰时保留当前色相，继续拖动不会丢失色系',()=>{
 for(const color of ['#000000','#FFFFFF','#808080'])assert.equal(hexToHSV(color,275).h,275);
 assert.equal(hsvToHex(275,100,0),'#000000');
 assert.equal(hsvToHex(275,0,100),'#FFFFFF');
});

test('吸管按画布实际像素取色，适配视图缩放及边界',()=>{
 const {canvasColorAt}=require('../public/color-picker.js');let point;
 const canvas={width:1320,height:558,getBoundingClientRect:()=>({left:100,top:50,width:660,height:279}),getContext:()=>({getImageData:(x,y)=>{point=[x,y];return {data:[18,171,205,255]};}})};
 assert.equal(canvasColorAt(canvas,430,189.5),'#12ABCD');assert.deepEqual(point,[660,279]);
 canvasColorAt(canvas,760,329);assert.deepEqual(point,[1319,557]);
 canvasColorAt(canvas,99,49);assert.deepEqual(point,[0,0]);
});
test('吸管不把透明像素当作黑色，也不吞掉跨域读取错误',()=>{
 const {canvasColorAt}=require('../public/color-picker.js');const canvas={width:10,height:10,getBoundingClientRect:()=>({left:0,top:0,width:10,height:10}),getContext:()=>({getImageData:()=>({data:[0,0,0,0]})})};
 assert.throws(()=>canvasColorAt(canvas,2,2),/透明/);
 canvas.getContext=()=>({getImageData:()=>{const error=Error('tainted');error.name='SecurityError';throw error;}});assert.throws(()=>canvasColorAt(canvas,2,2),{name:'SecurityError'});
});
