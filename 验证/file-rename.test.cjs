const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {MemoryStore}=require('../cloud-store');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const renameSource=source.slice(source.indexOf(' function renameCloudProject('),source.indexOf('\n async function duplicateCloudProject'));
function boot(overrides={}){
 const events=[],elements={};for(const id of ['dialog','form','name','error','save','cancel'])elements['#rename-file-'+id]={value:'',disabled:false,hidden:true,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},focus(){events.push(['focus',id]);},select(){events.push(['select',id]);}};
 const dialog=elements['#rename-file-dialog'];dialog.open=false;dialog.showModal=()=>dialog.open=true;dialog.close=()=>{dialog.open=false;dialog.onclose?.();};
 const context={$:s=>elements[s],$$:()=>[],window:{},cloudProjectId:null,cloudRevision:null,state:{name:'old'},cloudRequest:async()=>{throw Error('unexpected request');},refreshCloudProjects:async()=>events.push(['refresh']),hydrate:()=>events.push(['hydrate']),persist:(...args)=>events.push(['persist',...args]),toast:message=>events.push(['toast',message]),...overrides};
 vm.createContext(context);vm.runInContext(renameSource,context);
 return {context,events,dialog,input:elements['#rename-file-name'],error:elements['#rename-file-error'],save:elements['#rename-file-save'],cancel:elements['#rename-file-cancel'],form:elements['#rename-file-form'],open:context.renameCloudProject,submit:()=>elements['#rename-file-form'].onsubmit({preventDefault(){}})};
}
test('rename opens an accessible page dialog, preselects its name, and cancel makes no requests',()=>{
 const ui=boot();ui.open({id:'file',name:'原名称'});assert.equal(ui.dialog.open,true);assert.equal(ui.input.value,'原名称');assert.ok(ui.events.some(e=>e[0]==='select'));ui.input.value='不要保存';ui.cancel.onclick();assert.equal(ui.dialog.open,false);assert.equal(ui.form.onsubmit,null);
});
test('blank and overlength names show inline errors; unchanged names close without saving',async()=>{
 const ui=boot();ui.open({id:'file',name:'原名称'});ui.input.value='  ';await ui.submit();assert.equal(ui.error.hidden,false);assert.match(ui.error.textContent,/请输入/);assert.equal(ui.input.attrs['aria-invalid'],'true');ui.input.value='a'.repeat(81);await ui.submit();assert.match(ui.error.textContent,/80/);ui.input.value=' 原名称 ';await ui.submit();assert.equal(ui.dialog.open,false);
});
for(const version of [1,2])test(`v${version} rename persists both metadata and payload, preserving design and preview`,async()=>{
 const store=new MemoryStore(),payload={version,name:'原名称',items:[{copy:'KEEP',geometry:[1,2,3]}]},preview='data:image/png;base64,AA==';const project=await store.createProject('qa',payload.name,payload,100,preview);
 const ui=boot({cloudProjectId:version===1?project.id:null,cloudRequest:async(_url,options)=>{if(!options)return {project:await store.getProject('qa',project.id)};const body=JSON.parse(options.body);assert.equal(body.preview,preview);const result=await store.updateProject('qa',project.id,body.project.name,body.project,100,body.baseRevision,body.preview);assert.ok(result.project);return result;}});
 ui.open(project);ui.input.value=' 新名称 ';await ui.submit();const readback=await store.getProject('qa',project.id);assert.equal(readback.name,'新名称');assert.equal(readback.payload.name,'新名称');assert.deepEqual(readback.payload.items,payload.items);assert.equal(readback.previewDataUrl,preview);assert.equal(readback.revision,2);assert.equal(ui.dialog.open,false);assert.ok(ui.events.some(e=>e[0]==='refresh'));
 if(version===1){assert.equal(ui.context.state.name,'新名称');assert.equal(ui.context.cloudRevision,2);assert.ok(ui.events.some(e=>e[0]==='persist'&&e[1]===false&&e[2]===false));}
});
test('save failure preserves input and allows retry using a fresh revision',async()=>{
 let gets=0,puts=0;const ui=boot({cloudRequest:async(_url,options)=>{if(!options)return {project:{payload:{version:2,name:'旧'},revision:++gets}};if(++puts===1)throw Error('文件已在其他页面更新');assert.equal(JSON.parse(options.body).baseRevision,2);return {project:{revision:3}};}});
 ui.open({id:'file',name:'旧'});ui.input.value='新';await ui.submit();assert.equal(ui.dialog.open,true);assert.equal(ui.input.value,'新');assert.match(ui.error.textContent,/重命名失败/);assert.equal(ui.save.disabled,false);await ui.submit();assert.equal(ui.dialog.open,false);assert.equal(puts,2);
});
test('in-flight rename blocks duplicate submissions, Escape and opening a second file',async()=>{
 let resolve;let requests=0;const ui=boot({cloudRequest:async(_url,options)=>{requests++;if(!options)return new Promise(done=>resolve=done);return {project:{revision:2}};}});
 ui.open({id:'a',name:'旧'});ui.input.value='新';const saving=ui.submit();assert.equal(ui.save.disabled,true);assert.equal(ui.cancel.disabled,true);assert.equal(ui.form.attrs['aria-busy'],'true');let prevented=false;ui.dialog.oncancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);ui.open({id:'b',name:'另一文件'});await ui.submit();assert.equal(requests,1);resolve({project:{payload:{name:'旧'},revision:1}});await saving;assert.equal(requests,2);assert.equal(ui.dialog.open,false);
});
