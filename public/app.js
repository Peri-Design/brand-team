'use strict';
(() => {
 const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
 const REV = '2026-09-28-v2', LEGACY_REVS = new Set(['2026-09-23-v1']), LANG = {zh:'中文',en:'English',ja:'日本語'}, SLOT = {web:'Web 首页 Banner',app:'App 首页 Banner'};
 const FONT = {zh:'BannerSC',en:'BannerEN',ja:'BannerJP'};
 const spec = window.BANNER_SPEC, blockSpec=window.WEB_BLOCK_SPEC, logoAPI=window.BrandLogo;
 const logoCache=new Map();let logoToken=0;
 function logoURL(config){return config.kind==='custom'?config.image:config.kind==='none'?null:`assets/PixVerse-${config.kind}.svg`;}
 async function prepareLogo(config){const url=logoURL(config);if(!url)return null;if(logoCache.has(url))return logoCache.get(url);
  if(url.startsWith('data:image/svg+xml'))logoAPI.checkSVG(new TextDecoder().decode(Uint8Array.from(atob(url.split(',')[1]),c=>c.charCodeAt(0))));
  const img=await loadImage(url);if(img.naturalWidth*img.naturalHeight>16000000)throw Error('Logo 像素过大，请控制在 1600 万像素内。');
  const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const measured=logoAPI.bounds(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);const b=config.kind==='custom'?measured:{x:0,y:0,width:img.naturalWidth,height:img.naturalHeight};const box=config.kind==='custom'?logoAPI.placement(spec.web,b):{x:spec.web.logoBox[0],y:spec.web.logoBox[1],width:spec.web.logoBox[2],height:spec.web.logoBox[3]};
  const item={image:img,bounds:b,box,lowResolution:!(url.startsWith('data:image/svg+xml;')||url.endsWith('.svg'))&&b.height<spec.web.logoBox[3]*spec.web.scale};logoCache.set(url,item);if(logoCache.size>5)logoCache.delete(logoCache.keys().next().value);return item;
 }
 function logoControls(){$('#web-logo').value=state.webLogo.kind;$('#web-logo option[value=custom]').disabled=!state.webLogo.image;const url=logoURL(state.webLogo);$('#logo-preview-wrap').hidden=!url;if(url)$('#logo-preview').src=url;else $('#logo-preview').removeAttribute('src');const item=url?logoCache.get(url):null;$('#logo-info').textContent=url?`${state.webLogo.kind==='custom'?state.webLogo.name:'官方 PixVerse 英文组合标'} · 仅同步 Web${item?.lowResolution?'；Logo 分辨率不足，建议上传高清或 SVG':''}`:'常规 App Banner 不放 Logo。';}
 function drawLogo(ctx,slot){if(slot!=='web'||state.webLogo.kind==='none')return null;const item=logoCache.get(logoURL(state.webLogo));if(!item)return 'Logo 尚未就绪，请重新选择或上传。';const b=item.bounds,r=item.box;ctx.drawImage(item.image,b.x,b.y,b.width,b.height,r.x,r.y,r.width,r.height);return null;}
 async function chooseLogo(kind){const token=++logoToken;const next={...state.webLogo,kind};if(kind==='custom'&&!next.image){$('#custom-logo-controls').hidden=false;$('#web-logo').value=state.webLogo.kind;toast('请先上传自定义 Logo。');return;}try{await prepareLogo(next);if(token!==logoToken)return;state.webLogo=next;logoControls();render();persist();}catch(e){logoControls();toast(e.message);}}
 async function uploadLogo(file){if(!file)return;if(file.size>5*1024*1024||!['image/png','image/webp','image/svg+xml'].includes(file.type))return toast('请选择 5 MB 内的 PNG、WebP 或 SVG Logo。');const token=++logoToken;try{const next={kind:'custom',name:file.name,image:await dataURL(file)};await prepareLogo(next);if(token!==logoToken)return;state.webLogo=next;logoControls();render();persist();toast('Logo 已同步至 Web 预览；位置和高度按规范锁定。');}catch(e){toast(e.message);}}

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
  if(includeBase){const layer=blockSpec.baseGradient;paintLayer(layer,{colors:['#ffffff',state.background],opacity:100});}
  blockSpec.layers.forEach((layer,i)=>paintLayer(layer,state.webBlocks.layers[i]));
 }
 function imagePalette(img=source){
  const scale=Math.min(1,256/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return window.BannerPalette.fromPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height,'#FFFFFF');
 }
 function applyPalette(palette,target='both'){
  if(!palette)return false;
  if(target!=='blocks')state.background=palette.background;
  if(target!=='background')state.webBlocks={...state.webBlocks,preset:'auto',layers:state.webBlocks.layers.map((layer,i)=>({...layer,colors:[...palette.layers[i]]}))};
  return true;
 }
 function matchPalette(target){
  try{const palette=imagePalette(target==='blocks'?sourceFor('web'):source);if(!applyPalette(palette,target)){toast('未找到可取色的非透明区域，请手动选色。');blockControls();return;}
   backgroundControls();blockControls();render();persist();toast(target==='background'?'已从主视觉左侧取色，可继续手动微调。':'Web 色块已按主视觉配色，形状与透明度保持不变。');
  }catch(e){blockControls();toast('自动取色失败，请手动选色。');}
 }
 function blockControls(){const root=$('#block-controls');root.replaceChildren();$('#block-preset').value=state.webBlocks.preset;
  state.webBlocks.layers.forEach((layer,i)=>{const group=document.createElement('div');group.className='block-layer';group.innerHTML=`<h3>${i+1} · ${blockSpec.layers[i].name}</h3><div class="block-stops"></div><label class="range-label" for="block-opacity-${i}">色块不透明度 <output id="block-opacity-value-${i}">${layer.opacity}%</output></label><input id="block-opacity-${i}" aria-label="色块 ${i+1} 不透明度" type="range" min="10" max="100" value="${layer.opacity}">`;root.append(group);
   layer.colors.forEach((color,j)=>{const label=document.createElement('label');label.className='block-stop';label.textContent=['起始色','中间色','结束色'][j];const picker=document.createElement('input');picker.type='color';picker.value=color;picker.setAttribute('aria-label',`色块 ${i+1} ${label.textContent}`);const hex=document.createElement('input');hex.type='text';hex.value=color;hex.maxLength=7;hex.setAttribute('aria-label',`色块 ${i+1} ${label.textContent} HEX`);label.append(picker,hex);group.querySelector('.block-stops').append(label);
    const apply=value=>{state.webBlocks.layers[i].colors[j]=value;state.webBlocks.preset='custom';$('#block-preset').value='custom';render();persist();};picker.oninput=()=>{hex.value=picker.value;hex.removeAttribute('aria-invalid');apply(picker.value);};hex.oninput=()=>{const valid=/^#[0-9a-f]{6}$/i.test(hex.value);hex.setAttribute('aria-invalid',String(!valid));if(valid){picker.value=hex.value;apply(hex.value);}};hex.onblur=()=>{hex.value=state.webBlocks.layers[i].colors[j];hex.removeAttribute('aria-invalid');};
   });group.querySelector('input[type=range]').oninput=e=>{layer.opacity=Number(e.target.value);$('#block-opacity-value-'+i).textContent=layer.opacity+'%';state.webBlocks.preset='custom';$('#block-preset').value='custom';render();persist();};
  });
 }
 const initial = () => ({version:1,templateVersion:REV,name:'礼盒活动 · 延展测试',image:null,imageName:'礼盒主视觉.png',slotMedia:{web:null,app:null},webBlocks:blockDefaults(),webLogo:logoAPI.defaults(),background:'#3022bb',backgroundEnabled:false,slots:['web','app'],languages:['zh','en'],variant:'primary',copy:{zh:{title:'创作好礼\n即刻开启',appSecondaryTitle:'创作好礼即刻开启',subtitle:'开启你的创作灵感'},en:{title:'GIFT YOUR\nCREATIVITY',appSecondaryTitle:'GIFT YOUR CREATIVITY',subtitle:'Create something extraordinary'},ja:{title:'創作のギフト\n今すぐ体験',appSecondaryTitle:'創作のギフト今すぐ体験',subtitle:'新しい創作の可能性を'}},outputs:['web:zh','web:en','app:zh','app:en'],adjustments:{},selected:'web:zh'});
 let state = initial(), source, slotSources={web:null,app:null}, editingLang='zh', ready=false, db, timer, toastTimer, loadToken=0, saveQueue=Promise.resolve(), draftRevision=0;
 let localSaveState='loading',cloudSession={configured:false,user:null},cloudProjects=[],cloudProjectId=null,cloudRevision=null,cloudSaveState='idle',cloudSaveTimer=null,cloudQueue=Promise.resolve(),cloudConflict=false;
 let history,historyBusy=false,editGroup=null,gestureTarget=null;
 const canvases=new Map(), errors=new Map();
 let previewFrame=0,exportBusy=false,batchMode=false,batchReference=null,downloadMode=false;
 const batchKeys=new Set(),downloadKeys=new Set();
 const canvasView=new window.CanvasView(()=>{cancelAnimationFrame(previewFrame);previewFrame=requestAnimationFrame(()=>render());});
 function previewDensity(){return Math.min(8,Math.max(4,Math.ceil(canvasView.scale*(window.devicePixelRatio||1))));}
 function historyButtons(){$('#undo').disabled=!history?.canUndo||historyBusy;$('#redo').disabled=!history?.canRedo||historyBusy;}
 async function travel(delta){if(!history||historyBusy)return;const next=history.peek(delta);if(!next)return;historyBusy=true;++loadToken;++logoToken;historyButtons();for(const id of ['studio','draft'])$('#'+id).inert=true;
  try{const img=next.image===state.image?source:await loadImage(next.image||'assets/demo.png'),nextSlotSources=await loadSlotSources(next);await prepareLogo(next.webLogo);history.move(delta);state=next;source=img;slotSources=nextSlotSources;editGroup=null;hydrate();persist(false);toast(delta<0?'已撤销上一步':'已重做');}catch(e){toast('无法恢复：'+e.message);}finally{historyBusy=false;for(const id of ['studio','draft'])$('#'+id).inert=false;historyButtons();}
 }
 document.addEventListener('input',e=>{const t=e.target;editGroup=(t.id||t.getAttribute('aria-label')||t.name)+':'+editingLang;},true);
 document.addEventListener('change',()=>{history?.breakGroup();editGroup=null;},true);
 document.addEventListener('focusout',()=>{history?.breakGroup();editGroup=null;},true);
 document.addEventListener('pointerdown',e=>{if(canvasView.wantsPan(e))return;if(e.target.matches('input[type=range],canvas')){gestureTarget=e.target;history?.breakGroup();editGroup=null;}else if(e.target.closest('button')){history?.breakGroup();editGroup=null;}},true);
 document.addEventListener('pointerup',()=>{gestureTarget=null;history?.breakGroup();editGroup=null;});
 document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&!e.altKey&&!e.isComposing){const k=e.key.toLowerCase();if(k==='z'||(k==='y'&&e.ctrlKey)){e.preventDefault();travel(e.shiftKey||k==='y'?1:-1);}}});
 $('#undo').onclick=()=>travel(-1);$('#redo').onclick=()=>travel(1);
 function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
 function adjustment(key,adjustments=state.adjustments){return adjustments[key] || {zoom:100,x:0,y:0,fade:48,shade:'custom'};}
 function textStyle(key){const a=adjustment(key);return {mode:a.textColorMode==='custom'?'custom':'white',color:a.textColor||'#FFFFFF'};}
 function slotOf(key){return key?.split(':')[0]||null;}
 function mediaFor(slot){return state.slotMedia?.[slot]||null;}
 function sourceFor(slot){return (typeof slotSources!=='undefined'&&slotSources?.[slot])||source;}
 function backgroundFor(slot){return mediaFor(slot)?.background||state.background;}
 async function loadSlotSources(project){const result={web:null,app:null};for(const slot of ['web','app'])if(project.slotMedia?.[slot]?.image)result[slot]=await loadImage(project.slotMedia[slot].image);return result;}
 function resetSlotComposition(slot){for(const lang of Object.keys(LANG)){const key=`${slot}:${lang}`;state.adjustments[key]={...adjustment(key),zoom:100,x:0,y:0};}}
 function syncComposition(sourceKey,targetKeys,includeFade=false,adjustments=state.adjustments,includeTextColor=false){
  const sourceAdjustment=adjustment(sourceKey,adjustments),slot=slotOf(sourceKey),patch={zoom:sourceAdjustment.zoom,x:sourceAdjustment.x,y:sourceAdjustment.y};
  if(includeFade)patch.fade=sourceAdjustment.fade;
  if(includeTextColor){patch.textColorMode=sourceAdjustment.textColorMode==='custom'?'custom':'white';patch.textColor=sourceAdjustment.textColor||'#FFFFFF';}
  const affected=[];
  for(const key of targetKeys){if(slotOf(key)!==slot)continue;adjustments[key]={...adjustment(key,adjustments),...patch};affected.push(key);}
  return affected;
 }
 function resetBatchSelection(){batchMode=false;batchReference=null;batchKeys.clear();}
 function resetDownloadSelection(){downloadMode=false;downloadKeys.clear();}
 function sanitizeBatchSelection(){
  if(!batchMode)return;
  const slot=slotOf(batchReference);for(const key of [...batchKeys])if(!state.outputs.includes(key)||slotOf(key)!==slot)batchKeys.delete(key);
  if(!batchReference||!state.outputs.includes(batchReference)||!batchKeys.has(batchReference))batchReference=[...batchKeys][0]||null;
  if(!batchReference)resetBatchSelection();
 }
 function sanitizeDownloadSelection(){if(!downloadMode)return;for(const key of [...downloadKeys])if(!state.outputs.includes(key))downloadKeys.delete(key);}
 function batchTargets(prop){
  if(!batchMode||!batchReference)return state.selected?[state.selected]:[];
  if(prop==='fade'&&!$('#batch-sync-fade').checked)return [batchReference];
  return [...batchKeys].filter(key=>slotOf(key)===slotOf(batchReference));
 }
 function setBatchReference(key){
  if(!batchMode)return false;
  const slot=slotOf(batchReference||key);if(!state.outputs.includes(key)||slotOf(key)!==slot){toast('批量调整只能选择相同资源位。');return false;}
  batchKeys.add(key);batchReference=key;state.selected=key;updateBatchUI();inspector();textColorControls();canvasView.selectionChanged();persist(false);return true;
 }
 function toggleBatchKey(key,checked){
  if(!batchMode)return;
  if(slotOf(key)!==slotOf(batchReference)){toast('批量调整只能选择相同资源位。');updateBatchUI();return;}
  if(checked)batchKeys.add(key);else if(batchKeys.size===1){toast('至少保留一张图片。');}else{batchKeys.delete(key);if(batchReference===key){batchReference=[...batchKeys][0];state.selected=batchReference;}}
  updateBatchUI();inspector();
 }
 function enterBatch(){
  const key=state.selected&&state.outputs.includes(state.selected)?state.selected:state.outputs[0];if(!key)return toast('请先生成设计预览。');
  resetDownloadSelection();batchMode=true;batchReference=key;batchKeys.clear();batchKeys.add(key);state.selected=key;setInspectorOpen(true);render();toast(`已进入 ${SLOT[slotOf(key)]} 批量调整，请勾选同资源位图片。`);
 }
 function exitBatch(){resetBatchSelection();render();toast('已退出批量调整，可继续单独调整。');}
 function enterDownload(){if(!state.outputs.length)return toast('请先生成设计预览。');resetBatchSelection();downloadMode=true;downloadKeys.clear();state.outputs.forEach(key=>downloadKeys.add(key));setInspectorOpen(true);render();toast('已进入选择下载；默认全选，可跨资源位和语言取消勾选。');}
 function exitDownload(notify=true){resetDownloadSelection();render();if(notify)toast('已退出选择下载。');}
 function toggleDownloadKey(key,checked){if(!downloadMode||!state.outputs.includes(key))return;if(checked)downloadKeys.add(key);else downloadKeys.delete(key);updateBatchUI();inspector();updateExport();}
 function toggleCardSelection(key,checked){if(downloadMode)return toggleDownloadKey(key,checked);toggleBatchKey(key,checked);}
 function updateBatchUI(){
  sanitizeBatchSelection();sanitizeDownloadSelection();const root=$('#results'),toggle=$('#batch-toggle'),downloadToggle=$('#download-toggle'),controls=$('#batch-controls'),downloadControls=$('#download-controls');root.classList.toggle('batch-mode',batchMode);root.classList.toggle('download-mode',downloadMode);toggle.setAttribute('aria-pressed',String(batchMode));toggle.textContent=batchMode?'退出批量':'批量调整';downloadToggle.setAttribute('aria-pressed',String(downloadMode));downloadToggle.innerHTML=downloadMode?'<svg><use href="#i-download"/></svg>退出选择下载':'<svg><use href="#i-download"/></svg>选择下载';controls.hidden=!batchMode;downloadControls.hidden=!downloadMode;$('#adjust-panel').classList.toggle('download-mode',downloadMode);
  $('#inspector-title').textContent=downloadMode?'选择下载':batchMode?'批量调整':'单张调整';$('#adjust-scope-label').textContent=downloadMode?'只选择下载范围，不修改参数':batchMode?'缩放与位置同资源位联动':'主视觉与母版保持关联';$('#reset-crop').textContent=batchMode?'恢复所选图片自动适配':'恢复自动适配';
  if(batchMode){const lang=batchReference?LANG[batchReference.split(':')[1]]:'';$('#batch-summary').textContent=`已选择 ${SLOT[slotOf(batchReference)]} ${batchKeys.size} 张 · 基准：${lang}`;$('#sync-composition').disabled=batchKeys.size<2;}
  if(downloadMode)$('#download-summary').textContent=`已选择 ${downloadKeys.size} 张 · 可跨资源位`;
  for(const [key,canvas] of canvases){const card=canvas.closest('article'),compatible=!batchMode||slotOf(key)===slotOf(batchReference),selected=downloadMode?downloadKeys.has(key):batchKeys.has(key);card.classList.toggle('selected',!downloadMode&&key===state.selected);card.classList.toggle('batch-selected',batchMode&&selected);card.classList.toggle('download-selected',downloadMode&&selected);card.classList.toggle('batch-reference',batchMode&&key===batchReference);card.classList.toggle('batch-incompatible',batchMode&&!compatible);const checkbox=card.querySelector('.batch-select');if(checkbox){checkbox.checked=selected;checkbox.disabled=batchMode&&!compatible;}}
 }
 function settings(key){const [slot,lang]=key.split(':');const s=spec[slot], variant=s.variants.find(v=>v.key===(slot==='app'?state.variant:'primary')),templateType=variant.languages.find(l=>l.key===lang),text=textStyle(key);const type={...templateType,color:text.mode==='custom'?text.color:'#FFFFFF'};return {slot,lang,s,variant,type,titleBox:variant.titleBox||s.titleBox};}
 function titleCopy(slot,lang,variant){return slot==='app'&&variant.key==='secondary'?state.copy[lang].appSecondaryTitle:state.copy[lang].title;}
 function backgroundControls(){
  $('#background-enabled').checked=state.backgroundEnabled;
  $('#background').value=state.background;$('#background').disabled=!state.backgroundEnabled;
  $('#background-status').textContent=state.backgroundEnabled?'已开启':'已关闭';
  $('#fade').disabled=!state.backgroundEnabled;$('#fade-hint').hidden=state.backgroundEnabled;
 }
 function textColorControls(){
  const key=state.selected&&state.outputs.includes(state.selected)?state.selected:null,text=key?textStyle(key):{mode:'white',color:'#FFFFFF'};
  $('#text-color-mode').disabled=!key;$('#text-color-mode').value=text.mode;
  $('#custom-text-color').hidden=!key||text.mode!=='custom';
  $('#text-color-picker').value=text.color;
  $('#text-color-hex').value=text.color;
  $('#text-color-hint').textContent=key?`仅应用于当前选中的 ${SLOT[slotOf(key)]} · ${LANG[key.split(':')[1]]}，主副标题使用同一颜色，随工程保存。`:'请先选择一张设计。';
  $('#text-color-hex').removeAttribute('aria-invalid');$('#text-color-error').hidden=true;
 }
 function copyControls(){
  const secondary=state.variant==='secondary',hasWeb=state.slots.includes('web'),hasApp=state.slots.includes('app');
  $('#shared-title-field').hidden=secondary&&!hasWeb;$('#subtitle-field').hidden=!secondary||!hasApp;
  $('#shared-title-label').textContent=secondary?'Web 标题':hasWeb&&hasApp?'Web / App 双行标题':hasWeb?'Web 标题':'App 双行标题';
  $('#shared-title-hint').textContent='固定两行';
  $('#copy-mode-note span').textContent=secondary?'不同版式分别保存 · 同语言内语义保持一致':'位置与字号固定 · Web 与 App 同步';
 }
 function slotImageControls(key){
  const root=$('#slot-image-controls');root.hidden=batchMode||!key;if(root.hidden)return;
  const slot=slotOf(key),media=mediaFor(slot),label=SLOT[slot];$('#slot-image-title').textContent=`${label} 图片`;$('#slot-image-mode').textContent=media?'自定义':'使用母版';
  $('#slot-image-status').textContent=media?`${media.name} · 同步至${label}的中文、English、日本語，不影响${slot==='web'?' App':' Web'}。`:`当前使用母版图 ${state.imageName}。替换后只影响${label}的所有语言。`;
  $('#replace-slot-image').textContent=`替换${label}图片`;$('#reset-slot-image').hidden=!media;$('#slot-palette-controls').hidden=!media;if(media)$('#slot-background').value=media.background;
 }
 function applyTextColor(value,fromHex=false){
  const hex=value.trim(),valid=/^#?[0-9a-f]{6}$/i.test(hex);
  $('#text-color-hex').setAttribute('aria-invalid',String(!valid));$('#text-color-error').hidden=valid;
  if(!valid)return;
  const key=state.selected;if(!key)return;const color='#'+hex.replace(/^#/,'').toUpperCase();state.adjustments[key]={...adjustment(key),textColor:color,textColorMode:'custom'};
  $('#text-color-mode').value='custom';$('#custom-text-color').hidden=false;
  $('#text-color-picker').value=color;if(!fromHex)$('#text-color-hex').value=color;
  render();persist();
 }
 function loadImage(url){return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('图片无法读取，请使用 PNG、JPG 或 WebP。'));i.src=url;});}
 function sourceURL(){return state.image||'assets/demo.png';}
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
 function paint(canvas,key,guides=false,previewScale=null){
  const {slot,lang,s,variant,type,titleBox}=settings(key), [w,h]=s.canvas, scale=previewScale??s.scale;
  canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);const ctx=canvas.getContext('2d');ctx.scale(scale,scale);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  const activeSource=sourceFor(slot),background=backgroundFor(slot);
  if(state.backgroundEnabled){ctx.fillStyle=background;ctx.fillRect(0,0,w,h);}
  const a=adjustment(key), factor=Math.min(w/activeSource.naturalWidth,h/activeSource.naturalHeight)*(a.zoom/100);
  const iw=activeSource.naturalWidth*factor,ih=activeSource.naturalHeight*factor,ix=w-iw+a.x*w/100,iy=(h-ih)/2+a.y*h/100;
  ctx.drawImage(activeSource,ix,iy,iw,ih);
  // Feather only the source boundary and the copy area; the right-hand subject uses source pixels.
  if(state.backgroundEnabled&&ix>0&&ix<w){const seam=ctx.createLinearGradient(ix,0,Math.min(w,ix+w*.13),0);seam.addColorStop(0,background);seam.addColorStop(1,background+'00');ctx.fillStyle=seam;ctx.fillRect(ix,0,w-ix,h);}
  if(state.backgroundEnabled&&a.fade>0){const end=w*a.fade/100;const g=ctx.createLinearGradient(0,0,end,0);g.addColorStop(0,background);g.addColorStop(.45,background+'ee');g.addColorStop(1,background+'00');ctx.fillStyle=g;ctx.fillRect(0,0,end,h);}
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
  const logoError=drawLogo(ctx,slot);if(logoError)issues.push(logoError);
  if(guides){ctx.save();ctx.lineWidth=.55;ctx.setLineDash([2,2]);ctx.strokeStyle='#74edff';ctx.strokeRect(...titleBox);if(variant.subtitleBox)ctx.strokeRect(...variant.subtitleBox);ctx.strokeStyle='#ffe28e';ctx.strokeRect(...(variant.visualBox||s.visualBox));ctx.strokeStyle='#ffffff88';ctx.strokeRect(s.margin,s.margin,w-s.margin*2,h-s.margin-(slot==='app'?s.bottomGuard:s.margin));ctx.restore();}
  return {issues,upscaled:factor*s.scale>1.02};
 }
 function render(){if(!ready)return;for(const [key,c] of canvases){const result=paint(c,key,$('#show-guides').checked,previewDensity());errors.set(key,result);const card=c.closest('article');card.querySelector('.card-warning').textContent=result.issues.join('；')||(result.upscaled?'原图分辨率不足，导出可能不够清晰':'');card.querySelector('.card-warning').hidden=!result.issues.length&&!result.upscaled;card.classList.toggle('selected',key===state.selected);}updateBatchUI();inspector();updateExport();}
 function selectedExportKeys(){if(downloadMode)return state.outputs.filter(key=>downloadKeys.has(key));return state.selected?[state.selected]:[];}
 function updateExport(){const n=state.outputs.length,keys=selectedExportKeys();$('#result-count').textContent=n;$('#download-toggle').disabled=exportBusy||!ready||!n;const label=downloadMode?(keys.length===0?'请先选择图片':keys.length===1?'下载所选 1 张 PNG':`下载所选 ${keys.length} 张（ZIP）`):'下载这张 PNG',button=$('#export-one');button.innerHTML=`<svg><use href="#i-download"/></svg>${label}`;button.disabled=exportBusy||!keys.length||keys.some(key=>errors.get(key)?.issues.length);}
 function select(key,openPanel=false){if(downloadMode){if(openPanel){exitDownload(false);setInspectorOpen(true);}else return toggleDownloadKey(key,!downloadKeys.has(key));}if(batchMode){if(openPanel){exitBatch();setInspectorOpen(true);}else return setBatchReference(key);}const changed=state.selected!==key;if(openPanel)setInspectorOpen(true);state.selected=key;for(const [k,c] of canvases)c.closest('article').classList.toggle('selected',k===key);inspector();textColorControls();if(changed)canvasView.selectionChanged();persist(false);}
 function inspector(){const key=batchMode?batchReference:state.selected;$('#inspector-empty').hidden=!!key;$('#inspector-body').hidden=!key;slotImageControls(key);if(!key)return;const {slot,lang,s}=settings(key),a=adjustment(key);$('#selected-name').textContent=downloadMode?`已选择 ${downloadKeys.size} 张设计`:`${SLOT[slot]} · ${LANG[lang]}${batchMode?' · 基准':''}`;$('#selected-size').textContent=downloadMode?'可跨 Web、App 和语言下载；不会改变构图。':`${s.canvas[0]*s.scale} × ${s.canvas[1]*s.scale} px · PNG${slot==='web'?' · 规范 2026-09-28 v2':''}`;
  for(const [id,prop,unit] of [['zoom','zoom','%'],['pan-x','x',''],['pan-y','y',''],['fade','fade','%']]){$('#'+id).value=a[prop];$('#'+id+'-value').textContent=a[prop]+unit;}
  const {issues,upscaled}=paint($('#detail-canvas'),key,false);$('#detail-canvas').setAttribute('aria-label','选中图片预览');$('#checks').textContent=issues.length?issues.join('；'):(upscaled?'原图像素不足，建议换用更大图片。':'已检查尺寸与文案边界；构图请人工确认。');$('#checks').classList.toggle('bad',issues.length>0||upscaled);updateExport();
 }
 function cards(){const root=$('#results');root.replaceChildren();canvases.clear();errors.clear();
  // Derive the grid from generated outputs, not pending checkbox changes.
  const languages=Object.keys(LANG).filter(lang=>state.outputs.some(key=>key.endsWith(':'+lang)));
  const slots=Object.keys(SLOT).filter(slot=>state.outputs.some(key=>key.startsWith(slot+':')));
  const ordered=slots.flatMap(slot=>languages.map(lang=>slot+':'+lang).filter(key=>state.outputs.includes(key)));
  root.style.setProperty('--language-columns',Math.max(1,languages.length));
  if(!state.outputs.length){const p=document.createElement('div');p.className='empty';p.textContent='选择资源位和语言，再点击「更新设计预览」。';root.append(p);}
  for(const key of ordered){const {slot,lang,s}=settings(key),customMedia=!!mediaFor(slot);const article=document.createElement('article');article.className='result-card';article.style.gridRow=slots.indexOf(slot)+1;article.style.gridColumn=languages.indexOf(lang)+1;article.dataset.key=key;article.style.width=(s.canvas[0]+26)+'px';article.innerHTML=`<div class="card-head"><strong>${SLOT[slot]}</strong><div class="card-head-side"><span class="batch-reference-badge">基准</span><label class="batch-card-select"><input class="batch-select" type="checkbox" aria-label="选择 ${SLOT[slot]} ${LANG[lang]}"><span>选择</span></label>${customMedia?'<span class="slot-image-badge">独立图片</span>':''}<span class="language-badge">${LANG[lang]}</span></div></div><div class="canvas-wrap"><canvas tabindex="0" role="button" aria-label="调整 ${SLOT[slot]} ${LANG[lang]} 图片"></canvas></div><div class="card-foot"><span>${s.canvas[0]*4} × ${s.canvas[1]*4} px</span><div class="card-actions"><button class="view-card" aria-label="放大查看 ${SLOT[slot]} ${LANG[lang]}">放大查看</button><button class="adjust-card">单独调整</button></div></div><p class="card-warning" hidden></p>`;root.append(article);const canvas=article.querySelector('canvas');canvases.set(key,canvas);article.querySelector('.batch-select').onchange=e=>toggleCardSelection(key,e.target.checked);article.querySelector('.adjust-card').onclick=()=>select(key,true);article.querySelector('.view-card').onclick=()=>{if(downloadMode){state.selected=key;canvasView.selectionChanged();return canvasView.fit('selected');}if(!batchMode||setBatchReference(key)!==false)canvasView.fit('selected');};canvas.onclick=()=>select(key);canvas.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(key,true);}};let drag;
   canvas.onpointerdown=e=>{if(downloadMode)return;if(batchMode&&!setBatchReference(key))return;if(!batchMode)select(key);const targets=batchTargets('x'),initials=new Map(targets.map(target=>[target,{...adjustment(target)}]));drag={x:e.clientX,y:e.clientY,targets,initials};canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;const box=canvas.getBoundingClientRect(),referenceInitial=drag.initials.get(key)||adjustment(key),nextX=clamp(referenceInitial.x+(e.clientX-drag.x)/box.width*100,-50,50),nextY=clamp(referenceInitial.y+(e.clientY-drag.y)/box.height*100,-50,50);for(const target of drag.targets)state.adjustments[target]={...adjustment(target),x:nextX,y:nextY};render();};canvas.onpointerup=canvas.onpointercancel=()=>{if(drag){drag=null;persist();}};
  }render();canvasView.refresh();
 }
 const clamp=(v,min,max)=>Math.round(Math.min(max,Math.max(min,v))*1000)/1000;
 function settingSummaries(){
  $('#slot-summary').textContent=state.slots.map(s=>s==='web'?'Web':'App').join(' + ')||'未选择';
  $('#language-summary').textContent=state.languages.map(l=>({zh:'中',en:'英',ja:'日'})[l]).join(' / ')||'未选择';
  $('#logo-summary').textContent=({none:'不添加',white:'官方白色',black:'官方黑色',custom:'自定义'})[state.webLogo.kind];
  $('#block-summary').textContent=({auto:'自动匹配',custom:'自定义'})[state.webBlocks.preset];
  $('#block-swatches').replaceChildren(...state.webBlocks.layers.map(layer=>{const swatch=document.createElement('i');swatch.style.background=`linear-gradient(135deg,${layer.colors.join(',')})`;return swatch;}));
 }
 function selectedCount(){const n=$$('input[name=slot]:checked').length*$$('input[name=language]:checked').length;$('#selection-count').textContent=n+' 张';$('#generate').disabled=!ready||!n;settingSummaries();}
 function hydrate(){sanitizeBatchSelection();sanitizeDownloadSelection();blockControls();logoControls();$('#project-name').value=state.name;backgroundControls();textColorControls();$('#app-variant').value=state.variant;$$('input[name=slot]').forEach(x=>x.checked=state.slots.includes(x.value));$$('input[name=language]').forEach(x=>x.checked=state.languages.includes(x.value));$('#title-copy').value=state.copy[editingLang].title;$('#app-title-copy').value=state.copy[editingLang].appSecondaryTitle;$('#subtitle-copy').value=state.copy[editingLang].subtitle;copyControls();$('#source-preview').src=sourceURL();$('#source-info').textContent=`${source.naturalWidth} × ${source.naturalHeight} px · ${state.imageName}`;$('#draft-name').textContent=state.name;$('#draft-detail').textContent=`${state.outputs.length} 张设计 · 保存在本机`;selectedCount();cards();refreshDraftPreview();}
 function generate(){const slots=$$('input[name=slot]:checked').map(i=>i.value),languages=$$('input[name=language]:checked').map(i=>i.value);if(!slots.length||!languages.length){toast('请至少选择一个资源位和一种语言。');return;}resetBatchSelection();resetDownloadSelection();state.slots=slots;state.languages=languages;state.outputs=slots.flatMap(s=>languages.map(l=>s+':'+l));if(!state.outputs.includes(state.selected))state.selected=state.outputs[0];cards();textColorControls();persist();toast(`预览已更新，共 ${state.outputs.length} 张；单张微调已保留。`);}
 function setInspectorOpen(open){$('#studio').classList.toggle('inspector-open',open);$('#open-inspector').setAttribute('aria-expanded',String(open));}
 $('#open-inspector').onclick=()=>setInspectorOpen(!$('#studio').classList.contains('inspector-open'));$('#close-inspector').onclick=()=>{setInspectorOpen(false);$('#open-inspector').focus();};
 $('#download-toggle').onclick=()=>downloadMode?exitDownload():enterDownload();$('#download-done').onclick=()=>exitDownload();
 $('#download-select-all').onclick=()=>{state.outputs.forEach(key=>downloadKeys.add(key));updateBatchUI();inspector();};$('#download-clear').onclick=()=>{downloadKeys.clear();updateBatchUI();inspector();};
 $('#batch-toggle').onclick=()=>batchMode?exitBatch():enterBatch();$('#batch-done').onclick=exitBatch;
 $('#sync-composition').onclick=()=>{if(!batchMode||!batchReference)return;const syncFade=$('#batch-sync-fade').checked,syncTextColor=$('#batch-sync-text-color').checked,affected=syncComposition(batchReference,[...batchKeys],syncFade,state.adjustments,syncTextColor);render();textColorControls();persist();const extras=[syncFade?'左侧渐变':null,syncTextColor?'文字颜色':null].filter(Boolean);toast(`已按基准同步 ${affected.length} 张${extras.length?'，包含'+extras.join('和'):'，保留各自渐变与文字颜色'}。`);};
 function cloudLink(id,revision){cloudProjectId=id||null;cloudRevision=Number.isInteger(revision)?revision:null;try{if(id){localStorage.setItem('pixverse-cloud-project-id',id);localStorage.setItem('pixverse-cloud-project-revision',String(revision));}else{localStorage.removeItem('pixverse-cloud-project-id');localStorage.removeItem('pixverse-cloud-project-revision');}}catch(_error){}}
 function restoreCloudLink(){try{const id=localStorage.getItem('pixverse-cloud-project-id'),revision=Number(localStorage.getItem('pixverse-cloud-project-revision'));if(id&&Number.isInteger(revision)&&revision>0){cloudProjectId=id;cloudRevision=revision;}}catch(_error){}}
 function updateSaveStatus(){const label=$('#save-status');if(localSaveState==='saving')return label.textContent='正在保存本地草稿…';if(localSaveState==='error')return label.textContent='草稿未保存，请备份工程';if(cloudSession.user&&cloudProjectId){if(cloudSaveState==='saving')label.textContent='已保存到本机 · 正在同步云端…';else if(cloudSaveState==='synced')label.textContent='已保存到本机 · 已同步云端';else if(cloudSaveState==='error')label.textContent='已保存到本机 · 云端同步失败';else label.textContent='已保存到本机';}else label.textContent='已保存到本机';}
 function setCloudStatus(text,status='idle'){$('#cloud-sync-status').textContent=text;$('#cloud-sync-status').dataset.state=status;cloudSaveState=status;updateSaveStatus();}
 async function cloudRequest(path,options={}){const response=await fetch(path,{...options,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});let data=null;if(response.status!==204){const contentType=response.headers.get('content-type')||'';data=contentType.includes('application/json')?await response.json():{error:await response.text()};}if(!response.ok){const error=new Error(data?.error||'云端服务暂时不可用。');error.status=response.status;error.data=data;throw error;}return data;}
 function renderCloudSession(){const configured=cloudSession.configured,user=cloudSession.user;$('#cloud-disabled').hidden=configured;$('#cloud-signed-out').hidden=!configured||Boolean(user);$('#cloud-signed-in').hidden=!user;if(!user)return;$('#cloud-user-name').textContent=user.name;$('#cloud-admin-badge').hidden=!user.isAdmin;const avatar=$('#cloud-avatar'),fallback=$('#cloud-avatar-fallback');avatar.hidden=!user.avatarUrl;fallback.hidden=Boolean(user.avatarUrl);if(user.avatarUrl)avatar.src=user.avatarUrl;else avatar.removeAttribute('src');$('#cloud-admin-panel').hidden=!user.isAdmin;}
 function readableSize(bytes){if(!Number.isFinite(Number(bytes)))return '';if(Number(bytes)===0)return '0 KB';const mb=Number(bytes)/1024/1024;return mb>=1?`${mb.toFixed(mb>=10?0:1)} MB`:`${Math.max(1,Math.round(Number(bytes)/1024))} KB`;}
 function projectPreviewDataUrl(){if(!ready||!state.outputs.length)return '';try{const key=state.outputs.includes(state.selected)?state.selected:state.outputs[0],banner=document.createElement('canvas');paint(banner,key,false,2);const thumb=document.createElement('canvas');thumb.width=640;thumb.height=360;const ctx=thumb.getContext('2d'),padding=24,scale=Math.min((thumb.width-padding*2)/banner.width,(thumb.height-padding*2)/banner.height),width=banner.width*scale,height=banner.height*scale;ctx.fillStyle='#f3f1f6';ctx.fillRect(0,0,thumb.width,thumb.height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(banner,(thumb.width-width)/2,(thumb.height-height)/2,width,height);return thumb.toDataURL('image/jpeg',.82);}catch(_error){return '';}}
 function refreshDraftPreview(){const preview=projectPreviewDataUrl();$('#draft-preview').src=preview||sourceURL();}
 function projectTime(value){const date=new Date(value),time=date.valueOf();if(Number.isNaN(time))return '更新时间未知';const minutes=Math.max(0,Math.floor((Date.now()-time)/60000));if(minutes<1)return '刚刚编辑';if(minutes<60)return `编辑于 ${minutes} 分钟前`;const hours=Math.floor(minutes/60);if(hours<24)return `编辑于 ${hours} 小时前`;const days=Math.floor(hours/24);if(days<30)return `编辑于 ${days} 天前`;return `编辑于 ${date.toLocaleDateString('zh-CN')}`;}
 function renderCloudProjects(){const root=$('#cloud-project-list');root.replaceChildren();if(!cloudProjects.length){const empty=document.createElement('p');empty.className='cloud-empty';empty.textContent='还没有云端工程。将当前本地工程保存到云端后，会显示在这里。';root.append(empty);return;}const currentPreview=projectPreviewDataUrl();for(const project of cloudProjects){const current=project.id===cloudProjectId,card=document.createElement('article');card.className='project-tile cloud-project-card'+(current?' current':'');const preview=document.createElement('div');preview.className='project-tile-preview';const previewSource=project.previewDataUrl||(current?currentPreview:'');if(previewSource){const image=document.createElement('img');image.src=previewSource;image.alt=`${project.name} 工程预览`;image.loading='lazy';preview.append(image);}else{const placeholder=document.createElement('span');placeholder.className='project-preview-placeholder';placeholder.textContent='暂无预览';preview.append(placeholder);}const footer=document.createElement('div');footer.className='project-tile-footer';const info=document.createElement('div');info.className='project-tile-copy';const titleRow=document.createElement('div');titleRow.className='project-title-row';const title=document.createElement('h4');title.textContent=project.name;titleRow.append(title);if(current){const badge=document.createElement('span');badge.className='small-tag';badge.textContent='当前';titleRow.append(badge);}const meta=document.createElement('p');meta.textContent=`${projectTime(project.updatedAt)} · ${readableSize(project.sizeBytes)}`;info.append(titleRow,meta);const buttons=document.createElement('div');buttons.className='cloud-project-buttons';const open=document.createElement('button');open.className='secondary';open.textContent=current?'当前工程':'打开工程';open.disabled=current;open.onclick=()=>openCloudProject(project.id);const remove=document.createElement('button');remove.className='quiet';remove.textContent='删除';remove.onclick=()=>deleteCloudProject(project);buttons.append(open,remove);footer.append(info,buttons);card.append(preview,footer);root.append(card);}}
 async function refreshCloudProjects(){if(!cloudSession.user)return;try{const data=await cloudRequest('/api/cloud/projects');cloudProjects=data.projects||[];if(cloudProjectId&&!cloudProjects.some(project=>project.id===cloudProjectId)){cloudLink(null,null);cloudConflict=false;}renderCloudProjects();if(cloudSession.user.isAdmin)loadAdminOverview();}catch(error){if(error.status===401){cloudSession.user=null;renderCloudSession();}else $('#cloud-project-list').innerHTML='<p class="cloud-empty">暂时无法读取云端工程，请稍后刷新。</p>';}}
 async function loadProject(raw,cloudMeta=null){const next=validateProject(structuredClone(raw)),img=await loadImage(next.image||'assets/demo.png'),nextSlotSources=await loadSlotSources(next);await prepareLogo(next.webLogo);if([img,...Object.values(nextSlotSources).filter(Boolean)].some(image=>image.naturalWidth*image.naturalHeight>50000000))throw Error('工程图片过大。');++loadToken;++logoToken;resetBatchSelection();resetDownloadSelection();state=next;source=img;slotSources=nextSlotSources;if(next._rematchLegacyBlocks){applyPalette(imagePalette(sourceFor('web')),'blocks');delete next._rematchLegacyBlocks;}history=new window.ProjectHistory(state);historyButtons();cloudConflict=false;if(cloudMeta)cloudLink(cloudMeta.id,cloudMeta.revision);else cloudLink(null,null);hydrate();show('studio');persist(false,false);}
 async function openCloudProject(id){if(!confirm('打开云端工程将替换当前本地草稿。请先备份或保存需要保留的修改。是否继续？'))return;try{setCloudStatus('正在打开云端工程…','saving');const data=await cloudRequest(`/api/cloud/projects/${encodeURIComponent(id)}`);await loadProject(data.project.payload,{id:data.project.id,revision:data.project.revision});setCloudStatus('已打开云端工程','synced');toast('云端工程已打开，后续修改会自动同步。');await refreshCloudProjects();}catch(error){setCloudStatus(error.message,'error');toast('打开失败：'+error.message);}}
 async function saveCloudProject({automatic=false}={}){if(!cloudSession.user||cloudSaveState==='saving'||cloudConflict&&automatic)return;cloudSaveState='saving';setCloudStatus(automatic?'正在自动同步…':'正在保存到云端…','saving');$('#cloud-save-current').disabled=true;const snapshot=structuredClone(state),preview=projectPreviewDataUrl();try{let data;if(cloudProjectId&&cloudRevision){data=await cloudRequest(`/api/cloud/projects/${encodeURIComponent(cloudProjectId)}`,{method:'PUT',body:JSON.stringify({project:snapshot,preview,baseRevision:cloudRevision})});}else{data=await cloudRequest('/api/cloud/projects',{method:'POST',body:JSON.stringify({project:snapshot,preview})});}cloudLink(data.project.id,data.project.revision);cloudConflict=false;setCloudStatus('已同步到云端','synced');if(!automatic)toast('工程已保存到云端，后续修改会自动同步。');await refreshCloudProjects();}catch(error){if(error.status===409){cloudConflict=true;cloudLink(null,null);setCloudStatus('云端版本已更新；当前本地工程可另存为新的云端工程','error');}else if(error.status===401){cloudSession.user=null;renderCloudSession();setCloudStatus('登录已失效，请重新使用飞书登录','error');}else setCloudStatus(error.message,'error');if(!automatic)toast('云端保存失败：'+error.message);}finally{$('#cloud-save-current').disabled=false;}}
 function scheduleCloudSave(){if(!cloudSession.user||!cloudProjectId||cloudConflict)return;clearTimeout(cloudSaveTimer);cloudSaveTimer=setTimeout(()=>{cloudQueue=cloudQueue.catch(()=>{}).then(()=>saveCloudProject({automatic:true}));},2500);}
 async function deleteCloudProject(project){if(!confirm(`确定删除云端工程“${project.name}”吗？本机草稿和已备份的工程文件不会删除。`))return;try{await cloudRequest(`/api/cloud/projects/${encodeURIComponent(project.id)}`,{method:'DELETE'});if(project.id===cloudProjectId){cloudLink(null,null);setCloudStatus('当前工程仅保存在本机','idle');}toast('云端工程已删除。');await refreshCloudProjects();}catch(error){toast('删除失败：'+error.message);}}
 async function loadAdminOverview(){if(!cloudSession.user?.isAdmin)return;try{const data=await cloudRequest('/api/admin/overview');$('#cloud-admin-summary').textContent=`${data.users} 位用户 · ${data.projects} 个云端工程 · 共 ${readableSize(data.storageBytes)}`;}catch(error){$('#cloud-admin-summary').textContent='管理员数据暂时无法读取：'+error.message;}}
 async function initCloud(){restoreCloudLink();const params=new URLSearchParams(location.search);try{const data=await cloudRequest('/api/auth/session');cloudSession={configured:Boolean(data.configured),user:data.authenticated?data.user:null};renderCloudSession();if(cloudSession.user){setCloudStatus(cloudProjectId?'正在确认云端版本…':'当前工程仅保存在本机','idle');await refreshCloudProjects();await loadAdminOverview();}else updateSaveStatus();}catch(_error){cloudSession={configured:false,user:null};renderCloudSession();updateSaveStatus();}const auth=params.get('auth');if(params.get('view')==='draft')show('draft');if(auth){toast(auth==='success'?'飞书登录成功。':auth==='cancelled'?'已取消飞书登录。':'飞书登录失败，请重试。');window.history.replaceState({},'',location.pathname);} }
 function show(view){document.body.dataset.view=view;for(const v of ['studio','assets','draft'])$('#'+v).hidden=v!==view;$$('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});$('#draft-name').textContent=state.name;$('#draft-detail').textContent=`${state.outputs.length} 张设计 · 保存在本机`;if(view==='draft'){refreshDraftPreview();if(cloudSession.user)refreshCloudProjects();}}
 function download(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 function safeName(text){return (text.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').trim()||'Banner').slice(0,70);}
 function blobOf(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG 导出失败')),'image/png'));}
 function exportFrames(keys,name){return keys.map(key=>{const c=document.createElement('canvas'),result=paint(c,key);if(result.issues.length)throw Error(`${SLOT[slotOf(key)]} · ${LANG[key.split(':')[1]]}：${result.issues.join('；')}`);return {canvas:c,name:`${name}_${key.replace(':','_')}_${c.width}x${c.height}.png`};});}
 async function exportSelected(){const keys=selectedExportKeys();if(!keys.length)return toast('请至少选择一张图片。');if(exportBusy)return;exportBusy=true;updateExport();try{await fontsReady();const name=safeName(state.name),frames=exportFrames(keys,name);if(frames.length===1){download(await blobOf(frames[0].canvas),frames[0].name);toast('PNG 已开始下载，不包含辅助线。');return;}const files=[];for(const item of frames)files.push({name:item.name,data:new Uint8Array(await (await blobOf(item.canvas)).arrayBuffer())});download(zip(files),`${name}_所选${files.length}张.zip`);toast(`已开始下载所选 ${files.length} 张原生尺寸 PNG。`);}finally{exportBusy=false;updateExport();}}
 function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('pixverse-brand-studio-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('projects');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 function readDraft(){return new Promise((resolve,reject)=>{const req=db.transaction('projects').objectStore('projects').get('current');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
 function persist(record=true,syncCloud=true){if(!ready)return;settingSummaries();if(record&&history){history.record(state,editGroup,gestureTarget?0:Date.now());historyButtons();}const revision=++draftRevision;localSaveState='saving';updateSaveStatus();clearTimeout(timer);timer=setTimeout(()=>{const snapshot=structuredClone(state);saveQueue=saveQueue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{if(!db){reject(new Error('storage unavailable'));return;}const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(snapshot,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);})).then(()=>{localSaveState='saved';updateSaveStatus();if(syncCloud)scheduleCloudSave();}).catch(()=>{localSaveState='error';updateSaveStatus();});},300);}
 function validateProject(s){if(!s||s.version!==1||!(s.templateVersion===REV||LEGACY_REVS.has(s.templateVersion)))throw Error('工程版本不兼容，请使用本版本保存的工程。');if(typeof s.name!=='string'||s.name.length>80||!/^#[0-9a-f]{6}$/i.test(s.background))throw Error('工程格式不正确。');if(s.backgroundEnabled===undefined)s.backgroundEnabled=false;if(typeof s.backgroundEnabled!=='boolean')throw Error('左侧补色开关设置不正确。');const legacyTextMode=s.textColorMode==='template'?'white':s.textColorMode,legacyTextColor=s.textColor;if(legacyTextMode!==undefined&&!['white','custom'].includes(legacyTextMode))throw Error('活动文字颜色设置不正确。');if(legacyTextMode==='custom'&&(typeof legacyTextColor!=='string'||!/^#[0-9a-f]{6}$/i.test(legacyTextColor)))throw Error('活动文字颜色色值不正确。');delete s.textColorMode;delete s.textColor;const validKeys=['web:zh','web:en','web:ja','app:zh','app:en','app:ja'];for(const [field,allowed]of [['slots',['web','app']],['languages',['zh','en','ja']],['outputs',validKeys]]){if(!Array.isArray(s[field])||new Set(s[field]).size!==s[field].length||s[field].some(x=>!allowed.includes(x)))throw Error('工程资源位或语言不正确。');}if(!['primary','secondary'].includes(s.variant)||!(s.selected===null||s.outputs.includes(s.selected)))throw Error('工程选择状态不正确。');for(const l of Object.keys(LANG)){const c=s.copy?.[l];if(c?.appSecondaryTitle===undefined&&typeof c?.title==='string')c.appSecondaryTitle=c.title.replace(/\r/g,'').split('\n').filter(Boolean).join(l==='en'?' ':'');if(typeof c?.title!=='string'||typeof c?.appSecondaryTitle!=='string'||typeof c?.subtitle!=='string'||c.title.length>2000||c.appSecondaryTitle.length>2000||c.subtitle.length>2000)throw Error('工程文案不正确。');}if(s.image!==null&&(typeof s.image!=='string'||s.image.length>60000000||!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(s.image)))throw Error('工程图片格式不正确。');if(typeof s.imageName!=='string'||s.imageName.length>255||!s.adjustments||typeof s.adjustments!=='object')throw Error('工程图片参数不正确。');if(legacyTextMode==='custom'&&s.selected&&s.adjustments[s.selected]?.textColorMode===undefined)s.adjustments[s.selected]={zoom:100,x:0,y:0,fade:48,shade:'custom',...s.adjustments[s.selected],textColorMode:'custom',textColor:legacyTextColor.toUpperCase()};for(const [k,a]of Object.entries(s.adjustments)){if(!validKeys.includes(k)||!a||a.shade!==undefined&&!['template','custom'].includes(a.shade))throw Error('单张调整数据不正确。');for(const [p,min,max]of [['zoom',60,220],['x',-50,50],['y',-50,50],['fade',0,80]])if(!Number.isFinite(a[p])||a[p]<min||a[p]>max)throw Error('单张调整数值超出范围。');if(a.textColorMode!==undefined&&!['white','custom'].includes(a.textColorMode)||a.textColorMode==='custom'&&(typeof a.textColor!=='string'||!/^#[0-9a-f]{6}$/i.test(a.textColor))||a.textColor!==undefined&&(typeof a.textColor!=='string'||!/^#[0-9a-f]{6}$/i.test(a.textColor)))throw Error('单张文字颜色设置不正确。');if(a.textColor!==undefined)a.textColor=a.textColor.toUpperCase();a.shade='custom';}if(!s.webBlocks)s.webBlocks=blockDefaults();
 const legacyBlockPreset=['purple','original'].includes(s.webBlocks.preset);if(legacyBlockPreset){s.webBlocks.preset='auto';Object.defineProperty(s,'_rematchLegacyBlocks',{value:true,configurable:true});}if(!['auto','custom'].includes(s.webBlocks.preset)||!Array.isArray(s.webBlocks.layers)||s.webBlocks.layers.length!==2||s.webBlocks.layers.some(l=>!l||!Array.isArray(l.colors)||l.colors.length!==3||l.colors.some(c=>typeof c!=='string'||!/^#[0-9a-f]{6}$/i.test(c))||!Number.isFinite(l.opacity)||l.opacity<10||l.opacity>100))throw Error('Web 色块参数不正确。');if(!s.webLogo)s.webLogo=logoAPI.defaults();logoAPI.validate(s.webLogo);s.templateVersion=REV;return s;}
 const validateProjectWithoutSlotMedia=validateProject;validateProject=function(s){if(s){if(s.slotMedia===undefined)s.slotMedia={web:null,app:null};if(!s.slotMedia||typeof s.slotMedia!=='object'||Array.isArray(s.slotMedia)||Object.keys(s.slotMedia).some(k=>!['web','app'].includes(k)))throw Error('资源位图片设置不正确。');for(const slot of ['web','app']){const media=s.slotMedia[slot]??null;if(media===null){s.slotMedia[slot]=null;continue;}if(!media||typeof media!=='object'||typeof media.name!=='string'||media.name.length>255||typeof media.image!=='string'||media.image.length>60000000||!/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(media.image)||typeof media.background!=='string'||!/^#[0-9a-f]{6}$/i.test(media.background))throw Error('资源位图片设置不正确。');media.background=media.background.toUpperCase();}}return validateProjectWithoutSlotMedia(s);};
 async function backup(){try{const s=structuredClone(state);if(!s.image){const blob=await fetch('assets/demo.png').then(r=>r.blob());s.image=await dataURL(blob);}download(new Blob([JSON.stringify(s)],{type:'application/json'}),safeName(state.name)+'.brand-studio.json');toast('工程已备份，可在本地草稿中重新打开。');}catch(e){toast('工程备份失败：'+e.message);}}
 const dataURL=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取文件失败'));r.readAsDataURL(file);});
 let slotUploadTarget=null;
 async function replaceSlotImage(file,slot){if(!file||!slot)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>40*1024*1024)return toast('请上传 40 MB 以内的 PNG、JPG 或 WebP。');const token=++loadToken;try{const url=await dataURL(file),img=await loadImage(url);if(token!==loadToken)return;if(img.naturalWidth*img.naturalHeight>50000000)throw Error('图片超过 5000 万像素，请先缩小。');const palette=imagePalette(img),fallback=backgroundFor(slot);state.slotMedia={...state.slotMedia,[slot]:{image:url,name:file.name,background:palette?.background||fallback}};slotSources={...slotSources,[slot]:img};resetSlotComposition(slot);if(slot==='web'&&palette)applyPalette(palette,'blocks');hydrate();persist();toast(`${SLOT[slot]} 已使用独立图片，并同步至中日英。构图已恢复自动适配。`);}catch(e){toast(e.message);}}
 function resetSlotImage(slot){if(!mediaFor(slot))return;state.slotMedia={...state.slotMedia,[slot]:null};slotSources={...slotSources,[slot]:null};resetSlotComposition(slot);if(slot==='web'&&state.webBlocks.preset==='auto')applyPalette(imagePalette(source),'blocks');hydrate();persist();toast(`${SLOT[slot]} 已恢复使用母版图。`);}
 function matchSlotBackground(slot){const media=mediaFor(slot),img=sourceFor(slot);if(!media)return;try{const palette=imagePalette(img);if(!palette)return toast('未找到可取色的非透明区域，请手动选色。');media.background=palette.background;slotImageControls(state.selected);render();persist();toast(`${SLOT[slot]} 补边色已按当前图片更新。`);}catch(e){toast('自动取色失败，请手动选色。');}}
 async function replaceImage(file){if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>40*1024*1024)return toast('请上传 40 MB 以内的 PNG、JPG 或 WebP。');const token=++loadToken;try{const url=await dataURL(file),img=await loadImage(url);if(token!==loadToken)return;if(img.naturalWidth*img.naturalHeight>50000000)throw Error('图片超过 5000 万像素，请先缩小。');const palette=imagePalette(img);source=img;state.image=url;state.imageName=file.name;applyPalette(palette,state.slotMedia?.web?'background':'both');hydrate();persist();toast(palette?'主视觉已更新；使用母版的资源位已更新配色，独立图片保持不变。':'主视觉已更新；未找到可取色区域，已保留原配色。');}catch(e){toast(e.message);}}
 $('#background-match').onclick=()=>matchPalette('background');$('#blocks-match').onclick=()=>matchPalette('blocks');
 $('#block-preset').onchange=e=>{if(e.target.value==='auto')return matchPalette('blocks');state.webBlocks.preset='custom';blockControls();render();persist();};
 $('#web-logo').onchange=e=>chooseLogo(e.target.value);$('#upload-logo').onclick=()=>$('#logo-upload').click();$('#logo-upload').onchange=e=>{uploadLogo(e.target.files[0]);e.target.value='';};
 $('#generate').onclick=generate;$('#project-name').oninput=e=>{state.name=e.target.value;persist();};$('#background-enabled').onchange=e=>{state.backgroundEnabled=e.target.checked;backgroundControls();render();persist();};$('#background').oninput=e=>{state.background=e.target.value;render();persist();};$('#show-guides').onchange=render;
 $('#text-color-mode').onchange=e=>{const key=state.selected;if(!key)return;const current=adjustment(key);state.adjustments[key]={...current,textColorMode:e.target.value,textColor:current.textColor||'#FFFFFF'};textColorControls();render();persist();};
 $('#text-color-picker').oninput=e=>applyTextColor(e.target.value);
 $('#text-color-hex').oninput=e=>applyTextColor(e.target.value,true);
 $('#text-color-hex').onchange=()=>{if($('#text-color-hex').getAttribute('aria-invalid')!=='true')textColorControls();};
 $$('input[name=slot],input[name=language]').forEach(i=>i.onchange=()=>{state.slots=$$('input[name=slot]:checked').map(i=>i.value);state.languages=$$('input[name=language]:checked').map(i=>i.value);copyControls();selectedCount();persist();});
 $$('[data-lang]').forEach(b=>b.onclick=()=>{editingLang=b.dataset.lang;$$('[data-lang]').forEach(t=>t.setAttribute('aria-selected',t===b?'true':'false'));$('#title-copy').value=state.copy[editingLang].title;$('#app-title-copy').value=state.copy[editingLang].appSecondaryTitle;$('#subtitle-copy').value=state.copy[editingLang].subtitle;});
 $('#title-copy').oninput=e=>{state.copy[editingLang].title=e.target.value;render();persist();};$('#app-title-copy').oninput=e=>{state.copy[editingLang].appSecondaryTitle=e.target.value;render();persist();};$('#subtitle-copy').oninput=e=>{state.copy[editingLang].subtitle=e.target.value;render();persist();};
 $('#app-variant').onchange=e=>{state.variant=e.target.value;copyControls();render();persist();};
 for(const [id,prop]of [['zoom','zoom'],['pan-x','x'],['pan-y','y'],['fade','fade']])$('#'+id).oninput=e=>{const targets=batchTargets(prop);if(!targets.length)return;const value=Number(e.target.value);for(const key of targets)state.adjustments[key]={...adjustment(key),[prop]:value};render();persist();};
 $('#reset-crop').onclick=()=>{const targets=batchMode?[...batchKeys]:state.selected?[state.selected]:[];for(const key of targets)state.adjustments[key]={...adjustment(key),zoom:100,x:0,y:0};render();persist();toast(batchMode?`已恢复所选 ${targets.length} 张图片的自动适配。`:'当前图片已恢复自动适配。');};
 $('#replace-slot-image').onclick=()=>{slotUploadTarget=slotOf(state.selected);$('#slot-image-upload').click();};
 $('#slot-image-upload').onchange=e=>{const file=e.target.files[0],slot=slotUploadTarget;e.target.value='';slotUploadTarget=null;replaceSlotImage(file,slot);};
 $('#reset-slot-image').onclick=()=>resetSlotImage(slotOf(state.selected));$('#match-slot-background').onclick=()=>matchSlotBackground(slotOf(state.selected));
 $('#slot-background').oninput=e=>{const media=mediaFor(slotOf(state.selected));if(!media)return;media.background=e.target.value.toUpperCase();render();persist();};
 $('#image-upload').onchange=e=>{replaceImage(e.target.files[0]);e.target.value='';};$$('[data-view]').forEach(b=>b.onclick=()=>show(b.dataset.view));$('#continue-draft').onclick=()=>show('studio');$('#backup-draft').onclick=backup;$('#export-one').onclick=()=>exportSelected().catch(e=>toast(e.message));
 $('#cloud-save-current').onclick=()=>saveCloudProject();$('#cloud-refresh').onclick=()=>refreshCloudProjects();$('#cloud-logout').onclick=async()=>{try{await cloudRequest('/api/auth/logout',{method:'POST'});}catch(_error){}cloudSession.user=null;cloudSaveState='idle';renderCloudSession();updateSaveStatus();toast('已退出飞书登录，本地草稿仍然保留。');};
 $('#import-project').onclick=()=>$('#project-upload').click();$('#project-upload').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>160*1024*1024)return toast('工程文件过大。');try{const raw=JSON.parse(await file.text());if(!confirm('打开工程将替换当前本地草稿。请先备份需要保留的当前工程。是否继续？'))return;await loadProject(raw,null);toast('工程已恢复，并作为新的本地工程打开。');}catch(err){toast('打开失败：'+err.message);}};
 // ZIP store format keeps PNG bytes intact and avoids external CDN dependencies.
 const crcTable=Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
 function zip(files){const parts=[],central=[];let offset=0,total=0;const enc=new TextEncoder();for(const f of files){const name=enc.encode(f.name),data=f.data,crc=crc32(data);const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);parts.push(local,data);const c=new Uint8Array(46+name.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);c.set(name,46);central.push(c);total+=c.length;offset+=local.length+data.length;}const end=new Uint8Array(22),d=new DataView(end.buffer);d.setUint32(0,0x06054b50,true);d.setUint16(8,files.length,true);d.setUint16(10,files.length,true);d.setUint32(12,total,true);d.setUint32(16,offset,true);return new Blob([...parts,...central,end],{type:'application/zip'});}
 async function start(){try{let restored=false;try{db=await openDB();const saved=await readDraft();if(saved){state=validateProject(saved);restored=true;}}catch(e){toast('本地草稿未恢复，已打开示例；可通过工程文件继续。');}await fontsReady();source=await loadImage(sourceURL());slotSources=await loadSlotSources(state);if(!restored||state._rematchLegacyBlocks){applyPalette(imagePalette(state._rematchLegacyBlocks?sourceFor('web'):source),state._rematchLegacyBlocks?'blocks':'both');delete state._rematchLegacyBlocks;}await prepareLogo(state.webLogo);ready=true;history=new window.ProjectHistory(state);historyButtons();hydrate();persist(false);await initCloud();const context=document.modelContext;if(context?.registerTool){Promise.resolve(context.registerTool({name:'read_banner_workspace',title:'读取资源位工作台',description:'读取当前生成结果、规格和文案检查，不导出或修改。',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async()=>({name:state.name,templateVersion:REV,outputs:state.outputs.map(k=>({key:k,...errors.get(k)}))})})).catch(()=>{});}}catch(e){$('#results').textContent='载入失败：'+e.message+'。请通过本地启动器打开页面。';localSaveState='error';updateSaveStatus();toast('载入失败，请检查原图与字体文件。');}}
 start();
})();
