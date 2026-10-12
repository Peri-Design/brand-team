'use strict';
process.env.ENABLE_DEV_AUTH='true';
process.env.FEISHU_BOOTSTRAP_ADMIN_NAME='Asset QA Admin';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {app,ready}=require('../server');
const assets=['black.svg','white.svg','black.png','white.png'].map(s=>'/assets/AIsphere-'+s);
async function login(id,status,name=id){const {store}=await ready;await store.upsertUser({openId:id,name});if(status)await store.setUserAccess(id,status);return 'pv_session='+await store.createSession(id,60000);}
test('anonymous, pending and suspended users cannot see or download AIsphere assets',async()=>{
 for(const cookie of ['',await login('pending-assets'),await login('suspended-assets','suspended')]){
  const client=request(app);let page=client.get('/?view=assets');if(cookie)page=page.set('Cookie',cookie);const response=await page;
  assert.equal(response.status,200);assert.doesNotMatch(response.text,/aisphere-assets|assets\/AIsphere-/);assert.match(response.text,/assets\/PixVerse-black.svg/);
  for(const url of [...assets,'/assets/%41Isphere-black.svg','/assets//AIsphere-white.png']){
   let req=client.get(url);if(cookie)req=req.set('Cookie',cookie);const asset=await req;assert.equal(asset.status,cookie?403:401,url);assert.match(asset.headers['cache-control'],/no-store/);
  }
 }
});
test('approved users and admins retain AIsphere previews and downloads; revocation takes effect',async()=>{
 const active=await login('active-assets','active'),admin=await login('admin-assets',null,'Asset QA Admin');
 for(const cookie of [active,admin]){
  const page=await request(app).get('/').set('Cookie',cookie);assert.match(page.text,/id="aisphere-assets" aria-labelledby="aisphere-logo-title">/);
  for(const url of assets){const asset=await request(app).get(url).set('Cookie',cookie);assert.equal(asset.status,200);assert.match(asset.headers['cache-control'],/private, no-store/);}
 }
 const {store}=await ready;await store.setUserAccess('active-assets','suspended');
 assert.equal((await request(app).head(assets[0]).set('Cookie',active)).status,403);
 assert.doesNotMatch((await request(app).get('/').set('Cookie',active)).text,/aisphere-assets/);
 assert.equal((await request(app).get('/assets/PixVerse-black.svg')).status,200);
 assert.equal((await request(app).get('/brand-guidelines.html')).status,200);
});
