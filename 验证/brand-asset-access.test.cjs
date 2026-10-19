'use strict';
process.env.ENABLE_DEV_AUTH='true';
process.env.FEISHU_BOOTSTRAP_ADMIN_NAME='Asset QA Admin';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {app,ready}=require('../server');
const assets=['black.svg','white.svg','black.png','white.png'].map(s=>'/assets/AIsphere-'+s);
async function login(id,status,name=id){const {store}=await ready;await store.upsertUser({openId:id,name});if(status)await store.setUserAccess(id,status);return 'pv_session='+await store.createSession(id,60000);}
test('anonymous users cannot see or directly download restricted AIsphere assets',async()=>{
 const page=await request(app).get('/');assert.doesNotMatch(page.text,/aisphere-assets|assets\/AIsphere-/);
 for(const url of [...assets,'/assets/%41Isphere-black.svg','/assets//AIsphere-white.png']){
  const result=await request(app).get(url);assert.equal(result.status,401,url);assert.match(result.headers['cache-control'],/no-store/);
 }
});
test('internal members can download all logos independently of design approval',async()=>{
 for(const status of ['none','pending','active','suspended']) {
  const cookie=await login('asset-'+status,status);
  for(const entry of ['domestic','international']){
   const page=await request(app).get('/?entry='+entry).set('Cookie',cookie);
   assert.match(page.text,/id="brand-asset-library"/);for(const asset of assets)assert.ok(page.text.includes(asset.replace(/^\//,'')));
  }
  for(const url of assets){const r=await request(app).get(url).set('Cookie',cookie);assert.equal(r.status,200);assert.match(r.headers['cache-control'],/private, no-store/);}
  assert.equal((await request(app).post('/api/analytics/events').set('Cookie',cookie).send({kind:'logo_download',id:'member-logo-'+status,asset:'AIsphere-black',format:'png'})).status,204);
  assert.equal((await request(app).get('/api/cloud/projects').set('Cookie',cookie)).status,status==='active'?200:403);
 }
});
test('design suspension retains logos; account session revocation blocks internal downloads',async()=>{
 const cookie=await login('revoked-assets','active');const {store}=await ready;
 await store.setUserAccess('revoked-assets','suspended');
 assert.equal((await request(app).head(assets[0]).set('Cookie',cookie)).status,200);
 await store.revokeUserSessions('revoked-assets');
 assert.equal((await request(app).head(assets[0]).set('Cookie',cookie)).status,401);
 assert.equal((await request(app).get('/assets/PixVerse-black.svg')).status,401);
});
test('login alone sends no request; explicit requests are idempotent and cannot self-approve',async()=>{
 const {store}=await ready;const cookie=await login('requester');
 await store.upsertUser({openId:'asset-admin',name:'Asset QA Admin'});
 await store.enqueueAccessNotifications();
 assert.equal([...store.accessNotifications.values()].filter(n=>n.applicantOpenId==='requester').length,0);
 assert.equal((await request(app).get('/api/auth/session').set('Cookie',cookie)).body.user.accessStatus,'none');
 assert.equal((await request(app).post('/api/access/design-request')).status,401);
 assert.equal((await request(app).post('/api/access/design-request').set('Cookie',cookie).set('Origin','https://evil.example')).status,403);
 for(let i=0;i<2;i++)assert.equal((await request(app).post('/api/access/design-request').set('Cookie',cookie).send({accessStatus:'active'})).body.accessStatus,'pending');
 await store.enqueueAccessNotifications();
 assert.equal([...store.accessNotifications.values()].filter(n=>n.applicantOpenId==='requester').length,1);
 assert.equal((await request(app).get('/app.js').set('Cookie',cookie)).status,403);
 await store.setUserAccess('requester','suspended');
 assert.equal((await request(app).post('/api/access/design-request').set('Cookie',cookie)).status,403);
 assert.equal(store.users.get('requester').accessStatus,'suspended');
});
