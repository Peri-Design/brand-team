'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createStore } = require('./cloud-store');

const app = express();
const env = process.env;
const port = Number(env.PORT || 3000);
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const staticDir = env.STATIC_DIR
  ? path.resolve(env.STATIC_DIR)
  : path.join(__dirname, fs.existsSync(path.join(__dirname, 'public')) ? 'public' : 'dist');
const appId = env.FEISHU_APP_ID || '';
const appSecret = env.FEISHU_APP_SECRET || '';
const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
const sessionSecret = env.SESSION_SECRET || '';
const authBase = env.FEISHU_AUTHORIZE_URL || 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const feishuApi = env.FEISHU_API_BASE || 'https://open.feishu.cn';
const devCloud = env.ENABLE_DEV_AUTH === 'true' && env.NODE_ENV !== 'production';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
  });
  next();
});
const parseProjectJson = express.json({ limit: '165mb' });

const ready = createStore(env);
const cloudConfigured = async () => {
  const result = await ready;
  return Boolean(devCloud || result.configured && appId && appSecret && sessionSecret);
};

function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(item => item.trim()).filter(Boolean).map(item => {
    const at = item.indexOf('=');
    return [decodeURIComponent(item.slice(0, at)), decodeURIComponent(item.slice(at + 1))];
  }));
}

function setCookie(res, name, value, options = {}) {
  const fields = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (env.NODE_ENV === 'production') fields.push('Secure');
  if (options.maxAge !== undefined) fields.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge / 1000))}`);
  res.append('Set-Cookie', fields.join('; '));
}

function clearCookie(res, name) {
  setCookie(res, name, '', { maxAge: 0 });
}

function sameOrigin(req, res, next) {
  const origin = req.get('origin');
  const expected = `${req.protocol}://${req.get('host')}`;
  if (origin && origin !== expected) return res.status(403).json({ error: '请求来源不受信任。' });
  next();
}

async function currentUser(req) {
  const token = cookies(req).pv_session;
  if (!token) return null;
  return (await ready).store.getSession(token);
}

async function requireAuth(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: '请先使用飞书登录。' });
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function projectBody(req, res) {
  const project = req.body?.project;
  if (!project || typeof project !== 'object' || Array.isArray(project) || project.version !== 1 || typeof project.name !== 'string' || project.name.length > 80) {
    res.status(400).json({ error: '工程数据格式不正确。' });
    return null;
  }
  const json = JSON.stringify(project);
  const sizeBytes = Buffer.byteLength(json);
  if (sizeBytes > 160 * 1024 * 1024) {
    res.status(413).json({ error: '工程超过 160 MB，请压缩图片后重试。' });
    return null;
  }
  const previewDataUrl = typeof req.body?.preview === 'string' ? req.body.preview : '';
  if (previewDataUrl && (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(previewDataUrl) || Buffer.byteLength(previewDataUrl) > 1024 * 1024)) {
    res.status(400).json({ error: '工程预览图格式不正确或超过 1 MB。' });
    return null;
  }
  return { project, sizeBytes, previewDataUrl: previewDataUrl || null, name: project.name.trim() || '未命名工程' };
}

function validId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

app.get('/health', async (_req, res) => {
  try {
    const configured = await cloudConfigured();
    res.json({ ok: true, cloud: configured ? 'configured' : 'disabled' });
  } catch (_error) {
    res.status(503).json({ ok: false, cloud: 'unavailable' });
  }
});

