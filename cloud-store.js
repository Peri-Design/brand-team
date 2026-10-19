'use strict';

const crypto = require('node:crypto');

const clone = value => value == null ? value : structuredClone(value);
const sessionHash = token => crypto.createHash('sha256').update(token).digest('hex');

class MemoryStore {
  constructor({ bootstrapAdminName = '' } = {}) {
    this.bootstrapAdminName = bootstrapAdminName.trim();
    this.bootstrapAdminOpenId = null;
    this.users = new Map();
    this.sessions = new Map();
    this.projects = new Map();
    this.accessNotifications = new Map();
  }

  async init() {}

  async enqueueAccessNotifications() {
    for (const applicant of this.users.values()) {
      if (applicant.isAdmin || applicant.accessStatus !== 'pending') continue;
      for (const admin of this.users.values()) {
        if (!admin.isAdmin) continue;
        const key = `${applicant.openId}:${admin.openId}`;
        if (!this.accessNotifications.has(key)) this.accessNotifications.set(key, {
          id: crypto.randomUUID(), applicantOpenId: applicant.openId, adminOpenId: admin.openId,
          attempts: 0, sentAt: null, nextAttemptAt: 0, lastError: null
        });
      }
    }
  }

  async claimAccessNotification() {
    for (const job of this.accessNotifications.values()) {
      const applicant = this.users.get(job.applicantOpenId);
      if (job.sentAt || job.nextAttemptAt > Date.now() || applicant?.isAdmin || applicant?.accessStatus !== 'pending' || !this.users.get(job.adminOpenId)?.isAdmin) continue;
      job.attempts++;
      job.nextAttemptAt = Date.now() + 60_000;
      return clone({ ...job, applicantName: applicant.name });
    }
    return null;
  }

  async finishAccessNotification(id, error, attempts) {
    const job = [...this.accessNotifications.values()].find(item => item.id === id);
    if (!job || job.attempts !== attempts) return;
    job.lastError = error;
    if (!error) job.sentAt = new Date().toISOString();
    else job.nextAttemptAt = Date.now() + Math.min(3600, 60 * 2 ** Math.min(job.attempts, 6)) * 1000;
  }

  async upsertUser(profile) {
    const current = this.users.get(profile.openId);
    let isAdmin = Boolean(current?.isAdmin);
    if (!this.bootstrapAdminOpenId && this.bootstrapAdminName && profile.name === this.bootstrapAdminName) {
      this.bootstrapAdminOpenId = profile.openId;
      isAdmin = true;
    }
    if (this.bootstrapAdminOpenId === profile.openId) isAdmin = true;
    const accessStatus = isAdmin ? 'active' : current?.accessStatus || 'none';
    const user = { ...current, ...profile, createdAt: current?.createdAt || new Date().toISOString(), isAdmin, accessStatus, updatedAt: new Date().toISOString() };
    this.users.set(profile.openId, user);
    return clone(user);
  }

  async requestDesignAccess(openId) {
    const user = this.users.get(openId);
    if (user && !user.isAdmin && ['none', 'rejected'].includes(user.accessStatus)) {
      user.accessStatus = 'pending';
      user.accessReviewReason = null;
      user.accessReviewedBy = null;
      user.accessReviewedAt = null;
      for (const [key, job] of this.accessNotifications) if (job.applicantOpenId === openId) this.accessNotifications.delete(key);
      user.updatedAt = new Date().toISOString();
    }
    return clone(user || null);
  }

  async revokeUserSessions(openId) {
    for (const [key, session] of this.sessions) if (session.openId === openId) this.sessions.delete(key);
  }

  async setUserAccess(openId, accessStatus, approvedBy, reason = null) {
    const user = this.users.get(openId);
    if (!user || user.isAdmin) return null;
    if (accessStatus === 'rejected' && user.accessStatus !== 'pending') throw Object.assign(new Error('申请状态已变化，请刷新后重试'), { status: 409 });
    Object.assign(user, {
      accessStatus,
      accessReviewReason: accessStatus === 'rejected' ? reason : null,
      accessReviewedBy: approvedBy || null,
      accessReviewedAt: new Date().toISOString(),
      approvedBy: accessStatus === 'active' ? approvedBy : null,
      approvedAt: accessStatus === 'active' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    });
    return clone(user);
  }

