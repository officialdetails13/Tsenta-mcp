import React from 'react';
import { Link } from 'react-router-dom';
import { api, compact, money } from '../api.js';
import { Stat, useLoad } from '../ui.jsx';

export default function Dashboard() {
  const [d] = useLoad(() => api('/business/dashboard'), []);
  if (!d) return <p className="muted">Loading…</p>;
  const active = ['negotiating', 'contract', 'awaiting_funding', 'in_progress', 'delivered'].reduce((a, s) => a + (d.deals_by_status[s] || 0), 0);

  return (
    <>
      <div className="page-head"><h1>Results</h1><p className="muted">What your creator spend is returning, tracked by promo code.</p></div>
      <section className="stats-row">
        <Stat label="Total spend" value={money(d.spend_cents)} sub="incl. service fees" />
        <Stat label="Revenue driven" value={money(d.revenue_cents)} sub={`${d.conversions.toLocaleString()} conversions`} />
        <Stat label="ROAS" value={d.roas ? `${d.roas}×` : '—'} sub="revenue ÷ creator fees" />
        <Stat label="Impressions" value={compact(d.impressions)} sub={`${active} active deals`} />
      </section>
      <section className="card">
        <h2>Top creators by revenue</h2>
        {d.top_creators.length === 0 ? <p className="muted">No results yet. <Link to="/discover">Hire your first creator →</Link></p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Creator</th><th>Spend</th><th>Revenue</th><th>ROI</th><th></th></tr></thead>
              <tbody>{d.top_creators.map((c) => (
                <tr key={c.creator_id}><td><b>{c.name}</b> <span className="muted">@{c.handle}</span></td><td>{money(c.spend_cents)}</td><td>{money(c.revenue_cents)}</td>
                  <td><b>{(c.revenue_cents / c.spend_cents).toFixed(1)}×</b></td><td><Link to={`/creators/${c.creator_id}`}>Rehire →</Link></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
