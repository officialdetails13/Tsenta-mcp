// The Instagram integration against a local fake of the Instagram API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { decrypt } from '../server/instagram.js';

const IG_USER = '17841400000000001';
const SECRET = 'test-app-secret';
let server, fake, base, db, calls = [];

function fakeInstagram() {
  const a = express();
  a.use(express.urlencoded({ extended: false }));
  const authed = (req, res) => {
    if (req.query.access_token !== 'long-token') { res.status(400).json({ error: { message: 'Invalid OAuth access token', code: 190 } }); return false; }
    return true;
  };
  a.post('/oauth/access_token', (req, res) => {
    calls.push('exchange');
    if (req.body.code !== 'good-code' || req.body.client_secret !== SECRET || req.body.grant_type !== 'authorization_code') return res.status(400).json({ error_type: 'OAuthException', error_message: 'Invalid code' });
    res.json({ access_token: 'short-token', user_id: IG_USER, permissions: ['instagram_business_basic', 'instagram_business_manage_insights'] });
  });
  a.get('/access_token', (req, res) => {
    calls.push('long-lived');
    if (req.query.grant_type !== 'ig_exchange_token' || req.query.access_token !== 'short-token') return res.status(400).json({ error: { message: 'bad exchange' } });
    res.json({ access_token: 'long-token', token_type: 'bearer', expires_in: 5183944 });
  });
  a.get('/me', (req, res) => authed(req, res) && res.json({ id: IG_USER, username: 'real.creator', name: 'Real Creator', followers_count: 20000, media_count: 3, account_type: 'MEDIA_CREATOR', profile_picture_url: 'https://cdn.example/pic.jpg' }));
  a.get('/me/media', (req, res) => authed(req, res) && res.json({ data: [
    { id: 'm1', media_type: 'VIDEO', media_product_type: 'REELS', caption: 'Reel one', permalink: 'https://www.instagram.com/reel/m1/', thumbnail_url: 'https://cdn.example/m1.jpg', timestamp: '2026-10-20T15:00:00+0000', like_count: 900, comments_count: 100 },
    { id: 'm2', media_type: 'CAROUSEL_ALBUM', media_product_type: 'FEED', caption: 'Carousel', permalink: 'https://www.instagram.com/p/m2/', media_url: 'https://cdn.example/m2.jpg', timestamp: '2026-10-15T15:00:00+0000', like_count: 500, comments_count: 50 },
    { id: 'm3', media_type: 'IMAGE', media_product_type: 'FEED', caption: 'Photo', permalink: 'https://www.instagram.com/p/m3/', media_url: 'https://cdn.example/m3.jpg', timestamp: '2026-10-10T15:00:00+0000', like_count: 300, comments_count: 20 },
  ] }));
  a.get('/me/stories', (req, res) => authed(req, res) && res.json({ data: [{ id: 's1', media_type: 'IMAGE', media_product_type: 'STORY', permalink: 'https://www.instagram.com/stories/s1/', media_url: 'https://cdn.example/s1.jpg', timestamp: '2026-10-31T09:00:00+0000' }] }));
  const INS = { m1: { views: 30000, reach: 22000, saved: 400, shares: 100, ig_reels_avg_watch_time: 7400 }, m2: { views: 9000, reach: 7000, saved: 150, shares: 0 }, s1: { views: 1500, reach: 1400, shares: 3, replies: 6 } };
  a.get('/me/insights', (req, res) => {
    if (!authed(req, res)) return;
    const results = { age: [['18-24', 300], ['25-34', 900]], gender: [['F', 750], ['M', 250]], country: [['US', 800], ['CA', 200]] }[req.query.breakdown];
    res.json({ data: [{ name: 'follower_demographics', total_value: { breakdowns: [{ results: results.map(([k, v]) => ({ dimension_values: [k], value: v })) }] } }] });
  });
  a.get('/:id/insights', (req, res) => {
    if (!authed(req, res)) return;
    calls.push(`insights:${req.params.id}:${req.query.metric}`);
    if (req.params.id === 'm3') return res.status(400).json({ error: { message: 'Insights unavailable for this media', code: 100 } });
    const m = INS[req.params.id];
    res.json({ data: req.query.metric.split(',').filter((k) => k in m).map((name) => ({ name, period: 'lifetime', values: [{ value: m[name] }] })) });
  });
  return a;
}

