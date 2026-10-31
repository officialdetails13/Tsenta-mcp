import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, compact, money, qs } from '../api.js';
import { useSession } from '../App.jsx';
import { Avatar, PLATFORM_LABEL, SocialChip, Stars, TierBadge, useLoad } from '../ui.jsx';

export default function Discover() {
  const { meta } = useSession();
  const [f, setF] = useState({ q: '', niche: '', platform: '', minFollowers: '', maxPrice: '', minEngagement: '', sort: 'recommended' });
  const [creators] = useLoad(() => api(`/creators${qs(f)}`), [JSON.stringify(f)]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <div className="page-head">
        <h1>Find creators</h1>
        <p className="muted">Compare reach, engagement, pricing and proven sales before you reach out.</p>
      </div>
      <div className="filters">
        <input className="search" placeholder="Search by name, niche or city…" value={f.q} onChange={set('q')} />
        <select value={f.niche} onChange={set('niche')}><option value="">All niches</option>{meta.niches.map((n) => <option key={n}>{n}</option>)}</select>
        <select value={f.platform} onChange={set('platform')}><option value="">All platforms</option>{meta.platforms.map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}</select>
        <select value={f.minFollowers} onChange={set('minFollowers')}>
          <option value="">Any size</option><option value="10000">10K+ (micro)</option><option value="100000">100K+ (mid)</option><option value="250000">250K+ (macro)</option>
        </select>
        <select value={f.maxPrice} onChange={set('maxPrice')}>
          <option value="">Any budget</option><option value="500">Under $500</option><option value="1000">Under $1,000</option><option value="2500">Under $2,500</option>
        </select>
        <select value={f.minEngagement} onChange={set('minEngagement')}>
          <option value="">Any engagement</option><option value="3">3%+ ER</option><option value="5">5%+ ER</option><option value="7">7%+ ER</option>
        </select>
        <select value={f.sort} onChange={set('sort')}>
          <option value="recommended">Recommended</option><option value="roi">Highest ROI</option><option value="rating">Top rated</option><option value="followers">Most followers</option><option value="price">Lowest price</option>
        </select>
      </div>
      {!creators ? <p className="muted">Loading…</p> : creators.length === 0 ? <p className="muted">No creators match those filters.</p> : (
        <div className="cards">
          {creators.map((c) => <CreatorCard key={c.id} c={c} />)}
        </div>
      )}
    </>
  );
}

function CreatorCard({ c }) {
  return (
    <Link to={`/creators/${c.id}`} className="card creator-card">
      <div className="row gap">
        <Avatar name={c.name} color={c.avatar_color} />
        <div className="grow">
          <div className="row between"><b>{c.name}</b><TierBadge tier={c.tier} /></div>
          <div className="muted small">@{c.handle} · {c.location}</div>
        </div>
      </div>
      <div className="chips">{c.niches.map((n) => <span key={n} className="chip">{n}</span>)}</div>
      <div className="chips">{c.socials.map((s) => <SocialChip key={s.id} s={s} />)}</div>
      <div className="creator-metrics">
        <div><span className="muted small">From</span><b>{money(c.starting_price_cents)}</b></div>
        <div><span className="muted small">Sales driven</span><b>{c.stats.revenue_driven_cents ? money(c.stats.revenue_driven_cents) : '—'}</b></div>
        <div><span className="muted small">ROI</span><b>{c.stats.avg_roi ? `${c.stats.avg_roi}×` : '—'}</b></div>
        <div><span className="muted small">Reach</span><b>{compact(c.total_followers)}</b></div>
      </div>
      <div className="row between small"><Stars value={c.stats.avg_rating} /><span className="muted">{c.stats.completed_deals} deal{c.stats.completed_deals === 1 ? '' : 's'} done</span></div>
    </Link>
  );
}
