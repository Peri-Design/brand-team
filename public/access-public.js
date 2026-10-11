'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let session = { configured: null, user: null };
  let sessionError = false;
  let intendedView = 'new';

  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { node.hidden = true; }, 3200);
  }

  function showAssets() {
    document.body.dataset.view = 'assets';
    for (const view of ['studio', 'assets', 'files', 'admin']) {
      const section = $('#' + view);
      if (section) section.hidden = view !== 'assets';
    }
    $$('[data-view]').forEach(button => {
      const active = button.dataset.view === 'assets';
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  function openGate(target = 'new') {
    intendedView = target;
    const dialog = $('#access-gate');
    const user = session.user;
    const status = user?.accessStatus || 'signed-out';
    dialog.dataset.status = status;
    $('#access-gate-account').hidden = !user;
    $('#access-gate-account').textContent = user ? `当前账号：${user.name}` : '';
    $('#access-gate-login').href = `/api/auth/feishu/start?next=${encodeURIComponent(target)}`;
    $('#access-gate-login').hidden = Boolean(user);
    $('#access-gate-refresh').hidden = !user && !sessionError;
    $('#access-gate-refresh').textContent = sessionError ? '重新读取登录状态' : '刷新权限状态';
    $('#access-gate-login').textContent = target === 'admin' ? '使用飞书登录' : '申请权限';
    if (sessionError) {
      $('#access-gate-title').textContent = '暂时无法读取登录状态';
      $('#access-gate-copy').textContent = '请重试，或使用飞书重新验证身份。';
    } else if (target === 'admin' && user && !user.isAdmin) {
      $('#access-gate-title').textContent = '当前账号没有管理员权限';
      $('#access-gate-copy').textContent = '此入口仅供管理员审核申请。普通成员可返回品牌素材页使用已授权的功能。';
    } else if (session.configured === false) {
      $('#access-gate-title').textContent = '登录服务尚未配置';
      $('#access-gate-copy').textContent = '暂时无法使用飞书登录，请联系工作台管理员。品牌素材仍可正常浏览和下载。';
    } else if (target === 'admin') {
      $('#access-gate-title').textContent = '登录管理后台';
      $('#access-gate-copy').textContent = '使用飞书验证管理员身份后，即可进入后台审核申请。';
    } else if (status === 'pending') {
      $('#access-gate-title').textContent = '申请已提交，等待管理员确认';
      $('#access-gate-copy').textContent = '管理员批准后，你才能新建设计和访问个人文件。审核期间仍可浏览和下载品牌素材。';
    } else if (status === 'suspended') {
      $('#access-gate-title').textContent = '设计权限暂不可用';
      $('#access-gate-copy').textContent = '你的设计权限已被停用。如需恢复，请联系管理员重新开通。';

    } else {
      $('#access-gate-title').textContent = '需要访问权限';
      $('#access-gate-copy').textContent = '设计功能仅对已授权成员开放。使用飞书登录后提交申请，由管理员确认。';
    }
    if (!dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => $('#access-gate-title').focus({ preventScroll: true }));
    }
  }

  async function loadSession() {
    const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('无法读取登录状态');
    const data = await response.json();
    session = { configured: Boolean(data.configured), user: data.authenticated ? data.user : null };
    sessionError = false;
    $$('[data-action="new-project"],[data-view="files"]').forEach(button => {
      button.classList.add('is-locked');
      button.setAttribute('aria-haspopup', 'dialog');
    });
    return data;
  }

  async function refreshAccess() {
    const button = $('#access-gate-refresh');
    button.disabled = true;
    button.textContent = '正在刷新…';
    try {
      const data = await loadSession();
      if (data.user?.isAdmin || (intendedView !== 'admin' && data.user?.accessStatus === 'active')) {
        const view = intendedView;
        location.href = `/?view=${encodeURIComponent(view)}`;
        return;
      }
      openGate(intendedView);
      if (intendedView !== 'admin' && data.user?.accessStatus === 'pending') toast('管理员尚未批准，请稍后再试。');
    } catch (error) {
      sessionError = true;
      openGate(intendedView);
      toast('暂时无法读取登录状态，请重试。');
    } finally {
      button.disabled = false;
      button.textContent = sessionError ? '重新读取登录状态' : '刷新权限状态';
    }
  }

  function navigate(target) {
    if (session.user?.isAdmin || (target !== 'admin' && session.user?.accessStatus === 'active')) {
      location.href = `/?view=${encodeURIComponent(target)}`;
    } else if (target === 'assets') showAssets();
    else openGate(target);
  }
  function dismissGate() {
    $('#access-gate').close();
    if (session.user?.accessStatus === 'active') location.href = '/?view=assets';
  }
  showAssets();
  $$('[data-view]').forEach(button => {
    button.onclick = () => navigate(button.dataset.view);
  });
  $('[data-action="new-project"]').onclick = () => navigate('new');
  $('#access-gate-close').onclick = dismissGate;
  $('#access-gate-dismiss').onclick = dismissGate;
  $('#access-gate-login').onclick = event => {
    if (session.configured !== false) return;
    event.preventDefault();
    toast('登录服务尚未配置，请联系工作台管理员。');
  };
  $('#access-gate-refresh').onclick = refreshAccess;
  $('#access-gate').addEventListener('click', event => { if (event.target === $('#access-gate')) $('#access-gate').close(); });

  const params = new URLSearchParams(location.search);
  const requested = params.get('view');
  const auth = params.get('auth');
  loadSession().then(data => {
    if (data.user?.isAdmin || (requested !== 'admin' && data.user?.accessStatus === 'active')) {
      location.reload();
      return;
    }
    if (['new', 'studio', 'files', 'admin'].includes(requested)) openGate(requested);
    if (auth === 'pending') toast('申请已提交，等待管理员确认。');
    else if (auth === 'suspended') toast('当前账号的设计权限已停用。');
    else if (auth === 'cancelled') toast('已取消飞书登录。');
    else if (auth && auth !== 'success') toast('飞书登录失败，请重试。');
    // Keep the target and failed-auth marker so refresh cannot restart an OAuth loop.
  }).catch(() => {
    sessionError = true;
    if (['new', 'studio', 'files', 'admin'].includes(requested)) openGate(requested);
  }).finally(() => document.documentElement.removeAttribute('data-route-pending'));
})();
