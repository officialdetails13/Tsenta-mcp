import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSession } from '../App.jsx';
import { ErrorNote, EscrowBadge, StatusPill, useAction, useLoad } from '../ui.jsx';

const STEPS = [
  ['negotiating', 'Offer'], ['contract', 'Sign'], ['awaiting_funding', 'Fund'], ['in_progress', 'Draft'],
  ['draft_submitted', 'Review'], ['draft_approved', 'Post'], ['delivered', 'Approve'], ['completed', 'Paid'],
];
const FUNDED = ['in_progress', 'draft_submitted', 'draft_approved', 'delivered', 'disputed'];
const METRIC_LABEL = { views: 'views', conversions: 'conversions', revenue: 'tracked revenue' };

const bonusTarget = (d) => (d.bonus_metric === 'revenue' ? money(d.bonus_target) : Number(d.bonus_target).toLocaleString());
const dueIn = (iso) => {
  const h = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 36e5));
  return h >= 48 ? `${Math.round(h / 24)} days` : `${h} hours`;
};

export default function DealRoom() {
  const { id } = useParams();
  const { user } = useSession();
  const [d, , setD, loadError] = useLoad(() => api(`/deals/${id}`), [id]);
  const act = useAction();
  if (loadError) return <p className="error">{loadError}</p>;
  if (!d) return <p className="muted">Loading…</p>;

  const isBiz = d.my_side === 'business';
  const post = (path, body) => act.run(async () => setD(await api(`/deals/${d.id}${path}`, { method: 'POST', body })));
  const stepIdx = STEPS.findIndex(([s]) => s === (d.status === 'disputed' ? d.dispute_prev_status : d.status));
  const other = isBiz ? `${d.creator.name} (@${d.creator.handle})` : d.business.company;
  const p = { d, isBiz, post, busy: act.busy, me: user };

  return (
    <>
      <div className="page-head">
        <Link to="/deals" className="muted small">← All deals</Link>
        <div className="row between wrap gap"><h1>{d.title}</h1><div className="row gap wrap"><EscrowBadge cents={d.escrow.held_cents} /><StatusPill status={d.status} /></div></div>
        <p className="muted">With {isBiz ? <Link to={`/creators/${d.creator.id}`}>{other}</Link> : other}{d.campaign_id && <> · from <Link to={`/campaigns/${d.campaign_id}`}>campaign brief</Link></>}</p>
      </div>

      {stepIdx >= 0 && (
        <ol className="stepper">
          {STEPS.map(([s, label], i) => <li key={s} className={i < stepIdx || d.status === 'completed' ? 'done' : i === stepIdx ? 'now' : ''}>{label}</li>)}
        </ol>
      )}

      <div className="two-col deal-layout">
        <div className="stack">
          <ErrorNote error={act.error} />
          {d.status === 'disputed' && <Dispute {...p} />}
          {d.status === 'negotiating' && <Negotiation {...p} />}
          {d.contract_text && <Escrow {...p} />}
          {['in_progress', 'draft_submitted', 'draft_approved', 'delivered', 'completed'].includes(d.status) && <Work {...p} />}
          {['delivered', 'completed'].includes(d.status) && <Results d={d} setD={setD} isBiz={isBiz} />}
          {['completed', 'resolved'].includes(d.status) && <Review {...p} />}
          <div className="row gap wrap">
            {['negotiating', 'contract', 'awaiting_funding'].includes(d.status) && (
              <button className="btn ghost danger sm" disabled={act.busy} onClick={() => confirm('Cancel this deal?') && post('/cancel')}>Cancel deal</button>
            )}
            {FUNDED.slice(0, 4).includes(d.status) && <OpenDispute {...p} />}
          </div>
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
            <div className="row between"><b>{money(o.price_cents)}{o.bonus_cents > 0 && <span className="small"> + {money(o.bonus_cents)} bonus</span>}</b><span className="small muted">{o.from_user_id === me.id ? 'You' : 'Them'} · {o.status}</span></div>
            <div className="small">{o.deliverables}</div>
            <div className="small muted">Live by {o.deadline}{o.bonus_cents > 0 && ` · bonus at ${o.bonus_metric === 'revenue' ? money(o.bonus_target) : o.bonus_target.toLocaleString()} ${METRIC_LABEL[o.bonus_metric]}`}</div>
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

// Shared by new offers and counter-offers.
export function BonusFields({ f, set }) {
  const [open, setOpen] = useState(Number(f.bonus) > 0);
  if (!open) return <button type="button" className="link self-start" onClick={() => setOpen(true)}>+ Add a performance bonus (held in escrow)</button>;
  return (
    <fieldset className="bonus-box">
      <legend>Performance bonus</legend>
      <p className="small muted">Extra money held in escrow and paid only if the content hits the target within 30 days. Views are reported by the creator; conversions and revenue by the brand.</p>
      <div className="form-grid">
        <label>Bonus (USD)<input type="number" min="0" value={f.bonus} onChange={set('bonus')} /></label>
        <label>Paid when<select value={f.bonus_metric} onChange={set('bonus_metric')}><option value="views">Views reach</option><option value="conversions">Conversions reach</option><option value="revenue">Revenue (USD) reaches</option></select></label>
        <label>Target<input type="number" min="1" value={f.bonus_target} onChange={set('bonus_target')} /></label>
      </div>
    </fieldset>
  );
}

function OfferForm({ base, onSubmit, onCancel, busy }) {
  const [f, setF] = useState({
    price: base.price_cents / 100, deliverables: base.deliverables, deadline: base.deadline, note: '',
    bonus: base.bonus_cents ? base.bonus_cents / 100 : '', bonus_metric: base.bonus_metric || 'views',
    bonus_target: base.bonus_target ? (base.bonus_metric === 'revenue' ? base.bonus_target / 100 : base.bonus_target) : '',
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="stack counter" onSubmit={(e) => { e.preventDefault(); onSubmit(f); }}>
      <div className="form-grid">
        <label>Price (USD)<input type="number" min="1" required value={f.price} onChange={set('price')} /></label>
        <label>Live by<input type="date" required value={f.deadline} onChange={set('deadline')} /></label>
      </div>
      <label>Deliverables<textarea rows={2} required value={f.deliverables} onChange={set('deliverables')} /></label>
      <BonusFields f={f} set={set} />
      <label>Note<input value={f.note} onChange={set('note')} placeholder="Explain your counter" /></label>
      <div className="row gap"><button className="btn" disabled={busy}>Send counter-offer</button><button type="button" className="btn ghost" onClick={onCancel}>Cancel</button></div>
    </form>
  );
}

function Escrow({ d, isBiz, post, busy }) {
  const [showContract, setShowContract] = useState(d.status === 'contract');
  const mySig = isBiz ? d.business_signed_at : d.creator_signed_at;
  const e = d.escrow;
  const total = d.price_cents + d.bonus_cents;
  const pct = (c) => `${total ? (c / total) * 100 : 0}%`;
  const funded = e.funded_cents > 0;
  const LEDGER = { escrow_fund: 'Deposited to escrow', bonus_fund: 'Bonus deposited', buyer_fee: 'Brand service fee', payout: 'Released to creator', seller_fee: 'Platform fee (from release)', refund: 'Refunded to brand', fee_refund: 'Service fee refunded' };

  return (
    <section className="card escrow">
      <div className="row between"><h2>Escrow</h2><button className="link" onClick={() => setShowContract(!showContract)}>{showContract ? 'Hide contract' : 'View contract'}</button></div>

      {funded ? (
        <>
          <div className="escrow-bar" role="img" aria-label={`${money(e.released_cents)} released, ${money(e.held_cents)} held, ${money(e.refunded_cents)} refunded`}>
            {e.released_cents > 0 && <div className="seg-released" style={{ width: pct(e.released_cents) }} title={`Released ${money(e.released_cents)}`} />}
            {e.held_cents > 0 && <div className="seg-held" style={{ width: pct(e.held_cents) }} title={`Held ${money(e.held_cents)}`} />}
            {e.refunded_cents > 0 && <div className="seg-refunded" style={{ width: pct(e.refunded_cents) }} title={`Refunded ${money(e.refunded_cents)}`} />}
          </div>
          <div className="escrow-legend">
            <span><i className="seg-released" />Released {money(e.released_cents)}</span>
            <span><i className="seg-held" />Held {money(e.held_cents)}</span>
            {e.refunded_cents > 0 && <span><i className="seg-refunded" />Refunded {money(e.refunded_cents)}</span>}
          </div>
          {e.held_cents > 0 && (
            <p className="small">{isBiz
              ? 'The platform is holding this money. It is released only when you approve the work, if you don’t respond within the review window, or as agreed in a dispute.'
              : 'This money is secured. The brand has already paid it and can’t take it back on its own, so you can start work knowing you’ll be paid.'}</p>
          )}
        </>
      ) : <p className="small muted">The brand deposits {money(total)} before any work starts. The platform holds it and releases it in stages as the work is approved.</p>}

      <div className="kv">
        <span>Fee</span><b>{money(d.price_cents)}</b>
        {d.bonus_cents > 0 && <><span>Performance bonus</span><b>{money(d.bonus_cents)} at {bonusTarget(d)} {METRIC_LABEL[d.bonus_metric]} <span className={`pill pill-${{ paid: 'green', refunded: 'gray', held: 'violet' }[d.bonus_status] ?? 'gray'}`}>{d.bonus_status === 'none' ? 'not funded' : d.bonus_status}</span></b></>}
        <span>Release schedule</span><b>{d.policy.draft_release_pct}% on draft approval · {100 - d.policy.draft_release_pct}% on live approval</b>
        <span>{isBiz ? 'You deposit (incl. 5% fee)' : 'You receive (after 10% fee)'}</span><b>{money(isBiz ? d.fees.fund_total_cents : d.price_cents - d.fees.seller_fee_cents)}{!isBiz && d.bonus_cents > 0 && ' + bonus'}</b>
        <span>Deadline</span><b>{d.deadline}{d.overdue && <span className="pill pill-red"> overdue</span>}</b>
        <span>Promo code</span><b className="mono">{d.promo_code}</b>
        <span>Signatures</span><b>Brand {d.business_signed_at ? '✓' : '—'} · Creator {d.creator_signed_at ? '✓' : '—'}</b>
      </div>

      {showContract && <pre className="contract">{d.contract_text}</pre>}

      {d.status === 'contract' && !mySig && <button className="btn" disabled={busy} onClick={() => post('/sign')}>I agree: sign contract</button>}
      {d.status === 'contract' && mySig && <p className="muted small">You signed. Waiting for the other party.</p>}
      {d.status === 'awaiting_funding' && (isBiz
        ? <button className="btn" disabled={busy} onClick={() => post('/fund')}>🔒 Deposit {money(d.fees.fund_total_cents)} into escrow</button>
        : <p className="muted small">Fully signed. Waiting for the brand to deposit {money(total)} into escrow. Don’t start work until it shows as secured.</p>)}
      {d.overdue && isBiz && (
        <div className="hint warn">
          The deadline passed more than {d.policy.late_grace_days} days ago and the content isn’t live. You can reclaim the {money(e.held_cents)} still in escrow.
          <div><button className="btn sm secondary" disabled={busy} onClick={() => confirm(`Refund ${money(e.held_cents)} and end the deal?`) && post('/refund-overdue')}>Refund {money(e.held_cents)}</button></div>
        </div>
      )}

      {e.funded_cents > 0 && (
        <details className="ledger"><summary className="small">Escrow ledger ({d.transactions.length})</summary>
          <table className="table">
            <tbody>{d.transactions.map((t) => (
              <tr key={t.id}><td>{t.created_at.slice(0, 10)}</td><td>{LEDGER[t.type] ?? t.type}{t.note && <span className="muted"> · {t.note}</span>}</td><td className="num">{money(t.amount_cents, { exact: true })}</td></tr>
            ))}</tbody>
          </table>
        </details>
      )}
    </section>
  );
}

function Work({ d, isBiz, post, busy }) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState('');
  const [checks, setChecks] = useState(d.checklist.map(() => false));
  const s = d.status;

  return (
    <section className="card">
      <h2>Content</h2>
      {d.draft_url && (
        <div className="kv">
          <span>Draft</span><a href={d.draft_url} target="_blank" rel="noreferrer">{d.draft_url}</a>
          {d.draft_note && <><span>Creator note</span><span>{d.draft_note}</span></>}
          {d.draft_approved_at && <><span>Draft approved</span><b>✓ {d.draft_approved_at.slice(0, 10)}</b></>}
          {d.delivery_url && <><span>Live post</span><a href={d.delivery_url} target="_blank" rel="noreferrer">{d.delivery_url}</a></>}
        </div>
      )}

      {s === 'in_progress' && !isBiz && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); post('/draft', { url, note }); setUrl(''); }}>
          <p className="small">Escrow is funded. Share a draft (an unlisted link or a file) for the brand to approve <b>before</b> you post. Approval releases {d.policy.draft_release_pct}% of your fee.</p>
          <label>Draft link<input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" /></label>
          <label>Note for the brand<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="btn self-start" disabled={busy}>Submit draft for approval</button>
        </form>
      )}
      {s === 'in_progress' && isBiz && <p className="muted small">Funds are secured. The creator is working on a draft for you to review before anything goes live.</p>}

      {s === 'draft_submitted' && isBiz && (
        <div className="stack">
          <p className="small">Review the draft. Approving releases {money(d.price_cents * d.policy.draft_release_pct / 100)} to the creator and clears them to post. {d.review_due_at && <b>If you don’t respond within {dueIn(d.review_due_at)}, it’s approved automatically.</b>}</p>
          <button className="btn self-start" disabled={busy} onClick={() => post('/draft/approve')}>Approve draft</button>
          <div className="row gap"><input className="grow" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What should change?" /><button className="btn secondary" disabled={busy || !feedback} onClick={() => post('/draft/request-changes', { note: feedback })}>Request changes</button></div>
        </div>
      )}
      {s === 'draft_submitted' && !isBiz && <p className="muted small">Draft submitted. {d.review_due_at && `If the brand doesn’t respond, it’s approved automatically in ${dueIn(d.review_due_at)}.`}</p>}

      {s === 'draft_approved' && !isBiz && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); post('/deliver', { url, note, checklist: checks }); }}>
          <p className="small">Draft approved. Post it, then confirm the checklist from your contract.</p>
          <label>Live post URL<input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
          <div className="checklist-confirm">
            {d.checklist.map((item, i) => (
              <label key={i} className="check-row"><input type="checkbox" checked={checks[i]} onChange={(e) => setChecks(checks.map((c, j) => (j === i ? e.target.checked : c)))} />{item.text}</label>
            ))}
          </div>
          <label>Note for the brand<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="btn self-start" disabled={busy || !checks.every(Boolean)}>Submit live post</button>
        </form>
      )}
      {s === 'draft_approved' && isBiz && <p className="muted small">You approved the draft. The creator is posting it.</p>}

      {(s === 'delivered' || s === 'completed') && (
        <ul className="checklist small">{d.checklist.map((i, k) => <li key={k} className={i.confirmed ? 'done-plain' : ''}><span className="check">{i.confirmed ? '✓' : ''}</span>{i.text}</li>)}</ul>
      )}
      {s === 'delivered' && isBiz && (
        <div className="stack">
          <p className="small">The creator confirmed the checklist above. Check the live post. {d.review_due_at && <b>Auto-approves in {dueIn(d.review_due_at)}.</b>}</p>
          <button className="btn self-start" disabled={busy} onClick={() => post('/approve')}>Approve and release {money(d.escrow.held_cents - (d.bonus_status === 'held' ? d.escrow.held_bonus_cents : 0))}</button>
          <div className="row gap"><input className="grow" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What needs fixing on the live post?" /><button className="btn secondary" disabled={busy || !feedback} onClick={() => post('/request-revision', { note: feedback })}>Request fix</button></div>
        </div>
      )}
      {s === 'delivered' && !isBiz && <p className="muted small">Live post submitted. {d.review_due_at && `The rest of your fee is released when the brand approves, or automatically in ${dueIn(d.review_due_at)}.`}</p>}
      {s === 'completed' && <p className="small">✓ Approved. {isBiz ? 'Funds released to the creator.' : `${money(d.transactions.filter((t) => t.type === 'payout').reduce((a, t) => a + t.amount_cents, 0))} paid out to you so far.`}</p>}
    </section>
  );
}

