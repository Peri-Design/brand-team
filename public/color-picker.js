(function (root) {
 'use strict';
 const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
 function hexToHSV(hex, previousHue = 0) {
  const [r,g,b] = hex.replace('#','').match(/../g).map(n => parseInt(n,16)/255);
  const v = Math.max(r,g,b), d = v-Math.min(r,g,b);
  let h = previousHue;
  if (d) h = ((v===r ? (g-b)/d : v===g ? (b-r)/d+2 : (r-g)/d+4)*60+360)%360;
  return {h,s:v ? d/v*100 : 0,v:v*100};
 }
 function hsvToHex(h,s,v) {
  h = ((h%360)+360)%360; s=clamp(s,0,100)/100; v=clamp(v,0,100)/100;
  const c=v*s, x=c*(1-Math.abs(h/60%2-1)), m=v-c;
  const rgb = h<60 ? [c,x,0] : h<120 ? [x,c,0] : h<180 ? [0,c,x] : h<240 ? [0,x,c] : h<300 ? [x,0,c] : [c,0,x];
  return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('').toUpperCase();
 }
 function canvasColorAt(canvas,clientX,clientY) {
  const rect=canvas.getBoundingClientRect();
  if(!rect.width||!rect.height||!canvas.width||!canvas.height)throw Error('该画布尚未准备好。');
  const x=clamp(Math.floor((clientX-rect.left)*canvas.width/rect.width),0,canvas.width-1);
  const y=clamp(Math.floor((clientY-rect.top)*canvas.height/rect.height),0,canvas.height-1);
  const pixel=canvas.getContext('2d').getImageData(x,y,1,1).data;
  if(!pixel[3])throw Error('这里是透明区域，请选择图片或色块。');
  return '#'+[pixel[0],pixel[1],pixel[2]].map(n=>n.toString(16).padStart(2,'0')).join('').toUpperCase();
 }
 if (typeof module==='object' && module.exports) module.exports={hexToHSV,hsvToHex,canvasColorAt};
 if (!root.document) return;
 const doc=root.document, records=new Map();
 let active=null, hsv={h:0,s:0,v:100}, dragging=false, sampling=null, sampleAbort=null, swallowClick=false;
 const panel=doc.createElement('section');
 panel.id='brand-color-panel'; panel.className='brand-color-panel'; panel.hidden=true;
 panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','选择颜色');
 panel.innerHTML=`<div class="brand-color-heading"><strong>选择颜色</strong><button type="button" class="brand-color-close" aria-label="关闭选色面板"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
  <div class="brand-color-sv" role="group" aria-label="饱和度和亮度色板，点击或拖动选色，也可在下方输入数值"><span class="brand-color-point"></span></div>
  <div class="brand-color-hue-row"><button type="button" class="brand-color-eyedropper" aria-label="吸管取色" title="吸管取色"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M12 7l5 5M14 9l4-4a2 2 0 0 1 3 3l-4 4M13 10 4 19v2h2l9-9"/></svg></button><label class="brand-color-hue-label"><span class="brand-color-sr">色相</span><input class="brand-color-hue" type="range" min="0" max="360" step="1" aria-label="色相" value="0"></label></div>
  <div class="brand-color-alpha-wrap" hidden><label class="brand-color-alpha-label" for="brand-color-alpha"><span class="brand-color-alpha-title">不透明度</span><span><input class="brand-color-alpha-number" type="number" min="0" max="100" aria-label="不透明度百分比"> %</span></label><div class="brand-color-alpha-track"><input id="brand-color-alpha" type="range" min="10" max="100" aria-label="色块整层不透明度"></div></div>
  <div class="brand-color-values"><label class="brand-color-hex-label">HEX<input class="brand-color-hex" type="text" maxlength="7" spellcheck="false" autocomplete="off" aria-describedby="brand-color-error"></label><label>饱和度 %<input class="brand-color-s" type="number" min="0" max="100" step="1"></label><label>亮度 %<input class="brand-color-v" type="number" min="0" max="100" step="1"></label></div>
  <p id="brand-color-error" class="brand-color-error" role="alert" hidden></p>`;
 doc.body.append(panel);
 const sampleHint=doc.createElement('div');sampleHint.className='brand-color-sampling-hint';sampleHint.hidden=true;sampleHint.setAttribute('role','status');
 sampleHint.innerHTML='<span>点击画布吸取颜色 · Esc 取消</span><button type="button">取消取色</button>';doc.body.append(sampleHint);
 const samplePreview=doc.createElement('div');samplePreview.className='brand-color-sample-preview';samplePreview.hidden=true;samplePreview.setAttribute('aria-hidden','true');doc.body.append(samplePreview);
 function stopSampling(restore=false) {
  sampling=null;sampleAbort?.abort();sampleAbort=null;sampleHint.hidden=true;samplePreview.hidden=true;doc.body.classList.remove('brand-color-sampling');
  if(restore&&active&&active.input.isConnected){panel.hidden=false;position();$('.brand-color-eyedropper').focus();}
 }
 sampleHint.querySelector('button').addEventListener('click',()=>stopSampling(true));
 function startCanvasSampling(){sampling='canvas';panel.hidden=true;sampleHint.querySelector('span').textContent='点击画布吸取颜色 · Esc 取消';sampleHint.hidden=false;doc.body.classList.add('brand-color-sampling');}

 const $=selector=>panel.querySelector(selector), sv=$('.brand-color-sv'), hue=$('.brand-color-hue'), hex=$('.brand-color-hex'), saturation=$('.brand-color-s'), brightness=$('.brand-color-v'), alpha=$('#brand-color-alpha'), error=$('#brand-color-error');
 function updateSwatch(record) {
  record.button.style.setProperty('--picked-color',record.input.value);
  record.button.disabled=record.input.disabled;
  const name=record.input.getAttribute('aria-label') || doc.querySelector(`label[for="${record.input.id}"]`)?.textContent.trim() || '选择颜色';
  record.button.setAttribute('aria-label',`${name}，当前 ${record.input.value.toUpperCase()}`);
 }
 function draw() {
  const color=hsvToHex(hsv.h,hsv.s,hsv.v);
  sv.style.backgroundColor=hsvToHex(hsv.h,100,100);
  $('.brand-color-point').style.cssText=`left:${hsv.s}%;top:${100-hsv.v}%;background:${color}`;
  hue.value=hsv.h; hue.style.setProperty('--thumb-color',hsvToHex(hsv.h,100,100));
  hue.setAttribute('aria-valuetext',`${Math.round(hsv.h)} 度`);
  hex.value=color; saturation.value=Math.round(hsv.s); brightness.value=Math.round(hsv.v);
  hex.removeAttribute('aria-invalid'); error.hidden=true;
  if(active?.opacity || active?.input.dataset.colorOpacity!==undefined) {
   alpha.min=active.opacity?active.opacity.min:0; alpha.max=active.opacity?active.opacity.max:100; alpha.value=active.opacity?active.opacity.value:active.input.dataset.colorOpacity;
   alpha.style.setProperty('--thumb-color',color);
   $('.brand-color-alpha-track').style.setProperty('--alpha-color',color);
   $('.brand-color-alpha-number').value=alpha.value;$('.brand-color-alpha-number').min=alpha.min;
  }
 }
 function emitColor() {
  if(!active || !active.input.isConnected) {close(); return;}
  active.input.value=hsvToHex(hsv.h,hsv.s,hsv.v);active.color=active.input.value;
  active.input.dispatchEvent(new Event('input',{bubbles:true}));
  updateSwatch(active); draw();
 }
 function commit() { if(active) active.input.dispatchEvent(new Event('change',{bubbles:true})); }
 function close(restoreFocus=false) {
  if(!active) return;
  stopSampling();const button=active.button; commit(); button.setAttribute('aria-expanded','false');
  active=null; panel.hidden=true; dragging=false;
  if(restoreFocus && button.isConnected) button.focus();
 }
 function position() {
  if(!active) return;
  const rect=active.button.getBoundingClientRect(), width=panel.offsetWidth, height=panel.offsetHeight;
  const right=rect.right+10, left=right+width<=root.innerWidth-12 ? right : rect.left-width-10;
  panel.style.left=clamp(left,12,Math.max(12,root.innerWidth-width-12))+'px';
  const top=rect.top+height<=root.innerHeight-12 ? rect.top : rect.bottom-height;
  panel.style.top=clamp(top,12,Math.max(12,root.innerHeight-height-12))+'px';
 }
 function open(record) {
  if(active===record) {close(true); return;}
  close(); updateSwatch(record); active=record;
  record.opacity=record.input.dataset.opacityTarget?doc.querySelector(record.input.dataset.opacityTarget):record.input.closest('.block-layer')?.querySelector('input[type="range"]') || null;
  hsv=hexToHSV(record.input.value);record.color=record.input.value;panel.hidden=false;
  $('.brand-color-alpha-wrap').hidden=!record.opacity&&record.input.dataset.colorOpacity===undefined;
  $('.brand-color-alpha-title').textContent=record.opacity?'色块不透明度（整层）':'不透明度';
  $('.brand-color-eyedropper').title=doc.querySelector('canvas')?'从画布吸取颜色':'从屏幕吸取颜色';
  alpha.setAttribute('aria-label',record.opacity?'色块整层不透明度':'颜色不透明度');
  record.button.setAttribute('aria-expanded','true'); draw(); position(); hex.focus();
 }
 function refresh() {
  for(const [input,record] of records) {
   if(!input.isConnected) {if(active===record)close(); records.delete(input); continue;}
   updateSwatch(record);
  }
  doc.querySelectorAll('input[type="color"]').forEach(input=>{
   if(records.has(input))return;
   const button=doc.createElement('button');button.type='button';button.className='brand-color-trigger';
   button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',panel.id);
   const record={input,button};records.set(input,record);
   input.hidden=true;input.insertAdjacentElement('afterend',button);
   button.addEventListener('click',()=>open(record));updateSwatch(record);
  });
  if(active) {
   if(active.input.disabled || !active.button.getClientRects().length) close();
   else if(active.color!==active.input.value) {active.color=active.input.value;hsv=hexToHSV(active.input.value,hsv.h);draw();}
  }
 }
 function pickPoint(e) {
  const rect=sv.getBoundingClientRect();hsv.s=clamp((e.clientX-rect.left)/rect.width*100,0,100);hsv.v=100-clamp((e.clientY-rect.top)/rect.height*100,0,100);emitColor();
 }
 sv.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();dragging=true;sv.setPointerCapture(e.pointerId);pickPoint(e);});
 sv.addEventListener('pointermove',e=>{if(dragging)pickPoint(e);});
 sv.addEventListener('pointerup',e=>{if(!dragging)return;pickPoint(e);dragging=false;commit();});
 sv.addEventListener('pointercancel',()=>{dragging=false;commit();});
 hue.addEventListener('input',()=>{hsv.h=Number(hue.value);emitColor();});
 hue.addEventListener('change',commit);
 for(const [input,key] of [[saturation,'s'],[brightness,'v']]) {
  input.addEventListener('input',()=>{if(input.value===''||!input.validity.valid)return;hsv[key]=Number(input.value);emitColor();});
  input.addEventListener('change',()=>{draw();commit();});
 }
 hex.addEventListener('input',()=>{
  const value=hex.value.trim();if(!/^#?[0-9a-f]{6}$/i.test(value)) {hex.setAttribute('aria-invalid','true');error.textContent='请输入 6 位 HEX 色值，如 #A855F7。';error.hidden=false;return;}
  hsv=hexToHSV('#'+value.replace(/^#/,''),hsv.h);emitColor();
 });
 hex.addEventListener('change',()=>{if(hex.getAttribute('aria-invalid')!=='true')commit();});
 function emitOpacity(value){
  if(!active)return;const amount=clamp(Number(value),Number(alpha.min),100);
  if(active.opacity){active.opacity.value=amount;active.opacity.dispatchEvent(new Event('input',{bubbles:true}));}
  else{active.input.dataset.colorOpacity=amount;active.input.dispatchEvent(new CustomEvent('coloropacityinput',{bubbles:true,detail:{opacity:amount}}));}
  draw();
 }
 alpha.addEventListener('input',()=>emitOpacity(alpha.value));
 alpha.addEventListener('change',()=>{if(active?.opacity)active.opacity.dispatchEvent(new Event('change',{bubbles:true}));else commit();});
 $('.brand-color-alpha-number').addEventListener('input',e=>{if(e.target.value!==''&&e.target.validity.valid)emitOpacity(e.target.value);});
 $('.brand-color-alpha-number').addEventListener('change',()=>{draw();commit();});
 $('.brand-color-close').addEventListener('click',()=>close(true));
 $('.brand-color-eyedropper').addEventListener('click',async()=>{
  if(!active)return;
  if(doc.querySelector('canvas')||typeof root.EyeDropper!=='function'){startCanvasSampling();return;}
  const target=active;sampling='native';sampleAbort=new AbortController();panel.hidden=true;
  try {const result=await new root.EyeDropper().open({signal:sampleAbort.signal});if(active!==target || !active)return;stopSampling(true);hsv=hexToHSV(result.sRGBHex,hsv.h);emitColor();commit();}
  catch(e) {if(active!==target || !active)return;if(e.name==='AbortError')stopSampling(true);else{stopSampling();startCanvasSampling();}}
 });
 doc.addEventListener('pointerdown',e=>{
  if(sampling!=='canvas'||sampleHint.contains(e.target))return;
  e.preventDefault();e.stopImmediatePropagation();swallowClick=true;
  const canvas=e.target.closest('canvas');
  if(!canvas){sampleHint.querySelector('span').textContent='请在画布图片或色块上点击 · Esc 取消';return;}
  try {const color=canvasColorAt(canvas,e.clientX,e.clientY);stopSampling(true);hsv=hexToHSV(color,hsv.h);emitColor();commit();}
  catch(error){sampleHint.querySelector('span').textContent=error.name==='SecurityError'?'此图片无法读取颜色，请使用色板或 HEX。':error.message;}
 },true);
 doc.addEventListener('click',e=>{if(swallowClick){swallowClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
 doc.addEventListener('pointermove',e=>{
  if(sampling!=='canvas')return;
  const canvas=e.target.closest('canvas');samplePreview.hidden=!canvas;
  if(!canvas)return;
  try {const color=canvasColorAt(canvas,e.clientX,e.clientY);samplePreview.textContent=color;samplePreview.style.setProperty('--sample-color',color);samplePreview.style.left=clamp(e.clientX+18,8,root.innerWidth-120)+'px';samplePreview.style.top=clamp(e.clientY+18,8,root.innerHeight-42)+'px';}catch(_error){samplePreview.hidden=true;}
 },true);
 doc.addEventListener('pointerdown',e=>{if(active&&!sampling&&!panel.contains(e.target)&&!active.button.contains(e.target))close();},true);
 doc.addEventListener('keydown',e=>{if(!active)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(sampling)stopSampling(true);else close(true);}else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z')close();},true);
 doc.addEventListener('focusin',e=>{if(active&&!sampling&&!panel.contains(e.target)&&e.target!==active.button)close();});
 doc.addEventListener('scroll',e=>{if(active&&!sampling&&!panel.contains(e.target))close();},true);
 root.addEventListener('resize',()=>close());
 const hasColor=node=>node.nodeType===1&&(node.matches('input[type="color"]')||node.querySelector('input[type="color"]'));
 new MutationObserver(mutations=>{if(mutations.some(m=>m.type==='childList' ? [...m.addedNodes,...m.removedNodes].some(hasColor) : m.target.matches?.('input[type="color"]')))refresh();}).observe(doc.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
 root.BrandColorPicker={refresh,close};refresh();
})(typeof window==='undefined' ? globalThis : window);
