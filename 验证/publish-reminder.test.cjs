'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function setup(){
 let restored=false;
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attributes={};}
  append(...nodes){this.children.push(...nodes);}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  showModal(){this.open=true;}
  close(){this.open=false;this.listeners.close?.();}
  remove(){this.removed=true;}
  focus(){this.focused=true;}
 }
 const body=new Element('body'),context={document:{body,activeElement:{focus(){restored=true;}},createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})},module:{exports:{}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/export-preflight.js'),'utf8'),context);
 return {api:context.module.exports,body,restored:()=>restored};
}
for(const approve of [false,true])test(`基础检查通过仍显示发布提醒，${approve?'确认才允许下载':'取消不下载并恢复焦点'}`,async()=>{
 const s=setup(),pending=s.api.review({rows:[],total:1,blocked:0,warned:0},()=>{});
 const dialog=s.body.children[0];assert.ok(dialog?.open);
 const reminder=dialog.children.find(e=>e.id==='export-publish-reminder');
 assert.match(reminder.children[1].textContent,/「设计图审核」话题群完成审图并通过后/);
 const buttons=dialog.children.at(-1).children;buttons[approve?1:0].onclick();
 assert.equal(await pending,approve);assert.ok(s.restored());assert.ok(dialog.removed);
});
test('存在规范错误时，审图提醒不解除下载阻断',async()=>{
 const s=setup(),pending=s.api.review({rows:[{label:'Test',issues:['缺少图片'],warnings:[]}],total:1,blocked:1,warned:0},()=>{});
 const dialog=s.body.children[0],buttons=dialog.children.at(-1).children;
 assert.equal(buttons.length,1);assert.equal(buttons[0].textContent,'返回编辑');buttons[0].onclick();assert.equal(await pending,false);
});
test('新旧编辑器共用一致的下载提醒实现',()=>{
 assert.equal(fs.readFileSync(path.join(__dirname,'../public/export-preflight.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../public/materials/vendor/export-preflight.js'),'utf8'));
});
function issueReport(total){return {total,blocked:0,warned:1,rows:[{key:'m1:en',label:'Web · English',issues:[],warnings:['原图分辨率偏低']}]};}
test('单张提醒没有重复定位入口，返回编辑定位这张物料',async()=>{
 const s=setup(),targets=[],pending=s.api.review(issueReport(1),key=>targets.push(key));
 const dialog=s.body.children[0],list=dialog.children.find(e=>e.className==='export-review-list');
 assert.equal(list.children[0].children[0].children.length,1);
 const cancel=dialog.children.at(-1).children[0];assert.equal(cancel.textContent,'返回编辑');cancel.onclick();
 assert.equal(await pending,false);assert.deepEqual(targets,['m1:en']);
});
test('批量中只有一张有问题，仍保留精确定位入口',async()=>{
 const s=setup(),targets=[],pending=s.api.review(issueReport(3),key=>targets.push(key));
 const dialog=s.body.children[0],list=dialog.children.find(e=>e.className==='export-review-list');
 const jump=list.children[0].children[0].children[1];assert.equal(jump.textContent,'定位到此物料');jump.onclick();
 assert.equal(await pending,false);assert.deepEqual(targets,['m1:en']);
});
test('关闭提醒只取消下载，不强制切换当前物料',async()=>{
 const s=setup(),targets=[],pending=s.api.review(issueReport(1),key=>targets.push(key));
 const dialog=s.body.children[0];dialog.children[0].children[1].onclick();assert.equal(await pending,false);assert.deepEqual(targets,[]);
});
