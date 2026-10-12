const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {MemoryStore,PostgresStore}=require('../cloud-store');
const source=fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8');
const openSource=source.slice(source.indexOf(' async function openCloudProject('),source.indexOf('\n async function saveCloudProject'));
function boot(overrides={}){
 const events=[],context={openingProjectId:null,fileOpenError:null,currentHasUserEdits:false,cloudProjectId:'old',cloudProjects:[{id:'new',projectVersion:2},{id:'legacy',projectVersion:1}],cloudQueue:Promise.resolve(),cloudSaveTimer:null,location:{href:''},AbortController,setTimeout,clearTimeout,
 renderFileOpenState(){events.push(['state',context.openingProjectId,context.fileOpenError?.id]);},hasPendingRecovery:()=>false,saveCloudProject:async()=>true,confirm:()=>false,rememberOpenedFile:id=>events.push(['remember',id]),show:view=>events.push(['view',view]),cloudRequest:async()=>{events.push(['fetch']);return {project:{id:'legacy',payload:{version:1},revision:1}};},loadProject:async()=>events.push(['load']),setCloudStatus:()=>{},toast:()=>{},refreshCloudProjects:async()=>{},...overrides};vm.createContext(context);vm.runInContext(openSource,context);return {context,events,open:context.openCloudProject};
}
test('v2 metadata routes directly with no full project fetch; duplicate clicks cannot open a different file',async()=>{
 const {context,events,open}=boot();assert.equal(await open('new'),true);assert.equal(context.location.href,'/materials/?project=new');assert.equal(events.some(e=>e[0]==='fetch'),false);assert.equal(await open('legacy'),false);assert.equal(context.openingProjectId,'new');
});
test('loading follows the clicked file; failure stays on that card and retry succeeds',async()=>{
 let reject;const {context,events,open}=boot({cloudRequest:()=>new Promise((_,no)=>reject=no)});
 const pending=open('legacy');assert.equal(context.openingProjectId,'legacy');assert.equal(await open('new'),false);reject(Error('Offline'));assert.equal(await pending,false);assert.equal(context.openingProjectId,null);assert.equal(context.fileOpenError.id,'legacy');assert.equal(context.cloudProjectId,'old');
 context.cloudRequest=async()=>({project:{id:'legacy',payload:{version:1},revision:1}});assert.equal(await open('legacy'),true);assert.equal(context.fileOpenError,null);assert.ok(events.some(e=>e[0]==='load'));assert.ok(events.some(e=>e[0]==='remember'&&e[1]==='legacy'));
});
test('cancelled unsaved-change protection clears opening state without navigation',async()=>{
 const {context,open}=boot({currentHasUserEdits:true,saveCloudProject:async()=>false});assert.equal(await open('new'),false);assert.equal(context.location.href,'');assert.equal(context.openingProjectId,null);
});
test('missing version metadata retains compatibility for old list responses',async()=>{
 const {context,open}=boot({cloudProjects:[],cloudRequest:async()=>({project:{id:'new',payload:{version:2}}})});assert.equal(await open('new'),true);assert.equal(context.location.href,'/materials/?project=new');
});
test('timeout releases opening lock and offers a retry',async()=>{
 const {context,open}=boot({setTimeout:callback=>{queueMicrotask(callback);return 1;},clearTimeout:()=>{},cloudRequest:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))});assert.equal(await open('legacy'),false);assert.equal(context.openingProjectId,null);assert.match(context.fileOpenError.message,/超时/);
});
test('file list exposes only format metadata, never project content, with owner isolation',async()=>{
 const store=new MemoryStore();await store.createProject('a','v1',{version:1,secret:'private'},20);await store.createProject('a','v2',{version:2,secret:'private'},20);await store.createProject('b','other',{version:2},10);
 const list=await store.listProjects('a');assert.deepEqual(list.map(p=>p.projectVersion).sort(),[1,2]);assert.ok(list.every(p=>!('payload' in p)&&!('secret' in p)));assert.equal(list.length,2);
});
test('Postgres listing extracts version without returning payload or changing access filtering',async()=>{
 const queries=[];const store=new PostgresStore({query:async(sql,args)=>{queries.push([sql,args]);return {rows:[]};}});await store.listProjects('owner');const [sql,args]=queries[1];assert.match(sql,/payload->>'version'='2'/);assert.match(sql,/AS "projectVersion"/);assert.match(sql,/owner_open_id=\$1/);assert.deepEqual(args,['owner']);assert.doesNotMatch(sql,/name,payload,/);
});
