import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, money } from '../api.js';
import { ErrorNote, Stat, ago, useAction, useLoad } from '../ui.jsx';

// Mediation console for ADMIN_EMAILS accounts: platform totals and open disputes.
export default function Admin() {
  const [o] = useLoad(() => api('/admin/overview'), []);
  const [disputes, reload, , error] = useLoad(() => api('/admin/disputes'), []);
  if (error) return <div className="center"><h2>Admins only</h2><p className="muted">{error}</p></div>;

  return (
    <>
      <div className="page-head"><h1>Admin</h1><p className="muted">Platform totals and disputes waiting for mediation.</p></div>
      {o && (
        <div className="stats-row">
          <Stat label="Users" value={o.users} sub={`${o.businesses} brands · ${o.creators} creators`} />
          <Stat label="Verified creators" value={o.verified_creators} sub="Instagram connected" />
          <Stat label="Held in escrow" value={money(o.held_in_escrow_cents)} />
          <Stat label="Platform fees" value={money(o.platform_fees_cents)} sub="net of refunds" />
        </div>
      )}
      <h2>Open disputes {disputes && <span className="muted">({disputes.length})</span>}</h2>
      {!disputes ? <p className="muted">Loading…</p> : disputes.length === 0 ? <p className="muted">No open disputes.</p> : (
        <div className="stack">{disputes.map((d) => <Dispute key={d.id} d={d} onDone={reload} />)}</div>
      )}
    </>
  );
}

function Dispute({ d, onDone }) {
  const [pct, setPct] = useState(d.dispute_creator_pct ?? 50);
  const [note, setNote] = useState('');
  const { busy, error, run } = useAction();
  const toCreator = Math.round((d.held_cents * pct) / 100);
  const resolve = (e) => {
    e.preventDefault();
    run(async () => { await api(`/admin/disputes/${d.id}/resolve`, { method: 'POST', body: { creator_pct: pct, note } }); onDone(); });
  };
  return (
    <article className="card stack">
      <div className="row between wrap gap">
        <div><Link to={`/deals/${d.id}`}><b>{d.title}</b></Link><div className="muted small">{d.company} ↔ {d.creator_name} (@{d.handle}) · opened {ago(d.disputed_at)} by the {d.proposed_by}</div></div>
        <span className="pill pill-red">Disputed · {money(d.held_cents)} held</span>
      </div>
      <p><b>Reason:</b> {d.dispute_reason || '—'}</p>
      <p className="small muted">The {d.proposed_by} proposed {d.dispute_creator_pct}% to the creator. Was in “{d.dispute_prev_status?.replace('_', ' ')}” before the dispute.
        {d.draft_url?.draft_url && <> Draft: <a href={d.draft_url.draft_url} target="_blank" rel="noreferrer">link</a>.</>}
        {d.draft_url?.delivery_url && <> Live post: <a href={d.draft_url.delivery_url} target="_blank" rel="noreferrer">link</a>.</>}
        {' '}Deadline {d.draft_url?.deadline}.</p>
      <details>
        <summary className="small">Last {d.messages.length} messages</summary>
        <ul className="admin-msgs small">{d.messages.map((m, i) => <li key={i}><b>{m.system ? 'Collabo' : m.name}</b> <span className="muted">{ago(m.created_at)}</span><div>{m.body}</div></li>)}</ul>
      </details>
      <form className="stack" onSubmit={resolve}>
        <label>Split: {pct}% to creator ({money(toCreator)}), {100 - pct}% back to brand ({money(d.held_cents - toCreator)})
          <input type="range" min="0" max="100" step="5" value={pct} onChange={(e) => setPct(Number(e.target.value))} />
        </label>
        <label>Note to both parties<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why you decided this split" /></label>
        <ErrorNote error={error} />
        <div><button className="btn" disabled={busy}>{busy ? 'Resolving…' : `Resolve: ${pct}% to creator`}</button></div>
      </form>
    </article>
  );
}
