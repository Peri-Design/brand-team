'use strict';
(function(root){
 const SEEN_KEY='pixverse-studio-guide-v1-seen';
 const steps=[
  ['准备设计','添加需要的资源位和语言，再上传项目主视觉。也可以为某张物料单独换图；各语言文案独立填写。'],
  ['微调画面','点击“单张编辑”，图片居中、右侧设置独立滚动。拖动图片调整位置，拉动四角等比缩放；“预览”用于查看完整成品。'],
  ['保存与下载','修改会自动保存，请留意顶部保存状态。右侧可下载当前 PNG，顶部“下载”可多选打包；下载前会检查文字、漏边和清晰度。']
 ];
 function createState(storage){let step=0;return {get step(){return step;},seen(){try{return storage?.getItem(SEEN_KEY)==='1';}catch{return false;}},reset(){step=0;},move(delta){step=Math.max(0,Math.min(2,step+delta));},dismiss(){try{storage?.setItem(SEEN_KEY,'1');}catch{}}};}
 if(typeof module==='object'&&module.exports)module.exports={createState,SEEN_KEY};
 if(!root.document)return;
 const $=s=>document.querySelector(s),dialog=$('#guide-dialog');let storage,opener;
 try{storage=root.localStorage;}catch{}
 const state=createState(storage);
 function render(){const [title,text]=steps[state.step];$('#guide-progress').textContent=`第 ${state.step+1} 步，共 3 步`;$('#guide-content').replaceChildren();const h=document.createElement('h3'),p=document.createElement('p');h.textContent=title;p.textContent=text;$('#guide-content').append(h,p);$('#guide-back').hidden=state.step===0;$('#guide-next').textContent=state.step===2?'开始设计':'下一步';$('#guide-title').focus({preventScroll:true});}
 function open(){opener=document.activeElement;state.reset();dialog.showModal();render();}
 function close(){state.dismiss();dialog.close();}
 $('#guide-next').onclick=()=>{if(state.step===2)close();else{state.move(1);render();}};
 $('#guide-back').onclick=()=>{state.move(-1);render();};
 $('#guide-skip').onclick=close;$('#guide-close').onclick=close;
 $('#guide-restart').onclick=()=>{$('#scope-dialog').close();open();};
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('close',()=>{state.dismiss();if(opener?.isConnected)opener.focus({preventScroll:true});});
 root.MaterialGuide={auto(){if(!state.seen()&&!document.querySelector('dialog[open]'))open();}};
})(typeof window==='undefined'?globalThis:window);
