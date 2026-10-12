const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../public');
function boot({saved,language='zh-CN',blocked=false}={}){
 const values=new Map(saved?[['pixverse-ui-language',saved]]:[]),events=[];
 const window={navigator:{language},localStorage:{getItem:key=>{if(blocked)throw Error('blocked');return values.get(key);},setItem:(key,value)=>{if(blocked)throw Error('blocked');values.set(key,value);}},dispatchEvent:event=>events.push(event)};
 const context=vm.createContext({window,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
 for(const file of ['ui-messages.js','ui-i18n.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 return {ui:window.PixVerseUI,values,events,messages:window.PixVerseEnglish};
}
test('UI language follows browser initially, then the explicit saved choice',()=>{
 assert.equal(boot({language:'en-US'}).ui.locale,'en');assert.equal(boot({language:'zh-TW'}).ui.locale,'zh');
 assert.equal(boot({language:'en-US',saved:'zh'}).ui.locale,'zh');assert.equal(boot({saved:'invalid'}).ui.locale,'zh');
 const {ui,values,events}=boot();ui.setLocale('en');assert.equal(values.get(ui.KEY),'en');assert.equal(events[0].detail.locale,'en');
 ui.setLocale('ja');assert.equal(ui.locale,'en');assert.equal(events.length,1);
});
test('storage restrictions do not prevent changing the UI language',()=>{const {ui}=boot({blocked:true});ui.setLocale('en');assert.equal(ui.t('品牌素材'),'Brand assets');ui.setLocale('zh');assert.equal(ui.t('品牌素材'),'品牌素材');});
test('dynamic dialogs and material counts translate without changing embedded names',()=>{
 const {ui}=boot({saved:'en'});const name='下载 · 中文「测试」';
 assert.equal(ui.t(`将“${name}”移到回收站？可在 30 天内恢复。`),`Move “${name}” to trash? You can restore it within 30 days.`);
 assert.equal(ui.t(`永久删除“${name}”？此操作无法撤销。`),`Permanently delete “${name}”? This cannot be undone.`);
 assert.equal(ui.t(`当前账号：${name}`),`Account: ${name}`);
 assert.equal(ui.t('编辑于 2 小时前 · 22 MB'),'Edited 2 hours ago · 22 MB');
 assert.equal(ui.t('添加 1 种物料'),'Add 1 format');assert.equal(ui.t('添加 3 种物料'),'Add 3 formats');
 assert.equal(ui.t('1080 × 1440 px · 样式 1 · 叙事标题'),'1080 × 1440 px · Style 1 · Story title');
 assert.equal(ui.t('物料语言 · 中文 / English / 日本語'),'Material languages · Chinese / English / Japanese');
});
test('errors and export checks retain counts and translate actionable details',()=>{
 const {ui}=boot({saved:'en'});
 assert.equal(ui.t('下载失败：图片导出失败'),'Download failed: Image export failed');
 assert.equal(ui.t('奇怪失败：raw error'),'奇怪失败：raw error');
 assert.equal(ui.t('未改动已保存的内容。云端连接超时，请重试'),'Your saved content has not been changed. Cloud connection timed out. Please retry.');
 assert.match(ui.t('已检查所选 6 张图片，其中 2 张需要修改后才能下载。'),/Checked 6 images. 2 need changes/);
 assert.equal(ui.t('当前语言文字颜色，当前 #FFFFFF'),'Text color · Current language; current #FFFFFF');
});
test('all brand guideline visible Chinese copy and labels have English coverage',()=>{
 const {ui}=boot({saved:'en'});const html=fs.readFileSync(path.join(root,'brand-guidelines.html'),'utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<div class="ui-language"[\s\S]*?<\/div>/g,'');
 const texts=[...html.matchAll(/>([^<>]+)</g)].map(m=>m[1].trim()).filter(s=>/[\u4e00-\u9fff]/.test(s));
 for(const text of texts)assert(!/[\u4e00-\u9fff]/.test(ui.t(text)),`Untranslated: ${text}`);
 assert(html.includes('禁止使用 AI 生成的 Logo；请使用官方提供的 Logo 文件。'));
 assert.equal(ui.t('禁止使用 AI 生成的 Logo；请使用官方提供的 Logo 文件。'),'Do not use AI-generated logos. Use the official logo files.');
});
