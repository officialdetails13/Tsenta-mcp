import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSession } from '../App.jsx';
import { ErrorNote, StatusPill, useAction, useLoad } from '../ui.jsx';

const STEPS = [['negotiating', 'Negotiate'], ['contract', 'Sign'], ['awaiting_funding', 'Fund'], ['in_progress', 'Create'], ['delivered', 'Review'], ['completed', 'Done']];

export default function DealRoom() {
  const { id } = useParams();
  const { user } = useSession();
  const [d, , setD, loadError] = useLoad(() => api(`/deals/${id}`), [id]);
  const act = useAction();
  if (loadError) return <p className="error">{loadError}</p>;
  if (!d) return <p className="muted">Loading…</p>;

  const isBiz = d.my_side === 'business';
  const post = (path, body) => act.run(async () => setD(await api(`/deals/${d.id}${path}`, { method: 'POST', body })));
  const stepIdx = STEPS.findIndex(([s]) => s === d.status);
  const other = isBiz ? `${d.creator.name} (@${d.creator.handle})` : d.business.company;

  return (
    <>
      <div className="page-head">
        <Link to="/deals" className="muted small">← All deals</Link>
        <div className="row between wrap"><h1>{d.title}</h1><StatusPill status={d.status} /></div>
        <p className="muted">With {isBiz ? <Link to={`/creators/${d.creator.id}`}>{other}</Link> : other}{d.campaign_id && <> · from <Link to={`/campaigns/${d.campaign_id}`}>campaign brief</Link></>}</p>
      </div>

      {stepIdx >= 0 && (
        <ol className="stepper">
          {STEPS.map(([s, label], i) => <li key={s} className={i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''}>{label}</li>)}
        </ol>
      )}

      <div className="two-col deal-layout">
        <div className="stack">
          <ErrorNote error={act.error} />
          {d.status === 'negotiating' && <Negotiation d={d} me={user} post={post} busy={act.busy} />}
          {d.contract_text && <Contract d={d} isBiz={isBiz} post={post} busy={act.busy} />}
          {['in_progress', 'delivered', 'completed'].includes(d.status) && <Delivery d={d} isBiz={isBiz} post={post} busy={act.busy} />}
          {['delivered', 'completed'].includes(d.status) && <Results d={d} setD={setD} />}
          {d.status === 'completed' && <Review d={d} me={user} post={post} busy={act.busy} />}
          {['negotiating', 'contract', 'awaiting_funding'].includes(d.status) && (
            <button className="btn ghost danger sm self-start" disabled={act.busy} onClick={() => confirm('Cancel this deal?') && post('/cancel')}>Cancel deal</button>
          )}
        </div>
        <Chat d={d} setD={setD} />
      </div>
    </>
  );
}

function Negotiation({ d, me, post, busy }) {
  const pending = d.offers.find((o) => o.status === 'pending');
  const [countering, setCountering] = useState(false);
  const theirs = pending && pending.from_user_id !== me.id;
  return (
    <section className="card">
      <h2>Offers</h2>
      <div className="offers">
        {d.offers.map((o) => (
          <div key={o.id} className={`offer ${o.from_user_id === me.id ? 'mine' : ''} ${o.status}`}>
            <div className="row between"><b>{money(o.price_cents)}</b><span className="small muted">{o.from_user_id === me.id ? 'You' : 'Them'} · {o.status}</span></div>
            <div className="small">{o.deliverables}</div>
            <div className="small muted">Live by {o.deadline}</div>
            {o.note && <div className="small offer-note">“{o.note}”</div>}
          </div>
        ))}
      </div>
      {theirs && !countering && (
        <div className="row gap wrap">
          <button className="btn" disabled={busy} onClick={() => post(`/offers/${pending.id}/accept`)}>Accept {money(pending.price_cents)}</button>
          <button className="btn secondary" onClick={() => setCountering(true)}>Counter</button>
          <button className="btn ghost danger" disabled={busy} onClick={() => confirm('Decline and end this negotiation?') && post(`/offers/${pending.id}/decline`)}>Decline</button>
        </div>
      )}
      {pending && !theirs && !countering && (
        <p className="muted small">Waiting for their response. <button className="link" onClick={() => setCountering(true)}>Revise your offer</button></p>
      )}
      {countering && <OfferForm base={pending ?? d.offers.at(-1)} onCancel={() => setCountering(false)} onSubmit={async (b) => { await post('/offers', b); setCountering(false); }} busy={busy} />}
    </section>
  );
}

