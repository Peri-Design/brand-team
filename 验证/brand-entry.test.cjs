'use strict';
process.env.ENABLE_DEV_AUTH='true';
process.env.FEISHU_BOOTSTRAP_ADMIN_NAME='Entry QA Admin';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {app,ready}=require('../server');
const dist=path.join(__dirname,'../public');
async function login(id,status,name=id){const {store}=await ready;await store.upsertUser({openId:id,name});if(status)await store.setUserAccess(id,status,'qa');return 'pv_session='+await store.createSession(id,60000);}
test('entry and authorization matrix; UI language never widens catalog or admin access',async()=>{
 const identities=[['',false], [await login('pending-entry'),true],[await login('suspended-entry','suspended'),true],[await login('active-entry','active'),true],[await login('admin-entry',null,'Entry QA Admin'),true]];
 for(const [cookie,allowed] of identities)for(const entry of ['domestic','international'])for(const ui of ['zh','en']){
  let req=request(app).get(`/?entry=${entry}&ui=${ui}`);if(cookie)req=req.set('Cookie',cookie);const res=await req;assert.equal(res.status,200);
  assert.equal(res.text.includes('id="brand-asset-library"'),allowed);
  assert.equal(res.text.includes('assets/PixVerse-black.svg'),allowed);
  assert.equal(res.text.includes('assets/AIsphere-black.svg'),allowed);
  assert.doesNotMatch(res.text,/\.psd|Paiwo-white-on-black/i);assert.match(res.headers['cache-control'],/no-store/);
 }
 const cookie=identities[3][0];assert.equal((await request(app).get('/api/admin/overview').set('Cookie',cookie)).status,403);
 await (await ready).store.setUserAccess('active-entry','suspended');
 assert.match((await request(app).get('/?entry=domestic').set('Cookie',cookie)).text,/brand-asset-library/);
 assert.equal((await request(app).get('/api/cloud/projects').set('Cookie',cookie)).status,403);
 assert.equal((await (await ready).store.upsertUser({openId:'pending-entry',name:'pending-entry'})).accessStatus,'none');
});
test('entry survives authentication reuse, callback error and editor access gate',async()=>{
 const cookie=await login('entry-auth','active');
 const reuse=await request(app).get('/api/auth/feishu/start?next=files&entry=domestic&ui=en').set('Cookie',cookie);
 assert.equal(reuse.headers.location,'/?view=files&entry=domestic&ui=en');
 const cancel=await request(app).get('/api/auth/feishu/callback?state=ok').set('Cookie','pv_oauth_state=ok; pv_auth_next=files; pv_auth_entry=domestic; pv_auth_ui=en');
 assert.equal(cancel.headers.location,'/?view=files&auth=cancelled&entry=domestic&ui=en');
 assert.equal((await request(app).get('/materials/?entry=domestic')).headers.location,'/?view=new&entry=domestic');
});
function boot(href,saved='zh'){
 const location={href},values=new Map([['pixverse-ui-language',saved]]);
 const window={location,history:{state:null,replaceState(_state,_title,url){location.href=new URL(url,location.href).href;}},localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)}};
 const context=vm.createContext({window,URL,CustomEvent:class{}});
 for(const file of ['brand-entry.js','ui-messages.js','ui-i18n.js'])vm.runInContext(fs.readFileSync(path.join(dist,file),'utf8'),context);
 return window;
}
test('language preference is independent from legacy entry; navigation, reload and manual switching preserve context',()=>{
 for(const [entry,expected] of [['domestic','zh'],['international','en']]){
  const w=boot('http://localhost/?entry='+entry,expected);assert.equal(w.PixVerseUI.locale,expected);
  const other=expected==='zh'?'en':'zh';w.PixVerseUI.setLocale(other);assert.equal(w.BrandEntry.entry,entry);
  const next=w.BrandEntry.url('/materials/?project=example');assert.match(next,new RegExp('entry='+entry));assert.match(next,new RegExp('ui='+other));
  assert.equal(boot('http://localhost'+next).PixVerseUI.locale,other);
  assert.equal(boot(w.location.href).PixVerseUI.locale,other);
  assert.equal(w.BrandEntry.url('/assets/Paiwo-black.png'),'http://localhost/assets/Paiwo-black.png');
  assert.equal(boot('http://localhost/?entry='+entry,other).PixVerseUI.locale,other);
 }
 assert.equal(boot('http://localhost/?entry=unknown').BrandEntry.entry,'international');
});
test('Paiwo employee downloads retain exact supplied bytes and clicks',async()=>{
 const cookie=await login('paiwo-member');
 const folder='/Users/katherine/Desktop/设计资产/拍我AI（国内新logo）';
 const pairs=[['black','联合logo（黑）.png'],['white','联合logo（透明）.png']];
 for(const [key,source] of pairs){const res=await request(app).get('/assets/Paiwo-'+key+'.png').set('Cookie',cookie);assert.equal(res.status,200);assert.equal(Buffer.compare(res.body,fs.readFileSync(path.join(dist,'assets','Paiwo-'+key+'.png'))),0);
  if(fs.existsSync(path.join(folder,source)))assert.equal(Buffer.compare(res.body,fs.readFileSync(path.join(folder,source))),0);
  const event=await request(app).post('/api/analytics/events').set('Cookie',cookie).send({id:'paiwo-test-'+key,kind:'logo_download',asset:'Paiwo-'+key,format:'png'});assert.equal(event.status,204);
 }
 assert.equal((await request(app).post('/api/analytics/events').send({id:'invalid-svg',kind:'logo_download',asset:'Paiwo-black',format:'svg'})).status,400);
});

test('session expiry restores the entry catalog without waiting for a page reload',()=>{
 for(const entry of ['domestic','international']){
  const w=boot('http://localhost/?entry='+entry);const sections=Object.fromEntries(['#paiwo-assets','.pixverse-assets','#aisphere-assets'].map(k=>[k,{hidden:false}]));
  w.document={querySelector:s=>sections[s]};w.BrandEntry.applyAccess(true);assert.ok(Object.values(sections).every(s=>!s.hidden));
  w.BrandEntry.applyAccess(false);assert.equal(sections['#paiwo-assets'].hidden,true);assert.equal(sections['.pixverse-assets'].hidden,true);assert.equal(sections['#aisphere-assets'].hidden,true);
 }
});
