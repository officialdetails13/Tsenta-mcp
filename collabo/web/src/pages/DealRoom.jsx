import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, money } from '../api.js';
import { useSession } from '../App.jsx';
import { ErrorNote, EscrowBadge, StatusPill, useAction, useLoad } from '../ui.jsx';
import DealFlow from '../DealFlow.jsx';
import OfferBuilder, { QuoteTable, BonusFields, itemsFromDeal } from '../OfferBuilder.jsx';

const FUNDED = ['in_progress', 'draft_submitted', 'draft_approved', 'delivered', 'disputed'];
const METRIC_LABEL = { views: 'views', conversions: 'conversions', revenue: 'tracked revenue' };
const bonusTarget = (d) => (d.bonus_metric === 'revenue' ? money(d.bonus_target) : Number(d.bonus_target).toLocaleString());
const dueIn = (iso) => {
  const h = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 36e5));
  return h >= 48 ? `${Math.round(h / 24)} days` : `${h} hours`;
};
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const parseMmss = (v) => {
  if (!v) return null;
  const m = String(v).match(/^(\d+):(\d{1,2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Number(v) || null;
};
const copy = (text) => navigator.clipboard?.writeText(text).catch(() => {});

export default function DealRoom() {
  const { id } = useParams();
  const { user, switchUser } = useSession();
  const [d, , setD, loadError] = useLoad(() => api(`/deals/${id}`), [id, user.id]);
  const act = useAction();
  if (loadError) return <p className="error">{loadError}</p>;
  if (!d) return <p className="muted">Loading…</p>;

  const isBiz = d.my_side === 'business';
  const post = (path, body) => act.run(async () => setD(await api(`/deals/${d.id}${path}`, { method: 'POST', body })));
  const other = isBiz ? `${d.creator.name} (@${d.creator.handle})` : d.business.company;
  const p = { d, setD, isBiz, post, busy: act.busy, me: user };
  const s = d.status;

  return (
    <>
      <div className="page-head">
        <Link to="/deals" className="muted small">← All deals</Link>
        <div className="row between wrap gap"><h1>{d.title}</h1><div className="row gap wrap"><EscrowBadge cents={d.escrow.held_cents} /><StatusPill status={s} /></div></div>
        <p className="muted">With {isBiz ? <Link to={`/creators/${d.creator.id}`}>{other}</Link> : other}{d.campaign_id && <> · from <Link to={`/campaigns/${d.campaign_id}`}>campaign brief</Link></>}</p>
      </div>

      {d.demo_switch && (
        <div className="demo-bar">
          <span>🎭 Demo deal. You’re the <b>{isBiz ? `brand (${d.business.company})` : `creator (@${d.creator.handle})`}</b>.</span>
          <button className="btn sm" disabled={act.busy} onClick={() => act.run(async () => switchUser(await api(`/demo/switch/${d.id}`, { method: 'POST' })))}>
            Switch to the {isBiz ? 'creator' : 'brand'} ⇄
          </button>
        </div>
      )}

      <DealFlow deal={d} mySide={isBiz ? 'brand' : 'creator'} />

      <div className="two-col deal-layout">
        <div className="stack">
          <ErrorNote error={act.error} />
          {s === 'disputed' && <Dispute {...p} />}
          {s === 'negotiating' && <Negotiation {...p} />}
          {d.contract_sections && <Contract {...p} />}
          {s === 'awaiting_funding' && <Funding {...p} />}
          {d.escrow.funded_cents > 0 && <Escrow {...p} />}
          {['in_progress', 'draft_submitted'].includes(s) && <DraftStep {...p} />}
          {s === 'draft_approved' && <PostStep {...p} />}
          {['delivered', 'completed'].includes(s) && <LiveStep {...p} />}
          {['delivered', 'completed'].includes(s) && <Results d={d} setD={setD} isBiz={isBiz} />}
          {['completed', 'resolved'].includes(s) && <Statement {...p} />}
          {['completed', 'resolved'].includes(s) && <Review {...p} />}
          <div className="row gap wrap">
            {['negotiating', 'contract', 'awaiting_funding'].includes(s) && (
              <button className="btn ghost danger sm" disabled={act.busy} onClick={() => confirm('Cancel this deal?') && post('/cancel')}>Cancel deal</button>
            )}
            {FUNDED.slice(0, 4).includes(s) && <OpenDispute {...p} />}
          </div>
        </div>
        <Chat d={d} setD={setD} />
      </div>
    </>
  );
}

// ---------- 1. Offer ----------
function TermsList({ labels }) {
  return labels?.length ? <ul className="terms-list">{labels.map((l) => <li key={l}>{l}</li>)}</ul> : null;
}

function Negotiation({ d, me, post, busy }) {
  const { meta } = useSession();
  const pending = d.offers.find((o) => o.status === 'pending');
  const [countering, setCountering] = useState(false);
  const theirs = pending && pending.from_user_id !== me.id;
  const base = pending ?? d.offers.at(-1);
  // Only the terms that change the price are worth calling out on the offer card.
  const termLabels = (o) => (o.terms ? Object.entries(meta.offer.term_options)
    .map(([k, opts]) => opts.find((x) => x.key === o.terms[k])).filter((x) => x && x.pct > 0).map((x) => `${x.label} (+${x.pct}%)`) : null);
  return (
    <section className="card">
      <h2>1. Offer</h2>
      <div className="offers">
        {d.offers.map((o) => (
          <div key={o.id} className={`offer ${o.from_user_id === me.id ? 'mine' : ''} ${o.status}`}>
            <div className="row between"><b className="offer-price">{money(o.price_cents)}{o.bonus_cents > 0 && <span className="small"> + {money(o.bonus_cents)} bonus</span>}</b><span className="small muted">{o.from_user_id === me.id ? 'You' : 'Them'} · {o.status}</span></div>
            {o.items ? <QuoteTable quote={o.breakdown} compact /> : <div className="small">{o.deliverables}</div>}
            <TermsList labels={termLabels(o)} />
            {o.terms?.custom && <div className="small"><b>Additional terms:</b> {o.terms.custom}</div>}
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
      {countering && (
        <div className="counter">
          <h3>Your counter-offer</h3>
          {base.items ? (
            <OfferBuilder
              creatorId={d.creator_id}
              initial={{ items: itemsFromDeal(base.items), terms: base.terms, deadline: base.deadline, bonus: base.bonus_cents ? base.bonus_cents / 100 : '', bonus_metric: base.bonus_metric || 'views', bonus_target: base.bonus_target ? (base.bonus_metric === 'revenue' ? base.bonus_target / 100 : base.bonus_target) : '' }}
              submitLabel="Send counter-offer" busy={busy} onCancel={() => setCountering(false)}
              onSubmit={async (b) => { await post('/offers', b); setCountering(false); }}
            />
          ) : <SimpleOfferForm base={base} busy={busy} onCancel={() => setCountering(false)} onSubmit={async (b) => { await post('/offers', b); setCountering(false); }} />}
        </div>
      )}
    </section>
  );
}

// Offers made before structured deliverables keep a price + text form.
function SimpleOfferForm({ base, onSubmit, onCancel, busy }) {
  const [f, setF] = useState({ price: base.price_cents / 100, deliverables: base.deliverables, deadline: base.deadline, note: '', bonus: base.bonus_cents ? base.bonus_cents / 100 : '', bonus_metric: base.bonus_metric || 'views', bonus_target: base.bonus_target || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit(f); }}>
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

// ---------- 2. Contract ----------
function Contract({ d, isBiz, post, busy }) {
  const [open, setOpen] = useState(d.status === 'contract');
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const side = isBiz ? 'business' : 'creator';
  const signed = (s) => d[`${s}_signed_at`];
  const download = () => {
    const url = URL.createObjectURL(new Blob([d.contract_text], { type: 'text/plain' }));
    Object.assign(document.createElement('a'), { href: url, download: `collabo-contract-${d.id}.txt` }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="card">
      <div className="row between wrap gap"><h2>2. Contract</h2>
        <div className="row gap"><button className="link" onClick={download}>Download</button><button className="link" onClick={() => setOpen(!open)}>{open ? 'Collapse' : 'View contract'}</button></div>
      </div>
      <div className="sig-row">
        {['business', 'creator'].map((s) => (
          <div key={s} className={`sig ${signed(s) ? 'done' : ''}`}>
            <span className="small muted">{s === 'business' ? d.business.company : `@${d.creator.handle}`}</span>
            {signed(s) ? <><span className="sig-name">{d[`${s}_signed_name`] || '✓ Signed'}</span><span className="small muted">Signed {signed(s).slice(0, 10)}</span></> : <span className="small">Not signed yet</span>}
          </div>
        ))}
      </div>
      {open && (
        <ol className="contract-doc">
          {d.contract_sections.map((sec) => (
            <li key={sec.n}>
              <h4>{sec.n}. {sec.title}</h4>
              <p>{sec.body}</p>
              {sec.schedule && (
                <table className="table compact"><tbody>{sec.schedule.map(([a, b]) => <tr key={a}><td>{a}</td><td className="num">{b}</td></tr>)}</tbody></table>
              )}
            </li>
          ))}
        </ol>
      )}
      {d.status === 'contract' && !signed(side) && (
        <form className="sign-box" onSubmit={(e) => { e.preventDefault(); post('/sign', { name }); }}>
          <label>Type your full legal name to sign<input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></label>
          {name && <div className="sig-preview">{name}</div>}
          <label className="check-row"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />I have read the contract and agree to its terms on behalf of {isBiz ? d.business.company : 'myself'}.</label>
          <button className="btn self-start" disabled={busy || !agree || name.trim().length < 2}>Sign contract</button>
        </form>
      )}
      {d.status === 'contract' && signed(side) && <p className="muted small">You signed. Waiting for the other party.</p>}
    </section>
  );
}

// ---------- 3. Funding ----------
function PaymentSchedule({ payment, isBiz }) {
  return (
    <table className="table schedule">
      <thead><tr><th>Released when</th><th className="num">From escrow</th><th className="num">Platform fee</th><th className="num">{isBiz ? 'Creator receives' : 'You receive'}</th></tr></thead>
      <tbody>{payment.schedule.map((r) => (
        <tr key={r.milestone}><td>{r.milestone}{r.pct ? ` (${r.pct}%)` : ''}{r.conditional && <div className="small muted">Only if the target is hit</div>}</td>
          <td className="num">{money(r.gross_cents, { exact: true })}</td><td className="num">−{money(r.fee_cents, { exact: true })}</td><td className="num"><b>{money(r.creator_net_cents, { exact: true })}</b></td></tr>
      ))}</tbody>
    </table>
  );
}

function Funding({ d, isBiz, post, busy }) {
  const pay = d.payment;
  const [method, setMethod] = useState('card');
  return (
    <section className="card">
      <h2>3. {isBiz ? 'Fund escrow' : 'Waiting for the deposit'}</h2>
      <h3 className="small muted">Payment breakdown</h3>
      <QuoteTable quote={pay.breakdown} />
      <table className="table quote">
        <tbody>
          {pay.bonus_cents > 0 && <tr><td>Performance bonus (held separately; returned if the target is missed)</td><td className="num">{money(pay.bonus_cents)}</td></tr>}
          <tr><td>Collabo service fee (5%)</td><td className="num">{money(pay.service_fee_cents, { exact: true })}</td></tr>
          <tr className="total grand"><td>{isBiz ? 'Total you deposit today' : 'Total the brand deposits'}</td><td className="num">{money(pay.total_due_cents, { exact: true })}</td></tr>
        </tbody>
      </table>

      <h3 className="small muted">When the money is released</h3>
      <PaymentSchedule payment={pay} isBiz={isBiz} />

      {isBiz ? (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); post('/fund', { method }); }}>
          <div className="pay-methods" role="radiogroup" aria-label="Payment method">
            {[['card', 'Card', 'Instant. Visa, Mastercard, Amex.'], ['bank', 'Bank transfer (ACH)', 'Usually 1–3 business days to clear.']].map(([k, label, sub]) => (
              <label key={k} className={`pay-method ${method === k ? 'on' : ''}`}>
                <input type="radio" name="method" value={k} checked={method === k} onChange={() => setMethod(k)} />
                <span><b>{label}</b><span className="small muted">{sub}</span></span>
              </label>
            ))}
          </div>
          <p className="small muted">🔒 Held by Collabo. You can’t be charged again for this deal, and nothing reaches the creator until you approve the draft or the review window passes. Payments are simulated in this demo; no card details are collected.</p>
          <button className="btn lg self-start" disabled={busy}>Deposit {money(pay.total_due_cents, { exact: true })} into escrow</button>
        </form>
      ) : <p className="small">Don’t start work until this shows as funded. The table above shows exactly what you’ll receive at each step.</p>}
    </section>
  );
}

function Escrow({ d, isBiz, post, busy }) {
  const e = d.escrow;
  const total = e.funded_cents || 1;
  const pct = (c) => `${(c / total) * 100}%`;
  const LEDGER = { escrow_fund: 'Deposited to escrow', bonus_fund: 'Bonus deposited', buyer_fee: 'Brand service fee', payout: 'Released to creator', seller_fee: 'Platform fee (from release)', refund: 'Refunded to brand', fee_refund: 'Service fee refunded' };
  return (
    <section className="card escrow">
      <div className="row between"><h2>Escrow</h2>{d.payment_method && <span className="small muted">Paid by {d.payment_method === 'bank' ? 'bank transfer' : 'card'}</span>}</div>
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
      {d.payment && <PaymentSchedule payment={d.payment} isBiz={isBiz} />}
      {d.overdue && isBiz && (
        <div className="hint warn">
          The deadline passed more than {d.policy.late_grace_days} days ago and the content isn’t live. You can reclaim the {money(e.held_cents)} still in escrow.
          <div><button className="btn sm secondary" disabled={busy} onClick={() => confirm(`Refund ${money(e.held_cents)} and end the deal?`) && post('/refund-overdue')}>Refund {money(e.held_cents)}</button></div>
        </div>
      )}
      <details className="ledger"><summary className="small">Escrow ledger ({d.transactions.length})</summary>
        <table className="table"><tbody>{d.transactions.map((t) => (
          <tr key={t.id}><td>{t.created_at.slice(0, 10)}</td><td>{LEDGER[t.type] ?? t.type}{t.note && <span className="muted"> · {t.note}</span>}</td><td className="num">{money(t.amount_cents, { exact: true })}</td></tr>
        ))}</tbody></table>
      </details>
    </section>
  );
}

// ---------- 4–5. Draft and review ----------
function useLiveCheck(dealId, fields, enabled = true) {
  const [r, setR] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setTimeout(() => api(`/deals/${dealId}/check`, { method: 'POST', body: fields }).then(setR).catch(() => {}), 400);
    return () => clearTimeout(t);
  }, [dealId, enabled, JSON.stringify(fields)]); // eslint-disable-line react-hooks/exhaustive-deps
  return r;
}

const STATUS_ICON = { pass: '✓', warn: '!', fail: '✕' };

function ReviewPanel({ r, title = 'Collabo review', onAddTag, onUseCaption, compact }) {
  if (!r) return null;
  return (
    <div className="review-panel">
      <div className="review-head">
        <div className={`score-ring score-${r.score >= 75 ? 'good' : r.score >= 50 ? 'ok' : 'bad'}`}><b>{r.score}</b><span>/100</span></div>
        <div><b>{title}</b><div className="small muted">Automated checks against your contract and best practice</div></div>
      </div>
      <ul className="checks">
        {r.checks.map((c) => (
          <li key={c.key} className={`check-${c.status}`}><span className="check-ico">{STATUS_ICON[c.status]}</span><div><b>{c.label}</b><div className="small muted">{c.detail}</div></div></li>
        ))}
      </ul>
      {!compact && (
        <>
          <div className="suggest">
            <span className="label">Suggested hashtags {onAddTag && <span className="muted">(tap to add)</span>}</span>
            <div className="chips">{r.suggested_hashtags.map((h) => <button type="button" key={h} className="chip selectable" onClick={() => (onAddTag ? onAddTag(h) : copy(h))}>{h}</button>)}</div>
          </div>
          <div className="suggest">
            <span className="label">Suggested words for this niche</span>
            <div className="chips">{r.suggested_words.map((w) => <span key={w} className="chip">{w}</span>)}</div>
          </div>
          <div className="suggest">
            <span className="label">Calls to action</span>
            <div className="chips">{r.suggested_ctas.map((w) => <button type="button" key={w} className="chip selectable" onClick={() => copy(w)} title="Copy">{w}</button>)}</div>
          </div>
          <div className="suggest">
            <span className="label">Suggested caption</span>
            <pre className="caption-box">{r.suggested_caption}</pre>
            <div className="row gap">{onUseCaption && <button type="button" className="btn ghost sm" onClick={() => onUseCaption(r.suggested_caption)}>Use this caption</button>}<button type="button" className="btn ghost sm" onClick={() => copy(r.suggested_caption)}>Copy</button></div>
          </div>
        </>
      )}
    </div>
  );
}

function AiReview({ d, setD }) {
  const { busy, error, run } = useAction();
  const ai = d.ai_review;
  return (
    <div className="ai-review">
      <div className="row between wrap gap">
        <b>✨ AI feedback</b>
        {d.ai_enabled && <button type="button" className="btn sm secondary" disabled={busy} onClick={() => run(async () => setD(await api(`/deals/${d.id}/ai-review`, { method: 'POST' })))}>{busy ? 'Reviewing…' : ai ? 'Run again' : 'Get AI feedback'}</button>}
      </div>
      {!d.ai_enabled && <p className="small muted">Written AI feedback is available when the server has an Anthropic API key (<code>ANTHROPIC_API_KEY</code>). The automated checks above work without it.</p>}
      <ErrorNote error={error} />
      {ai && (
        <div className="stack small">
          <p>{ai.summary}</p>
          {ai.strengths.length > 0 && <div><b>Working well</b><ul>{ai.strengths.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          {ai.improvements.length > 0 && <div><b>Improve</b><ul>{ai.improvements.map((x) => <li key={x}>{x}</li>)}</ul></div>}
          <div className="chips">{ai.suggested_hashtags.map((h) => <button type="button" key={h} className="chip selectable" onClick={() => copy(h)}>{h}</button>)}</div>
          {ai.suggested_caption && <pre className="caption-box">{ai.suggested_caption}</pre>}
          <span className="muted">Generated by {ai.model} · {ai.generated_at.slice(0, 10)}</span>
        </div>
      )}
    </div>
  );
}

function FeedbackThread({ d, setD, isBiz, canAdd }) {
  const { meta } = useSession();
  const [f, setF] = useState({ category: 'hook', at: '', body: '' });
  const { busy, error, run } = useAction();
  const rounds = [...new Set(d.feedback.map((x) => x.round))];
  const add = (e) => {
    e.preventDefault();
    run(async () => { setD(await api(`/deals/${d.id}/feedback`, { method: 'POST', body: { category: f.category, at_seconds: parseMmss(f.at), body: f.body } })); setF({ ...f, body: '', at: '' }); });
  };
  return (
    <div className="feedback">
      <b>Feedback</b>
      {rounds.length === 0 && <p className="small muted">No feedback yet.</p>}
      {rounds.map((r) => (
        <div key={r} className="fb-round">
          <div className="small muted">Draft {r}</div>
          {d.feedback.filter((x) => x.round === r).map((x) => (
            <div key={x.id} className={`fb-item ${x.resolved ? 'resolved' : ''}`}>
              <span className={`fb-cat cat-${x.category}`}>{x.category}</span>
              {x.at_seconds != null && <span className="fb-time">@ {mmss(x.at_seconds)}</span>}
              <span className="grow">{x.body}</span>
              <button type="button" className="link small" onClick={() => run(async () => setD(await api(`/deals/${d.id}/feedback/${x.id}/resolve`, { method: 'POST' })))}>{x.resolved ? 'Reopen' : 'Resolve'}</button>
            </div>
          ))}
        </div>
      ))}
      {canAdd && (
        <form className="fb-form" onSubmit={add}>
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category">{meta.feedback_categories.map((c) => <option key={c}>{c}</option>)}</select>
          <input className="fb-at" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} placeholder="0:05" aria-label="Timestamp (optional)" />
          <input className="grow" required value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder={isBiz ? 'What should change?' : 'Reply or ask a question'} />
          <button className="btn sm" disabled={busy}>Add</button>
        </form>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

function DraftStep({ d, setD, isBiz, post, busy }) {
  const s = d.status;
  const [f, setF] = useState({ url: '', caption: d.draft_caption ?? '', hashtags: d.draft_hashtags ?? '', script: d.draft_script ?? '', duration_s: d.draft_duration_s ?? '', note: '' });
  const [note, setNote] = useState('');
  const live = useLiveCheck(d.id, { caption: f.caption, hashtags: f.hashtags, script: f.script, duration_s: f.duration_s }, s === 'in_progress' && !isBiz);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const addTag = (t) => !f.hashtags.toLowerCase().includes(t.toLowerCase()) && setF({ ...f, hashtags: `${f.hashtags} ${t}`.trim() });
  const contractLen = (d.items ?? []).find((i) => i.duration_s && i.format !== 'story')?.duration_s;
  const openFb = d.feedback.filter((x) => !x.resolved);

  if (s === 'in_progress') {
    if (isBiz) return <section className="card"><h2>4. Draft</h2><p className="muted small">Funds are secured. The creator is working on {d.draft_round ? `draft ${d.draft_round + 1}` : 'a draft'} for you to review before anything goes live.</p>{d.feedback.length > 0 && <FeedbackThread d={d} setD={setD} isBiz canAdd={false} />}</section>;
    return (
      <section className="card">
        <h2>4. {d.draft_round ? `Draft ${d.draft_round + 1}: address the feedback` : 'Submit your draft'}</h2>
        {openFb.length > 0 && <div className="hint warn small"><b>{openFb.length} open feedback item{openFb.length > 1 ? 's' : ''}</b> from the brand. They’re marked resolved when you resubmit.</div>}
        {d.feedback.length > 0 && <FeedbackThread d={d} setD={setD} canAdd />}
        <form className="stack" onSubmit={(e) => { e.preventDefault(); post('/draft', f); }}>
          <p className="small">Share a private link to the draft (Google Drive, Dropbox, an unlisted video) plus the caption you plan to post. Approval releases {d.policy.draft_release_pct}% of your fee.</p>
          <label>Draft link<input type="url" required value={f.url} onChange={set('url')} placeholder="https://drive.google.com/…" /></label>
          <label>Script or opening line<textarea rows={3} value={f.script} onChange={set('script')} placeholder="What you say or show in the first seconds, then the rest of the script" /></label>
          <label>Caption<textarea rows={4} value={f.caption} onChange={set('caption')} placeholder={`Include #ad and code ${d.promo_code}`} /></label>
          <div className="form-grid">
            <label>Hashtags<input value={f.hashtags} onChange={set('hashtags')} placeholder="#ad #skincare" /></label>
            <label>Video length (sec){contractLen ? <span className="muted"> · contract: {contractLen}s</span> : null}<input type="number" min="1" value={f.duration_s} onChange={set('duration_s')} /></label>
          </div>
          <label>Note for the brand<input value={f.note} onChange={set('note')} /></label>
          <ReviewPanel r={live} title="Live check" onAddTag={addTag} onUseCaption={(c) => setF({ ...f, caption: c })} />
          <button className="btn self-start" disabled={busy}>Submit draft for approval</button>
        </form>
      </section>
    );
  }

  // draft_submitted: both sides see the draft, the review and the feedback.
  return (
    <section className="card">
      <h2>5. Review draft {d.draft_round}</h2>
      <div className="draft-view">
        <div className="kv">
          <span>Draft</span><a href={d.draft_url} target="_blank" rel="noreferrer">{d.draft_url}</a>
          {d.draft_duration_s ? <><span>Length</span><span>{d.draft_duration_s}s{contractLen ? ` (contract: ${contractLen}s)` : ''}</span></> : null}
          {d.draft_note && <><span>Creator note</span><span>{d.draft_note}</span></>}
        </div>
        {d.draft_script && <><span className="label">Script</span><pre className="caption-box">{d.draft_script}</pre></>}
        {(d.draft_caption || d.draft_hashtags) && <><span className="label">Caption</span><pre className="caption-box">{[d.draft_caption, d.draft_hashtags].filter(Boolean).join('\n\n')}</pre></>}
      </div>
      <ReviewPanel r={d.review} compact={isBiz} />
      <AiReview d={d} setD={setD} />
      <FeedbackThread d={d} setD={setD} isBiz={isBiz} canAdd />
      {isBiz ? (
        <div className="stack">
          <p className="small">Approving releases {money(d.price_cents * d.policy.draft_release_pct / 100)} to the creator and clears them to post. {d.review_due_at && <b>No response within {dueIn(d.review_due_at)} counts as approval.</b>} Your contract includes {d.terms.revisions} revision round{d.terms.revisions > 1 ? 's' : ''}.</p>
          <div className="row gap wrap">
            <button className="btn" disabled={busy} onClick={() => post('/draft/approve')}>Approve draft</button>
            <input className="grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Overall note (optional if you added feedback)" />
            <button className="btn secondary" disabled={busy || (!note && !openFb.length)} onClick={() => post('/draft/request-changes', { note })}>Request changes{openFb.length ? ` (${openFb.length})` : ''}</button>
          </div>
        </div>
      ) : <p className="muted small">Submitted. {d.review_due_at && `If the brand doesn’t respond, it’s approved automatically in ${dueIn(d.review_due_at)}.`}</p>}
    </section>
  );
}

// ---------- 6. Post ----------
function PostStep({ d, isBiz, post, busy }) {
  const kit = d.post_kit;
  const [caption, setCaption] = useState(d.draft_caption || kit?.caption || '');
  const [tags, setTags] = useState(new Set((kit?.hashtags ?? []).slice(0, 6)));
  const [url, setUrl] = useState('');
  const [checks, setChecks] = useState(d.checklist.map(() => false));
  const hashtags = [...tags].join(' ');
  const live = useLiveCheck(d.id, { caption, hashtags }, !isBiz);
  const toggle = (h) => { const n = new Set(tags); n.has(h) ? n.delete(h) : n.add(h); setTags(n); };
  if (isBiz) {
    return (
      <section className="card">
        <h2>6. Post</h2>
        <p className="muted small">You approved the draft. The creator is posting it with code <b className="mono">{d.promo_code}</b>. You’ll check the live post next.</p>
        {kit?.hashtags && <div className="suggest"><span className="label">Hashtags suggested to the creator</span><div className="chips">{kit.hashtags.map((h) => <span key={h} className="chip">{h}</span>)}</div></div>}
      </section>
    );
  }
  return (
    <section className="card">
      <h2>6. Post it live</h2>
      <div className="post-kit">
        <div className="kit-tiles">
          <div className="kit-tile"><span className="label">Best day for you</span><b>{kit.best_day ? kit.best_day.day : '—'}</b><span className="small muted">{kit.best_day ? `${kit.best_day.avg_er}% avg engagement across ${kit.best_day.n} posts` : 'Log posts in Level up to learn your best day'}</span></div>
          <div className="kit-tile"><span className="label">Promo code</span><b className="mono">{d.promo_code}</b><button type="button" className="link small" onClick={() => copy(d.promo_code)}>Copy</button></div>
        </div>
        <label>Final caption<textarea rows={5} value={caption} onChange={(e) => setCaption(e.target.value)} /></label>
        <div className="row gap">
          <button type="button" className="btn ghost sm" onClick={() => setCaption(kit.caption)}>Use suggested caption</button>
          <button type="button" className="btn ghost sm" onClick={() => copy(`${caption}\n\n${hashtags}`)}>Copy caption + hashtags</button>
        </div>
        <div className="suggest"><span className="label">Suggested hashtags (tap to include)</span>
          <div className="chips">{kit.hashtags.map((h) => <button type="button" key={h} className={`chip selectable ${tags.has(h) ? 'on' : ''}`} onClick={() => toggle(h)}>{h}</button>)}</div>
        </div>
        {kit.trending.length > 0 && (
          <div className="suggest"><span className="label">Trending in your niche right now</span>
            <ul className="small">{kit.trending.map((t) => <li key={t.name}><b>{t.name}</b> ({t.platform}): {t.how_to}</li>)}</ul>
          </div>
        )}
        <ul className="tips small">{kit.tips.map((t) => <li key={t}>{t}</li>)}</ul>
        <ReviewPanel r={live} title="Caption check" compact />
      </div>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); post('/deliver', { url, caption, hashtags, checklist: checks }); }}>
        <label>Live post URL<input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></label>
        <div className="checklist-confirm">
          <span className="label">Confirm the contract checklist</span>
          {d.checklist.map((item, i) => (
            <label key={i} className="check-row"><input type="checkbox" checked={checks[i]} onChange={(e) => setChecks(checks.map((c, j) => (j === i ? e.target.checked : c)))} />{item.text}</label>
          ))}
        </div>
        <button className="btn self-start" disabled={busy || !checks.every(Boolean)}>Submit live post</button>
      </form>
    </section>
  );
}

// ---------- 7. Approve ----------
function LiveStep({ d, setD, isBiz, post, busy }) {
  const [feedback, setFeedback] = useState('');
  // Tick boxes instantly; the server copy catches up in the background.
  const [verified, setVerified] = useState(d.checklist.map((_, i) => Boolean(d.brand_verified[i])));
  const nVerified = verified.filter(Boolean).length;
  const toggle = (i) => {
    const next = verified.map((v, j) => (j === i ? !v : v));
    setVerified(next);
    api(`/deals/${d.id}/verify`, { method: 'POST', body: { verified: next } }).catch(() => {});
  };
  return (
    <section className="card">
      <h2>7. {d.status === 'completed' ? 'Live post' : isBiz ? 'Check and approve the live post' : 'Waiting for approval'}</h2>
      <div className="kv">
        <span>Live post</span><a href={d.delivery_url} target="_blank" rel="noreferrer">{d.delivery_url}</a>
        {d.delivery_note && <><span>Creator note</span><span>{d.delivery_note}</span></>}
      </div>
      {(d.post_caption || d.post_hashtags) && <pre className="caption-box">{[d.post_caption, d.post_hashtags].filter(Boolean).join('\n\n')}</pre>}
      <div className="verify">
        <div className="row between"><span className="label">Delivery checklist</span><span className="small muted">Creator confirmed all · {isBiz ? `you verified ${nVerified}/${d.checklist.length}` : `brand verified ${nVerified}/${d.checklist.length}`}</span></div>
        {d.checklist.map((item, i) => (
          <label key={i} className="check-row">
            <input type="checkbox" checked={verified[i]} disabled={!isBiz || d.status !== 'delivered'} onChange={() => toggle(i)} />
            <span>{item.text} <span className="small muted">· creator ✓</span></span>
          </label>
        ))}
      </div>
      {d.status === 'delivered' && isBiz && (
        <div className="stack">
          <p className="small">{d.review_due_at && <b>Auto-approves in {dueIn(d.review_due_at)}.</b>} Approving releases the remaining {money(d.escrow.held_fee_cents)}.</p>
          <button className="btn self-start" disabled={busy} onClick={() => post('/approve')}>Approve and release {money(d.escrow.held_fee_cents)}</button>
          <div className="row gap"><input className="grow" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What needs fixing on the live post?" /><button className="btn secondary" disabled={busy || !feedback} onClick={() => post('/request-revision', { note: feedback })}>Request fix</button></div>
        </div>
      )}
      {d.status === 'delivered' && !isBiz && <p className="muted small">Live post submitted. {d.review_due_at && `The rest of your fee is released when the brand approves, or automatically in ${dueIn(d.review_due_at)}.`}</p>}
    </section>
  );
}

// ---------- 8. Paid ----------
function Statement({ d, isBiz }) {
  const navigate = useNavigate();
  const sum = (type, note) => d.transactions.filter((t) => t.type === type && (note == null || (note === 'bonus' ? t.note === 'bonus' : t.note !== 'bonus'))).reduce((a, t) => a + t.amount_cents, 0);
  const rows = isBiz
    ? [['Deposited to escrow', sum('escrow_fund') + sum('bonus_fund')], ['Service fee', sum('buyer_fee')], ['Refunded to you', -(sum('refund') + sum('fee_refund'))], ['Total cost', sum('escrow_fund') + sum('bonus_fund') + sum('buyer_fee') - sum('refund') - sum('fee_refund')]]
    : [['Fee released', sum('payout', 'fee') + sum('seller_fee', 'fee')], ['Bonus released', sum('payout', 'bonus') + sum('seller_fee', 'bonus')], ['Collabo fee (10%)', -sum('seller_fee')], ['Paid out to you', sum('payout')]];
  return (
    <section className="card">
      <h2>8. {isBiz ? 'Statement' : 'Payout statement'}</h2>
      <table className="table quote"><tbody>
        {rows.map(([label, v], i) => <tr key={label} className={i === rows.length - 1 ? 'total grand' : ''}><td>{label}</td><td className="num">{v < 0 ? '−' : ''}{money(Math.abs(v), { exact: true })}</td></tr>)}
      </tbody></table>
      {d.bonus_cents > 0 && <p className="small">Performance bonus: <span className={`pill pill-${{ paid: 'green', refunded: 'gray', held: 'violet' }[d.bonus_status] ?? 'gray'}`}>{d.bonus_status}</span>{d.bonus_status === 'held' && ` · waiting on ${bonusTarget(d)} ${METRIC_LABEL[d.bonus_metric]}`}</p>}
      {isBiz && <button className="btn secondary self-start" onClick={() => navigate(`/creators/${d.creator_id}?rebook=${d.id}`)}>Rebook @{d.creator.handle} with the same deliverables</button>}
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