function OpenDispute({ d, isBiz, post, busy }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pctVal, setPct] = useState(isBiz ? 0 : 100);
  if (!open) return <button className="btn ghost sm" onClick={() => setOpen(true)}>Open a dispute</button>;
  return (
    <section className="card grow">
      <h2>Open a dispute</h2>
      <p className="small muted">This freezes the {money(d.escrow.held_cents)} in escrow. Propose how it should be split; the other side can accept or counter. If you can’t agree, platform mediation decides.</p>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); post('/dispute', { reason, creator_pct: pctVal }); }}>
        <label>What went wrong?<textarea required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <label>Proposed split: {pctVal}% to creator ({money(d.escrow.held_cents * pctVal / 100)}), {100 - pctVal}% to brand
          <input type="range" min="0" max="100" step="5" value={pctVal} onChange={(e) => setPct(Number(e.target.value))} /></label>
        <div className="row gap"><button className="btn danger-solid" disabled={busy}>Freeze funds and open dispute</button><button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button></div>
      </form>
    </section>
  );
}

function Dispute({ d, me, post, busy }) {
  const mine = d.dispute_by === me.id;
  const [pctVal, setPct] = useState(d.dispute_creator_pct);
  const held = d.escrow.held_cents;
  return (
    <section className="card dispute">
      <h2>Dispute: funds frozen</h2>
      <p className="small"><b>Reason:</b> {d.dispute_reason}</p>
      <div className="kv">
        <span>Current proposal</span><b>{d.dispute_creator_pct}% to creator ({money(held * d.dispute_creator_pct / 100)}) · {100 - d.dispute_creator_pct}% to brand ({money(held * (100 - d.dispute_creator_pct) / 100)})</b>
        <span>Proposed by</span><b>{mine ? 'You' : 'The other party'}</b>
      </div>
      {mine ? <p className="small muted">Waiting for the other party to accept or counter. If you can’t agree, platform mediation will decide.</p> : (
        <div className="stack">
          <button className="btn self-start" disabled={busy} onClick={() => confirm('Accept this split and close the deal?') && post('/dispute/accept')}>Accept this split</button>
          <label>Or counter: {pctVal}% to creator<input type="range" min="0" max="100" step="5" value={pctVal} onChange={(e) => setPct(Number(e.target.value))} /></label>
          <button className="btn secondary self-start" disabled={busy || pctVal === d.dispute_creator_pct} onClick={() => post('/dispute/counter', { creator_pct: pctVal })}>Propose {pctVal}% / {100 - pctVal}%</button>
        </div>
      )}
      <button className="link self-start" disabled={busy} onClick={() => post('/dispute/withdraw')}>Withdraw dispute and continue the deal</button>
    </section>
  );
}

