import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seed, DEMO_PASSWORD } from '../server/seed.js';
import { estimateRate } from '../server/pricing.js';

let server, base;
before(async () => {
  const db = openDb(':memory:');
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

test('full deal lifecycle: offer, counter, accept, sign, fund, deliver, approve, results, review', async () => {
  const biz = await login('brand@fuelbar.co');
  const creator = await login('emmapaws@creator.demo');
  const profile = (await call('GET', '/creators?q=emmapaws')).body[0];
  const pkg = profile.packages.find((p) => p.deliverable_type === 'video');

  let d = (await call('POST', '/deals', { creator_id: profile.id, package_id: pkg.id, price: 500, deadline: inDays(10), note: 'Can you do 500?' }, biz)).body;
  assert.equal(d.status, 'negotiating');

  // The sender can't accept their own offer.
  assert.equal((await call('POST', `/deals/${d.id}/offers/${d.offers[0].id}/accept`, {}, biz)).status, 403);

  d = (await call('POST', `/deals/${d.id}/offers`, { price: 575, deliverables: '1 TikTok + 1 story', deadline: inDays(10) }, creator)).body;
  assert.deepEqual(d.offers.map((o) => o.status), ['superseded', 'pending']);

  d = (await call('POST', `/deals/${d.id}/offers/${d.offers[1].id}/accept`, {}, biz)).body;
  assert.equal(d.status, 'contract');
  assert.equal(d.price_cents, 57500);
  assert.match(d.contract_text, new RegExp(d.promo_code));

  assert.equal((await call('POST', `/deals/${d.id}/fund`, {}, biz)).status, 409); // unsigned
  await call('POST', `/deals/${d.id}/sign`, {}, biz);
  d = (await call('POST', `/deals/${d.id}/sign`, {}, creator)).body;
  assert.equal(d.status, 'awaiting_funding');

  d = (await call('POST', `/deals/${d.id}/fund`, {}, biz)).body;
  assert.equal(d.status, 'in_progress');
  d = (await call('POST', `/deals/${d.id}/deliver`, { url: 'https://tiktok.com/x' }, creator)).body;
  d = (await call('POST', `/deals/${d.id}/request-revision`, { note: 'Show the wrapper' }, biz)).body;
  assert.equal(d.status, 'in_progress');
  await call('POST', `/deals/${d.id}/deliver`, { url: 'https://tiktok.com/y' }, creator);
  d = (await call('POST', `/deals/${d.id}/approve`, {}, biz)).body;
  assert.equal(d.status, 'completed');
  assert.equal(d.transactions.find((t) => t.type === 'payout').amount_cents, 51750); // 575 − 10%

  d = (await call('PUT', `/deals/${d.id}/results`, { conversions: 40, revenue: 1400, impressions: 50000 }, biz)).body;
  assert.equal(d.results.revenue_cents, 140000);
  assert.equal((await call('POST', `/deals/${d.id}/review`, { rating: 5, body: 'Great' }, biz)).status, 201);
  assert.equal((await call('POST', `/deals/${d.id}/review`, { rating: 5 }, biz)).status, 409);

  const growth = (await call('GET', '/creator/growth', null, creator)).body;
  assert.equal(growth.stats.completed_deals, 2);
  assert.ok(growth.earnings_cents >= 51750);
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
