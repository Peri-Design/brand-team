'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  let session = { configured: false, user: null };
  let intendedView = 'studio';

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

  function openGate(target = 'studio') {
    intendedView = target;
    const dialog = $('#access-gate');
    const user = session.user;
    const status = user?.accessStatus || 'signed-out';
    dialog.dataset.status = status;
    $('#access-gate-account').hidden = !user;
    $('#access-gate-account').textContent = user ? `当前账号：${user.name}` : '';
    $('#access-gate-login').href = `/api/auth/feishu/start?next=${encodeURIComponent(target)}`;
    $('#access-gate-login').hidden = Boolean(user);
    $('#access-gate-refresh').hidden = !user;
    if (status === 'pending') {
      $('#access-gate-title').textContent = '申请已提交，等待管理员确认';
      $('#access-gate-copy').textContent = '管理员批准后，你才能进入运营设计和个人文件。审核期间仍可浏览和下载品牌素材。';
    } else if (status === 'suspended') {
      $('#access-gate-title').textContent = '设计权限暂不可用';
      $('#access-gate-copy').textContent = '你的设计权限已被停用。如需恢复，请联系管理员重新开通。';
    } else if (!session.configured) {
      $('#access-gate-title').textContent = '需要申请访问权限';
      $('#access-gate-copy').textContent = '运营设计需要管理员确认。当前为本地预览，线上环境可通过飞书提交申请。';
    } else {
      $('#access-gate-title').textContent = '需要访问权限';
      $('#access-gate-copy').textContent = '运营设计仅对已授权成员开放。使用飞书登录后提交申请，由管理员确认。';
    }
    if (!dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => $('#access-gate-title').focus({ preventScroll: true }));
    }
  }

  async function loadSession() {
    const response = await fetch('/api/auth/session');
    if (!response.ok) throw new Error('无法读取登录状态');
    const data = await response.json();
    session = { configured: Boolean(data.configured), user: data.authenticated ? data.user : null };
    $$('[data-view="studio"],[data-view="files"]').forEach(button => {
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
      if (data.user?.isAdmin || data.user?.accessStatus === 'active') {
        const view = intendedView;
        location.href = `/?view=${encodeURIComponent(view)}`;
        return;
      }
      openGate(intendedView);
      toast('管理员尚未批准，请稍后再试。');
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = '刷新审核状态';
    }
  }

  showAssets();
  $$('[data-view]').forEach(button => {
    button.onclick = () => button.dataset.view === 'assets' ? showAssets() : openGate(button.dataset.view);
  });
  $('#access-gate-close').onclick = () => $('#access-gate').close();
  $('#access-gate-dismiss').onclick = () => $('#access-gate').close();
  $('#access-gate-login').onclick = event => {
    if (session.configured) return;
    event.preventDefault();
    toast('本地预览未连接飞书，请在线上环境提交权限申请。');
  };
  $('#access-gate-refresh').onclick = refreshAccess;
  $('#access-gate').addEventListener('click', event => { if (event.target === $('#access-gate')) $('#access-gate').close(); });

  const params = new URLSearchParams(location.search);
  const requested = params.get('view');
  const auth = params.get('auth');
  loadSession().then(data => {
    if (data.user?.isAdmin || data.user?.accessStatus === 'active') {
      location.reload();
      return;
    }
    if (requested === 'studio' || requested === 'files') openGate(requested);
    if (auth === 'pending') toast('申请已提交，等待管理员确认。');
    else if (auth === 'suspended') toast('当前账号的设计权限已停用。');
    else if (auth === 'cancelled') toast('已取消飞书登录。');
    else if (auth && auth !== 'success') toast('飞书登录失败，请重试。');
    if (auth) history.replaceState({}, '', location.pathname);
  }).catch(() => {
    session = { configured: false, user: null };
    if (requested === 'studio' || requested === 'files') openGate(requested);
  });
})();
