'use strict';
process.env.ENABLE_DEV_AUTH='true';process.env.FEISHU_BOOTSTRAP_ADMIN_NAME='Review admin';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {MemoryStore,PostgresStore}=require('../cloud-store');
const {app,ready}=require('../server');
async function fixtures(){const {store}=await ready;await store.upsertUser({openId:'review-admin',name:'Review admin'});await store.upsertUser({openId:'review-member',name:'Review member'});return {store,admin:'pv_session='+await store.createSession('review-admin',60000),member:'pv_session='+await store.createSession('review-member',60000)};}
test('decline is admin-only, gives the applicant a reason and retains brand downloads',async()=>{
 const {store,admin,member}=await fixtures();await store.requestDesignAccess('review-member');
 const path='/api/admin/users/review-member/access';
 assert.equal((await request(app).patch(path).set('Cookie',member).send({accessStatus:'rejected'})).status,403);
 assert.equal((await request(app).patch(path).set('Cookie',admin).send({accessStatus:'rejected',reason:'x'.repeat(301)})).status,400);
 let r=await request(app).patch(path).set('Cookie',admin).send({accessStatus:'rejected',reason:'  请补充设计用途  '});assert.equal(r.status,200);
 r=await request(app).get('/api/auth/session').set('Cookie',member);assert.equal(r.body.user.accessStatus,'rejected');assert.equal(r.body.user.accessReviewReason,'请补充设计用途');assert.equal(r.body.user.canDownloadAllLogos,true);
 assert.equal((await request(app).get('/assets/PixVerse-black.svg').set('Cookie',member)).status,200);
 assert.equal((await request(app).get('/api/cloud/projects').set('Cookie',member)).status,403);
 assert.equal((await request(app).get('/api/admin/overview').set('Cookie',member)).status,403);
 await store.upsertUser({openId:'review-member',name:'Review member'});assert.equal(store.users.get('review-member').accessStatus,'rejected');
});
test('reapply clears the old decision and resets only this applicant notification jobs',async()=>{
 const {store,admin,member}=await fixtures();await store.enqueueAccessNotifications();
 let r=await request(app).post('/api/access/design-request').set('Cookie',member);assert.equal(r.body.accessStatus,'pending');
 await store.enqueueAccessNotifications();const first=[...store.accessNotifications.values()].filter(j=>j.applicantOpenId==='review-member');assert.equal(first.length,1);await store.finishAccessNotification(first[0].id,null,0);
 await request(app).patch('/api/admin/users/review-member/access').set('Cookie',admin).send({accessStatus:'rejected'});
 await request(app).post('/api/access/design-request').set('Cookie',member);await store.enqueueAccessNotifications();
 const jobs=[...store.accessNotifications.values()].filter(j=>j.applicantOpenId==='review-member');assert.equal(jobs.length,1);assert.notEqual(jobs[0].id,first[0].id);assert.equal(jobs[0].sentAt,null);
 assert.equal((await store.getSession(member.split('=')[1])).accessReviewReason,null);
 await request(app).post('/api/access/design-request').set('Cookie',member);await store.enqueueAccessNotifications();assert.equal([...store.accessNotifications.values()].find(j=>j.applicantOpenId==='review-member').id,jobs[0].id);
 const path='/api/admin/users/review-member/access';assert.equal((await request(app).patch(path).set('Cookie',admin).send({accessStatus:'active'})).status,200);
 assert.equal((await request(app).patch(path).set('Cookie',admin).send({accessStatus:'rejected'})).status,409);
 assert.equal((await request(app).get('/api/cloud/projects').set('Cookie',member)).status,200);
});
test('suspended members cannot self-reapply and admin identity cannot be declined',async()=>{
 const {store,admin,member}=await fixtures();await store.setUserAccess('review-member','suspended','review-admin');
 assert.equal((await request(app).post('/api/access/design-request').set('Cookie',member)).status,403);
 assert.equal((await request(app).patch('/api/admin/users/review-admin/access').set('Cookie',admin).send({accessStatus:'rejected'})).status,404);
});
test('Postgres reapplication commits decision reset and notification reset atomically',async()=>{
 const calls=[];const client={query:async(sql,args)=>{calls.push([sql,args]);return {rows:sql.includes('UPDATE users')?[{openId:'a',accessStatus:'pending'}]:[]};},release(){calls.push(['release']);}};
 const store=new PostgresStore({connect:async()=>client});assert.equal((await store.requestDesignAccess('a')).accessStatus,'pending');
 assert.equal(calls[0][0],'BEGIN');assert.match(calls[1][0],/access_status IN \('none','rejected'\)/);assert.match(calls[1][0],/access_review_reason=NULL/);assert.match(calls[2][0],/DELETE FROM access_notifications WHERE applicant_open_id=\$1/);assert.equal(calls[3][0],'COMMIT');
 calls.length=0;client.query=async(sql)=>{calls.push([sql]);if(sql.includes('DELETE'))throw Error('database failure');return {rows:sql.includes('UPDATE')?[{openId:'a'}]:[]};};await assert.rejects(store.requestDesignAccess('a'),/database failure/);assert.ok(calls.some(c=>c[0]==='ROLLBACK'));assert.ok(!calls.some(c=>c[0]==='COMMIT'));
});
test('Postgres decline only applies to pending members and binds the optional reason',async()=>{
 const calls=[];const store=new PostgresStore({query:async(sql,args)=>{calls.push([sql,args]);return {rows:[{openId:'a',accessStatus:'rejected'}]};}});
 await store.setUserAccess('a','rejected','admin','reason');assert.match(calls[0][0],/access_status='pending'/);assert.deepEqual(calls[0][1],['a','rejected','admin','reason']);
});
