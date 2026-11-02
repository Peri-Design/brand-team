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
 // Theme colors use full-image support and spatial coverage. Brightness alone
 // cannot promote a tiny accent, and near-white paper is not a chromatic theme.
 function themeColor(data,width,height){
  const bins=Array.from({length:24},()=>({area:0,weight:0,sum:[0,0,0],tiles:new Set()}));
  const visibleTiles=new Set();let visible=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const i=(y*width+x)*4;if(data[i+3]<128)continue;
   const alpha=data[i+3]/255,c=[data[i],data[i+1],data[i+2]],max=Math.max(...c)/255,min=Math.min(...c)/255,chroma=max-min;
   const tile=Math.min(3,Math.floor(x*4/width))+4*Math.min(3,Math.floor(y*4/height));visible+=alpha;visibleTiles.add(tile);
   if(chroma<.10||max<.14||min>.90)continue;
   const [h]=hsl(c),bin=bins[Math.min(23,Math.floor(h*24))],weight=alpha*(.35+.65*Math.sqrt(chroma));
   bin.area+=alpha;bin.weight+=weight;c.forEach((v,k)=>bin.sum[k]+=v*weight);bin.tiles.add(tile);
  }
  if(!visible)return null;
  let best=null;
  for(let i=0;i<24;i++){
   const group=[bins[(i+23)%24],bins[i],bins[(i+1)%24]],tiles=new Set(group.flatMap(b=>[...b.tiles]));
   const area=group.reduce((n,b)=>n+b.area,0),weight=group.reduce((n,b)=>n+b.weight,0);
   if(area<visible*.05||tiles.size<Math.min(3,visibleTiles.size))continue;
   const score=weight*(.65+.35*tiles.size/visibleTiles.size);
   if(!best||score>best.score){const dominant=group.reduce((a,b)=>a.weight>=b.weight?a:b);best={score,color:dominant.sum.map(n=>Math.round(n/dominant.weight))};}
  }
  return best?.color||null;
 }
 // A readable tonal range at the default 80% plane opacity, including a
 // contrasting underlay. Keep three distinct stops rather than clipping them
 // all to the same contrast boundary.
 function layerColors(h,s,l,textColor,lightText,offset=0){
  const textL=luminance(rgb(textColor)),contrast=level=>{
   const underlay=lightText?255:0,color=fromHsl(h,s,level).map(v=>.8*v+.2*underlay),bg=luminance(color);
   return (Math.max(textL,bg)+.05)/(Math.min(textL,bg)+.05);
  };
  let low=0,high=1;for(let i=0;i<16;i++){const mid=(low+high)/2;if((contrast(mid)>=4.6)===lightText)low=mid;else high=mid;}
  const boundary=lightText?low:high;
  let levels=lightText?[clamp(l+.10,.30,.55),clamp(l,.23,.43),clamp(l-.16,.13,.27)]:[clamp(l+.24,.80,.92),clamp(l+.15,.70,.84),clamp(l+.07,.60,.74)];
  levels=levels.map((v,i)=>clamp(v+(i===2?offset*.7:offset),0,1));
  if(lightText){levels[0]=Math.min(levels[0],boundary);levels[1]=Math.max(0,Math.min(levels[1],levels[0]-.06));levels[2]=Math.max(0,Math.min(levels[2],levels[1]-.06));}
  else{levels[2]=Math.max(levels[2],boundary);levels[1]=Math.min(1,Math.max(levels[1],levels[2]+.04));levels[0]=Math.min(1,Math.max(levels[0],levels[1]+.04));}
  return levels.map(v=>hex(fromHsl(h,s,v)));
 }
 function fromPixels(data,width,height,textColor='#FFFFFF'){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||data.length!==width*height*4)throw Error('取色图片数据不正确。');
  const edge=representative(data,width,height,0,.12)||representative(data,width,height,0,.6)||representative(data,width,height,0,1);
  if(!edge)return null;
  const theme=themeColor(data,width,height),base=theme||edge,[h,rawS,l]=hsl(base);
  // Neutral/paper-only images must not turn orange/brown when darkened.
  const s=!theme&&Math.max(...base)-Math.min(...base)<25.5?0:rawS,lightText=luminance(rgb(textColor))>.35;
  return {background:hex(edge),layers:[layerColors(h,s*.92,l,textColor,lightText),layerColors(h,s*.86,l,textColor,lightText,.035)]};
 }
 const api={fromPixels};if(typeof module==='object'&&module.exports)module.exports=api;else root.BannerPalette=api;
})(typeof window==='undefined'?globalThis:window);
