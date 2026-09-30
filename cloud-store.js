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
  }

  async init() {}

  async upsertUser(profile) {
    const current = this.users.get(profile.openId);
    let isAdmin = Boolean(current?.isAdmin);
    if (!this.bootstrapAdminOpenId && this.bootstrapAdminName && profile.name === this.bootstrapAdminName) {
      this.bootstrapAdminOpenId = profile.openId;
      isAdmin = true;
    }
    if (this.bootstrapAdminOpenId === profile.openId) isAdmin = true;
    const accessStatus = isAdmin ? 'active' : current?.accessStatus || 'pending';
    const user = { ...current, ...profile, isAdmin, accessStatus, updatedAt: new Date().toISOString() };
    this.users.set(profile.openId, user);
    return clone(user);
  }

  async setUserAccess(openId, accessStatus, approvedBy) {
    const user = this.users.get(openId);
    if (!user || user.isAdmin) return null;
    Object.assign(user, {
      accessStatus,
      approvedBy: accessStatus === 'active' ? approvedBy : null,
      approvedAt: accessStatus === 'active' ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString()
    });
    return clone(user);
  }

  async createSession(openId, ttlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    this.sessions.set(sessionHash(token), { openId, expiresAt: Date.now() + ttlMs });
    return token;
  }

  async getSession(token) {
    const item = this.sessions.get(sessionHash(token));
    if (!item || item.expiresAt <= Date.now()) return null;
    return clone(this.users.get(item.openId) || null);
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
      .map(({ payload, ...metadata }) => clone(metadata));
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
        return { openId: user.openId, name: user.name, avatarUrl: user.avatarUrl || null, isAdmin: Boolean(user.isAdmin), accessStatus: user.isAdmin ? 'active' : user.accessStatus || 'pending', projects: owned.filter(project => !project.deletedAt).length, storageBytes: owned.reduce((sum, project) => sum + project.sizeBytes, 0), updatedAt: user.updatedAt };
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
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by text;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at timestamptz;
      UPDATE users SET access_status='active' WHERE is_admin=true AND access_status<>'active';
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash text PRIMARY KEY,
        user_open_id text NOT NULL REFERENCES users(open_id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
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
        INSERT INTO users(open_id,union_id,name,avatar_url,email,is_admin,access_status)
        VALUES($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT(open_id) DO UPDATE SET
          union_id=EXCLUDED.union_id,
          name=EXCLUDED.name,
          avatar_url=EXCLUDED.avatar_url,
          email=EXCLUDED.email,
          is_admin=users.is_admin OR EXCLUDED.is_admin,
          access_status=CASE WHEN users.is_admin OR EXCLUDED.is_admin THEN 'active' ELSE users.access_status END,
          updated_at=now()
        RETURNING open_id AS "openId", union_id AS "unionId", name, avatar_url AS "avatarUrl", email, is_admin AS "isAdmin", access_status AS "accessStatus"
      `, [profile.openId, profile.unionId || null, profile.name, profile.avatarUrl || null, profile.email || null, isAdmin, isAdmin ? 'active' : 'pending']);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async setUserAccess(openId, accessStatus, approvedBy) {
    const result = await this.pool.query(`
      UPDATE users SET access_status=$2,approved_by=CASE WHEN $2='active' THEN $3 ELSE NULL END,approved_at=CASE WHEN $2='active' THEN now() ELSE NULL END,updated_at=now()
      WHERE open_id=$1 AND is_admin=false
      RETURNING open_id AS "openId",name,avatar_url AS "avatarUrl",is_admin AS "isAdmin",access_status AS "accessStatus"
    `, [openId, accessStatus, approvedBy]);
    return result.rows[0] || null;
  }

  async createSession(openId, ttlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    await this.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
    await this.pool.query('INSERT INTO sessions(token_hash,user_open_id,expires_at) VALUES($1,$2,$3)', [sessionHash(token), openId, new Date(Date.now() + ttlMs)]);
    return token;
  }

  async getSession(token) {
    const result = await this.pool.query(`
      SELECT u.open_id AS "openId",u.union_id AS "unionId",u.name,u.avatar_url AS "avatarUrl",u.email,u.is_admin AS "isAdmin",u.access_status AS "accessStatus"
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
      SELECT id::text,name,size_bytes AS "sizeBytes",preview_data_url AS "previewDataUrl",revision,created_at AS "createdAt",updated_at AS "updatedAt",last_opened_at AS "lastOpenedAt",deleted_at AS "deletedAt"
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
      SELECT u.open_id AS "openId",u.name,u.avatar_url AS "avatarUrl",u.is_admin AS "isAdmin",u.access_status AS "accessStatus",u.updated_at AS "updatedAt",
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

async function createStore(env = process.env) {
  const options = { bootstrapAdminName: env.FEISHU_BOOTSTRAP_ADMIN_NAME || '' };
  if (!env.DATABASE_URL) return { configured: false, store: new MemoryStore(options) };
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: env.DATABASE_URL, ssl: env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  const store = new PostgresStore(pool, options);
  await store.init();
  return { configured: true, store };
}

module.exports = { MemoryStore, PostgresStore, createStore, sessionHash };
