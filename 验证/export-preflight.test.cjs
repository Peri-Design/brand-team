'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {summarize}=require('../public/export-preflight');
const app=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
const exportCode=app.slice(app.indexOf(' function checkExportKeys('),app.indexOf(' function validateProject('));
function setup(results,{approve=true,fontError=null}={}){
 const events=[],scope={window:{ExportPreflight:{summarize,review:async r=>{events.push(['review',r]);return !r.blocked&&approve;}}},document:{createElement:()=>({})},errors:new Map(),SLOT:{web:'Web',app:'App'},LANG:{zh:'中文',en:'English'},slotOf:k=>k.split(':')[0],paint:(_,k)=>results[k],selectedExportKeys:()=>Object.keys(results),updateExport(){},fontsReady:async()=>{if(fontError)throw Error(fontError);},safeName:x=>x,state:{name:'测试'},locateExportIssue(){},exportFrames:keys=>{events.push(['frames',keys]);return keys.map(name=>({canvas:{},name}));},blobOf:async()=>({arrayBuffer:async()=>new ArrayBuffer(1)}),zip:()=>({}),download:()=>events.push(['download']),toast:m=>events.push(['toast',m])};
 vm.createContext(scope);vm.runInContext('let exportBusy=false;'+exportCode,scope);
 return {scope,events};
}
test('阻断项汇总全部所选图片，不在第一张失败后漏掉其他问题',async()=>{
 const {scope,events}=setup({'web:zh':{issues:['标题未填写'],upscaled:false},'app:en':{issues:['主视觉漏边'],upscaled:true}});
 await scope.exportSelected();
 const report=events.find(e=>e[0]==='review')[1];
 assert.equal(report.blocked,2);assert.equal(report.rows.length,2);assert.equal(report.warned,1);
 assert.ok(!events.some(e=>e[0]==='download'||e[0]==='frames'));
});
test('仅清晰度提醒需确认，取消不生成下载文件',async()=>{
 const {scope,events}=setup({'web:zh':{issues:[],upscaled:true}},{approve:false});await scope.exportSelected();
 assert.equal(events[0][1].blocked,0);assert.equal(events[0][1].warned,1);assert.ok(!events.some(e=>e[0]==='download'));
});
test('确认清晰度提醒后允许导出，提示不声称全部无问题',async()=>{
 const {scope,events}=setup({'web:zh':{issues:[],upscaled:true}});await scope.exportSelected();
 assert.equal(events.filter(e=>e[0]==='download').length,1);assert.match(events.at(-1)[1],/已确认清晰度提醒/);
});
test('基础检查通过并确认后下载，只检查本次所选图片',async()=>{
 const {scope,events}=setup({'app:en':{issues:[],upscaled:false}});await scope.exportSelected();
 assert.equal(events[0][1].rows.length,0);assert.equal(events[0][1].total,1);assert.equal(events.filter(e=>e[0]==='download').length,1);assert.match(events.at(-1)[1],/基础规范检查通过/);
});
test('字体加载失败阻止下载，并允许下一次重试',async()=>{
 const {scope,events}=setup({'web:zh':{issues:[],upscaled:false}},{fontError:'规范字体尚未载入'});await scope.exportSelected();await scope.exportSelected();
 assert.equal(events.filter(e=>e[0]==='review').length,2);assert.ok(!events.some(e=>e[0]==='download'));assert.match(events[0][1].rows[0].issues[0],/刷新页面重试/);
});
