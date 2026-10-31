import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, inDays, money } from '../api.js';
import { useSession } from '../App.jsx';
import { ErrorNote, PLATFORM_LABEL, Platform, StatusPill, useAction, useLoad } from '../ui.jsx';

export default function CampaignDetail() {
  const { id } = useParams();
  const { user } = useSession();
  const [c, reload, , error] = useLoad(() => api(`/campaigns/${id}`), [id]);
  const toggle = useAction();
  if (error) return <p className="error">{error}</p>;
  if (!c) return <p className="muted">Loading…</p>;
  const owner = user?.id === c.business_id;

  return (
    <>
      <section className="card">
        <div className="row between wrap">
          <span className="muted">{c.company} · {c.industry}</span>
          {owner && (
            <button className="btn ghost sm" disabled={toggle.busy} onClick={() => toggle.run(async () => { await api(`/campaigns/${c.id}`, { method: 'PATCH', body: { status: c.status === 'open' ? 'closed' : 'open' } }); reload(); })}>
              {c.status === 'open' ? 'Close campaign' : 'Reopen'}
            </button>
          )}
        </div>
        <h1>{c.title}</h1>
        <p className="prewrap">{c.brief}</p>
        <div className="chips">{c.platforms.map((p) => <span key={p} className="chip"><Platform p={p} /> {PLATFORM_LABEL[p]}</span>)}{c.niches.map((n) => <span key={n} className="chip">{n}</span>)}</div>
        <div className="kv"><span>Budget</span><b>{money(c.budget_cents)}</b>{c.deadline && <><span>Deadline</span><b>{c.deadline}</b></>}<span>Status</span><b>{c.status}</b></div>
      </section>

      {owner && (
        <section className="card">
          <h2>Pitches ({c.pitches.length})</h2>
          {c.pitches.length === 0 ? <p className="muted">No pitches yet. Creators matching your niches will see this brief.</p> : (
            <div className="stack">
              {c.pitches.map((p) => (
                <Link key={p.id} to={`/deals/${p.id}`} className="list-row">
                  <div className="grow"><b>{p.name}</b> <span className="muted">@{p.handle}</span><div className="small muted clamp">{p.note}</div></div>
                  <b>{money(p.price_cents)}</b><StatusPill status={p.status} />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {user?.role === 'creator' && (c.my_deal_id
        ? <section className="card"><p>You pitched on this brief. <Link to={`/deals/${c.my_deal_id}`}>Open the deal room →</Link></p></section>
        : c.status === 'open' && <PitchForm campaign={c} />)}
      {!user && <section className="card"><Link to="/join/creator" className="btn">Join as a creator to pitch</Link></section>}
    </>
  );
}

function PitchForm({ campaign }) {
  const navigate = useNavigate();
  const [f, setF] = useState({ price: '', deliverables: '', deadline: campaign.deadline || inDays(21), note: '' });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => navigate(`/deals/${(await api(`/campaigns/${campaign.id}/pitch`, { method: 'POST', body: f })).id}`));
  };
  return (
    <section className="card">
      <h2>Pitch this brand</h2>
      <form className="stack" onSubmit={submit}>
        <label>What you'll deliver<textarea required rows={3} value={f.deliverables} onChange={set('deliverables')} placeholder="e.g. 1 TikTok (45–60s) + 3 story frames with link" /></label>
        <div className="form-grid">
          <label>Your price (USD)<input type="number" min="1" required value={f.price} onChange={set('price')} /></label>
          <label>Go-live by<input type="date" required value={f.deadline} onChange={set('deadline')} /></label>
        </div>
        <label>Why you're a fit<textarea rows={3} value={f.note} onChange={set('note')} placeholder="Your audience, past results, creative idea" /></label>
        <ErrorNote error={error} />
        <button className="btn" disabled={busy}>Send pitch</button>
      </form>
    </section>
  );
}
