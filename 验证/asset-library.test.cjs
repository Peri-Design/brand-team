'use strict';
process.env.ENABLE_DEV_AUTH='true';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),request=require('supertest');
const catalog=require('../public/asset-catalog'),{makeAssetZip}=require('../public/asset-zip');
const {app,ready}=require('../server');
const all=catalog.assets.flatMap(a=>catalog.files(a)),dist=path.resolve(__dirname,'../public');
test('catalog exposes exactly the available originals, with compatible cross-brand filters',()=>{
 assert.equal(catalog.assets.length,7);assert.equal(all.length,20);assert.equal(new Set(all.map(f=>f.name)).size,20);
 for(const f of all)assert.ok(fs.existsSync(path.join(dist,f.url)),f.url);
 assert.equal(catalog.filter({brand:'拍我 AI',format:'svg'}).length,1);
 assert.equal(catalog.filter({type:'combo',format:'svg'}).length,0);
 assert.equal(catalog.filter({query:'Paiwo'}).length,3);
 const pv=catalog.assets[0];assert.equal(catalog.files(pv,[1],['png']).length,1);assert.equal(catalog.files(pv,[],['png']).length,0);
 assert.equal(catalog.files(catalog.assets.find(a=>a.id==='pixlab-cn'),[0],['svg']).length,0);
});
test('a full cross-brand ZIP preserves every original byte, filename and CRC',async()=>{
 const loaded=all.map(f=>({...f,bytes:new Uint8Array(fs.readFileSync(path.join(dist,f.url)))}));
 const bytes=Buffer.from(await makeAssetZip(loaded).arrayBuffer());
 const result=JSON.parse(execFileSync('python3',['-c',`import sys,io,zipfile,hashlib,json
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))`],{input:bytes,maxBuffer:4*1024*1024}).toString());
 assert.equal(Object.keys(result).length,20);
 for(const f of loaded)assert.equal(result[f.name],crypto.createHash('sha256').update(f.bytes).digest('hex'));
});
test('library scripts and all originals require membership, without requiring design approval',async()=>{
 const {store}=await ready;await store.upsertUser({openId:'asset-library-qa',name:'Catalog QA'});
 const cookie='pv_session='+await store.createSession('asset-library-qa',60000);
 for(const url of ['/asset-catalog.js','/asset-library.js','/asset-zip.js',...all.map(f=>f.url)]){
  assert.equal((await request(app).get(url)).status,401,url);
  assert.equal((await request(app).get(url).set('Cookie',cookie)).status,200,url);
 }
 const page=await request(app).get('/?view=assets').set('Cookie',cookie);assert.match(page.text,/id="brand-asset-library"/);assert.doesNotMatch(page.text,/src="app\.js/);
 assert.equal((await request(app).get('/api/cloud/projects').set('Cookie',cookie)).status,403);
 await request(app).post('/api/auth/logout').set('Cookie',cookie);
 assert.equal((await request(app).get(all[0].url).set('Cookie',cookie)).status,401);
});
