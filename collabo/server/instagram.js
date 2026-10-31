// Instagram integration through the official API (Business Login for
// Instagram). Creators connect their own professional account; nothing is
// scraped. Every stored number records where and when it was fetched.
import crypto from 'node:crypto';

const env = (k, d) => process.env[k] ?? d;
export const config = () => ({
  appId: env('IG_APP_ID'),
  appSecret: env('IG_APP_SECRET'),
  redirectUri: env('IG_REDIRECT_URI'),
  authBase: env('IG_AUTH_BASE', 'https://www.instagram.com'),
  oauthBase: env('IG_OAUTH_BASE', 'https://api.instagram.com'),
  graphBase: env('IG_GRAPH_BASE', 'https://graph.instagram.com'),
  version: env('IG_API_VERSION', ''), // empty = the app's default version
});
export const configured = () => Boolean(config().appId && config().appSecret && config().redirectUri);

export const SCOPES = ['instagram_business_basic', 'instagram_business_manage_insights'];
export const PROFILE_FIELDS = 'id,username,name,profile_picture_url,followers_count,media_count,account_type';
export const MEDIA_FIELDS = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
// Media insights per product type. impressions/plays were retired in April 2025 in favour of views.
export const INSIGHT_METRICS = {
  FEED: ['views', 'reach', 'saved', 'shares'],
  REELS: ['views', 'reach', 'saved', 'shares', 'ig_reels_avg_watch_time'],
  STORY: ['views', 'reach', 'shares', 'replies'],
};
const MEDIA_LIMIT = 25;
const ER_WINDOW = 12;

export class InstagramError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

