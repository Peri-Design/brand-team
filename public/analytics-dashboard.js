(function(){
 'use strict';
 const root=document.getElementById('analytics-dashboard');if(!root)return;
 const sections=document.getElementById('admin-sections'),management=document.getElementById('admin-management'),capacityRoot=document.getElementById('admin-capacity'),tabPanel=document.getElementById('admin-tabpanel');
 let days=7,data=null,loading=false,error=false,seq=0,section='overview';
 const zh=()=>window.PixVerseUI?.locale==='zh';
 const t=(a,b)=>zh()?a:b;
 const n=v=>Number(v||0).toLocaleString(zh()?'zh-CN':'en-US');
 const pages=()=>[['overview',t('概览','Overview')],['exports',t('物料与导出','Materials & exports')],['brand',t('品牌素材','Brand assets')],['management',t('成员与文件','Members & files')]];
 function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
 function card(title,value,note){const a=el('article',undefined,'analytics-metric');a.append(el('span',title),el('strong',value));if(note)a.append(el('small',note));return a;}
 function panel(title,note){const p=el('section',undefined,'analytics-panel');p.append(el('h3',title));if(note)p.append(el('p',note,'analytics-note'));return p;}
 function bars(title,note,values){const p=panel(title,note),total=values.reduce((a,x)=>a+x[1],0),max=Math.max(1,...values.map(x=>x[1]));if(!total)p.querySelector('.analytics-note').append(document.createTextNode(t(' · 暂无记录',' · No records yet')));for(const [label,value]of values){const row=el('div',undefined,'analytics-bar-row'),head=el('div');head.append(el('span',label),el('strong',`${n(value)} · ${total?Math.round(value/total*100):0}%`));const track=el('div',undefined,'analytics-track'),fill=el('span');fill.style.width=(value/max*100)+'%';track.setAttribute('aria-hidden','true');track.append(fill);row.append(head,track);p.append(row);}return p;}
 function chevron(){
  const icon=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
  icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('class','analytics-chevron');icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');path.setAttribute('d','m9 6 6 6-6 6');icon.append(path);return icon;
 }
 function disclosure(label,cls){const details=el('details',undefined,cls),summary=el('summary',undefined,'analytics-disclosure');summary.append(chevron(),el('span',label));details.append(summary);return details;}
 function metrics(...values){const cards=el('div',undefined,'analytics-metrics');cards.append(...values);return cards;}
 function placements(d,current=false){return bars(current?t('当前资源位使用情况','Current placement usage'):t('资源位导出分布','Exports by placement'),current?t('有效云端文件中的物料语言版本数；与时间筛选无关','Material-language versions in active cloud files; all time'):t('按已生成图片张数统计','Counted per generated image'),[['web','Web Banner'],['app','App Banner'],['social',t('社媒封面','Social cover')]].map(([key,label])=>[label,(current?d.inventory.types:d.types)[key]]));}
 function selectSection(key,focus=false){section=key;render();document.getElementById('admin').scrollTop=0;if(focus)document.getElementById('admin-tab-'+key)?.focus();}
 function updateSections(){
  sections.setAttribute('role','tablist');sections.setAttribute('aria-label',t('管理后台栏目','Admin sections'));sections.replaceChildren();
  const items=pages();
  for(const [key,label] of items){const b=el('button',label);b.type='button';b.id='admin-tab-'+key;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(section===key));b.setAttribute('aria-controls','admin-tabpanel');b.tabIndex=section===key?0:-1;b.onclick=()=>selectSection(key,true);b.onkeydown=e=>{const i=items.findIndex(x=>x[0]===key);let next;if(e.key==='ArrowRight')next=(i+1)%items.length;else if(e.key==='ArrowLeft')next=(i+items.length-1)%items.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=items.length-1;else return;e.preventDefault();selectSection(items[next][0],true);};sections.append(b);}
  tabPanel.setAttribute('aria-labelledby','admin-tab-'+section);
 }
 function heading(){
  document.getElementById('admin-title').textContent=t('管理概览','Admin overview');
  document.getElementById('admin-description').textContent=t('关键数据集中查看，详细统计按栏目切换。','Key metrics at a glance. Explore each section for details.');
  const controls=document.getElementById('admin-analytics-controls');controls.replaceChildren();
  const group=el('div',undefined,'analytics-range');group.setAttribute('role','group');group.setAttribute('aria-label',t('统计时间','Reporting period'));
  for(const d of [7,30]){const b=el('button',t(`近 ${d} 天`,`Last ${d} days`));b.type='button';b.dataset.statsFocus='range-'+d;b.setAttribute('aria-pressed',String(days===d));b.disabled=loading;b.onclick=()=>{days=d;load();};group.append(b);}
  const refresh=el('button',t('刷新','Refresh'),'secondary');refresh.type='button';refresh.dataset.statsFocus='refresh';refresh.disabled=loading;refresh.onclick=()=>{if(section==='management')document.getElementById('admin-refresh').click();load();};controls.append(group,refresh);group.hidden=section==='management';
 }
 function dailyDetails(d,target){
  const details=disclosure(t('查看每日明细','View daily breakdown'));const daily=el('table'),dh=el('thead'),dr=el('tr');for(const text of [t('日期','Date'),t('活跃用户','Active users'),t('新建项目','New projects'),t('导出次数','Exports'),t('物料张数','Images')]){const th=el('th',text);th.scope='col';dr.append(th);}dh.append(dr);daily.append(dh);const db=el('tbody');for(const row of [...d.daily].reverse()){const tr=el('tr');for(const value of [row.date,n(row.active),n(row.projects),n(row.exports),n(row.images)])tr.append(el('td',value));db.append(tr);}daily.append(db);const tableWrap=el('div',undefined,'analytics-table-scroll');tableWrap.tabIndex=0;tableWrap.setAttribute('role','region');tableWrap.setAttribute('aria-label',t('每日统计表格','Daily statistics table'));tableWrap.append(daily);details.append(tableWrap);target.append(details);

 }
 function trend(d){
  const p=panel(t('物料导出趋势','Material export trend'),t('按生成图片张数统计','Counted per generated image'));p.classList.add('analytics-trend');
  const plot=el('div',undefined,'analytics-columns'),max=Math.max(1,...d.daily.map(x=>x.images));plot.setAttribute('role','img');plot.setAttribute('aria-label',t(`近 ${days} 天导出 ${n(d.images)} 张物料；每日数值见下方明细。`,`${n(d.images)} images exported in the last ${days} days. Daily values are available below.`));
  for(const [i,row] of d.daily.entries()){const col=el('div',undefined,'analytics-column');col.title=`${row.date}: ${n(row.images)}`;const value=el('span',n(row.images),'analytics-column-value'),track=el('div',undefined,'analytics-column-track'),fill=el('span');fill.style.height=`${row.images/max*100}%`;fill.append(value);track.append(fill);const label=el('small',(days===7||i%5===0||i===d.daily.length-1)?row.date.slice(5).replace('-','/'):'');col.append(track,label);plot.append(col);}
  plot.dataset.days=days;p.append(plot);dailyDetails(d,p);return p;
 }
 function overview(d){
  root.append(metrics(card(t(`近 ${days} 天活跃用户`,`Active · ${days} days`),n(days===7?d.active7:d.active30),t('按登录用户去重','Unique authorized users')),card(t('新建项目','New projects'),n(d.newProjects),t('所选期间创建、仍有云端记录','Created in period; existing cloud records')),card(t('导出物料','Exported images'),n(d.images),t(`${n(d.exports)} 次导出 · 含重复导出`,`${n(d.exports)} export runs · includes repeats`)),card(t('Logo 下载点击','Logo download clicks'),n(d.logoClicks),t('下载点击，不代表保存成功','Clicks; not confirmed saves'))));
  const grid=el('div',undefined,'analytics-grid analytics-overview-grid');grid.append(trend(d),placements(d));root.append(grid);
  const summary=el('div',undefined,'analytics-summary');for(const [label,value] of [[t('新增用户','New users'),d.newUsers],[t('今日活跃','Active today'),d.activeToday],[t('近 30 天活跃','Active · 30 days'),d.active30],[t('有效文件','Active files'),d.inventory.files]]){const item=el('div');item.append(el('span',label),el('strong',n(value)));summary.append(item);}const link=el('button',undefined,'analytics-text-button');link.append(el('span',t('查看成员与文件','View members & files')),chevron());link.type='button';link.onclick=()=>selectSection('management',true);summary.append(link);root.append(summary);
 }
 function exportsView(d){
  root.append(metrics(card(t('导出次数','Export runs'),n(d.exports),t('已生成文件并触发下载','Files generated; download initiated')),card(t('导出物料张数','Exported images'),n(d.images),t('含重复导出','Includes repeat exports')),card(t('单张导出','Single exports'),n(d.single),t('按导出次数统计','Counted per export run')),card(t('批量导出','Batch exports'),n(d.batch),t('一次 ZIP 记为一次','One ZIP counts as one run'))));
  const grid=el('div',undefined,'analytics-grid');grid.append(placements(d),bars(t('物料语言','Material languages'),t('图片内容的语言，与界面语言无关','Language of exported materials'),[['English',d.languages.en],['中文',d.languages.zh],['日本語',d.languages.ja]]),bars(t('单张与批量导出','Single and batch exports'),t('按导出次数统计','Counted per export run'),[[t('单张','Single'),d.single],[t('批量','Batch'),d.batch]]),placements(d,true));
  const issues=[['missing_copy',t('必填文案缺失','Missing required copy')],['missing_image',t('缺少图片','Missing image')],['text_layout',t('文字排版或边界问题','Text layout or boundary')],['low_resolution',t('图片分辨率不足','Low image resolution')],['other',t('其他规范问题','Other validation issues')]];
  grid.append(bars(t('常见制作问题','Common validation issues'),t('每次检查中，同张图片的同类问题只计一次','One count per issue category per image per check'),issues.map(([k,label])=>[label,d.issues[k]])));
  const flow=panel(t('下载流程','Export workflow'),t('独立事件次数，跨日和跨步骤不构成严格转化率；非审核结果','Independent event counts, not a conversion funnel or approval result'));
  const stages=[['export_started',t('发起导出','Started')],['blocked',t('检查受阻','Blocked by checks')],['warning',t('清晰度提醒','Resolution warning')],['export_returned',t('返回编辑／定位物料','Returned to edit / locate')],['export_cancelled',t('取消或关闭','Cancelled / closed')],['export_confirmed',t('确认继续导出','Confirmed export')],['export_failed',t('生成失败','Generation failed')]];
  const dl=el('dl',undefined,'analytics-list');for(const [k,label]of stages){const row=el('div');row.append(el('dt',label),el('dd',n(d.flow[k])));dl.append(row);}flow.append(dl);grid.append(flow);

  root.append(grid);
 }
 function brandView(d){
  const formats=Object.values(d.logos).reduce((a,v)=>({svg:a.svg+v.svg,png:a.png+v.png}),{svg:0,png:0});
  const cards=metrics(card(t('Logo 下载点击','Logo download clicks'),n(d.logoClicks),t('历史数据含旧版访客点击','Historical data includes former guest clicks')),card('SVG',n(formats.svg),t('矢量格式下载点击','Vector format clicks')),card('PNG',n(formats.png),t('位图格式下载点击','Raster format clicks')));cards.classList.add('analytics-three');root.append(cards);
  const grid=el('div',undefined,'analytics-grid');
  const logo=panel(t('品牌素材下载','Brand asset downloads'),t('只统计下载按钮点击；不计预览加载，不识别访客身份','Download-link clicks only; previews excluded, guests not identified'));
  const logoNames={'PixLab-domestic':t('PixLab · 国内版（拍我 AI）','PixLab · Domestic (Paiwo AI)'),'PixLab-international':t('PixLab · 海外版（PixVerse）','PixLab · International (PixVerse)'),'Paiwo-logo-black':t('拍我 AI · 黑色 Logo','Paiwo AI · Black logo'),'Paiwo-logo-white':t('拍我 AI · 白色 Logo','Paiwo AI · White logo'),'Paiwo-black':t('PixVerse × 拍我 AI · 组合 Logo（黑色）','PixVerse × Paiwo AI · Combined logo (black)'),'Paiwo-white':t('PixVerse × 拍我 AI · 组合 Logo（白色）','PixVerse × Paiwo AI · Combined logo (white)'),'Paiwo-white-on-black':t('拍我 AI · 白色字标 · 黑底','Paiwo AI · White on black'),'PixVerse-black':t('PixVerse · 黑色','PixVerse · Black'),'PixVerse-white':t('PixVerse · 白色','PixVerse · White'),'PixVerse-icon-light':t('PixVerse Icon · 浅色底','PixVerse icon · Light'),'PixVerse-icon-dark':t('PixVerse Icon · 深色底','PixVerse icon · Dark'),'AIsphere-black':t('爱诗科技 · 黑色','AIsphere · Black'),'AIsphere-white':t('爱诗科技 · 白色','AIsphere · White')};const table=el('table'),thead=el('thead'),hr=el('tr');for(const label of [t('Logo 款式','Logo'),'SVG','PNG',t('总计','Total')]){const th=el('th',label);th.scope='col';hr.append(th);}thead.append(hr);table.append(thead);const body=el('tbody');for(const [name,values]of Object.entries(d.logos)){const tr=el('tr');tr.append(el('td',logoNames[name]),el('td',n(values.svg)),el('td',n(values.png)),el('td',n(values.svg+values.png)));body.append(tr);}table.append(body);logo.append(table);grid.append(logo);
  grid.append(bars(t('Logo 格式分布','Logo formats'),t('同一人重复点击会重复计数','Repeated clicks are counted'),['svg','png'].map(k=>[k.toUpperCase(),Object.values(d.logos).reduce((sum,v)=>sum+v[k],0)])));

  root.append(grid);
 }
 function capacityView(d,target){
  const capacity=panel(t('文件与容量','Files and storage'),t('当前全部云端记录，与时间筛选无关；容量为文件记录大小，不是数据库磁盘占用','All current cloud records, independent of date filter; recorded file size, not database disk usage'));
  capacity.append(bars(t('有效文件大小分布','Active file sizes'),t('按文件数量统计','Number of files'),[['< 5 MB',d.inventory.sizes.small],['5–20 MB',d.inventory.sizes.medium],['≥ 20 MB',d.inventory.sizes.large]]));target.append(capacity);

 }
 function foot(d,target){
  const details=disclosure(t('统计口径与采集说明','Metric definitions & collection'),'analytics-method');
  const date=new Date(d.startedAt).toLocaleDateString(zh()?'zh-CN':'en-GB',{timeZone:'Asia/Shanghai'});
  details.append(el('p',t(`行为采集始于 ${date}，按北京时间统计。此前的下载和活跃数据不补算。新增用户为所选期间首次创建账号的人数。每日活跃用户不能相加作为期间去重人数。`,`Activity tracking started on ${date}. Dates use China Standard Time; earlier activity and downloads are unavailable. New users are accounts created in the selected period. Daily active users cannot be summed into period unique users.`),'analytics-note'),el('p',t('统计只供管理员查看。浏览器上报可能因断网或拦截而遗漏，不用于结算或个人绩效；未采集图片、文案及界面语言。','Admin-only analytics. Browser reports may be lost due to connectivity or blocking; not for billing or individual performance. Artwork, copy and interface language are not collected.'),'analytics-note'));target.append(details);
 }
 function render(){
  const activeTab=document.activeElement?.id?.startsWith('admin-tab-')?document.activeElement.id:null;
  updateSections();heading();root.setAttribute('aria-label',t('数据统计','Analytics'));root.replaceChildren();capacityRoot.replaceChildren();root.hidden=section==='management';management.hidden=section!=='management';
  const target=section==='management'?capacityRoot:root;target.setAttribute('aria-busy',String(loading));
  if(loading&&!data){target.append(el('p',t('正在读取统计…','Loading analytics…'),'analytics-empty'));}
  else if(error){const msg=el('p',t('统计暂时无法读取，请点击“刷新”重试。','Analytics could not be loaded. Select Refresh to retry.'),'analytics-empty');msg.setAttribute('role','alert');target.append(msg);}
  else if(data){if(section==='overview')overview(data);else if(section==='exports')exportsView(data);else if(section==='brand')brandView(data);else capacityView(data,target);foot(data,target);}
  if(activeTab)document.getElementById(activeTab)?.focus();
 }
 async function load(){const focus=document.activeElement?.dataset.statsFocus;const token=++seq;loading=true;error=false;data=null;render();try{const response=await fetch(`/api/admin/analytics?days=${days}`,{cache:'no-store'});if(!response.ok)throw Error();const result=await response.json();if(token!==seq)return;data=result;}catch{if(token!==seq)return;error=true;}finally{if(token===seq){loading=false;render();if(focus&&document.activeElement===document.body)document.querySelector(`[data-stats-focus="${focus}"]`)?.focus();}}}
 root.setAttribute('aria-label',t('数据统计','Analytics'));
 root.setAttribute('translate','no');root.setAttribute('data-ui-content','');
 capacityRoot.setAttribute('translate','no');capacityRoot.setAttribute('data-ui-content','');
 new MutationObserver(()=>{if(document.body.dataset.view==='admin'&&!loading)load();}).observe(document.body,{attributes:true,attributeFilter:['data-view']});
 window.addEventListener('ui-language-change',render);render();if(document.body.dataset.view==='admin')load();
})();