  async createSession(openId, ttlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    this.sessions.set(sessionHash(token), { openId, tenantKey: this.users.get(openId)?.tenantKey || null, expiresAt: Date.now() + ttlMs });
    return token;
  }

  async getSession(token) {
    const item = this.sessions.get(sessionHash(token));
    if (!item || item.expiresAt <= Date.now()) return null;
    const user = this.users.get(item.openId);
    return user ? clone({ ...user, sessionTenantKey: item.tenantKey }) : null;
  }

  async deleteSession(token) {
    this.sessions.delete(sessionHash(token));
  }

  purgeExpiredTrash(openId) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const [id, project] of this.projects) {
      if (project.ownerOpenId === openId && project.deletedAt && new Date(project.deletedAt).valueOf() < cutoff) this.projects.delete(id);
    }
  }

  async listProjects(openId, { trashed = false } = {}) {
    this.purgeExpiredTrash(openId);
    return [...this.projects.values()]
      .filter(project => project.ownerOpenId === openId && Boolean(project.deletedAt) === trashed)
      .sort((a, b) => {
        const activity = project => Math.max(new Date(project.lastOpenedAt || 0).valueOf(), new Date(project.updatedAt || 0).valueOf());
        return trashed ? String(b.deletedAt).localeCompare(String(a.deletedAt)) : activity(b) - activity(a);
      })
      .map(({ payload, ...metadata }) => ({ ...clone(metadata), projectVersion: payload?.version === 2 ? 2 : 1 }));
  }

  async createProject(openId, name, payload, sizeBytes, previewDataUrl = null) {
    const now = new Date().toISOString();
    const project = { id: crypto.randomUUID(), ownerOpenId: openId, name, payload: clone(payload), sizeBytes, previewDataUrl, revision: 1, createdAt: now, updatedAt: now, lastOpenedAt: now, deletedAt: null };
    this.projects.set(project.id, project);
    return clone(project);
  }

  async getProject(openId, id) {
    const project = this.projects.get(id);
    return project?.ownerOpenId === openId && !project.deletedAt ? clone(project) : null;
  }

  async openProject(openId, id) {
    const project = this.projects.get(id);
    if (!project || project.ownerOpenId !== openId || project.deletedAt) return null;
    project.lastOpenedAt = new Date().toISOString();
    return clone(project);
  }

  async updateProject(openId, id, name, payload, sizeBytes, baseRevision, previewDataUrl = null) {
    const project = this.projects.get(id);
    if (!project || project.ownerOpenId !== openId || project.deletedAt) return { missing: true };
    if (project.revision !== baseRevision) return { conflict: true, project: clone(project) };
    Object.assign(project, { name, payload: clone(payload), sizeBytes, previewDataUrl, revision: project.revision + 1, updatedAt: new Date().toISOString() });
    return { project: clone(project) };
  }

  async moveProjectToTrash(openId, id) {
    const project = this.projects.get(id);
    if (!project || project.ownerOpenId !== openId || project.deletedAt) return false;
    project.deletedAt = new Date().toISOString();
    project.revision += 1;
    return true;
  }

  async restoreProject(openId, id) {
    const project = this.projects.get(id);
    if (!project || project.ownerOpenId !== openId || !project.deletedAt) return false;
    project.deletedAt = null;
    project.updatedAt = new Date().toISOString();
    project.lastOpenedAt = project.updatedAt;
    project.revision += 1;
    return true;
  }

  async purgeProject(openId, id) {
    const project = this.projects.get(id);
    if (!project || project.ownerOpenId !== openId || !project.deletedAt) return false;
    this.projects.delete(id);
    return true;
  }

  async purgeTrash(openId) {
    let deleted = 0;
    for (const [id, project] of this.projects) {
      if (project.ownerOpenId !== openId || !project.deletedAt) continue;
      this.projects.delete(id);
      deleted += 1;
    }
    return deleted;
  }

  async deleteProject(openId, id) { return this.moveProjectToTrash(openId, id); }

  async adminOverview() {
    const projects = [...this.projects.values()];
    return {
      users: this.users.size,
      projects: projects.filter(item => !item.deletedAt).length,
      trashedProjects: projects.filter(item => item.deletedAt).length,
      storageBytes: projects.reduce((sum, item) => sum + item.sizeBytes, 0),
      members: [...this.users.values()].map(user => {
        const owned = projects.filter(project => project.ownerOpenId === user.openId);
        return { openId: user.openId, name: user.name, avatarUrl: user.avatarUrl || null, isAdmin: Boolean(user.isAdmin), accessStatus: user.isAdmin ? 'active' : user.accessStatus || 'none', accessReviewReason: user.accessReviewReason || null, projects: owned.filter(project => !project.deletedAt).length, storageBytes: owned.reduce((sum, project) => sum + project.sizeBytes, 0), updatedAt: user.updatedAt };
      }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      files: projects.map(project => {
        const owner = this.users.get(project.ownerOpenId);
        return { id: project.id, name: project.name, sizeBytes: project.sizeBytes, updatedAt: project.updatedAt, deletedAt: project.deletedAt, ownerName: owner?.name || '未知用户', ownerAvatarUrl: owner?.avatarUrl || null };
      }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    };
  }
}

class PostgresStore {
  constructor(pool, { bootstrapAdminName = '' } = {}) {
    this.pool = pool;
    this.bootstrapAdminName = bootstrapAdminName.trim();
  }

  async init() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key text PRIMARY KEY,
        value text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS users (
        open_id text PRIMARY KEY,
        union_id text,
        name text NOT NULL,
        avatar_url text,
        email text,
        is_admin boolean NOT NULL DEFAULT false,
        access_status text NOT NULL DEFAULT 'pending',
        approved_by text,
        approved_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'pending';
      ALTER TABLE users ALTER COLUMN access_status SET DEFAULT 'none';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_key text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at timestamptz;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS access_review_reason text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS access_reviewed_by text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS access_reviewed_at timestamptz;
      CREATE TABLE IF NOT EXISTS access_notifications (
        id uuid PRIMARY KEY,
        applicant_open_id text NOT NULL REFERENCES users(open_id) ON DELETE CASCADE,
        admin_open_id text NOT NULL REFERENCES users(open_id) ON DELETE CASCADE,
        attempts integer NOT NULL DEFAULT 0,
        sent_at timestamptz,
        next_attempt_at timestamptz NOT NULL DEFAULT now(),
        last_error text,
        UNIQUE(applicant_open_id, admin_open_id)
      );
      UPDATE users SET access_status='active' WHERE is_admin=true AND access_status<>'active';
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash text PRIMARY KEY,
        user_open_id text NOT NULL REFERENCES users(open_id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_key text;
      CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS cloud_projects (
        id uuid PRIMARY KEY,
        owner_open_id text NOT NULL REFERENCES users(open_id) ON DELETE CASCADE,
        name text NOT NULL,
        payload jsonb NOT NULL,
        size_bytes integer NOT NULL,
        revision integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        preview_data_url text,
        last_opened_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      );
      ALTER TABLE cloud_projects ADD COLUMN IF NOT EXISTS preview_data_url text;
      ALTER TABLE cloud_projects ADD COLUMN IF NOT EXISTS last_opened_at timestamptz NOT NULL DEFAULT now();
      ALTER TABLE cloud_projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
      CREATE INDEX IF NOT EXISTS cloud_projects_owner_updated_idx ON cloud_projects(owner_open_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS cloud_projects_owner_deleted_idx ON cloud_projects(owner_open_id, deleted_at, updated_at DESC);
    `);
  }

  async upsertUser(profile) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('pixverse_bootstrap_admin'))");
      let isAdmin = false;
      const bound = await client.query("SELECT value FROM app_settings WHERE key='bootstrap_admin_open_id' FOR UPDATE");
      if (bound.rows[0]?.value === profile.openId) isAdmin = true;
      if (!bound.rows.length && this.bootstrapAdminName && profile.name === this.bootstrapAdminName) {
        await client.query("INSERT INTO app_settings(key,value) VALUES('bootstrap_admin_open_id',$1)", [profile.openId]);
        isAdmin = true;
      }
      const result = await client.query(`
        INSERT INTO users(open_id,union_id,name,avatar_url,email,is_admin,access_status,tenant_key)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT(open_id) DO UPDATE SET
          union_id=EXCLUDED.union_id,
          name=EXCLUDED.name,
          avatar_url=EXCLUDED.avatar_url,
          email=EXCLUDED.email,
          tenant_key=EXCLUDED.tenant_key,
          is_admin=users.is_admin OR EXCLUDED.is_admin,
          access_status=CASE WHEN users.is_admin OR EXCLUDED.is_admin THEN 'active' ELSE users.access_status END,
          updated_at=now()
        RETURNING open_id AS "openId", union_id AS "unionId", name, avatar_url AS "avatarUrl", email, tenant_key AS "tenantKey", is_admin AS "isAdmin", access_status AS "accessStatus"
      `, [profile.openId, profile.unionId || null, profile.name, profile.avatarUrl || null, profile.email || null, isAdmin, isAdmin ? 'active' : 'none', profile.tenantKey || null]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async enqueueAccessNotifications() {
    const result = await this.pool.query(`
      SELECT u.open_id AS applicant, a.open_id AS admin
      FROM users u CROSS JOIN users a
      WHERE u.is_admin=false AND u.access_status='pending' AND a.is_admin=true
        AND NOT EXISTS (SELECT 1 FROM access_notifications n WHERE n.applicant_open_id=u.open_id AND n.admin_open_id=a.open_id)
    `);
    for (const pair of result.rows) {
      await this.pool.query(`INSERT INTO access_notifications(id,applicant_open_id,admin_open_id) VALUES($1,$2,$3)
        ON CONFLICT(applicant_open_id,admin_open_id) DO NOTHING`, [crypto.randomUUID(), pair.applicant, pair.admin]);
    }
  }

  async claimAccessNotification() {
    const result = await this.pool.query(`
      WITH candidate AS (
        SELECT n.id FROM access_notifications n
        JOIN users u ON u.open_id=n.applicant_open_id
        JOIN users a ON a.open_id=n.admin_open_id
        WHERE n.sent_at IS NULL AND n.next_attempt_at <= now()
          AND u.access_status='pending' AND u.is_admin=false AND a.is_admin=true
        ORDER BY n.next_attempt_at, n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1
      )
      UPDATE access_notifications n SET attempts=n.attempts+1,next_attempt_at=now()+interval '60 seconds'
      FROM candidate c, users u WHERE n.id=c.id AND u.open_id=n.applicant_open_id
      RETURNING n.id,n.admin_open_id AS "adminOpenId",n.attempts,u.name AS "applicantName"
    `);
    return result.rows[0] || null;
  }

  async finishAccessNotification(id, error, attempts) {
    const delay = Math.min(3600, 60 * 2 ** Math.min(attempts, 6));
    await this.pool.query(`UPDATE access_notifications SET last_error=$2,
      sent_at=CASE WHEN $2::text IS NULL THEN now() ELSE sent_at END,
      next_attempt_at=now()+($3::int * interval '1 second') WHERE id=$1 AND attempts=$4`, [id, error, delay, attempts]);
  }

  async requestDesignAccess(openId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let result = await client.query(`UPDATE users SET access_status='pending',access_review_reason=NULL,
        access_reviewed_by=NULL,access_reviewed_at=NULL,updated_at=now()
        WHERE open_id=$1 AND is_admin=false AND access_status IN ('none','rejected')
        RETURNING open_id AS "openId",is_admin AS "isAdmin",access_status AS "accessStatus"`, [openId]);
      if (result.rows.length) {
        // A new application gets a fresh notification UUID; repeated pending requests do not.
        await client.query('DELETE FROM access_notifications WHERE applicant_open_id=$1', [openId]);
      } else {
        result = await client.query(`SELECT open_id AS "openId",is_admin AS "isAdmin",access_status AS "accessStatus"
          FROM users WHERE open_id=$1`, [openId]);
      }
      await client.query('COMMIT');
      return result.rows[0] || null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async revokeUserSessions(openId) {
    await this.pool.query('DELETE FROM sessions WHERE user_open_id=$1', [openId]);
  }

  async setUserAccess(openId, accessStatus, approvedBy, reason = null) {
    const result = await this.pool.query(`
      UPDATE users SET access_status=$2,access_review_reason=CASE WHEN $2='rejected' THEN $4 ELSE NULL END,access_reviewed_by=$3,access_reviewed_at=now(),approved_by=CASE WHEN $2='active' THEN $3 ELSE NULL END,approved_at=CASE WHEN $2='active' THEN now() ELSE NULL END,updated_at=now()
      WHERE open_id=$1 AND is_admin=false AND ($2<>'rejected' OR access_status='pending')
      RETURNING open_id AS "openId",name,avatar_url AS "avatarUrl",is_admin AS "isAdmin",access_status AS "accessStatus"
    `, [openId, accessStatus, approvedBy, reason]);
    if (!result.rows.length && accessStatus === 'rejected') {
      const existing = await this.pool.query('SELECT 1 FROM users WHERE open_id=$1 AND is_admin=false', [openId]);
      if (existing.rows.length) throw Object.assign(new Error('申请状态已变化，请刷新后重试'), { status: 409 });
    }
    return result.rows[0] || null;
  }

  async createSession(openId, ttlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    await this.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
    await this.pool.query('INSERT INTO sessions(token_hash,user_open_id,expires_at,tenant_key) SELECT $1,open_id,$3,tenant_key FROM users WHERE open_id=$2', [sessionHash(token), openId, new Date(Date.now() + ttlMs)]);
    return token;
  }

  async getSession(token) {
    const result = await this.pool.query(`
      SELECT u.open_id AS "openId",u.union_id AS "unionId",u.name,u.avatar_url AS "avatarUrl",u.email,u.tenant_key AS "tenantKey",s.tenant_key AS "sessionTenantKey",u.is_admin AS "isAdmin",u.access_status AS "accessStatus",u.access_review_reason AS "accessReviewReason"
      FROM sessions s JOIN users u ON u.open_id=s.user_open_id
      WHERE s.token_hash=$1 AND s.expires_at>now()
    `, [sessionHash(token)]);
    return result.rows[0] || null;
  }

  async deleteSession(token) {
    await this.pool.query('DELETE FROM sessions WHERE token_hash=$1', [sessionHash(token)]);
  }

  async listProjects(openId, { trashed = false } = {}) {
    await this.pool.query("DELETE FROM cloud_projects WHERE owner_open_id=$1 AND deleted_at < now() - interval '30 days'", [openId]);
    const result = await this.pool.query(`
      SELECT id::text,name,size_bytes AS "sizeBytes",preview_data_url AS "previewDataUrl",revision,created_at AS "createdAt",updated_at AS "updatedAt",last_opened_at AS "lastOpenedAt",deleted_at AS "deletedAt", CASE WHEN payload->>'version'='2' THEN 2 ELSE 1 END AS "projectVersion"
      FROM cloud_projects
      WHERE owner_open_id=$1 AND deleted_at IS ${trashed ? 'NOT NULL' : 'NULL'}
      ORDER BY ${trashed ? 'deleted_at' : 'greatest(coalesce(last_opened_at,updated_at),updated_at)'} DESC
    `, [openId]);
    return result.rows;
  }

  async createProject(openId, name, payload, sizeBytes, previewDataUrl = null) {
    const id = crypto.randomUUID();
    const result = await this.pool.query(`
      INSERT INTO cloud_projects(id,owner_open_id,name,payload,size_bytes,preview_data_url)
      VALUES($1,$2,$3,$4::jsonb,$5,$6)
      RETURNING id::text,name,payload,size_bytes AS "sizeBytes",preview_data_url AS "previewDataUrl",revision,created_at AS "createdAt",updated_at AS "updatedAt",last_opened_at AS "lastOpenedAt",deleted_at AS "deletedAt"
    `, [id, openId, name, JSON.stringify(payload), sizeBytes, previewDataUrl]);
    return result.rows[0];
  }

  async getProject(openId, id) {
    const result = await this.pool.query(`
      SELECT id::text,name,payload,size_bytes AS "sizeBytes",preview_data_url AS "previewDataUrl",revision,created_at AS "createdAt",updated_at AS "updatedAt",last_opened_at AS "lastOpenedAt",deleted_at AS "deletedAt"
      FROM cloud_projects WHERE owner_open_id=$1 AND id=$2 AND deleted_at IS NULL
    `, [openId, id]);
    return result.rows[0] || null;
  }

  async openProject(openId, id) {
    const result = await this.pool.query(`
      UPDATE cloud_projects SET last_opened_at=now()
      WHERE owner_open_id=$1 AND id=$2 AND deleted_at IS NULL
      RETURNING id::text,name,payload,size_bytes AS "sizeBytes",preview_data_url AS "previewDataUrl",revision,created_at AS "createdAt",updated_at AS "updatedAt",last_opened_at AS "lastOpenedAt",deleted_at AS "deletedAt"
    `, [openId, id]);
    return result.rows[0] || null;
  }

  async updateProject(openId, id, name, payload, sizeBytes, baseRevision, previewDataUrl = null) {
    const result = await this.pool.query(`
      UPDATE cloud_projects SET name=$3,payload=$4::jsonb,size_bytes=$5,preview_data_url=$7,revision=revision+1,updated_at=now()
      WHERE owner_open_id=$1 AND id=$2 AND revision=$6 AND deleted_at IS NULL
      RETURNING id::text,name,payload,size_bytes AS "sizeBytes",preview_data_url AS "previewDataUrl",revision,created_at AS "createdAt",updated_at AS "updatedAt",last_opened_at AS "lastOpenedAt",deleted_at AS "deletedAt"
    `, [openId, id, name, JSON.stringify(payload), sizeBytes, baseRevision, previewDataUrl]);
    if (result.rows[0]) return { project: result.rows[0] };
    const existing = await this.getProject(openId, id);
    return existing ? { conflict: true, project: existing } : { missing: true };
  }

  async moveProjectToTrash(openId, id) {
    const result = await this.pool.query('UPDATE cloud_projects SET deleted_at=now(),revision=revision+1 WHERE owner_open_id=$1 AND id=$2 AND deleted_at IS NULL', [openId, id]);
    return result.rowCount > 0;
  }

  async restoreProject(openId, id) {
    const result = await this.pool.query('UPDATE cloud_projects SET deleted_at=NULL,updated_at=now(),last_opened_at=now(),revision=revision+1 WHERE owner_open_id=$1 AND id=$2 AND deleted_at IS NOT NULL', [openId, id]);
    return result.rowCount > 0;
  }

  async purgeProject(openId, id) {
    const result = await this.pool.query('DELETE FROM cloud_projects WHERE owner_open_id=$1 AND id=$2 AND deleted_at IS NOT NULL', [openId, id]);
    return result.rowCount > 0;
  }

  async purgeTrash(openId) {
    const result = await this.pool.query('DELETE FROM cloud_projects WHERE owner_open_id=$1 AND deleted_at IS NOT NULL', [openId]);
    return result.rowCount;
  }

  async deleteProject(openId, id) { return this.moveProjectToTrash(openId, id); }

  async adminOverview() {
    const result = await this.pool.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM cloud_projects WHERE deleted_at IS NULL) AS projects,
        (SELECT count(*)::int FROM cloud_projects WHERE deleted_at IS NOT NULL) AS "trashedProjects",
        (SELECT coalesce(sum(size_bytes),0)::bigint FROM cloud_projects) AS "storageBytes"
    `);
    const members = await this.pool.query(`
      SELECT u.open_id AS "openId",u.name,u.avatar_url AS "avatarUrl",u.is_admin AS "isAdmin",u.access_status AS "accessStatus",u.access_review_reason AS "accessReviewReason",u.updated_at AS "updatedAt",
        count(p.id) FILTER (WHERE p.deleted_at IS NULL)::int AS projects,
        coalesce(sum(p.size_bytes),0)::bigint AS "storageBytes"
      FROM users u LEFT JOIN cloud_projects p ON p.owner_open_id=u.open_id
      GROUP BY u.open_id ORDER BY u.updated_at DESC
    `);
    const files = await this.pool.query(`
      SELECT p.id::text,p.name,p.size_bytes AS "sizeBytes",p.updated_at AS "updatedAt",p.deleted_at AS "deletedAt",u.name AS "ownerName",u.avatar_url AS "ownerAvatarUrl"
      FROM cloud_projects p JOIN users u ON u.open_id=p.owner_open_id
      ORDER BY p.updated_at DESC
    `);
    return { ...result.rows[0], members: members.rows, files: files.rows };
  }
}

require('./analytics').installAnalytics(MemoryStore, PostgresStore);

async function createStore(env = process.env) {
  const options = { bootstrapAdminName: env.FEISHU_BOOTSTRAP_ADMIN_NAME || '' };
  if (!env.DATABASE_URL) { const store = new MemoryStore(options); await store.initAnalytics(); return { configured: false, store }; }
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  const store = new PostgresStore(pool, options);
  await store.init();
  await store.initAnalytics();
  return { configured: true, store };
}

module.exports = { MemoryStore, PostgresStore, createStore, sessionHash };