async function call(method, path, body, token, opts = {}) {
  const res = await fetch(base + path, { method, redirect: 'manual', headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body), ...opts });
  const text = await res.text();
  return { status: res.status, location: res.headers.get('location'), body: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null };
}

before(async () => {
  fake = fakeInstagram().listen(0);
  await new Promise((r) => fake.once('listening', r));
  const f = `http://localhost:${fake.address().port}`;
  Object.assign(process.env, { IG_APP_ID: '123', IG_APP_SECRET: SECRET, IG_REDIRECT_URI: 'http://localhost/api/connect/instagram/callback', IG_AUTH_BASE: f, IG_OAUTH_BASE: f, IG_GRAPH_BASE: f });
  db = openDb(':memory:');
  seed(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => { server.close(); fake.close(); for (const k of ['IG_APP_ID', 'IG_APP_SECRET', 'IG_REDIRECT_URI', 'IG_AUTH_BASE', 'IG_OAUTH_BASE', 'IG_GRAPH_BASE']) delete process.env[k]; });

test('a creator connects Instagram and their profile shows verified, sourced metrics and content', async () => {
  const reg = (await call('POST', '/auth/register', { role: 'creator', email: 'real@creator.co', password: 'longenough', accept_terms: true, name: 'Real Creator', handle: 'realcreator' })).body;
  const token = reg.token;
  const me = reg.user.id;
  assert.equal((await call('GET', '/creator/connections', null, token)).body.instagram.configured, true);

  const { url } = (await call('POST', '/connect/instagram/start', {}, token)).body;
  const u = new URL(url);
  assert.equal(u.pathname, '/oauth/authorize');
  assert.equal(u.searchParams.get('scope'), 'instagram_business_basic,instagram_business_manage_insights');
  const state = u.searchParams.get('state');

  // A forged or tampered state is rejected.
  const forged = await call('GET', `/connect/instagram/callback?code=good-code&state=${state.slice(0, -2)}xx`);
  assert.match(forged.location, /instagram=error/);

  const cb = await call('GET', `/connect/instagram/callback?code=good-code&state=${encodeURIComponent(state)}`);
  assert.equal(cb.status, 302);
  assert.match(cb.location, /instagram=connected/);
  assert.deepEqual(calls.slice(0, 2), ['exchange', 'long-lived']);
  assert.ok(calls.some((c) => c === 'insights:m1:views,reach,saved,shares,ig_reels_avg_watch_time'));
  assert.ok(calls.some((c) => c === 'insights:s1:views,reach,shares,replies'));

  // The token is stored encrypted.
  const row = db.prepare('SELECT access_token_enc FROM ig_connections WHERE creator_id = ?').get(me);
  assert.notEqual(row.access_token_enc, 'long-token');
  assert.equal(decrypt(row.access_token_enc), 'long-token');

  const c = (await call('GET', `/creators/${me}`)).body;
  const igs = c.socials.find((s) => s.platform === 'instagram');
  assert.equal(igs.source, 'instagram_api');
  assert.equal(igs.followers, 20000);
  assert.equal(igs.handle, 'real.creator');
  // ER = avg(likes+comments+saves+shares) over 3 posts / followers = (1500 + 700 + 320) / 3 / 20000 = 4.2%
  assert.equal(igs.engagement_rate, 4.2);
  assert.equal(igs.avg_views, 30000);
  assert.deepEqual(c.verified_platforms, ['instagram']);
  assert.equal(c.data_source, 'verified');
  assert.equal(c.avatar_url, 'https://cdn.example/pic.jpg');
  assert.deepEqual(c.audience, { age: '25-34', female_pct: 75, top_country: 'US' });
  assert.equal(c.provenance['followers.instagram'].source, 'instagram_api');
  assert.match(c.provenance['followers.instagram'].method, /followers_count/);
  assert.equal(c.provenance.audience.source, 'instagram_api');
  assert.ok(c.provenance['followers.instagram'].fetched_at);
  assert.equal(c.history.length, 1);

  const media = (await call('GET', `/creators/${me}/media`)).body;
  assert.deepEqual(media.map((m) => m.kind).sort(), ['post', 'post', 'reel', 'story']);
  const reel = media.find((m) => m.external_id === 'm1');
  assert.equal(reel.views, 30000);
  assert.equal(reel.saves, 400);
  assert.equal(reel.permalink, 'https://www.instagram.com/reel/m1/');
  assert.equal(reel.source, 'instagram_api');
  assert.match(media.find((m) => m.external_id === 'm3').insights_error, /unavailable/); // partial data is flagged, not faked
  assert.equal((await call('GET', `/creators/${me}/media?kind=story`)).body.length, 1);

  // Verified numbers can't be overwritten by hand.
  assert.equal((await call('PUT', '/creator/socials/instagram', { handle: 'x', followers: 999999 }, token)).status, 409);

  // Manual refresh works and adds a history point.
  assert.equal((await call('POST', '/creator/connections/instagram/sync', {}, token)).body.followers, 20000);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM metric_snapshots WHERE creator_id = ?').get(me).n, 2);

  // Verified creators come first in discovery and can be filtered.
  const verifiedOnly = (await call('GET', '/creators?verified=1')).body;
  assert.deepEqual(verifiedOnly.map((x) => x.id), [me]);
  assert.equal((await call('GET', '/creators')).body[0].id, me);

  const cmp = (await call('GET', `/compare?ids=${me},${(await call('GET', '/creators?q=mayaglow')).body[0].id}`)).body;
  assert.deepEqual(cmp.map((x) => x.data_source), ['verified', 'demo']);
});

test('Meta data-deletion callback removes all Instagram data and returns a confirmation', async () => {
  const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: IG_USER, issued_at: Math.floor(Date.now() / 1000) })).toString('base64url');
  const bad = await call('POST', '/instagram/data-deletion', null, null, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `signed_request=xx.${payload}` });
  assert.equal(bad.status, 400);
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  const r = await call('POST', '/instagram/data-deletion', null, null, { headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `signed_request=${sig}.${payload}` });
  assert.equal(r.status, 200);
  assert.ok(r.body.confirmation_code);
  assert.match(r.body.url, new RegExp(`/data-deletion\\?code=${r.body.confirmation_code}$`));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ig_connections').get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM media WHERE source = 'instagram_api'").get().n, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM socials WHERE source = 'instagram_api'").get().n, 0);
  assert.equal((await call('GET', `/instagram/deletion-status/${r.body.confirmation_code}`)).body.status, 'completed');
});

