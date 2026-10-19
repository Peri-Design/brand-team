/* Legacy entry links remain compatible; organization membership alone controls the catalog. */
(function(root){
 'use strict';
 const current=new URL(root.location.href);
 const entry=current.searchParams.get('entry')==='domestic'?'domestic':'international';
 let locale=current.searchParams.get('ui');
 if(!['zh','en'].includes(locale)){try{locale=root.localStorage?.getItem('pixverse-ui-language');}catch{}if(!['zh','en'].includes(locale))locale='zh';}
 function url(value){
  const target=new URL(value,root.location.href);
  if(target.origin!==current.origin)return target.href;
  if(target.pathname.startsWith('/assets/')||target.pathname.startsWith('/api/')&&!target.pathname.startsWith('/api/auth/feishu/start'))return target.href;
  // Only decorate page/navigation routes, never downloads or script/image URLs.
  if(!['/','/index.html','/brand-guidelines.html','/materials','/materials/','/materials/index.html','/api/auth/feishu/start'].includes(target.pathname))return target.href;
  if(!target.searchParams.has('entry'))target.searchParams.set('entry',entry);
  if(!target.searchParams.has('ui'))target.searchParams.set('ui',target.searchParams.get('entry')===entry?locale:target.searchParams.get('entry')==='domestic'?'zh':'en');
  return target.pathname+target.search+target.hash;
 }
 function decorate(link){
  if(link.hasAttribute('download')||!link.getAttribute('href')||link.getAttribute('href').startsWith('#'))return;
  // Re-apply current language when a link decorated before a language switch is used.
  const target=new URL(link.href,root.location.href);
  if(target.origin===current.origin&&target.searchParams.get('entry')===entry)target.searchParams.delete('ui');
  link.href=url(target.href);
 }
 function keepContext(){root.history?.replaceState(root.history.state,'',url(root.location.href));}
 function applyAccess(allowed){
  if(!allowed && root.document?.querySelector('#asset-account')){root.document.body.hidden=true;root.location.replace(url('/?auth=session_expired'));return;}
  for(const [selector,visible] of [['#paiwo-assets',allowed],['#pixlab-assets',allowed],['.pixverse-assets',allowed],['#aisphere-assets',allowed]]){
   const section=root.document?.querySelector(selector);if(section)section.hidden=!visible;
  }
 }
 root.BrandEntry={entry,applyAccess,get locale(){return locale;},url,setLocale(value){
  if(!['zh','en'].includes(value))return;
  locale=value;const target=new URL(root.location.href);target.searchParams.set('entry',entry);target.searchParams.set('ui',locale);
  root.history?.replaceState(root.history.state,'',target.pathname+target.search+target.hash);
  root.document?.querySelectorAll('a[href]').forEach(decorate);
 }};
 keepContext();
 if(!root.document)return;
 function start(){root.document.querySelectorAll('a[href]').forEach(decorate);}
 root.document.addEventListener('click',event=>{const link=event.target.closest('a[href]');if(link)decorate(link);},true);
 if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(window);
