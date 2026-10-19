'use strict';
process.env.ENABLE_DEV_AUTH='true';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),request=require('supertest');
const {app,ready}=require('../server');
test('PixLab original downloads require membership, preserve bytes, and record only available formats',async()=>{
 const {store}=await ready;await store.upsertUser({openId:'pixlab-logo-qa',name:'Logo QA'});
 const cookie='pv_session='+await store.createSession('pixlab-logo-qa',60000);
 const originals={domestic:'0618efe4fd42523f2ec47cb003307287e28c421e61c88f268159152ec4b8785c',international:'203163169ac331254be47a61913426634e248705cda6e209915f7f91993b011c'};
 for(const [version,hash] of Object.entries(originals)){
  const url='/assets/PixLab-'+version+'.png';
  assert.equal((await request(app).get(url)).status,401);
  const response=await request(app).get(url).set('Cookie',cookie);assert.equal(response.status,200);
  assert.equal(crypto.createHash('sha256').update(response.body).digest('hex'),hash);
  const event={id:'pixlab-original-'+version,kind:'logo_download',asset:'PixLab-'+version,format:'png'};
  assert.equal((await request(app).post('/api/analytics/events').set('Cookie',cookie).send(event)).status,204);
  assert.equal((await request(app).post('/api/analytics/events').set('Cookie',cookie).send({...event,id:event.id+'-invalid',format:'svg'})).status,400);
 }
 for(const entry of ['domestic','international']){
  const page=await request(app).get('/?view=assets&entry='+entry).set('Cookie',cookie);
  assert.match(page.text,/PixLab · 国内版（拍我 AI）/);assert.match(page.text,/PixLab · 海外版（PixVerse）/);
 }
});
