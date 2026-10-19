'use strict';

// Only server-verified organization membership grants internal asset access.
function createMembershipVerifier({ appId, appSecret, tenantKey, apiBase = 'https://open.feishu.cn', fetchImpl = (...args) => fetch(...args), now = Date.now }) {
  let token = null, tokenUntil = 0;
  const checks = new Map();
  const unavailable = () => Object.assign(new Error('无法验证公司成员状态，请稍后重试或联系管理员。'), { status: 503 });
  async function json(url, options) {
    let response;
    try { response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(10000) }); } catch { throw unavailable(); }
    if (!response.ok) throw unavailable();
    try { return await response.json(); } catch { throw unavailable(); }
  }
  async function verify(profile, { fresh = false } = {}) {
    if (!tenantKey || !profile?.openId || profile.tenantKey !== tenantKey) return false;
    const cached = checks.get(profile.openId);
    if (!fresh && cached?.until > now()) return cached.valid;
    if (!token || tokenUntil <= now()) {
      const result = await json(`${apiBase}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ app_id: appId, app_secret: appSecret })
      });
      if (result.code !== 0 || !result.tenant_access_token) throw unavailable();
      token = result.tenant_access_token;
      tokenUntil = now() + Math.max(0, Number(result.expire || 0) - 60) * 1000;
    }
    const result = await json(`${apiBase}/open-apis/contact/v3/users/${encodeURIComponent(profile.openId)}?user_id_type=open_id`, { headers: { Authorization: `Bearer ${token}` } });
    if (result.code !== 0) { tokenUntil = 0; throw unavailable(); }
    const user = result.data?.user, status = user?.status;
    if (user?.open_id !== profile.openId || !status || ['is_frozen','is_resigned','is_activated','is_exited','is_unjoin'].some(k => typeof status[k] !== 'boolean')) throw unavailable();
    const valid = status.is_activated && !status.is_frozen && !status.is_resigned && !status.is_exited && !status.is_unjoin;
    // Bound stale organization access to 60 seconds; never reuse expired success on API failure.
    checks.set(profile.openId, { valid, until: now() + 60000 });
    if (checks.size > 10000) for (const [key, value] of checks) if (value.until <= now()) checks.delete(key);
    return valid;
  }
  return { verify };
}
module.exports = { createMembershipVerifier };