function OfferForm({ base, onSubmit, onCancel, busy }) {
  const [f, setF] = useState({ price: base.price_cents / 100, deliverables: base.deliverables, deadline: base.deadline, note: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="stack counter" onSubmit={(e) => { e.preventDefault(); onSubmit(f); }}>
      <div className="form-grid">
        <label>Price (USD)<input type="number" min="1" required value={f.price} onChange={set('price')} /></label>
        <label>Live by<input type="date" required value={f.deadline} onChange={set('deadline')} /></label>
      </div>
      <label>Deliverables<textarea rows={2} required value={f.deliverables} onChange={set('deliverables')} /></label>
      <label>Note<input value={f.note} onChange={set('note')} placeholder="Explain your counter" /></label>
      <div className="row gap"><button className="btn" disabled={busy}>Send counter-offer</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function Contract({ d, isBiz, post, busy }) {
  const [open, setOpen] = useState(d.status === 'contract');
  const mySig = isBiz ? d.business_signed_at : d.creator_signed_at;
  return (
    <section className="card">
      <div className="row between"><h2>Contract</h2><button className="link" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'View'}</button></div>
      <div className="kv">
        <span>Fee</span><b>{money(d.price_cents)}</b>
        <span>{isBiz ? 'You pay (incl. 5% service fee)' : 'You receive (after 10% fee)'}</span><b>{money(isBiz ? d.price_cents + d.fees.buyer_fee_cents : d.price_cents - d.fees.seller_fee_cents)}</b>
        <span>Deadline</span><b>{d.deadline}</b>
        <span>Promo code</span><b className="mono">{d.promo_code}</b>
        <span>Brand signed</span><b>{d.business_signed_at ? `✓ ${d.business_signed_at.slice(0, 10)}` : 'Pending'}</b>
        <span>Creator signed</span><b>{d.creator_signed_at ? `✓ ${d.creator_signed_at.slice(0, 10)}` : 'Pending'}</b>
      </div>
      {open && <pre className="contract">{d.contract_text}</pre>}
      {d.status === 'contract' && !mySig && <button className="btn" disabled={busy} onClick={() => post('/sign')}>I agree: sign contract</button>}
      {d.status === 'contract' && mySig && <p className="muted small">You signed. Waiting for the other party.</p>}
      {d.status === 'awaiting_funding' && (isBiz
        ? <button className="btn" disabled={busy} onClick={() => post('/fund')}>Fund escrow: {money(d.price_cents + d.fees.buyer_fee_cents)}</button>
        : <p className="muted small">Fully signed. Waiting for the brand to fund escrow before you start.</p>)}
    </section>
  );
}

function Delivery({ d, isBiz, post, busy }) {
  const [url, setUrl] = useState(d.delivery_url || '');
  const [note, setNote] = useState('');
  const [revision, setRevision] = useState('');
  return (
    <section className="card">
      <h2>Delivery</h2>
      {d.delivery_url && <div className="kv"><span>Content</span><a href={d.delivery_url} target="_blank" rel="noreferrer">{d.delivery_url}</a>{d.delivery_note && <><span>Note</span><span>{d.delivery_note}</span></>}</div>}
      {d.status === 'in_progress' && !isBiz && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); post('/deliver', { url, note }); }}>
          <p className="small muted">Escrow is funded. Post the content with code <b className="mono">{d.promo_code}</b> and the #ad disclosure, then submit the link.</p>
          <label>Live post URL<input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
          <label>Note for the brand<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="btn" disabled={busy}>Submit delivery</button>
        </form>
      )}
      {d.status === 'in_progress' && isBiz && <p className="muted small">Escrow funded. The creator is working on it.</p>}
      {d.status === 'delivered' && isBiz && (
        <div className="stack">
          <button className="btn" disabled={busy} onClick={() => post('/approve')}>Approve and release {money(d.price_cents)}</button>
          <div className="row gap">
            <input className="grow" value={revision} onChange={(e) => setRevision(e.target.value)} placeholder="What needs to change?" />
            <button className="btn secondary" disabled={busy || !revision} onClick={() => post('/request-revision', { note: revision })}>Request revision</button>
          </div>
        </div>
      )}
      {d.status === 'delivered' && !isBiz && <p className="muted small">Submitted. Waiting for the brand to approve.</p>}
      {d.status === 'completed' && <p className="small">✓ Approved{!isBiz && `: ${money(d.price_cents - d.fees.seller_fee_cents)} paid out to you`}.</p>}
    </section>
  );
}

