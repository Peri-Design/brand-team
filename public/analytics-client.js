/* First-party metrics only; never include artwork, copy, names or URLs. */
(function(root){
  'use strict';
  let queue=Promise.resolve(),pending=0,lastActive=0,allowed=false;
  function send(event){
    if(pending>=40)return;
    pending++;
    queue=queue.catch(()=>{}).then(async()=>{
      for(let i=0;i<2;i++)try{
        const r=await fetch('/api/analytics/events',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(event),keepalive:true,signal:AbortSignal.timeout(5000)});
        if(r.ok||r.status<500)return;
      }catch{}
    }).finally(()=>pending--);
  }
  function id(){return root.crypto.randomUUID();}
  function active(){if(!allowed||document.visibilityState!=='visible'||Date.now()-lastActive<300000)return;lastActive=Date.now();send({id:id(),kind:'active'});}
  function issues(report){
    const result={};
    for(const row of report.rows||[]){
      const kinds=new Set();
      for(const text of row.issues||[])kinds.add(/未填写|不能为空|缺少.*标题/.test(text)?'missing_copy':/未上传|尚未上传|主视觉.*上传/.test(text)?'missing_image':/文字|标题|文案|行|边界|溢出/.test(text)?'text_layout':'other');
      if(row.warnings?.length)kinds.add('low_resolution');
      for(const key of kinds)result[key]=(result[key]||0)+1;
    }return result;
  }
  function begin(items){
    const token=id();let done=false;
    const emit=(kind,data={})=>send({id:token,kind,...data});
    emit('export_started',{items});
    return {checked(report){emit('export_checked',{result:report.blocked?'blocked':report.warned?'warning':'clear',issues:issues(report)});},
      finish(){if(!done){done=true;emit('export_generated',{items});}},
      confirm(){emit('export_confirmed');},cancel(returned=false){if(!done){done=true;emit(returned?'export_returned':'export_cancelled');}},
      fail(){if(!done){done=true;emit('export_failed');}}};
  }
  function logoDownload(value){
    const url=new URL(value,location.href);if(url.origin!==location.origin)return;
    const match=url.pathname.match(/^\/assets\/(PixVerse-(?:black|white|icon-light|icon-dark)|PixLab-(?:domestic|international)|AIsphere-(?:black|white)|Paiwo-(?:logo-black|logo-white|black|white|white-on-black))\.(svg|png)$/);
    if(match)send({id:id(),kind:'logo_download',asset:match[1],format:match[2]});
  }
  root.BrandAnalytics={begin,logoDownload};
  document.addEventListener('click',event=>{const link=event.target.closest('a[download]');if(link)logoDownload(link.href);});
  document.addEventListener('pointerdown',active,{passive:true});document.addEventListener('keydown',active);document.addEventListener('visibilitychange',active);
  // Confirm session before first activity; subsequent events remain server-authorized.
  fetch('/api/auth/session').then(r=>r.json()).then(s=>{allowed=Boolean(s.authenticated&&(s.user?.isAdmin||s.user?.accessStatus==='active'));if(allowed)active();}).catch(()=>{});
})(window);
