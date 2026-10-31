import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seed, DEMO_PASSWORD } from '../server/seed.js';
import { estimateRate } from '../server/pricing.js';

let server, base, db;
before(async () => {
  db = openDb(':memory:');
  seed(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => server.close());

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}
const login = async (email) => (await call('POST', '/auth/login', { email, password: DEMO_PASSWORD })).body.token;
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test('rate engine rewards engagement and niche', () => {
  const base = { platform: 'instagram', deliverable_type: 'post', followers: 100000, engagement_rate: 2 };
  assert.equal(estimateRate(base).suggested_cents, 100000); // 100K × $10 CPM
  assert.ok(estimateRate({ ...base, engagement_rate: 6 }).suggested_cents > 100000);
  assert.ok(estimateRate({ ...base, niches: ['finance'] }).suggested_cents > 100000);
});

test('discovery filters and sorts creators', async () => {
  const { body } = await call('GET', '/creators?niche=finance&sort=roi');
  assert.ok(body.length >= 1);
  assert.ok(body.every((c) => c.niches.includes('finance')));
  assert.equal(body[0].handle, 'marcusmoney');
  assert.ok(body[0].stats.avg_roi > 3);
  const tiktok = await call('GET', '/creators?platform=tiktok&minFollowers=300000');
  assert.ok(tiktok.body.every((c) => c.socials.find((s) => s.platform === 'tiktok').followers >= 300000));
});

// Walks a deal from first offer to funded escrow.
async function fundedDeal(biz, creator, handle, extra = {}) {
  const profile = (await call('GET', `/creators?q=${handle}`)).body[0];
  let d = (await call('POST', '/deals', { creator_id: profile.id, price: 1000, deliverables: '1 TikTok', deadline: inDays(10), ...extra }, biz)).body;
  d = (await call('POST', `/deals/${d.id}/offers/${d.offers[0].id}/accept`, {}, creator)).body;
  await call('POST', `/deals/${d.id}/sign`, {}, biz);
  await call('POST', `/deals/${d.id}/sign`, {}, creator);
  return (await call('POST', `/deals/${d.id}/fund`, {}, biz)).body;
}

test('negotiation: offer, counter, accept, contract, signatures', async () => {
  const biz = await login('brand@fuelbar.co');
  const creator = await login('emmapaws@creator.demo');
  const profile = (await call('GET', '/creators?q=emmapaws')).body[0];
  const pkg = profile.packages.find((p) => p.deliverable_type === 'video');

  let d = (await call('POST', '/deals', { creator_id: profile.id, package_id: pkg.id, price: 500, deadline: inDays(10), note: 'Can you do 500?' }, biz)).body;
  assert.equal(d.status, 'negotiating');
  assert.equal((await call('POST', `/deals/${d.id}/offers/${d.offers[0].id}/accept`, {}, biz)).status, 403); // can't accept own offer

  d = (await call('POST', `/deals/${d.id}/offers`, { price: 575, deliverables: '1 TikTok + 1 story', deadline: inDays(10) }, creator)).body;
  assert.deepEqual(d.offers.map((o) => o.status), ['superseded', 'pending']);
  d = (await call('POST', `/deals/${d.id}/offers/${d.offers[1].id}/accept`, {}, biz)).body;
  assert.equal(d.status, 'contract');
  assert.match(d.contract_text, /Escrow/);
  assert.equal(d.checklist.length, 5);

  assert.equal((await call('POST', `/deals/${d.id}/fund`, {}, biz)).status, 409); // unsigned
  await call('POST', `/deals/${d.id}/sign`, {}, biz);
  d = (await call('POST', `/deals/${d.id}/sign`, {}, creator)).body;
  assert.equal(d.status, 'awaiting_funding');
  d = (await call('POST', `/deals/${d.id}/cancel`, {}, biz)).body; // either side can walk away before funding
  assert.equal(d.status, 'cancelled');
});

test('escrow: money is locked in, released in stages, and checklist-gated', async () => {
  const biz = await login('brand@fuelbar.co');
  const creator = await login('emmapaws@creator.demo');
  let d = await fundedDeal(biz, creator, 'emmapaws');
  assert.equal(d.status, 'in_progress');
  assert.equal(d.escrow.held_cents, 100000);
  assert.equal(d.transactions.find((t) => t.type === 'buyer_fee').amount_cents, 5000);
  assert.equal((await call('POST', `/deals/${d.id}/cancel`, {}, biz)).status, 409); // brand can't pull funded money

  // Posting is blocked until a draft is approved.
  assert.equal((await call('POST', `/deals/${d.id}/deliver`, { url: 'https://x.co' }, creator)).status, 409);
  d = (await call('POST', `/deals/${d.id}/draft`, { url: 'https://drive.co/draft1' }, creator)).body;
  d = (await call('POST', `/deals/${d.id}/draft/request-changes`, { note: 'Show the wrapper' }, biz)).body;
  assert.equal(d.status, 'in_progress');
  assert.equal(d.escrow.released_cents, 0);
  await call('POST', `/deals/${d.id}/draft`, { url: 'https://drive.co/draft2' }, creator);
  d = (await call('POST', `/deals/${d.id}/draft/approve`, {}, biz)).body;
  assert.equal(d.status, 'draft_approved');
  assert.equal(d.escrow.released_cents, 30000); // 30% on draft approval
  assert.equal(d.escrow.held_cents, 70000);

  // Delivery requires every checklist item.
  assert.equal((await call('POST', `/deals/${d.id}/deliver`, { url: 'https://tiktok.com/1', checklist: [true, true, false, true, true] }, creator)).status, 400);
  d = (await call('POST', `/deals/${d.id}/deliver`, { url: 'https://tiktok.com/1', checklist: [true, true, true, true, true] }, creator)).body;
  assert.equal(d.status, 'delivered');
  assert.ok(d.checklist.every((i) => i.confirmed));

  d = (await call('POST', `/deals/${d.id}/approve`, {}, biz)).body;
  assert.equal(d.status, 'completed');
  assert.equal(d.escrow.held_cents, 0);
  const payout = d.transactions.filter((t) => t.type === 'payout').reduce((a, t) => a + t.amount_cents, 0);
  assert.equal(payout, 90000); // $1,000 − 10% seller fee

  assert.equal((await call('POST', `/deals/${d.id}/review`, { rating: 5, body: 'Great' }, biz)).status, 201);
  assert.equal((await call('POST', `/deals/${d.id}/review`, { rating: 5 }, biz)).status, 409);
});

test('escrow: brand silence auto-releases funds to the creator', async () => {
  const biz = await login('brand@glowlab.co');
  const creator = await login('leowanders@creator.demo');
  let d = await fundedDeal(biz, creator, 'leowanders');
  await call('POST', `/deals/${d.id}/draft`, { url: 'https://drive.co/d' }, creator);
  db.prepare("UPDATE deals SET draft_submitted_at = datetime('now', '-4 days') WHERE id = ?").run(d.id);
  d = (await call('GET', `/deals/${d.id}`, null, creator)).body;
  assert.equal(d.status, 'draft_approved');
  await call('POST', `/deals/${d.id}/deliver`, { url: 'https://ig.com/p', checklist: d.checklist.map(() => true) }, creator);
  db.prepare("UPDATE deals SET delivered_at = datetime('now', '-6 days') WHERE id = ?").run(d.id);
  d = (await call('GET', `/deals/${d.id}`, null, creator)).body;
  assert.equal(d.status, 'completed');
  assert.equal(d.escrow.released_cents, 100000);
});

test('escrow: missed deadline lets the brand reclaim held funds', async () => {
  const biz = await login('brand@stackly.app');
  const creator = await login('ravibeats@creator.demo');
  let d = await fundedDeal(biz, creator, 'ravibeats');
  assert.equal((await call('POST', `/deals/${d.id}/refund-overdue`, {}, biz)).status, 409); // not late yet
  db.prepare("UPDATE deals SET deadline = date('now', '-4 days') WHERE id = ?").run(d.id);
  d = (await call('POST', `/deals/${d.id}/refund-overdue`, {}, biz)).body;
  assert.equal(d.status, 'refunded');
  assert.equal(d.escrow.refunded_cents, 100000);
  assert.equal(d.escrow.held_cents, 0);
});

test('escrow: disputes freeze funds until both sides agree a split', async () => {
  const biz = await login('brand@stackly.app');
  const creator = await login('theoplays@creator.demo');
  let d = await fundedDeal(biz, creator, 'theoplays');
  d = (await call('POST', `/deals/${d.id}/dispute`, { reason: 'Brand went silent', creator_pct: 100 }, creator)).body;
  assert.equal(d.status, 'disputed');
  assert.equal((await call('POST', `/deals/${d.id}/dispute/accept`, {}, creator)).status, 403); // can't accept own proposal
  assert.equal((await call('POST', `/deals/${d.id}/draft`, { url: 'x' }, creator)).status, 409); // frozen
  await call('POST', `/deals/${d.id}/dispute/counter`, { creator_pct: 60 }, biz);
  d = (await call('POST', `/deals/${d.id}/dispute/accept`, {}, creator)).body;
  assert.equal(d.status, 'resolved');
  assert.equal(d.escrow.released_cents, 60000);
  assert.equal(d.escrow.refunded_cents, 40000);
  assert.equal((await call('POST', '/admin/deals/1/resolve', { creator_pct: 50 })).status, 404); // mediation disabled without ADMIN_TOKEN
});

test('escrow: performance bonus pays out only when the creator-owned metric hits target', async () => {
  const biz = await login('brand@glowlab.co');
  const creator = await login('hannahathome@creator.demo');
  let d = await fundedDeal(biz, creator, 'hannahathome', { bonus: 200, bonus_metric: 'views', bonus_target: 50000 });
  assert.equal(d.escrow.held_cents, 120000);
  assert.equal(d.bonus_status, 'held');
  await call('POST', `/deals/${d.id}/draft`, { url: 'https://d' }, creator);
  await call('POST', `/deals/${d.id}/draft/approve`, {}, biz);
  await call('POST', `/deals/${d.id}/deliver`, { url: 'https://p', checklist: [1, 1, 1, 1, 1].map(Boolean) }, creator);
  d = (await call('POST', `/deals/${d.id}/approve`, {}, biz)).body;
  assert.equal(d.escrow.held_cents, 20000); // bonus still waiting on results

  // Brands can't report views; creators can't report revenue.
  d = (await call('PUT', `/deals/${d.id}/results`, { impressions: 999999, revenue: 5000 }, biz)).body;
  assert.equal(d.results.impressions, 0);
  assert.equal(d.results.revenue_cents, 500000);
  d = (await call('PUT', `/deals/${d.id}/results`, { impressions: 61000, revenue: 1 }, creator)).body;
  assert.equal(d.results.revenue_cents, 500000);
  assert.equal(d.bonus_status, 'paid');
  assert.equal(d.escrow.held_cents, 0);
});

test('unmet bonus is refunded to the brand after the window', async () => {
  const biz = await login('brand@fuelbar.co');
  const creator = await login('sofiaeats@creator.demo');
  let d = await fundedDeal(biz, creator, 'sofiaeats', { bonus: 100, bonus_metric: 'conversions', bonus_target: 500 });
  await call('POST', `/deals/${d.id}/draft`, { url: 'https://d' }, creator);
  await call('POST', `/deals/${d.id}/draft/approve`, {}, biz);
  await call('POST', `/deals/${d.id}/deliver`, { url: 'https://p', checklist: Array(5).fill(true) }, creator);
  await call('POST', `/deals/${d.id}/approve`, {}, biz);
  db.prepare("UPDATE deals SET completed_at = datetime('now', '-31 days') WHERE id = ?").run(d.id);
  d = (await call('GET', `/deals/${d.id}`, null, biz)).body;
  assert.equal(d.bonus_status, 'refunded');
  assert.equal(d.escrow.refunded_cents, 10000);
});

test('growth: stage, missions, recommendations and hook analysis', async () => {
  const day1 = (await call('GET', '/creator/insights', null, await login('niacooks@creator.demo'))).body;
  assert.equal(day1.stage.label, 'Day 1');
  assert.equal(day1.stage.next.label, 'Day 100');
  assert.ok(day1.missions.some((m) => m.key === 'ugc' && !m.done));
  assert.ok(day1.recommendations.some((r) => r.area === 'frequency'));
  assert.equal((await call('GET', '/creator/insights', null, await login('emmapaws@creator.demo'))).body.stage.label, 'Day 100');
  assert.equal((await call('GET', '/creator/insights', null, await login('mayaglow@creator.demo'))).body.stage.label, 'Day 1000');

  const weak = (await call('POST', '/hooks/analyze', { hook: 'Hey guys, so today I wanted to show you my morning routine that I do every day', hold_3s_pct: 38 })).body;
  const strong = (await call('POST', '/hooks/analyze', { hook: 'Stop doing this with your skincare', hold_3s_pct: 74 })).body;
  assert.ok(weak.score < 40 && strong.score >= 75);
  assert.ok(weak.tips.some((t) => /greeting/i.test(t)));

  const creator = await login('ravibeats@creator.demo');
  const r = await call('POST', '/creator/posts', { platform: 'youtube', format: 'short', posted_at: inDays(0), hook: '3 beat mistakes you make', views: 1000, likes: 80, edit_style: 'jump cuts' }, creator);
  assert.equal(r.status, 201);
  assert.equal((await call('POST', '/creator/posts', { platform: 'youtube', format: 'reel', posted_at: inDays(0), views: 1 }, creator)).status, 400);
  const trends = (await call('GET', '/trends')).body;
  assert.ok(trends.length >= 10 && trends.every((t) => ['rising', 'peaking', 'steady', 'fading', 'new'].includes(t.momentum)));
});

test('deals are private to their two parties', async () => {
  const other = await login('brand@stackly.app');
  const { body } = await call('GET', '/deals', null, await login('brand@glowlab.co'));
  assert.equal((await call('GET', `/deals/${body[0].id}`, null, other)).status, 404);
});

test('creators pitch on campaigns once; pricing insight flags underpricing', async () => {
  const creator = await login('ravibeats@creator.demo');
  const campaigns = (await call('GET', '/campaigns')).body;
  const c = campaigns[0];
  assert.equal((await call('POST', `/campaigns/${c.id}/pitch`, { price: 400, deliverables: 'x', deadline: inDays(9) }, creator)).status, 201);
  assert.equal((await call('POST', `/campaigns/${c.id}/pitch`, { price: 400, deliverables: 'x', deadline: inDays(9) }, creator)).status, 409);

  await call('POST', '/creator/packages', { title: 'Cheap reel', platform: 'instagram', deliverable_type: 'reel', price: 25 }, creator);
  const growth = (await call('GET', '/creator/growth', null, creator)).body;
  assert.equal(growth.pricing.find((p) => p.title === 'Cheap reel').verdict, 'underpriced');
});

test('auth guards roles and validates input', async () => {
  const creator = await login('mayaglow@creator.demo');
  assert.equal((await call('POST', '/campaigns', { title: 'x', brief: 'y', budget: 10 }, creator)).status, 403);
  assert.equal((await call('GET', '/deals')).status, 401);
  const reg = await call('POST', '/auth/register', { role: 'creator', email: 'new@x.co', password: 'short', name: 'N' });
  assert.equal(reg.status, 400);
  const ok = await call('POST', '/auth/register', { role: 'creator', email: 'new@x.co', password: 'longenough', name: 'New Person' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.user.creator.handle, 'newperson');
});

test('top tiers require a completed-deal track record', async () => {
  const { creatorTier } = await import('../server/pricing.js');
  const creator = { bio: 'x'.repeat(100), niches: '["a","b"]', audience: '{"age":1,"f":2}' };
  const full = { creator, socials: [1, 2], packages: [1, 2, 3] };
  const stats = (n) => ({ completed_deals: n, review_count: n, avg_rating: 5, delivered_deals: n, on_time_rate: 1, avg_roi: 3 });
  assert.equal(creatorTier({ ...full, stats: stats(2) }).tier, 'Pro');
  assert.equal(creatorTier({ ...full, stats: stats(2) }).deals_to_next, 3);
  assert.equal(creatorTier({ ...full, stats: stats(5) }).tier, 'Elite');
  assert.equal(creatorTier({ ...full, stats: stats(0) }).tier, 'Rising');
});