function Results({ d, setD }) {
  const r = d.results;
  const [f, setF] = useState({ impressions: r?.impressions ?? '', clicks: r?.clicks ?? '', conversions: r?.conversions ?? '', revenue: r ? r.revenue_cents / 100 : '' });
  const [editing, setEditing] = useState(!r);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="card">
      <div className="row between"><h2>Results</h2>{r && !editing && <button className="link" onClick={() => setEditing(true)}>Update</button>}</div>
      {r && !editing ? (
        <div className="stats-row compact">
          <div className="stat"><div className="stat-value">{r.impressions.toLocaleString()}</div><div className="stat-label">Impressions</div></div>
          <div className="stat"><div className="stat-value">{r.clicks.toLocaleString()}</div><div className="stat-label">Clicks</div></div>
          <div className="stat"><div className="stat-value">{r.conversions.toLocaleString()}</div><div className="stat-label">Sales via {d.promo_code}</div></div>
          <div className="stat"><div className="stat-value">{money(r.revenue_cents)}</div><div className="stat-label">Revenue · {(r.revenue_cents / d.price_cents).toFixed(1)}× ROI</div></div>
        </div>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { setD(await api(`/deals/${d.id}/results`, { method: 'PUT', body: f })); setEditing(false); }); }}>
          <p className="small muted">Report performance (e.g. sales on code <b className="mono">{d.promo_code}</b>). This becomes part of the creator's public track record.</p>
          <div className="form-grid">
            <label>Impressions<input type="number" min="0" value={f.impressions} onChange={set('impressions')} /></label>
            <label>Clicks<input type="number" min="0" value={f.clicks} onChange={set('clicks')} /></label>
            <label>Conversions<input type="number" min="0" value={f.conversions} onChange={set('conversions')} /></label>
            <label>Revenue (USD)<input type="number" min="0" value={f.revenue} onChange={set('revenue')} /></label>
          </div>
          <ErrorNote error={error} />
          <button className="btn secondary self-start" disabled={busy}>Save results</button>
        </form>
      )}
    </section>
  );
}

function Review({ d, me, post, busy }) {
  const mine = d.reviews.find((r) => r.reviewer_id === me.id);
  const theirs = d.reviews.find((r) => r.reviewer_id !== me.id);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  return (
    <section className="card">
      <h2>Reviews</h2>
      {theirs && <div className="review"><b>They rated you {'★'.repeat(theirs.rating)}</b><p>{theirs.body}</p></div>}
      {mine ? <div className="review"><b>You rated {'★'.repeat(mine.rating)}</b><p>{mine.body}</p></div> : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); post('/review', { rating, body }); }}>
          <div className="rating-input">{[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} className={n <= rating ? 'on' : ''} onClick={() => setRating(n)} aria-label={`${n} stars`}>★</button>)}</div>
          <textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="How did it go?" />
          <button className="btn secondary self-start" disabled={busy}>Post review</button>
        </form>
      )}
    </section>
  );
}

function Chat({ d, setD }) {
  const [body, setBody] = useState('');
  const { busy, run } = useAction();
  const send = (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    run(async () => { setD(await api(`/deals/${d.id}/messages`, { method: 'POST', body: { body } })); setBody(''); });
  };
  return (
    <section className="card chat">
      <h2>Messages</h2>
      <div className="messages">
        {d.messages.length === 0 && <p className="muted small">No messages yet.</p>}
        {d.messages.map((m) => m.system
          ? <div key={m.id} className="msg system">{m.body}</div>
          : <div key={m.id} className={`msg ${m.user_id === (d.my_side === 'business' ? d.business_id : d.creator_id) ? 'mine' : ''}`}><div className="small muted">{m.name}</div>{m.body}</div>)}
      </div>
      <form className="row gap" onSubmit={send}>
        <input className="grow" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message…" />
        <button className="btn" disabled={busy}>Send</button>
      </form>
    </section>
  );
}
