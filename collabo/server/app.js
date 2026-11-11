import express from 'express';
import crypto from 'node:crypto';
import { tx } from './db.js';
import { hashPassword, verifyPassword, issueToken, readToken } from './auth.js';
import { PLATFORMS, DELIVERABLES, NICHES, estimateRate, marketRate, priceVerdict, creatorTier } from './pricing.js';
import { isDemoEmail } from './seed.js';
import * as ig from './instagram.js';
import { notify, emailConfigured } from './notify.js';
import { DURATIONS, FORMAT_LABEL, TERM_OPTIONS, DEFAULT_TERMS, InputError, normalizeItems, normalizeTerms, deliverablesText, quote, suggestUnit, termLabels, itemLabel, fmtDuration } from './deliverables.js';
import { reviewContent, aiReview, aiEnabled, suggestHashtags } from './review.js';
import { EDIT_STYLES, POST_FORMATS, STAGES, stageFor, analyzeHook, analyzePosts, weeklyCounts, trendStats, missionsFor, recommendations } from './content.js';

export const BUYER_FEE = 0.05; // charged to the business on top of the deal price
export const SELLER_FEE = 0.10; // deducted from the creator's payout
export const DRAFT_RELEASE = 0.3; // share of the fee released when the draft is approved
export const DRAFT_REVIEW_DAYS = 3; // brand silence after a draft counts as approval
export const FINAL_REVIEW_DAYS = 5; // brand silence after delivery counts as approval
export const LATE_GRACE_DAYS = 3; // after this, a brand can reclaim escrow for a missed deadline
export const BONUS_WINDOW_DAYS = 30;
// Comma-separated emails of Collabo staff who can mediate disputes.
const isAdmin = (email) => (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean).includes(String(email).toLowerCase());
const SYNC_MAX_AGE_MS = 6 * 36e5; // verified profiles refresh at most every 6 hours
const DEMO_MODE = process.env.DEMO_MODE !== 'off'; // time to hit a performance target before the bonus is refunded

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const parseJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

function need(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || body[f] === '') fail(400, `${f} is required`);
  }
}

function cents(v, field = 'price') {
  const n = Math.round(Number(v) * 100);
  if (!Number.isFinite(n) || n <= 0) fail(400, `${field} must be a positive amount`);
  return n;
}

