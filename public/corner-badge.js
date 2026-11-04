/* PixVerse corner badge spec: Figma 21:1491 and 23:1635. */
(function(root){
  'use strict';
  const assets='/assets/corner-badge/';
  const width=280, wordmarkHeight=49.8226, gap=8, maxInkWidth=244, pngScale=4;
  const draft={text:'GPT-6 ASTRA',ink:'white',background:'dark'};
  const settings=[[36,0]];
  for(let halfSize=71;halfSize>=48;halfSize--)settings.push([halfSize/2,0]);
  for(let spacing=1;spacing<=6;spacing++)settings.push([24,-spacing/10]);
  const barHeight=size=>Math.min(45,Math.max(38,Math.ceil(.728*size+18)));
  const number=value=>Number(value.toFixed(5));

  function layoutText(hb,font,upem,measureOutline,text){
    text=text.trim();
    if(!text)return {error:'empty'};
    const buffer=hb.createBuffer();
    let run;
    try{
      buffer.addText(text);
      buffer.guessSegmentProperties();
      hb.shape(font,buffer);
      run=buffer.json();
    }finally{buffer.destroy();}
    if(run.some(glyph=>glyph.g===0))return {error:'unsupported'};

    let x=0,y=0,clusterIndex=-1,previousCluster;
    const outlines=[];
    const glyphCache=new Map();
    for(const glyph of run){
      if(glyph.cl!==previousCluster)clusterIndex++;
      previousCluster=glyph.cl;
      if(!glyphCache.has(glyph.g)){
        const path=font.glyphToPath(glyph.g);
        glyphCache.set(glyph.g,path?{path,box:measureOutline(path)}:null);
      }
      const outline=glyphCache.get(glyph.g);
      if(outline)outlines.push({...outline,x:x+glyph.dx,y:y+glyph.dy,clusterIndex});
      x+=glyph.ax;y+=glyph.ay;
    }
    if(!outlines.length)return {error:'empty'};

    for(const [size,tracking] of settings){
      const scale=size/upem,height=barHeight(size);
      const glyphs=outlines.map(g=>({
        ...g,x:g.x*scale+g.clusterIndex*tracking,y:-g.y*scale
      }));
      const left=Math.min(...glyphs.map(g=>g.x+g.box.x*scale));
      const right=Math.max(...glyphs.map(g=>g.x+(g.box.x+g.box.width)*scale));
      const top=Math.min(...glyphs.map(g=>g.y-(g.box.y+g.box.height)*scale));
      const bottom=Math.max(...glyphs.map(g=>g.y-g.box.y*scale));
      if(right-left<=maxInkWidth && bottom-top<=height){
        return {text,size,tracking,scale,glyphs,height,inkWidth:right-left,inkHeight:bottom-top,
          offsetX:(width-left-right)/2,offsetY:wordmarkHeight+gap+(height-top-bottom)/2};
      }
    }
    return {error:'overflow'};
  }

  function composeSvg(layout,wordmark){
    const y=wordmarkHeight+gap, end=y+layout.height;
    const large=Math.round(Math.min(14,.30*layout.height)),small=Math.round(Math.min(4,.08*layout.height));
    const bar=`M${large} ${y}H${width-small}A${small} ${small} 0 0 1 ${width} ${y+small}V${end-large}A${large} ${large} 0 0 1 ${width-large} ${end}H${small}A${small} ${small} 0 0 1 0 ${end-small}V${y+large}A${large} ${large} 0 0 1 ${large} ${y}Z`;
    const shapes=layout.glyphs.map(g=>`<path d="${g.path}" transform="translate(${number(g.x+layout.offsetX)} ${number(g.y+layout.offsetY)}) scale(${number(layout.scale)} ${number(-layout.scale)})"/>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${end}" viewBox="0 0 ${width} ${end}"><title>PixVerse corner badge</title><defs><linearGradient id="badge-gradient" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0" stop-color="#442FBA"/><stop offset=".5" stop-color="#E36CFA"/><stop offset="1" stop-color="#FFA052"/></linearGradient></defs>${wordmark}<path fill="url(#badge-gradient)" d="${bar}"/><g fill="#FFFFFF">${shapes}</g></svg>`;
  }

  function markup(t){
    return `<section class="al-badge" aria-labelledby="badge-title">
      <p class="al-badge-eyebrow">DESIGN TOOLS</p>
      <h1 id="badge-title">${t('角标生成','Badge generator')}</h1>
      <p class="al-badge-description">${t('输入模型、活动或功能名称，实时预览并下载透明角标','Enter a model, campaign, or feature name to preview and download a transparent badge')}</p>
      <div class="al-badge-layout">
        <div class="al-badge-controls">
          <fieldset><legend>${t('字标颜色','Wordmark color')}</legend>
            <label><input type="radio" name="badge-ink" value="white" ${draft.ink==='white'?'checked':''}>${t('浅色字标','Light wordmark')}</label>
            <label><input type="radio" name="badge-ink" value="black" ${draft.ink==='black'?'checked':''}>${t('黑色字标','Black wordmark')}</label>
          </fieldset>
          <label class="al-badge-copy" for="badge-copy">${t('角标文案','Badge text')}</label>
          <input type="text" id="badge-copy" maxlength="120" autocomplete="off" spellcheck="false" aria-describedby="badge-status">
          <p id="badge-status" role="status"></p>
          <div class="al-badge-downloads">
            <button type="button" data-badge-download="svg" disabled>${t('下载 SVG','Download SVG')}</button>
            <button type="button" class="primary" data-badge-download="png" disabled>${t('下载 PNG','Download PNG')}</button>
          </div>
        </div>
        <div class="al-badge-result">
          <div class="al-badge-preview-head"><h2>${t('实时预览','Live preview')}</h2>
            <div role="group" class="al-badge-backgrounds" aria-label="${t('预览背景','Preview background')}">
              ${[['dark','深色','Dark'],['light','浅色','Light']].map(([key,zh,en])=>`<button type="button" data-badge-bg="${key}" aria-pressed="${draft.background===key}">${t(zh,en)}</button>`).join('')}
            </div>
          </div>
          <div class="al-badge-preview" data-background="${draft.background}"><img alt="" hidden></div>
          <p class="al-badge-note">${t('SVG 和 PNG 均为透明底','SVG and PNG exports are transparent')}</p>
        </div>
      </div>
      <svg class="al-badge-measure" width="0" height="0" aria-hidden="true"><path/></svg>
    </section>`;
  }

  function loadScript(file){
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src=assets+file;
      script.onload=resolve;
      script.onerror=()=>{script.remove();reject(Error(file));};
      document.head.append(script);
    });
  }

  async function fetchAsset(file,read){
    const response=await fetch(assets+file);
    if(!response.ok)throw Error(file);
    return response[read]();
  }

  let resources;
  function loadResources(){
    if(!resources)resources=Promise.all([
      root.createHarfBuzz?Promise.resolve():loadScript('hb.js'),
      root.hbjs?Promise.resolve():loadScript('hbjs.js'),
      fetchAsset('Montserrat-ExtraBold.ttf','arrayBuffer'),
      fetchAsset('wordmark-white.svg','text'),
      fetchAsset('wordmark-black.svg','text')
    ]).then(async ([,,fontBytes,white,black])=>{
      const hb=root.hbjs(await root.createHarfBuzz({locateFile:file=>assets+file}));
      const blob=hb.createBlob(new Uint8Array(fontBytes)),face=hb.createFace(blob,0);
      const font=hb.createFont(face),upem=face.upem;
      font.setScale(upem,upem);
      face.destroy();
      blob.destroy();
      return {hb,font,upem,wordmarks:{white,black}};
    }).catch(error=>{resources=null;throw error;});
    return resources;
  }

  function save(blob,filename){
    const url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=filename;
    document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function png(svgUrl,height){
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=svgUrl;});
    const canvas=document.createElement('canvas');
    canvas.width=width*pngScale;canvas.height=Math.ceil(height*pngScale);
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,height*pngScale);
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('PNG export')),'image/png'));
  }

  function mount(panel,t){
    const $=selector=>panel.querySelector(selector),$$=selector=>panel.querySelectorAll(selector);
    const input=$('#badge-copy'),status=$('#badge-status'),preview=$('.al-badge-preview'),image=$('.al-badge-preview img'),probe=$('.al-badge-measure path');
    const buttons=$$('[data-badge-download]');
    let engine=null,current=null,imageUrl=null,disposed=false;
    const messages={
      empty:t('请输入角标文案','Enter badge text'),
      unsupported:t('字体不支持其中的字符，请调整文案','The font does not support one or more characters. Edit the text'),
      overflow:t('文案过长，请使用简称','The text is too long. Use a shorter name')
    };
    input.value=draft.text;
    status.textContent=t('正在加载字体和字标…','Loading font and wordmarks…');

    function background(key){
      draft.background=key;
      preview.dataset.background=key;
      $$('[data-badge-bg]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.badgeBg===key));
    }

    function render(){
      if(!engine||disposed)return;
      if(imageUrl)URL.revokeObjectURL(imageUrl);
      const layout=layoutText(engine.hb,engine.font,engine.upem,path=>{
        probe.setAttribute('d',path);
        return probe.getBBox();
      },draft.text);
      imageUrl=null;
      current=null;
      input.setAttribute('aria-invalid',Boolean(layout.error && layout.error!=='empty'));
      status.textContent=layout.error?messages[layout.error]:'';
      image.hidden=Boolean(layout.error);
      buttons.forEach(button=>{button.disabled=Boolean(layout.error);});
      if(layout.error){image.removeAttribute('src');return;}
      const blob=new Blob([composeSvg(layout,engine.wordmarks[draft.ink])],{type:'image/svg+xml;charset=utf-8'});
      imageUrl=URL.createObjectURL(blob);
      image.src=imageUrl;image.alt='PixVerse · '+layout.text;
      current={blob,layout,ink:draft.ink};
    }

    input.oninput=()=>{draft.text=input.value;render();};
    $$('[name="badge-ink"]').forEach(radio=>radio.onchange=()=>{
      draft.ink=radio.value;
      background(draft.ink==='white'?'dark':'light');render();
    });
    $$('[data-badge-bg]').forEach(button=>button.onclick=()=>background(button.dataset.badgeBg));
    buttons.forEach(button=>button.onclick=async()=>{
      if(!current)return;
      const snapshot=current,format=button.dataset.badgeDownload;
      const safeText=snapshot.layout.text.replace(/[^\p{L}\p{N} ._-]+/gu,'-').slice(0,80);
      const filename='PixVerse-'+safeText+'-'+snapshot.ink+'.'+format;
      if(format==='svg'){save(snapshot.blob,filename);return;}
      const url=URL.createObjectURL(snapshot.blob);
      try{save(await png(url,wordmarkHeight+gap+snapshot.layout.height),filename);}
      catch{if(!disposed)status.textContent=t('PNG 导出失败，请重试','PNG export failed. Try again');}
      finally{URL.revokeObjectURL(url);}
    });
    loadResources().then(loaded=>{if(!disposed){engine=loaded;render();}}).catch(()=>{
      if(!disposed)status.textContent=t('资源加载失败，请刷新后重试','Could not load resources. Refresh and try again');
    });
    return ()=>{disposed=true;if(imageUrl)URL.revokeObjectURL(imageUrl);};
  }

  if(typeof module==='object'&&module.exports){module.exports={layoutText,composeSvg,markup,mount};return;}
  const tools=document.getElementById('tools');
  if(!tools)return;
  let unmount;
  function render(){
    unmount?.();unmount=null;
    if(tools.hidden){tools.replaceChildren();return;}
    const t=(zh,en)=>root.PixVerseUI?.locale==='en'?en:zh;
    tools.innerHTML=markup(t);
    unmount=mount(tools,t);
  }
  new MutationObserver(render).observe(tools,{attributes:true,attributeFilter:['hidden']});
  root.addEventListener('ui-language-change',render);
  render();
})(typeof window==='undefined'?globalThis:window);
