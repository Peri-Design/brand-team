'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { app, ready } = require('../server');

test.before(async () => { await ready; });

test('anonymous users see only the organization login shell', async () => {
 const page=await request(app).get('/');assert.equal(page.status,200);assert.match(page.text,/仅限爱诗科技组织成员认证后下载/);
 assert.doesNotMatch(page.text,/src="app\.js|pixverse-logo-title|assets\//);
 for(const url of ['/assets/PixVerse-black.svg','/app.js'])assert.equal((await request(app).get(url)).status,401);
 assert.equal((await request(app).get('/api/cloud/projects')).status,401);
 const session=await request(app).get('/api/auth/session');assert.deepEqual(session.body,{configured:false,authenticated:false,user:null});
});
test('missing configuration returns a useful sign-in page', async () => {
 const login=await request(app).get('/api/auth/feishu/start');assert.equal(login.status,302);assert.match(login.headers.location,/auth=unconfigured/);
 const page=await request(app).get(login.headers.location);assert.match(page.text,/登录服务暂不可用/);
 assert.deepEqual((await request(app).get('/health')).body,{ok:true,cloud:'disabled',version:require('../package.json').version});
});

test('基础安全响应头已启用', async () => {
  const response = await request(app).get('/');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.match(response.headers['permissions-policy'], /camera=\(\)/);
});

test('brand guidelines require organization sign-in',async()=>{
 const page=await request(app).get('/brand-guidelines.html');assert.equal(page.status,200);assert.match(page.text,/仅限爱诗科技组织成员认证后下载/);assert.doesNotMatch(page.text,/禁止使用 AI 生成的 Logo|发布前检查/);assert.match(page.headers['cache-control'],/no-store/);
});
