/* A separate brand-library sign-in never requests design access. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const panel = $('#asset-account');
  if (!panel) return;
  const note = $('#asset-account-note'), login = $('#asset-account-login'), design = $('#asset-account-design'), logout = $('#asset-account-logout'), name = $('#asset-account-name');
  const url = path => window.BrandEntry ? window.BrandEntry.url(path) : path;
  let busy = false;
  async function update() {
    if (busy) return;
    busy = true;
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('session');
      const session = await response.json(), user = session.user;
      const allowed = Boolean(session.authenticated && user?.canDownloadAllLogos);
      window.BrandEntry?.applyAccess(allowed);
      panel.hidden = !session.configured;
      name.hidden = !allowed;
      name.textContent = allowed ? user.name : '';
      login.hidden = allowed;
      login.href = url('/api/auth/feishu/start?next=assets');
      logout.hidden = !allowed;
      design.hidden = !allowed || user.isAdmin || user.accessStatus === 'active';
      design.classList.toggle('primary', user?.accessStatus === 'none');
      design.classList.toggle('secondary', user?.accessStatus !== 'none');
      design.textContent = user?.accessStatus === 'pending' ? '查看申请状态' : user?.accessStatus === 'suspended' ? '查看设计权限' : '申请设计权限';
      note.textContent = allowed ? '已开通全部品牌 Logo 下载权限' : '公司同事登录后，可下载全部品牌 Logo。';
    } catch {
      document.body.hidden = true;
      location.replace(url('/?auth=verification_unavailable'));
      panel.hidden = false; name.hidden = true; design.hidden = true; logout.hidden = true; login.hidden = true;
      note.textContent = '暂时无法验证登录状态，请刷新页面重试。';
    } finally { busy = false; }
  }
  design.onclick = () => $('[data-action="new-project"]').click();
  logout.onclick = async () => {
    logout.disabled = true;
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('logout');
      location.href = url('/?view=assets');
    } catch { note.textContent = '退出登录失败，请重试。'; logout.disabled = false; }
  };
  window.addEventListener('pageshow', event => { if (event.persisted) update(); });
  window.addEventListener('brand-access-changed', update);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
  setInterval(() => { if (!document.hidden) update(); }, 60000);
  update();
})();
