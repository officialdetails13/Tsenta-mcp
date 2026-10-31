import express from 'express';
import crypto from 'node:crypto';
import { tx } from './db.js';
import { hashPassword, verifyPassword, issueToken, readToken } from './auth.js';
import { PLATFORMS, DELIVERABLES, NICHES, estimateRate, marketRate, priceVerdict, creatorTier } from './pricing.js';

export const BUYER_FEE = 0.05; // charged to the business on top of the deal price
export const SELLER_FEE = 0.10; // deducted from the creator's payout

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

  app.get('/api/meta', (_req, res) => res.json({ platforms: PLATFORMS, deliverables: DELIVERABLES, niches: NICHES, fees: { buyer: BUYER_FEE, seller: SELLER_FEE } }));

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
    const pipeline = q(`SELECT COALESCE(SUM(price_cents), 0) AS v FROM deals WHERE creator_id = ? AND status IN ('contract','awaiting_funding','in_progress','delivered')`).get(id).v;
    res.json({ ...creatorTier({ creator: c, socials, packages, stats }), stats, pricing, earnings_cents: earnings, pipeline_cents: pipeline });
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
    const spend = q(`SELECT COALESCE(SUM(t.amount_cents), 0) AS v FROM transactions t JOIN deals d ON d.id = t.deal_id
      WHERE d.business_id = ? AND t.type IN ('escrow_fund','buyer_fee')`).get(id).v
      - q(`SELECT COALESCE(SUM(t.amount_cents), 0) AS v FROM transactions t JOIN deals d ON d.id = t.deal_id WHERE d.business_id = ? AND t.type = 'refund'`).get(id).v;
    const r = q(`SELECT COALESCE(SUM(r.revenue_cents),0) AS revenue, COALESCE(SUM(r.conversions),0) AS conversions, COALESCE(SUM(r.impressions),0) AS impressions,
      COALESCE(SUM(d.price_cents),0) AS measured_spend FROM results r JOIN deals d ON d.id = r.deal_id WHERE d.business_id = ?`).get(id);
    const byStatus = Object.fromEntries(q('SELECT status, COUNT(*) AS n FROM deals WHERE business_id = ? GROUP BY status').all(id).map((x) => [x.status, x.n]));
    const top = q(`SELECT d.creator_id, u.name, c.handle, SUM(r.revenue_cents) AS revenue_cents, SUM(d.price_cents) AS spend_cents
      FROM results r JOIN deals d ON d.id = r.deal_id JOIN creators c ON c.user_id = d.creator_id JOIN users u ON u.id = c.user_id
      WHERE d.business_id = ? GROUP BY d.creator_id ORDER BY revenue_cents DESC LIMIT 5`).all(id);
    res.json({
      spend_cents: spend, revenue_cents: r.revenue, conversions: r.conversions, impressions: r.impressions,
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

  // ---------- deals ----------
  function offerFields(b) {
    need(b, ['price', 'deliverables', 'deadline']);
    const deadline = isoDate(b.deadline);
    if (deadline < new Date().toISOString().slice(0, 10)) fail(400, 'deadline must be in the future');
    return { price_cents: cents(b.price), deliverables: String(b.deliverables), deadline, note: String(b.note || '') };
  }

  function addOffer(dealId, userId, o) {
    q("UPDATE offers SET status = 'superseded' WHERE deal_id = ? AND status = 'pending'").run(dealId);
    q('INSERT INTO offers (deal_id, from_user_id, price_cents, deliverables, deadline, note) VALUES (?, ?, ?, ?, ?, ?)')
      .run(dealId, userId, o.price_cents, o.deliverables, o.deadline, o.note);
    touch(dealId);
  }

  const touch = (dealId) => q("UPDATE deals SET updated_at = datetime('now') WHERE id = ?").run(dealId);
  const sysMsg = (dealId, body) => q('INSERT INTO messages (deal_id, body, system) VALUES (?, ?, 1)').run(dealId, body);

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
    d.my_side = d.business_id === user.id ? 'business' : 'creator';
    d.fees = { buyer_fee_cents: d.price_cents ? Math.round(d.price_cents * BUYER_FEE) : null, seller_fee_cents: d.price_cents ? Math.round(d.price_cents * SELLER_FEE) : null };
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
      price: b.price ?? (pkg ? pkg.price_cents / 100 : undefined),
      deliverables: b.deliverables ?? (pkg ? `${pkg.quantity}× ${pkg.platform} ${pkg.deliverable_type} — ${pkg.title}` : undefined),
      deadline: b.deadline, note: b.note,
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
    const col = req.user.role === 'business' ? 'business_id' : 'creator_id';
    res.json(q(`SELECT d.id, d.title, d.status, d.price_cents, d.deadline, d.updated_at, d.campaign_id,
        b.company, u.name AS creator_name, c.handle, c.avatar_color,
        o.price_cents AS latest_offer_cents, o.from_user_id AS latest_offer_from, o.status AS latest_offer_status
      FROM deals d JOIN businesses b ON b.user_id = d.business_id
      JOIN creators c ON c.user_id = d.creator_id JOIN users u ON u.id = d.creator_id
      LEFT JOIN offers o ON o.id = (SELECT id FROM offers WHERE deal_id = d.id ORDER BY id DESC LIMIT 1)
      WHERE d.${col} = ? ORDER BY d.updated_at DESC, d.id DESC`).all(req.user.id));
  });

  app.get('/api/deals/:id', auth(), (req, res) => res.json(dealOut(req.params.id, req.user)));

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

  app.post('/api/deals/:id/offers/:offerId/accept', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    const o = pendingOfferFor(d, req.user, req.params.offerId);
    tx(db, () => {
      q("UPDATE offers SET status = 'accepted' WHERE id = ?").run(o.id);
      const handle = q('SELECT handle FROM creators WHERE user_id = ?').get(d.creator_id).handle;
      const promo = `${handle.replace(/[^a-z0-9]/gi, '').slice(0, 8).toUpperCase()}${crypto.randomInt(10, 99)}`;
      const terms = { ...d, price_cents: o.price_cents, deliverables: o.deliverables, deadline: o.deadline, promo_code: promo };
      q("UPDATE deals SET status = 'contract', price_cents = ?, deliverables = ?, deadline = ?, promo_code = ?, contract_text = ? WHERE id = ?")
        .run(o.price_cents, o.deliverables, o.deadline, promo, contractText(terms), d.id);
      sysMsg(d.id, `${req.user.name} accepted the offer of $${(o.price_cents / 100).toFixed(2)}. Contract generated, waiting on both signatures.`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/offers/:offerId/decline', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    const o = pendingOfferFor(d, req.user, req.params.offerId);
    tx(db, () => {
      q("UPDATE offers SET status = 'declined' WHERE id = ?").run(o.id);
      q("UPDATE deals SET status = 'declined' WHERE id = ?").run(d.id);
      sysMsg(d.id, `${req.user.name} declined the offer.${req.body?.note ? ` Reason: ${req.body.note}` : ''}`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  function contractText(d) {
    const biz = q('SELECT company FROM businesses WHERE user_id = ?').get(d.business_id).company;
    const cr = q('SELECT u.name, c.handle FROM creators c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?').get(d.creator_id);
    const price = (d.price_cents / 100).toFixed(2);
    return [
      `INFLUENCER SERVICES AGREEMENT — Deal #${d.id}`,
      ``,
      `Brand: ${biz}`,
      `Creator: ${cr.name} (@${cr.handle})`,
      ``,
      `1. Deliverables. ${d.deliverables}`,
      `2. Deadline. All deliverables go live on or before ${d.deadline}.`,
      `3. Fee. $${price} USD, held in escrow by the platform when the Brand funds the deal and released to the Creator when the Brand approves delivery. The platform keeps a ${SELLER_FEE * 100}% service fee from the Creator payout and charges the Brand a ${BUYER_FEE * 100}% service fee.`,
      `4. Approval. The Brand reviews the delivery within 5 days. It can request up to two rounds of revisions. If it does not respond in that time, the delivery counts as approved.`,
      `5. Disclosure. The Creator labels sponsored content clearly (e.g. #ad, "Paid partnership"), as required by FTC guidelines and platform rules.`,
      `6. Tracking. The Creator includes promo code ${d.promo_code} so sales can be credited to this deal. Both parties may report performance results on the platform.`,
      `7. Usage rights. The Brand may reshare the content on its own organic channels for 90 days. Paid ad usage or whitelisting requires a separate written agreement.`,
      `8. Exclusivity. None, unless the deliverables above say otherwise.`,
      `9. Cancellation. Either party may cancel before funding. After funding, disputes go through platform mediation.`,
    ].join('\n');
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
        q("UPDATE deals SET status = 'awaiting_funding' WHERE id = ?").run(d.id);
        sysMsg(d.id, 'Contract fully signed. The brand can now fund escrow.');
      }
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  // Payments are simulated: this records the ledger a real processor
  // (e.g. Stripe Connect) would settle.
  app.post('/api/deals/:id/fund', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'awaiting_funding') fail(409, 'Deal is not ready for funding');
    tx(db, () => {
      q('INSERT INTO transactions (deal_id, type, amount_cents) VALUES (?, ?, ?)').run(d.id, 'escrow_fund', d.price_cents);
      q('INSERT INTO transactions (deal_id, type, amount_cents) VALUES (?, ?, ?)').run(d.id, 'buyer_fee', Math.round(d.price_cents * BUYER_FEE));
      q("UPDATE deals SET status = 'in_progress', funded_at = datetime('now') WHERE id = ?").run(d.id);
      sysMsg(d.id, `Escrow funded with $${(d.price_cents / 100).toFixed(2)}. The creator can start work.`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/deliver', auth('creator'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'in_progress') fail(409, 'Deal is not in progress');
    need(req.body, ['url']);
    tx(db, () => {
      q("UPDATE deals SET status = 'delivered', delivered_at = datetime('now'), delivery_url = ?, delivery_note = ? WHERE id = ?")
        .run(String(req.body.url), String(req.body.note || ''), d.id);
      sysMsg(d.id, `${req.user.name} submitted the delivery. Waiting on the brand to approve.`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/request-revision', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'delivered') fail(409, 'Nothing has been delivered yet');
    need(req.body, ['note']);
    tx(db, () => {
      q("UPDATE deals SET status = 'in_progress' WHERE id = ?").run(d.id);
      sysMsg(d.id, `Revision requested: ${req.body.note}`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/approve', auth('business'), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'delivered') fail(409, 'Nothing has been delivered yet');
    const fee = Math.round(d.price_cents * SELLER_FEE);
    tx(db, () => {
      q('INSERT INTO transactions (deal_id, type, amount_cents) VALUES (?, ?, ?)').run(d.id, 'seller_fee', fee);
      q('INSERT INTO transactions (deal_id, type, amount_cents) VALUES (?, ?, ?)').run(d.id, 'payout', d.price_cents - fee);
      q("UPDATE deals SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(d.id);
      sysMsg(d.id, `Delivery approved. $${((d.price_cents - fee) / 100).toFixed(2)} released to the creator.`);
      touch(d.id);
    });
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/cancel', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (!['negotiating', 'contract', 'awaiting_funding'].includes(d.status)) fail(409, 'Funded deals have to be resolved through mediation');
    tx(db, () => {
      q("UPDATE offers SET status = 'declined' WHERE deal_id = ? AND status = 'pending'").run(d.id);
      q("UPDATE deals SET status = 'cancelled' WHERE id = ?").run(d.id);
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

  app.put('/api/deals/:id/results', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (!['delivered', 'completed'].includes(d.status)) fail(409, 'Results can be reported after delivery');
    const n = (k) => Math.max(0, Math.round(Number(req.body[k] || 0)));
    q(`INSERT INTO results (deal_id, impressions, clicks, conversions, revenue_cents) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (deal_id) DO UPDATE SET impressions = excluded.impressions, clicks = excluded.clicks,
       conversions = excluded.conversions, revenue_cents = excluded.revenue_cents, reported_at = datetime('now')`)
      .run(d.id, n('impressions'), n('clicks'), n('conversions'), Math.max(0, Math.round(Number(req.body.revenue || 0) * 100)));
    touch(d.id);
    res.json(dealOut(d.id, req.user));
  });

  app.post('/api/deals/:id/review', auth(), (req, res) => {
    const d = loadDeal(req.params.id, req.user);
    if (d.status !== 'completed') fail(409, 'Reviews open once the deal is completed');
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
