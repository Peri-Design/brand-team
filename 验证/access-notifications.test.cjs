'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryStore } = require('../cloud-store');
const { createAccessNotifier } = require('../access-notifications');

async function setup() {
  const store = new MemoryStore({ bootstrapAdminName: 'Admin' });
  await store.upsertUser({ openId: 'ou_admin', name: 'Admin' });
  await store.upsertUser({ openId: 'ou_pending', name: '申请人' });
  const calls = [];
  let fail = false;
  const notifier = createAccessNotifier({ store, appId: 'test-app', appSecret: 'test-secret', publicUrl: 'https://brand.example', logger: { warn() {} }, fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url, body });
    if (url.includes('/auth/')) return { ok: true, status: 200, json: async () => ({ code: 0, tenant_access_token: 'test-token', expire: 7200 }) };
    return { ok: true, status: 200, json: async () => fail ? ({ code: 99991672 }) : ({ code: 0, data: { message_id: 'message' } }) };
  } });
  return { store, calls, notifier, setFailure: value => { fail = value; } };
}

test('待审核申请只通知真实管理员，重复登录和重复扫描不重复发送', async () => {
  const { store, calls, notifier } = await setup();
  await notifier.run();
  await store.upsertUser({ openId: 'ou_pending', name: '申请人' });
  await notifier.run();
  const messages = calls.filter(call => call.url.includes('/messages'));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].body.receive_id, 'ou_admin');
  const content = JSON.parse(messages[0].body.content).text;
  assert.match(content, /申请人/);
  assert.match(content, /https:\/\/brand.example\/\?view=admin/);
  assert.equal((await store.adminOverview()).members.find(u => u.openId === 'ou_pending').accessStatus, 'pending');
});

test('发送失败保留申请并退避重试，重试沿用相同消息 UUID', async () => {
  const { store, calls, notifier, setFailure } = await setup();
  setFailure(true);
  await notifier.run();
  const job = [...store.accessNotifications.values()][0];
  assert.equal(job.lastError, '99991672');
  assert.equal(job.sentAt, null);
  assert.ok(job.nextAttemptAt > Date.now());
  await notifier.run();
  assert.equal(calls.filter(c => c.url.includes('/messages')).length, 1);
  job.nextAttemptAt = 0;
  setFailure(false);
  await notifier.run();
  assert.ok(job.sentAt);
  const messages = calls.filter(c => c.url.includes('/messages'));
  assert.equal(messages.length, 2);
  assert.equal(messages[0].body.uuid, messages[1].body.uuid);
});

test('已批准和停用的成员不通知，批准后取消尚未发送的通知', async () => {
  const { store, calls, notifier } = await setup();
  await store.enqueueAccessNotifications();
  await store.setUserAccess('ou_pending', 'active', 'ou_admin');
  await notifier.run();
  assert.equal(calls.length, 0);
  await store.setUserAccess('ou_pending', 'suspended', 'ou_admin');
  await notifier.run();
  assert.equal(calls.length, 0);
});

test('管理员后续登录可补发积压申请，租约避免并发重复领取', async () => {
  const store = new MemoryStore({ bootstrapAdminName: 'Admin' });
  await store.upsertUser({ openId: 'ou_pending', name: '申请人' });
  await store.enqueueAccessNotifications();
  assert.equal(store.accessNotifications.size, 0);
  await store.upsertUser({ openId: 'ou_admin', name: 'Admin' });
  await store.enqueueAccessNotifications();
  const jobs = await Promise.all([store.claimAccessNotification(), store.claimAccessNotification()]);
  assert.equal(jobs.filter(Boolean).length, 1);
  const job = jobs.find(Boolean);
  await store.finishAccessNotification(job.id, null, job.attempts - 1);
  assert.equal([...store.accessNotifications.values()][0].sentAt, null);
});

test('未配置凭据时不发消息，通知故障不会抛出阻断登录', async () => {
  const store = new MemoryStore();
  const notifier = createAccessNotifier({ store, publicUrl: 'https://brand.example', fetchImpl: () => { throw new Error('must not send'); } });
  assert.equal(notifier.enabled, false);
  await notifier.run();
  const broken = createAccessNotifier({ store: { enqueueAccessNotifications() { throw new Error('database unavailable'); } }, appId: 'id', appSecret: 'secret', publicUrl: 'https://brand.example', logger: { warn() {} } });
  await assert.doesNotReject(broken.run());
});
