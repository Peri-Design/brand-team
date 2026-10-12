(function(root){
const LANG={en:'English',zh:'中文',ja:'日本語'};
const RES={web:{name:'Web 首页 Banner',size:[330,139.5],variants:['primary'],thumb:'web',label:'标准版式'},app:{name:'App 首页 Banner',size:[381,120],variants:['primary','secondary'],thumb:'app',label:'2 种版式'},social:{name:'国内社媒封面',size:[270,360],variants:['primary','secondary'],thumb:'social',label:'2 种版式 · 中文'}};
const blocks=()=>({preset:'auto',layers:[{colors:['#6453ed','#5140df','#302084'],opacity:80},{colors:['#6550f5','#4935ec','#3223aa'],opacity:80}]});
const emptyCopy=()=>({title:'',appSecondaryTitle:'',subtitle:''});
function fresh(){return {version:2,name:'未命名项目',image:null,imageName:'',serial:0,copy:Object.fromEntries(Object.keys(LANG).map(l=>[l,emptyCopy()])),items:[]};}
function add(s,type,languages){if(!RES[type])throw Error('资源位不存在');const langs=type==='social'?['zh']:Object.keys(LANG).filter(l=>languages.includes(l));if(!langs.length)throw Error('请至少选择一种语言');const m={id:'m'+(++s.serial),type,name:RES[type].name,variant:'primary',languages:langs,image:null,imageName:'',background:'#FFFFFF',backgroundEnabled:true,webBlocks:blocks(),webLogo:{kind:'none',image:null},adjustments:{},socialCopy:{title:'',series:''}};s.items.push(m);return m;}
function addMany(s,types,languages){const chosen=[...new Set(types)];if(!chosen.length)throw Error('请至少选择一种物料');if(chosen.some(t=>!RES[t]))throw Error('资源位不存在');if(chosen.some(t=>t!=='social')&&!Object.keys(LANG).some(l=>languages.includes(l)))throw Error('请为 Web / App 至少选择一种语言');return chosen.map(type=>add(s,type,languages));}
const adj=(m,l)=>({zoom:100,x:0,y:0,fade:48,textColorMode:'white',textColor:'#FFFFFF',...m.adjustments[l]});
function copyField(m){return m.type==='social'?'title':m.type==='app'&&m.variant==='secondary'?'appSecondaryTitle':'title';}
function setCopy(s,m,l,field,value){if(m.type==='social')m.socialCopy[field]=value;else s.copy[l][field]=value;}
function outputs(s){return s.items.flatMap(m=>m.languages.map(l=>({key:m.id+':'+l,m,l})));}
function remove(s,id){s.items=s.items.filter(m=>m.id!==id);}
function batch(s,id,l,targets,fade,color){const m=s.items.find(m=>m.id===id),a=adj(m,l);for(const target of targets){const [mid,lang]=target.split(':'),other=s.items.find(m=>m.id===mid);if(!other||other.type!==m.type||other.variant!==m.variant||!other.languages.includes(lang))continue;other.adjustments[lang]={...adj(other,lang),zoom:a.zoom,x:a.x,y:a.y,...(fade?{fade:a.fade}:{}),...(color?{textColorMode:a.textColorMode,textColor:a.textColor,textOpacity:a.textOpacity??100}:{})};}}
function resize(a,g,corner,dx,dy){const sx=corner.includes('w')?-1:1,sy=corner.includes('n')?-1:1,ratio=Math.max(.01,1+(sx*dx*g.iw+sy*dy*g.ih)/(g.iw*g.iw+g.ih*g.ih));const zoom=Math.max(60,Math.min(220,a.zoom*ratio)),r=zoom/a.zoom,iw=g.iw*r,ih=g.ih*r,ix=corner.includes('w')?g.ix+g.iw-iw:g.ix,iy=corner.includes('n')?g.iy+g.ih-ih:g.iy;return {...a,zoom,x:(ix-(g.w-iw))/g.w*100,y:(iy-(g.h-ih)/2)/g.h*100};}
function validate(s){
 const fail=()=>{throw Error('物料文件格式不正确，请从文件中心重新打开。');};
 const hex=x=>typeof x==='string'&&/^#[a-f0-9]{6}$/i.test(x),text=(x,n=2000)=>typeof x==='string'&&x.length<=n,percent=x=>x===undefined||Number.isFinite(x)&&x>=0&&x<=100;
 const image=x=>x===null||typeof x==='string'&&/^data:image\/(png|jpeg|webp|svg\+xml);base64,[a-zA-Z0-9+/=]+$/.test(x);
 if(!s||s.version!==2||!text(s.name,80)||!Number.isInteger(s.serial)||s.serial<0||!Array.isArray(s.items)||!s.copy||!image(s.image)||!text(s.imageName,255))fail();
 for(const l of Object.keys(LANG))if(!s.copy[l]||!['title','appSecondaryTitle','subtitle'].every(k=>text(s.copy[l][k])))fail();
 const ids=new Set();
 for(const m of s.items){
  if(!m||!/^m[1-9][0-9]*$/.test(m.id)||ids.has(m.id)||Number(m.id.slice(1))>s.serial||!text(m.name,200)||!RES[m.type]||!RES[m.type].variants.includes(m.variant)||!Array.isArray(m.languages)||!m.languages.length||new Set(m.languages).size!==m.languages.length||m.languages.some(l=>!LANG[l]||m.type==='social'&&l!=='zh'))fail();ids.add(m.id);
  if(!image(m.image)||!text(m.imageName,255)||!hex(m.background)||typeof m.backgroundEnabled!=='boolean'||!percent(m.backgroundOpacity)||!m.adjustments||!m.socialCopy||!text(m.socialCopy.title)||!text(m.socialCopy.series))fail();
  if(!m.webLogo||!['none','white','black','custom'].includes(m.webLogo.kind)||!image(m.webLogo.image))fail();
  if(!m.webBlocks||!['auto','custom'].includes(m.webBlocks.preset)||!Array.isArray(m.webBlocks.layers)||m.webBlocks.layers.length!==2||m.webBlocks.layers.some(l=>!l||!Array.isArray(l.colors)||l.colors.length!==3||!l.colors.every(hex)||!Number.isFinite(l.opacity)||l.opacity<10||l.opacity>100))fail();
  for(const [l,a]of Object.entries(m.adjustments))if(!LANG[l]||!a||['zoom','x','y','fade','textOpacity'].some(k=>a[k]!==undefined&&!Number.isFinite(a[k]))||a.zoom!==undefined&&(a.zoom<60||a.zoom>220)||!percent(a.fade)||!percent(a.textOpacity)||a.textColor!==undefined&&!hex(a.textColor)||a.textColorMode!==undefined&&!['white','custom'].includes(a.textColorMode))fail();
 }
 return s;
}
const api={LANG,RES,fresh,add,addMany,adj,copyField,setCopy,outputs,remove,batch,resize,validate};if(typeof module!=='undefined')module.exports=api;else root.MaterialModel=api;
})(typeof window==='undefined'?globalThis:window);
