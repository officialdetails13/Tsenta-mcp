import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, compact, money } from '../api.js';
import { useSession } from '../App.jsx';
import { toNext } from './Growth.jsx';
import { ErrorNote, Modal, NicheChips, PLATFORM_LABEL, Platform, TierBadge, useAction, useLoad } from '../ui.jsx';

export default function Studio() {
  const { user, refreshUser } = useSession();
  const [c, reload, setC] = useLoad(() => api(`/creators/${user.id}`), [user.id]);
  const [growth, reloadGrowth] = useLoad(() => api('/creator/growth'), []);
  const [editingPkg, setEditingPkg] = useState(null);
  if (!c || !growth) return <p className="muted">Loading…</p>;
  const refresh = () => { reload(); reloadGrowth(); };
  const verdicts = Object.fromEntries(growth.pricing.map((p) => [p.package_id, p]));

  return (
    <>
      <div className="page-head row between wrap">
        <div><h1>Creator Studio</h1><p className="muted">Your storefront: what brands see when they find you.</p></div>
        <Link to={`/creators/${user.id}`} className="btn ghost">View public profile</Link>
      </div>

      <section className="stats-row">
        <div className="stat"><div className="stat-value"><TierBadge tier={growth.tier} /></div><div className="stat-label">{growth.next_tier ? toNext(growth) : 'Top tier'}</div></div>
        <div className="stat"><div className="stat-value">{money(growth.earnings_cents)}</div><div className="stat-label">Earned</div></div>
        <div className="stat"><div className="stat-value">{money(growth.pipeline_cents)}</div><div className="stat-label">In pipeline</div></div>
        <div className="stat"><div className="stat-value">{compact(c.total_followers)}</div><div className="stat-label">Total reach</div></div>
      </section>

      <section className="card">
        <div className="row between"><h2>Packages</h2><button className="btn sm" onClick={() => setEditingPkg({})}>Add package</button></div>
        <p className="muted small">Like gigs: fixed-price offers brands can request in one tap. We check every price against the market.</p>
        <div className="stack">
          {c.packages.length === 0 && <p className="muted">Add your first package so brands can hire you.</p>}
          {c.packages.map((p) => {
            const v = verdicts[p.id];
            return (
              <div key={p.id} className="package">
                <div className="grow">
                  <div className="row gap"><Platform p={p.platform} /><b>{p.title}</b></div>
                  <div className="muted small">{p.quantity}× {p.deliverable_type} · {p.turnaround_days} days</div>
                  {v && <PriceVerdict v={v} />}
                </div>
                <div className="package-buy">
                  <div className="price">{money(p.price_cents)}</div>
                  <div className="row gap">
                    <button className="link" onClick={() => setEditingPkg(p)}>Edit</button>
                    <button className="link danger" onClick={async () => { if (confirm('Remove this package?')) { await api(`/creator/packages/${p.id}`, { method: 'DELETE' }); refresh(); } }}>Remove</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="two-col">
        <Socials c={c} onChange={(next) => { setC({ ...c, ...next }); reloadGrowth(); }} />
        <ProfileForm c={c} onSaved={(next) => { setC({ ...c, ...next }); reloadGrowth(); refreshUser(); }} />
      </div>

      {editingPkg && <PackageModal pkg={editingPkg} onClose={() => setEditingPkg(null)} onSaved={() => { setEditingPkg(null); refresh(); }} />}
    </>
  );
}

function PriceVerdict({ v }) {
  if (v.verdict === 'underpriced') return <div className="hint warn small">↑ About {Math.abs(v.diff_pct)}% under market. Similar creators get around {money(v.reference_cents * v.quantity)}.</div>;
  if (v.verdict === 'premium') return <div className="hint small">Premium: {v.diff_pct}% above market. Back it up with results and reviews.</div>;
  return <div className="hint ok small">✓ Priced at market</div>;
}

function PackageModal({ pkg, onClose, onSaved }) {
  const { meta } = useSession();
  const editing = !!pkg.id;
  const [f, setF] = useState({
    title: pkg.title ?? '', platform: pkg.platform === 'any' ? 'instagram' : pkg.platform ?? 'instagram', deliverable_type: pkg.deliverable_type ?? 'reel',
    quantity: pkg.quantity ?? 1, price: pkg.price_cents ? pkg.price_cents / 100 : '', turnaround_days: pkg.turnaround_days ?? 7, description: pkg.description ?? '',
  });
  const [rate, setRate] = useState(null);
  const { busy, error, run } = useAction();
  const types = [...meta.deliverables[f.platform], 'ugc'];
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'platform' && { deliverable_type: meta.deliverables[e.target.value][0] }) });

  useEffect(() => {
    api(`/creator/rate?platform=${f.platform}&deliverable_type=${f.deliverable_type}`).then(setRate).catch(() => setRate(null));
  }, [f.platform, f.deliverable_type]);

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await api(editing ? `/creator/packages/${pkg.id}` : '/creator/packages', { method: editing ? 'PUT' : 'POST', body: f });
      onSaved();
    });
  };
  const qty = Math.max(1, Number(f.quantity) || 1);

  return (
    <Modal title={editing ? 'Edit package' : 'New package'} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>Title<input required value={f.title} onChange={set('title')} placeholder="e.g. Product Reel with voiceover" /></label>
        <div className="form-grid">
          <label>Platform<select value={f.platform} onChange={set('platform')}>{meta.platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select></label>
          <label>Format<select value={f.deliverable_type} onChange={set('deliverable_type')}>{types.map((t) => <option key={t}>{t}</option>)}</select></label>
          <label>Quantity<input type="number" min="1" value={f.quantity} onChange={set('quantity')} /></label>
          <label>Delivery (days)<input type="number" min="1" value={f.turnaround_days} onChange={set('turnaround_days')} /></label>
        </div>
        {rate && (
          <div className="rate-box">
            <div className="row between wrap">
              <div><div className="muted small">Suggested for you</div><b className="big">{money(rate.suggestion.suggested_cents * qty)}</b>
                <div className="muted small">Range {money(rate.suggestion.low_cents * qty)}–{money(rate.suggestion.high_cents * qty)}</div></div>
              <div><div className="muted small">Market median</div><b className="big">{rate.market.median_cents ? money(rate.market.median_cents * qty) : '—'}</b>
                <div className="muted small">{rate.market.sample_size} similar creators</div></div>
              <button type="button" className="btn sm secondary" onClick={() => setF({ ...f, price: (rate.suggestion.high_cents * qty) / 100 })}>Use top of range</button>
            </div>
            <details><summary className="small">How we calculated this</summary>
              <ul className="small">{rate.suggestion.factors.map((x) => <li key={x.label}>{x.label}: <b>{x.value}</b></li>)}</ul>
            </details>
          </div>
        )}
        <label>Price (USD)<input type="number" min="1" required value={f.price} onChange={set('price')} /></label>
        <label>Description<textarea rows={3} value={f.description} onChange={set('description')} placeholder="What's included, revisions, usage rights" /></label>
        <ErrorNote error={error} />
        <button className="btn" disabled={busy}>{editing ? 'Save' : 'Publish package'}</button>
      </form>
    </Modal>
  );
}

