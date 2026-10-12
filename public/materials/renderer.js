'use strict';
window.MaterialRenderer=(()=>{
const spec=window.BANNER_SPEC,blockSpec=window.WEB_BLOCK_SPEC,logoAPI=window.BrandLogo,FONT={zh:'BannerSC',en:'BannerEN',ja:'BannerJP'},logoCache=new Map();
let state,source,slotSources={};
const adjustment=(key,adjustments=state.adjustments)=>({zoom:100,x:0,y:0,fade:48,...adjustments[key]});
const textStyle=key=>({mode:adjustment(key).textColorMode,color:adjustment(key).textColor||'#FFFFFF'});
const mediaFor=slot=>state.slotMedia?.[slot];
const sourceFor=slot=>slotSources[slot]||source;
const backgroundFor=slot=>state.slotBackgrounds[slot];
 function logoURL(config){return config.kind==='custom'?config.image:config.kind==='none'?null:`/assets/PixVerse-${config.kind}.svg`;}
 async function prepareLogo(config){const url=logoURL(config);if(!url)return null;if(logoCache.has(url))return logoCache.get(url);
  if(url.startsWith('data:image/svg+xml'))logoAPI.checkSVG(new TextDecoder().decode(Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0))));
  const img=await loadImage(url);if(img.naturalWidth*img.naturalHeight>16000000)throw Error('Logo 像素过大，请控制在 1600 万像素内。');
  const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const measured=logoAPI.bounds(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);const b=config.kind==='custom'?measured:{x:0,y:0,width:img.naturalWidth,height:img.naturalHeight};const box=config.kind==='custom'?logoAPI.placement(spec.web,b):{x:spec.web.logoBox[0],y:spec.web.logoBox[1],width:spec.web.logoBox[2],height:spec.web.logoBox[3]};
  const item={image:img,bounds:b,box,lowResolution:!(url.startsWith('data:image/svg+xml;')||url.endsWith('.svg'))&&b.height<spec.web.logoBox[3]*spec.web.scale};logoCache.set(url,item);return item;
 }

 function drawLogo(ctx,slot){if(slot!=='web'||state.webLogo.kind==='none')return null;const item=logoCache.get(logoURL(state.webLogo));if(!item)return 'Logo 尚未就绪，请重新选择或上传。';const b=item.bounds,r=item.box;ctx.drawImage(item.image,b.x,b.y,b.width,b.height,r.x,r.y,r.width,r.height);return null;}

 const blockDefaults=()=>({preset:'auto',layers:[{colors:['#6453ed','#5140df','#302084'],opacity:80},{colors:['#6550f5','#4935ec','#3223aa'],opacity:80}]});
 function drawBlocks(ctx,includeBase=false){
  const paintLayer=(layer,style)=>{ctx.save();ctx.transform(...layer.transform);
   // Figma's first transform row maps normalized shape coordinates to
   // gradient position t. Convert that scalar field to local endpoints.
   const [a,c,e]=layer.gradient.gradientTransform[0],vx=a/layer.width,vy=c/layer.height,norm=vx*vx+vy*vy;
   const gradient=ctx.createLinearGradient(-e*vx/norm,-e*vy/norm,(1-e)*vx/norm,(1-e)*vy/norm);layer.gradient.gradientStops.forEach((stop,j)=>{
    const color=style?.colors[j];gradient.addColorStop(stop.position,color?color+Math.round(stop.color.a*255).toString(16).padStart(2,'0'):`rgba(${stop.color.r*255},${stop.color.g*255},${stop.color.b*255},${stop.color.a})`);
   });ctx.globalAlpha=style?style.opacity/100:layer.opacity;ctx.fillStyle=gradient;
   if(layer.paths.length)for(const path of layer.paths)ctx.fill(new Path2D(path.data),path.windingRule==='EVENODD'?'evenodd':'nonzero');else ctx.fillRect(0,0,layer.width,layer.height);ctx.restore();
  };
  if(includeBase){const layer=blockSpec.baseGradient;paintLayer(layer,{colors:['#ffffff',backgroundFor('web')],opacity:100});}
  blockSpec.layers.forEach((layer,i)=>paintLayer(layer,state.webBlocks.layers[i]));
 }
 function imagePalette(img=source){
  const scale=Math.min(1,256/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return window.BannerPalette.fromPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,'#FFFFFF');
 }

 function imageCoverageIssue({w,h,visualLeft,ix,iy,iw,ih}){
  const tolerance=.25,gaps=[];
  if(iy>tolerance)gaps.push('上边缘');
  if(iy+ih<h-tolerance)gaps.push('下边缘');
  if(ix+iw<w-tolerance)gaps.push('右边缘');
  if(ix>visualLeft+tolerance)gaps.push('主视觉区域左侧');
  return gaps.length?`主视觉有漏边：${gaps.join('、')}未被图片覆盖，请放大或回移图片`:null;
 }

 function settings(key){const [slot,lang]=key.split(':');const s=spec[slot], variant=s.variants.find(v=>v.key===(slot==='app'?state.variant:'primary')),templateType=variant.languages.find(l=>l.key===lang),text=textStyle(key);const type={...templateType,color:(text.mode==='custom'?text.color:'#FFFFFF')+((adjustment(key).textOpacity??100)<100?Math.round((adjustment(key).textOpacity??100)/100*255).toString(16).padStart(2,'0'):'')};return {slot,lang,s,variant,type,titleBox:variant.titleBox||s.titleBox};}
 function titleCopy(slot,lang,variant){return slot==='app'&&variant.key==='secondary'?state.copy[lang].appSecondaryTitle:state.copy[lang].title;}

 function loadImage(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('图片无法读取，请使用 PNG、JPG 或 WebP。'));i.src=url;});}

 async function fontsReady(){if(!window.BANNER_FONT_COVERAGE)throw Error('字体校验数据未载入');const loaded=await Promise.all(['zh','en','ja'].flatMap(l=>[document.fonts.load(`900 30px ${FONT[l]}`),document.fonts.load(`400 14px ${FONT[l]}`)]));if(loaded.some(faces=>!faces.length||faces.some(face=>face.status!=='loaded')))throw Error('规范字体尚未载入，已停止导出');}
 function textWidth(ctx,text,spacing){return ctx.measureText(text).width;}
 const jaOpeningPunctuation=/^[「『【（〈《〔［｛]/,opticalInsetCache=new Map(),opticalLeftTolerance=.5;
 function pixelOpticalInset(ctx,line,size){
  const sample=[...line].slice(0,8).join(''),key=[ctx.font,ctx.letterSpacing||'',sample].join('|');if(opticalInsetCache.has(key))return opticalInsetCache.get(key);
  const metrics=ctx.measureText(sample);if(typeof document==='undefined'||!document.createElement)return -metrics.actualBoundingBoxLeft;
  const scale=4,pad=Math.ceil(size*2),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil((metrics.width+pad*2)*scale));canvas.height=Math.max(1,Math.ceil(size*4*scale));const probe=canvas.getContext('2d',{willReadFrequently:true});probe.scale(scale,scale);probe.font=ctx.font;probe.fontKerning='normal';probe.textRendering='geometricPrecision';if('letterSpacing' in probe)probe.letterSpacing=ctx.letterSpacing||'0px';probe.textBaseline='alphabetic';probe.fillStyle='#fff';probe.fillText(sample,pad,pad+size*1.6);const data=probe.getImageData(0,0,canvas.width,canvas.height).data;let minX=canvas.width;for(let x=0;x<canvas.width&&minX===canvas.width;x++)for(let y=0;y<canvas.height;y++)if(data[(y*canvas.width+x)*4+3]){minX=x;break;}const inset=minX===canvas.width?0:minX/scale-pad;opticalInsetCache.set(key,inset);if(opticalInsetCache.size>300)opticalInsetCache.delete(opticalInsetCache.keys().next().value);return inset;
 }
 function opticalLineX(ctx,x,line,size,lang,inset=pixelOpticalInset(ctx,line,size)){if(!line||/^\s/.test(line)||lang==='ja'&&jaOpeningPunctuation.test(line))return x;return x-inset;}
 function drawText(ctx,text,box,type,lang,subtitle=false,inkBounds=null,opticalAlign=false){
  const [x,y,w,h]=box, size=subtitle?type.subtitleSize:type.size, weight=subtitle?type.subtitleWeight:type.weight, lh=subtitle?type.subtitleLineHeight:type.lineHeight;
  const spacing=subtitle?0:size*(type.letterSpacing||0)/100, lines=text.replace(/\r/g,'').split('\n');
  ctx.font=`${weight} ${size}px ${FONT[lang]}`;ctx.fillStyle=type.color||'#ffffff';ctx.textBaseline='alphabetic';
  // Preserve shaping, kerning and combining marks for the entire line.
  ctx.fontKerning='normal';ctx.textRendering='geometricPrecision';
  if(!('letterSpacing' in ctx)&&spacing)throw Error('当前浏览器不支持精确字距，请使用新版 Chrome 或 Edge。');
  ctx.letterSpacing=spacing+'px';
  const lineLimit=subtitle?1:Math.min(2,Math.floor((h+.01)/lh));
  const invalid=!text.trim()||lines.length>lineLimit||lines.some(t=>textWidth(ctx,t,spacing)>w+.1);
  const coverage=window.BANNER_FONT_COVERAGE?.[lang+weight];
  if(!coverage)throw Error('无法校验模板字体，请刷新页面');
  const missing=[...new Set([...text].filter(c=>!/[\r\n]/.test(c)&&!coverage.some(([start,end])=>c.codePointAt(0)>=start&&c.codePointAt(0)<=end)))];
  const baselineOffset=subtitle?type.subtitleBaselineOffset:type.baselineOffset;
  if(!Number.isFinite(baselineOffset))throw Error('模板缺少已校准的文字基线。');
  // A Figma text line box controls layout, not a glyph mask. Ink may extend
  // outside it (especially at 29 px font size with 22.5 px line height).
  // Keep the fixed baseline and validate overflow; never silently cut glyphs.
  let inkOutside=false;
  lines.slice(0,lineLimit).forEach((line,index)=>{const baseline=y+index*lh+baselineOffset,m=ctx.measureText(line),precalibrated=opticalAlign==='precalibrated',measureVisible=opticalAlign===true||precalibrated,opticalInset=measureVisible?(precalibrated&&typeof document==='undefined'?0:pixelOpticalInset(ctx,line,size)):null,drawX=opticalAlign===true?opticalLineX(ctx,x,line,size,lang,opticalInset):x;
   if(inkBounds&&line.trim()){const [left,top,right,bottom]=inkBounds,visibleLeft=measureVisible?drawX+opticalInset:drawX-m.actualBoundingBoxLeft,leftTolerance=measureVisible?opticalLeftTolerance:.01;inkOutside ||= visibleLeft<left-leftTolerance||drawX+m.actualBoundingBoxRight>right+.01||baseline-m.actualBoundingBoxAscent<top-.01||baseline+m.actualBoundingBoxDescent>bottom+.01;}
   ctx.fillText(line,drawX,baseline);
  });
  if(missing.length)return '规范字体不支持字符：'+missing.join('')+'，请替换后导出';
  if(inkOutside)return (subtitle?'副标题':'标题')+'字形超出安全区，请调整文案';
  return invalid?(subtitle?'副标题':'标题')+(!text.trim()?'未填写':'超出固定文字区，请缩短文案或调整换行'):null;
 }
 function imageGeometry(key,adjustments=state.adjustments){
  const {slot,s}=settings(key),[w,h]=s.canvas,activeSource=sourceFor(slot),a=adjustment(key,adjustments),factor=Math.min(w/activeSource.naturalWidth,h/activeSource.naturalHeight)*(a.zoom/100),iw=activeSource.naturalWidth*factor,ih=activeSource.naturalHeight*factor;
  return {w,h,iw,ih,ix:w-iw+a.x*w/100,iy:(h-ih)/2+a.y*h/100};
 }
 function paint(canvas,key,guides=false,previewScale=null){
  const {slot,lang,s,variant,type,titleBox}=settings(key), [w,h]=s.canvas, scale=previewScale??s.scale;
  canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const activeSource=sourceFor(slot),background=backgroundFor(slot);
  if(state.backgroundEnabled){ctx.save();ctx.globalAlpha=(state.slotOpacities?.[slot]??100)/100;ctx.fillStyle=background;ctx.fillRect(0,0,w,h);ctx.restore();}
  const a=adjustment(key),{iw,ih,ix,iy}=imageGeometry(key),factor=iw/activeSource.naturalWidth;
  ctx.drawImage(activeSource,ix,iy,iw,ih);
  // The fill owns uncovered pixels. Blending is a single optional feather that
  // begins exactly where the image meets the fill; 0% must add no overlay.
  if(state.backgroundEnabled&&a.fade>0&&ix<w){const start=Math.max(0,ix),end=start+(w-start)*Math.min(100,a.fade)/100,g=ctx.createLinearGradient(start,0,end,0);g.addColorStop(0,background);g.addColorStop(1,background+'00');ctx.save();ctx.globalAlpha=(state.slotOpacities?.[slot]??100)/100;ctx.fillStyle=g;ctx.fillRect(start,0,end-start,h);ctx.restore();}
  if(slot==='web')drawBlocks(ctx);
  const issues=[];
  if(slot==='web'){
   // Actual text nodes in Figma, not the larger title safety zone.
   const pos=lang==='en'?{x:12.5,rows:[31.5,59.5]}:{x:13,rows:[33,60]};
   const titleRight=titleBox[0]+titleBox[2],lineWidth=titleRight-pos.x;
   const lines=state.copy[lang].title.replace(/\r/g,'').split('\n');
   if(lines.length!==2||lines.some(line=>!line.trim()))issues.push('Web 标题须保留两行，请调整换行');
   // These Web x coordinates already include the Figma optical compensation.
   for(let i=0;i<Math.min(2,lines.length);i++){const error=drawText(ctx,lines[i],[pos.x,pos.rows[i],lineWidth,23],type,lang,false,[titleBox[0],10,titleRight,h-s.bottomGuard],'precalibrated');if(error&&!issues.includes(error))issues.push(error);}
  }else{const appTitle=titleCopy(slot,lang,variant),lines=appTitle.replace(/\r/g,'').split('\n');if(variant.key==='primary'&&(lines.length!==2||lines.some(line=>!line.trim())))issues.push('App 双行标题须保留两行非空文案');if(variant.key==='secondary'&&(lines.length!==1||!lines[0].trim()))issues.push('App 主标题须为一行非空文案');const titleError=drawText(ctx,appTitle,titleBox,type,lang,false,[s.margin,s.margin,titleBox[0]+titleBox[2],h-s.bottomGuard],true);if(titleError)issues.push(titleError);}
  if(slot==='app'&&variant.subtitleBox){const e=drawText(ctx,state.copy[lang].subtitle,variant.subtitleBox,type,lang,true,[s.margin,s.margin,variant.subtitleBox[0]+variant.subtitleBox[2],h-s.bottomGuard],true);if(e)issues.push(e);}
  const hasVisual=Boolean(mediaFor(slot)?.image||state.image||state.imageName==='示例主视觉.png'),visualLeft=(variant.visualBox||s.visualBox)[0];
  if(!hasVisual)issues.push('尚未上传主视觉，请上传图片后再下载');
  const coverageIssue=hasVisual?imageCoverageIssue({w,h,visualLeft,ix,iy,iw,ih}):null;if(coverageIssue)issues.push(coverageIssue);
  const logoError=drawLogo(ctx,slot);if(logoError)issues.push(logoError);
  if(guides){ctx.save();ctx.lineWidth=.55;ctx.setLineDash([2,2]);ctx.strokeStyle='#74edff';ctx.strokeRect(...titleBox);if(variant.subtitleBox)ctx.strokeRect(...variant.subtitleBox);ctx.strokeStyle='#ffe28e';ctx.strokeRect(...(variant.visualBox||s.visualBox));ctx.strokeStyle='#ffffff88';ctx.strokeRect(s.margin,s.margin,w-s.margin*2,h-s.margin-(slot==='app'?s.bottomGuard:s.margin));ctx.restore();}
  const left=Math.max(0,ix),top=Math.max(0,iy),right=Math.min(w,ix+iw),bottom=Math.min(h,iy+ih),imageRect={x:left,y:top,width:Math.max(0,right-left),height:Math.max(0,bottom-top),canvasWidth:w,canvasHeight:h};
  return {issues,upscaled:hasVisual&&factor*s.scale>1.02,coverageIssue,imageRect};
 }

async function prepare(project,image){state=project;source=image;await prepareLogo(project.webLogo);}
function render(canvas,project,image,key,guides=false,density=4){state=project;source=image;slotSources={};return paint(canvas,key,guides,density);}
function geometry(project,image,key){state=project;source=image;slotSources={};return imageGeometry(key);}
return {render,prepare,geometry,loadImage,fontsReady,imagePalette,blockDefaults};
})();
