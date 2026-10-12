'use strict';
((root) => {
 const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
 const hex=rgb=>'#'+rgb.map(n=>Math.round(clamp(n,0,255)).toString(16).padStart(2,'0')).join('').toUpperCase();
 const rgb=value=>[1,3,5].map(i=>parseInt(value.slice(i,i+2),16));
 function luminance(color){const c=color.map(n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
 function hsl(color){const [r,g,b]=color.map(n=>n/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0;if(d){h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4;h/=6;}return [h,d?d/(1-Math.abs(2*l-1)):0,l];}
 function fromHsl(h,s,l){const hue=n=>{const k=(n+h*12)%12;return 255*(l-s*Math.min(l,1-l)*Math.max(-1,Math.min(k-3,9-k,1)));};return [hue(0),hue(8),hue(4)];}
 // Favor the prevailing color near the left edge. Small bright subjects and
 // highlights cannot outweigh the surrounding background just by being vivid.
 function representative(data,width,height,left,right){
  const bins=new Map(),samples=[];
  for(let y=0;y<height;y++)for(let x=Math.floor(width*left);x<Math.max(1,Math.ceil(width*right));x++){
   const i=(y*width+x)*4;if(data[i+3]<128)continue;
   const c=[data[i],data[i+1],data[i+2]],weight=(data[i+3]/255)*(1.5-.5*x/width),key=c.map(n=>n>>4).join(',');
   samples.push({c,weight});const bin=bins.get(key)||{weight:0,sum:[0,0,0]};bin.weight+=weight;c.forEach((n,k)=>bin.sum[k]+=n*weight);bins.set(key,bin);
  }
  if(!samples.length)return null;
  const winner=[...bins.values()].sort((a,b)=>b.weight-a.weight)[0],center=winner.sum.map(n=>n/winner.weight),sum=[0,0,0];let total=0;
  for(const {c,weight} of samples){const distance=c.reduce((n,v,k)=>n+(v-center[k])**2,0);if(distance>48**2)continue;const w=weight/(1+distance/24**2);total+=w;c.forEach((n,k)=>sum[k]+=n*w);}
  return sum.map(n=>Math.round(n/total));
 }
 function fromPixels(data,width,height,textColor='#FFFFFF'){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data.length!==width*height*4)throw Error('取色图片数据不正确。');
  const edge=representative(data,width,height,0,.12)||representative(data,width,height,0,.6)||representative(data,width,height,0,1);
  if(!edge)return null;
  const [h,s,l]=hsl(edge),lightText=luminance(rgb(textColor))>.35;
  // Maintain the sampled hue and a restrained tonal separation between planes.
  // Neutral images stay neutral; no fixed purple is injected into other themes.
  const levels=lightText?
   [clamp(l+.10,.30,.55),clamp(l,.23,.43),clamp(l-.16,.13,.27)]:
   [clamp(l+.24,.80,.92),clamp(l+.15,.70,.84),clamp(l+.07,.60,.74)];
  const tone=(level,saturation)=>hex(fromHsl(h,saturation,level));
  return {background:hex(edge),layers:[levels.map(v=>tone(v,s*.92)),levels.map((v,i)=>tone(clamp(v+(i===2?.025:.035),0,1),s*.86))]};
 }
 const api={fromPixels};if(typeof module==='object'&&module.exports)module.exports=api;else root.BannerPalette=api;
})(typeof window==='undefined'?globalThis:window);
