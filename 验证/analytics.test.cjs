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
test('角标事件只接受格式元数据，拒绝未知格式，不保留输入文案或客户端身份',()=>{
 assert.deepEqual(normalizeEvent(event('badge_used',undefined,{copy:'secret',actor:'forged'})).data,{});
 assert.deepEqual(normalizeEvent(event('badge_exported',undefined,{format:'svg',copy:'secret',image:'private'})).data,{format:'svg'});
 for(const format of [undefined,'zip','PNG','../private'])assert.throws(()=>normalizeEvent(event('badge_exported',undefined,{format})));
});
test('角标按期间去重人数及格式统计，与物料导出和 Logo 下载独立',()=>{
 const now=new Date('2026-11-05T12:00:00Z'),row=(actor,kind,data,createdAt=now)=>({actor,kind,data,createdAt});
 const events=[row('a','badge_used',{}),row('a','badge_used',{},'2026-11-03T12:00:00Z'),row('a','badge_exported',{format:'svg'}),row('a','badge_exported',{format:'png'}),row('b','badge_used',{}),row('c','badge_exported',{format:'svg'},'2026-10-29T15:59:59Z'),row('future','badge_used',{},'2026-11-06T00:00:00Z'),row('old','badge_used',{},'2026-10-01T00:00:00Z'),row('d','export_generated',{items})];
 const a=aggregate(events,[],now,7,now);assert.deepEqual(a.badges,{users:2,exports:2,formats:{svg:1,png:1}});assert.equal(a.exports,1);assert.equal(a.images,2);assert.equal(a.logoClicks,0);assert.equal(a.activeUsers,3);
 assert.deepEqual(aggregate(events,[],now,30,now).badges,{users:3,exports:3,formats:{svg:2,png:1}});
 assert.deepEqual(aggregate([],[],now,7,now).badges,{users:0,exports:0,formats:{svg:0,png:0}});
});
test('角标使用按账号和北京时间日期去重；导出重试幂等，重复导出分别计数',async()=>{
 const {MemoryStore,PostgresStore}=require('../cloud-store');const store=new MemoryStore();await store.initAnalytics();
 await store.recordAnalytics('a',normalizeEvent(event('badge_used','badge-first')));await store.recordAnalytics('a',normalizeEvent(event('badge_used','badge-again')));await store.recordAnalytics('b',normalizeEvent(event('badge_used','badge-first')));
 const exported=normalizeEvent(event('badge_exported','badge-export',{format:'svg'}));await store.recordAnalytics('a',exported);await store.recordAnalytics('a',exported);await store.recordAnalytics('a',normalizeEvent(event('badge_exported','badge-second',{format:'png'})));
 assert.equal(store.analyticsEvents.size,4);assert.deepEqual((await store.analyticsOverview(7)).badges,{users:2,exports:2,formats:{svg:1,png:1}});
 const calls=[],pg=new PostgresStore({query:async(sql,args)=>{calls.push([sql,args]);return{rows:[]};}});await pg.recordAnalytics('a',normalizeEvent(event('badge_used','badge-first')));await pg.recordAnalytics('a',normalizeEvent(event('badge_used','badge-again')));assert.equal(calls[0][1][0],calls[1][1][0]);assert.match(calls[0][0],/ON CONFLICT\(id\) DO NOTHING/);
});
test('角标统计端到端保留设计权限、管理员权限和请求重试去重',async()=>{
 const {store}=await ready;for(const [id,status]of [['badge-author','active'],['badge-other','active'],['badge-pending','pending']]){await store.upsertUser({openId:id,name:id});await store.setUserAccess(id,status);}
 const cookie=async id=>'pv_session='+await store.createSession(id,60000),author=await cookie('badge-author'),other=await cookie('badge-other'),pending=await cookie('badge-pending');
 const used=event('badge_used','badge-used-123'),png=event('badge_exported','badge-png-123',{format:'png',actor:'fake',copy:'secret'});
 assert.equal((await request(app).post('/api/analytics/events').send(used)).status,401);assert.equal((await request(app).post('/api/analytics/events').set('Cookie',pending).send(used)).status,403);
 for(let i=0;i<2;i++)assert.equal((await request(app).post('/api/analytics/events').set('Cookie',author).send(png)).status,204);
 assert.equal((await request(app).post('/api/analytics/events').set('Cookie',other).send(used)).status,204);
 assert.equal((await request(app).post('/api/analytics/events').set('Cookie',author).set('Origin','https://evil.example').send(used)).status,403);
 await store.setUserAccess('badge-author','suspended');assert.equal((await request(app).post('/api/analytics/events').set('Cookie',author).send({...png,id:'badge-after-revoke'})).status,403);
 assert.equal((await request(app).get('/api/admin/analytics').set('Cookie',other)).status,403);
 const response=await request(app).get('/api/admin/analytics?days=7').set('Cookie',await cookie('stats-admin'));assert.equal(response.status,200);assert.deepEqual(response.body.badges,{users:2,exports:1,formats:{svg:0,png:1}});assert.doesNotMatch(JSON.stringify(response.body),/badge-author|badge-other|secret|fake/);
});