function Socials({ c, onChange }) {
  const { meta } = useSession();
  const [f, setF] = useState({ platform: meta.platforms.find((p) => !c.socials.some((s) => s.platform === p)) || 'instagram', handle: '', followers: '', engagement_rate: '', avg_views: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = (e) => {
    e.preventDefault();
    run(async () => { onChange(await api(`/creator/socials/${f.platform}`, { method: 'PUT', body: { ...f, followers: Number(f.followers), engagement_rate: Number(f.engagement_rate), avg_views: Number(f.avg_views) } })); setF({ ...f, handle: '', followers: '', engagement_rate: '', avg_views: '' }); });
  };
  return (
    <section className="card">
      <h2>Social accounts</h2>
      <p className="muted small">Self-reported for now. Verified OAuth sync with Instagram, TikTok and YouTube is on the roadmap.</p>
      <div className="stack">
        {c.socials.map((s) => (
          <div key={s.id} className="list-row">
            <Platform p={s.platform} /><div className="grow"><b>{s.handle}</b><div className="muted small">{compact(s.followers)} followers · {s.engagement_rate}% ER · {compact(s.avg_views)} avg views</div></div>
            <button className="link" onClick={() => setF({ platform: s.platform, handle: s.handle, followers: s.followers, engagement_rate: s.engagement_rate, avg_views: s.avg_views })}>Edit</button>
            <button className="link danger" onClick={() => run(async () => onChange(await api(`/creator/socials/${s.platform}`, { method: 'DELETE' })))}>Remove</button>
          </div>
        ))}
      </div>
      <form className="stack" onSubmit={save}>
        <div className="form-grid">
          <label>Platform<select value={f.platform} onChange={set('platform')}>{meta.platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select></label>
          <label>Handle<input required value={f.handle} onChange={set('handle')} /></label>
          <label>Followers<input type="number" min="0" required value={f.followers} onChange={set('followers')} /></label>
          <label>Engagement %<input type="number" step="0.1" min="0" value={f.engagement_rate} onChange={set('engagement_rate')} /></label>
          <label>Avg views<input type="number" min="0" value={f.avg_views} onChange={set('avg_views')} /></label>
        </div>
        <ErrorNote error={error} />
        <button className="btn secondary self-start" disabled={busy}>Save account</button>
      </form>
    </section>
  );
}

function ProfileForm({ c, onSaved }) {
  const { meta } = useSession();
  const [f, setF] = useState({ name: c.name, handle: c.handle, bio: c.bio, location: c.location, niches: c.niches, audience: { age: '', female_pct: '', top_country: '', ...c.audience } });
  const { busy, error, run } = useAction();
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setAud = (k) => (e) => setF({ ...f, audience: { ...f.audience, [k]: e.target.value } });
  const submit = (e) => {
    e.preventDefault();
    const audience = Object.fromEntries(Object.entries(f.audience).filter(([, v]) => v !== '').map(([k, v]) => [k, k === 'female_pct' ? Number(v) : v]));
    run(async () => { onSaved(await api('/creator/profile', { method: 'PUT', body: { ...f, audience } })); setSaved(true); setTimeout(() => setSaved(false), 2000); });
  };
  return (
    <section className="card">
      <h2>Profile</h2>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label>Name<input value={f.name} onChange={set('name')} /></label>
          <label>Handle<input value={f.handle} onChange={set('handle')} /></label>
        </div>
        <label>Location<input value={f.location} onChange={set('location')} /></label>
        <label>Bio <span className="muted small">({f.bio.length}/80+ chars)</span><textarea rows={4} value={f.bio} onChange={set('bio')} placeholder="Who you are, who your audience is, and the results you get brands" /></label>
        <div><div className="label">Niches</div><NicheChips all={meta.niches} value={f.niches} onChange={(niches) => setF({ ...f, niches })} /></div>
        <div className="form-grid">
          <label>Audience age<select value={f.audience.age} onChange={setAud('age')}><option value="">—</option>{['13-17', '18-24', '25-34', '35-44', '45+'].map((a) => <option key={a}>{a}</option>)}</select></label>
          <label>% female<input type="number" min="0" max="100" value={f.audience.female_pct} onChange={setAud('female_pct')} /></label>
          <label>Top country<input value={f.audience.top_country} onChange={setAud('top_country')} /></label>
        </div>
        <ErrorNote error={error} />
        <button className="btn secondary self-start" disabled={busy}>{saved ? 'Saved ✓' : 'Save profile'}</button>
      </form>
    </section>
  );
}
