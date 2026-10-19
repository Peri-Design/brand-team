/* Recheck private standalone pages after session expiry or a return from browser history. */
(() => {
  let pending = false;
  async function verify() {
    if (pending || document.hidden) return;
    pending = true;
    let reason;
    try {
      const response = await fetch('/api/auth/session', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('unavailable');
      const session = await response.json();
      if (!session.authenticated) reason = 'session_expired';
    } catch { reason = 'verification_unavailable'; }
    finally { pending = false; }
    if (reason) {
      document.body.hidden = true;
      const ui = new URLSearchParams(location.search).get('ui') === 'en' ? 'en' : 'zh';
      location.replace('/?auth=' + reason + '&ui=' + ui);
    }
  }
  window.addEventListener('pageshow', verify);
  document.addEventListener('visibilitychange', verify);
  setInterval(verify, 60000);
  verify();
})();
