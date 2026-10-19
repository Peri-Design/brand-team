'use strict';
process.env.ENABLE_DEV_AUTH='true';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {normalizeEvent,aggregate}=require('../analytics');
const {app,ready}=require('../server');
const event=(kind,id='event-12345',extra={})=>({kind,id,...extra});
const items=[{type:'web',language:'en'},{type:'app',language:'zh'}];
test('事件只保存白名单元数据，不保留图片文案或界面语言',()=>{
 const e=normalizeEvent(event('export_generated',undefined,{items,image:'private',copy:'private',locale:'zh'}));
 assert.deepEqual(e.data,{items});assert.deepEqual(normalizeEvent(event('active',undefined,{locale:'zh'})).data,{});
 assert.throws(()=>normalizeEvent(event('export_generated',undefined,{items:[{type:'unknown',language:'en'}]})));
 assert.throws(()=>normalizeEvent(event('export_checked',undefined,{result:'blocked',issues:{'secret text':1}})));
 assert.throws(()=>normalizeEvent(event('logo_download',undefined,{asset:'../private',format:'png'})));
});
test('北京时间边界、活跃去重、单批次数与张数、Logo 分组和容量口径',()=>{
 const now=new Date('2026-10-13T12:00:00Z');const events=[
  {actor:'a',kind:'active',data:{},createdAt:'2026-10-12T16:00:00Z'},
  {actor:'a',kind:'export_generated',data:{items},createdAt:'2026-10-13T06:00:00Z'},
  {actor:'b',kind:'active',data:{},createdAt:'2026-10-06T15:59:59Z'},
  {actor:'anonymous',kind:'logo_download',data:{asset:'PixVerse-black',format:'svg'},createdAt:now},
  {actor:'a',kind:'export_checked',data:{result:'blocked',issues:{missing_copy:2}},createdAt:now}
 ];
 const projects=[{createdAt:now,sizeBytes:20971520,payload:{version:2,items:[{type:'web',languages:['en','zh']}]},deletedAt:null},{createdAt:now,sizeBytes:10,deletedAt:now}];
 const a=aggregate(events,projects,now,7,now,[{createdAt:now}]);
 assert.equal(a.activeToday,1);assert.equal(a.active7,1);assert.equal(a.active30,2);assert.equal(a.activeUsers,1);
 assert.equal(a.newUsers,1);assert.equal(a.exports,1);assert.equal(a.batch,1);assert.equal(a.images,2);assert.equal(a.logoClicks,1);
 assert.equal(a.types.app,1);assert.equal(a.languages.zh,1);assert.equal(a.issues.missing_copy,2);assert.equal(a.daily.at(-1).active,1);
 assert.equal(a.inventory.files,1);assert.equal(a.inventory.trash,1);assert.equal(a.inventory.sizes.large,1);assert.equal(a.inventory.types.web,2);
 assert.equal(a.interfaceLanguages,undefined);assert.equal(a.repeatUsers,undefined);
});
test('组织 Logo 统计、受限素材权限、管理员保护与重试去重',async()=>{
 const {store}=await ready;
 const designer=await store.upsertUser({openId:'stats-designer',name:'Stats designer'});await store.setUserAccess(designer.openId,'active');
 const admin=await store.upsertUser({openId:'stats-admin',name:'Stats admin'});store.users.get(admin.openId).isAdmin=true;
 const designerCookie='pv_session='+await store.createSession(designer.openId,60000),adminCookie='pv_session='+await store.createSession(admin.openId,60000);
 assert.equal((await request(app).get('/api/admin/analytics')).status,401);
 assert.equal((await request(app).get('/api/admin/analytics').set('Cookie',designerCookie)).status,403);
 assert.equal((await request(app).post('/api/analytics/events').send(event('active'))).status,401);
 const logo=event('logo_download',undefined,{asset:'PixVerse-black',format:'png'});
 assert.equal((await request(app).post('/api/analytics/events').send(logo)).status,401);
 for(let i=0;i<2;i++)assert.equal((await request(app).post('/api/analytics/events').set('Cookie',designerCookie).send(logo)).status,204);
 assert.equal((await request(app).post('/api/analytics/events').send({...logo,asset:'AIsphere-black'})).status,401);
 assert.equal((await request(app).post('/api/analytics/events').set('Cookie',designerCookie).send({...logo,asset:'AIsphere-black',id:'private-logo-123'})).status,204);
 assert.equal((await request(app).post('/api/analytics/events').set('Origin','https://evil.example').send(logo)).status,403);
 const generated=event('export_generated',undefined,{items});for(let i=0;i<2;i++)assert.equal((await request(app).post('/api/analytics/events').set('Cookie',designerCookie).send(generated)).status,204);
 assert.equal((await request(app).get('/api/admin/analytics?days=365').set('Cookie',adminCookie)).status,400);
 const data=await request(app).get('/api/admin/analytics?days=7').set('Cookie',adminCookie);
 assert.equal(data.status,200);assert.equal(data.headers['cache-control'],'no-store');assert.equal(data.body.exports,1);assert.equal(data.body.images,2);assert.equal(data.body.logoClicks,2);
 assert.equal(data.body.logos['PixVerse-black'].png,1);assert.equal(data.body.daily.length,7);assert.ok(!JSON.stringify(data.body).includes('stats-designer'));
});
test('活动日去重，不把同一天多次打开算成多名用户',async()=>{const {MemoryStore}=require('../cloud-store');const store=new MemoryStore();await store.initAnalytics();await store.recordAnalytics('a',normalizeEvent(event('active','first-123')));await store.recordAnalytics('a',normalizeEvent(event('active','second-123')));assert.equal(store.analyticsEvents.size,1);assert.equal((await store.analyticsOverview(7)).activeUsers,1);});
