'use strict';

process.env.ENABLE_DEV_AUTH = 'true';
process.env.FEISHU_BOOTSTRAP_ADMIN_NAME = '赵瑞秀';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, ready } = require('../server');

test.before(async () => { await ready; });

test('通知中的管理后台入口在登录后保留目标页面，普通成员仍不能访问后台', async () => {
  const admin = request.agent(app);
  const login = await admin.get('/api/auth/feishu/start?next=admin');
  assert.match(login.headers.location, /view=admin&auth=success/);
  const { store } = await ready;
  const member = await store.upsertUser({ openId: 'ou_admin_link_test', name: '通知入口测试' });
  const token = await store.createSession(member.openId, 60_000);
  assert.equal((await request(app).get('/api/admin/overview').set('Cookie', `pv_session=${token}`)).status, 403);
  // Isolate this fixture from the existing overview count assertions below.
  store.users.delete(member.openId);
});

test('飞书身份、管理员绑定和云端文件接口形成完整闭环', async () => {
  const agent = request.agent(app);
  const login = await agent.get('/api/auth/feishu/start?next=files');
  assert.equal(login.status, 302);
  assert.match(login.headers.location, /view=files&auth=success/);

  const session = await agent.get('/api/auth/session');
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.user.name, '赵瑞秀');
  assert.equal(session.body.user.isAdmin, true);
  assert.equal(session.body.user.accessStatus, 'active');
  const authorizedPage = await agent.get('/');
  assert.match(authorizedPage.text, /src="app\.js/);
  assert.doesNotMatch(authorizedPage.text, /access-public\.js/);

  const payload = { version: 1, name: '云端测试工程' };
  const created = await agent.post('/api/cloud/projects').send({ project: payload });
  assert.equal(created.status, 201);
  assert.equal(created.body.project.revision, 1);
  const id = created.body.project.id;

  const list = await agent.get('/api/cloud/projects');
  assert.equal(list.body.projects.length, 1);
  assert.equal(list.body.projects[0].name, '云端测试工程');

  const opened = await agent.get(`/api/cloud/projects/${id}`);
  assert.deepEqual(opened.body.project.payload, payload);

  const updated = await agent.put(`/api/cloud/projects/${id}`).send({ project: { ...payload, name: '已更新' }, baseRevision: 1 });
  assert.equal(updated.body.project.revision, 2);
  const conflict = await agent.put(`/api/cloud/projects/${id}`).send({ project: payload, baseRevision: 1 });
  assert.equal(conflict.status, 409);

  const moved = await agent.delete(`/api/cloud/projects/${id}`);
  assert.equal(moved.status, 204);
  assert.equal((await agent.get('/api/cloud/projects')).body.projects.length, 0);
  assert.equal((await agent.get('/api/cloud/projects?scope=trash')).body.projects.length, 1);
  assert.equal((await agent.post(`/api/cloud/projects/${id}/restore`)).status, 204);

  const extra = await agent.post('/api/cloud/projects').send({ project: { version: 1, name: '待清空文件' } });
  assert.equal(extra.status, 201);
  assert.equal((await agent.delete(`/api/cloud/projects/${extra.body.project.id}`)).status, 204);
  const cleared = await agent.delete('/api/cloud/projects/trash');
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.deleted, 1);
  assert.equal((await agent.get('/api/cloud/projects?scope=trash')).body.projects.length, 0);

  const overview = await agent.get('/api/admin/overview');
  assert.equal(overview.body.users, 1);
  assert.equal(overview.body.projects, 1);
  assert.equal(overview.body.trashedProjects, 0);
  assert.equal(overview.body.storageBytes, Buffer.byteLength(JSON.stringify({ ...payload, name: '已更新' })));
  assert.equal(overview.body.members.length, 1);
  assert.equal(overview.body.members[0].isAdmin, true);
  assert.equal(overview.body.files.length, 1);
  assert.equal(overview.body.files[0].ownerName, '赵瑞秀');

  const { store } = await ready;
  const pending = await store.upsertUser({ openId: 'ou_pending', name: '待审核成员' });
  const pendingToken = await store.createSession(pending.openId, 60_000);
  const pendingRequest = path => request(app).get(path).set('Cookie', `pv_session=${pendingToken}`);
  const pendingSession = await pendingRequest('/api/auth/session');
  assert.equal(pendingSession.body.user.accessStatus, 'pending');
  const denied = await pendingRequest('/api/cloud/projects');
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /等待管理员确认/);
  const pendingPage = await request(app).get('/').set('Cookie', `pv_session=${pendingToken}`);
  assert.match(pendingPage.text, /access-public\.js/);
  assert.doesNotMatch(pendingPage.text, /src="app\.js/);
  const approved = await agent.patch(`/api/admin/users/${pending.openId}/access`).send({ accessStatus: 'active' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.user.accessStatus, 'active');
  assert.equal((await pendingRequest('/api/cloud/projects')).status, 200);

  const logout = await agent.post('/api/auth/logout');
  assert.equal(logout.status, 204);
  assert.equal((await agent.get('/api/cloud/projects')).status, 401);
});

test('旧通知自动登录，已有管理员会话直达后台，取消授权不会循环跳转', async () => {
  const entry = await request(app).get('/?view=admin');
  assert.equal(entry.status, 302);
  assert.equal(entry.headers.location, '/api/auth/feishu/start?next=admin');
  assert.equal(entry.headers['cache-control'], 'no-store');
  const admin = request.agent(app);
  await admin.get('/api/auth/feishu/start?next=admin');
  const reuse = await admin.get('/api/auth/feishu/start?next=admin');
  assert.equal(reuse.headers.location, '/?view=admin');
  const page = await admin.get('/?view=admin');
  assert.equal(page.status, 200);
  assert.match(page.text, /src="app\.js/);
  assert.equal((await admin.get('/api/admin/overview')).status, 200);
  assert.equal((await admin.get('/api/auth/session')).headers['cache-control'], 'no-store');
  const cancelled = await request(app).get('/api/auth/feishu/callback?state=test-state').set('Cookie', 'pv_auth_next=admin; pv_oauth_state=test-state');
  assert.equal(cancelled.headers.location, '/?view=admin&auth=cancelled');
  const error = await request(app).get('/api/auth/feishu/callback?state=wrong').set('Cookie', 'pv_auth_next=admin; pv_oauth_state=test-state');
  assert.equal(error.headers.location, '/?view=admin&auth=state_error');
  for (const result of [cancelled, error]) {
    const page = await request(app).get(result.headers.location);
    assert.equal(page.status, 200);
    assert.match(page.text, /access-public\.js/);
  }
});

test('已开通设计权限不等于管理员，不能通过通知入口访问审批数据', async () => {
  const { store } = await ready;
  const member = await store.upsertUser({ openId: 'ou_active_not_admin', name: '普通设计成员' });
  // Set an active design permission on the in-memory fixture only.
  store.users.get(member.openId).accessStatus = 'active';
  const token = await store.createSession(member.openId, 60000);
  const page = await request(app).get('/?view=admin').set('Cookie', `pv_session=${token}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /access-public\.js/);
  assert.doesNotMatch(page.text, /src="app\.js/);
  assert.equal((await request(app).get('/api/admin/overview').set('Cookie', `pv_session=${token}`)).status, 403);
  store.users.delete(member.openId);
});
