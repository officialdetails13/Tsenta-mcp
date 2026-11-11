// Consent, notifications (in-app + email), data export, account deletion and admin mediation.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seed, DEMO_PASSWORD } from '../server/seed.js';

let server, mail, base, db;
const sent = [];

before(async () => {
  const m = express();
  m.use(express.json());
  m.post('/emails', (req, res) => {
    if (req.headers.authorization !== 'Bearer re_test') return res.status(401).json({ message: 'bad key' });
    sent.push(req.body);
    res.json({ id: `email_${sent.length}` });
  });
  mail = m.listen(0);
  await new Promise((r) => mail.once('listening', r));
  Object.assign(process.env, { RESEND_API_KEY: 're_test', EMAIL_FROM: 'Collabo <hello@collabo.test>', RESEND_BASE: `http://localhost:${mail.address().port}`, ADMIN_EMAILS: 'ops@collabo.test' });
  db = openDb(':memory:');
  seed(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}/api`;
});
after(() => { server.close(); mail.close(); for (const k of ['RESEND_API_KEY', 'EMAIL_FROM', 'RESEND_BASE', 'ADMIN_EMAILS']) delete process.env[k]; });

async function call(method, path, body, token) {
  const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const login = async (email) => (await call('POST', '/auth/login', { email, password: DEMO_PASSWORD })).body.token;
const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const until = async (fn) => { for (let i = 0; i < 50; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); } };

async function fundedDeal(biz, creator, handle) {
  const id = (await call('GET', `/creators?q=${handle}`)).body[0].id;
  let d = (await call('POST', '/deals', { creator_id: id, price: 400, deliverables: '1 Reel', deadline: inDays(10) }, biz)).body;
  d = (await call('POST', `/deals/${d.id}/offers/${d.offers[0].id}/accept`, {}, creator)).body;
  await call('POST', `/deals/${d.id}/sign`, {}, biz);
  await call('POST', `/deals/${d.id}/sign`, {}, creator);
  return (await call('POST', `/deals/${d.id}/fund`, {}, biz)).body;
}

test('signing up requires accepting the terms', async () => {
  const no = await call('POST', '/auth/register', { role: 'business', email: 'a@b.co', password: 'longenough', name: 'A' });
  assert.equal(no.status, 400);
  assert.match(no.body.error, /Terms of Service/);
  const yes = await call('POST', '/auth/register', { role: 'business', email: 'a@b.co', password: 'longenough', name: 'A', accept_terms: true });
  assert.equal(yes.status, 201);
  assert.ok(yes.body.user.terms_accepted_at);
});

test('deal events notify the other party in-app and by email; reminders fire before auto-approval', async () => {
  const biz = await login('brand@fuelbar.co');
  const creator = await login('leowanders@creator.demo');
  sent.length = 0;
  const d = await fundedDeal(biz, creator, 'leowanders');

  const cn = (await call('GET', '/notifications', null, creator)).body;
  const titles = cn.items.map((n) => n.title);
  assert.ok(titles.some((t) => t.startsWith('New offer')));
  assert.ok(titles.some((t) => t.startsWith('Escrow funded')));
  assert.ok(!titles.some((t) => t.startsWith('Offer accepted')), 'the creator accepted, so they are not notified of their own action');
  assert.ok(cn.unread >= 3);
  const bn = (await call('GET', '/notifications', null, biz)).body.items.map((n) => n.title);
  assert.ok(bn.some((t) => t.startsWith('Offer accepted')));

  await until(() => sent.length >= 4);
  assert.ok(sent.some((e) => e.subject.startsWith('Collabo: New offer') && e.to[0] === 'leowanders@creator.demo'));
  assert.match(sent.find((e) => e.subject.includes('Escrow funded')).text, new RegExp(`/deals/${d.id}`));

  // Mark read.
  assert.equal((await call('POST', '/notifications/read', {}, creator)).body.unread, 0);

  // Reminder 24h before the draft auto-approves, sent once.
  await call('POST', `/deals/${d.id}/draft`, { url: 'https://drive.example/d' }, creator);
  db.prepare("UPDATE deals SET draft_submitted_at = datetime('now', '-2 days', '-1 hour') WHERE id = ?").run(d.id);
  await call('GET', `/deals/${d.id}`, null, biz);
  await call('GET', '/deals', null, biz);
  const reminders = (await call('GET', '/notifications', null, biz)).body.items.filter((n) => n.kind.startsWith('reminder_draft'));
  assert.equal(reminders.length, 1);
  assert.match(reminders[0].title, /auto-approves in under 24 hours/);

  // Turning email off stops emails but keeps in-app notifications.
  assert.equal((await call('PUT', '/me/preferences', { email_notifications: false }, creator)).body.email_notifications, false);
  const before = sent.length;
  await call('POST', `/deals/${d.id}/messages`, { body: 'Can you check the draft?' }, biz);
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(sent.length, before);
  assert.ok((await call('GET', '/notifications', null, creator)).body.items[0].title.startsWith('Message from'));
});

test('a user can export their data and delete their account', async () => {
  const reg = (await call('POST', '/auth/register', { role: 'creator', email: 'leaving@creator.co', password: 'longenough', accept_terms: true, name: 'Leaving Creator', handle: 'leaving' })).body;
  await call('PUT', '/creator/socials/tiktok', { handle: 'leaving', followers: 1200 }, reg.token);
  const biz = await login('brand@glowlab.co');
  const offer = (await call('POST', '/deals', { creator_id: reg.user.id, price: 150, deliverables: '1 TikTok', deadline: inDays(9) }, biz)).body;

  const exp = (await call('GET', '/me/export', null, reg.token)).body;
  assert.equal(exp.account.email, 'leaving@creator.co');
  assert.equal(exp.social_accounts[0].followers, 1200);
  assert.equal(exp.deals.length, 1);
  assert.ok(!JSON.stringify(exp).includes('password_hash'));

  assert.equal((await call('DELETE', '/me', { password: 'wrong-password' }, reg.token)).status, 403);
  assert.equal((await call('DELETE', '/me', { password: 'longenough' }, reg.token)).status, 204);

  assert.equal((await call('GET', '/me', null, reg.token)).status, 401); // old session no longer works
  assert.equal((await call('POST', '/auth/login', { email: 'leaving@creator.co', password: 'longenough' })).status, 401);
  assert.equal((await call('GET', `/creators/${reg.user.id}`)).status, 404);
  assert.ok(!(await call('GET', '/creators?q=leaving')).body.length);
  const d = (await call('GET', `/deals/${offer.id}`, null, biz)).body;
  assert.equal(d.status, 'cancelled'); // the brand's record stays, de-identified
  assert.equal(d.creator.name, 'Deleted user');
  assert.ok((await call('GET', '/notifications', null, biz)).body.items.some((n) => n.title.startsWith('Deal cancelled')));
});

test('accounts with money in escrow cannot be deleted', async () => {
  const biz = await login('brand@stackly.app');
  const creator = await login('ravibeats@creator.demo');
  await fundedDeal(biz, creator, 'ravibeats');
  const r = await call('DELETE', '/me', { password: DEMO_PASSWORD }, creator);
  assert.equal(r.status, 409);
  assert.match(r.body.error, /money in escrow/);
});

test('admins (ADMIN_EMAILS) see disputes and can resolve them; others cannot', async () => {
  const biz = await login('brand@glowlab.co');
  const creator = await login('theoplays@creator.demo');
  const d = await fundedDeal(biz, creator, 'theoplays');
  await call('POST', `/deals/${d.id}/dispute`, { reason: 'No response', creator_pct: 100 }, creator);

  assert.equal((await call('GET', '/admin/disputes', null, biz)).status, 403);
  const admin = (await call('POST', '/auth/register', { role: 'business', email: 'ops@collabo.test', password: 'longenough', accept_terms: true, name: 'Ops' })).body;
  assert.equal(admin.user.is_admin, true);
  const list = (await call('GET', '/admin/disputes', null, admin.token)).body;
  const item = list.find((x) => x.id === d.id);
  assert.equal(item.held_cents, 40000);
  assert.equal(item.proposed_by, 'creator');
  assert.ok((await call('GET', '/admin/overview', null, admin.token)).body.deals_by_status.disputed >= 1);

  assert.equal((await call('POST', `/admin/disputes/${d.id}/resolve`, { creator_pct: 70, note: 'Draft was delivered late but usable.' }, admin.token)).status, 200);
  const after = (await call('GET', `/deals/${d.id}`, null, creator)).body;
  assert.equal(after.status, 'resolved');
  assert.equal(after.escrow.released_cents, 28000);
  assert.ok(after.messages.some((m) => m.body.startsWith('Mediator’s note')));
  assert.ok((await call('GET', '/notifications', null, biz)).body.items.some((n) => n.title.startsWith('Dispute resolved')));
});
