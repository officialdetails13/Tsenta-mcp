import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, compact, money } from '../api.js';
import { useSession } from '../App.jsx';
import { Avatar, ErrorNote, Modal, PLATFORM_LABEL, Platform, Stars, Stat, TierBadge, useAction, useLoad } from '../ui.jsx';
import OfferBuilder, { itemFromPackage, itemsFromDeal } from '../OfferBuilder.jsx';

export default function CreatorProfile() {
  const { id } = useParams();
  const { user } = useSession();
  const [c, , , error] = useLoad(() => api(`/creators/${id}`), [id]);
  const [offerFor, setOfferFor] = useState(null);
  const [params, setParams] = useSearchParams();
  const rebookId = params.get('rebook');
  useEffect(() => {
    if (rebookId && user?.role === 'business') api(`/deals/${rebookId}`).then((d) => setOfferFor({ rebook: d })).catch(() => {});
  }, [rebookId, user?.role]);
  if (error) return <p className="error">{error}</p>;
  if (!c) return <p className="muted">Loading…</p>;
  const canBuy = user?.role === 'business';

  return (
    <>
      <section className="card profile-head">
        <Avatar name={c.name} color={c.avatar_color} size={84} />
        <div className="grow">
          <div className="row gap wrap"><h1>{c.name}</h1><TierBadge tier={c.tier} /></div>
          <div className="muted">@{c.handle} · {c.location}</div>
          <p>{c.bio}</p>
          <div className="chips">{c.niches.map((n) => <span key={n} className="chip">{n}</span>)}</div>
        </div>
        {canBuy && <button className="btn" onClick={() => setOfferFor({})}>Make a custom offer</button>}
        {!user && <Link className="btn" to="/join/business">Sign up to hire</Link>}
      </section>

      <section className="stats-row">
        <Stat label="Sales driven" value={money(c.stats.revenue_driven_cents)} sub={`${c.stats.conversions.toLocaleString()} conversions`} />
        <Stat label="Average ROI" value={c.stats.avg_roi ? `${c.stats.avg_roi}×` : '—'} sub="revenue ÷ fee" />
        <Stat label="Rating" value={c.stats.avg_rating ? `★ ${c.stats.avg_rating}` : '—'} sub={`${c.stats.review_count} reviews`} />
        <Stat label="On-time" value={c.stats.on_time_rate != null ? `${Math.round(c.stats.on_time_rate * 100)}%` : '—'} sub={`${c.stats.completed_deals} completed`} />
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Packages</h2>
          {c.packages.length === 0 && <p className="muted">No packages listed yet.</p>}
          <div className="stack">
            {c.packages.map((p) => (
              <div key={p.id} className="package">
                <div className="grow">
                  <div className="row gap"><Platform p={p.platform} /><b>{p.title}</b></div>
                  <div className="muted small">{p.quantity}× {p.deliverable_type} · {p.turnaround_days}-day delivery</div>
                  {p.description && <div className="small">{p.description}</div>}
                </div>
                <div className="package-buy">
                  <div className="price">{money(p.price_cents)}</div>
                  {canBuy && <button className="btn sm" onClick={() => setOfferFor({ pkg: p })}>Request</button>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="stack">
          <section className="card">
            <h2>Channels</h2>
            <table className="table">
              <thead><tr><th>Platform</th><th>Followers</th><th>Engagement</th><th>Avg views</th></tr></thead>
              <tbody>{c.socials.map((s) => (
                <tr key={s.id}><td><Platform p={s.platform} /> {s.handle}</td><td>{compact(s.followers)}</td><td>{s.engagement_rate}%</td><td>{compact(s.avg_views)}</td></tr>
              ))}</tbody>
            </table>
          </section>
          {Object.keys(c.audience).length > 0 && (
            <section className="card">
              <h2>Audience</h2>
              <div className="kv">
                {c.audience.age && <><span>Core age</span><b>{c.audience.age}</b></>}
                {c.audience.female_pct != null && <><span>Female / male</span><b>{c.audience.female_pct}% / {100 - c.audience.female_pct}%</b></>}
                {c.audience.top_country && <><span>Top country</span><b>{c.audience.top_country}</b></>}
              </div>
            </section>
          )}
        </div>
      </div>

      {c.content_stats && (
        <section className="card">
          <h2>Content activity</h2>
          <p className="muted small">From the creator’s logged posts over the last 30 days.</p>
          <div className="stats-row compact">
            <div className="stat"><div className="stat-value">{c.content_stats.posts_per_week}</div><div className="stat-label">Posts / week</div></div>
            <div className="stat"><div className="stat-value">{c.content_stats.avg_er}%</div><div className="stat-label">Avg engagement</div></div>
            <div className="stat"><div className="stat-value">{compact(c.content_stats.avg_views)}</div><div className="stat-label">Avg views</div></div>
            <div className="stat"><div className="stat-value">{c.content_stats.avg_hold_3s != null ? `${c.content_stats.avg_hold_3s}%` : '—'}</div><div className="stat-label">3-second hold</div></div>
          </div>
        </section>
      )}

      {c.case_studies.length > 0 && (
        <section className="card">
          <h2>Proven results</h2>
          <p className="muted small">Measured with each deal's tracked promo code.</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Brand</th><th>Deliverable</th><th>Fee</th><th>Conversions</th><th>Revenue</th><th>ROI</th></tr></thead>
              <tbody>{c.case_studies.map((r, i) => (
                <tr key={i}><td>{r.company}<div className="muted small">{r.industry}</div></td><td>{r.title}</td><td>{money(r.price_cents)}</td>
                  <td>{r.conversions}</td><td>{money(r.revenue_cents)}</td><td><b>{(r.revenue_cents / r.price_cents).toFixed(1)}×</b></td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2>Reviews <Stars value={c.stats.avg_rating} /></h2>
        {c.reviews.length === 0 ? <p className="muted">No reviews yet.</p> : c.reviews.map((r, i) => (
          <div key={i} className="review"><div className="row between"><b>{r.company}</b><span className="stars">{'★'.repeat(r.rating)}</span></div><p>{r.body}</p></div>
        ))}
      </section>

      {offerFor && <OfferModal creator={c} pkg={offerFor.pkg} rebook={offerFor.rebook} onClose={() => { setOfferFor(null); if (rebookId) setParams({}, { replace: true }); }} />}
    </>
  );
}

function OfferModal({ creator, pkg, rebook, onClose }) {
  const { meta } = useSession();
  const navigate = useNavigate();
  const { busy, error, run } = useAction();
  const initial = rebook
    ? { title: rebook.title, items: itemsFromDeal(rebook.items), terms: rebook.terms, note: 'Booking you again: same deliverables as last time.' }
    : { title: pkg?.title ?? '', items: pkg ? [itemFromPackage(meta, pkg)] : undefined };
  const submit = (body) => run(async () => {
    const d = await api('/deals', { method: 'POST', body: { ...body, title: body.title || pkg?.title || initial.title, creator_id: creator.id, package_id: pkg?.id } });
    navigate(`/deals/${d.id}`);
  });
  return (
    <Modal title={rebook ? `Rebook ${creator.name}` : pkg ? `Request: ${pkg.title}` : `Custom offer to ${creator.name}`} onClose={onClose}>
      <OfferBuilder creatorId={creator.id} initial={initial} showTitle={!pkg} busy={busy} error={error} onSubmit={submit} />
      <p className="small muted">🔒 Nothing is charged now. When the creator accepts and you both sign, you deposit the fee into escrow. It’s released as you approve the draft and the live post.</p>
    </Modal>
  );
}
