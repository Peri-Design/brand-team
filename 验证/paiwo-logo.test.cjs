'use strict';
process.env.ENABLE_DEV_AUTH='true';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),request=require('supertest');
const {app,ready}=require('../server');
test('independent Paiwo originals support PNG/SVG while combination logos remain available',async()=>{
 const {store}=await ready;await store.upsertUser({openId:'paiwo-original-qa',name:'Logo QA'});
 const cookie='pv_session='+await store.createSession('paiwo-original-qa',60000);
 for(const [color,folder,stem] of [['black','黑色','拍我AI-黑色'],['white','白色','拍我AI']])for(const format of ['png','svg']){
  const url='/assets/Paiwo-logo-'+color+'.'+format;
  assert.equal((await request(app).get(url)).status,401);
  const response=await request(app).get(url).set('Cookie',cookie);assert.equal(response.status,200);
  const served=Buffer.isBuffer(response.body)?response.body:Buffer.from(response.text);
  assert.deepEqual(served,fs.readFileSync(path.join(__dirname,'../public',url)));
  const original=path.join('/Users/katherine/Desktop/设计资产/拍我logo/图形+拍我AI',folder,stem+'.'+format);
  if(fs.existsSync(original))assert.deepEqual(served,fs.readFileSync(original));
  const event=await request(app).post('/api/analytics/events').set('Cookie',cookie).send({id:'paiwo-original-'+color+'-'+format,kind:'logo_download',asset:'Paiwo-logo-'+color,format});assert.equal(event.status,204);
 }
 const page=await request(app).get('/?view=assets').set('Cookie',cookie);
 assert.match(page.text,/PixVerse × 拍我 AI · 组合 Logo（黑色）/);
 assert.match(page.text,/PixVerse × 拍我 AI · 组合 Logo（白色）/);
 for(const color of ['black','white'])assert.equal((await request(app).get('/assets/Paiwo-'+color+'.png').set('Cookie',cookie)).status,200);
});
