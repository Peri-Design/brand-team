'use strict';
process.env.ENABLE_DEV_AUTH='true';process.env.FEISHU_BOOTSTRAP_ADMIN_NAME='Navigation QA Admin';
const test=require('node:test'),assert=require('node:assert/strict'),request=require('supertest'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {app,ready}=require('../server');const frontend=path.join(__dirname,'../public');
async function member(id,status,name=id){const {store}=await ready;await store.upsertUser({openId:id,name});if(status==='rejected'){await store.requestDesignAccess(id);await store.setUserAccess(id,status,'qa');}else if(status)await store.setUserAccess(id,status,'qa');return 'pv_session='+await store.createSession(id,60000);}
const navTags=html=>html.match(/<button\b[^>]*class="[^"]*\bprotected-nav\b[^>]*>/g)||[];
test('authorized navigation is unlocked in server HTML before scripts or fonts load, including a return from guidelines',async()=>{
 const cookie=await member('nav-designer','active');
 for(const entry of ['domestic','international'])for(const ui of ['zh','en']){
  const query=`entry=${entry}&ui=${ui}`;
  assert.equal((await request(app).get('/brand-guidelines.html?'+query).set('Cookie',cookie)).status,200);
  const r=await request(app).get('/?view=assets&'+query).set('Cookie',cookie);
  const tags=navTags(r.text);assert.equal(tags.length,3);
  for(const tag of tags)assert.doesNotMatch(tag,/is-locked|aria-haspopup/);
  assert.match(r.text,/src="app\.js/);assert.match(r.headers['cache-control'],/no-store/);
 }
});
test('admin state is correct before paint, while a designer never inherits admin access',async()=>{
 const admin=await member('nav-admin',null,'Navigation QA Admin');const designer=await member('nav-admin-entry','active');
 for(const [cookie,isAdmin]of [[admin,true],[designer,false]]){
  const r=await request(app).get('/?view=admin').set('Cookie',cookie);
  for(const tag of navTags(r.text))assert.doesNotMatch(tag,/is-locked/);
  const tag=r.text.match(/<button id="admin-nav"[^>]*>/)[0];assert.equal(/\bhidden\b/.test(tag),!isAdmin);
  assert.equal((await request(app).get('/api/admin/overview').set('Cookie',cookie)).status,isAdmin?200:403);
 }
});
test('no-design and anonymous users retain their access boundaries',async()=>{
 for(const status of ['none','pending','suspended','rejected']){
  const cookie=await member('nav-'+status,status);const r=await request(app).get('/?view=assets').set('Cookie',cookie);
  for(const tag of navTags(r.text))assert.match(tag,/is-locked/);
  assert.doesNotMatch(r.text,/src="app\.js/);
  assert.equal((await request(app).get('/app.js').set('Cookie',cookie)).status,403);
  assert.equal((await request(app).get('/assets/PixVerse-black.svg').set('Cookie',cookie)).status,200);
 }
 const anonymous=await request(app).get('/');assert.doesNotMatch(anonymous.text,/workspace-session|protected-nav/);
 assert.equal((await request(app).get('/assets/PixVerse-black.svg')).status,401);
});
test('initial session bootstrap is escaped and contains only the normal own-session fields',async()=>{
 const name="</script><script>alert(1)</script> $' $` $&";const cookie=await member('nav-escaped','active',name);
 const r=await request(app).get('/').set('Cookie',cookie);const raw=r.text.match(/<script type="application\/json" id="workspace-session">([\s\S]*?)<\/script>/)?.[1];assert.ok(raw);
 assert.doesNotMatch(raw,/[<>]/);const bootstrap=JSON.parse(raw);
 assert.deepEqual(bootstrap,(await request(app).get('/api/auth/session').set('Cookie',cookie)).body);
 assert.equal(bootstrap.user.name,name);assert.equal('openId' in bootstrap.user,false);assert.equal('email' in bootstrap.user,false);
});
function node(){const attrs=new Map();return {hidden:false,textContent:'',classList:{toggle(name,on){attrs.set(name,on);}},setAttribute(k,v){attrs.set(k,v);},removeAttribute(k){attrs.delete(k);},attrs};}
test('shared navigation applies confirmed design status, without treating an unknown session as a denial',()=>{
 const nodes=[node(),node()],admin=node(),initial={configured:true,authenticated:true,user:{name:'Designer',accessStatus:'active',canDownloadAllLogos:true}};
 const window={location:{href:'http://localhost/?ui=zh'},history:{state:null,replaceState(){}},localStorage:{getItem(){return 'zh';}},document:{readyState:'loading',getElementById(){return {textContent:JSON.stringify(initial)};},querySelectorAll(s){return s==='.protected-nav'?nodes:[];},querySelector(s){return s==='#admin-nav'?admin:null;},addEventListener(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(frontend,'brand-entry.js'),'utf8'),{window,URL});
 assert.equal(window.BrandEntry.initialSession().user.accessStatus,'active');
 window.BrandEntry.applySession(initial);assert.ok(nodes.every(n=>n.attrs.get('is-locked')===false&&!n.attrs.has('aria-haspopup')));assert.equal(admin.hidden,true);
 window.BrandEntry.applySession(null);assert.ok(nodes.every(n=>n.attrs.get('is-locked')===false));
 window.BrandEntry.applySession({...initial,user:{...initial.user,accessStatus:'suspended'}});assert.ok(nodes.every(n=>n.attrs.get('is-locked')===true&&n.attrs.get('aria-haspopup')==='dialog'));
});
test('history restore keeps confirmed navigation while revalidation is pending, then applies revocation',async()=>{
 const fields=Object.fromEntries(['#asset-account','#asset-account-note','#asset-account-login','#asset-account-design','#asset-account-logout','#asset-account-name'].map(id=>[id,node()]));
 const handlers={},states=[],events=[];let resolveSession;
 const fetch=()=>new Promise(resolve=>{resolveSession=body=>resolve({ok:true,json:async()=>body});});
 const window={BrandEntry:{url:p=>p,applyAccess(){},applySession:session=>states.push(session.user.accessStatus)},addEventListener:(n,fn)=>handlers[n]=fn,dispatchEvent:e=>events.push(e)};
 const document={hidden:false,querySelector:s=>fields[s]||{click(){}},addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(path.join(frontend,'asset-account.js'),'utf8'),{window,document,fetch,location:{replace(){}},AbortSignal,setInterval(){},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}}});
 const settle=()=>new Promise(r=>setImmediate(r)),session=status=>({configured:true,authenticated:true,user:{name:'Designer',accessStatus:status,canDownloadAllLogos:true}});
 resolveSession(session('active'));await settle();assert.deepEqual(states,['active']);
 handlers.pageshow({persisted:true});await settle();assert.deepEqual(states,['active']);
 resolveSession(session('active'));await settle();assert.deepEqual(states,['active','active']);
 handlers.pageshow({persisted:true});resolveSession(session('suspended'));await settle();assert.deepEqual(states,['active','active','suspended']);
 assert.ok(events.some(e=>e.type==='workspace-session-updated'&&e.detail.user.accessStatus==='suspended'));
});

test('badge tools require design approval while the asset library remains available to members', async () => {
 const resources=['/corner-badge.js','/%63orner-badge.js','/assets/corner-badge/hb.wasm','/assets%2Fcorner-badge%2Fwordmark-white.svg'];
 const admin=await member('nav-admin',null,'Navigation QA Admin');
 const scenarios=[{label:'anonymous',cookie:null,allowed:false}];
 for(const status of ['none','pending','rejected','suspended','active']){
  scenarios.push({label:status,cookie:await member('badge-'+status,status),allowed:status==='active'});
 }
 scenarios.push({label:'admin',cookie:admin,allowed:true});
 for(const scenario of scenarios){
  const get=(url,method='get')=>{
   const req=request(app)[method](url);
   return scenario.cookie?req.set('Cookie',scenario.cookie):req;
  };
  for(const url of resources){
   const result=await get(url,'head');
   assert.equal(result.status,scenario.cookie?(scenario.allowed?200:403):401,scenario.label+' '+url);
  }
  const range=await get('/assets/corner-badge/wordmark-black.svg').set('Range','bytes=0-3');
  assert.equal(range.status,scenario.cookie?(scenario.allowed?206:403):401,scenario.label+' Range');
  const page=await get('/?view=tools&entry=domestic&ui=zh');
  assert.equal(/<script defer src="corner-badge\.js/.test(page.text),scenario.allowed,scenario.label+' tools script');
  const tags=navTags(page.text);
  assert.equal(tags.length,scenario.cookie?3:0,scenario.label+' protected navigation');
  if(!scenario.cookie)continue;
  assert.equal((await get('/assets/PixVerse-black.svg','head')).status,200,scenario.label+' logos');
  assert.equal((await get('/assets/common-fonts/Montserrat.zip','head')).status,200,scenario.label+' fonts');
  assert.equal((await get('/api/cloud/projects')).status,scenario.allowed?200:403,scenario.label+' files');
 }
});
