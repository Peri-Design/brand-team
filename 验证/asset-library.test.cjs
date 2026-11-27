'use strict';
process.env.ENABLE_DEV_AUTH='true';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),request=require('supertest');
const catalog=require('../public/asset-catalog'),{makeAssetZip}=require('../public/asset-zip');
const {app,ready}=require('../server');
const all=catalog.assets.flatMap(a=>catalog.files(a)),dist=path.resolve(__dirname,'../public');
test('catalog exposes exactly the available originals, with compatible cross-brand filters',()=>{
 assert.equal(catalog.assets.length,6);assert.equal(all.length,27);assert.equal(new Set(all.map(f=>f.name)).size,27);
 for(const f of all)assert.ok(fs.existsSync(path.join(dist,f.url)),f.url);
 assert.equal(catalog.filter({brand:'拍我 AI',format:'svg'}).length,0);
 assert.equal(catalog.filter({type:'combo',format:'svg'}).length,0);
 assert.equal(catalog.filter({query:'Paiwo'}).length,0);
 const pv=catalog.assets[0];
 assert.deepEqual(catalog.files(pv).map(f=>f.url),['black','white','reverse'].flatMap(kind=>['svg','png'].map(ext=>`/assets/PixVerse-${kind}.${ext}`)));
assert.equal(catalog.files(pv,[1],['png']).length,1);assert.equal(catalog.files(pv,[],['png']).length,0);
 assert.equal(catalog.files(catalog.assets.find(a=>a.id==='pixlab-global'),[0],['svg']).length,0);
});
test('PixVerse downloads use tight artwork bounds while built-in templates retain their authored framing',()=>{
 for(const {url,format} of catalog.files(catalog.assets[0])){
  const bytes=fs.readFileSync(path.join(dist,url));
  if(format==='png'){
   assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20),bytes[25]],[8192,1696,6],url);
  }else{
   const svg=bytes.toString();
   assert.match(svg,/viewBox="25\.28 5\.7866 973\.44 201\.4268"/);
   if(url.includes('-reverse'))continue;
   const frame=fs.readFileSync(path.join(dist,'materials/vendor',path.basename(url,'.svg')+'-template.svg'),'utf8');
   assert.match(frame,/viewBox="0 0 1024 213"/);
   assert.equal(frame.slice(frame.indexOf('xml:space=')),svg.slice(svg.indexOf('xml:space=')));
  }
 }
});
test('World is a separately searchable Logo with three paired SVG and transparent PNG variants',()=>{
 const matches=catalog.filter({brand:'PixVerse',type:'logo',query:'World'});
 assert.deepEqual(matches.map(a=>a.id),['pv-world']);
 const items=catalog.files(matches[0]);
 assert.deepEqual(items.map(f=>f.url),['black','white','reverse'].flatMap(kind=>['svg','png'].map(ext=>`/assets/PixVerse-world-${kind}.${ext}`)));
 for(const {url,format} of items){
  const bytes=fs.readFileSync(path.join(dist,url));
  if(format==='png')assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20),bytes[25]],[6229,806,6],url);
  else assert.match(bytes.toString(),/viewBox="25\.28 5\.7866 1557\.0161 201\.4268"/);
 }
});
test('vertical Logo has three complete original SVG/PNG pairs, searchable labels and download analytics',()=>{
 const matches=catalog.filter({brand:'PixVerse',type:'logo',query:'竖版'});
 assert.deepEqual(matches.map(item=>item.id),['pv-logo-vertical']);
 const vertical=matches[0];
 assert.deepEqual(catalog.filter({query:'vertical'}).map(item=>item.id),['pv-logo-vertical']);
 assert.deepEqual(vertical.variants.map(variant=>variant.label),['彩色黑字','彩色浅字','反白']);
 assert.deepEqual(vertical.variants.map(variant=>Boolean(variant.dark)),[false,true,true]);
 const originals={
  "/assets/PixVerse-vertical-black.svg": "e0a1e3f8366e36a824e3033a502fbb595f7f95ca4f661b2730a226bbcfe8de68",
  "/assets/PixVerse-vertical-white.svg": "a9b153ea0b3aac77affb9bbb4b83fca862854a232b563aaeb7ec0fedfd26cb73",
  "/assets/PixVerse-vertical-reverse.svg": "390bb2a32088e7aacaf222a27b8ff2e7e5057c46fde95b4b10de568e17946276",
  "/assets/PixVerse-vertical-black.png": "ac486d8e79f360db8da22ac2d16c5a0dffc906c6db403f256be141016996acdd",
  "/assets/PixVerse-vertical-reverse.png": "17b6f679f05f3362e9634b04a5a03919d1b6ba7ed794160f1aa1684ef8005d9d",
  "/assets/PixVerse-vertical-white.png": "115206c31b4abfbf89ef26914c0cf8e8936a21842baeccd2d705a18d86508cb9"
};
 for(const file of catalog.files(vertical)){
  const bytes=fs.readFileSync(path.join(dist,file.url));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),originals[file.url],file.url);
  if(file.format==='png')assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20),bytes[25]],[8192,7004,6]);
  else assert.match(bytes.toString(),/viewBox="0 0 750 641\.197322"/);
  const event=require('../analytics').normalizeEvent({id:'vertical-'+file.asset+'-'+file.format,kind:'logo_download',asset:file.asset,format:file.format});
  assert.deepEqual(event.data,{asset:file.asset,format:file.format});
 }
 assert.equal(catalog.files(vertical,undefined,['svg']).length,3);
 assert.deepEqual(catalog.files(vertical,[2],['png']).map(file=>file.url),['/assets/PixVerse-vertical-reverse.png']);
});
test('a full cross-brand ZIP preserves every original byte, filename and CRC',async()=>{
 const loaded=all.map(f=>({...f,bytes:new Uint8Array(fs.readFileSync(path.join(dist,f.url)))}));
 const bytes=Buffer.from(await makeAssetZip(loaded).arrayBuffer());
 const result=JSON.parse(execFileSync('python3',['-c',`import sys,io,zipfile,hashlib,json
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
print(json.dumps({n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}))`],{input:bytes,maxBuffer:4*1024*1024}).toString());
 assert.equal(Object.keys(result).length,27);
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

test('withdrawn vertical reverse-black files are excluded from downloads and unavailable to members',async()=>{
 const {store}=await ready;
 await store.upsertUser({openId:'withdrawn-asset-qa',name:'Withdrawn asset QA'});
 const cookie='pv_session='+await store.createSession('withdrawn-asset-qa',60000);
 assert.ok(all.every(file=>!file.asset.includes('vertical-reverse-black')));
 for(const ext of ['svg','png']){
  const url='/assets/PixVerse-vertical-reverse-black.'+ext;
  assert.equal(fs.existsSync(path.join(dist,url)),false);
  assert.equal((await request(app).get(url).set('Cookie',cookie)).status,404,url);
  assert.equal((await request(app).head(url).set('Cookie',cookie)).status,404,url+' HEAD');
  assert.equal((await request(app).get(url.replace('/assets/','/%61ssets/')).set('Cookie',cookie).set('Range','bytes=0-3')).status,404,url+' encoded Range');
 }
});
