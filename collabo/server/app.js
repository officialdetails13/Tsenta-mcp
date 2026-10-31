import express from 'express';
import crypto from 'node:crypto';
import { tx } from './db.js';
import { hashPassword, verifyPassword, issueToken, readToken } from './auth.js';
import { PLATFORMS, DELIVERABLES, NICHES, estimateRate, marketRate, priceVerdict, creatorTier } from './pricing.js';
import { EDIT_STYLES, POST_FORMATS, STAGES, stageFor, analyzeHook, analyzePosts, weeklyCounts, trendStats, missionsFor, recommendations } from './content.js';

export const BUYER_FEE = 0.05; // charged to the business on top of the deal price
export const SELLER_FEE = 0.10; // deducted from the creator's payout
export const DRAFT_RELEASE = 0.3; // share of the fee released when the draft is approved
export const DRAFT_REVIEW_DAYS = 3; // brand silence after a draft counts as approval
export const FINAL_REVIEW_DAYS = 5; // brand silence after delivery counts as approval
export const LATE_GRACE_DAYS = 3; // after this, a brand can reclaim escrow for a missed deadline
export const BONUS_WINDOW_DAYS = 30; // time to hit a performance target before the bonus is refunded

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
    req.user = uid ? q('SELECT id, role, email, name FROM users WHERE id = ?').get(uid) ?? null : null;
    next();
  });
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
    const email = String(b.email).trim().toLowerCase();
    if (q('SELECT 1 FROM users WHERE email = ?').get(email)) fail(409, 'An account with that email already exists');
    const id = tx(db, () => {
      const { lastInsertRowid } = q('INSERT INTO users (role, email, password_hash, name) VALUES (?, ?, ?, ?)')
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
    const u = q('SELECT * FROM users WHERE email = ?').get(String(req.body.email).trim().toLowerCase());
    if (!u || !verifyPassword(String(req.body.password), u.password_hash)) fail(401, 'Wrong email or password');
    res.json({ token: issueToken(u.id), user: me(u.id) });
  });

  function me(id) {
    const u = q('SELECT id, role, email, name FROM users WHERE id = ?').get(id);
    if (u.role === 'creator') u.creator = q('SELECT * FROM creators WHERE user_id = ?').get(id);
    else u.business = q('SELECT * FROM businesses WHERE user_id = ?').get(id);
    return u;
  }
  app.get('/api/me', auth(), (req, res) => res.json(me(req.user.id)));

  app.get('/api/meta', (_req, res) => res.json({ platforms: PLATFORMS, deliverables: DELIVERABLES, niches: NICHES, edit_styles: EDIT_STYLES, post_formats: POST_FORMATS, stages: STAGES, fees: { buyer: BUYER_FEE, seller: SELLER_FEE } }));

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
    return {
      id: c.user_id, name: c.name, handle: c.handle, bio: c.bio, location: c.location,
      niches: parseJson(c.niches, []), audience: parseJson(c.audience, {}), avatar_color: c.avatar_color,
      socials, packages, stats, tier: tier.tier, tier_score: tier.score,
      total_followers: socials.reduce((a, s) => a + s.followers, 0),
      starting_price_cents: packages[0]?.price_cents ?? null,
    };
  }

  app.get('/api/creators', (req, res) => {
    const f = req.query;
    const ids = q('SELECT user_id FROM creators').all().map((r) => r.user_id);
    let list = ids.map(creatorSummary);
    const text = String(f.q || '').trim().toLowerCase();
    if (text) list = list.filter((c) => [c.name, c.handle, c.bio, c.location, ...c.niches].join(' ').toLowerCase().includes(text));
    if (f.niche) list = list.filter((c) => c.niches.includes(f.niche));
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
      recommended: (a, b) => b.tier_score - a.tier_score || reach(b) - reach(a),
    };
    list.sort(sorters[f.sort] || sorters.recommended);
    res.json(list);
  });

  app.get('/api/creators/:id', (req, res) => {
    const c = creatorSummary(Number(req.params.id));
    if (!c) fail(404, 'Creator not found');
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
    res.json(c);
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
    need(req.body, ['handle', 'followers']);
    const { handle, followers, engagement_rate = 0, avg_views = 0 } = req.body;
    q(`INSERT INTO socials (creator_id, platform, handle, followers, engagement_rate, avg_views) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (creator_id, platform) DO UPDATE SET handle = excluded.handle, followers = excluded.followers,
       engagement_rate = excluded.engagement_rate, avg_views = excluded.avg_views`)
      .run(req.user.id, platform, String(handle), Math.max(0, Math.round(followers)), Math.max(0, Number(engagement_rate)), Math.max(0, Math.round(avg_views)));
    res.json(creatorSummary(req.user.id));
  });

  app.delete('/api/creator/socials/:platform', auth('creator'), (req, res) => {
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

  function offerFields(b) {
    need(b, ['price', 'deliverables', 'deadline']);
    const deadline = isoDate(b.deadline);
    if (deadline < new Date().toISOString().slice(0, 10)) fail(400, 'deadline must be in the future');
    const out = { price_cents: cents(b.price), deliverables: String(b.deliverables), deadline, note: String(b.note || ''), bonus_cents: 0, bonus_metric: null, bonus_target: null };
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
    q("UPDATE offers SET status = 'superseded' WHERE deal_id = ? AND status = 'pending'").run(dealId);
    q('INSERT INTO offers (deal_id, from_user_id, price_cents, deliverables, deadline, note, bonus_cents, bonus_metric, bonus_target) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(dealId, userId, o.price_cents, o.deliverables, o.deadline, o.note, o.bonus_cents, o.bonus_metric, o.bonus_target);
    touch(dealId);
  }

  const touch = (dealId) => q("UPDATE deals SET updated_at = datetime('now') WHERE id = ?").run(dealId);
  const sysMsg = (dealId, body) => q('INSERT INTO messages (deal_id, body, system) VALUES (?, ?, 1)').run(dealId, body);
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
    sysMsg(d.id, `${by ?? 'Draft auto-approved after the 3-day review window.'}${by ? ' approved the draft.' : ''} ${usd(net)} (${DRAFT_RELEASE * 100}% of the fee, after fees) released to the creator. Post the content when ready.`);
    touch(d.id);
  }

  function completeDeal(d, by) {
    const e = escrowOf(d.id);
    const net = release(d.id, e.held_fee_cents, 'final');
    setStatus(d.id, 'completed', ", completed_at = datetime('now')");
    sysMsg(d.id, `${by ? `${by} approved the live content.` : 'Live content auto-approved after the 5-day review window.'} ${usd(net)} released to the creator.`);
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
    sysMsg(d.id, `Performance target hit. ${usd(net)} bonus released to the creator.`);
    touch(d.id);
  }

  // Deadlines are enforced lazily whenever deals are read, so no scheduler is needed.
  function sweepEscrow() {
    for (const d of q(`SELECT * FROM deals WHERE status = 'draft_submitted' AND draft_submitted_at <= datetime('now', '-${DRAFT_REVIEW_DAYS} days')`).all()) tx(db, () => approveDraft(d, null));
    for (const d of q(`SELECT * FROM deals WHERE status = 'delivered' AND delivered_at <= datetime('now', '-${FINAL_REVIEW_DAYS} days')`).all()) tx(db, () => completeDeal(d, null));
    for (const d of q(`SELECT * FROM deals WHERE status = 'completed' AND bonus_status = 'held' AND completed_at <= datetime('now', '-${BONUS_WINDOW_DAYS} days')`).all()) {
      tx(db, () => {
        refund(d.id, escrowOf(d.id).held_bonus_cents, 'bonus');
        q("UPDATE deals SET bonus_status = 'refunded' WHERE id = ?").run(d.id);
        sysMsg(d.id, `The performance target wasn't reached within ${BONUS_WINDOW_DAYS} days. The bonus was refunded to the brand.`);
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
    d.policy = { draft_release_pct: DRAFT_RELEASE * 100, draft_review_days: DRAFT_REVIEW_DAYS, final_review_days: FINAL_REVIEW_DAYS, late_grace_days: LATE_GRACE_DAYS, bonus_window_days: BONUS_WINDOW_DAYS };
    d.overdue = isOverdue(d);
    const due = (ts, days) => (ts ? new Date(Date.parse(`${ts.replace(' ', 'T')}Z`) + days * 864e5).toISOString() : null);
    d.review_due_at = d.status === 'draft_submitted' ? due(d.draft_submitted_at, DRAFT_REVIEW_DAYS) : d.status === 'delivered' ? due(d.delivered_at, FINAL_REVIEW_DAYS) : null;
    return d;
  }

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

  const checklistFor = (d) => [
    `Deliverables match the contract: ${d.deliverables}`,
    `Promo code ${d.promo_code} appears in the caption or on screen`,
    'Sponsorship is disclosed (#ad or the platform’s paid-partnership label)',
    `Content went live on or before ${d.deadline}`,
    'Content stays live for at least 30 days',
  ].map((text) => ({ text, confirmed: false }));

  app.post('/api/deals/:id/offers/:offerId/accept', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    const o = pendingOfferFor(d, req.user, req.params.offerId);
    tx(db, () => {
      q("UPDATE offers SET status = 'accepted' WHERE id = ?").run(o.id);
      const handle = q('SELECT handle FROM creators WHERE user_id = ?').get(d.creator_id).handle;
      const promo = `${handle.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}${crypto.randomInt(10, 99)}`;
      const terms = { ...d, price_cents: o.price_cents, deliverables: o.deliverables, deadline: o.deadline, promo_code: promo, bonus_cents: o.bonus_cents, bonus_metric: o.bonus_metric, bonus_target: o.bonus_target };
      q(`UPDATE deals SET status = 'contract', price_cents = ?, deliverables = ?, deadline = ?, promo_code = ?, contract_text = ?, checklist = ?,
          bonus_cents = ?, bonus_metric = ?, bonus_target = ? WHERE id = ?`)
        .run(o.price_cents, o.deliverables, o.deadline, promo, contractText(terms), JSON.stringify(checklistFor(terms)), o.bonus_cents, o.bonus_metric, o.bonus_target, d.id);
      sysMsg(d.id, `${req.user.name} accepted the offer of ${usd(o.price_cents)}${o.bonus_cents ? ` + ${usd(o.bonus_cents)} performance bonus` : ''}. Contract generated, waiting on both signatures.`);
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
      sysMsg(d.id, `${req.user.name} declined the offer.${req.body?.note ? ` Reason: ${req.body.note}` : ''}`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  const bonusText = (d) => {
    const target = d.bonus_metric === 'revenue' ? usd(d.bonus_target) : Number(d.bonus_target).toLocaleString('en-US');
    return `${usd(d.bonus_cents)} if the content reaches ${target} ${d.bonus_metric === 'revenue' ? 'in tracked revenue' : d.bonus_metric}`;
  };

  function contractText(d) {
    const biz = q('SELECT company FROM businesses WHERE user_id = ?').get(d.business_id).company;
    const cr = q('SELECT u.name, c.handle FROM creators c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?').get(d.creator_id);
    const lines = [
      `INFLUENCER SERVICES AGREEMENT: Deal #${d.id}`,
      ``,
      `Brand: ${biz}`,
      `Creator: ${cr.name} (@${cr.handle})`,
      ``,
      `1. Deliverables. ${d.deliverables}`,
      `2. Deadline. All deliverables go live on or before ${d.deadline}.`,
      `3. Fee. ${usd(d.price_cents)} USD. The Brand pays a ${BUYER_FEE * 100}% service fee on top. The platform keeps a ${SELLER_FEE * 100}% service fee from the Creator's payouts.`,
      `4. Escrow. The Brand deposits the full fee${d.bonus_cents ? ' and the performance bonus' : ''} into platform escrow before work starts. Neither party can withdraw escrowed funds on its own. Funds are released only as set out in this agreement.`,
      `5. Draft approval. The Creator submits a draft before posting. The Brand approves it or requests changes within ${DRAFT_REVIEW_DAYS} days. If the Brand does not respond in that time, the draft counts as approved. On approval, ${DRAFT_RELEASE * 100}% of the fee is released to the Creator.`,
      `6. Delivery. After posting, the Creator submits the live link and confirms the delivery checklist. The Brand approves or requests a fix within ${FINAL_REVIEW_DAYS} days. If it does not respond in that time, delivery counts as approved. The rest of the fee is then released.`,
    ];
    if (d.bonus_cents) lines.push(`7. Performance bonus. ${bonusText(d)}. Views are reported by the Creator; conversions and revenue are reported by the Brand from promo-code ${d.promo_code} sales. If the target is not met within ${BONUS_WINDOW_DAYS} days of completion, the bonus is refunded to the Brand.`);
    const n = d.bonus_cents ? 8 : 7;
    lines.push(
      `${n}. Late delivery. If the content is not live ${LATE_GRACE_DAYS} days after the deadline, the Brand may cancel and get a refund of all funds still in escrow.`,
      `${n + 1}. Disputes. Either party may open a dispute while funds are in escrow. This freezes the funds until both parties agree on a split or platform mediation decides one.`,
      `${n + 2}. Disclosure. The Creator labels sponsored content clearly (#ad or "Paid partnership"), as required by FTC guidelines and platform rules.`,
      `${n + 3}. Tracking. The Creator includes promo code ${d.promo_code} so sales can be credited to this deal.`,
      `${n + 4}. Usage rights. The Brand may reshare the content on its own organic channels for 90 days. Paid ad usage or whitelisting requires a separate written agreement.`,
      `${n + 5}. Cancellation. Either party may cancel before the escrow is funded.`,
    );
    return lines.join('\n');
  }

  app.post('/api/deals/:id/sign', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'contract') fail(409, 'There is no contract waiting for signatures');
    const col = req.user.role === 'business' ? 'business_signed_at' : 'creator_signed_at';
    if (d[col]) fail(409, 'You already signed');
    tx(db, () => {
      q(`UPDATE deals SET ${col} = datetime('now') WHERE id = ?`).run(d.id);
      const after = q('SELECT * FROM deals WHERE id = ?').get(d.id);
      sysMsg(d.id, `${req.user.name} signed the contract.`);
      if (after.business_signed_at && after.creator_signed_at) {
        setStatus(d.id, 'awaiting_funding');
        sysMsg(d.id, 'Contract fully signed. The brand can now fund escrow.');
      }
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  // Payments are simulated: the ledger records what a processor such as
  // Stripe Connect (separate charges and transfers) would settle.
  app.post('/api/deals/:id/fund', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'awaiting_funding') fail(409, 'Deal is not ready for funding');
    tx(db, () => {
      ledger(d.id, 'escrow_fund', d.price_cents);
      ledger(d.id, 'bonus_fund', d.bonus_cents, 'bonus');
      ledger(d.id, 'buyer_fee', Math.round((d.price_cents + d.bonus_cents) * BUYER_FEE));
      setStatus(d.id, 'in_progress', `, funded_at = datetime('now'), bonus_status = '${d.bonus_cents ? 'held' : 'none'}'`);
      sysMsg(d.id, `Escrow funded: ${usd(d.price_cents + d.bonus_cents)} is secured${d.bonus_cents ? ` (including a ${usd(d.bonus_cents)} performance bonus)` : ''}. The creator can start. Submit a draft for approval before posting.`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/draft', auth('creator'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'in_progress') fail(409, 'Drafts can be submitted once escrow is funded');
    need(req.body, ['url']);
    tx(db, () => {
      q("UPDATE deals SET status = 'draft_submitted', draft_url = ?, draft_note = ?, draft_submitted_at = datetime('now') WHERE id = ?")
        .run(String(req.body.url), String(req.body.note || ''), d.id);
      sysMsg(d.id, `${req.user.name} submitted a draft for review. The brand has ${DRAFT_REVIEW_DAYS} days to respond.`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/draft/approve', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'draft_submitted') fail(409, 'There is no draft waiting for review');
    tx(db, () => approveDraft(d, req.user.name));
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/draft/request-changes', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'draft_submitted') fail(409, 'There is no draft waiting for review');
    need(req.body, ['note']);
    tx(db, () => {
      setStatus(d.id, 'in_progress');
      sysMsg(d.id, `Changes requested on the draft: ${req.body.note}`);
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
      q("UPDATE deals SET status = 'delivered', delivered_at = datetime('now'), delivery_url = ?, delivery_note = ?, checklist = ? WHERE id = ?")
        .run(String(req.body.url), String(req.body.note || ''), JSON.stringify(list.map((i) => ({ ...i, confirmed: true }))), d.id);
      sysMsg(d.id, `${req.user.name} posted the content and confirmed the delivery checklist. The brand has ${FINAL_REVIEW_DAYS} days to approve.`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/request-revision', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'delivered') fail(409, 'Nothing has been delivered yet');
    need(req.body, ['note']);
    tx(db, () => {
      setStatus(d.id, 'draft_approved');
      sysMsg(d.id, `Fix requested on the live content: ${req.body.note}`);
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
      sysMsg(d.id, `The deadline was missed by more than ${LATE_GRACE_DAYS} days. ${usd(e.held_cents)} was refunded to the brand from escrow.`);
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
    sysMsg(d.id, `Dispute resolved ${by}: ${creatorPct}% of the ${usd(e.held_cents)} in escrow goes to the creator (${usd(net)} after fees) and ${usd(e.held_cents - toCreator)} is refunded to the brand.`);
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
      sysMsg(d.id, `${req.user.name} opened a dispute. Escrow is frozen. Reason: ${req.body.reason}. Proposed split: ${p}% to the creator.`);
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
      sysMsg(d.id, `${req.user.name} proposed a different split: ${p}% to the creator.${req.body.note ? ` ${req.body.note}` : ''}`);
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
      sysMsg(d.id, `${req.user.name} withdrew from the dispute. The deal continues.`);
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
      sysMsg(d.id, `${req.user.name} cancelled the deal.`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/messages', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    need(req.body, ['body']);
    q('INSERT INTO messages (deal_id, user_id, body) VALUES (?, ?, ?)').run(d.id, req.user.id, String(req.body.body).slice(0, 4000));
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

  app.use('/api', (_req, _res) => fail(404, 'Not found'));

  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