function Results({ d, setD, isBiz }) {
  const r = d.results;
  const [f, setF] = useState({ impressions: r?.impressions || '', clicks: r?.clicks || '', conversions: r?.conversions || '', revenue: r?.revenue_cents ? r.revenue_cents / 100 : '' });
  const [editing, setEditing] = useState(false);
  const { busy, error, run } = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const bonusMetricValue = r && { views: r.impressions, conversions: r.conversions, revenue: r.revenue_cents }[d.bonus_metric];
  return (
    <section className="card">
      <div className="row between"><h2>Results</h2>{!editing && <button className="link" onClick={() => setEditing(true)}>{isBiz ? 'Report sales' : 'Report views'}</button>}</div>
      {d.bonus_status === 'held' && (
        <div className="hint small">Bonus progress: <b>{d.bonus_metric === 'revenue' ? money(bonusMetricValue ?? 0) : (bonusMetricValue ?? 0).toLocaleString()}</b> of {bonusTarget(d)} {METRIC_LABEL[d.bonus_metric]}
          <div className="progress thin"><div style={{ width: `${Math.min(100, ((bonusMetricValue ?? 0) / d.bonus_target) * 100)}%` }} /></div></div>
      )}
      {r && (
        <div className="stats-row compact">
          <div className="stat"><div className="stat-value">{r.impressions.toLocaleString()}</div><div className="stat-label">Views (creator)</div></div>
          <div className="stat"><div className="stat-value">{r.clicks.toLocaleString()}</div><div className="stat-label">Clicks (brand)</div></div>
          <div className="stat"><div className="stat-value">{r.conversions.toLocaleString()}</div><div className="stat-label">Sales via {d.promo_code}</div></div>
          <div className="stat"><div className="stat-value">{money(r.revenue_cents)}</div><div className="stat-label">Revenue · {(r.revenue_cents / d.price_cents).toFixed(1)}× ROI</div></div>
        </div>
      )}
      {!r && !editing && <p className="small muted">No results yet. The creator reports views; the brand reports sales from code <b className="mono">{d.promo_code}</b>.</p>}
      {editing && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { setD(await api(`/deals/${d.id}/results`, { method: 'PUT', body: f })); setEditing(false); }); }}>
          <p className="small muted">{isBiz ? 'You report what your store and analytics see.' : 'You report what your platform analytics show.'} Each side reports only its own numbers, so a performance bonus can’t be blocked by the other side.</p>
          <div className="form-grid">
            {isBiz ? (
              <>
                <label>Clicks<input type="number" min="0" value={f.clicks} onChange={set('clicks')} /></label>
                <label>Conversions<input type="number" min="0" value={f.conversions} onChange={set('conversions')} /></label>
                <label>Revenue (USD)<input type="number" min="0" value={f.revenue} onChange={set('revenue')} /></label>
              </>
            ) : <label>Views / impressions<input type="number" min="0" value={f.impressions} onChange={set('impressions')} /></label>}
          </div>
          <ErrorNote error={error} />
          <div className="row gap"><button className="btn secondary" disabled={busy}>Save</button><button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button></div>
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
