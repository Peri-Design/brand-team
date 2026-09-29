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
    const user = { ...current, ...profile, isAdmin, updatedAt: new Date().toISOString() };
    this.users.set(profile.openId, user);
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

  async listProjects(openId) {
    return [...this.projects.values()]
      .filter(project => project.ownerOpenId === openId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ payload, ...metadata }) => clone(metadata));
  }

  async createProject(openId, name, payload, sizeBytes) {
    const now = new Date().toISOString();
    const project = { id: crypto.randomUUID(), ownerOpenId: openId, name, payload: clone(payload), sizeBytes, revision: 1, createdAt: now, updatedAt: now };
    this.projects.set(project.id, project);
    return clone(project);
  }

  async getProject(openId, id) {
    const project = this.projects.get(id);
    return project?.ownerOpenId === openId ? clone(project) : null;
  }

  async updateProject(openId, id, name, payload, sizeBytes, baseRevision) {
    const project = this.projects.get(id);
    if (!project || project.ownerOpenId !== openId) return { missing: true };
    if (project.revision !== baseRevision) return { conflict: true, project: clone(project) };
    Object.assign(project, { name, payload: clone(payload), sizeBytes, revision: project.revision + 1, updatedAt: new Date().toISOString() });
    return { project: clone(project) };
  }

  async deleteProject(openId, id) {
    const project = this.projects.get(id);
    if (!project || project.ownerOpenId !== openId) return false;
    this.projects.delete(id);
    return true;
  }

  async adminOverview() {
    return {
      users: this.users.size,
      projects: this.projects.size,
      storageBytes: [...this.projects.values()].reduce((sum, item) => sum + item.sizeBytes, 0)
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
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
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
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS cloud_projects_owner_updated_idx ON cloud_projects(owner_open_id, updated_at DESC);
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
        INSERT INTO users(open_id,union_id,name,avatar_url,email,is_admin)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(open_id) DO UPDATE SET
          union_id=EXCLUDED.union_id,
          name=EXCLUDED.name,
          avatar_url=EXCLUDED.avatar_url,
          email=EXCLUDED.email,
          is_admin=users.is_admin OR EXCLUDED.is_admin,
          updated_at=now()
        RETURNING open_id AS "openId", union_id AS "unionId", name, avatar_url AS "avatarUrl", email, is_admin AS "isAdmin"
      `, [profile.openId, profile.unionId || null, profile.name, profile.avatarUrl || null, profile.email || null, isAdmin]);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(openId, ttlMs) {
    const token = crypto.randomBytes(32).toString('base64url');
    await this.pool.query('DELETE FROM sessions WHERE expires_at <= now()');
    await this.pool.query('INSERT INTO sessions(token_hash,user_open_id,expires_at) VALUES($1,$2,$3)', [sessionHash(token), openId, new Date(Date.now() + ttlMs)]);
    return token;
  }

  async getSession(token) {
    const result = await this.pool.query(`
      SELECT u.open_id AS "openId",u.union_id AS "unionId",u.name,u.avatar_url AS "avatarUrl",u.email,u.is_admin AS "isAdmin"
      FROM sessions s JOIN users u ON u.open_id=s.user_open_id
      WHERE s.token_hash=$1 AND s.expires_at>now()
    `, [sessionHash(token)]);
    return result.rows[0] || null;
  }

  async deleteSession(token) {
    await this.pool.query('DELETE FROM sessions WHERE token_hash=$1', [sessionHash(token)]);
  }

  async listProjects(openId) {
    const result = await this.pool.query(`
      SELECT id::text,name,size_bytes AS "sizeBytes",revision,created_at AS "createdAt",updated_at AS "updatedAt"
      FROM cloud_projects WHERE owner_open_id=$1 ORDER BY updated_at DESC
    `, [openId]);
    return result.rows;
  }

  async createProject(openId, name, payload, sizeBytes) {
    const id = crypto.randomUUID();
    const result = await this.pool.query(`
      INSERT INTO cloud_projects(id,owner_open_id,name,payload,size_bytes)
      VALUES($1,$2,$3,$4::jsonb,$5)
      RETURNING id::text,name,payload,size_bytes AS "sizeBytes",revision,created_at AS "createdAt",updated_at AS "updatedAt"
    `, [id, openId, name, JSON.stringify(payload), sizeBytes]);
    return result.rows[0];
  }

  async getProject(openId, id) {
    const result = await this.pool.query(`
      SELECT id::text,name,payload,size_bytes AS "sizeBytes",revision,created_at AS "createdAt",updated_at AS "updatedAt"
      FROM cloud_projects WHERE owner_open_id=$1 AND id=$2
    `, [openId, id]);
    return result.rows[0] || null;
  }

  async updateProject(openId, id, name, payload, sizeBytes, baseRevision) {
    const result = await this.pool.query(`
      UPDATE cloud_projects SET name=$3,payload=$4::jsonb,size_bytes=$5,revision=revision+1,updated_at=now()
      WHERE owner_open_id=$1 AND id=$2 AND revision=$6
      RETURNING id::text,name,payload,size_bytes AS "sizeBytes",revision,created_at AS "createdAt",updated_at AS "updatedAt"
    `, [openId, id, name, JSON.stringify(payload), sizeBytes, baseRevision]);
    if (result.rows[0]) return { project: result.rows[0] };
    const existing = await this.getProject(openId, id);
    return existing ? { conflict: true, project: existing } : { missing: true };
  }

  async deleteProject(openId, id) {
    const result = await this.pool.query('DELETE FROM cloud_projects WHERE owner_open_id=$1 AND id=$2', [openId, id]);
    return result.rowCount > 0;
  }

  async adminOverview() {
    const result = await this.pool.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM cloud_projects) AS projects,
        (SELECT coalesce(sum(size_bytes),0)::bigint FROM cloud_projects) AS "storageBytes"
    `);
    return result.rows[0];
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
