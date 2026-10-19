(function(root){
'use strict';
function seriesValue(value){
 let text=String(value??'').trim();
 while(text.startsWith('「')&&text.endsWith('」'))text=text.slice(1,-1).trim();
 return text;
}
function seriesLabel(value){const text=seriesValue(value);return text?`「 ${text} 」`:'';}
function overlays(m){return {top:{enabled:true,opacity:45,color:'#000000',...m.socialOverlays?.top},bottom:{enabled:true,opacity:60,color:'#000000',...m.socialOverlays?.bottom}};}
// Fade smoothly toward the centre, keeping contrast under the content.
function regionEdge(spec,side){const nodes=spec.children.filter(n=>(n.type==='TEXT'||n.role==='logo')&&(side==='top'?n.y<spec.height/2:n.y>=spec.height/2));return side==='top'?Math.max(0,...nodes.map(n=>n.y+n.height)):Math.min(spec.height,...nodes.map(n=>n.y));}
function strength(y,h,side,edge=side==='top'?0:h){const start=side==='top'?Math.max(0,edge-h*28/360):h/2,end=side==='top'?h/2:Math.min(h,edge+h*28/360),t=Math.max(0,Math.min(1,side==='top'?1-(y-start)/(end-start):(y-start)/(end-start)));return t*t*(3-2*t);}
const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
function drawOverlays(c,spec,m){
 const settings=overlays(m),h=spec.height,w=spec.width;
 for(const side of ['top','bottom']){
  const setting=settings[side];if(!setting.enabled||setting.opacity===0)continue;
  const start=side==='top'?0:h/2,end=side==='top'?h/2:h;
  const gradient=c.createLinearGradient(0,start,0,end),color=rgb(setting.color);
  for(let i=0;i<=24;i++){const t=i/24,alpha=strength(start+(end-start)*t,h,side,regionEdge(spec,side))*setting.opacity/100;gradient.addColorStop(t,`rgba(${color.join(',')},${alpha})`);}
  c.save();c.globalAlpha=1;c.fillStyle=gradient;c.fillRect(0,start,w,end-start);c.restore();
 }
}
const luminance=p=>p.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
function samples(image,nodes){const list=[],step=Math.max(2,Math.round(image.height/180));for(const n of nodes)for(let y=Math.max(0,Math.ceil(n.y));y<Math.min(image.height,n.y+n.height);y+=step)for(let x=Math.max(0,Math.ceil(n.x));x<Math.min(image.width,n.x+n.width);x+=step){const k=(y*image.width+x)*4,a=image.data[k+3]/255;list.push({rgb:[0,1,2].map(i=>image.data[k+i]*a+255*(1-a)),y,alpha:n.type==='TEXT'&&n.role==='series'?.8:1});}return list;}
function score(points,ink,layer,h,side,edge){const values=points.map(p=>{const a=layer?.enabled?strength(p.y,h,side,edge)*layer.opacity/100:0,bg=p.rgb.map((v,i)=>v*(1-a)+(layer?rgb(layer.color)[i]:0)*a),fg=ink.map((v,i)=>v*p.alpha+bg[i]*(1-p.alpha));return contrast(fg,bg);}).sort((a,b)=>a-b);return values[Math.floor(values.length*.1)]||1;}
function tint(points){const mean=[0,1,2].map(i=>points.reduce((s,p)=>s+p.rgb[i],0)/Math.max(1,points.length)),gray=mean.reduce((a,b)=>a+b,0)/3,muted=mean.map(v=>v*.4+gray*.6),peak=Math.max(1,...muted);return '#'+muted.map(v=>Math.round(12+v/peak*22).toString(16).padStart(2,'0')).join('');}
// Analyse the drawn crop in each content region. This proposes settings only;
// the caller applies them on an explicit click, as one undoable edit.
function recommend(image,spec){
 const result={textColor:'#FFFFFF',logo:'white',socialOverlays:{},needsReview:false};
 for(const side of ['top','bottom']){
  const nodes=spec.children.filter(n=>(n.type==='TEXT'||n.role==='logo')&&(side==='top'?n.y<spec.height/2:n.y>=spec.height/2));
  const groups=[{kind:'text',nodes:nodes.filter(n=>n.type==='TEXT')},{kind:'logo',nodes:nodes.filter(n=>n.role==='logo')}].filter(g=>g.nodes.length);
  const edge=regionEdge(spec,side),all=samples(image,nodes),layer={enabled:false,opacity:45,color:tint(all)};
  for(const group of groups){
   const points=samples(image,group.nodes),light=[255,255,255],dark=group.kind==='logo'?[0,0,0]:[32,32,42];
   const lightScore=score(points,light,null,spec.height,side,edge),darkScore=score(points,dark,null,spec.height,side,edge),useLight=Math.max(lightScore,darkScore)<4.5||lightScore>=darkScore,ink=useLight?light:dark;
   if(group.kind==='text')result.textColor=useLight?'#FFFFFF':'#20202A';else result.logo=useLight?'white':'black';
   if(Math.max(lightScore,darkScore)<4.5){layer.enabled=true;layer.color=useLight?tint(points):'#FFFFFF';layer.opacity=85;for(let opacity=15;opacity<=85;opacity+=5){if(score(points,ink,{...layer,opacity},spec.height,side,edge)>=4.5){layer.opacity=opacity;break;}}if(score(points,ink,layer,spec.height,side,edge)<4.5)result.needsReview=true;}
  }
  result.socialOverlays[side]=layer;
 }
 return result;
}
function applyRecommendation(m,l,recommendation){m.adjustments[l]={...m.adjustments[l],textColorMode:'custom',textColor:recommendation.textColor,textOpacity:100};m.socialLogoKind=recommendation.logo;m.socialOverlays=structuredClone(recommendation.socialOverlays);}
const api={seriesValue,seriesLabel,overlays,drawOverlays,strength,recommend,applyRecommendation};
if(typeof module!=='undefined')module.exports=api;else root.MaterialSocial=api;
})(typeof window==='undefined'?globalThis:window);