test('connecting a demo creator replaces their demo Instagram content with verified content', async () => {
  const c = (await call('GET', '/creators?q=niacooks')).body[0];
  const login = (await call('POST', '/auth/login', { email: 'niacooks@creator.demo', password: 'password123' })).body.token;
  const state = new URL((await call('POST', '/connect/instagram/start', {}, login)).body.url).searchParams.get('state');
  assert.match((await call('GET', `/connect/instagram/callback?code=good-code&state=${encodeURIComponent(state)}`)).location, /connected/);
  const media = (await call('GET', `/creators/${c.id}/media`)).body;
  assert.ok(media.filter((m) => m.platform === 'instagram').every((m) => m.source === 'instagram_api'));
  assert.ok(media.some((m) => m.platform === 'tiktok' && m.source === 'demo')); // other platforms keep their (labelled) demo data
});

test('demo creators are labelled as demo data, never as verified', async () => {
  const c = (await call('GET', `/creators/${(await call('GET', '/creators?q=mayaglow')).body[0].id}`)).body;
  assert.equal(c.data_source, 'demo');
  assert.ok(c.socials.every((s) => s.source === 'demo'));
  assert.match(c.provenance['followers.instagram'].source_label, /Demo data/);
  const media = (await call('GET', `/creators/${c.id}/media`)).body;
  assert.ok(media.length > 0 && media.every((m) => m.source === 'demo'));
});