app.get('/api/auth/session', async (req, res, next) => {
  try {
    const configured = await cloudConfigured();
    const user = configured ? await currentUser(req) : null;
    res.json({ configured, authenticated: Boolean(user), user: user ? { name: user.name, avatarUrl: user.avatarUrl, isAdmin: user.isAdmin } : null });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/feishu/start', async (req, res, next) => {
  try {
    if (devCloud) {
      const { store } = await ready;
      const user = await store.upsertUser({ openId: 'dev-zhao-ruixiu', name: '赵瑞秀', avatarUrl: null });
      const token = await store.createSession(user.openId, sessionTtlMs);
      setCookie(res, 'pv_session', token, { maxAge: sessionTtlMs });
      return res.redirect('/?view=draft&auth=success');
    }
    if (!await cloudConfigured()) return res.status(503).send('云端工程尚未完成飞书与数据库配置。');
    const state = crypto.randomBytes(24).toString('base64url');
    setCookie(res, 'pv_oauth_state', state, { maxAge: 10 * 60 * 1000 });
    const callback = `${publicUrl || `${req.protocol}://${req.get('host')}`}/api/auth/feishu/callback`;
    const url = new URL(authBase);
    url.searchParams.set('app_id', appId);
    url.searchParams.set('redirect_uri', callback);
    url.searchParams.set('state', state);
    res.redirect(url.toString());
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/feishu/callback', async (req, res, next) => {
  try {
    const expectedState = cookies(req).pv_oauth_state;
    clearCookie(res, 'pv_oauth_state');
    const receivedState = String(req.query.state || '');
    if (!expectedState || expectedState.length !== receivedState.length || !crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(receivedState))) {
      return res.redirect('/?view=draft&auth=state_error');
    }
    const code = String(req.query.code || '');
    if (!code) return res.redirect('/?view=draft&auth=cancelled');
    const tokenResponse = await fetch(`${feishuApi}/open-apis/authen/v1/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code, app_id: appId, app_secret: appSecret })
    });
    const tokenResult = await tokenResponse.json();
    const accessToken = tokenResult?.data?.access_token;
    if (!tokenResponse.ok || !accessToken) throw new Error(`飞书授权失败：${tokenResult?.msg || tokenResponse.status}`);
    const userResponse = await fetch(`${feishuApi}/open-apis/authen/v1/user_info`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const userResult = await userResponse.json();
    const profile = userResult?.data;
    if (!userResponse.ok || !profile?.open_id || !profile?.name) throw new Error(`无法读取飞书用户：${userResult?.msg || userResponse.status}`);
    const { store } = await ready;
    const user = await store.upsertUser({ openId: profile.open_id, unionId: profile.union_id, name: profile.name, avatarUrl: profile.avatar_url, email: profile.email });
    const token = await store.createSession(user.openId, sessionTtlMs);
    setCookie(res, 'pv_session', token, { maxAge: sessionTtlMs });
    res.redirect('/?view=draft&auth=success');
  } catch (error) {
    console.error('Feishu callback failed', error);
    res.redirect('/?view=draft&auth=failed');
  }
});

app.post('/api/auth/logout', sameOrigin, async (req, res, next) => {
  try {
    const token = cookies(req).pv_session;
    if (token) await (await ready).store.deleteSession(token);
    clearCookie(res, 'pv_session');
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

if (devCloud) {
  app.post('/api/auth/dev-login', sameOrigin, async (_req, res, next) => {
    try {
      const { store } = await ready;
      const user = await store.upsertUser({ openId: 'dev-zhao-ruixiu', name: '赵瑞秀', avatarUrl: null });
      const token = await store.createSession(user.openId, sessionTtlMs);
      setCookie(res, 'pv_session', token, { maxAge: sessionTtlMs });
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });
}

app.get('/api/cloud/projects', requireAuth, async (req, res, next) => {
  try {
    res.json({ projects: await (await ready).store.listProjects(req.user.openId) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/cloud/projects', sameOrigin, requireAuth, parseProjectJson, async (req, res, next) => {
  try {
    const parsed = projectBody(req, res);
    if (!parsed) return;
    const project = await (await ready).store.createProject(req.user.openId, parsed.name, parsed.project, parsed.sizeBytes, parsed.previewDataUrl);
    res.status(201).json({ project: { id: project.id, name: project.name, sizeBytes: project.sizeBytes, revision: project.revision, createdAt: project.createdAt, updatedAt: project.updatedAt } });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cloud/projects/:id', requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: '未找到云端工程。' });
    const project = await (await ready).store.getProject(req.user.openId, req.params.id);
    if (!project) return res.status(404).json({ error: '未找到云端工程。' });
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

app.put('/api/cloud/projects/:id', sameOrigin, requireAuth, parseProjectJson, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: '未找到云端工程。' });
    const parsed = projectBody(req, res);
    if (!parsed) return;
    const baseRevision = Number(req.body?.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision < 1) return res.status(400).json({ error: '缺少云端版本信息。' });
    const result = await (await ready).store.updateProject(req.user.openId, req.params.id, parsed.name, parsed.project, parsed.sizeBytes, baseRevision, parsed.previewDataUrl);
    if (result.missing) return res.status(404).json({ error: '未找到云端工程。' });
    if (result.conflict) return res.status(409).json({ error: '云端工程已在其他页面更新，请重新打开后再编辑。', project: { id: result.project.id, revision: result.project.revision, updatedAt: result.project.updatedAt } });
    const project = result.project;
    res.json({ project: { id: project.id, name: project.name, sizeBytes: project.sizeBytes, revision: project.revision, createdAt: project.createdAt, updatedAt: project.updatedAt } });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/cloud/projects/:id', sameOrigin, requireAuth, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: '未找到云端工程。' });
    const deleted = await (await ready).store.deleteProject(req.user.openId, req.params.id);
    if (!deleted) return res.status(404).json({ error: '未找到云端工程。' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/overview', requireAuth, async (req, res, next) => {
  try {
    if (!req.user.isAdmin) return res.status(403).json({ error: '仅管理员可查看。' });
    res.json(await (await ready).store.adminOverview());
  } catch (error) {
    next(error);
  }
});

app.use(express.static(staticDir, {
  etag: true,
  setHeaders(res, filePath) {
    res.setHeader('Cache-Control', filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=86400');
  }
}));

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(error.type === 'entity.too.large' ? 413 : 500).json({ error: error.type === 'entity.too.large' ? '工程数据过大。' : '服务暂时不可用，请稍后重试。' });
});

if (require.main === module) {
  ready.then(() => app.listen(port, '0.0.0.0', () => console.log(`PixVerse brand workspace listening on ${port}`))).catch(error => {
    console.error('Server initialization failed', error);
    process.exitCode = 1;
  });
}

module.exports = { app, ready };
