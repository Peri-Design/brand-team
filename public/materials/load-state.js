'use strict';
window.MaterialLoadState={
 ready(){document.body.dataset.loadState='ready';document.body.inert=false;document.querySelector('#workspace').inert=false;document.querySelector('#workspace').setAttribute('aria-busy','false');},
 fail(error){document.body.dataset.loadState='error';document.body.inert=false;document.querySelector('#workspace').inert=false;document.querySelector('#workspace').setAttribute('aria-busy','false');document.querySelector('#load-title').textContent='文件未能打开';document.querySelector('#load-detail').textContent='未改动已保存的内容。'+(error?.message||'请检查连接后重试。');document.querySelector('#load-retry').hidden=false;document.querySelector('#save-status').textContent='载入失败';}
};
document.querySelector('#load-retry').onclick=()=>location.reload();
