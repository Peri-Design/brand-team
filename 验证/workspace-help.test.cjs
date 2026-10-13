'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createGuideState,SEEN_KEY}=require('../public/workspace-help.js');
function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};}
test('只在首次进入设计编辑时自动显示，跳过后刷新不再重复',()=>{
 const storage=memoryStorage(),guide=createGuideState(storage);
 for(const view of ['assets','files','admin'])assert.equal(guide.auto(view),false);
 assert.equal(guide.auto('studio'),true);assert.equal(guide.mode,'guide');assert.equal(guide.step,0);
 assert.equal(guide.auto('studio'),false);guide.dismiss();assert.equal(storage.getItem(SEEN_KEY),'1');
 assert.equal(guide.auto('studio'),false);assert.equal(createGuideState(storage).auto('studio'),false);
});
test('三步可以前进和返回，完成后仍可通过帮助重新查看',()=>{
 const storage=memoryStorage(),guide=createGuideState(storage);guide.auto('studio');
 guide.move(-1);assert.equal(guide.step,0);guide.move(1);assert.equal(guide.step,1);guide.move(1);assert.equal(guide.step,2);guide.move(1);assert.equal(guide.step,2);
 guide.move(-1);assert.equal(guide.step,1);guide.move(1);guide.dismiss();assert.equal(guide.seen,true);
 guide.help();assert.equal(guide.mode,'help');guide.restart();assert.equal(guide.mode,'guide');assert.equal(guide.step,0);guide.dismiss();
 assert.equal(guide.auto('studio'),false);
});
test('单独关闭手动帮助不会标记尚未看过的新手指引',()=>{
 const guide=createGuideState(memoryStorage());guide.help();guide.dismiss();assert.equal(guide.seen,false);assert.equal(guide.auto('studio'),true);
});
test('浏览器存储不可用时仍可使用指引，本次访问内只自动显示一次',()=>{
 const guide=createGuideState({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}});
 assert.equal(guide.auto('studio'),true);guide.dismiss();assert.equal(guide.auto('studio'),false);
 guide.help();assert.equal(guide.mode,'help');guide.restart();assert.equal(guide.step,0);
});