// ---------- token encryption at rest (AES-256-GCM) ----------
const key = () => crypto.createHash('sha256').update(env('TOKEN_KEY') ?? env('AUTH_SECRET') ?? 'dev-only-secret-change-me').digest();
export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}
export function decrypt(blob) {
  const [iv, tag, enc] = blob.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// ---------- OAuth ----------
// State is signed so the callback can't be forged or replayed for another user.
const sign = (s) => crypto.createHmac('sha256', key()).update(s).digest('base64url');
export function makeState(userId) {
  const payload = Buffer.from(JSON.stringify({ uid: userId, n: crypto.randomBytes(8).toString('hex'), exp: Date.now() + 10 * 60e3 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function readState(state) {
  const [payload, sig] = String(state || '').split('.');
  if (!payload || !sig || sig.length !== sign(payload).length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(payload)))) return null;
  const s = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return s.exp > Date.now() ? s.uid : null;
}

export function authorizeUrl(state) {
  const c = config();
  const q = new URLSearchParams({ client_id: c.appId, redirect_uri: c.redirectUri, response_type: 'code', scope: SCOPES.join(','), state });
  return `${c.authBase}/oauth/authorize?${q}`;
}

async function call(url, init) {
  let res;
  try { res = await fetch(url, init); } catch (e) { throw new InstagramError(`Could not reach Instagram (${e.message})`, 502, 'network'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error ?? {};
    throw new InstagramError(e.message || body.error_message || `Instagram returned ${res.status}`, res.status, e.code ?? e.type ?? body.error_type);
  }
  return body;
}

const graph = (path, params) => {
  const c = config();
  return `${c.graphBase}${c.version ? `/${c.version}` : ''}${path}?${new URLSearchParams(params)}`;
};

export async function exchangeCode(code) {
  const c = config();
  const short = await call(`${c.oauthBase}/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.appId, client_secret: c.appSecret, grant_type: 'authorization_code', redirect_uri: c.redirectUri, code }),
  });
  // Swap the 1-hour token for a 60-day one.
  const long = await call(`${c.graphBase}/access_token?${new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: c.appSecret, access_token: short.access_token })}`);
  return { token: long.access_token, expiresIn: long.expires_in, scopes: short.permissions ?? SCOPES };
}

export async function refreshToken(token) {
  const c = config();
  const r = await call(`${c.graphBase}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`);
  return { token: r.access_token, expiresIn: r.expires_in };
}

// ---------- data ----------
export const fetchProfile = (token) => call(graph('/me', { fields: PROFILE_FIELDS, access_token: token }));
export const fetchMedia = async (token) => (await call(graph('/me/media', { fields: MEDIA_FIELDS, limit: MEDIA_LIMIT, access_token: token }))).data ?? [];
export const fetchStories = async (token) => (await call(graph('/me/stories', { fields: MEDIA_FIELDS, access_token: token }))).data ?? [];

export async function fetchInsights(token, media) {
  const metrics = INSIGHT_METRICS[media.media_product_type] ?? INSIGHT_METRICS.FEED;
  const r = await call(graph(`/${media.id}/insights`, { metric: metrics.join(','), access_token: token }));
  return Object.fromEntries((r.data ?? []).map((m) => [m.name, m.values?.[0]?.value ?? m.total_value?.value ?? null]));
}

export async function fetchDemographics(token, breakdown) {
  const r = await call(graph('/me/insights', { metric: 'follower_demographics', period: 'lifetime', metric_type: 'total_value', breakdown, access_token: token }));
  const results = r.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  return results.map((x) => ({ key: x.dimension_values?.[0], value: x.value })).filter((x) => x.key != null);
}

// ---------- Meta callbacks (deauthorize / data deletion) ----------
export function parseSignedRequest(signed) {
  const [sig, payload] = String(signed || '').split('.');
  if (!sig || !payload || !config().appSecret) return null;
  const expected = crypto.createHmac('sha256', config().appSecret).update(payload).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return JSON.parse(Buffer.from(payload, 'base64url').toString());
}

// ---------- sync ----------
const PRODUCT_TO_KIND = { REELS: 'reel', FEED: 'post', STORY: 'story', AD: 'post' };
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// Engagement rate: average (likes + comments + saves + shares) per post over
// the last 12 posts/reels, divided by followers. Same formula shown in the UI.
export function computeMetrics(followers, media) {
  const recent = media.filter((m) => m.kind !== 'story').sort((a, b) => b.posted_at.localeCompare(a.posted_at)).slice(0, ER_WINDOW);
  const eng = recent.map((m) => (m.likes ?? 0) + (m.comments ?? 0) + (m.saves ?? 0) + (m.shares ?? 0));
  const reels = recent.filter((m) => m.kind === 'reel' && m.views != null);
  return {
    engagement_rate: followers && eng.length ? Math.round((avg(eng) / followers) * 1000) / 10 : 0,
    avg_views: Math.round(avg(reels.map((m) => m.views)) ?? 0),
    sample_size: recent.length,
    reels_sample: reels.length,
  };
}

export async function syncCreator(db, creatorId) {
  const conn = db.prepare('SELECT * FROM ig_connections WHERE creator_id = ?').get(creatorId);
  if (!conn) throw new InstagramError('Instagram is not connected', 404);
  let token = decrypt(conn.access_token_enc);
  const errors = [];
  try {
    // Refresh tokens that expire within 7 days.
    if (conn.token_expires_at && Date.parse(`${conn.token_expires_at}Z`) - Date.now() < 7 * 864e5) {
      try {
        const r = await refreshToken(token);
        token = r.token;
        db.prepare("UPDATE ig_connections SET access_token_enc = ?, token_expires_at = datetime('now', ?) WHERE creator_id = ?").run(encrypt(token), `+${r.expiresIn} seconds`, creatorId);
      } catch (e) { errors.push(`token refresh: ${e.message}`); }
    }
    const profile = await fetchProfile(token);
    if (!['BUSINESS', 'MEDIA_CREATOR', 'CREATOR'].includes(String(profile.account_type ?? 'MEDIA_CREATOR').toUpperCase())) {
      throw new InstagramError('This is a personal Instagram account. Switch it to a Creator or Business account (free, in Instagram settings) to connect.', 400, 'account_type');
    }
    let items = await fetchMedia(token);
    try { items = items.concat((await fetchStories(token)).map((s) => ({ ...s, media_product_type: 'STORY' }))); } catch (e) { errors.push(`stories: ${e.message}`); }

    const fetched = now();
    const rows = [];
    for (const m of items) {
      let ins = {};
      let insErr = null;
      try { ins = await fetchInsights(token, m); } catch (e) { insErr = e.message; }
      rows.push({
        external_id: m.id, kind: PRODUCT_TO_KIND[m.media_product_type] ?? (m.media_type === 'VIDEO' ? 'reel' : 'post'), media_type: m.media_type,
        caption: m.caption ?? '', permalink: m.permalink ?? '', media_url: m.media_url ?? '', thumbnail_url: m.thumbnail_url ?? m.media_url ?? '',
        posted_at: String(m.timestamp ?? fetched).slice(0, 19).replace('T', ' '),
        likes: m.like_count ?? null, comments: m.comments_count ?? null, views: ins.views ?? null, reach: ins.reach ?? null,
        saves: ins.saved ?? null, shares: ins.shares ?? null, replies: ins.replies ?? null, avg_watch_ms: ins.ig_reels_avg_watch_time ?? null, insights_error: insErr,
      });
    }

    let audience = null;
    try {
      const [age, gender, country] = await Promise.all(['age', 'gender', 'country'].map((b) => fetchDemographics(token, b)));
      const total = (xs) => xs.reduce((a, x) => a + x.value, 0) || 1;
      const top = (xs) => [...xs].sort((a, b) => b.value - a.value)[0]?.key;
      const female = gender.find((g) => g.key === 'F')?.value;
      audience = { age: top(age), female_pct: female != null ? Math.round((female / total(gender)) * 100) : undefined, top_country: top(country) };
    } catch (e) { errors.push(`demographics: ${e.message}`); }

    const metrics = computeMetrics(profile.followers_count, rows);
    db.exec('BEGIN');
    try {
      const up = db.prepare(`INSERT INTO media (creator_id, platform, external_id, kind, media_type, caption, permalink, media_url, thumbnail_url, posted_at,
          likes, comments, views, reach, saves, shares, replies, avg_watch_ms, source, fetched_at, insights_error)
        VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'instagram_api', ?, ?)
        ON CONFLICT (platform, external_id) DO UPDATE SET caption = excluded.caption, permalink = excluded.permalink, media_url = excluded.media_url,
          thumbnail_url = excluded.thumbnail_url, likes = excluded.likes, comments = excluded.comments, views = excluded.views, reach = excluded.reach,
          saves = excluded.saves, shares = excluded.shares, replies = excluded.replies, avg_watch_ms = excluded.avg_watch_ms,
          fetched_at = excluded.fetched_at, insights_error = excluded.insights_error`);
      // Verified content replaces any demo content for this platform.
      db.prepare("DELETE FROM media WHERE creator_id = ? AND platform = 'instagram' AND source != 'instagram_api'").run(creatorId);
      for (const r of rows) {
        up.run(creatorId, r.external_id, r.kind, r.media_type, r.caption, r.permalink, r.media_url, r.thumbnail_url, r.posted_at,
          r.likes, r.comments, r.views, r.reach, r.saves, r.shares, r.replies, r.avg_watch_ms, fetched, r.insights_error);
      }
      db.prepare(`INSERT INTO socials (creator_id, platform, handle, followers, engagement_rate, avg_views, source, fetched_at, verified_at, external_id, profile_picture_url)
          VALUES (?, 'instagram', ?, ?, ?, ?, 'instagram_api', ?, ?, ?, ?)
        ON CONFLICT (creator_id, platform) DO UPDATE SET handle = excluded.handle, followers = excluded.followers, engagement_rate = excluded.engagement_rate,
          avg_views = excluded.avg_views, source = 'instagram_api', fetched_at = excluded.fetched_at, verified_at = COALESCE(socials.verified_at, excluded.verified_at),
          external_id = excluded.external_id, profile_picture_url = excluded.profile_picture_url`)
        .run(creatorId, profile.username, profile.followers_count ?? 0, metrics.engagement_rate, metrics.avg_views, fetched, fetched, String(profile.id), profile.profile_picture_url ?? '');
      db.prepare(`INSERT INTO metric_snapshots (creator_id, platform, followers, media_count, engagement_rate, avg_views, source, fetched_at)
        VALUES (?, 'instagram', ?, ?, ?, ?, 'instagram_api', ?)`).run(creatorId, profile.followers_count ?? 0, profile.media_count ?? 0, metrics.engagement_rate, metrics.avg_views, fetched);
      if (audience && Object.values(audience).some((v) => v != null)) {
        db.prepare("UPDATE creators SET audience = ?, audience_source = 'instagram_api', audience_fetched_at = ? WHERE user_id = ?").run(JSON.stringify(audience), fetched, creatorId);
      }
      db.prepare("UPDATE ig_connections SET username = ?, account_type = ?, last_synced_at = ?, last_sync_error = ?, status = 'active' WHERE creator_id = ?")
        .run(profile.username, profile.account_type ?? null, fetched, errors.length ? errors.join('; ') : null, creatorId);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return { username: profile.username, followers: profile.followers_count, media: rows.length, ...metrics, warnings: errors };
  } catch (e) {
    const expired = e.code === 190 || /expired|invalid.*token|session has been invalidated/i.test(e.message);
    db.prepare('UPDATE ig_connections SET last_sync_error = ?, status = ? WHERE creator_id = ?').run(e.message, expired ? 'reconnect' : 'error', creatorId);
    throw e;
  }
}

// Remove everything the API gave us for a creator (disconnect or deletion request).
export function purgeCreator(db, creatorId) {
  db.prepare("DELETE FROM media WHERE creator_id = ? AND source = 'instagram_api'").run(creatorId);
  db.prepare("DELETE FROM metric_snapshots WHERE creator_id = ? AND source = 'instagram_api'").run(creatorId);
  db.prepare("DELETE FROM socials WHERE creator_id = ? AND platform = 'instagram' AND source = 'instagram_api'").run(creatorId);
  db.prepare("UPDATE creators SET audience = '{}', audience_source = NULL, audience_fetched_at = NULL WHERE user_id = ? AND audience_source = 'instagram_api'").run(creatorId);
  db.prepare('DELETE FROM ig_connections WHERE creator_id = ?').run(creatorId);
}
