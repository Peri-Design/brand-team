'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, ready } = require('../server');

test.before(async () => { await ready; });

test('静态网页和品牌素材保持公开', async () => {
  const page = await request(app).get('/');
  assert.equal(page.status, 200);
  assert.match(page.text, /PixVerse 品牌工作台/);
  assert.match(page.text, /access-public\.js/);
  assert.doesNotMatch(page.text, /src="app\.js/);
  const asset = await request(app).get('/assets/PixVerse-black.svg');
  assert.equal(asset.status, 200);
  assert.match(asset.headers['content-type'], /image\/svg\+xml/);
  assert.equal((await request(app).get('/app.js')).status, 401);
});

test('未登录只能浏览公开品牌素材，设计文件接口拒绝访问', async () => {
  const session = await request(app).get('/api/auth/session');
  assert.equal(session.status, 200);
  assert.deepEqual(session.body, { configured: false, authenticated: false, user: null });
  const projects = await request(app).get('/api/cloud/projects');
  assert.equal(projects.status, 401);
  assert.match(projects.body.error, /飞书登录/);
});

test('未完成部署配置时登录入口给出明确状态', async () => {
  const login = await request(app).get('/api/auth/feishu/start');
  assert.equal(login.status, 503);
  assert.match(login.text, /尚未完成飞书与数据库配置/);
  const health = await request(app).get('/health');
  assert.deepEqual(health.body, { ok: true, cloud: 'disabled', version: require('../package.json').version });
});

test('基础安全响应头已启用', async () => {
  const response = await request(app).get('/');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(response.headers['permissions-policy'], /camera=\(\)/);
});

test('PixVerse 使用规范入口和全文无需登录，复用公开 Logo 文件', async () => {
  const workspace = await request(app).get('/');
  assert.match(workspace.text, /class="asset-guidelines-link" href="brand-guidelines\.html">查看使用规范/);
  assert.match(workspace.text, /爱诗科技 Logo/);
  const page = await request(app).get('/brand-guidelines.html');
  assert.equal(page.status, 200);
  assert.equal(page.headers['cache-control'], 'no-cache');
  assert.match(page.text, /PixVerse 品牌使用规范/);
  assert.match(page.text, /发布前检查/);
  assert.doesNotMatch(page.text, /<iframe|access-gate/);
  const scripts=[...page.text.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
  assert.deepEqual(scripts, ['ui-messages.js','ui-i18n.js']);
  assert.match(page.text, /禁止使用 AI 生成的 Logo/);
  const localUrls = [...page.text.matchAll(/(?:src|href)="([^"#][^"]*)"/g)]
    .map(match => match[1]).filter(url => !url.startsWith('./?'));
  for (const url of new Set(localUrls)) {
    const response = await request(app).get('/' + url);
    assert.equal(response.status, 200, `公开资源不可访问: ${url}`);
  }
  assert.equal((await request(app).get('/api/cloud/projects')).status, 401);
});
