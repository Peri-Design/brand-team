'use strict';
process.env.ENABLE_DEV_AUTH='true';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),request=require('supertest');
const {app,ready}=require('../server');
const catalog=require('../public/asset-catalog');
const retired=['Paiwo-logo-black.svg','Paiwo-logo-white.svg','Paiwo-logo-black.png','Paiwo-logo-white.png','Paiwo-black.png','Paiwo-white.png'];
test('withdrawn Paiwo Logo groups are absent from search, ZIP selections, fallback links and member downloads',async()=>{
 const {store}=await ready;
 await store.upsertUser({openId:'paiwo-withdrawal-qa',name:'Withdrawal QA'});
 const cookie='pv_session='+await store.createSession('paiwo-withdrawal-qa',60000);
 assert.ok(catalog.assets.every(item=>!['paiwo-logo','paiwo-combo'].includes(item.id)));
 assert.ok(!catalog.brands.includes('拍我 AI'));
 const files=catalog.assets.flatMap(item=>catalog.files(item));
 assert.ok(files.every(file=>!retired.includes(path.basename(file.url))));
 for(const filename of retired){
  const url='/assets/'+filename;
  assert.equal(fs.existsSync(path.join(__dirname,'../public',url)),false,filename);
  assert.equal((await request(app).get(url).set('Cookie',cookie)).status,404,url);
  assert.equal((await request(app).head(url).set('Cookie',cookie)).status,404,url+' HEAD');
  assert.equal((await request(app).get(url.replace('/assets/','/%61ssets/')).set('Cookie',cookie).set('Range','bytes=0-3')).status,404,url+' encoded Range');
 }
 for(const entry of ['domestic','international']){
  const page=await request(app).get('/?view=assets&entry='+entry).set('Cookie',cookie);
  assert.equal(page.status,200);
  for(const filename of retired)assert.ok(!page.text.includes('assets/'+filename),filename);
 }
});
