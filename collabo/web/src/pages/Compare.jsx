import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, compact, money } from '../api.js';
import { Avatar, MetricButton, ProvenanceModal, SourceBadge, TierBadge, useLoad } from '../ui.jsx';

// Side-by-side view of 2–4 creators; every number keeps its source.
export default function Compare() {
  const [params] = useSearchParams();
  const ids = params.get('ids') ?? '';
  const [list, , , error] = useLoad(() => (ids.split(',').filter(Boolean).length >= 2 ? api(`/compare?ids=${ids}`) : Promise.resolve([])), [ids]);
  const [prov, setProv] = useState(null);
  if (error) return <p className="error">{error}</p>;
  if (!list) return <p className="muted">Loading…</p>;
  if (list.length < 2) return <section className="card"><h1>Compare creators</h1><p className="muted">Pick 2 to 4 creators on <Link to="/discover">Discover</Link> with the “Compare” checkbox.</p></section>;

  const ig = (c) => c.socials.find((s) => s.platform === 'instagram');
  const tt = (c) => c.socials.find((s) => s.platform === 'tiktok');
  // higher: true = more is better, false = less is better, null = no "best" (e.g. audience split).
  const best = (vals, higher = true) => {
    if (higher === null) return null;
    const nums = vals.filter((v) => typeof v === 'number');
    return nums.length < 2 ? null : (higher ? Math.max : Math.min)(...nums);
  };
  const rows = [
    ['Data source', (c) => <SourceBadge source={c.data_source} />],
    ['Instagram followers', (c) => ig(c)?.followers, (c, v) => <MetricButton p={c.provenance['followers.instagram']} onOpen={setProv}>{compact(v)}</MetricButton>],
    ['Instagram engagement', (c) => ig(c)?.engagement_rate, (c, v) => <MetricButton p={c.provenance['er.instagram']} onOpen={setProv}>{v}%</MetricButton>],
    ['Instagram avg views', (c) => ig(c)?.avg_views, (c, v) => <MetricButton p={c.provenance['views.instagram']} onOpen={setProv}>{compact(v)}</MetricButton>],
    ['TikTok followers', (c) => tt(c)?.followers, (c, v) => <MetricButton p={c.provenance['followers.tiktok']} onOpen={setProv}>{compact(v)}</MetricButton>],
    ['TikTok engagement', (c) => tt(c)?.engagement_rate, (c, v) => <MetricButton p={c.provenance['er.tiktok']} onOpen={setProv}>{v}%</MetricButton>],
    ['Total reach', (c) => c.total_followers, (c, v) => compact(v)],
    ['Starting price', (c) => (c.starting_price_cents != null ? c.starting_price_cents / 100 : null), (c, v) => money(v * 100), false],
    ['Sales driven', (c) => c.stats.revenue_driven_cents / 100 || null, (c, v) => <MetricButton p={c.provenance.sales} onOpen={setProv}>{money(v * 100)}</MetricButton>],
    ['Average ROI', (c) => c.stats.avg_roi, (c, v) => `${v}×`],
    ['Rating', (c) => c.stats.avg_rating, (c, v) => <MetricButton p={c.provenance.rating} onOpen={setProv}>★ {v}</MetricButton>],
    ['Completed deals', (c) => c.stats.completed_deals, (c, v) => v],
    ['On-time delivery', (c) => (c.stats.on_time_rate != null ? Math.round(c.stats.on_time_rate * 100) : null), (c, v) => `${v}%`],
    ['Audience core age', (c) => c.audience.age ?? null, (c, v) => v],
    ['Audience % female', (c) => c.audience.female_pct ?? null, (c, v) => `${v}%`, null],
    ['Content synced', (c) => Object.values(c.media_counts).reduce((a, b) => a + b, 0) || null, (c, v) => `${v} items`],
  ];

  return (
    <>
      <div className="page-head"><h1>Compare creators</h1><p className="muted">The best value in each row is highlighted. Tap a number to see where it comes from.</p></div>
      <section className="card">
        <div className="table-wrap">
          <table className="table compare-table">
            <thead>
              <tr><th />{list.map((c) => (
                <th key={c.id}>
                  <Link to={`/creators/${c.id}`} className="compare-head">
                    <Avatar name={c.name} color={c.avatar_color} size={44} src={c.avatar_url} />
                    <b>{c.name}</b><span className="small muted">@{c.handle}</span><TierBadge tier={c.tier} />
                  </Link>
                </th>
              ))}</tr>
            </thead>
            <tbody>
              {rows.map(([label, get, show, higher = true]) => {
                const vals = list.map(get);
                const top = show ? best(vals, higher) : null;
                return (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {list.map((c, i) => {
                      const v = vals[i];
                      return <td key={c.id} className={top != null && v === top ? 'best' : ''}>{!show ? v : v == null ? <span className="muted">—</span> : show(c, v)}</td>;
                    })}
                  </tr>
                );
              })}
              <tr><th scope="row" /> {list.map((c) => <td key={c.id}><Link className="btn sm" to={`/creators/${c.id}`}>View profile</Link></td>)}</tr>
            </tbody>
          </table>
        </div>
      </section>
      {prov && <ProvenanceModal p={prov} onClose={() => setProv(null)} />}
    </>
  );
}
