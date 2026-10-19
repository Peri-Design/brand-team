'use strict';
process.env.ENABLE_DEV_AUTH='true';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest');
const {app}=require('../server');
test('anonymous sign-in can load character resources without exposing private assets',async()=>{
 for(const url of ['/brand-character.js','/brand-character.css']){
  const res=await request(app).get(url);assert.equal(res.status,200,url);assert.doesNotMatch(res.text,/materials\/|assets\/PixVerse/);
 }
 assert.equal((await request(app).get('/assets/PixVerse-black.svg')).status,401);
});
test('forged auth success never renders a verified state for an anonymous visitor',async()=>{
 const res=await request(app).get('/?auth=success&view=assets');
 assert.match(res.text,/data-brand-character="welcome"/);
 assert.doesNotMatch(res.text,/data-brand-character="success"|src="app.js/);
});
test('identity denial and recoverable service failure keep distinct messages and character states',async()=>{
 const denied=await request(app).get('/?auth=organization_denied&ui=en');
 assert.match(denied.text,/data-brand-character="denied"/);
 assert.match(denied.text,/Switch Feishu account/);
 const unavailable=await request(app).get('/?auth=verification_unavailable');
 assert.match(unavailable.text,/data-brand-character="welcome"/);
 assert.match(unavailable.text,/权限不会因此被更改/);
 assert.match(unavailable.text,/不得转发或提供给外部团队/);
 assert.match(unavailable.text,/https:\/\/pixverse.ai\/en\/brand/);
 assert.match(unavailable.text,/https:\/\/aishiai.com\/brand/);
 assert.doesNotMatch(unavailable.text,/建设中|aria-disabled="true"/);
});

test('short sign-in messages keep policy scope together without sentence-ending punctuation',()=>{
 const {renderOrganizationGate}=require('../organization-gate');
 for(const ui of ['zh','en']) for(const reason of ['', 'organization_denied','verification_unavailable','failed','state_error','cancelled','session_expired','unconfigured']) {
  const html=renderOrganizationGate({query:{ui}},reason);
  assert.doesNotMatch(html,/data-motion-toggle|Pause animation|暂停动画/);
  const copy=html.match(/<p class="copy"[^>]*>(.*?)<\/p>/)[1];
  assert.doesNotMatch(copy,/[。]|\.$/);
  assert.match(html,/<p class="policy-scope">[^<]+<br>[^<]+<\/p><p class="policy-design">/);
 }
});
