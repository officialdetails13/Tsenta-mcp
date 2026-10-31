import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, compact, money } from '../api.js';
import { useSession } from '../App.jsx';
import { Avatar, Modal, MetricButton, Platform, ProvenanceModal, SourceBadge, Stars, Stat, TierBadge, ago, useAction, useLoad } from '../ui.jsx';
import OfferBuilder, { itemFromPackage, itemsFromDeal } from '../OfferBuilder.jsx';

export default function CreatorProfile() {
  const { id } = useParams();
  const { user } = useSession();
  const [c, , , error] = useLoad(() => api(`/creators/${id}`), [id]);
  const [offerFor, setOfferFor] = useState(null);
  const [prov, setProv] = useState(null);
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
        <Avatar name={c.name} color={c.avatar_color} size={84} src={c.avatar_url} />
        <div className="grow">
          <div className="row gap wrap"><h1>{c.name}</h1><TierBadge tier={c.tier} /><SourceBadge source={c.data_source} /></div>
          <div className="muted">@{c.handle} · {c.location}</div>
          {c.instagram.connected && <div className="small verified-line">✓ Instagram @{c.instagram.username} connected through the official API · data refreshed {ago(c.instagram.last_synced_at) ?? 'pending'}</div>}
          {c.data_source === 'demo' && <div className="small demo-line">Demo profile: a fictional creator. Every number here is sample data, labelled as such.</div>}
          <p>{c.bio}</p>
          <div className="chips">{c.niches.map((n) => <span key={n} className="chip">{n}</span>)}</div>
        </div>
        {canBuy && (
          <div className="stack">
            <button className="btn" onClick={() => setOfferFor({})}>Make a custom offer</button>
            <Link className="btn ghost sm" to={`/compare?ids=${c.id}`}>Compare with others</Link>
          </div>
        )}
        {!user && <Link className="btn" to="/join/business">Sign up to hire</Link>}
      </section>

      <section className="stats-row">
        <Stat label="Sales driven" value={<MetricButton p={c.provenance.sales} onOpen={setProv}>{money(c.stats.revenue_driven_cents)}</MetricButton>} sub={`${c.stats.conversions.toLocaleString()} conversions`} />
        <Stat label="Average ROI" value={<MetricButton p={c.provenance.sales} onOpen={setProv}>{c.stats.avg_roi ? `${c.stats.avg_roi}×` : '—'}</MetricButton>} sub="revenue ÷ fee" />
        <Stat label="Rating" value={<MetricButton p={c.provenance.rating} onOpen={setProv}>{c.stats.avg_rating ? `★ ${c.stats.avg_rating}` : '—'}</MetricButton>} sub={`${c.stats.review_count} reviews`} />
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
            <p className="small muted">Tap any number to see where it comes from.</p>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Platform</th><th>Followers</th><th>Engagement</th><th>Avg views</th><th>Source</th></tr></thead>
                <tbody>{c.socials.map((s) => (
                  <tr key={s.id}>
                    <td><Platform p={s.platform} /> {s.handle}</td>
                    <td><MetricButton p={c.provenance[`followers.${s.platform}`]} onOpen={setProv}>{compact(s.followers)}</MetricButton></td>
                    <td><MetricButton p={c.provenance[`er.${s.platform}`]} onOpen={setProv}>{s.engagement_rate}%</MetricButton></td>
                    <td><MetricButton p={c.provenance[`views.${s.platform}`]} onOpen={setProv}>{compact(s.avg_views)}</MetricButton></td>
                    <td><SourceBadge source={s.source} compact /><div className="small muted">{s.fetched_at ? ago(s.fetched_at) : ''}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            {c.history.length > 1 && <FollowerTrend history={c.history} />}
          </section>
          {Object.keys(c.audience).length > 0 && (
            <section className="card">
              <div className="row between"><h2>Audience</h2>{c.provenance.audience && <MetricButton p={c.provenance.audience} onOpen={setProv}><SourceBadge source={c.provenance.audience.source} /></MetricButton>}</div>
              <div className="kv">
                {c.audience.age && <><span>Core age</span><b>{c.audience.age}</b></>}
                {c.audience.female_pct != null && <><span>Female / male</span><b>{c.audience.female_pct}% / {100 - c.audience.female_pct}%</b></>}
                {c.audience.top_country && <><span>Top country</span><b>{c.audience.top_country}</b></>}
              </div>
            </section>
          )}
        </div>
      </div>

      <ContentGrid creator={c} />

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

      {prov && <ProvenanceModal p={prov} onClose={() => setProv(null)} />}
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

const KIND_TABS = [['', 'All'], ['reel', 'Reels'], ['post', 'Posts'], ['story', 'Stories'], ['video', 'Videos'], ['short', 'Shorts']];
const KIND_ICON = { reel: '▶', post: '▦', story: '◷', video: '▶', short: '▶' };

// The creator's published content with per-item stats.
function ContentGrid({ creator }) {
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState(null);
  const [items] = useLoad(() => api(`/creators/${creator.id}/media${kind ? `?kind=${kind}` : ''}`), [creator.id, kind]);
  const tabs = KIND_TABS.filter(([k]) => !k || creator.media_counts[k]);
  if (!Object.keys(creator.media_counts).length) {
    return <section className="card"><h2>Content</h2><p className="muted small">No content synced yet. When the creator connects Instagram, their Reels, posts and Stories appear here with live stats.</p></section>;
  }
  return (
    <section className="card">
      <div className="row between wrap gap"><h2>Content</h2><span className="small muted">Latest posts with their stats · tap one for details</span></div>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{label}{k && ` (${creator.media_counts[k]})`}</button>)}
      </div>
      {!items ? <p className="muted">Loading…</p> : (
        <div className="media-grid">
          {items.map((m) => (
            <button key={m.id} type="button" className={`media-tile kind-${m.kind}`} onClick={() => setOpen(m)}>
              <MediaThumb m={m} />
              <span className="media-kind">{KIND_ICON[m.kind]} {m.kind}</span>
              {m.source === 'instagram_api' && <span className="media-src" title="From Instagram’s API">✓</span>}
              <span className="media-stats">
                {m.views != null && <span>▶ {compact(m.views)}</span>}
                {m.likes != null && <span>♥ {compact(m.likes)}</span>}
                {m.comments != null && <span>💬 {compact(m.comments)}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
      {open && <MediaModal m={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function MediaThumb({ m }) {
  const [broken, setBroken] = useState(false);
  const src = m.thumbnail_url || m.media_url;
  if (src && !broken) return <img src={src} alt={m.caption.slice(0, 80)} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return <span className="media-ph"><span>{KIND_ICON[m.kind]}</span><span className="media-ph-cap">{m.caption}</span></span>;
}

function MediaModal({ m, onClose }) {
  const rows = [
    ['Views', m.views], ['Reach', m.reach], ['Likes', m.likes], ['Comments', m.comments], ['Saves', m.saves], ['Shares', m.shares], ['Replies', m.replies],
    ['Avg watch time', m.avg_watch_ms != null ? `${(m.avg_watch_ms / 1000).toFixed(1)}s` : null], ['Engagement rate', m.engagement_rate != null ? `${m.engagement_rate}%` : null],
  ].filter(([, v]) => v != null);
  return (
    <Modal title={`${m.kind[0].toUpperCase()}${m.kind.slice(1)} · ${m.posted_at.slice(0, 10)}`} onClose={onClose}>
      <div className="stack">
        <div className="media-detail"><MediaThumb m={m} /></div>
        {m.caption && <p className="small">{m.caption}</p>}
        <table className="table quote"><tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num"><b>{typeof v === 'number' ? v.toLocaleString() : v}</b></td></tr>)}</tbody></table>
        <div className="prov">
          <SourceBadge source={m.source} />
          <dl className="flow-facts">
            <dt>Source</dt><dd>{m.source_label}</dd>
            <dt>How it’s measured</dt><dd>{m.method}</dd>
            <dt>Last fetched</dt><dd>{ago(m.fetched_at)}</dd>
            {m.insights_error && <><dt>Note</dt><dd>Instagram didn’t return insights for this post ({m.insights_error}), so only likes and comments are shown. Nothing is estimated.</dd></>}
          </dl>
        </div>
        {m.permalink && <a className="btn ghost self-start" href={m.permalink} target="_blank" rel="noreferrer">View on Instagram ↗</a>}
      </div>
    </Modal>
  );
}

// Follower count over time from verified snapshots.
function FollowerTrend({ history }) {
  const vals = history.map((h) => h.followers);
  const min = Math.min(...vals), max = Math.max(...vals);
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${max === min ? 50 : 90 - ((v - min) / (max - min)) * 80}`).join(' ');
  return (
    <div className="trend" title={`${vals[0].toLocaleString()} → ${vals.at(-1).toLocaleString()} followers`}>
      <span className="small muted">Verified followers, last {history.length} syncs</span>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Followers from ${vals[0]} to ${vals.at(-1)}`}><polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg>
    </div>
  );
}
