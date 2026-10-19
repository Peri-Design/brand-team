'use strict';
// Exercise production membership enforcement with a fake Feishu server, never real credentials.
process.env.ENABLE_DEV_AUTH='false';
process.env.FEISHU_TENANT_KEY='company';
process.env.FEISHU_APP_ID='fixture';
process.env.FEISHU_APP_SECRET='fixture';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {app,ready}=require('../server');
const good={is_activated:true,is_frozen:false,is_resigned:false,is_exited:false,is_unjoin:false};
let tenant='company',status=good,offline=false,calls=[];
const originalFetch=global.fetch;
global.fetch=async url=>{
 calls.push(url);if(offline)throw Error('offline');
 const result=url.endsWith('/authen/v1/access_token')?{data:{access_token:'fixture-user-token'}}:
 url.endsWith('/authen/v1/user_info')?{data:{open_id:'ou_fixture',name:'Fixture',tenant_key:tenant}}:
 url.endsWith('/tenant_access_token/internal')?{code:0,tenant_access_token:'fixture-tenant-token',expire:7200}:
 {code:0,data:{user:{open_id:'ou_fixture',status}}};
 return {ok:true,json:async()=>result};
};
test.after(()=>{global.fetch=originalFetch;});
const callback=()=>request(app).get('/api/auth/feishu/callback?state=fixture&code=fixture').set('Cookie','pv_oauth_state=fixture; pv_auth_next=assets; pv_auth_entry=domestic; pv_auth_ui=zh');
const cookieOf=response=>response.headers['set-cookie'].find(x=>x.startsWith('pv_session=')).split(';')[0];
test('OAuth verifies tenant and current employee state before creating an internal member',async()=>{
 const {store}=await ready;
 tenant='external';let r=await callback();assert.match(r.headers.location,/organization_denied/);assert.equal(store.users.size,0);
 tenant='company';status={...good,is_frozen:true};r=await callback();assert.match(r.headers.location,/organization_denied/);assert.equal(store.users.size,0);
 status=good;r=await callback();assert.match(r.headers.location,/auth=success&entry=domestic&ui=zh/);
 assert.equal(store.users.get('ou_fixture').accessStatus,'none');assert.equal(store.users.get('ou_fixture').tenantKey,'company');assert.equal(store.accessNotifications.size,0);
 const cookie=cookieOf(r);
 assert.equal((await request(app).get('/assets/AIsphere-black.svg').set('Cookie',cookie)).status,200);
 assert.equal((await request(app).get('/api/cloud/projects').set('Cookie',cookie)).status,403);
 assert.equal((await request(app).post('/api/access/design-request').set('Cookie',cookie)).body.accessStatus,'pending');
});
test('legacy sessions cannot inherit a later verified login; revoked organization invalidates all sessions',async()=>{
 const {store}=await ready;
 await store.upsertUser({openId:'legacy',name:'Legacy'});const oldToken=await store.createSession('legacy',60000);
 await store.upsertUser({openId:'legacy',name:'Legacy',tenantKey:'company'});
 assert.equal((await request(app).get('/assets/AIsphere-black.svg').set('Cookie','pv_session='+oldToken)).status,401);
 status=good;const a=cookieOf(await callback()),b=cookieOf(await callback());
 await store.setUserAccess('ou_fixture','active','fixture-admin');
 status={...good,is_resigned:true};assert.match((await callback()).headers.location,/organization_denied/);
 assert.equal((await request(app).get('/api/cloud/projects').set('Cookie',a)).status,401);
 assert.equal((await request(app).get('/assets/AIsphere-black.svg').set('Cookie',b)).status,401);
});

test('verification service outage is recoverable and does not grant access or revoke good sessions',async()=>{
 status=good;const cookie=cookieOf(await callback());offline=true;
 const callbackResult=await callback();assert.match(callbackResult.headers.location,/verification_unavailable/);assert.doesNotMatch(callbackResult.headers.location,/organization_denied/);
 const page=await request(app).get(callbackResult.headers.location);assert.match(page.text,/暂时无法验证身份/);
 offline=false;
 assert.equal((await request(app).get('/assets/PixVerse-black.svg').set('Cookie',cookie)).status,200);
});
