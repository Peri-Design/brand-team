'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { createStore } = require('./cloud-store');
const { createAccessNotifier } = require('./access-notifications');
const { version: appVersion } = require('./package.json');

const app = express();
const env = process.env;
const port = Number(env.PORT || 3000);
const host = env.HOST || '0.0.0.0';
const sessionTtlMs = 7 * 24 * 60 * 60 * 1000;
const staticDir = env.STATIC_DIR
  ? path.resolve(env.STATIC_DIR)
  : path.join(__dirname, fs.existsSync(path.join(__dirname, 'public')) ? 'public' : 'dist');
const materialModel = require(path.join(staticDir, 'materials/model'));
const appId = env.FEISHU_APP_ID || '';
const appSecret = env.FEISHU_APP_SECRET || '';
const publicUrl = (env.PUBLIC_URL || '').replace(/\/$/, '');
const sessionSecret = env.SESSION_SECRET || '';
const authBase = env.FEISHU_AUTHORIZE_URL || 'https://accounts.feishu.cn/open-apis/authen/v1/authorize';
const feishuApi = env.FEISHU_API_BASE || 'https://open.feishu.cn';
const { createMembershipVerifier } = require('./membership');
const tenantKey = env.FEISHU_TENANT_KEY || '';
const { renderOrganizationGate } = require('./organization-gate');
const membership = createMembershipVerifier({ appId, appSecret, tenantKey, apiBase: feishuApi });
const devCloud = env.ENABLE_DEV_AUTH === 'true' && env.NODE_ENV !== 'production';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'private, no-store',
    'Vary': 'Cookie',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'
  });
  next();
});
const parseProjectJson = express.json({ limit: '165mb' });

const ready = createStore(env);
const notifierReady = ready.then(({ store }) => createAccessNotifier({
  store, appId: devCloud ? '' : appId, appSecret, publicUrl, apiBase: feishuApi
}));
const cloudConfigured = async () => {
  const result = await ready;
  return Boolean(devCloud || result.configured && appId && appSecret && sessionSecret && tenantKey);
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
  const { store } = await ready;
  if (req.verifiedUser) return req.verifiedUser;
  const user = await store.getSession(token);
  if (!user) return null;
  // Old sessions cannot inherit membership from a later, verified login.
  if (!devCloud && (!tenantKey || user.sessionTenantKey !== tenantKey)) {
    await store.deleteSession(token);
    return null;
  }
  if (!devCloud && !await membership.verify(user)) {
    await store.revokeUserSessions(user.openId);
    return null;
  }
  req.verifiedUser = user;
  return user;
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

async function requireDesigner(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: '请先使用飞书登录并申请访问权限。' });
    if (!user.isAdmin && user.accessStatus !== 'active') {
      const message = user.accessStatus === 'suspended' ? '你的设计权限已停用，请联系管理员。' : user.accessStatus === 'none' ? '请先申请设计权限，由管理员确认。' : '访问申请正在等待管理员确认。';
      return res.status(403).json({ error: message, accessStatus: user.accessStatus || 'none' });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: '仅管理员可查看。' });
  next();
}

function projectBody(req, res) {
  const project = req.body?.project;
  if (!project || typeof project !== 'object' || Array.isArray(project) || ![1,2].includes(project.version) || typeof project.name !== 'string' || project.name.length > 80) {
    res.status(400).json({ error: '文件数据格式不正确。' });
    return null;
  }
  if (project.version === 2) {try {materialModel.validate(project);} catch(error) {res.status(400).json({error:error.message});return null;}}
  const json = JSON.stringify(project);
  const sizeBytes = Buffer.byteLength(json);
  if (sizeBytes > 160 * 1024 * 1024) {
    res.status(413).json({ error: '文件超过 160 MB，请压缩图片后重试。' });
    return null;
  }
  const previewDataUrl = typeof req.body?.preview === 'string' ? req.body.preview : '';
  if (previewDataUrl && (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(previewDataUrl) || Buffer.byteLength(previewDataUrl) > 1024 * 1024)) {
    res.status(400).json({ error: '文件预览图格式不正确或超过 1 MB。' });
    return null;
  }
  return { project, sizeBytes, previewDataUrl: previewDataUrl || null, name: project.name.trim() || '未命名文件' };
}

