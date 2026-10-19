'use strict';
const DAY = 86400000;
const dayOf = value => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10);
const TYPES = ['web', 'app', 'social'];
const LANGS = ['en', 'zh', 'ja'];
const ISSUES = ['missing_copy', 'missing_image', 'text_layout', 'low_resolution', 'other'];
const EVENTS = ['active', 'export_started', 'export_checked', 'export_generated', 'export_cancelled', 'export_failed', 'export_returned', 'export_confirmed', 'logo_download'];
const ASSETS = ['PixLab-domestic','PixLab-international','PixVerse-black','PixVerse-white','PixVerse-icon-light','PixVerse-icon-dark','AIsphere-black','AIsphere-white','Paiwo-logo-black','Paiwo-logo-white','Paiwo-black','Paiwo-white','Paiwo-white-on-black'];
function normalizeEvent(body) {
  if (!body || !EVENTS.includes(body.kind) || typeof body.id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(body.id)) throw Error('Invalid event');
  const data = {};
  if(body.kind==='logo_download'){if(!ASSETS.includes(body.asset)||!['svg','png'].includes(body.format))throw Error('Invalid asset');if(body.asset.startsWith('PixLab-')&&body.format!=='png')throw Error('Invalid format');if(body.asset.startsWith('Paiwo-')&&!body.asset.startsWith('Paiwo-logo-')&&body.format!=='png')throw Error('Invalid format');data.asset=body.asset;data.format=body.format;}
  if (['export_started', 'export_generated'].includes(body.kind)) {
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 500 || body.items.some(x => !x || !TYPES.includes(x.type) || !LANGS.includes(x.language))) throw Error('Invalid items');
    data.items = body.items.map(x => ({type:x.type, language:x.language}));
  }
  if (body.kind === 'export_checked') {
    if (!['blocked', 'warning', 'clear'].includes(body.result)) throw Error('Invalid result');
    data.result = body.result;
    data.issues = {};
    for (const [key, value] of Object.entries(body.issues || {})) {
      if (!ISSUES.includes(key) || !Number.isInteger(value) || value < 1 || value > 500) throw Error('Invalid issue');
      data.issues[key] = value;
    }
  }
  // Deliberately retain no user-supplied text, images, file names or URLs.
  return { id:body.id, kind:body.kind, data };
}
function aggregate(events, projects, startedAt, days, now = new Date(), accounts = []) {
  const today = dayOf(now), start = new Date(today+'T00:00:00+08:00').getTime() - (days - 1) * DAY;
  const daily = Array.from({length:days},(_,i)=>({date:dayOf(start+i*DAY),active:new Set(),projects:0,exports:0,images:0}));
  const byDay = new Map(daily.map(x=>[x.date,x])), users = new Set();
  const result = { days, timezone:'Asia/Shanghai', startedAt, generatedAt:now.toISOString(), activeUsers:0, newProjects:0, exports:0, images:0, single:0, batch:0,
    flow:{export_started:0,blocked:0,warning:0,clear:0,export_cancelled:0,export_failed:0,export_returned:0,export_confirmed:0}, types:Object.fromEntries(TYPES.map(x=>[x,0])), languages:Object.fromEntries(LANGS.map(x=>[x,0])), issues:Object.fromEntries(ISSUES.map(x=>[x,0])) };
  result.newUsers=accounts.filter(u=>new Date(u.createdAt).getTime()>=start&&new Date(u.createdAt)<=now).length;
  result.logos=Object.fromEntries(ASSETS.map(x=>[x,{svg:0,png:0}]));result.logoClicks=0;
  result.inventory={files:0,trash:0,bytes:0,sizes:{small:0,medium:0,large:0},types:{web:0,app:0,social:0}};
  for(const p of projects){const inv=result.inventory;inv.bytes+=Number(p.sizeBytes||0);if(p.deletedAt){inv.trash++;continue;}inv.files++;
    inv.sizes[p.sizeBytes<5*1024*1024?'small':p.sizeBytes<20*1024*1024?'medium':'large']++;
    const payload=p.payload||{};if(payload.version===2){for(const item of payload.items||[])if(TYPES.includes(item.type))inv.types[item.type]+=(item.languages||[]).length;}
    else for(const key of payload.outputs||[]){const type=key.split(':')[0];if(TYPES.includes(type))inv.types[type]++;}
  }
  const history=new Map();
  for(const e of events){if(e.kind==='logo_download'||new Date(e.createdAt)>now)continue;const date=dayOf(e.createdAt);if(!history.has(e.actor))history.set(e.actor,new Set());history.get(e.actor).add(date);}
  const activeWithin=n=>[...history.values()].filter(dates=>[...dates].some(date=>date>=dayOf(new Date(today+'T00:00:00+08:00').getTime()-(n-1)*DAY))).length;
  result.activeToday=activeWithin(1);result.active7=activeWithin(7);result.active30=activeWithin(30);
  for (const p of projects) {const d=byDay.get(dayOf(p.createdAt));if(d && new Date(p.createdAt)<=now){d.projects++;result.newProjects++;}}
  for (const e of events) {
    const d=byDay.get(dayOf(e.createdAt));if(!d || new Date(e.createdAt)>now)continue;
    if(e.kind==='logo_download'){result.logos[e.data.asset][e.data.format]++;result.logoClicks++;continue;}
    users.add(e.actor);d.active.add(e.actor);
    if(Object.hasOwn(result.flow,e.kind))result.flow[e.kind]++;
    if(e.kind==='export_checked') {result.flow[e.data.result]++;for(const [key,n] of Object.entries(e.data.issues))result.issues[key]+=n;}
    if(e.kind==='export_generated') {
      result.exports++;d.exports++;result.images+=e.data.items.length;d.images+=e.data.items.length;
      result[e.data.items.length===1?'single':'batch']++;
      for(const item of e.data.items){result.types[item.type]++;result.languages[item.language]++;}
    }
  }
  result.activeUsers=users.size;
  result.daily=daily.map(d=>({...d,active:d.active.size}));return result;
}
function installAnalytics(MemoryStore, PostgresStore) {
  MemoryStore.prototype.initAnalytics=async function(){this.analyticsStartedAt=new Date().toISOString();this.analyticsEvents=new Map();};
  MemoryStore.prototype.recordAnalytics=async function(actor,e){const id=e.kind==='active'?`${actor}:active:${dayOf(new Date())}`:`${actor}:${e.kind}:${e.id}`;if(!this.analyticsEvents.has(id))this.analyticsEvents.set(id,{...e,actor,createdAt:new Date().toISOString()});};
  MemoryStore.prototype.analyticsOverview=async function(days){return aggregate([...this.analyticsEvents.values()],[...this.projects.values()],this.analyticsStartedAt,days,new Date(),[...this.users.values()]);};
  PostgresStore.prototype.initAnalytics=async function(){await this.pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_events (id text PRIMARY KEY, actor text NOT NULL, kind text NOT NULL, data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events(created_at);
    INSERT INTO app_settings(key,value) VALUES('analytics_started_at',to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ON CONFLICT(key) DO NOTHING;
  `);};
  PostgresStore.prototype.recordAnalytics=async function(actor,e){const id=e.kind==='active'?`${actor}:active:${dayOf(new Date())}`:`${actor}:${e.kind}:${e.id}`;await this.pool.query('INSERT INTO analytics_events(id,actor,kind,data) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(id) DO NOTHING',[id,actor,e.kind,JSON.stringify(e.data)]);};
  PostgresStore.prototype.analyticsOverview=async function(days){
    const since=new Date(new Date(dayOf(new Date())+'T00:00:00+08:00').getTime()-(30-1)*DAY);
    const [events,projects,setting,accounts]=await Promise.all([
      this.pool.query('SELECT actor,kind,data,created_at AS "createdAt" FROM analytics_events WHERE created_at >= $1',[since]),
      this.pool.query(`SELECT created_at AS "createdAt", deleted_at AS "deletedAt", size_bytes AS "sizeBytes", jsonb_build_object('version',payload->'version','outputs',payload->'outputs','items',(SELECT jsonb_agg(jsonb_build_object('type',i->'type','languages',i->'languages')) FROM jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) i)) AS payload FROM cloud_projects`),
      this.pool.query("SELECT value FROM app_settings WHERE key='analytics_started_at'"),this.pool.query('SELECT created_at AS "createdAt" FROM users')]);
    return aggregate(events.rows,projects.rows,setting.rows[0].value,days,new Date(),accounts.rows);
  };
}
module.exports={normalizeEvent,aggregate,installAnalytics};