function isoDate(v, field = 'deadline') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) fail(400, `${field} must be YYYY-MM-DD`);
  return String(v);
}

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));

  const q = (sql) => db.prepare(sql);

  // ---------- auth ----------
  app.use((req, _res, next) => {
    const uid = readToken((req.headers.authorization || '').replace(/^Bearer /, ''));
    req.user = uid ? q('SELECT id, role, email, name FROM users WHERE id = ? AND deleted_at IS NULL').get(uid) ?? null : null;
    if (req.user) req.user.is_admin = isAdmin(req.user.email);
    next();
  });
  const adminOnly = (req, _res, next) => {
    if (!req.user?.is_admin) fail(403, 'Admins only');
    next();
  };
  const auth = (role) => (req, _res, next) => {
    if (!req.user) fail(401, 'Sign in required');
    if (role && req.user.role !== role) fail(403, `Only ${role}s can do that`);
    next();
  };

  app.post('/api/auth/register', (req, res) => {
    const b = req.body;
    need(b, ['role', 'email', 'password', 'name']);
    if (!['creator', 'business'].includes(b.role)) fail(400, 'role must be creator or business');
    if (String(b.password).length < 8) fail(400, 'password must be at least 8 characters');
    if (b.accept_terms !== true) fail(400, 'Please accept the Terms of Service and Privacy Policy');
    const email = String(b.email).trim().toLowerCase();
    if (q('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'An account with that email already exists');
    const id = tx(db, () => {
      const { lastInsertRowid } = q("INSERT INTO users (role, email, password_hash, name, terms_accepted_at) VALUES (?, ?, ?, ?, datetime('now'))")
        .run(b.role, email, hashPassword(String(b.password)), String(b.name).trim());
      if (b.role === 'creator') {
        let handle = String(b.handle || b.name).toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 24) || `creator${lastInsertRowid}`;
        if (q('SELECT 1 FROM creators WHERE handle = ?').get(handle)) handle = `${handle}${lastInsertRowid}`;
        q('INSERT INTO creators (user_id, handle) VALUES (?, ?)').run(lastInsertRowid, handle);
      } else {
        q('INSERT INTO businesses (user_id, company) VALUES (?, ?)').run(lastInsertRowid, String(b.company || b.name).trim());
      }
      return Number(lastInsertRowid);
    });
    res.status(201).json({ token: issueToken(id), user: me(id) });
  });

  app.post('/api/auth/login', (req, res) => {
    need(req.body, ['email', 'password']);
    const u = q('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL').get(String(req.body.email).trim().toLowerCase());
    if (!u || !verifyPassword(String(req.body.password), u.password_hash)) fail(401, 'Wrong email or password');
    res.json({ token: issueToken(u.id), user: me(u.id) });
  });

  function me(id) {
    const u = q('SELECT id, role, email, name, email_notifications, terms_accepted_at FROM users WHERE id = ?').get(id);
    u.is_admin = isAdmin(u.email);
    u.email_notifications = Boolean(u.email_notifications);
    if (u.role === 'creator') u.creator = q('SELECT * FROM creators WHERE user_id = ?').get(id);
    else u.business = q('SELECT * FROM businesses WHERE user_id = ?').get(id);
    return u;
  }
  app.get('/api/me', auth(), (req, res) => res.json(me(req.user.id)));

  app.locals.meta = () => ({
    platforms: PLATFORMS, deliverables: DELIVERABLES, niches: NICHES, edit_styles: EDIT_STYLES, post_formats: POST_FORMATS, stages: STAGES,
    fees: { buyer: BUYER_FEE, seller: SELLER_FEE },
    offer: { format_labels: FORMAT_LABEL, durations: DURATIONS, term_options: TERM_OPTIONS, default_terms: DEFAULT_TERMS },
    feedback_categories: ['hook', 'branding', 'messaging', 'visuals', 'audio', 'caption', 'compliance', 'general'],
    ai_review: aiEnabled(),
    instagram_connect: ig.configured(),
    email_notifications: emailConfigured(),
    // Shown on the legal pages; set these in the server environment.
    legal: {
      name: process.env.LEGAL_NAME || 'Collabo',
      contact_email: process.env.CONTACT_EMAIL || null,
      address: process.env.LEGAL_ADDRESS || null,
      jurisdiction: process.env.GOVERNING_LAW || null,
      effective: '2026-11-11',
    },
  });
  app.get('/api/meta', (_req, res) => res.json(app.locals.meta()));

  // ---------- creators ----------
  function creatorStats(id) {
    const s = q(`SELECT
        SUM(status = 'completed') AS completed_deals,
        SUM(delivered_at IS NOT NULL) AS delivered_deals,
        SUM(delivered_at IS NOT NULL AND date(delivered_at) <= deadline) AS on_time
      FROM deals WHERE creator_id = ?`).get(id);
    const r = q('SELECT AVG(rating) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE reviewee_id = ?').get(id);
    const res = q(`SELECT SUM(r.revenue_cents) AS revenue, SUM(d.price_cents) AS spend, SUM(r.conversions) AS conversions, COUNT(*) AS n
      FROM results r JOIN deals d ON d.id = r.deal_id WHERE d.creator_id = ?`).get(id);
    return {
      completed_deals: s.completed_deals ?? 0,
      delivered_deals: s.delivered_deals ?? 0,
      on_time_rate: s.delivered_deals ? (s.on_time ?? 0) / s.delivered_deals : null,
      avg_rating: r.avg_rating ? Math.round(r.avg_rating * 10) / 10 : null,
      review_count: r.review_count,
      revenue_driven_cents: res.revenue ?? 0,
      conversions: res.conversions ?? 0,
      campaigns_with_results: res.n,
      avg_roi: res.n && res.spend ? Math.round((res.revenue / res.spend) * 10) / 10 : null,
    };
  }

  function creatorSummary(id) {
    const c = q(`SELECT c.*, u.name FROM creators c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?`).get(id);
    if (!c) return null;
    const socials = q('SELECT * FROM socials WHERE creator_id = ? ORDER BY followers DESC').all(id);
    const packages = q('SELECT * FROM packages WHERE creator_id = ? AND active = 1 ORDER BY price_cents').all(id);
    const stats = creatorStats(id);
    const tier = creatorTier({ creator: c, socials, packages, stats });
    const verified = socials.filter((s) => s.source === 'instagram_api');
    return {
      id: c.user_id, name: c.name, handle: c.handle, bio: c.bio, location: c.location,
      niches: parseJson(c.niches, []), audience: parseJson(c.audience, {}), avatar_color: c.avatar_color,
      avatar_url: verified[0]?.profile_picture_url || null, is_demo: Boolean(c.is_demo),
      verified_platforms: verified.map((s) => s.platform),
      data_source: verified.length ? 'verified' : c.is_demo ? 'demo' : 'self_reported',
      socials, packages, stats, tier: tier.tier, tier_score: tier.score,
      total_followers: socials.reduce((a, s) => a + s.followers, 0),
      starting_price_cents: packages[0]?.price_cents ?? null,
    };
  }

  app.get('/api/creators', (req, res) => {
    const f = req.query;
    const ids = q('SELECT c.user_id FROM creators c JOIN users u ON u.id = c.user_id WHERE u.deleted_at IS NULL').all().map((r) => r.user_id);
    let list = ids.map(creatorSummary);
    const text = String(f.q || '').trim().toLowerCase();
    if (text) list = list.filter((c) => [c.name, c.handle, c.bio, c.location, ...c.niches].join(' ').toLowerCase().includes(text));
    if (f.niche) list = list.filter((c) => c.niches.includes(f.niche));
    if (f.verified === '1') list = list.filter((c) => c.verified_platforms.length);
    if (f.platform) list = list.filter((c) => c.socials.some((s) => s.platform === f.platform));
    const reach = (c) => (f.platform ? c.socials.find((s) => s.platform === f.platform)?.followers ?? 0 : c.total_followers);
    if (f.minFollowers) list = list.filter((c) => reach(c) >= Number(f.minFollowers));
    if (f.maxFollowers) list = list.filter((c) => reach(c) <= Number(f.maxFollowers));
    if (f.minEngagement) list = list.filter((c) => c.socials.some((s) => (!f.platform || s.platform === f.platform) && s.engagement_rate >= Number(f.minEngagement)));
    if (f.maxPrice) list = list.filter((c) => c.starting_price_cents != null && c.starting_price_cents <= Number(f.maxPrice) * 100);
    if (f.tier) list = list.filter((c) => c.tier === f.tier);
    const sorters = {
      followers: (a, b) => reach(b) - reach(a),
      price: (a, b) => (a.starting_price_cents ?? Infinity) - (b.starting_price_cents ?? Infinity),
      rating: (a, b) => (b.stats.avg_rating ?? 0) - (a.stats.avg_rating ?? 0),
      roi: (a, b) => (b.stats.avg_roi ?? 0) - (a.stats.avg_roi ?? 0),
      recommended: (a, b) => b.verified_platforms.length - a.verified_platforms.length || b.tier_score - a.tier_score || reach(b) - reach(a),
    };
    list.sort(sorters[f.sort] || sorters.recommended);
    res.json(list);
  });

  app.get('/api/creators/:id', (req, res) => {
    const c = creatorSummary(Number(req.params.id));
    if (!c || q('SELECT deleted_at FROM users WHERE id = ?').get(c.id).deleted_at) fail(404, 'Creator not found');
    c.reviews = q(`SELECT r.rating, r.body, r.created_at, b.company FROM reviews r
      JOIN businesses b ON b.user_id = r.reviewer_id WHERE r.reviewee_id = ? ORDER BY r.created_at DESC`).all(c.id);
    const posts = analyzePosts(postsOf(c.id));
    const weeks = weeklyCounts(posts.posts, 4);
    c.content_stats = posts.total ? {
      posts_per_week: Math.round((weeks.reduce((x, w) => x + w.posts, 0) / 4) * 10) / 10,
      avg_er: posts.avg_er, avg_views: posts.avg_views, avg_hold_3s: posts.avg_hold_3s, last_posted: posts.posts[0].posted_at,
    } : null;
    c.case_studies = q(`SELECT d.title, d.price_cents, b.company, b.industry, r.impressions, r.clicks, r.conversions, r.revenue_cents
      FROM results r JOIN deals d ON d.id = r.deal_id JOIN businesses b ON b.user_id = d.business_id
      WHERE d.creator_id = ? ORDER BY r.revenue_cents DESC LIMIT 6`).all(c.id);
    c.media_counts = Object.fromEntries(q('SELECT kind, COUNT(*) AS n FROM media WHERE creator_id = ? GROUP BY kind').all(c.id).map((r) => [r.kind, r.n]));
    c.history = q("SELECT followers, engagement_rate, avg_views, fetched_at FROM metric_snapshots WHERE creator_id = ? AND platform = 'instagram' ORDER BY fetched_at DESC LIMIT 30").all(c.id).reverse();
    c.provenance = provenanceFor(c);
    const conn = q('SELECT username, status, last_synced_at, connected_at FROM ig_connections WHERE creator_id = ?').get(c.id);
    c.instagram = conn ? { connected: true, username: conn.username, status: conn.status, last_synced_at: conn.last_synced_at, connected_at: conn.connected_at } : { connected: false };
    // Keep verified numbers fresh: profiles older than SYNC_MAX_AGE refresh in the background.
    if (conn && conn.status === 'active' && (!conn.last_synced_at || Date.now() - Date.parse(`${conn.last_synced_at.replace(' ', 'T')}Z`) > SYNC_MAX_AGE_MS)) {
      ig.syncCreator(db, c.id).catch((e) => console.error(`Background sync for creator ${c.id} failed: ${e.message}`));
    }
    res.json(c);
  });

  // Where every number on a profile comes from, so a brand can check it.
  const SOURCE_LABEL = {
    instagram_api: 'Verified: fetched from Instagram’s official API with the account owner’s permission',
    self_reported: 'Self-reported: entered by the creator, not verified',
    demo: 'Demo data: a fictional creator used to show how Collabo works',
  };
  function provenanceFor(c) {
    const p = {};
    for (const s of c.socials) {
      const api = s.source === 'instagram_api';
      const sample = api ? q("SELECT COUNT(*) AS n FROM media WHERE creator_id = ? AND platform = ? AND kind != 'story' AND source = 'instagram_api'").get(c.id, s.platform).n : null;
      const base = { source: s.source, source_label: SOURCE_LABEL[s.source] ?? SOURCE_LABEL.self_reported, fetched_at: s.fetched_at, verified_at: s.verified_at, platform: s.platform, handle: s.handle };
      p[`followers.${s.platform}`] = { ...base, metric: `${s.platform} followers`, value: s.followers,
        method: api ? `GET ${ig.config().graphBase}/me?fields=followers_count (Instagram API, read with the creator’s token)` : base.source_label };
      p[`er.${s.platform}`] = { ...base, metric: `${s.platform} engagement rate`, value: `${s.engagement_rate}%`,
        method: api ? `Average of (likes + comments + saves + shares) on the last ${Math.min(sample, 12)} posts and reels, divided by followers. Likes and comments from /me/media, saves and shares from /{media-id}/insights.` : base.source_label };
      p[`views.${s.platform}`] = { ...base, metric: `${s.platform} average views`, value: s.avg_views,
        method: api ? 'Average “views” insight on the most recent reels (/{media-id}/insights?metric=views). Views replaced plays and impressions in April 2025.' : base.source_label };
    }
    const audSource = c.audience && Object.keys(c.audience).length ? (q('SELECT audience_source FROM creators WHERE user_id = ?').get(c.id).audience_source ?? (c.is_demo ? 'demo' : 'self_reported')) : null;
    if (audSource) p.audience = { metric: 'Audience demographics', source: audSource, source_label: SOURCE_LABEL[audSource],
      fetched_at: q('SELECT audience_fetched_at FROM creators WHERE user_id = ?').get(c.id).audience_fetched_at,
      method: audSource === 'instagram_api' ? 'GET /me/insights?metric=follower_demographics&metric_type=total_value with breakdowns age, gender and country. Instagram only returns this for accounts with 100+ followers.' : SOURCE_LABEL[audSource] };
    p.sales = { metric: 'Sales driven and ROI', source: 'collabo_deals', source_label: 'Collabo deals: revenue brands reported for this creator’s promo codes on completed deals',
      method: `Sum of brand-reported revenue across ${c.stats.campaigns_with_results} deal${c.stats.campaigns_with_results === 1 ? '' : 's'} with results; ROI = revenue ÷ fees paid.`, value: c.stats.revenue_driven_cents };
    p.rating = { metric: 'Rating', source: 'collabo_deals', source_label: 'Collabo reviews: left by brands after completed deals', method: `Average of ${c.stats.review_count} review${c.stats.review_count === 1 ? '' : 's'}.`, value: c.stats.avg_rating };
    return p;
  }

  // Published content with stats: reels, posts, stories (and videos/shorts on other platforms).
  app.get('/api/creators/:id/media', (req, res) => {
    const id = Number(req.params.id);
    if (!q('SELECT 1 FROM creators WHERE user_id = ?').get(id)) fail(404, 'Creator not found');
    const kind = req.query.kind;
    const rows = q(`SELECT * FROM media WHERE creator_id = ? ${kind ? 'AND kind = ?' : ''} ORDER BY posted_at DESC LIMIT 60`).all(...(kind ? [id, kind] : [id]));
    const followers = Object.fromEntries(q('SELECT platform, followers FROM socials WHERE creator_id = ?').all(id).map((s) => [s.platform, s.followers]));
    res.json(rows.map((m) => {
      const eng = (m.likes ?? 0) + (m.comments ?? 0) + (m.saves ?? 0) + (m.shares ?? 0);
      return {
        ...m,
        engagement_rate: m.kind === 'story' || !followers[m.platform] ? null : Math.round((eng / followers[m.platform]) * 1000) / 10,
        source_label: SOURCE_LABEL[m.source],
        method: m.source === 'instagram_api'
          ? `Likes and comments from /me/media; ${ig.INSIGHT_METRICS[{ reel: 'REELS', story: 'STORY' }[m.kind] ?? 'FEED'].join(', ')} from /${m.external_id}/insights`
          : SOURCE_LABEL[m.source],
      };
    }));
  });

  // Side-by-side comparison for brands deciding between creators.
  app.get('/api/compare', (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 4);
    if (ids.length < 2) fail(400, 'Pick at least 2 creators to compare');
    res.json(ids.map(creatorSummary).filter(Boolean).map((c) => ({ ...c, provenance: provenanceFor(c),
      media_counts: Object.fromEntries(q('SELECT kind, COUNT(*) AS n FROM media WHERE creator_id = ? GROUP BY kind').all(c.id).map((r) => [r.kind, r.n])) })));
  });

  // ---------- Instagram connection (official API, creator consent) ----------
  app.get('/api/creator/connections', auth('creator'), (req, res) => {
    const conn = q('SELECT username, account_type, status, connected_at, last_synced_at, last_sync_error, token_expires_at FROM ig_connections WHERE creator_id = ?').get(req.user.id);
    res.json({ instagram: { configured: ig.configured(), connected: Boolean(conn), ...(conn ?? {}) } });
  });

  app.post('/api/connect/instagram/start', auth('creator'), (req, res) => {
    if (!ig.configured()) fail(503, 'Instagram connection isn’t set up on this server yet (IG_APP_ID, IG_APP_SECRET, IG_REDIRECT_URI).');
    res.json({ url: ig.authorizeUrl(ig.makeState(req.user.id)) });
  });

  // Instagram redirects the creator's browser here after they approve (or cancel).
  app.get('/api/connect/instagram/callback', async (req, res) => {
    const back = (qs) => res.redirect(`/studio?${new URLSearchParams(qs)}`);
    const uid = ig.readState(req.query.state);
    if (!uid || !q("SELECT 1 FROM users WHERE id = ? AND role = 'creator'").get(uid)) return back({ instagram: 'error', reason: 'The connection link expired. Please try again.' });
    if (req.query.error || !req.query.code) return back({ instagram: 'cancelled' });
    try {
      const t = await ig.exchangeCode(String(req.query.code).replace(/#_$/, ''));
      const profile = await ig.fetchProfile(t.token);
      const taken = q('SELECT creator_id FROM ig_connections WHERE ig_user_id = ? AND creator_id != ?').get(String(profile.id), uid);
      if (taken) return back({ instagram: 'error', reason: 'That Instagram account is already connected to another Collabo creator.' });
      q(`INSERT INTO ig_connections (creator_id, ig_user_id, username, account_type, access_token_enc, token_expires_at, scopes, status)
          VALUES (?, ?, ?, ?, ?, datetime('now', ?), ?, 'active')
        ON CONFLICT (creator_id) DO UPDATE SET ig_user_id = excluded.ig_user_id, username = excluded.username, account_type = excluded.account_type,
          access_token_enc = excluded.access_token_enc, token_expires_at = excluded.token_expires_at, scopes = excluded.scopes, status = 'active', last_sync_error = NULL`)
        .run(uid, String(profile.id), profile.username, profile.account_type ?? null, ig.encrypt(t.token), `+${t.expiresIn ?? 5184000} seconds`, JSON.stringify(t.scopes));
      await ig.syncCreator(db, uid);
      back({ instagram: 'connected' });
    } catch (e) {
      console.error('Instagram connect failed:', e.message);
      back({ instagram: 'error', reason: e.message });
    }
  });

  app.post('/api/creator/connections/instagram/sync', auth('creator'), async (req, res) => {
    try { res.json(await ig.syncCreator(db, req.user.id)); } catch (e) {
      if (e instanceof ig.InstagramError) fail(e.status && e.status < 500 ? e.status : 502, e.message);
      throw e;
    }
  });

  app.delete('/api/creator/connections/instagram', auth('creator'), (req, res) => {
    tx(db, () => ig.purgeCreator(db, req.user.id));
    res.status(204).end();
  });

  // Meta calls these when a user removes the app or asks for their data to be deleted.
  const formBody = express.urlencoded({ extended: false });
  function creatorForSigned(req) {
    const data = ig.parseSignedRequest(req.body?.signed_request);
    if (!data?.user_id) fail(400, 'Invalid signed_request');
    const conn = q('SELECT creator_id FROM ig_connections WHERE ig_user_id = ?').get(String(data.user_id));
    return { platformUserId: String(data.user_id), creatorId: conn?.creator_id ?? null };
  }
  app.post('/api/instagram/deauthorize', formBody, (req, res) => {
    const { creatorId } = creatorForSigned(req);
    if (creatorId) tx(db, () => ig.purgeCreator(db, creatorId));
    res.json({ ok: true });
  });
  app.post('/api/instagram/data-deletion', formBody, (req, res) => {
    const { platformUserId, creatorId } = creatorForSigned(req);
    const code = crypto.randomBytes(9).toString('base64url');
    tx(db, () => {
      if (creatorId) ig.purgeCreator(db, creatorId);
      q("INSERT INTO deletion_requests (confirmation_code, platform_user_id, creator_id, status) VALUES (?, ?, ?, 'completed')").run(code, platformUserId, creatorId);
    });
    const origin = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ url: `${origin}/data-deletion?code=${code}`, confirmation_code: code });
  });
  app.get('/api/instagram/deletion-status/:code', (req, res) => {
    const r = q('SELECT status, created_at FROM deletion_requests WHERE confirmation_code = ?').get(req.params.code);
    if (!r) fail(404, 'Unknown confirmation code');
    res.json({ confirmation_code: req.params.code, ...r, detail: 'All Instagram data Collabo stored for this account has been deleted.' });
  });

  // ---------- creator studio ----------
  app.put('/api/creator/profile', auth('creator'), (req, res) => {
    const b = req.body;
    const cur = q('SELECT * FROM creators WHERE user_id = ?').get(req.user.id);
    const handle = b.handle !== undefined ? String(b.handle).toLowerCase().replace(/[^a-z0-9_.]/g, '') : cur.handle;
    if (!handle) fail(400, 'handle is required');
    if (handle !== cur.handle && q('SELECT 1 FROM creators WHERE handle = ?').get(handle)) fail(409, 'That handle is taken');
    const niches = b.niches !== undefined ? b.niches.filter((n) => NICHES.includes(n)) : parseJson(cur.niches, []);
    q('UPDATE creators SET handle = ?, bio = ?, location = ?, niches = ?, audience = ? WHERE user_id = ?').run(
      handle, b.bio ?? cur.bio, b.location ?? cur.location, JSON.stringify(niches),
      JSON.stringify(b.audience ?? parseJson(cur.audience, {})), req.user.id);
    if (b.name) q('UPDATE users SET name = ? WHERE id = ?').run(String(b.name), req.user.id);
    res.json(creatorSummary(req.user.id));
  });

  app.put('/api/creator/socials/:platform', auth('creator'), (req, res) => {
    const platform = req.params.platform;
    if (!PLATFORMS.includes(platform)) fail(400, 'Unknown platform');
    if (q("SELECT 1 FROM socials WHERE creator_id = ? AND platform = ? AND source = 'instagram_api'").get(req.user.id, platform)) {
      fail(409, 'This account is verified through Instagram, so its numbers update automatically and can’t be edited by hand.');
    }
    need(req.body, ['handle', 'followers']);
    const { handle, followers, engagement_rate = 0, avg_views = 0 } = req.body;
    q(`INSERT INTO socials (creator_id, platform, handle, followers, engagement_rate, avg_views) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (creator_id, platform) DO UPDATE SET handle = excluded.handle, followers = excluded.followers,
       engagement_rate = excluded.engagement_rate, avg_views = excluded.avg_views`)
      .run(req.user.id, platform, String(handle), Math.max(0, Math.round(followers)), Math.max(0, Number(engagement_rate)), Math.max(0, Math.round(avg_views)));
    res.json(creatorSummary(req.user.id));
  });

  app.delete('/api/creator/socials/:platform', auth('creator'), (req, res) => {
    if (q("SELECT 1 FROM socials WHERE creator_id = ? AND platform = ? AND source = 'instagram_api'").get(req.user.id, req.params.platform)) {
      fail(409, 'Disconnect Instagram to remove this verified account.');
    }
    q('DELETE FROM socials WHERE creator_id = ? AND platform = ?').run(req.user.id, req.params.platform);
    res.json(creatorSummary(req.user.id));
  });

  function packageFields(b) {
    need(b, ['title', 'platform', 'deliverable_type', 'price']);
    const platform = b.deliverable_type === 'ugc' ? 'any' : b.platform;
    if (!DELIVERABLES[platform]?.includes(b.deliverable_type)) fail(400, `${b.deliverable_type} is not offered on ${platform}`);
    return [String(b.title), platform, b.deliverable_type, Math.max(1, Math.round(b.quantity || 1)), cents(b.price),
      Math.max(1, Math.round(b.turnaround_days || 7)), String(b.description || '')];
  }

  app.post('/api/creator/packages', auth('creator'), (req, res) => {
    const { lastInsertRowid } = q(`INSERT INTO packages (title, platform, deliverable_type, quantity, price_cents, turnaround_days, description, creator_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(...packageFields(req.body), req.user.id);
    res.status(201).json(q('SELECT * FROM packages WHERE id = ?').get(lastInsertRowid));
  });

  app.put('/api/creator/packages/:id', auth('creator'), (req, res) => {
    const r = q(`UPDATE packages SET title = ?, platform = ?, deliverable_type = ?, quantity = ?, price_cents = ?, turnaround_days = ?, description = ?
      WHERE id = ? AND creator_id = ?`).run(...packageFields(req.body), Number(req.params.id), req.user.id);
    if (!r.changes) fail(404, 'Package not found');
    res.json(q('SELECT * FROM packages WHERE id = ?').get(req.params.id));
  });

  // Soft delete so past deals keep pointing at the package they were bought from.
  app.delete('/api/creator/packages/:id', auth('creator'), (req, res) => {
    q('UPDATE packages SET active = 0 WHERE id = ? AND creator_id = ?').run(Number(req.params.id), req.user.id);
    res.status(204).end();
  });

  function rateFor(creatorId, platform, deliverable_type) {
    const c = q('SELECT niches FROM creators WHERE user_id = ?').get(creatorId);
    const s = q('SELECT * FROM socials WHERE creator_id = ? AND platform = ?').get(creatorId, platform)
      ?? q('SELECT * FROM socials WHERE creator_id = ? ORDER BY followers DESC').get(creatorId) ?? { followers: 0, engagement_rate: 0 };
    const input = { platform, deliverable_type, followers: s.followers, engagement_rate: s.engagement_rate, niches: parseJson(c.niches, []) };
    return { input, suggestion: estimateRate(input), market: marketRate(db, { ...input, exclude_creator_id: creatorId }) };
  }

  app.get('/api/creator/rate', auth('creator'), (req, res) => {
    need(req.query, ['platform', 'deliverable_type']);
    res.json(rateFor(req.user.id, req.query.platform, req.query.deliverable_type));
  });

  // Public estimator used on the landing page to show creators what they could earn.
  app.post('/api/rates/estimate', (req, res) => {
    need(req.body, ['platform', 'deliverable_type', 'followers']);
    const input = { ...req.body, followers: Number(req.body.followers), engagement_rate: Number(req.body.engagement_rate || 0), niches: req.body.niches || [] };
    res.json({ suggestion: estimateRate(input), market: marketRate(db, input) });
  });

  app.get('/api/creator/growth', auth('creator'), (req, res) => {
    const id = req.user.id;
    const c = q('SELECT * FROM creators WHERE user_id = ?').get(id);
    const socials = q('SELECT * FROM socials WHERE creator_id = ?').all(id);
    const packages = q('SELECT * FROM packages WHERE creator_id = ? AND active = 1').all(id);
    const stats = creatorStats(id);
    const pricing = packages.map((p) => {
      const r = rateFor(id, p.platform, p.deliverable_type);
      return { package_id: p.id, title: p.title, price_cents: p.price_cents, quantity: p.quantity, ...r, ...priceVerdict(p.price_cents, p.quantity, r.suggestion, r.market) };
    });
    const earnings = q(`SELECT COALESCE(SUM(t.amount_cents), 0) AS v FROM transactions t JOIN deals d ON d.id = t.deal_id WHERE d.creator_id = ? AND t.type = 'payout'`).get(id).v;
    const pipeline = q(`SELECT COALESCE(SUM(price_cents), 0) AS v FROM deals WHERE creator_id = ? AND status IN ('contract','awaiting_funding')`).get(id).v;
    const secured = q(`SELECT COALESCE(SUM(CASE WHEN t.type IN ('escrow_fund','bonus_fund') THEN t.amount_cents
        WHEN t.type IN ('payout','seller_fee','refund') THEN -t.amount_cents ELSE 0 END), 0) AS v
      FROM transactions t JOIN deals d ON d.id = t.deal_id WHERE d.creator_id = ?`).get(id).v;
    res.json({ ...creatorTier({ creator: c, socials, packages, stats }), stats, pricing, earnings_cents: earnings, pipeline_cents: pipeline, secured_cents: secured });
  });

  // ---------- content growth: posts, insights, hooks, trends ----------
  const postsOf = (id) => q('SELECT * FROM posts WHERE creator_id = ? ORDER BY posted_at DESC, id DESC').all(id);
  const allRecentPosts = () => q("SELECT * FROM posts WHERE posted_at >= date('now', '-60 days')").all();

  function postFields(b) {
    need(b, ['platform', 'format', 'posted_at', 'views']);
    if (!POST_FORMATS[b.platform]?.includes(b.format)) fail(400, `${b.format} is not a ${b.platform} format`);
    if (b.edit_style && !EDIT_STYLES.includes(b.edit_style)) fail(400, 'Unknown edit style');
    const int = (v) => (v === undefined || v === null || v === '' ? null : Math.max(0, Math.round(Number(v)) || 0));
    const hold = int(b.hold_3s_pct);
    if (hold != null && hold > 100) fail(400, 'hold_3s_pct must be 0–100');
    const trend = b.trend_id ? q('SELECT id FROM trends WHERE id = ?').get(Number(b.trend_id)) : null;
    return [b.platform, b.format, isoDate(b.posted_at, 'posted_at'), String(b.hook || '').slice(0, 300), b.edit_style || null, int(b.duration_s),
      int(b.views) ?? 0, int(b.likes) ?? 0, int(b.comments) ?? 0, int(b.shares) ?? 0, int(b.saves) ?? 0, hold, trend?.id ?? null, b.sponsored ? 1 : 0, String(b.url || '')];
  }
  const POST_COLS = 'platform, format, posted_at, hook, edit_style, duration_s, views, likes, comments, shares, saves, hold_3s_pct, trend_id, sponsored, url';

  app.get('/api/creator/posts', auth('creator'), (req, res) => res.json(analyzePosts(postsOf(req.user.id)).posts));

  app.post('/api/creator/posts', auth('creator'), (req, res) => {
    const { lastInsertRowid } = q(`INSERT INTO posts (${POST_COLS}, creator_id) VALUES (${POST_COLS.split(',').map(() => '?').join(', ')}, ?)`).run(...postFields(req.body), req.user.id);
    res.status(201).json(q('SELECT * FROM posts WHERE id = ?').get(lastInsertRowid));
  });

  app.put('/api/creator/posts/:id', auth('creator'), (req, res) => {
    const r = q(`UPDATE posts SET ${POST_COLS.split(', ').map((c) => `${c} = ?`).join(', ')} WHERE id = ? AND creator_id = ?`).run(...postFields(req.body), Number(req.params.id), req.user.id);
    if (!r.changes) fail(404, 'Post not found');
    res.json(q('SELECT * FROM posts WHERE id = ?').get(req.params.id));
  });

  app.delete('/api/creator/posts/:id', auth('creator'), (req, res) => {
    q('DELETE FROM posts WHERE id = ? AND creator_id = ?').run(Number(req.params.id), req.user.id);
    res.status(204).end();
  });

  app.post('/api/hooks/analyze', (req, res) => {
    need(req.body, ['hook']);
    res.json(analyzeHook({ ...req.body, duration_s: Number(req.body.duration_s) || null }));
  });

  function trendsFor(creatorId, filter = {}) {
    let trends = q('SELECT * FROM trends ORDER BY id').all();
    if (filter.platform) trends = trends.filter((t) => t.platform === filter.platform);
    const stats = trendStats(trends, allRecentPosts(), creatorId ? postsOf(creatorId) : []);
    return filter.niche ? stats.filter((t) => !t.niches.length || t.niches.includes(filter.niche)) : stats;
  }

  app.get('/api/trends', (req, res) => {
    const me = req.user?.role === 'creator' ? req.user.id : null;
    let list = trendsFor(me, { platform: req.query.platform, niche: req.query.niche });
    if (req.query.mine === '1' && me) {
      const c = q('SELECT niches FROM creators WHERE user_id = ?').get(me);
      const niches = parseJson(c.niches, []);
      const platforms = q('SELECT platform FROM socials WHERE creator_id = ?').all(me).map((x) => x.platform);
      list = list.filter((t) => platforms.includes(t.platform) && (!t.niches.length || t.niches.some((n) => niches.includes(n))));
    }
    res.json(list);
  });

  app.get('/api/creator/insights', auth('creator'), (req, res) => {
    const id = req.user.id;
    const c = q('SELECT * FROM creators WHERE user_id = ?').get(id);
    const socials = q('SELECT * FROM socials WHERE creator_id = ?').all(id);
    const packages = q('SELECT * FROM packages WHERE creator_id = ? AND active = 1').all(id);
    const stats = creatorStats(id);
    const niches = parseJson(c.niches, []);
    const maxF = Math.max(0, ...socials.map((s) => s.followers));
    const stage = stageFor(maxF);
    const a = analyzePosts(postsOf(id));
    const pricing = packages.map((p) => {
      const r = rateFor(id, p.platform, p.deliverable_type);
      return priceVerdict(p.price_cents, p.quantity, r.suggestion, r.market);
    });
    const trends = trendsFor(id);
    const platforms = socials.map((s) => s.platform);
    const risingUnused = trends.filter((t) => ['rising', 'peaking'].includes(t.momentum) && !t.my_uses && platforms.includes(t.platform)
      && (!t.niches.length || t.niches.some((n) => niches.includes(n))));
    const trendsUsed30d = new Set(a.posts.filter((p) => p.trend_id && Date.now() - Date.parse(p.posted_at) < 30 * 864e5).map((p) => p.trend_id)).size;
    const repeatBrands = q(`SELECT COUNT(*) AS n FROM (SELECT business_id FROM deals WHERE creator_id = ? AND status = 'completed' GROUP BY business_id HAVING COUNT(*) >= 2)`).get(id).n;
    const ctx = { a, socials, niches, packages, stats, pricing, trendsUsed30d, repeatBrands, risingUnused };
    const idx = STAGES.indexOf(stage);
    const next = STAGES[idx + 1] ?? null;
    res.json({
      stage: { ...stage, index: idx, followers: maxF, next: next && { ...next, followers_to_go: next.min - maxF } },
      missions: missionsFor(stage, ctx),
      recommendations: recommendations(stage, ctx),
      weekly: weeklyCounts(a.posts, 8),
      summary: { total: a.total, last_7d: a.last_7d, avg_er: a.avg_er, avg_views: a.avg_views, avg_hold_3s: a.avg_hold_3s, avg_hook_score: a.avg_hook_score },
      breakdowns: { format: a.by_format, edit_style: a.by_edit_style, hook_type: a.by_hook_type, weekday: a.by_weekday, duration: a.by_duration, trend: a.trend_vs_not },
      top_posts: a.top_posts,
      rising_for_you: risingUnused.slice(0, 3),
    });
  });

  // ---------- businesses ----------
  app.put('/api/business/profile', auth('business'), (req, res) => {
    const cur = q('SELECT * FROM businesses WHERE user_id = ?').get(req.user.id);
    const b = { ...cur, ...req.body };
    q('UPDATE businesses SET company = ?, industry = ?, website = ?, about = ?, location = ? WHERE user_id = ?')
      .run(String(b.company), String(b.industry), String(b.website), String(b.about), String(b.location), req.user.id);
    res.json(me(req.user.id));
  });

  app.get('/api/business/dashboard', auth('business'), (req, res) => {
    const id = req.user.id;
    const sumType = (types) => q(`SELECT COALESCE(SUM(t.amount_cents), 0) AS v FROM transactions t JOIN deals d ON d.id = t.deal_id
      WHERE d.business_id = ? AND t.type IN (${types.map(() => '?').join(',')})`).get(id, ...types).v;
    const spend = sumType(['escrow_fund', 'bonus_fund', 'buyer_fee']) - sumType(['refund', 'fee_refund']);
    const held = sumType(['escrow_fund', 'bonus_fund']) - sumType(['payout', 'seller_fee', 'refund']);
    const r = q(`SELECT COALESCE(SUM(r.revenue_cents),0) AS revenue, COALESCE(SUM(r.conversions),0) AS conversions, COALESCE(SUM(r.impressions),0) AS impressions,
      COALESCE(SUM(d.price_cents),0) AS measured_spend FROM results r JOIN deals d ON d.id = r.deal_id WHERE d.business_id = ?`).get(id);
    const byStatus = Object.fromEntries(q('SELECT status, COUNT(*) AS n FROM deals WHERE business_id = ? GROUP BY status').all(id).map((x) => [x.status, x.n]));
    const top = q(`SELECT d.creator_id, u.name, c.handle, SUM(r.revenue_cents) AS revenue_cents, SUM(d.price_cents) AS spend_cents
      FROM results r JOIN deals d ON d.id = r.deal_id JOIN creators c ON c.user_id = d.creator_id JOIN users u ON u.id = c.user_id
      WHERE d.business_id = ? GROUP BY d.creator_id ORDER BY revenue_cents DESC LIMIT 5`).all(id);
    res.json({
      spend_cents: spend, held_in_escrow_cents: held, revenue_cents: r.revenue, conversions: r.conversions, impressions: r.impressions,
      roas: r.measured_spend ? Math.round((r.revenue / r.measured_spend) * 10) / 10 : null,
      deals_by_status: byStatus, top_creators: top,
    });
  });

  // ---------- campaigns (briefs creators can pitch on) ----------
  const campaignOut = (c) => c && { ...c, niches: parseJson(c.niches, []), platforms: parseJson(c.platforms, []) };

  app.get('/api/campaigns', (req, res) => {
    const mine = req.query.mine === '1' && req.user?.role === 'business';
    const base = `SELECT c.*, b.company, b.industry, (SELECT COUNT(*) FROM deals d WHERE d.campaign_id = c.id) AS pitches
      FROM campaigns c JOIN businesses b ON b.user_id = c.business_id`;
    let list = (mine
      ? q(`${base} WHERE c.business_id = ? ORDER BY c.id DESC`).all(req.user.id)
      : q(`${base} WHERE c.status = 'open' ORDER BY c.id DESC`).all()).map(campaignOut);
    if (req.query.niche) list = list.filter((c) => c.niches.includes(req.query.niche));
    if (req.query.platform) list = list.filter((c) => c.platforms.includes(req.query.platform));
    res.json(list);
  });

  app.get('/api/campaigns/:id', (req, res) => {
    const c = campaignOut(q(`SELECT c.*, b.company, b.industry, b.website FROM campaigns c JOIN businesses b ON b.user_id = c.business_id WHERE c.id = ?`).get(Number(req.params.id)));
    if (!c) fail(404, 'Campaign not found');
    if (req.user?.id === c.business_id) {
      c.pitches = q(`SELECT d.id, d.status, d.creator_id, u.name, cr.handle, o.price_cents, o.note FROM deals d
        JOIN users u ON u.id = d.creator_id JOIN creators cr ON cr.user_id = d.creator_id
        LEFT JOIN offers o ON o.id = (SELECT id FROM offers WHERE deal_id = d.id ORDER BY id DESC LIMIT 1)
        WHERE d.campaign_id = ? ORDER BY d.id DESC`).all(c.id);
    } else if (req.user?.role === 'creator') {
      c.my_deal_id = q('SELECT id FROM deals WHERE campaign_id = ? AND creator_id = ?').get(c.id, req.user.id)?.id ?? null;
    }
    res.json(c);
  });

  app.post('/api/campaigns', auth('business'), (req, res) => {
    const b = req.body;
    need(b, ['title', 'brief', 'budget']);
    const { lastInsertRowid } = q('INSERT INTO campaigns (business_id, title, brief, budget_cents, niches, platforms, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, String(b.title), String(b.brief), cents(b.budget, 'budget'),
        JSON.stringify((b.niches || []).filter((n) => NICHES.includes(n))),
        JSON.stringify((b.platforms || []).filter((p) => PLATFORMS.includes(p))),
        b.deadline ? isoDate(b.deadline) : null);
    res.status(201).json(campaignOut(q('SELECT * FROM campaigns WHERE id = ?').get(lastInsertRowid)));
  });

  app.patch('/api/campaigns/:id', auth('business'), (req, res) => {
    const status = req.body.status;
    if (!['open', 'closed'].includes(status)) fail(400, 'status must be open or closed');
    const r = q('UPDATE campaigns SET status = ? WHERE id = ? AND business_id = ?').run(status, Number(req.params.id), req.user.id);
    if (!r.changes) fail(404, 'Campaign not found');
    res.json(campaignOut(q('SELECT * FROM campaigns WHERE id = ?').get(req.params.id)));
  });

  app.post('/api/campaigns/:id/pitch', auth('creator'), (req, res) => {
    const c = q('SELECT * FROM campaigns WHERE id = ?').get(Number(req.params.id));
    if (!c || c.status !== 'open') fail(404, 'Campaign is not open');
    if (q('SELECT 1 FROM deals WHERE campaign_id = ? AND creator_id = ?').get(c.id, req.user.id)) fail(409, 'You already pitched on this campaign');
    const offer = offerFields(req.body);
    const id = tx(db, () => {
      const { lastInsertRowid } = q('INSERT INTO deals (business_id, creator_id, campaign_id, title) VALUES (?, ?, ?, ?)').run(c.business_id, req.user.id, c.id, c.title);
      addOffer(lastInsertRowid, req.user.id, offer);
      return lastInsertRowid;
    });
    res.status(201).json(dealOut(id, req.user));
  });

  // ---------- deals + escrow ----------
  const BONUS_METRICS = { views: 'impressions', conversions: 'conversions', revenue: 'revenue_cents' };

  // Structured offers send items + terms (the price is computed from them);
  // simple offers send a price and a deliverables sentence.
  function offerFields(b) {
    let items = null, terms = null, price_cents, deliverables;
    if (Array.isArray(b.items)) {
      try { items = normalizeItems(b.items); terms = normalizeTerms(b.terms); } catch (e) { if (e instanceof InputError) fail(400, e.message); throw e; }
      price_cents = quote(items, terms).total_cents;
      deliverables = deliverablesText(items);
    } else {
      need(b, ['price', 'deliverables']);
      price_cents = cents(b.price);
      deliverables = String(b.deliverables);
    }
    need(b, ['deadline']);
    const deadline = isoDate(b.deadline);
    if (deadline < new Date().toISOString().slice(0, 10)) fail(400, 'deadline must be in the future');
    const out = { price_cents, deliverables, deadline, note: String(b.note || ''), bonus_cents: 0, bonus_metric: null, bonus_target: null, items, terms };
    if (b.bonus && Number(b.bonus) > 0) {
      if (!BONUS_METRICS[b.bonus_metric]) fail(400, 'bonus_metric must be views, conversions or revenue');
      const target = Number(b.bonus_target);
      if (!(target > 0)) fail(400, 'bonus_target must be a positive number');
      out.bonus_cents = cents(b.bonus, 'bonus');
      out.bonus_metric = b.bonus_metric;
      out.bonus_target = Math.round(b.bonus_metric === 'revenue' ? target * 100 : target);
    }
    return out;
  }

  function addOffer(dealId, userId, o) {
    const first = !q('SELECT 1 FROM offers WHERE deal_id = ?').get(dealId);
    q("UPDATE offers SET status = 'superseded' WHERE deal_id = ? AND status = 'pending'").run(dealId);
    q('INSERT INTO offers (deal_id, from_user_id, price_cents, deliverables, deadline, note, bonus_cents, bonus_metric, bonus_target, items, terms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(dealId, userId, o.price_cents, o.deliverables, o.deadline, o.note, o.bonus_cents, o.bonus_metric, o.bonus_target,
        o.items ? JSON.stringify(o.items) : null, o.terms ? JSON.stringify(o.terms) : null);
    const d = q('SELECT business_id, creator_id, title FROM deals WHERE id = ?').get(dealId);
    notify(db, userId === d.business_id ? d.creator_id : d.business_id, {
      dealId, kind: 'offer', title: `${first ? 'New offer' : 'Counter-offer'}: ${d.title}`,
      body: `${usd(o.price_cents)}${o.bonus_cents ? ` + ${usd(o.bonus_cents)} bonus` : ''} for ${o.deliverables}. Live by ${o.deadline}.`,
    });
    touch(dealId);
  }

  const touch = (dealId) => q("UPDATE deals SET updated_at = datetime('now') WHERE id = ?").run(dealId);
  // A deal-room system message; with a title it also notifies both parties except whoever acted.
  const sysMsg = (dealId, body, title = null, actorId = null) => {
    q('INSERT INTO messages (deal_id, body, system) VALUES (?, ?, 1)').run(dealId, body);
    if (!title) return;
    const d = q('SELECT business_id, creator_id, title FROM deals WHERE id = ?').get(dealId);
    for (const uid of [d.business_id, d.creator_id]) if (uid !== actorId) notify(db, uid, { dealId, kind: 'deal', title: `${title}: ${d.title}`, body });
  };
  const usd = (c) => `$${(c / 100).toFixed(2)}`;
  const ledger = (dealId, type, amount, note = '') => amount > 0 && q('INSERT INTO transactions (deal_id, type, amount_cents, note) VALUES (?, ?, ?, ?)').run(dealId, type, amount, note);
  const setStatus = (dealId, status, extra = '') => q(`UPDATE deals SET status = ?${extra} WHERE id = ?`).run(status, dealId);

  // Running escrow balance for one deal, split into the fee and bonus pots.
  function escrowOf(dealId) {
    const sum = (where) => q(`SELECT COALESCE(SUM(amount_cents), 0) AS v FROM transactions WHERE deal_id = ? AND ${where}`).get(dealId).v;
    const fundedFee = sum("type = 'escrow_fund'"), fundedBonus = sum("type = 'bonus_fund'");
    const releasedFee = sum("type IN ('payout','seller_fee') AND note != 'bonus'"), releasedBonus = sum("type IN ('payout','seller_fee') AND note = 'bonus'");
    const refundedFee = sum("type = 'refund' AND note != 'bonus'"), refundedBonus = sum("type = 'refund' AND note = 'bonus'");
    return {
      funded_cents: fundedFee + fundedBonus,
      released_cents: releasedFee + releasedBonus,
      refunded_cents: refundedFee + refundedBonus,
      held_fee_cents: fundedFee - releasedFee - refundedFee,
      held_bonus_cents: fundedBonus - releasedBonus - refundedBonus,
      held_cents: fundedFee + fundedBonus - releasedFee - releasedBonus - refundedFee - refundedBonus,
      buyer_fees_cents: sum("type = 'buyer_fee'") - sum("type = 'fee_refund'"),
    };
  }

  // Moves money out of escrow to the creator; the platform keeps SELLER_FEE.
  function release(dealId, gross, note) {
    const fee = Math.round(gross * SELLER_FEE);
    ledger(dealId, 'seller_fee', fee, note);
    ledger(dealId, 'payout', gross - fee, note);
    return gross - fee;
  }

  // Returns escrowed money to the brand, including the matching share of its service fee.
  function refund(dealId, amount, note) {
    ledger(dealId, 'refund', amount, note);
    ledger(dealId, 'fee_refund', Math.round(amount * BUYER_FEE), note);
  }

  function approveDraft(d, by) {
    const gross = Math.round(d.price_cents * DRAFT_RELEASE);
    const net = release(d.id, gross, 'draft');
    setStatus(d.id, 'draft_approved', ", draft_approved_at = datetime('now')");
    sysMsg(d.id, `${by ?? 'Draft auto-approved after the 3-day review window.'}${by ? ' approved the draft.' : ''} ${usd(net)} (${DRAFT_RELEASE * 100}% of the fee, after fees) released to the creator. Post the content when ready.`, 'Draft approved, 30% released', by ? d.business_id : null);
    touch(d.id);
  }

  function completeDeal(d, by) {
    const e = escrowOf(d.id);
    const net = release(d.id, e.held_fee_cents, 'final');
    setStatus(d.id, 'completed', ", completed_at = datetime('now')");
    sysMsg(d.id, `${by ? `${by} approved the live content.` : 'Live content auto-approved after the 5-day review window.'} ${usd(net)} released to the creator.`, 'Live post approved, payment released', by ? d.business_id : null);
    touch(d.id);
    settleBonus(q('SELECT * FROM deals WHERE id = ?').get(d.id));
  }

  // Pays the performance bonus once the deal is complete and the target is met.
  function settleBonus(d) {
    if (d.bonus_status !== 'held' || d.status !== 'completed') return;
    const r = q('SELECT * FROM results WHERE deal_id = ?').get(d.id);
    if (!r || r[BONUS_METRICS[d.bonus_metric]] < d.bonus_target) return;
    const net = release(d.id, escrowOf(d.id).held_bonus_cents, 'bonus');
    q("UPDATE deals SET bonus_status = 'paid' WHERE id = ?").run(d.id);
    sysMsg(d.id, `Performance target hit. ${usd(net)} bonus released to the creator.`, 'Bonus paid', null);
    touch(d.id);
  }

  // Deadlines are enforced lazily whenever deals are read, so no scheduler is needed.
  function remindOnce(d, kind, title, body) {
    if (q('SELECT 1 FROM notifications WHERE deal_id = ? AND kind = ?').get(d.id, kind)) return;
    notify(db, d.business_id, { dealId: d.id, kind, title: `${title}: ${d.title}`, body });
  }

  function sweepEscrow() {
    for (const d of q(`SELECT * FROM deals WHERE status = 'draft_submitted' AND draft_submitted_at <= datetime('now', '-${DRAFT_REVIEW_DAYS - 1} days')`).all()) {
      remindOnce(d, `reminder_draft_${d.draft_round}`, 'Draft auto-approves in under 24 hours', `If you don’t approve or request changes, the draft is approved automatically and ${usd(Math.round(d.price_cents * DRAFT_RELEASE))} is released to the creator.`);
    }
    for (const d of q(`SELECT * FROM deals WHERE status = 'delivered' AND delivered_at <= datetime('now', '-${FINAL_REVIEW_DAYS - 1} days')`).all()) {
      remindOnce(d, `reminder_final_${d.delivered_at}`, 'Live post auto-approves in under 24 hours', 'If you don’t approve or request a fix, the live post is approved automatically and the rest of the fee is released to the creator.');
    }
    for (const d of q(`SELECT * FROM deals WHERE status = 'draft_submitted' AND draft_submitted_at <= datetime('now', '-${DRAFT_REVIEW_DAYS} days')`).all()) tx(db, () => approveDraft(d, null));
    for (const d of q(`SELECT * FROM deals WHERE status = 'delivered' AND delivered_at <= datetime('now', '-${FINAL_REVIEW_DAYS} days')`).all()) tx(db, () => completeDeal(d, null));
    for (const d of q(`SELECT * FROM deals WHERE status = 'completed' AND bonus_status = 'held' AND completed_at <= datetime('now', '-${BONUS_WINDOW_DAYS} days')`).all()) {
      tx(db, () => {
        refund(d.id, escrowOf(d.id).held_bonus_cents, 'bonus');
        q("UPDATE deals SET bonus_status = 'refunded' WHERE id = ?").run(d.id);
        sysMsg(d.id, `The performance target wasn't reached within ${BONUS_WINDOW_DAYS} days. The bonus was refunded to the brand.`, 'Bonus refunded', null);
      });
    }
  }

  const isOverdue = (d) => ['in_progress', 'draft_approved'].includes(d.status) && d.deadline &&
    new Date().toISOString().slice(0, 10) > new Date(Date.parse(d.deadline) + LATE_GRACE_DAYS * 864e5).toISOString().slice(0, 10);

  function loadDeal(id, user) {
    const d = q('SELECT * FROM deals WHERE id = ?').get(Number(id));
    if (!d || (d.business_id !== user.id && d.creator_id !== user.id)) fail(404, 'Deal not found');
    return d;
  }

  function dealOut(id, user) {
    const d = loadDeal(id, user);
    d.business = q(`SELECT b.user_id AS id, b.company, b.industry, b.website, u.name AS contact FROM businesses b JOIN users u ON u.id = b.user_id WHERE b.user_id = ?`).get(d.business_id);
    d.creator = q(`SELECT c.user_id AS id, c.handle, c.avatar_color, u.name FROM creators c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?`).get(d.creator_id);
    d.package = d.package_id ? q('SELECT * FROM packages WHERE id = ?').get(d.package_id) : null;
    d.offers = q('SELECT * FROM offers WHERE deal_id = ? ORDER BY id').all(d.id);
    d.messages = q(`SELECT m.*, u.name FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.deal_id = ? ORDER BY m.id`).all(d.id);
    d.results = q('SELECT * FROM results WHERE deal_id = ?').get(d.id) ?? null;
    d.reviews = q('SELECT * FROM reviews WHERE deal_id = ?').all(d.id);
    d.transactions = q('SELECT * FROM transactions WHERE deal_id = ? ORDER BY id').all(d.id);
    d.checklist = parseJson(d.checklist, []);
    d.my_side = d.business_id === user.id ? 'business' : 'creator';
    d.escrow = escrowOf(d.id);
    const total = (d.price_cents ?? 0) + (d.bonus_cents ?? 0);
    d.fees = { buyer_fee_cents: Math.round(total * BUYER_FEE), seller_fee_cents: Math.round((d.price_cents ?? 0) * SELLER_FEE), fund_total_cents: total + Math.round(total * BUYER_FEE) };
    d.demo_switch = DEMO_MODE && [d.business_id, d.creator_id].every((uid) => isDemoEmail(q('SELECT email FROM users WHERE id = ?').get(uid).email));
    d.policy = { draft_release_pct: DRAFT_RELEASE * 100, draft_review_days: DRAFT_REVIEW_DAYS, final_review_days: FINAL_REVIEW_DAYS, late_grace_days: LATE_GRACE_DAYS, bonus_window_days: BONUS_WINDOW_DAYS };
    d.overdue = isOverdue(d);
    const due = (ts, days) => (ts ? new Date(Date.parse(`${ts.replace(' ', 'T')}Z`) + days * 864e5).toISOString() : null);
    d.review_due_at = d.status === 'draft_submitted' ? due(d.draft_submitted_at, DRAFT_REVIEW_DAYS) : d.status === 'delivered' ? due(d.delivered_at, FINAL_REVIEW_DAYS) : null;

    // Step data: offer breakdowns, contract, payment, review, feedback, post kit.
    d.offers = d.offers.map((o) => ({ ...o, items: parseJson(o.items, null), terms: o.terms ? parsedTerms(o) : null, breakdown: breakdownOf(o) }));
    d.items = parsedItems(d);
    d.terms = parsedTerms(d);
    d.term_labels = termLabels(d.terms).map((o) => o.label);
    d.breakdown = d.price_cents ? breakdownOf(d) : null;
    d.contract_sections = d.contract_text ? contractSections(d) : null;
    if (d.price_cents) {
      const draftGross = Math.round(d.price_cents * DRAFT_RELEASE);
      const net = (g) => g - Math.round(g * SELLER_FEE);
      d.payment = {
        breakdown: d.breakdown, bonus_cents: d.bonus_cents, service_fee_cents: d.fees.buyer_fee_cents, total_due_cents: d.fees.fund_total_cents,
        method: d.payment_method, methods: Object.entries(PAYMENT_METHODS).map(([key, label]) => ({ key, label })),
        schedule: [
          { milestone: 'Draft approved', pct: DRAFT_RELEASE * 100, gross_cents: draftGross, fee_cents: draftGross - net(draftGross), creator_net_cents: net(draftGross) },
          { milestone: 'Live post approved', pct: 100 - DRAFT_RELEASE * 100, gross_cents: d.price_cents - draftGross, fee_cents: d.price_cents - draftGross - net(d.price_cents - draftGross), creator_net_cents: net(d.price_cents - draftGross) },
          ...(d.bonus_cents ? [{ milestone: 'Bonus target met', pct: null, gross_cents: d.bonus_cents, fee_cents: d.bonus_cents - net(d.bonus_cents), creator_net_cents: net(d.bonus_cents), conditional: true }] : []),
        ],
      };
    }
    d.feedback = q(`SELECT f.*, u.name FROM feedback f JOIN users u ON u.id = f.user_id WHERE f.deal_id = ? ORDER BY f.round DESC, f.id`).all(d.id);
    d.review = parseJson(d.review, null);
    d.ai_review = parseJson(d.ai_review, null);
    d.ai_enabled = aiEnabled();
    d.brand_verified = parseJson(d.brand_verified, null) ?? [];
    if (['draft_approved', 'delivered', 'completed'].includes(d.status)) {
      const ctx = reviewContext(d);
      const posts = analyzePosts(postsOf(d.creator_id));
      const best = posts.by_weekday.filter((g) => g.n >= 2)[0];
      const platform = (d.items ?? [])[0]?.platform ?? 'instagram';
      d.post_kit = {
        caption: d.review?.suggested_caption ?? '',
        draft_caption: d.draft_caption ?? '',
        hashtags: d.review?.suggested_hashtags ?? suggestHashtags({ ...ctx, platform }),
        trending: ctx.trends.slice(0, 3).map((t) => ({ name: t.name, platform: t.platform, how_to: t.how_to })),
        best_day: best ? { day: best.key, avg_er: best.avg_er, n: best.n } : null,
        tips: [
          'Post when your audience is most active, and reply to comments in the first hour.',
          `Pin a comment with code ${d.promo_code}.`,
          ...(d.terms.link_in_bio_days ? [`Add the brand link to your bio for ${d.terms.link_in_bio_days} days.`] : []),
          'Turn on the platform’s paid-partnership label as well as #ad.',
        ],
      };
    }
    return d;
  }

  // Live pricing for the offer builder: fills suggested unit prices from the creator's rates.
  app.post('/api/quote', (req, res) => {
    need(req.body, ['creator_id', 'items']);
    const creator = q('SELECT user_id FROM creators WHERE user_id = ?').get(Number(req.body.creator_id));
    if (!creator) fail(404, 'Creator not found');
    const items = (Array.isArray(req.body.items) ? req.body.items : []).map((i) => {
      const r = rateFor(creator.user_id, i.format === 'ugc' ? 'instagram' : i.platform, i.format);
      const suggested = suggestUnit(r.suggestion.suggested_cents, Number(i.duration_s) || null);
      return { ...i, suggested_unit_cents: suggested, unit_price: i.unit_price ?? suggested / 100 };
    });
    try {
      const terms = normalizeTerms(req.body.terms);
      res.json({ items: items.map(({ suggested_unit_cents }) => ({ suggested_unit_cents })), breakdown: quote(normalizeItems(items), terms) });
    } catch (e) {
      if (e instanceof InputError) fail(400, e.message);
      throw e;
    }
  });

  app.post('/api/deals', auth('business'), (req, res) => {
    const b = req.body;
    need(b, ['creator_id']);
    const creator = q('SELECT * FROM creators WHERE user_id = ?').get(Number(b.creator_id));
    if (!creator) fail(404, 'Creator not found');
    const pkg = b.package_id ? q('SELECT * FROM packages WHERE id = ? AND creator_id = ? AND active = 1').get(Number(b.package_id), creator.user_id) : null;
    if (b.package_id && !pkg) fail(404, 'Package not found');
    const offer = offerFields({
      ...b,
      price: b.price ?? (pkg ? pkg.price_cents / 100 : undefined),
      deliverables: b.deliverables ?? (pkg ? `${pkg.quantity}× ${pkg.platform} ${pkg.deliverable_type}: ${pkg.title}` : undefined),
    });
    const id = tx(db, () => {
      const { lastInsertRowid } = q('INSERT INTO deals (business_id, creator_id, package_id, title) VALUES (?, ?, ?, ?)')
        .run(req.user.id, creator.user_id, pkg?.id ?? null, String(b.title || pkg?.title || 'Custom collaboration'));
      addOffer(lastInsertRowid, req.user.id, offer);
      return lastInsertRowid;
    });
    res.status(201).json(dealOut(id, req.user));
  });

  app.get('/api/deals', auth(), (req, res) => {
    sweepEscrow();
    const col = req.user.role === 'business' ? 'business_id' : 'creator_id';
    res.json(q(`SELECT d.id, d.title, d.status, d.price_cents, d.bonus_cents, d.deadline, d.updated_at, d.campaign_id,
        b.company, u.name AS creator_name, c.handle, c.avatar_color,
        o.price_cents AS latest_offer_cents, o.from_user_id AS latest_offer_from, o.status AS latest_offer_status,
        (SELECT COALESCE(SUM(CASE WHEN t.type IN ('escrow_fund','bonus_fund') THEN t.amount_cents
                                  WHEN t.type IN ('payout','seller_fee','refund') THEN -t.amount_cents ELSE 0 END), 0)
           FROM transactions t WHERE t.deal_id = d.id) AS held_cents
      FROM deals d JOIN businesses b ON b.user_id = d.business_id
      JOIN creators c ON c.user_id = d.creator_id JOIN users u ON u.id = d.creator_id
      LEFT JOIN offers o ON o.id = (SELECT id FROM offers WHERE deal_id = d.id ORDER BY id DESC LIMIT 1)
      WHERE d.${col} = ? ORDER BY d.updated_at DESC, d.id DESC`).all(req.user.id));
  });

  app.get('/api/deals/:id', auth(), (req, res) => {
    sweepEscrow();
    res.json(dealOut(req.params.id, req.user));
  });

  app.post('/api/deals/:id/offers', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'negotiating') fail(409, 'Negotiation is closed on this deal');
    addOffer(d.id, req.user.id, offerFields(req.body));
    res.status(201).json(dealOut(d.id, req.user));
  });

  function pendingOfferFor(d, user, offerId) {
    if (d.status !== 'negotiating') fail(409, 'Negotiation is closed on this deal');
    const o = q("SELECT * FROM offers WHERE id = ? AND deal_id = ? AND status = 'pending'").get(Number(offerId), d.id);
    if (!o) fail(404, 'No pending offer with that id');
    if (o.from_user_id === user.id) fail(403, "You can't respond to your own offer");
    return o;
  }

  const asJson = (v, fallback) => (v && typeof v === 'object' ? v : parseJson(v, fallback));
  const parsedItems = (d) => asJson(d.items, null);
  const parsedTerms = (d) => ({ ...DEFAULT_TERMS, ...asJson(d.terms, {}) });

  // Price breakdown for a deal or offer; simple offers become one line.
  function breakdownOf(d) {
    const items = parsedItems(d);
    if (items) return quote(items, parsedTerms(d));
    const p = d.price_cents ?? 0;
    return { lines: [{ label: d.deliverables ?? 'Deliverables', quantity: 1, unit_cents: p, total_cents: p }], subtotal_cents: p, addons: [], total_cents: p };
  }

  const checklistFor = (d) => {
    const t = parsedTerms(d);
    const live = t.stays_live_days ? `at least ${t.stays_live_days} days` : 'permanently';
    return [
      `Deliverables match the contract: ${d.deliverables}`,
      `Promo code ${d.promo_code} appears in the caption or on screen`,
      'Sponsorship is disclosed (#ad or the platform’s paid-partnership label)',
      `Content went live on or before ${d.deadline}`,
      `Content stays live ${live}`,
      ...(t.link_in_bio_days ? [`Link in bio for ${t.link_in_bio_days} days`] : []),
    ].map((text) => ({ text, confirmed: false }));
  };

  app.post('/api/deals/:id/offers/:offerId/accept', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    const o = pendingOfferFor(d, req.user, req.params.offerId);
    tx(db, () => {
      q("UPDATE offers SET status = 'accepted' WHERE id = ?").run(o.id);
      const handle = q('SELECT handle FROM creators WHERE user_id = ?').get(d.creator_id).handle;
      const promo = `${handle.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}${crypto.randomInt(10, 99)}`;
      const agreed = { ...d, price_cents: o.price_cents, deliverables: o.deliverables, deadline: o.deadline, promo_code: promo,
        bonus_cents: o.bonus_cents, bonus_metric: o.bonus_metric, bonus_target: o.bonus_target, items: o.items, terms: o.terms };
      q(`UPDATE deals SET status = 'contract', price_cents = ?, deliverables = ?, deadline = ?, promo_code = ?, contract_text = ?, checklist = ?,
          bonus_cents = ?, bonus_metric = ?, bonus_target = ?, items = ?, terms = ? WHERE id = ?`)
        .run(o.price_cents, o.deliverables, o.deadline, promo, contractText(agreed), JSON.stringify(checklistFor(agreed)),
          o.bonus_cents, o.bonus_metric, o.bonus_target, o.items, o.terms, d.id);
      sysMsg(d.id, `${req.user.name} accepted the offer of ${usd(o.price_cents)}${o.bonus_cents ? ` + ${usd(o.bonus_cents)} performance bonus` : ''}. Contract generated, waiting on both signatures.`, 'Offer accepted', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/offers/:offerId/decline', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    const o = pendingOfferFor(d, req.user, req.params.offerId);
    tx(db, () => {
      q("UPDATE offers SET status = 'declined' WHERE id = ?").run(o.id);
      setStatus(d.id, 'declined');
      sysMsg(d.id, `${req.user.name} declined the offer.${req.body?.note ? ` Reason: ${req.body.note}` : ''}`, 'Offer declined', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  const bonusText = (d) => {
    const target = d.bonus_metric === 'revenue' ? usd(d.bonus_target) : Number(d.bonus_target).toLocaleString('en-US');
    return `${usd(d.bonus_cents)} if the content reaches ${target} ${d.bonus_metric === 'revenue' ? 'in tracked revenue' : d.bonus_metric}`;
  };

  const USAGE_TEXT = {
    organic_90: 'The Brand may reshare the content on its own organic social channels for 90 days. Paid ads use is not included.',
    organic_365: 'The Brand may reshare the content on its own organic social channels for 1 year. Paid ads use is not included.',
    paid_30: 'The Brand may use the content organically and in paid advertising for 30 days from posting.',
    paid_90: 'The Brand may use the content organically and in paid advertising for 90 days from posting.',
    perpetual: 'The Brand may use the content organically and in paid advertising, in any medium, with no time limit.',
  };

  // The contract as titled sections, built from the agreed deliverables and terms.
  function contractSections(d) {
    const biz = q('SELECT company FROM businesses WHERE user_id = ?').get(d.business_id).company;
    const cr = q('SELECT u.name, c.handle FROM creators c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?').get(d.creator_id);
    const t = parsedTerms(d);
    const b = breakdownOf(d);
    const draftPay = Math.round(d.price_cents * DRAFT_RELEASE);
    const s = [
      { title: 'Parties', body: `This agreement (Deal #${d.id}) is between ${biz} (the “Brand”) and ${cr.name}, @${cr.handle} (the “Creator”), made through Collabo.` },
      { title: 'Deliverables', body: 'The Creator will produce and publish the deliverables in Schedule A.', schedule: b.lines.map((l) => [l.label + (l.notes ? `: ${l.notes}` : ''), usd(l.total_cents)]) },
      { title: 'Deadline', body: `All deliverables go live on or before ${d.deadline}. If nothing is live ${LATE_GRACE_DAYS} days after that date, the Brand may cancel and reclaim all funds still in escrow.` },
      { title: 'Fee and escrow', body: `The fee is ${usd(d.price_cents)}${b.addons.length ? `, including add-ons for ${b.addons.map((a) => a.label.toLowerCase()).join(', ')}` : ''}. The Brand deposits it${d.bonus_cents ? ' and the performance bonus' : ''} into Collabo escrow before work starts, plus a ${BUYER_FEE * 100}% service fee. Collabo keeps ${SELLER_FEE * 100}% of each release to the Creator. Neither party can withdraw escrowed funds on its own.`,
        schedule: [[`On draft approval (${DRAFT_RELEASE * 100}%)`, usd(draftPay)], [`On live-post approval (${100 - DRAFT_RELEASE * 100}%)`, usd(d.price_cents - draftPay)], ...(d.bonus_cents ? [['Performance bonus, if the target is met', usd(d.bonus_cents)]] : [])] },
      { title: 'Drafts and revisions', body: `The Creator submits a draft before publishing. The Brand approves it or requests changes within ${DRAFT_REVIEW_DAYS} days; silence counts as approval. The fee includes ${t.revisions} revision round${t.revisions > 1 ? 's' : ''}. Further rounds need the Creator’s agreement.` },
      { title: 'Publishing and approval', body: `After publishing, the Creator submits the live link and confirms the delivery checklist. The Brand approves or requests a fix within ${FINAL_REVIEW_DAYS} days; silence counts as approval. The content stays live ${t.stays_live_days ? `for at least ${t.stays_live_days} days` : 'permanently'}${t.link_in_bio_days ? `, and the Creator keeps the Brand’s link in their bio for ${t.link_in_bio_days} days` : ''}.` },
      { title: 'Usage rights', body: `${USAGE_TEXT[t.usage_rights]}${t.whitelisting ? ' The Creator authorises the Brand to run ads from the Creator’s handle (whitelisting) for the same period.' : ''}${t.raw_footage ? ' The Creator delivers the raw, unedited footage within 7 days of approval.' : ''} The Creator keeps ownership of the content.` },
      { title: 'Exclusivity', body: t.exclusivity_days ? `For ${t.exclusivity_days} days after publishing, the Creator will not publish sponsored content for a direct competitor of the Brand in the same product category.` : 'None. The Creator may work with other brands, including competitors.' },
      ...(d.bonus_cents ? [{ title: 'Performance bonus', body: `${bonusText(d)}. Views are reported by the Creator; conversions and revenue by the Brand from promo-code ${d.promo_code} sales. If the target is not met within ${BONUS_WINDOW_DAYS} days of completion, the bonus is refunded to the Brand.` }] : []),
      { title: 'Disclosure and claims', body: 'The Creator labels the content as sponsored (#ad or the platform’s paid-partnership label), following FTC guidelines and platform rules. Neither party will make health, earnings or guarantee claims they cannot substantiate.' },
      { title: 'Tracking', body: `The Creator includes promo code ${d.promo_code} so sales can be credited to this deal.` },
      { title: 'Disputes and cancellation', body: 'Either party may cancel before the escrow is funded. After funding, either party may open a dispute, which freezes the escrow until both agree a split or Collabo mediation decides one.' },
      ...(t.custom ? [{ title: 'Additional terms', body: t.custom }] : []),
    ];
    return s.map((x, i) => ({ ...x, n: i + 1 }));
  }

  function contractText(d) {
    return [`INFLUENCER SERVICES AGREEMENT: Deal #${d.id}`, '', ...contractSections(d).flatMap((x) => [
      `${x.n}. ${x.title}. ${x.body}`, ...(x.schedule ?? []).map(([a, b]) => `   - ${a}: ${b}`),
    ])].join('\n');
  }

  app.post('/api/deals/:id/sign', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'contract') fail(409, 'There is no contract waiting for signatures');
    const side = req.user.role === 'business' ? 'business' : 'creator';
    if (d[`${side}_signed_at`]) fail(409, 'You already signed');
    const name = String(req.body?.name ?? req.user.name).trim();
    if (name.length < 2) fail(400, 'Type your full name to sign');
    tx(db, () => {
      q(`UPDATE deals SET ${side}_signed_at = datetime('now'), ${side}_signed_name = ? WHERE id = ?`).run(name, d.id);
      const after = q('SELECT * FROM deals WHERE id = ?').get(d.id);
      sysMsg(d.id, `${name} signed the contract.`, 'Contract signed', req.user.id);
      if (after.business_signed_at && after.creator_signed_at) {
        setStatus(d.id, 'awaiting_funding');
        sysMsg(d.id, 'Contract fully signed. The brand can now fund escrow.', 'Contract fully signed', null);
      }
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  // Payments are simulated: the ledger records what a processor such as
  // Stripe Connect (separate charges and transfers) would settle.
  const PAYMENT_METHODS = { card: 'Card', bank: 'Bank transfer (ACH)' };

  app.post('/api/deals/:id/fund', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'awaiting_funding') fail(409, 'Deal is not ready for funding');
    const method = req.body?.method ?? 'card';
    if (!PAYMENT_METHODS[method]) fail(400, 'method must be card or bank');
    tx(db, () => {
      ledger(d.id, 'escrow_fund', d.price_cents);
      ledger(d.id, 'bonus_fund', d.bonus_cents, 'bonus');
      ledger(d.id, 'buyer_fee', Math.round((d.price_cents + d.bonus_cents) * BUYER_FEE));
      setStatus(d.id, 'in_progress', `, funded_at = datetime('now'), payment_method = '${method}', bonus_status = '${d.bonus_cents ? 'held' : 'none'}'`);
      sysMsg(d.id, `Escrow funded by ${PAYMENT_METHODS[method].toLowerCase()}: ${usd(d.price_cents + d.bonus_cents)} is secured${d.bonus_cents ? ` (including a ${usd(d.bonus_cents)} performance bonus)` : ''}. The creator can start. Submit a draft for approval before posting.`, 'Escrow funded', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  // Context the content review needs: brand, creator niches, trends on their platforms.
  function reviewContext(d) {
    const company = q('SELECT company FROM businesses WHERE user_id = ?').get(d.business_id).company;
    const niches = parseJson(q('SELECT niches FROM creators WHERE user_id = ?').get(d.creator_id).niches, []);
    const platform = (parsedItems(d) ?? [])[0]?.platform;
    const trends = trendsFor(d.creator_id, platform && platform !== 'any' ? { platform } : {})
      .filter((t) => ['rising', 'peaking'].includes(t.momentum) && (!t.niches.length || t.niches.some((n) => niches.includes(n))));
    return { company, niches, trends, deal: { ...d, items: parsedItems(d), terms: parsedTerms(d) } };
  }

  const textFields = (b) => ({
    caption: String(b.caption || '').slice(0, 4000), hashtags: String(b.hashtags || '').slice(0, 1000),
    script: String(b.script || '').slice(0, 6000), duration_s: b.duration_s ? Math.max(1, Math.round(Number(b.duration_s))) : null,
  });

  // Live check while writing a draft or the final caption; nothing is saved.
  app.post('/api/deals/:id/check', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    res.json(reviewContent({ ...reviewContext(d), ...textFields(req.body ?? {}) }));
  });

  app.post('/api/deals/:id/draft', auth('creator'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'in_progress') fail(409, 'Drafts can be submitted once escrow is funded');
    need(req.body, ['url']);
    const f = textFields(req.body);
    const review = reviewContent({ ...reviewContext(d), ...f });
    tx(db, () => {
      q(`UPDATE deals SET status = 'draft_submitted', draft_url = ?, draft_note = ?, draft_caption = ?, draft_hashtags = ?, draft_script = ?,
          draft_duration_s = ?, draft_round = draft_round + 1, review = ?, ai_review = NULL, draft_submitted_at = datetime('now') WHERE id = ?`)
        .run(String(req.body.url), String(req.body.note || ''), f.caption, f.hashtags, f.script, f.duration_s, JSON.stringify(review), d.id);
      q('UPDATE feedback SET resolved = 1 WHERE deal_id = ? AND resolved = 0').run(d.id);
      sysMsg(d.id, `${req.user.name} submitted draft ${d.draft_round + 1} for review (Collabo check: ${review.score}/100). The brand has ${DRAFT_REVIEW_DAYS} days to respond.`, 'Draft submitted for review', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  // Ask Claude for written feedback on the current draft (when configured).
  app.post('/api/deals/:id/ai-review', auth(), async (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (!d.draft_url) fail(409, 'There is no draft to review yet');
    if (!aiEnabled()) fail(503, 'AI review is not configured on this server (set ANTHROPIC_API_KEY)');
    const ctx = reviewContext(d);
    const f = { caption: d.draft_caption ?? '', hashtags: d.draft_hashtags ?? '', script: d.draft_script ?? '', duration_s: d.draft_duration_s };
    const ai = await aiReview({ ...ctx, ...f, ruleReview: parseJson(d.review, null) ?? reviewContent({ ...ctx, ...f }) });
    if (!ai) fail(502, 'The AI review could not be completed. The automated checks above still apply.');
    q('UPDATE deals SET ai_review = ? WHERE id = ?').run(JSON.stringify(ai), d.id);
    res.json(dealOut(d.id, req.user));
  });

  const FEEDBACK_CATEGORIES = ['hook', 'branding', 'messaging', 'visuals', 'audio', 'caption', 'compliance', 'general'];

  app.post('/api/deals/:id/feedback', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (!['draft_submitted', 'delivered'].includes(d.status)) fail(409, 'Feedback opens when there is a draft or live post to review');
    need(req.body, ['body']);
    const category = FEEDBACK_CATEGORIES.includes(req.body.category) ? req.body.category : 'general';
    const at = req.body.at_seconds === '' || req.body.at_seconds == null ? null : Math.max(0, Math.round(Number(req.body.at_seconds)));
    q('INSERT INTO feedback (deal_id, user_id, round, category, at_seconds, body) VALUES (?, ?, ?, ?, ?, ?)')
      .run(d.id, req.user.id, Math.max(1, d.draft_round), category, Number.isFinite(at) ? at : null, String(req.body.body).slice(0, 2000));
    touch(d.id);
    res.status(201).json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/feedback/:fid/resolve', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    const r = q('UPDATE feedback SET resolved = 1 - resolved WHERE id = ? AND deal_id = ?').run(Number(req.params.fid), d.id);
    if (!r.changes) fail(404, 'Feedback not found');
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/draft/approve', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'draft_submitted') fail(409, 'There is no draft waiting for review');
    tx(db, () => approveDraft(d, req.user.name));
    res.json(dealOut(d.id, req.user));
  });

  const openFeedback = (dealId) => q("SELECT * FROM feedback WHERE deal_id = ? AND resolved = 0 ORDER BY id").all(dealId);
  const feedbackSummary = (rows) => rows.map((f) => `• [${f.category}${f.at_seconds != null ? ` @ ${Math.floor(f.at_seconds / 60)}:${String(f.at_seconds % 60).padStart(2, '0')}` : ''}] ${f.body}`).join('\n');

  app.post('/api/deals/:id/draft/request-changes', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'draft_submitted') fail(409, 'There is no draft waiting for review');
    const open = openFeedback(d.id);
    const note = String(req.body?.note || '').trim();
    if (!note && !open.length) fail(400, 'Add feedback or a note describing the changes');
    const used = q("SELECT COUNT(*) AS n FROM messages WHERE deal_id = ? AND system = 1 AND body LIKE 'Changes requested on draft%'").get(d.id).n;
    const included = parsedTerms(d).revisions;
    tx(db, () => {
      setStatus(d.id, 'in_progress');
      sysMsg(d.id, `Changes requested on draft ${d.draft_round} (revision ${used + 1} of ${included} included):${note ? ` ${note}` : ''}${open.length ? `\n${feedbackSummary(open)}` : ''}`, 'Changes requested', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/deliver', auth('creator'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'draft_approved') fail(409, 'Get the draft approved before posting');
    need(req.body, ['url']);
    const list = parseJson(d.checklist, []);
    const confirmed = Array.isArray(req.body.checklist) ? req.body.checklist : [];
    if (list.length && (confirmed.length !== list.length || !confirmed.every(Boolean))) fail(400, 'Confirm every item on the delivery checklist');
    tx(db, () => {
      q(`UPDATE deals SET status = 'delivered', delivered_at = datetime('now'), delivery_url = ?, delivery_note = ?, checklist = ?,
          post_caption = ?, post_hashtags = ?, brand_verified = NULL WHERE id = ?`)
        .run(String(req.body.url), String(req.body.note || ''), JSON.stringify(list.map((i) => ({ ...i, confirmed: true }))),
          String(req.body.caption || '').slice(0, 4000), String(req.body.hashtags || '').slice(0, 1000), d.id);
      sysMsg(d.id, `${req.user.name} posted the content and confirmed the delivery checklist. The brand has ${FINAL_REVIEW_DAYS} days to approve.`, 'Live post submitted', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  // The brand ticks off what it has checked on the live post.
  app.post('/api/deals/:id/verify', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'delivered') fail(409, 'Nothing has been delivered yet');
    const n = parseJson(d.checklist, []).length;
    const v = Array.isArray(req.body?.verified) ? req.body.verified.slice(0, n).map(Boolean) : [];
    q('UPDATE deals SET brand_verified = ? WHERE id = ?').run(JSON.stringify(v), d.id);
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/request-revision', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'delivered') fail(409, 'Nothing has been delivered yet');
    need(req.body, ['note']);
    tx(db, () => {
      setStatus(d.id, 'draft_approved');
      sysMsg(d.id, `Fix requested on the live content: ${req.body.note}`, 'Fix requested on the live post', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/approve', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'delivered') fail(409, 'Nothing has been delivered yet');
    tx(db, () => completeDeal(d, req.user.name));
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/refund-overdue', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (!isOverdue(d)) fail(409, `Refunds open ${LATE_GRACE_DAYS} days after a missed deadline`);
    tx(db, () => {
      const e = escrowOf(d.id);
      refund(d.id, e.held_fee_cents, 'late');
      refund(d.id, e.held_bonus_cents, 'bonus');
      setStatus(d.id, 'refunded', `, refunded_at = datetime('now'), bonus_status = CASE WHEN bonus_status = 'held' THEN 'refunded' ELSE bonus_status END`);
      sysMsg(d.id, `The deadline was missed by more than ${LATE_GRACE_DAYS} days. ${usd(e.held_cents)} was refunded to the brand from escrow.`, 'Refunded: deadline missed', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  // ---- disputes: freeze escrow until both sides (or mediation) agree a split ----
  const DISPUTABLE = ['in_progress', 'draft_submitted', 'draft_approved', 'delivered'];
  const pct = (v) => {
    const n = Math.round(Number(v));
    if (!(n >= 0 && n <= 100)) fail(400, 'creator_pct must be 0–100');
    return n;
  };

  function resolveDispute(d, creatorPct, by) {
    const e = escrowOf(d.id);
    const toCreator = Math.round(e.held_cents * creatorPct / 100);
    const net = release(d.id, toCreator, 'dispute');
    refund(d.id, e.held_cents - toCreator, 'dispute');
    setStatus(d.id, 'resolved', `, resolved_at = datetime('now'), bonus_status = CASE WHEN bonus_status = 'held' THEN 'resolved' ELSE bonus_status END`);
    sysMsg(d.id, `Dispute resolved ${by}: ${creatorPct}% of the ${usd(e.held_cents)} in escrow goes to the creator (${usd(net)} after fees) and ${usd(e.held_cents - toCreator)} is refunded to the brand.`, 'Dispute resolved', null);
    touch(d.id);
  }

  app.post('/api/deals/:id/dispute', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (!DISPUTABLE.includes(d.status)) fail(409, 'Disputes can be opened while funds are in escrow');
    need(req.body, ['reason']);
    const p = pct(req.body.creator_pct ?? 50);
    tx(db, () => {
      q(`UPDATE deals SET status = 'disputed', dispute_prev_status = ?, dispute_by = ?, dispute_reason = ?, dispute_creator_pct = ?, disputed_at = datetime('now') WHERE id = ?`)
        .run(d.status, req.user.id, String(req.body.reason), p, d.id);
      sysMsg(d.id, `${req.user.name} opened a dispute. Escrow is frozen. Reason: ${req.body.reason}. Proposed split: ${p}% to the creator.`, 'Dispute opened', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/dispute/counter', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'disputed') fail(409, 'No open dispute');
    if (d.dispute_by === req.user.id) fail(403, 'Wait for the other party to respond to your proposal');
    const p = pct(req.body.creator_pct);
    tx(db, () => {
      q('UPDATE deals SET dispute_by = ?, dispute_creator_pct = ? WHERE id = ?').run(req.user.id, p, d.id);
      sysMsg(d.id, `${req.user.name} proposed a different split: ${p}% to the creator.${req.body.note ? ` ${req.body.note}` : ''}`, 'New dispute proposal', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/dispute/accept', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'disputed') fail(409, 'No open dispute');
    if (d.dispute_by === req.user.id) fail(403, "You can't accept your own proposal");
    tx(db, () => resolveDispute(d, d.dispute_creator_pct, 'by agreement'));
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/dispute/withdraw', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'disputed') fail(409, 'No open dispute');
    tx(db, () => {
      setStatus(d.id, d.dispute_prev_status, ', dispute_by = NULL, dispute_creator_pct = NULL');
      sysMsg(d.id, `${req.user.name} withdrew from the dispute. The deal continues.`, 'Dispute withdrawn', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  // Platform mediation. Disabled unless ADMIN_TOKEN is set.
  app.post('/api/admin/deals/:id/resolve', (req, res) => {
    const token = process.env.ADMIN_TOKEN;
    const given = String(req.headers['x-admin-token'] || '');
    if (!token || given.length !== token.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token))) fail(404, 'Not found');
    const d = q('SELECT * FROM deals WHERE id = ?').get(Number(req.params.id));
    if (!d || d.status !== 'disputed') fail(409, 'No open dispute');
    tx(db, () => resolveDispute(d, pct(req.body.creator_pct), 'by platform mediation'));
    res.json({ ok: true });
  });

  app.post('/api/deals/:id/cancel', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (!['negotiating', 'contract', 'awaiting_funding'].includes(d.status)) fail(409, 'Funded deals end through delivery, a late-delivery refund or a dispute');
    tx(db, () => {
      q("UPDATE offers SET status = 'declined' WHERE deal_id = ? AND status = 'pending'").run(d.id);
      setStatus(d.id, 'cancelled');
      sysMsg(d.id, `${req.user.name} cancelled the deal.`, 'Deal cancelled', req.user.id);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/messages', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    need(req.body, ['body']);
    const body = String(req.body.body).slice(0, 4000);
    q('INSERT INTO messages (deal_id, user_id, body) VALUES (?, ?, ?)').run(d.id, req.user.id, body);
    notify(db, req.user.id === d.business_id ? d.creator_id : d.business_id, { dealId: d.id, kind: 'message', title: `Message from ${req.user.name}: ${d.title}`, body: body.slice(0, 280) });
    touch(d.id);
    res.status(201).json(dealOut(d.id, req.user));
  });

  // Each side reports only the numbers it owns: creators their reach, brands their sales.
  app.put('/api/deals/:id/results', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (!['delivered', 'completed'].includes(d.status)) fail(409, 'Results can be reported after delivery');
    const cur = q('SELECT * FROM results WHERE deal_id = ?').get(d.id) ?? { impressions: 0, clicks: 0, conversions: 0, revenue_cents: 0 };
    const n = (k, fallback) => (req.body[k] === undefined || req.body[k] === '' ? fallback : Math.max(0, Math.round(Number(req.body[k]) || 0)));
    const isBiz = req.user.role === 'business';
    const next = {
      impressions: isBiz ? cur.impressions : n('impressions', cur.impressions),
      clicks: isBiz ? n('clicks', cur.clicks) : cur.clicks,
      conversions: isBiz ? n('conversions', cur.conversions) : cur.conversions,
      revenue_cents: isBiz && req.body.revenue !== undefined && req.body.revenue !== '' ? Math.max(0, Math.round(Number(req.body.revenue) * 100) || 0) : cur.revenue_cents,
    };
    tx(db, () => {
      q(`INSERT INTO results (deal_id, impressions, clicks, conversions, revenue_cents) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (deal_id) DO UPDATE SET impressions = excluded.impressions, clicks = excluded.clicks,
         conversions = excluded.conversions, revenue_cents = excluded.revenue_cents, reported_at = datetime('now')`)
        .run(d.id, next.impressions, next.clicks, next.conversions, next.revenue_cents);
      settleBonus(q('SELECT * FROM deals WHERE id = ?').get(d.id));
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/review', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (!['completed', 'resolved'].includes(d.status)) fail(409, 'Reviews open once the deal is completed');
    const rating = Math.round(Number(req.body.rating));
    if (!(rating >= 1 && rating <= 5)) fail(400, 'rating must be 1–5');
    if (q('SELECT 1 FROM reviews WHERE deal_id = ? AND reviewer_id = ?').get(d.id, req.user.id)) fail(409, 'You already reviewed this deal');
    const reviewee = req.user.id === d.business_id ? d.creator_id : d.business_id;
    q('INSERT INTO reviews (deal_id, reviewer_id, reviewee_id, rating, body) VALUES (?, ?, ?, ?, ?)').run(d.id, req.user.id, reviewee, rating, String(req.body.body || ''));
    res.status(201).json(dealOut(d.id, req.user));
  });


  // ---------- account: notifications, preferences, export, deletion ----------
  app.get('/api/notifications', auth(), (req, res) => {
    const items = q('SELECT id, deal_id, kind, title, body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
    res.json({ unread: q('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n, items });
  });

  app.post('/api/notifications/read', auth(), (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : null;
    if (ids?.length) q(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`).run(req.user.id, ...ids);
    else q("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(req.user.id);
    res.json({ unread: q('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(req.user.id).n });
  });

  app.put('/api/me/preferences', auth(), (req, res) => {
    if (typeof req.body?.email_notifications === 'boolean') q('UPDATE users SET email_notifications = ? WHERE id = ?').run(req.body.email_notifications ? 1 : 0, req.user.id);
    res.json(me(req.user.id));
  });

  // Everything Collabo holds about the signed-in user, as one JSON file.
  app.get('/api/me/export', auth(), (req, res) => {
    const id = req.user.id;
    const deals = q('SELECT * FROM deals WHERE business_id = ? OR creator_id = ?').all(id, id).map((d) => ({
      ...d,
      offers: q('SELECT * FROM offers WHERE deal_id = ?').all(d.id),
      messages: q('SELECT id, user_id, body, system, created_at FROM messages WHERE deal_id = ?').all(d.id),
      feedback: q('SELECT * FROM feedback WHERE deal_id = ?').all(d.id),
      results: q('SELECT * FROM results WHERE deal_id = ?').get(d.id) ?? null,
      transactions: q('SELECT * FROM transactions WHERE deal_id = ?').all(d.id),
    }));
    const conn = q('SELECT username, account_type, status, connected_at, last_synced_at, scopes FROM ig_connections WHERE creator_id = ?').get(id);
    const data = {
      exported_at: new Date().toISOString(),
      account: q('SELECT id, role, email, name, terms_accepted_at, email_notifications, created_at FROM users WHERE id = ?').get(id),
      creator_profile: q('SELECT * FROM creators WHERE user_id = ?').get(id) ?? null,
      business_profile: q('SELECT * FROM businesses WHERE user_id = ?').get(id) ?? null,
      social_accounts: q('SELECT * FROM socials WHERE creator_id = ?').all(id),
      instagram_connection: conn ?? null, // the access token is never exported
      packages: q('SELECT * FROM packages WHERE creator_id = ?').all(id),
      content_log: q('SELECT * FROM posts WHERE creator_id = ?').all(id),
      synced_media: q('SELECT * FROM media WHERE creator_id = ?').all(id),
      metric_history: q('SELECT * FROM metric_snapshots WHERE creator_id = ?').all(id),
      campaigns: q('SELECT * FROM campaigns WHERE business_id = ?').all(id),
      deals,
      reviews_written: q('SELECT * FROM reviews WHERE reviewer_id = ?').all(id),
      reviews_received: q('SELECT * FROM reviews WHERE reviewee_id = ?').all(id),
      notifications: q('SELECT * FROM notifications WHERE user_id = ?').all(id),
    };
    res.set('Content-Disposition', `attachment; filename="collabo-export-${id}.json"`).json(data);
  });

  // Deletes the account. Funded deals must finish first; unfunded ones are cancelled.
  // Deal records stay (the other party and tax rules need them) but are de-identified.
  app.delete('/api/me', auth(), (req, res) => {
    need(req.body ?? {}, ['password']);
    const u = q('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!verifyPassword(String(req.body.password), u.password_hash)) fail(403, 'Wrong password');
    const open = q(`SELECT COUNT(*) AS n FROM deals WHERE (business_id = ? OR creator_id = ?) AND status IN ('in_progress','draft_submitted','draft_approved','delivered','disputed')`).get(u.id, u.id).n;
    if (open) fail(409, `You have ${open} deal${open > 1 ? 's' : ''} with money in escrow. Finish, refund or resolve ${open > 1 ? 'them' : 'it'} before deleting your account.`);
    tx(db, () => {
      for (const d of q(`SELECT id FROM deals WHERE (business_id = ? OR creator_id = ?) AND status IN ('negotiating','contract','awaiting_funding')`).all(u.id, u.id)) {
        q("UPDATE offers SET status = 'declined' WHERE deal_id = ? AND status = 'pending'").run(d.id);
        q("UPDATE deals SET status = 'cancelled' WHERE id = ?").run(d.id);
        sysMsg(d.id, 'The other party deleted their account, so this deal was cancelled.', 'Deal cancelled', u.id);
      }
      if (u.role === 'creator') {
        ig.purgeCreator(db, u.id);
        for (const t of ['socials', 'posts', 'media', 'metric_snapshots']) q(`DELETE FROM ${t} WHERE creator_id = ?`).run(u.id);
        q('UPDATE packages SET active = 0 WHERE creator_id = ?').run(u.id);
        q("UPDATE creators SET handle = ?, bio = '', location = '', niches = '[]', audience = '{}' WHERE user_id = ?").run(`deleted-${u.id}`, u.id);
      } else {
        q("UPDATE businesses SET company = 'Deleted business', industry = '', website = '', about = '', location = '' WHERE user_id = ?").run(u.id);
        q("UPDATE campaigns SET status = 'closed' WHERE business_id = ?").run(u.id);
      }
      q('DELETE FROM notifications WHERE user_id = ?').run(u.id);
      q(`UPDATE users SET email = ?, name = 'Deleted user', password_hash = ?, deleted_at = datetime('now') WHERE id = ?`)
        .run(`deleted-${u.id}@deleted.invalid`, hashPassword(crypto.randomBytes(24).toString('hex')), u.id);
    });
    res.status(204).end();
  });

  // ---------- admin (ADMIN_EMAILS) ----------
  app.get('/api/admin/overview', auth(), adminOnly, (_req, res) => {
    const count = (sql) => q(sql).get().n;
    res.json({
      users: count('SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL'),
      creators: count("SELECT COUNT(*) AS n FROM users WHERE role = 'creator' AND deleted_at IS NULL"),
      verified_creators: count("SELECT COUNT(DISTINCT creator_id) AS n FROM socials WHERE source = 'instagram_api'"),
      businesses: count("SELECT COUNT(*) AS n FROM users WHERE role = 'business' AND deleted_at IS NULL"),
      deals_by_status: Object.fromEntries(q('SELECT status, COUNT(*) AS n FROM deals GROUP BY status').all().map((r) => [r.status, r.n])),
      held_in_escrow_cents: q(`SELECT COALESCE(SUM(CASE WHEN type IN ('escrow_fund','bonus_fund') THEN amount_cents WHEN type IN ('payout','seller_fee','refund') THEN -amount_cents ELSE 0 END), 0) AS n FROM transactions`).get().n,
      platform_fees_cents: q(`SELECT COALESCE(SUM(CASE WHEN type IN ('buyer_fee','seller_fee') THEN amount_cents WHEN type = 'fee_refund' THEN -amount_cents ELSE 0 END), 0) AS n FROM transactions`).get().n,
    });
  });

  app.get('/api/admin/disputes', auth(), adminOnly, (_req, res) => {
    res.json(q(`SELECT d.id, d.title, d.price_cents, d.bonus_cents, d.dispute_reason, d.dispute_creator_pct, d.dispute_by, d.disputed_at, d.dispute_prev_status,
        d.business_id, b.company, d.creator_id, u.name AS creator_name, c.handle
      FROM deals d JOIN businesses b ON b.user_id = d.business_id JOIN creators c ON c.user_id = d.creator_id JOIN users u ON u.id = d.creator_id
      WHERE d.status = 'disputed' ORDER BY d.disputed_at`).all().map((d) => ({
      ...d, held_cents: escrowOf(d.id).held_cents, proposed_by: d.dispute_by === d.business_id ? 'brand' : 'creator',
      messages: q('SELECT m.body, m.system, m.created_at, u.name FROM messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.deal_id = ? ORDER BY m.id DESC LIMIT 12').all(d.id).reverse(),
      draft_url: q('SELECT draft_url, delivery_url, deadline FROM deals WHERE id = ?').get(d.id),
    })));
  });

  app.post('/api/admin/disputes/:id/resolve', auth(), adminOnly, (req, res) => {
    const d = q('SELECT * FROM deals WHERE id = ?').get(Number(req.params.id));
    if (!d || d.status !== 'disputed') fail(409, 'No open dispute');
    tx(db, () => {
      resolveDispute(d, pct(req.body?.creator_pct), 'by Collabo mediation');
      if (req.body?.note) sysMsg(d.id, `Mediator’s note: ${String(req.body.note).slice(0, 2000)}`);
    });
    res.json({ ok: true });
  });

  // ---------- demo walkthrough (demo accounts only; DEMO_MODE=off disables) ----------
  // Demo passwords are public, so letting one demo account act as another exposes nothing new.
  app.post('/api/demo/start', (_req, res) => {
    if (!DEMO_MODE) fail(404, 'Not found');
    const brand = q("SELECT id FROM users WHERE email = 'brand@glowlab.co'").get();
    const creator = q("SELECT user_id AS id FROM creators WHERE handle = 'emmapaws'").get();
    const pkg = creator && q("SELECT * FROM packages WHERE creator_id = ? AND active = 1 AND deliverable_type != 'ugc' ORDER BY price_cents LIMIT 1").get(creator.id);
    if (!brand || !pkg) fail(409, 'Demo data is missing. Run npm run seed.');
    const deadline = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const id = tx(db, () => {
      const { lastInsertRowid } = q('INSERT INTO deals (business_id, creator_id, package_id, title) VALUES (?, ?, ?, ?)').run(brand.id, creator.id, pkg.id, `Demo: ${pkg.title}`);
      const items = [
        { platform: pkg.platform, format: pkg.deliverable_type, duration_s: DURATIONS[pkg.deliverable_type]?.includes(30) ? 30 : DURATIONS[pkg.deliverable_type]?.[0] ?? null, quantity: pkg.quantity, unit_price_cents: Math.round(pkg.price_cents / pkg.quantity), notes: 'Show the treat bag in the first 3 seconds' },
        { platform: 'instagram', format: 'story', duration_s: 15, quantity: 3, unit_price_cents: 4000, notes: 'Link sticker to the product page' },
      ];
      const terms = { ...DEFAULT_TERMS, usage_rights: 'paid_30', revisions: 2 };
      addOffer(lastInsertRowid, brand.id, { price_cents: quote(items, terms).total_cents, deliverables: deliverablesText(items), deadline, items, terms,
        note: 'Demo offer: switch to the creator to accept or counter it.', bonus_cents: 10000, bonus_metric: 'views', bonus_target: 20000 });
      sysMsg(lastInsertRowid, 'Demo deal created. Use “Switch to the creator” at the top of this page to play the other side at any step.');
      return lastInsertRowid;
    });
    res.status(201).json({ token: issueToken(brand.id), user: me(brand.id), deal_id: Number(id) });
  });

  app.post('/api/demo/switch/:id', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    const other = req.user.id === d.business_id ? d.creator_id : d.business_id;
    const emails = [req.user.email, q('SELECT email FROM users WHERE id = ?').get(other).email];
    if (!DEMO_MODE || !emails.every(isDemoEmail)) fail(403, 'Switching sides only works on demo deals');
    res.json({ token: issueToken(other), user: me(other) });
  });

  app.use('/api', (_req, _res) => fail(404, 'Not found'));

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
