(function(root){
 'use strict';
 // Serial saves retain the revision of the exact server snapshot, even while typing.
 class CloudFile {
  constructor({request,backup,status=()=>{},linked=()=>{}}){Object.assign(this,{request,backup,status,linked});this.id=null;this.revision=null;this.pending=null;this.chain=Promise.resolve();this.conflict=false;}
  async open(id,fresh){
   const data=id?await this.request('/api/cloud/projects/'+encodeURIComponent(id)):await this.request('/api/cloud/projects',{method:'POST',body:JSON.stringify({project:fresh})});
   this.id=data.project.id;this.revision=data.project.revision;this.linked(this.id);
   const remote=id?data.project.payload:fresh;
   if(remote.version!==2)throw Error('此文件使用原编辑器，请从文件中心打开。');
   const local=await this.backup.read(this.id);
   if(local?.pending){this.pending=local.pending;this.conflict=local.revision!==this.revision;this.status(this.conflict?'conflict':'pending');return local.pending.project;}
   this.status('saved');return remote;
  }
  async stage(project,preview){
   this.pending={project:structuredClone(project),preview};this.status(this.conflict?'conflict':'pending');
   await this.backup.write(this.id,{revision:this.revision,pending:this.pending});
  }
  flush(asCopy=false){
   const work=async()=>{
    if(!this.pending)return true;if(this.conflict&&!asCopy)return false;
    const snapshot=this.pending;this.status('saving');
    try{
     const data=await this.request(asCopy?'/api/cloud/projects':'/api/cloud/projects/'+encodeURIComponent(this.id),{method:asCopy?'POST':'PUT',body:JSON.stringify({...snapshot,...(asCopy?{}:{baseRevision:this.revision})})});
     const oldId=this.id;this.id=data.project.id;this.revision=data.project.revision;this.linked(this.id);this.conflict=false;
     if(this.pending===snapshot)this.pending=null;
     await this.backup.write(this.id,{revision:this.revision,pending:this.pending});
     if(oldId!==this.id)await this.backup.write(oldId,{pending:null});
     this.status(this.pending?'pending':'saved');return true;
    }catch(e){if(e.status===409)this.conflict=true;this.status(this.conflict?'conflict':'error',e.message);return false;}
   };
   this.chain=this.chain.catch(()=>{}).then(work);return this.chain;
  }
 }
 if(typeof module==='object'&&module.exports){module.exports={CloudFile};return;}
 const doc=root.document,label=doc.querySelector('#save-status'),retry=doc.querySelector('#cloud-retry');
 let file,timer,staging=Promise.resolve(),storageReady=true;
 const request=async(url,options={})=>{const response=await fetch(url,{...options,headers:{'Content-Type':'application/json'}});const data=await response.json();if(!response.ok){const e=Error(data.error||'云端服务暂不可用');e.status=response.status;throw e;}return data;};
 function status(value,error){label.dataset.error=String(['error','conflict'].includes(value));label.textContent={saved:'已保存到云端',pending:'有修改待同步',saving:'正在同步云端…',error:'同步失败 · 本机副本已保留',conflict:'云端已有新版本 · 当前修改未覆盖'}[value];label.title=error||'';retry.hidden=!['error','conflict'].includes(value);retry.textContent=value==='conflict'?'保存为副本':'重试同步';}
 async function open(fresh){
  const session=await request('/api/auth/session');if(!session.authenticated||!session.user||!session.user.isAdmin&&session.user.accessStatus!=='active'){location.href='/?view=new';throw Error('请登录并开通设计权限');}
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('pixverse-material-cloud-recovery',1);r.onupgradeneeded=()=>r.result.createObjectStore('files');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const backup={read:id=>new Promise((resolve,reject)=>{const r=db.transaction('files').objectStore('files').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}),write:(id,value)=>new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(value,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('恢复副本写入失败'));})};
  file=new CloudFile({request,backup,status,linked:id=>{const url=new URL(location.href);url.searchParams.set('project',id);history.replaceState({},'',url);}});
  const state=await file.open(new URL(location.href).searchParams.get('project'),fresh);
  if(file.pending&&!file.conflict)timer=setTimeout(()=>file.flush(),1000);
  retry.onclick=()=>flush(file.conflict);
  return state;
 }
 function save(project,preview){
  clearTimeout(timer);
  staging=staging.catch(()=>{}).then(()=>file.stage(project,preview)).then(()=>{storageReady=true;timer=setTimeout(()=>file.flush(),1200);}).catch(e=>{storageReady=false;label.textContent='本机恢复失败 · 请勿关闭页面';label.title=e.message;retry.hidden=false;});
  return staging;
 }
 async function flush(asCopy=false){clearTimeout(timer);await staging;clearTimeout(timer);const result=await file.flush(asCopy);if(result&&!file.pending)storageReady=true;return result&&storageReady&&!file.pending;}
 root.addEventListener('beforeunload',e=>{if(file?.pending){e.preventDefault();e.returnValue='';}});
 root.MaterialCloud={open,save,flush};
})(typeof window==='undefined'?globalThis:window);
