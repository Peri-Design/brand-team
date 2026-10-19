'use strict';
process.env.ENABLE_DEV_AUTH='true';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {app,ready}=require('../server');
async function member(){const {store}=await ready;await store.upsertUser({openId:'internal-only',name:'成员'});return 'pv_session='+await store.createSession('internal-only',60000);}
test('all asset variants, encoded URLs, HEAD and Range fail closed for anonymous visitors',async()=>{
 const paths=['/assets/PixVerse-black.svg','/assets/Paiwo-black.png','/assets/AIsphere-white.png','/assets/demo.png','/assets//PixVerse-black.svg','/%61ssets/PixVerse-black.svg','/assets/%50ixVerse-black.svg','/assets/fonts/missing.woff2','/materials/examples/missing.png'];
 for(const path of paths)for(const method of ['get','head']){
 const res=await request(app)[method](path).set('Range','bytes=0-30');assert.equal(res.status,401,method+' '+path);assert.match(res.headers['cache-control']||'',/no-store/);
 }
 for(const path of ['/?entry=domestic','/?entry=international&ui=en','/index.html','/brand-guidelines.html','/?view=admin']){
 const res=await request(app).get(path);assert.equal(res.status,200);assert.doesNotMatch(res.text,/assets\/|paiwo-assets|pixverse-logo-title|aisphere-assets/);assert.match(res.text,/organization-gate/);
 }
});
test('employee without design approval can access every brand and guidelines; logout closes all assets',async()=>{
 const cookie=await member();
 for(const path of ['/assets/PixVerse-black.svg','/assets/Paiwo-black.png','/assets/AIsphere-white.png','/brand-guidelines.html']){
 const r=await request(app).get(path).set('Cookie',cookie);assert.equal(r.status,200);assert.match(r.headers['cache-control'],/private, no-store/);
 }
 assert.equal((await request(app).get('/api/cloud/projects').set('Cookie',cookie)).status,403);
 assert.equal((await request(app).get('/api/admin/overview').set('Cookie',cookie)).status,403);
 await request(app).post('/api/auth/logout').set('Cookie',cookie);
 assert.equal((await request(app).get('/assets/PixVerse-black.svg').set('Cookie',cookie)).status,401);
});
test('access feedback distinguishes nonmembers, expired sessions and temporary verification errors in both languages',async()=>{
 for(const [reason,zh,en] of [['organization_denied','当前账号无访问权限','This account does not have access'],['verification_unavailable','暂时无法验证身份','Unable to verify your identity'],['session_expired','请重新验证身份','Please verify your identity again']]){
 for(const [ui,copy] of [['zh',zh],['en',en]]){
 const r=await request(app).get('/?auth='+reason+'&ui='+ui);assert.ok(r.text.includes(copy));assert.doesNotMatch(r.text,/assets\//);
 }}
 const page=await request(app).get('/?ui=%22%3E%3Cscript%3E&view=%22%3E%3Cscript%3E');assert.doesNotMatch(page.text,/<script>/);
});
test('encoded workspace entry and script paths cannot bypass design permission',async()=>{
 const cookie=await member();
 for(const path of ['/%61pp.js','/%6daterials/model.js','/materials/../%61pp.js']){
 const r=await request(app).get(path).set('Cookie',cookie);assert.equal(r.status,403,path);
 }
 const r=await request(app).get('/%69ndex.html').set('Cookie',cookie);assert.equal(r.status,200);assert.match(r.text,/access-public\.js/);assert.doesNotMatch(r.text,/src="app\.js/);
});
