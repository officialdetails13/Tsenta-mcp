import React from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSession } from '../App.jsx';
import { Avatar, EscrowBadge, StatusPill, useLoad } from '../ui.jsx';

const ACTIVE = ['negotiating', 'contract', 'awaiting_funding', 'in_progress', 'draft_submitted', 'draft_approved', 'delivered', 'disputed'];

export default function Deals() {
  const { user } = useSession();
  const [deals] = useLoad(() => api('/deals'), []);
  if (!deals) return <p className="muted">Loading…</p>;
  const active = deals.filter((d) => ACTIVE.includes(d.status));
  const past = deals.filter((d) => !ACTIVE.includes(d.status));

  const needsMe = (d) =>
    (d.status === 'negotiating' && d.latest_offer_status === 'pending' && d.latest_offer_from !== user.id) ||
    ['contract', 'disputed'].includes(d.status) ||
    (user.role === 'business' && ['awaiting_funding', 'draft_submitted', 'delivered'].includes(d.status)) ||
    (user.role === 'creator' && ['in_progress', 'draft_approved'].includes(d.status));

  const row = (d) => (
    <Link key={d.id} to={`/deals/${d.id}`} className="list-row">
      {user.role === 'business' ? <Avatar name={d.creator_name} color={d.avatar_color} size={40} /> : <Avatar name={d.company} color="#334155" size={40} />}
      <div className="grow">
        <b>{d.title}</b>
        <div className="muted small">{user.role === 'business' ? `${d.creator_name} · @${d.handle}` : d.company}{d.deadline && ` · due ${d.deadline}`}</div>
      </div>
      <div className="right">
        <b>{money(d.price_cents ?? d.latest_offer_cents)}</b>
        <div className="row gap wrap end">{needsMe(d) && <span className="dot" title="Needs your action" />}<StatusPill status={d.status} /></div>
        <EscrowBadge cents={d.held_cents} />
      </div>
    </Link>
  );

  return (
    <>
      <div className="page-head row between wrap gap">
        <div><h1>Deals</h1><p className="muted">Negotiations, contracts and deliveries in one inbox.</p></div>
        <Link to="/deal-flow" className="btn ghost sm">How deals work · try a demo</Link>
      </div>
      <section className="card">
        <h2>Active ({active.length})</h2>
        {active.length ? <div className="stack">{active.map(row)}</div> : (
          <p className="muted">No active deals. {user.role === 'business' ? <Link to="/discover">Find a creator →</Link> : <Link to="/campaigns">Pitch on an open brief →</Link>}</p>
        )}
      </section>
      {past.length > 0 && <section className="card"><h2>History</h2><div className="stack">{past.map(row)}</div></section>}
    </>
  );
}
