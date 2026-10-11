'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/access-public.js'), 'utf8');
async function render(response, fail = false) {
  const nodes = new Map();
  const node = key => {
    if (!nodes.has(key)) nodes.set(key, { dataset: {}, classList: { toggle(){}, add(){} }, setAttribute(){}, addEventListener(){}, focus(){}, showModal(){this.open=true;}, close(){this.open=false;} });
    return nodes.get(key);
  };
  let reloads = 0;
  const location = { search:'?view=admin&auth=cancelled', pathname:'/', reload(){reloads++;} };
  vm.runInNewContext(source, {
    document: { querySelector:node, querySelectorAll:()=>[], body:node('body'), documentElement:{removeAttribute(){}} },
    location, URLSearchParams, AbortSignal, requestAnimationFrame: fn=>fn(), setTimeout:()=>1, clearTimeout(){},
    fetch:async()=>{if(fail)throw Error('network');return {ok:true,json:async()=>response};}
  });
  await new Promise(resolve=>setImmediate(resolve));
  return { node, location, get reloads(){return reloads;} };
}
test('普通成员打开后台不会刷新循环，也不会误提示申请管理员权限', async()=>{
  const ui = await render({configured:true,authenticated:true,user:{name:'成员',accessStatus:'active',isAdmin:false}});
  assert.equal(ui.reloads,0);
  assert.equal(ui.node('#access-gate-title').textContent,'当前账号没有管理员权限');
  assert.equal(ui.node('#access-gate-login').hidden,true);
  ui.node('#access-gate-dismiss').onclick();
  assert.equal(ui.location.href,'/?view=assets');
});
test('未登录管理员入口明确提示登录并保留目标',async()=>{
  const ui=await render({configured:true,authenticated:false});
  assert.equal(ui.node('#access-gate-title').textContent,'登录管理后台');
  assert.equal(ui.node('#access-gate-login').href,'/api/auth/feishu/start?next=admin');
});
test('网络失败显示重试，不误判为本地预览或禁用登录',async()=>{
  const ui=await render(null,true);
  assert.equal(ui.node('#access-gate-title').textContent,'暂时无法读取登录状态');
  assert.equal(ui.node('#access-gate-refresh').hidden,false);
  let prevented=false;
  ui.node('#access-gate-login').onclick({preventDefault(){prevented=true;}});
  assert.equal(prevented,false);
});
test('实际未配置时给出准确提示',async()=>{
  const ui=await render({configured:false,authenticated:false});
  assert.equal(ui.node('#access-gate-title').textContent,'登录服务尚未配置');
});
