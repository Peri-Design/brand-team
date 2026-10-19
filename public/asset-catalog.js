/* Original brand assets, shared by the library and its download verification. */
(function(root){
  'use strict';
  const variants=(stem,exts=['svg','png'])=>[
    {label:'黑色字标',en:'Black wordmark',file:stem+'-black',dark:false,exts},
    {label:'白色字标',en:'White wordmark',file:stem+'-white',dark:true,exts}
  ];
  const assets=[
    {id:'pv-logo',brand:'PixVerse',type:'logo',title:'标准 Logo',en:'Standard logo',variants:variants('PixVerse')},
    {id:'pv-icon',brand:'PixVerse',type:'icon',title:'品牌图标',en:'Brand icon',icon:true,variants:[
      {label:'白底图标',en:'Light icon',file:'PixVerse-icon-light',exts:['svg','png']},
      {label:'深底图标',en:'Dark icon',file:'PixVerse-icon-dark',dark:true,exts:['svg','png']}
    ]},
    {id:'paiwo-logo',brand:'拍我 AI',type:'logo',title:'标准 Logo',en:'Standard logo',variants:variants('Paiwo-logo')},
    {id:'paiwo-combo',brand:'拍我 AI',type:'combo',title:'PixVerse × 拍我 AI',en:'PixVerse × Paiwo AI',variants:variants('Paiwo',['png'])},
    {id:'pixlab-cn',brand:'PixLab',type:'lab',title:'国内版 · 拍我 AI',en:'Domestic · Paiwo AI',variants:[{label:'国内版',en:'Domestic',file:'PixLab-domestic',dark:true,exts:['png']}]},
    {id:'pixlab-global',brand:'PixLab',type:'lab',title:'海外版 · PixVerse',en:'International · PixVerse',variants:[{label:'海外版',en:'International',file:'PixLab-international',dark:true,exts:['png']}]},
    {id:'aisphere-logo',brand:'爱诗科技',type:'logo',title:'企业标准 Logo',en:'Corporate logo',variants:variants('AIsphere')}
  ];
  const brands=['PixVerse','拍我 AI','PixLab','爱诗科技'];
  const brandName=(brand,en)=>en?({'拍我 AI':'Paiwo AI','爱诗科技':'AIsphere'}[brand]||brand):brand;
  function files(item,versions=item.variants.map((_,i)=>i),formats=['svg','png']){
    return item.variants.flatMap((v,i)=>versions.includes(i)?v.exts.filter(ext=>formats.includes(ext)).map(ext=>({
      asset:v.file,format:ext,url:'/assets/'+v.file+'.'+ext,
      name:item.brand+'/'+item.title+'/'+v.label+'/'+v.file+'.'+ext
    })):[]);
  }
  function filter({brand='',type='',format='',query=''}={}){
    const q=query.trim().toLowerCase();
    return assets.filter(a=>(!brand||a.brand===brand)&&(!type||a.type===type)&&(!format||a.variants.some(v=>v.exts.includes(format)))&&
      [a.brand,brandName(a.brand,true),a.title,a.en,...a.variants.flatMap(v=>[v.label,v.en,...v.exts])].join(' ').toLowerCase().includes(q));
  }
  const api={assets,brands,brandName,files,filter};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BrandAssetCatalog=api;
})(typeof window==='undefined'?globalThis:window);