// Public entry is presentation routing, never an authorization credential.
function entryContext(req) {
  return { entry: req.query.entry === 'domestic' ? 'domestic' : 'international',
    ui: ['zh','en'].includes(req.query.ui) ? req.query.ui : null };
}
function entryUrl(target, context) {
  const url = new URL(target, 'http://workspace.local');
  url.searchParams.set('entry', context.entry);
  if(context.ui) url.searchParams.set('ui', context.ui);
  return url.pathname + url.search + url.hash;
}

function validId(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

app.get('/health', async (_req, res) => {
  try {
    const configured = await cloudConfigured();
    res.json({ ok: true, cloud: configured ? 'configured' : 'disabled', version: appVersion });
  } catch (_error) {
    res.status(503).json({ ok: false, cloud: 'unavailable', version: appVersion });
  }
});

app.get('/api/auth/session', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    const configured = await cloudConfigured();
    const user = configured ? await currentUser(req) : null;
    res.json({ configured, authenticated: Boolean(user), user: user ? { name: user.name, avatarUrl: user.avatarUrl, canDownloadAllLogos: true, isAdmin: user.isAdmin, accessStatus: user.isAdmin ? 'active' : user.accessStatus || 'none' } : null });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/feishu/start', async (req, res, next) => {
  try {
    const nextView = ['new', 'studio', 'files', 'admin'].includes(String(req.query.next || '')) ? String(req.query.next) : 'assets';
    res.set('Cache-Control', 'no-store');
    const context = entryContext(req);
    const existing = await currentUser(req);
    if (existing) return res.redirect(entryUrl(`/?view=${nextView}`,context));
    setCookie(res, 'pv_auth_entry', context.entry, { maxAge: 10 * 60 * 1000 });
    setCookie(res, 'pv_auth_ui', context.ui || '', { maxAge: 10 * 60 * 1000 });
    setCookie(res, 'pv_auth_next', nextView, { maxAge: 10 * 60 * 1000 });
    if (devCloud) {
      const { store } = await ready;
      const user = await store.upsertUser({ openId: 'dev-zhao-ruixiu', name: '赵瑞秀', avatarUrl: null });
      const token = await store.createSession(user.openId, sessionTtlMs);
      setCookie(res, 'pv_session', token, { maxAge: sessionTtlMs });
      return res.redirect(entryUrl(`/?view=${nextView}&auth=success`,context));
    }
    if (!await cloudConfigured()) return res.redirect(entryUrl('/?auth=unconfigured', context));
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

async function fetchFeishu(url, options) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
    if (response.status >= 500) throw new Error('Feishu unavailable');
    return response;
  } catch { throw Object.assign(new Error('暂时无法验证身份，请重试。'), { status: 503 }); }
}

app.get('/api/auth/feishu/callback', async (req, res, next) => {
  const saved=cookies(req);
  const context={entry:saved.pv_auth_entry==='domestic'?'domestic':'international',ui:['zh','en'].includes(saved.pv_auth_ui)?saved.pv_auth_ui:null};
  clearCookie(res,'pv_auth_entry');clearCookie(res,'pv_auth_ui');
  res.set('Cache-Control', 'no-store');
  try {
    const nextView = ['new', 'studio', 'files', 'admin'].includes(cookies(req).pv_auth_next) ? cookies(req).pv_auth_next : 'assets';
    clearCookie(res, 'pv_auth_next');
    const expectedState = cookies(req).pv_oauth_state;
    clearCookie(res, 'pv_oauth_state');
    const receivedState = String(req.query.state || '');
    if (!expectedState || expectedState.length !== receivedState.length || !crypto.timingSafeEqual(Buffer.from(expectedState), Buffer.from(receivedState))) {
      return res.redirect(entryUrl(`/?view=${nextView}&auth=state_error`,context));
    }
    const code = String(req.query.code || '');
    if (!code) return res.redirect(entryUrl(`/?view=${nextView}&auth=cancelled`,context));
    const tokenResponse = await fetchFeishu(`${feishuApi}/open-apis/authen/v1/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'authorization_code', code, app_id: appId, app_secret: appSecret })
    });
    const tokenResult = await tokenResponse.json();
    const accessToken = tokenResult?.data?.access_token;
    if (!tokenResponse.ok || !accessToken) throw new Error(`飞书授权失败：${tokenResult?.msg || tokenResponse.status}`);
    const userResponse = await fetchFeishu(`${feishuApi}/open-apis/authen/v1/user_info`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const userResult = await userResponse.json();
    const profile = userResult?.data;
    if (!userResponse.ok || !profile?.open_id || !profile?.name) throw new Error(`无法读取飞书用户：${userResult?.msg || userResponse.status}`);
    if (!await membership.verify({ openId: profile.open_id, tenantKey: profile.tenant_key }, { fresh: true })) {
      return res.redirect(entryUrl(`/?view=${nextView}&auth=organization_denied`, context));
    }
    const { store } = await ready;
    const user = await store.upsertUser({ openId: profile.open_id, unionId: profile.union_id, name: profile.name, avatarUrl: profile.avatar_url, email: profile.email, tenantKey: profile.tenant_key });
    const token = await store.createSession(user.openId, sessionTtlMs);
    setCookie(res, 'pv_session', token, { maxAge: sessionTtlMs });
    const authResult = 'success';
    res.redirect(entryUrl(`/?view=${encodeURIComponent(nextView)}&auth=${encodeURIComponent(authResult)}`,context));
  } catch (error) {
    console.error('Feishu callback failed', error);
    const target = cookies(req).pv_auth_next === 'admin' ? 'admin' : 'assets';
    res.redirect(entryUrl(`/?view=${target}&auth=${error.status === 503 ? 'verification_unavailable' : 'failed'}`,context));
  }
});

app.post('/api/access/design-request', sameOrigin, requireAuth, async (req, res, next) => {
  try {
    const user = await (await ready).store.requestDesignAccess(req.user.openId);
    if (user.accessStatus === 'suspended') return res.status(403).json({ error: '你的设计权限已停用，请联系管理员。', accessStatus: 'suspended' });
    // Only an explicit request queues approval notifications. Repeated requests are idempotent.
    if (user.accessStatus === 'pending') void notifierReady.then(notifier => notifier.run()).catch(() => {});
    res.json({ accessStatus: user.accessStatus });
  } catch (error) { next(error); }
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

app.get('/api/cloud/projects', requireDesigner, async (req, res, next) => {
  try {
    const scope = req.query.scope === 'trash' ? 'trash' : 'active';
    res.json({ projects: await (await ready).store.listProjects(req.user.openId, { trashed: scope === 'trash' }) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/cloud/projects', sameOrigin, requireDesigner, parseProjectJson, async (req, res, next) => {
  try {
    const parsed = projectBody(req, res);
    if (!parsed) return;
    const project = await (await ready).store.createProject(req.user.openId, parsed.name, parsed.project, parsed.sizeBytes, parsed.previewDataUrl);
    res.status(201).json({ project: { id: project.id, name: project.name, sizeBytes: project.sizeBytes, revision: project.revision, createdAt: project.createdAt, updatedAt: project.updatedAt } });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/cloud/projects/trash', sameOrigin, requireDesigner, async (req, res, next) => {
  try {
    const deleted = await (await ready).store.purgeTrash(req.user.openId);
    res.json({ deleted });
  } catch (error) {
    next(error);
  }
});

app.get('/api/cloud/projects/:id', requireDesigner, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: '未找到文件。' });
    const project = await (await ready).store.openProject(req.user.openId, req.params.id);
    if (!project) return res.status(404).json({ error: '未找到文件。' });
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

app.put('/api/cloud/projects/:id', sameOrigin, requireDesigner, parseProjectJson, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: '未找到文件。' });
    const parsed = projectBody(req, res);
    if (!parsed) return;
    const baseRevision = Number(req.body?.baseRevision);
    if (!Number.isInteger(baseRevision) || baseRevision < 1) return res.status(400).json({ error: '缺少云端版本信息。' });
    const result = await (await ready).store.updateProject(req.user.openId, req.params.id, parsed.name, parsed.project, parsed.sizeBytes, baseRevision, parsed.previewDataUrl);
    if (result.missing) return res.status(404).json({ error: '未找到文件。' });
    if (result.conflict) return res.status(409).json({ error: '文件已在其他页面更新，请重新打开后再编辑。', project: { id: result.project.id, revision: result.project.revision, updatedAt: result.project.updatedAt } });
    const project = result.project;
    res.json({ project: { id: project.id, name: project.name, sizeBytes: project.sizeBytes, revision: project.revision, createdAt: project.createdAt, updatedAt: project.updatedAt } });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/cloud/projects/:id', sameOrigin, requireDesigner, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: '未找到文件。' });
    const deleted = await (await ready).store.moveProjectToTrash(req.user.openId, req.params.id);
    if (!deleted) return res.status(404).json({ error: '未找到文件。' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/cloud/projects/:id/restore', sameOrigin, requireDesigner, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: '未找到文件。' });
    const restored = await (await ready).store.restoreProject(req.user.openId, req.params.id);
    if (!restored) return res.status(404).json({ error: '未找到回收站文件。' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.delete('/api/cloud/projects/:id/permanent', sameOrigin, requireDesigner, async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ error: '未找到文件。' });
    const deleted = await (await ready).store.purgeProject(req.user.openId, req.params.id);
    if (!deleted) return res.status(404).json({ error: '未找到回收站文件。' });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// First-party, authenticated usage metrics. No artwork or copy is accepted.
const analyticsLimits = new Map();
app.post('/api/analytics/events', sameOrigin, express.json({limit:'32kb'}), async (req,res,next)=>{
  try {
    let event;try{event=require('./analytics').normalizeEvent(req.body);}catch{return res.status(400).json({error:'Invalid analytics event'});}
    const user=await currentUser(req),allowed=user&&(user.isAdmin||user.accessStatus==='active');
    if(event.kind!=='logo_download'&&!allowed)return res.sendStatus(user?403:401);
    if(event.kind==='logo_download'&&!user)return res.sendStatus(401);
    const actor=event.kind==='logo_download'?'anonymous':user.openId;
    const rateKey=user?.openId||crypto.createHash('sha256').update(req.ip||'anonymous').digest('hex');
    const now=Date.now();for(const [key,value] of analyticsLimits)if(now-value.start>60000)analyticsLimits.delete(key);
    let rate=analyticsLimits.get(rateKey);
    if(!rate){if(analyticsLimits.size>=5000)return res.sendStatus(429);rate={start:now,count:0};analyticsLimits.set(rateKey,rate);}
    if(++rate.count>120)return res.sendStatus(429);
    await (await ready).store.recordAnalytics(actor,event);
    res.status(204).end();
  }catch(error){next(error);}
});
app.get('/api/admin/analytics', requireAuth, requireAdmin, async(req,res,next)=>{
  try{const days=Number(req.query.days||7);if(![7,30].includes(days))return res.status(400).json({error:'Choose 7 or 30 days'});
    res.set('Cache-Control','no-store');res.json(await (await ready).store.analyticsOverview(days));
  }catch(error){next(error);}
});

app.get('/api/admin/overview', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json(await (await ready).store.adminOverview());
  } catch (error) {
    next(error);
  }
});

app.patch('/api/admin/users/:openId/access', sameOrigin, requireAuth, requireAdmin, express.json({ limit: '8kb' }), async (req, res, next) => {
  try {
    const accessStatus = String(req.body?.accessStatus || '');
    if (!['pending', 'active', 'suspended'].includes(accessStatus)) return res.status(400).json({ error: '权限状态不正确。' });
    const user = await (await ready).store.setUserAccess(req.params.openId, accessStatus, req.user.openId);
    if (!user) return res.status(404).json({ error: '未找到可修改的成员。' });
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

app.get(['/materials', '/materials/', '/materials/index.html'], async (req,res,next)=>{try{const user=await currentUser(req);if(!user||!user.isAdmin&&user.accessStatus!=='active')return res.redirect(entryUrl('/?view=new',entryContext(req)));if(req.path==='/materials')return res.redirect('/materials/'+(req.url.includes('?')?req.url.slice(req.url.indexOf('?')):''));res.set('Cache-Control','no-store');res.sendFile(path.join(staticDir,'materials/index.html'));}catch(e){if(e.status===503)return sendOrganizationGate(req,res,'verification_unavailable',503);next(e);}});
app.use('/materials',requireDesigner,(_req,res,next)=>{res.set('Cache-Control','no-store');next();});

const privateDesignScripts = ['/app.js', '/font-coverage.js', '/templates.js', '/web-blocks.js', '/history.js', '/logo.js', '/canvas-view.js', '/palette.js', '/export-preflight.js'];
app.get(privateDesignScripts, requireDesigner, (_req, _res, next) => next());

async function serveWorkspace(req, res, next) {
  try {
    const user = await currentUser(req);
    const adminEntry = req.query.view === 'admin';
    res.set('Cache-Control', 'no-store');
    if (!user) return sendOrganizationGate(req, res);
    const allowed = Boolean(user && (user.isAdmin || user.accessStatus === 'active') && (!adminEntry || user.isAdmin));
    let html = await fs.promises.readFile(path.join(staticDir, 'index.html'), 'utf8');
    if (!allowed) {
      html = html.replace(/<script defer src="(?:app|font-coverage|templates|web-blocks|history|logo|canvas-view|palette|export-preflight)\.js[^"]*"><\/script>/g, '');
      html = html.replace('</head>', '  <script defer src="access-public.js?v=20261016-folder-1"></script>\n</head>');
    }
    html=html.replace('id="aisphere-assets" aria-labelledby="aisphere-logo-title" hidden','id="aisphere-assets" aria-labelledby="aisphere-logo-title"');
    res.type('html').send(html);
  } catch (error) {
    if (error.status === 503) return sendOrganizationGate(req, res, 'verification_unavailable', 503);
    next(error);
  }
}

app.get(['/', '/index.html'], serveWorkspace);

// All workstation resources are private. Only the standalone sign-in shell is public.
// Authenticate before express.static so encoded paths, HEAD and Range requests cannot bypass it.
async function sendOrganizationGate(req, res, reason = String(req.query.auth || ''), status = 200) {
  res.set({ 'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'X-Robots-Tag': 'noindex, nofollow' });
  return res.status(status).type('html').send(renderOrganizationGate(req, reason));
}
app.use(async (req, res, next) => {
  if (['/organization-gate.css', '/organization-gate.js', '/brand-character.css', '/brand-character.js'].includes(req.path)) return next();
  res.set({ 'Cache-Control': 'private, no-store', 'Vary': 'Cookie' });
  try {
    const user = await currentUser(req);
    if (!user) {
      if (req.path.endsWith('.html') || req.path.endsWith('/')) return sendOrganizationGate(req, res);
      return res.status(401).json({ error: '仅限爱诗科技组织成员访问，请使用飞书登录。' });
    }
    const canonical = path.posix.normalize(decodeURIComponent(req.path));
    if (['/', '/index.html'].includes(canonical)) return serveWorkspace(req, res, next);
    if (privateDesignScripts.includes(canonical) || canonical.startsWith('/materials/')) return requireDesigner(req, res, next);
    next();
  } catch (error) {
    if (error instanceof URIError) return res.sendStatus(400);
    if (error.status === 503 && (req.path.endsWith('.html') || req.path.endsWith('/'))) return sendOrganizationGate(req, res, 'verification_unavailable', 503);
    next(error);
  }
});
app.use(express.static(staticDir, {
  etag: false,
  setHeaders(res) { res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('Vary', 'Cookie'); }
}));

app.use('/api', (_req, res) => res.status(404).json({ error: '接口不存在。' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(error.status === 503 ? 503 : error.type === 'entity.too.large' ? 413 : 500).json({ error: error.status === 503 ? error.message : error.type === 'entity.too.large' ? '文件数据过大。' : '服务暂时不可用，请稍后重试。' });
});

if (require.main === module) {
  ready.then(async () => {
    (await notifierReady).start();
    app.listen(port, host, () => console.log(`PixVerse brand workspace listening on ${host}:${port}`));
  }).catch(error => {
    console.error('Server initialization failed', error);
    process.exitCode = 1;
  });
}

module.exports = { app, ready };
