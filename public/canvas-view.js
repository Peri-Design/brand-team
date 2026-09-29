'use strict';
// Viewing state is intentionally separate from project data, history and PNG rendering.
(function(root){
 const MIN=.1,MAX=4,PAD=24;
 const limit=n=>Math.max(MIN,Math.min(MAX,Number.isFinite(n)?n:1));
 function fitScale(view,content,mode='all'){
  if(content.width<=0||content.height<=0)return 1;
  const x=Math.max(1,view.width-PAD*2)/content.width,y=Math.max(1,view.height-PAD*2)/content.height;
  return limit(mode==='fit'?x:Math.min(x,y));
 }
 function geometry(view,content,scale){
  const width=content.width*scale,height=content.height*scale;
  return {width:Math.max(view.width,width+PAD*2),height:Math.max(view.height,height+PAD*2),x:Math.max(PAD,(view.width-width)/2),y:Math.max(PAD,(view.height-height)/2)};
 }
 class CanvasView{
  constructor(onScaleChange=()=>{}){
   const $=s=>document.querySelector(s);
   this.viewport=$('#canvas-viewport');this.space=$('#canvas-space');this.scene=$('#results');
   this.input=$('#view-zoom');this.status=$('#view-status');this.minus=$('#view-zoom-out');this.plus=$('#view-zoom-in');
   this.presets={fit:$('#view-fit'),all:$('#view-all'),selected:$('#view-selected')};
   this.onScaleChange=onScaleChange;this.mode='fit';this.scale=1;this.origin={x:PAD,y:PAD};this.frame=0;
   this.hand=$('#view-hand');this.handMode=false;this.spaceHeld=false;this.pan=null;this.panPadding={x:0,y:0};this.pointerInside=false;this.suppressClick=false;
   this.hand.onclick=()=>{this.handMode=!this.handMode;this.finishPan();this.panCursor();};
   this.viewport.addEventListener('pointerenter',()=>{this.pointerInside=true;});
   this.viewport.addEventListener('pointerleave',()=>{this.pointerInside=false;});
   this.viewport.addEventListener('pointerdown',e=>{
    this.suppressClick=false;if(!this.wantsPan(e))return;
    e.preventDefault();e.stopImmediatePropagation();this.mode='manual';
    const anchor=this.anchor(),view=this.size();this.panPadding.x=Math.max(this.panPadding.x,view.width);this.panPadding.y=Math.max(this.panPadding.y,view.height);this.place(this.scale,anchor);
    this.pan={id:e.pointerId,x:e.clientX,y:e.clientY};this.suppressClick=true;
    this.viewport.focus({preventScroll:true});this.viewport.setPointerCapture(e.pointerId);this.panCursor();
   },true);
   this.viewport.addEventListener('pointermove',e=>{
    if(!this.pan||this.pan.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();
    const dx=e.clientX-this.pan.x,dy=e.clientY-this.pan.y;this.pan.x=e.clientX;this.pan.y=e.clientY;
    const v=this.viewport,x=v.scrollLeft-dx,y=v.scrollTop-dy;
    if(x<0||y<0||x>v.scrollWidth-v.clientWidth||y>v.scrollHeight-v.clientHeight){
     const anchor=this.anchor();this.panPadding.x+=Math.max(v.clientWidth,Math.abs(dx));this.panPadding.y+=Math.max(v.clientHeight,Math.abs(dy));this.place(this.scale,anchor);
    }
    v.scrollLeft-=dx;v.scrollTop-=dy;
   },true);
   for(const event of ['pointerup','pointercancel','lostpointercapture'])this.viewport.addEventListener(event,e=>{
    if(this.pan?.id!==e.pointerId)return;e.stopImmediatePropagation();this.finishPan();
   },true);
   this.viewport.addEventListener('click',e=>{if(this.suppressClick){e.preventDefault();e.stopImmediatePropagation();this.suppressClick=false;}},true);
   document.addEventListener('keydown',e=>{
    if(e.code!=='Space'||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||this.editable(e.target)||e.target.closest('button,a,summary'))return;
    if(!this.pointerInside&&!this.viewport.contains(document.activeElement))return;
    e.preventDefault();e.stopImmediatePropagation();this.spaceHeld=true;this.panCursor();
   },true);
   document.addEventListener('keyup',e=>{if(e.code==='Space'&&this.spaceHeld){e.preventDefault();this.spaceHeld=false;if(!this.handMode)this.finishPan();this.panCursor();}},true);
   const release=()=>{this.spaceHeld=false;this.pointerInside=false;this.finishPan();this.panCursor();};
   window.addEventListener('blur',release);document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
   this.minus.onclick=()=>this.zoom(this.scale/1.2);this.plus.onclick=()=>this.zoom(this.scale*1.2);
   const commitZoom=()=>{const value=this.input.valueAsNumber;if(Number.isFinite(value)&&value>0)this.zoom(value/100);else this.controls();};
   this.input.onchange=commitZoom;this.input.onblur=commitZoom;
   this.input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitZoom();this.input.blur();}else if(e.key==='Escape'){this.controls();this.input.blur();}};
   for(const [mode,button] of Object.entries(this.presets))button.onclick=()=>this.fit(mode);
   this.viewport.addEventListener('keydown',e=>{
    if(e.target!==this.viewport||e.ctrlKey||e.metaKey||e.altKey)return;
    if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')this.fit('fit');else this.zoom(this.scale*(e.key==='-'?1/1.2:1.2));}
   });
   this.viewport.addEventListener('wheel',e=>{
    if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();const rect=this.viewport.getBoundingClientRect();
    this.zoom(this.scale*Math.exp(-e.deltaY*.005),{x:e.clientX-rect.left,y:e.clientY-rect.top});
   },{passive:false});
   this.observer=new ResizeObserver(()=>this.refresh());this.observer.observe(this.viewport);this.observer.observe(this.scene);
   this.controls();
  }
  size(){return {width:this.viewport.clientWidth,height:this.viewport.clientHeight};}
  editable(target){return !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');}
  wantsPan(e){return e.button===0&&this.viewport.contains(e.target)&&!this.pan&&!this.editable(e.target)&&!e.target.closest('button,a,summary')&&(this.handMode||this.spaceHeld||!e.target.closest('.result-card'));}
  finishPan(){const id=this.pan?.id;this.pan=null;if(id!==undefined&&this.viewport.hasPointerCapture(id))this.viewport.releasePointerCapture(id);this.panCursor();}
  panCursor(){this.viewport.classList.toggle('hand-mode',this.handMode||this.spaceHeld);this.viewport.classList.toggle('is-panning',!!this.pan);this.hand.setAttribute('aria-pressed',String(this.handMode));}
  content(){return {width:this.scene.offsetWidth,height:this.scene.offsetHeight};}
  selected(){return this.scene.querySelector('.result-card.selected');}
  anchor(point){const view=this.size(),p=point||{x:view.width/2,y:view.height/2};return {worldX:(this.viewport.scrollLeft+p.x-this.origin.x)/this.scale,worldY:(this.viewport.scrollTop+p.y-this.origin.y)/this.scale,...p};}
  controls(){
   const hasCards=!!this.scene.querySelector('.result-card');
   this.input.value=String(Math.round(this.scale*1000)/10);this.input.disabled=!hasCards;
   this.minus.disabled=!hasCards||this.scale<=MIN;this.plus.disabled=!hasCards||this.scale>=MAX;
   for(const [mode,button] of Object.entries(this.presets)){button.disabled=!hasCards||(mode==='selected'&&!this.selected());button.setAttribute('aria-pressed',String(this.mode===mode));}
   this.status.textContent=({fit:'适应画布宽度 · 上下滚动浏览',all:'全部画板总览',selected:'选中画板居中显示',manual:'自由浏览 · 可横向、纵向滚动'})[this.mode]+' · 导出尺寸不变';
  }
  place(scale,anchor,target){
   const view=this.size();if(!view.width||!view.height)return;
   const previousScale=this.scale;this.scale=limit(scale);const g=geometry(view,this.content(),this.scale);
   g.x+=this.panPadding.x;g.y+=this.panPadding.y;g.width+=this.panPadding.x*2;g.height+=this.panPadding.y*2;this.origin=g;
   this.space.style.width=g.width+'px';this.space.style.height=g.height+'px';
   // Layout zoom keeps DOM text rasterized at the displayed size, unlike a composited transform.
   this.scene.style.zoom=this.scale;this.scene.style.left=(g.x/this.scale)+'px';this.scene.style.top=(g.y/this.scale)+'px';
   if(previousScale!==this.scale)this.onScaleChange(this.scale);
   if(target){this.viewport.scrollLeft=g.x+target.x*this.scale-view.width/2;this.viewport.scrollTop=g.y+target.y*this.scale-view.height/2;}
   else if(anchor){this.viewport.scrollLeft=g.x+anchor.worldX*this.scale-anchor.x;this.viewport.scrollTop=g.y+anchor.worldY*this.scale-anchor.y;}
   this.controls();
  }
  zoom(value,point){if(!this.scene.querySelector('.result-card'))return;const anchor=this.anchor(point);this.mode='manual';this.place(value,anchor);}
  fit(mode){
   const view=this.size();if(!view.width||!view.height)return;
   const selected=this.selected();if(mode==='selected'&&!selected)return;this.finishPan();this.panPadding={x:0,y:0};this.mode=mode;
   const box=mode==='selected'?{width:selected.offsetWidth,height:selected.offsetHeight}:this.content();
   const target=mode==='selected'?{x:selected.offsetLeft+box.width/2,y:selected.offsetTop+box.height/2}:{x:box.width/2,y:box.height/2};
   this.place(fitScale(view,box,mode),null,target);if(mode==='fit')this.viewport.scrollTop=0;
  }
  selectionChanged(){if(this.mode==='selected')this.fit('selected');else this.controls();}
  refresh(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>{
   if(!this.scene.querySelector('.result-card')){this.mode='fit';this.place(1);return;}
   if(this.mode==='selected'&&!this.selected())this.mode='fit';
   if(this.mode==='manual')this.place(this.scale,this.anchor());else this.fit(this.mode);
  });}
 }
 if(typeof module==='object'&&module.exports)module.exports={fitScale,geometry,limit};else root.CanvasView=CanvasView;
})(typeof window==='undefined'?{}:window);
