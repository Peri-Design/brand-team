/* Interface-only localization. Project values and canvas rendering stay untouched. */
(function(root){
 'use strict';
 const KEY='pixverse-ui-language';
 const messages=root.PixVerseEnglish||{};
 let storage;try{storage=root.localStorage;}catch{}
 let locale;try{locale=storage?.getItem(KEY);}catch{}
 if(!['zh','en'].includes(locale))locale=/^zh\b/i.test(root.navigator?.language||'zh')?'zh':'en';
 const records=new WeakMap();
 const protectedSelector='script,style,[contenteditable], [data-ui-content], [translate="no"],.project-title-row h4,.admin-member-profile strong,.admin-file>strong,.admin-file-owner-name,.material .choose strong,.card-head h3,#inspector>.row>h2,#cloud-user-name,#cloud-avatar-fallback';
 const patterns=[];
 function t(source,language=locale){
  if(language==='zh'||typeof source!=='string')return source;
  const text=source.trim();let result=Object.prototype.hasOwnProperty.call(messages,text)?messages[text]:undefined;
  if(result===undefined){for(const [pattern,format] of patterns){const match=text.match(pattern);if(match){result=format(...match.slice(1));break;}}}
  if(result===undefined&&/ · |；| \/ /.test(text)){const parts=text.split(/( · |；| \/ )/);const translated=parts.map(p=>p==='；'?'; ':t(p,language));if(translated.some((p,i)=>p!==parts[i]))result=translated.join('');}
  return result===undefined?source:source.slice(0,source.indexOf(text))+result+source.slice(source.indexOf(text)+text.length);
 }
 patterns.push(
  [/^第 (\d+) 步，共 (\d+) 步$/, (n,total)=>`Step ${n} of ${total}`],
  [/^已选 (\d+) 种物料$/, n=>`${n} format${n==='1'?'':'s'} selected`],
  [/^添加 (\d+) 种物料$/, n=>`Add ${n} format${n==='1'?'':'s'}`],
  [/^(\d+) 种语言$/, n=>`${n} language${n==='1'?'':'s'}`],
  [/^(\d+) 个文件$/, n=>`${n} file${n==='1'?'':'s'}`],
  [/^(\d+) 种版式$/, n=>`${n} layouts`],
  [/^物料语言 · (.+)$/, s=>`Material languages · ${t(s)}`],
  [/^当前账号：(.+)$/, name=>`Account: ${name}`],
  [/^请输入(标题|副标题|主标题|系列名)$/, label=>`Enter ${t(label).toLowerCase()}`],
  [/^(.+)规范图例$/, s=>`${t(s)} layout example`],
  [/^(\d+) 度$/, n=>`${n} degrees`],
  [/^(左上|右上|左下|右下)角缩放，方向键调整$/, s=>`${t(s)} resize handle; use arrow keys`],
  [/^过渡范围 (\d+)%$/, n=>`Blend range ${n}%`],
  [/^模板色块 · (.+)$/, s=>`Template colors · ${t(s)}`],
  [/^(.*)，当前 (#[\da-f]+)$/i, (label,color)=>`${t(label)}; current ${color}`],
  [/^第(一|二)种规范图例$/, n=>`${n==='一'?'First':'Second'} layout example`],
  [/^(.+)（⌘(.*)）$/, (s,k)=>`${t(s)} (⌘${k})`]
 );
 patterns.push(
  [/^将“(.*)”移到回收站？可在 30 天内恢复。$/, name=>`Move “${name}” to trash? You can restore it within 30 days.`],
  [/^永久删除“(.*)”？此操作无法撤销。$/, name=>`Permanently delete “${name}”? This cannot be undone.`],
  [/^永久删除回收站内的 (\d+) 个文件？此操作无法撤销。$/, n=>`Permanently delete ${n} files from trash? This cannot be undone.`],
  [/^(批准|停用|设为待审核)“(.*)”的设计权限？$/, (action,name)=>`${t(action)} design access for “${name}”?`],
  [/^已(批准|停用|设为待审核)(.*)的设计权限。$/, (action,name)=>`Design access updated for “${name}”: ${t(action).toLowerCase()}.`],
  [/^更多文件操作：(.*)$/, name=>`More file actions: ${name}`],
  [/^(.*) 文件预览$/, name=>`File preview: ${name}`],
  [/^编辑于 (\d+) (分钟|小时|天)前$/, (n,unit)=>`Edited ${n} ${{分钟:'minute',小时:'hour',天:'day'}[unit]}${n==='1'?'':'s'} ago`],
  [/^登录于 (\d+) (分钟|小时|天)前$/, (n,unit)=>`Signed in ${n} ${{分钟:'minute',小时:'hour',天:'day'}[unit]}${n==='1'?'':'s'} ago`],
  [/^编辑于 (\d{4}[\/\-].+)$/, date=>`Edited ${date}`],
  [/^已检查所选 (\d+) 张图片，其中 (\d+) 张需要修改后才能下载。$/, (n,blocked)=>`Checked ${n} image${n==='1'?'':'s'}. ${blocked} need changes before downloading.`],
  [/^已检查所选 (\d+) 张图片，其中 (\d+) 张使用的原图分辨率偏低。建议更换更大图片，也可确认后继续下载。$/, (n,warned)=>`Checked ${n} image${n==='1'?'':'s'}. Low-resolution originals: ${warned}. Use larger images, or confirm to download anyway.`],
  [/^(标题|主标题|副标题|App 主标题|App 双行标题|Web 标题)(字形超出安全区，请调整文案|超出固定文字区，请缩短文案或调整换行)$/, (label,issue)=>`${t(label)}: ${t(issue)}`],
  [/^未改动已保存的内容。(.*)$/, detail=>`Your saved content has not been changed. ${t(detail)}`],
  [/^(.+失败[：，]|规范字体不支持字符：|暂时无法返回：|暂时无法刷新权限：|管理数据暂时无法读取：|保存失败，请勿关闭页面：)(.*)$/, (prefix,detail)=>`${messages[prefix]||prefix}${detail?t(detail):''}`]
 );
 function update(node,key,value,write){
  let fields=records.get(node);if(!fields)records.set(node,fields=new Map());
  let entry=fields.get(key);if(!entry||value!==entry.applied)entry={source:value};
  const next=t(entry.source);entry.applied=next;fields.set(key,entry);if(next!==value)write(next);
 }
 function translateNode(node){
  if(node.nodeType===3){if(!node.parentElement?.closest(protectedSelector+',textarea,canvas'))update(node,'text',node.data,v=>{node.data=v;});return;}
  if(node.nodeType!==1||node.matches(protectedSelector)||node.closest('[data-ui-content],[translate="no"]'))return;
  for(const key of ['title','placeholder','aria-label','aria-valuetext','alt'])if(node.hasAttribute(key)&&!(key==='aria-label'&&node.hasAttribute('data-ui-label')))update(node,key,node.getAttribute(key),v=>node.setAttribute(key,v));
  if(node.hasAttribute('data-ui-label')){
   const kind=node.dataset.uiLabel,name=node.dataset.uiName||'',language=node.dataset.uiMaterialLanguage||'';
   const labels={focus:locale==='en'?`Focus edit: ${name} ${t(language)}`:`聚焦编辑 ${name} ${language}`,remove:locale==='en'?`Remove ${name}`:`移除${name}`,canvas:locale==='en'?`${name} ${t(language)}; click to select image; arrow keys to move`:`${name} ${language}，点击选中图片；方向键移动`};
   if(labels[kind]&&node.getAttribute('aria-label')!==labels[kind])node.setAttribute('aria-label',labels[kind]);
  }
  if(!node.matches('textarea,canvas'))for(const child of node.childNodes)translateNode(child);
 }
 function refresh(){
  if(!root.document)return;
  root.document.documentElement.lang=locale==='zh'?'zh-CN':'en';
  translateNode(root.document.documentElement);
  root.document.querySelectorAll('.ui-language').forEach(group=>{
   group.setAttribute('aria-label',locale==='zh'?'界面语言':'Interface language');
   group.title=locale==='zh'?'界面语言（不改变物料文案）':'Interface language (does not change design copy)';
  });
  root.document.querySelectorAll('[data-ui-language]').forEach(button=>{
   button.setAttribute('aria-pressed',String(button.dataset.uiLanguage===locale));
  });
 }
 function setLocale(value){if(!['zh','en'].includes(value))return;locale=value;try{storage?.setItem(KEY,value);}catch{}refresh();root.dispatchEvent?.(new CustomEvent('ui-language-change',{detail:{locale}}));}
 function originalText(node){if(!node)return '';if(node.nodeType===3)return records.get(node)?.get('text')?.source??node.data;return [...node.childNodes].map(originalText).join('');}
 function originalAttribute(node,key){return records.get(node)?.get(key)?.source??node.getAttribute(key);}
 root.PixVerseUI={t,setLocale,get locale(){return locale;},refresh,originalText,originalAttribute,KEY};
 if(typeof module==='object'&&module.exports)module.exports=root.PixVerseUI;
 if(!root.document)return;
 root.document.documentElement.lang=locale==='zh'?'zh-CN':'en';
 function start(){
  refresh();
  new MutationObserver(changes=>{const targets=new Set();for(const change of changes){if(change.type==='childList')change.addedNodes.forEach(n=>targets.add(n));else targets.add(change.target);}for(const node of targets)if(node.isConnected)translateNode(node);}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['title','placeholder','aria-label','aria-valuetext','alt']});
  document.addEventListener('click',event=>{const button=event.target.closest('button[data-ui-language]');if(button&&button.dataset.uiLanguage!==locale)setLocale(button.dataset.uiLanguage);});
  root.addEventListener('storage',event=>{if(event.key===KEY&&['zh','en'].includes(event.newValue)){locale=event.newValue;refresh();}});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(typeof window==='undefined'?globalThis:window);
