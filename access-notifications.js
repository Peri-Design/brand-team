'use strict';

// Notification failures must never prevent a permission request from being saved.
function createAccessNotifier({ store, appId, appSecret, publicUrl, apiBase = 'https://open.feishu.cn', fetchImpl = fetch, logger = console }) {
  let running = false;
  let token = null;
  let tokenExpires = 0;
  const enabled = Boolean(appId && appSecret && publicUrl);

  async function api(path, body, bearer) {
    const response = await fetchImpl(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000)
    });
    const data = await response.json();
    if (!response.ok || data.code !== 0) {
      // Log codes only: API error bodies can contain user identifiers or credentials.
      const error = new Error(`Feishu notification HTTP ${response.status}, code ${data.code ?? 'unknown'}`);
      error.code = String(data.code ?? response.status);
      throw error;
    }
    return data;
  }

  async function getToken() {
    if (token && tokenExpires > Date.now()) return token;
    const data = await api('/open-apis/auth/v3/tenant_access_token/internal', { app_id: appId, app_secret: appSecret });
    if (!data.tenant_access_token) throw new Error('Feishu notification token missing');
    token = data.tenant_access_token;
    tokenExpires = Date.now() + Math.max(0, (Number(data.expire) || 7200) - 120) * 1000;
    return token;
  }

  async function run() {
    if (!enabled || running) return;
    running = true;
    try {
      await store.enqueueAccessNotifications();
      // Claim immediately before sending so a slow batch cannot outlive its lease.
      for (let count = 0; count < 20; count++) {
        const job = await store.claimAccessNotification();
        if (!job) break;
        try {
          const adminUrl = new URL('/?view=admin', publicUrl).href;
          const text = `PixVerse 品牌工作台 · 设计权限申请\n\n${job.applicantName} 申请使用设计功能，请前往管理后台审核。\n\n${adminUrl}\n\n此通知不会自动开通权限；请核对申请人后再批准。`;
          const result = await api('/open-apis/im/v1/messages?receive_id_type=open_id', {
            receive_id: job.adminOpenId,
            msg_type: 'text',
            content: JSON.stringify({ text }),
            uuid: job.id
          }, await getToken());
          if (!result.data?.message_id) throw new Error('Feishu notification message id missing');
          await store.finishAccessNotification(job.id, null, job.attempts);
        } catch (error) {
          token = null;
          await store.finishAccessNotification(job.id, error.code || 'delivery_failed', job.attempts);
          logger.warn('Access notification deferred:', error.code || 'delivery_failed');
          // Avoid a burst of failures when bot permissions or Feishu are unavailable.
          break;
        }
      }
    } catch (_error) {
      logger.warn('Access notification queue unavailable; retry on next interval');
    } finally {
      running = false;
    }
  }

  function start() {
    if (!enabled) return () => {};
    void run();
    const timer = setInterval(() => void run(), 60_000);
    timer.unref();
    return () => clearInterval(timer);
  }
  return { run, start, enabled };
}

module.exports = { createAccessNotifier };
