import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, inDays, money, qs } from '../api.js';
import { useSession } from '../App.jsx';
import { ErrorNote, Modal, NicheChips, Platform, useAction, useLoad } from '../ui.jsx';

export default function Campaigns() {
  const { user, meta } = useSession();
  const isBiz = user?.role === 'business';
  const [view, setView] = useState(isBiz ? 'mine' : 'open');
  const [niche, setNiche] = useState('');
  const [list] = useLoad(() => api(`/campaigns${qs({ mine: view === 'mine' ? 1 : '', niche })}`), [view, niche]);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="page-head row between wrap">
        <div>
          <h1>{isBiz ? 'Campaigns' : 'Open briefs'}</h1>
          <p className="muted">{isBiz ? 'Post a brief and let creators pitch you.' : 'Brands looking for creators right now. Pitch your price.'}</p>
        </div>
        {isBiz && <button className="btn" onClick={() => setCreating(true)}>Post a campaign</button>}
      </div>
      <div className="filters">
        {isBiz && <div className="seg"><button className={view === 'mine' ? 'on' : ''} onClick={() => setView('mine')}>My campaigns</button><button className={view === 'open' ? 'on' : ''} onClick={() => setView('open')}>All open</button></div>}
        <select value={niche} onChange={(e) => setNiche(e.target.value)}><option value="">All niches</option>{meta.niches.map((n) => <option key={n}>{n}</option>)}</select>
      </div>
      {!list ? <p className="muted">Loading…</p> : list.length === 0 ? <p className="muted">No campaigns yet.</p> : (
        <div className="cards">
          {list.map((c) => (
            <Link key={c.id} to={`/campaigns/${c.id}`} className="card campaign-card">
              <div className="row between"><span className="muted small">{c.company}</span>{c.status === 'closed' && <span className="pill pill-gray">Closed</span>}</div>
              <h3>{c.title}</h3>
              <p className="clamp">{c.brief}</p>
              <div className="chips">{c.platforms.map((p) => <Platform key={p} p={p} />)}{c.niches.map((n) => <span key={n} className="chip">{n}</span>)}</div>
              <div className="row between small"><b>Budget {money(c.budget_cents)}</b><span className="muted">{c.pitches} pitches{c.deadline && ` · due ${c.deadline}`}</span></div>
            </Link>
          ))}
        </div>
      )}
      {creating && <NewCampaign onClose={() => setCreating(false)} />}
    </>
  );
}

function NewCampaign({ onClose }) {
  const { meta } = useSession();
  const navigate = useNavigate();
  const [f, setF] = useState({ title: '', brief: '', budget: '', deadline: inDays(30), niches: [], platforms: [] });
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    run(async () => navigate(`/campaigns/${(await api('/campaigns', { method: 'POST', body: f })).id}`));
  };
  return (
    <Modal title="Post a campaign" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label>Title<input required value={f.title} onChange={set('title')} placeholder="e.g. Holiday gift guide: 5 creators" /></label>
        <label>Brief<textarea required rows={5} value={f.brief} onChange={set('brief')} placeholder="Product, goal, must-haves, do's and don'ts" /></label>
        <div className="form-grid">
          <label>Total budget (USD)<input type="number" min="1" required value={f.budget} onChange={set('budget')} /></label>
          <label>Deadline<input type="date" value={f.deadline} onChange={set('deadline')} /></label>
        </div>
        <div><div className="label">Platforms</div><NicheChips all={meta.platforms} value={f.platforms} onChange={(platforms) => setF({ ...f, platforms })} /></div>
        <div><div className="label">Niches</div><NicheChips all={meta.niches} value={f.niches} onChange={(niches) => setF({ ...f, niches })} /></div>
        <ErrorNote error={error} />
        <button className="btn" disabled={busy}>Publish</button>
      </form>
    </Modal>
  );
}

