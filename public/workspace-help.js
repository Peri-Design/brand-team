(function(root){
 'use strict';
 const SEEN_KEY='pixverse-studio-guide-v1-seen';
 function createGuideState(storage){
  let seen=false,mode=null,step=0;
  try{seen=storage?.getItem(SEEN_KEY)==='1';}catch(_error){}
  return {
   get mode(){return mode;},get step(){return step;},get seen(){return seen;},
   auto(view){if(view!=='studio'||seen||mode)return false;mode='guide';step=0;return true;},
   help(){mode='help';step=0;},restart(){mode='guide';step=0;},
   move(delta){step=Math.min(2,Math.max(0,step+delta));},
   dismiss(){if(mode==='guide'){seen=true;try{storage?.setItem(SEEN_KEY,'1');}catch(_error){}}mode=null;}
  };
 }
 if(typeof module==='object'&&module.exports)module.exports={createGuideState,SEEN_KEY};
 if(!root.document)return;
 const doc=root.document,dialog=doc.querySelector('#workspace-help-dialog');
 if(!dialog)return;
 let storage;try{storage=root.localStorage;}catch(_error){}
 const state=createGuideState(storage),$=selector=>dialog.querySelector(selector);
 const guide=$('#workspace-guide'),help=$('#workspace-help-overview'),title=$('#workspace-help-title'),intro=$('#workspace-help-intro'),next=$('#workspace-guide-next'),back=$('#workspace-guide-back');
 let opener=null,pending=false;
 function render(){
  const isGuide=state.mode==='guide';
  guide.hidden=!isGuide;help.hidden=isGuide;
  title.textContent=isGuide?'三步开始设计':'使用帮助';
  intro.textContent=isGuide?'从准备素材到导出成品，先熟悉这三个步骤。':'按这三个步骤制作设计，随时回来查阅。';
  dialog.dataset.mode=state.mode;
  const panels=[...dialog.querySelectorAll('[data-guide-step]')];
  panels.forEach((panel,index)=>panel.hidden=index!==state.step);
  dialog.querySelectorAll('[data-guide-index]').forEach((item,index)=>{if(index===state.step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
  $('#workspace-guide-progress').textContent=`第 ${state.step+1} 步，共 3 步`;
  back.hidden=state.step===0;next.textContent=state.step===2?'开始设计':'下一步';
 }
 function focusHeading(){title.focus({preventScroll:true});}
 function open(){
  root.BrandColorPicker?.close();
  opener=doc.activeElement;render();if(!dialog.open)dialog.showModal();focusHeading();
 }
 function dismiss(){
  state.dismiss();if(dialog.open)dialog.close();
 }
 function onViewChange(view){
  if(view!=='studio'){if(dialog.open)dismiss();return;}
  if(pending||dialog.open)return;
  pending=true;root.requestAnimationFrame(()=>{
   pending=false;
   if(doc.body.dataset.view!=='studio'||doc.querySelector('dialog[open]'))return;
   if(state.auto('studio'))open();
  });
 }
 doc.querySelector('#workspace-help-open').addEventListener('click',()=>{if(doc.body.dataset.view!=='studio')return;state.help();open();});
 next.addEventListener('click',()=>{if(state.step===2)dismiss();else{state.move(1);render();focusHeading();}});
 back.addEventListener('click',()=>{state.move(-1);render();focusHeading();});
 $('#workspace-guide-skip').addEventListener('click',dismiss);
 $('#workspace-help-close').addEventListener('click',dismiss);
 $('#workspace-help-done').addEventListener('click',dismiss);
 $('#workspace-guide-restart').addEventListener('click',()=>{state.restart();render();focusHeading();});
 dialog.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
 dialog.addEventListener('close',()=>{state.dismiss();if(opener?.isConnected&&opener.getClientRects().length)opener.focus({preventScroll:true});else doc.querySelector('#workspace-help-open')?.focus({preventScroll:true});});
 // Help navigation never participates in the document's design-history shortcuts.
 dialog.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&['z','y','k'].includes(e.key.toLowerCase()))e.stopPropagation();});
 root.BrandWorkspaceHelp={onViewChange};
})(typeof window==='undefined'?globalThis:window);
