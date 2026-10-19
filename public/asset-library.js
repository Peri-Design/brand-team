/* Catalog A: browsing stays separate from selecting original download files. */
(() => {
  'use strict';
  const root=document.getElementById('brand-asset-library'), catalog=window.BrandAssetCatalog;
  if(!root||!catalog)return;
  const {assets,brands,files,filter,brandName}=catalog;
  const $=s=>root.querySelector(s), $$=s=>[...root.querySelectorAll(s)];
  const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const en=()=>window.PixVerseUI?.locale==='en',t=(zh,english)=>en()?english:zh;
  const icon=id=>`<svg aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const chevron=icon('chevron-right');
  const types=[['','全部类型','All types'],['logo','标准 Logo','Standard logo'],['icon','图标','Icons'],['combo','组合 Logo','Combination logo'],['lab','实验室标志','Lab logo']];
  const state={brand:'',type:'',format:'',query:'',page:1},chosen=new Set(),choices=new Map();
  let dialogMode=null,detailId=null,busy=false,returnFocus=null;
  const dialog=document.createElement('dialog');
  dialog.className='asset-library-dialog';dialog.setAttribute('data-ui-content','');dialog.setAttribute('aria-labelledby','asset-dialog-title');
  document.body.append(dialog);
  const title=a=>en()?a.en:a.title,brand=a=>brandName(a.brand,en()),version=v=>en()?v.en:v.label;
  function selection(a){if(!choices.has(a.id))choices.set(a.id,{versions:a.variants.map((_,i)=>i),formats:[...new Set(a.variants.flatMap(v=>v.exts))]});return choices.get(a.id);}
  const selected=a=>{const s=selection(a);return files(a,s.versions,s.formats);};
  const image=(a,v)=>`<img src="/assets/${v.file}.${v.exts[0]}" alt="${esc(brand(a)+' '+title(a)+' '+version(v))}" class="${a.icon?'is-icon':''}" loading="lazy">`;
  function menu(kind,label,options,current){return `<div class="al-select" data-filter="${kind}"><button type="button" class="al-trigger" aria-label="${esc(label)}" aria-haspopup="listbox" aria-expanded="false" aria-controls="asset-${kind}-options"><span>${esc(options.find(o=>o[0]===current)[1])}</span>${icon('chevron-down')}</button><div id="asset-${kind}-options" class="al-menu" role="listbox" aria-label="${esc(label)}" hidden>${options.map(([value,label])=>`<button type="button" role="option" tabindex="-1" aria-selected="${current===value}" data-value="${esc(value)}"><span>${esc(label)}</span>${icon('check')}</button>`).join('')}</div></div>`;}
  function card(a){return `<article class="al-card"><div class="al-visual ${a.variants[0].dark?'dark':''}"><label class="al-select-card"><input type="checkbox" data-select="${a.id}" aria-label="${esc(t('加入下载清单：','Add to download list: ')+brand(a)+' '+title(a))}" ${chosen.has(a.id)?'checked':''}></label>${image(a,a.variants[0])}<span class="al-version-count">${t(a.variants.length+' 个版本',a.variants.length+' version'+(a.variants.length===1?'':'s'))}</span></div><div class="al-card-info"><p>${esc(brand(a))}</p><h3>${esc(title(a))}</h3><button class="al-detail" data-detail="${a.id}">${t('查看与下载','View & download')}${chevron}</button></div></article>`;}
  function render(){
    closeMenus();
    root.innerHTML=`<header class="al-heading"><div><p class="al-eyebrow">BRAND ASSET LIBRARY</p><h1>${t('品牌素材','Brand assets')}</h1><p class="al-sub">${t('找到合适的素材，让每一次表达保持一致','Find the right assets for a consistent brand expression')}</p></div><div class="al-heading-actions"><a class="al-guide" href="${esc(window.BrandEntry?.url('/brand-guidelines.html')||'/brand-guidelines.html')}">${t('查看使用规范','Usage guidelines')}${chevron}</a><button class="al-queue" data-open-batch>${t('下载清单','Download list')} <span data-chosen-count>${chosen.size}</span></button></div></header><div class="al-toolbar"><label class="al-search">${icon('search')}<input type="search" id="asset-search" aria-label="${t('搜索素材','Search assets')}" placeholder="${t('搜索名称、品牌或版本…','Search name, brand or version…')}" value="${esc(state.query)}"></label>${menu('brand',t('按品牌筛选','Filter by brand'),[['',t('全部品牌','All brands')],...brands.map(b=>[b,brandName(b,en())])],state.brand)}${menu('format',t('按文件格式筛选','Filter by format'),[['',t('全部格式','All formats')],['svg','SVG'],['png','PNG']],state.format)}</div><div class="al-types" aria-label="${t('素材类型','Asset type')}">${types.map(([value,zh,english])=>`<button data-type="${value}" aria-pressed="${value===state.type}">${t(zh,english)}</button>`).join('')}</div><div id="asset-results" aria-live="polite"></div><footer class="al-footer"><span>${t('供外部团队使用的素材请前往官网','For assets to share externally, visit the official websites')}</span><div><a href="https://pixverse.ai/en/brand" target="_blank" rel="noopener noreferrer">PixVerse ${icon('external')}</a><a href="https://aishiai.com/brand" target="_blank" rel="noopener noreferrer">${t('爱诗科技及旗下品牌','AIsphere & product brands')} ${icon('external')}</a></div></footer>`;
    $('#asset-search').oninput=e=>{state.query=e.target.value;state.page=1;renderResults();};
    $$('[data-type]').forEach(b=>b.onclick=()=>{state.type=b.dataset.type;state.page=1;$$('[data-type]').forEach(x=>x.setAttribute('aria-pressed',x===b));renderResults();});
    $('[data-open-batch]').onclick=()=>openDialog('batch');
    bindMenus();renderResults();
  }
  function renderResults(){const list=filter(state),visible=list.slice((state.page-1)*12,state.page*12);
    $('#asset-results').innerHTML=`<div class="al-result-line"><strong>${esc(state.brand?brandName(state.brand,en()):t('全部素材','All assets'))}<span> / ${t(list.length+' 组款式',list.length+' styles')} · ${t(list.reduce((n,a)=>n+files(a,undefined,state.format?[state.format]:['svg','png']).length,0)+' 个文件',list.reduce((n,a)=>n+files(a,undefined,state.format?[state.format]:['svg','png']).length,0)+' files')}</span></strong></div><div class="al-grid">${visible.length?visible.map(card).join(''):`<div class="al-empty"><p>${t('没有找到匹配素材，试试其他关键词或清除筛选','No matching assets. Try another keyword or clear filters')}</p><button data-clear>${t('清除筛选','Clear filters')}</button></div>`}</div>${list.length>12?`<div class="al-pager"><button data-page="-1" ${state.page===1?'disabled':''}>${t('上一页','Previous')}</button><span>${state.page} / ${Math.ceil(list.length/12)}</span><button data-page="1" ${state.page*12>=list.length?'disabled':''}>${t('下一页','Next')}</button></div>`:''}`;
    $$('[data-select]').forEach(c=>c.onchange=()=>{c.checked?chosen.add(c.dataset.select):chosen.delete(c.dataset.select);$('[data-chosen-count]').textContent=chosen.size;});
    $$('[data-detail]').forEach(b=>b.onclick=()=>openDialog('detail',b.dataset.detail));
    $('[data-clear]')?.addEventListener('click',()=>{Object.assign(state,{brand:'',type:'',format:'',query:'',page:1});render();$('#asset-search').focus();});
    $$('[data-page]').forEach(b=>b.onclick=()=>{state.page+=Number(b.dataset.page);renderResults();$('#asset-results').scrollIntoView({block:'start'});});
  }
  function closeMenus(){root.querySelectorAll('.al-select').forEach(s=>{s.querySelector('.al-menu').hidden=true;s.querySelector('.al-trigger').setAttribute('aria-expanded','false');});}
  function bindMenus(){
    $$('.al-select').forEach(s=>{const trigger=s.querySelector('.al-trigger'),menu=s.querySelector('.al-menu'),options=[...menu.querySelectorAll('[role=option]')];
      const open=()=>{closeMenus();menu.hidden=false;trigger.setAttribute('aria-expanded','true');};
      trigger.onclick=()=>menu.hidden?open():closeMenus();
      trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();(options.find(o=>o.getAttribute('aria-selected')==='true')||options[0]).focus();}if(e.key==='Escape')closeMenus();};
      options.forEach((o,i)=>{o.onclick=()=>{state[s.dataset.filter]=o.dataset.value;state.page=1;trigger.querySelector('span').textContent=o.querySelector('span').textContent;options.forEach(x=>x.setAttribute('aria-selected',x===o));closeMenus();renderResults();trigger.focus();};
        o.onkeydown=e=>{let next;if(e.key==='ArrowDown')next=(i+1)%options.length;if(e.key==='ArrowUp')next=(i+options.length-1)%options.length;if(e.key==='Home')next=0;if(e.key==='End')next=options.length-1;if(next!==undefined){e.preventDefault();options[next].focus();}if(e.key==='Escape'){e.preventDefault();closeMenus();trigger.focus();}if(e.key==='Tab')closeMenus();};});
      s.onfocusout=e=>{if(!s.contains(e.relatedTarget)){menu.hidden=true;trigger.setAttribute('aria-expanded','false');}};
    });
  }
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('.al-select'))closeMenus();});
  const formatChoices=a=>[...new Set(a.variants.flatMap(v=>v.exts))].map(ext=>`<label class="al-format"><input type="checkbox" data-format="${ext}" ${selection(a).formats.includes(ext)?'checked':''}>${ext.toUpperCase()}</label>`).join('');
  function optionBlock(a,compact=false){const s=selection(a);return `<section class="al-choice-block" data-item="${a.id}">${compact?`<div class="al-batch-heading"><div><p>${esc(brand(a))}</p><h3>${esc(title(a))}</h3></div><button class="al-remove" data-remove="${a.id}" aria-label="${esc(t('移除：','Remove: ')+brand(a)+' '+title(a))}">${t('移除','Remove')}</button></div>`:''}${files(a).length===1?`<div class="al-single-visual ${a.variants[0].dark?'dark':''}">${image(a,a.variants[0])}</div><div class="al-single-meta"><span>${esc(version(a.variants[0]))}</span><span>PNG · ${t('原始文件','Original file')}</span></div>`:`<fieldset class="al-versions"><legend>${t('选择版本','Select versions')}</legend><label class="al-all"><input type="checkbox" data-all-versions ${s.versions.length===a.variants.length?'checked':''}>${t('全选版本','Select all')}</label><div class="al-version-grid">${a.variants.map((v,i)=>`<label class="al-version"><span class="al-version-art ${v.dark?'dark':''}">${image(a,v)}</span><span class="al-version-caption"><input type="checkbox" data-version="${i}" ${s.versions.includes(i)?'checked':''}>${esc(version(v))}</span></label>`).join('')}</div></fieldset><fieldset class="al-formats"><legend>${t('文件格式','File formats')}</legend><div>${formatChoices(a)}</div></fieldset>`}</section>`;}
  function dialogItems(){return dialogMode==='detail'?assets.filter(a=>a.id===detailId):assets.filter(a=>chosen.has(a.id));}
  function openDialog(mode,id){closeMenus();returnFocus=document.activeElement;dialogMode=mode;detailId=id;renderDialog();dialog.showModal();dialog.querySelector('h2').focus();}
  function renderDialog(){const list=dialogItems(),a=list[0],single=dialogMode==='detail'&&a&&files(a).length===1;
    dialog.classList.toggle('is-single',Boolean(single));dialog.classList.toggle('is-batch',dialogMode==='batch');
    dialog.innerHTML=`<div class="al-dialog-heading"><div><p>${dialogMode==='detail'?esc(brand(a)+' / '+types.find(x=>x[0]===a.type)[en()?2:1]):t('品牌素材','Brand assets')}</p><h2 id="asset-dialog-title" tabindex="-1">${dialogMode==='detail'?esc(title(a)):t('下载清单','Download list')}</h2></div><button class="al-dialog-close" aria-label="${t('关闭详情','Close details')}">${icon('close')}</button></div><div class="al-dialog-body">${list.length?list.map(x=>optionBlock(x,dialogMode==='batch')).join(''):`<div class="al-empty">${t('还没有选择素材，在卡片左上角勾选后可在这里集中下载','No assets selected. Select cards to download them together')}</div>`}</div><div class="al-download-footer"><span class="al-file-count" aria-live="polite"></span><button class="al-download primary">${icon('download')}<span>${single?t('下载 PNG','Download PNG'):t('下载文件','Download files')}</span></button></div><p class="al-download-status" role="status" aria-live="polite"></p>`;
    dialog.querySelector('.al-dialog-close').onclick=()=>dialog.close();
    dialog.querySelectorAll('[data-item]').forEach(block=>{const a=assets.find(x=>x.id===block.dataset.item),s=selection(a),all=block.querySelector('[data-all-versions]');
      const updateAll=()=>{if(all){all.checked=s.versions.length===a.variants.length;all.indeterminate=s.versions.length>0&&s.versions.length<a.variants.length;}};updateAll();
      all?.addEventListener('change',()=>{s.versions=all.checked?a.variants.map((_,i)=>i):[];block.querySelectorAll('[data-version]').forEach(c=>c.checked=all.checked);updateCount();});
      block.querySelectorAll('[data-version]').forEach(c=>c.onchange=()=>{s.versions=c.checked?[...s.versions,Number(c.dataset.version)]:s.versions.filter(x=>x!==Number(c.dataset.version));updateAll();updateCount();});
      block.querySelectorAll('[data-format]').forEach(c=>c.onchange=()=>{s.formats=c.checked?[...s.formats,c.dataset.format]:s.formats.filter(x=>x!==c.dataset.format);updateCount();});
      block.querySelector('[data-remove]')?.addEventListener('click',()=>{chosen.delete(a.id);renderResults();$('[data-chosen-count]').textContent=chosen.size;renderDialog();(dialog.querySelector('[data-remove]')||dialog.querySelector('h2')).focus();});
    });
    dialog.querySelector('.al-download').onclick=download;updateCount();
  }
  function updateCount(){const n=dialogItems().flatMap(selected).length;dialog.querySelector('.al-file-count').textContent=t('已选择 '+n+' 个文件',n+' file'+(n===1?'':'s')+' selected');dialog.querySelector('.al-download').disabled=!n||busy;dialog.querySelector('.al-download-status').textContent='';}
  async function download(){
    if(busy)return;const list=dialogItems(),requested=list.flatMap(selected);if(!requested.length)return;
    busy=true;dialog.querySelectorAll('button,input').forEach(n=>n.disabled=true);
    const status=dialog.querySelector('.al-download-status');status.textContent=t('正在准备文件…','Preparing files…');
    try{
      const loaded=await Promise.all(requested.map(async f=>{const r=await fetch(f.url,{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error([401,403].includes(r.status)?'auth':'file');return {...f,bytes:new Uint8Array(await r.arrayBuffer())};}));
      const blob=loaded.length===1?new Blob([loaded[0].bytes],{type:'application/octet-stream'}):makeAssetZip(loaded);
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=loaded.length===1?loaded[0].asset+'.'+loaded[0].format:dialogMode==='detail'?list[0].brand+'-'+list[0].title+'.zip':t('品牌素材下载清单.zip','Brand-assets.zip');
      document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      loaded.forEach(f=>window.BrandAnalytics?.logoDownload(f.url));
      status.textContent=loaded.length===1?t('已发起原始文件下载','Original file download started'):t('已发起 ZIP 下载，包含 '+loaded.length+' 个原始文件','ZIP download started with '+loaded.length+' original files');
    }catch(error){status.textContent=error.message==='auth'?t('登录已失效，请刷新页面重新登录','Your session has expired. Refresh to sign in again'):t('文件准备失败，请重试','Could not prepare files. Please retry');}
    finally{busy=false;dialog.querySelectorAll('button,input').forEach(n=>n.disabled=false);dialog.querySelector('.al-download').disabled=!dialogItems().flatMap(selected).length;}
  }
  dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
  dialog.addEventListener('click',e=>{if(e.target===dialog&&!busy){const b=dialog.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)dialog.close();}});
  dialog.addEventListener('close',()=>{dialogMode=null;if(returnFocus?.isConnected)returnFocus.focus();});
  document.addEventListener('click',e=>{if(e.target.closest('.rail')&&dialog.open&&!busy)dialog.close();});
  window.addEventListener('ui-language-change',()=>{render();if(dialog.open&&!busy)renderDialog();});
  function applyHash(){const key=location.hash;const map={'#pixverse-logo-title':'PixVerse','#paiwo-assets':'拍我 AI','#pixlab-assets':'PixLab','#aisphere-assets':'爱诗科技'};if(map[key]){state.brand=map[key];state.page=1;render();}}
  window.addEventListener('hashchange',applyHash);
  render();applyHash();
})();
