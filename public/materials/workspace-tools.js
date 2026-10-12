'use strict';
(function(root){
 const MAX_FILE=40*1024*1024,MAX_PIXELS=50_000_000,HISTORY_BUDGET=96*1024*1024;
 function validateUpload(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('请选择 PNG、JPG 或 WebP 图片。');
  if(file.size>MAX_FILE)throw Error('图片不能超过 40 MB，请压缩后再上传。');
 }
 function validateDimensions(width,height){if(!(width>0&&height>0)||width*height>MAX_PIXELS)throw Error('图片不能超过 5000 万像素，请缩小后再上传。');}
 function imageURLs(state){return [state.image,...(state.items||[]).flatMap(m=>[m.image,m.webLogo?.image])].filter(Boolean);}
 function imageBytes(history){return [...new Set(history.flatMap(imageURLs))].reduce((n,url)=>n+url.length*2,0);}
 function trimHistory(history,budget=HISTORY_BUDGET){let removed=0;while(history.length>2&&(history.length>41||imageBytes(history)>budget)){history.shift();removed++;}return removed;}
 function previewDensity(scale,dpr){return Math.min(8,Math.max(4,Math.ceil(scale*dpr)));}
 function restorePaletteKind(material){return material.type==='web'&&material.webBlocks?.preset==='custom'?'fill':'all';}
 function createExportGate(){let busy=false;return {get busy(){return busy;},enter(){if(busy)return false;busy=true;return true;},leave(){busy=false;}};}
 const api={validateUpload,validateDimensions,imageURLs,imageBytes,trimHistory,previewDensity,restorePaletteKind,createExportGate};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.MaterialWorkspaceTools=api;
})(typeof window==='undefined'?globalThis:window);
