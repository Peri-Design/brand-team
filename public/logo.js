'use strict';
(() => {
 const defaults=()=>({kind:'none',image:null,name:''});
 function bounds(data,w,h){let left=w,top=h,right=-1,bottom=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}if(right<0)throw Error('Logo 完全透明，请选择可见的 Logo。');return {x:left,y:top,width:right-left+1,height:bottom-top+1};}
 function placement(spec,b){const height=spec.logoBox[3],width=height*b.width/b.height,right=spec.logoMargin?.right??spec.margin,top=spec.logoMargin?.top??spec.logoBox[1];if(width>spec.canvas[0]-spec.margin-right)throw Error('Logo 比例过宽，按规范高度放置后超出安全边距。');return {x:spec.canvas[0]-right-width,y:top,width,height};}
 function validate(s){if(!s||!['none','white','black','custom'].includes(s.kind)||typeof s.name!=='string'||s.name.length>255||!(s.image===null||(typeof s.image==='string'&&s.image.length<8000000&&/^data:image\/(png|webp|svg\+xml);base64,[a-zA-Z0-9+/=]+$/.test(s.image)))||(s.kind==='custom'&&!s.image))throw Error('Logo 工程参数不正确。');return s;}
 function checkSVG(xml){const doc=new DOMParser().parseFromString(xml,'image/svg+xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('SVG 文件无法解析。');for(const el of [doc.documentElement,...doc.documentElement.querySelectorAll('*')]){
  if(['script','foreignobject','image','feimage','style','animate','animatetransform','set'].includes(el.localName.toLowerCase()))throw Error('请使用已转曲、无嵌入图片或动态内容的 SVG Logo。');
  for(const a of el.attributes){const name=a.localName.toLowerCase(),value=a.value;if(name.startsWith('on')||((name==='href')&&!value.startsWith('#'))||(/url\s*\(/i.test(value)&&!/^(?:[^u]|u(?!rl\s*\())*url\(\s*['"]?#[\w:-]+['"]?\s*\)[^;]*$/i.test(value)))throw Error('SVG 含外部资源，请导出为独立的矢量 SVG。');}
 }if(/<!DOCTYPE|<!ENTITY/i.test(xml)||doc.querySelector('text'))throw Error('请将 SVG 中的文字转曲后再上传。');}
 const api={defaults,bounds,placement,validate,checkSVG};
 if(typeof module!=='undefined')module.exports=api;else window.BrandLogo=api;
})();
